/**
 * Chat screen.
 *
 * Displays a streaming conversation with Claude Code running on the agent.
 * Messages appear token-by-token as they arrive over WebSocket.
 *
 * The "Run autonomously" button converts the current conversation into a
 * background task and navigates to TaskStatusScreen.
 *
 * Performance notes (Principle VI):
 *  - FlatList used for the message list (virtualized)
 *  - `React.memo` on the message bubble prevents unnecessary re-renders
 *  - Streaming appends to the last message in-place via the reducer
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import type { ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAgentStore } from '../store/agentStore';
import { useAgentConnection } from '../hooks/useAgentConnection';
import type { ChatMessage } from '../store/agentStore';
import type { ChatScreenProps } from '../navigation/RootNavigator';

// ─── Message bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  message: ChatMessage;
  theme: ReturnType<typeof useTheme>;
}

const MessageBubble = React.memo(function MessageBubble({
  message,
  theme,
}: BubbleProps): React.JSX.Element {
  const isUser = message.role === 'user';
  const styles = makeBubbleStyles(theme, isUser);

  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`${message.role === 'user' ? 'You' : 'Claude'}: ${message.text}`}
    >
      <View style={styles.bubble}>
        <Text style={styles.text} selectable>
          {message.text}
          {message.isStreaming ? (
            <Text style={styles.cursor}>
              ▌
            </Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeBubbleStyles(theme: ReturnType<typeof useTheme>, isUser: boolean) {
  return StyleSheet.create({
    row: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      alignItems: isUser ? 'flex-end' : 'flex-start',
    },
    bubble: {
      maxWidth: '85%',
      backgroundColor: isUser ? theme.colors.accent : theme.colors.backgroundSecondary,
      borderRadius: theme.radius.lg,
      borderBottomRightRadius: isUser ? theme.radius.sm : theme.radius.lg,
      borderBottomLeftRadius: isUser ? theme.radius.lg : theme.radius.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    text: {
      fontSize: theme.fontSize.md,
      color: isUser ? theme.colors.accentForeground : theme.colors.textPrimary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      lineHeight: 20,
    },
    cursor: {
      color: theme.colors.textTertiary,
    },
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation }: ChatScreenProps): React.JSX.Element {
  const theme = useTheme();
  const { state } = useAgentStore();
  const { sendChat, startTask } = useAgentConnection();
  const styles = makeStyles(theme);

  const [inputText, setInputText] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const isStreaming = state.chatMessages.some((m) => m.isStreaming);

  const handleSend = useCallback((): void => {
    const text = inputText.trim();
    if (!text || isStreaming) return;
    setInputText('');
    sendChat(text);
  }, [inputText, isStreaming, sendChat]);

  const handleRunAutonomously = useCallback((): void => {
    // Summarise the conversation as context for the autonomous task
    const context = state.chatMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Claude'}: ${m.text}`)
      .join('\n\n');
    startTask(context);
    navigation.navigate('TaskStatus');
  }, [state.chatMessages, startTask, navigation]);

  const renderItem: ListRenderItem<ChatMessage> = useCallback(
    ({ item }) => <MessageBubble message={item} theme={theme} />,
    [theme]
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const canRunAutonomously =
    state.chatMessages.length > 0 && !isStreaming && state.selectedRepo !== null;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Message list */}
        {state.chatMessages.length === 0 ? (
          <View style={styles.emptyState} accessibilityRole="text">
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptyBody}>
              Ask about the code, request a change, or describe a task.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={state.chatMessages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            accessibilityLabel="Chat messages"
          />
        )}

        {/* "Run autonomously" button — appears once there's conversation content */}
        {canRunAutonomously && (
          <TouchableOpacity
            style={styles.autonomousButton}
            onPress={handleRunAutonomously}
            accessibilityRole="button"
            accessibilityLabel="Run autonomously"
            accessibilityHint="Hand off this task to the agent to run in the background and open a PR"
          >
            <Text style={styles.autonomousButtonLabel}>Run autonomously →</Text>
          </TouchableOpacity>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message Claude…"
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            maxLength={4000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
            accessibilityLabel="Message input"
            accessibilityHint="Type your message to Claude"
            editable={!isStreaming}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isStreaming) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isStreaming}
            accessibilityRole="button"
            accessibilityLabel={isStreaming ? 'Waiting for response' : 'Send message'}
            accessibilityState={{ disabled: !inputText.trim() || isStreaming, busy: isStreaming }}
          >
            {isStreaming ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.accentForeground}
                accessibilityLabel="Streaming response"
              />
            ) : (
              <Text style={styles.sendButtonLabel}>
                ↑
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    flex: { flex: 1 },
    listContent: {
      paddingVertical: theme.spacing.sm,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
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
      lineHeight: 20,
    },
    autonomousButton: {
      marginHorizontal: theme.spacing.md,
      marginVertical: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
    },
    autonomousButtonLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: '600',
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundPrimary,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: theme.fontSize.md,
      color: theme.colors.textPrimary,
      marginRight: theme.spacing.sm,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
    sendButtonLabel: {
      fontSize: theme.fontSize.lg,
      color: theme.colors.accentForeground,
      fontWeight: '700',
    },
  });
}
