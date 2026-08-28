import AsyncStorage from '@react-native-async-storage/async-storage';

import { appendAuditLog } from './auditLog';
import {
  NIGHT_CAPTAIN_DAYS,
  NIGHT_CAPTAIN_ID,
} from './nightCaptainConfig';
import {
  getDateKey,
  getNightfillDate,
} from './nightfillPlanning';
import {
  NIGHTFILL_STORAGE,
  readStorage,
  writeStorage,
} from './nightfillStorage';

const SEED_KEY = 'groceryProvidedRosterSeed_v1';
const ALL_DAYS = [...NIGHT_CAPTAIN_DAYS];

type ShiftSegment = {
  startTime: string;
  finishTime: string;
};

type ProvidedShift = {
  name: string;
  startTime: string;
  finishTime: string;
  note?: string;
  shiftSegments?: ShiftSegment[];
};

type EmployeeRecord = {
  id: string;
  name: string;
  employeeId: string;
  employmentType: string;
  contractDays: string[];
  dayHours: Record<string, string>;
  weeklyContractHours: number;
  availableDays: string[];
  notes: string;
  createdAt: string;
  aisleSkills?: Record<string, number>;
};

type RosterEntry = {
  employeeId: string;
  hours: string;
  startTime: string;
  finishTime: string;
  status: 'Working';
  isExtra: boolean;
  rosterNote?: string;
  shiftSegments?: ShiftSegment[];
};

type SavedRoster = Record<string, RosterEntry[]>;

const PROVIDED_ROSTER: Record<string, ProvidedShift[]> = {
  Monday: [
    { name: 'Adrian', startTime: '20:30', finishTime: '00:00' },
    { name: 'Abdullah', startTime: '20:00', finishTime: '01:00' },
    { name: 'Fahad', startTime: '20:00', finishTime: '01:00' },
    { name: 'David', startTime: '19:00', finishTime: '00:00' },
    { name: 'Mehedi', startTime: '21:30', finishTime: '01:00' },
    { name: 'Jerry', startTime: '21:00', finishTime: '00:30' },
    { name: 'Richie', startTime: '21:30', finishTime: '01:00' },
    { name: 'Paul', startTime: '21:15', finishTime: '00:45' },
  ],
  Tuesday: [
    { name: 'Adrian', startTime: '16:00', finishTime: '00:00' },
    { name: 'Shainur', startTime: '15:00', finishTime: '00:00' },
    {
      name: 'Fahad',
      startTime: '21:30',
      finishTime: '01:00',
      note: 'Also listed 19:00-21:00 before the 21:30-01:00 Nightfill block.',
      shiftSegments: [
        { startTime: '19:00', finishTime: '21:00' },
        { startTime: '21:30', finishTime: '01:00' },
      ],
    },
    { name: 'Faysal', startTime: '21:30', finishTime: '01:00' },
    { name: 'David', startTime: '19:00', finishTime: '00:00' },
    { name: 'Manas', startTime: '16:00', finishTime: '01:00' },
    { name: 'Bob', startTime: '21:30', finishTime: '01:00' },
    { name: 'Jerry', startTime: '21:00', finishTime: '00:30' },
    { name: 'Paul', startTime: '21:15', finishTime: '00:45' },
  ],
  Wednesday: [
    { name: 'Adrian', startTime: '21:00', finishTime: '00:00' },
    { name: 'Paul', startTime: '21:45', finishTime: '01:00' },
    { name: 'Fahad', startTime: '22:00', finishTime: '01:00' },
    { name: 'Shainur', startTime: '22:00', finishTime: '01:00' },
    { name: 'David', startTime: '19:00', finishTime: '00:00' },
    { name: 'Manas', startTime: '16:00', finishTime: '01:00' },
  ],
  Thursday: [
    { name: 'David', startTime: '19:00', finishTime: '00:00' },
    { name: 'Mehedi', startTime: '21:45', finishTime: '01:00' },
    { name: 'Imon', startTime: '20:00', finishTime: '01:00' },
    { name: 'Manas', startTime: '16:00', finishTime: '01:00' },
    { name: 'Bob', startTime: '21:45', finishTime: '01:00' },
    { name: 'Jerry', startTime: '21:15', finishTime: '00:30' },
    { name: 'Aqil', startTime: '21:45', finishTime: '01:00' },
    { name: 'Faysal', startTime: '21:45', finishTime: '01:00' },
    { name: 'Paul', startTime: '21:30', finishTime: '00:45' },
  ],
  Friday: [
    { name: 'Manas', startTime: '16:00', finishTime: '01:00' },
    { name: 'Richie', startTime: '21:30', finishTime: '01:00' },
    { name: 'Abdullah', startTime: '20:30', finishTime: '01:30' },
    {
      name: 'Bob',
      startTime: '22:30',
      finishTime: '02:00',
      note: 'Alternative supplied: if starting 22:00, finish 01:30.',
    },
    { name: 'Fahad', startTime: '21:00', finishTime: '01:30' },
  ],
  Saturday: [
    { name: 'Abdullah', startTime: '21:00', finishTime: '01:00' },
    { name: 'Fahad', startTime: '21:00', finishTime: '01:00' },
    { name: 'Vineeth', startTime: '21:30', finishTime: '01:00' },
    { name: 'Mehedi', startTime: '21:30', finishTime: '01:00' },
    { name: 'Imon', startTime: '19:00', finishTime: '01:00' },
    { name: 'Bob', startTime: '21:15', finishTime: '00:45' },
    { name: 'Shainur', startTime: '20:00', finishTime: '01:00' },
    { name: 'Jerry', startTime: '21:15', finishTime: '00:45' },
    { name: 'Richie', startTime: '21:30', finishTime: '01:00' },
  ],
  Sunday: [
    { name: 'Faysal', startTime: '22:00', finishTime: '01:00' },
    { name: 'Abdullah', startTime: '22:00', finishTime: '01:00' },
    { name: 'Richie', startTime: '22:00', finishTime: '01:00' },
    { name: 'Aqil', startTime: '22:00', finishTime: '01:00' },
    { name: 'Fahad', startTime: '22:00', finishTime: '01:00' },
    { name: 'Shainur', startTime: '22:00', finishTime: '01:00' },
    { name: 'Imon', startTime: '18:00', finishTime: '01:00' },
  ],
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function canonicalName(value: string) {
  const clean = value.trim();
  if (clean.toLowerCase() === 'sainur') return 'Shainur';
  return clean;
}

function shiftMinutes(startTime: string, finishTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [finishHour, finishMinute] = finishTime.split(':').map(Number);

  const start = startHour * 60 + startMinute;
  let finish = finishHour * 60 + finishMinute;
  if (finish <= start) finish += 24 * 60;

  return Math.max(finish - start, 0);
}

function totalShiftMinutes(shift: ProvidedShift) {
  if (shift.shiftSegments?.length) {
    return shift.shiftSegments.reduce(
      (total, segment) =>
        total + shiftMinutes(segment.startTime, segment.finishTime),
      0
    );
  }

  return shiftMinutes(shift.startTime, shift.finishTime);
}

function mondayForCurrentNightfillWeek() {
  const date = getNightfillDate();
  const monday = new Date(date);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  monday.setDate(date.getDate() - daysSinceMonday);
  monday.setHours(12, 0, 0, 0);
  return monday;
}

function dateKeyForDay(day: string) {
  const monday = mondayForCurrentNightfillWeek();
  const index = ALL_DAYS.indexOf(day as (typeof ALL_DAYS)[number]);
  const date = new Date(monday);
  date.setDate(monday.getDate() + Math.max(index, 0));
  return getDateKey(date);
}

function daysWorkedByName() {
  const result = new Map<string, string[]>();

  for (const day of ALL_DAYS) {
    for (const shift of PROVIDED_ROSTER[day] || []) {
      const name = canonicalName(shift.name);
      const days = result.get(name) || [];
      if (!days.includes(day)) days.push(day);
      result.set(name, days);
    }
  }

  return result;
}

function contractDayHours(days: string[]) {
  if (days.length === 0) return {} as Record<string, string>;

  const baseMinutes = Math.floor((12 * 60) / days.length);
  let remainder = 12 * 60 - baseMinutes * days.length;
  const result: Record<string, string> = {};

  for (const day of days) {
    const minutes = baseMinutes + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    result[day] = (minutes / 60).toFixed(2);
  }

  return result;
}

function findExistingEmployee(
  employees: EmployeeRecord[],
  name: string
) {
  const lower = canonicalName(name).toLowerCase();
  return employees.find(
    (employee) => canonicalName(employee.name).toLowerCase() === lower
  );
}

export async function seedProvidedWeeklyRoster({
  force = false,
}: {
  force?: boolean;
} = {}) {
  const previousSeed = await AsyncStorage.getItem(SEED_KEY);

  if (previousSeed && !force) {
    return {
      imported: false,
      alreadySeeded: true,
      employeeCount: 0,
      partTimeCount: 0,
      casualCount: 0,
    };
  }

  const existingEmployees = await readStorage<EmployeeRecord[]>(
    'groceryEmployees',
    []
  );
  const existingRoster = await readStorage<SavedRoster>(
    NIGHTFILL_STORAGE.roster,
    {}
  );

  const workedDays = daysWorkedByName();
  const employeeIdByName = new Map<string, string>();
  let createdCount = 0;
  let updatedCount = 0;
  let partTimeCount = 0;
  let casualCount = 0;

  let nextEmployees = [...existingEmployees];

  for (const [name, days] of workedDays.entries()) {
    const existing = findExistingEmployee(nextEmployees, name);
    const isPartTime = days.length >= 3;

    if (isPartTime) partTimeCount += 1;
    else casualCount += 1;

    const record: EmployeeRecord = {
      id: existing?.id || `seed-${slug(name)}`,
      name,
      employeeId: existing?.employeeId || `TEAM-${slug(name).toUpperCase()}`,
      employmentType: isPartTime ? 'Part-time' : 'Casual',
      contractDays: isPartTime ? [...days] : [],
      dayHours: isPartTime ? contractDayHours(days) : {},
      weeklyContractHours: isPartTime ? 12 : 0,
      availableDays: [...ALL_DAYS],
      notes:
        existing?.notes ||
        (isPartTime
          ? 'Imported 7-day roster · 12h weekly contract · available all days.'
          : 'Imported 7-day roster · works fewer than 3 days · available all days.'),
      createdAt: existing?.createdAt || new Date().toISOString(),
      aisleSkills: existing?.aisleSkills || {},
    };

    employeeIdByName.set(name.toLowerCase(), record.id);

    if (existing) {
      nextEmployees = nextEmployees.map((employee) =>
        employee.id === existing.id
          ? { ...employee, ...record }
          : employee
      );
      updatedCount += 1;
    } else {
      nextEmployees.push(record);
      createdCount += 1;
    }
  }

  const nextRoster: SavedRoster = { ...existingRoster };

  for (const day of ALL_DAYS) {
    const previousDayEntries =
      nextRoster[dateKeyForDay(day)] ||
      nextRoster[day] ||
      [];

    const captainEntries = previousDayEntries.filter(
      (entry) => entry.employeeId === NIGHT_CAPTAIN_ID
    );

    const importedEntries: RosterEntry[] = (PROVIDED_ROSTER[day] || []).map(
      (shift) => {
        const name = canonicalName(shift.name);
        const employeeId =
          employeeIdByName.get(name.toLowerCase()) || `seed-${slug(name)}`;
        const days = workedDays.get(name) || [];
        const isPartTime = days.length >= 3;
        const minutes = totalShiftMinutes(shift);

        return {
          employeeId,
          hours: (minutes / 60).toFixed(2),
          startTime: shift.startTime,
          finishTime: shift.finishTime,
          status: 'Working',
          isExtra: !isPartTime,
          rosterNote: shift.note,
          shiftSegments: shift.shiftSegments,
        };
      }
    );

    const combined = [...captainEntries, ...importedEntries];
    nextRoster[day] = combined;
    nextRoster[dateKeyForDay(day)] = combined;
  }

  await AsyncStorage.setItem(
    'groceryEmployees',
    JSON.stringify(nextEmployees)
  );
  await writeStorage(NIGHTFILL_STORAGE.roster, nextRoster);
  await AsyncStorage.setItem(
    SEED_KEY,
    JSON.stringify({
      importedAt: new Date().toISOString(),
      version: 1,
    })
  );

  await appendAuditLog({
    category: 'Roster',
    action: force
      ? 'Provided 7-day roster re-imported'
      : 'Provided 7-day roster imported',
    details:
      `${workedDays.size} employees · ${partTimeCount} on 12h contracts · ${casualCount} under 3 days · availability all 7 days`,
  });

  return {
    imported: true,
    alreadySeeded: false,
    employeeCount: workedDays.size,
    createdCount,
    updatedCount,
    partTimeCount,
    casualCount,
  };
}
