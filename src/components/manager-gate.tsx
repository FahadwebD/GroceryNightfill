import { PropsWithChildren, useEffect, useState } from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getManagerSecurity,
  recordManagerUnlock,
  subscribeManagerSecurity,
  verifyManagerPin,
} from '../utils/managerSecurity';

export default function ManagerGate({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function refreshSecurity(forceLock = false) {
    const security = await getManagerSecurity();
    if (!security) {
      setLocked(false);
      setReady(true);
      return;
    }

    if (forceLock || !ready) {
      setLocked(true);
    }

    setReady(true);
  }

  useEffect(() => {
    refreshSecurity(true);

    const unsubscribe = subscribeManagerSecurity(() => {
      refreshSecurity(true);
    });

    const appStateSubscription = AppState.addEventListener(
      'change',
      async (state) => {
        if (state === 'background' || state === 'inactive') {
          const security = await getManagerSecurity();
          if (security) {
            setPin('');
            setError('');
            setLocked(true);
          }
        }
      }
    );

    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  async function unlock() {
    const valid = await verifyManagerPin(pin);
    if (!valid) {
      setError('Incorrect manager PIN.');
      return;
    }

    setError('');
    setPin('');
    setLocked(false);
    await recordManagerUnlock();
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Checking manager access...</Text>
      </View>
    );
  }

  if (locked) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>GROCERY NIGHTFILL</Text>
          <Text style={styles.title}>Manager Access</Text>
          <Text style={styles.subtitle}>
            Enter the manager PIN to open roster, employee and night performance data.
          </Text>

          <TextInput
            value={pin}
            onChangeText={(value) => {
              setPin(value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            onSubmitEditing={unlock}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="4–6 digit PIN"
            style={styles.input}
            maxLength={6}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, pin.length < 4 && styles.buttonDisabled]}
            disabled={pin.length < 4}
            onPress={unlock}
          >
            <Text style={styles.buttonText}>Unlock</Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            This local PIN is a basic prototype access gate. Production use should move authentication to platform-secure or server-managed credentials.
          </Text>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101D48',
    justifyContent: 'center',
    padding: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FA',
  },
  loading: {
    color: '#667085',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
  },
  eyebrow: {
    color: '#6D5DFB',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: '#101828',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  subtitle: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F2F4F7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 8,
    marginTop: 20,
  },
  error: {
    color: '#D92D20',
    textAlign: 'center',
    fontSize: 11,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#2436B2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  note: {
    color: '#98A2B3',
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 16,
  },
});
