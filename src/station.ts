export type SensorStatus = '正常' | '注意' | '离线';

export interface Sensor {
  id: string;
  name: string;
  code: string;
  value: string;
  unit: string;
  trend: string;
  status: SensorStatus;
  color: string;
  points: number[];
}

export interface AlertItem {
  /** 动态没有天然 id，用稳定字段生成 key，便于报告快照引用 */
  key: string;
  time: string;
  title: string;
  desc: string;
  kind: 'warning' | 'good';
}

export const STATION = {
  name: '高海拔自动气象观测站',
  code: 'M-07',
  elevation: '海拔 4,820 m',
  location: '北麓冰川保护区',
  officer: '陈',
  linkLatency: '2.4s',
  syncLabel: '数据已同步 · 2026.09.25 10:04',
};

export const sensors: Sensor[] = [
  { id: 'temp', name: '山脊温度', code: 'TMP-01', value: '-8.4', unit: '°C', trend: '↓ 1.2°', status: '正常', color: '#78d7ef', points: [20, 24, 21, 31, 28, 34, 42, 38, 47, 50] },
  { id: 'wind', name: '风速 / 风向', code: 'WND-02', value: '18.6', unit: 'm/s', trend: '↑ 3.8', status: '注意', color: '#f2bc71', points: [31, 28, 38, 40, 34, 47, 45, 56, 54, 62] },
  { id: 'snow', name: '积雪深度', code: 'SNW-03', value: '142', unit: 'cm', trend: '↑ 4 cm', status: '正常', color: '#bba4ff', points: [58, 53, 52, 50, 45, 42, 38, 35, 30, 28] },
  { id: 'power', name: '电池组电量', code: 'PWR-04', value: '76', unit: '%', trend: '↓ 2%', status: '正常', color: '#94df9a', points: [72, 70, 76, 72, 70, 76, 80, 79, 78, 76] },
];

export const alerts: AlertItem[] = [
  { key: '09:42-风速超过巡检阈值', time: '09:42', title: '风速超过巡检阈值', desc: '当前 18.6 m/s · 建议延后无人机巡检', kind: 'warning' },
  { key: '08:15-雪深传感器完成自检', time: '08:15', title: '雪深传感器完成自检', desc: 'SNW-03 数据质量 99.2%', kind: 'good' },
  { key: '06:30-卫星链路已同步', time: '06:30', title: '卫星链路已同步', desc: '上行延迟 2.4 秒 · 下一次同步 12:30', kind: 'good' },
];

export const terrainReadings = [
  { label: '体感温度', value: '-14.2°C' },
  { label: '能见度', value: '16.8 km' },
  { label: '气压', value: '582 hPa' },
  { label: '降雪', value: '0.8 mm/h' },
];

import type { StationSnapshot } from './api';

/** 捕获当前站点数据：该快照会随报告保存，之后站点数据变化也不影响报告 */
export function captureSnapshot(): StationSnapshot {
  return {
    stationName: STATION.name,
    stationCode: STATION.code,
    elevation: STATION.elevation,
    location: STATION.location,
    capturedAt: new Date().toISOString(),
    syncLabel: STATION.syncLabel,
    linkLatency: STATION.linkLatency,
    counts: {
      normal: sensors.filter(s => s.status === '正常').length,
      attention: sensors.filter(s => s.status === '注意').length,
      offline: sensors.filter(s => s.status === '离线').length,
    },
    terrain: terrainReadings.map(t => ({ label: t.label, value: t.value })),
    sensors: sensors.map(s => ({
      id: s.id, name: s.name, code: s.code, value: s.value,
      unit: s.unit, trend: s.trend, status: s.status,
    })),
    alerts: alerts.map(a => ({ key: a.key, time: a.time, title: a.title, desc: a.desc, kind: a.kind })),
  };
}
