import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: '#2436B2',
        tabBarInactiveTintColor: '#98A2B3',

        tabBarStyle: {
          height: 82,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E4E7EC',
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      {/* VISIBLE BOTTOM TABS */}

      <Tabs.Screen
        name="index"
        options={{
          title: 'Tonight',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="moon-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="week"
        options={{
          title: 'Week',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="calendar-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="employees"
        options={{
          title: 'Employees',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="people-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'History',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="time-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="settings-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* HIDDEN OPERATION SCREENS */}

      <Tabs.Screen
        name="scan-load"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="allocation"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="team-plan"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="live-progress"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="night-summary"
        options={{
          href: null,
        }}
      />

      {/* HIDDEN EMPLOYEE SCREENS */}

      <Tabs.Screen
        name="add-employee"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="employee/[id]"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="employee/skills/[id]"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="employee/edit/[id]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
  name="load-arrival"
  options={{
    href: null,
  }}
/>

      {/* OTHER HIDDEN SCREEN */}

      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}