import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import {
    useCallback,
    useMemo,
    useState,
} from 'react';

import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

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

  /*
   * Kept for compatibility with
   * Tonight / Allocation / Summary.
   *
   * This is automatically calculated
   * from startTime + finishTime.
   */
  hours: string;

  startTime: string;
  finishTime: string;

  status: ShiftStatus;

  isExtra: boolean;
};

type SavedRoster = Record<
  string,
  RosterEntry[]
>;

const weekDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const statusOptions:
  ShiftStatus[] = [
  'Working',
  'Sick',
  'Late',
  'Left Early',
  'No Show',
];

/*
|--------------------------------------------------------------------------
| NIGHTFILL DAY
|--------------------------------------------------------------------------
*/

function getNightfillDay() {
  const now =
    new Date();

  const nightfillDate =
    new Date(now);

  /*
   * Nightfill:
   *
   * Monday 5 PM
   * through
   * Tuesday 5 AM
   *
   * Before 5 AM belongs to
   * the previous Nightfill day.
   */

  if (
    nightfillDate.getHours() <
    5
  ) {
    nightfillDate.setDate(
      nightfillDate.getDate() -
        1
    );
  }

  return nightfillDate.toLocaleDateString(
    'en-AU',
    {
      weekday: 'long',
    }
  );
}

/*
|--------------------------------------------------------------------------
| TIME HELPERS
|--------------------------------------------------------------------------
*/

/*
 * Valid examples:
 *
 * 17
 * 17:00
 * 21:30
 * 2:30
 *
 * Returns HH:MM.
 */

function normaliseTime(
  value: string
) {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return '';
  }

  const parts =
    trimmed.split(':');

  const hour =
    Number(
      parts[0]
    );

  const minute =
    parts.length >
    1
      ? Number(
          parts[1]
        )
      : 0;

  if (
    Number.isNaN(
      hour
    ) ||
    Number.isNaN(
      minute
    )
  ) {
    return '';
  }

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return '';
  }

  return `${String(
    hour
  ).padStart(
    2,
    '0'
  )}:${String(
    minute
  ).padStart(
    2,
    '0'
  )}`;
}

/*
|--------------------------------------------------------------------------
| CALCULATE SHIFT
|--------------------------------------------------------------------------
*/

/*
 * Examples:
 *
 * 17:00 -> 22:00
 * = 5h
 *
 * 21:30 -> 02:30
 * = 5h
 *
 * Finish earlier than start
 * means the finish is next day.
 */

function calculateShiftMinutes(
  startTime: string,
  finishTime: string
) {
  const start =
    normaliseTime(
      startTime
    );

  const finish =
    normaliseTime(
      finishTime
    );

  if (
    !start ||
    !finish
  ) {
    return 0;
  }

  const [
    startHour,
    startMinute,
  ] =
    start
      .split(':')
      .map(Number);

  const [
    finishHour,
    finishMinute,
  ] =
    finish
      .split(':')
      .map(Number);

  const startTotal =
    startHour *
      60 +
    startMinute;

  let finishTotal =
    finishHour *
      60 +
    finishMinute;

  /*
   * Cross midnight.
   */

  if (
    finishTotal <=
    startTotal
  ) {
    finishTotal +=
      24 * 60;
  }

  const duration =
    finishTotal -
    startTotal;

  /*
   * Nightfill only runs 12 hours:
   * 5 PM -> 5 AM.
   *
   * Reject anything above 12h.
   */

  if (
    duration >
    12 * 60
  ) {
    return 0;
  }

  return duration;
}

function minutesToHoursValue(
  minutes: number
) {
  if (
    minutes <= 0
  ) {
    return '0';
  }

  return (
    minutes /
    60
  ).toFixed(2);
}

function formatDuration(
  minutes: number
) {
  if (
    minutes <= 0
  ) {
    return '—';
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const mins =
    minutes %
    60;

  if (
    hours === 0
  ) {
    return `${mins}m`;
  }

  if (
    mins === 0
  ) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

/*
|--------------------------------------------------------------------------
| DEFAULT FINISH FROM EXISTING HOURS
|--------------------------------------------------------------------------
*/

/*
 * Your old saved roster has only
 * total hours.
 *
 * For migration:
 *
 * default start = 17:00
 *
 * Then finish is generated from
 * existing contracted hours.
 *
 * You can edit the actual times.
 */

function createFinishTimeFromHours(
  startTime: string,
  hoursValue: string
) {
  const start =
    normaliseTime(
      startTime
    );

  if (!start) {
    return '';
  }

  const hours =
    Number(
      hoursValue
    );

  if (
    !hours ||
    hours <= 0
  ) {
    return '';
  }

  const [
    startHour,
    startMinute,
  ] =
    start
      .split(':')
      .map(Number);

  const startTotal =
    startHour *
      60 +
    startMinute;

  const finishTotal =
    startTotal +
    Math.round(
      hours * 60
    );

  const finishHour =
    Math.floor(
      (
        finishTotal %
        (24 * 60)
      ) /
        60
    );

  const finishMinute =
    finishTotal %
    60;

  return `${String(
    finishHour
  ).padStart(
    2,
    '0'
  )}:${String(
    finishMinute
  ).padStart(
    2,
    '0'
  )}`;
}

/*
|--------------------------------------------------------------------------
| SCREEN
|--------------------------------------------------------------------------
*/

export default function WeekScreen() {
  const tonightDay =
    getNightfillDay();

  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  const [
    selectedDay,
    setSelectedDay,
  ] =
    useState(
      tonightDay
    );

  const [
    roster,
    setRoster,
  ] =
    useState<SavedRoster>(
      {}
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    openStatusId,
    setOpenStatusId,
  ] =
    useState<string | null>(
      null
    );

  /*
|--------------------------------------------------------------------------
| LOAD
|--------------------------------------------------------------------------
*/

  async function loadData() {
    try {
      setLoading(
        true
      );

      const storedEmployees =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      const parsedEmployees:
        Employee[] =
        storedEmployees
          ? JSON.parse(
              storedEmployees
            )
          : [];

      setEmployees(
        parsedEmployees
      );

      const storedRoster =
        await AsyncStorage.getItem(
          'groceryNightRoster'
        );

      const parsedRoster:
        SavedRoster =
        storedRoster
          ? JSON.parse(
              storedRoster
            )
          : {};

      setRoster(
        parsedRoster
      );
    } catch (error) {
      console.log(
        'LOAD ROSTER ERROR:',
        error
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  /*
|--------------------------------------------------------------------------
| CONTRACTED TEAM
|--------------------------------------------------------------------------
*/

  const contractedEmployees =
    useMemo(() => {
      return employees.filter(
        (employee) =>
          employee.employmentType ===
            'Part-time' &&
          employee.contractDays?.includes(
            selectedDay
          )
      );
    }, [
      employees,
      selectedDay,
    ]);

  /*
|--------------------------------------------------------------------------
| AVAILABLE EXTRAS
|--------------------------------------------------------------------------
*/

  const availableExtras =
    useMemo(() => {
      return employees.filter(
        (employee) =>
          !employee.contractDays?.includes(
            selectedDay
          ) &&
          employee.availableDays?.includes(
            selectedDay
          )
      );
    }, [
      employees,
      selectedDay,
    ]);

  /*
|--------------------------------------------------------------------------
| CURRENT ROSTER
|--------------------------------------------------------------------------
*/

  const currentRoster =
    useMemo(() => {
      const savedEntries =
        roster[
          selectedDay
        ] || [];

      const entries:
        RosterEntry[] =
        [];

      /*
       * CONTRACTED TEAM
       */

      contractedEmployees.forEach(
        (employee) => {
          const savedEntry =
            savedEntries.find(
              (entry) =>
                entry.employeeId ===
                employee.id
            );

          if (savedEntry) {
            /*
             * MIGRATE OLD DATA
             */

            const startTime =
              savedEntry.startTime ||
              '17:00';

            const finishTime =
              savedEntry.finishTime ||
              createFinishTimeFromHours(
                startTime,

                savedEntry.hours ||
                  employee
                    .dayHours?.[
                    selectedDay
                  ] ||
                  '0'
              );

            const calculatedMinutes =
              calculateShiftMinutes(
                startTime,
                finishTime
              );

            entries.push({
              ...savedEntry,

              startTime,

              finishTime,

              hours:
                savedEntry.status ===
                    'Sick' ||
                savedEntry.status ===
                    'No Show'
                  ? '0'
                  : calculatedMinutes >
                      0
                    ? minutesToHoursValue(
                        calculatedMinutes
                      )
                    : savedEntry.hours,
            });
          } else {
            /*
             * NEW CONTRACTED ENTRY
             */

            const contractHours =
              employee.dayHours?.[
                selectedDay
              ] ||
              '0';

            const startTime =
              '17:00';

            const finishTime =
              createFinishTimeFromHours(
                startTime,
                contractHours
              );

            entries.push({
              employeeId:
                employee.id,

              hours:
                contractHours,

              startTime,

              finishTime,

              status:
                'Working',

              isExtra:
                false,
            });
          }
        }
      );

      /*
       * KEEP EXTRA STAFF
       */

      savedEntries
        .filter(
          (entry) =>
            entry.isExtra
        )
        .forEach(
          (entry) => {
            const alreadyIncluded =
              entries.some(
                (item) =>
                  item.employeeId ===
                  entry.employeeId
              );

            if (
              !alreadyIncluded
            ) {
              const startTime =
                entry.startTime ||
                '';

              const finishTime =
                entry.finishTime ||
                '';

              const calculatedMinutes =
                calculateShiftMinutes(
                  startTime,
                  finishTime
                );

              entries.push({
                ...entry,

                startTime,

                finishTime,

                hours:
                  entry.status ===
                      'Sick' ||
                  entry.status ===
                      'No Show'
                    ? '0'
                    : calculatedMinutes >
                        0
                      ? minutesToHoursValue(
                          calculatedMinutes
                        )
                      : entry.hours ||
                        '0',
              });
            }
          }
        );

      return entries;
    }, [
      contractedEmployees,
      roster,
      selectedDay,
    ]);

  function getEmployee(
    employeeId: string
  ) {
    return employees.find(
      (employee) =>
        employee.id ===
        employeeId
    );
  }

  /*
|--------------------------------------------------------------------------
| AUTO SAVE
|--------------------------------------------------------------------------
*/

  async function saveRosterState(
    updatedRoster:
      SavedRoster
  ) {
    try {
      setRoster(
        updatedRoster
      );

      await AsyncStorage.setItem(
        'groceryNightRoster',
        JSON.stringify(
          updatedRoster
        )
      );
    } catch (error) {
      console.log(
        'AUTO SAVE ROSTER ERROR:',
        error
      );
    }
  }

  async function updateCurrentRoster(
    updatedEntries:
      RosterEntry[]
  ) {
    const updatedRoster = {
      ...roster,

      [selectedDay]:
        updatedEntries,
    };

    await saveRosterState(
      updatedRoster
    );
  }

  /*
|--------------------------------------------------------------------------
| UPDATE STATUS
|--------------------------------------------------------------------------
*/

  async function updateStatus(
    employeeId: string,
    status: ShiftStatus
  ) {
    const updated =
      currentRoster.map(
        (entry) => {
          if (
            entry.employeeId !==
            employeeId
          ) {
            return entry;
          }

          /*
           * Sick / No Show
           *
           * Keep times so they can
           * be restored later,
           * but working hours = 0.
           */

          if (
            status ===
              'Sick' ||
            status ===
              'No Show'
          ) {
            return {
              ...entry,

              status,

              hours:
                '0',
            };
          }

          const shiftMinutes =
            calculateShiftMinutes(
              entry.startTime,
              entry.finishTime
            );

          let hours =
            shiftMinutes >
            0
              ? minutesToHoursValue(
                  shiftMinutes
                )
              : entry.hours;

          /*
           * Restore contracted
           * hours if required.
           */

          if (
            Number(
              hours
            ) <= 0 &&
            !entry.isExtra
          ) {
            const employee =
              getEmployee(
                employeeId
              );

            hours =
              employee
                ?.dayHours?.[
                selectedDay
              ] ||
              '0';
          }

          return {
            ...entry,

            status,

            hours,
          };
        }
      );

    await updateCurrentRoster(
      updated
    );

    setOpenStatusId(
      null
    );
  }

  /*
|--------------------------------------------------------------------------
| START TIME
|--------------------------------------------------------------------------
*/

  async function updateStartTime(
    employeeId: string,
    value: string
  ) {
    const updated =
      currentRoster.map(
        (entry) => {
          if (
            entry.employeeId !==
            employeeId
          ) {
            return entry;
          }

          const minutes =
            calculateShiftMinutes(
              value,
              entry.finishTime
            );

          return {
            ...entry,

            startTime:
              value,

            hours:
              entry.status ===
                  'Sick' ||
              entry.status ===
                  'No Show'
                ? '0'
                : minutes >
                    0
                  ? minutesToHoursValue(
                      minutes
                    )
                  : entry.hours,
          };
        }
      );

    await updateCurrentRoster(
      updated
    );
  }

  /*
|--------------------------------------------------------------------------
| FINISH TIME
|--------------------------------------------------------------------------
*/

  async function updateFinishTime(
    employeeId: string,
    value: string
  ) {
    const updated =
      currentRoster.map(
        (entry) => {
          if (
            entry.employeeId !==
            employeeId
          ) {
            return entry;
          }

          const minutes =
            calculateShiftMinutes(
              entry.startTime,
              value
            );

          return {
            ...entry,

            finishTime:
              value,

            hours:
              entry.status ===
                  'Sick' ||
              entry.status ===
                  'No Show'
                ? '0'
                : minutes >
                    0
                  ? minutesToHoursValue(
                      minutes
                    )
                  : entry.hours,
          };
        }
      );

    await updateCurrentRoster(
      updated
    );
  }

  /*
|--------------------------------------------------------------------------
| FINISH EDITING TIME
|--------------------------------------------------------------------------
*/

  async function finishEditingTime(
    employeeId: string
  ) {
    const updated =
      currentRoster.map(
        (entry) => {
          if (
            entry.employeeId !==
            employeeId
          ) {
            return entry;
          }

          const startTime =
            normaliseTime(
              entry.startTime
            );

          const finishTime =
            normaliseTime(
              entry.finishTime
            );

          const minutes =
            calculateShiftMinutes(
              startTime,
              finishTime
            );

          return {
            ...entry,

            startTime,

            finishTime,

            hours:
              entry.status ===
                  'Sick' ||
              entry.status ===
                  'No Show'
                ? '0'
                : minutes >
                    0
                  ? minutesToHoursValue(
                      minutes
                    )
                  : '0',
          };
        }
      );

    await updateCurrentRoster(
      updated
    );
  }

  /*
|--------------------------------------------------------------------------
| ADD EXTRA / CALL IN
|--------------------------------------------------------------------------
*/

  async function addExtraEmployee(
    employeeId: string
  ) {
    const alreadyAdded =
      currentRoster.some(
        (entry) =>
          entry.employeeId ===
          employeeId
      );

    if (
      alreadyAdded
    ) {
      return;
    }

    const newEntry:
      RosterEntry = {
      employeeId,

      hours:
        '0',

      startTime:
        '',

      finishTime:
        '',

      status:
        'Called In',

      isExtra:
        true,
    };

    await updateCurrentRoster([
      ...currentRoster,
      newEntry,
    ]);
  }

  /*
|--------------------------------------------------------------------------
| REMOVE EXTRA
|--------------------------------------------------------------------------
*/

  async function removeExtraEmployee(
    employeeId: string
  ) {
    const updated =
      currentRoster.filter(
        (entry) =>
          !(
            entry.employeeId ===
              employeeId &&
            entry.isExtra
          )
      );

    await updateCurrentRoster(
      updated
    );
  }

  /*
|--------------------------------------------------------------------------
| WORKING TEAM
|--------------------------------------------------------------------------
*/

  const workingEntries =
    currentRoster.filter(
      (entry) =>
        entry.status !==
          'Sick' &&
        entry.status !==
          'No Show'
    );

  const sickCount =
    currentRoster.filter(
      (entry) =>
        entry.status ===
        'Sick'
    ).length;

  const noShowCount =
    currentRoster.filter(
      (entry) =>
        entry.status ===
        'No Show'
    ).length;

  const lateCount =
    currentRoster.filter(
      (entry) =>
        entry.status ===
        'Late'
    ).length;

  /*
|--------------------------------------------------------------------------
| TOTAL WORKING MINUTES
|--------------------------------------------------------------------------
*/

  const workingMinutes =
    workingEntries.reduce(
      (
        total,
        entry
      ) => {
        const minutes =
          calculateShiftMinutes(
            entry.startTime,
            entry.finishTime
          );

        if (
          minutes >
          0
        ) {
          return (
            total +
            minutes
          );
        }

        /*
         * Fallback for old data.
         */

        return (
          total +
          (
            Number(
              entry.hours
            ) || 0
          ) *
            60
        );
      },
      0
    );

  const workingHours =
    workingMinutes /
    60;

  /*
|--------------------------------------------------------------------------
| CONTRACT HOURS
|--------------------------------------------------------------------------
*/

  const originalContractHours =
    contractedEmployees.reduce(
      (
        total,
        employee
      ) =>
        total +
        Number(
          employee.dayHours?.[
            selectedDay
          ] ||
            0
        ),
      0
    );

  const originalContractMinutes =
    Math.round(
      originalContractHours *
        60
    );

  const labourDifferenceMinutes =
    workingMinutes -
    originalContractMinutes;

  /*
|--------------------------------------------------------------------------
| MANUAL SAVE
|--------------------------------------------------------------------------
*/

  async function manualSave() {
    try {
      const invalidEntry =
        workingEntries.find(
          (entry) => {
            const start =
              normaliseTime(
                entry.startTime
              );

            const finish =
              normaliseTime(
                entry.finishTime
              );

            const minutes =
              calculateShiftMinutes(
                start,
                finish
              );

            return (
              !start ||
              !finish ||
              minutes <= 0
            );
          }
        );

      if (
        invalidEntry
      ) {
        const employee =
          getEmployee(
            invalidEntry.employeeId
          );

        Alert.alert(
          'Start & Finish Required',
          `Please enter a valid start and finish time for ${
            employee?.name ||
            'every employee who is working'
          }.`
        );

        return;
      }

      const finalRoster =
        currentRoster.map(
          (entry) => {
            const startTime =
              normaliseTime(
                entry.startTime
              );

            const finishTime =
              normaliseTime(
                entry.finishTime
              );

            const minutes =
              calculateShiftMinutes(
                startTime,
                finishTime
              );

            return {
              ...entry,

              startTime,

              finishTime,

              hours:
                entry.status ===
                    'Sick' ||
                entry.status ===
                    'No Show'
                  ? '0'
                  : minutesToHoursValue(
                      minutes
                    ),
            };
          }
        );

      const updatedRoster = {
        ...roster,

        [selectedDay]:
          finalRoster,
      };

      await saveRosterState(
        updatedRoster
      );

      Alert.alert(
        'Roster Saved',
        `${selectedDay}'s Grocery Nightfill roster is saved with start and finish times.`
      );
    } catch (error) {
      console.log(
        'SAVE ROSTER ERROR:',
        error
      );

      Alert.alert(
        'Error',
        'Could not save the roster.'
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| STATUS COLOURS
|--------------------------------------------------------------------------
*/

  function getStatusColors(
    status: ShiftStatus
  ) {
    switch (status) {
      case 'Sick':
      case 'No Show':
        return {
          background:
            '#FDECEC',

          text:
            '#D92D20',
        };

      case 'Late':
      case 'Left Early':
        return {
          background:
            '#FFF4E5',

          text:
            '#B54708',
        };

      case 'Called In':
        return {
          background:
            '#E8F8EF',

          text:
            '#168455',
        };

      default:
        return {
          background:
            '#E8F8EF',

          text:
            '#168455',
        };
    }
  }

  /*
|--------------------------------------------------------------------------
| UI
|--------------------------------------------------------------------------
*/

  return (
    <View
      style={
        styles.container
      }
    >
      {/* HEADER */}

      <View
        style={
          styles.header
        }
      >
        <Text
          style={
            styles.smallTitle
          }
        >
          GROCERY NIGHTFILL
        </Text>

        <Text
          style={
            styles.title
          }
        >
          7-Day Roster
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Nightfill runs 5 PM–5 AM
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* DAYS */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.dayRow
          }
        >
          {weekDays.map(
            (day) => {
              const selected =
                selectedDay ===
                day;

              const isTonight =
                day ===
                tonightDay;

              return (
                <TouchableOpacity
                  key={
                    day
                  }
                  style={[
                    styles.dayButton,

                    selected &&
                      styles.dayButtonSelected,
                  ]}
                  onPress={() => {
                    setSelectedDay(
                      day
                    );

                    setOpenStatusId(
                      null
                    );
                  }}
                >
                  <Text
                    style={[
                      styles.dayButtonText,

                      selected &&
                        styles.dayButtonTextSelected,
                    ]}
                  >
                    {day
                      .slice(
                        0,
                        3
                      )
                      .toUpperCase()}
                  </Text>

                  {isTonight && (
                    <Text
                      style={[
                        styles.tonightDot,

                        selected &&
                          styles.tonightDotSelected,
                      ]}
                    >
                      •
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }
          )}
        </ScrollView>

        {/* SUMMARY */}

        <View
          style={
            styles.summaryCard
          }
        >
          <View>
            <Text
              style={
                styles.summaryTitle
              }
            >
              {selectedDay}
            </Text>

            <Text
              style={
                styles.summarySubtitle
              }
            >
              {selectedDay ===
              tonightDay
                ? 'Tonight · 5 PM–5 AM'
                : 'Nightfill · 5 PM–5 AM'}
            </Text>
          </View>

          <View
            style={
              styles.summaryRight
            }
          >
            <Text
              style={
                styles.summaryHours
              }
            >
              {formatDuration(
                workingMinutes
              )}
            </Text>

            <Text
              style={
                styles.summaryHoursLabel
              }
            >
              rostered labour
            </Text>
          </View>
        </View>

        {/* ATTENDANCE STATS */}

        <View
          style={
            styles.statsRow
          }
        >
          <View
            style={
              styles.statCard
            }
          >
            <Text
              style={
                styles.statLabel
              }
            >
              Working
            </Text>

            <Text
              style={
                styles.statValue
              }
            >
              {
                workingEntries.length
              }
            </Text>
          </View>

          <View
            style={
              styles.statCard
            }
          >
            <Text
              style={
                styles.statLabel
              }
            >
              Sick
            </Text>

            <Text
              style={[
                styles.statValue,

                sickCount >
                  0 &&
                  styles.redText,
              ]}
            >
              {sickCount}
            </Text>
          </View>

          <View
            style={
              styles.statCard
            }
          >
            <Text
              style={
                styles.statLabel
              }
            >
              Late
            </Text>

            <Text
              style={[
                styles.statValue,

                lateCount >
                  0 &&
                  styles.orangeText,
              ]}
            >
              {lateCount}
            </Text>
          </View>

          <View
            style={
              styles.statCard
            }
          >
            <Text
              style={
                styles.statLabel
              }
            >
              No Show
            </Text>

            <Text
              style={[
                styles.statValue,

                noShowCount >
                  0 &&
                  styles.redText,
              ]}
            >
              {
                noShowCount
              }
            </Text>
          </View>
        </View>

        {/* LABOUR */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Labour Summary
        </Text>

        <View
          style={
            styles.labourSummaryRow
          }
        >
          <View
            style={
              styles.labourCard
            }
          >
            <Text
              style={
                styles.labourLabel
              }
            >
              Contract
            </Text>

            <Text
              style={
                styles.labourValue
              }
            >
              {formatDuration(
                originalContractMinutes
              )}
            </Text>
          </View>

          <View
            style={
              styles.labourCard
            }
          >
            <Text
              style={
                styles.labourLabel
              }
            >
              Actual
            </Text>

            <Text
              style={
                styles.labourValue
              }
            >
              {formatDuration(
                workingMinutes
              )}
            </Text>
          </View>

          <View
            style={
              styles.labourCard
            }
          >
            <Text
              style={
                styles.labourLabel
              }
            >
              Change
            </Text>

            <Text
              style={[
                styles.labourValue,

                labourDifferenceMinutes <
                  0
                  ? styles.redText
                  : styles.greenText,
              ]}
            >
              {labourDifferenceMinutes >
              0
                ? '+'
                : labourDifferenceMinutes <
                    0
                  ? '-'
                  : ''}
              {formatDuration(
                Math.abs(
                  labourDifferenceMinutes
                )
              )}
            </Text>
          </View>
        </View>

        {/* ROSTER */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Rostered Team
        </Text>

        {loading ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyText
              }
            >
              Loading roster...
            </Text>
          </View>
        ) : currentRoster.length ===
          0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyText
              }
            >
              No employees rostered for{' '}
              {selectedDay}.
            </Text>
          </View>
        ) : (
          currentRoster.map(
            (entry) => {
              const employee =
                getEmployee(
                  entry.employeeId
                );

              if (
                !employee
              ) {
                return null;
              }

              const colors =
                getStatusColors(
                  entry.status
                );

              const shiftMinutes =
                calculateShiftMinutes(
                  entry.startTime,
                  entry.finishTime
                );

              const inactive =
                entry.status ===
                  'Sick' ||
                entry.status ===
                  'No Show';

              return (
                <View
                  key={
                    entry.employeeId
                  }
                  style={[
                    styles.rosterCard,

                    inactive &&
                      styles.inactiveCard,
                  ]}
                >
                  {/* EMPLOYEE HEADER */}

                  <View
                    style={
                      styles.employeeHeader
                    }
                  >
                    <View
                      style={
                        styles.employeeInfo
                      }
                    >
                      <Text
                        style={
                          styles.employeeName
                        }
                      >
                        {
                          employee.name
                        }
                      </Text>

                      <Text
                        style={
                          entry.isExtra
                            ? styles.extraSubtext
                            : styles.employeeSubtext
                        }
                      >
                        {entry.isExtra
                          ? 'Extra / Called In'
                          : 'Contracted'}
                      </Text>
                    </View>

                    {!inactive &&
                      shiftMinutes >
                        0 && (
                        <View
                          style={
                            styles.shiftDurationBadge
                          }
                        >
                          <Text
                            style={
                              styles.shiftDurationLabel
                            }
                          >
                            SHIFT
                          </Text>

                          <Text
                            style={
                              styles.shiftDurationValue
                            }
                          >
                            {formatDuration(
                              shiftMinutes
                            )}
                          </Text>
                        </View>
                      )}

                    {entry.isExtra && (
                      <TouchableOpacity
                        style={
                          styles.removeButton
                        }
                        onPress={() =>
                          removeExtraEmployee(
                            entry.employeeId
                          )
                        }
                      >
                        <Text
                          style={
                            styles.removeText
                          }
                        >
                          ×
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* STATUS */}

                  <View
                    style={
                      styles.statusRow
                    }
                  >
                    <View
                      style={
                        styles.statusArea
                      }
                    >
                      <Text
                        style={
                          styles.inputLabel
                        }
                      >
                        Status
                      </Text>

                      <TouchableOpacity
                        style={[
                          styles.statusButton,

                          {
                            backgroundColor:
                              colors.background,
                          },
                        ]}
                        onPress={() =>
                          setOpenStatusId(
                            openStatusId ===
                              entry.employeeId
                              ? null
                              : entry.employeeId
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.statusText,

                            {
                              color:
                                colors.text,
                            },
                          ]}
                        >
                          {
                            entry.status
                          }{' '}
                          ▼
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* START + FINISH */}

                  <View
                    style={
                      styles.timeRow
                    }
                  >
                    <View
                      style={
                        styles.timeArea
                      }
                    >
                      <Text
                        style={
                          styles.inputLabel
                        }
                      >
                        Start
                      </Text>

                      <View
                        style={
                          styles.timeInputBox
                        }
                      >
                        <TextInput
                          style={
                            styles.timeInput
                          }
                          value={
                            entry.startTime
                          }
                          onChangeText={(
                            value
                          ) =>
                            updateStartTime(
                              entry.employeeId,
                              value
                            )
                          }
                          onEndEditing={() =>
                            finishEditingTime(
                              entry.employeeId
                            )
                          }
                          placeholder="17:00"
                          keyboardType="numbers-and-punctuation"
                          editable={
                            !inactive
                          }
                          maxLength={
                            5
                          }
                        />

                        <Text
                          style={
                            styles.clockText
                          }
                        >
                          🕒
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.timeArrowArea
                      }
                    >
                      <Text
                        style={
                          styles.timeArrow
                        }
                      >
                        →
                      </Text>
                    </View>

                    <View
                      style={
                        styles.timeArea
                      }
                    >
                      <Text
                        style={
                          styles.inputLabel
                        }
                      >
                        Finish
                      </Text>

                      <View
                        style={
                          styles.timeInputBox
                        }
                      >
                        <TextInput
                          style={
                            styles.timeInput
                          }
                          value={
                            entry.finishTime
                          }
                          onChangeText={(
                            value
                          ) =>
                            updateFinishTime(
                              entry.employeeId,
                              value
                            )
                          }
                          onEndEditing={() =>
                            finishEditingTime(
                              entry.employeeId
                            )
                          }
                          placeholder="01:00"
                          keyboardType="numbers-and-punctuation"
                          editable={
                            !inactive
                          }
                          maxLength={
                            5
                          }
                        />

                        <Text
                          style={
                            styles.clockText
                          }
                        >
                          🕒
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* SHIFT PREVIEW */}

                  {!inactive && (
                    <View
                      style={
                        shiftMinutes >
                        0
                          ? styles.validShiftBox
                          : styles.invalidShiftBox
                      }
                    >
                      <Text
                        style={
                          shiftMinutes >
                          0
                            ? styles.validShiftText
                            : styles.invalidShiftText
                        }
                      >
                        {shiftMinutes >
                        0
                          ? `${entry.startTime} → ${entry.finishTime} · ${formatDuration(
                              shiftMinutes
                            )}`
                          : 'Enter a valid start and finish time'}
                      </Text>

                      {entry.finishTime &&
                        entry.startTime &&
                        normaliseTime(
                          entry.finishTime
                        ) &&
                        normaliseTime(
                          entry.startTime
                        ) &&
                        Number(
                          normaliseTime(
                            entry.finishTime
                          ).replace(
                            ':',
                            ''
                          )
                        ) <=
                          Number(
                            normaliseTime(
                              entry.startTime
                            ).replace(
                              ':',
                              ''
                            )
                          ) &&
                        shiftMinutes >
                          0 && (
                          <Text
                            style={
                              styles.nextDayText
                            }
                          >
                            finishes next day
                          </Text>
                        )}
                    </View>
                  )}

                  {/* STATUS MENU */}

                  {openStatusId ===
                    entry.employeeId && (
                    <View
                      style={
                        styles.statusMenu
                      }
                    >
                      {statusOptions.map(
                        (
                          status
                        ) => (
                          <TouchableOpacity
                            key={
                              status
                            }
                            style={
                              styles.statusOption
                            }
                            onPress={() =>
                              updateStatus(
                                entry.employeeId,
                                status
                              )
                            }
                          >
                            <Text
                              style={
                                styles.statusOptionText
                              }
                            >
                              {status}
                            </Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  )}
                </View>
              );
            }
          )
        )}

        {/* AVAILABLE REPLACEMENTS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Available Replacements
        </Text>

        {availableExtras.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyText
              }
            >
              Nobody else is marked available for{' '}
              {selectedDay}.
            </Text>
          </View>
        ) : (
          availableExtras.map(
            (employee) => {
              const alreadyRostered =
                currentRoster.some(
                  (entry) =>
                    entry.employeeId ===
                    employee.id
                );

              return (
                <View
                  key={
                    employee.id
                  }
                  style={
                    styles.availableCard
                  }
                >
                  <View>
                    <Text
                      style={
                        styles.employeeName
                      }
                    >
                      {
                        employee.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.employeeSubtext
                      }
                    >
                      {
                        employee.employmentType
                      }{' '}
                      · Available
                    </Text>
                  </View>

                  {alreadyRostered ? (
                    <View
                      style={
                        styles.addedBadge
                      }
                    >
                      <Text
                        style={
                          styles.addedText
                        }
                      >
                        ADDED
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={
                        styles.callInButton
                      }
                      onPress={() =>
                        addExtraEmployee(
                          employee.id
                        )
                      }
                    >
                      <Text
                        style={
                          styles.callInText
                        }
                      >
                        + Call In
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }
          )
        )}

        {/* SAVE */}

        <TouchableOpacity
          style={
            styles.saveButton
          }
          onPress={
            manualSave
          }
        >
          <Text
            style={
              styles.saveText
            }
          >
            Save {selectedDay} Roster
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| STYLES
|--------------------------------------------------------------------------
*/

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F4F6FA',
    },

    header: {
      backgroundColor:
        '#101D48',
      paddingTop: 65,
      paddingHorizontal: 22,
      paddingBottom: 25,
    },

    smallTitle: {
      color:
        '#AEB9DD',
      fontSize: 12,
      fontWeight:
        '700',
      letterSpacing: 2,
    },

    title: {
      color:
        '#FFFFFF',
      fontSize: 32,
      fontWeight:
        '800',
      marginTop: 6,
    },

    subtitle: {
      color:
        '#D5DBED',
      fontSize: 13,
      marginTop: 5,
    },

    content: {
      padding: 16,
      paddingBottom: 45,
    },

    dayRow: {
      gap: 7,
      paddingBottom: 13,
    },

    dayButton: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 11,
      paddingHorizontal: 13,
      paddingVertical: 8,
      minWidth: 52,
      alignItems:
        'center',
      borderWidth: 1,
      borderColor:
        '#E4E7EC',
    },

    dayButtonSelected: {
      backgroundColor:
        '#2436B2',
      borderColor:
        '#2436B2',
    },

    dayButtonText: {
      color:
        '#667085',
      fontSize: 10,
      fontWeight:
        '800',
    },

    dayButtonTextSelected: {
      color:
        '#FFFFFF',
    },

    tonightDot: {
      color:
        '#2436B2',
      fontSize: 14,
      lineHeight: 10,
      marginTop: 3,
    },

    tonightDotSelected: {
      color:
        '#FFFFFF',
    },

    summaryCard: {
      backgroundColor:
        '#101D48',
      borderRadius: 16,
      padding: 17,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    summaryTitle: {
      color:
        '#FFFFFF',
      fontSize: 22,
      fontWeight:
        '800',
    },

    summarySubtitle: {
      color:
        '#AEB9DD',
      fontSize: 10,
      marginTop: 4,
    },

    summaryRight: {
      alignItems:
        'flex-end',
    },

    summaryHours: {
      color:
        '#FFFFFF',
      fontSize: 23,
      fontWeight:
        '800',
    },

    summaryHoursLabel: {
      color:
        '#AEB9DD',
      fontSize: 7,
      marginTop: 2,
    },

    statsRow: {
      flexDirection:
        'row',
      gap: 7,
      marginTop: 8,
    },

    statCard: {
      flex: 1,
      backgroundColor:
        '#FFFFFF',
      borderRadius: 11,
      padding: 10,
    },

    statLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
    },

    statValue: {
      color:
        '#101D48',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 4,
    },

    sectionTitle: {
      color:
        '#101828',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 21,
      marginBottom: 9,
    },

    labourSummaryRow: {
      flexDirection:
        'row',
      gap: 8,
    },

    labourCard: {
      flex: 1,
      backgroundColor:
        '#FFFFFF',
      borderRadius: 12,
      padding: 12,
    },

    labourLabel: {
      color:
        '#667085',
      fontSize: 9,
    },

    labourValue: {
      color:
        '#101D48',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 5,
    },

    rosterCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 15,
      padding: 14,
      marginBottom: 9,
    },

    inactiveCard: {
      opacity: 0.65,
    },

    employeeHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    employeeInfo: {
      flex: 1,
    },

    employeeName: {
      color:
        '#101828',
      fontSize: 14,
      fontWeight:
        '800',
    },

    employeeSubtext: {
      color:
        '#667085',
      fontSize: 10,
      marginTop: 3,
    },

    extraSubtext: {
      color:
        '#168455',
      fontSize: 10,
      fontWeight:
        '700',
      marginTop: 3,
    },

    shiftDurationBadge: {
      backgroundColor:
        '#E9ECFF',
      borderRadius: 9,
      paddingHorizontal: 9,
      paddingVertical: 6,
      alignItems:
        'center',
      marginRight: 7,
    },

    shiftDurationLabel: {
      color:
        '#6670A8',
      fontSize: 6,
      fontWeight:
        '800',
    },

    shiftDurationValue: {
      color:
        '#2436B2',
      fontSize: 10,
      fontWeight:
        '800',
      marginTop: 2,
    },

    statusRow: {
      marginTop: 13,
    },

    statusArea: {
      width:
        '100%',
    },

    inputLabel: {
      color:
        '#98A2B3',
      fontSize: 9,
      fontWeight:
        '700',
      marginBottom: 5,
    },

    statusButton: {
      borderRadius: 9,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },

    statusText: {
      fontSize: 10,
      fontWeight:
        '800',
    },

    timeRow: {
      flexDirection:
        'row',
      alignItems:
        'flex-end',
      marginTop: 12,
      gap: 6,
    },

    timeArea: {
      flex: 1,
    },

    timeArrowArea: {
      paddingBottom: 11,
    },

    timeArrow: {
      color:
        '#98A2B3',
      fontSize: 17,
      fontWeight:
        '800',
    },

    timeInputBox: {
      backgroundColor:
        '#F2F4F7',
      borderRadius: 10,
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 8,
    },

    timeInput: {
      flex: 1,
      paddingVertical: 10,
      color:
        '#101D48',
      textAlign:
        'center',
      fontSize: 12,
      fontWeight:
        '800',
    },

    clockText: {
      fontSize: 12,
    },

    validShiftBox: {
      backgroundColor:
        '#E8F8EF',
      borderRadius: 9,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 9,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    validShiftText: {
      color:
        '#168455',
      fontSize: 9,
      fontWeight:
        '800',
    },

    nextDayText: {
      color:
        '#168455',
      fontSize: 7,
      fontWeight:
        '700',
    },

    invalidShiftBox: {
      backgroundColor:
        '#FFF4E5',
      borderRadius: 9,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 9,
    },

    invalidShiftText: {
      color:
        '#B54708',
      fontSize: 9,
      fontWeight:
        '700',
    },

    statusMenu: {
      backgroundColor:
        '#F7F8FC',
      borderRadius: 10,
      marginTop: 8,
      overflow:
        'hidden',
    },

    statusOption: {
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor:
        '#EAECF0',
    },

    statusOptionText: {
      color:
        '#344054',
      fontSize: 11,
      fontWeight:
        '700',
    },

    removeButton: {
      width: 31,
      height: 31,
      borderRadius: 9,
      backgroundColor:
        '#FDECEC',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    removeText: {
      color:
        '#D92D20',
      fontSize: 20,
      fontWeight:
        '800',
    },

    availableCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    callInButton: {
      backgroundColor:
        '#E9ECFF',
      borderRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },

    callInText: {
      color:
        '#2436B2',
      fontSize: 10,
      fontWeight:
        '800',
    },

    addedBadge: {
      backgroundColor:
        '#E8F8EF',
      borderRadius: 8,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },

    addedText: {
      color:
        '#168455',
      fontSize: 8,
      fontWeight:
        '800',
    },

    emptyCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 16,
    },

    emptyText: {
      color:
        '#667085',
      fontSize: 11,
      lineHeight: 16,
    },

    redText: {
      color:
        '#D92D20',
    },

    orangeText: {
      color:
        '#B54708',
    },

    greenText: {
      color:
        '#168455',
    },

    saveButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems:
        'center',
      marginTop: 24,
    },

    saveText: {
      color:
        '#FFFFFF',
      fontSize: 14,
      fontWeight:
        '800',
    },
  });