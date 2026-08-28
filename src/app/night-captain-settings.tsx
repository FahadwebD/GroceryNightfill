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

import { appendAuditLog } from '../utils/auditLog';
import {
  DEFAULT_NIGHT_CAPTAIN_CONFIG,
  getNightCaptainConfig,
  NIGHT_CAPTAIN_DAYS,
  NIGHT_CAPTAIN_ID,
  type NightCaptainConfig,
  type NightCaptainDay,
  resetNightCaptainConfig,
  saveNightCaptainConfig,
} from '../utils/nightCaptainConfig';
import { getDateKey, getNightfillDate, normaliseTime } from '../utils/nightfillPlanning';
import {
  NIGHTFILL_STORAGE,
  readStorage,
  writeStorage,
} from '../utils/nightfillStorage';

type CaptainRosterEntry = {
  employeeId: string;
  hours: string;
  startTime: string;
  finishTime: string;
  status: 'Working' | 'Sick' | 'Late' | 'Left Early' | 'No Show' | 'Called In';
  isExtra: boolean;
};

type Employee = {
  id: string;
  name: string;
  employeeId: string;
  employmentType: string;
  contractDays: string[];
  dayHours: Record<string, string>;
  weeklyContractHours: number;
  availableDays: string[];
  notes: string;
  createdAt: string;
  aisleSkills?: Record<string, number>;
};

function shiftMinutes(startValue: string, finishValue: string) {
  const start = normaliseTime(startValue);
  const finish = normaliseTime(finishValue);

  if (!start || !finish) return 0;

  const [startHour, startMinute] = start.split(':').map(Number);
  const [finishHour, finishMinute] = finish.split(':').map(Number);

  const startTotal = startHour * 60 + startMinute;
  let finishTotal = finishHour * 60 + finishMinute;

  if (finishTotal <= startTotal) finishTotal += 24 * 60;

  const result = finishTotal - startTotal;
  return result > 12 * 60 ? 0 : result;
}

function formatDuration(minutes: number) {
  const safe = Math.max(Math.round(minutes || 0), 0);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function mondayForCurrentNightfillWeek() {
  const date = getNightfillDate();
  const monday = new Date(date);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  monday.setDate(date.getDate() - daysSinceMonday);
  monday.setHours(12, 0, 0, 0);
  return monday;
}

function dateForDay(day: NightCaptainDay) {
  const monday = mondayForCurrentNightfillWeek();
  const index = NIGHT_CAPTAIN_DAYS.indexOf(day);
  const date = new Date(monday);
  date.setDate(monday.getDate() + index);
  return date;
}

function captainEntry(config: NightCaptainConfig): CaptainRosterEntry {
  const minutes = shiftMinutes(
    config.defaultStartTime,
    config.defaultFinishTime
  );

  return {
    employeeId: NIGHT_CAPTAIN_ID,
    hours: minutes > 0 ? (minutes / 60).toFixed(2) : '0',
    startTime: config.defaultStartTime,
    finishTime: config.defaultFinishTime,
    status: 'Working',
    isExtra: false,
  };
}

async function ensureCaptainEmployee(config: NightCaptainConfig) {
  const employees = await readStorage<Employee[]>('groceryEmployees', []);
  const existing = employees.find((employee) => employee.id === NIGHT_CAPTAIN_ID);

  const captain: Employee = {
    id: NIGHT_CAPTAIN_ID,
    name: 'Night Captain',
    employeeId: 'NIGHT-CAPTAIN',
    employmentType: 'Night Captain',
    contractDays: [...config.activeDays],
    dayHours: Object.fromEntries(
      config.activeDays.map((day) => [
        day,
        (shiftMinutes(config.defaultStartTime, config.defaultFinishTime) / 60).toFixed(2),
      ])
    ),
    weeklyContractHours: 45,
    availableDays: [],
    notes:
      'System Night Captain role. Default schedule is manager-configurable. Five-day role target.',
    createdAt: existing?.createdAt || 'system',
    aisleSkills: existing?.aisleSkills || {},
  };

  const next = existing
    ? employees.map((employee) =>
        employee.id === NIGHT_CAPTAIN_ID ? { ...employee, ...captain } : employee
      )
    : [...employees, captain];

  await AsyncStorage.setItem('groceryEmployees', JSON.stringify(next));
}

async function applyConfigToCurrentWeek(config: NightCaptainConfig) {
  const roster = await readStorage<Record<string, CaptainRosterEntry[]>>(
    NIGHTFILL_STORAGE.roster,
    {}
  );

  const next = { ...roster };

  for (const day of NIGHT_CAPTAIN_DAYS) {
    const dateKey = getDateKey(dateForDay(day));
    const source = next[dateKey] || next[day] || [];
    const withoutCaptain = source.filter(
      (entry) => entry.employeeId !== NIGHT_CAPTAIN_ID
    );

    const entries =
      config.enabled && config.activeDays.includes(day)
        ? [captainEntry(config), ...withoutCaptain]
        : withoutCaptain;

    next[dateKey] = entries;
    next[day] = entries;
  }

  await writeStorage(NIGHTFILL_STORAGE.roster, next);
  await ensureCaptainEmployee(config);

  await appendAuditLog({
    category: 'Roster',
    action: 'Night Captain defaults applied to current week',
    details: `${config.activeDays.length} nights · ${config.defaultStartTime}–${config.defaultFinishTime}`,
  });
}

export default function NightCaptainSettingsScreen() {
  const [config, setConfig] = useState<NightCaptainConfig>(
    DEFAULT_NIGHT_CAPTAIN_CONFIG
  );
  const [startTime, setStartTime] = useState('18:00');
  const [finishTime, setFinishTime] = useState('03:00');
  const [saving, setSaving] = useState(false);

  async function loadConfig() {
    const value = await getNightCaptainConfig();
    setConfig(value);
    setStartTime(value.defaultStartTime);
    setFinishTime(value.defaultFinishTime);
  }

  useFocusEffect(
    useCallback(() => {
      loadConfig();
    }, [])
  );

  const selectedCount = config.activeDays.length;
  const plannedMinutes = useMemo(
    () => shiftMinutes(startTime, finishTime),
    [startTime, finishTime]
  );

  function toggleDay(day: NightCaptainDay) {
    setConfig((current) => {
      const selected = current.activeDays.includes(day);
      return {
        ...current,
        activeDays: selected
          ? current.activeDays.filter((value) => value !== day)
          : NIGHT_CAPTAIN_DAYS.filter(
              (value) => value === day || current.activeDays.includes(value)
            ),
      };
    });
  }

  function selectFiveWeekdays() {
    setConfig((current) => ({
      ...current,
      enabled: true,
      activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    }));
  }

  function selectEveryNight() {
    setConfig((current) => ({
      ...current,
      enabled: true,
      activeDays: [...NIGHT_CAPTAIN_DAYS],
    }));
  }

  async function save() {
    const start = normaliseTime(startTime);
    const finish = normaliseTime(finishTime);
    const minutes = shiftMinutes(start, finish);

    if (!start || !finish || minutes <= 0) {
      Alert.alert(
        'Check Shift Time',
        'Enter a valid Night Captain shift within the 12-hour Nightfill window.'
      );
      return;
    }

    if (config.enabled && config.activeDays.length === 0) {
      Alert.alert(
        'Choose Working Nights',
        'Select at least one Night Captain working night or turn the role off.'
      );
      return;
    }

    try {
      setSaving(true);
      const saved = await saveNightCaptainConfig({
        ...config,
        defaultStartTime: start,
        defaultFinishTime: finish,
      });

      await applyConfigToCurrentWeek(saved);
      setConfig(saved);
      setStartTime(saved.defaultStartTime);
      setFinishTime(saved.defaultFinishTime);

      Alert.alert(
        'Night Captain Updated',
        `Applied to this week. ${saved.activeDays.length} nights selected · ${formatDuration(
          minutes
        )} per selected night.`
      );
    } catch (error) {
      console.log('SAVE NIGHT CAPTAIN SETTINGS ERROR:', error);
      Alert.alert('Save Failed', 'Could not update Night Captain settings.');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    try {
      setSaving(true);
      const resetValue = await resetNightCaptainConfig();
      await applyConfigToCurrentWeek(resetValue);
      setConfig(resetValue);
      setStartTime(resetValue.defaultStartTime);
      setFinishTime(resetValue.defaultFinishTime);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Settings</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>Night Captain</Text>
        <Text style={styles.subtitle}>
          Configure default nights and shift times
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.roleCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleTitle}>Five-day role target</Text>
            <Text style={styles.roleText}>
              The Captain is available on every night by default. Select the actual five working nights when the weekly pattern is known.
            </Text>
          </View>
          <View
            style={[
              styles.countBadge,
              selectedCount === 5 ? styles.countGood : styles.countWarning,
            ]}
          >
            <Text
              style={[
                styles.countText,
                selectedCount === 5 ? styles.countGoodText : styles.countWarningText,
              ]}
            >
              {selectedCount}/5
            </Text>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitleNoMargin}>Night Captain enabled</Text>
            <Text style={styles.helper}>
              Turn off to remove the Captain from the weekly plan.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, config.enabled && styles.toggleOn]}
            onPress={() =>
              setConfig((current) => ({
                ...current,
                enabled: !current.enabled,
              }))
            }
          >
            <View style={[styles.knob, config.enabled && styles.knobOn]} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Working Nights</Text>
        <View style={styles.daysGrid}>
          {NIGHT_CAPTAIN_DAYS.map((day) => {
            const selected = config.activeDays.includes(day);
            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayButton, selected && styles.dayButtonSelected]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                  {day.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity style={styles.quickButton} onPress={selectFiveWeekdays}>
            <Text style={styles.quickText}>Mon–Fri 5 days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={selectEveryNight}>
            <Text style={styles.quickText}>Every night</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Default Shift</Text>
        <View style={styles.shiftCard}>
          <View style={styles.timeField}>
            <Text style={styles.fieldLabel}>Start</Text>
            <TextInput
              value={startTime}
              onChangeText={setStartTime}
              onEndEditing={() => setStartTime(normaliseTime(startTime))}
              placeholder="18:00"
              keyboardType="numbers-and-punctuation"
              style={styles.timeInput}
            />
          </View>

          <Text style={styles.shiftArrow}>→</Text>

          <View style={styles.timeField}>
            <Text style={styles.fieldLabel}>Finish</Text>
            <TextInput
              value={finishTime}
              onChangeText={setFinishTime}
              onEndEditing={() => setFinishTime(normaliseTime(finishTime))}
              placeholder="03:00"
              keyboardType="numbers-and-punctuation"
              style={styles.timeInput}
            />
          </View>
        </View>

        <View style={styles.durationCard}>
          <Text style={styles.durationLabel}>DEFAULT DAILY SHIFT</Text>
          <Text style={styles.durationValue}>
            {plannedMinutes > 0 ? formatDuration(plannedMinutes) : 'Check times'}
          </Text>
        </View>

        <Text style={styles.note}>
          Saving here applies these defaults to the current week. You can still edit an individual Night Captain shift from the Week roster afterwards.
        </Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabled]}
          disabled={saving}
          onPress={save}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving…' : 'Save & Apply to Current Week'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetButton, saving && styles.disabled]}
          disabled={saving}
          onPress={reset}
        >
          <Text style={styles.resetText}>Reset to Every Night · 6 PM–3 AM</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  back: { color: '#D5DBED', fontSize: 13, marginBottom: 14 },
  eyebrow: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 4 },
  content: { padding: 16, paddingBottom: 55 },
  roleCard: {
    backgroundColor: '#F0ECFF',
    borderRadius: 15,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#D8D0FF',
  },
  roleTitle: { color: '#4C3BCF', fontSize: 13, fontWeight: '800' },
  roleText: { color: '#5E5878', fontSize: 9, lineHeight: 14, marginTop: 4 },
  countBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  countGood: { backgroundColor: '#E8F8EF' },
  countWarning: { backgroundColor: '#FFF4E5' },
  countText: { fontSize: 11, fontWeight: '900' },
  countGoodText: { color: '#168455' },
  countWarningText: { color: '#B54708' },
  toggleRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitleNoMargin: { color: '#101828', fontSize: 14, fontWeight: '800' },
  helper: { color: '#667085', fontSize: 9, marginTop: 3 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#D0D5DD',
    padding: 3,
  },
  toggleOn: { backgroundColor: '#2436B2' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  knobOn: { marginLeft: 20 },
  sectionTitle: {
    color: '#101828',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 9,
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayButton: {
    width: '22.8%',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  dayButtonSelected: { backgroundColor: '#E9ECFF', borderColor: '#AEB9FF' },
  dayText: { color: '#667085', fontSize: 10, fontWeight: '800' },
  dayTextSelected: { color: '#2436B2' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  quickButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickText: { color: '#2436B2', fontSize: 9, fontWeight: '800' },
  shiftCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  timeField: { flex: 1 },
  fieldLabel: { color: '#98A2B3', fontSize: 8, marginBottom: 5 },
  timeInput: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingVertical: 12,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: '#101828',
  },
  shiftArrow: { color: '#98A2B3', fontSize: 18, paddingBottom: 11 },
  durationCard: {
    marginTop: 9,
    backgroundColor: '#101D48',
    borderRadius: 13,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  durationLabel: { color: '#AEB9DD', fontSize: 8, fontWeight: '800' },
  durationValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  note: { color: '#667085', fontSize: 9, lineHeight: 15, marginTop: 12 },
  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  resetButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  resetText: { color: '#667085', fontSize: 10, fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
