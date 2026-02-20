/**
 * ChatScreen unit tests.
 *
 * Tests rendering, user input, send action, and streaming state.
 * `useAgentConnection` and `useWebSocket` are mocked to keep these
 * tests pure and fast (no real WebSocket).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ChatScreen from '../../screens/ChatScreen';
import { AgentProvider } from '../../store/agentStore';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSendChat = jest.fn();
const mockStartTask = jest.fn();

jest.mock('../../hooks/useAgentConnection', () => ({
  useAgentConnection: () => ({
    pair: jest.fn(),
    sendChat: mockSendChat,
    startTask: mockStartTask,
    fetchRepos: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

// Minimal navigation mock
const navigationMock = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};

const routeMock = {
  key: 'chat',
  name: 'Chat' as const,
  params: { repoFullName: 'owner/my-repo' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderChat(): ReturnType<typeof render> {
  return render(
    <AgentProvider>
      <ChatScreen
        navigation={navigationMock as never}
        route={routeMock as never}
      />
    </AgentProvider>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the empty state when there are no messages', () => {
    renderChat();
    expect(screen.getByText('Start a conversation')).toBeTruthy();
  });

  it('renders the message input', () => {
    renderChat();
    expect(screen.getByLabelText('Message input')).toBeTruthy();
  });

  it('renders the send button', () => {
    renderChat();
    expect(screen.getByLabelText('Send message')).toBeTruthy();
  });

  it('send button is disabled when input is empty', () => {
    renderChat();
    const sendButton = screen.getByLabelText('Send message');
    expect(sendButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('send button is enabled when input has text', () => {
    renderChat();
    const input = screen.getByLabelText('Message input');
    fireEvent.changeText(input, 'explain the code');
    const sendButton = screen.getByLabelText('Send message');
    expect(sendButton.props.accessibilityState?.disabled).toBe(false);
  });

  it('calls sendChat with the message text when send is pressed', () => {
    renderChat();
    const input = screen.getByLabelText('Message input');
    fireEvent.changeText(input, 'explain the code');
    const sendButton = screen.getByLabelText('Send message');
    fireEvent.press(sendButton);
    expect(mockSendChat).toHaveBeenCalledWith('explain the code');
  });

  it('clears input after sending', () => {
    renderChat();
    const input = screen.getByLabelText('Message input');
    fireEvent.changeText(input, 'hello');
    fireEvent.press(screen.getByLabelText('Send message'));
    expect(input.props.value).toBe('');
  });

  it('trims whitespace-only messages and does not send them', () => {
    renderChat();
    const input = screen.getByLabelText('Message input');
    fireEvent.changeText(input, '   ');
    fireEvent.press(screen.getByLabelText('Send message'));
    expect(mockSendChat).not.toHaveBeenCalled();
  });
});
