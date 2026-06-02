import { parseJsonResponse, requestLocalApi } from '@/lib/local-api';

export const assignConversationToUser = async (conversationId, userId, options = {}) => {
  const safeConversationId = String(conversationId || '').trim();
  const safeUserId = String(userId || '').trim();
  if (!safeConversationId || !safeUserId) {
    throw new Error('Conversa ou usuario invalido para redirecionamento.');
  }

  const response = await requestLocalApi(`/conversations/${encodeURIComponent(safeConversationId)}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: safeUserId,
      sourceConversationIds: Array.isArray(options.sourceConversationIds) ? options.sourceConversationIds : [],
      matchingServiceIds: Array.isArray(options.matchingServiceIds) ? options.matchingServiceIds : [],
    }),
  });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel redirecionar a conversa.');
  }

  return data;
};
