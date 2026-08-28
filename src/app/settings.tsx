import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  hasManagerPin,
  requestManagerLock,
} from '../utils/managerSecurity';

export default function SettingsScreen() {
  const [pinEnabled, setPinEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      hasManagerPin().then(setPinEnabled);
    }, [])
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.smallTitle}>GROCERY NIGHTFILL</Text>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Manager controls, privacy and nightfill preferences
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.sectionTitle}>Security & Compliance</Text>

        <TouchableOpacity
          style={styles.settingCard}
          onPress={() => router.push('/manager-security')}
        >
          <View style={styles.settingInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.settingTitle}>Manager PIN</Text>
              <View
                style={[
                  styles.statusBadge,
                  pinEnabled ? styles.enabledBadge : styles.warningBadge,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    pinEnabled ? styles.enabledText : styles.warningText,
                  ]}
                >
                  {pinEnabled ? 'ON' : 'OFF'}
                </Text>
              </View>
            </View>
            <Text style={styles.settingSubtitle}>
              Lock roster, employee and performance information behind manager access
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        {pinEnabled ? (
          <TouchableOpacity
            style={styles.lockCard}
            onPress={requestManagerLock}
          >
            <Text style={styles.lockTitle}>🔒 Lock App Now</Text>
            <Text style={styles.lockSubtitle}>
              Return immediately to the Manager Access PIN screen
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.settingCard}
          onPress={() => router.push('/audit-log')}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Audit Log</Text>
            <Text style={styles.settingSubtitle}>
              Review manager security, compliance and key operational changes
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingCard}
          onPress={() => router.push('/privacy-ai')}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Privacy & Responsible AI</Text>
            <Text style={styles.settingSubtitle}>
              Manager review, data minimisation and safe-use principles
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <View style={styles.aiNotice}>
          <Text style={styles.aiNoticeTitle}>Smart Allocation remains manager-controlled</Text>
          <Text style={styles.aiNoticeText}>
            AI-style suggestions are never final automatically. The manager can change employee, aisle, minutes and start times before the plan is used.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Nightfill Setup</Text>

        <TouchableOpacity
          style={styles.settingCard}
          onPress={() => router.push('/night-captain-settings')}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Night Captain</Text>
            <Text style={styles.settingSubtitle}>
              Choose Captain working nights and the default 6 PM–3 AM shift
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <SettingCard
          title="Grocery Aisles"
          subtitle="Add and manage grocery aisle names"
        />
        <SettingCard
          title="Default Shift Times"
          subtitle="Set common grocery nightfill start and finish times"
        />
        <SettingCard
          title="Break Rules"
          subtitle="Configure paid and unpaid breaks"
        />

        <Text style={styles.sectionTitle}>Load Management</Text>

        <SettingCard
          title="Load Photo Settings"
          subtitle="Configure photo capture and load recognition"
        />
        <SettingCard
          title="Required Hours Method"
          subtitle="Choose how grocery aisle hours are entered"
        />

        <Text style={styles.sectionTitle}>Employees</Text>

        <SettingCard
          title="Employment Types"
          subtitle="Part-time and casual settings"
        />
        <SettingCard
          title="Contract Rules"
          subtitle="Manage contracted days and weekly hours"
        />
        <SettingCard
          title="Availability Rules"
          subtitle="Configure employee availability and restrictions"
        />

        <Text style={styles.sectionTitle}>Data</Text>

        <SettingCard
          title="Export Nightfill Data"
          subtitle="Export employee, roster and aisle performance data"
        />
        <SettingCard
          title="Backup"
          subtitle="Backup your Grocery Nightfill records"
        />

        <View style={styles.versionCard}>
          <Text style={styles.versionTitle}>Grocery Nightfill</Text>
          <Text style={styles.versionText}>Version 0.2 · Manager prototype</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <TouchableOpacity style={styles.settingCard}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
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
  content: { padding: 18, paddingBottom: 40 },
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
  settingInfo: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingTitle: { color: '#101828', fontSize: 14, fontWeight: '700' },
  settingSubtitle: {
    color: '#667085',
    fontSize: 11,
    marginTop: 4,
    maxWidth: 290,
    lineHeight: 16,
  },
  arrow: { color: '#98A2B3', fontSize: 27, marginLeft: 10 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  enabledBadge: { backgroundColor: '#E8F8EF' },
  warningBadge: { backgroundColor: '#FFF4E5' },
  statusText: { fontSize: 8, fontWeight: '800' },
  enabledText: { color: '#168455' },
  warningText: { color: '#B54708' },
  lockCard: {
    backgroundColor: '#E9ECFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 9,
  },
  lockTitle: { color: '#2436B2', fontSize: 12, fontWeight: '800' },
  lockSubtitle: { color: '#5262C7', fontSize: 9, marginTop: 4 },
  aiNotice: {
    backgroundColor: '#F0F2FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  aiNoticeTitle: { color: '#2436B2', fontSize: 11, fontWeight: '800' },
  aiNoticeText: { color: '#475467', fontSize: 9, lineHeight: 15, marginTop: 4 },
  versionCard: {
    backgroundColor: '#101D48',
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
    alignItems: 'center',
  },
  versionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  versionText: { color: '#AEB9DD', fontSize: 11, marginTop: 5 },
});