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
  getNightCaptainConfig,
  isNightCaptainActive,
  NIGHT_CAPTAIN_DAYS,
  NIGHT_CAPTAIN_ID,
  type NightCaptainConfig,
} from '../utils/nightCaptainConfig';
import { getDateKey, getNightfillDate } from '../utils/nightfillPlanning';
import {
  NIGHTFILL_STORAGE,
  readStorage,
  writeStorage,
} from '../utils/nightfillStorage';

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

type ShiftStatus =
  | 'Working'
  | 'Sick'
  | 'Late'
  | 'Left Early'
  | 'No Show'
  | 'Called In';

type RosterEntry = {
  employeeId: string;
  hours: string;
  startTime: string;
  finishTime: string;
  status: ShiftStatus;
  isExtra: boolean;
};

type SavedRoster = Record<string, RosterEntry[]>;

const weekDays = [...NIGHT_CAPTAIN_DAYS];

const statusOptions: ShiftStatus[] = [
  'Working',
  'Sick',
  'Late',
  'Left Early',
  'No Show',
];

function normaliseTime(value: string) {
  const text = value.trim();
  if (!text) return '';

  const [hourText, minuteText = '0'] = text.split(':');
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
    return '';
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function calculateShiftMinutes(startValue: string, finishValue: string) {
  const start = normaliseTime(startValue);
  const finish = normaliseTime(finishValue);
  if (!start || !finish) return 0;

  const [startHour, startMinute] = start.split(':').map(Number);
  const [finishHour, finishMinute] = finish.split(':').map(Number);

  const startTotal = startHour * 60 + startMinute;
  let finishTotal = finishHour * 60 + finishMinute;
  if (finishTotal <= startTotal) finishTotal += 24 * 60;

  const duration = finishTotal - startTotal;
  return duration > 12 * 60 ? 0 : duration;
}

function minutesToHoursValue(minutes: number) {
  return minutes > 0 ? (minutes / 60).toFixed(2) : '0';
}

function formatDuration(minutes: number) {
  const safe = Math.max(Math.round(minutes || 0), 0);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatClock(value: string) {
  const time = normaliseTime(value);
  if (!time) return '—';
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function createFinishTimeFromHours(startValue: string, hoursValue: string) {
  const start = normaliseTime(startValue);
  const hours = Number(hoursValue);
  if (!start || !hours || hours <= 0) return '';

  const [hour, minute] = start.split(':').map(Number);
  const total = hour * 60 + minute + Math.round(hours * 60);
  const finish = ((total % 1440) + 1440) % 1440;

  return `${String(Math.floor(finish / 60)).padStart(2, '0')}:${String(
    finish % 60
  ).padStart(2, '0')}`;
}

function mondayForNightfillWeek() {
  const date = getNightfillDate();
  const monday = new Date(date);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  monday.setDate(date.getDate() - daysSinceMonday);
  monday.setHours(12, 0, 0, 0);
  return monday;
}

function dateForWeekday(day: string) {
  const monday = mondayForNightfillWeek();
  const index = weekDays.indexOf(day as (typeof weekDays)[number]);
  const date = new Date(monday);
  date.setDate(monday.getDate() + Math.max(index, 0));
  return date;
}

function captainDefaultEntry(config: NightCaptainConfig): RosterEntry {
  const minutes = calculateShiftMinutes(
    config.defaultStartTime,
    config.defaultFinishTime
  );

  return {
    employeeId: NIGHT_CAPTAIN_ID,
    hours: minutesToHoursValue(minutes),
    startTime: config.defaultStartTime,
    finishTime: config.defaultFinishTime,
    status: 'Working',
    isExtra: false,
  };
}

function captainEmployee(config: NightCaptainConfig): Employee {
  const dayHours = Object.fromEntries(
    config.activeDays.map((day) => [
      day,
      minutesToHoursValue(
        calculateShiftMinutes(
          config.defaultStartTime,
          config.defaultFinishTime
        )
      ),
    ])
  );

  return {
    id: NIGHT_CAPTAIN_ID,
    name: 'Night Captain',
    employeeId: 'NIGHT-CAPTAIN',
    employmentType: 'Night Captain',
    contractDays: [...config.activeDays],
    dayHours,
    weeklyContractHours: 45,
    availableDays: [],
    notes:
      'System Night Captain role. Five-day role target. Default nights and shift are manager-configurable.',
    createdAt: 'system',
    aisleSkills: {},
  };
}

function normaliseEntry(entry: RosterEntry, fallbackHours = '0'): RosterEntry {
  const startTime = entry.startTime || '17:00';
  const finishTime =
    entry.finishTime ||
    createFinishTimeFromHours(startTime, entry.hours || fallbackHours);
  const minutes = calculateShiftMinutes(startTime, finishTime);

  return {
    ...entry,
    startTime,
    finishTime,
    hours:
      entry.status === 'Sick' || entry.status === 'No Show'
        ? '0'
        : minutes > 0
          ? minutesToHoursValue(minutes)
          : entry.hours || fallbackHours,
  };
}

export default function WeekRosterNightCaptainScreen() {
  const tonightDay = getNightfillDate().toLocaleDateString('en-AU', {
    weekday: 'long',
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDay, setSelectedDay] = useState(tonightDay);
  const [roster, setRoster] = useState<SavedRoster>({});
  const [captainConfig, setCaptainConfig] = useState<NightCaptainConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);

  const selectedDate = useMemo(() => dateForWeekday(selectedDay), [selectedDay]);
  const selectedDateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);

  async function seedCaptain(
    parsedEmployees: Employee[],
    parsedRoster: SavedRoster,
    config: NightCaptainConfig
  ) {
    const existingCaptain = parsedEmployees.find(
      (employee) => employee.id === NIGHT_CAPTAIN_ID
    );

    const captain = captainEmployee(config);

    const nextEmployees = existingCaptain
      ? parsedEmployees.map((employee) =>
          employee.id === NIGHT_CAPTAIN_ID
            ? { ...employee, ...captain, createdAt: employee.createdAt || 'system' }
            : employee
        )
      : [...parsedEmployees, captain];

    const nextRoster: SavedRoster = { ...parsedRoster };

    for (const day of weekDays) {
      const dateKey = getDateKey(dateForWeekday(day));
      const source = nextRoster[dateKey] || nextRoster[day] || [];
      const withoutCaptain = source.filter(
        (entry) => entry.employeeId !== NIGHT_CAPTAIN_ID
      );
      const savedCaptain = source.find(
        (entry) => entry.employeeId === NIGHT_CAPTAIN_ID
      );

      const entries = isNightCaptainActive(config, day)
        ? [
            savedCaptain
              ? normaliseEntry(
                  savedCaptain,
                  minutesToHoursValue(
                    calculateShiftMinutes(
                      config.defaultStartTime,
                      config.defaultFinishTime
                    )
                  )
                )
              : captainDefaultEntry(config),
            ...withoutCaptain,
          ]
        : withoutCaptain;

      nextRoster[dateKey] = entries;
      nextRoster[day] = entries;
    }

    await AsyncStorage.setItem('groceryEmployees', JSON.stringify(nextEmployees));
    await writeStorage(NIGHTFILL_STORAGE.roster, nextRoster);

    return { employees: nextEmployees, roster: nextRoster };
  }

  async function loadData() {
    try {
      setLoading(true);

      const [parsedEmployees, parsedRoster, config] = await Promise.all([
        readStorage<Employee[]>('groceryEmployees', []),
        readStorage<SavedRoster>(NIGHTFILL_STORAGE.roster, {}),
        getNightCaptainConfig(),
      ]);

      const seeded = await seedCaptain(parsedEmployees, parsedRoster, config);
      setEmployees(seeded.employees);
      setRoster(seeded.roster);
      setCaptainConfig(config);
    } catch (error) {
      console.log('LOAD ROSTER ERROR:', error);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const contractedEmployees = useMemo(
    () =>
      employees.filter(
        (employee) =>
          employee.id !== NIGHT_CAPTAIN_ID &&
          employee.employmentType === 'Part-time' &&
          employee.contractDays?.includes(selectedDay)
      ),
    [employees, selectedDay]
  );

  const availableExtras = useMemo(
    () =>
      employees.filter(
        (employee) =>
          employee.id !== NIGHT_CAPTAIN_ID &&
          !employee.contractDays?.includes(selectedDay) &&
          employee.availableDays?.includes(selectedDay)
      ),
    [employees, selectedDay]
  );

  const currentRoster = useMemo(() => {
    const savedEntries = roster[selectedDateKey] || roster[selectedDay] || [];
    const entries: RosterEntry[] = [];

    if (captainConfig && isNightCaptainActive(captainConfig, selectedDay)) {
      const captain = savedEntries.find(
        (entry) => entry.employeeId === NIGHT_CAPTAIN_ID
      );

      entries.push(
        captain
          ? normaliseEntry(captain)
          : captainDefaultEntry(captainConfig)
      );
    }

    for (const employee of contractedEmployees) {
      const saved = savedEntries.find((entry) => entry.employeeId === employee.id);

      if (saved) {
        entries.push(normaliseEntry(saved, employee.dayHours?.[selectedDay] || '0'));
        continue;
      }

      const contractHours = employee.dayHours?.[selectedDay] || '0';
      const startTime = '17:00';

      entries.push({
        employeeId: employee.id,
        hours: contractHours,
        startTime,
        finishTime: createFinishTimeFromHours(startTime, contractHours),
        status: 'Working',
        isExtra: false,
      });
    }

    for (const entry of savedEntries.filter((item) => item.isExtra)) {
      if (!entries.some((item) => item.employeeId === entry.employeeId)) {
        entries.push(normaliseEntry(entry));
      }
    }

    return entries;
  }, [roster, selectedDateKey, selectedDay, contractedEmployees, captainConfig]);

  function getEmployee(employeeId: string) {
    return employees.find((employee) => employee.id === employeeId);
  }

  async function updateCurrentRoster(updatedEntries: RosterEntry[]) {
    const next: SavedRoster = {
      ...roster,
      [selectedDateKey]: updatedEntries,
      [selectedDay]: updatedEntries,
    };

    setRoster(next);
    await writeStorage(NIGHTFILL_STORAGE.roster, next);
  }

  async function updateStatus(employeeId: string, status: ShiftStatus) {
    const updated = currentRoster.map((entry) => {
      if (entry.employeeId !== employeeId) return entry;

      if (status === 'Sick' || status === 'No Show') {
        return { ...entry, status, hours: '0' };
      }

      const minutes = calculateShiftMinutes(entry.startTime, entry.finishTime);
      return {
        ...entry,
        status,
        hours: minutes > 0 ? minutesToHoursValue(minutes) : entry.hours,
      };
    });

    await updateCurrentRoster(updated);
    setOpenStatusId(null);
  }

  async function updateStartTime(employeeId: string, value: string) {
    const updated = currentRoster.map((entry) => {
      if (entry.employeeId !== employeeId) return entry;
      const minutes = calculateShiftMinutes(value, entry.finishTime);
      return {
        ...entry,
        startTime: value,
        hours:
          entry.status === 'Sick' || entry.status === 'No Show'
            ? '0'
            : minutes > 0
              ? minutesToHoursValue(minutes)
              : entry.hours,
      };
    });
    await updateCurrentRoster(updated);
  }

  async function updateFinishTime(employeeId: string, value: string) {
    const updated = currentRoster.map((entry) => {
      if (entry.employeeId !== employeeId) return entry;
      const minutes = calculateShiftMinutes(entry.startTime, value);
      return {
        ...entry,
        finishTime: value,
        hours:
          entry.status === 'Sick' || entry.status === 'No Show'
            ? '0'
            : minutes > 0
              ? minutesToHoursValue(minutes)
              : entry.hours,
      };
    });
    await updateCurrentRoster(updated);
  }

  async function finishEditingTime(employeeId: string) {
    const updated = currentRoster.map((entry) => {
      if (entry.employeeId !== employeeId) return entry;

      const startTime = normaliseTime(entry.startTime);
      const finishTime = normaliseTime(entry.finishTime);
      const minutes = calculateShiftMinutes(startTime, finishTime);

      return {
        ...entry,
        startTime,
        finishTime,
        hours:
          entry.status === 'Sick' || entry.status === 'No Show'
            ? '0'
            : minutes > 0
              ? minutesToHoursValue(minutes)
              : '0',
      };
    });

    await updateCurrentRoster(updated);
  }

  async function resetNightCaptain() {
    if (!captainConfig) return;

    const updated = currentRoster.map((entry) =>
      entry.employeeId === NIGHT_CAPTAIN_ID
        ? captainDefaultEntry(captainConfig)
        : entry
    );

    await updateCurrentRoster(updated);
  }

  async function addExtraEmployee(employeeId: string) {
    if (currentRoster.some((entry) => entry.employeeId === employeeId)) return;

    await updateCurrentRoster([
      ...currentRoster,
      {
        employeeId,
        hours: '0',
        startTime: '',
        finishTime: '',
        status: 'Called In',
        isExtra: true,
      },
    ]);
  }

  async function removeExtraEmployee(employeeId: string) {
    await updateCurrentRoster(
      currentRoster.filter(
        (entry) => !(entry.employeeId === employeeId && entry.isExtra)
      )
    );
  }

  const workingEntries = currentRoster.filter(
    (entry) => entry.status !== 'Sick' && entry.status !== 'No Show'
  );

  const workingMinutes = workingEntries.reduce((total, entry) => {
    const minutes = calculateShiftMinutes(entry.startTime, entry.finishTime);
    return total + (minutes > 0 ? minutes : (Number(entry.hours) || 0) * 60);
  }, 0);

  const captainEntry = currentRoster.find(
    (entry) => entry.employeeId === NIGHT_CAPTAIN_ID
  );

  const captainMinutes = captainEntry
    ? captainEntry.status === 'Sick' || captainEntry.status === 'No Show'
      ? 0
      : calculateShiftMinutes(captainEntry.startTime, captainEntry.finishTime)
    : 0;

  const originalContractMinutes =
    Math.round(
      contractedEmployees.reduce(
        (total, employee) =>
          total + Number(employee.dayHours?.[selectedDay] || 0),
        0
      ) * 60
    ) + captainMinutes;

  const labourDifferenceMinutes = workingMinutes - originalContractMinutes;
  const captainActive =
    captainConfig?.enabled &&
    isNightCaptainActive(captainConfig, selectedDay);

  async function manualSave() {
    const invalid = workingEntries.find(
      (entry) =>
        !normaliseTime(entry.startTime) ||
        !normaliseTime(entry.finishTime) ||
        calculateShiftMinutes(entry.startTime, entry.finishTime) <= 0
    );

    if (invalid) {
      Alert.alert(
        'Start & Finish Required',
        `Please enter a valid start and finish time for ${
          getEmployee(invalid.employeeId)?.name || 'every working team member'
        }.`
      );
      return;
    }

    const finalRoster = currentRoster.map((entry) => {
      const startTime = normaliseTime(entry.startTime);
      const finishTime = normaliseTime(entry.finishTime);
      const minutes = calculateShiftMinutes(startTime, finishTime);

      return {
        ...entry,
        startTime,
        finishTime,
        hours:
          entry.status === 'Sick' || entry.status === 'No Show'
            ? '0'
            : minutesToHoursValue(minutes),
      };
    });

    await updateCurrentRoster(finalRoster);
    Alert.alert(
      'Roster Saved',
      `${selectedDay} ${selectedDateKey} Nightfill roster saved.`
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading roster…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>7-Day Roster</Text>
        <Text style={styles.subtitle}>Nightfill 5 PM–5 AM · dated weekly roster</Text>
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
          {weekDays.map((day) => {
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
          <View>
            <Text style={styles.dateLabel}>{selectedDay.toUpperCase()} NIGHTFILL</Text>
            <Text style={styles.dateValue}>
              {selectedDate.toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
          <Text style={styles.dateKey}>{selectedDateKey}</Text>
        </View>

        <View style={styles.captainInfo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.captainInfoTitle}>
              Night Captain · {captainActive ? 'working tonight' : 'off tonight'}
            </Text>
            <Text style={styles.captainInfoText}>
              {captainConfig
                ? `${captainConfig.activeDays.length} nights selected · default ${formatClock(
                    captainConfig.defaultStartTime
                  )} → ${formatClock(captainConfig.defaultFinishTime)} · five-day role target.`
                : 'Captain settings unavailable.'}
            </Text>
          </View>
          <View style={styles.captainActions}>
            {captainActive ? (
              <TouchableOpacity style={styles.resetButton} onPress={resetNightCaptain}>
                <Text style={styles.resetButtonText}>Reset shift</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.configureButton}
              onPress={() => router.push('/night-captain-settings')}
            >
              <Text style={styles.configureButtonText}>Configure</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Summary label="Working labour" value={formatDuration(workingMinutes)} />
          <Summary label="Team" value={String(workingEntries.length)} />
          <Summary
            label={labourDifferenceMinutes >= 0 ? 'Above baseline' : 'Below baseline'}
            value={`${labourDifferenceMinutes >= 0 ? '+' : '-'}${formatDuration(
              Math.abs(labourDifferenceMinutes)
            )}`}
          />
        </View>

        <Text style={styles.sectionTitle}>Tonight’s Team</Text>

        {currentRoster.map((entry) => {
          const employee = getEmployee(entry.employeeId);
          const isCaptain = entry.employeeId === NIGHT_CAPTAIN_ID;
          const minutes =
            entry.status === 'Sick' || entry.status === 'No Show'
              ? 0
              : calculateShiftMinutes(entry.startTime, entry.finishTime);

          return (
            <View
              key={entry.employeeId}
              style={[styles.employeeCard, isCaptain && styles.captainCard]}
            >
              <View style={styles.employeeHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.employeeName}>{employee?.name || 'Team member'}</Text>
                    {isCaptain && (
                      <View style={styles.captainBadge}>
                        <Text style={styles.captainBadgeText}>NIGHT CAPTAIN</Text>
                      </View>
                    )}
                    {entry.isExtra && (
                      <View style={styles.extraBadge}>
                        <Text style={styles.extraBadgeText}>EXTRA</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.employeeMeta}>
                    {formatDuration(minutes)} · {formatClock(entry.startTime)} → {formatClock(entry.finishTime)}
                  </Text>
                </View>

                {entry.isExtra && (
                  <TouchableOpacity onPress={() => removeExtraEmployee(entry.employeeId)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.statusWrap}>
                <TouchableOpacity
                  style={styles.statusButton}
                  onPress={() =>
                    setOpenStatusId(
                      openStatusId === entry.employeeId ? null : entry.employeeId
                    )
                  }
                >
                  <Text style={styles.statusText}>{entry.status}</Text>
                </TouchableOpacity>

                {openStatusId === entry.employeeId && (
                  <View style={styles.statusMenu}>
                    {statusOptions.map((status) => (
                      <TouchableOpacity
                        key={status}
                        style={styles.statusOption}
                        onPress={() => updateStatus(entry.employeeId, status)}
                      >
                        <Text style={styles.statusOptionText}>{status}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <Text style={styles.fieldLabel}>Start</Text>
                  <TextInput
                    value={entry.startTime}
                    onChangeText={(value) => updateStartTime(entry.employeeId, value)}
                    onEndEditing={() => finishEditingTime(entry.employeeId)}
                    placeholder="18:00"
                    style={styles.timeInput}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                <Text style={styles.arrow}>→</Text>

                <View style={styles.timeField}>
                  <Text style={styles.fieldLabel}>Finish</Text>
                  <TextInput
                    value={entry.finishTime}
                    onChangeText={(value) => updateFinishTime(entry.employeeId, value)}
                    onEndEditing={() => finishEditingTime(entry.employeeId)}
                    placeholder="03:00"
                    style={styles.timeInput}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            </View>
          );
        })}

        {availableExtras.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Available Call-ins</Text>
            <View style={styles.extraList}>
              {availableExtras.map((employee) => (
                <TouchableOpacity
                  key={employee.id}
                  style={styles.extraChoice}
                  onPress={() => addExtraEmployee(employee.id)}
                >
                  <Text style={styles.extraChoiceName}>{employee.name}</Text>
                  <Text style={styles.addText}>+ Add</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.saveButton} onPress={manualSave}>
          <Text style={styles.saveText}>Save {selectedDay} Roster</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: {
    flex: 1,
    backgroundColor: '#F4F6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { color: '#667085' },
  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  eyebrow: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 4 },
  content: { padding: 16, paddingBottom: 55 },
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLabel: { color: '#667085', fontSize: 8, fontWeight: '800' },
  dateValue: { color: '#101828', fontSize: 16, fontWeight: '800', marginTop: 3 },
  dateKey: { color: '#98A2B3', fontSize: 9 },
  captainInfo: {
    marginTop: 10,
    backgroundColor: '#F0ECFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8D0FF',
  },
  captainInfoTitle: { color: '#4C3BCF', fontSize: 12, fontWeight: '800' },
  captainInfoText: { color: '#5E5878', fontSize: 9, lineHeight: 14, marginTop: 3 },
  captainActions: { gap: 6 },
  resetButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  resetButtonText: { color: '#4C3BCF', fontSize: 9, fontWeight: '800' },
  configureButton: {
    backgroundColor: '#6D5DFB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  configureButtonText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  summaryCard: {
    backgroundColor: '#101D48',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    flexDirection: 'row',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { color: '#AEB9DD', fontSize: 7 },
  summaryValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 4 },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 9,
  },
  employeeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  captainCard: { borderColor: '#B9AEFF', backgroundColor: '#FCFBFF' },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  employeeName: { color: '#101828', fontSize: 14, fontWeight: '800' },
  employeeMeta: { color: '#667085', fontSize: 9, marginTop: 4 },
  captainBadge: {
    backgroundColor: '#6D5DFB',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  captainBadgeText: { color: '#FFFFFF', fontSize: 6, fontWeight: '900' },
  extraBadge: {
    backgroundColor: '#E8F8EF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  extraBadgeText: { color: '#168455', fontSize: 6, fontWeight: '900' },
  removeText: { color: '#D92D20', fontSize: 9, fontWeight: '800' },
  statusWrap: { marginTop: 10 },
  statusButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F8EF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: { color: '#168455', fontSize: 9, fontWeight: '800' },
  statusMenu: {
    marginTop: 6,
    backgroundColor: '#F8F9FC',
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusOption: { paddingHorizontal: 12, paddingVertical: 9 },
  statusOptionText: { color: '#344054', fontSize: 10, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 11 },
  timeField: { flex: 1 },
  fieldLabel: { color: '#98A2B3', fontSize: 8, marginBottom: 5 },
  timeInput: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    textAlign: 'center',
    color: '#101828',
    fontWeight: '800',
  },
  arrow: { color: '#98A2B3', paddingBottom: 10 },
  extraList: { gap: 7 },
  extraChoice: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  extraChoiceName: { color: '#101828', fontSize: 11, fontWeight: '700' },
  addText: { color: '#2436B2', fontSize: 10, fontWeight: '800' },
  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 22,
  },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});