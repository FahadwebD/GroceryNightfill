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
import { appendAuditLog } from '../utils/auditLog';

const ACK_KEY = 'groceryComplianceAcknowledgement';

type ComplianceAcknowledgement = {
  privacyAcknowledgedAt: string | null;
  aiAcknowledgedAt: string | null;
};

export default function PrivacyAIScreen() {
  const [ack, setAck] = useState<ComplianceAcknowledgement>({
    privacyAcknowledgedAt: null,
    aiAcknowledgedAt: null,
  });

  async function load() {
    const stored = await AsyncStorage.getItem(ACK_KEY);
    if (stored) {
      setAck(JSON.parse(stored));
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function acknowledge(type: 'privacy' | 'ai') {
    const now = new Date().toISOString();
    const next = {
      ...ack,
      privacyAcknowledgedAt:
        type === 'privacy' ? now : ack.privacyAcknowledgedAt,
      aiAcknowledgedAt:
        type === 'ai' ? now : ack.aiAcknowledgedAt,
    };

    setAck(next);
    await AsyncStorage.setItem(ACK_KEY, JSON.stringify(next));
    await appendAuditLog({
      category: 'Compliance',
      action:
        type === 'privacy'
          ? 'Privacy notice acknowledged'
          : 'Responsible AI notice acknowledged',
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Settings</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacy & Responsible AI</Text>
        <Text style={styles.subtitle}>
          Operating principles for the Grocery Nightfill prototype
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Important</Text>
          <Text style={styles.noticeText}>
            This prototype is not an official Coles system and this page does not represent Coles approval. Store or production use should follow current Coles policies, approved systems and manager direction.
          </Text>
        </View>

        <Section
          title="Privacy & Confidentiality"
          points={[
            'Collect only operational information needed for roster, load and task planning.',
            'Do not enter medical details, personal explanations or other unnecessary sensitive information for Sick or No Show statuses.',
            'Employee profiles, skill ratings, attendance and performance history should be manager-only information.',
            'Do not share store, employee or operational information with people who are not authorised to see it.',
          ]}
        />

        <TouchableOpacity
          style={[
            styles.ackButton,
            ack.privacyAcknowledgedAt && styles.ackButtonDone,
          ]}
          onPress={() => acknowledge('privacy')}
        >
          <Text
            style={[
              styles.ackText,
              ack.privacyAcknowledgedAt && styles.ackTextDone,
            ]}
          >
            {ack.privacyAcknowledgedAt
              ? '✓ Privacy notice acknowledged'
              : 'Acknowledge Privacy Notice'}
          </Text>
        </TouchableOpacity>

        <Section
          title="Responsible AI"
          points={[
            'Smart Allocation is a suggestion only. A manager must review and approve the final allocation.',
            'Suggestions should use relevant, current roster, load and aisle-skill information.',
            'Do not automatically discipline, rank or penalise a team member from an AI suggestion or one task result.',
            'Managers can always override employee, aisle, task minutes and start times when reality differs from the plan.',
          ]}
        />

        <TouchableOpacity
          style={[
            styles.ackButton,
            ack.aiAcknowledgedAt && styles.ackButtonDone,
          ]}
          onPress={() => acknowledge('ai')}
        >
          <Text
            style={[
              styles.ackText,
              ack.aiAcknowledgedAt && styles.ackTextDone,
            ]}
          >
            {ack.aiAcknowledgedAt
              ? '✓ Responsible AI notice acknowledged'
              : 'Acknowledge Responsible AI Notice'}
          </Text>
        </TouchableOpacity>

        <Section
          title="Safe Management Use"
          points={[
            'Sick and No Show team members are excluded from active labour planning.',
            'The app should flag labour shortages and plan overruns rather than encouraging unsafe work rates.',
            'Ahead or Behind is operational plan variance, not an automatic judgement of an employee.',
            'Manager coaching and context remain necessary when reviewing performance information.',
          ]}
        />
      </ScrollView>
    </View>
  );
}

function Section({ title, points }: { title: string; points: string[] }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {points.map((point) => (
        <View key={point} style={styles.pointRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.point}>{point}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  header: {
    backgroundColor: '#101D48',
    paddingTop: 65,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  back: { color: '#D5DBED', fontSize: 14, marginBottom: 12 },
  title: { color: '#FFFFFF', fontSize: 27, fontWeight: '800' },
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 5, lineHeight: 16 },
  content: { padding: 16, paddingBottom: 50 },
  noticeCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  noticeTitle: { color: '#B54708', fontSize: 12, fontWeight: '800' },
  noticeText: { color: '#7A2E0E', fontSize: 10, lineHeight: 16, marginTop: 5 },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
  },
  sectionTitle: { color: '#101828', fontSize: 15, fontWeight: '800', marginBottom: 10 },
  pointRow: { flexDirection: 'row', marginBottom: 8 },
  bullet: { color: '#2436B2', width: 16, fontWeight: '800' },
  point: { flex: 1, color: '#475467', fontSize: 10, lineHeight: 16 },
  ackButton: {
    backgroundColor: '#2436B2',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 16,
  },
  ackButtonDone: { backgroundColor: '#E8F8EF' },
  ackText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  ackTextDone: { color: '#168455' },
});
