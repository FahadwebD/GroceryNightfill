import { useCallback, useState } from 'react';

import {
    router,
    useFocusEffect,
    useLocalSearchParams,
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

export default function EmployeeDetailsScreen() {
  const { id } = useLocalSearchParams();

  const [employee, setEmployee] =
    useState<Employee | null>(null);

  const [loading, setLoading] =
    useState(true);

  async function loadEmployee() {
    try {
      setLoading(true);

      const stored =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      const employees: Employee[] =
        stored ? JSON.parse(stored) : [];

      const foundEmployee =
        employees.find(
          (item) =>
            item.id === String(id)
        ) || null;

      setEmployee(foundEmployee);
    } catch (error) {
      console.log(
        'LOAD EMPLOYEE ERROR:',
        error
      );

      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadEmployee();
    }, [id])
  );

  function openAisleSkills() {
    if (!employee) return;

    router.push({
      pathname:
        '/employee/skills/[id]',
      params: {
        id: employee.id,
      },
    });
  }

  function openEditEmployee() {
    if (!employee) return;

    router.push({
      pathname:
        '/employee/edit/[id]',
      params: {
        id: employee.id,
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Loading employee...
        </Text>
      </View>
    );
  }

  if (!employee) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>
          Employee not found
        </Text>

        <TouchableOpacity
          style={styles.goBackButton}
          onPress={() =>
            router.back()
          }
        >
          <Text style={styles.goBackText}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = employee.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const skillEntries =
    Object.entries(
      employee.aisleSkills || {}
    );

  const ratedSkills =
    skillEntries.filter(
      ([, rating]) =>
        Number(rating) > 0
    );

  const averageSkill =
    ratedSkills.length > 0
      ? ratedSkills.reduce(
          (total, [, rating]) =>
            total +
            Number(rating),
          0
        ) / ratedSkills.length
      : 0;

  const strongestAisles =
    [...ratedSkills]
      .sort(
        (a, b) =>
          Number(b[1]) -
          Number(a[1])
      )
      .slice(0, 3);

  return (
    <View style={styles.container}>
      {/* HEADER */}

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.back()
          }
        >
          <Text style={styles.back}>
            ‹ Employees
          </Text>
        </TouchableOpacity>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {initials}
            </Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {employee.name}
            </Text>

            <Text style={styles.employeeId}>
              Employee ID:{' '}
              {employee.employeeId}
            </Text>

            <View
              style={[
                styles.typeBadge,

                employee.employmentType ===
                  'Casual' &&
                  styles.casualBadge,
              ]}
            >
              <Text
                style={[
                  styles.typeText,

                  employee.employmentType ===
                    'Casual' &&
                    styles.casualText,
                ]}
              >
                {employee.employmentType.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.content
        }
      >
        {/* CONTRACT */}

        {employee.employmentType ===
        'Part-time' ? (
          <>
            <View
              style={
                styles.contractSummary
              }
            >
              <View>
                <Text
                  style={
                    styles.contractLabel
                  }
                >
                  Weekly Contract
                </Text>

                <Text
                  style={
                    styles.contractSubtext
                  }
                >
                  Total contracted hours
                </Text>
              </View>

              <Text
                style={
                  styles.contractHours
                }
              >
                {Number(
                  employee.weeklyContractHours ||
                    0
                ).toFixed(1)}
                h
              </Text>
            </View>

            <Text
              style={styles.sectionTitle}
            >
              Contract Days & Hours
            </Text>

            {employee.contractDays
              ?.length > 0 ? (
              employee.contractDays.map(
                (day) => (
                  <View
                    key={day}
                    style={
                      styles.contractDay
                    }
                  >
                    <View>
                      <Text
                        style={
                          styles.dayName
                        }
                      >
                        {day}
                      </Text>

                      <Text
                        style={
                          styles.daySubtext
                        }
                      >
                        Contracted day
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.dayHours
                      }
                    >
                      {employee.dayHours?.[
                        day
                      ] || '0'}
                      h
                    </Text>
                  </View>
                )
              )
            ) : (
              <View
                style={styles.infoCard}
              >
                <Text
                  style={
                    styles.infoText
                  }
                >
                  No contract days saved.
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text
              style={styles.sectionTitle}
            >
              Employment
            </Text>

            <View
              style={styles.casualCard}
            >
              <Text
                style={
                  styles.casualTitle
                }
              >
                Casual Employee
              </Text>

              <Text
                style={
                  styles.casualDescription
                }
              >
                No fixed contracted days
                or weekly contracted
                hours.
              </Text>
            </View>
          </>
        )}

        {/* AVAILABILITY */}

        <Text style={styles.sectionTitle}>
          Availability
        </Text>

        <View
          style={
            styles.availabilityCard
          }
        >
          {employee.availableDays
            ?.length > 0 ? (
            <View
              style={
                styles.availabilityGrid
              }
            >
              {employee.availableDays.map(
                (day) => (
                  <View
                    key={day}
                    style={
                      styles.availableDay
                    }
                  >
                    <Text
                      style={
                        styles.availableDayText
                      }
                    >
                      {day
                        .slice(0, 3)
                        .toUpperCase()}
                    </Text>
                  </View>
                )
              )}
            </View>
          ) : (
            <Text style={styles.noneText}>
              No availability selected
            </Text>
          )}
        </View>

        {/* AISLE SKILLS */}

        <Text style={styles.sectionTitle}>
          Grocery Aisle Skills
        </Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={openAisleSkills}
        >
          <View
            style={
              styles.actionIconBox
            }
          >
            <Text
              style={styles.actionIcon}
            >
              📦
            </Text>
          </View>

          <View
            style={
              styles.actionContent
            }
          >
            <Text
              style={
                styles.actionTitle
              }
            >
              Manage Aisle Skills
            </Text>

            <Text
              style={
                styles.actionSubtitle
              }
            >
              Rate this employee for
              Grocery aisles 2 to 15.
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        {/* SKILL SUMMARY */}

        <View
          style={
            styles.skillSummaryRow
          }
        >
          <View
            style={
              styles.skillSummaryCard
            }
          >
            <Text
              style={
                styles.skillSummaryLabel
              }
            >
              Rated Aisles
            </Text>

            <Text
              style={
                styles.skillSummaryValue
              }
            >
              {ratedSkills.length} / 14
            </Text>
          </View>

          <View
            style={
              styles.skillSummaryCard
            }
          >
            <Text
              style={
                styles.skillSummaryLabel
              }
            >
              Avg. Skill
            </Text>

            <Text
              style={
                styles.skillSummaryValue
              }
            >
              {averageSkill > 0
                ? averageSkill.toFixed(1)
                : '—'}
            </Text>
          </View>
        </View>

        {/* STRONGEST AISLES */}

        {strongestAisles.length >
          0 && (
          <>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Strongest Aisles
            </Text>

            <View
              style={
                styles.strongestCard
              }
            >
              {strongestAisles.map(
                ([aisle, rating]) => (
                  <View
                    key={aisle}
                    style={
                      styles.strongestRow
                    }
                  >
                    <Text
                      style={
                        styles.strongestAisle
                      }
                    >
                      {aisle}
                    </Text>

                    <View
                      style={
                        styles.skillBadge
                      }
                    >
                      <Text
                        style={
                          styles.skillBadgeText
                        }
                      >
                        {rating}/5
                      </Text>
                    </View>
                  </View>
                )
              )}
            </View>
          </>
        )}

        {/* PERFORMANCE */}

        <Text style={styles.sectionTitle}>
          Performance
        </Text>

        <View
          style={
            styles.performanceRow
          }
        >
          <View
            style={
              styles.performanceCard
            }
          >
            <Text
              style={
                styles.performanceLabel
              }
            >
              Aisles Completed
            </Text>

            <Text
              style={
                styles.performanceValue
              }
            >
              0
            </Text>
          </View>

          <View
            style={
              styles.performanceCard
            }
          >
            <Text
              style={
                styles.performanceLabel
              }
            >
              Avg. Difference
            </Text>

            <Text
              style={
                styles.performanceValue
              }
            >
              —
            </Text>
          </View>
        </View>

        {/* NOTES */}

        <Text style={styles.sectionTitle}>
          Notes
        </Text>

        <View style={styles.notesCard}>
          <Text style={styles.notesText}>
            {employee.notes
              ? employee.notes
              : 'No notes added.'}
          </Text>
        </View>

        {/* EDIT */}

        <TouchableOpacity
          style={styles.editButton}
          onPress={openEditEmployee}
        >
          <Text
            style={
              styles.editButtonText
            }
          >
            Edit Employee
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },

  loadingText: {
    color: '#667085',
    fontSize: 14,
  },

  notFoundTitle: {
    color: '#101828',
    fontSize: 20,
    fontWeight: '800',
  },

  goBackButton: {
    backgroundColor: '#2436B2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
  },

  goBackText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 27,
  },

  back: {
    color: '#D5DBED',
    fontSize: 14,
    marginBottom: 20,
  },

  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#E9ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#2436B2',
    fontSize: 21,
    fontWeight: '800',
  },

  profileInfo: {
    flex: 1,
    marginLeft: 15,
  },

  name: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },

  employeeId: {
    color: '#D5DBED',
    fontSize: 12,
    marginTop: 4,
  },

  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DDF7E9',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
  },

  typeText: {
    color: '#168455',
    fontSize: 9,
    fontWeight: '800',
  },

  casualBadge: {
    backgroundColor: '#FFF3E5',
  },

  casualText: {
    color: '#D97706',
  },

  content: {
    padding: 18,
    paddingBottom: 55,
  },

  contractSummary: {
    backgroundColor: '#101D48',
    borderRadius: 17,
    padding: 18,
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
  },

  contractLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  contractSubtext: {
    color: '#AEB9DD',
    fontSize: 10,
    marginTop: 4,
  },

  contractHours: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 24,
    marginBottom: 10,
  },

  contractDay: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 15,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  dayName: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '700',
  },

  daySubtext: {
    color: '#98A2B3',
    fontSize: 10,
    marginTop: 3,
  },

  dayHours: {
    color: '#2436B2',
    fontSize: 17,
    fontWeight: '800',
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 15,
  },

  infoText: {
    color: '#667085',
    fontSize: 12,
  },

  casualCard: {
    backgroundColor: '#FFF8ED',
    borderRadius: 15,
    padding: 16,
  },

  casualTitle: {
    color: '#B54708',
    fontSize: 14,
    fontWeight: '800',
  },

  casualDescription: {
    color: '#B54708',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  availabilityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
  },

  availabilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  availableDay: {
    backgroundColor: '#E9ECFF',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  availableDayText: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },

  noneText: {
    color: '#98A2B3',
    fontSize: 12,
  },

  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  actionIconBox: {
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: '#E9ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionIcon: {
    fontSize: 21,
  },

  actionContent: {
    flex: 1,
    marginLeft: 12,
  },

  actionTitle: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '700',
  },

  actionSubtitle: {
    color: '#667085',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  arrow: {
    color: '#98A2B3',
    fontSize: 27,
  },

  skillSummaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },

  skillSummaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 15,
  },

  skillSummaryLabel: {
    color: '#98A2B3',
    fontSize: 10,
  },

  skillSummaryValue: {
    color: '#101D48',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 7,
  },

  strongestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
  },

  strongestRow: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F4',
  },

  strongestAisle: {
    color: '#101828',
    fontSize: 13,
    fontWeight: '700',
  },

  skillBadge: {
    backgroundColor: '#E9ECFF',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  skillBadgeText: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },

  performanceRow: {
    flexDirection: 'row',
    gap: 10,
  },

  performanceCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 15,
  },

  performanceLabel: {
    color: '#98A2B3',
    fontSize: 10,
  },

  performanceValue: {
    color: '#101D48',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8,
  },

  notesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
  },

  notesText: {
    color: '#475467',
    fontSize: 12,
    lineHeight: 18,
  },

  editButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 25,
  },

  editButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});