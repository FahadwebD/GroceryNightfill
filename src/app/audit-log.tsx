import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clearAuditLog,
  readAuditLog,
  type AuditEntry,
} from '../utils/auditLog';

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AuditLogScreen() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('All');

  async function load() {
    setEntries(await readAuditLog());
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const categories = useMemo(
    () => [
      'All',
      ...Array.from(new Set(entries.map((entry) => entry.category))),
    ],
    [entries]
  );

  const visible = useMemo(
    () =>
      filter === 'All'
        ? entries
        : entries.filter((entry) => entry.category === filter),
    [entries, filter]
  );

  function clear() {
    Alert.alert(
      'Clear Audit Log?',
      'This removes the local audit history from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAuditLog();
            setEntries([]);
            setFilter('All');
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Settings</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Audit Log</Text>
        <Text style={styles.subtitle}>
          Local record of manager and operational changes
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.filter,
                filter === category && styles.filterSelected,
              ]}
              onPress={() => setFilter(category)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === category && styles.filterTextSelected,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {visible.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No audit entries yet</Text>
            <Text style={styles.emptyText}>
              Security, compliance and key operational changes will appear here.
            </Text>
          </View>
        ) : (
          visible.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryTop}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{entry.category}</Text>
                </View>
                <Text style={styles.time}>{formatTimestamp(entry.timestamp)}</Text>
              </View>

              <Text style={styles.action}>{entry.action}</Text>

              {entry.details ? (
                <Text style={styles.details}>{entry.details}</Text>
              ) : null}

              <Text style={styles.night}>Night: {entry.nightDateKey}</Text>
            </View>
          ))
        )}

        {entries.length > 0 ? (
          <TouchableOpacity style={styles.clearButton} onPress={clear}>
            <Text style={styles.clearText}>Clear Local Audit Log</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
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
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 5 },
  content: { padding: 16, paddingBottom: 50 },
  filters: { gap: 8, paddingBottom: 12 },
  filter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterSelected: { backgroundColor: '#2436B2' },
  filterText: { color: '#667085', fontSize: 10, fontWeight: '700' },
  filterTextSelected: { color: '#FFFFFF' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
  },
  emptyTitle: { color: '#101828', fontWeight: '800' },
  emptyText: { color: '#667085', fontSize: 10, lineHeight: 16, marginTop: 5 },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 9,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    backgroundColor: '#E9ECFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryText: { color: '#2436B2', fontSize: 8, fontWeight: '800' },
  time: { color: '#98A2B3', fontSize: 9 },
  action: { color: '#101828', fontSize: 13, fontWeight: '800', marginTop: 9 },
  details: { color: '#667085', fontSize: 10, lineHeight: 15, marginTop: 4 },
  night: { color: '#98A2B3', fontSize: 8, marginTop: 8 },
  clearButton: {
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  clearText: { color: '#D92D20', fontWeight: '800', fontSize: 11 },
});
