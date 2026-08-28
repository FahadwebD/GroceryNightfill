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

    result.push({
      name: item.name,
      requiredMinutes: minutes,
      type,
    });
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

function employeeInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function RecoveryAllocationScreen() {
  const context = useMemo(() => getTonightContext(), []);
  const { dateKey, dayName } = context;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster] = useState<PlanningRosterEntry[]>([]);
  const [load, setLoad] = useState<NightLoad | null>(null);
  const [savedAllocations, setSavedAllocations] =
    useState<PlanningAllocation[]>([]);
  const [arrival, setArrival] = useState<LoadArrivalRecord | null>(null);
  const [inputValues, setInputValues] =
    useState<Record<string, string>>({});
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
        readNightValue<PlanningAllocation[]>(
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

      setEmployees(savedEmployees);
      setRoster(savedRoster || []);
      setLoad(savedLoad || null);
      setSavedAllocations(allocations || []);
      setArrival(savedArrival || null);

      const next: Record<string, string> = {};
      for (const allocation of allocations || []) {
        next[`${allocation.employeeId}::${allocation.taskName}`] =
          String(allocation.minutes);
      }
      setInputValues(next);
    } catch (error) {
      console.log('LOAD RECOVERY ALLOCATION ERROR:', error);
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

  const arrivalTime =
    arrival?.arrived ? arrival.actualTime : null;

  const requiredMinutes =
    load?.totalRequiredMinutes ||
    tasks.reduce(
      (total, task) => total + task.requiredMinutes,
      0
    );

  const labourPosition = useMemo(
    () =>
      calculateLabourPosition(
        roster,
        requiredMinutes,
        arrivalTime
      ),
    [roster, requiredMinutes, arrivalTime]
  );

  /*
   * Do not suggest new load work to a person whose shift has no productive
   * time left after the actual truck arrival. Their rostered start/finish is
   * never changed by this screen.
   */
  const suggestionRoster = useMemo(
    () =>
      workingRoster.filter(
        (entry) =>
          calculateAvailableAfterLoad(entry, arrivalTime) > 0
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
    const next: PlanningAllocation[] = [];

    for (const entry of workingRoster) {
      for (const task of tasks) {
        const minutes = parseAllocationInput(
          inputValues[`${entry.employeeId}::${task.name}`] || ''
        );

        if (minutes > 0) {
          next.push({
            employeeId: entry.employeeId,
            taskName: task.name,
            minutes,
          });
        }
      }
    }

    return next;
  }, [workingRoster, tasks, inputValues]);

  function getEmployee(employeeId: string) {
    return employees.find(
      (employee) => employee.id === employeeId
    );
  }

  function employeeAvailable(employeeId: string) {
    const entry = workingRoster.find(
      (item) => item.employeeId === employeeId
    );
    return entry
      ? calculateAvailableAfterLoad(entry, arrivalTime)
      : 0;
  }

  function employeeAllocated(employeeId: string) {
    return draftAllocations
      .filter((item) => item.employeeId === employeeId)
      .reduce((total, item) => total + item.minutes, 0);
  }

  function taskAllocated(taskName: string) {
    return draftAllocations
      .filter((item) => item.taskName === taskName)
      .reduce((total, item) => total + item.minutes, 0);
  }

  const totalAllocatedMinutes = draftAllocations.reduce(
    (total, item) => total + item.minutes,
    0
  );

  const totalDraftOverload = workingRoster.reduce(
    (total, entry) =>
      total +
      Math.max(
        employeeAllocated(entry.employeeId) -
          employeeAvailable(entry.employeeId),
        0
      ),
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
    setInputValues((current) => ({
      ...current,
      [`${employeeId}::${taskName}`]: value,
    }));
  }

  function applySuggestionForTask(taskName: string) {
    const suggestions = suggestionResult.allocations.filter(
      (item) => item.taskName === taskName
    );

    setInputValues((current) => {
      const next = { ...current };

      for (const entry of workingRoster) {
        delete next[`${entry.employeeId}::${taskName}`];
      }

      for (const item of suggestions) {
        const key = `${item.employeeId}::${item.taskName}`;
        const currentMinutes = parseAllocationInput(next[key] || '');
        next[key] = String(currentMinutes + item.minutes);
      }

      return next;
    });
  }

  function applyAllSuggestions() {
    const next: Record<string, string> = {};

    for (const item of suggestionResult.allocations) {
      const key = `${item.employeeId}::${item.taskName}`;
      const currentMinutes = parseAllocationInput(next[key] || '');
      next[key] = String(currentMinutes + item.minutes);
    }

    setInputValues(next);
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
          onPress: () => setInputValues({}),
        },
      ]
    );
  }

  async function persistAllocations(next: PlanningAllocation[]) {
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
        'Rostered shift start and finish times were not changed.'
      );
    } catch (error) {
      console.log('SAVE RECOVERY ALLOCATION ERROR:', error);
      Alert.alert('Save Failed', 'Could not save tonight’s allocation.');
    } finally {
      setSaving(false);
    }
  }

  function finishSave() {
    const underAllocated = tasks.filter(
      (task) => taskAllocated(task.name) < task.requiredMinutes
    );

    if (underAllocated.length > 0) {
      Alert.alert(
        'Some Work Is Still Unassigned',
        `${underAllocated.length} task(s) are below their Fill Assist labour requirement.`,
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

    if (totalDraftOverload > 0) {
      Alert.alert(
        'Recovery Plan — Capacity Shortage',
        `All work is assigned, but the draft contains ${formatMinutes(
          totalDraftOverload
        )} more labour than the roster can provide after the truck arrives.\n\nShift start/finish times will stay unchanged. Finishing by the rostered deadline requires faster-than-standard execution, additional support, or an approved change to labour.`,
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Save Recovery Plan',
            onPress: () => persistAllocations(draftAllocations),
          },
        ]
      );
      return;
    }

    persistAllocations(draftAllocations);
  }

  function savePlan() {
    const overAllocatedTask = tasks.find(
      (task) => taskAllocated(task.name) > task.requiredMinutes
    );

    if (overAllocatedTask) {
      Alert.alert(
        'Task Overallocated',
        `${overAllocatedTask.name} requires ${formatMinutes(
          overAllocatedTask.requiredMinutes
        )}, but ${formatMinutes(
          taskAllocated(overAllocatedTask.name)
        )} is assigned.`
      );
      return;
    }

    const unnecessaryEmployeeOverload = workingRoster.find((entry) => {
      const overload = Math.max(
        employeeAllocated(entry.employeeId) -
          employeeAvailable(entry.employeeId),
        0
      );
      return overload > 0 && labourPosition.differenceMinutes >= 0;
    });

    if (unnecessaryEmployeeOverload) {
      const employee = getEmployee(
        unnecessaryEmployeeOverload.employeeId
      );
      Alert.alert(
        'Employee Overallocated',
        `${employee?.name || 'This employee'} is above their available post-load labour even though the team has enough total capacity. Rebalance the plan first.`
      );
      return;
    }

    finishSave();
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
              Employee rostered start times do not move when the truck is late.
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
              Until actual arrival is recorded, the engine uses the full productive roster. Record the real truck time to recalculate the recovery plan.
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
            label={arrival?.arrived ? 'After arrival' : 'Productive roster'}
            value={formatMinutes(labourPosition.postArrivalMinutes)}
          />
          <Metric
            label="Load required"
            value={formatMinutes(requiredMinutes)}
          />
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
              The engine will still assign every Fill Assist task instead of leaving later aisles uncovered. It uses aisle skill, remaining post-load time and workload balance to spread the pressure.
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
              100% = standard planned labour. A value above 100% means the current roster cannot mathematically provide all required standard labour before finish; the plan shows the smartest workload distribution, not a promise that the shortage disappears.
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitleNoMargin}>Smart Suggestions</Text>
            <Text style={styles.helperText}>
              Suggestions only — manager can edit every employee and minute before saving.
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
                    Required {formatMinutes(task.requiredMinutes)}
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
                      <View style={styles.personRow}>
                        <Text style={styles.personName}>
                          {getEmployee(item.employeeId)?.name || 'Team member'}
                        </Text>
                        {item.recovery ? (
                          <View style={styles.recoveryBadge}>
                            <Text style={styles.recoveryBadgeText}>RECOVERY</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.reason}>{item.reason}</Text>
                    </View>
                    <Text style={styles.minutes}>{formatMinutes(item.minutes)}</Text>
                  </View>
                ))
              )}
            </View>
          ))
        )}

        {suggestionResult.unallocatedTasks.length > 0 ? (
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Some work cannot be assigned</Text>
            <Text style={styles.dangerText}>
              No productive rostered employee remains for these tasks. Add/call in labour or review the roster.
            </Text>
            {suggestionResult.unallocatedTasks.map((item) => (
              <Text key={item.taskName} style={styles.dangerText}>
                {item.taskName}: {formatMinutes(item.remainingMinutes)}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Load Coverage</Text>
        {tasks.map((task) => {
          const allocated = taskAllocated(task.name);
          const difference = task.requiredMinutes - allocated;

          return (
            <View key={task.name} style={styles.coverageRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.coverageName}>{task.name}</Text>
                <Text style={styles.coverageMeta}>
                  Required {formatMinutes(task.requiredMinutes)}
                </Text>
              </View>
              <Text
                style={
                  difference > 0
                    ? styles.coverageMissing
                    : styles.coverageDone
                }
              >
                {difference > 0
                  ? `${formatMinutes(difference)} left`
                  : 'Covered'}
              </Text>
            </View>
          );
        })}

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitleNoMargin}>Manager Editor</Text>
            <Text style={styles.helperText}>
              In shortage mode, an employee can be assigned above capacity. The app will show the overload clearly and warn before save.
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
          const allocated = employeeAllocated(entry.employeeId);
          const overload = Math.max(allocated - available, 0);
          const remaining = Math.max(available - allocated, 0);
          const preLoad = calculatePreLoadMinutes(entry, arrivalTime);

          return (
            <View key={entry.employeeId} style={styles.employeeCard}>
              <View style={styles.employeeHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {employeeInitials(employee.name)}
                  </Text>
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
                <MiniStat label="Allocated" value={formatMinutes(allocated)} />
                <MiniStat
                  label={overload > 0 ? 'Overload' : 'Remaining'}
                  value={formatMinutes(overload > 0 ? overload : remaining)}
                  danger={overload > 0}
                />
              </View>

              {available === 0 ? (
                <Text style={styles.noTimeText}>
                  No productive time remains after load arrival. New smart suggestions will not assign this employee.
                </Text>
              ) : null}

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
          <Metric label="Draft allocated" value={formatMinutes(totalAllocatedMinutes)} />
          <Metric label="Required" value={formatMinutes(requiredMinutes)} />
          {totalDraftOverload > 0 ? (
            <Metric
              label="Draft capacity overload"
              value={formatMinutes(totalDraftOverload)}
              danger
              strong
            />
          ) : null}
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

function MiniStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={[styles.miniStatValue, danger && styles.metricDanger]}>
        {value}
      </Text>
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
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  back: { color: '#D5DBED', fontSize: 13, marginBottom: 12 },
  eyebrow: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: { color: '#FFFFFF', fontSize: 29, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#D5DBED', fontSize: 10, marginTop: 4 },
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
  cardNote: { color: '#667085', fontSize: 8, lineHeight: 12, marginTop: 3 },
  link: { color: '#2436B2', fontSize: 10, fontWeight: '800' },
  infoCard: { backgroundColor: '#FFF8E8', borderRadius: 12, padding: 12, marginTop: 8 },
  infoTitle: { color: '#B54708', fontSize: 10, fontWeight: '800' },
  infoText: { color: '#8A5A19', fontSize: 8, lineHeight: 13, marginTop: 3 },
  sectionTitle: { color: '#101828', fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 9 },
  sectionTitleNoMargin: { color: '#101828', fontSize: 17, fontWeight: '800' },
  metricsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  metricLabel: { color: '#667085', fontSize: 9 },
  metricValue: { color: '#101828', fontSize: 12, fontWeight: '800' },
  metricStrong: { fontSize: 14 },
  metricDanger: { color: '#D92D20' },
  divider: { height: 1, backgroundColor: '#EAECF0', marginVertical: 4 },
  recoveryCard: {
    backgroundColor: '#FFF1EC',
    borderColor: '#FDB89D',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  recoveryTitle: { color: '#B93815', fontSize: 13, fontWeight: '900' },
  recoveryText: { color: '#7A271A', fontSize: 9, lineHeight: 14, marginTop: 5 },
  recoveryStats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  recoveryStat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, alignItems: 'center' },
  recoveryStatLabel: { color: '#8A5A19', fontSize: 7 },
  recoveryStatValue: { color: '#B93815', fontSize: 15, fontWeight: '900', marginTop: 2 },
  recoveryFootnote: { color: '#7A271A', fontSize: 7, lineHeight: 11, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 9 },
  helperText: { color: '#667085', fontSize: 8, lineHeight: 12, marginTop: 3 },
  primarySmall: { backgroundColor: '#2436B2', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  primarySmallText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
  secondarySmall: { backgroundColor: '#EEF1FF', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  secondarySmallText: { color: '#2436B2', fontSize: 8, fontWeight: '800' },
  suggestionCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: '#D7DDFE' },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskName: { color: '#101828', fontSize: 13, fontWeight: '800' },
  taskMeta: { color: '#667085', fontSize: 8, marginTop: 2 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F2F4F7' },
  personRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  personName: { color: '#101828', fontSize: 10, fontWeight: '800' },
  recoveryBadge: { backgroundColor: '#FDE2D5', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  recoveryBadgeText: { color: '#B93815', fontSize: 6, fontWeight: '900' },
  reason: { color: '#667085', fontSize: 7, lineHeight: 11, marginTop: 2 },
  minutes: { color: '#2436B2', fontSize: 12, fontWeight: '800' },
  uncoveredText: { color: '#D92D20', fontSize: 8, marginTop: 8 },
  dangerCard: { backgroundColor: '#FDECEC', borderRadius: 12, padding: 12, marginTop: 5 },
  dangerTitle: { color: '#D92D20', fontSize: 10, fontWeight: '800' },
  dangerText: { color: '#912018', fontSize: 8, lineHeight: 12, marginTop: 3 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 15 },
  emptyTitle: { color: '#101828', fontSize: 12, fontWeight: '800' },
  emptyText: { color: '#667085', fontSize: 8, lineHeight: 13, marginTop: 3 },
  coverageRow: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 },
  coverageName: { color: '#101828', fontSize: 11, fontWeight: '800' },
  coverageMeta: { color: '#667085', fontSize: 8, marginTop: 2 },
  coverageMissing: { color: '#D92D20', fontSize: 9, fontWeight: '800' },
  coverageDone: { color: '#168455', fontSize: 9, fontWeight: '800' },
  clearText: { color: '#D92D20', fontSize: 9, fontWeight: '800' },
  employeeCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 9 },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF1FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#2436B2', fontSize: 11, fontWeight: '900' },
  employeeName: { color: '#101828', fontSize: 13, fontWeight: '800' },
  employeeShift: { color: '#667085', fontSize: 8, marginTop: 2 },
  employeeStats: { flexDirection: 'row', backgroundColor: '#F8F9FC', borderRadius: 10, padding: 8, marginTop: 10 },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatLabel: { color: '#98A2B3', fontSize: 6 },
  miniStatValue: { color: '#101828', fontSize: 10, fontWeight: '800', marginTop: 2 },
  noTimeText: { color: '#B54708', fontSize: 8, lineHeight: 12, marginTop: 8 },
  editorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F2F4F7' },
  editorTask: { color: '#101828', fontSize: 10, fontWeight: '700' },
  skillText: { color: '#667085', fontSize: 7, marginTop: 2 },
  inputWrap: { width: 100, backgroundColor: '#F2F4F7', borderRadius: 9, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  input: { flex: 1, color: '#101828', fontSize: 11, fontWeight: '800', paddingVertical: 8, textAlign: 'right' },
  inputSuffix: { color: '#98A2B3', fontSize: 7, marginLeft: 4 },
  draftCard: { backgroundColor: '#101D48', borderRadius: 14, padding: 14, marginTop: 8 },
  saveButton: { backgroundColor: '#2436B2', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  teamPlanButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, backgroundColor: '#FFFFFF' },
  teamPlanText: { color: '#2436B2', fontSize: 10, fontWeight: '800' },
});
