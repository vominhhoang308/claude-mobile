/**
 * Root navigation structure.
 *
 * Splits into two stacks based on whether a session is established:
 *  - Auth stack:  OnboardingScreen
 *  - App stack:   RepositoryListScreen → ChatScreen / TaskStatusScreen
 *                 plus SettingsScreen in a modal
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useAgentStore } from '../store/agentStore';
import { useTheme } from '../theme';
import OnboardingScreen from '../screens/OnboardingScreen';
import RepositoryListScreen from '../screens/RepositoryListScreen';
import ChatScreen from '../screens/ChatScreen';
import TaskStatusScreen from '../screens/TaskStatusScreen';
import SettingsScreen from '../screens/SettingsScreen';

// ─── Navigation type map ──────────────────────────────────────────────────────

export type AuthStackParamList = {
  Onboarding: undefined;
};

export type AppStackParamList = {
  RepositoryList: undefined;
  Chat: { repoFullName: string };
  TaskStatus: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

export type OnboardingScreenProps = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;
export type RepositoryListScreenProps = NativeStackScreenProps<
  AppStackParamList,
  'RepositoryList'
>;
export type ChatScreenProps = NativeStackScreenProps<AppStackParamList, 'Chat'>;
export type TaskStatusScreenProps = NativeStackScreenProps<AppStackParamList, 'TaskStatus'>;
export type SettingsScreenProps = NativeStackScreenProps<AppStackParamList, 'Settings'>;

// ─── Stacks ───────────────────────────────────────────────────────────────────

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator(): React.JSX.Element {
  const theme = useTheme();
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.backgroundPrimary },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { fontSize: theme.fontSize.md },
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
      }}
    >
      <AppStack.Screen
        name="RepositoryList"
        component={RepositoryListScreen}
        options={{ title: 'Repositories' }}
      />
      <AppStack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({ title: route.params.repoFullName })}
      />
      <AppStack.Screen name="TaskStatus" component={TaskStatusScreen} options={{ title: 'Task' }} />
      <AppStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings', presentation: 'modal' }}
      />
    </AppStack.Navigator>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function RootNavigator(): React.JSX.Element {
  const { state } = useAgentStore();
  const theme = useTheme();

  return (
    <NavigationContainer
      theme={{
        dark: false,
        colors: {
          primary: theme.colors.accent,
          background: theme.colors.backgroundPrimary,
          card: theme.colors.backgroundSecondary,
          text: theme.colors.textPrimary,
          border: theme.colors.border,
          notification: theme.colors.accent,
        },
      }}
    >
      {state.isConnected ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
