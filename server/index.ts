import express from 'express';
import cors from 'cors';
import {
  type HandoverReport,
  type ReportFields,
  type StationSnapshot,
  loadReports,
  saveReports,
  newId,
} from './store.ts';

const app = express();
const port = Number(process.env.PORT || 4002);
app.use(cors()); app.use(express.json());
const readings = [{ sensor: 'TMP-01', value: -8.4, unit: '°C' }, { sensor: 'WND-02', value: 18.6, unit: 'm/s' }, { sensor: 'SNW-03', value: 142, unit: 'cm' }, { sensor: 'PWR-04', value: 76, unit: '%' }];
app.get('/api/health', (_req, res) => res.json({ status: 'ok', project: 'snow-mountain-weather-station', workflow: '采集传感器数据 → 校验质量 → 触发告警 → 同步观测记录' }));
app.get('/api/readings', (_req, res) => res.json(readings));
app.post('/api/sync', (_req, res) => res.json({ status: 'accepted', syncedAt: new Date().toISOString() }));

// ---------- 值守交班报告 ----------

const EDITABLE_FIELDS: (keyof ReportFields)[] = [
  'shift', 'outgoingOfficer', 'incomingOfficer', 'notes', 'keySensorIds', 'keyAlertKeys',
];

function readFields(body: Record<string, unknown>): Partial<ReportFields> {
  const fields: Partial<ReportFields> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) (fields as Record<string, unknown>)[key] = body[key];
  }
  return fields;
}

function assertSnapshot(value: unknown): asserts value is StationSnapshot {
  if (!value || typeof value !== 'object' || !Array.isArray((value as StationSnapshot).sensors)) {
    const err = new Error('缺少有效的站点数据快照') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
}

function badRequest(message: string): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = 400;
  return err;
}

function applyFields(report: HandoverReport, fields: Partial<ReportFields>, submit: boolean): void {
  for (const key of ['shift', 'outgoingOfficer', 'incomingOfficer', 'notes'] as const) {
    if (key in fields && typeof fields[key] !== 'string') throw badRequest(`字段 ${key} 必须是字符串`);
  }
  for (const key of ['keySensorIds', 'keyAlertKeys'] as const) {
    if (key in fields) {
      const value = fields[key];
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw badRequest(`字段 ${key} 必须是字符串数组`);
      }
    }
  }
  Object.assign(report, fields);
  if (submit) {
    // 必填项只在正式提交交班记录时校验，草稿允许先保存再补充
    for (const [key, label] of [
      ['shift', '班次'],
      ['outgoingOfficer', '交班值守员'],
      ['incomingOfficer', '接班值守员'],
    ] as const) {
      if (!report[key] || !report[key].trim()) throw badRequest(`请填写${label}`);
    }
    report.status = 'submitted';
    report.submittedAt = new Date().toISOString();
  }
  report.updatedAt = new Date().toISOString();
}

function reportError(res: express.Response, err: unknown) {
  const status = err instanceof Error && 'status' in err ? (err as { status?: number }).status ?? 500 : 500;
  const message = err instanceof Error ? err.message : '服务器错误';
  res.status(status).json({ error: message });
}

// 报告列表（最新在前）
app.get('/api/handover-reports', (_req, res) => {
  const reports = loadReports().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json(reports);
});

// 单份报告（用于重新打开）
app.get('/api/handover-reports/:id', (req, res) => {
  const report = loadReports().find(item => item.id === req.params.id);
  if (!report) return res.status(404).json({ error: '报告不存在' });
  res.json(report);
});

// 新建报告（可随提交 ?submit=1，也可只存草稿）
app.post('/api/handover-reports', (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    assertSnapshot(body.snapshot);
    const now = new Date().toISOString();
    const report: HandoverReport = {
      id: newId(),
      status: 'draft',
      shift: '',
      outgoingOfficer: '',
      incomingOfficer: '',
      notes: '',
      keySensorIds: [],
      keyAlertKeys: [],
      snapshot: body.snapshot,
      createdBy: typeof body.createdBy === 'string' ? body.createdBy : '值守员',
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
    };
    const submit = req.query.submit === '1' || body.submit === true;
    applyFields(report, readFields(body), submit);
    const reports = loadReports();
    reports.push(report);
    saveReports(reports);
    res.status(201).json(report);
  } catch (err) {
    reportError(res, err);
  }
});

// 更新草稿（已提交记录不可改；可随提交 ?submit=1 转为已提交）
app.put('/api/handover-reports/:id', (req, res) => {
  try {
    const reports = loadReports();
    const report = reports.find(item => item.id === req.params.id);
    if (!report) return res.status(404).json({ error: '报告不存在' });
    if (report.status === 'submitted') return res.status(409).json({ error: '报告已提交，不可修改' });
    const submit = req.query.submit === '1';
    applyFields(report, readFields((req.body ?? {}) as Record<string, unknown>), submit);
    saveReports(reports);
    res.json(report);
  } catch (err) {
    reportError(res, err);
  }
});

app.listen(port, () => console.log(`Weather station API running at http://localhost:${port}`));
