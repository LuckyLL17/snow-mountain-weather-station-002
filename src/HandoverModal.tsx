import { useEffect, useState, type ReactNode } from 'react';
import {
  type HandoverReport,
  type ReportDraft,
  type StationSnapshot,
  listReports,
  createReport,
  updateReport,
} from './api';
import { STATION, captureSnapshot } from './station';

type View = { mode: 'list' } | { mode: 'edit'; report: HandoverReport | null; snapshot: StationSnapshot } | { mode: 'detail'; report: HandoverReport };

const SHIFTS = ['白班 08:00–20:00', '夜班 20:00–08:00'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyDraft(): ReportDraft {
  return { shift: SHIFTS[0], outgoingOfficer: STATION.officer, incomingOfficer: '', notes: '', keySensorIds: [], keyAlertKeys: [] };
}

function draftFromReport(report: HandoverReport): ReportDraft {
  return {
    shift: report.shift || SHIFTS[0],
    outgoingOfficer: report.outgoingOfficer,
    incomingOfficer: report.incomingOfficer,
    notes: report.notes,
    keySensorIds: [...report.keySensorIds],
    keyAlertKeys: [...report.keyAlertKeys],
  };
}

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key];
}

export function HandoverModal({ onClose, onSaved }: { onClose: () => void; onSaved?: (report: HandoverReport) => void }) {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [reports, setReports] = useState<HandoverReport[] | null>(null);
  const [listError, setListError] = useState('');
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function refreshList() {
    try {
      setReports(await listReports());
      setListError('');
    } catch (err) {
      setListError(err instanceof Error ? err.message : '无法加载报告列表');
    }
  }

  useEffect(() => { void refreshList(); }, []);

  function startNew() {
    // 进入编辑页的瞬间捕获当前站点数据，之后整份草稿都绑定该快照
    const snapshot = captureSnapshot();
    const initial = emptyDraft();
    // 默认勾上仍未处理的风险（告警类动态）
    initial.keyAlertKeys = snapshot.alerts.filter(a => a.kind === 'warning').map(a => a.key);
    setDraft(initial);
    setFormError('');
    setView({ mode: 'edit', report: null, snapshot });
  }

  function openReport(report: HandoverReport) {
    setDraft(draftFromReport(report));
    setFormError('');
    setView({ mode: 'detail', report });
  }

  function editReport(report: HandoverReport) {
    setDraft(draftFromReport(report));
    setFormError('');
    setView({ mode: 'edit', report, snapshot: report.snapshot });
  }

  async function save(submit: boolean) {
    if (submit) {
      if (!draft.shift.trim()) return setFormError('请选择交班班次');
      if (!draft.outgoingOfficer.trim()) return setFormError('请填写交班值守员');
      if (!draft.incomingOfficer.trim()) return setFormError('请填写接班值守员');
    }
    setSaving(true);
    setFormError('');
    try {
      const current = view.mode === 'edit' ? view : null;
      if (!current) return;
      const saved = current.report
        ? await updateReport(current.report.id, draft, submit)
        : await createReport(current.snapshot, STATION.officer, draft, submit);
      await refreshList();
      onSaved?.(saved);
      setView({ mode: 'detail', report: saved });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  function backToList() {
    setFormError('');
    setView({ mode: 'list' });
  }

  let title = '值守交班报告';
  if (view.mode === 'edit') title = view.report ? '继续编辑交班报告' : '新建交班报告';
  if (view.mode === 'detail') title = '交班报告详情';

  return (
    <div className="hr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hr-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="hr-header">
          <div>
            <span className="eyebrow">SHIFT HANDOVER / {STATION.code}</span>
            <h3>{title}</h3>
          </div>
          <button className="hr-close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="hr-body">
          {view.mode === 'list' && (
            <ListView reports={reports} error={listError} onNew={startNew} onOpen={openReport} onRetry={refreshList} />
          )}
          {view.mode === 'edit' && (
            <EditView
              snapshot={view.snapshot}
              draft={draft}
              setDraft={setDraft}
              isNew={!view.report}
            />
          )}
          {view.mode === 'detail' && <DetailView report={view.report} />}
          {formError && <div className="hr-form-error">{formError}</div>}
        </div>

        <footer className="hr-footer">
          {view.mode === 'list' && (
            <>
              <span className="hr-footer-hint">{reports ? `共 ${reports.length} 份报告` : '正在加载…'}</span>
              <button className="hr-btn" onClick={onClose}>关闭</button>
              <button className="hr-btn primary" onClick={startNew}>＋ 新建交班报告</button>
            </>
          )}
          {view.mode === 'edit' && (
            <>
              <button className="hr-btn ghost" onClick={backToList}>取消</button>
              <button className="hr-btn" disabled={saving} onClick={() => void save(false)}>{saving ? '保存中…' : '保存草稿'}</button>
              <button className="hr-btn primary" disabled={saving} onClick={() => void save(true)}>{saving ? '提交中…' : '提交交班报告'}</button>
            </>
          )}
          {view.mode === 'detail' && (
            <>
              <span className="hr-footer-hint">报告数据为创建时快照，不随后续站点数据变化</span>
              <button className="hr-btn" onClick={backToList}>返回列表</button>
              {view.report.status === 'draft' && (
                <button className="hr-btn primary" onClick={() => editReport(view.report)}>继续编辑并提交</button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ---------------- 列表视图 ---------------- */

function StatusBadge({ status }: { status: HandoverReport['status'] }) {
  return status === 'draft'
    ? <span className="hr-badge draft"><i />草稿</span>
    : <span className="hr-badge submitted"><i />已提交</span>;
}

function ListView({ reports, error, onNew, onOpen, onRetry }: {
  reports: HandoverReport[] | null;
  error: string;
  onNew: () => void;
  onOpen: (report: HandoverReport) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="hr-state">
        <b>报告加载失败</b>
        <p>{error}</p>
        <button className="hr-btn" onClick={onRetry}>重新加载</button>
      </div>
    );
  }
  if (!reports) return <div className="hr-state"><p>正在加载历史报告…</p></div>;
  if (reports.length === 0) {
    return (
      <div className="hr-state">
        <div className="hr-state-icon">▤</div>
        <b>还没有交班报告</b>
        <p>交班时从当前站点读数生成一份报告，保存草稿或直接提交给下一班。</p>
        <button className="hr-btn primary" onClick={onNew}>＋ 新建交班报告</button>
      </div>
    );
  }
  return (
    <ul className="hr-list">
      {reports.map(report => (
        <li key={report.id}>
          <button className="hr-list-item" onClick={() => onOpen(report)}>
            <div className="hr-list-main">
              <div className="hr-list-line">
                <b>{report.shift || '未设置班次'}</b>
                <StatusBadge status={report.status} />
              </div>
              <p>
                {report.outgoingOfficer || '未填交班人'} → {report.incomingOfficer || '待接接班人'}
                {' · '}快照于 {formatDateTime(report.snapshot.capturedAt)}
              </p>
              <p className="hr-list-sub">
                重点传感器 {report.keySensorIds.length} 项 · 重点动态 {report.keyAlertKeys.length} 条
                {report.status === 'submitted' && report.submittedAt ? ` · 提交于 ${formatDateTime(report.submittedAt)}` : ` · 更新于 ${formatDateTime(report.updatedAt)}`}
              </p>
            </div>
            <span className="hr-list-arrow">打开 →</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- 编辑视图 ---------------- */

function SnapshotBanner({ snapshot, isNew }: { snapshot: StationSnapshot; isNew: boolean }) {
  return (
    <div className="hr-snapshot-banner">
      <span className="hr-snapshot-dot" />
      <div>
        <b>数据快照 · {formatDateTime(snapshot.capturedAt)}</b>
        <p>{isNew ? '已从当前站点数据生成快照，报告保存后读数将固定为这一刻，不再随后续数据变化。' : '本草稿绑定创建时的数据快照，无法更改。'}</p>
      </div>
      <div className="hr-snapshot-counts">
        <span><strong className="cyan">{snapshot.counts.normal}</strong> 正常</span>
        <span><strong className="amber">{snapshot.counts.attention}</strong> 关注</span>
        <span><strong>{snapshot.counts.offline}</strong> 离线</span>
      </div>
    </div>
  );
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="hr-field-label">
      <span>{children}</span>
      {hint && <em>{hint}</em>}
    </label>
  );
}

function EditView({ snapshot, draft, setDraft, isNew }: {
  snapshot: StationSnapshot;
  draft: ReportDraft;
  setDraft: (draft: ReportDraft) => void;
  isNew: boolean;
}) {
  const patch = (part: Partial<ReportDraft>) => setDraft({ ...draft, ...part });
  return (
    <div className="hr-edit">
      <SnapshotBanner snapshot={snapshot} isNew={isNew} />

      <div className="hr-form-grid">
        <div>
          <FieldLabel>交班班次</FieldLabel>
          <div className="hr-segmented">
            {SHIFTS.map(shift => (
              <button
                key={shift}
                type="button"
                className={draft.shift === shift ? 'active' : ''}
                onClick={() => patch({ shift })}
              >{shift}</button>
            ))}
          </div>
        </div>
        <div className="hr-officer-grid">
          <div>
            <FieldLabel>交班值守员</FieldLabel>
            <input value={draft.outgoingOfficer} onChange={e => patch({ outgoingOfficer: e.target.value })} placeholder="本班值守员姓名" />
          </div>
          <div>
            <FieldLabel>接班值守员</FieldLabel>
            <input value={draft.incomingOfficer} onChange={e => patch({ incomingOfficer: e.target.value })} placeholder="下一班值守员姓名" />
          </div>
        </div>
      </div>

      <div className="hr-block">
        <FieldLabel hint="多选 · 交给下一班重点盯防">重点传感器</FieldLabel>
        <div className="hr-chip-grid">
          {snapshot.sensors.map(sensor => {
            const active = draft.keySensorIds.includes(sensor.id);
            return (
              <button
                type="button"
                key={sensor.id}
                className={active ? 'hr-chip active' : 'hr-chip'}
                onClick={() => patch({ keySensorIds: toggle(draft.keySensorIds, sensor.id) })}
              >
                <span className="hr-chip-check">{active ? '✓' : '+'}</span>
                <span className="hr-chip-code">{sensor.code}</span>
                <b>{sensor.name}</b>
                <span className="hr-chip-reading">{sensor.value} {sensor.unit} · {sensor.status}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hr-block">
        <FieldLabel hint="勾选本时段需要交接的观测动态与未处理风险">重点观测 / 未处理风险</FieldLabel>
        <div className="hr-pick-list">
          {snapshot.alerts.length === 0 && <p className="hr-empty-note">快照内暂无观测动态。</p>}
          {snapshot.alerts.map(alert => {
            const active = draft.keyAlertKeys.includes(alert.key);
            return (
              <button
                type="button"
                key={alert.key}
                className={active ? 'hr-pick active' : 'hr-pick'}
                onClick={() => patch({ keyAlertKeys: toggle(draft.keyAlertKeys, alert.key) })}
              >
                <span className={`hr-pick-box ${alert.kind}`}>{active ? '✓' : ''}</span>
                <span className={`alert-mark ${alert.kind}`}>{alert.kind === 'warning' ? '!' : '✓'}</span>
                <span className="hr-pick-body">
                  <span className="hr-pick-line"><b>{alert.title}</b><time>{alert.time}</time></span>
                  <span className="hr-pick-desc">{alert.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hr-block">
        <FieldLabel hint="将随报告一并交给下一班">交班备注</FieldLabel>
        <textarea
          className="hr-notes"
          rows={4}
          value={draft.notes}
          onChange={e => patch({ notes: e.target.value })}
          placeholder="例如：风速持续接近阈值，无人机巡检已延后；电池组夜间注意保温……"
        />
      </div>
    </div>
  );
}

/* ---------------- 详情视图 ---------------- */

function DetailView({ report }: { report: HandoverReport }) {
  const { snapshot } = report;
  const keySensors = snapshot.sensors.filter(s => report.keySensorIds.includes(s.id));
  const otherSensors = snapshot.sensors.filter(s => !report.keySensorIds.includes(s.id));
  const keyAlerts = snapshot.alerts.filter(a => report.keyAlertKeys.includes(a.key));
  return (
    <div className="hr-detail">
      <div className="hr-detail-head">
        <div>
          <div className="hr-detail-title-line">
            <h4>{report.shift || '未设置班次'}</h4>
            <StatusBadge status={report.status} />
          </div>
          <p>{report.outgoingOfficer || '未填交班人'} → {report.incomingOfficer || '待接接班人'}</p>
        </div>
        <div className="hr-detail-meta">
          <span>创建于 {formatDateTime(report.createdAt)}</span>
          {report.submittedAt
            ? <span>提交于 {formatDateTime(report.submittedAt)}</span>
            : <span>最后保存 {formatDateTime(report.updatedAt)}</span>}
        </div>
      </div>

      <div className="hr-snapshot-card">
        <div className="hr-snapshot-card-head">
          <div>
            <span className="eyebrow">SNAPSHOT</span>
            <b>{snapshot.stationName} · {snapshot.stationCode}</b>
          </div>
          <span>{snapshot.elevation} · {snapshot.location} · 快照 {formatDateTime(snapshot.capturedAt)}</span>
        </div>

        {keySensors.length > 0 && (
          <div className="hr-block">
            <FieldLabel hint="交班时标记为重点">重点传感器（{keySensors.length}）</FieldLabel>
            <div className="hr-key-grid">
              {keySensors.map(s => (
                <div key={s.id} className={`hr-key-card status-${s.status === '注意' ? 'warn' : s.status === '离线' ? 'off' : 'ok'}`}>
                  <span className="hr-chip-code">{s.code}</span>
                  <b>{s.name}</b>
                  <strong>{s.value} <em>{s.unit}</em></strong>
                  <span>{s.trend} · {s.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="hr-block">
          <FieldLabel>快照时刻全部读数</FieldLabel>
          <div className="hr-reading-table">
            {[...keySensors, ...otherSensors].map(s => (
              <div key={s.id} className="hr-reading-row">
                <span className="hr-chip-code">{s.code}</span>
                <span>{s.name}</span>
                <strong>{s.value} {s.unit}</strong>
                <em className={s.trend.startsWith('↓') ? 'down' : ''}>{s.trend}</em>
                <span className={`sensor-status ${s.status === '注意' ? 'warn' : ''}`}><i />{s.status}</span>
              </div>
            ))}
          </div>
          <div className="hr-terrain-inline">
            {snapshot.terrain.map(t => <span key={t.label}>{t.label} <b>{t.value}</b></span>)}
            <span>链路延迟 <b>{snapshot.linkLatency}</b></span>
          </div>
        </div>

        <div className="hr-block">
          <FieldLabel hint="交班时勾选的动态与风险">重点观测 / 未处理风险（{keyAlerts.length}）</FieldLabel>
          {keyAlerts.length === 0
            ? <p className="hr-empty-note">本班未标记需要交接的观测动态。</p>
            : <div className="alerts hr-detail-alerts">
                {keyAlerts.map(alert => (
                  <div className="alert" key={alert.key}>
                    <span className={`alert-mark ${alert.kind}`}>{alert.kind === 'warning' ? '!' : '✓'}</span>
                    <div>
                      <div className="alert-line"><b>{alert.title}</b><time>{alert.time}</time></div>
                      <p>{alert.desc}</p>
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      </div>

      <div className="hr-block">
        <FieldLabel>交班备注</FieldLabel>
        <div className="hr-notes-view">{report.notes ? report.notes : '（未填写备注）'}</div>
      </div>
    </div>
  );
}
