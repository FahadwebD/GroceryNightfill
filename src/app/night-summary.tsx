import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
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

  updatedAt: string;
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

type TaskStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Complete';

type ManualResult =
  | 'On Time'
  | 'Ahead'
  | 'Behind'
  | 'Just Complete'
  | null;

type CompletionMode =
  | 'timer'
  | 'manual'
  | null;

type ProgressItem = {
  taskName: string;

  status: TaskStatus;

  requiredMinutes: number;

  startedAt: string | null;

  completedAt: string | null;

  actualSeconds: number | null;

  completionMode: CompletionMode;

  manualResult: ManualResult;

  manualDifferenceMinutes: number;
};

type SavedProgress = Record<
  string,
  ProgressItem[]
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

type PlannedAssignment = {
  employeeId: string;

  taskName: string;

  minutes: number;

  plannedStartMinute: number;

  plannedFinishMinute: number;
};

type PlannedTask = {
  taskName: string;

  employeeIds: string[];

  allocatedLabourMinutes: number;

  plannedStartMinute: number;

  plannedFinishMinute: number;
};

type PerformanceResult = {
  type:
    | 'ahead'
    | 'behind'
    | 'ontime'
    | 'complete'
    | 'none';

  minutes: number;

  label: string;
};

type TimelineResult = {
  type:
    | 'ahead'
    | 'behind'
    | 'ontime'
    | 'none';

  minutes: number;

  signedMinutes: number;

  label: string;
};

type SavedTaskStaff = {
  employeeId: string;

  name: string;

  allocatedMinutes: number;
};

type SavedTaskResult = {
  taskName: string;

  status: TaskStatus;

  staff: SavedTaskStaff[];

  requiredMinutes: number;

  allocatedLabourMinutes: number;

  plannedStartMinute: number | null;

  plannedFinishMinute: number | null;

  actualStartedAt: string | null;

  actualCompletedAt: string | null;

  completionMode: CompletionMode;

  durationResult: string;

  timelineResult: string;

  timelineDifferenceMinutes:
    | number
    | null;
};

type SavedNightReport = {
  day: string;

  dateKey: string;

  displayDate: string;

  savedAt: string;

  /*
   * LOAD / LABOUR
   */

  requiredMinutes: number;

  rosteredMinutes: number;

  totalCartons: number;

  splittingMinutes: number;

  /*
   * ARRIVAL
   */

  expectedArrivalTime:
    | string
    | null;

  actualArrivalTime:
    | string
    | null;

  arrivalDelayMinutes:
    | number
    | null;

  /*
   * REAL LABOUR
   */

  preLoadLabourMinutes: number;

  postArrivalLabourMinutes: number;

  realLabourDifferenceMinutes: number;

  /*
   * TASKS
   */

  completedTasks: number;

  totalTasks: number;

  /*
   * TASK DURATION PERFORMANCE
   */

  aheadTasks: number;

  behindTasks: number;

  onTimeTasks: number;

  noTimingTasks: number;

  netPerformanceMinutes: number;

  /*
   * CLOCK PLAN PERFORMANCE
   */

  planAheadTasks: number;

  planBehindTasks: number;

  planOnTimeTasks: number;

  finalPlanDifferenceMinutes:
    | number
    | null;

  /*
   * ATTENDANCE
   */

  sickCount: number;

  lateCount: number;

  noShowCount: number;

  calledInCount: number;

  /*
   * FULL TASK RECORD
   */

  taskResults: SavedTaskResult[];
};

type SavedNightReports = Record<
  string,
  SavedNightReport
>;

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
  const date =
    new Date();

  /*
   * 12 AM -> 4:59 AM
   * still belongs to
   * previous Nightfill.
   */

  if (
    date.getHours() < 5
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
| FORMAT MINUTES
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

function formatSignedMinutes(
  minutes: number
) {
  if (
    minutes > 0
  ) {
    return `+${formatMinutes(
      minutes
    )}`;
  }

  if (
    minutes < 0
  ) {
    return `-${formatMinutes(
      Math.abs(
        minutes
      )
    )}`;
  }

  return '0m';
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
    ) ||
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

/*
 * Nightfill timeline:
 *
 * 17:00 = 1020
 * 23:00 = 1380
 * 01:00 = 1500
 * 05:00 = 1740
 */

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

  if (
    hour < 5
  ) {
    total +=
      24 * 60;
  }

  return total;
}

function dateToNightMinutes(
  value: string
) {
  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  let total =
    date.getHours() *
      60 +
    date.getMinutes();

  if (
    date.getHours() < 5
  ) {
    total +=
      24 * 60;
  }

  return total;
}

function formatClock(
  value?:
    | string
    | null
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

function formatNightMinute(
  totalMinutes: number
) {
  let safe =
    Math.round(
      totalMinutes
    ) %
    (24 * 60);

  if (
    safe < 0
  ) {
    safe +=
      24 * 60;
  }

  const hour24 =
    Math.floor(
      safe / 60
    );

  const minute =
    safe % 60;

  const suffix =
    hour24 >= 12
      ? 'PM'
      : 'AM';

  let hour12 =
    hour24 % 12;

  if (
    hour12 === 0
  ) {
    hour12 =
      12;
  }

  return `${hour12}:${String(
    minute
  ).padStart(
    2,
    '0'
  )} ${suffix}`;
}

/*
|--------------------------------------------------------------------------
| ROSTER LABOUR
|--------------------------------------------------------------------------
*/

function calculateShiftMinutes(
  entry: RosterEntry
) {
  /*
   * Old roster fallback.
   */

  if (
    !entry.startTime ||
    !entry.finishTime
  ) {
    return Math.max(
      Math.round(
        (
          Number(
            entry.hours
          ) || 0
        ) *
          60
      ),
      0
    );
  }

  const start =
    timeToNightMinutes(
      entry.startTime
    );

  let finish =
    timeToNightMinutes(
      entry.finishTime
    );

  if (
    start === null ||
    finish === null
  ) {
    return 0;
  }

  if (
    finish <=
    start
  ) {
    finish +=
      24 * 60;
  }

  return Math.max(
    finish -
      start,
    0
  );
}

/*
|--------------------------------------------------------------------------
| PRE-LOAD LABOUR
|--------------------------------------------------------------------------
*/

function calculatePreLoadMinutes(
  entry: RosterEntry,
  arrivalTime: string | null
) {
  if (
    !arrivalTime ||
    !entry.startTime ||
    !entry.finishTime
  ) {
    return 0;
  }

  const start =
    timeToNightMinutes(
      entry.startTime
    );

  let finish =
    timeToNightMinutes(
      entry.finishTime
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
    finish <=
    start
  ) {
    finish +=
      24 * 60;
  }

  if (
    start >=
    arrival
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
| POST-ARRIVAL LABOUR
|--------------------------------------------------------------------------
*/

function calculatePostArrivalMinutes(
  entry: RosterEntry,
  arrivalTime: string | null
) {
  /*
   * Before arrival is recorded,
   * use whole roster.
   */

  if (
    !arrivalTime
  ) {
    return calculateShiftMinutes(
      entry
    );
  }

  /*
   * Old roster fallback.
   */

  if (
    !entry.startTime ||
    !entry.finishTime
  ) {
    return calculateShiftMinutes(
      entry
    );
  }

  const start =
    timeToNightMinutes(
      entry.startTime
    );

  let finish =
    timeToNightMinutes(
      entry.finishTime
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
    finish <=
    start
  ) {
    finish +=
      24 * 60;
  }

  /*
   * Employee already finished
   * before the load arrived.
   */

  if (
    finish <=
    arrival
  ) {
    return 0;
  }

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
| REQUIRED TASK TIME
|--------------------------------------------------------------------------
*/

function getRequiredMinutesForTask(
  load: NightLoad | null,
  taskName: string
) {
  if (!load) {
    return 0;
  }

  if (
    taskName ===
    'Splitting'
  ) {
    return (
      load.splittingMinutes ||
      0
    );
  }

  if (
    taskName ===
    'Other / Organising'
  ) {
    return (
      load.otherOrganisingMinutes ||
      0
    );
  }

  if (
    taskName ===
      'Promo' &&
    load.promoMinutes
  ) {
    return (
      load.promoMinutes
    );
  }

  if (
    taskName ===
      'Protect - Aisle' &&
    load.protectMinutes
  ) {
    return (
      load.protectMinutes
    );
  }

  const item =
    load.items?.find(
      (loadItem) =>
        loadItem.name ===
        taskName
    );

  if (!item) {
    return 0;
  }

  return (
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
    )
  );
}

/*
|--------------------------------------------------------------------------
| SCREEN
|--------------------------------------------------------------------------
*/

export default function NightSummaryScreen() {
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
    progress,
    setProgress,
  ] =
    useState<ProgressItem[]>([]);

  const [
    loadArrival,
    setLoadArrival,
  ] =
    useState<LoadArrivalRecord | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    reportSaved,
    setReportSaved,
  ] =
    useState(false);

  /*
  |--------------------------------------------------------------------------
  | DATE
  |--------------------------------------------------------------------------
  */

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

  const formattedDate =
    nightfillDate.toLocaleDateString(
      'en-AU',
      {
        weekday:
          'long',

        day:
          'numeric',

        month:
          'long',

        year:
          'numeric',
      }
    );

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
       * ALLOCATION
       */

      const storedAllocation =
        await AsyncStorage.getItem(
          'groceryNightAllocations'
        );

      const parsedAllocation:
        SavedAllocations =
        storedAllocation
          ? JSON.parse(
              storedAllocation
            )
          : {};

      setAllocations(
        parsedAllocation[
          currentDay
        ] || []
      );

      /*
       * PROGRESS
       */

      const storedProgress =
        await AsyncStorage.getItem(
          'groceryNightProgress'
        );

      const parsedProgress:
        SavedProgress =
        storedProgress
          ? JSON.parse(
              storedProgress
            )
          : {};

      setProgress(
        parsedProgress[
          currentDay
        ] || []
      );

      /*
       * LOAD ARRIVAL
       */

      const storedArrival =
        await AsyncStorage.getItem(
          'groceryLoadArrivals'
        );

      const parsedArrival:
        SavedLoadArrivals =
        storedArrival
          ? JSON.parse(
              storedArrival
            )
          : {};

      setLoadArrival(
        parsedArrival[
          dateKey
        ] ||
          parsedArrival[
            currentDay
          ] ||
          null
      );

      /*
       * EXISTING REPORT
       */

      const storedReports =
        await AsyncStorage.getItem(
          'groceryNightReports'
        );

      const parsedReports:
        SavedNightReports =
        storedReports
          ? JSON.parse(
              storedReports
            )
          : {};

      /*
       * New reports use date.
       * Old reports may still use weekday.
       */

      setReportSaved(
        Boolean(
          parsedReports[
            dateKey
          ] ||
            parsedReports[
              currentDay
            ]
        )
      );
    } catch (error) {
      console.log(
        'LOAD NIGHT SUMMARY ERROR:',
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
  | ACTIVE ROSTER
  |--------------------------------------------------------------------------
  */

  const activeRoster =
    roster.filter(
      (entry) =>
        entry.status !==
          'Sick' &&
        entry.status !==
          'No Show'
    );

  /*
  |--------------------------------------------------------------------------
  | FULL ROSTER LABOUR
  |--------------------------------------------------------------------------
  */

  const rosteredMinutes =
    activeRoster.reduce(
      (
        total,
        entry
      ) =>
        total +
        calculateShiftMinutes(
          entry
        ),
      0
    );

  const requiredMinutes =
    load
      ?.totalRequiredMinutes ||
    0;

  /*
   * Old/original difference.
   */

  const originalLabourDifference =
    rosteredMinutes -
    requiredMinutes;

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
  | PRE-LOAD LABOUR
  |--------------------------------------------------------------------------
  */

  const preLoadLabourMinutes =
    arrivalTime
      ? activeRoster.reduce(
          (
            total,
            entry
          ) =>
            total +
            calculatePreLoadMinutes(
              entry,
              arrivalTime
            ),
          0
        )
      : 0;

  /*
  |--------------------------------------------------------------------------
  | REAL AVAILABLE LABOUR
  |--------------------------------------------------------------------------
  */

  const postArrivalLabourMinutes =
    activeRoster.reduce(
      (
        total,
        entry
      ) =>
        total +
        calculatePostArrivalMinutes(
          entry,
          arrivalTime
        ),
      0
    );

  const realLabourDifferenceMinutes =
    postArrivalLabourMinutes -
    requiredMinutes;

  /*
  |--------------------------------------------------------------------------
  | ARRIVAL DIFFERENCE
  |--------------------------------------------------------------------------
  */

  const arrivalDelayMinutes =
    useMemo(() => {
      if (
        !loadArrival?.arrived ||
        !loadArrival.expectedTime ||
        !loadArrival.actualTime
      ) {
        return null;
      }

      const expected =
        timeToNightMinutes(
          loadArrival.expectedTime
        );

      const actual =
        timeToNightMinutes(
          loadArrival.actualTime
        );

      if (
        expected === null ||
        actual === null
      ) {
        return null;
      }

      /*
       * Positive = late.
       * Negative = early.
       */

      return (
        actual -
        expected
      );
    }, [
      loadArrival,
    ]);

  /*
  |--------------------------------------------------------------------------
  | ATTENDANCE
  |--------------------------------------------------------------------------
  */

  const sickCount =
    roster.filter(
      (entry) =>
        entry.status ===
        'Sick'
    ).length;

  const lateCount =
    roster.filter(
      (entry) =>
        entry.status ===
        'Late'
    ).length;

  const noShowCount =
    roster.filter(
      (entry) =>
        entry.status ===
        'No Show'
    ).length;

  const calledInCount =
    roster.filter(
      (entry) =>
        entry.isExtra ||
        entry.status ===
          'Called In'
    ).length;

  /*
  |--------------------------------------------------------------------------
  | TASK NAMES
  |--------------------------------------------------------------------------
  */

  const allocatedTaskNames =
    useMemo(
      () =>
        Array.from(
          new Set(
            allocations
              .filter(
                (item) =>
                  item.minutes >
                  0
              )
              .map(
                (item) =>
                  item.taskName
              )
          )
        ).sort(
          (a, b) =>
            getTaskOrder(
              a
            ) -
            getTaskOrder(
              b
            )
        ),
      [
        allocations,
      ]
    );

  /*
  |--------------------------------------------------------------------------
  | EMPLOYEE PLANNED ASSIGNMENTS
  |--------------------------------------------------------------------------
  |
  | This uses the same idea as Team Plan:
  |
  | Each employee has their own task sequence.
  | Their timeline starts at:
  |
  | max(employee start, actual load arrival)
  |
  | Then their allocated tasks run one after another.
  |
  |--------------------------------------------------------------------------
  */

  const plannedAssignments =
    useMemo(() => {
      const assignments:
        PlannedAssignment[] =
        [];

      if (
        !arrivalTime
      ) {
        return assignments;
      }

      const arrival =
        timeToNightMinutes(
          arrivalTime
        );

      if (
        arrival === null
      ) {
        return assignments;
      }

      activeRoster.forEach(
        (entry) => {
          const employeeAllocations =
            allocations
              .filter(
                (
                  allocation
                ) =>
                  allocation.employeeId ===
                    entry.employeeId &&
                  allocation.minutes >
                    0
              )
              .sort(
                (a, b) =>
                  getTaskOrder(
                    a.taskName
                  ) -
                  getTaskOrder(
                    b.taskName
                  )
              );

          if (
            employeeAllocations.length ===
            0
          ) {
            return;
          }

          const employeeStart =
            entry.startTime
              ? timeToNightMinutes(
                  entry.startTime
                )
              : null;

          let cursor =
            employeeStart ===
            null
              ? arrival
              : Math.max(
                  arrival,
                  employeeStart
                );

          employeeAllocations.forEach(
            (
              allocation
            ) => {
              const plannedStartMinute =
                cursor;

              const plannedFinishMinute =
                cursor +
                allocation.minutes;

              assignments.push({
                employeeId:
                  entry.employeeId,

                taskName:
                  allocation.taskName,

                minutes:
                  allocation.minutes,

                plannedStartMinute,

                plannedFinishMinute,
              });

              cursor =
                plannedFinishMinute;
            }
          );
        }
      );

      return assignments;
    }, [
      activeRoster,
      allocations,
      arrivalTime,
    ]);

  /*
  |--------------------------------------------------------------------------
  | AGGREGATED TASK TIMELINE
  |--------------------------------------------------------------------------
  */

  const plannedTaskMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          PlannedTask
        >();

      allocatedTaskNames.forEach(
        (taskName) => {
          const taskAssignments =
            plannedAssignments.filter(
              (assignment) =>
                assignment.taskName ===
                taskName
            );

          if (
            taskAssignments.length ===
            0
          ) {
            return;
          }

          map.set(
            taskName,
            {
              taskName,

              employeeIds:
                Array.from(
                  new Set(
                    taskAssignments.map(
                      (
                        assignment
                      ) =>
                        assignment.employeeId
                    )
                  )
                ),

              allocatedLabourMinutes:
                taskAssignments.reduce(
                  (
                    total,
                    assignment
                  ) =>
                    total +
                    assignment.minutes,
                  0
                ),

              /*
               * Shared task starts when
               * first assigned person begins.
               */

              plannedStartMinute:
                Math.min(
                  ...taskAssignments.map(
                    (
                      assignment
                    ) =>
                      assignment.plannedStartMinute
                  )
                ),

              /*
               * Shared task finishes when
               * last assigned person's
               * allocated portion finishes.
               */

              plannedFinishMinute:
                Math.max(
                  ...taskAssignments.map(
                    (
                      assignment
                    ) =>
                      assignment.plannedFinishMinute
                  )
                ),
            }
          );
        }
      );

      return map;
    }, [
      allocatedTaskNames,
      plannedAssignments,
    ]);

  /*
  |--------------------------------------------------------------------------
  | WORK PROGRESS
  |--------------------------------------------------------------------------
  */

  const totalTasks =
    allocatedTaskNames.length;

  const completedTasks =
    allocatedTaskNames.filter(
      (taskName) =>
        progress.some(
          (item) =>
            item.taskName ===
              taskName &&
            item.status ===
              'Complete'
        )
    ).length;

  const inProgressTasks =
    allocatedTaskNames.filter(
      (taskName) =>
        progress.some(
          (item) =>
            item.taskName ===
              taskName &&
            item.status ===
              'In Progress'
        )
    ).length;

  const notStartedTasks =
    Math.max(
      totalTasks -
        completedTasks -
        inProgressTasks,
      0
    );

  /*
  |--------------------------------------------------------------------------
  | TASK DURATION PERFORMANCE
  |--------------------------------------------------------------------------
  |
  | This is the existing system:
  |
  | Required task time vs
  | actual timer/manual result.
  |
  |--------------------------------------------------------------------------
  */

  function getPerformance(
    item: ProgressItem
  ): PerformanceResult {
    if (
      item.status !==
      'Complete'
    ) {
      return {
        type:
          'none',

        minutes:
          0,

        label:
          '',
      };
    }

    /*
     * TIMER
     */

    if (
      item.completionMode ===
        'timer' &&
      item.actualSeconds !==
        null
    ) {
      const differenceSeconds =
        item.requiredMinutes *
          60 -
        item.actualSeconds;

      const differenceMinutes =
        Math.round(
          Math.abs(
            differenceSeconds
          ) /
            60
        );

      if (
        differenceSeconds >
        0
      ) {
        return {
          type:
            'ahead',

          minutes:
            differenceMinutes,

          label:
            `${formatMinutes(
              differenceMinutes
            )} Ahead`,
        };
      }

      if (
        differenceSeconds <
        0
      ) {
        return {
          type:
            'behind',

          minutes:
            differenceMinutes,

          label:
            `${formatMinutes(
              differenceMinutes
            )} Behind`,
        };
      }

      return {
        type:
          'ontime',

        minutes:
          0,

        label:
          'On Time',
      };
    }

    /*
     * MANUAL
     */

    if (
      item.completionMode ===
      'manual'
    ) {
      if (
        item.manualResult ===
        'Ahead'
      ) {
        return {
          type:
            'ahead',

          minutes:
            item.manualDifferenceMinutes,

          label:
            `${formatMinutes(
              item.manualDifferenceMinutes
            )} Ahead`,
        };
      }

      if (
        item.manualResult ===
        'Behind'
      ) {
        return {
          type:
            'behind',

          minutes:
            item.manualDifferenceMinutes,

          label:
            `${formatMinutes(
              item.manualDifferenceMinutes
            )} Behind`,
        };
      }

      if (
        item.manualResult ===
        'On Time'
      ) {
        return {
          type:
            'ontime',

          minutes:
            0,

          label:
            'On Time',
        };
      }

      return {
        type:
          'complete',

        minutes:
          0,

        label:
          'Complete',
      };
    }

    return {
      type:
        'complete',

      minutes:
        0,

      label:
        'Complete',
    };
  }

  /*
  |--------------------------------------------------------------------------
  | CLOCK TIMELINE RESULT
  |--------------------------------------------------------------------------
  |
  | Planned finish vs actual
  | completion clock time.
  |
  | Positive = ahead of plan
  | Negative = behind plan
  |
  |--------------------------------------------------------------------------
  */

  function getTimelineResult(
    taskName: string
  ): TimelineResult {
    const planned =
      plannedTaskMap.get(
        taskName
      );

    const item =
      progress.find(
        (
          progressItem
        ) =>
          progressItem.taskName ===
          taskName
      );

    if (
      !planned ||
      !item ||
      item.status !==
        'Complete' ||
      !item.completedAt
    ) {
      return {
        type:
          'none',

        minutes:
          0,

        signedMinutes:
          0,

        label:
          '',
      };
    }

    const actualFinish =
      dateToNightMinutes(
        item.completedAt
      );

    if (
      actualFinish ===
      null
    ) {
      return {
        type:
          'none',

        minutes:
          0,

        signedMinutes:
          0,

        label:
          '',
      };
    }

    const signedMinutes =
      planned.plannedFinishMinute -
      actualFinish;

    const minutes =
      Math.abs(
        Math.round(
          signedMinutes
        )
      );

    if (
      signedMinutes >
      0
    ) {
      return {
        type:
          'ahead',

        minutes,

        signedMinutes,

        label:
          `${formatMinutes(
            minutes
          )} Ahead of Plan`,
      };
    }

    if (
      signedMinutes <
      0
    ) {
      return {
        type:
          'behind',

        minutes,

        signedMinutes,

        label:
          `${formatMinutes(
            minutes
          )} Behind Plan`,
      };
    }

    return {
      type:
        'ontime',

      minutes:
        0,

      signedMinutes:
        0,

      label:
        'On Plan',
    };
  }

  /*
  |--------------------------------------------------------------------------
  | COMPLETED PROGRESS
  |--------------------------------------------------------------------------
  */

  const completedProgress =
    progress.filter(
      (item) =>
        item.status ===
          'Complete' &&
        allocatedTaskNames.includes(
          item.taskName
        )
    );

  /*
  |--------------------------------------------------------------------------
  | RECORDED TASK PERFORMANCE COUNTS
  |--------------------------------------------------------------------------
  */

  const aheadTasks =
    completedProgress.filter(
      (item) =>
        getPerformance(
          item
        ).type ===
        'ahead'
    ).length;

  const behindTasks =
    completedProgress.filter(
      (item) =>
        getPerformance(
          item
        ).type ===
        'behind'
    ).length;

  const onTimeTasks =
    completedProgress.filter(
      (item) =>
        getPerformance(
          item
        ).type ===
        'ontime'
    ).length;

  const noTimingTasks =
    completedProgress.filter(
      (item) =>
        getPerformance(
          item
        ).type ===
        'complete'
    ).length;

  /*
  |--------------------------------------------------------------------------
  | NET RECORDED PERFORMANCE
  |--------------------------------------------------------------------------
  */

  const netPerformanceMinutes =
    completedProgress.reduce(
      (
        total,
        item
      ) => {
        const performance =
          getPerformance(
            item
          );

        if (
          performance.type ===
          'ahead'
        ) {
          return (
            total +
            performance.minutes
          );
        }

        if (
          performance.type ===
          'behind'
        ) {
          return (
            total -
            performance.minutes
          );
        }

        return total;
      },
      0
    );

  /*
  |--------------------------------------------------------------------------
  | PLAN PERFORMANCE COUNTS
  |--------------------------------------------------------------------------
  */

  const planAheadTasks =
    completedProgress.filter(
      (item) =>
        getTimelineResult(
          item.taskName
        ).type ===
        'ahead'
    ).length;

  const planBehindTasks =
    completedProgress.filter(
      (item) =>
        getTimelineResult(
          item.taskName
        ).type ===
        'behind'
    ).length;

  const planOnTimeTasks =
    completedProgress.filter(
      (item) =>
        getTimelineResult(
          item.taskName
        ).type ===
        'ontime'
    ).length;

  /*
  |--------------------------------------------------------------------------
  | AISLES
  |--------------------------------------------------------------------------
  */

  const aisleTaskNames =
    allocatedTaskNames.filter(
      (task) =>
        task.startsWith(
          'Aisle '
        )
    );

  const completedAisles =
    aisleTaskNames.filter(
      (taskName) =>
        progress.some(
          (item) =>
            item.taskName ===
              taskName &&
            item.status ===
              'Complete'
        )
    ).length;

  /*
  |--------------------------------------------------------------------------
  | OVERALL NIGHT POSITION
  |--------------------------------------------------------------------------
  */

  const nightPosition =
    useMemo(() => {
      if (
        plannedTaskMap.size ===
        0
      ) {
        return null;
      }

      const plannedTasks =
        Array.from(
          plannedTaskMap.values()
        );

      /*
       * If everything is finished,
       * compare final planned finish
       * with actual final completion.
       */

      const allPlannedComplete =
        plannedTasks.every(
          (planned) =>
            progress.some(
              (item) =>
                item.taskName ===
                  planned.taskName &&
                item.status ===
                  'Complete' &&
                item.completedAt
            )
        );

      if (
        allPlannedComplete &&
        plannedTasks.length >
          0
      ) {
        const plannedFinish =
          Math.max(
            ...plannedTasks.map(
              (task) =>
                task.plannedFinishMinute
            )
          );

        const actualFinishes =
          plannedTasks
            .map(
              (planned) => {
                const item =
                  progress.find(
                    (
                      progressItem
                    ) =>
                      progressItem.taskName ===
                      planned.taskName
                  );

                return item
                  ?.completedAt
                  ? dateToNightMinutes(
                      item.completedAt
                    )
                  : null;
              }
            )
            .filter(
              (
                value
              ): value is number =>
                value !== null
            );

        if (
          actualFinishes.length >
          0
        ) {
          const actualFinish =
            Math.max(
              ...actualFinishes
            );

          return {
            difference:
              plannedFinish -
              actualFinish,

            label:
              'Final night finish',
          };
        }
      }

      /*
       * If a task is currently
       * running, compare now
       * against its planned finish.
       */

      const activeItem =
        progress.find(
          (item) =>
            item.status ===
            'In Progress'
        );

      if (
        activeItem
      ) {
        const planned =
          plannedTaskMap.get(
            activeItem.taskName
          );

        if (
          planned
        ) {
          const now =
            new Date();

          let currentMinutes =
            now.getHours() *
              60 +
            now.getMinutes();

          if (
            now.getHours() <
            5
          ) {
            currentMinutes +=
              24 * 60;
          }

          return {
            difference:
              planned.plannedFinishMinute -
              currentMinutes,

            label:
              `Current task: ${activeItem.taskName}`,
          };
        }
      }

      /*
       * Otherwise use the
       * latest completed task.
       */

      const latestCompleted =
        progress
          .filter(
            (item) =>
              item.status ===
                'Complete' &&
              item.completedAt
          )
          .sort(
            (a, b) =>
              new Date(
                b.completedAt ||
                  0
              ).getTime() -
              new Date(
                a.completedAt ||
                  0
              ).getTime()
          )[0];

      if (
        latestCompleted
          ?.completedAt
      ) {
        const planned =
          plannedTaskMap.get(
            latestCompleted.taskName
          );

        const actual =
          dateToNightMinutes(
            latestCompleted.completedAt
          );

        if (
          planned &&
          actual !== null
        ) {
          return {
            difference:
              planned.plannedFinishMinute -
              actual,

            label:
              `Latest completed: ${latestCompleted.taskName}`,
          };
        }
      }

      return null;
    }, [
      plannedTaskMap,
      progress,
    ]);

  /*
  |--------------------------------------------------------------------------
  | SPLITTING
  |--------------------------------------------------------------------------
  */

  const splittingProgress =
    progress.find(
      (item) =>
        item.taskName ===
        'Splitting'
    );

  /*
  |--------------------------------------------------------------------------
  | TASK STAFF
  |--------------------------------------------------------------------------
  */

  function getTaskStaff(
    taskName: string
  ) {
    const taskAllocations =
      allocations.filter(
        (item) =>
          item.taskName ===
            taskName &&
          item.minutes >
            0
      );

    return taskAllocations
      .map(
        (allocation) => {
          const employee =
            employees.find(
              (item) =>
                item.id ===
                allocation.employeeId
            );

          return employee
            ?.name;
        }
      )
      .filter(Boolean)
      .join(', ');
  }

  /*
  |--------------------------------------------------------------------------
  | TASK STAFF SNAPSHOT
  |--------------------------------------------------------------------------
  */

  function getTaskStaffSnapshot(
    taskName: string
  ): SavedTaskStaff[] {
    return allocations
      .filter(
        (item) =>
          item.taskName ===
            taskName &&
          item.minutes >
            0
      )
      .map(
        (allocation) => ({
          employeeId:
            allocation.employeeId,

          name:
            employees.find(
              (employee) =>
                employee.id ===
                allocation.employeeId
            )?.name ||
            'Unknown',

          allocatedMinutes:
            allocation.minutes,
        })
      );
  }

  /*
  |--------------------------------------------------------------------------
  | COMPLETE TASK SNAPSHOT
  |--------------------------------------------------------------------------
  |
  | This is stored inside history
  | so later we can build:
  |
  | employee performance,
  | aisle performance,
  | repeated delays,
  | staff combinations, etc.
  |
  |--------------------------------------------------------------------------
  */

  const taskResultsSnapshot:
    SavedTaskResult[] =
    allocatedTaskNames.map(
      (taskName) => {
        const item =
          progress.find(
            (
              progressItem
            ) =>
              progressItem.taskName ===
              taskName
          );

        const plan =
          plannedTaskMap.get(
            taskName
          );

        const durationPerformance =
          item
            ? getPerformance(
                item
              )
            : {
                type:
                  'none',

                minutes:
                  0,

                label:
                  '',
              };

        const timelinePerformance =
          getTimelineResult(
            taskName
          );

        const allocatedLabourMinutes =
          allocations
            .filter(
              (allocation) =>
                allocation.taskName ===
                taskName
            )
            .reduce(
              (
                total,
                allocation
              ) =>
                total +
                allocation.minutes,
              0
            );

        return {
          taskName,

          status:
            item?.status ||
            'Not Started',

          staff:
            getTaskStaffSnapshot(
              taskName
            ),

          requiredMinutes:
            getRequiredMinutesForTask(
              load,
              taskName
            ),

          allocatedLabourMinutes,

          plannedStartMinute:
            plan
              ?.plannedStartMinute ??
            null,

          plannedFinishMinute:
            plan
              ?.plannedFinishMinute ??
            null,

          actualStartedAt:
            item?.startedAt ||
            null,

          actualCompletedAt:
            item?.completedAt ||
            null,

          completionMode:
            item
              ?.completionMode ||
            null,

          durationResult:
            durationPerformance.label,

          timelineResult:
            timelinePerformance.label,

          timelineDifferenceMinutes:
            timelinePerformance.type ===
            'none'
              ? null
              : timelinePerformance.signedMinutes,
        };
      }
    );

  /*
  |--------------------------------------------------------------------------
  | SAVE REPORT
  |--------------------------------------------------------------------------
  */

  async function saveNightReport() {
    if (!load) {
      Alert.alert(
        'No Load',
        'There is no saved Fill Assist load for tonight.'
      );

      return;
    }

    const report:
      SavedNightReport = {
      day:
        currentDay,

      /*
       * IMPORTANT:
       *
       * History now saves by
       * actual date, not weekday.
       */

      dateKey,

      displayDate:
        formattedDate,

      savedAt:
        new Date().toISOString(),

      /*
       * LABOUR
       */

      requiredMinutes,

      rosteredMinutes,

      totalCartons:
        load.totalCartons ||
        0,

      splittingMinutes:
        load.splittingMinutes ||
        0,

      /*
       * ARRIVAL
       */

      expectedArrivalTime:
        loadArrival
          ?.expectedTime ||
        null,

      actualArrivalTime:
        arrivalTime,

      arrivalDelayMinutes,

      /*
       * REAL LABOUR
       */

      preLoadLabourMinutes,

      postArrivalLabourMinutes,

      realLabourDifferenceMinutes,

      /*
       * PROGRESS
       */

      completedTasks,

      totalTasks,

      /*
       * TASK TIME PERFORMANCE
       */

      aheadTasks,

      behindTasks,

      onTimeTasks,

      noTimingTasks,

      netPerformanceMinutes,

      /*
       * CLOCK PLAN PERFORMANCE
       */

      planAheadTasks,

      planBehindTasks,

      planOnTimeTasks,

      finalPlanDifferenceMinutes:
        nightPosition
          ?.difference ??
        null,

      /*
       * ATTENDANCE
       */

      sickCount,

      lateCount,

      noShowCount,

      calledInCount,

      /*
       * DETAILED TASK RECORD
       */

      taskResults:
        taskResultsSnapshot,
    };

    try {
      const stored =
        await AsyncStorage.getItem(
          'groceryNightReports'
        );

      const reports:
        SavedNightReports =
        stored
          ? JSON.parse(
              stored
            )
          : {};

      /*
       * Example:
       *
       * 2026-08-25
       *
       * instead of:
       *
       * Tuesday
       */

      reports[
        dateKey
      ] =
        report;

      await AsyncStorage.setItem(
        'groceryNightReports',
        JSON.stringify(
          reports
        )
      );

      setReportSaved(
        true
      );

      Alert.alert(
        'Night Report Saved',
        `${formattedDate} has been saved to Nightfill history.`
      );
    } catch (error) {
      console.log(
        'SAVE NIGHT REPORT ERROR:',
        error
      );

      Alert.alert(
        'Error',
        'Could not save the Nightfill report.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (
    loading
  ) {
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
          Loading night summary...
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
          NIGHTFILL REPORT
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Night Summary
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          {formattedDate}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* LOAD ARRIVAL */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Load Arrival
        </Text>

        <View
          style={[
            styles.arrivalCard,

            loadArrival
              ?.arrived
              ? styles.arrivalComplete
              : styles.arrivalWaiting,
          ]}
        >
          <View
            style={
              styles.arrivalHeader
            }
          >
            <View>
              <Text
                style={
                  styles.arrivalSmall
                }
              >
                DELIVERY POSITION
              </Text>

              <Text
                style={
                  loadArrival
                    ?.arrived
                    ? styles.arrivalCompleteTitle
                    : styles.arrivalWaitingTitle
                }
              >
                {loadArrival
                  ?.arrived
                  ? 'Load Arrived'
                  : 'Arrival Not Recorded'}
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
                  styles.manageLink
                }
              >
                Manage
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={
              styles.arrivalStats
            }
          >
            <ArrivalStat
              label="Expected"
              value={formatClock(
                loadArrival
                  ?.expectedTime
              )}
            />

            <View
              style={
                styles.arrivalDivider
              }
            />

            <ArrivalStat
              label="Actual"
              value={formatClock(
                arrivalTime
              )}
            />

            <View
              style={
                styles.arrivalDivider
              }
            />

            <ArrivalStat
              label="Result"
              value={
                arrivalDelayMinutes ===
                null
                  ? '—'
                  : arrivalDelayMinutes >
                      0
                    ? `${formatMinutes(
                        arrivalDelayMinutes
                      )} Late`
                    : arrivalDelayMinutes <
                        0
                      ? `${formatMinutes(
                          Math.abs(
                            arrivalDelayMinutes
                          )
                        )} Early`
                      : 'On Time'
              }
              type={
                arrivalDelayMinutes ===
                null
                  ? 'neutral'
                  : arrivalDelayMinutes >
                      0
                    ? 'danger'
                    : 'good'
              }
            />
          </View>
        </View>

        {/* REAL LABOUR */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Real Labour Position
        </Text>

        <View
          style={
            styles.mainLabourCard
          }
        >
          <View
            style={
              styles.labourTop
            }
          >
            <View>
              <Text
                style={
                  styles.labourMainLabel
                }
              >
                Load Required
              </Text>

              <Text
                style={
                  styles.labourMainValue
                }
              >
                {formatMinutes(
                  requiredMinutes
                )}
              </Text>
            </View>

            <View
              style={
                styles.labourRight
              }
            >
              <Text
                style={
                  styles.labourMainLabel
                }
              >
                Full Roster
              </Text>

              <Text
                style={
                  styles.labourMainValue
                }
              >
                {formatMinutes(
                  rosteredMinutes
                )}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.labourBreakdown
            }
          >
            <DarkSummaryRow
              label="Labour before load"
              value={
                arrivalTime
                  ? formatMinutes(
                      preLoadLabourMinutes
                    )
                  : '—'
              }
              type="warning"
            />

            <DarkSummaryRow
              label="Available after arrival"
              value={formatMinutes(
                postArrivalLabourMinutes
              )}
              type="primary"
            />

            <DarkSummaryRow
              label="Original roster difference"
              value={formatSignedMinutes(
                originalLabourDifference
              )}
              type={
                originalLabourDifference <
                0
                  ? 'danger'
                  : 'good'
              }
            />
          </View>

          <View
            style={[
              styles.realDifferenceBox,

              realLabourDifferenceMinutes <
              0
                ? styles.realShortageBox
                : styles.realSurplusBox,
            ]}
          >
            <Text
              style={
                styles.realDifferenceLabel
              }
            >
              {realLabourDifferenceMinutes <
              0
                ? 'REAL LOAD SHORTAGE'
                : 'REAL LOAD SURPLUS'}
            </Text>

            <Text
              style={
                realLabourDifferenceMinutes <
                0
                  ? styles.realShortageValue
                  : styles.realSurplusValue
              }
            >
              {formatSignedMinutes(
                realLabourDifferenceMinutes
              )}
            </Text>
          </View>
        </View>

        {/* FILL ASSIST */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Fill Assist
        </Text>

        <View
          style={
            styles.loadCard
          }
        >
          <SummaryRow
            label="Cartons"
            value={String(
              load
                ?.totalCartons ||
                0
            )}
          />

          <SummaryRow
            label="Total Required"
            value={formatMinutes(
              load
                ?.totalRequiredMinutes ||
                0
            )}
          />

          <SummaryRow
            label="Aisle Fill"
            value={formatMinutes(
              load
                ?.aisleMinutes ||
                0
            )}
          />

          <SummaryRow
            label="Splitting"
            value={formatMinutes(
              load
                ?.splittingMinutes ||
                0
            )}
            highlight
          />

          <SummaryRow
            label="Promo"
            value={formatMinutes(
              load
                ?.promoMinutes ||
                0
            )}
          />

          <SummaryRow
            label="Protect"
            value={formatMinutes(
              load
                ?.protectMinutes ||
                0
            )}
          />

          <SummaryRow
            label="Other / Organising"
            value={formatMinutes(
              load
                ?.otherOrganisingMinutes ||
                0
            )}
          />
        </View>

        {/* WORK PROGRESS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Work Progress
        </Text>

        <View
          style={
            styles.metricGrid
          }
        >
          <MetricCard
            label="Complete"
            value={`${completedTasks}/${totalTasks}`}
            type="good"
          />

          <MetricCard
            label="In Progress"
            value={String(
              inProgressTasks
            )}
            type="warning"
          />

          <MetricCard
            label="Not Started"
            value={String(
              notStartedTasks
            )}
            type="neutral"
          />

          <MetricCard
            label="Aisles Done"
            value={`${completedAisles}/${aisleTaskNames.length}`}
            type="good"
          />
        </View>

        {/* LIVE TIMELINE */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Night Timeline
        </Text>

        <View
          style={
            styles.timelineSummaryCard
          }
        >
          <Text
            style={
              styles.timelineSummaryLabel
            }
          >
            LIVE PLAN POSITION
          </Text>

          {!arrivalTime ? (
            <>
              <Text
                style={
                  styles.timelineWaiting
                }
              >
                Waiting for Load Arrival
              </Text>

              <Text
                style={
                  styles.timelineSummarySub
                }
              >
                Record actual load arrival to calculate the real Nightfill timeline.
              </Text>
            </>
          ) : nightPosition ? (
            <>
              <Text
                style={
                  nightPosition
                    .difference >=
                  0
                    ? styles.timelineAheadValue
                    : styles.timelineBehindValue
                }
              >
                {nightPosition
                  .difference >
                0
                  ? `${formatMinutes(
                      nightPosition.difference
                    )} AHEAD OF PLAN`
                  : nightPosition
                        .difference <
                      0
                    ? `${formatMinutes(
                        Math.abs(
                          nightPosition.difference
                        )
                      )} BEHIND PLAN`
                    : 'ON PLAN'}
              </Text>

              <Text
                style={
                  styles.timelineSummarySub
                }
              >
                {
                  nightPosition.label
                }
              </Text>
            </>
          ) : (
            <>
              <Text
                style={
                  styles.timelineWaiting
                }
              >
                No Timeline Result Yet
              </Text>

              <Text
                style={
                  styles.timelineSummarySub
                }
              >
                Start or complete a planned task to establish the live position.
              </Text>
            </>
          )}
        </View>

        <View
          style={
            styles.metricGrid
          }
        >
          <MetricCard
            label="Ahead of Plan"
            value={String(
              planAheadTasks
            )}
            type="good"
          />

          <MetricCard
            label="Behind Plan"
            value={String(
              planBehindTasks
            )}
            type="danger"
          />

          <MetricCard
            label="On Plan"
            value={String(
              planOnTimeTasks
            )}
            type="good"
          />

          <MetricCard
            label="Plan Results"
            value={String(
              planAheadTasks +
                planBehindTasks +
                planOnTimeTasks
            )}
            type="neutral"
          />
        </View>

        {/* SPLITTING TIMELINE */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Splitting Timeline
        </Text>

        <View
          style={
            styles.splittingCard
          }
        >
          <SummaryRow
            label="Planned"
            value={
              plannedTaskMap.get(
                'Splitting'
              )
                ? `${formatNightMinute(
                    plannedTaskMap.get(
                      'Splitting'
                    )!
                      .plannedStartMinute
                  )} → ${formatNightMinute(
                    plannedTaskMap.get(
                      'Splitting'
                    )!
                      .plannedFinishMinute
                  )}`
                : '—'
            }
          />

          <SummaryRow
            label="Actual Start"
            value={
              splittingProgress
                ?.startedAt
                ? new Date(
                    splittingProgress.startedAt
                  ).toLocaleTimeString(
                    'en-AU',
                    {
                      hour:
                        'numeric',

                      minute:
                        '2-digit',
                    }
                  )
                : '—'
            }
          />

          <SummaryRow
            label="Actual Finish"
            value={
              splittingProgress
                ?.completedAt
                ? new Date(
                    splittingProgress.completedAt
                  ).toLocaleTimeString(
                    'en-AU',
                    {
                      hour:
                        'numeric',

                      minute:
                        '2-digit',
                    }
                  )
                : '—'
            }
          />

          <SummaryRow
            label="Status"
            value={
              splittingProgress
                ?.status ||
              'Not Started'
            }
            highlight
          />
        </View>

        {/* REQUIRED TIME PERFORMANCE */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Recorded Task Performance
        </Text>

        <View
          style={
            styles.performanceSummaryCard
          }
        >
          <Text
            style={
              styles.performanceSummaryLabel
            }
          >
            REQUIRED TIME VS RECORDED TIME
          </Text>

          <Text
            style={[
              styles.performanceSummaryValue,

              netPerformanceMinutes >
              0
                ? styles.positiveText
                : netPerformanceMinutes <
                    0
                  ? styles.negativeText
                  : styles.neutralText,
            ]}
          >
            {netPerformanceMinutes >
            0
              ? `${formatMinutes(
                  netPerformanceMinutes
                )} AHEAD`
              : netPerformanceMinutes <
                  0
                ? `${formatMinutes(
                    Math.abs(
                      netPerformanceMinutes
                    )
                  )} BEHIND`
                : completedTasks >
                    0
                  ? 'ON TIME / NO DIFFERENCE'
                  : 'NO RESULTS YET'}
          </Text>
        </View>

        <View
          style={
            styles.metricGrid
          }
        >
          <MetricCard
            label="Ahead"
            value={String(
              aheadTasks
            )}
            type="good"
          />

          <MetricCard
            label="Behind"
            value={String(
              behindTasks
            )}
            type="danger"
          />

          <MetricCard
            label="On Time"
            value={String(
              onTimeTasks
            )}
            type="good"
          />

          <MetricCard
            label="No Timing"
            value={String(
              noTimingTasks
            )}
            type="neutral"
          />
        </View>

        {/* TASK RESULTS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Task Results
        </Text>

        {allocatedTaskNames.length ===
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
              No tasks allocated
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Prepare Staff Allocation before reviewing task results.
            </Text>
          </View>
        ) : (
          allocatedTaskNames.map(
            (taskName) => {
              const item =
                progress.find(
                  (
                    progressItem
                  ) =>
                    progressItem.taskName ===
                    taskName
                );

              const status =
                item?.status ||
                'Not Started';

              const performance =
                item
                  ? getPerformance(
                      item
                    )
                  : {
                      type:
                        'none',

                      minutes:
                        0,

                      label:
                        '',
                    };

              const timelinePerformance =
                getTimelineResult(
                  taskName
                );

              const staff =
                getTaskStaff(
                  taskName
                );

              const planned =
                plannedTaskMap.get(
                  taskName
                );

              return (
                <View
                  key={
                    taskName
                  }
                  style={
                    styles.taskResultCard
                  }
                >
                  {/* TASK HEADER */}

                  <View
                    style={
                      styles.taskResultHeader
                    }
                  >
                    <View
                      style={
                        styles.taskResultMain
                      }
                    >
                      <Text
                        style={
                          taskName ===
                          'Splitting'
                            ? styles.taskSplittingName
                            : styles.taskResultName
                        }
                      >
                        {
                          taskName
                        }
                      </Text>

                      {staff ? (
                        <Text
                          style={
                            styles.taskStaff
                          }
                        >
                          {staff}
                        </Text>
                      ) : null}

                      <Text
                        style={
                          styles.taskStatusText
                        }
                      >
                        {status}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.taskResultRight
                      }
                    >
                      {status ===
                      'Complete' ? (
                        <>
                          <Text
                            style={[
                              styles.taskPerformanceText,

                              performance.type ===
                                'behind'
                                ? styles.negativeText
                                : performance.type ===
                                      'ahead' ||
                                    performance.type ===
                                      'ontime'
                                  ? styles.positiveText
                                  : styles.neutralText,
                            ]}
                          >
                            {performance.label ||
                              'Complete'}
                          </Text>

                          <Text
                            style={
                              styles.recordModeText
                            }
                          >
                            {item
                              ?.completionMode ===
                            'timer'
                              ? 'Timer'
                              : item
                                    ?.completionMode ===
                                  'manual'
                                ? 'Manual'
                                : ''}
                          </Text>
                        </>
                      ) : (
                        <Text
                          style={
                            styles.neutralText
                          }
                        >
                          —
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* TASK CLOCK */}

                  <View
                    style={
                      styles.taskTimelineBox
                    }
                  >
                    <TaskTimeRow
                      label="Planned"
                      value={
                        planned
                          ? `${formatNightMinute(
                              planned.plannedStartMinute
                            )} → ${formatNightMinute(
                              planned.plannedFinishMinute
                            )}`
                          : '—'
                      }
                    />

                    <TaskTimeRow
                      label="Actual Start"
                      value={
                        item
                          ?.startedAt
                          ? new Date(
                              item.startedAt
                            ).toLocaleTimeString(
                              'en-AU',
                              {
                                hour:
                                  'numeric',

                                minute:
                                  '2-digit',
                              }
                            )
                          : '—'
                      }
                    />

                    <TaskTimeRow
                      label="Actual Finish"
                      value={
                        item
                          ?.completedAt
                          ? new Date(
                              item.completedAt
                            ).toLocaleTimeString(
                              'en-AU',
                              {
                                hour:
                                  'numeric',

                                minute:
                                  '2-digit',
                              }
                            )
                          : '—'
                      }
                    />
                  </View>

                  {/* PLAN RESULT */}

                  {timelinePerformance.type !==
                    'none' && (
                    <View
                      style={[
                        styles.taskTimelineResult,

                        timelinePerformance.type ===
                          'behind'
                          ? styles.taskTimelineBehind
                          : styles.taskTimelineAhead,
                      ]}
                    >
                      <Text
                        style={
                          timelinePerformance.type ===
                          'behind'
                            ? styles.taskTimelineBehindText
                            : styles.taskTimelineAheadText
                        }
                      >
                        {
                          timelinePerformance.label
                        }
                      </Text>
                    </View>
                  )}
                </View>
              );
            }
          )
        )}

        {/* ATTENDANCE */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Attendance
        </Text>

        <View
          style={
            styles.metricGrid
          }
        >
          <MetricCard
            label="Sick"
            value={String(
              sickCount
            )}
            type="danger"
          />

          <MetricCard
            label="Late"
            value={String(
              lateCount
            )}
            type="warning"
          />

          <MetricCard
            label="No Show"
            value={String(
              noShowCount
            )}
            type="danger"
          />

          <MetricCard
            label="Called In"
            value={String(
              calledInCount
            )}
            type="good"
          />
        </View>

        {/* SAVE */}

        <TouchableOpacity
          style={[
            styles.saveButton,

            reportSaved &&
              styles.savedButton,
          ]}
          onPress={
            saveNightReport
          }
        >
          <Text
            style={
              styles.saveButtonText
            }
          >
            {reportSaved
              ? '✓ Update Saved Night Report'
              : 'Save Night Report'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| COMPONENTS
|--------------------------------------------------------------------------
*/

function SummaryRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
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
          highlight
            ? styles.summaryHighlight
            : styles.summaryValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

function DarkSummaryRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string;

  type:
    | 'primary'
    | 'good'
    | 'danger'
    | 'warning';
}) {
  let valueStyle =
    styles.darkSummaryPrimary;

  if (
    type ===
    'good'
  ) {
    valueStyle =
      styles.darkSummaryGood;
  }

  if (
    type ===
    'danger'
  ) {
    valueStyle =
      styles.darkSummaryDanger;
  }

  if (
    type ===
    'warning'
  ) {
    valueStyle =
      styles.darkSummaryWarning;
  }

  return (
    <View
      style={
        styles.darkSummaryRow
      }
    >
      <Text
        style={
          styles.darkSummaryLabel
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

function ArrivalStat({
  label,
  value,
  type = 'neutral',
}: {
  label: string;
  value: string;

  type?:
    | 'good'
    | 'danger'
    | 'neutral';
}) {
  return (
    <View
      style={
        styles.arrivalStat
      }
    >
      <Text
        style={
          styles.arrivalStatLabel
        }
      >
        {label}
      </Text>

      <Text
        style={[
          styles.arrivalStatValue,

          type ===
            'good' &&
            styles.positiveText,

          type ===
            'danger' &&
            styles.negativeText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  type,
}: {
  label: string;
  value: string;

  type:
    | 'good'
    | 'danger'
    | 'warning'
    | 'neutral';
}) {
  let valueStyle =
    styles.metricNeutral;

  if (
    type ===
    'good'
  ) {
    valueStyle =
      styles.metricGood;
  }

  if (
    type ===
    'danger'
  ) {
    valueStyle =
      styles.metricDanger;
  }

  if (
    type ===
    'warning'
  ) {
    valueStyle =
      styles.metricWarning;
  }

  return (
    <View
      style={
        styles.metricCard
      }
    >
      <Text
        style={
          styles.metricLabel
        }
      >
        {label}
      </Text>

      <Text
        style={[
          styles.metricValue,
          valueStyle,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function TaskTimeRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.taskTimeRow
      }
    >
      <Text
        style={
          styles.taskTimeLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.taskTimeValue
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
      fontSize: 10,
      fontWeight:
        '700',
      letterSpacing: 1.5,
    },

    title: {
      color:
        '#FFFFFF',
      fontSize: 30,
      fontWeight:
        '800',
      marginTop: 5,
    },

    subtitle: {
      color:
        '#D5DBED',
      fontSize: 12,
      marginTop: 5,
    },

    content: {
      padding: 16,
      paddingBottom: 55,
    },

    sectionTitle: {
      color:
        '#101828',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 20,
      marginBottom: 10,
    },

    /*
    |--------------------------------------------------------------------------
    | ARRIVAL
    |--------------------------------------------------------------------------
    */

    arrivalCard: {
      borderRadius: 15,
      padding: 14,
    },

    arrivalComplete: {
      backgroundColor:
        '#E8F8EF',
    },

    arrivalWaiting: {
      backgroundColor:
        '#FFF4E5',
    },

    arrivalHeader: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    arrivalSmall: {
      color:
        '#667085',
      fontSize: 7,
      fontWeight:
        '800',
      letterSpacing: 0.8,
    },

    arrivalCompleteTitle: {
      color:
        '#168455',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 3,
    },

    arrivalWaitingTitle: {
      color:
        '#B54708',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 3,
    },

    manageLink: {
      color:
        '#2436B2',
      fontSize: 9,
      fontWeight:
        '800',
    },

    arrivalStats: {
      flexDirection:
        'row',
      backgroundColor:
        '#FFFFFF',
      borderRadius: 10,
      marginTop: 12,
      paddingVertical: 9,
    },

    arrivalStat: {
      flex: 1,
      alignItems:
        'center',
    },

    arrivalDivider: {
      width: 1,
      backgroundColor:
        '#EAECF0',
    },

    arrivalStatLabel: {
      color:
        '#98A2B3',
      fontSize: 6,
    },

    arrivalStatValue: {
      color:
        '#101D48',
      fontSize: 9,
      fontWeight:
        '800',
      marginTop: 3,
    },

    /*
    |--------------------------------------------------------------------------
    | LABOUR
    |--------------------------------------------------------------------------
    */

    mainLabourCard: {
      backgroundColor:
        '#101D48',
      borderRadius: 16,
      padding: 16,
    },

    labourTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
    },

    labourRight: {
      alignItems:
        'flex-end',
    },

    labourMainLabel: {
      color:
        '#AEB9DD',
      fontSize: 9,
    },

    labourMainValue: {
      color:
        '#FFFFFF',
      fontSize: 22,
      fontWeight:
        '800',
      marginTop: 4,
    },

    labourBreakdown: {
      backgroundColor:
        '#1C2B58',
      borderRadius: 11,
      padding: 10,
      marginTop: 14,
    },

    darkSummaryRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      paddingVertical: 5,
    },

    darkSummaryLabel: {
      color:
        '#D5DBED',
      fontSize: 9,
    },

    darkSummaryPrimary: {
      color:
        '#C9D0FF',
      fontSize: 11,
      fontWeight:
        '800',
    },

    darkSummaryGood: {
      color:
        '#8EE1B4',
      fontSize: 11,
      fontWeight:
        '800',
    },

    darkSummaryDanger: {
      color:
        '#FF9C92',
      fontSize: 11,
      fontWeight:
        '800',
    },

    darkSummaryWarning: {
      color:
        '#FEC84B',
      fontSize: 11,
      fontWeight:
        '800',
    },

    realDifferenceBox: {
      borderRadius: 10,
      padding: 11,
      marginTop: 10,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    realShortageBox: {
      backgroundColor:
        '#492739',
    },

    realSurplusBox: {
      backgroundColor:
        '#163D43',
    },

    realDifferenceLabel: {
      color:
        '#FFFFFF',
      fontSize: 8,
      fontWeight:
        '800',
    },

    realShortageValue: {
      color:
        '#FF9C92',
      fontSize: 15,
      fontWeight:
        '800',
    },

    realSurplusValue: {
      color:
        '#8EE1B4',
      fontSize: 15,
      fontWeight:
        '800',
    },

    /*
    |--------------------------------------------------------------------------
    | LOAD
    |--------------------------------------------------------------------------
    */

    loadCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 15,
      gap: 11,
    },

    summaryRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
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

    summaryHighlight: {
      color:
        '#6D5DFB',
      fontSize: 13,
      fontWeight:
        '800',
    },

    /*
    |--------------------------------------------------------------------------
    | METRICS
    |--------------------------------------------------------------------------
    */

    metricGrid: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      gap: 8,
    },

    metricCard: {
      width:
        '48.5%',
      backgroundColor:
        '#FFFFFF',
      borderRadius: 12,
      padding: 13,
    },

    metricLabel: {
      color:
        '#98A2B3',
      fontSize: 9,
    },

    metricValue: {
      fontSize: 19,
      fontWeight:
        '800',
      marginTop: 5,
    },

    metricGood: {
      color:
        '#168455',
    },

    metricDanger: {
      color:
        '#D92D20',
    },

    metricWarning: {
      color:
        '#B54708',
    },

    metricNeutral: {
      color:
        '#101D48',
    },

    /*
    |--------------------------------------------------------------------------
    | NIGHT TIMELINE
    |--------------------------------------------------------------------------
    */

    timelineSummaryCard: {
      backgroundColor:
        '#101D48',
      borderRadius: 15,
      padding: 15,
      marginBottom: 8,
    },

    timelineSummaryLabel: {
      color:
        '#AEB9DD',
      fontSize: 7,
      fontWeight:
        '800',
      letterSpacing: 1,
    },

    timelineAheadValue: {
      color:
        '#8EE1B4',
      fontSize: 20,
      fontWeight:
        '800',
      marginTop: 5,
    },

    timelineBehindValue: {
      color:
        '#FF9C92',
      fontSize: 20,
      fontWeight:
        '800',
      marginTop: 5,
    },

    timelineWaiting: {
      color:
        '#FFFFFF',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 5,
    },

    timelineSummarySub: {
      color:
        '#AEB9DD',
      fontSize: 8,
      marginTop: 4,
    },

    /*
    |--------------------------------------------------------------------------
    | SPLITTING
    |--------------------------------------------------------------------------
    */

    splittingCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 15,
      gap: 11,
    },

    /*
    |--------------------------------------------------------------------------
    | PERFORMANCE
    |--------------------------------------------------------------------------
    */

    performanceSummaryCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 15,
      marginBottom: 8,
    },

    performanceSummaryLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
      fontWeight:
        '700',
    },

    performanceSummaryValue: {
      fontSize: 20,
      fontWeight:
        '800',
      marginTop: 5,
    },

    /*
    |--------------------------------------------------------------------------
    | TASK RESULT
    |--------------------------------------------------------------------------
    */

    taskResultCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 13,
      padding: 13,
      marginBottom: 8,
    },

    taskResultHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    taskResultMain: {
      flex: 1,
      paddingRight: 10,
    },

    taskResultName: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    taskSplittingName: {
      color:
        '#6D5DFB',
      fontSize: 13,
      fontWeight:
        '800',
    },

    taskStaff: {
      color:
        '#667085',
      fontSize: 8,
      marginTop: 3,
    },

    taskStatusText: {
      color:
        '#98A2B3',
      fontSize: 8,
      marginTop: 3,
    },

    taskResultRight: {
      alignItems:
        'flex-end',
    },

    taskPerformanceText: {
      fontSize: 10,
      fontWeight:
        '800',
    },

    recordModeText: {
      color:
        '#98A2B3',
      fontSize: 7,
      marginTop: 3,
    },

    /*
    |--------------------------------------------------------------------------
    | TASK TIMELINE
    |--------------------------------------------------------------------------
    */

    taskTimelineBox: {
      backgroundColor:
        '#F8F9FB',
      borderRadius: 10,
      padding: 9,
      marginTop: 10,
    },

    taskTimeRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      paddingVertical: 3,
    },

    taskTimeLabel: {
      color:
        '#98A2B3',
      fontSize: 7,
    },

    taskTimeValue: {
      color:
        '#344054',
      fontSize: 8,
      fontWeight:
        '700',
    },

    taskTimelineResult: {
      borderRadius: 8,
      padding: 8,
      marginTop: 7,
    },

    taskTimelineAhead: {
      backgroundColor:
        '#E8F8EF',
    },

    taskTimelineBehind: {
      backgroundColor:
        '#FDECEC',
    },

    taskTimelineAheadText: {
      color:
        '#168455',
      textAlign:
        'center',
      fontSize: 9,
      fontWeight:
        '800',
    },

    taskTimelineBehindText: {
      color:
        '#D92D20',
      textAlign:
        'center',
      fontSize: 9,
      fontWeight:
        '800',
    },

    /*
    |--------------------------------------------------------------------------
    | COLOURS
    |--------------------------------------------------------------------------
    */

    positiveText: {
      color:
        '#168455',
    },

    negativeText: {
      color:
        '#D92D20',
    },

    neutralText: {
      color:
        '#667085',
      fontSize: 10,
      fontWeight:
        '700',
    },

    /*
    |--------------------------------------------------------------------------
    | EMPTY
    |--------------------------------------------------------------------------
    */

    emptyCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 18,
    },

    emptyTitle: {
      color:
        '#101828',
      fontSize: 14,
      fontWeight:
        '800',
    },

    emptyText: {
      color:
        '#667085',
      fontSize: 10,
      lineHeight: 16,
      marginTop: 4,
    },

    /*
    |--------------------------------------------------------------------------
    | SAVE
    |--------------------------------------------------------------------------
    */

    saveButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 14,
      paddingVertical: 15,
      alignItems:
        'center',
      marginTop: 22,
    },

    savedButton: {
      backgroundColor:
        '#168455',
    },

    saveButtonText: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '800',
    },
  });