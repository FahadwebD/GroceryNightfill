import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WeekRosterNightCaptain from '../components/week-roster-night-captain';

export default function WeekScreen() {
  return (
    <View style={styles.container}>
      <WeekRosterNightCaptain />

      <TouchableOpacity
        style={styles.groupButton}
        onPress={() => router.push('/group-roster')}
        activeOpacity={0.9}
      >
        <Text style={styles.groupButtonText}>Group Roster</Text>
        <Text style={styles.groupButtonArrow}>↗</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  groupButton: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    backgroundColor: '#2436B2',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  groupButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  groupButtonArrow: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});