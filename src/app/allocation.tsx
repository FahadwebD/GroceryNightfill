import AsyncStorage from '@react-native-async-storage/async-storage';
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
  getTaskOrder,
  isActiveRosterEntry,
  type PlanningAllocation,
  type PlanningRosterEntry,
} from '../utils/nightfillPlanning';

import {
  getTonightContext,
  NIGHTFILL_STORAGE,
  readNightValue,
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
  type:
    | 'splitting'
    | 'aisle'
    | 'promo'
    | 'protect'
    | 'other';
};

function parseAllocationInput(value: string) {
  const text = value.trim();

  if (!text) {
    return 0;
  }

  if (text.includes(':')) {
    const [hourText, minuteText] = text.split(':');
    const hours = Number(hourText) || 0;
    const minutes = Number(minuteText) || 0;

    if (minutes < 0 || minutes > 59) {
      return 0;
    }

    return Math.max(
      Math.round(hours * 60 + minutes),
      0
    );
  }

  const number = Number(text);

  if (Number.isNaN(number) || number < 0) {
    return 0;
  }

  if (text.includes('.')) {
    return Math.round(number * 60);
  }

  return Math.round(number);
}

function buildTasks(load: NightLoad | null): Task[] {
  if (!load) {
    return [];
  }

  const result: Task[] = [];

  if (load.splittingMinutes > 0) {
    result.push({
      name: 'Splitting',
      requiredMinutes: load.splittingMinutes,
      type: 'splitting',
    });
  }

  load.items?.forEach((item) => {
    const minutes =
      (Number(item.hours) || 0) * 60 +
      (Number(item.minutes) || 0);

    if (minutes <= 0) {
      return;
    }

    let type: Task['type'] = 'aisle';

    if (item.name === 'Promo') {
      type = 'promo';
    }

    if (item.name === 'Protect - Aisle') {
      type = 'protect';
    }

    result.push({
      name: item.name,
      requiredMinutes: minutes,
      type,
    });
  });

  if (
    load.otherOrganisingMinutes > 0 &&
    !result.some(
      (item) => item.name === 'Other / Organising'
    )
  ) {
    result.push({
      name: 'Other / Organising',
      requiredMinutes: load.otherOrganisingMinutes,
      type: 'other',
    });
  }

  if (
    load.promoMinutes > 0 &&
    !result.some((item) => item.name === 'Promo')
  ) {
    result.push({
      name: 'Promo',
      requiredMinutes: load.promoMinutes,
      type: 'promo',
    });
  }

  if (
    load.protectMinutes > 0 &&
    !result.some(
      (item) => item.name === 'Protect - Aisle'
    )
  ) {
    result.push({
      name: 'Protect - Aisle',
      requiredMinutes: load.protectMinutes,
      type: 'protect',
    });
  }

  return result.sort(
    (a, b) => getTaskOrder(a.name) - getTaskOrder(b.name)
  );
}

export default function AllocationScreen() {
  const { dateKey, dayName } =
    useMemo(() => getTonightContext(), []);

  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [roster, setRoster] =
    useState<PlanningRosterEntry[]>([]);

  const [load, setLoad] =
    useState<NightLoad | null>(null);

  const [savedAllocations, setSavedAllocations] =
    useState<PlanningAllocation[]>([]);

  const [loadArrival, setLoadArrival] =
    useState<LoadArrivalRecord | null>(null);

  const [inputValues, setInputValues] =
    useState<Record<string, string>>({});

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    try {
      setLoading(true);

      const storedEmployees =
        await AsyncStorage.getItem('groceryEmployees');

      const parsedEmployees: Employee[] =
        storedEmployees
          ? JSON.parse(storedEmployees)
          : [];

      const [
        rosterValue,
        loadValue,
        allocationValue,
        arrivalValue,
      ] = await Promise.all([
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

      const tonightAllocations =
        allocationValue || [];

      setEmployees(parsedEmployees);
      setRoster(rosterValue || []);
      setLoad(loadValue || null);
      setSavedAllocations(tonightAllocations);
      setLoadArrival(arrivalValue || null);

      const nextInputs: Record<string, string> = {};

      tonightAllocations.forEach((item) => {
        nextInputs[
          `${item.employeeId}::${item.taskName}`
        ] = item.minutes > 0
          ? String(item.minutes)
          : '';
      });

      setInputValues(nextInputs);
    } catch (error) {
      console.log('LOAD ALLOCATION ERROR:', error);
    } finally {
      setLoading(false);
    }
  }

  const workingRoster = useMemo(
    () => roster.filter(isActiveRosterEntry),
    [roster]
  );

  const tasks = useMemo(
    () => buildTasks(load),
    [load]
  );

  const arrivalTime =
    loadArrival?.arrived
      ? loadArrival.actualTime
      : null;

  function getEmployee(employeeId: string) {
    return employees.find(
      (employee) => employee.id === employeeId
    );
  }

  const draftAllocations = useMemo(() => {
    const next: PlanningAllocation[] = [];

    for (const entry of workingRoster) {
      for (const task of tasks) {
        const key =
          `${entry.employeeId}::${task.name}`;

        const minutes =
          parseAllocationInput(
            inputValues[key] || ''
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

  const suggestionResult = useMemo(
    () =>
      buildAllocationSuggestions({
        employees,
        roster,
        tasks,
        loadArrivalTime: arrivalTime,
        existingAllocations: savedAllocations,
        preserveExisting: true,
      }),
    [
      employees,
      roster,
      tasks,
      arrivalTime,
      savedAllocations,
    ]
  );

  const suggestionGroups = useMemo(() => {
    const groups: Record<
      string,
      SuggestedAllocation[]
    > = {};

    suggestionResult.allocations.forEach(
      (item) => {
        if (!groups[item.taskName]) {
          groups[item.taskName] = [];
        }

        groups[item.taskName].push(item);
      }
    );

    return tasks
      .map((task) => ({
        task,
        allocations: groups[task.name] || [],
      }))
      .filter(
        (group) => group.allocations.length > 0
      );
  }, [suggestionResult.allocations, tasks]);

  const requiredMinutes =
    load?.totalRequiredMinutes ||
    tasks.reduce(
      (total, task) =>
        total + task.requiredMinutes,
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

  function getEmployeeAvailableMinutes(
    entry: PlanningRosterEntry
  ) {
    return calculateAvailableAfterLoad(
      entry,
      arrivalTime
    );
  }

  function getEmployeePreLoadMinutes(
    entry: PlanningRosterEntry
  ) {
    return calculatePreLoadMinutes(
      entry,
      arrivalTime
    );
  }

  function getEmployeeAllocatedMinutes(
    employeeId: string
  ) {
    return draftAllocations
      .filter(
        (item) => item.employeeId === employeeId
      )
      .reduce(
        (total, item) => total + item.minutes,
        0
      );
  }

  function getTaskAllocatedMinutes(
    taskName: string
  ) {
    return draftAllocations
      .filter(
        (item) => item.taskName === taskName
      )
      .reduce(
        (total, item) => total + item.minutes,
        0
      );
  }

  const totalAllocatedMinutes =
    draftAllocations.reduce(
      (total, item) => total + item.minutes,
      0
    );

  const totalRemainingMinutes =
    Math.max(
      labourPosition.postArrivalMinutes -
        totalAllocatedMinutes,
      0
    );

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

  function applySuggestionForTask(
    taskName: string
  ) {
    const suggestion =
      suggestionResult.allocations.filter(
        (item) => item.taskName === taskName
      );

    setInputValues((current) => {
      const next = { ...current };

      workingRoster.forEach((entry) => {
        delete next[
          `${entry.employeeId}::${taskName}`
        ];
      });

      suggestion.forEach((item) => {
        next[
          `${item.employeeId}::${item.taskName}`
        ] = String(item.minutes);
      });

      return next;
    });
  }

  function applyAllSuggestions() {
    const next: Record<string, string> = {};

    suggestionResult.allocations.forEach((item) => {
      next[
        `${item.employeeId}::${item.taskName}`
      ] = String(item.minutes);
    });

    setInputValues(next);
  }

  function clearEmployee(employeeId: string) {
    setInputValues((current) => {
      const next = { ...current };

      tasks.forEach((task) => {
        delete next[
          `${employeeId}::${task.name}`
        ];
      });

      return next;
    });
  }

  function clearAll() {
    Alert.alert(
      'Clear Draft Allocation',
      'Remove all task allocations from the editor?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => setInputValues({}),
        },
      ]
    );
  }

  async function persistAllocations(
    next: PlanningAllocation[]
  ) {
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
        'Plan Saved',
        'Tonight’s final allocation has been saved.'
      );
    } catch (error) {
      console.log('SAVE ALLOCATION ERROR:', error);

      Alert.alert(
        'Save Failed',
        'Could not save tonight’s allocation.'
      );
    } finally {
      setSaving(false);
    }
  }

  function savePlan() {
    for (const entry of workingRoster) {
      const available =
        getEmployeeAvailableMinutes(entry);

      const allocated =
        getEmployeeAllocatedMinutes(
          entry.employeeId
        );

      if (allocated > available) {
        Alert.alert(
          'Employee Overallocated',
          `${
            getEmployee(entry.employeeId)?.name ||
            'This employee'
          } has ${formatMinutes(
            available
          )} available after the load but is allocated ${formatMinutes(
            allocated
          )}.`
        );

        return;
      }
    }

    for (const task of tasks) {
      const allocated =
        getTaskAllocatedMinutes(task.name);

      if (allocated > task.requiredMinutes) {
        Alert.alert(
          'Task Overallocated',
          `${task.name} requires ${formatMinutes(
            task.requiredMinutes
          )} but the draft allocates ${formatMinutes(
            allocated
          )}.`
        );

        return;
      }
    }

    const underAllocatedTasks =
      tasks.filter(
        (task) =>
          getTaskAllocatedMinutes(task.name) <
          task.requiredMinutes
      );

    if (underAllocatedTasks.length > 0) {
      Alert.alert(
        'Plan Not Fully Covered',
        `${underAllocatedTasks.length} task(s) still have unallocated labour. Save this draft anyway?`,
        [
          {
            text: 'Keep Editing',
            style: 'cancel',
          },
          {
            text: 'Save Anyway',
            onPress: () =>
              persistAllocations(
                draftAllocations
              ),
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
        <Text style={styles.loadingText}>
          Loading staff allocation...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
        >
          <Text style={styles.back}>
            ‹ Tonight
          </Text>
        </TouchableOpacity>

        <Text style={styles.headerSmall}>
          GROCERY NIGHTFILL
        </Text>

        <Text style={styles.title}>
          Staff Allocation
        </Text>

        <Text style={styles.subtitle}>
          {dayName} · {dateKey}
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
            loadArrival?.arrived
              ? styles.arrivalReady
              : styles.arrivalWaiting,
          ]}
        >
          <View>
            <Text style={styles.arrivalLabel}>
              LOAD STATUS
            </Text>

            <Text
              style={
                loadArrival?.arrived
                  ? styles.arrivalReadyText
                  : styles.arrivalWaitingText
              }
            >
              {loadArrival?.arrived
                ? `Arrived ${formatClock(
                    loadArrival.actualTime
                  )}`
                : 'Load arrival not recorded'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              router.push('/load-arrival')
            }
          >
            <Text style={styles.changeText}>
              Manage
            </Text>
          </TouchableOpacity>
        </View>

        {!loadArrival?.arrived && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>
              Suggestions are provisional
            </Text>

            <Text style={styles.warningText}>
              Until actual load arrival is recorded, the app uses each employee’s full shift as available labour.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Real Labour Position
        </Text>

        <View style={styles.labourCard}>
          {loadArrival?.arrived && (
            <SummaryRow
              label="Labour before load"
              value={formatMinutes(
                labourPosition.preLoadMinutes
              )}
              type="warning"
            />
          )}

          <SummaryRow
            label={
              loadArrival?.arrived
                ? 'Available after arrival'
                : 'Available roster labour'
            }
            value={formatMinutes(
              labourPosition.postArrivalMinutes
            )}
            type="primary"
          />

          <SummaryRow
            label="Load required"
            value={formatMinutes(requiredMinutes)}
          />

          <View style={styles.divider} />

          <SummaryRow
            label={
              labourPosition.differenceMinutes < 0
                ? 'REAL SHORTAGE'
                : 'REAL SURPLUS'
            }
            value={
              labourPosition.differenceMinutes < 0
                ? `-${formatMinutes(
                    Math.abs(
                      labourPosition.differenceMinutes
                    )
                  )}`
                : `+${formatMinutes(
                    labourPosition.differenceMinutes
                  )}`
            }
            type={
              labourPosition.differenceMinutes < 0
                ? 'danger'
                : 'good'
            }
          />
        </View>

        <View style={styles.planStats}>
          <View style={styles.planStat}>
            <Text style={styles.planStatLabel}>
              Draft Allocated
            </Text>
            <Text style={styles.planStatValue}>
              {formatMinutes(totalAllocatedMinutes)}
            </Text>
          </View>

          <View style={styles.planDivider} />

          <View style={styles.planStat}>
            <Text style={styles.planStatLabel}>
              Staff Time Left
            </Text>
            <Text style={styles.remainingValue}>
              {formatMinutes(totalRemainingMinutes)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitleNoMargin}>
              Smart Suggestions
            </Text>
            <Text style={styles.helperText}>
              Skill-based aisle suggestions only. Nothing is final until you save the plan.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.applyAllButton}
            onPress={applyAllSuggestions}
            disabled={
              suggestionResult.allocations.length === 0
            }
          >
            <Text style={styles.applyAllText}>
              Apply All
            </Text>
          </TouchableOpacity>
        </View>

        {tasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No Load Data
            </Text>
            <Text style={styles.emptyText}>
              Scan tonight’s Fill Assist load first.
            </Text>
          </View>
        ) : suggestionGroups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No Suggestion Available
            </Text>
            <Text style={styles.emptyText}>
              Add rostered staff and available labour first.
            </Text>
          </View>
        ) : (
          suggestionGroups.map(({ task, allocations }) => (
            <View
              key={task.name}
              style={styles.suggestionCard}
            >
              <View style={styles.suggestionHeader}>
                <View style={styles.suggestionInfo}>
                  <Text
                    style={
                      task.type === 'splitting'
                        ? styles.splittingName
                        : styles.suggestionTaskName
                    }
                  >
                    {task.name}
                  </Text>

                  <Text style={styles.suggestionRequired}>
                    Required {formatMinutes(
                      task.requiredMinutes
                    )}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.useSuggestionButton}
                  onPress={() =>
                    applySuggestionForTask(task.name)
                  }
                >
                  <Text style={styles.useSuggestionText}>
                    Use Suggestion
                  </Text>
                </TouchableOpacity>
              </View>

              {allocations.map((item, index) => {
                const employee =
                  getEmployee(item.employeeId);

                return (
                  <View
                    key={`${item.employeeId}-${item.taskName}-${index}`}
                    style={styles.suggestionRow}
                  >
                    <View style={styles.suggestionPerson}>
                      <Text style={styles.suggestionPersonName}>
                        {employee?.name || 'Team member'}
                      </Text>

                      <Text style={styles.suggestionReason}>
                        {item.reason}
                      </Text>
                    </View>

                    <Text style={styles.suggestionMinutes}>
                      {formatMinutes(item.minutes)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}

        {suggestionResult.unallocatedTasks.length > 0 && (
          <View style={styles.shortageCard}>
            <Text style={styles.shortageTitle}>
              Suggestion cannot fully cover the load
            </Text>

            {suggestionResult.unallocatedTasks.map(
              (item) => (
                <Text
                  key={item.taskName}
                  style={styles.shortageText}
                >
                  {item.taskName}: {formatMinutes(
                    item.remainingMinutes
                  )} still uncovered
                </Text>
              )
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Load Requirements
        </Text>

        {tasks.map((task) => {
          const allocated =
            getTaskAllocatedMinutes(task.name);

          const remaining =
            task.requiredMinutes - allocated;

          return (
            <View
              key={task.name}
              style={styles.requirementCard}
            >
              <View>
                <Text
                  style={
                    task.type === 'splitting'
                      ? styles.splittingName
                      : styles.requirementName
                  }
                >
                  {task.name}
                </Text>
                <Text style={styles.requirementSubtext}>
                  Required {formatMinutes(
                    task.requiredMinutes
                  )}
                </Text>
              </View>

              <View style={styles.requirementRight}>
                <Text style={styles.requirementAllocated}>
                  {formatMinutes(allocated)} allocated
                </Text>
                <Text
                  style={
                    remaining > 0
                      ? styles.requirementRemaining
                      : styles.requirementCovered
                  }
                >
                  {remaining > 0
                    ? `${formatMinutes(remaining)} left`
                    : 'Covered'}
                </Text>
              </View>
            </View>
          );
        })}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitleNoMargin}>
              Manager Editor
            </Text>
            <Text style={styles.helperText}>
              Suggestions are only a starting point. Change any employee or minutes before saving.
            </Text>
          </View>

          <TouchableOpacity onPress={clearAll}>
            <Text style={styles.clearAllText}>
              Clear Draft
            </Text>
          </TouchableOpacity>
        </View>

        {workingRoster.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No Active Staff
            </Text>
            <Text style={styles.emptyText}>
              Add working staff to tonight’s roster first.
            </Text>
          </View>
        ) : (
          workingRoster.map((entry) => {
            const employee =
              getEmployee(entry.employeeId);

            if (!employee) {
              return null;
            }

            const available =
              getEmployeeAvailableMinutes(entry);

            const preLoad =
              getEmployeePreLoadMinutes(entry);

            const allocated =
              getEmployeeAllocatedMinutes(
                entry.employeeId
              );

            const remaining =
              Math.max(available - allocated, 0);

            const initials = employee.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <View
                key={entry.employeeId}
                style={styles.employeeCard}
              >
                <View style={styles.employeeHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initials}
                    </Text>
                  </View>

                  <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName}>
                      {employee.name}
                    </Text>

                    <Text style={styles.employeeShift}>
                      {entry.startTime && entry.finishTime
                        ? `${formatClock(
                            entry.startTime
                          )} → ${formatClock(
                            entry.finishTime
                          )}`
                        : `${formatMinutes(
                            Math.round(
                              (Number(entry.hours) || 0) * 60
                            )
                          )} rostered`}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      clearEmployee(entry.employeeId)
                    }
                  >
                    <Text style={styles.clearEmployeeText}>
                      Clear
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.employeeStats}>
                  {loadArrival?.arrived && (
                    <MiniStat
                      label="Before Load"
                      value={formatMinutes(preLoad)}
                    />
                  )}

                  <MiniStat
                    label="Available"
                    value={formatMinutes(available)}
                  />

                  <MiniStat
                    label="Allocated"
                    value={formatMinutes(allocated)}
                  />

                  <MiniStat
                    label="Remaining"
                    value={formatMinutes(remaining)}
                  />
                </View>

                {available === 0 ? (
                  <Text style={styles.noTimeText}>
                    No shift time remains after the load arrival.
                  </Text>
                ) : (
                  <View style={styles.employeeTasks}>
                    {tasks.map((task) => {
                      const key =
                        `${entry.employeeId}::${task.name}`;

                      const skill =
                        task.name.startsWith('Aisle ')
                          ? Number(
                              employee.aisleSkills?.[
                                task.name
                              ]
                            ) || 0
                          : 0;

                      return (
                        <View
                          key={task.name}
                          style={styles.allocationRow}
                        >
                          <View style={styles.allocationTaskInfo}>
                            <Text
                              style={
                                task.type === 'splitting'
                                  ? styles.splittingTaskText
                                  : styles.allocationTaskName
                              }
                            >
                              {task.name}
                            </Text>

                            {task.name.startsWith('Aisle ') && (
                              <Text style={styles.skillText}>
                                Skill {skill > 0
                                  ? `${skill}/5`
                                  : 'not rated'}
                              </Text>
                            )}
                          </View>

                          <View style={styles.allocationInputBox}>
                            <TextInput
                              value={inputValues[key] || ''}
                              onChangeText={(text) =>
                                updateInput(
                                  entry.employeeId,
                                  task.name,
                                  text
                                )
                              }
                              placeholder="min"
                              keyboardType="numbers-and-punctuation"
                              style={styles.allocationInput}
                            />
                            <Text style={styles.minuteSuffix}>
                              min
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            saving && styles.disabledButton,
          ]}
          onPress={savePlan}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving
              ? 'Saving Plan...'
              : 'Save Final Allocation'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.teamPlanButton}
          onPress={() =>
            router.push('/team-plan')
          }
        >
          <Text style={styles.teamPlanText}>
            View Team Plan →
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string;
  type?: 'primary' | 'good' | 'danger' | 'warning';
}) {
  let valueStyle = styles.summaryValue;

  if (type === 'primary') {
    valueStyle = styles.summaryPrimary;
  }

  if (type === 'good') {
    valueStyle = styles.summaryGood;
  }

  if (type === 'danger') {
    valueStyle = styles.summaryDanger;
  }

  if (type === 'warning') {
    valueStyle = styles.summaryWarning;
  }

  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>
        {label}
      </Text>
      <Text style={valueStyle}>
        {value}
      </Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>
        {label}
      </Text>
      <Text style={styles.miniStatValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FA',
  },
  loadingText: {
    color: '#667085',
  },
  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 25,
  },
  back: {
    color: '#D5DBED',
    fontSize: 14,
    marginBottom: 14,
  },
  headerSmall: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '800',
    marginTop: 4,
  },
  subtitle: {
    color: '#D5DBED',
    fontSize: 11,
    marginTop: 4,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  arrivalCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arrivalReady: {
    backgroundColor: '#E8F8EF',
  },
  arrivalWaiting: {
    backgroundColor: '#FFF4E5',
  },
  arrivalLabel: {
    color: '#667085',
    fontSize: 8,
    fontWeight: '800',
  },
  arrivalReadyText: {
    color: '#168455',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  arrivalWaitingText: {
    color: '#B54708',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  changeText: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },
  warningCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  warningTitle: {
    color: '#B54708',
    fontSize: 11,
    fontWeight: '800',
  },
  warningText: {
    color: '#8A5A19',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 9,
  },
  sectionTitleNoMargin: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
    marginBottom: 9,
  },
  sectionHeaderText: {
    flex: 1,
  },
  helperText: {
    color: '#667085',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  labourCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: {
    color: '#667085',
    fontSize: 10,
  },
  summaryValue: {
    color: '#101D48',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryPrimary: {
    color: '#2436B2',
    fontSize: 14,
    fontWeight: '800',
  },
  summaryGood: {
    color: '#168455',
    fontSize: 14,
    fontWeight: '800',
  },
  summaryDanger: {
    color: '#D92D20',
    fontSize: 14,
    fontWeight: '800',
  },
  summaryWarning: {
    color: '#B54708',
    fontSize: 13,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#EAECF0',
    marginVertical: 5,
  },
  planStats: {
    backgroundColor: '#101D48',
    borderRadius: 14,
    padding: 14,
    marginTop: 9,
    flexDirection: 'row',
  },
  planStat: {
    flex: 1,
    alignItems: 'center',
  },
  planDivider: {
    width: 1,
    backgroundColor: '#34446E',
  },
  planStatLabel: {
    color: '#AEB9DD',
    fontSize: 8,
  },
  planStatValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  remainingValue: {
    color: '#8EE1B4',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  applyAllButton: {
    backgroundColor: '#2436B2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  applyAllText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#D7DDFE',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionTaskName: {
    color: '#101828',
    fontSize: 13,
    fontWeight: '800',
  },
  splittingName: {
    color: '#6D5DFB',
    fontSize: 13,
    fontWeight: '800',
  },
  suggestionRequired: {
    color: '#667085',
    fontSize: 9,
    marginTop: 2,
  },
  useSuggestionButton: {
    backgroundColor: '#EEF1FF',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  useSuggestionText: {
    color: '#2436B2',
    fontSize: 8,
    fontWeight: '800',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F4F7',
  },
  suggestionPerson: {
    flex: 1,
  },
  suggestionPersonName: {
    color: '#101828',
    fontSize: 11,
    fontWeight: '800',
  },
  suggestionReason: {
    color: '#667085',
    fontSize: 8,
    lineHeight: 12,
    marginTop: 2,
  },
  suggestionMinutes: {
    color: '#2436B2',
    fontSize: 13,
    fontWeight: '800',
  },
  shortageCard: {
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  shortageTitle: {
    color: '#D92D20',
    fontSize: 10,
    fontWeight: '800',
  },
  shortageText: {
    color: '#912018',
    fontSize: 8,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  emptyTitle: {
    color: '#101828',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  requirementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requirementName: {
    color: '#101828',
    fontSize: 12,
    fontWeight: '800',
  },
  requirementSubtext: {
    color: '#667085',
    fontSize: 8,
    marginTop: 2,
  },
  requirementRight: {
    alignItems: 'flex-end',
  },
  requirementAllocated: {
    color: '#2436B2',
    fontSize: 9,
    fontWeight: '700',
  },
  requirementRemaining: {
    color: '#D92D20',
    fontSize: 8,
    marginTop: 2,
  },
  requirementCovered: {
    color: '#168455',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 2,
  },
  clearAllText: {
    color: '#D92D20',
    fontSize: 9,
    fontWeight: '800',
  },
  employeeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
    marginBottom: 12,
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E9ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#2436B2',
    fontWeight: '800',
  },
  employeeInfo: {
    flex: 1,
    marginLeft: 10,
  },
  employeeName: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },
  employeeShift: {
    color: '#667085',
    fontSize: 9,
    marginTop: 2,
  },
  clearEmployeeText: {
    color: '#D92D20',
    fontSize: 9,
    fontWeight: '800',
  },
  employeeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },
  miniStat: {
    flexGrow: 1,
    minWidth: '22%',
    backgroundColor: '#F7F8FA',
    borderRadius: 9,
    padding: 8,
  },
  miniStatLabel: {
    color: '#98A2B3',
    fontSize: 7,
  },
  miniStatValue: {
    color: '#101D48',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  noTimeText: {
    color: '#B54708',
    fontSize: 9,
    marginTop: 12,
  },
  employeeTasks: {
    marginTop: 12,
  },
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#F2F4F7',
  },
  allocationTaskInfo: {
    flex: 1,
  },
  allocationTaskName: {
    color: '#101828',
    fontSize: 10,
    fontWeight: '700',
  },
  splittingTaskText: {
    color: '#6D5DFB',
    fontSize: 10,
    fontWeight: '800',
  },
  skillText: {
    color: '#667085',
    fontSize: 7,
    marginTop: 2,
  },
  allocationInputBox: {
    width: 105,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 9,
    paddingHorizontal: 8,
  },
  allocationInput: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 9,
    color: '#101D48',
    fontWeight: '800',
  },
  minuteSuffix: {
    color: '#667085',
    fontSize: 7,
  },
  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  teamPlanButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 9,
    borderWidth: 1,
    borderColor: '#D7DDFE',
  },
  teamPlanText: {
    color: '#2436B2',
    fontSize: 12,
    fontWeight: '800',
  },
});
