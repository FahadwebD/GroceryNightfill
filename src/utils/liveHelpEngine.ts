import {
  dateToNightMinutes,
  getShiftWindow,
  type EmployeeNightPlan,
  type PlanningRosterEntry,
  type TeamTaskPlan,
} from './nightfillPlanning';

export type LiveProgressLike = {
  taskName: string;
  status: 'Not Started' | 'In Progress' | 'Complete';
  completedAt?: string | null;
};

export type LiveHelpAction = {
  id: string;
  helperEmployeeId: string;
  fromTaskName: string | null;
  toTaskName: string;
  minutes: number;
  status: 'active' | 'complete' | 'cancelled';
  assignedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  source: 'auto' | 'manual';
};

export type LiveHelpEmployee = {
  id: string;
  name: string;
  aisleSkills?: Record<string, number>;
};

export type LiveHelpSuggestion = {
  helperEmployeeId: string;
  helperName: string;
  fromTaskName: string | null;
  toTaskName: string;
  suggestedMinutes: number;
  helperFreeMinutes: number;
  targetNeedMinutes: number;
  targetBeyondToleranceMinutes: number;
  targetReason: string;
  helperReason: string;
};

export type LiveHelpResult = {
  suggestions: LiveHelpSuggestion[];
  helpNeededTasks: {
    taskName: string;
    needMinutes: number;
    beyondToleranceMinutes: number;
    reason: string;
  }[];
  helperFreeMinutes: Record<string, number>;
};

export const MANAGER_HELP_TOLERANCE_MINUTES = 30;

function taskProgressMap(progress: LiveProgressLike[]) {
  return new Map(progress.map((item) => [item.taskName, item]));
}

function employeePlanMap(employeePlans: EmployeeNightPlan[]) {
  return new Map(employeePlans.map((plan) => [plan.employeeId, plan]));
}

function mostRecentCompletedTask(
  employeeId: string,
  employeePlans: EmployeeNightPlan[],
  progressMap: Map<string, LiveProgressLike>
) {
  const plan = employeePlans.find((item) => item.employeeId === employeeId);
  if (!plan) return null;

  const completed = plan.tasks
    .map((task) => {
      const item = progressMap.get(task.taskName);
      const completedMinute = item?.completedAt
        ? dateToNightMinutes(item.completedAt)
        : null;
      return {
        taskName: task.taskName,
        completedMinute,
      };
    })
    .filter(
      (item): item is { taskName: string; completedMinute: number } =>
        item.completedMinute !== null
    )
    .sort((a, b) => b.completedMinute - a.completedMinute);

  return completed[0]?.taskName || null;
}

function calculateHelperFreeMinutes({
  employeePlan,
  currentMinute,
  progressMap,
  activeHelpMinutes,
}: {
  employeePlan: EmployeeNightPlan;
  currentMinute: number;
  progressMap: Map<string, LiveProgressLike>;
  activeHelpMinutes: number;
}) {
  if (currentMinute < employeePlan.shiftStartMinute) return 0;
  if (currentMinute >= employeePlan.productiveFinishMinute) return 0;

  const productiveTimeRemaining = Math.max(
    employeePlan.productiveFinishMinute - currentMinute,
    0
  );

  const remainingPlannedWork = employeePlan.tasks.reduce((total, task) => {
    const status = progressMap.get(task.taskName)?.status;
    if (status === 'Complete') return total;

    if (task.plannedFinishMinute <= currentMinute) {
      return total;
    }

    if (task.plannedStartMinute <= currentMinute) {
      return total + Math.max(task.plannedFinishMinute - currentMinute, 0);
    }

    return total + task.minutes;
  }, 0);

  return Math.max(
    productiveTimeRemaining - remainingPlannedWork - activeHelpMinutes,
    0
  );
}

function projectedTaskNeed({
  taskPlan,
  currentMinute,
  progressMap,
  roster,
  employeePlans,
}: {
  taskPlan: TeamTaskPlan;
  currentMinute: number;
  progressMap: Map<string, LiveProgressLike>;
  roster: PlanningRosterEntry[];
  employeePlans: EmployeeNightPlan[];
}) {
  const progress = progressMap.get(taskPlan.taskName);
  if (progress?.status === 'Complete') {
    return null;
  }

  const employeePlansById = employeePlanMap(employeePlans);

  const ownerProductiveFinishes = taskPlan.employeeIds
    .map((employeeId) => {
      const plan = employeePlansById.get(employeeId);
      if (plan) return plan.productiveFinishMinute;

      const entry = roster.find((item) => item.employeeId === employeeId);
      return entry ? getShiftWindow(entry).productiveFinishMinute : null;
    })
    .filter((value): value is number => value !== null);

  const ownerDeadline =
    ownerProductiveFinishes.length > 0
      ? Math.max(...ownerProductiveFinishes)
      : taskPlan.plannedFinishMinute;

  const projectedOverrun = Math.max(
    taskPlan.plannedFinishMinute - ownerDeadline,
    0
  );

  const liveBehind =
    progress?.status === 'In Progress'
      ? Math.max(currentMinute - taskPlan.plannedFinishMinute, 0)
      : 0;

  const needMinutes = Math.max(projectedOverrun, liveBehind);
  const beyondToleranceMinutes = Math.max(
    needMinutes - MANAGER_HELP_TOLERANCE_MINUTES,
    0
  );

  if (beyondToleranceMinutes <= 0) {
    return null;
  }

  const reason =
    liveBehind >= projectedOverrun && liveBehind > 0
      ? `${liveBehind}m behind the planned finish`
      : `${projectedOverrun}m beyond the owner’s productive shift window`;

  return {
    taskName: taskPlan.taskName,
    needMinutes,
    beyondToleranceMinutes,
    reason,
  };
}

function skillForTask(
  employee: LiveHelpEmployee | undefined,
  taskName: string
) {
  if (!taskName.startsWith('Aisle ')) return 0;
  return Math.max(
    Math.min(Number(employee?.aisleSkills?.[taskName]) || 0, 5),
    0
  );
}

export function buildLiveHelpSuggestions({
  employees,
  roster,
  employeePlans,
  taskPlans,
  progress,
  helpActions,
  currentMinute,
  forceTaskName,
}: {
  employees: LiveHelpEmployee[];
  roster: PlanningRosterEntry[];
  employeePlans: EmployeeNightPlan[];
  taskPlans: TeamTaskPlan[];
  progress: LiveProgressLike[];
  helpActions: LiveHelpAction[];
  currentMinute: number;
  forceTaskName?: string | null;
}): LiveHelpResult {
  const progressMap = taskProgressMap(progress);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));

  const activeHelpByEmployee = helpActions
    .filter((action) => action.status === 'active')
    .reduce<Record<string, number>>((result, action) => {
      result[action.helperEmployeeId] =
        (result[action.helperEmployeeId] || 0) + action.minutes;
      return result;
    }, {});

  const helperFreeMinutes: Record<string, number> = {};

  for (const plan of employeePlans) {
    helperFreeMinutes[plan.employeeId] = calculateHelperFreeMinutes({
      employeePlan: plan,
      currentMinute,
      progressMap,
      activeHelpMinutes: activeHelpByEmployee[plan.employeeId] || 0,
    });
  }

  const automaticNeeds = taskPlans
    .map((taskPlan) =>
      projectedTaskNeed({
        taskPlan,
        currentMinute,
        progressMap,
        roster,
        employeePlans,
      })
    )
    .filter(
      (
        value
      ): value is {
        taskName: string;
        needMinutes: number;
        beyondToleranceMinutes: number;
        reason: string;
      } => value !== null
    );

  const needsByTask = new Map(
    automaticNeeds.map((item) => [item.taskName, item])
  );

  if (forceTaskName && !needsByTask.has(forceTaskName)) {
    const taskPlan = taskPlans.find((item) => item.taskName === forceTaskName);
    if (taskPlan && progressMap.get(forceTaskName)?.status !== 'Complete') {
      needsByTask.set(forceTaskName, {
        taskName: forceTaskName,
        needMinutes: 15,
        beyondToleranceMinutes: 15,
        reason: 'Manager requested help review',
      });
    }
  }

  const helpNeededTasks = [...needsByTask.values()].sort(
    (a, b) => b.beyondToleranceMinutes - a.beyondToleranceMinutes
  );

  const suggestions: LiveHelpSuggestion[] = [];
  const remainingHelperFree = { ...helperFreeMinutes };

  for (const need of helpNeededTasks) {
    const taskPlan = taskPlans.find((item) => item.taskName === need.taskName);
    if (!taskPlan) continue;

    let remainingNeed = Math.max(need.beyondToleranceMinutes, 0);

    while (remainingNeed > 0) {
      const candidates = employeePlans
        .filter((plan) => !taskPlan.employeeIds.includes(plan.employeeId))
        .map((plan) => {
          const free = remainingHelperFree[plan.employeeId] || 0;
          const employee = employeesById.get(plan.employeeId);
          const skill = skillForTask(employee, need.taskName);
          const fromTaskName = mostRecentCompletedTask(
            plan.employeeId,
            employeePlans,
            progressMap
          );
          const alreadyHelpingTarget = helpActions.some(
            (action) =>
              action.status === 'active' &&
              action.helperEmployeeId === plan.employeeId &&
              action.toTaskName === need.taskName
          );

          const score =
            skill * 150 +
            free * 2 +
            (fromTaskName ? 120 : 0);

          return {
            plan,
            employee,
            free,
            skill,
            fromTaskName,
            alreadyHelpingTarget,
            score,
          };
        })
        .filter(
          (candidate) =>
            candidate.free > 0 &&
            !candidate.alreadyHelpingTarget
        )
        .sort((a, b) => b.score - a.score);

      const candidate = candidates[0];
      if (!candidate) break;

      const suggestedMinutes = Math.min(
        Math.max(Math.min(remainingNeed, 30), 15),
        candidate.free,
        remainingNeed
      );

      if (suggestedMinutes <= 0) break;

      suggestions.push({
        helperEmployeeId: candidate.plan.employeeId,
        helperName: candidate.employee?.name || 'Team member',
        fromTaskName: candidate.fromTaskName,
        toTaskName: need.taskName,
        suggestedMinutes,
        helperFreeMinutes: candidate.free,
        targetNeedMinutes: need.needMinutes,
        targetBeyondToleranceMinutes: need.beyondToleranceMinutes,
        targetReason: need.reason,
        helperReason: candidate.fromTaskName
          ? `Finished ${candidate.fromTaskName} and has ${Math.round(candidate.free)}m spare`
          : `Has ${Math.round(candidate.free)}m spare productive shift time`,
      });

      remainingHelperFree[candidate.plan.employeeId] = Math.max(
        candidate.free - suggestedMinutes,
        0
      );
      remainingNeed -= suggestedMinutes;
    }
  }

  return {
    suggestions,
    helpNeededTasks,
    helperFreeMinutes,
  };
}

export function createLiveHelpAction(
  suggestion: LiveHelpSuggestion,
  source: 'auto' | 'manual' = 'auto'
): LiveHelpAction {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    helperEmployeeId: suggestion.helperEmployeeId,
    fromTaskName: suggestion.fromTaskName,
    toTaskName: suggestion.toTaskName,
    minutes: Math.max(Math.round(suggestion.suggestedMinutes), 1),
    status: 'active',
    assignedAt: new Date().toISOString(),
    completedAt: null,
    cancelledAt: null,
    source,
  };
}
