import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    router,
    useFocusEffect,
} from 'expo-router';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    Alert,
    Modal,
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
};

type Allocation = {
  employeeId: string;
  taskName: string;
  minutes: number;
};

type SavedAllocations = Record<
  string,
  Allocation[]
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

  totalRequiredMinutes: number;

  splittingMinutes: number;
  otherOrganisingMinutes: number;

  aisleMinutes?: number;
  promoMinutes?: number;
  protectMinutes?: number;
};

type SavedLoads = Record<
  string,
  NightLoad
>;

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

type Task = {
  taskName: string;

  requiredMinutes: number;

  employeeIds: string[];

  allocatedLabourMinutes: number;
};

type PlannedTask = {
  taskName: string;

  plannedStartMinute: number;

  plannedFinishMinute: number;

  elapsedPlannedMinutes: number;

  allocatedLabourMinutes: number;

  staffCount: number;
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

  /*
   * 12 AM–4:59 AM still belongs
   * to the previous Nightfill.
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

/*
|--------------------------------------------------------------------------
| TIMER FORMAT
|--------------------------------------------------------------------------
*/

function formatTimer(
  totalSeconds: number
) {
  const safe =
    Math.max(
      Math.floor(
        totalSeconds
      ),
      0
    );

  const hours =
    Math.floor(
      safe / 3600
    );

  const minutes =
    Math.floor(
      (
        safe % 3600
      ) / 60
    );

  const seconds =
    safe % 60;

  return `${String(
    hours
  ).padStart(
    2,
    '0'
  )}:${String(
    minutes
  ).padStart(
    2,
    '0'
  )}:${String(
    seconds
  ).padStart(
    2,
    '0'
  )}`;
}

function formatDifference(
  differenceSeconds: number
) {
  const absoluteSeconds =
    Math.abs(
      differenceSeconds
    );

  const hours =
    Math.floor(
      absoluteSeconds /
        3600
    );

  const minutes =
    Math.floor(
      (
        absoluteSeconds %
        3600
      ) / 60
    );

  const seconds =
    absoluteSeconds %
    60;

  if (
    hours > 0
  ) {
    return `${hours}h ${minutes}m`;
  }

  if (
    minutes > 0
  ) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
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

/*
 * Continuous Nightfill clock:
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

function getCurrentNightMinutes() {
  const date =
    new Date();

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

function formatNightMinute(
  totalMinutes: number
) {
  let safe =
    Math.round(
      totalMinutes
    );

  safe =
    safe %
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
    hour12 = 12;
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

export default function LiveProgressScreen() {
  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  const [
    allocations,
    setAllocations,
  ] =
    useState<Allocation[]>([]);

  const [
    roster,
    setRoster,
  ] =
    useState<RosterEntry[]>([]);

  const [
    loadArrival,
    setLoadArrival,
  ] =
    useState<LoadArrivalRecord | null>(
      null
    );

  const [
    load,
    setLoad,
  ] =
    useState<NightLoad | null>(
      null
    );

  const [
    progress,
    setProgress,
  ] =
    useState<ProgressItem[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  /*
   * Updates every second for
   * live timer and timeline.
   */

  const [
    now,
    setNow,
  ] =
    useState(
      Date.now()
    );

  /*
|--------------------------------------------------------------------------
| MANUAL COMPLETE MODAL
|--------------------------------------------------------------------------
*/

  const [
    manualTask,
    setManualTask,
  ] =
    useState<Task | null>(
      null
    );

  const [
    manualResult,
    setManualResult,
  ] =
    useState<ManualResult>(
      null
    );

  const [
    manualHours,
    setManualHours,
  ] =
    useState('');

  const [
    manualMinutes,
    setManualMinutes,
  ] =
    useState('');

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

  /*
|--------------------------------------------------------------------------
| LIVE TIMER
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    const interval =
      setInterval(
        () => {
          setNow(
            Date.now()
          );
        },
        1000
      );

    return () => {
      clearInterval(
        interval
      );
    };
  }, []);

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

      const parsedEmployees:
        Employee[] =
        storedEmployees
          ? JSON.parse(
              storedEmployees
            )
          : [];

      setEmployees(
        parsedEmployees
      );

      /*
       * ALLOCATION
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

      setAllocations(
        parsedAllocations[
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

      setNow(
        Date.now()
      );
    } catch (error) {
      console.log(
        'LOAD LIVE PROGRESS ERROR:',
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
| EMPLOYEE
|--------------------------------------------------------------------------
*/

  function getEmployeeName(
    employeeId: string
  ) {
    return (
      employees.find(
        (employee) =>
          employee.id ===
          employeeId
      )?.name ||
      'Unknown'
    );
  }

  /*
|--------------------------------------------------------------------------
| REQUIRED TASK MINUTES
|--------------------------------------------------------------------------
*/

  function getRequiredMinutes(
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
| BUILD TASKS
|--------------------------------------------------------------------------
*/

  const tasks:
    Task[] =
    useMemo(() => {
      const taskMap =
        new Map<
          string,
          {
            employeeIds:
              string[];

            allocatedLabourMinutes:
              number;
          }
        >();

      allocations.forEach(
        (allocation) => {
          if (
            allocation.minutes <=
            0
          ) {
            return;
          }

          const existing =
            taskMap.get(
              allocation.taskName
            ) || {
              employeeIds:
                [],

              allocatedLabourMinutes:
                0,
            };

          if (
            !existing.employeeIds.includes(
              allocation.employeeId
            )
          ) {
            existing.employeeIds.push(
              allocation.employeeId
            );
          }

          existing.allocatedLabourMinutes +=
            allocation.minutes;

          taskMap.set(
            allocation.taskName,
            existing
          );
        }
      );

      return Array.from(
        taskMap.entries()
      )
        .map(
          ([
            taskName,
            info,
          ]) => ({
            taskName,

            employeeIds:
              info.employeeIds,

            allocatedLabourMinutes:
              info.allocatedLabourMinutes,

            requiredMinutes:
              getRequiredMinutes(
                taskName
              ),
          })
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
    }, [
      allocations,
      load,
    ]);

  /*
|--------------------------------------------------------------------------
| PLANNED TIMELINE
|--------------------------------------------------------------------------
|
| Important:
|
| Allocation minutes are labour-minutes.
|
| Example:
| Splitting = 240 labour minutes
| 4 people splitting together
|
| Elapsed planned time ~= 60 minutes.
|
| So for a shared task:
|
| elapsed time =
| allocated labour minutes / staff count
|
|--------------------------------------------------------------------------
*/

  const plannedTasks =
    useMemo(() => {
      const result =
        new Map<
          string,
          PlannedTask
        >();

      if (
        !loadArrival?.arrived ||
        !loadArrival.actualTime
      ) {
        return result;
      }

      const arrival =
        timeToNightMinutes(
          loadArrival.actualTime
        );

      if (
        arrival === null
      ) {
        return result;
      }

      /*
       * We use one operational
       * night timeline.
       *
       * Splitting normally starts
       * at load arrival.
       *
       * Then aisles / other tasks
       * follow in task order.
       */

      let cursor =
        arrival;

      tasks.forEach(
        (task) => {
          const staffCount =
            Math.max(
              task.employeeIds.length,
              1
            );

          /*
           * Use allocation labour
           * if available.
           *
           * Otherwise use required
           * task labour.
           */

          const labourMinutes =
            task.allocatedLabourMinutes >
            0
              ? task.allocatedLabourMinutes
              : task.requiredMinutes;

          /*
           * Shared task elapsed time.
           */

          const elapsedMinutes =
            Math.max(
              Math.ceil(
                labourMinutes /
                  staffCount
              ),
              1
            );

          /*
           * Some employees may start
           * after load arrival.
           *
           * Find latest start among
           * assigned employees.
           */

          const assignedRoster =
            roster.filter(
              (entry) =>
                task.employeeIds.includes(
                  entry.employeeId
                ) &&
                entry.status !==
                  'Sick' &&
                entry.status !==
                  'No Show'
            );

          let taskEarliestStart =
            cursor;

          if (
            assignedRoster.length >
            0
          ) {
            const starts =
              assignedRoster
                .map(
                  (entry) =>
                    entry.startTime
                      ? timeToNightMinutes(
                          entry.startTime
                        )
                      : null
                )
                .filter(
                  (
                    value
                  ): value is number =>
                    value !== null
                );

            if (
              starts.length >
              0
            ) {
              taskEarliestStart =
                Math.max(
                  cursor,
                  Math.min(
                    ...starts
                  )
                );
            }
          }

          const plannedStartMinute =
            taskEarliestStart;

          const plannedFinishMinute =
            plannedStartMinute +
            elapsedMinutes;

          result.set(
            task.taskName,
            {
              taskName:
                task.taskName,

              plannedStartMinute,

              plannedFinishMinute,

              elapsedPlannedMinutes:
                elapsedMinutes,

              allocatedLabourMinutes:
                labourMinutes,

              staffCount,
            }
          );

          /*
           * Next task begins after
           * previous planned task.
           */

          cursor =
            plannedFinishMinute;
        }
      );

      return result;
    }, [
      tasks,
      roster,
      loadArrival,
    ]);

  function getPlannedTask(
    taskName: string
  ) {
    return plannedTasks.get(
      taskName
    );
  }

  /*
|--------------------------------------------------------------------------
| PROGRESS HELPERS
|--------------------------------------------------------------------------
*/

  function getProgressItem(
    taskName: string
  ) {
    return progress.find(
      (item) =>
        item.taskName ===
        taskName
    );
  }

  function getStatus(
    taskName: string
  ): TaskStatus {
    return (
      getProgressItem(
        taskName
      )?.status ||
      'Not Started'
    );
  }

  function getActualSeconds(
    taskName: string
  ) {
    const item =
      getProgressItem(
        taskName
      );

    if (!item) {
      return 0;
    }

    if (
      item.status ===
        'Complete' &&
      item.actualSeconds !==
        null
    ) {
      return (
        item.actualSeconds
      );
    }

    if (
      item.status ===
        'In Progress' &&
      item.startedAt
    ) {
      const started =
        new Date(
          item.startedAt
        ).getTime();

      return Math.max(
        Math.floor(
          (
            now -
            started
          ) /
            1000
        ),
        0
      );
    }

    return 0;
  }

  /*
|--------------------------------------------------------------------------
| TIMELINE DIFFERENCE
|--------------------------------------------------------------------------
|
| Positive = ahead
| Negative = behind
|--------------------------------------------------------------------------
*/

  function getTimelineDifference(
    taskName: string
  ) {
    const planned =
      getPlannedTask(
        taskName
      );

    const item =
      getProgressItem(
        taskName
      );

    if (!planned) {
      return null;
    }

    /*
     * COMPLETE
     */

    if (
      item?.status ===
        'Complete' &&
      item.completedAt
    ) {
      const actualFinish =
        dateToNightMinutes(
          item.completedAt
        );

      return (
        planned.plannedFinishMinute -
        actualFinish
      );
    }

    /*
     * IN PROGRESS
     */

    if (
      item?.status ===
      'In Progress'
    ) {
      return (
        planned.plannedFinishMinute -
        getCurrentNightMinutes()
      );
    }

    return null;
  }

  /*
|--------------------------------------------------------------------------
| ACTUAL START DIFFERENCE
|--------------------------------------------------------------------------
*/

  function getStartDifference(
    taskName: string
  ) {
    const planned =
      getPlannedTask(
        taskName
      );

    const item =
      getProgressItem(
        taskName
      );

    if (
      !planned ||
      !item?.startedAt
    ) {
      return null;
    }

    const actualStart =
      dateToNightMinutes(
        item.startedAt
      );

    return (
      planned.plannedStartMinute -
      actualStart
    );
  }

  /*
|--------------------------------------------------------------------------
| SAVE PROGRESS
|--------------------------------------------------------------------------
*/

  async function saveProgress(
    next:
      ProgressItem[]
  ) {
    setProgress(
      next
    );

    try {
      const stored =
        await AsyncStorage.getItem(
          'groceryNightProgress'
        );

      const saved:
        SavedProgress =
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
        'groceryNightProgress',
        JSON.stringify(
          saved
        )
      );
    } catch (error) {
      console.log(
        'SAVE PROGRESS ERROR:',
        error
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| START TASK
|--------------------------------------------------------------------------
*/

  async function startTask(
    task: Task
  ) {
    const existing =
      getProgressItem(
        task.taskName
      );

    if (
      existing?.status ===
      'In Progress'
    ) {
      return;
    }

    if (
      existing?.status ===
      'Complete'
    ) {
      Alert.alert(
        'Task Already Complete',
        'Reset the task if you need to start it again.'
      );

      return;
    }

    const planned =
      getPlannedTask(
        task.taskName
      );

    const currentMinutes =
      getCurrentNightMinutes();

    /*
     * Inform manager if task
     * is starting early/late.
     */

    let timelineMessage =
      '';

    if (planned) {
      const difference =
        planned.plannedStartMinute -
        currentMinutes;

      if (
        difference > 0
      ) {
        timelineMessage =
          `\n\nStarting ${formatMinutes(
            difference
          )} earlier than planned.`;
      } else if (
        difference < 0
      ) {
        timelineMessage =
          `\n\nStarting ${formatMinutes(
            Math.abs(
              difference
            )
          )} later than planned.`;
      }
    }

    const begin =
      async () => {
        const newItem:
          ProgressItem = {
          taskName:
            task.taskName,

          status:
            'In Progress',

          requiredMinutes:
            task.requiredMinutes,

          startedAt:
            new Date().toISOString(),

          completedAt:
            null,

          actualSeconds:
            null,

          completionMode:
            null,

          manualResult:
            null,

          manualDifferenceMinutes:
            0,
        };

        const next =
          existing
            ? progress.map(
                (item) =>
                  item.taskName ===
                  task.taskName
                    ? newItem
                    : item
              )
            : [
                ...progress,
                newItem,
              ];

        setNow(
          Date.now()
        );

        await saveProgress(
          next
        );
      };

    if (
      timelineMessage
    ) {
      Alert.alert(
        `Start ${task.taskName}?`,
        `${
          planned
            ? `Planned: ${formatNightMinute(
                planned.plannedStartMinute
              )}`
            : ''
        }${timelineMessage}`,
        [
          {
            text:
              'Cancel',
            style:
              'cancel',
          },
          {
            text:
              'Start',
            onPress:
              begin,
          },
        ]
      );

      return;
    }

    await begin();
  }

  /*
|--------------------------------------------------------------------------
| COMPLETE TIMER TASK
|--------------------------------------------------------------------------
*/

  function completeTimedTask(
    task: Task
  ) {
    const existing =
      getProgressItem(
        task.taskName
      );

    if (
      !existing ||
      existing.status !==
        'In Progress' ||
      !existing.startedAt
    ) {
      Alert.alert(
        'Start Task First',
        `Start ${task.taskName} before using timed completion.`
      );

      return;
    }

    const startedAt =
      new Date(
        existing.startedAt
      ).getTime();

    const completedAt =
      Date.now();

    const actualSeconds =
      Math.max(
        Math.floor(
          (
            completedAt -
            startedAt
          ) /
            1000
        ),
        0
      );

    const requiredSeconds =
      task.requiredMinutes *
      60;

    const difference =
      requiredSeconds -
      actualSeconds;

    const resultText =
      difference > 0
        ? `${formatDifference(
            difference
          )} AHEAD`
        : difference < 0
          ? `${formatDifference(
              difference
            )} BEHIND`
          : 'Exactly on time';

    /*
     * Planned clock result.
     */

    const planned =
      getPlannedTask(
        task.taskName
      );

    let planText =
      '';

    if (planned) {
      const actualFinish =
        dateToNightMinutes(
          new Date(
            completedAt
          ).toISOString()
        );

      const planDifference =
        planned.plannedFinishMinute -
        actualFinish;

      planText =
        planDifference > 0
          ? `\nPlan: ${formatMinutes(
              planDifference
            )} ahead`
          : planDifference < 0
            ? `\nPlan: ${formatMinutes(
                Math.abs(
                  planDifference
                )
              )} behind`
            : '\nPlan: On time';
    }

    Alert.alert(
      `${task.taskName} Complete`,
      `Required: ${formatMinutes(
        task.requiredMinutes
      )}\nActual: ${formatTimer(
        actualSeconds
      )}\n\n${resultText}${planText}`,
      [
        {
          text:
            'Cancel',

          style:
            'cancel',
        },

        {
          text:
            'Complete',

          onPress:
            async () => {
              const completedItem:
                ProgressItem = {
                ...existing,

                status:
                  'Complete',

                requiredMinutes:
                  task.requiredMinutes,

                completedAt:
                  new Date(
                    completedAt
                  ).toISOString(),

                actualSeconds,

                completionMode:
                  'timer',

                manualResult:
                  null,

                manualDifferenceMinutes:
                  0,
              };

              const next =
                progress.map(
                  (item) =>
                    item.taskName ===
                    task.taskName
                      ? completedItem
                      : item
                );

              await saveProgress(
                next
              );
            },
        },
      ]
    );
  }

  /*
|--------------------------------------------------------------------------
| MANUAL COMPLETE
|--------------------------------------------------------------------------
*/

  function openManualComplete(
    task: Task
  ) {
    setManualTask(
      task
    );

    setManualResult(
      null
    );

    setManualHours(
      ''
    );

    setManualMinutes(
      ''
    );
  }

  function closeManualComplete() {
    setManualTask(
      null
    );

    setManualResult(
      null
    );

    setManualHours(
      ''
    );

    setManualMinutes(
      ''
    );
  }

  async function saveManualComplete() {
    if (
      !manualTask
    ) {
      return;
    }

    if (
      !manualResult
    ) {
      Alert.alert(
        'Choose Result',
        'Select On Time, Ahead, Behind or Just Complete.'
      );

      return;
    }

    const minutesPart =
      Number(
        manualMinutes
      ) || 0;

    if (
      minutesPart >= 60
    ) {
      Alert.alert(
        'Check Minutes',
        'Minutes must be between 0 and 59.'
      );

      return;
    }

    const manualDifferenceMinutes =
      (
        Number(
          manualHours
        ) || 0
      ) *
        60 +
      minutesPart;

    if (
      (
        manualResult ===
          'Ahead' ||
        manualResult ===
          'Behind'
      ) &&
      manualDifferenceMinutes ===
        0
    ) {
      Alert.alert(
        'Enter Difference',
        `Enter how far ${manualResult.toLowerCase()} the task finished.`
      );

      return;
    }

    const existing =
      getProgressItem(
        manualTask.taskName
      );

    const completedItem:
      ProgressItem = {
      taskName:
        manualTask.taskName,

      status:
        'Complete',

      requiredMinutes:
        manualTask.requiredMinutes,

      startedAt:
        existing?.startedAt ||
        null,

      completedAt:
        new Date().toISOString(),

      actualSeconds:
        null,

      completionMode:
        'manual',

      manualResult,

      manualDifferenceMinutes:
        manualResult ===
            'On Time' ||
        manualResult ===
            'Just Complete'
          ? 0
          : manualDifferenceMinutes,
    };

    const next =
      existing
        ? progress.map(
            (item) =>
              item.taskName ===
              manualTask.taskName
                ? completedItem
                : item
          )
        : [
            ...progress,
            completedItem,
          ];

    await saveProgress(
      next
    );

    closeManualComplete();
  }

  /*
|--------------------------------------------------------------------------
| RESET TASK
|--------------------------------------------------------------------------
*/

  function resetTask(
    taskName: string
  ) {
    Alert.alert(
      'Reset Task',
      `Reset ${taskName}? All saved progress for this task will be removed.`,
      [
        {
          text:
            'Cancel',

          style:
            'cancel',
        },

        {
          text:
            'Reset',

          style:
            'destructive',

          onPress:
            async () => {
              const next =
                progress.filter(
                  (item) =>
                    item.taskName !==
                    taskName
                );

              await saveProgress(
                next
              );
            },
        },
      ]
    );
  }

  /*
|--------------------------------------------------------------------------
| COUNTS
|--------------------------------------------------------------------------
*/

  const completedCount =
    tasks.filter(
      (task) =>
        getStatus(
          task.taskName
        ) ===
        'Complete'
    ).length;

  const inProgressCount =
    tasks.filter(
      (task) =>
        getStatus(
          task.taskName
        ) ===
        'In Progress'
    ).length;

  const notStartedCount =
    tasks.filter(
      (task) =>
        getStatus(
          task.taskName
        ) ===
        'Not Started'
    ).length;

  /*
|--------------------------------------------------------------------------
| OVERALL NIGHT POSITION
|--------------------------------------------------------------------------
*/

  const nightPosition =
    useMemo(() => {
      /*
       * First preference:
       * active task.
       */

      const active =
        tasks.find(
          (task) =>
            progress.find(
              (item) =>
                item.taskName ===
                  task.taskName &&
                item.status ===
                  'In Progress'
            )
        );

      if (active) {
        const planned =
          plannedTasks.get(
            active.taskName
          );

        if (planned) {
          const difference =
            planned.plannedFinishMinute -
            getCurrentNightMinutes();

          return {
            taskName:
              active.taskName,

            difference,

            source:
              'active',
          };
        }
      }

      /*
       * Otherwise latest completed
       * task by completedAt.
       */

      const completed =
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
          );

      const latest =
        completed[0];

      if (latest) {
        const planned =
          plannedTasks.get(
            latest.taskName
          );

        if (
          planned &&
          latest.completedAt
        ) {
          const actual =
            dateToNightMinutes(
              latest.completedAt
            );

          return {
            taskName:
              latest.taskName,

            difference:
              planned.plannedFinishMinute -
              actual,

            source:
              'completed',
          };
        }
      }

      return null;
    }, [
      tasks,
      progress,
      plannedTasks,
      now,
    ]);

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
          Loading live progress...
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
          REAL-TIME NIGHTFILL
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Live Progress
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
      >
        {/* LOAD ARRIVAL */}

        <TouchableOpacity
          style={[
            styles.loadArrivalCard,

            loadArrival?.arrived
              ? styles.loadReadyCard
              : styles.loadWaitingCard,
          ]}
          onPress={() =>
            router.push(
              '/load-arrival'
            )
          }
        >
          <View>
            <Text
              style={
                styles.loadArrivalLabel
              }
            >
              LOAD ARRIVAL
            </Text>

            <Text
              style={
                loadArrival?.arrived
                  ? styles.loadReadyText
                  : styles.loadWaitingText
              }
            >
              {loadArrival?.arrived &&
              loadArrival.actualTime
                ? `Arrived ${formatNightMinute(
                    timeToNightMinutes(
                      loadArrival.actualTime
                    ) || 0
                  )}`
                : 'Not recorded'}
            </Text>
          </View>

          <Text
            style={
              styles.manageText
            }
          >
            Manage ›
          </Text>
        </TouchableOpacity>

        {/* SUMMARY */}

        <View
          style={
            styles.summaryRow
          }
        >
          <View
            style={
              styles.summaryCard
            }
          >
            <Text
              style={
                styles.summaryLabel
              }
            >
              Complete
            </Text>

            <Text
              style={
                styles.completeValue
              }
            >
              {
                completedCount
              }
            </Text>
          </View>

          <View
            style={
              styles.summaryCard
            }
          >
            <Text
              style={
                styles.summaryLabel
              }
            >
              In Progress
            </Text>

            <Text
              style={
                styles.progressValue
              }
            >
              {
                inProgressCount
              }
            </Text>
          </View>

          <View
            style={
              styles.summaryCard
            }
          >
            <Text
              style={
                styles.summaryLabel
              }
            >
              Not Started
            </Text>

            <Text
              style={
                styles.pendingValue
              }
            >
              {
                notStartedCount
              }
            </Text>
          </View>
        </View>

        {/* NIGHT POSITION */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Night Position
        </Text>

        <View
          style={
            styles.nightPositionCard
          }
        >
          <Text
            style={
              styles.nightPositionLabel
            }
          >
            LIVE TIMELINE
          </Text>

          {!loadArrival?.arrived ? (
            <>
              <Text
                style={
                  styles.nightWaiting
                }
              >
                Waiting for Load
              </Text>

              <Text
                style={
                  styles.nightPositionSub
                }
              >
                Record actual arrival to activate planned timeline tracking.
              </Text>
            </>
          ) : nightPosition ? (
            <>
              <Text
                style={
                  nightPosition.difference >=
                  0
                    ? styles.nightAhead
                    : styles.nightBehind
                }
              >
                {nightPosition.difference >
                0
                  ? `${formatMinutes(
                      nightPosition.difference
                    )} AHEAD OF PLAN`
                  : nightPosition.difference <
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
                  styles.nightPositionSub
                }
              >
                {nightPosition.source ===
                'active'
                  ? `Current task: ${nightPosition.taskName}`
                  : `Latest completed: ${nightPosition.taskName}`}
              </Text>
            </>
          ) : (
            <>
              <Text
                style={
                  styles.nightWaiting
                }
              >
                Ready to Start
              </Text>

              <Text
                style={
                  styles.nightPositionSub
                }
              >
                Start the first task to begin live timeline tracking.
              </Text>
            </>
          )}
        </View>

        {/* TASKS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Tonight&apos;s Tasks
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
              No allocation yet
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Allocate tonight&apos;s team before using Live Progress.
            </Text>
          </View>
        ) : (
          tasks.map(
            (task) => {
              const progressItem =
                getProgressItem(
                  task.taskName
                );

              const status =
                getStatus(
                  task.taskName
                );

              const actualSeconds =
                getActualSeconds(
                  task.taskName
                );

              const requiredSeconds =
                task.requiredMinutes *
                60;

              const differenceSeconds =
                requiredSeconds -
                actualSeconds;

              const planned =
                getPlannedTask(
                  task.taskName
                );

              const timelineDifference =
                getTimelineDifference(
                  task.taskName
                );

              const startDifference =
                getStartDifference(
                  task.taskName
                );

              return (
                <View
                  key={
                    task.taskName
                  }
                  style={[
                    styles.taskCard,

                    status ===
                      'In Progress' &&
                      styles.runningCard,

                    status ===
                      'Complete' &&
                      styles.completeCard,
                  ]}
                >
                  {/* TASK HEADER */}

                  <View
                    style={
                      styles.taskHeader
                    }
                  >
                    <View
                      style={
                        styles.taskInfo
                      }
                    >
                      <Text
                        style={
                          task.taskName ===
                          'Splitting'
                            ? styles.splittingTitle
                            : styles.taskName
                        }
                      >
                        {
                          task.taskName
                        }
                      </Text>

                      <Text
                        style={
                          styles.assignedText
                        }
                      >
                        Assigned:{' '}
                        {task.employeeIds
                          .map(
                            getEmployeeName
                          )
                          .join(
                            ', '
                          )}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,

                        status ===
                          'Complete'
                          ? styles.statusComplete
                          : status ===
                              'In Progress'
                            ? styles.statusProgress
                            : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,

                          status ===
                            'Complete'
                            ? styles.statusCompleteText
                            : status ===
                                'In Progress'
                              ? styles.statusProgressText
                              : styles.statusPendingText,
                        ]}
                      >
                        {status}
                      </Text>
                    </View>
                  </View>

                  {/* PLANNED CLOCK */}

                  {planned && (
                    <View
                      style={
                        styles.plannedBox
                      }
                    >
                      <View>
                        <Text
                          style={
                            styles.plannedLabel
                          }
                        >
                          PLANNED CLOCK
                        </Text>

                        <Text
                          style={
                            styles.plannedTime
                          }
                        >
                          {formatNightMinute(
                            planned.plannedStartMinute
                          )}
                          {' → '}
                          {formatNightMinute(
                            planned.plannedFinishMinute
                          )}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.plannedRight
                        }
                      >
                        <Text
                          style={
                            styles.plannedDuration
                          }
                        >
                          {formatMinutes(
                            planned.elapsedPlannedMinutes
                          )}
                        </Text>

                        <Text
                          style={
                            styles.plannedStaff
                          }
                        >
                          {
                            planned.staffCount
                          }{' '}
                          staff ·{' '}
                          {formatMinutes(
                            planned.allocatedLabourMinutes
                          )}{' '}
                          labour
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* START POSITION */}

                  {status !==
                    'Not Started' &&
                    startDifference !==
                      null && (
                      <View
                        style={
                          styles.startPositionRow
                        }
                      >
                        <Text
                          style={
                            styles.startPositionLabel
                          }
                        >
                          Actual start
                        </Text>

                        <Text
                          style={
                            startDifference >=
                            0
                              ? styles.aheadText
                              : styles.behindText
                          }
                        >
                          {startDifference >
                          0
                            ? `${formatMinutes(
                                startDifference
                              )} early`
                            : startDifference <
                                0
                              ? `${formatMinutes(
                                  Math.abs(
                                    startDifference
                                  )
                                )} late`
                              : 'On planned start'}
                        </Text>
                      </View>
                    )}

                  {/* TIMER */}

                  <View
                    style={
                      styles.timeBox
                    }
                  >
                    <View
                      style={
                        styles.timeColumn
                      }
                    >
                      <Text
                        style={
                          styles.timeLabel
                        }
                      >
                        Required
                      </Text>

                      <Text
                        style={
                          styles.requiredTime
                        }
                      >
                        {formatMinutes(
                          task.requiredMinutes
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.timeDivider
                      }
                    />

                    <View
                      style={
                        styles.timeColumn
                      }
                    >
                      <Text
                        style={
                          styles.timeLabel
                        }
                      >
                        Timer
                      </Text>

                      <Text
                        style={
                          status ===
                          'In Progress'
                            ? styles.liveTimer
                            : styles.actualTime
                        }
                      >
                        {status ===
                          'Not Started' ||
                        (
                          status ===
                            'Complete' &&
                          progressItem
                            ?.completionMode ===
                            'manual'
                        )
                          ? '—'
                          : formatTimer(
                              actualSeconds
                            )}
                      </Text>
                    </View>
                  </View>

                  {/* CURRENT TIMER RESULT */}

                  {status ===
                    'In Progress' && (
                    <View
                      style={[
                        styles.resultBox,

                        differenceSeconds <
                        0
                          ? styles.behindBackground
                          : styles.aheadBackground,
                      ]}
                    >
                      <Text
                        style={[
                          styles.resultText,

                          differenceSeconds <
                          0
                            ? styles.behindText
                            : styles.aheadText,
                        ]}
                      >
                        {differenceSeconds <
                        0
                          ? `${formatDifference(
                              differenceSeconds
                            )} BEHIND TASK TIME`
                          : `${formatDifference(
                              differenceSeconds
                            )} TASK TIME REMAINING`}
                      </Text>
                    </View>
                  )}

                  {/* LIVE PLAN POSITION */}

                  {status ===
                    'In Progress' &&
                    timelineDifference !==
                      null && (
                      <View
                        style={[
                          styles.timelineResult,

                          timelineDifference >=
                          0
                            ? styles.timelineAhead
                            : styles.timelineBehind,
                        ]}
                      >
                        <Text
                          style={[
                            styles.timelineResultText,

                            timelineDifference >=
                            0
                              ? styles.aheadText
                              : styles.behindText,
                          ]}
                        >
                          {timelineDifference >
                          0
                            ? `${formatMinutes(
                                timelineDifference
                              )} UNTIL PLANNED FINISH`
                            : timelineDifference <
                                0
                              ? `${formatMinutes(
                                  Math.abs(
                                    timelineDifference
                                  )
                                )} PAST PLANNED FINISH`
                              : 'PLANNED FINISH NOW'}
                        </Text>

                        <Text
                          style={
                            styles.timelineSmall
                          }
                        >
                          Live clock compared with Team Plan
                        </Text>
                      </View>
                    )}

                  {/* COMPLETE TIMER RESULT */}

                  {status ===
                    'Complete' &&
                    progressItem &&
                    progressItem.completionMode ===
                      'timer' && (
                      <View
                        style={[
                          styles.resultBox,

                          differenceSeconds <
                          0
                            ? styles.behindBackground
                            : styles.aheadBackground,
                        ]}
                      >
                        <Text
                          style={[
                            styles.resultText,

                            differenceSeconds <
                            0
                              ? styles.behindText
                              : styles.aheadText,
                          ]}
                        >
                          {differenceSeconds >
                          0
                            ? `${formatDifference(
                                differenceSeconds
                              )} AHEAD`
                            : differenceSeconds <
                                0
                              ? `${formatDifference(
                                  differenceSeconds
                                )} BEHIND`
                              : 'ON TIME'}
                        </Text>

                        <Text
                          style={
                            styles.modeText
                          }
                        >
                          Timer recorded
                        </Text>
                      </View>
                    )}

                  {/* MANUAL RESULT */}

                  {status ===
                    'Complete' &&
                    progressItem &&
                    progressItem.completionMode ===
                      'manual' && (
                      <View
                        style={[
                          styles.resultBox,

                          progressItem.manualResult ===
                            'Behind'
                            ? styles.behindBackground
                            : styles.aheadBackground,
                        ]}
                      >
                        <Text
                          style={[
                            styles.resultText,

                            progressItem.manualResult ===
                              'Behind'
                              ? styles.behindText
                              : styles.aheadText,
                          ]}
                        >
                          {progressItem.manualResult ===
                            'Ahead'
                            ? `${formatMinutes(
                                progressItem.manualDifferenceMinutes
                              )} AHEAD`
                            : progressItem.manualResult ===
                                'Behind'
                              ? `${formatMinutes(
                                  progressItem.manualDifferenceMinutes
                                )} BEHIND`
                              : progressItem.manualResult ===
                                  'On Time'
                                ? 'ON TIME'
                                : 'COMPLETE'}
                        </Text>

                        <Text
                          style={
                            styles.modeText
                          }
                        >
                          Manually recorded
                        </Text>
                      </View>
                    )}

                  {/* COMPLETE CLOCK POSITION */}

                  {status ===
                    'Complete' &&
                    timelineDifference !==
                      null && (
                      <View
                        style={[
                          styles.timelineResult,

                          timelineDifference >=
                          0
                            ? styles.timelineAhead
                            : styles.timelineBehind,
                        ]}
                      >
                        <Text
                          style={[
                            styles.timelineResultText,

                            timelineDifference >=
                            0
                              ? styles.aheadText
                              : styles.behindText,
                          ]}
                        >
                          {timelineDifference >
                          0
                            ? `${formatMinutes(
                                timelineDifference
                              )} AHEAD OF PLAN`
                            : timelineDifference <
                                0
                              ? `${formatMinutes(
                                  Math.abs(
                                    timelineDifference
                                  )
                                )} BEHIND PLAN`
                              : 'FINISHED ON PLAN'}
                        </Text>

                        <Text
                          style={
                            styles.timelineSmall
                          }
                        >
                          Compared with planned clock finish
                        </Text>
                      </View>
                    )}

                  {/* BUTTONS */}

                  <View
                    style={
                      styles.buttonRow
                    }
                  >
                    {status ===
                      'Not Started' && (
                      <>
                        <TouchableOpacity
                          style={
                            styles.startButton
                          }
                          onPress={() =>
                            startTask(
                              task
                            )
                          }
                        >
                          <Text
                            style={
                              styles.startButtonText
                            }
                          >
                            ▶ Start Timer
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={
                            styles.manualButton
                          }
                          onPress={() =>
                            openManualComplete(
                              task
                            )
                          }
                        >
                          <Text
                            style={
                              styles.manualButtonText
                            }
                          >
                            ✓ Mark Complete
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {status ===
                      'In Progress' && (
                      <>
                        <TouchableOpacity
                          style={
                            styles.completeButton
                          }
                          onPress={() =>
                            completeTimedTask(
                              task
                            )
                          }
                        >
                          <Text
                            style={
                              styles.completeButtonText
                            }
                          >
                            ✓ Complete Timer
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={
                            styles.manualButton
                          }
                          onPress={() =>
                            openManualComplete(
                              task
                            )
                          }
                        >
                          <Text
                            style={
                              styles.manualButtonText
                            }
                          >
                            Manual Complete
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {status ===
                      'Complete' && (
                      <TouchableOpacity
                        style={
                          styles.resetButton
                        }
                        onPress={() =>
                          resetTask(
                            task.taskName
                          )
                        }
                      >
                        <Text
                          style={
                            styles.resetButtonText
                          }
                        >
                          Reset Task
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
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
              styles.teamPlanButtonText
            }
          >
            View Planned Timeline →
          </Text>
        </TouchableOpacity>

        {/* SUMMARY */}

        <TouchableOpacity
          style={
            styles.summaryButton
          }
          onPress={() =>
            router.push(
              '/night-summary'
            )
          }
        >
          <Text
            style={
              styles.summaryButtonText
            }
          >
            Open Night Summary →
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MANUAL COMPLETE MODAL */}

      <Modal
        visible={
          manualTask !== null
        }
        transparent
        animationType="slide"
        onRequestClose={
          closeManualComplete
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.modalCard
            }
          >
            <View
              style={
                styles.modalHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  Mark Complete
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  {
                    manualTask
                      ?.taskName
                  }
                </Text>
              </View>

              <TouchableOpacity
                onPress={
                  closeManualComplete
                }
              >
                <Text
                  style={
                    styles.closeText
                  }
                >
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={
                styles.modalInstruction
              }
            >
              How did this task finish?
            </Text>

            <View
              style={
                styles.resultOptions
              }
            >
              {(
                [
                  'On Time',
                  'Ahead',
                  'Behind',
                  'Just Complete',
                ] as ManualResult[]
              ).map(
                (result) => (
                  <TouchableOpacity
                    key={
                      result
                    }
                    style={[
                      styles.resultOption,

                      manualResult ===
                        result &&
                        styles.resultOptionSelected,
                    ]}
                    onPress={() =>
                      setManualResult(
                        result
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.resultOptionText,

                        manualResult ===
                          result &&
                          styles.resultOptionTextSelected,
                      ]}
                    >
                      {
                        result
                      }
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            {(
              manualResult ===
                'Ahead' ||
              manualResult ===
                'Behind'
            ) && (
              <>
                <Text
                  style={
                    styles.differenceTitle
                  }
                >
                  {manualResult} by
                </Text>

                <View
                  style={
                    styles.manualTimeRow
                  }
                >
                  <View
                    style={
                      styles.manualInputBox
                    }
                  >
                    <TextInput
                      value={
                        manualHours
                      }
                      onChangeText={
                        setManualHours
                      }
                      keyboardType="number-pad"
                      placeholder="0"
                      style={
                        styles.manualInput
                      }
                    />

                    <Text
                      style={
                        styles.inputSuffix
                      }
                    >
                      h
                    </Text>
                  </View>

                  <View
                    style={
                      styles.manualInputBox
                    }
                  >
                    <TextInput
                      value={
                        manualMinutes
                      }
                      onChangeText={
                        setManualMinutes
                      }
                      keyboardType="number-pad"
                      maxLength={
                        2
                      }
                      placeholder="0"
                      style={
                        styles.manualInput
                      }
                    />

                    <Text
                      style={
                        styles.inputSuffix
                      }
                    >
                      m
                    </Text>
                  </View>
                </View>
              </>
            )}

            <TouchableOpacity
              style={
                styles.saveManualButton
              }
              onPress={
                saveManualComplete
              }
            >
              <Text
                style={
                  styles.saveManualText
                }
              >
                Save Completion
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
      letterSpacing: 1.5,
      marginBottom: 4,
    },

    title: {
      color:
        '#FFFFFF',
      fontSize: 30,
      fontWeight:
        '800',
    },

    subtitle: {
      color:
        '#D5DBED',
      fontSize: 12,
      marginTop: 5,
    },

    content: {
      padding: 16,
      paddingBottom: 50,
    },

    loadArrivalCard: {
      borderRadius: 13,
      padding: 13,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      marginBottom: 10,
    },

    loadReadyCard: {
      backgroundColor:
        '#E8F8EF',
    },

    loadWaitingCard: {
      backgroundColor:
        '#FFF4E5',
    },

    loadArrivalLabel: {
      color:
        '#667085',
      fontSize: 7,
      fontWeight:
        '800',
    },

    loadReadyText: {
      color:
        '#168455',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 3,
    },

    loadWaitingText: {
      color:
        '#B54708',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 3,
    },

    manageText: {
      color:
        '#2436B2',
      fontSize: 9,
      fontWeight:
        '800',
    },

    summaryRow: {
      flexDirection:
        'row',
      gap: 8,
    },

    summaryCard: {
      flex: 1,
      backgroundColor:
        '#FFFFFF',
      borderRadius: 12,
      padding: 12,
    },

    summaryLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
    },

    completeValue: {
      color:
        '#168455',
      fontSize: 20,
      fontWeight:
        '800',
      marginTop: 5,
    },

    progressValue: {
      color:
        '#B54708',
      fontSize: 20,
      fontWeight:
        '800',
      marginTop: 5,
    },

    pendingValue: {
      color:
        '#667085',
      fontSize: 20,
      fontWeight:
        '800',
      marginTop: 5,
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

    nightPositionCard: {
      backgroundColor:
        '#101D48',
      borderRadius: 15,
      padding: 15,
    },

    nightPositionLabel: {
      color:
        '#AEB9DD',
      fontSize: 7,
      fontWeight:
        '800',
      letterSpacing: 1,
    },

    nightAhead: {
      color:
        '#8EE1B4',
      fontSize: 21,
      fontWeight:
        '800',
      marginTop: 5,
    },

    nightBehind: {
      color:
        '#FF9C92',
      fontSize: 21,
      fontWeight:
        '800',
      marginTop: 5,
    },

    nightWaiting: {
      color:
        '#FFFFFF',
      fontSize: 19,
      fontWeight:
        '800',
      marginTop: 5,
    },

    nightPositionSub: {
      color:
        '#AEB9DD',
      fontSize: 8,
      marginTop: 4,
    },

    taskCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 15,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor:
        '#FFFFFF',
    },

    runningCard: {
      borderColor:
        '#F5D7A5',
    },

    completeCard: {
      borderColor:
        '#CFE9D9',
    },

    taskHeader: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      justifyContent:
        'space-between',
    },

    taskInfo: {
      flex: 1,
      paddingRight: 10,
    },

    taskName: {
      color:
        '#101828',
      fontSize: 15,
      fontWeight:
        '800',
    },

    splittingTitle: {
      color:
        '#6D5DFB',
      fontSize: 15,
      fontWeight:
        '800',
    },

    assignedText: {
      color:
        '#667085',
      fontSize: 9,
      marginTop: 4,
      lineHeight: 14,
    },

    statusBadge: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },

    statusComplete: {
      backgroundColor:
        '#E8F8EF',
    },

    statusProgress: {
      backgroundColor:
        '#FFF4E5',
    },

    statusPending: {
      backgroundColor:
        '#F2F4F7',
    },

    statusText: {
      fontSize: 8,
      fontWeight:
        '800',
    },

    statusCompleteText: {
      color:
        '#168455',
    },

    statusProgressText: {
      color:
        '#B54708',
    },

    statusPendingText: {
      color:
        '#667085',
    },

    plannedBox: {
      backgroundColor:
        '#EEF0FF',
      borderRadius: 10,
      padding: 10,
      marginTop: 10,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    plannedLabel: {
      color:
        '#6670A8',
      fontSize: 6,
      fontWeight:
        '800',
    },

    plannedTime: {
      color:
        '#2436B2',
      fontSize: 11,
      fontWeight:
        '800',
      marginTop: 3,
    },

    plannedRight: {
      alignItems:
        'flex-end',
    },

    plannedDuration: {
      color:
        '#2436B2',
      fontSize: 10,
      fontWeight:
        '800',
    },

    plannedStaff: {
      color:
        '#6670A8',
      fontSize: 6,
      marginTop: 2,
    },

    startPositionRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      marginTop: 8,
      paddingHorizontal: 2,
    },

    startPositionLabel: {
      color:
        '#98A2B3',
      fontSize: 7,
    },

    timeBox: {
      flexDirection:
        'row',
      backgroundColor:
        '#F8F9FB',
      borderRadius: 12,
      padding: 12,
      marginTop: 13,
      alignItems:
        'center',
    },

    timeColumn: {
      flex: 1,
    },

    timeDivider: {
      width: 1,
      height: 34,
      backgroundColor:
        '#E4E7EC',
    },

    timeLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
    },

    requiredTime: {
      color:
        '#101D48',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 4,
    },

    actualTime: {
      color:
        '#101D48',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 4,
    },

    liveTimer: {
      color:
        '#B54708',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 4,
    },

    resultBox: {
      borderRadius: 9,
      padding: 9,
      marginTop: 8,
    },

    aheadBackground: {
      backgroundColor:
        '#E8F8EF',
    },

    behindBackground: {
      backgroundColor:
        '#FDECEC',
    },

    resultText: {
      textAlign:
        'center',
      fontSize: 10,
      fontWeight:
        '800',
    },

    aheadText: {
      color:
        '#168455',
      fontSize: 8,
      fontWeight:
        '800',
    },

    behindText: {
      color:
        '#D92D20',
      fontSize: 8,
      fontWeight:
        '800',
    },

    modeText: {
      color:
        '#667085',
      fontSize: 8,
      textAlign:
        'center',
      marginTop: 3,
    },

    timelineResult: {
      borderRadius: 9,
      padding: 9,
      marginTop: 8,
    },

    timelineAhead: {
      backgroundColor:
        '#E8F8EF',
    },

    timelineBehind: {
      backgroundColor:
        '#FDECEC',
    },

    timelineResultText: {
      textAlign:
        'center',
      fontSize: 10,
      fontWeight:
        '800',
    },

    timelineSmall: {
      color:
        '#667085',
      fontSize: 7,
      textAlign:
        'center',
      marginTop: 3,
    },

    buttonRow: {
      flexDirection:
        'row',
      gap: 7,
      marginTop: 12,
    },

    startButton: {
      flex: 1,
      backgroundColor:
        '#2436B2',
      borderRadius: 9,
      paddingVertical: 11,
      alignItems:
        'center',
    },

    startButtonText: {
      color:
        '#FFFFFF',
      fontSize: 9,
      fontWeight:
        '800',
    },

    completeButton: {
      flex: 1,
      backgroundColor:
        '#168455',
      borderRadius: 9,
      paddingVertical: 11,
      alignItems:
        'center',
    },

    completeButtonText: {
      color:
        '#FFFFFF',
      fontSize: 9,
      fontWeight:
        '800',
    },

    manualButton: {
      flex: 1,
      backgroundColor:
        '#E9ECFF',
      borderRadius: 9,
      paddingVertical: 11,
      alignItems:
        'center',
    },

    manualButtonText: {
      color:
        '#2436B2',
      fontSize: 9,
      fontWeight:
        '800',
    },

    resetButton: {
      flex: 1,
      backgroundColor:
        '#F2F4F7',
      borderRadius: 9,
      paddingVertical: 11,
      alignItems:
        'center',
    },

    resetButtonText: {
      color:
        '#667085',
      fontSize: 9,
      fontWeight:
        '800',
    },

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

    teamPlanButton: {
      backgroundColor:
        '#E9ECFF',
      borderRadius: 12,
      paddingVertical: 13,
      alignItems:
        'center',
      marginTop: 10,
    },

    teamPlanButtonText: {
      color:
        '#2436B2',
      fontSize: 10,
      fontWeight:
        '800',
    },

    summaryButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems:
        'center',
      marginTop: 8,
    },

    summaryButtonText: {
      color:
        '#FFFFFF',
      fontSize: 10,
      fontWeight:
        '800',
    },

    modalOverlay: {
      flex: 1,
      backgroundColor:
        'rgba(16,24,40,0.45)',
      justifyContent:
        'flex-end',
    },

    modalCard: {
      backgroundColor:
        '#FFFFFF',
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 20,
      paddingBottom: 35,
    },

    modalHeader: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'flex-start',
    },

    modalTitle: {
      color:
        '#101828',
      fontSize: 21,
      fontWeight:
        '800',
    },

    modalSubtitle: {
      color:
        '#667085',
      fontSize: 11,
      marginTop: 3,
    },

    closeText: {
      color:
        '#667085',
      fontSize: 27,
    },

    modalInstruction: {
      color:
        '#344054',
      fontSize: 12,
      fontWeight:
        '700',
      marginTop: 20,
      marginBottom: 9,
    },

    resultOptions: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      gap: 8,
    },

    resultOption: {
      width:
        '48.5%',
      backgroundColor:
        '#F2F4F7',
      borderRadius: 11,
      paddingVertical: 12,
      alignItems:
        'center',
      borderWidth: 1,
      borderColor:
        '#F2F4F7',
    },

    resultOptionSelected: {
      backgroundColor:
        '#E9ECFF',
      borderColor:
        '#6D5DFB',
    },

    resultOptionText: {
      color:
        '#667085',
      fontSize: 10,
      fontWeight:
        '800',
    },

    resultOptionTextSelected: {
      color:
        '#2436B2',
    },

    differenceTitle: {
      color:
        '#344054',
      fontSize: 11,
      fontWeight:
        '700',
      marginTop: 17,
      marginBottom: 8,
    },

    manualTimeRow: {
      flexDirection:
        'row',
      gap: 8,
    },

    manualInputBox: {
      flex: 1,
      backgroundColor:
        '#F2F4F7',
      borderRadius: 10,
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 10,
    },

    manualInput: {
      flex: 1,
      color:
        '#101D48',
      fontWeight:
        '800',
      textAlign:
        'center',
      paddingVertical: 11,
    },

    inputSuffix: {
      color:
        '#667085',
      fontSize: 9,
    },

    saveManualButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems:
        'center',
      marginTop: 20,
    },

    saveManualText: {
      color:
        '#FFFFFF',
      fontSize: 12,
      fontWeight:
        '800',
    },
  });