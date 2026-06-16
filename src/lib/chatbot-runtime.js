import { CHATBOT_START_NODE_ID, normalizeStartTriggerValues } from '@/lib/chatbot-flows-api';

export const normalizeChatbotText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export const evaluateChatbotRule = (rule, sourceValue, expectedValue) => {
  const normalizedRule = String(rule || 'contains').trim();
  const left = normalizeChatbotText(sourceValue);
  const right = normalizeChatbotText(expectedValue);

  if (!right) {
    return false;
  }

  if (normalizedRule === 'not_equal') return left !== right;
  if (normalizedRule === 'equals') return left === right;

  if (['gte', 'gt', 'lte', 'lt'].includes(normalizedRule)) {
    const leftNumber = Number(left.replace(',', '.'));
    const rightNumber = Number(right.replace(',', '.'));
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
    if (normalizedRule === 'gte') return leftNumber >= rightNumber;
    if (normalizedRule === 'gt') return leftNumber > rightNumber;
    if (normalizedRule === 'lte') return leftNumber <= rightNumber;
    return leftNumber < rightNumber;
  }

  return left.includes(right);
};

export const evaluateChatbotRuleValues = (rule, sourceValue, expectedValues = []) => {
  const values = normalizeStartTriggerValues({
    triggerValues: Array.isArray(expectedValues) ? expectedValues : [expectedValues],
  });
  if (!values.length) return false;
  if (String(rule || 'contains').trim() === 'not_equal') {
    return values.every((value) => evaluateChatbotRule(rule, sourceValue, value));
  }
  return values.some((value) => evaluateChatbotRule(rule, sourceValue, value));
};

export const buildConversationMessageKey = (conversation = {}) =>
  [
    conversation.id,
    conversation.last_message || '',
    conversation.last_message_time || conversation.last_message_at || conversation.updated_date || '',
    conversation.last_message_type || '',
  ].join('|');

export const getMatchingActiveFlow = (activeFlows = [], message = '') =>
  activeFlows.find((flow) =>
    evaluateChatbotRuleValues(
      flow.startRule || flow.rule || 'contains',
      message,
      flow.triggerValues || [flow.triggerValue || flow.startTriggerValue || ''],
    ),
  ) || null;

export const getStartNodeFromFlow = (flow = {}) =>
  (Array.isArray(flow?.state?.nodes) ? flow.state.nodes : []).find(
    (node) => node?.id === CHATBOT_START_NODE_ID || node?.data?.componentType === 'start',
  ) || null;

export const hasNewClientMessage = (conversation = {}) => {
  const lastMessage = String(conversation.last_message || '').trim();
  if (!conversation.id || !lastMessage) {
    return false;
  }

  const lastReceivedRaw = conversation.last_received_at || '';
  const lastClientRaw = conversation.lastClientMessageTime || conversation.last_client_message_time || '';
  const lastMessageRaw =
    conversation.last_message_time ||
    conversation.last_message_at ||
    conversation.updated_date ||
    '';
  const lastSentRaw = conversation.last_sent_at || '';
  const unreadCount = Number(conversation.unread_count ?? conversation.unreadCount ?? 0);
  const lastClientMessageMs = Date.parse(lastReceivedRaw || lastClientRaw || '');
  const lastSentMs = Date.parse(conversation.last_sent_at || '');
  const lastMessageMs = Date.parse(lastMessageRaw);

  if (!Number.isFinite(lastClientMessageMs)) {
    return false;
  }

  if (!lastReceivedRaw && unreadCount <= 0 && lastSentRaw && String(lastClientRaw || '') === String(lastMessageRaw || '')) {
    return false;
  }

  if (Number.isFinite(lastSentMs) && lastSentMs >= lastClientMessageMs) {
    return false;
  }

  if (Number.isFinite(lastMessageMs) && lastClientMessageMs + 2000 < lastMessageMs) {
    return false;
  }

  return true;
};
