import { useEffect, useMemo, useState } from 'react';
import { currentShift, formatTime, shifts } from './station';
import type { Sensor, StationEvent } from './station';
import { createReport, fetchReports, updateReport } from './reports';
import type { HandoverReport, ReportPayload, ReportSnapshot, ReportStatus } from './reports';

type Props = {
  open: boolean;
  onClose: () => void;
  sensors: Sensor[];
  events: StationEvent[];
  terrain: { label: string; value: string }[];
  summary: { normal: number; attention: number; linkDelay: string };
  onNotify: (message: string) => void;
};

type EditorState = {
  id: string | null;
  title: string;
  shift: string;
  author: string;
  notes: string;
  focusSensorIds: string[];
  eventIds: string[];
  snapshot: ReportSnapshot;
  createdAt: string | null;
};

function buildSnapshot(props: Pick<Props, 'sensors' | 'events' | 'terrain' | 'summary'>): ReportSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    sensors: props.sensors.map(({ id, code, name, value, unit, trend, status }) => ({ id, code, name, value, unit, trend, status })),
    events: props.events.map(({ id, time, title, desc, kind }) => ({ id, time, title, desc, kind })),
    terrain: props.terrain.map(metric => ({ ...metric })),
    summary: { ...props.summary }
  };
}

function newEditorState(props: Pick<Props, 'sensors' | 'events' | 'terrain' | 'summary'>): EditorState {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const shift = currentShift(now);
  return {
    id: null,
    title: `M-07 交班报告 · ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${shift}`,
    shift,
    author: '陈',
    notes: '',
    focusSensorIds: props.sensors.filter(s => s.status !== '正常').map(s => s.id),
    eventIds: props.events.filter(e => e.kind === 'warning').map(e => e.id),
    snapshot: buildSnapshot(props),
    createdAt: null
  };
}

function fromReport(report: HandoverReport): EditorState {
  return {
    id: report.id,
    title: report.title,
    shift: report.shift,
    author: report.author,
    notes: report.notes,
    focusSensorIds: [...report.focusSensorIds],
    eventIds: [...report.eventIds],
    snapshot: report.snapshot,
    createdAt: report.createdAt
  };
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(item => item !== id) : [...list, id];
}

function SnapshotStrip({ snapshot }: { snapshot: ReportSnapshot }) {
  return (
    <div className="snapshot-strip">
      <div className="snapshot-head">
        <span className="eyebrow">DATA SNAPSHOT</span>
        <span className="snapshot-time">快照生成于 {formatTime(snapshot.capturedAt)} · 不随实时读数更新</span>
      </div>
      <div className="snapshot-grid">
        {snapshot.sensors.map(sensor => (
          <div key={sensor.id} className="snapshot-cell">
            <span>{sensor.name}</span>
            <b>{sensor.value}<i>{sensor.unit}</i></b>
          </div>
        ))}
        {snapshot.terrain.map(metric => (
          <div key={metric.label} className="snapshot-cell dim">
            <span>{metric.label}</span>
            <b>{metric.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`report-badge ${status}`}>{status === 'draft' ? '草稿' : '已提交'}</span>;
}

export default function ReportCenter(props: Props) {
  const { open, onClose, onNotify } = props;
  const [reports, setReports] = useState<HandoverReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState<ReportStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError('');
    fetchReports()
      .then(list => {
        setReports(list);
        setSelectedId(prev => (prev && list.some(r => r.id === prev) ? prev : list[0]?.id ?? null));
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [open]);

  const selected = useMemo(() => reports.find(r => r.id === selectedId) ?? null, [reports, selectedId]);

  if (!open) return null;

  const startNew = () => {
    setEditor(newEditorState(props));
    setSelectedId(null);
  };

  const startEdit = (report: HandoverReport) => setEditor(fromReport(report));

  const closeEditor = () => {
    setEditor(null);
    if (!selectedId && reports.length > 0) setSelectedId(reports[0].id);
  };

  const save = async (status: ReportStatus) => {
    if (!editor || saving) return;
    const payload: ReportPayload = {
      title: editor.title,
      shift: editor.shift,
      author: editor.author,
      notes: editor.notes,
      focusSensorIds: editor.focusSensorIds,
      eventIds: editor.eventIds,
      status,
      ...(editor.id ? {} : { snapshot: editor.snapshot })
    };
    setSaving(status);
    try {
      const saved = editor.id ? await updateReport(editor.id, payload) : await createReport(payload);
      setReports(prev => [saved, ...prev.filter(r => r.id !== saved.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setSelectedId(saved.id);
      setEditor(null);
      onNotify(status === 'draft' ? `草稿 ${saved.id} 已保存` : `交班记录 ${saved.id} 已提交，数据快照已归档`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '保存失败，请稍后重试');
    } finally {
      setSaving(null);
    }
  };

  const viewReport = editor && editor.id ? reports.find(r => r.id === editor.id) ?? null : selected;

  return (
    <div className="report-overlay" onClick={onClose}>
      <div className="report-panel" onClick={e => e.stopPropagation()}>
        <header className="report-head">
          <div>
            <span className="eyebrow">SHIFT HANDOVER</span>
            <h3>值守交班报告</h3>
          </div>
          <button className="report-close" onClick={onClose}>×</button>
        </header>
        <div className="report-body">
          <aside className="report-list">
            <button className="report-new" onClick={startNew}>＋ 新建交班报告</button>
            {loading && <p className="report-hint">正在加载历史报告…</p>}
            {loadError && <p className="report-hint error">加载失败：{loadError}</p>}
            {!loading && !loadError && reports.length === 0 && <p className="report-hint">暂无交班报告，点击上方按钮生成第一份。</p>}
            {reports.map(report => (
              <button
                key={report.id}
                className={`report-item${!editor && selectedId === report.id ? ' active' : ''}`}
                onClick={() => { setEditor(null); setSelectedId(report.id); }}
              >
                <div className="report-item-top">
                  <b>{report.title}</b>
                  <StatusBadge status={report.status} />
                </div>
                <div className="report-item-meta">
                  <span>{report.author} · {formatTime(report.createdAt)}</span>
                  <span>重点 {report.focusSensorIds.length} · 动态 {report.eventIds.length}</span>
                </div>
              </button>
            ))}
          </aside>
          <section className="report-main">
            {editor ? (
              <div className="report-editor">
                <div className="report-row">
                  <label className="report-field grow">
                    <span>报告标题</span>
                    <input value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} />
                  </label>
                  <label className="report-field">
                    <span>班次</span>
                    <select value={editor.shift} onChange={e => setEditor({ ...editor, shift: e.target.value })}>
                      {shifts.map(shift => <option key={shift} value={shift}>{shift}</option>)}
                    </select>
                  </label>
                  <label className="report-field">
                    <span>交班人</span>
                    <input value={editor.author} onChange={e => setEditor({ ...editor, author: e.target.value })} />
                  </label>
                </div>
                <SnapshotStrip snapshot={editor.snapshot} />
                <div className="report-block">
                  <span className="eyebrow">KEY SENSORS</span>
                  <h4>重点传感器 <em>交给下一班持续关注</em></h4>
                  <div className="pick-chips">
                    {editor.snapshot.sensors.map(sensor => (
                      <button
                        key={sensor.id}
                        className={`pick-chip${editor.focusSensorIds.includes(sensor.id) ? ' on' : ''}`}
                        onClick={() => setEditor({ ...editor, focusSensorIds: toggle(editor.focusSensorIds, sensor.id) })}
                      >
                        <b>{sensor.name}</b>
                        <span>{sensor.code} · {sensor.value}{sensor.unit}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="report-block">
                  <span className="eyebrow">OBSERVATION EVENTS</span>
                  <h4>观测动态 <em>勾选需要交接的事项</em></h4>
                  <div className="pick-events">
                    {editor.snapshot.events.map(event => (
                      <button
                        key={event.id}
                        className={`pick-event${editor.eventIds.includes(event.id) ? ' on' : ''}`}
                        onClick={() => setEditor({ ...editor, eventIds: toggle(editor.eventIds, event.id) })}
                      >
                        <span className={`alert-mark ${event.kind}`}>{event.kind === 'warning' ? '!' : '✓'}</span>
                        <span className="pick-event-text"><b>{event.title}</b><i>{event.time} · {event.desc}</i></span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="report-block">
                  <span className="eyebrow">HANDOVER NOTES</span>
                  <h4>交接备注</h4>
                  <textarea
                    value={editor.notes}
                    placeholder="记录未处理风险、设备异常与下一班需跟进事项…"
                    onChange={e => setEditor({ ...editor, notes: e.target.value })}
                  />
                </div>
                <div className="report-actions">
                  <button className="ghost" onClick={closeEditor}>取消</button>
                  <button className="ghost" disabled={saving !== null} onClick={() => save('draft')}>{saving === 'draft' ? '保存中…' : '保存草稿'}</button>
                  <button className="primary" disabled={saving !== null} onClick={() => save('submitted')}>{saving === 'submitted' ? '提交中…' : '提交记录'}</button>
                </div>
              </div>
            ) : viewReport ? (
              <div className="report-view">
                <div className="report-view-head">
                  <div>
                    <div className="report-view-title">
                      <h4>{viewReport.title}</h4>
                      <StatusBadge status={viewReport.status} />
                    </div>
                    <p>{viewReport.author} · {viewReport.shift} · 创建于 {formatTime(viewReport.createdAt)}{viewReport.submittedAt ? ` · 提交于 ${formatTime(viewReport.submittedAt)}` : ''}</p>
                  </div>
                  {viewReport.status === 'draft' && <button className="primary" onClick={() => startEdit(viewReport)}>继续编辑</button>}
                </div>
                <SnapshotStrip snapshot={viewReport.snapshot} />
                <div className="report-block">
                  <span className="eyebrow">KEY SENSORS</span>
                  <h4>重点传感器</h4>
                  <div className="view-tags">
                    {viewReport.snapshot.sensors.filter(s => viewReport.focusSensorIds.includes(s.id)).map(s => (
                      <span key={s.id} className="view-tag">{s.name}<i>{s.value}{s.unit}</i></span>
                    ))}
                    {viewReport.focusSensorIds.length === 0 && <span className="report-hint">未指定重点传感器</span>}
                  </div>
                </div>
                <div className="report-block">
                  <span className="eyebrow">OBSERVATION EVENTS</span>
                  <h4>观测动态</h4>
                  <div className="view-events">
                    {viewReport.snapshot.events.filter(e => viewReport.eventIds.includes(e.id)).map(event => (
                      <div key={event.id} className="view-event">
                        <span className={`alert-mark ${event.kind}`}>{event.kind === 'warning' ? '!' : '✓'}</span>
                        <div><b>{event.title}</b><p>{event.time} · {event.desc}</p></div>
                      </div>
                    ))}
                    {viewReport.eventIds.length === 0 && <span className="report-hint">未勾选观测动态</span>}
                  </div>
                </div>
                <div className="report-block">
                  <span className="eyebrow">HANDOVER NOTES</span>
                  <h4>交接备注</h4>
                  <p className="view-notes">{viewReport.notes || '（无备注）'}</p>
                </div>
              </div>
            ) : (
              <div className="report-empty">
                <span>✦</span>
                <p>选择左侧历史报告重新打开，或新建一份交班报告。<br/>报告会保留创建时刻的站点数据快照。</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
