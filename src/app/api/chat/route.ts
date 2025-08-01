import { NextRequest, NextResponse } from 'next/server';
import { ConversationManager } from '@/lib/chat/conversation';

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    // Use persistent conversation management instead of in-memory Map
    const conversationId = sessionId || 'default';
    const conversation = ConversationManager.getConversation(conversationId);

    // Process the user message
    const response = await conversation.processUserMessage(message);

    // Return response with updated state
    return NextResponse.json({
      response: response.message,
      chatState: conversation.getChatState(),
      messages: conversation.getMessages(),
      sessionId: conversationId,
      isComplete: response.isComplete || false,
      projectCreated: response.projectCreated || false,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || 'default';

    // Use persistent conversation retrieval
    const conversation = ConversationManager.getConversation(sessionId);

    return NextResponse.json({
      messages: conversation.getMessages(),
      chatState: conversation.getChatState(),
      sessionId,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 