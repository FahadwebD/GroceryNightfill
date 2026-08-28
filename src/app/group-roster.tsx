import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  NIGHT_CAPTAIN_DAYS,
  NIGHT_CAPTAIN_ID,
} from '../utils/nightCaptainConfig';
import {
  getDateKey,
  getNightfillDate,
  getTaskOrder,
  type PlanningAllocation,
  type PlanningRosterEntry,
} from '../utils/nightfillPlanning';
import {
  NIGHTFILL_STORAGE,
  readStorage,
} from '../utils/nightfillStorage';

type Employee = {
  id: string;
  name: string;
};

type SavedRoster = Record<string, PlanningRosterEntry[]>;
type SavedAllocations = Record<string, PlanningAllocation[]>;

const days = [...NIGHT_CAPTAIN_DAYS];

function mondayForCurrentNightfillWeek() {
  const date = getNightfillDate();
  const monday = new Date(date);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  monday.setDate(date.getDate() - daysSinceMonday);
  monday.setHours(12, 0, 0, 0);
  return monday;
}

function dateForDay(day: string) {
  const monday = mondayForCurrentNightfillWeek();
  const index = days.indexOf(day as (typeof days)[number]);
  const date = new Date(monday);
  date.setDate(monday.getDate() + Math.max(index, 0));
  return date;
}

function groupTime(value?: string | null) {
  if (!value) return '—';

  const [hourText, minuteText = '0'] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  if (hour === 0 && minute === 0) return '24';
  if (minute === 0) return String(hour);
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

function taskLabel(allocations: PlanningAllocation[]) {
  if (allocations.length === 0) return '';

  const positive = allocations
    .filter((item) => item.minutes > 0)
    .sort(
      (a, b) =>
        getTaskOrder(a.taskName) -
        getTaskOrder(b.taskName)
    );

  const aisleNumbers = positive
    .filter((item) => item.taskName.startsWith('Aisle '))
    .map((item) => Number(item.taskName.replace('Aisle ', '')))
    .filter((value) => !Number.isNaN(value));

  const parts: string[] = [];

  if (positive.some((item) => item.taskName === 'Splitting')) {
    parts.push('Splitter');
  }

  if (aisleNumbers.length > 0) {
    parts.push(`A/${aisleNumbers.join('-')}`);
  }

  if (positive.some((item) => item.taskName === 'Promo')) {
    parts.push('Promo');
  }

  if (positive.some((item) => item.taskName === 'Protect - Aisle')) {
    parts.push('Protect');
  }

  if (positive.some((item) => item.taskName === 'Other / Organising')) {
    parts.push('Other');
  }

  return parts.join(' ');
}

function statusLabel(entry: PlanningRosterEntry) {
  if (entry.status === 'Working' || entry.status === 'Called In') {
    return '';
  }

  return entry.status.toUpperCase();
}

export default function GroupRosterScreen() {
  const currentDay = getNightfillDate().toLocaleDateString('en-AU', {
    weekday: 'long',
  });

  const [selectedDay, setSelectedDay] = useState(currentDay);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rosterRecord, setRosterRecord] = useState<SavedRoster>({});
  const [allocationRecord, setAllocationRecord] = useState<SavedAllocations>({});
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedDate = useMemo(
    () => dateForDay(selectedDay),
    [selectedDay]
  );
  const selectedDateKey = useMemo(
    () => getDateKey(selectedDate),
    [selectedDate]
  );

  async function loadData() {
    try {
      setLoading(true);

      const [savedEmployees, savedRoster, savedAllocations] =
        await Promise.all([
          readStorage<Employee[]>('groceryEmployees', []),
          readStorage<SavedRoster>(NIGHTFILL_STORAGE.roster, {}),
          readStorage<SavedAllocations>(NIGHTFILL_STORAGE.allocations, {}),
        ]);

      setEmployees(savedEmployees);
      setRosterRecord(savedRoster);
      setAllocationRecord(savedAllocations);
    } catch (error) {
      console.log('LOAD GROUP ROSTER ERROR:', error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const generatedText = useMemo(() => {
    const roster =
      rosterRecord[selectedDateKey] ||
      rosterRecord[selectedDay] ||
      [];

    const allocations =
      allocationRecord[selectedDateKey] ||
      allocationRecord[selectedDay] ||
      [];

    const employeeName = (employeeId: string) =>
      employees.find((employee) => employee.id === employeeId)?.name ||
      'Team member';

    const lines = roster.map((entry) => {
      const name = employeeName(entry.employeeId);
      const shift = `${groupTime(entry.startTime)}-${groupTime(entry.finishTime)}`;
      const ownAllocations = allocations.filter(
        (item) => item.employeeId === entry.employeeId
      );
      const assignment = taskLabel(ownAllocations);
      const status = statusLabel(entry);
      const captain =
        entry.employeeId === NIGHT_CAPTAIN_ID
          ? ' captain 👨‍✈️'
          : '';

      return [
        `${name} ${shift}${captain}`,
        assignment,
        status,
      ]
        .filter(Boolean)
        .join(' ');
    });

    return `${selectedDay} roster\n\n${lines.join('\n')}`;
  }, [
    allocationRecord,
    employees,
    rosterRecord,
    selectedDateKey,
    selectedDay,
  ]);

  useFocusEffect(
    useCallback(() => {
      setDraft(generatedText);
    }, [generatedText])
  );

  function regenerate() {
    setDraft(generatedText);
  }

  async function shareRoster() {
    if (!draft.trim()) {
      Alert.alert('Nothing to Share', 'No roster text is available for this day.');
      return;
    }

    try {
      await Share.share({ message: draft.trim() });
    } catch (error) {
      console.log('SHARE GROUP ROSTER ERROR:', error);
      Alert.alert('Share Failed', 'Could not open the share sheet.');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Building group roster…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Week</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>Group Roster</Text>
        <Text style={styles.subtitle}>
          Create a clean message you can edit, copy or share to the team group
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayRow}
        >
          {days.map((day) => {
            const active = day === selectedDay;
            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayButton, active && styles.dayButtonActive]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.dayText, active && styles.dayTextActive]}>
                  {day.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.dateCard}>
          <Text style={styles.dateTitle}>{selectedDay} Nightfill</Text>
          <Text style={styles.dateText}>{selectedDateKey}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Group format</Text>
          <Text style={styles.infoText}>
            Times are shortened like 17-24 and 21:30-1. Saved aisle allocations become A/7 or A/1-2-3. Night Captain is marked automatically.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Message Preview</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          style={styles.preview}
          selectionColor="#2436B2"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={regenerate}>
            <Text style={styles.secondaryText}>Reset from Roster</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryButton} onPress={shareRoster}>
            <Text style={styles.primaryText}>Share to Group</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.helpText}>
          You can edit the message here first. To copy instead of sharing, long-press the text, Select All, then Copy.
        </Text>
      </ScrollView>
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
  subtitle: {
    color: '#D5DBED',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  content: { padding: 16, paddingBottom: 50 },
  dayRow: { gap: 7, paddingBottom: 12 },
  dayButton: {
    width: 52,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonActive: { backgroundColor: '#2436B2' },
  dayText: { color: '#667085', fontWeight: '800', fontSize: 11 },
  dayTextActive: { color: '#FFFFFF' },
  dateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateTitle: { color: '#101828', fontSize: 14, fontWeight: '800' },
  dateText: { color: '#98A2B3', fontSize: 10 },
  infoCard: {
    backgroundColor: '#EEF1FF',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  infoTitle: { color: '#2436B2', fontSize: 11, fontWeight: '800' },
  infoText: { color: '#475467', fontSize: 9, lineHeight: 14, marginTop: 4 },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 9,
  },
  preview: {
    minHeight: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    color: '#101828',
    fontSize: 15,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  secondaryText: { color: '#344054', fontSize: 11, fontWeight: '800' },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2436B2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  helpText: {
    color: '#667085',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 10,
  },
});