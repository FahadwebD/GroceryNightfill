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

import { appendAuditLog } from '../utils/auditLog';
import {
  DEFAULT_BREAK_RULES,
  getBreakRules,
  resetBreakRules,
  saveBreakRules,
  type BreakRulesConfig,
} from '../utils/breakRules';

function hoursMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function parseThreshold(value: string) {
  const text = value.trim();
  if (!text) return null;

  if (text.includes(':')) {
    const [hourText, minuteText = '0'] = text.split(':');
    const hours = Number(hourText);
    const minutes = Number(minuteText);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    return Math.round(hours * 60 + minutes);
  }

  const hours = Number(text);
  if (Number.isNaN(hours) || hours < 0) {
    return null;
  }

  return Math.round(hours * 60);
}

export default function BreakRulesScreen() {
  const [config, setConfig] =
    useState<BreakRulesConfig>(
      DEFAULT_BREAK_RULES
    );

  const [paidThreshold, setPaidThreshold] =
    useState('3:45');
  const [paidMinutes, setPaidMinutes] =
    useState('15');
  const [mealThreshold, setMealThreshold] =
    useState('5:30');
  const [mealMinutes, setMealMinutes] =
    useState('30');
  const [saving, setSaving] =
    useState(false);

  async function load() {
    const saved = await getBreakRules();
    setConfig(saved);
    setPaidThreshold(
      hoursMinutes(
        saved.paidBreakThresholdMinutes
      )
    );
    setPaidMinutes(
      String(saved.paidBreakMinutes)
    );
    setMealThreshold(
      hoursMinutes(
        saved.mealBreakThresholdMinutes
      )
    );
    setMealMinutes(
      String(saved.mealBreakMinutes)
    );
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  function toggle(
    key: keyof BreakRulesConfig
  ) {
    setConfig((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function save() {
    const paidThresholdMinutes =
      parseThreshold(paidThreshold);
    const mealThresholdMinutes =
      parseThreshold(mealThreshold);
    const paid = Number(paidMinutes);
    const meal = Number(mealMinutes);

    if (
      paidThresholdMinutes === null ||
      mealThresholdMinutes === null ||
      Number.isNaN(paid) ||
      Number.isNaN(meal) ||
      paid < 0 ||
      meal < 0
    ) {
      Alert.alert(
        'Check Break Rules',
        'Use valid thresholds such as 3:45 and 5:30, and valid break minutes.'
      );
      return;
    }

    try {
      setSaving(true);

      const next = await saveBreakRules({
        ...config,
        paidBreakThresholdMinutes,
        paidBreakMinutes:
          Math.round(paid),
        mealBreakThresholdMinutes,
        mealBreakMinutes:
          Math.round(meal),
      });

      setConfig(next);

      await appendAuditLog({
        category: 'Settings',
        action: 'Break rules updated',
        details:
          `Paid ${next.paidBreakMinutes}m after ${hoursMinutes(
            next.paidBreakThresholdMinutes
          )} · Meal ${next.mealBreakMinutes}m after ${hoursMinutes(
            next.mealBreakThresholdMinutes
          )}`,
      });

      Alert.alert(
        'Break Rules Saved',
        'Productive labour calculations will use these break rules.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    const defaults = await resetBreakRules();
    setConfig(defaults);
    setPaidThreshold(
      hoursMinutes(
        defaults.paidBreakThresholdMinutes
      )
    );
    setPaidMinutes(
      String(defaults.paidBreakMinutes)
    );
    setMealThreshold(
      hoursMinutes(
        defaults.mealBreakThresholdMinutes
      )
    );
    setMealMinutes(
      String(defaults.mealBreakMinutes)
    );

    await appendAuditLog({
      category: 'Settings',
      action: 'Break rules reset to default',
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
        >
          <Text style={styles.back}>‹ Settings</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Break Rules</Text>
        <Text style={styles.subtitle}>
          Convert rostered shift time into productive Nightfill labour
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ToggleCard
          title="Use break deductions"
          subtitle="When enabled, qualifying breaks reduce productive labour available for the load."
          value={config.enabled}
          onPress={() => toggle('enabled')}
        />

        <Text style={styles.sectionTitle}>Paid Break</Text>

        <ToggleCard
          title="Paid break enabled"
          subtitle="Apply the paid break after the configured shift threshold."
          value={config.paidBreakEnabled}
          onPress={() =>
            toggle('paidBreakEnabled')
          }
        />

        <View style={styles.ruleCard}>
          <InputField
            label="Threshold"
            value={paidThreshold}
            onChange={setPaidThreshold}
            placeholder="3:45"
            suffix="shift"
          />
          <InputField
            label="Break"
            value={paidMinutes}
            onChange={setPaidMinutes}
            placeholder="15"
            suffix="min"
          />
        </View>

        <ToggleCard
          title="Deduct paid break from productive labour"
          subtitle="The employee is still rostered for the full shift, but this break is not counted as aisle/load working time."
          value={
            config.deductPaidBreakFromProductiveLabour
          }
          onPress={() =>
            toggle(
              'deductPaidBreakFromProductiveLabour'
            )
          }
        />

        <Text style={styles.sectionTitle}>Meal Break</Text>

        <ToggleCard
          title="Meal break enabled"
          subtitle="Apply the meal break after the configured shift threshold."
          value={config.mealBreakEnabled}
          onPress={() =>
            toggle('mealBreakEnabled')
          }
        />

        <View style={styles.ruleCard}>
          <InputField
            label="Threshold"
            value={mealThreshold}
            onChange={setMealThreshold}
            placeholder="5:30"
            suffix="shift"
          />
          <InputField
            label="Break"
            value={mealMinutes}
            onChange={setMealMinutes}
            placeholder="30"
            suffix="min"
          />
        </View>

        <ToggleCard
          title="Deduct meal break from productive labour"
          subtitle="Reduces load-working capacity by the configured meal-break minutes."
          value={
            config.deductMealBreakFromProductiveLabour
          }
          onPress={() =>
            toggle(
              'deductMealBreakFromProductiveLabour'
            )
          }
        />

        <View style={styles.exampleCard}>
          <Text style={styles.exampleTitle}>
            Example · 9 hour shift
          </Text>
          <Text style={styles.exampleText}>
            With the current defaults, a qualifying 15m paid break and 30m meal break reserve 45m, leaving about 8h 15m of productive labour before considering load arrival time.
          </Text>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>
            Planning assumption
          </Text>
          <Text style={styles.noteText}>
            The current planner reserves qualifying break minutes from available load labour. It does not yet record the exact clock time each break is taken.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.saveButton}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveText}>
            {saving
              ? 'Saving…'
              : 'Save Break Rules'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resetButton}
          onPress={reset}
        >
          <Text style={styles.resetText}>
            Reset Defaults
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ToggleCard({
  title,
  subtitle,
  value,
  onPress,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.toggleCard}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>
          {title}
        </Text>
        <Text style={styles.cardSubtitle}>
          {subtitle}
        </Text>
      </View>
      <View
        style={[
          styles.switch,
          value && styles.switchOn,
        ]}
      >
        <View
          style={[
            styles.switchDot,
            value && styles.switchDotOn,
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suffix: string;
}) {
  return (
    <View style={styles.inputField}>
      <Text style={styles.inputLabel}>
        {label}
      </Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          keyboardType="numbers-and-punctuation"
          style={styles.input}
        />
        <Text style={styles.suffix}>
          {suffix}
        </Text>
      </View>
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
    paddingBottom: 24,
  },
  back: {
    color: '#D5DBED',
    fontSize: 14,
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#D5DBED',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  content: {
    padding: 16,
    paddingBottom: 55,
  },
  sectionTitle: {
    color: '#101828',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 9,
  },
  toggleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    color: '#101828',
    fontSize: 13,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: '#667085',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  switch: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 3,
    backgroundColor: '#D0D5DD',
    justifyContent: 'center',
  },
  switchOn: {
    backgroundColor: '#2436B2',
  },
  switchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  switchDotOn: {
    alignSelf: 'flex-end',
  },
  ruleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 9,
    flexDirection: 'row',
    gap: 10,
  },
  inputField: {
    flex: 1,
  },
  inputLabel: {
    color: '#667085',
    fontSize: 9,
    marginBottom: 5,
  },
  inputWrap: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    color: '#101828',
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 11,
  },
  suffix: {
    color: '#98A2B3',
    fontSize: 8,
  },
  exampleCard: {
    backgroundColor: '#E9ECFF',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  exampleTitle: {
    color: '#2436B2',
    fontSize: 11,
    fontWeight: '800',
  },
  exampleText: {
    color: '#475467',
    fontSize: 9,
    lineHeight: 15,
    marginTop: 4,
  },
  noteCard: {
    backgroundColor: '#FFF4E5',
    borderRadius: 14,
    padding: 14,
    marginTop: 9,
  },
  noteTitle: {
    color: '#B54708',
    fontSize: 11,
    fontWeight: '800',
  },
  noteText: {
    color: '#7A2E0E',
    fontSize: 9,
    lineHeight: 15,
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#2436B2',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  resetButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  resetText: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
  },
});
