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

export function getTonightContext() {
  const date =
    getNightfillDate();

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
| IMPORTANT:
|
| New data is ONLY written
| against YYYY-MM-DD.
|
| We do NOT write back to
| Tuesday / Wednesday etc.
|
|--------------------------------------------------------------------------
*/

export async function saveNightValue<
  T
>(
  storageKey: string,
  dateKey: string,
  value: T
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

  await writeStorage(
    storageKey,
    record
  );
}

/*
|--------------------------------------------------------------------------
| DELETE NIGHT VALUE
|--------------------------------------------------------------------------
*/

export async function deleteNightValue(
  storageKey: string,
  dateKey: string
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

  await writeStorage(
    storageKey,
    record
  );
}
