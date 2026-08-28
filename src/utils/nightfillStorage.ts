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

/*
 * Operational Nightfill scope:
 * - Splitting
 * - Grocery aisles
 * - Other / Organising
 *
 * Promo and Protect may still be detected by Fill Assist/OCR, but they are
 * not part of this app's Nightfill workload, allocation or labour target.
 */
function ignoredOperationalTaskName(value?: string | null) {
  const name = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  return (
    name === 'promo' ||
    name === 'protect' ||
    name === 'protect aisle' ||
    name === 'protect - aisle'
  );
}

function loadItemMinutes(item: unknown) {
  if (!item || typeof item !== 'object') return 0;

  const value = item as {
    hours?: string | number;
    minutes?: string | number;
  };

  return Math.max(
    (Number(value.hours) || 0) * 60 +
      (Number(value.minutes) || 0),
    0
  );
}

function normaliseOperationalLoad<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const load = value as unknown as {
    items?: Array<{
      name?: string;
      hours?: string | number;
      minutes?: string | number;
      [key: string]: unknown;
    }>;
    totalRequiredMinutes?: number;
    promoMinutes?: number;
    protectMinutes?: number;
    splittingMinutes?: number;
    otherOrganisingMinutes?: number;
    [key: string]: unknown;
  };

  const rawItems = Array.isArray(load.items) ? load.items : [];
  const ignoredItemMinutes = rawItems
    .filter((item) => ignoredOperationalTaskName(item.name))
    .reduce((total, item) => total + loadItemMinutes(item), 0);

  const items = rawItems.filter(
    (item) => !ignoredOperationalTaskName(item.name)
  );

  const separatelyDetectedIgnoredMinutes =
    Math.max(Number(load.promoMinutes) || 0, 0) +
    Math.max(Number(load.protectMinutes) || 0, 0);

  /*
   * Promo/Protect can appear both as OCR item rows and as dedicated totals.
   * Use the larger representation so we remove them once, not twice.
   */
  const ignoredMinutes = Math.max(
    ignoredItemMinutes,
    separatelyDetectedIgnoredMinutes
  );

  const rawRequired = Math.max(
    Number(load.totalRequiredMinutes) || 0,
    0
  );

  const operationalComponentMinimum =
    items.reduce((total, item) => total + loadItemMinutes(item), 0) +
    Math.max(Number(load.splittingMinutes) || 0, 0) +
    Math.max(Number(load.otherOrganisingMinutes) || 0, 0);

  const adjustedRequired = Math.max(
    rawRequired - ignoredMinutes,
    operationalComponentMinimum,
    0
  );

  return {
    ...load,
    items,
    promoMinutes: 0,
    protectMinutes: 0,
    totalRequiredMinutes: Math.round(adjustedRequired),
  } as T;
}

function normaliseOperationalAllocations<T>(value: T): T {
  if (!Array.isArray(value)) return value;

  return value.filter((item) => {
    if (!item || typeof item !== 'object') return true;
    const allocation = item as { taskName?: string };
    return !ignoredOperationalTaskName(allocation.taskName);
  }) as T;
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
    storageKey === NIGHTFILL_STORAGE.roster &&
    Array.isArray(value)
  ) {
    const enriched = await applyBreakRulesToRoster(
      value as PlanningRosterEntry[]
    );
    return enriched as T;
  }

  if (storageKey === NIGHTFILL_STORAGE.loads) {
    return normaliseOperationalLoad(value);
  }

  if (storageKey === NIGHTFILL_STORAGE.allocations) {
    return normaliseOperationalAllocations(value);
  }

  return value;
}

async function prepareNightValueForStorage<T>(
  storageKey: string,
  value: T
): Promise<T> {
  if (storageKey === NIGHTFILL_STORAGE.loads) {
    return normaliseOperationalLoad(value);
  }

  if (storageKey === NIGHTFILL_STORAGE.allocations) {
    return normaliseOperationalAllocations(value);
  }

  return value;
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
      )} operational labour min · ${Math.round(
        load.totalCartons || 0
      )} cartons`,
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
      details: `${dateKey} · expected ${
        arrival.expectedTime || '—'
      } · actual ${arrival.actualTime || '—'}`,
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

  const storedValue = await prepareNightValueForStorage(
    storageKey,
    value
  );

  record[dateKey] = storedValue;

  if (legacyDayName) {
    record[legacyDayName] = storedValue;
  }

  await writeStorage(storageKey, record);
  await auditNightSave(storageKey, dateKey, storedValue);
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
    NIGHTFILL_STORAGE.helpActions,
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
