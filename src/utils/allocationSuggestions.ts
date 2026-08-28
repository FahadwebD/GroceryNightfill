import {
  calculateAvailableAfterLoad,
  getShiftWindow,
  getTaskOrder,
  isActiveRosterEntry,
  type PlanningAllocation,
  type PlanningRosterEntry,
} from './nightfillPlanning';

export type SuggestionEmployee = {
  id: string;
  name: string;
  aisleSkills?: Record<string, number>;
};

export type SuggestionTask = {
  name: string;
  requiredMinutes: number;
  type?:
    | 'splitting'
    | 'aisle'
    | 'promo'
    | 'protect'
    | 'other';
};

export type SuggestedAllocation =
  PlanningAllocation & {
    source:
      | 'existing'
      | 'suggested';

    skillRating:
      number | null;

    reason: string;
  };

export type UnallocatedTask = {
  taskName: string;
  remainingMinutes: number;
};

export type AllocationSuggestionResult = {
  allocations:
    SuggestedAllocation[];

  suggestions:
    SuggestedAllocation[];

  unallocatedTasks:
    UnallocatedTask[];

  employeeRemainingMinutes:
    Record<string, number>;
};

type Candidate = {
  employeeId: string;
  name: string;
  remainingMinutes: number;
  skillRating: number;
  shiftStartMinute: number;
};

function mergeAllocation(
  allocations:
    SuggestedAllocation[],
  next:
    SuggestedAllocation
) {
  const existing =
    allocations.find(
      (item) =>
        item.employeeId ===
          next.employeeId &&
        item.taskName ===
          next.taskName &&
        item.source ===
          next.source
    );

  if (existing) {
    existing.minutes +=
      next.minutes;

    return;
  }

  allocations.push(
    next
  );
}

function getTaskSkill(
  employee:
    SuggestionEmployee | undefined,
  taskName: string
) {
  if (
    !taskName.startsWith(
      'Aisle '
    )
  ) {
    return 0;
  }

  return Math.max(
    Math.min(
      Number(
        employee
          ?.aisleSkills?.[
          taskName
        ]
      ) || 0,
      5
    ),
    0
  );
}

function buildCandidates(
  task:
    SuggestionTask,
  activeRoster:
    PlanningRosterEntry[],
  employeesById:
    Map<string, SuggestionEmployee>,
  remainingByEmployee:
    Record<string, number>
) {
  return activeRoster
    .map(
      (
        entry
      ):
        Candidate => {
        const employee =
          employeesById.get(
            entry.employeeId
          );

        return {
          employeeId:
            entry.employeeId,

          name:
            employee?.name ||
            'Team member',

          remainingMinutes:
            Math.max(
              remainingByEmployee[
                entry.employeeId
              ] || 0,
              0
            ),

          skillRating:
            getTaskSkill(
              employee,
              task.name
            ),

          shiftStartMinute:
            getShiftWindow(
              entry
            ).startMinute,
        };
      }
    )
    .filter(
      (candidate) =>
        candidate.remainingMinutes >
        0
    );
}

function sortCandidatesForTask(
  task:
    SuggestionTask,
  candidates:
    Candidate[]
) {
  return [
    ...candidates,
  ].sort(
    (a, b) => {
      /*
       * For real grocery aisles, aisle skill is the strongest signal.
       */
      if (
        task.name.startsWith(
          'Aisle '
        ) &&
        a.skillRating !==
          b.skillRating
      ) {
        return (
          b.skillRating -
          a.skillRating
        );
      }

      /*
       * Then prefer the employee with more remaining post-load labour.
       */
      if (
        a.remainingMinutes !==
        b.remainingMinutes
      ) {
        return (
          b.remainingMinutes -
          a.remainingMinutes
        );
      }

      /*
       * Stable practical tie-breaker: earlier shift start first.
       */
      if (
        a.shiftStartMinute !==
        b.shiftStartMinute
      ) {
        return (
          a.shiftStartMinute -
          b.shiftStartMinute
        );
      }

      return a.name.localeCompare(
        b.name
      );
    }
  );
}

function makeReason(
  task:
    SuggestionTask,
  candidate:
    Candidate
) {
  if (
    task.name.startsWith(
      'Aisle '
    ) &&
    candidate.skillRating >
      0
  ) {
    return `${task.name} skill ${candidate.skillRating}/5 · ${candidate.remainingMinutes}m available`;
  }

  if (
    task.name.startsWith(
      'Aisle '
    )
  ) {
    return `No aisle rating recorded · ${candidate.remainingMinutes}m available`;
  }

  if (
    task.name ===
    'Splitting'
  ) {
    return `Balanced splitting share · ${candidate.remainingMinutes}m available`;
  }

  return `Available labour match · ${candidate.remainingMinutes}m available`;
}

function allocateBalancedSplitting(
  task:
    SuggestionTask,
  taskRemaining: number,
  activeRoster:
    PlanningRosterEntry[],
  employeesById:
    Map<string, SuggestionEmployee>,
  remainingByEmployee:
    Record<string, number>,
  suggestions:
    SuggestedAllocation[]
) {
  let remaining =
    Math.max(
      taskRemaining,
      0
    );

  while (
    remaining > 0
  ) {
    const candidates =
      sortCandidatesForTask(
        task,
        buildCandidates(
          task,
          activeRoster,
          employeesById,
          remainingByEmployee
        )
      );

    if (
      candidates.length ===
      0
    ) {
      break;
    }

    const targetShare =
      Math.max(
        Math.ceil(
          remaining /
            candidates.length
        ),
        1
      );

    let allocatedThisPass =
      0;

    for (
      const candidate of
      candidates
    ) {
      if (
        remaining <= 0
      ) {
        break;
      }

      const currentRemaining =
        Math.max(
          remainingByEmployee[
            candidate.employeeId
          ] || 0,
          0
        );

      if (
        currentRemaining <= 0
      ) {
        continue;
      }

      const minutes =
        Math.min(
          targetShare,
          currentRemaining,
          remaining
        );

      if (
        minutes <= 0
      ) {
        continue;
      }

      mergeAllocation(
        suggestions,
        {
          employeeId:
            candidate.employeeId,

          taskName:
            task.name,

          minutes,

          source:
            'suggested',

          skillRating:
            null,

          reason:
            makeReason(
              task,
              candidate
            ),
        }
      );

      remainingByEmployee[
        candidate.employeeId
      ] =
        currentRemaining -
        minutes;

      remaining -=
        minutes;

      allocatedThisPass +=
        minutes;
    }

    if (
      allocatedThisPass ===
      0
    ) {
      break;
    }
  }

  return remaining;
}

function allocateTaskByBestFit(
  task:
    SuggestionTask,
  taskRemaining: number,
  activeRoster:
    PlanningRosterEntry[],
  employeesById:
    Map<string, SuggestionEmployee>,
  remainingByEmployee:
    Record<string, number>,
  suggestions:
    SuggestedAllocation[]
) {
  let remaining =
    Math.max(
      taskRemaining,
      0
    );

  const candidates =
    sortCandidatesForTask(
      task,
      buildCandidates(
        task,
        activeRoster,
        employeesById,
        remainingByEmployee
      )
    );

  for (
    const candidate of
    candidates
  ) {
    if (
      remaining <= 0
    ) {
      break;
    }

    const currentRemaining =
      Math.max(
        remainingByEmployee[
          candidate.employeeId
        ] || 0,
        0
      );

    if (
      currentRemaining <= 0
    ) {
      continue;
    }

    const minutes =
      Math.min(
        remaining,
        currentRemaining
      );

    if (
      minutes <= 0
    ) {
      continue;
    }

    mergeAllocation(
      suggestions,
      {
        employeeId:
          candidate.employeeId,

        taskName:
          task.name,

        minutes,

        source:
          'suggested',

        skillRating:
          task.name.startsWith(
            'Aisle '
          )
            ? candidate.skillRating
            : null,

        reason:
          makeReason(
            task,
            candidate
          ),
      }
    );

    remainingByEmployee[
      candidate.employeeId
    ] =
      currentRemaining -
      minutes;

    remaining -=
      minutes;
  }

  return remaining;
}

export function buildAllocationSuggestions({
  employees,
  roster,
  tasks,
  loadArrivalTime,
  existingAllocations = [],
  preserveExisting = true,
}: {
  employees:
    SuggestionEmployee[];

  roster:
    PlanningRosterEntry[];

  tasks:
    SuggestionTask[];

  loadArrivalTime?:
    string | null;

  existingAllocations?:
    PlanningAllocation[];

  preserveExisting?:
    boolean;
}): AllocationSuggestionResult {
  const employeesById =
    new Map(
      employees.map(
        (employee) => [
          employee.id,
          employee,
        ]
      )
    );

  const activeRoster =
    roster.filter(
      isActiveRosterEntry
    );

  const activeEmployeeIds =
    new Set(
      activeRoster.map(
        (entry) =>
          entry.employeeId
      )
    );

  const remainingByEmployee:
    Record<string, number> =
    {};

  for (
    const entry of
    activeRoster
  ) {
    remainingByEmployee[
      entry.employeeId
    ] =
      calculateAvailableAfterLoad(
        entry,
        loadArrivalTime
      );
  }

  const retainedExisting =
    preserveExisting
      ? existingAllocations.filter(
          (allocation) =>
            activeEmployeeIds.has(
              allocation.employeeId
            ) &&
            allocation.minutes >
              0
        )
      : [];

  for (
    const allocation of
    retainedExisting
  ) {
    remainingByEmployee[
      allocation.employeeId
    ] =
      Math.max(
        (
          remainingByEmployee[
            allocation.employeeId
          ] || 0
        ) -
          allocation.minutes,
        0
      );
  }

  const existingSuggestedShape:
    SuggestedAllocation[] =
    retainedExisting.map(
      (allocation) => ({
        ...allocation,
        source:
          'existing',
        skillRating:
          null,
        reason:
          'Existing manager allocation preserved',
      })
    );

  const taskExistingMinutes =
    retainedExisting.reduce<
      Record<string, number>
    >(
      (
        result,
        allocation
      ) => {
        result[
          allocation.taskName
        ] =
          (
            result[
              allocation.taskName
            ] || 0
          ) +
          allocation.minutes;

        return result;
      },
      {}
    );

  const orderedTasks =
    [...tasks]
      .filter(
        (task) =>
          task.requiredMinutes >
          0
      )
      .sort(
        (a, b) =>
          getTaskOrder(
            a.name
          ) -
          getTaskOrder(
            b.name
          )
      );

  const suggestions:
    SuggestedAllocation[] =
    [];

  const unallocatedTasks:
    UnallocatedTask[] =
    [];

  for (
    const task of
    orderedTasks
  ) {
    const taskRemaining =
      Math.max(
        task.requiredMinutes -
          (
            taskExistingMinutes[
              task.name
            ] || 0
          ),
        0
      );

    if (
      taskRemaining ===
      0
    ) {
      continue;
    }

    const remaining =
      task.name ===
      'Splitting'
        ? allocateBalancedSplitting(
            task,
            taskRemaining,
            activeRoster,
            employeesById,
            remainingByEmployee,
            suggestions
          )
        : allocateTaskByBestFit(
            task,
            taskRemaining,
            activeRoster,
            employeesById,
            remainingByEmployee,
            suggestions
          );

    if (
      remaining > 0
    ) {
      unallocatedTasks.push({
        taskName:
          task.name,
        remainingMinutes:
          remaining,
      });
    }
  }

  return {
    allocations: [
      ...existingSuggestedShape,
      ...suggestions,
    ],

    suggestions,

    unallocatedTasks,

    employeeRemainingMinutes:
      remainingByEmployee,
  };
}
