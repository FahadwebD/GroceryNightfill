import { useCallback, useState } from 'react';

import {
    router,
    useFocusEffect,
    useLocalSearchParams,
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

const weekDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function EditEmployeeScreen() {
  const { id } = useLocalSearchParams();

  const [employee, setEmployee] =
    useState<Employee | null>(null);

  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [employmentType, setEmploymentType] =
    useState('Part-time');

  const [contractDays, setContractDays] =
    useState<string[]>([]);

  const [availableDays, setAvailableDays] =
    useState<string[]>([]);

  const [dayHours, setDayHours] =
    useState<Record<string, string>>({
      Monday: '',
      Tuesday: '',
      Wednesday: '',
      Thursday: '',
      Friday: '',
      Saturday: '',
      Sunday: '',
    });

  const [notes, setNotes] = useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  async function loadEmployee() {
    try {
      setLoading(true);

      const stored =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      const employees: Employee[] =
        stored ? JSON.parse(stored) : [];

      const found =
        employees.find(
          (item) =>
            item.id === String(id)
        ) || null;

      if (!found) {
        setEmployee(null);
        return;
      }

      setEmployee(found);

      setName(found.name);
      setEmployeeId(found.employeeId);
      setEmploymentType(found.employmentType);

      setContractDays(
        found.contractDays || []
      );

      setAvailableDays(
        found.availableDays || []
      );

      setDayHours({
        Monday: found.dayHours?.Monday || '',
        Tuesday: found.dayHours?.Tuesday || '',
        Wednesday:
          found.dayHours?.Wednesday || '',
        Thursday:
          found.dayHours?.Thursday || '',
        Friday: found.dayHours?.Friday || '',
        Saturday:
          found.dayHours?.Saturday || '',
        Sunday: found.dayHours?.Sunday || '',
      });

      setNotes(found.notes || '');
    } catch (error) {
      console.log(
        'LOAD EDIT EMPLOYEE ERROR:',
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

  function toggleContractDay(day: string) {
    if (contractDays.includes(day)) {
      setContractDays(
        contractDays.filter(
          (item) => item !== day
        )
      );

      setDayHours({
        ...dayHours,
        [day]: '',
      });
    } else {
      setContractDays([
        ...contractDays,
        day,
      ]);
    }
  }

  function toggleAvailableDay(day: string) {
    if (availableDays.includes(day)) {
      setAvailableDays(
        availableDays.filter(
          (item) => item !== day
        )
      );
    } else {
      setAvailableDays([
        ...availableDays,
        day,
      ]);
    }
  }

  function updateDayHours(
    day: string,
    value: string
  ) {
    setDayHours({
      ...dayHours,
      [day]: value,
    });
  }

  function calculateWeeklyHours() {
    return contractDays.reduce(
      (total, day) =>
        total +
        (Number(dayHours[day]) || 0),
      0
    );
  }

  const weeklyContractHours =
    calculateWeeklyHours();

  async function saveEmployee() {
    if (!employee) return;

    if (!name.trim()) {
      Alert.alert(
        'Missing Name',
        'Please enter the employee name.'
      );

      return;
    }

    if (!employeeId.trim()) {
      Alert.alert(
        'Missing Employee ID',
        'Please enter the employee ID.'
      );

      return;
    }

    if (
      employmentType === 'Part-time' &&
      contractDays.length === 0
    ) {
      Alert.alert(
        'Contract Days Required',
        'Please select at least one contract day.'
      );

      return;
    }

    if (employmentType === 'Part-time') {
      const missingHours =
        contractDays.filter((day) => {
          const hours =
            Number(dayHours[day]);

          return !hours || hours <= 0;
        });

      if (missingHours.length > 0) {
        Alert.alert(
          'Contract Hours Required',
          `Please enter hours for: ${missingHours.join(
            ', '
          )}`
        );

        return;
      }
    }

    try {
      setSaving(true);

      const stored =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      const employees: Employee[] =
        stored ? JSON.parse(stored) : [];

      const duplicateId =
        employees.some(
          (item) =>
            item.id !== employee.id &&
            item.employeeId ===
              employeeId.trim()
        );

      if (duplicateId) {
        Alert.alert(
          'Duplicate Employee ID',
          'Another employee already uses this ID.'
        );

        return;
      }

      const updatedEmployees =
        employees.map((item) => {
          if (item.id !== employee.id) {
            return item;
          }

          return {
            ...item,
            name: name.trim(),
            employeeId:
              employeeId.trim(),
            employmentType,

            contractDays:
              employmentType ===
              'Part-time'
                ? contractDays
                : [],

            dayHours:
              employmentType ===
              'Part-time'
                ? dayHours
                : {},

            weeklyContractHours:
              employmentType ===
              'Part-time'
                ? weeklyContractHours
                : 0,

            availableDays,

            notes: notes.trim(),
          };
        });

      await AsyncStorage.setItem(
        'groceryEmployees',
        JSON.stringify(
          updatedEmployees
        )
      );

      Alert.alert(
        'Employee Updated',
        'Employee details have been saved.',
        [
          {
            text: 'OK',
            onPress: () =>
              router.back(),
          },
        ]
      );
    } catch (error) {
      console.log(
        'UPDATE EMPLOYEE ERROR:',
        error
      );

      Alert.alert(
        'Error',
        'Could not update employee.'
      );
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.errorTitle}>
          Employee not found
        </Text>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.backButtonText
            }
          >
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.back()
          }
        >
          <Text style={styles.back}>
            ‹ Employee
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Edit Employee
        </Text>

        <Text style={styles.subtitle}>
          Update Grocery Nightfill employee details
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
        <Text style={styles.sectionTitle}>
          Employee Details
        </Text>

        <Text style={styles.label}>
          Employee Name
        </Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>
          Employee ID
        </Text>

        <TextInput
          style={styles.input}
          value={employeeId}
          onChangeText={setEmployeeId}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>
          Employment Type
        </Text>

        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              employmentType ===
                'Part-time' &&
                styles.typeButtonActive,
            ]}
            onPress={() =>
              setEmploymentType(
                'Part-time'
              )
            }
          >
            <Text
              style={[
                styles.typeText,
                employmentType ===
                  'Part-time' &&
                  styles.typeTextActive,
              ]}
            >
              Part-time
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeButton,
              employmentType ===
                'Casual' &&
                styles.typeButtonActive,
            ]}
            onPress={() =>
              setEmploymentType(
                'Casual'
              )
            }
          >
            <Text
              style={[
                styles.typeText,
                employmentType ===
                  'Casual' &&
                  styles.typeTextActive,
              ]}
            >
              Casual
            </Text>
          </TouchableOpacity>
        </View>

        {employmentType ===
          'Part-time' && (
          <>
            <Text style={styles.sectionTitle}>
              Contract Days & Hours
            </Text>

            {weekDays.map((day) => {
              const selected =
                contractDays.includes(day);

              return (
                <View
                  key={day}
                  style={styles.dayCard}
                >
                  <TouchableOpacity
                    style={styles.dayLeft}
                    onPress={() =>
                      toggleContractDay(
                        day
                      )
                    }
                  >
                    <View
                      style={[
                        styles.checkbox,
                        selected &&
                          styles.checkboxSelected,
                      ]}
                    >
                      {selected && (
                        <Text
                          style={
                            styles.checkmark
                          }
                        >
                          ✓
                        </Text>
                      )}
                    </View>

                    <Text
                      style={
                        styles.dayName
                      }
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>

                  {selected && (
                    <View
                      style={
                        styles.hoursBox
                      }
                    >
                      <TextInput
                        style={
                          styles.hoursInput
                        }
                        value={
                          dayHours[day]
                        }
                        onChangeText={(
                          value
                        ) =>
                          updateDayHours(
                            day,
                            value
                          )
                        }
                        keyboardType="decimal-pad"
                      />

                      <Text
                        style={
                          styles.hoursText
                        }
                      >
                        hrs
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            <View
              style={
                styles.weeklyTotalCard
              }
            >
              <Text
                style={
                  styles.weeklyTotalLabel
                }
              >
                Weekly Contract
              </Text>

              <Text
                style={
                  styles.weeklyTotalValue
                }
              >
                {weeklyContractHours.toFixed(
                  1
                )}
                h
              </Text>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>
          Availability
        </Text>

        <View
          style={
            styles.availabilityGrid
          }
        >
          {weekDays.map((day) => {
            const selected =
              availableDays.includes(day);

            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.availableDay,
                  selected &&
                    styles.availableDaySelected,
                ]}
                onPress={() =>
                  toggleAvailableDay(day)
                }
              >
                <Text
                  style={[
                    styles.availableDayText,
                    selected &&
                      styles.availableDayTextSelected,
                  ]}
                >
                  {day
                    .slice(0, 3)
                    .toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>
          Notes
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.notesInput,
          ]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Optional notes"
        />

        <TouchableOpacity
          style={[
            styles.saveButton,
            saving &&
              styles.saveButtonDisabled,
          ]}
          onPress={saveEmployee}
          disabled={saving}
        >
          <Text style={styles.saveText}>
            {saving
              ? 'Saving...'
              : 'Save Changes'}
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },

  loadingText: {
    color: '#667085',
    fontSize: 14,
  },

  errorTitle: {
    color: '#101828',
    fontSize: 20,
    fontWeight: '800',
  },

  backButton: {
    backgroundColor: '#2436B2',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 16,
  },

  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    marginBottom: 14,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },

  subtitle: {
    color: '#D5DBED',
    fontSize: 13,
    marginTop: 5,
  },

  content: {
    padding: 18,
    paddingBottom: 55,
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 8,
  },

  label: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 14,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: '#101828',
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },

  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },

  typeButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },

  typeButtonActive: {
    backgroundColor: '#2436B2',
    borderColor: '#2436B2',
  },

  typeText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '700',
  },

  typeTextActive: {
    color: '#FFFFFF',
  },

  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EAECF0',
  },

  dayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  checkboxSelected: {
    backgroundColor: '#2436B2',
    borderColor: '#2436B2',
  },

  checkmark: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  dayName: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '700',
  },

  hoursBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FC',
    borderRadius: 10,
    paddingHorizontal: 9,
  },

  hoursInput: {
    width: 42,
    paddingVertical: 9,
    textAlign: 'center',
    color: '#101D48',
    fontSize: 14,
    fontWeight: '800',
  },

  hoursText: {
    color: '#667085',
    fontSize: 11,
  },

  weeklyTotalCard: {
    backgroundColor: '#101D48',
    borderRadius: 16,
    padding: 17,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  weeklyTotalLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  weeklyTotalValue: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },

  availabilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  availableDay: {
    width: '22%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },

  availableDaySelected: {
    backgroundColor: '#E9ECFF',
    borderColor: '#2436B2',
  },

  availableDayText: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
  },

  availableDayTextSelected: {
    color: '#2436B2',
  },

  notesInput: {
    minHeight: 95,
    textAlignVertical: 'top',
  },

  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 26,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});