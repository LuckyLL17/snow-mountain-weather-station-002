import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** 报告中可由值守员编辑的字段 */
export interface ReportFields {
  shift: string;
  outgoingOfficer: string;
  incomingOfficer: string;
  notes: string;
  keySensorIds: string[];
  keyAlertKeys: string[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
const dataFile = join(dataDir, 'handover-reports.json');

export function loadReports(): HandoverReport[] {
  try {
    const raw = readFileSync(dataFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HandoverReport[]) : [];
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export function saveReports(reports: HandoverReport[]): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(dataFile, JSON.stringify(reports, null, 2), 'utf-8');
}

export function newId(): string {
  return `hr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
