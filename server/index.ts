import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 4002);
app.use(cors()); app.use(express.json());

const readings = [{ sensor: 'TMP-01', value: -8.4, unit: '°C' }, { sensor: 'WND-02', value: 18.6, unit: 'm/s' }, { sensor: 'SNW-03', value: 142, unit: 'cm' }, { sensor: 'PWR-04', value: 76, unit: '%' }];
app.get('/api/health', (_req, res) => res.json({ status: 'ok', project: 'snow-mountain-weather-station', workflow: '采集传感器数据 → 校验质量 → 触发告警 → 同步观测记录' }));
app.get('/api/readings', (_req, res) => res.json(readings));
app.post('/api/sync', (_req, res) => res.json({ status: 'accepted', syncedAt: new Date().toISOString() }));

// ---- 值守交班报告 ----
type ReportStatus = 'draft' | 'submitted';
type HandoverReport = {
  id: string; title: string; shift: string; author: string; notes: string;
  focusSensorIds: string[]; eventIds: string[]; status: ReportStatus;
  snapshot: unknown; createdAt: string; updatedAt: string; submittedAt: string | null;
};

const dataDir = path.dirname(fileURLToPath(import.meta.url));
const storeFile = path.join(dataDir, 'reports.json');

function seedReports(): HandoverReport[] {
  const createdAt = '2026-09-26T06:02:00+08:00';
  return [{
    id: 'RPT-001', title: 'M-07 交班报告 · 09-26 夜班', shift: '夜班', author: '林岚',
    notes: '夜间风速持续偏高，WND-02 已重新标定，白天请继续观察；雪深传感器自检通过。无人机巡检建议等风速回落后执行。',
    focusSensorIds: ['wind'], eventIds: ['ev-wind'], status: 'submitted',
    snapshot: {
      capturedAt: '2026-09-26T06:00:00+08:00',
      sensors: [
        { id: 'temp', code: 'TMP-01', name: '山脊温度', value: '-9.1', unit: '°C', trend: '↓ 0.8°', status: '正常' },
        { id: 'wind', code: 'WND-02', name: '风速 / 风向', value: '17.9', unit: 'm/s', trend: '↑ 2.6', status: '注意' },
        { id: 'snow', code: 'SNW-03', name: '积雪深度', value: '141', unit: 'cm', trend: '↑ 3 cm', status: '正常' },
        { id: 'power', code: 'PWR-04', name: '电池组电量', value: '78', unit: '%', trend: '↓ 1%', status: '正常' }
      ],
      events: [
        { id: 'ev-wind', time: '03:12', title: '风速超过巡检阈值', desc: '夜间峰值 19.4 m/s · 建议延后无人机巡检', kind: 'warning' },
        { id: 'ev-snow', time: '02:00', title: '雪深传感器完成自检', desc: 'SNW-03 数据质量 99.2%', kind: 'good' }
      ],
      terrain: [
        { label: '体感温度', value: '-15.0°C' }, { label: '能见度', value: '14.2 km' },
        { label: '气压', value: '581 hPa' }, { label: '降雪', value: '1.1 mm/h' }
      ],
      summary: { normal: 3, attention: 1, linkDelay: '2.6s' }
    },
    createdAt, updatedAt: createdAt, submittedAt: createdAt
  }];
}

function loadReports(): HandoverReport[] {
  try {
    const raw = fs.readFileSync(storeFile, 'utf8');
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list;
  } catch { /* 首次启动或文件损坏时回退到种子数据 */ }
  return seedReports();
}

let reports = loadReports();
let reportSeq = reports.length + 1;

function persist() {
  fs.writeFileSync(storeFile, JSON.stringify(reports, null, 2));
}

const byCreatedDesc = (a: HandoverReport, b: HandoverReport) => b.createdAt.localeCompare(a.createdAt);

app.get('/api/reports', (_req, res) => res.json([...reports].sort(byCreatedDesc)));

app.get('/api/reports/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: '报告不存在' });
  res.json(report);
});

app.post('/api/reports', (req, res) => {
  const body = req.body ?? {};
  if (!body.snapshot || !Array.isArray(body.snapshot.sensors)) {
    return res.status(400).json({ error: '缺少创建时刻的数据快照' });
  }
  const now = new Date().toISOString();
  const status: ReportStatus = body.status === 'submitted' ? 'submitted' : 'draft';
  const report: HandoverReport = {
    id: `RPT-${String(reportSeq++).padStart(3, '0')}`,
    title: String(body.title || '交班报告'),
    shift: String(body.shift || '早班'),
    author: String(body.author || '值守员'),
    notes: String(body.notes || ''),
    focusSensorIds: Array.isArray(body.focusSensorIds) ? body.focusSensorIds.map(String) : [],
    eventIds: Array.isArray(body.eventIds) ? body.eventIds.map(String) : [],
    status,
    snapshot: body.snapshot,
    createdAt: now,
    updatedAt: now,
    submittedAt: status === 'submitted' ? now : null
  };
  reports.push(report);
  persist();
  res.status(201).json(report);
});

app.put('/api/reports/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: '报告不存在' });
  if (report.status === 'submitted') return res.status(409).json({ error: '已提交的记录不可修改' });
  const body = req.body ?? {};
  // 注意：snapshot 只在创建时写入，更新时忽略，保证报告保留创建时刻的数据快照
  if (body.title !== undefined) report.title = String(body.title);
  if (body.shift !== undefined) report.shift = String(body.shift);
  if (body.author !== undefined) report.author = String(body.author);
  if (body.notes !== undefined) report.notes = String(body.notes);
  if (Array.isArray(body.focusSensorIds)) report.focusSensorIds = body.focusSensorIds.map(String);
  if (Array.isArray(body.eventIds)) report.eventIds = body.eventIds.map(String);
  report.updatedAt = new Date().toISOString();
  if (body.status === 'submitted') {
    report.status = 'submitted';
    report.submittedAt = report.updatedAt;
  }
  persist();
  res.json(report);
});

app.listen(port, () => console.log(`Weather station API running at http://localhost:${port}`));
