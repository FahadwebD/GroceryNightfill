import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  router,
  useFocusEffect,
} from 'expo-router';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ScrollView,
  StyleSheet,
  Text,
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

type LoadItem = {
  name: string;
  cartons: string;
  hours: string;
  minutes: string;
};

type NightLoad = {
  day: string;
  photos: string[];
  items: LoadItem[];
  totalCartons: number;
  totalRequiredMinutes: number;
  aisleMinutes: number;
  promoMinutes: number;
  protectMinutes: number;
  splittingMinutes: number;
  otherOrganisingMinutes: number;
  totalWasDetected: boolean;
  updatedAt: string;
};

type SavedLoads = Record<
  string,
  NightLoad
>;

type Allocation = {
  employeeId: string;
  taskName: string;
  minutes: number;
};

type SavedAllocations = Record<
  string,
  Allocation[]
>;

type TaskStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Complete';

type ProgressItem = {
  taskName: string;
  status: TaskStatus;
};

type SavedProgress = Record<
  string,
  ProgressItem[]
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

  if (
    date.getHours() < 5
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

function formatMinutes(
  totalMinutes: number
) {
  const safe =
    Math.max(
      Math.round(
        totalMinutes || 0
      ),
      0
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
    parts.length > 1
      ? Number(
          parts[1]
        )
      : 0;

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
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

function timeToNightMinutes(
  value: string
) {
  const time =
    normaliseTime(
      value
    );

  if (!time) {
    return null;
  }

  const [
    hour,
    minute,
  ] =
    time
      .split(':')
      .map(Number);

  let total =
    hour * 60 +
    minute;

  if (
    hour < 5
  ) {
    total +=
      24 * 60;
  }

  return total;
}

function getCurrentNightMinutes() {
  const now =
    new Date();

  let total =
    now.getHours() *
      60 +
    now.getMinutes();

  if (
    now.getHours() < 5
  ) {
    total +=
      24 * 60;
  }

  return total;
}

function formatClock(
  value?: string | null
) {
  if (!value) {
    return '—';
  }

  const time =
    normaliseTime(
      value
    );

  if (!time) {
    return value;
  }

  const [
    hour,
    minute,
  ] =
    time
      .split(':')
      .map(Number);

  const d =
    new Date();

  d.setHours(
    hour,
    minute,
    0,
    0
  );

  return d.toLocaleTimeString(
    'en-AU',
    {
      hour:
        'numeric',
      minute:
        '2-digit',
    }
  );
}

function calculateUsableMinutesAfterLoad(
  startTime: string | undefined,
  finishTime: string | undefined,
  loadArrivalTime:
    | string
    | null
    | undefined
) {
  if (
    !startTime ||
    !finishTime ||
    !loadArrivalTime
  ) {
    return 0;
  }

  const start =
    timeToNightMinutes(
      startTime
    );

  const finishRaw =
    timeToNightMinutes(
      finishTime
    );

  const arrival =
    timeToNightMinutes(
      loadArrivalTime
    );

  if (
    start === null ||
    finishRaw === null ||
    arrival === null
  ) {
    return 0;
  }

  let finish =
    finishRaw;

  if (
    finish <=
    start
  ) {
    finish +=
      24 * 60;
  }

  if (
    finish <=
    arrival
  ) {
    return 0;
  }

  const usableStart =
    Math.max(
      start,
      arrival
    );

  return Math.max(
    finish -
      usableStart,
    0
  );
}

function calculatePreLoadMinutes(
  startTime: string | undefined,
  finishTime: string | undefined,
  loadArrivalTime:
    | string
    | null
    | undefined
) {
  if (
    !startTime ||
    !finishTime ||
    !loadArrivalTime
  ) {
    return 0;
  }

  const start =
    timeToNightMinutes(
      startTime
    );

  const finishRaw =
    timeToNightMinutes(
      finishTime
    );

  const arrival =
    timeToNightMinutes(
      loadArrivalTime
    );

  if (
    start === null ||
    finishRaw === null ||
    arrival === null
  ) {
    return 0;
  }

  let finish =
    finishRaw;

  if (
    finish <=
    start
  ) {
    finish +=
      24 * 60;
  }

  if (
    start >=
    arrival
  ) {
    return 0;
  }

  const preLoadEnd =
    Math.min(
      finish,
      arrival
    );

  return Math.max(
    preLoadEnd -
      start,
    0
  );
}

export default function TonightScreen() {
  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  const [
    savedRoster,
    setSavedRoster,
  ] =
    useState<SavedRoster>({});

  const [
    savedLoads,
    setSavedLoads,
  ] =
    useState<SavedLoads>({});

  const [
    savedAllocations,
    setSavedAllocations,
  ] =
    useState<SavedAllocations>(
      {}
    );

  const [
    savedProgress,
    setSavedProgress,
  ] =
    useState<SavedProgress>(
      {}
    );

  const [
    loadArrival,
    setLoadArrival,
  ] =
    useState<LoadArrivalRecord | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

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

  async function loadTonightData() {
    try {
      setLoading(
        true
      );

      const storedEmployees =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      setEmployees(
        storedEmployees
          ? JSON.parse(
              storedEmployees
            )
          : []
      );

      const storedRoster =
        await AsyncStorage.getItem(
          'groceryNightRoster'
        );

      setSavedRoster(
        storedRoster
          ? JSON.parse(
              storedRoster
            )
          : {}
      );

      const storedLoads =
        await AsyncStorage.getItem(
          'groceryNightLoads'
        );

      setSavedLoads(
        storedLoads
          ? JSON.parse(
              storedLoads
            )
          : {}
      );

      const storedAllocations =
        await AsyncStorage.getItem(
          'groceryNightAllocations'
        );

      setSavedAllocations(
        storedAllocations
          ? JSON.parse(
              storedAllocations
            )
          : {}
      );

      const storedProgress =
        await AsyncStorage.getItem(
          'groceryNightProgress'
        );

      setSavedProgress(
        storedProgress
          ? JSON.parse(
              storedProgress
            )
          : {}
      );

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

      setLoadArrival(
        parsedArrival[
          dateKey
        ] ||
          parsedArrival[
            currentDay
          ] ||
          null
      );
    } catch (error) {
      console.log(
        'LOAD TONIGHT ERROR:',
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
      loadTonightData();
    }, [])
  );

  const contractedEmployees =
    useMemo(() => {
      return employees.filter(
        (employee) =>
          employee.employmentType ===
            'Part-time' &&
          employee.contractDays?.includes(
            currentDay
          )
      );
    }, [
      employees,
      currentDay,
    ]);

  const tonightRoster =
    useMemo(() => {
      const saved =
        savedRoster[
          currentDay
        ];

      if (saved) {
        return saved;
      }

      return contractedEmployees.map(
        (
          employee
        ): RosterEntry => ({
          employeeId:
            employee.id,

          hours:
            employee.dayHours?.[
              currentDay
            ] || '0',

          startTime:
            '17:00',

          finishTime:
            '',

          status:
            'Working',

          isExtra:
            false,
        })
      );
    }, [
      savedRoster,
      currentDay,
      contractedEmployees,
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

  const tonightLoad =
    savedLoads[
      currentDay
    ];

  const requiredMinutes =
    tonightLoad
      ?.totalRequiredMinutes ||
    0;

  const requiredHours =
    requiredMinutes /
    60;

  const totalCartons =
    tonightLoad
      ?.totalCartons ||
    0;

  const splittingMinutes =
    tonightLoad
      ?.splittingMinutes ||
    0;

  const aisleMinutes =
    tonightLoad
      ?.aisleMinutes ||
    0;

  const promoMinutes =
    tonightLoad
      ?.promoMinutes ||
    0;

  const protectMinutes =
    tonightLoad
      ?.protectMinutes ||
    0;

  const organisingMinutes =
    tonightLoad
      ?.otherOrganisingMinutes ||
    0;

  const workingRoster =
    tonightRoster.filter(
      (entry) =>
        entry.status !==
          'Sick' &&
        entry.status !==
          'No Show'
    );

  const rosteredMinutes =
    workingRoster.reduce(
      (
        total,
        entry
      ) =>
        total +
        (
          Number(
            entry.hours
          ) || 0
        ) *
          60,
      0
    );

  const rosteredHours =
    rosteredMinutes /
    60;

  const workingTeamCount =
    workingRoster.length;

  const labourDifference =
    requiredHours >
    0
      ? rosteredHours -
        requiredHours
      : 0;

  /*
  |--------------------------------------------------------------------------
  | REAL POST-ARRIVAL LABOUR
  |--------------------------------------------------------------------------
  */

  const actualLoadArrivalTime =
    loadArrival?.arrived
      ? loadArrival.actualTime
      : null;

  const preLoadLabourMinutes =
    actualLoadArrivalTime
      ? workingRoster.reduce(
          (
            total,
            entry
          ) =>
            total +
            calculatePreLoadMinutes(
              entry.startTime,
              entry.finishTime,
              actualLoadArrivalTime
            ),
          0
        )
      : 0;

  const postArrivalLabourMinutes =
    actualLoadArrivalTime
      ? workingRoster.reduce(
          (
            total,
            entry
          ) =>
            total +
            calculateUsableMinutesAfterLoad(
              entry.startTime,
              entry.finishTime,
              actualLoadArrivalTime
            ),
          0
        )
      : rosteredMinutes;

  const realLoadDifferenceMinutes =
    postArrivalLabourMinutes -
    requiredMinutes;

  const sickCount =
    tonightRoster.filter(
      (entry) =>
        entry.status ===
        'Sick'
    ).length;

  const lateCount =
    tonightRoster.filter(
      (entry) =>
        entry.status ===
        'Late'
    ).length;

  const noShowCount =
    tonightRoster.filter(
      (entry) =>
        entry.status ===
        'No Show'
    ).length;

  const calledInCount =
    tonightRoster.filter(
      (entry) =>
        entry.isExtra ||
        entry.status ===
          'Called In'
    ).length;

  const tonightAllocations =
    savedAllocations[
      currentDay
    ] || [];

  const totalAllocatedMinutes =
    tonightAllocations.reduce(
      (
        total,
        allocation
      ) =>
        total +
        allocation.minutes,
      0
    );

  const allocationRemainingMinutes =
    Math.max(
      postArrivalLabourMinutes -
        totalAllocatedMinutes,
      0
    );

  const allocatedEmployeeCount =
    new Set(
      tonightAllocations.map(
        (allocation) =>
          allocation.employeeId
      )
    ).size;

  const allocatedTaskNames =
    Array.from(
      new Set(
        tonightAllocations
          .filter(
            (item) =>
              item.minutes >
              0
          )
          .map(
            (item) =>
              item.taskName
          )
      )
    );

  const tonightProgress =
    savedProgress[
      currentDay
    ] || [];

  const completedTaskCount =
    allocatedTaskNames.filter(
      (taskName) =>
        tonightProgress.some(
          (item) =>
            item.taskName ===
              taskName &&
            item.status ===
              'Complete'
        )
    ).length;

  const inProgressTaskCount =
    allocatedTaskNames.filter(
      (taskName) =>
        tonightProgress.some(
          (item) =>
            item.taskName ===
              taskName &&
            item.status ===
              'In Progress'
        )
    ).length;

  const totalTaskCount =
    allocatedTaskNames.length;

  /*
  |--------------------------------------------------------------------------
  | REAL-TIME TEAM
  |--------------------------------------------------------------------------
  */

  const realTimeTeam =
    useMemo(() => {
      const nowMinutes =
        getCurrentNightMinutes();

      let onShift =
        0;

      let startingLater =
        0;

      let finished =
        0;

      workingRoster.forEach(
        (entry) => {
          const start =
            entry.startTime
              ? timeToNightMinutes(
                  entry.startTime
                )
              : null;

          let finish =
            entry.finishTime
              ? timeToNightMinutes(
                  entry.finishTime
                )
              : null;

          if (
            start === null ||
            finish === null
          ) {
            return;
          }

          if (
            finish <=
            start
          ) {
            finish +=
              24 * 60;
          }

          if (
            nowMinutes <
            start
          ) {
            startingLater +=
              1;
          } else if (
            nowMinutes >=
              start &&
            nowMinutes <
              finish
          ) {
            onShift +=
              1;
          } else {
            finished +=
              1;
          }
        }
      );

      return {
        onShift,
        startingLater,
        finished,
      };
    }, [
      workingRoster,
    ]);

  function getStatusColor(
    status: ShiftStatus
  ) {
    if (
      status === 'Sick' ||
      status ===
        'No Show'
    ) {
      return {
        background:
          '#FDECEC',
        text:
          '#D92D20',
      };
    }

    if (
      status ===
        'Late' ||
      status ===
        'Left Early'
    ) {
      return {
        background:
          '#FFF4E5',
        text:
          '#B54708',
      };
    }

    return {
      background:
        '#E8F8EF',
      text:
        '#168455',
    };
  }

  return (
    <View
      style={
        styles.container
      }
    >
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
          Tonight
        </Text>

        <Text
          style={
            styles.date
          }
        >
          {formattedDate}
        </Text>

        <Text
          style={
            styles.nightLabel
          }
        >
          {currentDay} Nightfill · 5 PM–5 AM
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text
          style={
            styles.sectionTitle
          }
        >
          Real-Time Night
        </Text>

        <TouchableOpacity
          style={
            styles.realTimeCard
          }
          activeOpacity={
            0.8
          }
          onPress={() =>
            router.push(
              '/load-arrival'
            )
          }
        >
          <View
            style={
              styles.realTimeTop
            }
          >
            <View>
              <Text
                style={
                  styles.realTimeLabel
                }
              >
                LOAD
              </Text>

              <Text
                style={
                  loadArrival
                    ?.arrived
                    ? styles.arrivedText
                    : styles.waitingText
                }
              >
                {loadArrival
                  ?.arrived
                  ? `Arrived ${formatClock(
                      loadArrival.actualTime
                    )}`
                  : 'Waiting for load'}
              </Text>
            </View>

            <Text
              style={
                styles.arrow
              }
            >
              ›
            </Text>
          </View>

          <View
            style={
              styles.realTimeStats
            }
          >
            <View
              style={
                styles.realTimeStat
              }
            >
              <Text
                style={
                  styles.realTimeStatLabel
                }
              >
                On Shift Now
              </Text>

              <Text
                style={
                  styles.onShiftNumber
                }
              >
                {
                  realTimeTeam.onShift
                }
              </Text>
            </View>

            <View
              style={
                styles.realTimeDivider
              }
            />

            <View
              style={
                styles.realTimeStat
              }
            >
              <Text
                style={
                  styles.realTimeStatLabel
                }
              >
                Starting Later
              </Text>

              <Text
                style={
                  styles.laterNumber
                }
              >
                {
                  realTimeTeam.startingLater
                }
              </Text>
            </View>

            <View
              style={
                styles.realTimeDivider
              }
            />

            <View
              style={
                styles.realTimeStat
              }
            >
              <Text
                style={
                  styles.realTimeStatLabel
                }
              >
                Finished
              </Text>

              <Text
                style={
                  styles.finishedNumber
                }
              >
                {
                  realTimeTeam.finished
                }
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {loadArrival?.arrived && (
          <>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Real Load Labour
            </Text>

            <View
              style={
                styles.realLabourCard
              }
            >
              <View
                style={
                  styles.realLabourRow
                }
              >
                <Text
                  style={
                    styles.realLabourLabel
                  }
                >
                  Full roster labour
                </Text>

                <Text
                  style={
                    styles.realLabourValue
                  }
                >
                  {formatMinutes(
                    rosteredMinutes
                  )}
                </Text>
              </View>

              <View
                style={
                  styles.realLabourRow
                }
              >
                <Text
                  style={
                    styles.realLabourLabel
                  }
                >
                  Labour before load
                </Text>

                <Text
                  style={
                    styles.preLoadValue
                  }
                >
                  {formatMinutes(
                    preLoadLabourMinutes
                  )}
                </Text>
              </View>

              <View
                style={
                  styles.realLabourDivider
                }
              />

              <View
                style={
                  styles.realLabourRow
                }
              >
                <Text
                  style={
                    styles.realLabourStrongLabel
                  }
                >
                  Available after arrival
                </Text>

                <Text
                  style={
                    styles.postArrivalValue
                  }
                >
                  {formatMinutes(
                    postArrivalLabourMinutes
                  )}
                </Text>
              </View>

              <View
                style={
                  styles.realLabourRow
                }
              >
                <Text
                  style={
                    styles.realLabourStrongLabel
                  }
                >
                  Load required
                </Text>

                <Text
                  style={
                    styles.realLabourValue
                  }
                >
                  {formatMinutes(
                    requiredMinutes
                  )}
                </Text>
              </View>

              <View
                style={[
                  styles.realDifferenceBox,

                  realLoadDifferenceMinutes <
                    0
                    ? styles.shortageBox
                    : styles.surplusBox,
                ]}
              >
                <Text
                  style={
                    styles.realDifferenceLabel
                  }
                >
                  {realLoadDifferenceMinutes <
                  0
                    ? 'REAL LABOUR SHORTAGE'
                    : 'REAL LABOUR SURPLUS'}
                </Text>

                <Text
                  style={[
                    styles.realDifferenceValue,

                    realLoadDifferenceMinutes <
                      0
                      ? styles.shortageText
                      : styles.surplusText,
                  ]}
                >
                  {realLoadDifferenceMinutes <
                  0
                    ? `-${formatMinutes(
                        Math.abs(
                          realLoadDifferenceMinutes
                        )
                      )}`
                    : `+${formatMinutes(
                        realLoadDifferenceMinutes
                      )}`}
                </Text>
              </View>
            </View>
          </>
        )}

        <TouchableOpacity
          style={
            styles.scanButton
          }
          activeOpacity={
            0.7
          }
          onPress={() =>
            router.push(
              '/scan-load'
            )
          }
        >
          <View
            style={
              styles.cameraBox
            }
          >
            <Text
              style={
                styles.cameraIcon
              }
            >
              📷
            </Text>
          </View>

          <View
            style={
              styles.scanContent
            }
          >
            <Text
              style={
                styles.scanTitle
              }
            >
              {tonightLoad
                ? 'View / Update Load'
                : "Scan Tonight's Load"}
            </Text>

            <Text
              style={
                styles.scanSubtitle
              }
            >
              {tonightLoad
                ? `${totalCartons} cartons · ${formatMinutes(
                    requiredMinutes
                  )} required`
                : 'Photograph Fill Assist and analyze tonight’s load'}
            </Text>
          </View>

          <Text
            style={
              styles.arrow
            }
          >
            ›
          </Text>
        </TouchableOpacity>

        <Text
          style={
            styles.sectionTitle
          }
        >
          Tonight&apos;s Overview
        </Text>

        <View
          style={
            styles.overviewGrid
          }
        >
          <OverviewCard
            label="Required Hours"
            value={
              requiredMinutes >
              0
                ? formatMinutes(
                    requiredMinutes
                  )
                : '—'
            }
          />

          <OverviewCard
            label="Rostered Hours"
            value={
              loading
                ? '...'
                : formatMinutes(
                    rosteredMinutes
                  )
            }
          />

          <OverviewCard
            label="Original Difference"
            value={
              requiredHours >
              0
                ? `${
                    labourDifference >
                    0
                      ? '+'
                      : ''
                  }${labourDifference.toFixed(
                    1
                  )}h`
                : '—'
            }
            valueStyle={
              requiredHours >
              0
                ? labourDifference <
                  0
                  ? styles.shortageText
                  : styles.surplusText
                : undefined
            }
          />

          <OverviewCard
            label="Team Working"
            value={
              loading
                ? '...'
                : String(
                    workingTeamCount
                  )
            }
          />
        </View>

        {tonightLoad && (
          <>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Fill Assist Labour
            </Text>

            <View
              style={
                styles.loadSummaryCard
              }
            >
              <SummaryRow
                label="Total Required"
                value={formatMinutes(
                  requiredMinutes
                )}
              />

              <SummaryRow
                label="Aisle Fill"
                value={formatMinutes(
                  aisleMinutes
                )}
              />

              <SummaryRow
                label="Splitting"
                value={formatMinutes(
                  splittingMinutes
                )}
                highlight
              />

              <SummaryRow
                label="Promo"
                value={formatMinutes(
                  promoMinutes
                )}
              />

              <SummaryRow
                label="Protect"
                value={formatMinutes(
                  protectMinutes
                )}
              />

              <SummaryRow
                label="Other / Organising"
                value={formatMinutes(
                  organisingMinutes
                )}
              />

              <SummaryRow
                label="Cartons"
                value={String(
                  totalCartons
                )}
              />
            </View>
          </>
        )}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Tonight&apos;s Plan
        </Text>

        <View
          style={
            styles.planSummaryCard
          }
        >
          <View
            style={
              styles.planStat
            }
          >
            <Text
              style={
                styles.planStatLabel
              }
            >
              Allocated
            </Text>

            <Text
              style={
                styles.planStatValue
              }
            >
              {formatMinutes(
                totalAllocatedMinutes
              )}
            </Text>
          </View>

          <View
            style={
              styles.planDivider
            }
          />

          <View
            style={
              styles.planStat
            }
          >
            <Text
              style={
                styles.planStatLabel
              }
            >
              Staff Planned
            </Text>

            <Text
              style={
                styles.planStatValue
              }
            >
              {
                allocatedEmployeeCount
              }
            </Text>
          </View>

          <View
            style={
              styles.planDivider
            }
          />

          <View
            style={
              styles.planStat
            }
          >
            <Text
              style={
                styles.planStatLabel
              }
            >
              Load Hours Left
            </Text>

            <Text
              style={
                styles.planRemaining
              }
            >
              {formatMinutes(
                allocationRemainingMinutes
              )}
            </Text>
          </View>
        </View>

        {totalTaskCount >
          0 && (
          <>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Live Status
            </Text>

            <TouchableOpacity
              style={
                styles.liveStatusCard
              }
              onPress={() =>
                router.push(
                  '/live-progress'
                )
              }
            >
              <View
                style={
                  styles.liveStatusItem
                }
              >
                <Text
                  style={
                    styles.liveStatusLabel
                  }
                >
                  Complete
                </Text>

                <Text
                  style={
                    styles.liveCompleteValue
                  }
                >
                  {completedTaskCount}/
                  {totalTaskCount}
                </Text>
              </View>

              <View
                style={
                  styles.liveStatusDivider
                }
              />

              <View
                style={
                  styles.liveStatusItem
                }
              >
                <Text
                  style={
                    styles.liveStatusLabel
                  }
                >
                  In Progress
                </Text>

                <Text
                  style={
                    styles.liveProgressValue
                  }
                >
                  {
                    inProgressTaskCount
                  }
                </Text>
              </View>

              <Text
                style={
                  styles.arrow
                }
              >
                ›
              </Text>
            </TouchableOpacity>
          </>
        )}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Attendance
        </Text>

        <View
          style={
            styles.statusSummary
          }
        >
          <StatusBox
            label="Working"
            value={
              workingTeamCount
            }
            type="working"
          />

          <StatusBox
            label="Sick"
            value={
              sickCount
            }
            type="danger"
          />

          <StatusBox
            label="Late"
            value={
              lateCount
            }
            type="warning"
          />

          <StatusBox
            label="No Show"
            value={
              noShowCount
            }
            type="danger"
          />
        </View>

        {calledInCount >
          0 && (
          <View
            style={
              styles.calledInSummary
            }
          >
            <Text
              style={
                styles.calledInLabel
              }
            >
              Called In / Extra
            </Text>

            <Text
              style={
                styles.calledInValue
              }
            >
              {
                calledInCount
              }
            </Text>
          </View>
        )}

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionTitleNoMargin
            }
          >
            Tonight&apos;s Team
          </Text>

          <Text
            style={
              styles.teamCount
            }
          >
            {
              tonightRoster.length
            }
          </Text>
        </View>

        {tonightRoster.map(
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
              getStatusColor(
                entry.status
              );

            const initials =
              employee.name
                .split(' ')
                .map(
                  (part) =>
                    part[0]
                )
                .join('')
                .slice(
                  0,
                  2
                )
                .toUpperCase();

            return (
              <View
                key={
                  entry.employeeId
                }
                style={
                  styles.teamCard
                }
              >
                <View
                  style={
                    styles.avatar
                  }
                >
                  <Text
                    style={
                      styles.avatarText
                    }
                  >
                    {
                      initials
                    }
                  </Text>
                </View>

                <View
                  style={
                    styles.teamInfo
                  }
                >
                  <Text
                    style={
                      styles.teamName
                    }
                  >
                    {
                      employee.name
                    }
                  </Text>

                  <Text
                    style={
                      styles.teamSubtext
                    }
                  >
                    {entry.startTime &&
                    entry.finishTime
                      ? `${formatClock(
                          entry.startTime
                        )} → ${formatClock(
                          entry.finishTime
                        )}`
                      : entry.isExtra
                        ? 'Extra / Called In'
                        : 'Contracted'}
                  </Text>
                </View>

                <View
                  style={
                    styles.teamRight
                  }
                >
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color:
                            colors.text,
                        },
                      ]}
                    >
                      {
                        entry.status
                      }
                    </Text>
                  </View>
                </View>
              </View>
            );
          }
        )}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Grocery Operations
        </Text>

        <OperationCard
          icon="🚚"
          title="Load Arrival"
          subtitle="Record load arrival and calculate real labour"
          onPress={() =>
            router.push(
              '/load-arrival'
            )
          }
        />

        <OperationCard
          icon="👥"
          title="Staff Allocation"
          subtitle="Allocate remaining post-load labour"
          onPress={() =>
            router.push(
              '/allocation'
            )
          }
        />

        <OperationCard
          icon="📋"
          title="Team Plan"
          subtitle="View each employee's assigned tasks"
          onPress={() =>
            router.push(
              '/team-plan'
            )
          }
        />

        <OperationCard
          icon="⏱"
          title="Live Progress"
          subtitle="Track task completion and timing"
          onPress={() =>
            router.push(
              '/live-progress'
            )
          }
        />

        <OperationCard
          icon="📊"
          title="Night Summary"
          subtitle="Review labour, attendance and performance"
          onPress={() =>
            router.push(
              '/night-summary'
            )
          }
        />
      </ScrollView>
    </View>
  );
}

function OverviewCard({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: any;
}) {
  return (
    <View
      style={
        styles.overviewCard
      }
    >
      <Text
        style={
          styles.overviewLabel
        }
      >
        {label}
      </Text>

      <Text
        style={[
          styles.overviewValue,
          valueStyle,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={
        styles.loadSummaryRow
      }
    >
      <Text
        style={
          styles.loadSummaryLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          highlight
            ? styles.splittingText
            : styles.loadSummaryValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

function StatusBox({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type:
    | 'working'
    | 'danger'
    | 'warning';
}) {
  let style =
    styles.statusWorking;

  if (
    type ===
    'danger'
  ) {
    style =
      styles.statusSick;
  }

  if (
    type ===
    'warning'
  ) {
    style =
      styles.statusLate;
  }

  return (
    <View
      style={
        styles.statusStat
      }
    >
      <Text
        style={
          styles.statusStatLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          style
        }
      >
        {value}
      </Text>
    </View>
  );
}

function OperationCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={
        styles.menuCard
      }
      activeOpacity={
        0.7
      }
      onPress={
        onPress
      }
    >
      <View
        style={
          styles.menuIcon
        }
      >
        <Text
          style={
            styles.menuEmoji
          }
        >
          {icon}
        </Text>
      </View>

      <View
        style={
          styles.menuContent
        }
      >
        <Text
          style={
            styles.menuTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.menuSubtitle
          }
        >
          {subtitle}
        </Text>
      </View>

      <Text
        style={
          styles.arrow
        }
      >
        ›
      </Text>
    </TouchableOpacity>
  );
}

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
      fontSize: 34,
      fontWeight:
        '800',
      marginTop: 6,
    },

    date: {
      color:
        '#D5DBED',
      fontSize: 13,
      marginTop: 5,
    },

    nightLabel: {
      color:
        '#AEB9DD',
      fontSize: 10,
      marginTop: 5,
    },

    content: {
      padding: 16,
      paddingBottom: 55,
    },

    sectionTitle: {
      color:
        '#101828',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 22,
      marginBottom: 9,
    },

    sectionTitleNoMargin: {
      color:
        '#101828',
      fontSize: 17,
      fontWeight:
        '800',
    },

    realTimeCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      padding: 15,
      borderWidth: 1,
      borderColor:
        '#DCEFE4',
    },

    realTimeTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    realTimeLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
      fontWeight:
        '800',
    },

    waitingText: {
      color:
        '#B54708',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 3,
    },

    arrivedText: {
      color:
        '#168455',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 3,
    },

    realTimeStats: {
      flexDirection:
        'row',
      marginTop: 14,
      backgroundColor:
        '#F8F9FB',
      borderRadius: 11,
      paddingVertical: 10,
    },

    realTimeStat: {
      flex: 1,
      alignItems:
        'center',
    },

    realTimeDivider: {
      width: 1,
      height: 30,
      backgroundColor:
        '#EAECF0',
    },

    realTimeStatLabel: {
      color:
        '#98A2B3',
      fontSize: 7,
    },

    onShiftNumber: {
      color:
        '#168455',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 3,
    },

    laterNumber: {
      color:
        '#B54708',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 3,
    },

    finishedNumber: {
      color:
        '#667085',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 3,
    },

    realLabourCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 15,
      padding: 15,
    },

    realLabourRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      paddingVertical: 7,
    },

    realLabourLabel: {
      color:
        '#667085',
      fontSize: 10,
    },

    realLabourStrongLabel: {
      color:
        '#101828',
      fontSize: 10,
      fontWeight:
        '800',
    },

    realLabourValue: {
      color:
        '#101D48',
      fontSize: 13,
      fontWeight:
        '800',
    },

    preLoadValue: {
      color:
        '#B54708',
      fontSize: 13,
      fontWeight:
        '800',
    },

    postArrivalValue: {
      color:
        '#2436B2',
      fontSize: 15,
      fontWeight:
        '800',
    },

    realLabourDivider: {
      height: 1,
      backgroundColor:
        '#EAECF0',
      marginVertical: 5,
    },

    realDifferenceBox: {
      marginTop: 10,
      borderRadius: 11,
      padding: 12,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    shortageBox: {
      backgroundColor:
        '#FDECEC',
    },

    surplusBox: {
      backgroundColor:
        '#E8F8EF',
    },

    realDifferenceLabel: {
      color:
        '#667085',
      fontSize: 8,
      fontWeight:
        '800',
    },

    realDifferenceValue: {
      fontSize: 15,
      fontWeight:
        '800',
    },

    scanButton: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      padding: 15,
      flexDirection:
        'row',
      alignItems:
        'center',
      marginTop: 10,
    },

    cameraBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor:
        '#E9ECFF',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    cameraIcon: {
      fontSize: 22,
    },

    scanContent: {
      flex: 1,
      marginLeft: 12,
    },

    scanTitle: {
      color:
        '#101D48',
      fontSize: 15,
      fontWeight:
        '800',
    },

    scanSubtitle: {
      color:
        '#667085',
      fontSize: 9,
      marginTop: 3,
    },

    arrow: {
      color:
        '#98A2B3',
      fontSize: 27,
    },

    overviewGrid: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      gap: 9,
    },

    overviewCard: {
      width:
        '48.5%',
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 14,
    },

    overviewLabel: {
      color:
        '#667085',
      fontSize: 10,
    },

    overviewValue: {
      color:
        '#101D48',
      fontSize: 20,
      fontWeight:
        '800',
      marginTop: 7,
    },

    shortageText: {
      color:
        '#D92D20',
    },

    surplusText: {
      color:
        '#168455',
    },

    loadSummaryCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 15,
      gap: 11,
    },

    loadSummaryRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    loadSummaryLabel: {
      color:
        '#667085',
      fontSize: 10,
    },

    loadSummaryValue: {
      color:
        '#101D48',
      fontSize: 13,
      fontWeight:
        '800',
    },

    splittingText: {
      color:
        '#6D5DFB',
      fontSize: 13,
      fontWeight:
        '800',
    },

    planSummaryCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    planStat: {
      flex: 1,
      alignItems:
        'center',
    },

    planDivider: {
      width: 1,
      height: 34,
      backgroundColor:
        '#EAECF0',
    },

    planStatLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
    },

    planStatValue: {
      color:
        '#101D48',
      fontSize: 14,
      fontWeight:
        '800',
      marginTop: 4,
    },

    planRemaining: {
      color:
        '#168455',
      fontSize: 14,
      fontWeight:
        '800',
      marginTop: 4,
    },

    liveStatusCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    liveStatusItem: {
      flex: 1,
    },

    liveStatusDivider: {
      width: 1,
      height: 34,
      backgroundColor:
        '#EAECF0',
      marginHorizontal: 12,
    },

    liveStatusLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
    },

    liveCompleteValue: {
      color:
        '#168455',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 4,
    },

    liveProgressValue: {
      color:
        '#B54708',
      fontSize: 17,
      fontWeight:
        '800',
      marginTop: 4,
    },

    statusSummary: {
      flexDirection:
        'row',
      gap: 7,
    },

    statusStat: {
      flex: 1,
      backgroundColor:
        '#FFFFFF',
      borderRadius: 11,
      padding: 10,
    },

    statusStatLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
    },

    statusWorking: {
      color:
        '#168455',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 4,
    },

    statusSick: {
      color:
        '#D92D20',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 4,
    },

    statusLate: {
      color:
        '#B54708',
      fontSize: 18,
      fontWeight:
        '800',
      marginTop: 4,
    },

    calledInSummary: {
      backgroundColor:
        '#E8F8EF',
      borderRadius: 12,
      padding: 12,
      marginTop: 8,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
    },

    calledInLabel: {
      color:
        '#168455',
      fontSize: 10,
    },

    calledInValue: {
      color:
        '#168455',
      fontSize: 16,
      fontWeight:
        '800',
    },

    sectionHeader: {
      marginTop: 22,
      marginBottom: 9,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
    },

    teamCount: {
      color:
        '#2436B2',
      fontWeight:
        '800',
    },

    teamCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    avatar: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        '#E9ECFF',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    avatarText: {
      color:
        '#2436B2',
      fontSize: 12,
      fontWeight:
        '800',
    },

    teamInfo: {
      flex: 1,
      marginLeft: 11,
    },

    teamName: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    teamSubtext: {
      color:
        '#667085',
      fontSize: 9,
      marginTop: 3,
    },

    teamRight: {
      alignItems:
        'flex-end',
    },

    statusBadge: {
      borderRadius: 7,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },

    statusBadgeText: {
      fontSize: 8,
      fontWeight:
        '800',
    },

    menuCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    menuIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor:
        '#F2F4F7',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    menuEmoji: {
      fontSize: 19,
    },

    menuContent: {
      flex: 1,
      marginLeft: 11,
    },

    menuTitle: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    menuSubtitle: {
      color:
        '#667085',
      fontSize: 9,
      marginTop: 3,
    },
  });