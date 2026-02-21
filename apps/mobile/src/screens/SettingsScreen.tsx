/**
 * Settings screen (modal).
 *
 * Shows connection status and lets the user disconnect from their agent.
 * Disconnecting clears the stored session token from secure storage.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAgentStore } from '../store/agentStore';
import { useAgentConnection } from '../hooks/useAgentConnection';
import type { SettingsScreenProps } from '../navigation/RootNavigator';

const APP_VERSION = '0.1.0';

export default function SettingsScreen({ navigation }: SettingsScreenProps): React.JSX.Element {
  const theme = useTheme();
  const { state } = useAgentStore();
  const { disconnectOnly, disconnect } = useAgentConnection();
  const styles = makeStyles(theme);

  const handleDisconnectOnly = useCallback((): void => {
    Alert.alert(
      'Disconnect',
      'This will close the session. The pairing code stays valid — the app will reconnect automatically next time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void disconnectOnly();
            navigation.popToTop();
          },
        },
      ]
    );
  }, [disconnectOnly, navigation]);

  const handleInvalidate = useCallback((): void => {
    Alert.alert(
      'Invalidate pairing code',
      'This will invalidate the current pairing code and clear the stored session. A new pairing code will appear in the agent terminal — you will need to enter it to reconnect.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Invalidate',
          style: 'destructive',
          onPress: () => {
            void disconnect();
            navigation.popToTop();
          },
        },
      ]
    );
  }, [disconnect, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Connection status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Connection
        </Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: state.isConnected ? theme.colors.success : theme.colors.error },
              ]}
            />
            <Text
              style={styles.statusText}
              accessibilityLabel={state.isConnected ? 'Connected' : 'Disconnected'}
            >
              {state.isConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>

        {state.relayUrl && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Relay</Text>
            <Text style={styles.rowValue} numberOfLines={1} accessibilityRole="text">
              {state.relayUrl.replace(/^wss?:\/\//, '')}
            </Text>
          </View>
        )}
      </View>

      {/* Disconnect buttons */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.destructiveButton}
          onPress={handleDisconnectOnly}
          accessibilityRole="button"
          accessibilityLabel="Disconnect"
          accessibilityHint="Closes the session but keeps the pairing code so the app can reconnect automatically"
        >
          <Text style={styles.destructiveButtonLabel}>Disconnect…</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.destructiveButton, styles.destructiveButtonBorder]}
          onPress={handleInvalidate}
          accessibilityRole="button"
          accessibilityLabel="Disconnect and invalidate pairing code"
          accessibilityHint="Invalidates the pairing code and clears the stored session, returning to the pairing screen"
        >
          <Text style={styles.destructiveButtonLabel}>Disconnect and invalidate pairing code…</Text>
        </TouchableOpacity>
      </View>

      {/* App version footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText} accessibilityRole="text">
          Claude on Mobile v{APP_VERSION}
        </Text>
      </View>
    </SafeAreaView>
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.backgroundPrimary,
    },
    section: {
      marginTop: theme.spacing.lg,
      marginHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm + 4,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      minHeight: 44,
    },
    rowLabel: {
      fontSize: theme.fontSize.md,
      color: theme.colors.textPrimary,
    },
    rowValue: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      textAlign: 'right',
      marginLeft: theme.spacing.md,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: theme.spacing.xs,
    },
    statusText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    destructiveButton: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm + 4,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    destructiveButtonBorder: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    destructiveButtonLabel: {
      fontSize: theme.fontSize.md,
      color: theme.colors.error,
      fontWeight: '500',
    },
    footer: {
      marginTop: 'auto',
      paddingVertical: theme.spacing.xl,
      alignItems: 'center',
    },
    footerText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
    },
  });
}
