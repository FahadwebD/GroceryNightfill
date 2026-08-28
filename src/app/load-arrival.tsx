import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  router,
  useFocusEffect,
} from 'expo-router';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type Employee = {
  id: string;
  name: string;
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

  startTime?: string;

  finishTime?: string;

  status: ShiftStatus;

  isExtra: boolean;
};

type SavedRoster = Record<
  string,
  RosterEntry[]
>;

type LoadArrivalRecord = {
  day: string;

  expectedTime: string;

  actualTime: string | null;

  actualTimestamp: string | null;

  arrived: boolean;

  updatedAt: string;
};

type SavedLoadArrivals = Record<
  string,
  LoadArrivalRecord
>;

/*
|--------------------------------------------------------------------------
| NIGHTFILL DAY
|--------------------------------------------------------------------------
*/

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function getNightfillDate() {
  const now =
    new Date();

  const date =
    new Date(now);

  /*
   * 00:00 -> 04:59
   * still belongs to
   * previous Nightfill.
   */

  if (
    date.getHours() <
    5
  ) {
    date.setDate(
      date.getDate() - 1
    );
  }

  return date;
}

function getDateKey(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      '0'
    );

  return `${year}-${month}-${day}`;
}

/*
|--------------------------------------------------------------------------
| TIME HELPERS
|--------------------------------------------------------------------------
*/

function normaliseTime(
  value: string
) {
  const text =
    value.trim();

  if (!text) {
    return '';
  }

  const parts =
    text.split(':');

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

function timeToMinutes(
  time: string
) {
  const normalised =
    normaliseTime(
      time
    );

  if (!normalised) {
    return null;
  }

  const [
    hour,
    minute,
  ] =
    normalised
      .split(':')
      .map(Number);

  return (
    hour * 60 +
    minute
  );
}

/*
|--------------------------------------------------------------------------
| NIGHTFILL CLOCK POSITION
|--------------------------------------------------------------------------
*/

/*
 * Nightfill timeline is:
 *
 * 17:00 -> 05:00
 *
 * Convert clock time to
 * a continuous Nightfill minute.
 *
 * Example:
 *
 * 17:00 = 1020
 * 23:00 = 1380
 * 01:00 = 1500
 * 05:00 = 1740
 */

function toNightfillMinutes(
  time: string
) {
  const raw =
    timeToMinutes(
      time
    );

  if (
    raw === null
  ) {
    return null;
  }

  /*
   * After midnight but
   * before 5 AM =
   * next calendar day.
   */

  if (
    raw <
    5 * 60
  ) {
    return (
      raw +
      24 * 60
    );
  }

  return raw;
}

/*
|--------------------------------------------------------------------------
| CURRENT NIGHTFILL MINUTES
|--------------------------------------------------------------------------
*/

function getCurrentNightfillMinutes() {
  const now =
    new Date();

  let minutes =
    now.getHours() *
      60 +
    now.getMinutes();

  if (
    now.getHours() <
    5
  ) {
    minutes +=
      24 * 60;
  }

  return minutes;
}

/*
|--------------------------------------------------------------------------
| FORMAT DISPLAY TIME
|--------------------------------------------------------------------------
*/

function formatClock(
  time: string | null
) {
  if (!time) {
    return '—';
  }

  const normalised =
    normaliseTime(
      time
    );

  if (!normalised) {
    return time;
  }

  const [
    hour,
    minute,
  ] =
    normalised
      .split(':')
      .map(Number);

  const date =
    new Date();

  date.setHours(
    hour,
    minute,
    0,
    0
  );

  return date.toLocaleTimeString(
    'en-AU',
    {
      hour:
        'numeric',

      minute:
        '2-digit',
    }
  );
}

function formatMinutes(
  totalMinutes: number
) {
  const safe =
    Math.abs(
      Math.round(
        totalMinutes
      )
    );

  const hours =
    Math.floor(
      safe / 60
    );

  const minutes =
    safe % 60;

  if (
    hours === 0
  ) {
    return `${minutes}m`;
  }

  if (
    minutes === 0
  ) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

/*
|--------------------------------------------------------------------------
| SCREEN
|--------------------------------------------------------------------------
*/

export default function LoadArrivalScreen() {
  const nightfillDate =
    getNightfillDate();

  const currentDay =
    dayNames[
      nightfillDate.getDay()
    ];

  const dateKey =
    getDateKey(
      nightfillDate
    );

  const formattedDate =
    nightfillDate.toLocaleDateString(
      'en-AU',
      {
        weekday:
          'long',

        day:
          'numeric',

        month:
          'long',
      }
    );

  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  const [
    roster,
    setRoster,
  ] =
    useState<RosterEntry[]>([]);

  const [
    expectedTime,
    setExpectedTime,
  ] =
    useState('19:00');

  const [
    actualTime,
    setActualTime,
  ] =
    useState('');

  const [
    arrived,
    setArrived,
  ] =
    useState(false);

  const [
    actualTimestamp,
    setActualTimestamp,
  ] =
    useState<string | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  /*
   * Used to refresh
   * who is on shift now.
   */

  const [
    clockTick,
    setClockTick,
  ] =
    useState(
      Date.now()
    );

  /*
|--------------------------------------------------------------------------
| LIVE CLOCK
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    const interval =
      setInterval(
        () => {
          setClockTick(
            Date.now()
          );
        },
        30000
      );

    return () =>
      clearInterval(
        interval
      );
  }, []);

  /*
|--------------------------------------------------------------------------
| LOAD DATA
|--------------------------------------------------------------------------
*/

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    try {
      setLoading(
        true
      );

      /*
       * EMPLOYEES
       */

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

      /*
       * ROSTER
       */

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
        parsedRoster[
          currentDay
        ] || []
      );

      /*
       * LOAD ARRIVAL
       */

      const storedArrival =
        await AsyncStorage.getItem(
          'groceryLoadArrivals'
        );

      const parsedArrival:
        SavedLoadArrivals =
        storedArrival
          ? JSON.parse(
              storedArrival
            )
          : {};

      /*
       * Prefer date key.
       *
       * Fallback to old weekday key
       * if needed.
       */

      const saved =
        parsedArrival[
          dateKey
        ] ||
        parsedArrival[
          currentDay
        ];

      if (saved) {
        setExpectedTime(
          saved.expectedTime ||
            '19:00'
        );

        setActualTime(
          saved.actualTime ||
            ''
        );

        setActualTimestamp(
          saved.actualTimestamp
        );

        setArrived(
          saved.arrived
        );
      }
    } catch (error) {
      console.log(
        'LOAD ARRIVAL ERROR:',
        error
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| SAVE RECORD
|--------------------------------------------------------------------------
*/

  async function saveArrivalRecord(
    next: LoadArrivalRecord
  ) {
    try {
      const stored =
        await AsyncStorage.getItem(
          'groceryLoadArrivals'
        );

      const saved:
        SavedLoadArrivals =
        stored
          ? JSON.parse(
              stored
            )
          : {};

      /*
       * Save by actual
       * Nightfill date.
       */

      saved[
        dateKey
      ] =
        next;

      await AsyncStorage.setItem(
        'groceryLoadArrivals',
        JSON.stringify(
          saved
        )
      );
    } catch (error) {
      console.log(
        'SAVE LOAD ARRIVAL ERROR:',
        error
      );

      throw error;
    }
  }

  /*
|--------------------------------------------------------------------------
| SAVE EXPECTED TIME
|--------------------------------------------------------------------------
*/

  async function saveExpectedTime() {
    const time =
      normaliseTime(
        expectedTime
      );

    if (!time) {
      Alert.alert(
        'Invalid Time',
        'Enter expected arrival as HH:MM, for example 19:30.'
      );

      return;
    }

    setExpectedTime(
      time
    );

    const record:
      LoadArrivalRecord = {
      day:
        currentDay,

      expectedTime:
        time,

      actualTime:
        arrived
          ? actualTime
          : null,

      actualTimestamp,

      arrived,

      updatedAt:
        new Date().toISOString(),
    };

    try {
      await saveArrivalRecord(
        record
      );

      Alert.alert(
        'Expected Time Saved',
        `Expected load arrival is ${formatClock(
          time
        )}.`
      );
    } catch {
      Alert.alert(
        'Error',
        'Could not save expected arrival time.'
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| LOAD ARRIVED NOW
|--------------------------------------------------------------------------
*/

  async function markArrivedNow() {
    const expected =
      normaliseTime(
        expectedTime
      );

    if (!expected) {
      Alert.alert(
        'Expected Time Required',
        'Enter and save the expected load arrival time first.'
      );

      return;
    }

    const now =
      new Date();

    const time =
      `${String(
        now.getHours()
      ).padStart(
        2,
        '0'
      )}:${String(
        now.getMinutes()
      ).padStart(
        2,
        '0'
      )}`;

    const timestamp =
      now.toISOString();

    const record:
      LoadArrivalRecord = {
      day:
        currentDay,

      expectedTime:
        expected,

      actualTime:
        time,

      actualTimestamp:
        timestamp,

      arrived:
        true,

      updatedAt:
        timestamp,
    };

    try {
      await saveArrivalRecord(
        record
      );

      setExpectedTime(
        expected
      );

      setActualTime(
        time
      );

      setActualTimestamp(
        timestamp
      );

      setArrived(
        true
      );

      Alert.alert(
        'Load Arrived',
        `Actual arrival recorded at ${formatClock(
          time
        )}.`
      );
    } catch {
      Alert.alert(
        'Error',
        'Could not record the load arrival.'
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| MANUAL ACTUAL ARRIVAL
|--------------------------------------------------------------------------
*/

  async function saveManualArrival() {
    const expected =
      normaliseTime(
        expectedTime
      );

    const actual =
      normaliseTime(
        actualTime
      );

    if (!expected) {
      Alert.alert(
        'Expected Time Required',
        'Enter the expected arrival time first.'
      );

      return;
    }

    if (!actual) {
      Alert.alert(
        'Actual Time Required',
        'Enter the actual arrival as HH:MM.'
      );

      return;
    }

    /*
     * Create a best-effort
     * timestamp tied to this
     * Nightfill date.
     */

    const [
      actualHour,
      actualMinute,
    ] =
      actual
        .split(':')
        .map(Number);

    const actualDate =
      new Date(
        nightfillDate
      );

    /*
     * After midnight belongs
     * to next calendar day.
     */

    if (
      actualHour <
      5
    ) {
      actualDate.setDate(
        actualDate.getDate() +
          1
      );
    }

    actualDate.setHours(
      actualHour,
      actualMinute,
      0,
      0
    );

    const timestamp =
      actualDate.toISOString();

    const record:
      LoadArrivalRecord = {
      day:
        currentDay,

      expectedTime:
        expected,

      actualTime:
        actual,

      actualTimestamp:
        timestamp,

      arrived:
        true,

      updatedAt:
        new Date().toISOString(),
    };

    try {
      await saveArrivalRecord(
        record
      );

      setExpectedTime(
        expected
      );

      setActualTime(
        actual
      );

      setActualTimestamp(
        timestamp
      );

      setArrived(
        true
      );

      Alert.alert(
        'Arrival Saved',
        `Actual load arrival saved as ${formatClock(
          actual
        )}.`
      );
    } catch {
      Alert.alert(
        'Error',
        'Could not save the actual arrival time.'
      );
    }
  }

  /*
|--------------------------------------------------------------------------
| RESET ARRIVAL
|--------------------------------------------------------------------------
*/

  function resetArrival() {
    Alert.alert(
      'Reset Load Arrival',
      'Remove tonight’s actual load arrival time?',
      [
        {
          text:
            'Cancel',

          style:
            'cancel',
        },

        {
          text:
            'Reset',

          style:
            'destructive',

          onPress:
            async () => {
              const expected =
                normaliseTime(
                  expectedTime
                ) ||
                '19:00';

              const record:
                LoadArrivalRecord =
                {
                  day:
                    currentDay,

                  expectedTime:
                    expected,

                  actualTime:
                    null,

                  actualTimestamp:
                    null,

                  arrived:
                    false,

                  updatedAt:
                    new Date().toISOString(),
                };

              try {
                await saveArrivalRecord(
                  record
                );

                setActualTime(
                  ''
                );

                setActualTimestamp(
                  null
                );

                setArrived(
                  false
                );
              } catch {
                Alert.alert(
                  'Error',
                  'Could not reset arrival.'
                );
              }
            },
        },
      ]
    );
  }

  /*
|--------------------------------------------------------------------------
| ACTIVE ROSTER
|--------------------------------------------------------------------------
*/

  const activeRoster =
    useMemo(
      () =>
        roster.filter(
          (entry) =>
            entry.status !==
              'Sick' &&
            entry.status !==
              'No Show'
        ),
      [roster]
    );

  /*
|--------------------------------------------------------------------------
| REAL-TIME TEAM
|--------------------------------------------------------------------------
*/

  const realTimeTeam =
    useMemo(() => {
      /*
       * clockTick intentionally
       * causes recalculation.
       */

      void clockTick;

      const current =
        getCurrentNightfillMinutes();

      const onShift:
        RosterEntry[] =
        [];

      const startingLater:
        RosterEntry[] =
        [];

      const finished:
        RosterEntry[] =
        [];

      const invalid:
        RosterEntry[] =
        [];

      activeRoster.forEach(
        (entry) => {
          const start =
            entry.startTime
              ? toNightfillMinutes(
                  entry.startTime
                )
              : null;

          const finish =
            entry.finishTime
              ? toNightfillMinutes(
                  entry.finishTime
                )
              : null;

          if (
            start === null ||
            finish === null
          ) {
            invalid.push(
              entry
            );

            return;
          }

          let adjustedFinish =
            finish;

          /*
           * Example:
           *
           * 21:00 -> 02:00
           *
           * 02:00 has already been
           * converted to next-day
           * Nightfill minutes.
           */

          if (
            adjustedFinish <=
            start
          ) {
            adjustedFinish +=
              24 * 60;
          }

          if (
            current <
            start
          ) {
            startingLater.push(
              entry
            );
          } else if (
            current >=
              start &&
            current <
              adjustedFinish
          ) {
            onShift.push(
              entry
            );
          } else {
            finished.push(
              entry
            );
          }
        }
      );

      return {
        onShift,
        startingLater,
        finished,
        invalid,
      };
    }, [
      activeRoster,
      clockTick,
    ]);

  /*
|--------------------------------------------------------------------------
| ARRIVAL DIFFERENCE
|--------------------------------------------------------------------------
*/

  const arrivalDifference =
    useMemo(() => {
      if (
        !arrived ||
        !actualTime
      ) {
        return null;
      }

      const expected =
        toNightfillMinutes(
          expectedTime
        );

      const actual =
        toNightfillMinutes(
          actualTime
        );

      if (
        expected === null ||
        actual === null
      ) {
        return null;
      }

      /*
       * Positive = late
       * Negative = early
       */

      return (
        actual -
        expected
      );
    }, [
      arrived,
      expectedTime,
      actualTime,
    ]);

  /*
|--------------------------------------------------------------------------
| GET EMPLOYEE
|--------------------------------------------------------------------------
*/

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
| LOADING
|--------------------------------------------------------------------------
*/

  if (loading) {
    return (
      <View
        style={
          styles.center
        }
      >
        <Text
          style={
            styles.loadingText
          }
        >
          Loading load arrival...
        </Text>
      </View>
    );
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
        <TouchableOpacity
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.back
            }
          >
            ‹ Tonight
          </Text>
        </TouchableOpacity>

        <Text
          style={
            styles.headerSmall
          }
        >
          REAL-TIME NIGHTFILL
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Load Arrival
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          {formattedDate}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* ARRIVAL STATUS */}

        <View
          style={[
            styles.arrivalStatusCard,

            arrived
              ? styles.arrivedCard
              : styles.waitingCard,
          ]}
        >
          <View
            style={
              styles.arrivalIcon
            }
          >
            <Text
              style={
                styles.arrivalEmoji
              }
            >
              {arrived
                ? '✅'
                : '🚚'}
            </Text>
          </View>

          <View
            style={
              styles.arrivalStatusInfo
            }
          >
            <Text
              style={
                styles.arrivalStatusLabel
              }
            >
              {arrived
                ? 'LOAD ARRIVED'
                : 'WAITING FOR LOAD'}
            </Text>

            <Text
              style={
                styles.arrivalStatusTitle
              }
            >
              {arrived
                ? formatClock(
                    actualTime
                  )
                : 'Not arrived yet'}
            </Text>

            {arrived &&
              arrivalDifference !==
                null && (
                <Text
                  style={[
                    styles.arrivalDifference,

                    arrivalDifference >
                      0
                      ? styles.delayText
                      : styles.goodText,
                  ]}
                >
                  {arrivalDifference >
                  0
                    ? `${formatMinutes(
                        arrivalDifference
                      )} late`
                    : arrivalDifference <
                        0
                      ? `${formatMinutes(
                          arrivalDifference
                        )} early`
                      : 'On time'}
                </Text>
              )}
          </View>
        </View>

        {/* EXPECTED */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Expected Arrival
        </Text>

        <View
          style={
            styles.inputCard
          }
        >
          <View
            style={
              styles.timeInputContainer
            }
          >
            <Text
              style={
                styles.inputLabel
              }
            >
              Expected time
            </Text>

            <TextInput
              value={
                expectedTime
              }
              onChangeText={
                setExpectedTime
              }
              placeholder="19:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              style={
                styles.timeInput
              }
            />
          </View>

          <TouchableOpacity
            style={
              styles.smallSaveButton
            }
            onPress={
              saveExpectedTime
            }
          >
            <Text
              style={
                styles.smallSaveText
              }
            >
              Save
            </Text>
          </TouchableOpacity>
        </View>

        {/* ARRIVAL ACTION */}

        {!arrived ? (
          <>
            <TouchableOpacity
              style={
                styles.arrivedNowButton
              }
              activeOpacity={
                0.8
              }
              onPress={
                markArrivedNow
              }
            >
              <Text
                style={
                  styles.arrivedNowIcon
                }
              >
                📦
              </Text>

              <View
                style={
                  styles.arrivedNowContent
                }
              >
                <Text
                  style={
                    styles.arrivedNowTitle
                  }
                >
                  Load Arrived Now
                </Text>

                <Text
                  style={
                    styles.arrivedNowSubtitle
                  }
                >
                  Record the current time automatically
                </Text>
              </View>
            </TouchableOpacity>

            <Text
              style={
                styles.orText
              }
            >
              OR ENTER ACTUAL TIME
            </Text>

            <View
              style={
                styles.manualArrivalCard
              }
            >
              <TextInput
                value={
                  actualTime
                }
                onChangeText={
                  setActualTime
                }
                placeholder="20:05"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={
                  styles.manualInput
                }
              />

              <TouchableOpacity
                style={
                  styles.manualSaveButton
                }
                onPress={
                  saveManualArrival
                }
              >
                <Text
                  style={
                    styles.manualSaveText
                  }
                >
                  Save Actual
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View
            style={
              styles.arrivalDetailsCard
            }
          >
            <DetailRow
              label="Expected"
              value={formatClock(
                expectedTime
              )}
            />

            <DetailRow
              label="Actual"
              value={formatClock(
                actualTime
              )}
            />

            <DetailRow
              label="Result"
              value={
                arrivalDifference ===
                null
                  ? '—'
                  : arrivalDifference >
                      0
                    ? `${formatMinutes(
                        arrivalDifference
                      )} Late`
                    : arrivalDifference <
                        0
                      ? `${formatMinutes(
                          arrivalDifference
                        )} Early`
                      : 'On Time'
              }
              type={
                arrivalDifference ===
                null
                  ? undefined
                  : arrivalDifference >
                      0
                    ? 'danger'
                    : 'good'
              }
            />

            {actualTimestamp && (
              <Text
                style={
                  styles.timestampText
                }
              >
                Recorded{' '}
                {new Date(
                  actualTimestamp
                ).toLocaleString(
                  'en-AU'
                )}
              </Text>
            )}

            <TouchableOpacity
              style={
                styles.resetButton
              }
              onPress={
                resetArrival
              }
            >
              <Text
                style={
                  styles.resetText
                }
              >
                Reset Actual Arrival
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* REAL-TIME TEAM */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Team Right Now
        </Text>

        <View
          style={
            styles.teamStats
          }
        >
          <View
            style={
              styles.teamStatCard
            }
          >
            <Text
              style={
                styles.teamStatLabel
              }
            >
              On Shift
            </Text>

            <Text
              style={
                styles.onShiftValue
              }
            >
              {
                realTimeTeam
                  .onShift
                  .length
              }
            </Text>
          </View>

          <View
            style={
              styles.teamStatCard
            }
          >
            <Text
              style={
                styles.teamStatLabel
              }
            >
              Starting Later
            </Text>

            <Text
              style={
                styles.laterValue
              }
            >
              {
                realTimeTeam
                  .startingLater
                  .length
              }
            </Text>
          </View>

          <View
            style={
              styles.teamStatCard
            }
          >
            <Text
              style={
                styles.teamStatLabel
              }
            >
              Finished
            </Text>

            <Text
              style={
                styles.finishedValue
              }
            >
              {
                realTimeTeam
                  .finished
                  .length
              }
            </Text>
          </View>
        </View>

        {/* ON SHIFT LIST */}

        <Text
          style={
            styles.subsectionTitle
          }
        >
          On Shift Now
        </Text>

        {realTimeTeam
          .onShift.length ===
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
              Nobody from tonight&apos;s roster is currently within their scheduled shift time.
            </Text>
          </View>
        ) : (
          realTimeTeam
            .onShift
            .map(
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

                return (
                  <View
                    key={
                      entry.employeeId
                    }
                    style={
                      styles.employeeCard
                    }
                  >
                    <View
                      style={
                        styles.employeeDot
                      }
                    />

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
                          styles.employeeTime
                        }
                      >
                        {formatClock(
                          entry.startTime ||
                            ''
                        )}{' '}
                        →{' '}
                        {formatClock(
                          entry.finishTime ||
                            ''
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.onShiftBadge
                      }
                    >
                      <Text
                        style={
                          styles.onShiftBadgeText
                        }
                      >
                        ON SHIFT
                      </Text>
                    </View>
                  </View>
                );
              }
            )
        )}

        {/* STARTING LATER */}

        {realTimeTeam
          .startingLater
          .length >
          0 && (
          <>
            <Text
              style={
                styles.subsectionTitle
              }
            >
              Starting Later
            </Text>

            {realTimeTeam
              .startingLater
              .map(
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

                  return (
                    <View
                      key={
                        entry.employeeId
                      }
                      style={
                        styles.employeeCard
                      }
                    >
                      <View
                        style={
                          styles.laterDot
                        }
                      />

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
                            styles.employeeTime
                          }
                        >
                          Starts{' '}
                          {formatClock(
                            entry.startTime ||
                              ''
                          )}
                        </Text>
                      </View>
                    </View>
                  );
                }
              )}
          </>
        )}

        {/* PRE LOAD MESSAGE */}

        {!arrived && (
          <View
            style={
              styles.preLoadCard
            }
          >
            <Text
              style={
                styles.preLoadTitle
              }
            >
              Pre-Load Period
            </Text>

            <Text
              style={
                styles.preLoadText
              }
            >
              The load has not arrived yet. Staff currently on shift can be used for backstock, recovery, promo, organising or other pre-load work.
            </Text>
          </View>
        )}

        {/* NEXT STEP */}

        {arrived && (
          <TouchableOpacity
            style={
              styles.continueButton
            }
            onPress={() =>
              router.push(
                '/live-progress'
              )
            }
          >
            <Text
              style={
                styles.continueText
              }
            >
              Continue to Live Progress →
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

function DetailRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string;
  type?:
    | 'good'
    | 'danger';
}) {
  return (
    <View
      style={
        styles.detailRow
      }
    >
      <Text
        style={
          styles.detailLabel
        }
      >
        {label}
      </Text>

      <Text
        style={[
          styles.detailValue,

          type ===
            'good' &&
            styles.goodText,

          type ===
            'danger' &&
            styles.delayText,
        ]}
      >
        {value}
      </Text>
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

    center: {
      flex: 1,
      backgroundColor:
        '#F4F6FA',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    loadingText: {
      color:
        '#667085',
      fontSize: 13,
    },

    header: {
      backgroundColor:
        '#101D48',
      paddingTop: 65,
      paddingHorizontal: 22,
      paddingBottom: 25,
    },

    back: {
      color:
        '#D5DBED',
      fontSize: 14,
      marginBottom: 14,
    },

    headerSmall: {
      color:
        '#AEB9DD',
      fontSize: 10,
      fontWeight:
        '700',
      letterSpacing: 1.5,
    },

    title: {
      color:
        '#FFFFFF',
      fontSize: 30,
      fontWeight:
        '800',
      marginTop: 5,
    },

    subtitle: {
      color:
        '#D5DBED',
      fontSize: 12,
      marginTop: 5,
    },

    content: {
      padding: 16,
      paddingBottom: 55,
    },

    sectionTitle: {
      color:
        '#101828',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 20,
      marginBottom: 10,
    },

    subsectionTitle: {
      color:
        '#344054',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 17,
      marginBottom: 8,
    },

    arrivalStatusCard: {
      borderRadius: 16,
      padding: 15,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    waitingCard: {
      backgroundColor:
        '#FFF4E5',
    },

    arrivedCard: {
      backgroundColor:
        '#E8F8EF',
    },

    arrivalIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    arrivalEmoji: {
      fontSize: 22,
    },

    arrivalStatusInfo: {
      flex: 1,
      marginLeft: 12,
    },

    arrivalStatusLabel: {
      color:
        '#667085',
      fontSize: 8,
      fontWeight:
        '800',
    },

    arrivalStatusTitle: {
      color:
        '#101828',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 3,
    },

    arrivalDifference: {
      fontSize: 9,
      fontWeight:
        '800',
      marginTop: 3,
    },

    delayText: {
      color:
        '#D92D20',
    },

    goodText: {
      color:
        '#168455',
    },

    inputCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 13,
      flexDirection:
        'row',
      alignItems:
        'flex-end',
      gap: 10,
    },

    timeInputContainer: {
      flex: 1,
    },

    inputLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
      fontWeight:
        '700',
      marginBottom: 5,
    },

    timeInput: {
      backgroundColor:
        '#F2F4F7',
      borderRadius: 9,
      paddingVertical: 10,
      paddingHorizontal: 12,
      color:
        '#101D48',
      fontSize: 15,
      fontWeight:
        '800',
      textAlign:
        'center',
    },

    smallSaveButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 9,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },

    smallSaveText: {
      color:
        '#FFFFFF',
      fontSize: 10,
      fontWeight:
        '800',
    },

    arrivedNowButton: {
      backgroundColor:
        '#101D48',
      borderRadius: 15,
      padding: 15,
      marginTop: 13,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    arrivedNowIcon: {
      fontSize: 25,
    },

    arrivedNowContent: {
      marginLeft: 12,
    },

    arrivedNowTitle: {
      color:
        '#FFFFFF',
      fontSize: 15,
      fontWeight:
        '800',
    },

    arrivedNowSubtitle: {
      color:
        '#AEB9DD',
      fontSize: 8,
      marginTop: 3,
    },

    orText: {
      color:
        '#98A2B3',
      fontSize: 7,
      fontWeight:
        '800',
      textAlign:
        'center',
      marginVertical: 11,
      letterSpacing: 1,
    },

    manualArrivalCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 13,
      padding: 12,
      flexDirection:
        'row',
      gap: 8,
    },

    manualInput: {
      flex: 1,
      backgroundColor:
        '#F2F4F7',
      borderRadius: 9,
      paddingVertical: 10,
      color:
        '#101D48',
      fontWeight:
        '800',
      textAlign:
        'center',
    },

    manualSaveButton: {
      backgroundColor:
        '#E9ECFF',
      borderRadius: 9,
      paddingHorizontal: 14,
      justifyContent:
        'center',
    },

    manualSaveText: {
      color:
        '#2436B2',
      fontSize: 9,
      fontWeight:
        '800',
    },

    arrivalDetailsCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      marginTop: 13,
    },

    detailRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      paddingVertical: 6,
    },

    detailLabel: {
      color:
        '#667085',
      fontSize: 10,
    },

    detailValue: {
      color:
        '#101D48',
      fontSize: 11,
      fontWeight:
        '800',
    },

    timestampText: {
      color:
        '#98A2B3',
      fontSize: 7,
      textAlign:
        'right',
      marginTop: 8,
    },

    resetButton: {
      backgroundColor:
        '#FDECEC',
      borderRadius: 9,
      paddingVertical: 10,
      alignItems:
        'center',
      marginTop: 12,
    },

    resetText: {
      color:
        '#D92D20',
      fontSize: 9,
      fontWeight:
        '800',
    },

    teamStats: {
      flexDirection:
        'row',
      gap: 8,
    },

    teamStatCard: {
      flex: 1,
      backgroundColor:
        '#FFFFFF',
      borderRadius: 12,
      padding: 11,
    },

    teamStatLabel: {
      color:
        '#98A2B3',
      fontSize: 7,
    },

    onShiftValue: {
      color:
        '#168455',
      fontSize: 19,
      fontWeight:
        '800',
      marginTop: 4,
    },

    laterValue: {
      color:
        '#B54708',
      fontSize: 19,
      fontWeight:
        '800',
      marginTop: 4,
    },

    finishedValue: {
      color:
        '#667085',
      fontSize: 19,
      fontWeight:
        '800',
      marginTop: 4,
    },

    emptyCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 13,
      padding: 14,
    },

    emptyText: {
      color:
        '#667085',
      fontSize: 10,
      lineHeight: 16,
    },

    employeeCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 13,
      padding: 12,
      marginBottom: 7,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    employeeDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor:
        '#168455',
      marginRight: 10,
    },

    laterDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor:
        '#B54708',
      marginRight: 10,
    },

    employeeInfo: {
      flex: 1,
    },

    employeeName: {
      color:
        '#101828',
      fontSize: 12,
      fontWeight:
        '800',
    },

    employeeTime: {
      color:
        '#667085',
      fontSize: 8,
      marginTop: 3,
    },

    onShiftBadge: {
      backgroundColor:
        '#E8F8EF',
      borderRadius: 7,
      paddingHorizontal: 7,
      paddingVertical: 5,
    },

    onShiftBadgeText: {
      color:
        '#168455',
      fontSize: 7,
      fontWeight:
        '800',
    },

    preLoadCard: {
      backgroundColor:
        '#EEF0FF',
      borderRadius: 14,
      padding: 14,
      marginTop: 20,
    },

    preLoadTitle: {
      color:
        '#2436B2',
      fontSize: 13,
      fontWeight:
        '800',
    },

    preLoadText: {
      color:
        '#5B66A0',
      fontSize: 9,
      lineHeight: 15,
      marginTop: 5,
    },

    continueButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 14,
      paddingVertical: 15,
      alignItems:
        'center',
      marginTop: 20,
    },

    continueText: {
      color:
        '#FFFFFF',
      fontSize: 12,
      fontWeight:
        '800',
    },
  });