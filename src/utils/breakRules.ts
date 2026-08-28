import AsyncStorage from '@react-native-async-storage/async-storage';

export const BREAK_RULES_KEY = 'groceryNightBreakRules';

export type BreakRulesConfig = {
  enabled: boolean;
  paidBreakEnabled: boolean;
  paidBreakThresholdMinutes: number;
  paidBreakMinutes: number;
  mealBreakEnabled: boolean;
  mealBreakThresholdMinutes: number;
  mealBreakMinutes: number;
  deductPaidBreakFromProductiveLabour: boolean;
  deductMealBreakFromProductiveLabour: boolean;
  updatedAt: string;
};

export type BreakSummary = {
  paidBreakMinutes: number;
  mealBreakMinutes: number;
  totalBreakMinutes: number;
  productiveBreakMinutes: number;
};

export const DEFAULT_BREAK_RULES: BreakRulesConfig = {
  enabled: true,
  paidBreakEnabled: true,
  paidBreakThresholdMinutes: 3 * 60 + 45,
  paidBreakMinutes: 15,
  mealBreakEnabled: true,
  mealBreakThresholdMinutes: 5 * 60 + 30,
  mealBreakMinutes: 30,
  deductPaidBreakFromProductiveLabour: true,
  deductMealBreakFromProductiveLabour: true,
  updatedAt: 'default',
};

function safeMinutes(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.round(number)
    : fallback;
}

export function normaliseBreakRules(
  value?: Partial<BreakRulesConfig> | null
): BreakRulesConfig {
  return {
    enabled:
      value?.enabled ??
      DEFAULT_BREAK_RULES.enabled,
    paidBreakEnabled:
      value?.paidBreakEnabled ??
      DEFAULT_BREAK_RULES.paidBreakEnabled,
    paidBreakThresholdMinutes: safeMinutes(
      value?.paidBreakThresholdMinutes,
      DEFAULT_BREAK_RULES.paidBreakThresholdMinutes
    ),
    paidBreakMinutes: safeMinutes(
      value?.paidBreakMinutes,
      DEFAULT_BREAK_RULES.paidBreakMinutes
    ),
    mealBreakEnabled:
      value?.mealBreakEnabled ??
      DEFAULT_BREAK_RULES.mealBreakEnabled,
    mealBreakThresholdMinutes: safeMinutes(
      value?.mealBreakThresholdMinutes,
      DEFAULT_BREAK_RULES.mealBreakThresholdMinutes
    ),
    mealBreakMinutes: safeMinutes(
      value?.mealBreakMinutes,
      DEFAULT_BREAK_RULES.mealBreakMinutes
    ),
    deductPaidBreakFromProductiveLabour:
      value?.deductPaidBreakFromProductiveLabour ??
      DEFAULT_BREAK_RULES.deductPaidBreakFromProductiveLabour,
    deductMealBreakFromProductiveLabour:
      value?.deductMealBreakFromProductiveLabour ??
      DEFAULT_BREAK_RULES.deductMealBreakFromProductiveLabour,
    updatedAt:
      value?.updatedAt ||
      DEFAULT_BREAK_RULES.updatedAt,
  };
}

export async function getBreakRules() {
  try {
    const stored = await AsyncStorage.getItem(
      BREAK_RULES_KEY
    );

    if (!stored) {
      return DEFAULT_BREAK_RULES;
    }

    return normaliseBreakRules(
      JSON.parse(stored)
    );
  } catch (error) {
    console.log(
      'READ BREAK RULES ERROR:',
      error
    );

    return DEFAULT_BREAK_RULES;
  }
}

export async function saveBreakRules(
  config: BreakRulesConfig
) {
  const next = normaliseBreakRules({
    ...config,
    updatedAt:
      new Date().toISOString(),
  });

  await AsyncStorage.setItem(
    BREAK_RULES_KEY,
    JSON.stringify(next)
  );

  return next;
}

export async function resetBreakRules() {
  await AsyncStorage.removeItem(
    BREAK_RULES_KEY
  );

  return DEFAULT_BREAK_RULES;
}

export function calculateBreakSummary(
  shiftMinutes: number,
  config: BreakRulesConfig =
    DEFAULT_BREAK_RULES
): BreakSummary {
  const safeShift = Math.max(
    Math.round(shiftMinutes || 0),
    0
  );

  if (!config.enabled || safeShift <= 0) {
    return {
      paidBreakMinutes: 0,
      mealBreakMinutes: 0,
      totalBreakMinutes: 0,
      productiveBreakMinutes: 0,
    };
  }

  const paidBreakMinutes =
    config.paidBreakEnabled &&
    safeShift >
      config.paidBreakThresholdMinutes
      ? config.paidBreakMinutes
      : 0;

  const mealBreakMinutes =
    config.mealBreakEnabled &&
    safeShift >
      config.mealBreakThresholdMinutes
      ? config.mealBreakMinutes
      : 0;

  const productiveBreakMinutes =
    (config.deductPaidBreakFromProductiveLabour
      ? paidBreakMinutes
      : 0) +
    (config.deductMealBreakFromProductiveLabour
      ? mealBreakMinutes
      : 0);

  return {
    paidBreakMinutes,
    mealBreakMinutes,
    totalBreakMinutes:
      paidBreakMinutes +
      mealBreakMinutes,
    productiveBreakMinutes,
  };
}

export function calculateProductiveMinutes(
  shiftMinutes: number,
  config: BreakRulesConfig =
    DEFAULT_BREAK_RULES
) {
  const summary = calculateBreakSummary(
    shiftMinutes,
    config
  );

  return Math.max(
    Math.round(shiftMinutes || 0) -
      summary.productiveBreakMinutes,
    0
  );
}
