import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  buildEmployeePlans,
  buildTeamTaskPlans,
  calculateLabourPosition,
  formatClock,
  formatMinutes,
  formatNightMinute,
  formatSignedMinutes,
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
  aisleSkills?: Record<string, number>;
};

type NightLoad = {
  day: string;
  dateKey?: string;
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

function employeeName(
  employees: Employee[],
  employeeId: string
) {
  return (
    employees.find(
      (employee) => employee.id === employeeId
    )?.name || 'Team member'
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

export default function TeamPlanScreen() {
  const nightContext = useMemo(
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

  const [allocations, setAllocations] =
    useState<PlanningAllocation[]>([]);

  const [load, setLoad] =
    useState<NightLoad | null>(null);

  const [loadArrival, setLoadArrival] =
    useState<LoadArrivalRecord | null>(null);

  const [loading, setLoading] =
    useState(true);

  const formattedDate =
    nightfillDate.toLocaleDateString(
      'en-AU',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }
    );

  async function loadData() {
    try {
      setLoading(true);

      const [
        storedEmployees,
        tonightRoster,
        tonightAllocations,
        tonightLoad,
        tonightArrival,
      ] = await Promise.all([
        readStorage<Employee[]>(
          'groceryEmployees',
          []
        ),
        readNightValue<PlanningRosterEntry[]>(
          NIGHTFILL_STORAGE.roster,
          dateKey,
          dayName
        ),
        readNightValue<PlanningAllocation[]>(
          NIGHTFILL_STORAGE.allocations,
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
      ]);

      setEmployees(storedEmployees);
      setRoster(tonightRoster || []);
      setAllocations(tonightAllocations || []);
      setLoad(tonightLoad || null);
      setLoadArrival(tonightArrival || null);
    } catch (error) {
      console.log(
        'LOAD TEAM PLAN ERROR:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const arrivalTime =
    loadArrival?.arrived
      ? loadArrival.actualTime
      : null;

  const employeePlans =
    useMemo(
      () =>
        buildEmployeePlans(
          roster,
          allocations,
          arrivalTime
        ),
      [roster, allocations, arrivalTime]
    );

  const teamTaskPlans =
    useMemo(
      () =>
        buildTeamTaskPlans(
          employeePlans
        ),
      [employeePlans]
    );

  const requiredMinutes =
    load?.totalRequiredMinutes || 0;

  const labourPosition =
    useMemo(
      () =>
        calculateLabourPosition(
          roster,
          requiredMinutes,
          arrivalTime
        ),
      [roster, requiredMinutes, arrivalTime]
    );

  const totalAllocatedMinutes =
    allocations.reduce(
      (total, allocation) =>
        total + Math.max(allocation.minutes || 0, 0),
      0
    );

  const totalRemainingMinutes =
    employeePlans.reduce(
      (total, plan) =>
        total + plan.remainingMinutes,
      0
    );

  const totalOverrunMinutes =
    employeePlans.reduce(
      (total, plan) =>
        total + plan.overrunMinutes,
      0
    );

  const activePlannedEmployees =
    employeePlans.filter(
      (plan) => plan.allocatedMinutes > 0
    );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Building team plan...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
        >
          <Text style={styles.back}>
            ‹ Allocation
          </Text>
        </TouchableOpacity>

        <Text style={styles.headerSmall}>
          FINAL MANAGER PLAN
        </Text>

        <Text style={styles.title}>
          Team Plan
        </Text>

        <Text style={styles.subtitle}>
          {formattedDate} · {dateKey}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View
          style={[
            styles.arrivalCard,
            loadArrival?.arrived
              ? styles.arrivalReady
              : styles.arrivalWaiting,
          ]}
        >
          <View>
            <Text style={styles.arrivalLabel}>
              LOAD TIMING
            </Text>

            <Text
              style={
                loadArrival?.arrived
                  ? styles.arrivalReadyText
                  : styles.arrivalWaitingText
              }
            >
              {loadArrival?.arrived
                ? `Actual ${formatClock(
                    loadArrival.actualTime
                  )}`
                : 'Arrival not recorded'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              router.push('/load-arrival')
            }
          >
            <Text style={styles.manageText}>
              Manage
            </Text>
          </TouchableOpacity>
        </View>

        {!loadArrival?.arrived && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>
              Provisional timeline
            </Text>
            <Text style={styles.warningText}>
              Actual load arrival has not been recorded. The plan currently starts each employee from their rostered shift start.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Plan Position
        </Text>

        <View style={styles.summaryCard}>
          <SummaryRow
            label="Load required"
            value={formatMinutes(requiredMinutes)}
          />

          <SummaryRow
            label={
              loadArrival?.arrived
                ? 'Available after arrival'
                : 'Available roster labour'
            }
            value={formatMinutes(
              labourPosition.postArrivalMinutes
            )}
            tone="primary"
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
            label="Manager allocated"
            value={formatMinutes(
              totalAllocatedMinutes
            )}
          />

          <SummaryRow
            label="Staff time left"
            value={formatMinutes(
              totalRemainingMinutes
            )}
            tone="good"
          />

          <View style={styles.divider} />

          <SummaryRow
            label={
              labourPosition.differenceMinutes < 0
                ? 'REAL SHORTAGE'
                : 'REAL SURPLUS'
            }
            value={formatSignedMinutes(
              labourPosition.differenceMinutes
            )}
            tone={
              labourPosition.differenceMinutes < 0
                ? 'danger'
                : 'good'
            }
          />
        </View>

        {totalOverrunMinutes > 0 && (
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>
              Plan exceeds rostered load time
            </Text>
            <Text style={styles.dangerText}>
              Final allocations run {formatMinutes(
                totalOverrunMinutes
              )} beyond available employee time. Return to Allocation and adjust the plan.
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitleNoMargin}>
              Team Task Timeline
            </Text>
            <Text style={styles.helperText}>
              Labour time and elapsed clock time are shown separately.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {teamTaskPlans.length}
            </Text>
          </View>
        </View>

        {teamTaskPlans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No final allocation yet
            </Text>
            <Text style={styles.emptyText}>
              Open Staff Allocation, review the smart suggestions, make any manager edits, then save the final allocation.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                router.push('/allocation')
              }
            >
              <Text style={styles.primaryButtonText}>
                Open Staff Allocation
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          teamTaskPlans.map((task) => {
            const names = task.employeeIds.map(
              (employeeId) =>
                employeeName(
                  employees,
                  employeeId
                )
            );

            return (
              <View
                key={task.taskName}
                style={styles.teamTaskCard}
              >
                <View style={styles.teamTaskTop}>
                  <View style={styles.teamTaskInfo}>
                    <Text style={styles.teamTaskName}>
                      {task.taskName}
                    </Text>
                    <Text style={styles.teamNames}>
                      {names.join(' · ')}
                    </Text>
                  </View>

                  <View style={styles.staffBadge}>
                    <Text style={styles.staffBadgeText}>
                      {task.staffCount} staff
                    </Text>
                  </View>
                </View>

                <View style={styles.timelineBox}>
                  <Text style={styles.timelineClock}>
                    {formatNightMinute(
                      task.plannedStartMinute
                    )}
                    {'  →  '}
                    {formatNightMinute(
                      task.plannedFinishMinute
                    )}
                  </Text>

                  <Text style={styles.timelineMeta}>
                    {formatMinutes(
                      task.allocatedLabourMinutes
                    )} labour · {formatMinutes(
                      task.elapsedMinutes
                    )} elapsed
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitleNoMargin}>
              Employee Plans
            </Text>
            <Text style={styles.helperText}>
              Each employee follows their own sequential task plan.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {activePlannedEmployees.length}
            </Text>
          </View>
        </View>

        {activePlannedEmployees.map((plan) => {
          const name = employeeName(
            employees,
            plan.employeeId
          );

          const rosterEntry = roster.find(
            (entry) =>
              entry.employeeId === plan.employeeId
          );

          return (
            <View
              key={plan.employeeId}
              style={styles.employeeCard}
            >
              <View style={styles.employeeHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {initials(name)}
                  </Text>
                </View>

                <View style={styles.employeeInfo}>
                  <Text style={styles.employeeName}>
                    {name}
                  </Text>
                  <Text style={styles.employeeShift}>
                    {rosterEntry?.startTime &&
                    rosterEntry?.finishTime
                      ? `${formatClock(
                          rosterEntry.startTime
                        )} → ${formatClock(
                          rosterEntry.finishTime
                        )}`
                      : `${formatMinutes(
                          plan.fullShiftMinutes
                        )} rostered`}
                  </Text>
                </View>

                <Text
                  style={
                    plan.overrunMinutes > 0
                      ? styles.employeeOverrun
                      : styles.employeeReady
                  }
                >
                  {plan.overrunMinutes > 0
                    ? `+${formatMinutes(
                        plan.overrunMinutes
                      )}`
                    : 'READY'}
                </Text>
              </View>

              <View style={styles.employeeStats}>
                <StatBox
                  label="Load start"
                  value={formatNightMinute(
                    plan.loadWorkStartMinute
                  )}
                />
                <StatBox
                  label="Available"
                  value={formatMinutes(
                    plan.availableAfterLoadMinutes
                  )}
                />
                <StatBox
                  label="Allocated"
                  value={formatMinutes(
                    plan.allocatedMinutes
                  )}
                />
                <StatBox
                  label="Remaining"
                  value={formatMinutes(
                    plan.remainingMinutes
                  )}
                />
              </View>

              {plan.tasks.map((task, index) => (
                <View
                  key={`${task.taskName}-${index}`}
                  style={styles.employeeTaskRow}
                >
                  <View style={styles.taskNumber}>
                    <Text style={styles.taskNumberText}>
                      {index + 1}
                    </Text>
                  </View>

                  <View style={styles.employeeTaskInfo}>
                    <Text style={styles.employeeTaskName}>
                      {task.taskName}
                    </Text>
                    <Text style={styles.employeeTaskTime}>
                      {formatNightMinute(
                        task.plannedStartMinute
                      )} → {formatNightMinute(
                        task.plannedFinishMinute
                      )}
                    </Text>
                  </View>

                  <Text style={styles.employeeTaskDuration}>
                    {formatMinutes(task.minutes)}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              router.push('/allocation')
            }
          >
            <Text style={styles.secondaryButtonText}>
              Edit Allocation
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() =>
              router.push('/live-progress')
            }
            disabled={
              allocations.length === 0
            }
          >
            <Text style={styles.primaryActionText}>
              Start Live Progress →
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
    | 'warning'
    | 'danger';
}) {
  let valueStyle = styles.summaryValue;

  if (tone === 'primary') {
    valueStyle = styles.summaryPrimary;
  }

  if (tone === 'good') {
    valueStyle = styles.summaryGood;
  }

  if (tone === 'warning') {
    valueStyle = styles.summaryWarning;
  }

  if (tone === 'danger') {
    valueStyle = styles.summaryDanger;
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

function StatBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>
        {label}
      </Text>
      <Text style={styles.statValue}>
        {value}
      </Text>
    </View>
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
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 25,
  },
  back: {
    color: '#D5DBED',
    fontSize: 14,
    marginBottom: 13,
  },
  headerSmall: {
    color: '#AEB9DD',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
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
    marginTop: 4,
  },
  content: {
    padding: 16,
    paddingBottom: 55,
  },
  arrivalCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arrivalReady: {
    backgroundColor: '#E8F8EF',
  },
  arrivalWaiting: {
    backgroundColor: '#FFF4E5',
  },
  arrivalLabel: {
    color: '#667085',
    fontSize: 8,
    fontWeight: '800',
  },
  arrivalReadyText: {
    color: '#168455',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  arrivalWaitingText: {
    color: '#B54708',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  manageText: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },
  warningCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  warningTitle: {
    color: '#B54708',
    fontSize: 11,
    fontWeight: '800',
  },
  warningText: {
    color: '#8A5A19',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  dangerCard: {
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    padding: 12,
    marginTop: 9,
  },
  dangerTitle: {
    color: '#D92D20',
    fontSize: 11,
    fontWeight: '800',
  },
  dangerText: {
    color: '#912018',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 9,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 9,
  },
  sectionTitleNoMargin: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
  },
  helperText: {
    color: '#667085',
    fontSize: 9,
    marginTop: 3,
    maxWidth: 285,
  },
  countBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#E9ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#2436B2',
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: {
    color: '#667085',
    fontSize: 10,
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
  summaryWarning: {
    color: '#B54708',
    fontSize: 13,
    fontWeight: '800',
  },
  summaryDanger: {
    color: '#D92D20',
    fontSize: 14,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#EAECF0',
    marginVertical: 5,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  emptyTitle: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#2436B2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  teamTaskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  teamTaskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  teamTaskInfo: {
    flex: 1,
    paddingRight: 10,
  },
  teamTaskName: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },
  teamNames: {
    color: '#667085',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  staffBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  staffBadgeText: {
    color: '#2436B2',
    fontSize: 8,
    fontWeight: '800',
  },
  timelineBox: {
    backgroundColor: '#F4F6FA',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  timelineClock: {
    color: '#101D48',
    fontSize: 13,
    fontWeight: '800',
  },
  timelineMeta: {
    color: '#667085',
    fontSize: 9,
    marginTop: 3,
  },
  employeeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#101D48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  employeeInfo: {
    flex: 1,
    marginLeft: 10,
  },
  employeeName: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },
  employeeShift: {
    color: '#667085',
    fontSize: 9,
    marginTop: 3,
  },
  employeeReady: {
    color: '#168455',
    fontSize: 8,
    fontWeight: '800',
  },
  employeeOverrun: {
    color: '#D92D20',
    fontSize: 9,
    fontWeight: '800',
  },
  employeeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
    marginBottom: 10,
  },
  statBox: {
    width: '48.5%',
    backgroundColor: '#F4F6FA',
    borderRadius: 10,
    padding: 9,
  },
  statLabel: {
    color: '#98A2B3',
    fontSize: 8,
  },
  statValue: {
    color: '#101D48',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  employeeTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
    paddingVertical: 10,
  },
  taskNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskNumberText: {
    color: '#2436B2',
    fontSize: 9,
    fontWeight: '800',
  },
  employeeTaskInfo: {
    flex: 1,
    marginLeft: 9,
  },
  employeeTaskName: {
    color: '#101828',
    fontSize: 11,
    fontWeight: '800',
  },
  employeeTaskTime: {
    color: '#667085',
    fontSize: 8,
    marginTop: 2,
  },
  employeeTaskDuration: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D7DDFE',
  },
  secondaryButtonText: {
    color: '#2436B2',
    fontSize: 11,
    fontWeight: '800',
  },
  primaryActionButton: {
    flex: 1.3,
    backgroundColor: '#2436B2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});