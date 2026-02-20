/**
 * Onboarding / pairing screen.
 *
 * Displayed when no session token is stored. The user enters:
 *  1. The relay URL (defaults to the production relay)
 *  2. The 6-digit pairing code shown by the agent after setup
 *
 * On success, the session token is persisted and the app navigates to
 * RepositoryListScreen automatically (via RootNavigator watching isConnected).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAgentConnection } from '../hooks/useAgentConnection';


const DEFAULT_RELAY_URL = 'wss://relay.claude-mobile.app';

export default function OnboardingScreen(): React.JSX.Element {
  const theme = useTheme();
  const { pair } = useAgentConnection();

  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [pairingCode, setPairingCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const styles = makeStyles(theme);

  const canSubmit = pairingCode.trim().length === 6 && relayUrl.trim().length > 0 && !isLoading;

  const handlePair = async (): Promise<void> => {
    if (!canSubmit) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await pair(relayUrl.trim(), pairingCode.trim());
      // RootNavigator will re-render to the app stack automatically
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      setErrorMessage(msg);
      // Announce to screen readers
      void AccessibilityInfo.announceForAccessibility(`Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header} accessibilityRole="header">
            <Text style={styles.title} accessibilityLabel="Claude on Mobile">
              Claude on Mobile
            </Text>
            <Text style={styles.subtitle}>Connect your agent to get started</Text>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>How to set up</Text>
            <Text style={styles.instructionsBody}>
              1. Run{' '}
              <Text style={styles.code}>npx @claude-mobile/agent setup</Text>
              {' '}on your machine or VPS.{'\n\n'}
              2. The agent will display a 6-digit pairing code.{'\n\n'}
              3. Enter that code below.
            </Text>
          </View>

          {/* Relay URL (advanced) */}
          <View style={styles.field}>
            <Text style={styles.label} accessibilityRole="text">
              Relay URL
            </Text>
            <TextInput
              style={styles.input}
              value={relayUrl}
              onChangeText={setRelayUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={DEFAULT_RELAY_URL}
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel="Relay URL"
              accessibilityHint="The WebSocket URL of your relay server"
              returnKeyType="next"
            />
          </View>

          {/* Pairing code */}
          <View style={styles.field}>
            <Text style={styles.label} accessibilityRole="text">
              Pairing Code
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={pairingCode}
              onChangeText={(v) => setPairingCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel="Pairing code"
              accessibilityHint="6-digit code displayed by the agent"
              returnKeyType="done"
              onSubmitEditing={handlePair}
            />
          </View>

          {/* Error message */}
          {errorMessage && (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Connect button */}
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handlePair}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Connect"
            accessibilityState={{ disabled: !canSubmit, busy: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator
                color={theme.colors.accentForeground}
                accessibilityLabel="Connecting…"
              />
            ) : (
              <Text style={styles.buttonLabel}>Connect</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.backgroundPrimary,
    },
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      padding: theme.spacing.lg,
      justifyContent: 'center',
    },
    header: {
      marginBottom: theme.spacing.xl,
      alignItems: 'center',
    },
    title: {
      fontSize: theme.fontSize.xxl,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSize.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    instructionsCard: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    },
    instructionsTitle: {
      fontSize: theme.fontSize.md,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    instructionsBody: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    code: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      backgroundColor: theme.colors.codeBackground,
      color: theme.colors.codeForeground,
      fontSize: theme.fontSize.sm - 1,
    },
    field: {
      marginBottom: theme.spacing.md,
    },
    label: {
      fontSize: theme.fontSize.sm,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    input: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm + 4,
      fontSize: theme.fontSize.md,
      color: theme.colors.textPrimary,
      minHeight: 44,
    },
    codeInput: {
      fontSize: theme.fontSize.xl,
      letterSpacing: 8,
      textAlign: 'center',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    errorBanner: {
      backgroundColor: theme.colors.errorBackground,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSize.sm,
    },
    button: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.md,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    buttonDisabled: {
      opacity: 0.4,
    },
    buttonLabel: {
      color: theme.colors.accentForeground,
      fontSize: theme.fontSize.md,
      fontWeight: '600',
    },
  });
}
