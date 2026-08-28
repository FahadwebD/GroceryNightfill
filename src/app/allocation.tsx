import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    router,
    useFocusEffect,
} from 'expo-router';

import {
    useCallback,
    useMemo,
    useState,
} from 'react';

import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type Employee = {
  id: string;
  name: string;
  aisleSkills?: Record<string, number>;
};

type ShiftStatus =
  | 'Working'
  | 'Sick'
  | 'Late'
  | 'Left Early'
  | 'No Show'
  | 'Called In';

type RosterEntry = {
  employeeId: string;

  hours: string;

  startTime?: string;

  finishTime?: string;

  status: ShiftStatus;

  isExtra: boolean;
};

type SavedRoster = Record<
  string,
  RosterEntry[]
>;

type LoadItem = {
  name: string;
  cartons: string;
  hours: string;
  minutes: string;
};

type NightLoad = {
  day: string;

  items: LoadItem[];

  totalCartons: number;

  totalRequiredMinutes: number;

  aisleMinutes: number;

  promoMinutes: number;

  protectMinutes: number;

  splittingMinutes: number;

  otherOrganisingMinutes: number;
};

type SavedLoads = Record<
  string,
  NightLoad
>;

type Allocation = {
  employeeId: string;

  taskName: string;

  minutes: number;
};

type SavedAllocations = Record<
  string,
  Allocation[]
>;

type LoadArrivalRecord = {
  day: string;

  expectedTime: string;

  actualTime: string | null;

  actualTimestamp: string | null;

  arrived: boolean;

  updatedAt: string;
};

type SavedLoadArrivals = Record<
  string,
  LoadArrivalRecord
>;

type Task = {
  name: string;

  requiredMinutes: number;

  type:
    | 'splitting'
    | 'aisle'
    | 'promo'
    | 'protect'
    | 'other';
};

/*
|--------------------------------------------------------------------------
| NIGHTFILL DATE
|--------------------------------------------------------------------------
*/

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function getNightfillDate() {
  const now =
    new Date();

  const date =
    new Date(now);

  if (
    date.getHours() <
    5
  ) {
    date.setDate(
      date.getDate() - 1
    );
  }

  return date;
}

function getDateKey(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      '0'
    );

  return `${year}-${month}-${day}`;
}

/*
|--------------------------------------------------------------------------
| TIME HELPERS
|--------------------------------------------------------------------------
*/

function normaliseTime(
  value: string
) {
  const text =
    value.trim();

  if (!text) {
    return '';
  }

  const parts =
    text.split(':');

  const hour =
    Number(
      parts[0]
    );

  const minute =
    parts.length >
    1
      ? Number(
          parts[1]
        )
      : 0;

  if (
    Number.isNaN(
      hour
    ) ||
    Number.isNaN(
      minute
    )
  ) {
    return '';
  }

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return '';
  }

  return `${String(
    hour
  ).padStart(
    2,
    '0'
  )}:${String(
    minute
  ).padStart(
    2,
    '0'
  )}`;
}

function timeToNightMinutes(
  value: string
) {
  const time =
    normaliseTime(
      value
    );

  if (!time) {
    return null;
  }

  const [
    hour,
    minute,
  ] =
    time
      .split(':')
      .map(Number);

  let total =
    hour * 60 +
    minute;

  /*
   * 00:00 -> 04:59
   * belongs to next calendar day.
   */

  if (
    hour < 5
  ) {
    total +=
      24 * 60;
  }

  return total;
}

function formatClock(
  value?: string | null
) {
  if (!value) {
    return '—';
  }

  const time =
    normaliseTime(
      value
    );

  if (!time) {
    return value;
  }

  const [
    hour,
    minute,
  ] =
    time
      .split(':')
      .map(Number);

  const date =
    new Date();

  date.setHours(
    hour,
    minute,
    0,
    0
  );

  return date.toLocaleTimeString(
    'en-AU',
    {
      hour:
        'numeric',

      minute:
        '2-digit',
    }
  );
}

/*
|--------------------------------------------------------------------------
| SHIFT MINUTES
|--------------------------------------------------------------------------
*/

function calculateShiftMinutes(
  startTime?: string,
  finishTime?: string
) {
  if (
    !startTime ||
    !finishTime
  ) {
    return 0;
  }

  const start =
    timeToNightMinutes(
      startTime
    );

  let finish =
    timeToNightMinutes(
      finishTime
    );

  if (
    start === null ||
    finish === null
  ) {
    return 0;
  }

  if (
    finish <= start
  ) {
    finish +=
      24 * 60;
  }

  return Math.max(
    finish - start,
    0
  );
}

/*
|--------------------------------------------------------------------------
| POST-LOAD AVAILABLE MINUTES
|--------------------------------------------------------------------------
*/

function calculateAvailableAfterLoad(
  startTime: string | undefined,
  finishTime: string | undefined,
  arrivalTime:
    | string
    | null
    | undefined
) {
  if (
    !startTime ||
    !finishTime
  ) {
    return 0;
  }

  /*
   * If load hasn't arrived,
   * fall back to entire shift.
   */

  if (!arrivalTime) {
    return calculateShiftMinutes(
      startTime,
      finishTime
    );
  }

  const start =
    timeToNightMinutes(
      startTime
    );

  let finish =
    timeToNightMinutes(
      finishTime
    );

  const arrival =
    timeToNightMinutes(
      arrivalTime
    );

  if (
    start === null ||
    finish === null ||
    arrival === null
  ) {
    return 0;
  }

  if (
    finish <= start
  ) {
    finish +=
      24 * 60;
  }

  /*
   * Employee already finished
   * when load arrived.
   */

  if (
    finish <= arrival
  ) {
    return 0;
  }

  /*
   * Employee becomes usable from
   * whichever is later:
   *
   * employee start
   * or
   * load arrival.
   */

  const usableStart =
    Math.max(
      start,
      arrival
    );

  return Math.max(
    finish -
      usableStart,
    0
  );
}

function calculatePreLoadMinutes(
  startTime: string | undefined,
  finishTime: string | undefined,
  arrivalTime:
    | string
    | null
    | undefined
) {
  if (
    !startTime ||
    !finishTime ||
    !arrivalTime
  ) {
    return 0;
  }

  const start =
    timeToNightMinutes(
      startTime
    );

  let finish =
    timeToNightMinutes(
      finishTime
    );

  const arrival =
    timeToNightMinutes(
      arrivalTime
    );

  if (
    start === null ||
    finish === null ||
    arrival === null
  ) {
    return 0;
  }

  if (
    finish <= start
  ) {
    finish +=
      24 * 60;
  }

  if (
    start >= arrival
  ) {
    return 0;
  }

  return Math.max(
    Math.min(
      finish,
      arrival
    ) -
      start,
    0
  );
}

/*
|--------------------------------------------------------------------------
| DISPLAY MINUTES
|--------------------------------------------------------------------------
*/

function formatMinutes(
  totalMinutes: number
) {
  const safe =
    Math.max(
      Math.round(
        totalMinutes || 0
      ),
      0
    );

  const hours =
    Math.floor(
      safe / 60
    );

  const minutes =
    safe % 60;

  if (
    hours === 0
  ) {
    return `${minutes}m`;
  }

  if (
    minutes === 0
  ) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

/*
|--------------------------------------------------------------------------
| PARSE INPUT
|--------------------------------------------------------------------------
*/

/*
 * Allows:
 *
 * 90
 * 1:30
 * 1.5
 *
 * Everything converts to minutes.
 */

function parseAllocationInput(
  value: string
) {
  const text =
    value.trim();

  if (!text) {
    return 0;
  }

  /*
   * 1:30
   */

  if (
    text.includes(':')
  ) {
    const [
      hourText,
      minuteText,
    ] =
      text.split(':');

    const hours =
      Number(
        hourText
      ) || 0;

    const minutes =
      Number(
        minuteText
      ) || 0;

    if (
      minutes < 0 ||
      minutes > 59
    ) {
      return 0;
    }

    return Math.max(
      Math.round(
        hours * 60 +
          minutes
      ),
      0
    );
  }

  const number =
    Number(text);

  if (
    Number.isNaN(
      number
    ) ||
    number < 0
  ) {
    return 0;
  }

  /*
   * Decimal values are treated
   * as hours.
   *
   * 1.5 = 90 minutes.
   *
   * Whole numbers are treated
   * as minutes.
   *
   * 30 = 30 minutes.
   */

  if (
    text.includes('.')
  ) {
    return Math.round(
      number * 60
    );
  }

  return Math.round(
    number
  );
}

/*
|--------------------------------------------------------------------------
| TASK ORDER
|--------------------------------------------------------------------------
*/

function getTaskOrder(
  taskName: string
) {
  if (
    taskName ===
    'Splitting'
  ) {
    return 0;
  }

  if (
    taskName.startsWith(
      'Aisle '
    )
  ) {
    return (
      Number(
        taskName.replace(
          'Aisle ',
          ''
        )
      ) || 50
    );
  }

  if (
    taskName ===
    'Promo'
  ) {
    return 100;
  }

  if (
    taskName ===
    'Protect - Aisle'
  ) {
    return 101;
  }

  if (
    taskName ===
    'Other / Organising'
  ) {
    return 102;
  }

  return 999;
}

/*
|--------------------------------------------------------------------------
| SCREEN
|--------------------------------------------------------------------------
*/

export default function AllocationScreen() {
  const nightfillDate =
    getNightfillDate();

  const currentDay =
    dayNames[
      nightfillDate.getDay()
    ];

  const dateKey =
    getDateKey(
      nightfillDate
    );

  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  const [
    roster,
    setRoster,
  ] =
    useState<RosterEntry[]>([]);

  const [
    load,
    setLoad,
  ] =
    useState<NightLoad | null>(
      null
    );

  const [
    allocations,
    setAllocations,
  ] =
    useState<Allocation[]>([]);

  const [
    loadArrival,
    setLoadArrival,
  ] =
    useState<LoadArrivalRecord | null>(
      null
    );

  const [
    inputValues,
    setInputValues,
  ] =
    useState<Record<string, string>>(
      {}
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  /*
|--------------------------------------------------------------------------
| LOAD DATA
|--------------------------------------------------------------------------
*/

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    try {
      setLoading(
        true
      );

      /*
       * EMPLOYEES
       */

      const storedEmployees =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      setEmployees(
        storedEmployees
          ? JSON.parse(
              storedEmployees
            )
          : []
      );

      /*
       * ROSTER
       */

      const storedRoster =
        await AsyncStorage.getItem(
          'groceryNightRoster'
        );

      const parsedRoster:
        SavedRoster =
        storedRoster
          ? JSON.parse(
              storedRoster
            )
          : {};

      setRoster(
        parsedRoster[
          currentDay
        ] || []
      );

      /*
       * LOAD
       */

      const storedLoads =
        await AsyncStorage.getItem(
          'groceryNightLoads'
        );

      const parsedLoads:
        SavedLoads =
        storedLoads
          ? JSON.parse(
              storedLoads
            )
          : {};

      setLoad(
        parsedLoads[
          currentDay
        ] || null
      );

      /*
       * ALLOCATIONS
       */

      const storedAllocations =
        await AsyncStorage.getItem(
          'groceryNightAllocations'
        );

      const parsedAllocations:
        SavedAllocations =
        storedAllocations
          ? JSON.parse(
              storedAllocations
            )
          : {};

      const tonight =
        parsedAllocations[
          currentDay
        ] || [];

      setAllocations(
        tonight
      );

      /*
       * Fill inputs from
       * existing allocations.
       */

      const nextInputs:
        Record<
          string,
          string
        > = {};

      tonight.forEach(
        (item) => {
          nextInputs[
            `${item.employeeId}::${item.taskName}`
          ] =
            item.minutes >
            0
              ? String(
                  item.minutes
                )
              : '';
        }
      );

      setInputValues(
        nextInputs
      );

      /*
       * LOAD ARRIVAL
       */

      const storedArrivals =
        await AsyncStorage.getItem(
          'groceryLoadArrivals'
        );

      const parsedArrivals:
        SavedLoadArrivals =
        storedArrivals
          ? JSON.parse(
              storedArrivals
            )
          : {};

      setLoadArrival(
        parsedArrivals[
          dateKey
        ] ||
          parsedArrivals[
            currentDay
          ] ||
          null
      );
    } catch (error) {
      console.log(
        'LOAD ALLOCATION ERROR:',
        error
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| ACTIVE TEAM
|--------------------------------------------------------------------------
*/

  const workingRoster =
    useMemo(
      () =>
        roster.filter(
          (entry) =>
            entry.status !==
              'Sick' &&
            entry.status !==
              'No Show'
        ),
      [roster]
    );

  function getEmployee(
    employeeId: string
  ) {
    return employees.find(
      (employee) =>
        employee.id ===
        employeeId
    );
  }

  /*
|--------------------------------------------------------------------------
| LOAD ARRIVAL
|--------------------------------------------------------------------------
*/

  const arrivalTime =
    loadArrival?.arrived
      ? loadArrival.actualTime
      : null;

  /*
|--------------------------------------------------------------------------
| EMPLOYEE AVAILABLE MINUTES
|--------------------------------------------------------------------------
*/

  function getEmployeeAvailableMinutes(
    entry: RosterEntry
  ) {
    /*
     * New roster data.
     */

    if (
      entry.startTime &&
      entry.finishTime
    ) {
      return calculateAvailableAfterLoad(
        entry.startTime,
        entry.finishTime,
        arrivalTime
      );
    }

    /*
     * Legacy fallback.
     */

    return Math.max(
      Math.round(
        (
          Number(
            entry.hours
          ) || 0
        ) * 60
      ),
      0
    );
  }

  function getEmployeePreLoadMinutes(
    entry: RosterEntry
  ) {
    if (
      !arrivalTime
    ) {
      return 0;
    }

    return calculatePreLoadMinutes(
      entry.startTime,
      entry.finishTime,
      arrivalTime
    );
  }

  /*
|--------------------------------------------------------------------------
| TASK LIST
|--------------------------------------------------------------------------
*/

  const tasks:
    Task[] =
    useMemo(() => {
      if (!load) {
        return [];
      }

      const result:
        Task[] = [];

      /*
       * SPLITTING
       */

      if (
        load.splittingMinutes >
        0
      ) {
        result.push({
          name:
            'Splitting',

          requiredMinutes:
            load.splittingMinutes,

          type:
            'splitting',
        });
      }

      /*
       * LOAD ITEMS
       */

      load.items?.forEach(
        (item) => {
          const minutes =
            (
              Number(
                item.hours
              ) || 0
            ) *
              60 +
            (
              Number(
                item.minutes
              ) || 0
            );

          if (
            minutes <= 0
          ) {
            return;
          }

          let type:
            Task['type'] =
            'aisle';

          if (
            item.name ===
            'Promo'
          ) {
            type =
              'promo';
          }

          if (
            item.name ===
            'Protect - Aisle'
          ) {
            type =
              'protect';
          }

          if (
            item.name ===
            'Other / Organising'
          ) {
            type =
              'other';
          }

          result.push({
            name:
              item.name,

            requiredMinutes:
              minutes,

            type,
          });
        }
      );

      /*
       * Some scanner versions
       * store these separately
       * instead of inside items.
       */

      if (
        load.otherOrganisingMinutes >
          0 &&
        !result.some(
          (item) =>
            item.name ===
            'Other / Organising'
        )
      ) {
        result.push({
          name:
            'Other / Organising',

          requiredMinutes:
            load.otherOrganisingMinutes,

          type:
            'other',
        });
      }

      if (
        load.promoMinutes >
          0 &&
        !result.some(
          (item) =>
            item.name ===
            'Promo'
        )
      ) {
        result.push({
          name:
            'Promo',

          requiredMinutes:
            load.promoMinutes,

          type:
            'promo',
        });
      }

      if (
        load.protectMinutes >
          0 &&
        !result.some(
          (item) =>
            item.name ===
            'Protect - Aisle'
        )
      ) {
        result.push({
          name:
            'Protect - Aisle',

          requiredMinutes:
            load.protectMinutes,

          type:
            'protect',
        });
      }

      return result.sort(
        (a, b) =>
          getTaskOrder(
            a.name
          ) -
          getTaskOrder(
            b.name
          )
      );
    }, [load]);

  /*
|--------------------------------------------------------------------------
| ALLOCATION HELPERS
|--------------------------------------------------------------------------
*/

  function getEmployeeAllocatedMinutes(
    employeeId: string
  ) {
    return allocations
      .filter(
        (item) =>
          item.employeeId ===
          employeeId
      )
      .reduce(
        (
          total,
          item
        ) =>
          total +
          item.minutes,
        0
      );
  }

  function getEmployeeRemainingMinutes(
    entry: RosterEntry
  ) {
    return Math.max(
      getEmployeeAvailableMinutes(
        entry
      ) -
        getEmployeeAllocatedMinutes(
          entry.employeeId
        ),
      0
    );
  }

  function getTaskAllocatedMinutes(
    taskName: string
  ) {
    return allocations
      .filter(
        (item) =>
          item.taskName ===
          taskName
      )
      .reduce(
        (
          total,
          item
        ) =>
          total +
          item.minutes,
        0
      );
  }

  /*
|--------------------------------------------------------------------------
| TOTALS
|--------------------------------------------------------------------------
*/

  const totalAvailableMinutes =
    workingRoster.reduce(
      (
        total,
        entry
      ) =>
        total +
        getEmployeeAvailableMinutes(
          entry
        ),
      0
    );

  const totalPreLoadMinutes =
    workingRoster.reduce(
      (
        total,
        entry
      ) =>
        total +
        getEmployeePreLoadMinutes(
          entry
        ),
      0
    );

  const totalAllocatedMinutes =
    allocations.reduce(
      (
        total,
        item
      ) =>
        total +
        item.minutes,
      0
    );

  const totalRemainingMinutes =
    Math.max(
      totalAvailableMinutes -
        totalAllocatedMinutes,
      0
    );

  const requiredMinutes =
    load?.totalRequiredMinutes ||
    tasks.reduce(
      (
        total,
        item
      ) =>
        total +
        item.requiredMinutes,
      0
    );

  const realDifference =
    totalAvailableMinutes -
    requiredMinutes;

  /*
|--------------------------------------------------------------------------
| SAVE ALLOCATION
|--------------------------------------------------------------------------
*/

  async function saveAllocations(
    next:
      Allocation[]
  ) {
    try {
      setAllocations(
        next
      );

      const stored =
        await AsyncStorage.getItem(
          'groceryNightAllocations'
        );

      const saved:
        SavedAllocations =
        stored
          ? JSON.parse(
              stored
            )
          : {};

      saved[
        currentDay
      ] =
        next;

      await AsyncStorage.setItem(
        'groceryNightAllocations',
        JSON.stringify(
          saved
        )
      );
    } catch (error) {
      console.log(
        'SAVE ALLOCATION ERROR:',
        error
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| UPDATE INPUT
|--------------------------------------------------------------------------
*/

  function updateInput(
    employeeId: string,
    taskName: string,
    value: string
  ) {
    setInputValues(
      (current) => ({
        ...current,

        [`${employeeId}::${taskName}`]:
          value,
      })
    );
  }

  /*
|--------------------------------------------------------------------------
| COMMIT ALLOCATION
|--------------------------------------------------------------------------
*/

  async function commitAllocation(
    entry: RosterEntry,
    task: Task
  ) {
    const key =
      `${entry.employeeId}::${task.name}`;

    const value =
      inputValues[
        key
      ] || '';

    const minutes =
      parseAllocationInput(
        value
      );

    const existing =
      allocations.find(
        (item) =>
          item.employeeId ===
            entry.employeeId &&
          item.taskName ===
            task.name
      );

    const existingMinutes =
      existing?.minutes ||
      0;

    const availableMinutes =
      getEmployeeAvailableMinutes(
        entry
      );

    const employeeAllocatedWithoutThis =
      getEmployeeAllocatedMinutes(
        entry.employeeId
      ) -
      existingMinutes;

    const maximumForEmployee =
      Math.max(
        availableMinutes -
          employeeAllocatedWithoutThis,
        0
      );

    /*
     * Do not allow more than
     * employee's post-load time.
     */

    if (
      minutes >
      maximumForEmployee
    ) {
      Alert.alert(
        'Not Enough Time',
        `${
          getEmployee(
            entry.employeeId
          )?.name ||
          'This employee'
        } only has ${formatMinutes(
          maximumForEmployee
        )} available for this allocation after the load arrival.`
      );

      setInputValues(
        (current) => ({
          ...current,

          [key]:
            maximumForEmployee >
            0
              ? String(
                  maximumForEmployee
                )
              : '',
        })
      );

      return;
    }

    /*
     * 0 removes the allocation.
     */

    let next =
      allocations.filter(
        (item) =>
          !(
            item.employeeId ===
              entry.employeeId &&
            item.taskName ===
              task.name
          )
      );

    if (
      minutes >
      0
    ) {
      next = [
        ...next,

        {
          employeeId:
            entry.employeeId,

          taskName:
            task.name,

          minutes,
        },
      ];
    }

    await saveAllocations(
      next
    );
  }

  /*
|--------------------------------------------------------------------------
| CLEAR EMPLOYEE
|--------------------------------------------------------------------------
*/

  function clearEmployee(
    entry: RosterEntry
  ) {
    const employee =
      getEmployee(
        entry.employeeId
      );

    Alert.alert(
      'Clear Allocation',
      `Remove all task allocations for ${
        employee?.name ||
        'this employee'
      }?`,
      [
        {
          text:
            'Cancel',

          style:
            'cancel',
        },

        {
          text:
            'Clear',

          style:
            'destructive',

          onPress:
            async () => {
              const next =
                allocations.filter(
                  (item) =>
                    item.employeeId !==
                    entry.employeeId
                );

              const nextInputs = {
                ...inputValues,
              };

              tasks.forEach(
                (task) => {
                  delete nextInputs[
                    `${entry.employeeId}::${task.name}`
                  ];
                }
              );

              setInputValues(
                nextInputs
              );

              await saveAllocations(
                next
              );
            },
        },
      ]
    );
  }

  /*
|--------------------------------------------------------------------------
| CLEAR ALL
|--------------------------------------------------------------------------
*/

  function clearAll() {
    Alert.alert(
      'Clear Tonight’s Plan',
      'Remove all staff allocations for tonight?',
      [
        {
          text:
            'Cancel',

          style:
            'cancel',
        },

        {
          text:
            'Clear All',

          style:
            'destructive',

          onPress:
            async () => {
              setInputValues(
                {}
              );

              await saveAllocations(
                []
              );
            },
        },
      ]
    );
  }

  /*
|--------------------------------------------------------------------------
| LOADING
|--------------------------------------------------------------------------
*/

  if (loading) {
    return (
      <View
        style={
          styles.center
        }
      >
        <Text
          style={
            styles.loadingText
          }
        >
          Loading staff allocation...
        </Text>
      </View>
    );
  }

  /*
|--------------------------------------------------------------------------
| UI
|--------------------------------------------------------------------------
*/

  return (
    <View
      style={
        styles.container
      }
    >
      {/* HEADER */}

      <View
        style={
          styles.header
        }
      >
        <TouchableOpacity
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.back
            }
          >
            ‹ Tonight
          </Text>
        </TouchableOpacity>

        <Text
          style={
            styles.headerSmall
          }
        >
          GROCERY NIGHTFILL
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Staff Allocation
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          {currentDay} Nightfill
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* LOAD STATUS */}

        <View
          style={[
            styles.arrivalCard,

            loadArrival?.arrived
              ? styles.arrivalReady
              : styles.arrivalWaiting,
          ]}
        >
          <View>
            <Text
              style={
                styles.arrivalLabel
              }
            >
              LOAD STATUS
            </Text>

            <Text
              style={
                loadArrival?.arrived
                  ? styles.arrivalReadyText
                  : styles.arrivalWaitingText
              }
            >
              {loadArrival?.arrived
                ? `Arrived ${formatClock(
                    loadArrival.actualTime
                  )}`
                : 'Load arrival not recorded'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              router.push(
                '/load-arrival'
              )
            }
          >
            <Text
              style={
                styles.changeText
              }
            >
              Manage
            </Text>
          </TouchableOpacity>
        </View>

        {!loadArrival?.arrived && (
          <View
            style={
              styles.warningCard
            }
          >
            <Text
              style={
                styles.warningTitle
              }
            >
              Allocation is using full roster hours
            </Text>

            <Text
              style={
                styles.warningText
              }
            >
              Record the actual load arrival time to calculate each employee&apos;s real remaining load labour.
            </Text>
          </View>
        )}

        {/* REAL LABOUR POSITION */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Real Labour Position
        </Text>

        <View
          style={
            styles.labourCard
          }
        >
          {loadArrival?.arrived && (
            <SummaryRow
              label="Labour before load"
              value={formatMinutes(
                totalPreLoadMinutes
              )}
              type="warning"
            />
          )}

          <SummaryRow
            label={
              loadArrival?.arrived
                ? 'Available after arrival'
                : 'Available roster labour'
            }
            value={formatMinutes(
              totalAvailableMinutes
            )}
            type="primary"
          />

          <SummaryRow
            label="Load required"
            value={formatMinutes(
              requiredMinutes
            )}
          />

          <View
            style={
              styles.divider
            }
          />

          <SummaryRow
            label={
              realDifference <
              0
                ? 'REAL SHORTAGE'
                : 'REAL SURPLUS'
            }
            value={
              realDifference <
              0
                ? `-${formatMinutes(
                    Math.abs(
                      realDifference
                    )
                  )}`
                : `+${formatMinutes(
                    realDifference
                  )}`
            }
            type={
              realDifference <
              0
                ? 'danger'
                : 'good'
            }
          />
        </View>

        {/* PLAN TOTAL */}

        <View
          style={
            styles.planStats
          }
        >
          <View
            style={
              styles.planStat
            }
          >
            <Text
              style={
                styles.planStatLabel
              }
            >
              Allocated
            </Text>

            <Text
              style={
                styles.planStatValue
              }
            >
              {formatMinutes(
                totalAllocatedMinutes
              )}
            </Text>
          </View>

          <View
            style={
              styles.planDivider
            }
          />

          <View
            style={
              styles.planStat
            }
          >
            <Text
              style={
                styles.planStatLabel
              }
            >
              Staff Time Left
            </Text>

            <Text
              style={
                styles.remainingValue
              }
            >
              {formatMinutes(
                totalRemainingMinutes
              )}
            </Text>
          </View>
        </View>

        {/* TASK REQUIREMENTS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Load Requirements
        </Text>

        {tasks.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              No Load Data
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Scan tonight&apos;s Fill Assist load first.
            </Text>
          </View>
        ) : (
          tasks.map(
            (task) => {
              const allocated =
                getTaskAllocatedMinutes(
                  task.name
                );

              const difference =
                task.requiredMinutes -
                allocated;

              return (
                <View
                  key={
                    task.name
                  }
                  style={
                    styles.taskRequirementCard
                  }
                >
                  <View
                    style={
                      styles.taskRequirementInfo
                    }
                  >
                    <Text
                      style={
                        task.type ===
                        'splitting'
                          ? styles.splittingName
                          : styles.taskRequirementName
                      }
                    >
                      {
                        task.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.taskRequirementSub
                      }
                    >
                      Required{' '}
                      {formatMinutes(
                        task.requiredMinutes
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.taskRequirementRight
                    }
                  >
                    <Text
                      style={
                        styles.taskAllocated
                      }
                    >
                      {formatMinutes(
                        allocated
                      )}
                    </Text>

                    <Text
                      style={
                        difference >
                        0
                          ? styles.taskShort
                          : styles.taskCovered
                      }
                    >
                      {difference >
                      0
                        ? `${formatMinutes(
                            difference
                          )} left`
                        : 'Covered'}
                    </Text>
                  </View>
                </View>
              );
            }
          )
        )}

        {/* STAFF */}

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionTitleNoMargin
            }
          >
            Allocate Staff
          </Text>

          {allocations.length >
            0 && (
            <TouchableOpacity
              onPress={
                clearAll
              }
            >
              <Text
                style={
                  styles.clearAllText
                }
              >
                Clear all
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {workingRoster.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              No Working Staff
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Prepare tonight&apos;s roster first.
            </Text>
          </View>
        ) : (
          workingRoster.map(
            (entry) => {
              const employee =
                getEmployee(
                  entry.employeeId
                );

              if (!employee) {
                return null;
              }

              const availableMinutes =
                getEmployeeAvailableMinutes(
                  entry
                );

              const preLoadMinutes =
                getEmployeePreLoadMinutes(
                  entry
                );

              const allocatedMinutes =
                getEmployeeAllocatedMinutes(
                  entry.employeeId
                );

              const remainingMinutes =
                getEmployeeRemainingMinutes(
                  entry
                );

              const initials =
                employee.name
                  .split(' ')
                  .map(
                    (part) =>
                      part[0]
                  )
                  .join('')
                  .slice(
                    0,
                    2
                  )
                  .toUpperCase();

              return (
                <View
                  key={
                    entry.employeeId
                  }
                  style={
                    styles.employeeCard
                  }
                >
                  {/* EMPLOYEE */}

                  <View
                    style={
                      styles.employeeHeader
                    }
                  >
                    <View
                      style={
                        styles.avatar
                      }
                    >
                      <Text
                        style={
                          styles.avatarText
                        }
                      >
                        {
                          initials
                        }
                      </Text>
                    </View>

                    <View
                      style={
                        styles.employeeInfo
                      }
                    >
                      <Text
                        style={
                          styles.employeeName
                        }
                      >
                        {
                          employee.name
                        }
                      </Text>

                      <Text
                        style={
                          styles.employeeShift
                        }
                      >
                        {entry.startTime &&
                        entry.finishTime
                          ? `${formatClock(
                              entry.startTime
                            )} → ${formatClock(
                              entry.finishTime
                            )}`
                          : `${formatMinutes(
                              Math.round(
                                (
                                  Number(
                                    entry.hours
                                  ) ||
                                  0
                                ) *
                                  60
                              )
                            )} rostered`}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() =>
                        clearEmployee(
                          entry
                        )
                      }
                    >
                      <Text
                        style={
                          styles.clearEmployeeText
                        }
                      >
                        Clear
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* EMPLOYEE LABOUR */}

                  <View
                    style={
                      styles.employeeLabourBox
                    }
                  >
                    {loadArrival?.arrived && (
                      <View
                        style={
                          styles.employeeStat
                        }
                      >
                        <Text
                          style={
                            styles.employeeStatLabel
                          }
                        >
                          Before Load
                        </Text>

                        <Text
                          style={
                            styles.preLoadEmployeeValue
                          }
                        >
                          {formatMinutes(
                            preLoadMinutes
                          )}
                        </Text>
                      </View>
                    )}

                    <View
                      style={
                        styles.employeeStat
                      }
                    >
                      <Text
                        style={
                          styles.employeeStatLabel
                        }
                      >
                        Available
                      </Text>

                      <Text
                        style={
                          styles.availableEmployeeValue
                        }
                      >
                        {formatMinutes(
                          availableMinutes
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.employeeStat
                      }
                    >
                      <Text
                        style={
                          styles.employeeStatLabel
                        }
                      >
                        Allocated
                      </Text>

                      <Text
                        style={
                          styles.allocatedEmployeeValue
                        }
                      >
                        {formatMinutes(
                          allocatedMinutes
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.employeeStat
                      }
                    >
                      <Text
                        style={
                          styles.employeeStatLabel
                        }
                      >
                        Remaining
                      </Text>

                      <Text
                        style={
                          remainingMinutes ===
                          0
                            ? styles.zeroRemaining
                            : styles.remainingEmployeeValue
                        }
                      >
                        {formatMinutes(
                          remainingMinutes
                        )}
                      </Text>
                    </View>
                  </View>

                  {availableMinutes ===
                    0 && (
                    <View
                      style={
                        styles.noLoadTimeBox
                      }
                    >
                      <Text
                        style={
                          styles.noLoadTimeText
                        }
                      >
                        No shift time remains after the load arrival.
                      </Text>
                    </View>
                  )}

                  {/* TASK INPUTS */}

                  {availableMinutes >
                    0 && (
                    <View
                      style={
                        styles.employeeTasks
                      }
                    >
                      {tasks.map(
                        (task) => {
                          const key =
                            `${entry.employeeId}::${task.name}`;

                          const value =
                            inputValues[
                              key
                            ] ||
                            '';

                          const currentMinutes =
                            allocations.find(
                              (item) =>
                                item.employeeId ===
                                  entry.employeeId &&
                                item.taskName ===
                                  task.name
                            )
                              ?.minutes ||
                            0;

                          return (
                            <View
                              key={
                                task.name
                              }
                              style={
                                styles.allocationRow
                              }
                            >
                              <View
                                style={
                                  styles.allocationTaskInfo
                                }
                              >
                                <Text
                                  style={
                                    task.type ===
                                    'splitting'
                                      ? styles.splittingTaskText
                                      : styles.allocationTaskName
                                  }
                                >
                                  {
                                    task.name
                                  }
                                </Text>

                                {currentMinutes >
                                  0 && (
                                  <Text
                                    style={
                                      styles.savedAllocationText
                                    }
                                  >
                                    Saved:{' '}
                                    {formatMinutes(
                                      currentMinutes
                                    )}
                                  </Text>
                                )}
                              </View>

                              <View
                                style={
                                  styles.allocationInputBox
                                }
                              >
                                <TextInput
                                  value={
                                    value
                                  }
                                  onChangeText={(
                                    text
                                  ) =>
                                    updateInput(
                                      entry.employeeId,
                                      task.name,
                                      text
                                    )
                                  }
                                  onEndEditing={() =>
                                    commitAllocation(
                                      entry,
                                      task
                                    )
                                  }
                                  placeholder="min"
                                  keyboardType="numbers-and-punctuation"
                                  style={
                                    styles.allocationInput
                                  }
                                />

                                <Text
                                  style={
                                    styles.minuteSuffix
                                  }
                                >
                                  min
                                </Text>
                              </View>

                              <TouchableOpacity
                                style={
                                  styles.setButton
                                }
                                onPress={() =>
                                  commitAllocation(
                                    entry,
                                    task
                                  )
                                }
                              >
                                <Text
                                  style={
                                    styles.setButtonText
                                  }
                                >
                                  Set
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        }
                      )}
                    </View>
                  )}
                </View>
              );
            }
          )
        )}

        {/* TEAM PLAN */}

        <TouchableOpacity
          style={
            styles.teamPlanButton
          }
          onPress={() =>
            router.push(
              '/team-plan'
            )
          }
        >
          <Text
            style={
              styles.teamPlanText
            }
          >
            View Team Plan →
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

function SummaryRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string;

  type?:
    | 'primary'
    | 'good'
    | 'danger'
    | 'warning';
}) {
  let valueStyle =
    styles.summaryValue;

  if (
    type ===
    'primary'
  ) {
    valueStyle =
      styles.summaryPrimary;
  }

  if (
    type ===
    'good'
  ) {
    valueStyle =
      styles.summaryGood;
  }

  if (
    type ===
    'danger'
  ) {
    valueStyle =
      styles.summaryDanger;
  }

  if (
    type ===
    'warning'
  ) {
    valueStyle =
      styles.summaryWarning;
  }

  return (
    <View
      style={
        styles.summaryRow
      }
    >
      <Text
        style={
          styles.summaryLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          valueStyle
        }
      >
        {value}
      </Text>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| STYLES
|--------------------------------------------------------------------------
*/

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F4F6FA',
    },

    center: {
      flex: 1,
      backgroundColor:
        '#F4F6FA',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    loadingText: {
      color:
        '#667085',
      fontSize: 13,
    },

    header: {
      backgroundColor:
        '#101D48',
      paddingTop: 65,
      paddingHorizontal: 22,
      paddingBottom: 25,
    },

    back: {
      color:
        '#D5DBED',
      fontSize: 14,
      marginBottom: 14,
    },

    headerSmall: {
      color:
        '#AEB9DD',
      fontSize: 9,
      fontWeight:
        '800',
      letterSpacing: 1.4,
    },

    title: {
      color:
        '#FFFFFF',
      fontSize: 29,
      fontWeight:
        '800',
      marginTop: 4,
    },

    subtitle: {
      color:
        '#D5DBED',
      fontSize: 11,
      marginTop: 4,
    },

    content: {
      padding: 16,
      paddingBottom: 55,
    },

    sectionTitle: {
      color:
        '#101828',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 20,
      marginBottom: 9,
    },

    sectionTitleNoMargin: {
      color:
        '#101828',
      fontSize: 17,
      fontWeight:
        '800',
    },

    sectionHeader: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginTop: 20,
      marginBottom: 9,
    },

    arrivalCard: {
      borderRadius: 14,
      padding: 14,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    arrivalReady: {
      backgroundColor:
        '#E8F8EF',
    },

    arrivalWaiting: {
      backgroundColor:
        '#FFF4E5',
    },

    arrivalLabel: {
      color:
        '#667085',
      fontSize: 7,
      fontWeight:
        '800',
    },

    arrivalReadyText: {
      color:
        '#168455',
      fontSize: 14,
      fontWeight:
        '800',
      marginTop: 3,
    },

    arrivalWaitingText: {
      color:
        '#B54708',
      fontSize: 14,
      fontWeight:
        '800',
      marginTop: 3,
    },

    changeText: {
      color:
        '#2436B2',
      fontSize: 10,
      fontWeight:
        '800',
    },

    warningCard: {
      backgroundColor:
        '#FFF4E5',
      borderRadius: 12,
      padding: 12,
      marginTop: 8,
    },

    warningTitle: {
      color:
        '#B54708',
      fontSize: 10,
      fontWeight:
        '800',
    },

    warningText: {
      color:
        '#8A5A19',
      fontSize: 8,
      lineHeight: 13,
      marginTop: 3,
    },

    labourCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 14,
    },

    summaryRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      paddingVertical: 6,
    },

    summaryLabel: {
      color:
        '#667085',
      fontSize: 10,
    },

    summaryValue: {
      color:
        '#101D48',
      fontSize: 13,
      fontWeight:
        '800',
    },

    summaryPrimary: {
      color:
        '#2436B2',
      fontSize: 14,
      fontWeight:
        '800',
    },

    summaryGood: {
      color:
        '#168455',
      fontSize: 14,
      fontWeight:
        '800',
    },

    summaryDanger: {
      color:
        '#D92D20',
      fontSize: 14,
      fontWeight:
        '800',
    },

    summaryWarning: {
      color:
        '#B54708',
      fontSize: 13,
      fontWeight:
        '800',
    },

    divider: {
      height: 1,
      backgroundColor:
        '#EAECF0',
      marginVertical: 5,
    },

    planStats: {
      backgroundColor:
        '#101D48',
      borderRadius: 14,
      padding: 14,
      marginTop: 9,
      flexDirection:
        'row',
    },

    planStat: {
      flex: 1,
      alignItems:
        'center',
    },

    planDivider: {
      width: 1,
      backgroundColor:
        '#34446E',
    },

    planStatLabel: {
      color:
        '#AEB9DD',
      fontSize: 8,
    },

    planStatValue: {
      color:
        '#FFFFFF',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 4,
    },

    remainingValue: {
      color:
        '#8EE1B4',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 4,
    },

    emptyCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 16,
    },

    emptyTitle: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    emptyText: {
      color:
        '#667085',
      fontSize: 9,
      lineHeight: 14,
      marginTop: 4,
    },

    taskRequirementCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 12,
      padding: 12,
      marginBottom: 7,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    taskRequirementInfo: {
      flex: 1,
    },

    taskRequirementName: {
      color:
        '#101828',
      fontSize: 12,
      fontWeight:
        '800',
    },

    splittingName: {
      color:
        '#6D5DFB',
      fontSize: 12,
      fontWeight:
        '800',
    },

    taskRequirementSub: {
      color:
        '#98A2B3',
      fontSize: 8,
      marginTop: 3,
    },

    taskRequirementRight: {
      alignItems:
        'flex-end',
    },

    taskAllocated: {
      color:
        '#101D48',
      fontSize: 11,
      fontWeight:
        '800',
    },

    taskShort: {
      color:
        '#B54708',
      fontSize: 8,
      marginTop: 2,
    },

    taskCovered: {
      color:
        '#168455',
      fontSize: 8,
      fontWeight:
        '700',
      marginTop: 2,
    },

    clearAllText: {
      color:
        '#D92D20',
      fontSize: 9,
      fontWeight:
        '800',
    },

    employeeCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 15,
      padding: 14,
      marginBottom: 11,
    },

    employeeHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    avatar: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        '#E9ECFF',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    avatarText: {
      color:
        '#2436B2',
      fontSize: 11,
      fontWeight:
        '800',
    },

    employeeInfo: {
      flex: 1,
      marginLeft: 10,
    },

    employeeName: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    employeeShift: {
      color:
        '#667085',
      fontSize: 8,
      marginTop: 3,
    },

    clearEmployeeText: {
      color:
        '#D92D20',
      fontSize: 8,
      fontWeight:
        '800',
    },

    employeeLabourBox: {
      backgroundColor:
        '#F8F9FB',
      borderRadius: 11,
      padding: 10,
      marginTop: 11,
      flexDirection:
        'row',
    },

    employeeStat: {
      flex: 1,
      alignItems:
        'center',
    },

    employeeStatLabel: {
      color:
        '#98A2B3',
      fontSize: 6,
    },

    preLoadEmployeeValue: {
      color:
        '#B54708',
      fontSize: 10,
      fontWeight:
        '800',
      marginTop: 3,
    },

    availableEmployeeValue: {
      color:
        '#2436B2',
      fontSize: 10,
      fontWeight:
        '800',
      marginTop: 3,
    },

    allocatedEmployeeValue: {
      color:
        '#101D48',
      fontSize: 10,
      fontWeight:
        '800',
      marginTop: 3,
    },

    remainingEmployeeValue: {
      color:
        '#168455',
      fontSize: 10,
      fontWeight:
        '800',
      marginTop: 3,
    },

    zeroRemaining: {
      color:
        '#D92D20',
      fontSize: 10,
      fontWeight:
        '800',
      marginTop: 3,
    },

    noLoadTimeBox: {
      backgroundColor:
        '#FDECEC',
      borderRadius: 9,
      padding: 9,
      marginTop: 8,
    },

    noLoadTimeText: {
      color:
        '#D92D20',
      fontSize: 8,
      fontWeight:
        '700',
    },

    employeeTasks: {
      marginTop: 10,
    },

    allocationRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      borderTopWidth: 1,
      borderTopColor:
        '#F2F4F7',
      paddingVertical: 8,
    },

    allocationTaskInfo: {
      flex: 1,
    },

    allocationTaskName: {
      color:
        '#344054',
      fontSize: 10,
      fontWeight:
        '700',
    },

    splittingTaskText: {
      color:
        '#6D5DFB',
      fontSize: 10,
      fontWeight:
        '800',
    },

    savedAllocationText: {
      color:
        '#98A2B3',
      fontSize: 7,
      marginTop: 2,
    },

    allocationInputBox: {
      width: 83,
      backgroundColor:
        '#F2F4F7',
      borderRadius: 8,
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 5,
    },

    allocationInput: {
      flex: 1,
      color:
        '#101D48',
      textAlign:
        'center',
      fontSize: 10,
      fontWeight:
        '800',
      paddingVertical: 8,
    },

    minuteSuffix: {
      color:
        '#98A2B3',
      fontSize: 6,
    },

    setButton: {
      backgroundColor:
        '#E9ECFF',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
      marginLeft: 6,
    },

    setButtonText: {
      color:
        '#2436B2',
      fontSize: 8,
      fontWeight:
        '800',
    },

    teamPlanButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 14,
      paddingVertical: 15,
      alignItems:
        'center',
      marginTop: 15,
    },

    teamPlanText: {
      color:
        '#FFFFFF',
      fontSize: 11,
      fontWeight:
        '800',
    },
  });