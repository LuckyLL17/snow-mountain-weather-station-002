import type { Sensor, StationEvent } from './station';

export type SnapshotSensor = Pick<Sensor, 'id' | 'code' | 'name' | 'value' | 'unit' | 'trend' | 'status'>;
export type SnapshotEvent = Pick<StationEvent, 'id' | 'time' | 'title' | 'desc' | 'kind'>;

export type ReportSnapshot = {
  capturedAt: string;
  sensors: SnapshotSensor[];
  events: SnapshotEvent[];
  terrain: { label: string; value: string }[];
  summary: { normal: number; attention: number; linkDelay: string };
};

export type ReportStatus = 'draft' | 'submitted';

export type HandoverReport = {
  id: string;
  title: string;
  shift: string;
  author: string;
  notes: string;
  focusSensorIds: string[];
  eventIds: string[];
  status: ReportStatus;
  snapshot: ReportSnapshot;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type ReportPayload = {
  title: string;
  shift: string;
  author: string;
  notes: string;
  focusSensorIds: string[];
  eventIds: string[];
  status: ReportStatus;
  snapshot?: ReportSnapshot;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export const fetchReports = () => request<HandoverReport[]>('/api/reports');
export const createReport = (payload: ReportPayload) => request<HandoverReport>('/api/reports', jsonInit('POST', payload));
export const updateReport = (id: string, payload: ReportPayload) => request<HandoverReport>(`/api/reports/${id}`, jsonInit('PUT', payload));
