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

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

type SavedNightReport = {
  day: string;

  dateKey?: string;

  displayDate?: string;

  savedAt: string;

  requiredMinutes: number;

  rosteredMinutes: number;

  totalCartons: number;

  splittingMinutes: number;

  completedTasks: number;

  totalTasks: number;

  aheadTasks: number;

  behindTasks: number;

  onTimeTasks: number;

  noTimingTasks: number;

  sickCount: number;

  lateCount: number;

  noShowCount: number;

  calledInCount: number;

  netPerformanceMinutes?: number;
};

type SavedNightReports = Record<
  string,
  SavedNightReport
>;

/*
|--------------------------------------------------------------------------
| FORMAT TIME
|--------------------------------------------------------------------------
*/

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

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatSignedMinutes(
  minutes: number
) {
  if (minutes > 0) {
    return `+${formatMinutes(
      minutes
    )}`;
  }

  if (minutes < 0) {
    return `-${formatMinutes(
      Math.abs(
        minutes
      )
    )}`;
  }

  return '0m';
}

/*
|--------------------------------------------------------------------------
| DATE FORMAT
|--------------------------------------------------------------------------
*/

function formatSavedDate(
  report: SavedNightReport
) {
  if (report.displayDate) {
    return report.displayDate;
  }

  if (report.savedAt) {
    const date =
      new Date(
        report.savedAt
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return date.toLocaleDateString(
        'en-AU',
        {
          weekday:
            'long',

          day:
            'numeric',

          month:
            'short',

          year:
            'numeric',
        }
      );
    }
  }

  return report.day;
}

/*
|--------------------------------------------------------------------------
| SCREEN
|--------------------------------------------------------------------------
*/

export default function HistoryScreen() {
  const [
    reports,
    setReports,
  ] =
    useState<SavedNightReport[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    expandedKey,
    setExpandedKey,
  ] =
    useState<string | null>(
      null
    );

  /*
  |--------------------------------------------------------------------------
  | LOAD HISTORY
  |--------------------------------------------------------------------------
  */

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  async function loadHistory() {
    try {
      setLoading(
        true
      );

      const stored =
        await AsyncStorage.getItem(
          'groceryNightReports'
        );

      const parsed:
        SavedNightReports =
        stored
          ? JSON.parse(
              stored
            )
          : {};

      const history =
        Object.entries(
          parsed
        )
          .map(
            ([
              key,
              report,
            ]) => ({
              ...report,

              dateKey:
                report.dateKey ||
                key,
            })
          )
          .sort(
            (a, b) => {
              const aTime =
                new Date(
                  a.savedAt
                ).getTime();

              const bTime =
                new Date(
                  b.savedAt
                ).getTime();

              return (
                bTime -
                aTime
              );
            }
          );

      setReports(
        history
      );
    } catch (error) {
      console.log(
        'LOAD HISTORY ERROR:',
        error
      );

      setReports([]);
    } finally {
      setLoading(
        false
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | OVERALL SUMMARY
  |--------------------------------------------------------------------------
  */

  const summary =
    useMemo(() => {
      const nights =
        reports.length;

      const cartons =
        reports.reduce(
          (
            total,
            report
          ) =>
            total +
            (
              report.totalCartons ||
              0
            ),
          0
        );

      const completed =
        reports.reduce(
          (
            total,
            report
          ) =>
            total +
            (
              report.completedTasks ||
              0
            ),
          0
        );

      const tasks =
        reports.reduce(
          (
            total,
            report
          ) =>
            total +
            (
              report.totalTasks ||
              0
            ),
          0
        );

      const ahead =
        reports.reduce(
          (
            total,
            report
          ) =>
            total +
            (
              report.aheadTasks ||
              0
            ),
          0
        );

      const behind =
        reports.reduce(
          (
            total,
            report
          ) =>
            total +
            (
              report.behindTasks ||
              0
            ),
          0
        );

      return {
        nights,
        cartons,
        completed,
        tasks,
        ahead,
        behind,
      };
    }, [reports]);

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
          Loading Nightfill history...
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
          NIGHTFILL RECORDS
        </Text>

        <Text
          style={
            styles.title
          }
        >
          History
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Previous saved Nightfill reports
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
        {/* OVERVIEW */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Overview
        </Text>

        <View
          style={
            styles.overviewGrid
          }
        >
          <MetricCard
            label="Saved Nights"
            value={String(
              summary.nights
            )}
          />

          <MetricCard
            label="Total Cartons"
            value={String(
              summary.cartons
            )}
          />

          <MetricCard
            label="Tasks Complete"
            value={`${summary.completed}/${summary.tasks}`}
          />

          <MetricCard
            label="Ahead / Behind"
            value={`${summary.ahead} / ${summary.behind}`}
          />
        </View>

        {/* SAVED NIGHTS */}

        <Text
          style={
            styles.sectionTitle
          }
        >
          Saved Nights
        </Text>

        {reports.length ===
        0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyEmoji
              }
            >
              📊
            </Text>

            <Text
              style={
                styles.emptyTitle
              }
            >
              No Night Reports Yet
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Complete a Night Summary and press Save Night Report. It will appear here.
            </Text>
          </View>
        ) : (
          reports.map(
            (
              report,
              index
            ) => {
              const key =
                report.dateKey ||
                report.savedAt ||
                String(
                  index
                );

              const expanded =
                expandedKey ===
                key;

              const labourDifference =
                (
                  report.rosteredMinutes ||
                  0
                ) -
                (
                  report.requiredMinutes ||
                  0
                );

              const completionPercent =
                report.totalTasks >
                0
                  ? Math.round(
                      (
                        report.completedTasks /
                        report.totalTasks
                      ) *
                        100
                    )
                  : 0;

              return (
                <TouchableOpacity
                  key={
                    key
                  }
                  style={
                    styles.reportCard
                  }
                  activeOpacity={
                    0.8
                  }
                  onPress={() =>
                    setExpandedKey(
                      expanded
                        ? null
                        : key
                    )
                  }
                >
                  {/* REPORT HEADER */}

                  <View
                    style={
                      styles.reportHeader
                    }
                  >
                    <View
                      style={
                        styles.dateBox
                      }
                    >
                      <Text
                        style={
                          styles.dateNumber
                        }
                      >
                        {index +
                          1}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.reportTitleBox
                      }
                    >
                      <Text
                        style={
                          styles.reportDate
                        }
                      >
                        {formatSavedDate(
                          report
                        )}
                      </Text>

                      <Text
                        style={
                          styles.reportSubtext
                        }
                      >
                        {
                          report.totalCartons ||
                          0
                        }{' '}
                        cartons
                      </Text>
                    </View>

                    <View
                      style={
                        styles.completionBadge
                      }
                    >
                      <Text
                        style={
                          styles.completionValue
                        }
                      >
                        {
                          completionPercent
                        }
                        %
                      </Text>

                      <Text
                        style={
                          styles.completionLabel
                        }
                      >
                        DONE
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.expandArrow
                      }
                    >
                      {expanded
                        ? '⌃'
                        : '⌄'}
                    </Text>
                  </View>

                  {/* QUICK STATS */}

                  <View
                    style={
                      styles.quickStats
                    }
                  >
                    <View
                      style={
                        styles.quickStat
                      }
                    >
                      <Text
                        style={
                          styles.quickLabel
                        }
                      >
                        Required
                      </Text>

                      <Text
                        style={
                          styles.quickValue
                        }
                      >
                        {formatMinutes(
                          report.requiredMinutes ||
                            0
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.quickDivider
                      }
                    />

                    <View
                      style={
                        styles.quickStat
                      }
                    >
                      <Text
                        style={
                          styles.quickLabel
                        }
                      >
                        Rostered
                      </Text>

                      <Text
                        style={
                          styles.quickValue
                        }
                      >
                        {formatMinutes(
                          report.rosteredMinutes ||
                            0
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.quickDivider
                      }
                    />

                    <View
                      style={
                        styles.quickStat
                      }
                    >
                      <Text
                        style={
                          styles.quickLabel
                        }
                      >
                        Difference
                      </Text>

                      <Text
                        style={[
                          styles.quickValue,

                          labourDifference <
                            0
                            ? styles.dangerText
                            : styles.goodText,
                        ]}
                      >
                        {formatSignedMinutes(
                          labourDifference
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* EXPANDED */}

                  {expanded && (
                    <View
                      style={
                        styles.expandedSection
                      }
                    >
                      <Text
                        style={
                          styles.detailSectionTitle
                        }
                      >
                        Load
                      </Text>

                      <DetailRow
                        label="Cartons"
                        value={String(
                          report.totalCartons ||
                            0
                        )}
                      />

                      <DetailRow
                        label="Splitting"
                        value={formatMinutes(
                          report.splittingMinutes ||
                            0
                        )}
                      />

                      <DetailRow
                        label="Tasks"
                        value={`${report.completedTasks || 0}/${report.totalTasks || 0} complete`}
                      />

                      <Text
                        style={
                          styles.detailSectionTitle
                        }
                      >
                        Performance
                      </Text>

                      <DetailRow
                        label="Ahead"
                        value={String(
                          report.aheadTasks ||
                            0
                        )}
                        type="good"
                      />

                      <DetailRow
                        label="Behind"
                        value={String(
                          report.behindTasks ||
                            0
                        )}
                        type="danger"
                      />

                      <DetailRow
                        label="On Time"
                        value={String(
                          report.onTimeTasks ||
                            0
                        )}
                        type="good"
                      />

                      <DetailRow
                        label="No Timing"
                        value={String(
                          report.noTimingTasks ||
                            0
                        )}
                      />

                      <Text
                        style={
                          styles.detailSectionTitle
                        }
                      >
                        Attendance
                      </Text>

                      <DetailRow
                        label="Sick"
                        value={String(
                          report.sickCount ||
                            0
                        )}
                        type={
                          report.sickCount >
                          0
                            ? 'danger'
                            : undefined
                        }
                      />

                      <DetailRow
                        label="Late"
                        value={String(
                          report.lateCount ||
                            0
                        )}
                        type={
                          report.lateCount >
                          0
                            ? 'warning'
                            : undefined
                        }
                      />

                      <DetailRow
                        label="No Show"
                        value={String(
                          report.noShowCount ||
                            0
                        )}
                        type={
                          report.noShowCount >
                          0
                            ? 'danger'
                            : undefined
                        }
                      />

                      <DetailRow
                        label="Called In"
                        value={String(
                          report.calledInCount ||
                            0
                        )}
                        type={
                          report.calledInCount >
                          0
                            ? 'good'
                            : undefined
                        }
                      />

                      <Text
                        style={
                          styles.savedTime
                        }
                      >
                        Report saved{' '}
                        {new Date(
                          report.savedAt
                        ).toLocaleString(
                          'en-AU'
                        )}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }
          )
        )}
      </ScrollView>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| SMALL COMPONENTS
|--------------------------------------------------------------------------
*/

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.metricCard
      }
    >
      <Text
        style={
          styles.metricLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.metricValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string;
  type?:
    | 'good'
    | 'danger'
    | 'warning';
}) {
  let valueStyle =
    styles.detailValue;

  if (
    type ===
    'good'
  ) {
    valueStyle =
      styles.detailGood;
  }

  if (
    type ===
    'danger'
  ) {
    valueStyle =
      styles.detailDanger;
  }

  if (
    type ===
    'warning'
  ) {
    valueStyle =
      styles.detailWarning;
  }

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
        style={
          valueStyle
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
      fontSize: 10,
      fontWeight:
        '700',
      letterSpacing: 1.5,
    },

    title: {
      color:
        '#FFFFFF',
      fontSize: 32,
      fontWeight:
        '800',
      marginTop: 5,
    },

    subtitle: {
      color:
        '#D5DBED',
      fontSize: 11,
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
      marginTop: 8,
      marginBottom: 10,
    },

    overviewGrid: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
      gap: 8,
      marginBottom: 14,
    },

    metricCard: {
      width:
        '48.5%',
      backgroundColor:
        '#FFFFFF',
      borderRadius: 13,
      padding: 13,
    },

    metricLabel: {
      color:
        '#98A2B3',
      fontSize: 8,
    },

    metricValue: {
      color:
        '#101D48',
      fontSize: 19,
      fontWeight:
        '800',
      marginTop: 5,
    },

    emptyCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      padding: 25,
      alignItems:
        'center',
    },

    emptyEmoji: {
      fontSize: 31,
    },

    emptyTitle: {
      color:
        '#101828',
      fontSize: 15,
      fontWeight:
        '800',
      marginTop: 8,
    },

    emptyText: {
      color:
        '#667085',
      fontSize: 10,
      lineHeight: 16,
      textAlign:
        'center',
      marginTop: 4,
    },

    reportCard: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },

    reportHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    dateBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor:
        '#E9ECFF',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    dateNumber: {
      color:
        '#2436B2',
      fontSize: 13,
      fontWeight:
        '800',
    },

    reportTitleBox: {
      flex: 1,
      marginLeft: 11,
    },

    reportDate: {
      color:
        '#101828',
      fontSize: 13,
      fontWeight:
        '800',
    },

    reportSubtext: {
      color:
        '#98A2B3',
      fontSize: 9,
      marginTop: 3,
    },

    completionBadge: {
      backgroundColor:
        '#E8F8EF',
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 6,
      alignItems:
        'center',
      marginRight: 8,
    },

    completionValue: {
      color:
        '#168455',
      fontSize: 12,
      fontWeight:
        '800',
    },

    completionLabel: {
      color:
        '#168455',
      fontSize: 6,
      fontWeight:
        '800',
      marginTop: 1,
    },

    expandArrow: {
      color:
        '#98A2B3',
      fontSize: 17,
    },

    quickStats: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginTop: 13,
      backgroundColor:
        '#F8F9FB',
      borderRadius: 11,
      paddingVertical: 10,
    },

    quickStat: {
      flex: 1,
      alignItems:
        'center',
    },

    quickDivider: {
      width: 1,
      height: 30,
      backgroundColor:
        '#EAECF0',
    },

    quickLabel: {
      color:
        '#98A2B3',
      fontSize: 7,
    },

    quickValue: {
      color:
        '#101D48',
      fontSize: 11,
      fontWeight:
        '800',
      marginTop: 3,
    },

    goodText: {
      color:
        '#168455',
    },

    dangerText: {
      color:
        '#D92D20',
    },

    expandedSection: {
      borderTopWidth: 1,
      borderTopColor:
        '#EAECF0',
      marginTop: 13,
      paddingTop: 10,
    },

    detailSectionTitle: {
      color:
        '#101828',
      fontSize: 10,
      fontWeight:
        '800',
      marginTop: 8,
      marginBottom: 6,
    },

    detailRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      alignItems:
        'center',
      paddingVertical: 5,
    },

    detailLabel: {
      color:
        '#667085',
      fontSize: 9,
    },

    detailValue: {
      color:
        '#101D48',
      fontSize: 9,
      fontWeight:
        '800',
    },

    detailGood: {
      color:
        '#168455',
      fontSize: 9,
      fontWeight:
        '800',
    },

    detailDanger: {
      color:
        '#D92D20',
      fontSize: 9,
      fontWeight:
        '800',
    },

    detailWarning: {
      color:
        '#B54708',
      fontSize: 9,
      fontWeight:
        '800',
    },

    savedTime: {
      color:
        '#98A2B3',
      fontSize: 7,
      marginTop: 12,
      textAlign:
        'right',
    },
  });