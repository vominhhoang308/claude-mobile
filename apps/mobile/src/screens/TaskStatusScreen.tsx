/**
 * Task status screen.
 *
 * Shows live log output streamed from the agent while an autonomous task
 * is running, then displays a link to the opened PR when done.
 *
 * The log is rendered in a ScrollView (fixed-height terminal-style box) — this
 * is acceptable here because it's a bounded, auto-scrolling log, not an
 * unbounded list. The PR action opens in the system browser.
 */
import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAgentStore } from '../store/agentStore';
import type { TaskStatusScreenProps } from '../navigation/RootNavigator';

export default function TaskStatusScreen({
  navigation,
}: TaskStatusScreenProps): React.JSX.Element {
  const theme = useTheme();
  const { state, dispatch } = useAgentStore();
  const styles = makeStyles(theme);
  const scrollRef = useRef<ScrollView>(null);

  const task = state.task;
  const isDone = task?.prUrl !== null && task?.prUrl !== undefined;

  // Auto-scroll log to bottom as new content arrives
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [task?.logs]);

  const handleOpenPR = useCallback(async (): Promise<void> => {
    if (!task?.prUrl) return;
    const canOpen = await Linking.canOpenURL(task.prUrl);
    if (canOpen) {
      await Linking.openURL(task.prUrl);
    }
  }, [task?.prUrl]);

  const handleDone = useCallback((): void => {
    dispatch({ type: 'TASK_RESET' });
    navigation.goBack();
  }, [dispatch, navigation]);

  if (!task) {
    return (
      <SafeAreaView style={styles.center} edges={['left', 'right', 'bottom']}>
        <Text style={styles.emptyText} accessibilityRole="text">
          No active task.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Status indicator */}
      <View style={styles.statusRow} accessibilityLiveRegion="polite">
        {!isDone ? (
          <>
            <ActivityIndicator
              size="small"
              color={theme.colors.accent}
              style={styles.spinner}
              accessibilityLabel="Task running"
            />
            <Text style={styles.statusText}>Agent is working…</Text>
          </>
        ) : (
          <Text style={styles.statusTextDone} accessibilityRole="text">
            ✓ Task complete
          </Text>
        )}
      </View>

      {/* Log output */}
      <ScrollView
        ref={scrollRef}
        style={styles.logContainer}
        contentContainerStyle={styles.logContent}
        accessibilityLabel="Task log"
        accessibilityRole="text"
      >
        <Text style={styles.logText} selectable>
          {task.logs || 'Waiting for agent…'}
        </Text>
      </ScrollView>

      {/* PR card */}
      {isDone && task.prUrl && (
        <View style={styles.prCard}>
          <Text style={styles.prTitle} numberOfLines={2} accessibilityRole="header">
            {task.prTitle ?? 'Pull Request'}
          </Text>
          <TouchableOpacity
            style={styles.prButton}
            onPress={handleOpenPR}
            accessibilityRole="link"
            accessibilityLabel="Open pull request"
            accessibilityHint="Opens the pull request in your browser"
          >
            <Text style={styles.prButtonLabel}>Open PR in GitHub →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={handleDone}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneButtonLabel}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
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
    center: {
      flex: 1,
      backgroundColor: theme.colors.backgroundPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: theme.fontSize.md,
      color: theme.colors.textSecondary,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    spinner: {
      marginRight: theme.spacing.sm,
    },
    statusText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    statusTextDone: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.success,
      fontWeight: '600',
    },
    logContainer: {
      flex: 1,
      backgroundColor: theme.colors.codeBackground,
      margin: theme.spacing.md,
      borderRadius: theme.radius.md,
    },
    logContent: {
      padding: theme.spacing.md,
    },
    logText: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: theme.fontSize.sm - 1,
      color: theme.colors.codeForeground,
      lineHeight: 18,
    },
    prCard: {
      margin: theme.spacing.md,
      padding: theme.spacing.md,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    prTitle: {
      fontSize: theme.fontSize.md,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.md,
    },
    prButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.md,
      paddingVertical: theme.spacing.sm + 4,
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
      marginBottom: theme.spacing.sm,
    },
    prButtonLabel: {
      color: theme.colors.accentForeground,
      fontSize: theme.fontSize.md,
      fontWeight: '600',
    },
    doneButton: {
      borderRadius: theme.radius.md,
      paddingVertical: theme.spacing.sm + 4,
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    doneButtonLabel: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
    },
  });
}
