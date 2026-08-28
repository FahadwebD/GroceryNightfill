import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  calculateShiftMinutes,
  getDateKey,
  getNightfillDate,
  type PlanningRosterEntry,
} from './nightfillPlanning';
import {
  calculateBreakSummary,
  getBreakRules,
} from './breakRules';
import { appendAuditLog } from './auditLog';

export const NIGHTFILL_STORAGE = {
  roster: 'groceryNightRoster',
  loads: 'groceryNightLoads',
  allocations: 'groceryNightAllocations',
  progress: 'groceryNightProgress',
  arrivals: 'groceryLoadArrivals',
  reports: 'groceryNightReports',
  helpActions: 'groceryNightHelpActions',
} as const;

export type NightfillStorageKey =
  (typeof NIGHTFILL_STORAGE)[keyof typeof NIGHTFILL_STORAGE];

export function getTonightContext(
  sourceDate: Date = new Date()
) {
  const date = getNightfillDate(sourceDate);

  return {
    date,
    dateKey: getDateKey(date),
    dayName: date.toLocaleDateString('en-AU', {
      weekday: 'long',
    }),
  };
}

export function isNightDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function readStorage<T>(
  key: string,
  fallback: T
): Promise<T> {
  try {
    const stored = await AsyncStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.log(`READ STORAGE ERROR: ${key}`, error);
    return fallback;
  }
}

export async function writeStorage<T>(
  key: string,
  value: T
) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function applyBreakRulesToRoster(
  roster: PlanningRosterEntry[]
) {
  const config = await getBreakRules();

  return roster.map((entry) => {
    const shiftMinutes = calculateShiftMinutes(entry);
    const summary = calculateBreakSummary(
      shiftMinutes,
      config
    );

    return {
      ...entry,
      breakMinutes:
        entry.status === 'Sick' ||
        entry.status === 'No Show'
          ? 0
          : summary.productiveBreakMinutes,
    };
  });
}

async function enrichNightValue<T>(
  storageKey: string,
  value: T
): Promise<T> {
  if (
    storageKey !== NIGHTFILL_STORAGE.roster ||
    !Array.isArray(value)
  ) {
    return value;
  }

  const enriched = await applyBreakRulesToRoster(
    value as PlanningRosterEntry[]
  );

  return enriched as T;
}

export async function readNightValue<T>(
  storageKey: string,
  dateKey: string,
  legacyDayName?: string
): Promise<T | null> {
  const record = await readStorage<Record<string, T>>(
    storageKey,
    {}
  );

  if (record[dateKey] !== undefined) {
    return enrichNightValue(
      storageKey,
      record[dateKey]
    );
  }

  if (
    legacyDayName &&
    record[legacyDayName] !== undefined
  ) {
    return enrichNightValue(
      storageKey,
      record[legacyDayName]
    );
  }

  return null;
}

async function auditNightSave(
  storageKey: string,
  dateKey: string,
  value: unknown
) {
  if (storageKey === NIGHTFILL_STORAGE.loads) {
    const load = value as {
      totalRequiredMinutes?: number;
      totalCartons?: number;
    };

    await appendAuditLog({
      category: 'Load',
      action: 'Fill Assist load saved',
      details: `${dateKey} · ${Math.round(
        load.totalRequiredMinutes || 0
      )} labour min · ${Math.round(load.totalCartons || 0)} cartons`,
    });
    return;
  }

  if (storageKey === NIGHTFILL_STORAGE.allocations) {
    const allocations = Array.isArray(value) ? value : [];
    await appendAuditLog({
      category: 'Allocation',
      action: 'Final allocation saved',
      details: `${dateKey} · ${allocations.length} allocation rows`,
    });
    return;
  }

  if (storageKey === NIGHTFILL_STORAGE.arrivals) {
    const arrival = value as {
      actualTime?: string | null;
      expectedTime?: string | null;
      arrived?: boolean;
    };

    await appendAuditLog({
      category: 'Load',
      action: arrival.arrived
        ? 'Load arrival recorded'
        : 'Load arrival updated',
      details: `${dateKey} · expected ${arrival.expectedTime || '—'} · actual ${
        arrival.actualTime || '—'
      }`,
    });
    return;
  }

  if (storageKey === NIGHTFILL_STORAGE.reports) {
    await appendAuditLog({
      category: 'Summary',
      action: 'Night summary saved',
      details: dateKey,
    });
  }
}

export async function saveNightValue<T>(
  storageKey: string,
  dateKey: string,
  value: T,
  legacyDayName?: string
) {
  const record = await readStorage<Record<string, T>>(
    storageKey,
    {}
  );

  record[dateKey] = value;

  if (legacyDayName) {
    record[legacyDayName] = value;
  }

  await writeStorage(storageKey, record);
  await auditNightSave(storageKey, dateKey, value);
}

export async function saveTonightValue<T>(
  storageKey: string,
  value: T,
  sourceDate: Date = new Date()
) {
  const { dateKey, dayName } = getTonightContext(sourceDate);

  await saveNightValue(
    storageKey,
    dateKey,
    value,
    dayName
  );
}

export async function migrateLegacyNightValue<T>(
  storageKey: string,
  dateKey: string,
  legacyDayName: string
) {
  const record = await readStorage<Record<string, T>>(
    storageKey,
    {}
  );

  if (
    record[dateKey] !== undefined ||
    record[legacyDayName] === undefined
  ) {
    return false;
  }

  record[dateKey] = record[legacyDayName];
  await writeStorage(storageKey, record);
  return true;
}

export async function migrateTonightLegacyData(
  sourceDate: Date = new Date()
) {
  const { dateKey, dayName } = getTonightContext(sourceDate);

  const keys: string[] = [
    NIGHTFILL_STORAGE.roster,
    NIGHTFILL_STORAGE.loads,
    NIGHTFILL_STORAGE.allocations,
    NIGHTFILL_STORAGE.progress,
    NIGHTFILL_STORAGE.arrivals,
  ];

  let migratedCount = 0;

  for (const key of keys) {
    const migrated = await migrateLegacyNightValue(
      key,
      dateKey,
      dayName
    );

    if (migrated) {
      migratedCount += 1;
    }
  }

  return {
    dateKey,
    dayName,
    migratedCount,
  };
}

export function getDatedEntries<T>(
  record: Record<string, T>
) {
  return Object.entries(record).filter(([key]) =>
    isNightDateKey(key)
  );
}

export async function deleteNightValue(
  storageKey: string,
  dateKey: string,
  legacyDayName?: string
) {
  const record = await readStorage<Record<string, unknown>>(
    storageKey,
    {}
  );

  delete record[dateKey];

  if (legacyDayName) {
    delete record[legacyDayName];
  }

  await writeStorage(storageKey, record);
}
