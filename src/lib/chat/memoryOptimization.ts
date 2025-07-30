import { ChatState, Message } from '@/types/chat';
import { logger } from '@/lib/logger';

// Memory optimization constants
export const MAX_MESSAGES_PER_CONVERSATION = 50;
export const MAX_ACTIVE_CONVERSATIONS = 10;
export const CONVERSATION_INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds
export const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

export interface SerializedConversation {
  id: string;
  chatState: ChatState;
  messages: Message[];
  lastActivityTime: number;
  createdAt: number;
}

export interface ConversationData {
  chatState: ChatState;
  messages: Message[];
}

/**
 * LRU Cache for managing active conversations with memory optimization
 */
export class ConversationLRUCache {
  private cache = new Map<string, ConversationData>();
  private serializedData = new Map<string, SerializedConversation>();
  private readonly maxSize: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(maxSize: number = MAX_ACTIVE_CONVERSATIONS) {
    this.maxSize = maxSize;
    this.startCleanupTimer();
  }

  get(conversationId: string): ConversationData | null {
    // Check active cache first
    if (this.cache.has(conversationId)) {
      const conversation = this.cache.get(conversationId)!;
      // Move to end (most recently used)
      this.cache.delete(conversationId);
      this.cache.set(conversationId, conversation);
      this.updateLastActivity(conversationId);
      return conversation;
    }

    // Check serialized data and restore if found
    if (this.serializedData.has(conversationId)) {
      const serialized = this.serializedData.get(conversationId)!;
      const conversation = this.deserializeConversation(serialized);
      this.set(conversationId, conversation);
      return conversation;
    }

    return null;
  }

  set(conversationId: string, conversation: ConversationData): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(conversationId)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.evictConversation(oldestKey);
      }
    }

    this.cache.set(conversationId, conversation);
    this.updateLastActivity(conversationId);
  }

  has(conversationId: string): boolean {
    return this.cache.has(conversationId) || this.serializedData.has(conversationId);
  }

  delete(conversationId: string): boolean {
    const deleted1 = this.cache.delete(conversationId);
    const deleted2 = this.serializedData.delete(conversationId);
    return deleted1 || deleted2;
  }

  private evictConversation(conversationId: string): void {
    const conversation = this.cache.get(conversationId);
    if (conversation) {
      // Serialize conversation before evicting
      const serialized = this.serializeConversation(conversationId, conversation);
      this.serializedData.set(conversationId, serialized);
      logger.info('Conversation evicted from active cache and serialized', {
        conversationId,
        messageCount: conversation.messages.length
      });
    }
    this.cache.delete(conversationId);
  }

  private serializeConversation(conversationId: string, conversation: ConversationData): SerializedConversation {
    return {
      id: conversationId,
      chatState: conversation.chatState,
      messages: conversation.messages,
      lastActivityTime: Date.now(),
      createdAt: Date.now()
    };
  }

  private deserializeConversation(serialized: SerializedConversation): ConversationData {
    // Restore messages with history limit
    const messages = serialized.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    
    logger.info('Conversation restored from serialized data', {
      conversationId: serialized.id,
      messageCount: messages.length,
      originalMessageCount: serialized.messages.length,
      inactiveTime: Date.now() - serialized.lastActivityTime
    });
    
    return {
      chatState: serialized.chatState,
      messages: messages
    };
  }

  private updateLastActivity(conversationId: string): void {
    if (this.serializedData.has(conversationId)) {
      const serialized = this.serializedData.get(conversationId)!;
      serialized.lastActivityTime = Date.now();
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveConversations();
    }, CLEANUP_INTERVAL);
  }

  private cleanupInactiveConversations(): void {
    const now = Date.now();
    const inactiveConversations: string[] = [];

    // Check serialized conversations for inactivity
    for (const [conversationId, serialized] of this.serializedData.entries()) {
      if (now - serialized.lastActivityTime > CONVERSATION_INACTIVITY_TIMEOUT) {
        inactiveConversations.push(conversationId);
      }
    }

    // Remove expired conversations
    inactiveConversations.forEach(conversationId => {
      this.serializedData.delete(conversationId);
      this.cache.delete(conversationId);
    });

    if (inactiveConversations.length > 0) {
      logger.info('Cleaned up inactive conversations', {
        cleanedCount: inactiveConversations.length,
        remainingActive: this.cache.size,
        remainingSerialized: this.serializedData.size
      });
    }
  }

  getStats(): { activeConversations: number; serializedConversations: number; totalMemoryKB: number } {
    let memoryUsage = 0;
    
    // Estimate memory usage (rough calculation)
    for (const conversation of this.cache.values()) {
      memoryUsage += JSON.stringify(conversation.chatState).length;
      memoryUsage += JSON.stringify(conversation.messages).length;
    }
    
    for (const serialized of this.serializedData.values()) {
      memoryUsage += JSON.stringify(serialized).length;
    }

    return {
      activeConversations: this.cache.size,
      serializedConversations: this.serializedData.size,
      totalMemoryKB: Math.round(memoryUsage / 1024)
    };
  }

  forceCleanup(): void {
    this.cleanupInactiveConversations();
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
    this.serializedData.clear();
  }
}

// Memory optimization utilities
export class ConversationMemoryOptimizer {
  private static cache = new ConversationLRUCache(MAX_ACTIVE_CONVERSATIONS);

  static getConversation(conversationId: string): ConversationData | null {
    return this.cache.get(conversationId);
  }

  static setConversation(conversationId: string, conversation: ConversationData): void {
    this.cache.set(conversationId, conversation);
  }

  static deleteConversation(conversationId: string): boolean {
    return this.cache.delete(conversationId);
  }

  static hasConversation(conversationId: string): boolean {
    return this.cache.has(conversationId);
  }

  static getCacheStats(): { activeConversations: number; serializedConversations: number; totalMemoryKB: number } {
    return this.cache.getStats();
  }

  static forceCleanup(): void {
    this.cache.forceCleanup();
  }

  static limitMessageHistory(messages: Message[]): Message[] {
    if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      const excess = messages.length - MAX_MESSAGES_PER_CONVERSATION;
      const trimmed = messages.slice(excess);
      
      logger.info('Message history trimmed to prevent memory bloat', {
        removedMessages: excess,
        remainingMessages: trimmed.length
      });
      
      return trimmed;
    }
    return messages;
  }

  static destroy(): void {
    this.cache.destroy();
  }
}

// Export default instance for backwards compatibility
export const conversationMemoryOptimizer = ConversationMemoryOptimizer; 