'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Message, ChatState } from '@/types/chat';
import { ChatMessage } from './ChatMessage';
import { ChatTypingIndicator } from './ChatTypingIndicator';
import { AWSStatusBadge } from '@/components/status/AWSStatusIndicator';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => Promise<void>;
  messages: Message[];
  isLoading: boolean;
  chatState: ChatState;
}

export function ChatInterface({ onSendMessage, messages, isLoading, chatState }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [inputValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    
    try {
      await onSendMessage(message);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    // Shift+Enter will add a new line (default textarea behavior)
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Chat Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              Competitor Research Agent
            </h2>
            <p className="text-sm text-gray-500 truncate">
              {chatState.currentStep ? `Step ${chatState.currentStep}: ${chatState.stepDescription}` : 'Ready to help with competitor analysis'}
            </p>
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            {/* Chat Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-400' : 'bg-green-400'}`} />
              <span className="text-xs text-gray-500 hidden sm:inline">
                {isLoading ? 'Processing...' : 'Online'}
              </span>
            </div>
            
            {/* AWS Status Badge */}
            <div className="hidden sm:block">
              <AWSStatusBadge className="text-xs" />
            </div>
          </div>
        </div>
        
        {/* Mobile AWS Status (shown below header on small screens) */}
        <div className="mt-2 sm:hidden">
          <AWSStatusBadge className="text-xs" />
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 max-w-md mx-auto">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Welcome to Competitor Research Agent
              </h3>
              <p className="text-gray-600 text-sm">
                I'll help you set up and run competitor analysis for your product. 
                Let's start by creating a new project.
              </p>
            </div>
          </div>
        )}
        
        {messages.map((message, index) => (
          <ChatMessage 
            key={message.id || index} 
            message={message} 
          />
        ))}
        
        {isLoading && <ChatTypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="bg-white border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                chatState.expectedInputType === 'email' ? 'Enter your HelloFresh email...' :
                chatState.expectedInputType === 'text' ? 'Type your response... (Shift+Enter for new line)' :
                'Type your message... (Shift+Enter for new line)'
              }
              disabled={isLoading}
              rows={1}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-hidden text-gray-900 placeholder-gray-500"
              style={{ minHeight: '42px', maxHeight: '120px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center space-x-2 self-start sm:self-end whitespace-nowrap"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
        <div className="mt-2 text-xs text-gray-400">
          Press Enter to send • Shift+Enter for new line
        </div>
      </div>
    </div>
  );
} 