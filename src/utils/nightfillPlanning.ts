/*
|--------------------------------------------------------------------------
| NIGHTFILL PLANNING ENGINE
|--------------------------------------------------------------------------
|
| Single source of truth for:
|
| - Nightfill date
| - Date keys
| - Overnight clock handling
| - Shift duration
| - Pre-load labour
| - Post-load labour
| - Real labour shortage / surplus
| - Employee task timeline
| - Team task timeline
| - Task ordering
|
|--------------------------------------------------------------------------
*/

export type ShiftStatus =
  | 'Working'
  | 'Sick'
  | 'Late'
  | 'Left Early'
  | 'No Show'
  | 'Called In';

export type PlanningRosterEntry = {
  employeeId: string;

  hours?: string;

  startTime?: string;

  finishTime?: string;

  status: ShiftStatus;

  isExtra?: boolean;
};

export type PlanningAllocation = {
  employeeId: string;

  taskName: string;

  minutes: number;
};

export type PlannedEmployeeTask = {
  employeeId: string;

  taskName: string;

  minutes: number;

  plannedStartMinute: number;

  plannedFinishMinute: number;

  overrunMinutes: number;
};

export type EmployeeNightPlan = {
  employeeId: string;

  shiftStartMinute: number;

  shiftFinishMinute: number;

  loadWorkStartMinute: number;

  fullShiftMinutes: number;

  preLoadMinutes: number;

  availableAfterLoadMinutes: number;

  allocatedMinutes: number;

  remainingMinutes: number;

  overrunMinutes: number;

  tasks: PlannedEmployeeTask[];
};

export type TeamTaskPlan = {
  taskName: string;

  employeeIds: string[];

  staffCount: number;

  allocatedLabourMinutes: number;

  plannedStartMinute: number;

  plannedFinishMinute: number;

  elapsedMinutes: number;
};

export type LabourPosition = {
  fullRosterMinutes: number;

  preLoadMinutes: number;

  postArrivalMinutes: number;

  requiredMinutes: number;

  differenceMinutes: number;

  shortageMinutes: number;

  surplusMinutes: number;

  coveragePercent: number;
};

export type ShiftWindow = {
  startMinute: number;

  finishMinute: number;

  durationMinutes: number;

  usedLegacyHours: boolean;
};

/*
|--------------------------------------------------------------------------
| NIGHTFILL DATE
|--------------------------------------------------------------------------
*/

export const NIGHTFILL_START_HOUR =
  17;

export const NIGHTFILL_END_HOUR =
  5;

export const DEFAULT_NIGHTFILL_START =
  '17:00';

export function getNightfillDate(
  sourceDate: Date =
    new Date()
) {
  const date =
    new Date(
      sourceDate
    );

  /*
   * 12 AM → 4:59 AM belongs
   * to the previous Nightfill.
   */

  if (
    date.getHours() <
    NIGHTFILL_END_HOUR
  ) {
    date.setDate(
      date.getDate() - 1
    );
  }

  return date;
}

export function getDateKey(
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

export function getNightfillDateKey(
  sourceDate: Date =
    new Date()
) {
  return getDateKey(
    getNightfillDate(
      sourceDate
    )
  );
}

export function getNightfillDayName(
  sourceDate: Date =
    new Date()
) {
  const date =
    getNightfillDate(
      sourceDate
    );

  return date.toLocaleDateString(
    'en-AU',
    {
      weekday:
        'long',
    }
  );
}

/*
|--------------------------------------------------------------------------
| CLOCK NORMALISATION
|--------------------------------------------------------------------------
*/

export function normaliseTime(
  value?: string | null
) {
  if (!value) {
    return '';
  }

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
|--------------------------------------------------------------------------
| NIGHTFILL MINUTE CLOCK
|--------------------------------------------------------------------------
|
| Normal clock:
|
| 17:00 = 1020
| 23:00 = 1380
|
| Overnight:
|
| 00:00 = 1440
| 01:00 = 1500
| 04:59 = 1739
|
|--------------------------------------------------------------------------
*/

export function timeToNightMinutes(
  value?: string | null
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
    hour <
    NIGHTFILL_END_HOUR
  ) {
    total +=
      24 * 60;
  }

  return total;
}

export function dateToNightMinutes(
  value:
    | string
    | Date
    | null
    | undefined
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
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
    date.getHours() <
    NIGHTFILL_END_HOUR
  ) {
    total +=
      24 * 60;
  }

  return total;
}

export function getCurrentNightMinutes() {
  return (
    dateToNightMinutes(
      new Date()
    ) || 0
  );
}

/*
|--------------------------------------------------------------------------
| FORMAT CLOCK
|--------------------------------------------------------------------------
*/

export function formatNightMinute(
  totalMinutes: number
) {
  let minutes =
    Math.round(
      totalMinutes
    );

  minutes =
    minutes %
    (24 * 60);

  if (
    minutes < 0
  ) {
    minutes +=
      24 * 60;
  }

  const hour24 =
    Math.floor(
      minutes / 60
    );

  const minute =
    minutes % 60;

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

export function formatClock(
  value?:
    | string
    | null
) {
  const minute =
    timeToNightMinutes(
      value
    );

  if (
    minute === null
  ) {
    return '—';
  }

  return formatNightMinute(
    minute
  );
}

/*
|--------------------------------------------------------------------------
| FORMAT DURATION
|--------------------------------------------------------------------------
*/

export function formatMinutes(
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

export function formatSignedMinutes(
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
| SHIFT WINDOW
|--------------------------------------------------------------------------
*/

export function getShiftWindow(
  entry: PlanningRosterEntry
): ShiftWindow {
  const start =
    timeToNightMinutes(
      entry.startTime
    );

  let finish =
    timeToNightMinutes(
      entry.finishTime
    );

  /*
   * Modern roster:
   * start + finish present.
   */

  if (
    start !== null &&
    finish !== null
  ) {
    if (
      finish <=
      start
    ) {
      finish +=
        24 * 60;
    }

    return {
      startMinute:
        start,

      finishMinute:
        finish,

      durationMinutes:
        Math.max(
          finish -
            start,
          0
        ),

      usedLegacyHours:
        false,
    };
  }

  /*
   * Legacy fallback.
   *
   * Older versions only had
   * total hours.
   */

  const hours =
    Math.max(
      Number(
        entry.hours
      ) || 0,
      0
    );

  const legacyStart =
    NIGHTFILL_START_HOUR *
    60;

  const legacyDuration =
    Math.round(
      hours * 60
    );

  return {
    startMinute:
      legacyStart,

    finishMinute:
      legacyStart +
      legacyDuration,

    durationMinutes:
      legacyDuration,

    usedLegacyHours:
      true,
  };
}

export function calculateShiftMinutes(
  entry: PlanningRosterEntry
) {
  return getShiftWindow(
    entry
  ).durationMinutes;
}

/*
|--------------------------------------------------------------------------
| ACTIVE EMPLOYEE
|--------------------------------------------------------------------------
*/

export function isActiveRosterEntry(
  entry: PlanningRosterEntry
) {
  return (
    entry.status !==
      'Sick' &&
    entry.status !==
      'No Show'
  );
}

/*
|--------------------------------------------------------------------------
| PRE-LOAD LABOUR
|--------------------------------------------------------------------------
*/

export function calculatePreLoadMinutes(
  entry: PlanningRosterEntry,
  loadArrivalTime?:
    | string
    | null
) {
  if (
    !loadArrivalTime
  ) {
    return 0;
  }

  const window =
    getShiftWindow(
      entry
    );

  const arrival =
    timeToNightMinutes(
      loadArrivalTime
    );

  if (
    arrival === null
  ) {
    return 0;
  }

  /*
   * Employee starts after
   * load arrived.
   */

  if (
    window.startMinute >=
    arrival
  ) {
    return 0;
  }

  const end =
    Math.min(
      window.finishMinute,
      arrival
    );

  return Math.max(
    end -
      window.startMinute,
    0
  );
}

/*
|--------------------------------------------------------------------------
| AVAILABLE AFTER LOAD
|--------------------------------------------------------------------------
*/

export function calculateAvailableAfterLoad(
  entry: PlanningRosterEntry,
  loadArrivalTime?:
    | string
    | null
) {
  const window =
    getShiftWindow(
      entry
    );

  /*
   * Load not recorded yet:
   * entire roster remains
   * projected capacity.
   */

  if (
    !loadArrivalTime
  ) {
    return (
      window.durationMinutes
    );
  }

  const arrival =
    timeToNightMinutes(
      loadArrivalTime
    );

  if (
    arrival === null
  ) {
    return (
      window.durationMinutes
    );
  }

  /*
   * Employee finished before
   * load arrived.
   */

  if (
    window.finishMinute <=
    arrival
  ) {
    return 0;
  }

  const usableStart =
    Math.max(
      window.startMinute,
      arrival
    );

  return Math.max(
    window.finishMinute -
      usableStart,
    0
  );
}

/*
|--------------------------------------------------------------------------
| REAL LABOUR POSITION
|--------------------------------------------------------------------------
*/

export function calculateLabourPosition(
  roster:
    PlanningRosterEntry[],
  requiredMinutes: number,
  loadArrivalTime?:
    | string
    | null
): LabourPosition {
  const active =
    roster.filter(
      isActiveRosterEntry
    );

  const fullRosterMinutes =
    active.reduce(
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

  const preLoadMinutes =
    loadArrivalTime
      ? active.reduce(
          (
            total,
            entry
          ) =>
            total +
            calculatePreLoadMinutes(
              entry,
              loadArrivalTime
            ),
          0
        )
      : 0;

  const postArrivalMinutes =
    active.reduce(
      (
        total,
        entry
      ) =>
        total +
        calculateAvailableAfterLoad(
          entry,
          loadArrivalTime
        ),
      0
    );

  const differenceMinutes =
    postArrivalMinutes -
    requiredMinutes;

  const shortageMinutes =
    Math.max(
      -differenceMinutes,
      0
    );

  const surplusMinutes =
    Math.max(
      differenceMinutes,
      0
    );

  const coveragePercent =
    requiredMinutes >
    0
      ? Math.round(
          (
            postArrivalMinutes /
            requiredMinutes
          ) *
            100
        )
      : 100;

  return {
    fullRosterMinutes,

    preLoadMinutes,

    postArrivalMinutes,

    requiredMinutes,

    differenceMinutes,

    shortageMinutes,

    surplusMinutes,

    coveragePercent,
  };
}

/*
|--------------------------------------------------------------------------
| TASK ORDER
|--------------------------------------------------------------------------
*/

export function getTaskOrder(
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
    const aisle =
      Number(
        taskName.replace(
          'Aisle ',
          ''
        )
      );

    return Number.isNaN(
      aisle
    )
      ? 50
      : aisle;
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
| BUILD EMPLOYEE PLANS
|--------------------------------------------------------------------------
|
| This is now the central planning
| algorithm used by:
|
| - Allocation
| - Team Plan
| - Live Progress
| - Night Summary
|
|--------------------------------------------------------------------------
*/

export function buildEmployeePlans(
  roster:
    PlanningRosterEntry[],
  allocations:
    PlanningAllocation[],
  loadArrivalTime?:
    | string
    | null
): EmployeeNightPlan[] {
  const activeRoster =
    roster.filter(
      isActiveRosterEntry
    );

  const arrival =
    loadArrivalTime
      ? timeToNightMinutes(
          loadArrivalTime
        )
      : null;

  return activeRoster.map(
    (
      entry
    ): EmployeeNightPlan => {
      const window =
        getShiftWindow(
          entry
        );

      const loadWorkStartMinute =
        arrival === null
          ? window.startMinute
          : Math.max(
              window.startMinute,
              arrival
            );

      const preLoadMinutes =
        arrival === null
          ? 0
          : calculatePreLoadMinutes(
              entry,
              loadArrivalTime
            );

      const availableAfterLoadMinutes =
        arrival === null
          ? window.durationMinutes
          : Math.max(
              window.finishMinute -
                loadWorkStartMinute,
              0
            );

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

      let cursor =
        loadWorkStartMinute;

      const tasks:
        PlannedEmployeeTask[] =
        employeeAllocations.map(
          (
            allocation
          ) => {
            const start =
              cursor;

            const finish =
              start +
              allocation.minutes;

            const overrunMinutes =
              Math.max(
                finish -
                  window.finishMinute,
                0
              );

            cursor =
              finish;

            return {
              employeeId:
                entry.employeeId,

              taskName:
                allocation.taskName,

              minutes:
                allocation.minutes,

              plannedStartMinute:
                start,

              plannedFinishMinute:
                finish,

              overrunMinutes,
            };
          }
        );

      const allocatedMinutes =
        employeeAllocations.reduce(
          (
            total,
            allocation
          ) =>
            total +
            allocation.minutes,
          0
        );

      const remainingMinutes =
        Math.max(
          availableAfterLoadMinutes -
            allocatedMinutes,
          0
        );

      const overrunMinutes =
        Math.max(
          allocatedMinutes -
            availableAfterLoadMinutes,
          0
        );

      return {
        employeeId:
          entry.employeeId,

        shiftStartMinute:
          window.startMinute,

        shiftFinishMinute:
          window.finishMinute,

        loadWorkStartMinute,

        fullShiftMinutes:
          window.durationMinutes,

        preLoadMinutes,

        availableAfterLoadMinutes,

        allocatedMinutes,

        remainingMinutes,

        overrunMinutes,

        tasks,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| BUILD TEAM TASK PLANS
|--------------------------------------------------------------------------
|
| Example:
|
| Fahad:
| Splitting 8:00 → 9:00
|
| Abdullah:
| Splitting 8:00 → 9:00
|
| Team Splitting:
| 8:00 → 9:00
| 2 staff
| 2 labour hours
|
| This correctly separates
| LABOUR TIME from ELAPSED TIME.
|
|--------------------------------------------------------------------------
*/

export function buildTeamTaskPlans(
  employeePlans:
    EmployeeNightPlan[]
): TeamTaskPlan[] {
  const taskNames =
    Array.from(
      new Set(
        employeePlans.flatMap(
          (plan) =>
            plan.tasks.map(
              (task) =>
                task.taskName
            )
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
    );

  return taskNames
    .map(
      (
        taskName
      ): TeamTaskPlan | null => {
        const assignments =
          employeePlans.flatMap(
            (plan) =>
              plan.tasks.filter(
                (task) =>
                  task.taskName ===
                  taskName
              )
          );

        if (
          assignments.length ===
          0
        ) {
          return null;
        }

        const employeeIds =
          Array.from(
            new Set(
              assignments.map(
                (assignment) =>
                  assignment.employeeId
              )
            )
          );

        const plannedStartMinute =
          Math.min(
            ...assignments.map(
              (assignment) =>
                assignment.plannedStartMinute
            )
          );

        const plannedFinishMinute =
          Math.max(
            ...assignments.map(
              (assignment) =>
                assignment.plannedFinishMinute
            )
          );

        const allocatedLabourMinutes =
          assignments.reduce(
            (
              total,
              assignment
            ) =>
              total +
              assignment.minutes,
            0
          );

        return {
          taskName,

          employeeIds,

          staffCount:
            employeeIds.length,

          allocatedLabourMinutes,

          plannedStartMinute,

          plannedFinishMinute,

          elapsedMinutes:
            Math.max(
              plannedFinishMinute -
                plannedStartMinute,
              0
            ),
        };
      }
    )
    .filter(
      (
        value
      ): value is TeamTaskPlan =>
        value !== null
    );
}

/*
|--------------------------------------------------------------------------
| FIND EMPLOYEE PLAN
|--------------------------------------------------------------------------
*/

export function getEmployeePlan(
  employeePlans:
    EmployeeNightPlan[],
  employeeId: string
) {
  return (
    employeePlans.find(
      (plan) =>
        plan.employeeId ===
        employeeId
    ) || null
  );
}

/*
|--------------------------------------------------------------------------
| FIND TEAM TASK PLAN
|--------------------------------------------------------------------------
*/

export function getTeamTaskPlan(
  taskPlans:
    TeamTaskPlan[],
  taskName: string
) {
  return (
    taskPlans.find(
      (plan) =>
        plan.taskName ===
        taskName
    ) || null
  );
}

/*
|--------------------------------------------------------------------------
| ALLOCATED MINUTES
|--------------------------------------------------------------------------
*/

export function getEmployeeAllocatedMinutes(
  allocations:
    PlanningAllocation[],
  employeeId: string
) {
  return allocations
    .filter(
      (allocation) =>
        allocation.employeeId ===
        employeeId
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
}

export function getTaskAllocatedMinutes(
  allocations:
    PlanningAllocation[],
  taskName: string
) {
  return allocations
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
}

/*
|--------------------------------------------------------------------------
| PLAN DIFFERENCE
|--------------------------------------------------------------------------
|
| Positive:
| ahead of plan
|
| Negative:
| behind plan
|
|--------------------------------------------------------------------------
*/

export function calculatePlanDifference(
  plannedFinishMinute:
    number,
  actualFinish:
    | string
    | Date
) {
  const actual =
    dateToNightMinutes(
      actualFinish
    );

  if (
    actual === null
  ) {
    return null;
  }

  return (
    plannedFinishMinute -
    actual
  );
}

/*
|--------------------------------------------------------------------------
| LOAD ARRIVAL DIFFERENCE
|--------------------------------------------------------------------------
|
| Positive:
| load late
|
| Negative:
| load early
|
|--------------------------------------------------------------------------
*/

export function calculateArrivalDifference(
  expectedTime?:
    | string
    | null,
  actualTime?:
    | string
    | null
) {
  if (
    !expectedTime ||
    !actualTime
  ) {
    return null;
  }

  const expected =
    timeToNightMinutes(
      expectedTime
    );

  const actual =
    timeToNightMinutes(
      actualTime
    );

  if (
    expected === null ||
    actual === null
  ) {
    return null;
  }

  return (
    actual -
    expected
  );
}