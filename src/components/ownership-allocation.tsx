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
  AISLE_OWNERSHIP_STRETCH_MINUTES,
  buildAisleOwnershipPlan,
  type OwnershipTask,
} from '../utils/aisleOwnershipEngine';
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

function parseAllocationInput(value: string) {
  const text = value.trim();
  if (!text) return 0;

  if (text.includes(':')) {
    const [hoursText, minutesText = '0'] = text.split(':');
    const hours = Number(hoursText) || 0;
    const minutes = Number(minutesText) || 0;
    if (minutes < 0 || minutes > 59) return 0;
    return Math.max(Math.round(hours * 60 + minutes), 0);
  }

  const number = Number(text);
  if (Number.isNaN(number) || number < 0) return 0;
  return text.includes('.')
    ? Math.round(number * 60)
    : Math.round(number);
}

function buildTasks(load: NightLoad | null): OwnershipTask[] {
  if (!load) return [];

  const result: OwnershipTask[] = [];

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

    let type: OwnershipTask['type'] = 'aisle';
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

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function OwnershipAllocationScreen() {
  const context = useMemo(() => getTonightContext(), []);
  const { dateKey, dayName } = context;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster] = useState<PlanningRosterEntry[]>([]);
  const [load, setLoad] = useState<NightLoad | null>(null);
  const [arrival, setArrival] = useState<LoadArrivalRecord | null>(null);
  const [savedAllocations, setSavedAllocations] =
    useState<PlanningAllocation[]>([]);
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
        savedArrival,
        allocations,
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
        readNightValue<LoadArrivalRecord>(
          NIGHTFILL_STORAGE.arrivals,
          dateKey,
          dayName
        ),
        readNightValue<PlanningAllocation[]>(
          NIGHTFILL_STORAGE.allocations,
          dateKey,
          dayName
        ),
      ]);

      setEmployees(savedEmployees);
      setRoster(savedRoster || []);
      setLoad(savedLoad || null);
      setArrival(savedArrival || null);
      setSavedAllocations(allocations || []);

      const next: Record<string, string> = {};
      for (const allocation of allocations || []) {
        next[`${allocation.employeeId}::${allocation.taskName}`] =
          String(allocation.minutes);
      }
      setInputValues(next);
    } catch (error) {
      console.log('LOAD OWNERSHIP ALLOCATION ERROR:', error);
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
    () =>
      calculateLabourPosition(
        roster,
        requiredMinutes,
        arrivalTime
      ),
    [roster, requiredMinutes, arrivalTime]
  );

  const ownershipPlan = useMemo(
    () =>
      buildAisleOwnershipPlan({
        employees,
        roster,
        tasks,
        loadArrivalTime: arrivalTime,
      }),
    [employees, roster, tasks, arrivalTime]
  );

  const draftAllocations = useMemo(() => {
    const result: PlanningAllocation[] = [];

    for (const entry of workingRoster) {
      for (const task of tasks) {
        const minutes = parseAllocationInput(
          inputValues[`${entry.employeeId}::${task.name}`] || ''
        );
        if (minutes > 0) {
          result.push({
            employeeId: entry.employeeId,
            taskName: task.name,
            minutes,
          });
        }
      }
    }

    return result;
  }, [workingRoster, tasks, inputValues]);

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

  const draftHelp = workingRoster
    .map((entry) => {
      const available = employeeAvailable(entry.employeeId);
      const allocated = employeeAllocated(entry.employeeId);
      const over = Math.max(allocated - available, 0);
      return {
        employeeId: entry.employeeId,
        over,
        help: Math.max(over - AISLE_OWNERSHIP_STRETCH_MINUTES, 0),
      };
    })
    .filter((item) => item.help > 0);

  function applyAllSuggestions() {
    const next: Record<string, string> = {};

    for (const item of ownershipPlan.allocations) {
      const key = `${item.employeeId}::${item.taskName}`;
      const existing = parseAllocationInput(next[key] || '');
      next[key] = String(existing + item.minutes);
    }

    setInputValues(next);
  }

  function applyTask(taskName: string) {
    const suggestions = ownershipPlan.allocations.filter(
      (item) => item.taskName === taskName
    );

    setInputValues((current) => {
      const next = { ...current };
      for (const entry of workingRoster) {
        delete next[`${entry.employeeId}::${taskName}`];
      }
      for (const item of suggestions) {
        next[`${item.employeeId}::${item.taskName}`] = String(item.minutes);
      }
      return next;
    });
  }

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
        'Aisle ownership is saved. Rostered shift start and finish times were not changed.'
      );
    } catch (error) {
      console.log('SAVE OWNERSHIP ALLOCATION ERROR:', error);
      Alert.alert('Save Failed', 'Could not save tonight’s allocation.');
    } finally {
      setSaving(false);
    }
  }

  function savePlan() {
    const underAllocated = tasks.filter(
      (task) => taskAllocated(task.name) < task.requiredMinutes
    );

    if (underAllocated.length > 0) {
      Alert.alert(
        'Some Work Is Still Unassigned',
        `${underAllocated.length} task(s) are below their Fill Assist requirement.`,
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

    if (draftHelp.length > 0) {
      const helpText = draftHelp
        .map((item) => {
          const name = getEmployee(item.employeeId)?.name || 'Team member';
          return `${name}: Nightfill Manager help ${formatMinutes(item.help)}+`;
        })
        .join('\n');

      Alert.alert(
        'Nightfill Manager Help Required',
        `The app accepts up to ${AISLE_OWNERSHIP_STRETCH_MINUTES}m of estimated aisle stretch per person. These allocations go beyond that:\n\n${helpText}\n\nSave this plan with the help flag?`,
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Save With Help Flag',
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
        <Text style={styles.muted}>Loading aisle ownership plan…</Text>
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
          {dayName} · {dateKey} · aisle ownership first
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
            arrival?.arrived ? styles.arrivalGood : styles.arrivalWarning,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>TRUCK / LOAD</Text>
            <Text style={styles.cardTitle}>
              {arrival?.arrived
                ? `Arrived ${formatClock(arrival.actualTime)}`
                : 'Actual arrival not recorded'}
            </Text>
            <Text style={styles.cardNote}>
              Shift start/finish stay fixed. The app uses the remaining productive shift for suggestions.
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/load-arrival')}>
            <Text style={styles.link}>Manage</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Real Labour Position</Text>
        <View style={styles.metricsCard}>
          <Metric label="Gross roster" value={formatMinutes(labourPosition.fullRosterMinutes)} />
          <Metric label="Reserved breaks" value={formatMinutes(labourPosition.breakMinutes)} />
          {arrival?.arrived ? (
            <Metric label="Labour before load" value={formatMinutes(labourPosition.preLoadMinutes)} />
          ) : null}
          <Metric
            label={arrival?.arrived ? 'After arrival' : 'Productive roster'}
            value={formatMinutes(labourPosition.postArrivalMinutes)}
          />
          <Metric label="Load required" value={formatMinutes(requiredMinutes)} />
          <View style={styles.divider} />
          <Metric
            label={labourPosition.differenceMinutes < 0 ? 'REAL SHORTAGE' : 'REAL SURPLUS'}
            value={formatSignedMinutes(labourPosition.differenceMinutes)}
            danger={labourPosition.differenceMinutes < 0}
            strong
          />
        </View>

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Aisle ownership rule</Text>
          <Text style={styles.ruleText}>
            One person keeps ownership of an aisle even when the standard estimate is up to 30m above their remaining shift. If the estimate goes more than 30m over, the app flags Nightfill Manager help instead of silently overloading the team member.
          </Text>
          {ownershipPlan.compactAisleMode ? (
            <Text style={styles.compactText}>
              LIGHT LOAD MODE · The engine prefers about two aisles per suitable person before spreading further.
            </Text>
          ) : null}
        </View>

        {ownershipPlan.managerHelpRequired ? (
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>🧑‍✈️ Nightfill Manager Help Suggested</Text>
            {ownershipPlan.helpItems.map((item) => (
              <Text
                key={`${item.employeeId}-${item.taskName}`}
                style={styles.helpText}
              >
                {getEmployee(item.employeeId)?.name || 'Team member'} · {item.taskName} · help {formatMinutes(item.minutes)}+
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitleNoMargin}>Smart Suggestions</Text>
            <Text style={styles.helperText}>
              Primary aisle owner first. Manager can change every employee and minute before save.
            </Text>
          </View>
          <TouchableOpacity style={styles.applyButton} onPress={applyAllSuggestions}>
            <Text style={styles.applyText}>Apply All</Text>
          </TouchableOpacity>
        </View>

        {tasks.map((task) => {
          const suggestions = ownershipPlan.allocations.filter(
            (item) => item.taskName === task.name
          );

          return (
            <View key={task.name} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskName}>{task.name}</Text>
                  <Text style={styles.taskMeta}>
                    Standard {formatMinutes(task.requiredMinutes)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.useButton}
                  onPress={() => applyTask(task.name)}
                >
                  <Text style={styles.useText}>Use</Text>
                </TouchableOpacity>
              </View>

              {suggestions.length === 0 ? (
                <Text style={styles.noSuggestion}>No suggestion available</Text>
              ) : (
                suggestions.map((item, index) => (
                  <View
                    key={`${item.employeeId}-${index}`}
                    style={styles.suggestionRow}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.personRow}>
                        <Text style={styles.personName}>
                          {getEmployee(item.employeeId)?.name || 'Team member'}
                        </Text>
                        {item.aisleOwner ? (
                          <View style={styles.ownerBadge}>
                            <Text style={styles.ownerBadgeText}>OWNER</Text>
                          </View>
                        ) : null}
                        {item.stretchMinutes > 0 && !item.needsManagerHelp ? (
                          <View style={styles.stretchBadge}>
                            <Text style={styles.stretchBadgeText}>+{item.stretchMinutes}m OK</Text>
                          </View>
                        ) : null}
                        {item.needsManagerHelp ? (
                          <View style={styles.helpBadge}>
                            <Text style={styles.helpBadgeText}>MANAGER HELP</Text>
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
          );
        })}

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitleNoMargin}>Manager Editor</Text>
            <Text style={styles.helperText}>
              Up to 30m estimated stretch is shown as acceptable. More than 30m is clearly flagged for Nightfill Manager support.
            </Text>
          </View>
          <TouchableOpacity onPress={() => setInputValues({})}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {workingRoster.map((entry) => {
          const employee = getEmployee(entry.employeeId);
          if (!employee) return null;

          const available = employeeAvailable(entry.employeeId);
          const allocated = employeeAllocated(entry.employeeId);
          const over = Math.max(allocated - available, 0);
          const help = Math.max(
            over - AISLE_OWNERSHIP_STRETCH_MINUTES,
            0
          );
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
                <MiniStat label="Allocated" value={formatMinutes(allocated)} />
                <MiniStat
                  label={help > 0 ? 'Mgr Help' : over > 0 ? 'Stretch' : 'Remaining'}
                  value={formatMinutes(
                    help > 0
                      ? help
                      : over > 0
                        ? over
                        : Math.max(available - allocated, 0)
                  )}
                  danger={help > 0}
                />
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
          <Metric label="Draft allocated" value={formatMinutes(totalAllocatedMinutes)} />
          <Metric label="Load required" value={formatMinutes(requiredMinutes)} />
          {draftHelp.length > 0 ? (
            <Metric
              label="Nightfill Manager help"
              value={formatMinutes(
                draftHelp.reduce((total, item) => total + item.help, 0)
              )}
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
          <Text style={styles.saveText}>
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
          danger && styles.dangerText,
        ]}
      >
        {value}
      </Text>
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
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniValue, danger && styles.dangerText]}>
        {value}
      </Text>
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
  back: { color: '#D5DBED', fontSize: 14, marginBottom: 14 },
  eyebrow: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 4,
  },
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 4 },
  content: { padding: 16, paddingBottom: 60 },
  arrivalCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  arrivalGood: { backgroundColor: '#E8F8EF' },
  arrivalWarning: { backgroundColor: '#FFF4E5' },
  smallLabel: { color: '#667085', fontSize: 8, fontWeight: '800' },
  cardTitle: { color: '#101828', fontSize: 14, fontWeight: '800', marginTop: 3 },
  cardNote: { color: '#667085', fontSize: 9, lineHeight: 14, marginTop: 3 },
  link: { color: '#2436B2', fontSize: 10, fontWeight: '800' },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 9,
  },
  sectionTitleNoMargin: { color: '#101828', fontSize: 17, fontWeight: '800' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 9,
  },
  helperText: { color: '#667085', fontSize: 9, lineHeight: 14, marginTop: 3 },
  metricsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metricLabel: { color: '#667085', fontSize: 10 },
  metricValue: { color: '#101D48', fontSize: 13, fontWeight: '800' },
  metricStrong: { fontSize: 14 },
  divider: { height: 1, backgroundColor: '#EAECF0', marginVertical: 4 },
  ruleCard: {
    backgroundColor: '#EEF1FF',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  ruleTitle: { color: '#2436B2', fontSize: 12, fontWeight: '800' },
  ruleText: { color: '#475467', fontSize: 9, lineHeight: 15, marginTop: 4 },
  compactText: { color: '#4C3BCF', fontSize: 9, fontWeight: '800', marginTop: 9 },
  helpCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#F7C97C',
  },
  helpTitle: { color: '#B54708', fontSize: 12, fontWeight: '800' },
  helpText: { color: '#8A5A19', fontSize: 9, marginTop: 5 },
  applyButton: {
    backgroundColor: '#2436B2',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  applyText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskName: { color: '#101828', fontSize: 13, fontWeight: '800' },
  taskMeta: { color: '#667085', fontSize: 9, marginTop: 2 },
  useButton: {
    backgroundColor: '#EEF1FF',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  useText: { color: '#2436B2', fontSize: 8, fontWeight: '800' },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F4F7',
  },
  personRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  personName: { color: '#101828', fontSize: 11, fontWeight: '800' },
  ownerBadge: { backgroundColor: '#E8F8EF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  ownerBadgeText: { color: '#168455', fontSize: 6, fontWeight: '900' },
  stretchBadge: { backgroundColor: '#FFF4E5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  stretchBadgeText: { color: '#B54708', fontSize: 6, fontWeight: '900' },
  helpBadge: { backgroundColor: '#FDECEC', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  helpBadgeText: { color: '#D92D20', fontSize: 6, fontWeight: '900' },
  reason: { color: '#667085', fontSize: 8, lineHeight: 12, marginTop: 3 },
  minutes: { color: '#2436B2', fontSize: 13, fontWeight: '800' },
  noSuggestion: { color: '#98A2B3', fontSize: 9, marginTop: 10 },
  clearText: { color: '#D92D20', fontSize: 9, fontWeight: '800' },
  employeeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E9ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#2436B2', fontSize: 15, fontWeight: '900' },
  employeeName: { color: '#101828', fontSize: 14, fontWeight: '800' },
  employeeShift: { color: '#667085', fontSize: 9, marginTop: 3 },
  employeeStats: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 12,
  },
  miniStat: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    borderRadius: 10,
    padding: 9,
  },
  miniLabel: { color: '#98A2B3', fontSize: 7 },
  miniValue: { color: '#101D48', fontSize: 12, fontWeight: '800', marginTop: 3 },
  dangerText: { color: '#D92D20' },
  editorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F4F7',
    marginTop: 8,
  },
  editorTask: { color: '#101828', fontSize: 11, fontWeight: '800' },
  skillText: { color: '#98A2B3', fontSize: 8, marginTop: 2 },
  inputWrap: {
    width: 115,
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    textAlign: 'right',
    color: '#101D48',
    fontWeight: '800',
  },
  inputSuffix: { color: '#98A2B3', fontSize: 8 },
  draftCard: { backgroundColor: '#101D48', borderRadius: 14, padding: 14, marginTop: 10 },
  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  disabled: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  teamPlanButton: { alignItems: 'center', paddingVertical: 15 },
  teamPlanText: { color: '#2436B2', fontSize: 11, fontWeight: '800' },
});
