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
  type?: 'splitting' | 'aisle' | 'promo' | 'protect' | 'other';
};

export type SuggestedAllocation = PlanningAllocation & {
  source: 'existing' | 'suggested';
  skillRating: number | null;
  reason: string;
  recovery?: boolean;
};

export type UnallocatedTask = {
  taskName: string;
  remainingMinutes: number;
};

export type AllocationSuggestionResult = {
  allocations: SuggestedAllocation[];
  suggestions: SuggestedAllocation[];
  unallocatedTasks: UnallocatedTask[];
  employeeRemainingMinutes: Record<string, number>;
  employeeOverloadMinutes: Record<string, number>;
  recoveryMode: boolean;
  shortageMinutes: number;
  requiredPacePercent: number | null;
  totalRequiredMinutes: number;
  totalAvailableMinutes: number;
};

type Candidate = {
  employeeId: string;
  name: string;
  skillRating: number;
  shiftStartMinute: number;
  capacityMinutes: number;
  assignedMinutes: number;
  loadRatio: number;
};

const CHUNK_MINUTES = 15;

function mergeAllocation(
  allocations: SuggestedAllocation[],
  next: SuggestedAllocation
) {
  const existing = allocations.find(
    (item) =>
      item.employeeId === next.employeeId &&
      item.taskName === next.taskName &&
      item.source === next.source &&
      Boolean(item.recovery) === Boolean(next.recovery)
  );

  if (existing) {
    existing.minutes += next.minutes;
    return;
  }

  allocations.push(next);
}

function getTaskSkill(
  employee: SuggestionEmployee | undefined,
  taskName: string
) {
  if (!taskName.startsWith('Aisle ')) {
    return 0;
  }

  return Math.max(
    Math.min(Number(employee?.aisleSkills?.[taskName]) || 0, 5),
    0
  );
}

function buildCandidates(
  task: SuggestionTask,
  activeRoster: PlanningRosterEntry[],
  employeesById: Map<string, SuggestionEmployee>,
  capacityByEmployee: Record<string, number>,
  assignedByEmployee: Record<string, number>
): Candidate[] {
  return activeRoster.map((entry) => {
    const employee = employeesById.get(entry.employeeId);
    const capacityMinutes = Math.max(
      capacityByEmployee[entry.employeeId] || 0,
      0
    );
    const assignedMinutes = Math.max(
      assignedByEmployee[entry.employeeId] || 0,
      0
    );

    return {
      employeeId: entry.employeeId,
      name: employee?.name || 'Team member',
      skillRating: getTaskSkill(employee, task.name),
      shiftStartMinute: getShiftWindow(entry).startMinute,
      capacityMinutes,
      assignedMinutes,
      loadRatio:
        capacityMinutes > 0
          ? assignedMinutes / capacityMinutes
          : assignedMinutes > 0
            ? 999
            : 0,
    };
  });
}

function candidateScore(task: SuggestionTask, candidate: Candidate) {
  const aisleSkillScore = task.name.startsWith('Aisle ')
    ? candidate.skillRating * 120
    : 0;

  /*
   * Lower workload ratio should win. The penalty becomes stronger once an
   * employee is already at/over their post-load capacity, so shortage is
   * spread across the team instead of dumping all recovery work on one person.
   */
  const balanceScore = -candidate.loadRatio * 70;

  /* More real post-load capacity is a modest positive signal. */
  const capacityScore = candidate.capacityMinutes / 30;

  /* Earlier starters are a small tie-breaker only; shift times never change. */
  const startScore = -candidate.shiftStartMinute / 10000;

  return aisleSkillScore + balanceScore + capacityScore + startScore;
}

function chooseCandidate(
  task: SuggestionTask,
  activeRoster: PlanningRosterEntry[],
  employeesById: Map<string, SuggestionEmployee>,
  capacityByEmployee: Record<string, number>,
  assignedByEmployee: Record<string, number>
) {
  const candidates = buildCandidates(
    task,
    activeRoster,
    employeesById,
    capacityByEmployee,
    assignedByEmployee
  );

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((a, b) => {
    const scoreDifference =
      candidateScore(task, b) - candidateScore(task, a);

    if (Math.abs(scoreDifference) > 0.0001) {
      return scoreDifference;
    }

    if (a.shiftStartMinute !== b.shiftStartMinute) {
      return a.shiftStartMinute - b.shiftStartMinute;
    }

    return a.name.localeCompare(b.name);
  })[0];
}

function makeReason(
  task: SuggestionTask,
  candidate: Candidate,
  recovery: boolean,
  projectedAssigned: number
) {
  const availableText = `${candidate.capacityMinutes}m post-load capacity`;
  const projectedOverload = Math.max(
    projectedAssigned - candidate.capacityMinutes,
    0
  );

  if (recovery) {
    const skillText =
      task.name.startsWith('Aisle ') && candidate.skillRating > 0
        ? ` · skill ${candidate.skillRating}/5`
        : '';

    return `Recovery allocation${skillText} · ${availableText} · ${projectedOverload}m above capacity`;
  }

  if (task.name.startsWith('Aisle ') && candidate.skillRating > 0) {
    return `${task.name} skill ${candidate.skillRating}/5 · workload balanced · ${availableText}`;
  }

  if (task.name.startsWith('Aisle ')) {
    return `No aisle rating recorded · workload balanced · ${availableText}`;
  }

  if (task.name === 'Splitting') {
    return `Balanced splitting share · ${availableText}`;
  }

  return `Best available workload match · ${availableText}`;
}

function allocateTask(
  task: SuggestionTask,
  taskRemaining: number,
  activeRoster: PlanningRosterEntry[],
  employeesById: Map<string, SuggestionEmployee>,
  capacityByEmployee: Record<string, number>,
  assignedByEmployee: Record<string, number>,
  suggestions: SuggestedAllocation[]
) {
  let remaining = Math.max(taskRemaining, 0);

  while (remaining > 0) {
    const candidate = chooseCandidate(
      task,
      activeRoster,
      employeesById,
      capacityByEmployee,
      assignedByEmployee
    );

    if (!candidate) {
      break;
    }

    const minutes = Math.min(CHUNK_MINUTES, remaining);
    const currentAssigned =
      assignedByEmployee[candidate.employeeId] || 0;
    const projectedAssigned = currentAssigned + minutes;
    const recovery =
      projectedAssigned > candidate.capacityMinutes;

    mergeAllocation(suggestions, {
      employeeId: candidate.employeeId,
      taskName: task.name,
      minutes,
      source: 'suggested',
      skillRating: task.name.startsWith('Aisle ')
        ? candidate.skillRating
        : null,
      reason: makeReason(
        task,
        candidate,
        recovery,
        projectedAssigned
      ),
      recovery,
    });

    assignedByEmployee[candidate.employeeId] = projectedAssigned;
    remaining -= minutes;
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
  employees: SuggestionEmployee[];
  roster: PlanningRosterEntry[];
  tasks: SuggestionTask[];
  loadArrivalTime?: string | null;
  existingAllocations?: PlanningAllocation[];
  preserveExisting?: boolean;
}): AllocationSuggestionResult {
  const employeesById = new Map(
    employees.map((employee) => [employee.id, employee])
  );

  const activeRoster = roster.filter(isActiveRosterEntry);
  const activeEmployeeIds = new Set(
    activeRoster.map((entry) => entry.employeeId)
  );

  const capacityByEmployee: Record<string, number> = {};
  const assignedByEmployee: Record<string, number> = {};

  for (const entry of activeRoster) {
    capacityByEmployee[entry.employeeId] =
      calculateAvailableAfterLoad(entry, loadArrivalTime);
    assignedByEmployee[entry.employeeId] = 0;
  }

  const retainedExisting = preserveExisting
    ? existingAllocations.filter(
        (allocation) =>
          activeEmployeeIds.has(allocation.employeeId) &&
          allocation.minutes > 0
      )
    : [];

  for (const allocation of retainedExisting) {
    assignedByEmployee[allocation.employeeId] =
      (assignedByEmployee[allocation.employeeId] || 0) +
      allocation.minutes;
  }

  const existingSuggestedShape: SuggestedAllocation[] =
    retainedExisting.map((allocation) => ({
      ...allocation,
      source: 'existing',
      skillRating: null,
      reason: 'Existing manager allocation preserved',
      recovery:
        (assignedByEmployee[allocation.employeeId] || 0) >
        (capacityByEmployee[allocation.employeeId] || 0),
    }));

  const taskExistingMinutes = retainedExisting.reduce<Record<string, number>>(
    (result, allocation) => {
      result[allocation.taskName] =
        (result[allocation.taskName] || 0) + allocation.minutes;
      return result;
    },
    {}
  );

  const orderedTasks = [...tasks]
    .filter((task) => task.requiredMinutes > 0)
    .sort(
      (a, b) => getTaskOrder(a.name) - getTaskOrder(b.name)
    );

  const totalRequiredMinutes = orderedTasks.reduce(
    (total, task) => total + task.requiredMinutes,
    0
  );
  const totalAvailableMinutes = activeRoster.reduce(
    (total, entry) =>
      total + (capacityByEmployee[entry.employeeId] || 0),
    0
  );
  const shortageMinutes = Math.max(
    totalRequiredMinutes - totalAvailableMinutes,
    0
  );
  const recoveryMode = shortageMinutes > 0;
  const requiredPacePercent =
    totalAvailableMinutes > 0
      ? Math.ceil(
          (totalRequiredMinutes / totalAvailableMinutes) * 100
        )
      : totalRequiredMinutes > 0
        ? null
        : 100;

  const suggestions: SuggestedAllocation[] = [];
  const unallocatedTasks: UnallocatedTask[] = [];

  for (const task of orderedTasks) {
    const taskRemaining = Math.max(
      task.requiredMinutes -
        (taskExistingMinutes[task.name] || 0),
      0
    );

    if (taskRemaining === 0) {
      continue;
    }

    const remaining = allocateTask(
      task,
      taskRemaining,
      activeRoster,
      employeesById,
      capacityByEmployee,
      assignedByEmployee,
      suggestions
    );

    if (remaining > 0) {
      unallocatedTasks.push({
        taskName: task.name,
        remainingMinutes: remaining,
      });
    }
  }

  const employeeRemainingMinutes: Record<string, number> = {};
  const employeeOverloadMinutes: Record<string, number> = {};

  for (const entry of activeRoster) {
    const employeeId = entry.employeeId;
    const capacity = capacityByEmployee[employeeId] || 0;
    const assigned = assignedByEmployee[employeeId] || 0;

    employeeRemainingMinutes[employeeId] = Math.max(
      capacity - assigned,
      0
    );
    employeeOverloadMinutes[employeeId] = Math.max(
      assigned - capacity,
      0
    );
  }

  return {
    allocations: [
      ...existingSuggestedShape,
      ...suggestions,
    ],
    suggestions,
    unallocatedTasks,
    employeeRemainingMinutes,
    employeeOverloadMinutes,
    recoveryMode,
    shortageMinutes,
    requiredPacePercent,
    totalRequiredMinutes,
    totalAvailableMinutes,
  };
}
