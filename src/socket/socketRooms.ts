export function getUserRoom(userId: string): string {
  return `user_${userId}`;
}

export function getConversationRoom(conversationId: string): string {
  return `conversation_${conversationId}`;
}
