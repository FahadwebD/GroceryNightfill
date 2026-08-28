import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  hasManagerPin,
  removeManagerPin,
  requestManagerLock,
  setManagerPin,
  verifyManagerPin,
} from '../utils/managerSecurity';

export default function ManagerSecurityScreen() {
  const [enabled, setEnabled] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setEnabled(await hasManagerPin());
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [])
  );

  function digits(value: string) {
    return value.replace(/\D/g, '').slice(0, 6);
  }

  async function savePin() {
    if (newPin.length < 4 || newPin.length > 6) {
      Alert.alert('Check PIN', 'Use a 4 to 6 digit manager PIN.');
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert('PINs Do Not Match', 'Re-enter the same PIN in both new PIN fields.');
      return;
    }

    if (enabled) {
      const valid = await verifyManagerPin(currentPin);
      if (!valid) {
        Alert.alert('Incorrect PIN', 'The current manager PIN is incorrect.');
        return;
      }
    }

    try {
      setSaving(true);
      await setManagerPin(newPin);
      setEnabled(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      Alert.alert(
        enabled ? 'Manager PIN Changed' : 'Manager PIN Enabled',
        'The app is now locked. Enter the new PIN to continue.'
      );
    } catch (error: any) {
      Alert.alert('Could Not Save PIN', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function disablePin() {
    const valid = await verifyManagerPin(currentPin);
    if (!valid) {
      Alert.alert('Incorrect PIN', 'Enter the current manager PIN before disabling the lock.');
      return;
    }

    Alert.alert(
      'Disable Manager PIN?',
      'Anyone with access to this device will be able to open the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            await removeManagerPin();
            setEnabled(false);
            setCurrentPin('');
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
        <Text style={styles.title}>Manager Access</Text>
        <Text style={styles.subtitle}>
          Basic local access control for manager-only operational data
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>MANAGER PIN</Text>
          <Text style={enabled ? styles.enabled : styles.disabled}>
            {enabled ? 'Enabled' : 'Not enabled'}
          </Text>
        </View>

        {enabled ? (
          <Field
            label="Current PIN"
            value={currentPin}
            onChangeText={(value) => setCurrentPin(digits(value))}
          />
        ) : null}

        <Field
          label={enabled ? 'New PIN' : 'Create PIN'}
          value={newPin}
          onChangeText={(value) => setNewPin(digits(value))}
        />
        <Field
          label="Confirm New PIN"
          value={confirmPin}
          onChangeText={(value) => setConfirmPin(digits(value))}
        />

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.disabledButton]}
          disabled={saving}
          onPress={savePin}
        >
          <Text style={styles.primaryText}>
            {saving ? 'Saving...' : enabled ? 'Change Manager PIN' : 'Enable Manager PIN'}
          </Text>
        </TouchableOpacity>

        {enabled ? (
          <>
            <TouchableOpacity style={styles.lockButton} onPress={requestManagerLock}>
              <Text style={styles.lockText}>Lock App Now</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dangerButton} onPress={disablePin}>
              <Text style={styles.dangerText}>Disable Manager PIN</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Prototype security</Text>
          <Text style={styles.noticeText}>
            This PIN is a basic on-device gate for the current prototype. Before production or store rollout, authentication should move to secure platform credentials or approved server-managed access.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        placeholder="4–6 digits"
      />
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
  subtitle: { color: '#D5DBED', fontSize: 11, marginTop: 5, lineHeight: 16 },
  content: { padding: 18, paddingBottom: 50 },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  statusLabel: { color: '#667085', fontSize: 9, fontWeight: '800' },
  enabled: { color: '#168455', fontSize: 20, fontWeight: '800', marginTop: 4 },
  disabled: { color: '#B54708', fontSize: 20, fontWeight: '800', marginTop: 4 },
  field: { marginBottom: 12 },
  label: { color: '#344054', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
    letterSpacing: 6,
  },
  primaryButton: {
    backgroundColor: '#2436B2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  disabledButton: { opacity: 0.5 },
  lockButton: {
    backgroundColor: '#E9ECFF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  lockText: { color: '#2436B2', fontWeight: '800' },
  dangerButton: {
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  dangerText: { color: '#D92D20', fontWeight: '800' },
  notice: {
    backgroundColor: '#FFF4E5',
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  noticeTitle: { color: '#B54708', fontSize: 12, fontWeight: '800' },
  noticeText: { color: '#7A2E0E', fontSize: 10, lineHeight: 16, marginTop: 5 },
});
