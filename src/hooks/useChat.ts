import { useState, useCallback, useEffect } from 'react';
import { Message, ChatState } from '@/types/chat';

interface UseChatOptions {
  sessionId?: string;
}

interface UseChatReturn {
  messages: Message[];
  chatState: ChatState;
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearError: () => void;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatState, setChatState] = useState<ChatState>({
    currentStep: null,
    stepDescription: 'Welcome',
    expectedInputType: 'text',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(options.sessionId || 'default');

  // Load existing conversation on mount
  useEffect(() => {
    const loadConversation = async () => {
      try {
        const response = await fetch(`/api/chat?sessionId=${sessionId}`);
        const data = await response.json();
        
        if (response.ok) {
          setMessages(data.messages || []);
          setChatState(data.chatState);
          setSessionId(data.sessionId);
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
      }
    };

    loadConversation();
  }, [sessionId]);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          sessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific AWS errors with retry suggestion
        if (data.errorType === 'AWS_SERVICE_ERROR' && data.canRetry) {
          throw new Error(`${data.error} You can retry in a few moments.`);
        }
        throw new Error(data.error || 'Failed to send message');
      }

      // Update state with response
      setMessages(data.messages || []);
      setChatState(data.chatState);
      setSessionId(data.sessionId);

      // Handle completion or project creation if needed
      if (data.isComplete) {
        console.log('Conversation completed');
      }
      if (data.projectCreated) {
        console.log('Project created');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
    chatState,
    isLoading,
    error,
    sendMessage,
    clearError,
  };
} 