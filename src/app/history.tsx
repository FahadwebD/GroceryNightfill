import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { formatMinutes, formatSignedMinutes } from '../utils/nightfillPlanning';
import {
  getDatedEntries,
  NIGHTFILL_STORAGE,
  readStorage,
} from '../utils/nightfillStorage';

type TaskStatus = 'Not Started' | 'In Progress' | 'Complete';

type SavedTaskResult = {
  taskName: string;
  status: TaskStatus;
  staff?: {
    employeeId: string;
    name: string;
    allocatedMinutes: number;
  }[];
  requiredMinutes?: number;
  allocatedLabourMinutes?: number;
  plannedElapsedMinutes?: number | null;
  plannedStartMinute?: number | null;
  plannedFinishMinute?: number | null;
  actualStartedAt?: string | null;
  actualCompletedAt?: string | null;
  startMode?: 'auto' | 'manual' | null;
  completionMode?: 'timer' | 'manual' | null;
  durationResult?: string;
  timelineResult?: string;
  timelineDifferenceMinutes?: number | null;
};

type SavedNightReport = {
  day: string;
  dateKey?: string;
  displayDate?: string;
  savedAt: string;

  requiredMinutes: number;
  rosteredMinutes: number;
  breakMinutes?: number;
  productiveRosterMinutes?: number;
  totalCartons: number;
  splittingMinutes: number;

  expectedArrivalTime?: string | null;
  actualArrivalTime?: string | null;
  arrivalDelayMinutes?: number | null;

  preLoadLabourMinutes?: number;
  postArrivalLabourMinutes?: number;
  realLabourDifferenceMinutes?: number;
  coveragePercent?: number;

  allocationMinutes?: number;
  allocationRows?: number;

  completedTasks: number;
  totalTasks: number;
  completionPercent?: number;

  aheadTasks: number;
  behindTasks: number;
  onTimeTasks: number;
  noTimingTasks: number;
  netPerformanceMinutes?: number;

  planAheadTasks?: number;
  planBehindTasks?: number;
  planOnTimeTasks?: number;
  finalPlanDifferenceMinutes?: number | null;

  sickCount: number;
  lateCount: number;
  noShowCount: number;
  calledInCount: number;

  nightCaptainPresent?: boolean;
  nightCaptainStatus?: string | null;
  nightCaptainStartTime?: string | null;
  nightCaptainFinishTime?: string | null;

  managerNotes?: string;
  taskResults?: SavedTaskResult[];
};

type HistoryReport = SavedNightReport & {
  dateKey: string;
};

type TaskTrend = {
  taskName: string;
  samples: number;
  behindCount: number;
  aheadCount: number;
  onTimeCount: number;
  netMinutes: number;
};

function completionPercent(report: SavedNightReport) {
  if (typeof report.completionPercent === 'number') {
    return Math.max(0, Math.min(100, Math.round(report.completionPercent)));
  }

  return report.totalTasks > 0
    ? Math.round((report.completedTasks / report.totalTasks) * 100)
    : 0;
}

function productiveMinutes(report: SavedNightReport) {
  if (typeof report.productiveRosterMinutes === 'number') {
    return Math.max(report.productiveRosterMinutes, 0);
  }

  return Math.max(
    (report.rosteredMinutes || 0) - (report.breakMinutes || 0),
    0
  );
}

function postArrivalMinutes(report: SavedNightReport) {
  if (typeof report.postArrivalLabourMinutes === 'number') {
    return Math.max(report.postArrivalLabourMinutes, 0);
  }

  return productiveMinutes(report);
}

function labourDifference(report: SavedNightReport) {
  if (typeof report.realLabourDifferenceMinutes === 'number') {
    return report.realLabourDifferenceMinutes;
  }

  return postArrivalMinutes(report) - (report.requiredMinutes || 0);
}

function coverage(report: SavedNightReport) {
  if (typeof report.coveragePercent === 'number') {
    return Math.max(0, Math.round(report.coveragePercent));
  }

  if ((report.requiredMinutes || 0) <= 0) return 100;

  return Math.round(
    (postArrivalMinutes(report) / report.requiredMinutes) * 100
  );
}

function formatClock(value?: string | null) {
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

  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatDate(report: HistoryReport) {
  if (report.displayDate) return report.displayDate;

  const parsed = new Date(`${report.dateKey}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  return report.day || report.dateKey;
}

function formatDelay(minutes?: number | null) {
  if (minutes === null || minutes === undefined) return 'Not recorded';
  if (minutes > 0) return `${formatMinutes(minutes)} late`;
  if (minutes < 0) return `${formatMinutes(Math.abs(minutes))} early`;
  return 'On time';
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function taskTrendLabel(trend: TaskTrend) {
  if (trend.behindCount > trend.aheadCount && trend.behindCount > trend.onTimeCount) {
    return 'Frequently behind plan';
  }
  if (trend.aheadCount > trend.behindCount && trend.aheadCount > trend.onTimeCount) {
    return 'Frequently ahead of plan';
  }
  return 'Mixed / on-plan results';
}

export default function HistoryScreen() {
  const [reports, setReports] = useState<HistoryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  async function loadHistory() {
    try {
      setLoading(true);

      const saved = await readStorage<Record<string, SavedNightReport>>(
        NIGHTFILL_STORAGE.reports,
        {}
      );

      const dated: HistoryReport[] = getDatedEntries(saved)
        .map(([dateKey, report]) => ({
          ...report,
          dateKey,
        }))
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

      setReports(dated);
    } catch (error) {
      console.log('LOAD HISTORY ERROR:', error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const analytics = useMemo(() => {
    const nights = reports.length;

    const totalCartons = reports.reduce(
      (total, report) => total + (report.totalCartons || 0),
      0
    );

    const totalRequired = reports.reduce(
      (total, report) => total + (report.requiredMinutes || 0),
      0
    );

    const totalProductive = reports.reduce(
      (total, report) => total + productiveMinutes(report),
      0
    );

    const totalBreaks = reports.reduce(
      (total, report) => total + (report.breakMinutes || 0),
      0
    );

    const completionValues = reports.map(completionPercent);

    const shortages = reports
      .map(labourDifference)
      .filter((value) => value < 0);

    const surpluses = reports
      .map(labourDifference)
      .filter((value) => value >= 0);

    const arrivalValues = reports
      .map((report) => report.arrivalDelayMinutes)
      .filter((value): value is number => typeof value === 'number');

    const lateArrivalValues = arrivalValues.filter((value) => value > 0);

    const sick = reports.reduce(
      (total, report) => total + (report.sickCount || 0),
      0
    );
    const late = reports.reduce(
      (total, report) => total + (report.lateCount || 0),
      0
    );
    const noShow = reports.reduce(
      (total, report) => total + (report.noShowCount || 0),
      0
    );
    const calledIn = reports.reduce(
      (total, report) => total + (report.calledInCount || 0),
      0
    );

    const completed = reports.reduce(
      (total, report) => total + (report.completedTasks || 0),
      0
    );
    const totalTasks = reports.reduce(
      (total, report) => total + (report.totalTasks || 0),
      0
    );

    const planAhead = reports.reduce(
      (total, report) => total + (report.planAheadTasks || report.aheadTasks || 0),
      0
    );
    const planBehind = reports.reduce(
      (total, report) => total + (report.planBehindTasks || report.behindTasks || 0),
      0
    );
    const planOnTime = reports.reduce(
      (total, report) => total + (report.planOnTimeTasks || report.onTimeTasks || 0),
      0
    );

    return {
      nights,
      averageCartons: nights > 0 ? Math.round(totalCartons / nights) : 0,
      averageRequiredMinutes: nights > 0 ? Math.round(totalRequired / nights) : 0,
      averageProductiveMinutes: nights > 0 ? Math.round(totalProductive / nights) : 0,
      averageBreakMinutes: nights > 0 ? Math.round(totalBreaks / nights) : 0,
      averageCompletion: Math.round(average(completionValues)),
      shortageNights: shortages.length,
      surplusNights: surpluses.length,
      totalShortageMinutes: Math.round(
        shortages.reduce((total, value) => total + Math.abs(value), 0)
      ),
      averageArrivalDelay: Math.round(average(arrivalValues)),
      lateLoadNights: lateArrivalValues.length,
      averageLateLoadMinutes: Math.round(average(lateArrivalValues)),
      sick,
      late,
      noShow,
      calledIn,
      completed,
      totalTasks,
      planAhead,
      planBehind,
      planOnTime,
    };
  }, [reports]);

  const taskTrends = useMemo(() => {
    const map = new Map<string, TaskTrend>();

    for (const report of reports) {
      for (const task of report.taskResults || []) {
        if (task.timelineDifferenceMinutes === null || task.timelineDifferenceMinutes === undefined) {
          continue;
        }

        const current = map.get(task.taskName) || {
          taskName: task.taskName,
          samples: 0,
          behindCount: 0,
          aheadCount: 0,
          onTimeCount: 0,
          netMinutes: 0,
        };

        current.samples += 1;
        current.netMinutes += task.timelineDifferenceMinutes;

        if (task.timelineDifferenceMinutes > 0) {
          current.aheadCount += 1;
        } else if (task.timelineDifferenceMinutes < 0) {
          current.behindCount += 1;
        } else {
          current.onTimeCount += 1;
        }

        map.set(task.taskName, current);
      }
    }

    return Array.from(map.values())
      .sort((a, b) => {
        if (b.behindCount !== a.behindCount) {
          return b.behindCount - a.behindCount;
        }
        return b.samples - a.samples;
      })
      .slice(0, 5);
  }, [reports]);

  const recent = reports.slice(0, 7);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading History…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>History & Analytics</Text>
        <Text style={styles.subtitle}>
          Dated Nightfill reports · labour, load, attendance and task trends
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {reports.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No dated nights saved yet</Text>
            <Text style={styles.emptyText}>
              Complete a Night Summary and save it to History. Only real YYYY-MM-DD reports appear here, so old weekday compatibility records cannot create duplicate nights.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Overview</Text>

            <View style={styles.grid}>
              <MetricCard
                label="Saved Nights"
                value={String(analytics.nights)}
                note="Dated reports"
              />
              <MetricCard
                label="Avg Cartons"
                value={String(analytics.averageCartons)}
                note="Per night"
              />
              <MetricCard
                label="Avg Completion"
                value={`${analytics.averageCompletion}%`}
                note={`${analytics.completed}/${analytics.totalTasks} tasks complete`}
              />
              <MetricCard
                label="Avg Load Delay"
                value={
                  analytics.averageArrivalDelay > 0
                    ? `+${formatMinutes(analytics.averageArrivalDelay)}`
                    : analytics.averageArrivalDelay < 0
                      ? `-${formatMinutes(Math.abs(analytics.averageArrivalDelay))}`
                      : '0m'
                }
                note={`${analytics.lateLoadNights} late-load nights`}
              />
            </View>

            <Text style={styles.sectionTitle}>Labour Position</Text>

            <View style={styles.darkCard}>
              <View style={styles.darkMetricRow}>
                <DarkMetric
                  label="Avg Required"
                  value={formatMinutes(analytics.averageRequiredMinutes)}
                />
                <DarkMetric
                  label="Avg Productive"
                  value={formatMinutes(analytics.averageProductiveMinutes)}
                />
                <DarkMetric
                  label="Avg Breaks"
                  value={formatMinutes(analytics.averageBreakMinutes)}
                />
              </View>

              <View style={styles.separator} />

              <View style={styles.darkMetricRow}>
                <DarkMetric
                  label="Short Nights"
                  value={String(analytics.shortageNights)}
                />
                <DarkMetric
                  label="Covered Nights"
                  value={String(analytics.surplusNights)}
                />
                <DarkMetric
                  label="Total Shortage"
                  value={formatMinutes(analytics.totalShortageMinutes)}
                />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Operational Signals</Text>

            <View style={styles.signalCard}>
              <SignalRow
                label="Late loads"
                value={`${analytics.lateLoadNights} nights`}
                note={
                  analytics.lateLoadNights > 0
                    ? `Average late load: ${formatMinutes(analytics.averageLateLoadMinutes)}`
                    : 'No late loads recorded'
                }
              />
              <SignalRow
                label="Attendance exceptions"
                value={String(
                  analytics.sick +
                    analytics.late +
                    analytics.noShow
                )}
                note={`Sick ${analytics.sick} · Late ${analytics.late} · No show ${analytics.noShow} · Called in ${analytics.calledIn}`}
              />
              <SignalRow
                label="Task plan results"
                value={`${analytics.planBehind} behind`}
                note={`${analytics.planAhead} ahead · ${analytics.planOnTime} on time`}
              />
            </View>

            {taskTrends.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Task Trend Watch</Text>
                <Text style={styles.sectionHint}>
                  Operational task trends only — not employee rankings.
                </Text>

                <View style={styles.taskTrendCard}>
                  {taskTrends.map((trend, index) => (
                    <View
                      key={trend.taskName}
                      style={[
                        styles.taskTrendRow,
                        index < taskTrends.length - 1 && styles.rowBorder,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskTrendName}>{trend.taskName}</Text>
                        <Text style={styles.taskTrendNote}>
                          {taskTrendLabel(trend)} · {trend.samples} completed samples
                        </Text>
                      </View>
                      <View style={styles.trendNumbers}>
                        <Text style={styles.behindText}>{trend.behindCount} B</Text>
                        <Text style={styles.aheadText}>{trend.aheadCount} A</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Last 7 Nights</Text>

            <View style={styles.trendCard}>
              {recent.map((report, index) => {
                const difference = labourDifference(report);
                const complete = completionPercent(report);

                return (
                  <View
                    key={report.dateKey}
                    style={[
                      styles.recentRow,
                      index < recent.length - 1 && styles.rowBorder,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentDate}>
                        {report.dateKey} · {report.day}
                      </Text>
                      <Text style={styles.recentMeta}>
                        {report.totalCartons || 0} cartons · {complete}% complete
                      </Text>
                    </View>
                    <Text
                      style={
                        difference < 0
                          ? styles.shortageText
                          : styles.surplusText
                      }
                    >
                      {formatSignedMinutes(difference)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Saved Nights</Text>

            {reports.map((report) => {
              const expanded = expandedKey === report.dateKey;
              const difference = labourDifference(report);
              const complete = completionPercent(report);
              const taskResults = report.taskResults || [];

              return (
                <View key={report.dateKey} style={styles.reportCard}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      setExpandedKey(expanded ? null : report.dateKey)
                    }
                  >
                    <View style={styles.reportHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportDate}>{formatDate(report)}</Text>
                        <Text style={styles.reportKey}>{report.dateKey}</Text>
                      </View>

                      <View
                        style={[
                          styles.positionBadge,
                          difference < 0
                            ? styles.shortBadge
                            : styles.coveredBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.positionBadgeText,
                            difference < 0
                              ? styles.shortBadgeText
                              : styles.coveredBadgeText,
                          ]}
                        >
                          {difference < 0 ? 'SHORT' : 'COVERED'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.reportStats}>
                      <MiniMetric label="Cartons" value={String(report.totalCartons || 0)} />
                      <MiniMetric label="Complete" value={`${complete}%`} />
                      <MiniMetric label="Coverage" value={`${coverage(report)}%`} />
                    </View>

                    <View style={styles.reportFooter}>
                      <Text style={styles.reportFooterText}>
                        Labour {formatSignedMinutes(difference)} · Load {formatDelay(report.arrivalDelayMinutes)}
                      </Text>
                      <Text style={styles.expandText}>{expanded ? 'Hide' : 'Details'}</Text>
                    </View>
                  </TouchableOpacity>

                  {expanded ? (
                    <View style={styles.expanded}>
                      <DetailSection title="Labour">
                        <DetailRow
                          label="Gross roster"
                          value={formatMinutes(report.rosteredMinutes || 0)}
                        />
                        <DetailRow
                          label="Reserved breaks"
                          value={formatMinutes(report.breakMinutes || 0)}
                        />
                        <DetailRow
                          label="Productive roster"
                          value={formatMinutes(productiveMinutes(report))}
                        />
                        <DetailRow
                          label="Labour before load"
                          value={formatMinutes(report.preLoadLabourMinutes || 0)}
                        />
                        <DetailRow
                          label="Available after arrival"
                          value={formatMinutes(postArrivalMinutes(report))}
                        />
                        <DetailRow
                          label="Load required"
                          value={formatMinutes(report.requiredMinutes || 0)}
                        />
                        <DetailRow
                          label="Real position"
                          value={formatSignedMinutes(difference)}
                          emphasis
                        />
                      </DetailSection>

                      <DetailSection title="Load & Arrival">
                        <DetailRow
                          label="Cartons"
                          value={String(report.totalCartons || 0)}
                        />
                        <DetailRow
                          label="Splitting"
                          value={formatMinutes(report.splittingMinutes || 0)}
                        />
                        <DetailRow
                          label="Expected"
                          value={formatClock(report.expectedArrivalTime)}
                        />
                        <DetailRow
                          label="Actual"
                          value={formatClock(report.actualArrivalTime)}
                        />
                        <DetailRow
                          label="Arrival result"
                          value={formatDelay(report.arrivalDelayMinutes)}
                        />
                      </DetailSection>

                      <DetailSection title="Attendance & Captain">
                        <DetailRow
                          label="Sick / Late / No Show"
                          value={`${report.sickCount || 0} / ${report.lateCount || 0} / ${report.noShowCount || 0}`}
                        />
                        <DetailRow
                          label="Called In"
                          value={String(report.calledInCount || 0)}
                        />
                        <DetailRow
                          label="Night Captain"
                          value={
                            report.nightCaptainPresent
                              ? report.nightCaptainStatus || 'Working'
                              : 'Not rostered'
                          }
                        />
                        {report.nightCaptainPresent ? (
                          <DetailRow
                            label="Captain shift"
                            value={`${formatClock(report.nightCaptainStartTime)} → ${formatClock(
                              report.nightCaptainFinishTime
                            )}`}
                          />
                        ) : null}
                      </DetailSection>

                      <DetailSection title="Tasks">
                        <DetailRow
                          label="Completed"
                          value={`${report.completedTasks || 0}/${report.totalTasks || 0}`}
                        />
                        <DetailRow
                          label="Ahead / On Time / Behind"
                          value={`${report.planAheadTasks || report.aheadTasks || 0} / ${
                            report.planOnTimeTasks || report.onTimeTasks || 0
                          } / ${report.planBehindTasks || report.behindTasks || 0}`}
                        />
                        {report.finalPlanDifferenceMinutes !== null &&
                        report.finalPlanDifferenceMinutes !== undefined ? (
                          <DetailRow
                            label="Final plan position"
                            value={formatSignedMinutes(report.finalPlanDifferenceMinutes)}
                          />
                        ) : null}
                      </DetailSection>

                      {taskResults.length > 0 ? (
                        <View style={styles.taskList}>
                          {taskResults.map((task) => (
                            <View key={task.taskName} style={styles.taskResultRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.taskResultName}>{task.taskName}</Text>
                                <Text style={styles.taskResultMeta}>
                                  {task.status} · {task.staff?.map((staff) => staff.name).join(', ') || 'No staff saved'}
                                </Text>
                              </View>
                              <Text
                                style={
                                  (task.timelineDifferenceMinutes || 0) < 0
                                    ? styles.behindText
                                    : styles.aheadText
                                }
                              >
                                {task.timelineDifferenceMinutes === null ||
                                task.timelineDifferenceMinutes === undefined
                                  ? '—'
                                  : formatSignedMinutes(task.timelineDifferenceMinutes)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {report.managerNotes?.trim() ? (
                        <View style={styles.notesCard}>
                          <Text style={styles.notesTitle}>Manager Notes</Text>
                          <Text style={styles.notesText}>{report.managerNotes.trim()}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricNote}>{note}</Text>
    </View>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.darkMetric}>
      <Text style={styles.darkMetricLabel}>{label}</Text>
      <Text style={styles.darkMetricValue}>{value}</Text>
    </View>
  );
}

function SignalRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <View style={styles.signalRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.signalLabel}>{label}</Text>
        <Text style={styles.signalNote}>{note}</Text>
      </View>
      <Text style={styles.signalValue}>{value}</Text>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DetailRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, emphasis && styles.detailValueStrong]}>
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
    backgroundColor: '#F4F6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: '#667085',
  },
  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 25,
  },
  eyebrow: {
    color: '#AEB9DD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 5,
  },
  subtitle: {
    color: '#D5DBED',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
  },
  emptyTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionHint: {
    color: '#667085',
    fontSize: 9,
    marginTop: -6,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 14,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
  },
  metricLabel: {
    color: '#667085',
    fontSize: 9,
    fontWeight: '700',
  },
  metricValue: {
    color: '#101828',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  metricNote: {
    color: '#98A2B3',
    fontSize: 8,
    marginTop: 4,
  },
  darkCard: {
    backgroundColor: '#101D48',
    borderRadius: 17,
    padding: 15,
    marginBottom: 14,
  },
  darkMetricRow: {
    flexDirection: 'row',
  },
  darkMetric: {
    flex: 1,
    alignItems: 'center',
  },
  darkMetricLabel: {
    color: '#AEB9DD',
    fontSize: 8,
  },
  darkMetricValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 5,
  },
  separator: {
    height: 1,
    backgroundColor: '#35426D',
    marginVertical: 14,
  },
  signalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  signalRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
  },
  signalLabel: {
    color: '#101828',
    fontSize: 11,
    fontWeight: '800',
  },
  signalNote: {
    color: '#667085',
    fontSize: 8,
    lineHeight: 12,
    marginTop: 3,
  },
  signalValue: {
    color: '#2436B2',
    fontSize: 13,
    fontWeight: '900',
  },
  taskTrendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  taskTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 61,
    gap: 10,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
  },
  taskTrendName: {
    color: '#101828',
    fontSize: 11,
    fontWeight: '800',
  },
  taskTrendNote: {
    color: '#667085',
    fontSize: 8,
    marginTop: 3,
  },
  trendNumbers: {
    flexDirection: 'row',
    gap: 8,
  },
  behindText: {
    color: '#D92D20',
    fontSize: 9,
    fontWeight: '800',
  },
  aheadText: {
    color: '#168455',
    fontSize: 9,
    fontWeight: '800',
  },
  trendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  recentRow: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentDate: {
    color: '#101828',
    fontSize: 10,
    fontWeight: '800',
  },
  recentMeta: {
    color: '#667085',
    fontSize: 8,
    marginTop: 3,
  },
  shortageText: {
    color: '#D92D20',
    fontSize: 11,
    fontWeight: '900',
  },
  surplusText: {
    color: '#168455',
    fontSize: 11,
    fontWeight: '900',
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportDate: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },
  reportKey: {
    color: '#98A2B3',
    fontSize: 8,
    marginTop: 3,
  },
  positionBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shortBadge: {
    backgroundColor: '#FDECEC',
  },
  coveredBadge: {
    backgroundColor: '#E8F8EF',
  },
  positionBadgeText: {
    fontSize: 7,
    fontWeight: '900',
  },
  shortBadgeText: {
    color: '#D92D20',
  },
  coveredBadgeText: {
    color: '#168455',
  },
  reportStats: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FC',
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 10,
  },
  miniMetric: {
    flex: 1,
    alignItems: 'center',
  },
  miniLabel: {
    color: '#98A2B3',
    fontSize: 7,
  },
  miniValue: {
    color: '#101828',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  reportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  reportFooterText: {
    color: '#667085',
    fontSize: 8,
  },
  expandText: {
    color: '#2436B2',
    fontSize: 9,
    fontWeight: '800',
  },
  expanded: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
    paddingTop: 12,
  },
  detailSection: {
    backgroundColor: '#F8F9FC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 9,
  },
  detailTitle: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 7,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  detailLabel: {
    color: '#667085',
    fontSize: 8,
    flex: 1,
  },
  detailValue: {
    color: '#344054',
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'right',
  },
  detailValueStrong: {
    color: '#101828',
    fontSize: 10,
    fontWeight: '900',
  },
  taskList: {
    borderRadius: 12,
    backgroundColor: '#FCFCFD',
    overflow: 'hidden',
    marginBottom: 9,
  },
  taskResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
  },
  taskResultName: {
    color: '#101828',
    fontSize: 9,
    fontWeight: '800',
  },
  taskResultMeta: {
    color: '#667085',
    fontSize: 7,
    marginTop: 3,
  },
  notesCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    padding: 12,
  },
  notesTitle: {
    color: '#B54708',
    fontSize: 9,
    fontWeight: '900',
  },
  notesText: {
    color: '#6B4E24',
    fontSize: 8,
    lineHeight: 13,
    marginTop: 4,
  },
});
