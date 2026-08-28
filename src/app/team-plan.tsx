import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    router,
    useFocusEffect,
} from 'expo-router';

import {
    useCallback,
    useMemo,
    useState,
} from 'react';

import {
    ScrollView,
    StyleSheet,
    Text,
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

type Allocation = {
  employeeId: string;

  taskName: string;

  minutes: number;
};

type SavedAllocations = Record<
  string,
  Allocation[]
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

type PlannedTask = {
  taskName: string;

  minutes: number;

  startMinute: number;

  finishMinute: number;
};

type EmployeePlan = {
  employee: Employee;

  roster: RosterEntry;

  availableMinutes: number;

  allocatedMinutes: number;

  remainingMinutes: number;

  planStartMinute: number;

  rosterFinishMinute: number;

  plannedFinishMinute: number;

  overrunMinutes: number;

  tasks: PlannedTask[];
};

/*
|--------------------------------------------------------------------------
| NIGHTFILL DATE
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

/*
|--------------------------------------------------------------------------
| TIME
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

/*
 * Converts the Nightfill clock
 * into one continuous timeline.
 *
 * 17:00 = 1020
 * 23:00 = 1380
 * 01:00 = 1500
 * 05:00 = 1740
 */

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

/*
|--------------------------------------------------------------------------
| FORMAT CLOCK FROM NIGHT MINUTES
|--------------------------------------------------------------------------
*/

function formatNightMinute(
  totalMinutes: number
) {
  let safe =
    Math.round(
      totalMinutes
    );

  safe =
    safe %
    (24 * 60);

  if (safe < 0) {
    safe +=
      24 * 60;
  }

  const hour24 =
    Math.floor(
      safe / 60
    );

  const minute =
    safe % 60;

  const suffix =
    hour24 >= 12
      ? 'PM'
      : 'AM';

  let hour12 =
    hour24 % 12;

  if (
    hour12 === 0
  ) {
    hour12 = 12;
  }

  return `${hour12}:${String(
    minute
  ).padStart(
    2,
    '0'
  )} ${suffix}`;
}

function formatDuration(
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

/*
|--------------------------------------------------------------------------
| TASK ORDER
|--------------------------------------------------------------------------
*/

function getTaskOrder(
  taskName: string
) {
  if (
    taskName ===
    'Splitting'
  ) {
    return 0;
  }

  if (
    taskName.startsWith(
      'Aisle '
    )
  ) {
    return (
      Number(
        taskName.replace(
          'Aisle ',
          ''
        )
      ) || 50
    );
  }

  if (
    taskName ===
    'Promo'
  ) {
    return 100;
  }

  if (
    taskName ===
    'Protect - Aisle'
  ) {
    return 101;
  }

  if (
    taskName ===
    'Other / Organising'
  ) {
    return 102;
  }

  return 999;
}

/*
|--------------------------------------------------------------------------
| CALCULATE AVAILABLE LOAD TIME
|--------------------------------------------------------------------------
*/

function calculateEmployeeWindow(
  entry: RosterEntry,
  arrivalTime:
    | string
    | null
) {
  if (
    !entry.startTime ||
    !entry.finishTime
  ) {
    const legacyMinutes =
      Math.round(
        (
          Number(
            entry.hours
          ) || 0
        ) * 60
      );

    return {
      start:
        17 * 60,

      finish:
        17 * 60 +
        legacyMinutes,

      availableMinutes:
        legacyMinutes,
    };
  }

  const start =
    timeToNightMinutes(
      entry.startTime
    );

  let finish =
    timeToNightMinutes(
      entry.finishTime
    );

  if (
    start === null ||
    finish === null
  ) {
    return {
      start: 0,
      finish: 0,
      availableMinutes: 0,
    };
  }

  if (
    finish <= start
  ) {
    finish +=
      24 * 60;
  }

  let usableStart =
    start;

  if (arrivalTime) {
    const arrival =
      timeToNightMinutes(
        arrivalTime
      );

    if (
      arrival !== null
    ) {
      usableStart =
        Math.max(
          start,
          arrival
        );
    }
  }

  if (
    usableStart >= finish
  ) {
    return {
      start:
        usableStart,

      finish,

      availableMinutes:
        0,
    };
  }

  return {
    start:
      usableStart,

    finish,

    availableMinutes:
      finish -
      usableStart,
  };
}

/*
|--------------------------------------------------------------------------
| SCREEN
|--------------------------------------------------------------------------
*/

export default function TeamPlanScreen() {
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
    allocations,
    setAllocations,
  ] =
    useState<Allocation[]>([]);

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

  /*
|--------------------------------------------------------------------------
| LOAD
|--------------------------------------------------------------------------
*/

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    try {
      setLoading(true);

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

      const storedAllocations =
        await AsyncStorage.getItem(
          'groceryNightAllocations'
        );

      const parsedAllocations:
        SavedAllocations =
        storedAllocations
          ? JSON.parse(
              storedAllocations
            )
          : {};

      setAllocations(
        parsedAllocations[
          currentDay
        ] || []
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
        'LOAD TEAM PLAN ERROR:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  /*
|--------------------------------------------------------------------------
| ACTIVE ROSTER
|--------------------------------------------------------------------------
*/

  const workingRoster =
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

  const arrivalTime =
    loadArrival?.arrived
      ? loadArrival.actualTime
      : null;

  /*
|--------------------------------------------------------------------------
| BUILD PLANS
|--------------------------------------------------------------------------
*/

  const employeePlans:
    EmployeePlan[] =
    useMemo(() => {
      return workingRoster
        .map(
          (
            entry
          ): EmployeePlan | null => {
            const employee =
              employees.find(
                (item) =>
                  item.id ===
                  entry.employeeId
              );

            if (!employee) {
              return null;
            }

            const window =
              calculateEmployeeWindow(
                entry,
                arrivalTime
              );

            const employeeAllocations =
              allocations
                .filter(
                  (allocation) =>
                    allocation.employeeId ===
                      entry.employeeId &&
                    allocation.minutes >
                      0
                )
                .sort(
                  (a, b) =>
                    getTaskOrder(
                      a.taskName
                    ) -
                    getTaskOrder(
                      b.taskName
                    )
                );

            /*
             * Tasks run sequentially
             * starting from the employee's
             * usable load start.
             */

            let cursor =
              window.start;

            const tasks:
              PlannedTask[] =
              employeeAllocations.map(
                (allocation) => {
                  const task:
                    PlannedTask = {
                    taskName:
                      allocation.taskName,

                    minutes:
                      allocation.minutes,

                    startMinute:
                      cursor,

                    finishMinute:
                      cursor +
                      allocation.minutes,
                  };

                  cursor =
                    task.finishMinute;

                  return task;
                }
              );

            const allocatedMinutes =
              employeeAllocations.reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  allocation.minutes,
                0
              );

            const remainingMinutes =
              Math.max(
                window.availableMinutes -
                  allocatedMinutes,
                0
              );

            const overrunMinutes =
              Math.max(
                cursor -
                  window.finish,
                0
              );

            return {
              employee,

              roster:
                entry,

              availableMinutes:
                window.availableMinutes,

              allocatedMinutes,

              remainingMinutes,

              planStartMinute:
                window.start,

              rosterFinishMinute:
                window.finish,

              plannedFinishMinute:
                cursor,

              overrunMinutes,

              tasks,
            };
          }
        )
        .filter(
          (
            plan
          ): plan is EmployeePlan =>
            plan !== null
        );
    }, [
      workingRoster,
      employees,
      allocations,
      arrivalTime,
    ]);

  /*
|--------------------------------------------------------------------------
| TOTALS
|--------------------------------------------------------------------------
*/

  const totalAvailableMinutes =
    employeePlans.reduce(
      (
        total,
        plan
      ) =>
        total +
        plan.availableMinutes,
      0
    );

  const totalAllocatedMinutes =
    employeePlans.reduce(
      (
        total,
        plan
      ) =>
        total +
        plan.allocatedMinutes,
      0
    );

  const totalRemainingMinutes =
    employeePlans.reduce(
      (
        total,
        plan
      ) =>
        total +
        plan.remainingMinutes,
      0
    );

  const overrunEmployees =
    employeePlans.filter(
      (plan) =>
        plan.overrunMinutes >
        0
    );

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
          Loading team plan...
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
            ‹ Allocation
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
          Team Plan
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          {currentDay} Nightfill
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
        {/* LOAD START */}

        <View
          style={[
            styles.loadCard,

            loadArrival?.arrived
              ? styles.loadArrivedCard
              : styles.loadWaitingCard,
          ]}
        >
          <View>
            <Text
              style={
                styles.loadLabel
              }
            >
              LOAD WORK START
            </Text>

            <Text
              style={
                loadArrival?.arrived
                  ? styles.loadArrivedText
                  : styles.loadWaitingText
              }
            >
              {loadArrival?.arrived &&
              arrivalTime
                ? formatNightMinute(
                    timeToNightMinutes(
                      arrivalTime
                    ) || 0
                  )
                : 'Load arrival not recorded'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              router.push(
                '/load-arrival'
              )
            }
          >
            <Text
              style={
                styles.manageText
              }
            >
              Manage
            </Text>
          </TouchableOpacity>
        </View>

        {!loadArrival?.arrived && (
          <View
            style={
              styles.warningCard
            }
          >
            <Text
              style={
                styles.warningTitle
              }
            >
              Timeline is provisional
            </Text>

            <Text
              style={
                styles.warningText
              }
            >
              Record the actual load arrival to make the planned start and finish times accurate.
            </Text>
          </View>
        )}

        {/* TOTAL PLAN */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Plan Position
        </Text>

        <View
          style={
            styles.summaryCard
          }
        >
          <SummaryStat
            label="Available"
            value={formatDuration(
              totalAvailableMinutes
            )}
          />

          <View
            style={
              styles.summaryDivider
            }
          />

          <SummaryStat
            label="Allocated"
            value={formatDuration(
              totalAllocatedMinutes
            )}
          />

          <View
            style={
              styles.summaryDivider
            }
          />

          <SummaryStat
            label="Remaining"
            value={formatDuration(
              totalRemainingMinutes
            )}
            positive
          />
        </View>

        {overrunEmployees.length >
          0 && (
          <View
            style={
              styles.overallWarning
            }
          >
            <Text
              style={
                styles.overallWarningTitle
              }
            >
              ⚠ {overrunEmployees.length}{' '}
              employee
              {overrunEmployees.length >
              1
                ? 's'
                : ''}{' '}
              over roster finish
            </Text>

            <Text
              style={
                styles.overallWarningText
              }
            >
              Adjust their allocations before finalising tonight&apos;s plan.
            </Text>
          </View>
        )}

        {/* EMPLOYEE PLANS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Employee Timeline
        </Text>

        {employeePlans.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              No Team Plan
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Prepare tonight&apos;s roster and staff allocation first.
            </Text>
          </View>
        ) : (
          employeePlans.map(
            (plan) => {
              const initials =
                plan.employee.name
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
                    plan.employee.id
                  }
                  style={[
                    styles.employeeCard,

                    plan.overrunMinutes >
                      0 &&
                      styles.employeeCardOver,
                  ]}
                >
                  {/* EMPLOYEE */}

                  <View
                    style={
                      styles.employeeHeader
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
                        {initials}
                      </Text>
                    </View>

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
                          plan.employee
                            .name
                        }
                      </Text>

                      <Text
                        style={
                          styles.employeeShift
                        }
                      >
                        Shift{' '}
                        {plan.roster
                          .startTime
                          ? formatNightMinute(
                              timeToNightMinutes(
                                plan.roster.startTime
                              ) || 0
                            )
                          : '—'}
                        {' → '}
                        {plan.roster
                          .finishTime
                          ? formatNightMinute(
                              plan.rosterFinishMinute
                            )
                          : '—'}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.availableBadge
                      }
                    >
                      <Text
                        style={
                          styles.availableBadgeLabel
                        }
                      >
                        LOAD TIME
                      </Text>

                      <Text
                        style={
                          styles.availableBadgeValue
                        }
                      >
                        {formatDuration(
                          plan.availableMinutes
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* PLAN TOTALS */}

                  <View
                    style={
                      styles.employeeStats
                    }
                  >
                    <EmployeeStat
                      label="Allocated"
                      value={formatDuration(
                        plan.allocatedMinutes
                      )}
                    />

                    <EmployeeStat
                      label="Remaining"
                      value={formatDuration(
                        plan.remainingMinutes
                      )}
                      good
                    />

                    <EmployeeStat
                      label="Plan Finish"
                      value={
                        plan.tasks.length >
                        0
                          ? formatNightMinute(
                              plan.plannedFinishMinute
                            )
                          : '—'
                      }
                    />
                  </View>

                  {/* NO TASK */}

                  {plan.tasks.length ===
                  0 ? (
                    <View
                      style={
                        styles.noTasksBox
                      }
                    >
                      <Text
                        style={
                          styles.noTasksText
                        }
                      >
                        No load tasks allocated
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={
                        styles.timeline
                      }
                    >
                      {plan.tasks.map(
                        (
                          task,
                          index
                        ) => {
                          const taskOver =
                            task.finishMinute >
                            plan.rosterFinishMinute;

                          return (
                            <View
                              key={`${plan.employee.id}-${task.taskName}-${index}`}
                              style={
                                styles.taskRow
                              }
                            >
                              {/* TIMELINE LINE */}

                              <View
                                style={
                                  styles.timelineRail
                                }
                              >
                                <View
                                  style={[
                                    styles.timelineDot,

                                    taskOver &&
                                      styles.timelineDotDanger,
                                  ]}
                                />

                                {index <
                                  plan.tasks
                                    .length -
                                    1 && (
                                  <View
                                    style={
                                      styles.timelineLine
                                    }
                                  />
                                )}
                              </View>

                              {/* TASK */}

                              <View
                                style={[
                                  styles.taskBox,

                                  taskOver &&
                                    styles.taskBoxOver,
                                ]}
                              >
                                <View
                                  style={
                                    styles.taskTop
                                  }
                                >
                                  <Text
                                    style={
                                      task.taskName ===
                                      'Splitting'
                                        ? styles.splittingTask
                                        : styles.taskName
                                    }
                                  >
                                    {
                                      task.taskName
                                    }
                                  </Text>

                                  <Text
                                    style={
                                      styles.taskDuration
                                    }
                                  >
                                    {formatDuration(
                                      task.minutes
                                    )}
                                  </Text>
                                </View>

                                <Text
                                  style={
                                    styles.taskTimes
                                  }
                                >
                                  {formatNightMinute(
                                    task.startMinute
                                  )}
                                  {' → '}
                                  {formatNightMinute(
                                    task.finishMinute
                                  )}
                                </Text>

                                {taskOver && (
                                  <Text
                                    style={
                                      styles.taskOverText
                                    }
                                  >
                                    Runs past roster finish
                                  </Text>
                                )}
                              </View>
                            </View>
                          );
                        }
                      )}
                    </View>
                  )}

                  {/* FINISH POSITION */}

                  {plan.tasks.length >
                    0 && (
                    <View
                      style={[
                        styles.finishBox,

                        plan.overrunMinutes >
                          0
                          ? styles.finishDanger
                          : styles.finishGood,
                      ]}
                    >
                      {plan.overrunMinutes >
                      0 ? (
                        <>
                          <Text
                            style={
                              styles.finishDangerTitle
                            }
                          >
                            ⚠ PLAN RUNS OVER
                          </Text>

                          <Text
                            style={
                              styles.finishDangerValue
                            }
                          >
                            {formatDuration(
                              plan.overrunMinutes
                            )}{' '}
                            over
                          </Text>

                          <Text
                            style={
                              styles.finishSmall
                            }
                          >
                            Employee finishes at{' '}
                            {formatNightMinute(
                              plan.rosterFinishMinute
                            )}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text
                            style={
                              styles.finishGoodTitle
                            }
                          >
                            ✓ PLAN FITS SHIFT
                          </Text>

                          <Text
                            style={
                              styles.finishGoodValue
                            }
                          >
                            {formatDuration(
                              plan.remainingMinutes
                            )}{' '}
                            left
                          </Text>

                          <Text
                            style={
                              styles.finishSmall
                            }
                          >
                            Plan finishes{' '}
                            {formatNightMinute(
                              plan.plannedFinishMinute
                            )}
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            }
          )
        )}

        {/* ACTIONS */}

        <TouchableOpacity
          style={
            styles.editButton
          }
          onPress={() =>
            router.push(
              '/allocation'
            )
          }
        >
          <Text
            style={
              styles.editButtonText
            }
          >
            Edit Staff Allocation
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={
            styles.liveButton
          }
          onPress={() =>
            router.push(
              '/live-progress'
            )
          }
        >
          <Text
            style={
              styles.liveButtonText
            }
          >
            Continue to Live Progress →
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| SMALL COMPONENTS
|--------------------------------------------------------------------------
*/

function SummaryStat({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <View
      style={
        styles.summaryStat
      }
    >
      <Text
        style={
          styles.summaryLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          positive
            ? styles.summaryPositive
            : styles.summaryValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

function EmployeeStat({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <View
      style={
        styles.employeeStat
      }
    >
      <Text
        style={
          styles.employeeStatLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          good
            ? styles.employeeStatGood
            : styles.employeeStatValue
        }
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
      fontSize: 9,
      fontWeight:
        '800',
      letterSpacing: 1.5,
    },

    title: {
      color:
        '#FFFFFF',
      fontSize: 30,
      fontWeight:
        '800',
      marginTop: 4,
    },

    subtitle: {
      color:
        '#D5DBED',
      fontSize: 11,
      marginTop: 4,
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
      marginTop: 20,
      marginBottom: 9,
    },

    loadCard: {
      borderRadius: 14,
      padding: 14,
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
    },

    loadArrivedCard: {
      backgroundColor:
        '#E8F8EF',
    },

    loadWaitingCard: {
      backgroundColor:
        '#FFF4E5',
    },

    loadLabel: {
      color:
        '#667085',
      fontSize: 7,
      fontWeight:
        '800',
    },

    loadArrivedText: {
      color:
        '#168455',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 3,
    },

    loadWaitingText: {
      color:
        '#B54708',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 3,
    },

    manageText: {
      color:
        '#2436B2',
      fontSize: 9,
      fontWeight:
        '800',
    },

    warningCard: {
      backgroundColor:
        '#FFF4E5',
      borderRadius: 11,
      padding: 11,
      marginTop: 8,
    },

    warningTitle: {
      color:
        '#B54708',
      fontSize: 10,
      fontWeight:
        '800',
    },

    warningText: {
      color:
        '#8A5A19',
      fontSize: 8,
      lineHeight: 13,
      marginTop: 3,
    },

    summaryCard: {
      backgroundColor:
        '#101D48',
      borderRadius: 14,
      padding: 14,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    summaryStat: {
      flex: 1,
      alignItems:
        'center',
    },

    summaryDivider: {
      width: 1,
      height: 32,
      backgroundColor:
        '#34446E',
    },

    summaryLabel: {
      color:
        '#AEB9DD',
      fontSize: 7,
    },

    summaryValue: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 4,
    },

    summaryPositive: {
      color:
        '#8EE1B4',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 4,
    },

    overallWarning: {
      backgroundColor:
        '#FDECEC',
      borderRadius: 12,
      padding: 12,
      marginTop: 9,
    },

    overallWarningTitle: {
      color:
        '#D92D20',
      fontSize: 11,
      fontWeight:
        '800',
    },

    overallWarningText: {
      color:
        '#9F2A20',
      fontSize: 8,
      marginTop: 3,
    },

    emptyCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      padding: 16,
    },

    emptyTitle: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    emptyText: {
      color:
        '#667085',
      fontSize: 9,
      lineHeight: 14,
      marginTop: 4,
    },

    employeeCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      padding: 14,
      marginBottom: 11,
      borderWidth: 1,
      borderColor:
        '#FFFFFF',
    },

    employeeCardOver: {
      borderColor:
        '#F4B5AF',
    },

    employeeHeader: {
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
      fontSize: 11,
      fontWeight:
        '800',
    },

    employeeInfo: {
      flex: 1,
      marginLeft: 10,
    },

    employeeName: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    employeeShift: {
      color:
        '#667085',
      fontSize: 8,
      marginTop: 3,
    },

    availableBadge: {
      backgroundColor:
        '#E9ECFF',
      borderRadius: 9,
      paddingHorizontal: 8,
      paddingVertical: 6,
      alignItems:
        'center',
    },

    availableBadgeLabel: {
      color:
        '#6670A8',
      fontSize: 5,
      fontWeight:
        '800',
    },

    availableBadgeValue: {
      color:
        '#2436B2',
      fontSize: 9,
      fontWeight:
        '800',
      marginTop: 2,
    },

    employeeStats: {
      flexDirection:
        'row',
      backgroundColor:
        '#F8F9FB',
      borderRadius: 10,
      marginTop: 11,
      padding: 9,
    },

    employeeStat: {
      flex: 1,
      alignItems:
        'center',
    },

    employeeStatLabel: {
      color:
        '#98A2B3',
      fontSize: 6,
    },

    employeeStatValue: {
      color:
        '#101D48',
      fontSize: 9,
      fontWeight:
        '800',
      marginTop: 3,
    },

    employeeStatGood: {
      color:
        '#168455',
      fontSize: 9,
      fontWeight:
        '800',
      marginTop: 3,
    },

    noTasksBox: {
      backgroundColor:
        '#F2F4F7',
      borderRadius: 9,
      padding: 10,
      marginTop: 10,
    },

    noTasksText: {
      color:
        '#667085',
      fontSize: 8,
      textAlign:
        'center',
    },

    timeline: {
      marginTop: 13,
    },

    taskRow: {
      flexDirection:
        'row',
    },

    timelineRail: {
      width: 20,
      alignItems:
        'center',
    },

    timelineDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor:
        '#2436B2',
      marginTop: 14,
      zIndex: 2,
    },

    timelineDotDanger: {
      backgroundColor:
        '#D92D20',
    },

    timelineLine: {
      width: 2,
      flex: 1,
      backgroundColor:
        '#D9DDF2',
      marginTop: -1,
    },

    taskBox: {
      flex: 1,
      backgroundColor:
        '#F8F9FB',
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
    },

    taskBoxOver: {
      backgroundColor:
        '#FDECEC',
    },

    taskTop: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
    },

    taskName: {
      color:
        '#101828',
      fontSize: 10,
      fontWeight:
        '800',
    },

    splittingTask: {
      color:
        '#6D5DFB',
      fontSize: 10,
      fontWeight:
        '800',
    },

    taskDuration: {
      color:
        '#667085',
      fontSize: 8,
      fontWeight:
        '700',
    },

    taskTimes: {
      color:
        '#667085',
      fontSize: 8,
      marginTop: 4,
    },

    taskOverText: {
      color:
        '#D92D20',
      fontSize: 7,
      fontWeight:
        '800',
      marginTop: 4,
    },

    finishBox: {
      borderRadius: 10,
      padding: 10,
      marginTop: 5,
    },

    finishGood: {
      backgroundColor:
        '#E8F8EF',
    },

    finishDanger: {
      backgroundColor:
        '#FDECEC',
    },

    finishGoodTitle: {
      color:
        '#168455',
      fontSize: 7,
      fontWeight:
        '800',
    },

    finishGoodValue: {
      color:
        '#168455',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 2,
    },

    finishDangerTitle: {
      color:
        '#D92D20',
      fontSize: 7,
      fontWeight:
        '800',
    },

    finishDangerValue: {
      color:
        '#D92D20',
      fontSize: 13,
      fontWeight:
        '800',
      marginTop: 2,
    },

    finishSmall: {
      color:
        '#667085',
      fontSize: 7,
      marginTop: 2,
    },

    editButton: {
      backgroundColor:
        '#E9ECFF',
      borderRadius: 13,
      paddingVertical: 14,
      alignItems:
        'center',
      marginTop: 8,
    },

    editButtonText: {
      color:
        '#2436B2',
      fontSize: 10,
      fontWeight:
        '800',
    },

    liveButton: {
      backgroundColor:
        '#2436B2',
      borderRadius: 13,
      paddingVertical: 14,
      alignItems:
        'center',
      marginTop: 8,
    },

    liveButtonText: {
      color:
        '#FFFFFF',
      fontSize: 10,
      fontWeight:
        '800',
    },
  });