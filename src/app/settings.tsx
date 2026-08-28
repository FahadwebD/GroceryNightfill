import { StatusBar } from 'expo-status-bar';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.smallTitle}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Manage grocery nightfill app preferences
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.sectionTitle}>Nightfill Setup</Text>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Grocery Aisles
            </Text>

            <Text style={styles.settingSubtitle}>
              Add and manage grocery aisle names
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Default Shift Times
            </Text>

            <Text style={styles.settingSubtitle}>
              Set common grocery nightfill start and finish times
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Break Rules
            </Text>

            <Text style={styles.settingSubtitle}>
              Configure paid and unpaid breaks
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Load Management</Text>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Load Photo Settings
            </Text>

            <Text style={styles.settingSubtitle}>
              Configure photo capture and load recognition
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Required Hours Method
            </Text>

            <Text style={styles.settingSubtitle}>
              Choose how grocery aisle hours are entered
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Employees</Text>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Employment Types
            </Text>

            <Text style={styles.settingSubtitle}>
              Part-time and casual settings
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Contract Rules
            </Text>

            <Text style={styles.settingSubtitle}>
              Manage contracted days and weekly hours
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Availability Rules
            </Text>

            <Text style={styles.settingSubtitle}>
              Configure employee availability and restrictions
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Data</Text>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Export Nightfill Data
            </Text>

            <Text style={styles.settingSubtitle}>
              Export employee, roster, and aisle performance data
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingCard}>
          <View>
            <Text style={styles.settingTitle}>
              Backup
            </Text>

            <Text style={styles.settingSubtitle}>
              Backup your Grocery Nightfill records
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <View style={styles.versionCard}>
          <Text style={styles.versionTitle}>
            Grocery Nightfill
          </Text>

          <Text style={styles.versionText}>
            Version 0.1
          </Text>
        </View>
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
    paddingBottom: 30,
  },

  sectionTitle: {
    color: '#101828',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 10,
  },

  settingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
    marginBottom: 9,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingTitle: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '700',
  },

  settingSubtitle: {
    color: '#667085',
    fontSize: 11,
    marginTop: 4,
    maxWidth: 290,
  },

  arrow: {
    color: '#98A2B3',
    fontSize: 27,
    marginLeft: 10,
  },

  versionCard: {
    backgroundColor: '#101D48',
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
    alignItems: 'center',
  },

  versionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  versionText: {
    color: '#AEB9DD',
    fontSize: 11,
    marginTop: 5,
  },
});