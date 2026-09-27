export type ReportStatus = 'draft' | 'submitted';

export interface SensorSnapshot {
  id: string;
  name: string;
  code: string;
  value: string;
  unit: string;
  trend: string;
  status: string;
}

export interface AlertSnapshot {
  key: string;
  time: string;
  title: string;
  desc: string;
  kind: string;
}

export interface StationSnapshot {
  stationName: string;
  stationCode: string;
  elevation: string;
  location: string;
  capturedAt: string;
  syncLabel: string;
  linkLatency: string;
  counts: { normal: number; attention: number; offline: number };
  terrain: { label: string; value: string }[];
  sensors: SensorSnapshot[];
  alerts: AlertSnapshot[];
}

export interface HandoverReport {
  id: string;
  status: ReportStatus;
  shift: string;
  outgoingOfficer: string;
  incomingOfficer: string;
  notes: string;
  keySensorIds: string[];
  keyAlertKeys: string[];
  snapshot: StationSnapshot;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

export interface ReportDraft {
  shift: string;
  outgoingOfficer: string;
  incomingOfficer: string;
  notes: string;
  keySensorIds: string[];
  keyAlertKeys: string[];
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') message = data.error;
    } catch {
      /* 忽略解析失败 */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function listReports(): Promise<HandoverReport[]> {
  return request<HandoverReport[]>('/api/handover-reports');
}

export function getReport(id: string): Promise<HandoverReport> {
  return request<HandoverReport>(`/api/handover-reports/${id}`);
}

export function createReport(
  snapshot: StationSnapshot,
  createdBy: string,
  draft: ReportDraft,
  submit: boolean,
): Promise<HandoverReport> {
  return request<HandoverReport>('/api/handover-reports' + (submit ? '?submit=1' : ''), {
    method: 'POST',
    body: JSON.stringify({ snapshot, createdBy, ...draft }),
  });
}

export function updateReport(
  id: string,
  draft: ReportDraft,
  submit: boolean,
): Promise<HandoverReport> {
  return request<HandoverReport>(`/api/handover-reports/${id}` + (submit ? '?submit=1' : ''), {
    method: 'PUT',
    body: JSON.stringify(draft),
  });
}
