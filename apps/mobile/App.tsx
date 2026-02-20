/**
 * App entry point.
 *
 * Wraps the app in:
 *  - SafeAreaProvider  — safe area insets for notch/Dynamic Island/home bar
 *  - AgentProvider     — global agent session state
 *  - RootNavigator     — navigation
 */
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AgentProvider } from './src/store/agentStore';
import RootNavigator from './src/navigation/RootNavigator';

// Configure how push notifications behave when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App(): React.JSX.Element {
  useEffect(() => {
    // Request push notification permissions on first launch
    void Notifications.requestPermissionsAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <AgentProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AgentProvider>
    </SafeAreaProvider>
  );
}
