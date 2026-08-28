import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTonightContext } from './nightfillStorage';

export const AUDIT_LOG_KEY = 'groceryNightAuditLog';

export type AuditCategory =
  | 'Security'
  | 'Roster'
  | 'Load'
  | 'Allocation'
  | 'Progress'
  | 'Summary'
  | 'Compliance'
  | 'Settings';

export type AuditEntry = {
  id: string;
  category: AuditCategory;
  action: string;
  details?: string;
  timestamp: string;
  nightDateKey: string;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function appendAuditLog({
  category,
  action,
  details,
}: {
  category: AuditCategory;
  action: string;
  details?: string;
}) {
  try {
    const stored = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    const current: AuditEntry[] = stored ? JSON.parse(stored) : [];
    const { dateKey } = getTonightContext();

    const next: AuditEntry[] = [
      {
        id: makeId(),
        category,
        action,
        details,
        timestamp: new Date().toISOString(),
        nightDateKey: dateKey,
      },
      ...current,
    ].slice(0, 500);

    await AsyncStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(next));
  } catch (error) {
    console.log('AUDIT LOG ERROR:', error);
  }
}

export async function readAuditLog() {
  try {
    const stored = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    const entries: AuditEntry[] = stored ? JSON.parse(stored) : [];
    return entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.log('READ AUDIT LOG ERROR:', error);
    return [] as AuditEntry[];
  }
}

export async function clearAuditLog() {
  await AsyncStorage.removeItem(AUDIT_LOG_KEY);
}
