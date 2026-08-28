import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendAuditLog } from './auditLog';

export const NIGHT_CAPTAIN_ID = '__night_captain__';
export const NIGHT_CAPTAIN_CONFIG_KEY = 'groceryNightCaptainConfig';

export const NIGHT_CAPTAIN_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type NightCaptainDay = (typeof NIGHT_CAPTAIN_DAYS)[number];

export type NightCaptainConfig = {
  enabled: boolean;
  activeDays: NightCaptainDay[];
  defaultStartTime: string;
  defaultFinishTime: string;
  targetDays: number;
  updatedAt: string;
};

export const DEFAULT_NIGHT_CAPTAIN_CONFIG: NightCaptainConfig = {
  enabled: true,
  /*
   * The role is shown every night by default, matching the current roster
   * behaviour. The manager can reduce this to the actual five working nights
   * once the weekly pattern is known.
   */
  activeDays: [...NIGHT_CAPTAIN_DAYS],
  defaultStartTime: '18:00',
  defaultFinishTime: '03:00',
  targetDays: 5,
  updatedAt: 'default',
};

function cleanDays(value: unknown): NightCaptainDay[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_NIGHT_CAPTAIN_CONFIG.activeDays];
  }

  return NIGHT_CAPTAIN_DAYS.filter((day) => value.includes(day));
}

export async function getNightCaptainConfig(): Promise<NightCaptainConfig> {
  try {
    const stored = await AsyncStorage.getItem(NIGHT_CAPTAIN_CONFIG_KEY);

    if (!stored) {
      return { ...DEFAULT_NIGHT_CAPTAIN_CONFIG };
    }

    const parsed = JSON.parse(stored) as Partial<NightCaptainConfig>;

    return {
      enabled: parsed.enabled ?? true,
      activeDays: cleanDays(parsed.activeDays),
      defaultStartTime:
        typeof parsed.defaultStartTime === 'string' && parsed.defaultStartTime
          ? parsed.defaultStartTime
          : DEFAULT_NIGHT_CAPTAIN_CONFIG.defaultStartTime,
      defaultFinishTime:
        typeof parsed.defaultFinishTime === 'string' && parsed.defaultFinishTime
          ? parsed.defaultFinishTime
          : DEFAULT_NIGHT_CAPTAIN_CONFIG.defaultFinishTime,
      targetDays:
        Number(parsed.targetDays) > 0
          ? Number(parsed.targetDays)
          : DEFAULT_NIGHT_CAPTAIN_CONFIG.targetDays,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : DEFAULT_NIGHT_CAPTAIN_CONFIG.updatedAt,
    };
  } catch (error) {
    console.log('READ NIGHT CAPTAIN CONFIG ERROR:', error);
    return { ...DEFAULT_NIGHT_CAPTAIN_CONFIG };
  }
}

export async function saveNightCaptainConfig(
  config: NightCaptainConfig
) {
  const clean: NightCaptainConfig = {
    ...config,
    activeDays: cleanDays(config.activeDays),
    targetDays: 5,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    NIGHT_CAPTAIN_CONFIG_KEY,
    JSON.stringify(clean)
  );

  await appendAuditLog({
    category: 'Roster',
    action: 'Night Captain defaults updated',
    details: `${clean.activeDays.length} active nights · ${clean.defaultStartTime}–${clean.defaultFinishTime}`,
  });

  return clean;
}

export async function resetNightCaptainConfig() {
  const reset: NightCaptainConfig = {
    ...DEFAULT_NIGHT_CAPTAIN_CONFIG,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    NIGHT_CAPTAIN_CONFIG_KEY,
    JSON.stringify(reset)
  );

  await appendAuditLog({
    category: 'Roster',
    action: 'Night Captain defaults reset',
    details: 'All nights · 18:00–03:00',
  });

  return reset;
}

export function isNightCaptainActive(
  config: NightCaptainConfig,
  day: string
) {
  return config.enabled && config.activeDays.includes(day as NightCaptainDay);
}
