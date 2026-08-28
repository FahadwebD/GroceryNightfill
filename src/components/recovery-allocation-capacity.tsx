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

import {
  buildAllocationSuggestions,
  type SuggestedAllocation,
} from '../utils/allocationSuggestions';
import {
  calculateAvailableAfterLoad,
  calculateLabourPosition,
  calculatePreLoadMinutes,
  formatClock,
  formatMinutes,
  formatSignedMinutes,
  getTaskOrder,
  isActiveRosterEntry,
  type PlanningAllocation,
  type PlanningRosterEntry,
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
  aisleSkills?: Record<string, number>;
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
};

type LoadArrivalRecord = {
  day: string;
  expectedTime: string;
  actualTime: string | null;
  actualTimestamp: string | null;
  arrived: boolean;
  updatedAt: string;
};

type Task = {
  name: string;
  requiredMinutes: number;
  type: 'splitting' | 'aisle' | 'promo' | 'protect' | 'other';
};

type RecoveryAllocation = PlanningAllocation & {
  standardMinutes?: number;
  recoveryPacePercent?: number;
};

function parseAllocationInput(value: string) {
  const text = value.trim();
  if (!text) return 0;

  if (text.includes(':')) {
    const [hourText, minuteText = '0'] = text.split(':');
    const hours = Number(hourText) || 0;
    const minutes = Number(minuteText) || 0;
    if (minutes < 0 || minutes > 59) return 0;
    return Math.max(Math.round(hours * 60 + minutes), 0);
  }

  const number = Number(text);
  if (Number.isNaN(number) || number < 0) return 0;

  /* Decimal input keeps the existing editor convention: 1.5 = 1.5 hours. */
  return text.includes('.')
    ? Math.round(number * 60)
    : Math.round(number);
}

function buildTasks(load: NightLoad | null): Task[] {
  if (!load) return [];
  const result: Task[] = [];

  if (load.splittingMinutes > 0) {
    result.push({
      name: 'Splitting',
      requiredMinutes: load.splittingMinutes,
      type: 'splitting',
    });
  }

  for (const item of load.items || []) {
    const minutes =
      (Number(item.hours) || 0) * 60 +
      (Number(item.minutes) || 0);
    if (minutes <= 0) continue;

    let type: Task['type'] = 'aisle';
    if (item.name === 'Promo') type = 'promo';
    if (item.name === 'Protect - Aisle') type = 'protect';

    result.push({ name: item.name, requiredMinutes: minutes, type });
  }

  if (
    load.promoMinutes > 0 &&
    !result.some((task) => task.name === 'Promo')
  ) {
    result.push({
      name: 'Promo',
      requiredMinutes: load.promoMinutes,
      type: 'promo',
    });
  }

  if (
    load.protectMinutes > 0 &&
    !result.some((task) => task.name === 'Protect - Aisle')
  ) {
    result.push({
      name: 'Protect - Aisle',
      requiredMinutes: load.protectMinutes,
      type: 'protect',
    });
  }

  if (
    load.otherOrganisingMinutes > 0 &&
    !result.some((task) => task.name === 'Other / Organising')
  ) {
    result.push({
      name: 'Other / Organising',
      requiredMinutes: load.otherOrganisingMinutes,
      type: 'other',
    });
  }

  return result.sort(
    (a, b) => getTaskOrder(a.name) - getTaskOrder(b.name)
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function CapacitySafeRecoveryAllocationScreen() {
  const context = useMemo(() => getTonightContext(), []);
  const { dateKey, dayName } = context;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster] = useState<PlanningRosterEntry[]>([]);
  const [load, setLoad] = useState<NightLoad | null>(null);
  const [savedAllocations, setSavedAllocations] =
    useState<RecoveryAllocation[]>([]);
  const [arrival, setArrival] = useState<LoadArrivalRecord | null>(null);
  const [inputValues, setInputValues] =
    useState<Record<string, string>>({});
  const [standardValues, setStandardValues] =
    useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      const [
        savedEmployees,
        savedRoster,
        savedLoad,
        allocations,
        savedArrival,
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
        readNightValue<RecoveryAllocation[]>(
          NIGHTFILL_STORAGE.allocations,
          dateKey,
          dayName
        ),
        readNightValue<LoadArrivalRecord>(
          NIGHTFILL_STORAGE.arrivals,
          dateKey,
          dayName
        ),
      ]);

      const nextInputs: Record<string, string> = {};
      const nextStandard: Record<string, number> = {};

      for (const allocation of allocations || []) {
        const key = `${allocation.employeeId}::${allocation.taskName}`;
        nextInputs[key] = String(Math.round(allocation.minutes));
        nextStandard[key] =
          allocation.standardMinutes ?? allocation.minutes;
      }

      setEmployees(savedEmployees);
      setRoster(savedRoster || []);
      setLoad(savedLoad || null);
      setSavedAllocations(allocations || []);
      setArrival(savedArrival || null);
      setInputValues(nextInputs);
      setStandardValues(nextStandard);
    } catch (error) {
      console.log('LOAD CAPACITY-SAFE ALLOCATION ERROR:', error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const workingRoster = useMemo(
    () => roster.filter(isActiveRosterEntry),
    [roster]
  );

  const tasks = useMemo(() => buildTasks(load), [load]);
  const arrivalTime = arrival?.arrived ? arrival.actualTime : null;

  const requiredMinutes =
    load?.totalRequiredMinutes ||
    tasks.reduce((total, task) => total + task.requiredMinutes, 0);

  const labourPosition = useMemo(
    () => calculateLabourPosition(roster, requiredMinutes, arrivalTime),
    [roster, requiredMinutes, arrivalTime]
  );

  const suggestionRoster = useMemo(
    () =>
      workingRoster.filter(
        (entry) => calculateAvailableAfterLoad(entry, arrivalTime) > 0
      ),
    [workingRoster, arrivalTime]
  );

  const suggestionResult = useMemo(
    () =>
      buildAllocationSuggestions({
        employees,
        roster: suggestionRoster,
        tasks,
        loadArrivalTime: arrivalTime,
        existingAllocations: savedAllocations,
        preserveExisting: true,
      }),
    [
      employees,
      suggestionRoster,
      tasks,
      arrivalTime,
      savedAllocations,
    ]
  );

  const draftAllocations = useMemo(() => {
    const next: RecoveryAllocation[] = [];

    for (const entry of workingRoster) {
      for (const task of tasks) {
        const key = `${entry.employeeId}::${task.name}`;
        const targetMinutes = parseAllocationInput(inputValues[key] || '');
        if (targetMinutes <= 0) continue;

        const standardMinutes =
          standardValues[key] ??
          (suggestionResult.recoveryMode
            ? targetMinutes * suggestionResult.paceMultiplier
            : targetMinutes);

        next.push({
          employeeId: entry.employeeId,
          taskName: task.name,
          minutes: targetMinutes,
          standardMinutes,
          recoveryPacePercent: suggestionResult.recoveryMode
            ? suggestionResult.requiredPacePercent || undefined
            : undefined,
        });
      }
    }

    return next;
  }, [
    workingRoster,
    tasks,
    inputValues,
    standardValues,
    suggestionResult.recoveryMode,
    suggestionResult.paceMultiplier,
    suggestionResult.requiredPacePercent,
  ]);

  function getEmployee(employeeId: string) {
    return employees.find((employee) => employee.id === employeeId);
  }

  function employeeAvailable(employeeId: string) {
    const entry = workingRoster.find(
      (item) => item.employeeId === employeeId
    );
    return entry
      ? calculateAvailableAfterLoad(entry, arrivalTime)
      : 0;
  }

  function employeeTargetAllocated(employeeId: string) {
    return draftAllocations
      .filter((item) => item.employeeId === employeeId)
      .reduce((total, item) => total + item.minutes, 0);
  }

  function taskStandardAllocated(taskName: string) {
    return draftAllocations
      .filter((item) => item.taskName === taskName)
      .reduce(
        (total, item) => total + (item.standardMinutes ?? item.minutes),
        0
      );
  }

  const totalTargetMinutes = draftAllocations.reduce(
    (total, item) => total + item.minutes,
    0
  );
  const totalStandardAssigned = draftAllocations.reduce(
    (total, item) => total + (item.standardMinutes ?? item.minutes),
    0
  );

  const suggestionGroups = useMemo(() => {
    const groups = new Map<string, SuggestedAllocation[]>();
    for (const allocation of suggestionResult.allocations) {
      const list = groups.get(allocation.taskName) || [];
      list.push(allocation);
      groups.set(allocation.taskName, list);
    }

    return tasks.map((task) => ({
      task,
      allocations: groups.get(task.name) || [],
    }));
  }, [suggestionResult.allocations, tasks]);

  function updateInput(
    employeeId: string,
    taskName: string,
    value: string
  ) {
    const key = `${employeeId}::${taskName}`;

    setInputValues((current) => ({
      ...current,
      [key]: value,
    }));

    /* Manual edit means the standard-workload value is recalculated from pace. */
    setStandardValues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function applySuggestionForTask(taskName: string) {
    const suggestions = suggestionResult.allocations.filter(
      (item) => item.taskName === taskName
    );

    const nextInputs = { ...inputValues };
    const nextStandard = { ...standardValues };

    for (const entry of workingRoster) {
      const key = `${entry.employeeId}::${taskName}`;
      delete nextInputs[key];
      delete nextStandard[key];
    }

    for (const item of suggestions) {
      const key = `${item.employeeId}::${item.taskName}`;
      nextInputs[key] = String(Math.round(item.minutes));
      nextStandard[key] = item.standardMinutes ?? item.minutes;
    }

    setInputValues(nextInputs);
    setStandardValues(nextStandard);
  }

  function applyAllSuggestions() {
    const nextInputs: Record<string, string> = {};
    const nextStandard: Record<string, number> = {};

    for (const item of suggestionResult.allocations) {
      const key = `${item.employeeId}::${item.taskName}`;
      nextInputs[key] = String(Math.round(item.minutes));
      nextStandard[key] = item.standardMinutes ?? item.minutes;
    }

    setInputValues(nextInputs);
    setStandardValues(nextStandard);
  }

  function clearAll() {
    Alert.alert(
      'Clear Draft Allocation',
      'Remove all task assignments from the manager editor?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setInputValues({});
            setStandardValues({});
          },
        },
      ]
    );
  }

  async function persistAllocations(next: RecoveryAllocation[]) {
    try {
      setSaving(true);
      await saveNightValue(
        NIGHTFILL_STORAGE.allocations,
        dateKey,
        next,
        dayName
      );
      setSavedAllocations(next);
      Alert.alert(
        'Final Allocation Saved',
        suggestionResult.recoveryMode
          ? 'Recovery target times were saved. Rostered shift start and finish times were not changed.'
          : 'Tonight’s allocation was saved.'
      );
    } catch (error) {
      console.log('SAVE CAPACITY-SAFE ALLOCATION ERROR:', error);
      Alert.alert('Save Failed', 'Could not save tonight’s allocation.');
    } finally {
      setSaving(false);
    }
  }

  function savePlan() {
    const employeeOverCapacity = workingRoster.find(
      (entry) =>
        employeeTargetAllocated(entry.employeeId) >
        employeeAvailable(entry.employeeId)
    );

    if (employeeOverCapacity) {
      const employee = getEmployee(employeeOverCapacity.employeeId);
      Alert.alert(
        'Employee Above Available Time',
        `${employee?.name || 'This employee'} has ${formatMinutes(
          employeeAvailable(employeeOverCapacity.employeeId)
        )} available but ${formatMinutes(
          employeeTargetAllocated(employeeOverCapacity.employeeId)
        )} target time is assigned. Reduce or rebalance the target before saving.`
      );
      return;
    }

    const overCoveredTask = tasks.find(
      (task) => taskStandardAllocated(task.name) > task.requiredMinutes + 1
    );

    if (overCoveredTask) {
      Alert.alert(
        'Task Overcovered',
        `${overCoveredTask.name} requires ${formatMinutes(
          overCoveredTask.requiredMinutes
        )} standard labour but the draft represents ${formatMinutes(
          taskStandardAllocated(overCoveredTask.name)
        )}.`
      );
      return;
    }

    const underCovered = tasks.filter(
      (task) => taskStandardAllocated(task.name) < task.requiredMinutes - 1
    );

    if (underCovered.length > 0) {
      Alert.alert(
        'Some Work Is Still Unassigned',
        `${underCovered.length} task(s) are below their Fill Assist workload.`,
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Save Anyway',
            onPress: () => persistAllocations(draftAllocations),
          },
        ]
      );
      return;
    }

    persistAllocations(draftAllocations);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading smart allocation…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Tonight</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>Smart Allocation</Text>
        <Text style={styles.subtitle}>
          {dayName} · {dateKey} · shifts remain fixed
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.arrivalCard,
            arrival?.arrived ? styles.goodCard : styles.warningCard,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>TRUCK / LOAD</Text>
            <Text
              style={arrival?.arrived ? styles.goodTitle : styles.warningTitle}
            >
              {arrival?.arrived
                ? `Arrived ${formatClock(arrival.actualTime)}`
                : 'Actual arrival not recorded'}
            </Text>
            <Text style={styles.cardNote}>
              Employee rostered start/finish times stay unchanged when the truck is late.
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/load-arrival')}>
            <Text style={styles.link}>Manage</Text>
          </TouchableOpacity>
        </View>

        {!arrival?.arrived ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Provisional plan</Text>
            <Text style={styles.infoText}>
              Record the actual truck time to calculate true post-load capacity and any recovery pace.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Real Labour Position</Text>
        <View style={styles.metricsCard}>
          <Metric
            label="Gross roster"
            value={formatMinutes(labourPosition.fullRosterMinutes)}
          />
          <Metric
            label="Reserved breaks"
            value={formatMinutes(labourPosition.breakMinutes)}
          />
          {arrival?.arrived ? (
            <Metric
              label="Labour before load"
              value={formatMinutes(labourPosition.preLoadMinutes)}
            />
          ) : null}
          <Metric
            label={arrival?.arrived ? 'Available after arrival' : 'Productive roster'}
            value={formatMinutes(labourPosition.postArrivalMinutes)}
          />
          <Metric label="Load required" value={formatMinutes(requiredMinutes)} />
          <View style={styles.divider} />
          <Metric
            label={
              labourPosition.differenceMinutes < 0
                ? 'REAL SHORTAGE'
                : 'REAL SURPLUS'
            }
            value={formatSignedMinutes(labourPosition.differenceMinutes)}
            strong
            danger={labourPosition.differenceMinutes < 0}
          />
        </View>

        {suggestionResult.recoveryMode ? (
          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>⚡ Recovery Allocation Mode</Text>
            <Text style={styles.recoveryText}>
              Every Fill Assist task is still assigned, but employee allocation is now TARGET CLOCK TIME — never more than that employee’s remaining productive shift.
            </Text>
            <View style={styles.recoveryStats}>
              <RecoveryStat
                label="Shortage"
                value={formatMinutes(suggestionResult.shortageMinutes)}
              />
              <RecoveryStat
                label="Required pace"
                value={
                  suggestionResult.requiredPacePercent
                    ? `${suggestionResult.requiredPacePercent}%`
                    : 'No capacity'
                }
              />
            </View>
            <Text style={styles.recoveryFootnote}>
              Example: if 3h remains and the workload represents 8h of standard labour, the app will show at most 3h target time — not 8h allocated. The higher standard workload is shown separately as “covers … standard”.
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitleNoMargin}>Smart Suggestions</Text>
            <Text style={styles.helperText}>
              Manager-controlled. Apply a suggestion, then edit target minutes if required.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.primarySmall}
            onPress={applyAllSuggestions}
            disabled={suggestionResult.allocations.length === 0}
          >
            <Text style={styles.primarySmallText}>Apply All</Text>
          </TouchableOpacity>
        </View>

        {tasks.length === 0 ? (
          <EmptyCard text="Scan tonight’s Fill Assist load first." />
        ) : suggestionRoster.length === 0 ? (
          <EmptyCard text="No rostered employee has productive time left after the recorded truck arrival." />
        ) : (
          suggestionGroups.map(({ task, allocations }) => (
            <View key={task.name} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskName}>{task.name}</Text>
                  <Text style={styles.taskMeta}>
                    Standard workload {formatMinutes(task.requiredMinutes)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.secondarySmall}
                  onPress={() => applySuggestionForTask(task.name)}
                >
                  <Text style={styles.secondarySmallText}>Use</Text>
                </TouchableOpacity>
              </View>

              {allocations.length === 0 ? (
                <Text style={styles.uncoveredText}>No allocation available</Text>
              ) : (
                allocations.map((item, index) => (
                  <View
                    key={`${item.employeeId}-${item.taskName}-${index}`}
                    style={styles.suggestionRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>
                        {getEmployee(item.employeeId)?.name || 'Team member'}
                      </Text>
                      <Text style={styles.reason}>{item.reason}</Text>
                    </View>
                    <View style={styles.suggestionRight}>
                      <Text style={styles.minutes}>
                        Target {formatMinutes(item.minutes)}
                      </Text>
                      {suggestionResult.recoveryMode ? (
                        <Text style={styles.standardText}>
                          covers {formatMinutes(item.standardMinutes ?? item.minutes)} standard
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </View>
          ))
        )}

        {suggestionResult.unallocatedTasks.length > 0 ? (
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Some workload cannot be represented</Text>
            {suggestionResult.unallocatedTasks.map((item) => (
              <Text key={item.taskName} style={styles.dangerText}>
                {item.taskName}: {formatMinutes(item.remainingMinutes)} standard labour
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Load Coverage</Text>
        {tasks.map((task) => {
          const covered = taskStandardAllocated(task.name);
          const remaining = Math.max(task.requiredMinutes - covered, 0);

          return (
            <View key={task.name} style={styles.coverageRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.coverageName}>{task.name}</Text>
                <Text style={styles.coverageMeta}>
                  Standard {formatMinutes(task.requiredMinutes)}
                </Text>
              </View>
              <Text
                style={
                  remaining > 1
                    ? styles.coverageMissing
                    : styles.coverageDone
                }
              >
                {remaining > 1
                  ? `${formatMinutes(remaining)} unassigned`
                  : 'Assigned'}
              </Text>
            </View>
          );
        })}

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitleNoMargin}>Manager Editor</Text>
            <Text style={styles.helperText}>
              {suggestionResult.recoveryMode
                ? 'Target minutes are real available clock time. The app will not allow a person to exceed their post-load availability.'
                : 'Minutes are normal planned labour time.'}
            </Text>
          </View>
          <TouchableOpacity onPress={clearAll}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {workingRoster.map((entry) => {
          const employee = getEmployee(entry.employeeId);
          if (!employee) return null;

          const available = employeeAvailable(entry.employeeId);
          const allocated = employeeTargetAllocated(entry.employeeId);
          const remaining = Math.max(available - allocated, 0);
          const preLoad = calculatePreLoadMinutes(entry, arrivalTime);

          return (
            <View key={entry.employeeId} style={styles.employeeCard}>
              <View style={styles.employeeHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(employee.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.employeeName}>{employee.name}</Text>
                  <Text style={styles.employeeShift}>
                    {formatClock(entry.startTime)} → {formatClock(entry.finishTime)}
                  </Text>
                </View>
              </View>

              <View style={styles.employeeStats}>
                {arrival?.arrived ? (
                  <MiniStat label="Pre-load" value={formatMinutes(preLoad)} />
                ) : null}
                <MiniStat label="Available" value={formatMinutes(available)} />
                <MiniStat
                  label={suggestionResult.recoveryMode ? 'Target' : 'Allocated'}
                  value={formatMinutes(allocated)}
                />
                <MiniStat label="Remaining" value={formatMinutes(remaining)} />
              </View>

              {tasks.map((task) => {
                const key = `${entry.employeeId}::${task.name}`;
                const skill = task.name.startsWith('Aisle ')
                  ? Number(employee.aisleSkills?.[task.name]) || 0
                  : 0;

                return (
                  <View key={task.name} style={styles.editorRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editorTask}>{task.name}</Text>
                      {task.name.startsWith('Aisle ') ? (
                        <Text style={styles.skillText}>
                          Skill {skill > 0 ? `${skill}/5` : 'not rated'}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.inputWrap}>
                      <TextInput
                        value={inputValues[key] || ''}
                        onChangeText={(value) =>
                          updateInput(entry.employeeId, task.name, value)
                        }
                        placeholder="min"
                        keyboardType="numbers-and-punctuation"
                        style={styles.input}
                      />
                      <Text style={styles.inputSuffix}>min</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={styles.draftCard}>
          <Metric
            label={suggestionResult.recoveryMode ? 'Target clock time' : 'Draft allocated'}
            value={formatMinutes(totalTargetMinutes)}
          />
          <Metric
            label="Standard workload assigned"
            value={formatMinutes(totalStandardAssigned)}
          />
          <Metric label="Fill Assist required" value={formatMinutes(requiredMinutes)} />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={savePlan}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving…' : 'Save Final Allocation'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.teamPlanButton}
          onPress={() => router.push('/team-plan')}
        >
          <Text style={styles.teamPlanText}>View Team Plan →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Metric({
  label,
  value,
  strong = false,
  danger = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          strong && styles.metricStrong,
          danger && styles.metricDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function RecoveryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.recoveryStat}>
      <Text style={styles.recoveryStatLabel}>{label}</Text>
      <Text style={styles.recoveryStatValue}>{value}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>No suggestion available</Text>
      <Text style={styles.emptyText}>{text}</Text>
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
    paddingBottom: 25,
  },
  back: { color: '#D5DBED', fontSize: 14, marginBottom: 14 },
  eyebrow: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: { color: '#FFFFFF', fontSize: 29, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 4 },
  content: { padding: 16, paddingBottom: 60 },
  arrivalCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  goodCard: { backgroundColor: '#E8F8EF' },
  warningCard: { backgroundColor: '#FFF4E5' },
  cardLabel: { color: '#667085', fontSize: 8, fontWeight: '800' },
  goodTitle: { color: '#168455', fontSize: 14, fontWeight: '800', marginTop: 3 },
  warningTitle: { color: '#B54708', fontSize: 14, fontWeight: '800', marginTop: 3 },
  cardNote: { color: '#667085', fontSize: 9, lineHeight: 13, marginTop: 4 },
  link: { color: '#2436B2', fontSize: 10, fontWeight: '800' },
  infoCard: { backgroundColor: '#FFF4E5', borderRadius: 12, padding: 12, marginTop: 8 },
  infoTitle: { color: '#B54708', fontSize: 11, fontWeight: '800' },
  infoText: { color: '#8A5A19', fontSize: 9, lineHeight: 14, marginTop: 3 },
  sectionTitle: { color: '#101828', fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 9 },
  sectionTitleNoMargin: { color: '#101828', fontSize: 17, fontWeight: '800' },
  metricsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  metricLabel: { color: '#667085', fontSize: 10 },
  metricValue: { color: '#101D48', fontSize: 13, fontWeight: '800' },
  metricStrong: { fontSize: 15 },
  metricDanger: { color: '#D92D20' },
  divider: { height: 1, backgroundColor: '#EAECF0', marginVertical: 5 },
  recoveryCard: { backgroundColor: '#FFF4E5', borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#FEDF89' },
  recoveryTitle: { color: '#B54708', fontSize: 13, fontWeight: '900' },
  recoveryText: { color: '#7A4E0D', fontSize: 9, lineHeight: 14, marginTop: 5 },
  recoveryStats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  recoveryStat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10 },
  recoveryStatLabel: { color: '#8A5A19', fontSize: 8 },
  recoveryStatValue: { color: '#B54708', fontSize: 16, fontWeight: '900', marginTop: 3 },
  recoveryFootnote: { color: '#8A5A19', fontSize: 8, lineHeight: 13, marginTop: 9 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 20, marginBottom: 9 },
  helperText: { color: '#667085', fontSize: 9, lineHeight: 14, marginTop: 3 },
  primarySmall: { backgroundColor: '#2436B2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  primarySmallText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  suggestionCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: '#D7DDFE' },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskName: { color: '#101828', fontSize: 13, fontWeight: '800' },
  taskMeta: { color: '#667085', fontSize: 9, marginTop: 2 },
  secondarySmall: { backgroundColor: '#EEF1FF', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  secondarySmallText: { color: '#2436B2', fontSize: 8, fontWeight: '800' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F2F4F7' },
  personName: { color: '#101828', fontSize: 11, fontWeight: '800' },
  reason: { color: '#667085', fontSize: 8, lineHeight: 12, marginTop: 2 },
  suggestionRight: { alignItems: 'flex-end' },
  minutes: { color: '#2436B2', fontSize: 12, fontWeight: '800' },
  standardText: { color: '#667085', fontSize: 7, marginTop: 2 },
  uncoveredText: { color: '#D92D20', fontSize: 9, marginTop: 9 },
  dangerCard: { backgroundColor: '#FDECEC', borderRadius: 12, padding: 12, marginTop: 4 },
  dangerTitle: { color: '#D92D20', fontSize: 10, fontWeight: '800' },
  dangerText: { color: '#912018', fontSize: 8, marginTop: 4 },
  coverageRow: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 },
  coverageName: { color: '#101828', fontSize: 12, fontWeight: '800' },
  coverageMeta: { color: '#667085', fontSize: 8, marginTop: 2 },
  coverageMissing: { color: '#D92D20', fontSize: 9, fontWeight: '800' },
  coverageDone: { color: '#168455', fontSize: 9, fontWeight: '800' },
  clearText: { color: '#D92D20', fontSize: 10, fontWeight: '800' },
  employeeCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10 },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E9ECFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#2436B2', fontSize: 14, fontWeight: '900' },
  employeeName: { color: '#101828', fontSize: 14, fontWeight: '800' },
  employeeShift: { color: '#667085', fontSize: 9, marginTop: 3 },
  employeeStats: { flexDirection: 'row', gap: 7, marginTop: 12, marginBottom: 10 },
  miniStat: { flex: 1, backgroundColor: '#F6F7FA', borderRadius: 10, padding: 9 },
  miniStatLabel: { color: '#98A2B3', fontSize: 7 },
  miniStatValue: { color: '#101D48', fontSize: 12, fontWeight: '800', marginTop: 3 },
  editorRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F2F4F7' },
  editorTask: { color: '#101828', fontSize: 11, fontWeight: '800' },
  skillText: { color: '#98A2B3', fontSize: 8, marginTop: 2 },
  inputWrap: { width: 128, backgroundColor: '#F2F4F7', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  input: { flex: 1, color: '#101D48', fontSize: 14, fontWeight: '800', textAlign: 'right', paddingVertical: 10 },
  inputSuffix: { color: '#98A2B3', fontSize: 8, marginLeft: 5 },
  draftCard: { backgroundColor: '#101D48', borderRadius: 14, padding: 14, marginTop: 8 },
  saveButton: { backgroundColor: '#2436B2', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  teamPlanButton: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 9 },
  teamPlanText: { color: '#2436B2', fontSize: 12, fontWeight: '800' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16 },
  emptyTitle: { color: '#101828', fontSize: 13, fontWeight: '800' },
  emptyText: { color: '#667085', fontSize: 9, lineHeight: 14, marginTop: 4 },
});
