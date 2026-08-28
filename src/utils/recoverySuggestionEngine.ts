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
  if (!taskName.startsWith('Aisle ')) return 0;

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
  return activeRoster
    .map((entry) => {
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
            : 999,
      };
    })
    .filter((candidate) => candidate.capacityMinutes > 0);
}

function candidateScore(task: SuggestionTask, candidate: Candidate) {
  /* Aisle skill is strong, but not so strong that one skilled person gets all overload. */
  const skillScore = task.name.startsWith('Aisle ')
    ? candidate.skillRating * 120
    : 0;

  /* Spread work according to how loaded each person already is versus real post-load time. */
  const balanceScore = -candidate.loadRatio * 70;
  const capacityScore = candidate.capacityMinutes / 30;
  const earlierStartTieBreaker = -candidate.shiftStartMinute / 10000;

  return skillScore + balanceScore + capacityScore + earlierStartTieBreaker;
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

  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const scoreDifference = candidateScore(task, b) - candidateScore(task, a);
    if (Math.abs(scoreDifference) > 0.0001) return scoreDifference;

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
  const capacityText = `${candidate.capacityMinutes}m post-load capacity`;
  const projectedOverload = Math.max(
    projectedAssigned - candidate.capacityMinutes,
    0
  );

  if (recovery) {
    const skillText =
      task.name.startsWith('Aisle ') && candidate.skillRating > 0
        ? ` · skill ${candidate.skillRating}/5`
        : '';

    return `Recovery allocation${skillText} · ${capacityText} · ${projectedOverload}m above capacity`;
  }

  if (task.name.startsWith('Aisle ') && candidate.skillRating > 0) {
    return `${task.name} skill ${candidate.skillRating}/5 · workload balanced · ${capacityText}`;
  }

  if (task.name.startsWith('Aisle ')) {
    return `No aisle rating recorded · workload balanced · ${capacityText}`;
  }

  if (task.name === 'Splitting') {
    return `Balanced splitting share · ${capacityText}`;
  }

  return `Best workload match · ${capacityText}`;
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

    if (!candidate) break;

    const minutes = Math.min(CHUNK_MINUTES, remaining);
    const currentAssigned = assignedByEmployee[candidate.employeeId] || 0;
    const projectedAssigned = currentAssigned + minutes;
    const recovery = projectedAssigned > candidate.capacityMinutes;

    mergeAllocation(suggestions, {
      employeeId: candidate.employeeId,
      taskName: task.name,
      minutes,
      source: 'suggested',
      skillRating: task.name.startsWith('Aisle ')
        ? candidate.skillRating
        : null,
      reason: makeReason(task, candidate, recovery, projectedAssigned),
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

  const activeRoster = roster
    .filter(isActiveRosterEntry)
    .filter(
      (entry) =>
        calculateAvailableAfterLoad(entry, loadArrivalTime) > 0
    );

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

  const orderedTasks = [...tasks]
    .filter((task) => task.requiredMinutes > 0)
    .sort((a, b) => getTaskOrder(a.name) - getTaskOrder(b.name));

  const totalRequiredMinutes = orderedTasks.reduce(
    (total, task) => total + task.requiredMinutes,
    0
  );
  const totalAvailableMinutes = activeRoster.reduce(
    (total, entry) => total + (capacityByEmployee[entry.employeeId] || 0),
    0
  );
  const shortageMinutes = Math.max(
    totalRequiredMinutes - totalAvailableMinutes,
    0
  );
  const recoveryMode = shortageMinutes > 0;
  const requiredPacePercent =
    totalAvailableMinutes > 0
      ? Math.ceil((totalRequiredMinutes / totalAvailableMinutes) * 100)
      : totalRequiredMinutes > 0
        ? null
        : 100;

  /*
   * Critical late-load rule:
   * If the actual arrival creates a real shortage, generate a fresh recovery
   * suggestion rather than preserving a provisional pre-arrival allocation.
   * The manager's saved allocation is not deleted until they explicitly save.
   */
  const effectivePreserveExisting = preserveExisting && !recoveryMode;

  const retainedExisting = effectivePreserveExisting
    ? existingAllocations.filter(
        (allocation) =>
          activeEmployeeIds.has(allocation.employeeId) &&
          allocation.minutes > 0
      )
    : [];

  for (const allocation of retainedExisting) {
    assignedByEmployee[allocation.employeeId] =
      (assignedByEmployee[allocation.employeeId] || 0) + allocation.minutes;
  }

  const existingSuggestedShape: SuggestedAllocation[] = retainedExisting.map(
    (allocation) => ({
      ...allocation,
      source: 'existing',
      skillRating: null,
      reason: 'Existing manager allocation preserved',
      recovery: false,
    })
  );

  const taskExistingMinutes = retainedExisting.reduce<Record<string, number>>(
    (result, allocation) => {
      result[allocation.taskName] =
        (result[allocation.taskName] || 0) + allocation.minutes;
      return result;
    },
    {}
  );

  const suggestions: SuggestedAllocation[] = [];
  const unallocatedTasks: UnallocatedTask[] = [];

  for (const task of orderedTasks) {
    const remainingForTask = Math.max(
      task.requiredMinutes - (taskExistingMinutes[task.name] || 0),
      0
    );

    if (remainingForTask === 0) continue;

    const remaining = allocateTask(
      task,
      remainingForTask,
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

    employeeRemainingMinutes[employeeId] = Math.max(capacity - assigned, 0);
    employeeOverloadMinutes[employeeId] = Math.max(assigned - capacity, 0);
  }

  return {
    allocations: [...existingSuggestedShape, ...suggestions],
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
