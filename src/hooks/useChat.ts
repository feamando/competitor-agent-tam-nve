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

  // Load existing conversation on mount with timeout
  useEffect(() => {
    const loadConversation = async () => {
      try {
        // Add timeout for initial conversation loading to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for initial load
        
        const response = await fetch(`/api/chat?sessionId=${sessionId}`, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        const data = await response.json();
        
        if (response.ok) {
          setMessages(data.messages || []);
          setChatState(data.chatState);
          setSessionId(data.sessionId);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn('Initial conversation load timed out, using default state');
          setChatState({
            currentStep: null,
            stepDescription: 'Welcome',
            expectedInputType: 'text',
          });
        } else {
          console.error('Failed to load conversation:', err);
        }
      }
    };

    loadConversation();
  }, [sessionId]);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          sessionId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
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
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. The chat service may be experiencing delays. Please try again.');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMessage);
      }
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