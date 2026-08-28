import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

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

export default function EmployeesScreen() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadEmployees() {
    try {
      setLoading(true);

      const storedEmployees = await AsyncStorage.getItem(
        'groceryEmployees'
      );

      if (storedEmployees) {
        const parsedEmployees: Employee[] =
          JSON.parse(storedEmployees);

        setEmployees(parsedEmployees);
      } else {
        setEmployees([]);
      }
    } catch (error) {
      console.log('LOAD EMPLOYEES ERROR:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadEmployees();
    }, [])
  );

  const partTimeCount = employees.filter(
    (employee) =>
      employee.employmentType === 'Part-time'
  ).length;

  const casualCount = employees.filter(
    (employee) =>
      employee.employmentType === 'Casual'
  ).length;

  const totalContractHours = employees.reduce(
    (total, employee) =>
      total +
      Number(employee.weeklyContractHours || 0),
    0
  );

  function openEmployee(employeeId: string) {
    router.push({
      pathname: '/employee/[id]',
      params: {
        id: employeeId,
      },
    });
  }

  function openAddEmployee() {
    router.push('/add-employee');
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}

      <View style={styles.header}>
        <Text style={styles.smallTitle}>
          GROCERY NIGHTFILL
        </Text>

        <Text style={styles.title}>
          Employees
        </Text>

        <Text style={styles.subtitle}>
          Grocery Nightfill team records
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* SUMMARY */}

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              Employees
            </Text>

            <Text style={styles.summaryValue}>
              {employees.length}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              Part-time
            </Text>

            <Text style={styles.summaryValue}>
              {partTimeCount}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              Casual
            </Text>

            <Text style={styles.summaryValue}>
              {casualCount}
            </Text>
          </View>
        </View>

        {/* TOTAL CONTRACT HOURS */}

        <View style={styles.contractSummary}>
          <View>
            <Text style={styles.contractSummaryLabel}>
              Weekly Contract Hours
            </Text>

            <Text style={styles.contractSummarySubtext}>
              Total part-time contracted hours
            </Text>
          </View>

          <Text style={styles.contractSummaryValue}>
            {totalContractHours.toFixed(1)}h
          </Text>
        </View>

        {/* ADD EMPLOYEE */}

        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddEmployee}
        >
          <Text style={styles.addButtonText}>
            ＋ Add Employee
          </Text>
        </TouchableOpacity>

        {/* SECTION */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Grocery Team
          </Text>

          <Text style={styles.employeeCount}>
            {employees.length}
          </Text>
        </View>

        {/* LOADING */}

        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              Loading employees...
            </Text>
          </View>
        ) : employees.length === 0 ? (
          /* EMPTY */

          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>
              👥
            </Text>

            <Text style={styles.emptyTitle}>
              No employees added yet
            </Text>

            <Text style={styles.emptyText}>
              Add your Grocery Nightfill team to start
              building rosters and aisle allocations.
            </Text>

            <TouchableOpacity
              style={styles.emptyButton}
              onPress={openAddEmployee}
            >
              <Text style={styles.emptyButtonText}>
                Add First Employee
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* EMPLOYEE CARDS */

          employees.map((employee) => {
            const initials = employee.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            const ratedAisles = Object.values(
              employee.aisleSkills || {}
            ).filter(
              (rating) => Number(rating) > 0
            ).length;

            return (
              <TouchableOpacity
                key={employee.id}
                style={styles.employeeCard}
                onPress={() =>
                  openEmployee(employee.id)
                }
              >
                {/* EMPLOYEE HEADER */}

                <View style={styles.employeeTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initials}
                    </Text>
                  </View>

                  <View style={styles.employeeMain}>
                    <View style={styles.nameRow}>
                      <Text style={styles.employeeName}>
                        {employee.name}
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
                            styles.typeBadgeText,
                            employee.employmentType ===
                              'Casual' &&
                              styles.casualBadgeText,
                          ]}
                        >
                          {employee.employmentType.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.employeeId}>
                      ID: {employee.employeeId}
                    </Text>
                  </View>

                  <Text style={styles.arrow}>
                    ›
                  </Text>
                </View>

                <View style={styles.divider} />

                {/* PART-TIME DETAILS */}

                {employee.employmentType ===
                'Part-time' ? (
                  <>
                    <View style={styles.infoRow}>
                      <View style={styles.infoBlock}>
                        <Text style={styles.infoLabel}>
                          Weekly Contract
                        </Text>

                        <Text style={styles.infoValue}>
                          {Number(
                            employee.weeklyContractHours ||
                              0
                          ).toFixed(1)}
                          h
                        </Text>
                      </View>

                      <View style={styles.infoBlock}>
                        <Text style={styles.infoLabel}>
                          Contract Days
                        </Text>

                        <Text style={styles.infoValue}>
                          {employee.contractDays
                            ?.length > 0
                            ? employee.contractDays
                                .map((day) =>
                                  day
                                    .slice(0, 3)
                                    .toUpperCase()
                                )
                                .join(' · ')
                            : 'None'}
                        </Text>
                      </View>
                    </View>

                    {employee.contractDays
                      ?.length > 0 && (
                      <>
                        <Text style={styles.smallLabel}>
                          Contracted Hours
                        </Text>

                        <View style={styles.dayHoursRow}>
                          {employee.contractDays.map(
                            (day) => (
                              <View
                                key={day}
                                style={
                                  styles.dayHoursBadge
                                }
                              >
                                <Text
                                  style={
                                    styles.dayHoursDay
                                  }
                                >
                                  {day
                                    .slice(0, 3)
                                    .toUpperCase()}
                                </Text>

                                <Text
                                  style={
                                    styles.dayHoursValue
                                  }
                                >
                                  {employee
                                    .dayHours?.[
                                    day
                                  ] || '0'}
                                  h
                                </Text>
                              </View>
                            )
                          )}
                        </View>
                      </>
                    )}
                  </>
                ) : (
                  <View style={styles.casualInfo}>
                    <Text
                      style={
                        styles.casualInfoText
                      }
                    >
                      No fixed contracted days or
                      weekly hours
                    </Text>
                  </View>
                )}

                {/* AVAILABILITY */}

                <Text style={styles.smallLabel}>
                  Availability
                </Text>

                <View style={styles.availableRow}>
                  {employee.availableDays
                    ?.length > 0 ? (
                    employee.availableDays.map(
                      (day) => (
                        <View
                          key={day}
                          style={
                            styles.availableBadge
                          }
                        >
                          <Text
                            style={
                              styles.availableText
                            }
                          >
                            {day
                              .slice(0, 3)
                              .toUpperCase()}
                          </Text>
                        </View>
                      )
                    )
                  ) : (
                    <Text style={styles.noneText}>
                      No availability selected
                    </Text>
                  )}
                </View>

                {/* AISLE SKILLS */}

                <View style={styles.skillInfo}>
                  <Text
                    style={
                      styles.skillInfoLabel
                    }
                  >
                    Grocery Aisles Rated
                  </Text>

                  <Text
                    style={
                      styles.skillInfoValue
                    }
                  >
                    {ratedAisles} / 14
                  </Text>
                </View>

                {/* NOTES */}

                {employee.notes ? (
                  <View style={styles.notesBox}>
                    <Text
                      style={styles.notesLabel}
                    >
                      Notes
                    </Text>

                    <Text
                      style={styles.notesText}
                    >
                      {employee.notes}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },

  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 26,
  },

  smallTitle: {
    color: '#AEB9DD',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 6,
  },

  subtitle: {
    color: '#D5DBED',
    fontSize: 13,
    marginTop: 5,
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
  },

  summaryLabel: {
    color: '#667085',
    fontSize: 10,
  },

  summaryValue: {
    color: '#101D48',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 7,
  },

  contractSummary: {
    backgroundColor: '#101D48',
    borderRadius: 16,
    padding: 17,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  contractSummaryLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  contractSummarySubtext: {
    color: '#AEB9DD',
    fontSize: 10,
    marginTop: 4,
  },

  contractSummaryValue: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },

  addButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
  },

  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  sectionHeader: {
    marginTop: 25,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 18,
    fontWeight: '800',
  },

  employeeCount: {
    color: '#2436B2',
    fontSize: 13,
    fontWeight: '800',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
  },

  emptyIcon: {
    fontSize: 40,
  },

  emptyTitle: {
    color: '#101828',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
  },

  emptyText: {
    color: '#667085',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 7,
  },

  emptyButton: {
    backgroundColor: '#E9ECFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 16,
  },

  emptyButtonText: {
    color: '#2436B2',
    fontSize: 12,
    fontWeight: '800',
  },

  employeeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 15,
    marginBottom: 12,
  },

  employeeTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#E9ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#2436B2',
    fontSize: 14,
    fontWeight: '800',
  },

  employeeMain: {
    flex: 1,
    marginLeft: 12,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  employeeName: {
    color: '#101828',
    fontSize: 15,
    fontWeight: '800',
  },

  employeeId: {
    color: '#667085',
    fontSize: 11,
    marginTop: 4,
  },

  typeBadge: {
    backgroundColor: '#E8F8EF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 7,
  },

  typeBadgeText: {
    color: '#168455',
    fontSize: 8,
    fontWeight: '800',
  },

  casualBadge: {
    backgroundColor: '#FFF3E5',
  },

  casualBadgeText: {
    color: '#D97706',
  },

  arrow: {
    color: '#98A2B3',
    fontSize: 28,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEF0F4',
    marginVertical: 14,
  },

  infoRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },

  infoBlock: {
    flex: 1,
  },

  infoLabel: {
    color: '#98A2B3',
    fontSize: 10,
    fontWeight: '700',
  },

  infoValue: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },

  smallLabel: {
    color: '#98A2B3',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 7,
  },

  dayHoursRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },

  dayHoursBadge: {
    backgroundColor: '#F2F4F7',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },

  dayHoursDay: {
    color: '#667085',
    fontSize: 8,
    fontWeight: '700',
  },

  dayHoursValue: {
    color: '#101D48',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },

  availableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },

  availableBadge: {
    backgroundColor: '#E9ECFF',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  availableText: {
    color: '#2436B2',
    fontSize: 9,
    fontWeight: '800',
  },

  noneText: {
    color: '#98A2B3',
    fontSize: 11,
  },

  casualInfo: {
    backgroundColor: '#FFF8ED',
    borderRadius: 10,
    padding: 11,
    marginBottom: 6,
  },

  casualInfoText: {
    color: '#B54708',
    fontSize: 11,
  },

  skillInfo: {
    backgroundColor: '#F7F8FC',
    borderRadius: 10,
    padding: 11,
    marginTop: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  skillInfoLabel: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '700',
  },

  skillInfoValue: {
    color: '#2436B2',
    fontSize: 14,
    fontWeight: '800',
  },

  notesBox: {
    backgroundColor: '#F7F8FC',
    borderRadius: 10,
    padding: 11,
    marginTop: 14,
  },

  notesLabel: {
    color: '#98A2B3',
    fontSize: 9,
    fontWeight: '700',
  },

  notesText: {
    color: '#475467',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
});