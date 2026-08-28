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
  /**
   * Total break minutes reserved from productive Nightfill labour.
   * The rostered shift itself remains unchanged.
   */
  breakMinutes?: number;
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
  productiveFinishMinute: number;
  loadWorkStartMinute: number;
  fullShiftMinutes: number;
  breakMinutes: number;
  productiveShiftMinutes: number;
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
  /** Gross rostered shift minutes before break deductions. */
  fullRosterMinutes: number;
  /** Break minutes reserved from productive labour. */
  breakMinutes: number;
  /** Gross roster minus break deductions. */
  productiveRosterMinutes: number;
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
  productiveFinishMinute: number;
  durationMinutes: number;
  breakMinutes: number;
  productiveMinutes: number;
  usedLegacyHours: boolean;
};

export const NIGHTFILL_START_HOUR = 17;
export const NIGHTFILL_END_HOUR = 5;
export const DEFAULT_NIGHTFILL_START = '17:00';

export function getNightfillDate(
  sourceDate: Date = new Date()
) {
  const date = new Date(sourceDate);

  if (date.getHours() < NIGHTFILL_END_HOUR) {
    date.setDate(date.getDate() - 1);
  }

  return date;
}

export function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNightfillDateKey(
  sourceDate: Date = new Date()
) {
  return getDateKey(getNightfillDate(sourceDate));
}

export function getNightfillDayName(
  sourceDate: Date = new Date()
) {
  return getNightfillDate(sourceDate).toLocaleDateString(
    'en-AU',
    { weekday: 'long' }
  );
}

export function normaliseTime(
  value?: string | null
) {
  if (!value) return '';

  const text = value.trim();
  if (!text) return '';

  const parts = text.split(':');
  const hour = Number(parts[0]);
  const minute =
    parts.length > 1
      ? Number(parts[1])
      : 0;

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return '';
  }

  return `${String(hour).padStart(2, '0')}:${String(
    minute
  ).padStart(2, '0')}`;
}

export function timeToNightMinutes(
  value?: string | null
) {
  const time = normaliseTime(value);
  if (!time) return null;

  const [hour, minute] = time.split(':').map(Number);
  let total = hour * 60 + minute;

  if (hour < NIGHTFILL_END_HOUR) {
    total += 24 * 60;
  }

  return total;
}

export function dateToNightMinutes(
  value: string | Date | null | undefined
) {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  let total =
    date.getHours() * 60 +
    date.getMinutes();

  if (date.getHours() < NIGHTFILL_END_HOUR) {
    total += 24 * 60;
  }

  return total;
}

export function getCurrentNightMinutes() {
  return dateToNightMinutes(new Date()) || 0;
}

export function formatNightMinute(
  totalMinutes: number
) {
  let minutes = Math.round(totalMinutes) % (24 * 60);
  if (minutes < 0) minutes += 24 * 60;

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatClock(
  value?: string | null
) {
  const minute = timeToNightMinutes(value);
  return minute === null
    ? '—'
    : formatNightMinute(minute);
}

export function formatMinutes(
  totalMinutes: number
) {
  const safe = Math.max(
    Math.round(totalMinutes || 0),
    0
  );
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatSignedMinutes(
  minutes: number
) {
  if (minutes > 0) {
    return `+${formatMinutes(minutes)}`;
  }
  if (minutes < 0) {
    return `-${formatMinutes(Math.abs(minutes))}`;
  }
  return '0m';
}

function clampBreakMinutes(
  requested: number | undefined,
  durationMinutes: number
) {
  return Math.min(
    Math.max(
      Math.round(requested || 0),
      0
    ),
    Math.max(durationMinutes, 0)
  );
}

export function getShiftWindow(
  entry: PlanningRosterEntry
): ShiftWindow {
  const start = timeToNightMinutes(
    entry.startTime
  );
  let finish = timeToNightMinutes(
    entry.finishTime
  );

  if (start !== null && finish !== null) {
    if (finish <= start) {
      finish += 24 * 60;
    }

    const durationMinutes = Math.max(
      finish - start,
      0
    );
    const breakMinutes = clampBreakMinutes(
      entry.breakMinutes,
      durationMinutes
    );
    const productiveMinutes = Math.max(
      durationMinutes - breakMinutes,
      0
    );

    return {
      startMinute: start,
      finishMinute: finish,
      productiveFinishMinute:
        Math.max(
          finish - breakMinutes,
          start
        ),
      durationMinutes,
      breakMinutes,
      productiveMinutes,
      usedLegacyHours: false,
    };
  }

  const hours = Math.max(
    Number(entry.hours) || 0,
    0
  );
  const legacyStart =
    NIGHTFILL_START_HOUR * 60;
  const durationMinutes = Math.round(
    hours * 60
  );
  const breakMinutes = clampBreakMinutes(
    entry.breakMinutes,
    durationMinutes
  );
  const productiveMinutes = Math.max(
    durationMinutes - breakMinutes,
    0
  );
  const finishMinute =
    legacyStart + durationMinutes;

  return {
    startMinute: legacyStart,
    finishMinute,
    productiveFinishMinute:
      Math.max(
        finishMinute - breakMinutes,
        legacyStart
      ),
    durationMinutes,
    breakMinutes,
    productiveMinutes,
    usedLegacyHours: true,
  };
}

/** Gross rostered shift duration. */
export function calculateShiftMinutes(
  entry: PlanningRosterEntry
) {
  return getShiftWindow(entry).durationMinutes;
}

export function calculateBreakMinutes(
  entry: PlanningRosterEntry
) {
  return getShiftWindow(entry).breakMinutes;
}

export function calculateProductiveShiftMinutes(
  entry: PlanningRosterEntry
) {
  return getShiftWindow(entry).productiveMinutes;
}

export function isActiveRosterEntry(
  entry: PlanningRosterEntry
) {
  return (
    entry.status !== 'Sick' &&
    entry.status !== 'No Show'
  );
}

export function calculatePreLoadMinutes(
  entry: PlanningRosterEntry,
  loadArrivalTime?: string | null
) {
  if (!loadArrivalTime) return 0;

  const window = getShiftWindow(entry);
  const arrival = timeToNightMinutes(
    loadArrivalTime
  );

  if (arrival === null) return 0;
  if (window.startMinute >= arrival) return 0;

  const end = Math.min(
    window.finishMinute,
    arrival
  );

  return Math.max(
    end - window.startMinute,
    0
  );
}

/**
 * Productive labour available for load work.
 * Break minutes are reserved from this capacity. Until exact break clock
 * times are recorded, the planner conservatively reserves the full
 * qualifying break allowance from the load-working window.
 */
export function calculateAvailableAfterLoad(
  entry: PlanningRosterEntry,
  loadArrivalTime?: string | null
) {
  const window = getShiftWindow(entry);

  if (!loadArrivalTime) {
    return window.productiveMinutes;
  }

  const arrival = timeToNightMinutes(
    loadArrivalTime
  );

  if (arrival === null) {
    return window.productiveMinutes;
  }

  if (window.finishMinute <= arrival) {
    return 0;
  }

  const usableStart = Math.max(
    window.startMinute,
    arrival
  );
  const grossAvailable = Math.max(
    window.finishMinute - usableStart,
    0
  );

  return Math.max(
    grossAvailable - window.breakMinutes,
    0
  );
}

export function calculateLabourPosition(
  roster: PlanningRosterEntry[],
  requiredMinutes: number,
  loadArrivalTime?: string | null
): LabourPosition {
  const active = roster.filter(
    isActiveRosterEntry
  );

  const fullRosterMinutes = active.reduce(
    (total, entry) =>
      total + calculateShiftMinutes(entry),
    0
  );

  const breakMinutes = active.reduce(
    (total, entry) =>
      total + calculateBreakMinutes(entry),
    0
  );

  const productiveRosterMinutes = active.reduce(
    (total, entry) =>
      total + calculateProductiveShiftMinutes(entry),
    0
  );

  const preLoadMinutes = loadArrivalTime
    ? active.reduce(
        (total, entry) =>
          total +
          calculatePreLoadMinutes(
            entry,
            loadArrivalTime
          ),
        0
      )
    : 0;

  const postArrivalMinutes = active.reduce(
    (total, entry) =>
      total +
      calculateAvailableAfterLoad(
        entry,
        loadArrivalTime
      ),
    0
  );

  const differenceMinutes =
    postArrivalMinutes - requiredMinutes;
  const shortageMinutes = Math.max(
    -differenceMinutes,
    0
  );
  const surplusMinutes = Math.max(
    differenceMinutes,
    0
  );
  const coveragePercent =
    requiredMinutes > 0
      ? Math.round(
          (postArrivalMinutes /
            requiredMinutes) * 100
        )
      : 100;

  return {
    fullRosterMinutes,
    breakMinutes,
    productiveRosterMinutes,
    preLoadMinutes,
    postArrivalMinutes,
    requiredMinutes,
    differenceMinutes,
    shortageMinutes,
    surplusMinutes,
    coveragePercent,
  };
}

export function getTaskOrder(
  taskName: string
) {
  if (taskName === 'Splitting') return 0;

  if (taskName.startsWith('Aisle ')) {
    const aisle = Number(
      taskName.replace('Aisle ', '')
    );
    return Number.isNaN(aisle)
      ? 50
      : aisle;
  }

  if (taskName === 'Promo') return 100;
  if (taskName === 'Protect - Aisle') return 101;
  if (taskName === 'Other / Organising') return 102;
  return 999;
}

export function buildEmployeePlans(
  roster: PlanningRosterEntry[],
  allocations: PlanningAllocation[],
  loadArrivalTime?: string | null
): EmployeeNightPlan[] {
  const activeRoster = roster.filter(
    isActiveRosterEntry
  );
  const arrival = loadArrivalTime
    ? timeToNightMinutes(loadArrivalTime)
    : null;

  return activeRoster.map(
    (entry): EmployeeNightPlan => {
      const window = getShiftWindow(entry);
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
        calculateAvailableAfterLoad(
          entry,
          loadArrivalTime
        );

      const employeeAllocations = allocations
        .filter(
          (allocation) =>
            allocation.employeeId ===
              entry.employeeId &&
            allocation.minutes > 0
        )
        .sort(
          (a, b) =>
            getTaskOrder(a.taskName) -
            getTaskOrder(b.taskName)
        );

      let cursor = loadWorkStartMinute;

      const tasks: PlannedEmployeeTask[] =
        employeeAllocations.map(
          (allocation) => {
            const start = cursor;
            const finish =
              start + allocation.minutes;
            const overrunMinutes = Math.max(
              finish -
                window.productiveFinishMinute,
              0
            );

            cursor = finish;

            return {
              employeeId: entry.employeeId,
              taskName: allocation.taskName,
              minutes: allocation.minutes,
              plannedStartMinute: start,
              plannedFinishMinute: finish,
              overrunMinutes,
            };
          }
        );

      const allocatedMinutes =
        employeeAllocations.reduce(
          (total, allocation) =>
            total + allocation.minutes,
          0
        );

      const remainingMinutes = Math.max(
        availableAfterLoadMinutes -
          allocatedMinutes,
        0
      );
      const overrunMinutes = Math.max(
        allocatedMinutes -
          availableAfterLoadMinutes,
        0
      );

      return {
        employeeId: entry.employeeId,
        shiftStartMinute:
          window.startMinute,
        shiftFinishMinute:
          window.finishMinute,
        productiveFinishMinute:
          window.productiveFinishMinute,
        loadWorkStartMinute,
        fullShiftMinutes:
          window.durationMinutes,
        breakMinutes:
          window.breakMinutes,
        productiveShiftMinutes:
          window.productiveMinutes,
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

export function buildTeamTaskPlans(
  employeePlans: EmployeeNightPlan[]
): TeamTaskPlan[] {
  const taskNames = Array.from(
    new Set(
      employeePlans.flatMap((plan) =>
        plan.tasks.map(
          (task) => task.taskName
        )
      )
    )
  ).sort(
    (a, b) =>
      getTaskOrder(a) -
      getTaskOrder(b)
  );

  return taskNames
    .map((taskName): TeamTaskPlan | null => {
      const assignments =
        employeePlans.flatMap((plan) =>
          plan.tasks.filter(
            (task) =>
              task.taskName === taskName
          )
        );

      if (assignments.length === 0) {
        return null;
      }

      const employeeIds = Array.from(
        new Set(
          assignments.map(
            (assignment) =>
              assignment.employeeId
          )
        )
      );
      const plannedStartMinute = Math.min(
        ...assignments.map(
          (assignment) =>
            assignment.plannedStartMinute
        )
      );
      const plannedFinishMinute = Math.max(
        ...assignments.map(
          (assignment) =>
            assignment.plannedFinishMinute
        )
      );
      const allocatedLabourMinutes =
        assignments.reduce(
          (total, assignment) =>
            total + assignment.minutes,
          0
        );

      return {
        taskName,
        employeeIds,
        staffCount: employeeIds.length,
        allocatedLabourMinutes,
        plannedStartMinute,
        plannedFinishMinute,
        elapsedMinutes: Math.max(
          plannedFinishMinute -
            plannedStartMinute,
          0
        ),
      };
    })
    .filter(
      (value): value is TeamTaskPlan =>
        value !== null
    );
}

export function getEmployeePlan(
  employeePlans: EmployeeNightPlan[],
  employeeId: string
) {
  return (
    employeePlans.find(
      (plan) =>
        plan.employeeId === employeeId
    ) || null
  );
}

export function getTeamTaskPlan(
  taskPlans: TeamTaskPlan[],
  taskName: string
) {
  return (
    taskPlans.find(
      (plan) =>
        plan.taskName === taskName
    ) || null
  );
}

export function getEmployeeAllocatedMinutes(
  allocations: PlanningAllocation[],
  employeeId: string
) {
  return allocations
    .filter(
      (allocation) =>
        allocation.employeeId === employeeId
    )
    .reduce(
      (total, allocation) =>
        total + allocation.minutes,
      0
    );
}

export function getTaskAllocatedMinutes(
  allocations: PlanningAllocation[],
  taskName: string
) {
  return allocations
    .filter(
      (allocation) =>
        allocation.taskName === taskName
    )
    .reduce(
      (total, allocation) =>
        total + allocation.minutes,
      0
    );
}

export function calculatePlanDifference(
  plannedFinishMinute: number,
  actualFinish: string | Date
) {
  const actual = dateToNightMinutes(
    actualFinish
  );
  return actual === null
    ? null
    : plannedFinishMinute - actual;
}

export function calculateArrivalDifference(
  expectedTime?: string | null,
  actualTime?: string | null
) {
  if (!expectedTime || !actualTime) {
    return null;
  }

  const expected = timeToNightMinutes(
    expectedTime
  );
  const actual = timeToNightMinutes(
    actualTime
  );

  if (expected === null || actual === null) {
    return null;
  }

  return actual - expected;
}
