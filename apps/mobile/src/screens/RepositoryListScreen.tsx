/**
 * Repository list screen.
 *
 * Fetches the user's GitHub repos via the agent (not the GitHub API directly)
 * so the GitHub token never leaves the agent machine.
 *
 * Uses FlatList for virtualization (Principle VI — no ScrollView for lists).
 */
import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import type { ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAgentStore } from '../store/agentStore';
import { useAgentConnection } from '../hooks/useAgentConnection';
import type { RepositoryListScreenProps } from '../navigation/RootNavigator';
import type { Repository } from '../types/protocol';

export default function RepositoryListScreen({
  navigation,
}: RepositoryListScreenProps): React.JSX.Element {
  const theme = useTheme();
  const { state, dispatch } = useAgentStore();
  const { fetchRepos } = useAgentConnection();

  const styles = makeStyles(theme);
  const isLoading = !state.reposFetched;

  useEffect(() => {
    fetchRepos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectRepo = useCallback(
    (repo: Repository): void => {
      dispatch({ type: 'REPO_SELECTED', repo });
      navigation.navigate('Chat', { repoFullName: repo.fullName });
    },
    [dispatch, navigation]
  );

  const renderItem: ListRenderItem<Repository> = useCallback(
    ({ item }) => (
      <TouchableOpacity
        style={styles.repoRow}
        onPress={() => handleSelectRepo(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.fullName}`}
        accessibilityHint={item.description ?? undefined}
      >
        <View style={styles.repoInfo}>
          <Text style={styles.repoName} numberOfLines={1}>
            {item.fullName}
          </Text>
          {item.description ? (
            <Text style={styles.repoDescription} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          <View style={styles.repoBadges}>
            {item.language ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.language}</Text>
              </View>
            ) : null}
            {item.private ? (
              <View style={[styles.badge, styles.badgePrivate]}>
                <Text style={styles.badgeText}>private</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={styles.chevron}>
          ›
        </Text>
      </TouchableOpacity>
    ),
    [styles, handleSelectRepo]
  );

  const keyExtractor = useCallback((item: Repository) => String(item.id), []);

  const handleSettingsPress = useCallback((): void => {
    navigation.navigate('Settings');
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSettingsPress}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerButtonText}>⚙</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, styles, handleSettingsPress]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center} edges={['left', 'right', 'bottom']}>
        <ActivityIndicator
          size="large"
          color={theme.colors.accent}
          accessibilityLabel="Loading repositories"
        />
        <Text style={styles.loadingText}>Fetching repositories…</Text>
      </SafeAreaView>
    );
  }

  if (state.repositories.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['left', 'right', 'bottom']}>
        <Text style={styles.emptyTitle}>No repositories found</Text>
        <Text style={styles.emptyBody}>
          Make sure your GitHub token is configured on the agent and you have at least one repository.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={state.repositories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onRefresh={fetchRepos}
        refreshing={false}
        accessibilityLabel="Repository list"
      />
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
    loadingText: {
      marginTop: theme.spacing.md,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    emptyTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    emptyBody: {
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      textAlign: 'center',
      paddingHorizontal: theme.spacing.xl,
      lineHeight: 20,
    },
    listContent: {
      paddingVertical: theme.spacing.sm,
    },
    repoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      backgroundColor: theme.colors.backgroundPrimary,
      minHeight: 64,
    },
    repoInfo: {
      flex: 1,
    },
    repoName: {
      fontSize: theme.fontSize.md,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    repoDescription: {
      marginTop: 2,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    repoBadges: {
      flexDirection: 'row',
      marginTop: theme.spacing.xs,
      gap: theme.spacing.xs,
    },
    badge: {
      backgroundColor: theme.colors.backgroundTertiary,
      borderRadius: theme.radius.full,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
    },
    badgePrivate: {
      backgroundColor: theme.colors.backgroundTertiary,
    },
    badgeText: {
      fontSize: theme.fontSize.sm - 2,
      color: theme.colors.textSecondary,
    },
    separator: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginLeft: theme.spacing.lg,
    },
    chevron: {
      fontSize: 24,
      color: theme.colors.textTertiary,
      marginLeft: theme.spacing.sm,
    },
    headerButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerButtonText: {
      fontSize: theme.fontSize.lg,
      color: theme.colors.accent,
    },
  });
}
