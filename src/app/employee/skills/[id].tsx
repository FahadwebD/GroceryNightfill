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

const groceryAisles = [
  'Aisle 2',
  'Aisle 3',
  'Aisle 4',
  'Aisle 5',
  'Aisle 6',
  'Aisle 7',
  'Aisle 8',
  'Aisle 9',
  'Aisle 10',
  'Aisle 11',
  'Aisle 12',
  'Aisle 13',
  'Aisle 14',
  'Aisle 15',
];

export default function AisleSkillsScreen() {
  const { id } = useLocalSearchParams();

  const [employee, setEmployee] =
    useState<Employee | null>(null);

  const [skills, setSkills] =
    useState<Record<string, number>>({});

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

      const foundEmployee =
        employees.find(
          (item) =>
            item.id === String(id)
        ) || null;

      if (foundEmployee) {
        setEmployee(foundEmployee);

        setSkills(
          foundEmployee.aisleSkills || {}
        );
      } else {
        setEmployee(null);
      }
    } catch (error) {
      console.log(
        'LOAD AISLE SKILLS ERROR:',
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

  function setAisleSkill(
    aisle: string,
    rating: number
  ) {
    setSkills((previous) => ({
      ...previous,
      [aisle]: rating,
    }));
  }

  async function saveSkills() {
    try {
      setSaving(true);

      const stored =
        await AsyncStorage.getItem(
          'groceryEmployees'
        );

      const employees: Employee[] =
        stored ? JSON.parse(stored) : [];

      const updatedEmployees =
        employees.map((item) => {
          if (
            item.id === String(id)
          ) {
            return {
              ...item,
              aisleSkills: skills,
            };
          }

          return item;
        });

      await AsyncStorage.setItem(
        'groceryEmployees',
        JSON.stringify(
          updatedEmployees
        )
      );

      Alert.alert(
        'Saved',
        'Aisle skills updated.',
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
        'SAVE AISLE SKILLS ERROR:',
        error
      );

      Alert.alert(
        'Error',
        'Could not save aisle skills.'
      );
    } finally {
      setSaving(false);
    }
  }

  function getRatingLabel(
    rating: number
  ) {
    if (rating === 1) return 'Needs Support';
    if (rating === 2) return 'Developing';
    if (rating === 3) return 'Good';
    if (rating === 4) return 'Strong';
    if (rating === 5) return 'Excellent';

    return 'Not rated';
  }

  const ratedValues =
    Object.values(skills).filter(
      (rating) =>
        Number(rating) > 0
    );

  const ratedCount =
    ratedValues.length;

  const averageSkill =
    ratedValues.length > 0
      ? ratedValues.reduce(
          (total, rating) =>
            total + Number(rating),
          0
        ) / ratedValues.length
      : 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Loading skills...
        </Text>
      </View>
    );
  }

  if (!employee) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
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
      {/* HEADER */}

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
          Aisle Skills
        </Text>

        <Text style={styles.subtitle}>
          {employee.name}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.content
        }
      >
        {/* SUMMARY */}

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>
              Grocery Skill Profile
            </Text>

            <Text style={styles.summarySubtext}>
              Aisles 2–15
            </Text>
          </View>

          <View style={styles.summaryRight}>
            <Text style={styles.summarySmall}>
              Avg.
            </Text>

            <Text style={styles.summaryValue}>
              {averageSkill > 0
                ? averageSkill.toFixed(1)
                : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              Rated
            </Text>

            <Text style={styles.statValue}>
              {ratedCount}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              Total
            </Text>

            <Text style={styles.statValue}>
              14
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              Remaining
            </Text>

            <Text style={styles.statValue}>
              {14 - ratedCount}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Grocery Aisles
        </Text>

        {/* COMPACT AISLE CARDS */}

        {groceryAisles.map((aisle) => {
          const current =
            skills[aisle] || 0;

          return (
            <View
              key={aisle}
              style={styles.aisleCard}
            >
              <View style={styles.aisleHeader}>
                <View style={styles.aisleInfo}>
                  <Text style={styles.aisleName}>
                    {aisle}
                  </Text>

                  <Text
                    style={
                      styles.ratingLabel
                    }
                  >
                    {getRatingLabel(
                      current
                    )}
                  </Text>
                </View>

                <View style={styles.scoreBox}>
                  <Text style={styles.scoreText}>
                    {current > 0
                      ? `${current}/5`
                      : '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map(
                  (rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[
                        styles.ratingButton,
                        current ===
                          rating &&
                          styles.ratingButtonSelected,
                      ]}
                      onPress={() =>
                        setAisleSkill(
                          aisle,
                          rating
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.ratingNumber,
                          current ===
                            rating &&
                            styles.ratingNumberSelected,
                        ]}
                      >
                        {rating}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={[
            styles.saveButton,
            saving &&
              styles.saveButtonDisabled,
          ]}
          onPress={saveSkills}
          disabled={saving}
        >
          <Text style={styles.saveText}>
            {saving
              ? 'Saving...'
              : 'Save Aisle Skills'}
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
  },

  loadingText: {
    color: '#667085',
    fontSize: 14,
  },

  errorText: {
    color: '#101828',
    fontSize: 18,
    fontWeight: '800',
  },

  backButton: {
    marginTop: 16,
    backgroundColor: '#2436B2',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
  },

  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 22,
  },

  back: {
    color: '#D5DBED',
    fontSize: 14,
    marginBottom: 10,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },

  subtitle: {
    color: '#D5DBED',
    fontSize: 13,
    marginTop: 4,
  },

  content: {
    padding: 16,
    paddingBottom: 45,
  },

  summaryCard: {
    backgroundColor: '#101D48',
    borderRadius: 15,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  summaryLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  summarySubtext: {
    color: '#AEB9DD',
    fontSize: 10,
    marginTop: 3,
  },

  summaryRight: {
    alignItems: 'flex-end',
  },

  summarySmall: {
    color: '#AEB9DD',
    fontSize: 9,
  },

  summaryValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    padding: 10,
  },

  statLabel: {
    color: '#98A2B3',
    fontSize: 9,
  },

  statValue: {
    color: '#101D48',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 3,
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 8,
  },

  aisleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    padding: 12,
    marginBottom: 8,
  },

  aisleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  aisleInfo: {
    flex: 1,
  },

  aisleName: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },

  ratingLabel: {
    color: '#98A2B3',
    fontSize: 9,
    marginTop: 2,
  },

  scoreBox: {
    backgroundColor: '#EEF0FF',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  scoreText: {
    color: '#2436B2',
    fontSize: 10,
    fontWeight: '800',
  },

  ratingRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },

  ratingButton: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F2F4F7',
    borderWidth: 1,
    borderColor: '#EAECF0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  ratingButtonSelected: {
    backgroundColor: '#2436B2',
    borderColor: '#2436B2',
  },

  ratingNumber: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '800',
  },

  ratingNumberSelected: {
    color: '#FFFFFF',
  },

  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});