import {
  calculateAvailableAfterLoad,
  getShiftWindow,
  getTaskOrder,
  isActiveRosterEntry,
  type PlanningAllocation,
  type PlanningRosterEntry,
} from './nightfillPlanning';

export type OwnershipEmployee = {
  id: string;
  name: string;
  aisleSkills?: Record<string, number>;
};

export type OwnershipTask = {
  name: string;
  requiredMinutes: number;
  type: 'splitting' | 'aisle' | 'promo' | 'protect' | 'other';
};

export type OwnershipSuggestion = PlanningAllocation & {
  reason: string;
  standardMinutes: number;
  projectedEmployeeMinutes: number;
  availableMinutes: number;
  stretchMinutes: number;
  needsManagerHelp: boolean;
  managerHelpMinutes: number;
  skillRating: number;
  aisleOwner: boolean;
};

export type OwnershipResult = {
  allocations: OwnershipSuggestion[];
  employeeAvailableMinutes: Record<string, number>;
  employeeAssignedMinutes: Record<string, number>;
  employeeAisleCount: Record<string, number>;
  totalRequiredMinutes: number;
  totalAvailableMinutes: number;
  shortageMinutes: number;
  compactAisleMode: boolean;
  managerHelpRequired: boolean;
  managerHelpMinutes: number;
  helpItems: {
    employeeId: string;
    taskName: string;
    minutes: number;
  }[];
};

const AISLE_STRETCH_MINUTES = 30;
const COMPACT_LOAD_MINUTES = 4 * 60;

function aisleSkill(employee: OwnershipEmployee | undefined, taskName: string) {
  if (!taskName.startsWith('Aisle ')) return 0;
  return Math.max(
    Math.min(Number(employee?.aisleSkills?.[taskName]) || 0, 5),
    0
  );
}

function addAllocation(
  allocations: OwnershipSuggestion[],
  next: OwnershipSuggestion
) {
  const existing = allocations.find(
    (item) =>
      item.employeeId === next.employeeId &&
      item.taskName === next.taskName
  );

  if (existing) {
    existing.minutes += next.minutes;
    existing.standardMinutes += next.standardMinutes;
    existing.projectedEmployeeMinutes = next.projectedEmployeeMinutes;
    existing.stretchMinutes = next.stretchMinutes;
    existing.needsManagerHelp = next.needsManagerHelp;
    existing.managerHelpMinutes = next.managerHelpMinutes;
    existing.reason = next.reason;
    return;
  }

  allocations.push(next);
}

export function buildAisleOwnershipPlan({
  employees,
  roster,
  tasks,
  loadArrivalTime,
}: {
  employees: OwnershipEmployee[];
  roster: PlanningRosterEntry[];
  tasks: OwnershipTask[];
  loadArrivalTime?: string | null;
}): OwnershipResult {
  const activeRoster = roster
    .filter(isActiveRosterEntry)
    .filter(
      (entry) =>
        calculateAvailableAfterLoad(entry, loadArrivalTime) > 0
    );

  const employeeMap = new Map(
    employees.map((employee) => [employee.id, employee])
  );

  const employeeAvailableMinutes: Record<string, number> = {};
  const employeeAssignedMinutes: Record<string, number> = {};
  const employeeAisleCount: Record<string, number> = {};

  for (const entry of activeRoster) {
    const available = calculateAvailableAfterLoad(entry, loadArrivalTime);
    employeeAvailableMinutes[entry.employeeId] = available;
    employeeAssignedMinutes[entry.employeeId] = 0;
    employeeAisleCount[entry.employeeId] = 0;
  }

  const orderedTasks = [...tasks]
    .filter((task) => task.requiredMinutes > 0)
    .sort((a, b) => getTaskOrder(a.name) - getTaskOrder(b.name));

  const totalRequiredMinutes = orderedTasks.reduce(
    (total, task) => total + task.requiredMinutes,
    0
  );
  const totalAvailableMinutes = activeRoster.reduce(
    (total, entry) =>
      total + (employeeAvailableMinutes[entry.employeeId] || 0),
    0
  );
  const shortageMinutes = Math.max(
    totalRequiredMinutes - totalAvailableMinutes,
    0
  );

  const aisleRequiredMinutes = orderedTasks
    .filter((task) => task.type === 'aisle')
    .reduce((total, task) => total + task.requiredMinutes, 0);

  const compactAisleMode = aisleRequiredMinutes <= COMPACT_LOAD_MINUTES;
  const allocations: OwnershipSuggestion[] = [];

  function scoreCandidate(
    entry: PlanningRosterEntry,
    task: OwnershipTask
  ) {
    const employeeId = entry.employeeId;
    const employee = employeeMap.get(employeeId);
    const available = employeeAvailableMinutes[employeeId] || 0;
    const assigned = employeeAssignedMinutes[employeeId] || 0;
    const projected = assigned + task.requiredMinutes;
    const projectedOverrun = Math.max(projected - available, 0);
    const aisleCount = employeeAisleCount[employeeId] || 0;
    const skill = aisleSkill(employee, task.name);

    let score = 0;

    if (task.type === 'aisle') {
      score += skill * 140;

      /*
       * Main operating rule:
       * keep one clear aisle owner whenever possible.
       * A standard estimate up to 30m beyond their remaining shift is an
       * acceptable stretch because real teams often finish ahead of standard.
       */
      if (projectedOverrun === 0) score += 500;
      else if (projectedOverrun <= AISLE_STRETCH_MINUTES) score += 330;
      else score -= 500 + projectedOverrun * 4;

      /* Light load: prefer two aisles per person before spreading further. */
      if (compactAisleMode) {
        if (aisleCount === 1) score += 220;
        else if (aisleCount === 0) score += 80;
        else score -= 180 * (aisleCount - 1);
      } else {
        /* Normal/heavy night: distribute primary aisle ownership across team. */
        if (aisleCount === 0) score += 180;
        else score -= aisleCount * 90;
      }
    } else {
      const remaining = Math.max(available - assigned, 0);
      score += remaining * 0.8;
    }

    const loadRatio = available > 0 ? assigned / available : 99;
    score -= loadRatio * 120;
    score += Math.max(available - assigned, 0) * 0.25;
    score -= getShiftWindow(entry).startMinute / 100000;

    return {
      score,
      employeeId,
      available,
      assigned,
      projected,
      projectedOverrun,
      aisleCount,
      skill,
    };
  }

  function bestCandidate(task: OwnershipTask) {
    const scored = activeRoster.map((entry) => scoreCandidate(entry, task));
    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score;
      if (a.projectedOverrun !== b.projectedOverrun) {
        return a.projectedOverrun - b.projectedOverrun;
      }
      return (
        employeeMap.get(a.employeeId)?.name || ''
      ).localeCompare(employeeMap.get(b.employeeId)?.name || '');
    });
    return scored[0] || null;
  }

  /*
   * Splitting is shared because it is a team activity.
   */
  const splitting = orderedTasks.find((task) => task.type === 'splitting');
  if (splitting && activeRoster.length > 0) {
    let remaining = splitting.requiredMinutes;
    const candidates = [...activeRoster].sort((a, b) => {
      const aAvailable = employeeAvailableMinutes[a.employeeId] || 0;
      const bAvailable = employeeAvailableMinutes[b.employeeId] || 0;
      return bAvailable - aAvailable;
    });

    while (remaining > 0) {
      let changed = false;
      for (const entry of candidates) {
        if (remaining <= 0) break;

        const available = employeeAvailableMinutes[entry.employeeId] || 0;
        const assigned = employeeAssignedMinutes[entry.employeeId] || 0;
        const remainingCapacity = Math.max(available - assigned, 0);
        if (remainingCapacity <= 0) continue;

        const share = Math.min(
          15,
          remaining,
          remainingCapacity
        );
        if (share <= 0) continue;

        const projected = assigned + share;
        addAllocation(allocations, {
          employeeId: entry.employeeId,
          taskName: splitting.name,
          minutes: share,
          standardMinutes: share,
          projectedEmployeeMinutes: projected,
          availableMinutes: available,
          stretchMinutes: 0,
          needsManagerHelp: false,
          managerHelpMinutes: 0,
          skillRating: 0,
          aisleOwner: false,
          reason: 'Shared splitting before aisle ownership',
        });
        employeeAssignedMinutes[entry.employeeId] = projected;
        remaining -= share;
        changed = true;
      }

      if (!changed) break;
    }
  }

  /*
   * Give every aisle one primary owner. Do not split the aisle just because
   * the Fill Assist estimate is 20–30m above their remaining shift.
   */
  for (const task of orderedTasks.filter((item) => item.type === 'aisle')) {
    const candidate = bestCandidate(task);
    if (!candidate) continue;

    const stretchMinutes = Math.max(
      candidate.projected - candidate.available,
      0
    );
    const needsManagerHelp = stretchMinutes > AISLE_STRETCH_MINUTES;
    const managerHelpMinutes = needsManagerHelp
      ? stretchMinutes - AISLE_STRETCH_MINUTES
      : 0;

    const employee = employeeMap.get(candidate.employeeId);
    const reason = needsManagerHelp
      ? `Primary aisle owner · estimated ${stretchMinutes}m beyond remaining shift · Nightfill Manager help suggested for ${managerHelpMinutes}m+`
      : stretchMinutes > 0
        ? `Primary aisle owner · ${stretchMinutes}m standard-time stretch accepted`
        : candidate.skill > 0
          ? `Primary aisle owner · skill ${candidate.skill}/5`
          : 'Primary aisle owner · balanced by remaining shift time';

    addAllocation(allocations, {
      employeeId: candidate.employeeId,
      taskName: task.name,
      minutes: task.requiredMinutes,
      standardMinutes: task.requiredMinutes,
      projectedEmployeeMinutes: candidate.projected,
      availableMinutes: candidate.available,
      stretchMinutes,
      needsManagerHelp,
      managerHelpMinutes,
      skillRating: candidate.skill,
      aisleOwner: true,
      reason,
    });

    employeeAssignedMinutes[candidate.employeeId] = candidate.projected;
    employeeAisleCount[candidate.employeeId] =
      (employeeAisleCount[candidate.employeeId] || 0) + 1;
  }

  /* Promo / Protect / Other go to the best remaining-fit employee. */
  for (const task of orderedTasks.filter(
    (item) => item.type !== 'aisle' && item.type !== 'splitting'
  )) {
    const candidate = bestCandidate(task);
    if (!candidate) continue;

    const remainingCapacity = Math.max(
      candidate.available - candidate.assigned,
      0
    );
    const minutes = Math.min(task.requiredMinutes, remainingCapacity);
    if (minutes <= 0) continue;

    const projected = candidate.assigned + minutes;
    addAllocation(allocations, {
      employeeId: candidate.employeeId,
      taskName: task.name,
      minutes,
      standardMinutes: minutes,
      projectedEmployeeMinutes: projected,
      availableMinutes: candidate.available,
      stretchMinutes: 0,
      needsManagerHelp: false,
      managerHelpMinutes: 0,
      skillRating: 0,
      aisleOwner: false,
      reason: 'Best remaining productive labour fit',
    });
    employeeAssignedMinutes[candidate.employeeId] = projected;
  }

  const helpItems = allocations
    .filter((item) => item.needsManagerHelp)
    .map((item) => ({
      employeeId: item.employeeId,
      taskName: item.taskName,
      minutes: item.managerHelpMinutes,
    }));

  const managerHelpMinutes = helpItems.reduce(
    (total, item) => total + item.minutes,
    0
  );

  return {
    allocations,
    employeeAvailableMinutes,
    employeeAssignedMinutes,
    employeeAisleCount,
    totalRequiredMinutes,
    totalAvailableMinutes,
    shortageMinutes,
    compactAisleMode,
    managerHelpRequired: helpItems.length > 0,
    managerHelpMinutes,
    helpItems,
  };
}

export const AISLE_OWNERSHIP_STRETCH_MINUTES = AISLE_STRETCH_MINUTES;
