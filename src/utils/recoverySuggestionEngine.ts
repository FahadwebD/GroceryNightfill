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
  /** Standard Fill Assist labour represented by this target-time allocation. */
  standardMinutes?: number;
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
  paceMultiplier: number;
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
  remainingMinutes: number;
  loadRatio: number;
};

const TARGET_CHUNK_MINUTES = 15;

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
    existing.standardMinutes =
      (existing.standardMinutes ?? existing.minutes) +
      (next.standardMinutes ?? next.minutes);
    return;
  }

  allocations.push({ ...next });
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
      const remainingMinutes = Math.max(
        capacityMinutes - assignedMinutes,
        0
      );

      return {
        employeeId: entry.employeeId,
        name: employee?.name || 'Team member',
        skillRating: getTaskSkill(employee, task.name),
        shiftStartMinute: getShiftWindow(entry).startMinute,
        capacityMinutes,
        assignedMinutes,
        remainingMinutes,
        loadRatio:
          capacityMinutes > 0
            ? assignedMinutes / capacityMinutes
            : 999,
      };
    })
    .filter(
      (candidate) =>
        candidate.capacityMinutes > 0 &&
        candidate.remainingMinutes > 0
    );
}

function candidateScore(task: SuggestionTask, candidate: Candidate) {
  const skillScore = task.name.startsWith('Aisle ')
    ? candidate.skillRating * 120
    : 0;

  const balanceScore = -candidate.loadRatio * 90;
  const remainingScore = candidate.remainingMinutes / 20;
  const earlierStartTieBreaker = -candidate.shiftStartMinute / 10000;

  return skillScore + balanceScore + remainingScore + earlierStartTieBreaker;
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
  recoveryMode: boolean,
  paceMultiplier: number
) {
  const capacityText = `${Math.round(candidate.capacityMinutes)}m post-load capacity`;

  if (recoveryMode) {
    const skillText =
      task.name.startsWith('Aisle ') && candidate.skillRating > 0
        ? ` · skill ${candidate.skillRating}/5`
        : '';

    return `Recovery target${skillText} · ${capacityText} · ${paceMultiplier.toFixed(
      2
    )}× standard pace`;
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

function buildTaskTargets(
  tasks: SuggestionTask[],
  totalAvailableMinutes: number,
  totalRequiredMinutes: number,
  recoveryMode: boolean
) {
  const targets: Record<string, number> = {};

  if (!recoveryMode || totalRequiredMinutes <= 0) {
    for (const task of tasks) {
      targets[task.name] = Math.max(Math.round(task.requiredMinutes), 0);
    }
    return targets;
  }

  const raw = tasks.map((task) => ({
    name: task.name,
    raw:
      (Math.max(task.requiredMinutes, 0) / totalRequiredMinutes) *
      totalAvailableMinutes,
  }));

  let used = 0;
  for (const item of raw) {
    const floor = Math.floor(item.raw);
    targets[item.name] = floor;
    used += floor;
  }

  let remaining = Math.max(Math.round(totalAvailableMinutes) - used, 0);
  const byRemainder = [...raw].sort(
    (a, b) =>
      b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw))
  );

  let index = 0;
  while (remaining > 0 && byRemainder.length > 0) {
    const item = byRemainder[index % byRemainder.length];
    targets[item.name] = (targets[item.name] || 0) + 1;
    remaining -= 1;
    index += 1;
  }

  return targets;
}

function allocateTaskTarget(
  task: SuggestionTask,
  targetMinutes: number,
  standardMinutes: number,
  activeRoster: PlanningRosterEntry[],
  employeesById: Map<string, SuggestionEmployee>,
  capacityByEmployee: Record<string, number>,
  assignedByEmployee: Record<string, number>,
  suggestions: SuggestedAllocation[],
  recoveryMode: boolean,
  paceMultiplier: number
) {
  let targetRemaining = Math.max(Math.round(targetMinutes), 0);
  let standardRemaining = Math.max(standardMinutes, 0);

  while (targetRemaining > 0) {
    const candidate = chooseCandidate(
      task,
      activeRoster,
      employeesById,
      capacityByEmployee,
      assignedByEmployee
    );

    if (!candidate) break;

    const targetChunk = Math.min(
      TARGET_CHUNK_MINUTES,
      targetRemaining,
      candidate.remainingMinutes
    );

    if (targetChunk <= 0) break;

    const standardChunk =
      targetChunk === targetRemaining
        ? standardRemaining
        : Math.min(
            standardRemaining,
            recoveryMode
              ? targetChunk * paceMultiplier
              : targetChunk
          );

    mergeAllocation(suggestions, {
      employeeId: candidate.employeeId,
      taskName: task.name,
      minutes: targetChunk,
      standardMinutes: standardChunk,
      source: 'suggested',
      skillRating: task.name.startsWith('Aisle ')
        ? candidate.skillRating
        : null,
      reason: makeReason(
        task,
        candidate,
        recoveryMode,
        paceMultiplier
      ),
      recovery: recoveryMode,
    });

    assignedByEmployee[candidate.employeeId] =
      (assignedByEmployee[candidate.employeeId] || 0) + targetChunk;
    targetRemaining -= targetChunk;
    standardRemaining = Math.max(
      standardRemaining - standardChunk,
      0
    );
  }

  return {
    targetRemaining,
    standardRemaining,
  };
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
  const paceMultiplier =
    totalAvailableMinutes > 0
      ? Math.max(totalRequiredMinutes / totalAvailableMinutes, 1)
      : totalRequiredMinutes > 0
        ? Infinity
        : 1;
  const requiredPacePercent =
    Number.isFinite(paceMultiplier)
      ? Math.ceil(paceMultiplier * 100)
      : null;

  /*
   * If actual arrival creates shortage, previous provisional allocations are
   * not treated as fixed. We build a fresh target-time recovery suggestion.
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
      standardMinutes: allocation.minutes,
      source: 'existing',
      skillRating: null,
      reason: 'Existing manager allocation preserved',
      recovery: false,
    })
  );

  const existingByTask = retainedExisting.reduce<Record<string, number>>(
    (result, allocation) => {
      result[allocation.taskName] =
        (result[allocation.taskName] || 0) + allocation.minutes;
      return result;
    },
    {}
  );

  const suggestions: SuggestedAllocation[] = [];
  const unallocatedTasks: UnallocatedTask[] = [];

  const taskTargets = buildTaskTargets(
    orderedTasks,
    totalAvailableMinutes,
    totalRequiredMinutes,
    recoveryMode
  );

  for (const task of orderedTasks) {
    const existingMinutes = existingByTask[task.name] || 0;
    const standardRemaining = Math.max(
      task.requiredMinutes - existingMinutes,
      0
    );

    if (standardRemaining <= 0) continue;

    const targetMinutes = recoveryMode
      ? taskTargets[task.name] || 0
      : standardRemaining;

    if (targetMinutes <= 0) {
      unallocatedTasks.push({
        taskName: task.name,
        remainingMinutes: standardRemaining,
      });
      continue;
    }

    const result = allocateTaskTarget(
      task,
      targetMinutes,
      standardRemaining,
      activeRoster,
      employeesById,
      capacityByEmployee,
      assignedByEmployee,
      suggestions,
      recoveryMode,
      Number.isFinite(paceMultiplier) ? paceMultiplier : 1
    );

    if (result.targetRemaining > 0 || result.standardRemaining > 0.5) {
      unallocatedTasks.push({
        taskName: task.name,
        remainingMinutes: Math.max(result.standardRemaining, 0),
      });
    }
  }

  const employeeRemainingMinutes: Record<string, number> = {};
  const employeeOverloadMinutes: Record<string, number> = {};

  for (const entry of activeRoster) {
    const capacity = capacityByEmployee[entry.employeeId] || 0;
    const assigned = assignedByEmployee[entry.employeeId] || 0;
    employeeRemainingMinutes[entry.employeeId] = Math.max(
      capacity - assigned,
      0
    );
    employeeOverloadMinutes[entry.employeeId] = Math.max(
      assigned - capacity,
      0
    );
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
    paceMultiplier:
      Number.isFinite(paceMultiplier) ? paceMultiplier : 1,
    totalRequiredMinutes,
    totalAvailableMinutes,
  };
}
