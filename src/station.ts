export type Sensor = { id: string; name: string; code: string; value: string; unit: string; trend: string; status: '正常' | '注意' | '离线'; color: string; points: number[] };
export type StationEvent = { id: string; time: string; title: string; desc: string; kind: 'warning' | 'good' };

export const sensors: Sensor[] = [
  { id: 'temp', name: '山脊温度', code: 'TMP-01', value: '-8.4', unit: '°C', trend: '↓ 1.2°', status: '正常', color: '#78d7ef', points: [20, 24, 21, 31, 28, 34, 42, 38, 47, 50] },
  { id: 'wind', name: '风速 / 风向', code: 'WND-02', value: '18.6', unit: 'm/s', trend: '↑ 3.8', status: '注意', color: '#f2bc71', points: [31, 28, 38, 40, 34, 47, 45, 56, 54, 62] },
  { id: 'snow', name: '积雪深度', code: 'SNW-03', value: '142', unit: 'cm', trend: '↑ 4 cm', status: '正常', color: '#bba4ff', points: [58, 53, 52, 50, 45, 42, 38, 35, 30, 28] },
  { id: 'power', name: '电池组电量', code: 'PWR-04', value: '76', unit: '%', trend: '↓ 2%', status: '正常', color: '#94df9a', points: [72, 70, 76, 72, 70, 76, 80, 79, 78, 76] }
];

export const stationEvents: StationEvent[] = [
  { id: 'ev-wind', time: '09:42', title: '风速超过巡检阈值', desc: '当前 18.6 m/s · 建议延后无人机巡检', kind: 'warning' },
  { id: 'ev-snow', time: '08:15', title: '雪深传感器完成自检', desc: 'SNW-03 数据质量 99.2%', kind: 'good' },
  { id: 'ev-link', time: '06:30', title: '卫星链路已同步', desc: '上行延迟 2.4 秒 · 下一次同步 12:30', kind: 'good' }
];

export const terrainMetrics = [
  { label: '体感温度', value: '-14.2°C' },
  { label: '能见度', value: '16.8 km' },
  { label: '气压', value: '582 hPa' },
  { label: '降雪', value: '0.8 mm/h' }
];

export const shifts = ['早班', '中班', '夜班'];

export function currentShift(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 6 && hour < 14) return '早班';
  if (hour >= 14 && hour < 22) return '中班';
  return '夜班';
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
