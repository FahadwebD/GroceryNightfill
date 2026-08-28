import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { NIGHT_CAPTAIN_ID } from '../utils/nightCaptainConfig';
import {
  buildEmployeePlans,
  buildTeamTaskPlans,
  calculateArrivalDifference,
  calculateLabourPosition,
  dateToNightMinutes,
  formatClock,
  formatMinutes,
  formatNightMinute,
  formatSignedMinutes,
  getTaskOrder,
  isActiveRosterEntry,
  type PlanningAllocation,
  type PlanningRosterEntry,
  type TeamTaskPlan,
} from '../utils/nightfillPlanning';
import {
  getTonightContext,
  NIGHTFILL_STORAGE,
  readNightValue,
  readStorage,
  saveNightValue,
} from '../utils/nightfillStorage';

type Employee = {
  id: string;
  name: string;
};

type LoadItem = {
  name: string;
  cartons: string;
  hours: string;
  minutes: string;
};

type NightLoad = {
  day: string;
  dateKey?: string;
  items: LoadItem[];
  totalCartons: number;
  totalRequiredMinutes: number;
  aisleMinutes: number;
  promoMinutes: number;
  protectMinutes: number;
  splittingMinutes: number;
  otherOrganisingMinutes: number;
  updatedAt?: string;
};

type LoadArrivalRecord = {
  day: string;
  expectedTime: string;
  actualTime: string | null;
  actualTimestamp: string | null;
  arrived: boolean;
  updatedAt: string;
};

type TaskStatus = 'Not Started' | 'In Progress' | 'Complete';
type ManualResult = 'On Time' | 'Ahead' | 'Behind' | 'Just Complete' | null;
type CompletionMode = 'timer' | 'manual' | null;
type StartMode = 'auto' | 'manual';

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
  startMode?: StartMode;
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
  plannedElapsedMinutes: number | null;
  plannedStartMinute: number | null;
  plannedFinishMinute: number | null;
  actualStartedAt: string | null;
  actualCompletedAt: string | null;
  startMode: StartMode | null;
  completionMode: CompletionMode;
  durationResult: string;
  timelineResult: string;
  timelineDifferenceMinutes: number | null;
};

type SavedNightReport = {
  day: string;
  dateKey: string;
  displayDate: string;
  savedAt: string;

  requiredMinutes: number;
  rosteredMinutes: number;
  breakMinutes: number;
  productiveRosterMinutes: number;
  totalCartons: number;
  splittingMinutes: number;

  expectedArrivalTime: string | null;
  actualArrivalTime: string | null;
  arrivalDelayMinutes: number | null;

  preLoadLabourMinutes: number;
  postArrivalLabourMinutes: number;
  realLabourDifferenceMinutes: number;
  coveragePercent: number;

  allocationMinutes: number;
  allocationRows: number;

  completedTasks: number;
  totalTasks: number;
  completionPercent: number;

  aheadTasks: number;
  behindTasks: number;
  onTimeTasks: number;
  noTimingTasks: number;
  netPerformanceMinutes: number;

  planAheadTasks: number;
  planBehindTasks: number;
  planOnTimeTasks: number;
  finalPlanDifferenceMinutes: number | null;

  sickCount: number;
  lateCount: number;
  noShowCount: number;
  calledInCount: number;

  nightCaptainPresent: boolean;
  nightCaptainStatus: string | null;
  nightCaptainStartTime: string | null;
  nightCaptainFinishTime: string | null;

  managerNotes: string;
  taskResults: SavedTaskResult[];
};

function employeeName(employees: Employee[], employeeId: string) {
  return (
    employees.find((employee) => employee.id === employeeId)?.name ||
    'Team member'
  );
}

function taskRequiredMinutes(load: NightLoad | null, taskName: string) {
  if (!load) return 0;
  if (taskName === 'Splitting') return load.splittingMinutes || 0;
  if (taskName === 'Other / Organising') {
    return load.otherOrganisingMinutes || 0;
  }
  if (taskName === 'Promo' && load.promoMinutes) {
    return load.promoMinutes;
  }
  if (taskName === 'Protect - Aisle' && load.protectMinutes) {
    return load.protectMinutes;
  }

  const item = load.items?.find((entry) => entry.name === taskName);
  return item
    ? (Number(item.hours) || 0) * 60 + (Number(item.minutes) || 0)
    : 0;
}

function loadTaskNames(load: NightLoad | null) {
  if (!load) return [] as string[];

  const names: string[] = [];

  if (load.splittingMinutes > 0) names.push('Splitting');

  for (const item of load.items || []) {
    const minutes =
      (Number(item.hours) || 0) * 60 +
      (Number(item.minutes) || 0);
    if (minutes > 0) names.push(item.name);
  }

  if (
    load.otherOrganisingMinutes > 0 &&
    !names.includes('Other / Organising')
  ) {
    names.push('Other / Organising');
  }
  if (load.promoMinutes > 0 && !names.includes('Promo')) {
    names.push('Promo');
  }
  if (
    load.protectMinutes > 0 &&
    !names.includes('Protect - Aisle')
  ) {
    names.push('Protect - Aisle');
  }

  return names;
}

function resultFromTimeline(difference: number | null) {
  if (difference === null) {
    return { type: 'none' as const, label: 'No completed clock result' };
  }
  if (difference > 0) {
    return {
      type: 'ahead' as const,
      label: `${formatMinutes(difference)} ahead`,
    };
  }
  if (difference < 0) {
    return {
      type: 'behind' as const,
      label: `${formatMinutes(Math.abs(difference))} behind`,
    };
  }
  return { type: 'ontime' as const, label: 'On time' };
}

export default function NightSummaryScreen() {
  const context = useMemo(() => getTonightContext(), []);
  const { date: nightfillDate, dateKey, dayName } = context;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster] = useState<PlanningRosterEntry[]>([]);
  const [load, setLoad] = useState<NightLoad | null>(null);
  const [allocations, setAllocations] = useState<PlanningAllocation[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [arrival, setArrival] = useState<LoadArrivalRecord | null>(null);
  const [managerNotes, setManagerNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const displayDate = nightfillDate.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  async function loadData() {
    try {
      setLoading(true);

      const [
        savedEmployees,
        savedRoster,
        savedLoad,
        savedAllocations,
        savedProgress,
        savedArrival,
        existingReport,
      ] = await Promise.all([
        readStorage<Employee[]>('groceryEmployees', []),
        readNightValue<PlanningRosterEntry[]>(
          NIGHTFILL_STORAGE.roster,
          dateKey,
          dayName
        ),
        readNightValue<NightLoad>(
          NIGHTFILL_STORAGE.loads,
          dateKey,
          dayName
        ),
        readNightValue<PlanningAllocation[]>(
          NIGHTFILL_STORAGE.allocations,
          dateKey,
          dayName
        ),
        readNightValue<ProgressItem[]>(
          NIGHTFILL_STORAGE.progress,
          dateKey,
          dayName
        ),
        readNightValue<LoadArrivalRecord>(
          NIGHTFILL_STORAGE.arrivals,
          dateKey,
          dayName
        ),
        readNightValue<SavedNightReport>(
          NIGHTFILL_STORAGE.reports,
          dateKey
        ),
      ]);

      setEmployees(savedEmployees);
      setRoster(savedRoster || []);
      setLoad(savedLoad || null);
      setAllocations(savedAllocations || []);
      setProgress(savedProgress || []);
      setArrival(savedArrival || null);
      setManagerNotes(existingReport?.managerNotes || '');
    } catch (error) {
      console.log('LOAD NIGHT SUMMARY ERROR:', error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const arrivalTime =
    arrival?.arrived ? arrival.actualTime : null;

  const requiredMinutes =
    load?.totalRequiredMinutes || 0;

  const labourPosition = useMemo(
    () =>
      calculateLabourPosition(
        roster,
        requiredMinutes,
        arrivalTime
      ),
    [roster, requiredMinutes, arrivalTime]
  );

  const employeePlans = useMemo(
    () =>
      buildEmployeePlans(
        roster,
        allocations,
        arrivalTime
      ),
    [roster, allocations, arrivalTime]
  );

  const teamTaskPlans = useMemo(
    () => buildTeamTaskPlans(employeePlans),
    [employeePlans]
  );

  const taskPlanMap = useMemo(
    () =>
      new Map(
        teamTaskPlans.map((plan) => [plan.taskName, plan])
      ),
    [teamTaskPlans]
  );

  const progressMap = useMemo(
    () =>
      new Map(
        progress.map((item) => [item.taskName, item])
      ),
    [progress]
  );

  const allTaskNames = useMemo(() => {
    return Array.from(
      new Set([
        ...loadTaskNames(load),
        ...teamTaskPlans.map((plan) => plan.taskName),
        ...progress.map((item) => item.taskName),
      ])
    ).sort((a, b) => getTaskOrder(a) - getTaskOrder(b));
  }, [load, teamTaskPlans, progress]);

  function buildTaskResult(
    taskName: string,
    plan: TeamTaskPlan | undefined,
    item: ProgressItem | undefined
  ): SavedTaskResult {
    const taskAllocations = allocations.filter(
      (allocation) =>
        allocation.taskName === taskName &&
        allocation.minutes > 0
    );

    const timelineDifference =
      plan && item?.status === 'Complete' && item.completedAt
        ? (() => {
            const actual = dateToNightMinutes(item.completedAt);
            return actual === null
              ? null
              : plan.plannedFinishMinute - actual;
          })()
        : null;

    const timeline = resultFromTimeline(timelineDifference);

    let durationResult = 'No measured duration';

    if (
      item?.status === 'Complete' &&
      item.actualSeconds !== null &&
      item.actualSeconds !== undefined &&
      plan
    ) {
      const plannedSeconds = plan.elapsedMinutes * 60;
      const differenceSeconds = plannedSeconds - item.actualSeconds;
      const roundedDifference = Math.round(differenceSeconds / 60);

      durationResult =
        roundedDifference > 0
          ? `${formatMinutes(roundedDifference)} faster than planned elapsed time`
          : roundedDifference < 0
            ? `${formatMinutes(Math.abs(roundedDifference))} slower than planned elapsed time`
            : 'Matched planned elapsed time';
    } else if (item?.completionMode === 'manual' && item.manualResult) {
      if (
        item.manualResult === 'Ahead' ||
        item.manualResult === 'Behind'
      ) {
        durationResult = `${formatMinutes(
          item.manualDifferenceMinutes || 0
        )} ${item.manualResult.toLowerCase()}`;
      } else {
        durationResult = item.manualResult;
      }
    }

    return {
      taskName,
      status: item?.status || 'Not Started',
      staff: taskAllocations.map((allocation) => ({
        employeeId: allocation.employeeId,
        name: employeeName(employees, allocation.employeeId),
        allocatedMinutes: allocation.minutes,
      })),
      requiredMinutes: taskRequiredMinutes(load, taskName),
      allocatedLabourMinutes: taskAllocations.reduce(
        (total, allocation) => total + allocation.minutes,
        0
      ),
      plannedElapsedMinutes: plan?.elapsedMinutes ?? null,
      plannedStartMinute: plan?.plannedStartMinute ?? null,
      plannedFinishMinute: plan?.plannedFinishMinute ?? null,
      actualStartedAt: item?.startedAt || null,
      actualCompletedAt: item?.completedAt || null,
      startMode: item?.startMode || null,
      completionMode: item?.completionMode || null,
      durationResult,
      timelineResult: timeline.label,
      timelineDifferenceMinutes: timelineDifference,
    };
  }

  const taskResults = useMemo(
    () =>
      allTaskNames.map((taskName) =>
        buildTaskResult(
          taskName,
          taskPlanMap.get(taskName),
          progressMap.get(taskName)
        )
      ),
    [
      allTaskNames,
      taskPlanMap,
      progressMap,
      allocations,
      employees,
      load,
    ]
  );

  const completedTasks = taskResults.filter(
    (task) => task.status === 'Complete'
  ).length;

  const completionPercent =
    taskResults.length > 0
      ? Math.round((completedTasks / taskResults.length) * 100)
      : 0;

  const planAheadTasks = taskResults.filter(
    (task) =>
      task.timelineDifferenceMinutes !== null &&
      task.timelineDifferenceMinutes > 0
  ).length;

  const planBehindTasks = taskResults.filter(
    (task) =>
      task.timelineDifferenceMinutes !== null &&
      task.timelineDifferenceMinutes < 0
  ).length;

  const planOnTimeTasks = taskResults.filter(
    (task) => task.timelineDifferenceMinutes === 0
  ).length;

  const netPerformanceMinutes = taskResults.reduce(
    (total, task) =>
      total + (task.timelineDifferenceMinutes || 0),
    0
  );

  const finalPlanDifferenceMinutes = useMemo(() => {
    if (
      teamTaskPlans.length === 0 ||
      completedTasks !== taskResults.length ||
      taskResults.length === 0
    ) {
      return null;
    }

    const finalPlannedFinish = Math.max(
      ...teamTaskPlans.map((plan) => plan.plannedFinishMinute)
    );

    const actualFinishes = taskResults
      .map((task) =>
        task.actualCompletedAt
          ? dateToNightMinutes(task.actualCompletedAt)
          : null
      )
      .filter((value): value is number => value !== null);

    if (actualFinishes.length === 0) return null;

    return finalPlannedFinish - Math.max(...actualFinishes);
  }, [teamTaskPlans, taskResults, completedTasks]);

  const attendance = {
    sickCount: roster.filter((entry) => entry.status === 'Sick').length,
    lateCount: roster.filter((entry) => entry.status === 'Late').length,
    noShowCount: roster.filter((entry) => entry.status === 'No Show').length,
    calledInCount: roster.filter((entry) => entry.status === 'Called In').length,
  };

  const captainEntry = roster.find(
    (entry) => entry.employeeId === NIGHT_CAPTAIN_ID
  );

  const arrivalDelayMinutes = calculateArrivalDifference(
    arrival?.expectedTime,
    arrival?.actualTime
  );

  const allocationMinutes = allocations.reduce(
    (total, allocation) =>
      total + Math.max(allocation.minutes || 0, 0),
    0
  );

  async function saveReport() {
    try {
      setSaving(true);

      const report: SavedNightReport = {
        day: dayName,
        dateKey,
        displayDate,
        savedAt: new Date().toISOString(),

        requiredMinutes,
        rosteredMinutes: labourPosition.fullRosterMinutes,
        breakMinutes: labourPosition.breakMinutes,
        productiveRosterMinutes: labourPosition.productiveRosterMinutes,
        totalCartons: load?.totalCartons || 0,
        splittingMinutes: load?.splittingMinutes || 0,

        expectedArrivalTime: arrival?.expectedTime || null,
        actualArrivalTime: arrival?.actualTime || null,
        arrivalDelayMinutes,

        preLoadLabourMinutes: labourPosition.preLoadMinutes,
        postArrivalLabourMinutes: labourPosition.postArrivalMinutes,
        realLabourDifferenceMinutes: labourPosition.differenceMinutes,
        coveragePercent: labourPosition.coveragePercent,

        allocationMinutes,
        allocationRows: allocations.length,

        completedTasks,
        totalTasks: taskResults.length,
        completionPercent,

        aheadTasks: planAheadTasks,
        behindTasks: planBehindTasks,
        onTimeTasks: planOnTimeTasks,
        noTimingTasks: taskResults.filter(
          (task) => task.timelineDifferenceMinutes === null
        ).length,
        netPerformanceMinutes,

        planAheadTasks,
        planBehindTasks,
        planOnTimeTasks,
        finalPlanDifferenceMinutes,

        ...attendance,

        nightCaptainPresent: Boolean(captainEntry),
        nightCaptainStatus: captainEntry?.status || null,
        nightCaptainStartTime: captainEntry?.startTime || null,
        nightCaptainFinishTime: captainEntry?.finishTime || null,

        managerNotes: managerNotes.trim(),
        taskResults,
      };

      await saveNightValue(
        NIGHTFILL_STORAGE.reports,
        dateKey,
        report
      );

      Alert.alert(
        'Night Saved',
        `${displayDate}\n\nCompletion: ${completionPercent}%\nLabour position: ${formatSignedMinutes(
          labourPosition.differenceMinutes
        )}`,
        [
          {
            text: 'View History',
            onPress: () => router.push('/history'),
          },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      console.log('SAVE NIGHT REPORT ERROR:', error);
      Alert.alert('Save Failed', 'Could not save tonight’s report.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Building Night Summary…</Text>
      </View>
    );
  }

  const activeTeam = roster.filter(isActiveRosterEntry).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Tonight</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>Night Summary</Text>
        <Text style={styles.subtitle}>{displayDate} · {dateKey}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroLabel}>NIGHT COMPLETION</Text>
            <Text style={styles.heroValue}>{completionPercent}%</Text>
          </View>
          <View style={styles.heroRight}>
            <Text style={styles.heroSmall}>Tasks</Text>
            <Text style={styles.heroTaskValue}>
              {completedTasks}/{taskResults.length}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Load & Labour</Text>
        <View style={styles.card}>
          <SummaryRow label="Load required" value={formatMinutes(requiredMinutes)} />
          <SummaryRow label="Gross roster" value={formatMinutes(labourPosition.fullRosterMinutes)} />
          <SummaryRow label="Reserved breaks" value={`-${formatMinutes(labourPosition.breakMinutes)}`} tone="warning" />
          <SummaryRow label="Productive roster" value={formatMinutes(labourPosition.productiveRosterMinutes)} tone="primary" />
          {arrival?.arrived ? (
            <>
              <SummaryRow label="Labour before load" value={formatMinutes(labourPosition.preLoadMinutes)} />
              <SummaryRow label="Available after arrival" value={formatMinutes(labourPosition.postArrivalMinutes)} tone="primary" />
            </>
          ) : null}
          <View style={styles.divider} />
          <SummaryRow
            label={labourPosition.differenceMinutes < 0 ? 'REAL SHORTAGE' : 'REAL SURPLUS'}
            value={formatSignedMinutes(labourPosition.differenceMinutes)}
            tone={labourPosition.differenceMinutes < 0 ? 'danger' : 'good'}
          />
          <SummaryRow label="Coverage" value={`${labourPosition.coveragePercent}%`} />
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Cartons" value={String(load?.totalCartons || 0)} />
          <StatCard label="Team" value={String(activeTeam)} />
          <StatCard label="Allocated" value={formatMinutes(allocationMinutes)} />
          <StatCard label="Splitting" value={formatMinutes(load?.splittingMinutes || 0)} />
        </View>

        <Text style={styles.sectionTitle}>Load Arrival</Text>
        <View style={styles.card}>
          <SummaryRow label="Expected" value={formatClock(arrival?.expectedTime)} />
          <SummaryRow label="Actual" value={formatClock(arrival?.actualTime)} />
          <SummaryRow
            label="Difference"
            value={
              arrivalDelayMinutes === null
                ? '—'
                : arrivalDelayMinutes > 0
                  ? `${formatMinutes(arrivalDelayMinutes)} late`
                  : arrivalDelayMinutes < 0
                    ? `${formatMinutes(Math.abs(arrivalDelayMinutes))} early`
                    : 'On time'
            }
            tone={
              arrivalDelayMinutes !== null && arrivalDelayMinutes > 0
                ? 'warning'
                : 'good'
            }
          />
        </View>

        <Text style={styles.sectionTitle}>Attendance</Text>
        <View style={styles.statGrid}>
          <StatCard label="Sick" value={String(attendance.sickCount)} />
          <StatCard label="Late" value={String(attendance.lateCount)} />
          <StatCard label="No Show" value={String(attendance.noShowCount)} />
          <StatCard label="Called In" value={String(attendance.calledInCount)} />
        </View>

        {captainEntry ? (
          <>
            <Text style={styles.sectionTitle}>Night Captain</Text>
            <View style={styles.captainCard}>
              <View>
                <Text style={styles.captainTitle}>Night Captain</Text>
                <Text style={styles.captainMeta}>{captainEntry.status}</Text>
              </View>
              <Text style={styles.captainTime}>
                {formatClock(captainEntry.startTime)} → {formatClock(captainEntry.finishTime)}
              </Text>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Task Performance</Text>
        {taskResults.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No task plan yet</Text>
            <Text style={styles.emptyText}>
              Save the final allocation to create a full task timeline.
            </Text>
          </View>
        ) : (
          taskResults.map((task) => (
            <View key={task.taskName} style={styles.taskCard}>
              <View style={styles.taskTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskName}>{task.taskName}</Text>
                  <Text style={styles.taskStaff}>
                    {task.staff.length > 0
                      ? task.staff
                          .map((staff) => `${staff.name} ${formatMinutes(staff.allocatedMinutes)}`)
                          .join(' · ')
                      : 'No staff allocation'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    task.status === 'Complete'
                      ? styles.completeBadge
                      : task.status === 'In Progress'
                        ? styles.progressBadge
                        : styles.waitingBadge,
                  ]}
                >
                  <Text style={styles.statusText}>{task.status}</Text>
                </View>
              </View>

              <View style={styles.taskMetaRow}>
                <Text style={styles.taskMeta}>
                  Labour {formatMinutes(task.allocatedLabourMinutes)}
                </Text>
                <Text style={styles.taskMeta}>
                  Elapsed {task.plannedElapsedMinutes === null ? '—' : formatMinutes(task.plannedElapsedMinutes)}
                </Text>
              </View>

              {task.plannedStartMinute !== null && task.plannedFinishMinute !== null ? (
                <Text style={styles.planLine}>
                  Plan {formatNightMinute(task.plannedStartMinute)} → {formatNightMinute(task.plannedFinishMinute)}
                </Text>
              ) : null}

              <Text
                style={[
                  styles.resultLine,
                  task.timelineDifferenceMinutes !== null && task.timelineDifferenceMinutes < 0
                    ? styles.behindText
                    : task.timelineDifferenceMinutes !== null
                      ? styles.aheadText
                      : undefined,
                ]}
              >
                {task.timelineResult}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Manager Notes</Text>
        <TextInput
          value={managerNotes}
          onChangeText={setManagerNotes}
          multiline
          placeholder="Operational notes only, e.g. late pallet, equipment issue, recovery action…"
          style={styles.notesInput}
          textAlignVertical="top"
        />
        <Text style={styles.notesHelp}>
          Keep notes operational. Avoid unnecessary medical or sensitive personal details.
        </Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabledButton]}
          disabled={saving}
          onPress={saveReport}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving Night…' : 'Save Night to History'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.historyText}>View History →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'good' | 'danger' | 'warning';
}) {
  const toneStyle =
    tone === 'primary'
      ? styles.primaryText
      : tone === 'good'
        ? styles.goodText
        : tone === 'danger'
          ? styles.dangerText
          : tone === 'warning'
            ? styles.warningText
            : undefined;

  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, toneStyle]}>{value}</Text>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FA',
  },
  muted: { color: '#667085' },
  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  back: { color: '#D5DBED', fontSize: 14, marginBottom: 12 },
  eyebrow: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 5 },
  content: { padding: 16, paddingBottom: 55 },
  heroCard: {
    backgroundColor: '#101D48',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: { color: '#AEB9DD', fontSize: 8, fontWeight: '800' },
  heroValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 4 },
  heroRight: { alignItems: 'flex-end' },
  heroSmall: { color: '#AEB9DD', fontSize: 8 },
  heroTaskValue: { color: '#8EE1B4', fontSize: 20, fontWeight: '900', marginTop: 3 },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 9,
  },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  summaryLabel: { color: '#667085', fontSize: 10 },
  summaryValue: { color: '#101828', fontSize: 12, fontWeight: '800' },
  primaryText: { color: '#2436B2' },
  goodText: { color: '#168455' },
  dangerText: { color: '#D92D20' },
  warningText: { color: '#B54708' },
  divider: { height: 1, backgroundColor: '#EAECF0', marginVertical: 5 },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 9,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
  },
  statLabel: { color: '#667085', fontSize: 8 },
  statValue: { color: '#101D48', fontSize: 17, fontWeight: '800', marginTop: 4 },
  captainCard: {
    backgroundColor: '#F0ECFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D8D0FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  captainTitle: { color: '#4C3BCF', fontSize: 13, fontWeight: '800' },
  captainMeta: { color: '#6F6693', fontSize: 9, marginTop: 3 },
  captainTime: { color: '#4C3BCF', fontSize: 11, fontWeight: '800' },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
  },
  taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskName: { color: '#101828', fontSize: 13, fontWeight: '800' },
  taskStaff: { color: '#667085', fontSize: 8, lineHeight: 13, marginTop: 3 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  completeBadge: { backgroundColor: '#E8F8EF' },
  progressBadge: { backgroundColor: '#E9ECFF' },
  waitingBadge: { backgroundColor: '#F2F4F7' },
  statusText: { color: '#344054', fontSize: 7, fontWeight: '900' },
  taskMetaRow: { flexDirection: 'row', gap: 14, marginTop: 10 },
  taskMeta: { color: '#475467', fontSize: 9, fontWeight: '700' },
  planLine: { color: '#667085', fontSize: 9, marginTop: 6 },
  resultLine: { color: '#667085', fontSize: 10, fontWeight: '800', marginTop: 5 },
  aheadText: { color: '#168455' },
  behindText: { color: '#D92D20' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16 },
  emptyTitle: { color: '#101828', fontSize: 13, fontWeight: '800' },
  emptyText: { color: '#667085', fontSize: 9, lineHeight: 14, marginTop: 4 },
  notesInput: {
    minHeight: 110,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    color: '#101828',
    fontSize: 11,
    lineHeight: 17,
  },
  notesHelp: { color: '#98A2B3', fontSize: 8, lineHeight: 13, marginTop: 6 },
  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: { opacity: 0.5 },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  historyButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  historyText: { color: '#2436B2', fontSize: 12, fontWeight: '800' },
});
