import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  buildEmployeePlans,
  buildTeamTaskPlans,
  dateToNightMinutes,
  formatMinutes,
  formatNightMinute,
  getCurrentNightMinutes,
  timeToNightMinutes,
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

type Employee = { id: string; name: string };
type LoadItem = { name: string; cartons: string; hours: string; minutes: string };
type NightLoad = {
  day: string;
  dateKey?: string;
  items: LoadItem[];
  totalRequiredMinutes: number;
  splittingMinutes: number;
  otherOrganisingMinutes: number;
  promoMinutes?: number;
  protectMinutes?: number;
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
type StartMode = 'auto' | 'manual';
type ManualResult = 'On Time' | 'Ahead' | 'Behind' | 'Just Complete' | null;
type ProgressItem = {
  taskName: string;
  status: TaskStatus;
  requiredMinutes: number;
  startedAt: string | null;
  completedAt: string | null;
  actualSeconds: number | null;
  completionMode: 'timer' | 'manual' | null;
  manualResult: ManualResult;
  manualDifferenceMinutes: number;
  startMode?: StartMode;
};

function employeeName(employees: Employee[], id: string) {
  return employees.find((employee) => employee.id === id)?.name || 'Team member';
}

function requiredMinutes(load: NightLoad | null, taskName: string) {
  if (!load) return 0;
  if (taskName === 'Splitting') return load.splittingMinutes || 0;
  if (taskName === 'Other / Organising') return load.otherOrganisingMinutes || 0;
  if (taskName === 'Promo' && load.promoMinutes) return load.promoMinutes;
  if (taskName === 'Protect - Aisle' && load.protectMinutes) return load.protectMinutes;
  const item = load.items?.find((entry) => entry.name === taskName);
  return item ? (Number(item.hours) || 0) * 60 + (Number(item.minutes) || 0) : 0;
}

function nightMinuteToIso(date: Date, minute: number) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  value.setMinutes(Math.round(minute));
  return value.toISOString();
}

function nightMinuteTo24Hour(value: number) {
  let minute = Math.round(value) % 1440;
  if (minute < 0) minute += 1440;
  const hour = Math.floor(minute / 60);
  return `${String(hour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export default function LiveProgressScheduleScreen() {
  const context = useMemo(() => getTonightContext(), []);
  const { date: nightfillDate, dateKey, dayName } = context;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roster, setRoster] = useState<PlanningRosterEntry[]>([]);
  const [allocations, setAllocations] = useState<PlanningAllocation[]>([]);
  const [load, setLoad] = useState<NightLoad | null>(null);
  const [arrival, setArrival] = useState<LoadArrivalRecord | null>(null);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [editingTask, setEditingTask] = useState<TeamTaskPlan | null>(null);
  const [startInput, setStartInput] = useState('');

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [savedEmployees, savedRoster, savedAllocations, savedLoad, savedArrival, savedProgress] =
        await Promise.all([
          readStorage<Employee[]>('groceryEmployees', []),
          readNightValue<PlanningRosterEntry[]>(NIGHTFILL_STORAGE.roster, dateKey, dayName),
          readNightValue<PlanningAllocation[]>(NIGHTFILL_STORAGE.allocations, dateKey, dayName),
          readNightValue<NightLoad>(NIGHTFILL_STORAGE.loads, dateKey, dayName),
          readNightValue<LoadArrivalRecord>(NIGHTFILL_STORAGE.arrivals, dateKey, dayName),
          readNightValue<ProgressItem[]>(NIGHTFILL_STORAGE.progress, dateKey, dayName),
        ]);
      setEmployees(savedEmployees);
      setRoster(savedRoster || []);
      setAllocations(savedAllocations || []);
      setLoad(savedLoad || null);
      setArrival(savedArrival || null);
      setProgress(savedProgress || []);
      setNow(Date.now());
    } catch (error) {
      console.log('LOAD LIVE PROGRESS ERROR:', error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const arrivalTime = arrival?.arrived ? arrival.actualTime : null;
  const employeePlans = useMemo(
    () => buildEmployeePlans(roster, allocations, arrivalTime),
    [roster, allocations, arrivalTime]
  );
  const taskPlans = useMemo(() => buildTeamTaskPlans(employeePlans), [employeePlans]);
  const currentMinute = getCurrentNightMinutes();

  function findProgress(taskName: string) {
    return progress.find((item) => item.taskName === taskName);
  }

  function effectiveStart(plan: TeamTaskPlan, item?: ProgressItem) {
    const saved = item?.startedAt ? dateToNightMinutes(item.startedAt) : null;
    return saved ?? plan.plannedStartMinute;
  }

  function displayStatus(plan: TeamTaskPlan): TaskStatus {
    const item = findProgress(plan.taskName);
    if (item?.status === 'Complete') return 'Complete';
    if (!arrival?.arrived) return 'Not Started';
    return currentMinute >= effectiveStart(plan, item) ? 'In Progress' : 'Not Started';
  }

  async function saveProgress(next: ProgressItem[]) {
    setProgress(next);
    try {
      await saveNightValue(NIGHTFILL_STORAGE.progress, dateKey, next, dayName);
    } catch (error) {
      console.log('SAVE LIVE PROGRESS ERROR:', error);
    }
  }

  useEffect(() => {
    if (loading || !arrival?.arrived || taskPlans.length === 0) return;

    let changed = false;
    const next = [...progress];

    for (const plan of taskPlans) {
      const index = next.findIndex((item) => item.taskName === plan.taskName);
      const existing = index >= 0 ? next[index] : undefined;
      if (existing?.status === 'Complete') continue;

      if (existing?.startedAt && (!existing.startMode || existing.startMode === 'manual')) {
        const start = dateToNightMinutes(existing.startedAt);
        const desired: TaskStatus = start !== null && currentMinute >= start ? 'In Progress' : 'Not Started';
        if (!existing.startMode || existing.status !== desired) {
          next[index] = { ...existing, startMode: 'manual', status: desired };
          changed = true;
        }
        continue;
      }

      const desiredAutoStart = nightMinuteToIso(nightfillDate, plan.plannedStartMinute);
      const desiredAutoStatus: TaskStatus = currentMinute >= plan.plannedStartMinute ? 'In Progress' : 'Not Started';

      if (existing?.startMode === 'auto') {
        if (existing.startedAt !== desiredAutoStart || existing.status !== desiredAutoStatus) {
          next[index] = {
            ...existing,
            status: desiredAutoStatus,
            startedAt: desiredAutoStart,
            startMode: 'auto',
          };
          changed = true;
        }
        continue;
      }

      if (currentMinute < plan.plannedStartMinute) continue;

      const autoItem: ProgressItem = {
        taskName: plan.taskName,
        status: 'In Progress',
        requiredMinutes: requiredMinutes(load, plan.taskName),
        startedAt: desiredAutoStart,
        completedAt: null,
        actualSeconds: null,
        completionMode: null,
        manualResult: null,
        manualDifferenceMinutes: 0,
        startMode: 'auto',
      };

      if (index >= 0) next[index] = { ...existing, ...autoItem };
      else next.push(autoItem);
      changed = true;
    }

    if (changed) saveProgress(next);
  }, [loading, now, arrival?.arrived, taskPlans, progress]);

  function openStartEditor(plan: TeamTaskPlan) {
    const item = findProgress(plan.taskName);
    setEditingTask(plan);
    setStartInput(nightMinuteTo24Hour(effectiveStart(plan, item)));
  }

  async function saveManualStart() {
    if (!editingTask) return;
    const minute = timeToNightMinutes(startInput);
    if (minute === null) {
      Alert.alert('Check Start Time', 'Enter a valid 24-hour time, for example 20:15.');
      return;
    }

    const existing = findProgress(editingTask.taskName);
    const complete = existing?.status === 'Complete';
    const item: ProgressItem = {
      taskName: editingTask.taskName,
      status: complete ? 'Complete' : currentMinute >= minute ? 'In Progress' : 'Not Started',
      requiredMinutes: requiredMinutes(load, editingTask.taskName),
      startedAt: nightMinuteToIso(nightfillDate, minute),
      completedAt: existing?.completedAt || null,
      actualSeconds: existing?.actualSeconds || null,
      completionMode: existing?.completionMode || null,
      manualResult: existing?.manualResult || null,
      manualDifferenceMinutes: existing?.manualDifferenceMinutes || 0,
      startMode: 'manual',
    };
    const next = existing
      ? progress.map((entry) => entry.taskName === editingTask.taskName ? item : entry)
      : [...progress, item];
    await saveProgress(next);
    setEditingTask(null);
  }

  async function useAutomaticStart(plan: TeamTaskPlan) {
    const existing = findProgress(plan.taskName);
    const complete = existing?.status === 'Complete';
    const item: ProgressItem = {
      taskName: plan.taskName,
      status: complete ? 'Complete' : arrival?.arrived && currentMinute >= plan.plannedStartMinute ? 'In Progress' : 'Not Started',
      requiredMinutes: requiredMinutes(load, plan.taskName),
      startedAt: nightMinuteToIso(nightfillDate, plan.plannedStartMinute),
      completedAt: existing?.completedAt || null,
      actualSeconds: existing?.actualSeconds || null,
      completionMode: existing?.completionMode || null,
      manualResult: existing?.manualResult || null,
      manualDifferenceMinutes: existing?.manualDifferenceMinutes || 0,
      startMode: 'auto',
    };
    const next = existing
      ? progress.map((entry) => entry.taskName === plan.taskName ? item : entry)
      : [...progress, item];
    await saveProgress(next);
    setEditingTask(null);
  }

  function completeTask(plan: TeamTaskPlan) {
    if (!arrival?.arrived) {
      Alert.alert('Load Not Arrived', 'Record the actual load arrival before completing load tasks.');
      return;
    }
    const existing = findProgress(plan.taskName);
    if (existing?.status === 'Complete') return;

    const actualFinish = getCurrentNightMinutes();
    const difference = plan.plannedFinishMinute - actualFinish;
    const result: ManualResult = difference > 0 ? 'Ahead' : difference < 0 ? 'Behind' : 'On Time';
    const resultText = difference > 0
      ? `${formatMinutes(difference)} ahead`
      : difference < 0
        ? `${formatMinutes(Math.abs(difference))} behind`
        : 'On time';

    Alert.alert(
      `${plan.taskName} Complete?`,
      `Planned finish: ${formatNightMinute(plan.plannedFinishMinute)}\nComplete now: ${formatNightMinute(actualFinish)}\n\nResult: ${resultText}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            const item: ProgressItem = {
              taskName: plan.taskName,
              status: 'Complete',
              requiredMinutes: requiredMinutes(load, plan.taskName),
              startedAt: existing?.startedAt || nightMinuteToIso(nightfillDate, plan.plannedStartMinute),
              completedAt: new Date().toISOString(),
              actualSeconds: null,
              completionMode: 'manual',
              manualResult: result,
              manualDifferenceMinutes: Math.abs(Math.round(difference)),
              startMode: existing?.startMode || 'auto',
            };
            const next = existing
              ? progress.map((entry) => entry.taskName === plan.taskName ? item : entry)
              : [...progress, item];
            await saveProgress(next);
          },
        },
      ]
    );
  }

  function taskPosition(plan: TeamTaskPlan) {
    const item = findProgress(plan.taskName);
    const status = displayStatus(plan);
    if (status === 'Complete' && item?.completedAt) {
      const actual = dateToNightMinutes(item.completedAt);
      if (actual === null) return 'Complete';
      const difference = plan.plannedFinishMinute - actual;
      if (difference > 0) return `${formatMinutes(difference)} ahead`;
      if (difference < 0) return `${formatMinutes(Math.abs(difference))} behind`;
      return 'On time';
    }
    if (status === 'In Progress') {
      const difference = plan.plannedFinishMinute - currentMinute;
      return difference < 0
        ? `${formatMinutes(Math.abs(difference))} behind plan`
        : `${formatMinutes(difference)} to planned finish`;
    }
    if (!arrival?.arrived) return 'Waiting for load';
    return `Auto starts ${formatNightMinute(effectiveStart(plan, item))}`;
  }

  if (loading) {
    return <View style={styles.center}><Text style={styles.muted}>Loading live progress...</Text></View>;
  }

  const completed = taskPlans.filter((plan) => displayStatus(plan) === 'Complete').length;
  const active = taskPlans.filter((plan) => displayStatus(plan) === 'In Progress').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Team Plan</Text></TouchableOpacity>
        <Text style={styles.title}>Live Progress</Text>
        <Text style={styles.headerSub}>{dayName} Nightfill · {dateKey}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Automatic Shift Tracking</Text>
          <Text style={styles.infoText}>No timer and no Start button. Each employee becomes active automatically at the rostered shift start. Load tasks follow the approved Team Plan automatically after the load arrives. Use Adjust Start only if the real start was different.</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.statCard}><Text style={styles.label}>Complete</Text><Text style={styles.value}>{completed}/{taskPlans.length}</Text></View>
          <View style={styles.statCard}><Text style={styles.label}>In Progress</Text><Text style={styles.value}>{active}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Team Shift Status</Text>
        {employeePlans.length === 0 ? (
          <View style={styles.card}><Text style={styles.cardTitle}>No rostered team</Text></View>
        ) : employeePlans.map((plan) => {
          const started = currentMinute >= plan.shiftStartMinute;
          const finished = currentMinute >= plan.shiftFinishMinute;
          const status = !started
            ? `Starts automatically ${formatNightMinute(plan.shiftStartMinute)}`
            : finished
              ? 'Shift finished'
              : !arrival?.arrived
                ? 'Shift active · waiting for load'
                : 'Shift active automatically';
          return (
            <View key={plan.employeeId} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{employeeName(employees, plan.employeeId)}</Text>
                <Text style={styles.small}>{formatNightMinute(plan.shiftStartMinute)} → {formatNightMinute(plan.shiftFinishMinute)}</Text>
              </View>
              <Text style={styles.activeText}>{status}</Text>
              <Text style={styles.small}>Before load {formatMinutes(plan.preLoadMinutes)} · Load labour {formatMinutes(plan.availableAfterLoadMinutes)} · Allocated {formatMinutes(plan.allocatedMinutes)}</Text>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Task Timeline</Text>
        {taskPlans.length === 0 ? (
          <View style={styles.card}><Text style={styles.cardTitle}>No approved allocation</Text><Text style={styles.small}>Save the final Staff Allocation first.</Text></View>
        ) : taskPlans.map((plan) => {
          const item = findProgress(plan.taskName);
          const status = displayStatus(plan);
          const start = effectiveStart(plan, item);
          return (
            <View key={plan.taskName} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{plan.taskName}</Text>
                  <Text style={styles.small}>{plan.employeeIds.map((id) => employeeName(employees, id)).join(', ')}</Text>
                </View>
                <Text style={styles.badge}>{status === 'Not Started' ? 'WAITING' : status.toUpperCase()}</Text>
              </View>

              <View style={styles.row}>
                <View style={styles.clockCard}><Text style={styles.label}>START</Text><Text style={styles.clock}>{formatNightMinute(start)}</Text><Text style={styles.small}>{item?.startMode === 'manual' ? 'MANUAL' : 'AUTO'}</Text></View>
                <View style={styles.clockCard}><Text style={styles.label}>PLAN FINISH</Text><Text style={styles.clock}>{formatNightMinute(plan.plannedFinishMinute)}</Text><Text style={styles.small}>{formatMinutes(plan.elapsedMinutes)} elapsed</Text></View>
              </View>

              <Text style={styles.small}>{plan.staffCount} staff · {formatMinutes(plan.allocatedLabourMinutes)} labour</Text>
              <Text style={status === 'Complete' ? styles.goodText : status === 'In Progress' ? styles.activeText : styles.muted}>{taskPosition(plan)}</Text>

              <View style={styles.row}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => openStartEditor(plan)}><Text style={styles.secondaryText}>Adjust Start</Text></TouchableOpacity>
                {status !== 'Complete' && <TouchableOpacity style={styles.completeButton} onPress={() => completeTask(plan)}><Text style={styles.completeText}>Mark Complete</Text></TouchableOpacity>}
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.summaryButton} onPress={() => router.push('/night-summary')}><Text style={styles.summaryText}>Night Summary →</Text></TouchableOpacity>
      </ScrollView>

      <Modal visible={editingTask !== null} transparent animationType="fade" onRequestClose={() => setEditingTask(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adjust Start Time</Text>
            <Text style={styles.small}>{editingTask?.taskName}</Text>
            <TextInput style={styles.input} value={startInput} onChangeText={setStartInput} placeholder="20:15" keyboardType="numbers-and-punctuation" maxLength={5} />
            <View style={styles.row}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditingTask(null)}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
              {editingTask && <TouchableOpacity style={styles.autoButton} onPress={() => useAutomaticStart(editingTask)}><Text style={styles.autoText}>Use Auto</Text></TouchableOpacity>}
              <TouchableOpacity style={styles.completeButton} onPress={saveManualStart}><Text style={styles.completeText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F6FA' },
  header: { backgroundColor: '#101D48', paddingTop: 65, paddingHorizontal: 22, paddingBottom: 24 },
  back: { color: '#D5DBED', fontSize: 14, marginBottom: 12 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  headerSub: { color: '#D5DBED', fontSize: 11, marginTop: 4 },
  content: { padding: 16, paddingBottom: 55 },
  infoCard: { backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#D7DDFE' },
  infoTitle: { color: '#2436B2', fontSize: 14, fontWeight: '800' },
  infoText: { color: '#475467', fontSize: 10, lineHeight: 16, marginTop: 5 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12 },
  label: { color: '#667085', fontSize: 8, fontWeight: '700' },
  value: { color: '#101D48', fontSize: 19, fontWeight: '800', marginTop: 4 },
  sectionTitle: { color: '#101828', fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 9 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 13, marginBottom: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardTitle: { color: '#101828', fontSize: 13, fontWeight: '800' },
  small: { color: '#667085', fontSize: 9, lineHeight: 14, marginTop: 3 },
  activeText: { color: '#2436B2', fontSize: 10, fontWeight: '800', marginTop: 6 },
  muted: { color: '#667085', fontSize: 10, fontWeight: '700', marginTop: 6 },
  goodText: { color: '#168455', fontSize: 10, fontWeight: '800', marginTop: 6 },
  badge: { color: '#344054', fontSize: 7, fontWeight: '800', backgroundColor: '#F2F4F7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  clockCard: { flex: 1, backgroundColor: '#F8F9FC', borderRadius: 10, padding: 10 },
  clock: { color: '#101D48', fontSize: 14, fontWeight: '800', marginTop: 3 },
  secondaryButton: { flex: 1, backgroundColor: '#F2F4F7', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  secondaryText: { color: '#344054', fontSize: 10, fontWeight: '800' },
  completeButton: { flex: 1, backgroundColor: '#168455', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  completeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  autoButton: { flex: 1, backgroundColor: '#EEF2FF', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  autoText: { color: '#2436B2', fontSize: 10, fontWeight: '800' },
  summaryButton: { backgroundColor: '#101D48', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  summaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18 },
  modalTitle: { color: '#101828', fontSize: 19, fontWeight: '800' },
  input: { backgroundColor: '#F2F4F7', borderRadius: 11, paddingVertical: 13, paddingHorizontal: 14, color: '#101D48', fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 14 },
});
