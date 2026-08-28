import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendAuditLog } from './auditLog';

export const MANAGER_SECURITY_KEY = 'groceryManagerSecurity';

type ManagerSecurityRecord = {
  enabled: boolean;
  pin: string;
  updatedAt: string;
};

type SecurityListener = () => void;
const listeners = new Set<SecurityListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeManagerSecurity(listener: SecurityListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getManagerSecurity(): Promise<ManagerSecurityRecord | null> {
  try {
    const stored = await AsyncStorage.getItem(MANAGER_SECURITY_KEY);
    if (!stored) return null;
    const parsed: ManagerSecurityRecord = JSON.parse(stored);
    return parsed.enabled && parsed.pin ? parsed : null;
  } catch (error) {
    console.log('READ MANAGER SECURITY ERROR:', error);
    return null;
  }
}

export async function hasManagerPin() {
  return Boolean(await getManagerSecurity());
}

export async function verifyManagerPin(pin: string) {
  const record = await getManagerSecurity();
  if (!record) return true;
  return record.pin === pin.trim();
}

export async function setManagerPin(pin: string) {
  const clean = pin.replace(/\D/g, '').slice(0, 6);
  if (clean.length < 4) {
    throw new Error('Manager PIN must be 4 to 6 digits.');
  }

  const existing = await getManagerSecurity();
  const record: ManagerSecurityRecord = {
    enabled: true,
    pin: clean,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(MANAGER_SECURITY_KEY, JSON.stringify(record));
  await appendAuditLog({
    category: 'Security',
    action: existing ? 'Manager PIN changed' : 'Manager PIN created',
  });
  notifyListeners();
}

export async function removeManagerPin() {
  await AsyncStorage.removeItem(MANAGER_SECURITY_KEY);
  await appendAuditLog({
    category: 'Security',
    action: 'Manager PIN removed',
  });
  notifyListeners();
}

export async function recordManagerUnlock() {
  await appendAuditLog({
    category: 'Security',
    action: 'Manager access unlocked',
  });
}

export async function requestManagerLock() {
  await appendAuditLog({
    category: 'Security',
    action: 'Manager app locked',
  });
  notifyListeners();
}
