import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getDateKey,
  getNightfillDate,
} from './nightfillPlanning';

/*
|--------------------------------------------------------------------------
| STORAGE KEYS
|--------------------------------------------------------------------------
*/

export const NIGHTFILL_STORAGE = {
  roster:
    'groceryNightRoster',

  loads:
    'groceryNightLoads',

  allocations:
    'groceryNightAllocations',

  progress:
    'groceryNightProgress',

  arrivals:
    'groceryLoadArrivals',

  reports:
    'groceryNightReports',
} as const;

export type NightfillStorageKey =
  (typeof NIGHTFILL_STORAGE)[keyof typeof NIGHTFILL_STORAGE];

/*
|--------------------------------------------------------------------------
| DATE CONTEXT
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| getNightfillDate() already moves 12:00 AM → 4:59 AM
| back to the previous Nightfill date.
|
| Therefore dayName must be derived directly from that adjusted date.
| Passing the adjusted date through getNightfillDayName() would apply the
| overnight adjustment a second time before 5 AM.
|
|--------------------------------------------------------------------------
*/

export function getTonightContext(
  sourceDate: Date =
    new Date()
) {
  const date =
    getNightfillDate(
      sourceDate
    );

  return {
    date,

    dateKey:
      getDateKey(
        date
      ),

    dayName:
      date.toLocaleDateString(
        'en-AU',
        {
          weekday:
            'long',
        }
      ),
  };
}

/*
|--------------------------------------------------------------------------
| DATE KEY CHECK
|--------------------------------------------------------------------------
*/

export function isNightDateKey(
  value: string
) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    value
  );
}

/*
|--------------------------------------------------------------------------
| READ JSON
|--------------------------------------------------------------------------
*/

export async function readStorage<
  T
>(
  key: string,
  fallback: T
): Promise<T> {
  try {
    const stored =
      await AsyncStorage.getItem(
        key
      );

    return stored
      ? JSON.parse(
          stored
        )
      : fallback;
  } catch (error) {
    console.log(
      `READ STORAGE ERROR: ${key}`,
      error
    );

    return fallback;
  }
}

/*
|--------------------------------------------------------------------------
| WRITE JSON
|--------------------------------------------------------------------------
*/

export async function writeStorage<
  T
>(
  key: string,
  value: T
) {
  await AsyncStorage.setItem(
    key,
    JSON.stringify(
      value
    )
  );
}

/*
|--------------------------------------------------------------------------
| READ NIGHT VALUE
|--------------------------------------------------------------------------
|
| New format:
|
| 2026-08-25: {...}
|
| Legacy fallback:
|
| Tuesday: {...}
|
|--------------------------------------------------------------------------
*/

export async function readNightValue<
  T
>(
  storageKey: string,
  dateKey: string,
  legacyDayName?: string
): Promise<T | null> {
  const record =
    await readStorage<
      Record<
        string,
        T
      >
    >(
      storageKey,
      {}
    );

  /*
   * Always prefer
   * real date.
   */

  if (
    record[
      dateKey
    ] !==
    undefined
  ) {
    return record[
      dateKey
    ];
  }

  /*
   * Temporary support for
   * old app data.
   */

  if (
    legacyDayName &&
    record[
      legacyDayName
    ] !==
      undefined
  ) {
    return record[
      legacyDayName
    ];
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| SAVE NIGHT VALUE
|--------------------------------------------------------------------------
|
| dateKey is always the permanent record.
|
| legacyDayName is optional and exists only while older screens still read
| Monday / Tuesday / Wednesday keys. When supplied, we keep that weekday key
| as a compatibility mirror without sacrificing the permanent YYYY-MM-DD
| archive.
|
| Once every screen has been migrated, callers can stop supplying
| legacyDayName and the weekday mirror can be retired.
|
|--------------------------------------------------------------------------
*/

export async function saveNightValue<
  T
>(
  storageKey: string,
  dateKey: string,
  value: T,
  legacyDayName?: string
) {
  const record =
    await readStorage<
      Record<
        string,
        T
      >
    >(
      storageKey,
      {}
    );

  record[
    dateKey
  ] =
    value;

  if (
    legacyDayName
  ) {
    record[
      legacyDayName
    ] =
      value;
  }

  await writeStorage(
    storageKey,
    record
  );
}

/*
|--------------------------------------------------------------------------
| SAVE TONIGHT VALUE
|--------------------------------------------------------------------------
|
| Convenience wrapper for screens that are operating on the current
| Nightfill. It writes a permanent date-key record and a temporary weekday
| compatibility mirror in one operation.
|
|--------------------------------------------------------------------------
*/

export async function saveTonightValue<
  T
>(
  storageKey: string,
  value: T,
  sourceDate: Date =
    new Date()
) {
  const {
    dateKey,
    dayName,
  } =
    getTonightContext(
      sourceDate
    );

  await saveNightValue(
    storageKey,
    dateKey,
    value,
    dayName
  );
}

/*
|--------------------------------------------------------------------------
| MIGRATE ONE LEGACY NIGHT VALUE
|--------------------------------------------------------------------------
|
| If a real YYYY-MM-DD record does not exist yet, copy the old weekday value
| into the date-key archive. Existing date-key data is never overwritten by
| legacy data.
|
|--------------------------------------------------------------------------
*/

export async function migrateLegacyNightValue<
  T
>(
  storageKey: string,
  dateKey: string,
  legacyDayName: string
) {
  const record =
    await readStorage<
      Record<
        string,
        T
      >
    >(
      storageKey,
      {}
    );

  if (
    record[
      dateKey
    ] !==
      undefined ||
    record[
      legacyDayName
    ] ===
      undefined
  ) {
    return false;
  }

  record[
    dateKey
  ] =
    record[
      legacyDayName
    ];

  await writeStorage(
    storageKey,
    record
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| MIGRATE TONIGHT'S LEGACY DATA
|--------------------------------------------------------------------------
|
| This is deliberately one-way: weekday -> date key only when the date key
| is missing. It never lets an older weekday value overwrite a permanent
| dated record.
|
| Reports are excluded because duplicating report keys can create duplicate
| History rows. Night Summary already saves reports by date key.
|
|--------------------------------------------------------------------------
*/

export async function migrateTonightLegacyData(
  sourceDate: Date =
    new Date()
) {
  const {
    dateKey,
    dayName,
  } =
    getTonightContext(
      sourceDate
    );

  const keys: string[] = [
    NIGHTFILL_STORAGE.roster,
    NIGHTFILL_STORAGE.loads,
    NIGHTFILL_STORAGE.allocations,
    NIGHTFILL_STORAGE.progress,
    NIGHTFILL_STORAGE.arrivals,
  ];

  let migratedCount =
    0;

  for (
    const key of keys
  ) {
    const migrated =
      await migrateLegacyNightValue(
        key,
        dateKey,
        dayName
      );

    if (
      migrated
    ) {
      migratedCount +=
        1;
    }
  }

  return {
    dateKey,
    dayName,
    migratedCount,
  };
}

/*
|--------------------------------------------------------------------------
| DATE-KEY ENTRIES
|--------------------------------------------------------------------------
|
| Useful for History / Analytics so legacy weekday compatibility keys never
| appear as duplicate nights.
|
|--------------------------------------------------------------------------
*/

export function getDatedEntries<
  T
>(
  record: Record<
    string,
    T
  >
) {
  return Object.entries(
    record
  ).filter(
    ([key]) =>
      isNightDateKey(
        key
      )
  );
}

/*
|--------------------------------------------------------------------------
| DELETE NIGHT VALUE
|--------------------------------------------------------------------------
*/

export async function deleteNightValue(
  storageKey: string,
  dateKey: string,
  legacyDayName?: string
) {
  const record =
    await readStorage<
      Record<
        string,
        unknown
      >
    >(
      storageKey,
      {}
    );

  delete record[
    dateKey
  ];

  if (
    legacyDayName
  ) {
    delete record[
      legacyDayName
    ];
  }

  await writeStorage(
    storageKey,
    record
  );
}
