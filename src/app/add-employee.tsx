import { router } from 'expo-router';
import { useState } from 'react';

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

const weekDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function AddEmployeeScreen() {
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [employmentType, setEmploymentType] =
    useState('Part-time');

  const [contractDays, setContractDays] =
    useState<string[]>([]);

  const [availableDays, setAvailableDays] =
    useState<string[]>([]);

  const [dayHours, setDayHours] = useState<
    Record<string, string>
  >({
    Monday: '',
    Tuesday: '',
    Wednesday: '',
    Thursday: '',
    Friday: '',
    Saturday: '',
    Sunday: '',
  });

  const [notes, setNotes] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  function toggleContractDay(day: string) {
    if (contractDays.includes(day)) {
      setContractDays(
        contractDays.filter((item) => item !== day)
      );

      setDayHours({
        ...dayHours,
        [day]: '',
      });
    } else {
      setContractDays([...contractDays, day]);
    }
  }

  function toggleAvailableDay(day: string) {
    if (availableDays.includes(day)) {
      setAvailableDays(
        availableDays.filter((item) => item !== day)
      );
    } else {
      setAvailableDays([...availableDays, day]);
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
    return contractDays.reduce((total, day) => {
      const hours = Number(dayHours[day]) || 0;

      return total + hours;
    }, 0);
  }

  const weeklyContractHours =
    calculateWeeklyHours();

  async function saveEmployee() {
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
        'Please select at least one contracted day.'
      );

      return;
    }

    if (employmentType === 'Part-time') {
      const missingHours =
        contractDays.filter((day) => {
          const hours = Number(dayHours[day]);

          return !hours || hours <= 0;
        });

      if (missingHours.length > 0) {
        Alert.alert(
          'Contract Hours Required',
          `Please enter contracted hours for: ${missingHours.join(
            ', '
          )}`
        );

        return;
      }
    }

    setIsSaving(true);

    try {
      const storedEmployees =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      const employees = storedEmployees
        ? JSON.parse(storedEmployees)
        : [];

      const employeeAlreadyExists =
        employees.some(
          (employee: any) =>
            employee.employeeId ===
            employeeId.trim()
        );

      if (employeeAlreadyExists) {
        Alert.alert(
          'Employee Already Exists',
          'An employee with this ID is already saved.'
        );

        setIsSaving(false);

        return;
      }

      const newEmployee = {
        id: Date.now().toString(),

        name: name.trim(),

        employeeId: employeeId.trim(),

        employmentType,

        contractDays:
          employmentType === 'Part-time'
            ? contractDays
            : [],

        dayHours:
          employmentType === 'Part-time'
            ? dayHours
            : {},

        weeklyContractHours:
          employmentType === 'Part-time'
            ? weeklyContractHours
            : 0,

        availableDays,

        notes: notes.trim(),

        createdAt: new Date().toISOString(),
      };

      const updatedEmployees = [
        ...employees,
        newEmployee,
      ];

      await AsyncStorage.setItem(
        'groceryEmployees',
        JSON.stringify(updatedEmployees)
      );

      Alert.alert(
        'Employee Saved',
        `${name.trim()} has been added to the Grocery Nightfill team.`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.log(
        'SAVE EMPLOYEE ERROR:',
        error
      );

      Alert.alert(
        'Error',
        'The employee could not be saved. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
        >
          <Text style={styles.back}>
            ‹ Back
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Add Employee
        </Text>

        <Text style={styles.subtitle}>
          Grocery Nightfill employee profile
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
        {/* EMPLOYEE DETAILS */}

        <Text style={styles.sectionTitle}>
          Employee Details
        </Text>

        <Text style={styles.label}>
          Employee Name
        </Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. John Smith"
          placeholderTextColor="#98A2B3"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>
          Employee ID
        </Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. 90123456"
          placeholderTextColor="#98A2B3"
          value={employeeId}
          onChangeText={setEmployeeId}
          keyboardType="number-pad"
        />

        {/* EMPLOYMENT TYPE */}

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

        {/* CONTRACT */}

        {employmentType ===
          'Part-time' && (
          <>
            <Text
              style={
                styles.sectionTitle
              }
            >
              Contract Days & Hours
            </Text>

            <Text
              style={styles.helperText}
            >
              Select the days this employee
              is contracted to work and enter
              the contracted hours for each
              day.
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
                          styles.dayDescription
                        }
                      >
                        {selected
                          ? 'Contracted day'
                          : 'Not contracted'}
                      </Text>
                    </View>
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
                        placeholder="0"
                        placeholderTextColor="#98A2B3"
                        keyboardType="decimal-pad"
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
              <View>
                <Text
                  style={
                    styles.weeklyTotalLabel
                  }
                >
                  Weekly Contract
                </Text>

                <Text
                  style={
                    styles.weeklyTotalSubtext
                  }
                >
                  Calculated automatically
                </Text>
              </View>

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

        {/* AVAILABILITY */}

        <Text style={styles.sectionTitle}>
          Availability
        </Text>

        <Text style={styles.helperText}>
          Select all days this employee is
          available for Grocery Nightfill.
          Availability is separate from
          contracted days.
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

                {selected && (
                  <Text
                    style={
                      styles.availableCheck
                    }
                  >
                    ✓
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={
            styles.availabilitySummary
          }
        >
          <Text
            style={
              styles.availabilitySummaryLabel
            }
          >
            Available Days
          </Text>

          <Text
            style={
              styles.availabilitySummaryValue
            }
          >
            {availableDays.length === 0
              ? 'None selected'
              : availableDays
                  .map((day) =>
                    day
                      .slice(0, 3)
                      .toUpperCase()
                  )
                  .join(' · ')}
          </Text>
        </View>

        {/* NOTES */}

        <Text style={styles.sectionTitle}>
          Notes
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.notesInput,
          ]}
          placeholder="Optional notes about the employee"
          placeholderTextColor="#98A2B3"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {/* SAVE */}

        <TouchableOpacity
          style={[
            styles.saveButton,
            isSaving &&
              styles.saveButtonDisabled,
          ]}
          onPress={saveEmployee}
          disabled={isSaving}
        >
          <Text
            style={styles.saveText}
          >
            {isSaving
              ? 'Saving...'
              : 'Save Employee'}
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

  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 25,
  },

  back: {
    color: '#D5DBED',
    fontSize: 15,
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
    paddingBottom: 60,
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 8,
  },

  helperText: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
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

  dayDescription: {
    color: '#98A2B3',
    fontSize: 10,
    marginTop: 3,
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  weeklyTotalLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  weeklyTotalSubtext: {
    color: '#AEB9DD',
    fontSize: 10,
    marginTop: 4,
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
    justifyContent: 'center',
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

  availableCheck: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },

  availabilitySummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#EAECF0',
    padding: 14,
    marginTop: 12,
  },

  availabilitySummaryLabel: {
    color: '#98A2B3',
    fontSize: 10,
    fontWeight: '700',
  },

  availabilitySummaryValue: {
    color: '#101D48',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
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