import { router, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
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

import {
  calculateLabourPosition,
  formatClock,
  formatMinutes,
  formatSignedMinutes,
  getCurrentNightMinutes,
  getShiftWindow,
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
} from '../utils/nightfillStorage';

type Employee = {
  id: string;
  name: string;
  employeeId?: string;
  employmentType?: string;
  contractDays?: string[];
  dayHours?: Record<string, string>;
  weeklyContractHours?: number;
  availableDays?: string[];
  notes?: string;
  createdAt?: string;
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
  photos?: string[];
  items: LoadItem[];
  totalCartons: number;
  totalRequiredMinutes: number;
  aisleMinutes: number;
  promoMinutes: number;
  protectMinutes: number;
  splittingMinutes: number;
  otherOrganisingMinutes: number;
  totalWasDetected?: boolean;
  updatedAt?: string;
};

type TaskStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Complete';

type ProgressItem = {
  taskName: string;
  status: TaskStatus;
  completedAt?: string | null;
};

type LoadArrivalRecord = {
  day: string;
  expectedTime: string;
  actualTime: string | null;
  actualTimestamp: string | null;
  arrived: boolean;
  updatedAt: string;
};

type LoadTask = {
  name: string;
  requiredMinutes: number;
};

type WorkflowTone =
  | 'done'
  | 'active'
  | 'waiting';

function buildLoadTasks(
  load: NightLoad | null
): LoadTask[] {
  if (!load) {
    return [];
  }

  const result: LoadTask[] = [];

  if (load.splittingMinutes > 0) {
    result.push({
      name: 'Splitting',
      requiredMinutes:
        load.splittingMinutes,
    });
  }

  load.items?.forEach((item) => {
    const minutes =
      (Number(item.hours) || 0) * 60 +
      (Number(item.minutes) || 0);

    if (minutes <= 0) {
      return;
    }

    result.push({
      name: item.name,
      requiredMinutes: minutes,
    });
  });

  if (
    load.otherOrganisingMinutes > 0 &&
    !result.some(
      (item) =>
        item.name ===
        'Other / Organising'
    )
  ) {
    result.push({
      name: 'Other / Organising',
      requiredMinutes:
        load.otherOrganisingMinutes,
    });
  }

  if (
    load.promoMinutes > 0 &&
    !result.some(
      (item) =>
        item.name === 'Promo'
    )
  ) {
    result.push({
      name: 'Promo',
      requiredMinutes:
        load.promoMinutes,
    });
  }

  if (
    load.protectMinutes > 0 &&
    !result.some(
      (item) =>
        item.name ===
        'Protect - Aisle'
    )
  ) {
    result.push({
      name: 'Protect - Aisle',
      requiredMinutes:
        load.protectMinutes,
    });
  }

  return result.sort(
    (a, b) =>
      getTaskOrder(a.name) -
      getTaskOrder(b.name)
  );
}

function getEmployeeName(
  employees: Employee[],
  employeeId: string
) {
  return (
    employees.find(
      (employee) =>
        employee.id === employeeId
    )?.name || 'Team member'
  );
}

export default function TonightScreen() {
  const nightContext =
    useMemo(
      () => getTonightContext(),
      []
    );

  const {
    date: nightfillDate,
    dateKey,
    dayName,
  } = nightContext;

  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [roster, setRoster] =
    useState<PlanningRosterEntry[]>([]);

  const [load, setLoad] =
    useState<NightLoad | null>(null);

  const [allocations, setAllocations] =
    useState<PlanningAllocation[]>([]);

  const [progress, setProgress] =
    useState<ProgressItem[]>([]);

  const [loadArrival, setLoadArrival] =
    useState<LoadArrivalRecord | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [clockTick, setClockTick] =
    useState(0);

  const formattedDate =
    useMemo(
      () =>
        nightfillDate.toLocaleDateString(
          'en-AU',
          {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }
        ),
      [nightfillDate]
    );

  async function loadTonightData() {
    try {
      setLoading(true);

      const employeeData =
        await readStorage<Employee[]>(
          'groceryEmployees',
          []
        );

      setEmployees(employeeData);

      /*
       * Roster keeps a weekday fallback because the Week screen still
       * represents the repeating weekly roster by Monday / Tuesday etc.
       */
      const storedRoster =
        await readNightValue<
          PlanningRosterEntry[]
        >(
          NIGHTFILL_STORAGE.roster,
          dateKey,
          dayName
        );

      if (storedRoster) {
        setRoster(storedRoster);
      } else {
        const contractedFallback =
          employeeData
            .filter(
              (employee) =>
                employee.employmentType ===
                  'Part-time' &&
                employee.contractDays?.includes(
                  dayName
                )
            )
            .map(
              (
                employee
              ): PlanningRosterEntry => ({
                employeeId: employee.id,
                hours:
                  employee.dayHours?.[
                    dayName
                  ] || '0',
                startTime: '17:00',
                finishTime: '',
                status: 'Working',
                isExtra: false,
              })
            );

        setRoster(
          contractedFallback
        );
      }

      /*
       * Operational night data is date-first and date-only here.
       * We deliberately do not show a stale previous Friday load on a new
       * Friday just because an old weekday compatibility key exists.
       */
      const [
        storedLoad,
        storedAllocations,
        storedProgress,
        storedArrival,
      ] = await Promise.all([
        readNightValue<NightLoad>(
          NIGHTFILL_STORAGE.loads,
          dateKey
        ),
        readNightValue<
          PlanningAllocation[]
        >(
          NIGHTFILL_STORAGE.allocations,
          dateKey
        ),
        readNightValue<ProgressItem[]>(
          NIGHTFILL_STORAGE.progress,
          dateKey
        ),
        readNightValue<LoadArrivalRecord>(
          NIGHTFILL_STORAGE.arrivals,
          dateKey
        ),
      ]);

      setLoad(storedLoad);
      setAllocations(
        storedAllocations || []
      );
      setProgress(
        storedProgress || []
      );
      setLoadArrival(
        storedArrival
      );
    } catch (error) {
      console.log(
        'LOAD TONIGHT ERROR:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadTonightData();
    }, [dateKey, dayName])
  );

  useEffect(() => {
    const interval =
      setInterval(() => {
        setClockTick(
          (value) => value + 1
        );
      }, 30_000);

    return () =>
      clearInterval(interval);
  }, []);

  const activeRoster =
    useMemo(
      () =>
        roster.filter(
          isActiveRosterEntry
        ),
      [roster]
    );

  const actualArrivalTime =
    loadArrival?.arrived
      ? loadArrival.actualTime
      : null;

  const requiredMinutes =
    load?.totalRequiredMinutes || 0;

  const labourPosition =
    useMemo(
      () =>
        calculateLabourPosition(
          roster,
          requiredMinutes,
          actualArrivalTime
        ),
      [
        roster,
        requiredMinutes,
        actualArrivalTime,
      ]
    );

  const tasks =
    useMemo(
      () => buildLoadTasks(load),
      [load]
    );

  const taskRequirementByName =
    useMemo(() => {
      return tasks.reduce<
        Record<string, number>
      >(
        (result, task) => {
          result[task.name] =
            task.requiredMinutes;
          return result;
        },
        {}
      );
    }, [tasks]);

  const taskAllocatedByName =
    useMemo(() => {
      return allocations.reduce<
        Record<string, number>
      >(
        (result, item) => {
          result[item.taskName] =
            (result[item.taskName] || 0) +
            Math.max(
              Number(item.minutes) || 0,
              0
            );
          return result;
        },
        {}
      );
    }, [allocations]);

  const allocatedMinutes =
    allocations.reduce(
      (total, item) =>
        total +
        Math.max(
          Number(item.minutes) || 0,
          0
        ),
      0
    );

  const fullyAllocatedTaskCount =
    tasks.filter(
      (task) =>
        (taskAllocatedByName[
          task.name
        ] || 0) >=
        task.requiredMinutes
    ).length;

  const completedTaskCount =
    tasks.filter(
      (task) =>
        progress.find(
          (item) =>
            item.taskName ===
              task.name
        )?.status === 'Complete'
    ).length;

  const inProgressTaskCount =
    progress.filter(
      (item) =>
        item.status ===
        'In Progress'
    ).length;

  const sickCount =
    roster.filter(
      (entry) =>
        entry.status === 'Sick'
    ).length;

  const lateCount =
    roster.filter(
      (entry) =>
        entry.status === 'Late'
    ).length;

  const nowNightMinute =
    useMemo(
      () =>
        getCurrentNightMinutes(),
      [clockTick]
    );

  const activeNowCount =
    activeRoster.filter((entry) => {
      const window =
        getShiftWindow(entry);

      return (
        nowNightMinute >=
          window.startMinute &&
        nowNightMinute <
          window.finishMinute
      );
    }).length;

  const totalCartons =
    load?.totalCartons || 0;

  const splittingMinutes =
    load?.splittingMinutes || 0;

  const aisleMinutes =
    load?.aisleMinutes || 0;

  const promoMinutes =
    load?.promoMinutes || 0;

  const protectMinutes =
    load?.protectMinutes || 0;

  const organisingMinutes =
    load?.otherOrganisingMinutes || 0;

  const allocationDifference =
    allocatedMinutes -
    requiredMinutes;

  const allocationCoverage =
    requiredMinutes > 0
      ? Math.round(
          (allocatedMinutes /
            requiredMinutes) *
            100
        )
      : 0;

  const loadWorkflowTone:
    WorkflowTone =
    load
      ? 'done'
      : 'active';

  const arrivalWorkflowTone:
    WorkflowTone =
    loadArrival?.arrived
      ? 'done'
      : load
        ? 'active'
        : 'waiting';

  const allocationWorkflowTone:
    WorkflowTone =
    requiredMinutes > 0 &&
    fullyAllocatedTaskCount ===
      tasks.length &&
    tasks.length > 0
      ? 'done'
      : loadArrival?.arrived
        ? 'active'
        : 'waiting';

  const progressWorkflowTone:
    WorkflowTone =
    tasks.length > 0 &&
    completedTaskCount ===
      tasks.length
      ? 'done'
      : allocations.length > 0
        ? 'active'
        : 'waiting';

  const heroTitle =
    !load
      ? 'Scan tonight’s load'
      : !loadArrival?.arrived
        ? 'Waiting for load arrival'
        : labourPosition.shortageMinutes > 0
          ? `${formatMinutes(
              labourPosition.shortageMinutes
            )} labour shortage`
          : 'Nightfill labour covered';

  const heroSubtitle =
    !load
      ? 'Add Fill Assist data to calculate tonight’s real labour position.'
      : !loadArrival?.arrived
        ? 'Roster labour is still projected. Record the actual truck arrival for the real position.'
        : labourPosition.shortageMinutes > 0
          ? `${formatMinutes(
              labourPosition.postArrivalMinutes
            )} available after arrival against ${formatMinutes(
              requiredMinutes
            )} required.`
          : `${formatMinutes(
              labourPosition.surplusMinutes
            )} post-arrival labour remains above the load requirement.`;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Loading tonight...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          GROCERY NIGHTFILL
        </Text>

        <Text style={styles.title}>
          Tonight
        </Text>

        <Text style={styles.subtitle}>
          {formattedDate} · 5 PM–5 AM
        </Text>

        <Text style={styles.dateKeyText}>
          Night {dateKey}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.content
        }
      >
        <View
          style={[
            styles.heroCard,
            labourPosition.shortageMinutes >
              0 &&
              loadArrival?.arrived
              ? styles.heroDanger
              : styles.heroPrimary,
          ]}
        >
          <Text style={styles.heroKicker}>
            NIGHT POSITION
          </Text>

          <Text style={styles.heroTitle}>
            {heroTitle}
          </Text>

          <Text style={styles.heroSubtitle}>
            {heroSubtitle}
          </Text>

          {loadArrival?.arrived && (
            <View style={styles.heroFooter}>
              <Text style={styles.heroFooterLabel}>
                Actual load
              </Text>

              <Text style={styles.heroFooterValue}>
                {formatClock(
                  loadArrival.actualTime
                )}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>
          Night Workflow
        </Text>

        <View style={styles.workflowCard}>
          <WorkflowRow
            step="1"
            title="Fill Assist Load"
            detail={
              load
                ? `${totalCartons} cartons · ${formatMinutes(
                    requiredMinutes
                  )}`
                : 'Not scanned yet'
            }
            tone={loadWorkflowTone}
            onPress={() =>
              router.push('/scan-load')
            }
          />

          <WorkflowRow
            step="2"
            title="Load Arrival"
            detail={
              loadArrival?.arrived
                ? `Arrived ${formatClock(
                    loadArrival.actualTime
                  )}`
                : `Expected ${formatClock(
                    loadArrival
                      ?.expectedTime ||
                      '19:00'
                  )}`
            }
            tone={arrivalWorkflowTone}
            onPress={() =>
              router.push('/load-arrival')
            }
          />

          <WorkflowRow
            step="3"
            title="Smart Allocation"
            detail={
              allocations.length > 0
                ? `${fullyAllocatedTaskCount}/${tasks.length} tasks covered · ${allocationCoverage}% labour allocated`
                : 'Suggestions ready after roster + load'
            }
            tone={allocationWorkflowTone}
            onPress={() =>
              router.push('/allocation')
            }
          />

          <WorkflowRow
            step="4"
            title="Live Progress"
            detail={
              tasks.length > 0
                ? `${completedTaskCount}/${tasks.length} complete${
                    inProgressTaskCount > 0
                      ? ` · ${inProgressTaskCount} in progress`
                      : ''
                  }`
                : 'Starts after allocation'
            }
            tone={progressWorkflowTone}
            onPress={() =>
              router.push('/live-progress')
            }
            last
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            Real Labour Position
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push('/week')
            }
          >
            <Text style={styles.linkText}>
              Edit roster
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.labourCard}>
          <SummaryRow
            label="Full roster labour"
            value={formatMinutes(
              labourPosition.fullRosterMinutes
            )}
          />

          {loadArrival?.arrived && (
            <SummaryRow
              label="Labour before load"
              value={formatMinutes(
                labourPosition.preLoadMinutes
              )}
              tone="warning"
            />
          )}

          <SummaryRow
            label={
              loadArrival?.arrived
                ? 'Available after arrival'
                : 'Projected load labour'
            }
            value={formatMinutes(
              labourPosition.postArrivalMinutes
            )}
            tone="primary"
          />

          <SummaryRow
            label="Load required"
            value={formatMinutes(
              requiredMinutes
            )}
          />

          <View style={styles.divider} />

          <SummaryRow
            label={
              labourPosition.differenceMinutes <
              0
                ? 'REAL SHORTAGE'
                : 'REAL SURPLUS'
            }
            value={
              requiredMinutes > 0
                ? formatSignedMinutes(
                    labourPosition.differenceMinutes
                  )
                : '—'
            }
            tone={
              labourPosition.differenceMinutes <
              0
                ? 'danger'
                : 'good'
            }
          />

          {requiredMinutes > 0 && (
            <View style={styles.coverageTrack}>
              <View
                style={[
                  styles.coverageFill,
                  {
                    width: `${Math.min(
                      labourPosition.coveragePercent,
                      100
                    )}%`,
                  },
                ]}
              />
            </View>
          )}

          {requiredMinutes > 0 && (
            <Text style={styles.coverageText}>
              {labourPosition.coveragePercent}% of required labour covered by post-arrival capacity
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>
          Tonight at a Glance
        </Text>

        <View style={styles.metricGrid}>
          <MetricTile
            label="Working Team"
            value={String(
              activeRoster.length
            )}
            sub={`${activeNowCount} active now`}
          />

          <MetricTile
            label="Cartons"
            value={String(totalCartons)}
            sub="Fill Assist"
          />

          <MetricTile
            label="Allocated"
            value={formatMinutes(
              allocatedMinutes
            )}
            sub={
              requiredMinutes > 0
                ? formatSignedMinutes(
                    allocationDifference
                  )
                : 'No load yet'
            }
          />

          <MetricTile
            label="Tasks Complete"
            value={`${completedTaskCount}/${tasks.length}`}
            sub={
              inProgressTaskCount > 0
                ? `${inProgressTaskCount} running`
                : 'Live progress'
            }
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            Load Breakdown
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push('/scan-load')
            }
          >
            <Text style={styles.linkText}>
              Review load
            </Text>
          </TouchableOpacity>
        </View>

        {!load ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No Fill Assist load saved for {dateKey}
            </Text>

            <Text style={styles.emptyText}>
              Scan tonight’s load. The dashboard will then calculate required labour and compare it with the roster.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                router.push('/scan-load')
              }
            >
              <Text style={styles.primaryButtonText}>
                Scan Fill Assist
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.breakdownCard}>
            <BreakdownRow
              label="Aisle Fill"
              value={formatMinutes(
                aisleMinutes
              )}
            />

            <BreakdownRow
              label="Splitting"
              value={formatMinutes(
                splittingMinutes
              )}
              accent
            />

            <BreakdownRow
              label="Promo"
              value={formatMinutes(
                promoMinutes
              )}
            />

            <BreakdownRow
              label="Protect"
              value={formatMinutes(
                protectMinutes
              )}
            />

            <BreakdownRow
              label="Other / Organising"
              value={formatMinutes(
                organisingMinutes
              )}
              last
            />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            Team Status
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push('/week')
            }
          >
            <Text style={styles.linkText}>
              Roster
            </Text>
          </TouchableOpacity>
        </View>

        {roster.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No roster for {dayName}
            </Text>

            <Text style={styles.emptyText}>
              Add tonight’s team before calculating labour and allocation suggestions.
            </Text>
          </View>
        ) : (
          <View style={styles.teamCard}>
            <View style={styles.teamStatsRow}>
              <MiniStat
                label="Working"
                value={String(
                  activeRoster.length
                )}
              />

              <MiniStat
                label="Sick"
                value={String(sickCount)}
                danger={sickCount > 0}
              />

              <MiniStat
                label="Late"
                value={String(lateCount)}
                warning={lateCount > 0}
              />

              <MiniStat
                label="Active Now"
                value={String(
                  activeNowCount
                )}
              />
            </View>

            <View style={styles.divider} />

            {roster.slice(0, 6).map(
              (entry, index) => {
                const employeeName =
                  getEmployeeName(
                    employees,
                    entry.employeeId
                  );

                const window =
                  getShiftWindow(entry);

                const rosterDuration =
                  formatMinutes(
                    window.durationMinutes
                  );

                return (
                  <View
                    key={`${entry.employeeId}-${index}`}
                    style={[
                      styles.teamMemberRow,
                      index ===
                        Math.min(
                          roster.length,
                          6
                        ) -
                          1 &&
                        styles.teamMemberRowLast,
                    ]}
                  >
                    <View style={styles.teamMemberInfo}>
                      <Text style={styles.teamMemberName}>
                        {employeeName}
                      </Text>

                      <Text style={styles.teamMemberShift}>
                        {entry.startTime &&
                        entry.finishTime
                          ? `${formatClock(
                              entry.startTime
                            )} → ${formatClock(
                              entry.finishTime
                            )}`
                          : `${rosterDuration} rostered`}
                      </Text>
                    </View>

                    <StatusPill
                      status={entry.status}
                    />
                  </View>
                );
              }
            )}

            {roster.length > 6 && (
              <Text style={styles.moreTeamText}>
                +{roster.length - 6} more team members in roster
              </Text>
            )}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            Allocation
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push('/allocation')
            }
          >
            <Text style={styles.linkText}>
              Smart allocation
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.allocationCard}>
          <View style={styles.allocationTopRow}>
            <View>
              <Text style={styles.cardLabel}>
                FINAL MANAGER ALLOCATION
              </Text>

              <Text style={styles.allocationValue}>
                {formatMinutes(
                  allocatedMinutes
                )}
              </Text>
            </View>

            <View style={styles.allocationRight}>
              <Text style={styles.allocationPercent}>
                {allocationCoverage}%
              </Text>

              <Text style={styles.allocationPercentLabel}>
                labour assigned
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <SummaryRow
            label="Tasks fully covered"
            value={`${fullyAllocatedTaskCount}/${tasks.length}`}
          />

          <SummaryRow
            label="Load allocation difference"
            value={
              requiredMinutes > 0
                ? formatSignedMinutes(
                    allocationDifference
                  )
                : '—'
            }
            tone={
              allocationDifference < 0
                ? 'danger'
                : 'good'
            }
          />

          <View style={styles.inlineButtons}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                router.push('/allocation')
              }
            >
              <Text style={styles.secondaryButtonText}>
                Suggest / Edit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                router.push('/team-plan')
              }
            >
              <Text style={styles.secondaryButtonText}>
                Team Plan
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Quick Actions
        </Text>

        <View style={styles.actionGrid}>
          <ActionButton
            title="Roster"
            detail="Team & shifts"
            onPress={() =>
              router.push('/week')
            }
          />

          <ActionButton
            title="Load Arrival"
            detail="Expected / actual"
            onPress={() =>
              router.push('/load-arrival')
            }
          />

          <ActionButton
            title="Smart Allocation"
            detail="Suggest & edit"
            onPress={() =>
              router.push('/allocation')
            }
          />

          <ActionButton
            title="Team Plan"
            detail="Planned timeline"
            onPress={() =>
              router.push('/team-plan')
            }
          />

          <ActionButton
            title="Live Progress"
            detail="Track the night"
            onPress={() =>
              router.push('/live-progress')
            }
          />

          <ActionButton
            title="Night Summary"
            detail="Close & report"
            onPress={() =>
              router.push('/night-summary')
            }
          />
        </View>

        {Object.keys(taskRequirementByName)
          .length > 0 &&
          allocations.length > 0 && (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>
              One source of truth
            </Text>

            <Text style={styles.noteText}>
              Tonight now uses the same shared engine as Allocation for overnight shifts, labour before the truck, post-arrival capacity and shortage / surplus.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function WorkflowRow({
  step,
  title,
  detail,
  tone,
  onPress,
  last = false,
}: {
  step: string;
  title: string;
  detail: string;
  tone: WorkflowTone;
  onPress: () => void;
  last?: boolean;
}) {
  const badgeStyle =
    tone === 'done'
      ? styles.workflowBadgeDone
      : tone === 'active'
        ? styles.workflowBadgeActive
        : styles.workflowBadgeWaiting;

  const badgeText =
    tone === 'done'
      ? '✓'
      : step;

  return (
    <TouchableOpacity
      style={[
        styles.workflowRow,
        last && styles.workflowRowLast,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.workflowBadge,
          badgeStyle,
        ]}
      >
        <Text style={styles.workflowBadgeText}>
          {badgeText}
        </Text>
      </View>

      <View style={styles.workflowInfo}>
        <Text style={styles.workflowTitle}>
          {title}
        </Text>

        <Text style={styles.workflowDetail}>
          {detail}
        </Text>
      </View>

      <Text style={styles.workflowArrow}>
        ›
      </Text>
    </TouchableOpacity>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?:
    | 'primary'
    | 'good'
    | 'danger'
    | 'warning';
}) {
  let valueStyle =
    styles.summaryValue;

  if (tone === 'primary') {
    valueStyle =
      styles.summaryPrimary;
  }

  if (tone === 'good') {
    valueStyle =
      styles.summaryGood;
  }

  if (tone === 'danger') {
    valueStyle =
      styles.summaryDanger;
  }

  if (tone === 'warning') {
    valueStyle =
      styles.summaryWarning;
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

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>
        {label}
      </Text>

      <Text style={styles.metricValue}>
        {value}
      </Text>

      <Text style={styles.metricSub}>
        {sub}
      </Text>
    </View>
  );
}

function BreakdownRow({
  label,
  value,
  accent = false,
  last = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.breakdownRow,
        last && styles.breakdownRowLast,
      ]}
    >
      <Text style={styles.breakdownLabel}>
        {label}
      </Text>

      <Text
        style={
          accent
            ? styles.breakdownAccent
            : styles.breakdownValue
        }
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
  warning = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.miniStatValue,
          danger &&
            styles.miniStatDanger,
          warning &&
            styles.miniStatWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function StatusPill({
  status,
}: {
  status: PlanningRosterEntry['status'];
}) {
  const danger =
    status === 'Sick' ||
    status === 'No Show';

  const warning =
    status === 'Late' ||
    status === 'Left Early';

  return (
    <View
      style={[
        styles.statusPill,
        danger && styles.statusPillDanger,
        warning &&
          styles.statusPillWarning,
      ]}
    >
      <Text
        style={[
          styles.statusPillText,
          danger &&
            styles.statusPillTextDanger,
          warning &&
            styles.statusPillTextWarning,
        ]}
      >
        {status}
      </Text>
    </View>
  );
}

function ActionButton({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.actionButton}
      onPress={onPress}
    >
      <Text style={styles.actionTitle}>
        {title}
      </Text>

      <Text style={styles.actionDetail}>
        {detail}
      </Text>

      <Text style={styles.actionArrow}>
        →
      </Text>
    </TouchableOpacity>
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
    fontSize: 13,
  },

  header: {
    backgroundColor: '#101D48',
    paddingTop: 66,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },

  eyebrow: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },

  subtitle: {
    color: '#D5DBED',
    fontSize: 12,
    marginTop: 5,
  },

  dateKeyText: {
    color: '#8290BB',
    fontSize: 9,
    marginTop: 5,
  },

  content: {
    padding: 16,
    paddingBottom: 60,
  },

  heroCard: {
    borderRadius: 18,
    padding: 18,
  },

  heroPrimary: {
    backgroundColor: '#2436B2',
  },

  heroDanger: {
    backgroundColor: '#B42318',
  },

  heroKicker: {
    color: '#D7DDFE',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },

  heroSubtitle: {
    color: '#EEF1FF',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
  },

  heroFooter: {
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroFooterLabel: {
    color: '#D7DDFE',
    fontSize: 9,
  },

  heroFooterValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 21,
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
    marginTop: 21,
    marginBottom: 9,
  },

  linkText: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },

  workflowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
  },

  workflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
  },

  workflowRowLast: {
    borderBottomWidth: 0,
  },

  workflowBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  workflowBadgeDone: {
    backgroundColor: '#E8F8EF',
  },

  workflowBadgeActive: {
    backgroundColor: '#E9ECFF',
  },

  workflowBadgeWaiting: {
    backgroundColor: '#F2F4F7',
  },

  workflowBadgeText: {
    color: '#2436B2',
    fontSize: 11,
    fontWeight: '800',
  },

  workflowInfo: {
    flex: 1,
    marginLeft: 11,
  },

  workflowTitle: {
    color: '#101828',
    fontSize: 12,
    fontWeight: '800',
  },

  workflowDetail: {
    color: '#667085',
    fontSize: 9,
    marginTop: 3,
  },

  workflowArrow: {
    color: '#98A2B3',
    fontSize: 22,
  },

  labourCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },

  summaryLabel: {
    color: '#667085',
    fontSize: 10,
    flex: 1,
    paddingRight: 10,
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
    marginVertical: 6,
  },

  coverageTrack: {
    height: 7,
    backgroundColor: '#EAECF0',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 9,
  },

  coverageFill: {
    height: '100%',
    backgroundColor: '#2436B2',
    borderRadius: 999,
  },

  coverageText: {
    color: '#667085',
    fontSize: 8,
    lineHeight: 12,
    marginTop: 6,
  },

  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  metricTile: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
  },

  metricLabel: {
    color: '#667085',
    fontSize: 9,
  },

  metricValue: {
    color: '#101D48',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 5,
  },

  metricSub: {
    color: '#98A2B3',
    fontSize: 8,
    marginTop: 3,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
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
    lineHeight: 15,
    marginTop: 5,
  },

  primaryButton: {
    backgroundColor: '#2436B2',
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 13,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
  },

  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
  },

  breakdownRowLast: {
    borderBottomWidth: 0,
  },

  breakdownLabel: {
    color: '#667085',
    fontSize: 10,
  },

  breakdownValue: {
    color: '#101D48',
    fontSize: 12,
    fontWeight: '800',
  },

  breakdownAccent: {
    color: '#6D5DFB',
    fontSize: 12,
    fontWeight: '800',
  },

  teamCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
  },

  teamStatsRow: {
    flexDirection: 'row',
  },

  miniStat: {
    flex: 1,
    alignItems: 'center',
  },

  miniStatLabel: {
    color: '#98A2B3',
    fontSize: 8,
  },

  miniStatValue: {
    color: '#101D48',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 3,
  },

  miniStatDanger: {
    color: '#D92D20',
  },

  miniStatWarning: {
    color: '#B54708',
  },

  teamMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
  },

  teamMemberRowLast: {
    borderBottomWidth: 0,
  },

  teamMemberInfo: {
    flex: 1,
  },

  teamMemberName: {
    color: '#101828',
    fontSize: 11,
    fontWeight: '800',
  },

  teamMemberShift: {
    color: '#667085',
    fontSize: 8,
    marginTop: 2,
  },

  statusPill: {
    backgroundColor: '#E8F8EF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  statusPillDanger: {
    backgroundColor: '#FDECEC',
  },

  statusPillWarning: {
    backgroundColor: '#FFF4E5',
  },

  statusPillText: {
    color: '#168455',
    fontSize: 7,
    fontWeight: '800',
  },

  statusPillTextDanger: {
    color: '#D92D20',
  },

  statusPillTextWarning: {
    color: '#B54708',
  },

  moreTeamText: {
    color: '#667085',
    fontSize: 8,
    textAlign: 'center',
    marginTop: 9,
  },

  allocationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
  },

  allocationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  cardLabel: {
    color: '#98A2B3',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  allocationValue: {
    color: '#101D48',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 4,
  },

  allocationRight: {
    alignItems: 'flex-end',
  },

  allocationPercent: {
    color: '#2436B2',
    fontSize: 19,
    fontWeight: '800',
  },

  allocationPercentLabel: {
    color: '#98A2B3',
    fontSize: 7,
    marginTop: 2,
  },

  inlineButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
  },

  secondaryButton: {
    flex: 1,
    backgroundColor: '#EEF1FF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },

  secondaryButtonText: {
    color: '#2436B2',
    fontSize: 9,
    fontWeight: '800',
  },

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  actionButton: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    minHeight: 92,
  },

  actionTitle: {
    color: '#101828',
    fontSize: 11,
    fontWeight: '800',
  },

  actionDetail: {
    color: '#667085',
    fontSize: 8,
    marginTop: 4,
  },

  actionArrow: {
    color: '#2436B2',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 'auto',
  },

  noteCard: {
    backgroundColor: '#EEF1FF',
    borderRadius: 14,
    padding: 13,
    marginTop: 20,
  },

  noteTitle: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },

  noteText: {
    color: '#475467',
    fontSize: 8,
    lineHeight: 13,
    marginTop: 4,
  },
});
