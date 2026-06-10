import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Info,
  Power,
  Search,
  TimerReset,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchChatbotEvents } from '@/lib/chatbot-flows-api';
import { buildConversationResolutionSystemMessage } from '@/lib/conversation-history';
import { assignConversationToUser } from '@/lib/conversation-assignment-api';
import {
  saveConversationPreference,
} from '@/lib/conversation-preferences';
import {
  fetchWhatsappHistoryMessages,
  fetchWhatsappMessages,
  markWhatsappConversationsRead,
  reactToWhatsappMessage,
  sendWhatsappAudioMessage,
  sendWhatsappDocumentMessage,
  sendWhatsappImageMessage,
  sendWhatsappInteractiveMessage,
  sendWhatsappTemplateMessage,
  sendWhatsappTextMessage,
  sendWhatsappVideoMessage,
} from '@/lib/whatsapp-api';
import { getQuickReplyActions, incrementQuickReplyUsage } from '@/lib/quick-replies';
import {
  deleteCachedDraft,
  promoteCachedDraft,
  readCachedDraft,
  readCachedMessages,
  writeCachedDraft,
  writeCachedMessages,
} from '@/lib/inbox-cache';
import { fetchLocalHsms } from '@/lib/hsm-api';
import { isLightboxAttachment, resolveAttachmentKind } from '@/lib/whatsapp-media';
import ChatMessage from './ChatMessage';
import ChatMediaLightbox from './ChatMediaLightbox';
import ContactAvatar from './ContactAvatar';
import ImagePreviewModal from './ImagePreviewModal';
import MessageInput from './MessageInput';
import QuickReplySidePanel from './QuickReplySidePanel';
import LabelBadge from '@/components/labels/LabelBadge';

const statusConfig = {
  waiting: { label: 'Aguardando', color: 'bg-amber-400' },
  in_progress: { label: 'Em atendimento', color: 'bg-primary' },
  resolved: { label: 'Encerrada', color: 'bg-blue-400' },
  closed: { label: 'Fechada', color: 'bg-muted-foreground' },
};

const INITIAL_MESSAGE_PAGE_SIZE = 60;
const OLDER_MESSAGE_PAGE_SIZE = 80;
const RECENT_MESSAGE_POLL_TAIL_SIZE = 80;
const NEWER_MESSAGES_POLL_INTERVAL_MS = 6000;
const OUTGOING_RECONCILE_WINDOW_MS = 2 * 60 * 1000;
const MESSAGE_CACHE_LIMIT = 160;
const VISIBLE_MESSAGE_DAY_LIMIT = 2;

function getMessageTimestamp(message) {
  return new Date(message?.created_date || message?.timestamp || 0).getTime();
}

function getMessageSortTimestamp(message) {
  return new Date(message?.client_sort_at || message?.created_date || message?.timestamp || 0).getTime();
}

function getMessageClientOrder(message) {
  const value = Number(message?.client_order);
  return Number.isFinite(value) ? value : null;
}

function normalizeComparableText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveSafeRouteSelector(selector = null) {
  if (!selector || typeof selector !== 'object') return null;
  const phoneNumberId = String(selector.phoneNumberId || '').trim();
  const displayPhoneNumber = String(selector.displayPhoneNumber || '').trim();
  const routeKey = String(selector.routeKey || '').trim().toLowerCase();
  if (!phoneNumberId && !displayPhoneNumber && !routeKey) return null;
  return {
    phoneNumberId: phoneNumberId || null,
    displayPhoneNumber: displayPhoneNumber || null,
    routeKey: routeKey || null,
  };
}

function getFirstName(value, fallback = 'Mensagem') {
  const safeValue = String(value || '').trim();
  if (!safeValue) return fallback;
  return safeValue.split(/\s+/)[0] || fallback;
}

function buildReplyPreview(replyToMessage) {
  if (!replyToMessage) return null;

  const normalizedType = String(replyToMessage?.message_type || '').trim().toLowerCase();
  const normalizedContent = String(replyToMessage?.content || '').trim();

  let label = normalizedContent;
  let kind = normalizedType || 'text';

  if (!label) {
    if (normalizedType === 'audio') label = 'Audio';
    else if (normalizedType === 'image' || normalizedType === 'sticker') label = 'Imagem';
    else if (normalizedType === 'video') label = 'Video';
    else if (normalizedType === 'document') label = 'Documento';
  }

  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel === '[audio]') {
    label = 'Audio';
    kind = 'audio';
  } else if (normalizedLabel === '[image]' || normalizedLabel === '[imagem]') {
    label = 'Imagem';
    kind = 'image';
  } else if (normalizedLabel === '[video]') {
    label = 'Video';
    kind = 'video';
  }

  return {
    senderName: getFirstName(replyToMessage?.sender_name, 'Mensagem'),
    text: label || 'Mensagem',
    kind,
  };
}

function hydrateReplyRelations(messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const byId = new Map(
    safeMessages
      .map((message) => [String(message?.id || message?.temp_id || '').trim(), message])
      .filter(([id]) => id)
  );

  return safeMessages.map((message) => {
    if (message?.reply_preview) {
      return message;
    }

    const replyToId = String(message?.reply_to_id || '').trim();
    if (!replyToId) {
      return message;
    }

    const referencedMessage = byId.get(replyToId);
    if (!referencedMessage) {
      return message;
    }

    const replyPreview = buildReplyPreview(referencedMessage);
    if (!replyPreview) {
      return message;
    }

    return {
      ...message,
      reply_to: message.reply_to || referencedMessage.content || null,
      reply_preview: replyPreview,
    };
  });
}

function groupMessagesByDate(messages) {
  const groups = [];
  let currentDay = null;

  messages.forEach((msg) => {
    const date = msg.created_date ? new Date(msg.created_date) : new Date();
    let dayLabel;
    if (isToday(date)) dayLabel = 'Hoje';
    else if (isYesterday(date)) dayLabel = 'Ontem';
    else dayLabel = format(date, "dd 'de' MMMM", { locale: ptBR });

    if (dayLabel !== currentDay) {
      groups.push({ type: 'separator', label: dayLabel });
      currentDay = dayLabel;
    }

    groups.push({ type: 'message', data: msg });
  });

  return groups;
}

function sortMessagesChronologically(messages) {
  return [...messages].sort((left, right) => {
    const timestampDiff = getMessageSortTimestamp(left) - getMessageSortTimestamp(right);
    if (timestampDiff !== 0) return timestampDiff;

    const leftOrder = getMessageClientOrder(left);
    const rightOrder = getMessageClientOrder(right);
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return 0;
  });
}

function getReactionList(message) {
  return Array.isArray(message?.reactions) ? message.reactions : [];
}

function getAgentReactionEmoji(reactions) {
  return getReactionList({ reactions }).find((reaction) => reaction.from === 'agent')?.emoji || '';
}

function applyPendingAgentReaction(reactions, pendingEmoji) {
  if (typeof pendingEmoji !== 'string') return getReactionList({ reactions });
  return applyReactionChange(reactions, 'agent', pendingEmoji);
}

function resolveMergedReactions(currentMessage, incomingMessage) {
  const incomingReactions = getReactionList(incomingMessage);
  const pendingEmoji =
    typeof currentMessage?.pending_agent_reaction === 'string'
      ? currentMessage.pending_agent_reaction
      : null;

  if (pendingEmoji === null) {
    return {
      reactions: incomingReactions,
      pending_agent_reaction: null,
      pending_agent_reaction_at: null,
    };
  }

  const incomingAgentReaction = getAgentReactionEmoji(incomingReactions);
  if (incomingAgentReaction === pendingEmoji) {
    return {
      reactions: incomingReactions,
      pending_agent_reaction: null,
      pending_agent_reaction_at: null,
    };
  }

  return {
    reactions: applyPendingAgentReaction(incomingReactions, pendingEmoji),
    pending_agent_reaction: pendingEmoji,
    pending_agent_reaction_at: currentMessage.pending_agent_reaction_at,
  };
}

function applyReactionChange(reactions, from, emoji) {
  const normalizedEmoji = String(emoji || '').trim();
  const nextReactions = getReactionList({ reactions }).map((reaction) => ({ ...reaction }));
  const existingIndex = nextReactions.findIndex((reaction) => reaction.from === from);

  if (!normalizedEmoji) {
    if (existingIndex >= 0) {
      nextReactions.splice(existingIndex, 1);
    }
    return nextReactions;
  }

  if (existingIndex >= 0) {
    if (nextReactions[existingIndex].emoji === normalizedEmoji) {
      nextReactions.splice(existingIndex, 1);
    } else {
      nextReactions[existingIndex] = {
        ...nextReactions[existingIndex],
        emoji: normalizedEmoji,
        reacted_at: new Date().toISOString(),
      };
    }
    return nextReactions;
  }

  nextReactions.push({
    from,
    emoji: normalizedEmoji,
    reacted_at: new Date().toISOString(),
  });
  return nextReactions;
}

function buildTemplatePreview(template) {
  const content = String(template?.content || '').trim();
  const variables = Array.isArray(template?.bodyVariables) ? template.bodyVariables : [];

  return content.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, index) => {
    const value = variables[Number(index) - 1];
    return String(value || `var${index}`);
  });
}

function getTemplateButtons(template = {}) {
  if (Array.isArray(template.buttons) && template.buttons.length) return template.buttons;
  if (Array.isArray(template.buttonConfig) && template.buttonConfig.length) return template.buttonConfig;
  return [];
}

function normalizeTemplateItem(item) {
  return {
    ...item,
    name: String(item?.name || '').trim(),
    language: String(item?.language || 'pt_BR').trim(),
    content: String(item?.content || '').trim(),
    status: String(item?.status || '').trim().toLowerCase(),
    headerType: String(item?.headerType || 'none').trim().toLowerCase(),
    headerFormat: String(item?.headerFormat || '').trim().toUpperCase(),
    bodyVariables: Array.isArray(item?.bodyVariables) ? item.bodyVariables : [],
    buttonParameters: Array.isArray(item?.buttonVariables) ? item.buttonVariables : [],
    buttons: Array.isArray(item?.buttons) ? item.buttons : Array.isArray(item?.buttonConfig) ? item.buttonConfig : [],
    serviceId: String(item?.serviceId || item?.service_id || '').trim(),
    headerMediaUrl: String(item?.headerMediaUrl || item?.headerExample || '').trim(),
  };
}

function createOptimisticMessage({
  conversationId,
  clientMessageId,
  content,
  messageType = 'text',
  attachments = [],
  templateButtons = [],
  replyToMessage,
  replyPreview = null,
  senderName = 'Agente',
  status = 'pending',
  uploadProgress = 0,
  clientOrder = null,
}) {
  const resolvedClientMessageId =
    clientMessageId ||
    (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const tempId = `local-${resolvedClientMessageId}`;
  const createdAt = new Date().toISOString();
  return {
    id: tempId,
    temp_id: tempId,
    client_message_id: resolvedClientMessageId,
    conversation_id: conversationId,
    sender_type: 'agent',
    sender_name: senderName,
    message_type: messageType,
    status,
    content,
    reply_to: replyToMessage?.content || null,
    reply_preview: replyPreview,
    reactions: [],
    attachments,
    template_buttons: Array.isArray(templateButtons) ? templateButtons : [],
    upload_progress: uploadProgress,
    created_date: createdAt,
    client_sort_at: createdAt,
    client_order: clientOrder,
  };
}

function extractResponseMessageId(result) {
  return String(
    result?.messages?.[0]?.id ||
      result?.messages?.[0]?.wamid ||
      result?.messageId ||
      result?.message_id ||
      result?.wamid ||
      ''
  ).trim() || null;
}

function fileToBase64Payload(file, errorMessage = 'Não foi possível ler o arquivo selecionado.') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(errorMessage));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, fileName = 'arquivo', mimeType = 'application/octet-stream') {
  const raw = String(dataUrl || '');
  const commaIndex = raw.indexOf(',');
  const header = commaIndex >= 0 ? raw.slice(0, commaIndex) : '';
  const payload = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  const resolvedMimeType = mimeType || header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(payload || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName || 'arquivo', { type: resolvedMimeType });
}

const QUICK_REPLY_IMAGE_MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const QUICK_REPLY_VIDEO_MIME_BY_EXTENSION = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const QUICK_REPLY_AUDIO_MIME_BY_EXTENSION = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  wav: 'audio/wav',
};

const QUICK_REPLY_DOCUMENT_MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function detectDataUrlMimeType(dataUrl) {
  return String(dataUrl || '').match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase() || '';
}

function detectFileExtension(fileName) {
  return String(fileName || '').split('.').pop()?.trim().toLowerCase() || '';
}

function fallbackQuickReplyMimeType(actionType, fileName) {
  const extension = detectFileExtension(fileName);
  if (actionType === 'image') return QUICK_REPLY_IMAGE_MIME_BY_EXTENSION[extension] || 'image/png';
  if (actionType === 'video') return QUICK_REPLY_VIDEO_MIME_BY_EXTENSION[extension] || 'video/mp4';
  if (actionType === 'audio') return QUICK_REPLY_AUDIO_MIME_BY_EXTENSION[extension] || 'audio/ogg';
  return QUICK_REPLY_DOCUMENT_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

function defaultQuickReplyFileName(actionType, mimeType) {
  if (actionType === 'image') {
    const extension = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/jpeg' ? 'jpg' : 'png';
    return `imagem.${extension}`;
  }
  if (actionType === 'video') {
    const extension = mimeType === 'video/webm' ? 'webm' : mimeType === 'video/quicktime' ? 'mov' : 'mp4';
    return `video.${extension}`;
  }
  if (actionType === 'audio') {
    const extension = mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'audio/wav' ? 'wav' : 'ogg';
    return `audio.${extension}`;
  }
  return 'documento';
}

function getQuickReplyBase64SizeKb(dataUrl) {
  const raw = String(dataUrl || '');
  const payload = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  return Math.max(0, Math.round((payload.length * 3) / 4 / 1024));
}

function resolveQuickReplyMediaPayload(action = {}) {
  const media = action.media || {};
  const dataUrl = String(media.dataUrl || media.base64 || '').trim();
  if (!dataUrl) return null;

  const actionType = String(action.type || '').trim().toLowerCase();
  const fileNameCandidate = String(media.fileName || media.filename || '').trim();
  const dataUrlMimeType = detectDataUrlMimeType(dataUrl);
  const explicitMimeType = String(media.mimeType || media.mimetype || '').trim().toLowerCase();
  const mimeType = explicitMimeType || dataUrlMimeType || fallbackQuickReplyMimeType(actionType, fileNameCandidate);
  const fileName = fileNameCandidate || defaultQuickReplyFileName(actionType, mimeType);
  const kind = ['image', 'video', 'audio', 'document'].includes(actionType) ? actionType : String(media.kind || '').trim().toLowerCase();
  const endpointByKind = {
    image: 'send-image',
    video: 'send-video',
    audio: 'send-audio',
    document: 'send-document',
  };

  return {
    dataUrl,
    mimeType,
    fileName,
    kind,
    caption: String(action.caption || media.caption || ''),
    endpoint: endpointByKind[kind] || 'send-document',
    approxSizeKb: getQuickReplyBase64SizeKb(dataUrl),
  };
}

function resolveQuickReplyUraPayload(action = {}, resolveText = (value) => value) {
  const ura = action.ura && typeof action.ura === 'object' ? action.ura : {};
  const metadata = action.metadata && typeof action.metadata === 'object' ? action.metadata : {};
  const rawOptions = Array.isArray(ura.options)
    ? ura.options
    : Array.isArray(metadata.uraOptions)
      ? metadata.uraOptions
      : [];
  const buttons = rawOptions
    .map((option, index) => {
      const label = String(option?.label || option?.title || option?.value || '').trim();
      if (!label) return null;
      return {
        id: String(option?.id || option?.value || `ura-option-${index + 1}`),
        title: resolveText(label).slice(0, 20),
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  return {
    text: resolveText(action.content || ura.description || metadata.description || 'Selecione uma opção:'),
    buttonText: resolveText(ura.buttonText || metadata.buttonText || 'Selecionar').slice(0, 20) || 'Selecionar',
    footer: resolveText(ura.footer || metadata.footer || ''),
    buttons,
  };
}

const delaySeconds = (seconds) =>
  new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Math.min(300, Number(seconds) || 0)) * 1000));

function findOptimisticMatch(messages, incomingMessage) {
  if (incomingMessage?.sender_type !== 'agent') return null;

  const incomingType = String(incomingMessage?.message_type || '').trim().toLowerCase();
  const incomingContent = normalizeComparableText(incomingMessage?.content);
  const incomingReply = normalizeComparableText(incomingMessage?.reply_to);
  const incomingTimestamp = getMessageTimestamp(incomingMessage);

  return (
    messages.find((message) => {
      if (!message?.temp_id) return false;
      if (message.sender_type !== 'agent') return false;
      if (String(message.message_type || '').trim().toLowerCase() !== incomingType) return false;
      if (normalizeComparableText(message.content) !== incomingContent) return false;
      if (normalizeComparableText(message.reply_to) !== incomingReply) return false;

      const currentTimestamp = getMessageTimestamp(message);
      return Math.abs(currentTimestamp - incomingTimestamp) <= OUTGOING_RECONCILE_WINDOW_MS;
    }) || null
  );
}

function isGenericAgentSenderName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['agente', 'agent'].includes(normalized);
}

function resolveAgentSenderName(message = {}) {
  const raw = message?.raw || {};
  const candidates = [
    message.sender_name,
    message.agentName,
    message.agent_name,
    message.senderName,
    message.operatorName,
    message.operator_name,
    message.attendantName,
    message.attendant_name,
    message.createdByName,
    message.created_by_name,
    message.userName,
    message.user_name,
    raw.sender_name,
    raw.agentName,
    raw.agent_name,
    raw.senderName,
    raw.operatorName,
    raw.operator_name,
    raw.attendantName,
    raw.attendant_name,
    raw.createdByName,
    raw.created_by_name,
    raw.userName,
    raw.user_name,
    raw.user?.full_name,
    raw.user?.name,
    raw.agent?.full_name,
    raw.agent?.name,
  ];

  return candidates
    .map((candidate) => String(candidate || '').trim())
    .find((candidate) => candidate && !isGenericAgentSenderName(candidate)) || '';
}

function resolveIncomingMessageIdentifier(message) {
  return String(
    message?.client_message_id ||
      message?.clientMessageId ||
      message?.provider_message_id ||
      message?.providerMessageId ||
      message?.server_message_id ||
      message?.id ||
      message?.message_key ||
      message?.temp_id ||
      ''
  ).trim();
}

function resolveServerMessageIdentifier(message) {
  return String(message?.server_message_id || '').trim();
}

function resolvePreferredSenderName(currentMessage, incomingMessage) {
  if (incomingMessage?.sender_type !== 'agent') {
    return incomingMessage?.sender_name || currentMessage?.sender_name || '';
  }

  const incomingSenderName = resolveAgentSenderName(incomingMessage);
  if (incomingSenderName) return incomingSenderName;

  const currentSenderName = resolveAgentSenderName(currentMessage);
  if (currentSenderName) return currentSenderName;

  return incomingMessage?.sender_name || currentMessage?.sender_name || 'Agente';
}

function buildServerMessageLookupKey(message) {
  const serverMessageId = resolveServerMessageIdentifier(message);
  if (!serverMessageId) {
    return '';
  }

  return serverMessageId;
}

function trimMessagesForCache(messages) {
  const safeMessages = (Array.isArray(messages) ? messages : []).filter((message) => !isLegacyHistoryMessage(message));
  if (safeMessages.length <= MESSAGE_CACHE_LIMIT) {
    return safeMessages;
  }

  return safeMessages.slice(-MESSAGE_CACHE_LIMIT);
}

function isLegacyHistoryMessage(message) {
  const origin = String(message?.origin || message?.raw?.origin || '').trim().toLowerCase();
  return origin === 'legacy-history' || Boolean(message?.legacy_history || message?.raw?.legacy_history);
}

function resolveMessageDateKey(message) {
  const timestamp = String(message?.created_date || message?.timestamp || '').trim();
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
}

function filterMostRecentMessageDays(messages, dayLimit = VISIBLE_MESSAGE_DAY_LIMIT) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const selectedDays = new Set();

  for (let index = safeMessages.length - 1; index >= 0; index -= 1) {
    const key = resolveMessageDateKey(safeMessages[index]);
    if (!key) continue;
    selectedDays.add(key);
    if (selectedDays.size >= dayLimit) break;
  }

  if (selectedDays.size === 0) return safeMessages;
  return safeMessages.filter((message) => {
    const key = resolveMessageDateKey(message);
    return !key || selectedDays.has(key);
  });
}

function resolveMessagePreviewContent(message) {
  const content = String(message?.content || '').trim();
  if (content) {
    return content;
  }

  const normalizedType = String(message?.message_type || '').trim().toLowerCase();
  if (normalizedType === 'audio') return '[Audio]';
  if (normalizedType === 'image') return '[Imagem]';
  if (normalizedType === 'video') return '[Video]';
  if (normalizedType === 'document') return '[Documento]';
  if (normalizedType === 'sticker') return '[Figurinha]';
  return '';
}

function buildConversationActivityPatch(currentConversation, message) {
  const activityCursor = String(message?.created_date || message?.timestamp || '').trim();
  if (!activityCursor) {
    return null;
  }

  const senderType = String(message?.sender_type || '').trim().toLowerCase();
  const messageType = String(message?.message_type || currentConversation?.last_message_type || 'text').trim().toLowerCase();

  return {
    last_message: resolveMessagePreviewContent(message),
    last_message_type: messageType,
    last_message_time: activityCursor,
    last_message_at: activityCursor,
    updated_date: activityCursor,
    last_sent_at: senderType === 'agent' ? activityCursor : currentConversation?.last_sent_at || '',
    last_received_at: senderType === 'client' ? activityCursor : currentConversation?.last_received_at || '',
    last_client_message_time:
      senderType === 'client' ? activityCursor : currentConversation?.last_client_message_time || '',
    unread_count: 0,
    unreadCount: 0,
    is_within_customer_window:
      senderType === 'client' ? true : Boolean(currentConversation?.is_within_customer_window),
  };
}

function updateConversationQueryCaches(queryClient, conversationId, updater) {
  const safeConversationId = String(conversationId || '').trim();
  if (!safeConversationId) {
    return;
  }

  queryClient.getQueriesData({ queryKey: ['conversations'] }).forEach(([queryKey, data]) => {
    if (!Array.isArray(data)) {
      return;
    }

    let hasChanges = false;
    const nextData = data.map((conversationItem) => {
      if (String(conversationItem?.id || '').trim() !== safeConversationId) {
        return conversationItem;
      }

      hasChanges = true;
      return updater(conversationItem);
    });

    if (hasChanges) {
      queryClient.setQueryData(queryKey, nextData);
    }
  });
}

function mergeMessages(currentMessages, incomingMessages) {
  const nextMessages = [...currentMessages];
  const messageIndexById = new Map();
  const messageIndexByServerKey = new Map();

  nextMessages.forEach((message, index) => {
    const messageId = resolveIncomingMessageIdentifier(message);
    if (messageId) {
      messageIndexById.set(messageId, index);
    }

    const serverKey = buildServerMessageLookupKey(message);
    if (serverKey) {
      messageIndexByServerKey.set(serverKey, index);
    }
  });

  incomingMessages.forEach((incomingMessage) => {
    const incomingMessageId = resolveIncomingMessageIdentifier(incomingMessage);
    if (!incomingMessageId) return;

    const byIdIndex = messageIndexById.get(incomingMessageId) ?? -1;
    if (byIdIndex >= 0) {
      const reactionState = resolveMergedReactions(nextMessages[byIdIndex], incomingMessage);
      nextMessages[byIdIndex] = {
        ...nextMessages[byIdIndex],
        ...incomingMessage,
        ...reactionState,
        sender_name: resolvePreferredSenderName(nextMessages[byIdIndex], incomingMessage),
        reply_to: incomingMessage.reply_to || nextMessages[byIdIndex].reply_to || null,
        reply_preview: incomingMessage.reply_preview || nextMessages[byIdIndex].reply_preview || null,
        client_sort_at: nextMessages[byIdIndex].client_sort_at || incomingMessage.client_sort_at || '',
        client_order: nextMessages[byIdIndex].client_order ?? incomingMessage.client_order ?? null,
        status: incomingMessage.status || nextMessages[byIdIndex].status,
        upload_progress: 100,
      };
      messageIndexById.set(incomingMessageId, byIdIndex);
      const updatedServerKey = buildServerMessageLookupKey(nextMessages[byIdIndex]);
      if (updatedServerKey) {
        messageIndexByServerKey.set(updatedServerKey, byIdIndex);
      }
      return;
    }

    const incomingServerKey = buildServerMessageLookupKey(incomingMessage);
    if (incomingServerKey) {
      const byServerIdIndex = messageIndexByServerKey.get(incomingServerKey) ?? -1;
      if (byServerIdIndex >= 0) {
        const reactionState = resolveMergedReactions(nextMessages[byServerIdIndex], incomingMessage);
        nextMessages[byServerIdIndex] = {
          ...nextMessages[byServerIdIndex],
          ...incomingMessage,
          ...reactionState,
          sender_name: resolvePreferredSenderName(nextMessages[byServerIdIndex], incomingMessage),
          reply_to: incomingMessage.reply_to || nextMessages[byServerIdIndex].reply_to || null,
          reply_preview: incomingMessage.reply_preview || nextMessages[byServerIdIndex].reply_preview || null,
          client_sort_at: nextMessages[byServerIdIndex].client_sort_at || incomingMessage.client_sort_at || '',
          client_order: nextMessages[byServerIdIndex].client_order ?? incomingMessage.client_order ?? null,
          status: incomingMessage.status || nextMessages[byServerIdIndex].status,
          upload_progress: 100,
        };
        messageIndexById.set(resolveIncomingMessageIdentifier(nextMessages[byServerIdIndex]), byServerIdIndex);
        messageIndexByServerKey.set(incomingServerKey, byServerIdIndex);
        return;
      }
    }

    nextMessages.push(incomingMessage);
    messageIndexById.set(incomingMessageId, nextMessages.length - 1);
    if (incomingServerKey) {
      messageIndexByServerKey.set(incomingServerKey, nextMessages.length - 1);
    }
  });

  return hydrateReplyRelations(sortMessagesChronologically(nextMessages));
}

export default function ChatWindow({
  conversation,
  onUpdateConversation,
  onToggleInfo,
  showInfo,
  onClearConversation,
  currentUser,
  onOpenStartConversation,
  activeUsers = [],
  allServices = [],
}) {
  const [replyTo, setReplyTo] = useState(null);
  const [searchMode, setSearchMode] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [hasHistoryMessages, setHasHistoryMessages] = useState(true);
  const [imageFiles, setImageFiles] = useState(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxActiveId, setLightboxActiveId] = useState('');
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveType, setResolveType] = useState('resolved');
  const [isResolvingConversation, setIsResolvingConversation] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState('');
  const [isTransferringConversation, setIsTransferringConversation] = useState(false);
  const [quickReplyPanelOpen, setQuickReplyPanelOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const activeConversationIdRef = useRef('');
  const latestDraftValueRef = useRef('');
  const shouldPromoteDraftOnExitRef = useRef(false);
  const shouldDeleteDraftOnExitRef = useRef(false);
  const outgoingQueueRef = useRef(Promise.resolve());
  const retryPayloadsRef = useRef(new Map());
  const nextOutgoingOrderRef = useRef(1);
  const queryClient = useQueryClient();
  const currentUserId = String(currentUser?.id || currentUser?.email || '').trim();
  const currentUserName = String(currentUser?.full_name || currentUser?.name || currentUser?.username || 'Agente').trim();
  const isCurrentUserAdmin =
    String(currentUser?.role || '').trim().toLowerCase() === 'admin' ||
    String(currentUser?.role_name || '').trim().toLowerCase() === 'administrador';

  const { data: templates = [] } = useQuery({
    queryKey: ['chat-templates'],
    queryFn: async () => {
      const payload = await fetchLocalHsms();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return items
        .map(normalizeTemplateItem)
        .filter((item) => item.active && item.status === 'approved');
    },
    staleTime: 60000,
  });

  const conversationTemplateServiceIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(Array.isArray(conversation?.accessible_service_ids) ? conversation.accessible_service_ids : []),
            ...(Array.isArray(conversation?.matching_service_ids) ? conversation.matching_service_ids : []),
          ]
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        ),
      ),
    [conversation?.accessible_service_ids, conversation?.matching_service_ids],
  );

  const visibleTemplates = useMemo(() => {
    if (!conversationTemplateServiceIds.length) return [];
    return templates.filter((template) => conversationTemplateServiceIds.includes(String(template.serviceId || '').trim()));
  }, [conversationTemplateServiceIds, templates]);

  const transferUsers = useMemo(() => {
    const currentAssignedId = String(conversation?.assigned_agent_id || '').trim();
    const currentAssignedEmail = String(conversation?.assigned_agent_email || '').trim().toLowerCase();
    const matchingServiceIds = Array.isArray(conversation?.matching_service_ids) ? conversation.matching_service_ids : [];
    const serviceMatches = (Array.isArray(allServices) ? allServices : []).filter((service) =>
      matchingServiceIds.includes(String(service?.id || ''))
    );
    const activeNonAdminUsers = (Array.isArray(activeUsers) ? activeUsers : []).filter((user) => {
      const role = String(user?.role || '').trim().toLowerCase();
      const roleName = String(user?.role_name || '').trim().toLowerCase();
      const userId = String(user?.id || '').trim();
      const userEmail = String(user?.email || '').trim().toLowerCase();
      return (
        role !== 'admin' &&
        roleName !== 'administrador' &&
        (!currentAssignedId || userId !== currentAssignedId) &&
        (!currentAssignedEmail || userEmail !== currentAssignedEmail)
      );
    });

    if (serviceMatches.length === 0) return activeNonAdminUsers;

    return activeNonAdminUsers.filter((user) => {
      const userId = String(user?.id || '').trim();
      const userEmail = String(user?.email || '').trim().toLowerCase();
      return serviceMatches.some((service) => {
        const serviceUserIds = Array.isArray(service?.user_ids) ? service.user_ids.map(String) : [];
        const serviceUserEmails = Array.isArray(service?.user_emails)
          ? service.user_emails.map((email) => String(email || '').trim().toLowerCase())
          : [];
        return (userId && serviceUserIds.includes(userId)) || (userEmail && serviceUserEmails.includes(userEmail));
      });
    });
  }, [
    activeUsers,
    allServices,
    conversation?.assigned_agent_email,
    conversation?.assigned_agent_id,
    conversation?.matching_service_ids,
  ]);

  const activeManualRouteSelector = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (String(message?.sender_type || '').trim().toLowerCase() !== 'client') continue;
      const selector = resolveSafeRouteSelector(message?.route_selector);
      if (selector) return selector;
    }
    return resolveSafeRouteSelector(conversation?.active_route_selector) || resolveSafeRouteSelector(conversation?.default_route_selector);
  }, [conversation?.active_route_selector, conversation?.default_route_selector, messages]);

  const defaultHsmRouteSelector = useMemo(
    () => resolveSafeRouteSelector(conversation?.default_route_selector) || resolveSafeRouteSelector(conversation?.active_route_selector),
    [conversation?.active_route_selector, conversation?.default_route_selector]
  );
  const sourceConversationIdsKey = useMemo(
    () => (Array.isArray(conversation?.source_conversation_ids) ? conversation.source_conversation_ids.join('|') : ''),
    [conversation?.source_conversation_ids]
  );
  const sourceAccountsKey = useMemo(
    () =>
      (Array.isArray(conversation?.source_accounts) ? conversation.source_accounts : [])
        .map((account) =>
          [
            String(account?.conversationId || '').trim(),
            String(account?.phoneNumberId || '').trim(),
            String(account?.displayPhoneNumber || '').trim(),
            String(account?.routeKey || '').trim(),
          ].join('|')
        )
        .join('||'),
    [conversation?.source_accounts]
  );

  const isWithin24hWindow = Boolean(conversation?.is_within_customer_window);
  const windowStatusLabel = isWithin24hWindow
    ? 'Janela de 24h ativa. Texto livre liberado.'
    : 'Fora da janela de 24h. Envie um template HSM.';

  const lightboxItems = useMemo(
    () =>
      messages.flatMap((message) =>
        (Array.isArray(message?.attachments) ? message.attachments : [])
          .filter((attachment) => isLightboxAttachment(attachment))
          .map((attachment, index) => ({
            id: `${message.id}-attachment-${index}`,
            url: String(attachment?.url || '').trim(),
            name: attachment?.name || message.content || 'Midia',
            mimeType: attachment?.mimeType || '',
            kind: resolveAttachmentKind(attachment) || 'image',
            caption: message.content || '',
            createdDate: message.created_date || message.timestamp || '',
            senderName: message.sender_name || '',
          }))
          .filter((item) => item.url)
      ),
    [messages]
  );

  useEffect(() => {
    activeConversationIdRef.current = String(conversation?.id || '');
    latestDraftValueRef.current = draftValue;
  }, [conversation?.id, draftValue]);

  useEffect(() => {
    return () => {
      const conversationId = String(activeConversationIdRef.current || '');
      const currentDraftValue = String(latestDraftValueRef.current || '');

      if (
        shouldDeleteDraftOnExitRef.current &&
        conversationId &&
        currentDraftValue.trim().length === 0
      ) {
        void deleteCachedDraft(conversationId);
        return;
      }

      if (
        !shouldPromoteDraftOnExitRef.current ||
        !conversationId ||
        currentDraftValue.trim().length === 0
      ) {
        return;
      }

      void promoteCachedDraft(conversationId);
    };
  }, []);

  const handleDraftValueChange = (nextValue) => {
    const safeValue = String(nextValue || '');
    shouldPromoteDraftOnExitRef.current = safeValue.trim().length > 0;
    shouldDeleteDraftOnExitRef.current = safeValue.trim().length === 0;
    setDraftValue(nextValue);
  };

  useEffect(() => {
    if (!conversation?.id || !conversation.unread_count) return;

    const markAsRead = async () => {
      try {
        const targetIds = Array.isArray(conversation.source_conversation_ids) && conversation.source_conversation_ids.length > 0
          ? conversation.source_conversation_ids
          : [conversation.id];
        await markWhatsappConversationsRead(targetIds);
        updateConversationQueryCaches(queryClient, conversation.id, (currentConversation) => ({
          ...currentConversation,
          unread_count: 0,
          unreadCount: 0,
        }));
      } catch {
        // Keep UI usable even if marking as read fails.
      }
    };

    void markAsRead();
  }, [conversation?.id, conversation?.unread_count, queryClient]);

  useEffect(() => {
    if (!conversation?.id || !onClearConversation) {
      return undefined;
    }

    const handleConversationEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      if (resolveDialogOpen) {
        return;
      }

      onClearConversation();
    };

    window.addEventListener('keydown', handleConversationEscape);
    return () => window.removeEventListener('keydown', handleConversationEscape);
  }, [conversation?.id, onClearConversation, resolveDialogOpen]);

  useEffect(() => {
    if (!conversation?.id) {
      setMessages([]);
      setHasOlderMessages(true);
      setHasHistoryMessages(true);
      setIsLoadingMessages(false);
      setIsLoadingOlder(false);
      setIsLoadingHistory(false);
      setDraftValue('');
      shouldPromoteDraftOnExitRef.current = false;
      shouldDeleteDraftOnExitRef.current = false;
      setImageFiles(null);
      setIsLightboxOpen(false);
      setLightboxActiveId('');
      setReplyTo(null);
      setSearchMode(false);
      setMsgSearch('');
      setResolveDialogOpen(false);
      setTransferDialogOpen(false);
      setTransferUserId('');
      setIsTransferringConversation(false);
      return;
    }

    const conversationId = conversation.id;
    let active = true;

    const hydrateConversationState = async () => {
      shouldPromoteDraftOnExitRef.current = false;
      shouldDeleteDraftOnExitRef.current = false;
      setIsLightboxOpen(false);
      setLightboxActiveId('');
      setImageFiles(null);
      setReplyTo(null);
      setSearchMode(false);
      setMsgSearch('');
      setTransferDialogOpen(false);
      setTransferUserId('');
      setIsTransferringConversation(false);
      setIsLoadingMessages(true);
      setIsLoadingOlder(false);
      setIsLoadingHistory(false);
      setDraftValue('');
      setMessages([]);
      setHasOlderMessages(true);
      setHasHistoryMessages(true);
      stickToBottomRef.current = true;

      const [cachedMessages, cachedDraft] = await Promise.all([
        readCachedMessages(conversationId),
        readCachedDraft(conversationId),
      ]);

      if (active && cachedMessages.length > 0) {
        setMessages(mergeMessages([], filterMostRecentMessageDays(cachedMessages)));
      }

      if (active) {
        setDraftValue(cachedDraft);
      }

      try {
        const [recentMessages, chatbotEvents] = await Promise.all([
          fetchWhatsappMessages(conversationId, {
            tail: INITIAL_MESSAGE_PAGE_SIZE,
            markRead: true,
            conversationIds: conversation.source_conversation_ids,
            sourceAccounts: conversation.source_accounts,
          }),
          fetchChatbotEvents(conversationId).catch(() => []),
        ]);

        if (!active) return;

        const visibleRecentMessages = filterMostRecentMessageDays(recentMessages);
        setMessages((currentMessages) => {
          const mergedMessages = mergeMessages(currentMessages, [...visibleRecentMessages, ...chatbotEvents]);
          void writeCachedMessages(conversationId, trimMessagesForCache(mergedMessages));
          return mergedMessages;
        });
        setHasOlderMessages(
          recentMessages.length >= INITIAL_MESSAGE_PAGE_SIZE ||
            visibleRecentMessages.length < recentMessages.length,
        );
      } catch (error) {
        if (active && cachedMessages.length === 0) {
          toast.error(error?.message || 'Não foi possível carregar as mensagens.');
        }
      } finally {
        if (active) {
          setIsLoadingMessages(false);
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
          });
        }
      }
    };

    void hydrateConversationState();

    return () => {
      active = false;
    };
  }, [conversation?.id, sourceConversationIdsKey, sourceAccountsKey]);

  useEffect(() => {
    if (!conversation?.id) return;
    if (draftValue.trim().length === 0) {
      return;
    }
    void writeCachedDraft(conversation.id, draftValue);
  }, [conversation?.id, draftValue]);

  useEffect(() => {
    if (!conversation?.id) return undefined;

    const intervalId = window.setInterval(async () => {
      try {
        const [recentMessages, chatbotEvents] = await Promise.all([
          fetchWhatsappMessages(conversation.id, {
            tail: RECENT_MESSAGE_POLL_TAIL_SIZE,
            conversationIds: conversation.source_conversation_ids,
            sourceAccounts: conversation.source_accounts,
          }),
          fetchChatbotEvents(conversation.id).catch(() => []),
        ]);

        if (recentMessages.length === 0 && chatbotEvents.length === 0) return;

        const latestIncomingMessage = recentMessages[recentMessages.length - 1];
        setMessages((currentMessages) => {
          const mergedMessages = mergeMessages(currentMessages, [...recentMessages, ...chatbotEvents]);
          void writeCachedMessages(conversation.id, trimMessagesForCache(mergedMessages));
          return mergedMessages;
        });
        if (latestIncomingMessage) {
          updateConversationQueryCaches(queryClient, conversation.id, (currentConversation) => {
            const patch = buildConversationActivityPatch(currentConversation, latestIncomingMessage);
            return patch ? { ...currentConversation, ...patch } : currentConversation;
          });
        }
      } catch {
        // Ignore background polling failures and keep UI stable.
      }
    }, NEWER_MESSAGES_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [conversation?.id, queryClient, sourceConversationIdsKey, sourceAccountsKey]);

  useEffect(() => {
    if (!conversation?.id || messages.length === 0) return;
    void writeCachedMessages(conversation.id, trimMessagesForCache(messages));
  }, [conversation?.id, messages]);

  const updateMessage = (messageId, updater) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== messageId && message.temp_id !== messageId) return message;
        return typeof updater === 'function' ? updater(message) : { ...message, ...updater };
      })
    );
  };

  const refreshRecentMessages = async () => {
    if (!conversation?.id) return;

    const [recentMessages, chatbotEvents] = await Promise.all([
      fetchWhatsappMessages(conversation.id, {
        tail: INITIAL_MESSAGE_PAGE_SIZE,
        conversationIds: conversation.source_conversation_ids,
        sourceAccounts: conversation.source_accounts,
      }).catch(() => []),
      fetchChatbotEvents(conversation.id).catch(() => []),
    ]);

    if (recentMessages.length > 0 || chatbotEvents.length > 0) {
      const latestRecentMessage = recentMessages[recentMessages.length - 1];
      setMessages((currentMessages) => {
        const mergedMessages = mergeMessages(currentMessages, [...recentMessages, ...chatbotEvents]);
        void writeCachedMessages(conversation.id, trimMessagesForCache(mergedMessages));
        return mergedMessages;
      });
      if (latestRecentMessage) {
        updateConversationQueryCaches(queryClient, conversation.id, (currentConversation) => {
          const patch = buildConversationActivityPatch(currentConversation, latestRecentMessage);
          return patch ? { ...currentConversation, ...patch } : currentConversation;
        });
      }
    }
  };

  const loadHistoryMessages = async () => {
    if (!conversation?.id || isLoadingHistory || !hasHistoryMessages) {
      return;
    }

    const oldestTimestamp = messages[0]?.created_date || messages[0]?.timestamp || new Date().toISOString();
    const container = scrollContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;

    setIsLoadingHistory(true);

    try {
      const historyMessages = await fetchWhatsappHistoryMessages(conversation, {
        tail: 1000,
        until: oldestTimestamp,
        windowDays: 7,
      });
      const loadedMessages = Array.isArray(historyMessages?.messages) ? historyMessages.messages : [];

      if (loadedMessages.length === 0) {
        setHasHistoryMessages(false);
        toast.info('Nenhum historico adicional encontrado.');
        return;
      }

      setMessages((currentMessages) => {
        const mergedMessages = mergeMessages(currentMessages, loadedMessages);
        return mergedMessages;
      });
      setHasHistoryMessages(Boolean(historyMessages.hasMore));

      requestAnimationFrame(() => {
        const nextContainer = scrollContainerRef.current;
        if (!nextContainer) return;
        const nextScrollHeight = nextContainer.scrollHeight;
        nextContainer.scrollTop = nextScrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (error) {
      toast.error(error?.message || 'Nao foi possivel carregar o historico.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadOlderMessages = async ({ fallbackToHistory = false } = {}) => {
    if (!conversation?.id || isLoadingOlder || !hasOlderMessages || messages.length === 0) {
      if (fallbackToHistory && !hasOlderMessages) {
        await loadHistoryMessages();
      }
      return;
    }

    const oldestTimestamp = messages[0]?.created_date || messages[0]?.timestamp;
    if (!oldestTimestamp) {
      setHasOlderMessages(false);
      if (fallbackToHistory) {
        await loadHistoryMessages();
      }
      return;
    }

    const container = scrollContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;

    setIsLoadingOlder(true);

    try {
      const olderMessages = await fetchWhatsappMessages(conversation.id, {
        tail: OLDER_MESSAGE_PAGE_SIZE,
        until: oldestTimestamp,
        conversationIds: conversation.source_conversation_ids,
        sourceAccounts: conversation.source_accounts,
      });

      if (olderMessages.length === 0) {
        setHasOlderMessages(false);
        if (fallbackToHistory) {
          await loadHistoryMessages();
        }
        return;
      }

      setMessages((currentMessages) => mergeMessages(currentMessages, olderMessages));
      setHasOlderMessages(olderMessages.length >= OLDER_MESSAGE_PAGE_SIZE);

      requestAnimationFrame(() => {
        const nextContainer = scrollContainerRef.current;
        if (!nextContainer) return;
        const nextScrollHeight = nextContainer.scrollHeight;
        nextContainer.scrollTop = nextScrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (error) {
      toast.error(error?.message || 'Não foi possível carregar mensagens antigas.');
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleLoadMoreMessages = async () => {
    if (isLoadingOlder || isLoadingHistory) return;
    if (hasOlderMessages) {
      await loadOlderMessages({ fallbackToHistory: true });
      return;
    }
    await loadHistoryMessages();
  };

  const appendOptimisticMessage = (optimisticMessage) => {
    setMessages((currentMessages) => mergeMessages(currentMessages, [optimisticMessage]));
    return optimisticMessage.temp_id;
  };

  const createOrderedOptimisticMessage = (payload) =>
    createOptimisticMessage({
      ...payload,
      senderName: currentUserName,
      clientOrder: nextOutgoingOrderRef.current++,
    });

  const queueOutgoingRequest = (task) => {
    const nextTask = Promise.resolve().then(task);
    outgoingQueueRef.current = nextTask.catch(() => undefined);
    return nextTask;
  };

  const registerRetryPayload = (messageId, payload) => {
    const safeMessageId = String(messageId || '').trim();
    if (!safeMessageId || !payload) return;
    retryPayloadsRef.current.set(safeMessageId, payload);
  };

  const clearRetryPayload = (messageId) => {
    const safeMessageId = String(messageId || '').trim();
    if (!safeMessageId) return;
    retryPayloadsRef.current.delete(safeMessageId);
  };

  const scheduleOptimisticSentStatus = (messageId) => {
    const safeMessageId = String(messageId || '').trim();
    if (!safeMessageId) return;

    window.setTimeout(() => {
      updateMessage(safeMessageId, (message) => {
        const currentStatus = String(message?.status || '').trim().toLowerCase();
        if (!['pending', 'sending', 'uploading'].includes(currentStatus)) {
          return message;
        }

        return {
          ...message,
          status: 'sent',
          upload_progress: 100,
        };
      });
    }, 500);
  };

  const finalizeOutgoingMessage = async (lastMessageText) => {
    await refreshRecentMessages();

    if (onUpdateConversation) {
      onUpdateConversation({
        ...conversation,
        last_message: lastMessageText || conversation.last_message,
      });
    }
  };

  const commitSendSuccess = (optimisticId, result, lastMessageText) => {
    const responseMessageId = extractResponseMessageId(result);
    const retryPayload = retryPayloadsRef.current.get(String(optimisticId || '').trim()) || null;

    updateMessage(optimisticId, (message) => ({
      ...message,
      server_message_id: responseMessageId || message.server_message_id || '',
      sender_name: currentUserName,
      status: 'sent',
      upload_progress: 100,
      reply_preview: message.reply_preview || null,
    }));

    clearRetryPayload(optimisticId);

    void finalizeOutgoingMessage(lastMessageText);
  };

  const commitSendFailure = (optimisticId, updates, fallbackMessage) => {
    updateMessage(optimisticId, (message) => ({
      ...message,
      status: 'failed',
      upload_progress: 0,
      ...updates,
    }));
    toast.error(fallbackMessage);
  };

  const clearComposerAfterSend = () => {
    shouldDeleteDraftOnExitRef.current = false;
    shouldPromoteDraftOnExitRef.current = false;
    if (conversation?.id) {
      void deleteCachedDraft(conversation.id);
    }
    setReplyTo(null);
  };

  const enqueueTextSend = ({ messageId, content, replyToMessage }) => {
    const optimisticMessage =
      messageId
        ? null
        : createOrderedOptimisticMessage({
            conversationId: conversation.id,
            content: content.trim(),
            replyToMessage,
            replyPreview: buildReplyPreview(replyToMessage),
            status: 'pending',
          });
    const targetMessageId =
      messageId ||
      appendOptimisticMessage(optimisticMessage);

    registerRetryPayload(targetMessageId, {
      kind: 'text',
      content,
      replyToMessage,
      optimisticMessage,
    });

    updateMessage(targetMessageId, { status: 'pending', upload_progress: 0 });
    scheduleOptimisticSentStatus(targetMessageId);

    return queueOutgoingRequest(async () => {
      try {
      const result = await sendWhatsappTextMessage({
          to: conversation.contact_phone,
          text: content.trim(),
          contextMessageId: replyToMessage?.id || null,
          replyTo: replyToMessage?.content || null,
          agentName: currentUserName,
          routeSelector: activeManualRouteSelector,
          clientMessageId: optimisticMessage?.client_message_id,
        });

        commitSendSuccess(targetMessageId, result, content.trim());
      } catch (error) {
        commitSendFailure(targetMessageId, {}, error?.message || 'Não foi possível enviar a mensagem.');
      }
    });

    return targetMessageId;
  };

  const enqueueImageSend = ({ messageId, file, mimetype, caption, replyToMessage, previewUrl }) => {
    const optimisticMessage =
      messageId
        ? null
        : createOrderedOptimisticMessage({
            conversationId: conversation.id,
            content: caption || '',
            messageType: 'image',
            replyToMessage,
            replyPreview: buildReplyPreview(replyToMessage),
            status: 'uploading',
            uploadProgress: 20,
            attachments: previewUrl ? [{ type: 'image', url: previewUrl, name: 'Imagem' }] : [],
          });
    const targetMessageId =
      messageId ||
      appendOptimisticMessage(optimisticMessage);

    registerRetryPayload(targetMessageId, {
      kind: 'image',
      file,
      mimetype,
      caption,
      replyToMessage,
      previewUrl,
      optimisticMessage,
    });

    updateMessage(targetMessageId, { status: 'uploading', upload_progress: 20 });
    scheduleOptimisticSentStatus(targetMessageId);

    return queueOutgoingRequest(async () => {
      try {
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 45 },
        );
        const imageBase64 = await fileToBase64Payload(file, 'Não foi possível ler a imagem selecionada.');
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 75 },
        );

        const result = await sendWhatsappImageMessage({
          to: conversation.contact_phone,
          imageBase64,
          mimetype: mimetype || file?.type || 'image/jpeg',
          caption,
          contextMessageId: replyToMessage?.id || null,
          replyTo: replyToMessage?.content || null,
          agentName: currentUserName,
          routeSelector: activeManualRouteSelector,
          clientMessageId: optimisticMessage?.client_message_id,
        });

        commitSendSuccess(targetMessageId, result, caption || 'Imagem');
      } catch (error) {
        commitSendFailure(
          targetMessageId,
          { status: 'failed', upload_progress: 0 },
          error?.message || 'Não foi possível enviar a imagem.'
        );
      }
    });

    return targetMessageId;
  };

  const enqueueAudioSend = ({ messageId, file, audioBase64, mimetype, replyToMessage }) => {
    const previewUrl = file ? URL.createObjectURL(file) : '';
    const optimisticMessage =
      messageId
        ? null
        : createOrderedOptimisticMessage({
            conversationId: conversation.id,
            content: '',
            messageType: 'audio',
            replyToMessage,
            replyPreview: buildReplyPreview(replyToMessage),
            status: 'uploading',
            uploadProgress: 25,
            attachments: previewUrl
              ? [
                  {
                    type: 'audio',
                    url: previewUrl,
                    name: file?.name || 'Audio',
                    mimeType: mimetype || file?.type || 'audio/ogg',
                  },
                ]
              : [],
          });
    const targetMessageId =
      messageId ||
      appendOptimisticMessage(optimisticMessage);

    registerRetryPayload(targetMessageId, {
      kind: 'audio',
      file,
      audioBase64,
      mimetype,
      replyToMessage,
      optimisticMessage,
    });

    updateMessage(targetMessageId, { status: 'uploading', upload_progress: 25 });
    scheduleOptimisticSentStatus(targetMessageId);

    return queueOutgoingRequest(async () => {
      try {
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 55 },
        );
        const payload =
          audioBase64 ||
          (await fileToBase64Payload(file, 'Não foi possível ler o audio selecionado.'));
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 80 },
        );

        const result = await sendWhatsappAudioMessage({
          to: conversation.contact_phone,
          audioBase64: payload,
          mimetype: mimetype || file?.type || 'audio/ogg',
          ptt: true,
          contextMessageId: replyToMessage?.id || null,
          replyTo: replyToMessage?.content || null,
          agentName: currentUserName,
          routeSelector: activeManualRouteSelector,
          clientMessageId: optimisticMessage?.client_message_id,
        });

        commitSendSuccess(targetMessageId, result, 'Audio');
      } catch (error) {
        commitSendFailure(
          targetMessageId,
          { status: 'failed', upload_progress: 0 },
          error?.message || 'Não foi possível enviar o audio.'
        );
      }
    });

    return targetMessageId;
  };

  const enqueueDocumentSend = ({ messageId, file, mimetype, filename, caption, replyToMessage }) => {
    const previewUrl = file ? URL.createObjectURL(file) : '';
    const safeName = String(filename || file?.name || 'Documento').trim() || 'Documento';
    const optimisticMessage =
      messageId
        ? null
        : createOrderedOptimisticMessage({
            conversationId: conversation.id,
            content: caption || safeName,
            messageType: 'document',
            replyToMessage,
            replyPreview: buildReplyPreview(replyToMessage),
            status: 'uploading',
            uploadProgress: 20,
            attachments: previewUrl
              ? [
                  {
                    type: 'document',
                    url: previewUrl,
                    name: safeName,
                    mimeType: mimetype || file?.type || 'application/octet-stream',
                  },
                ]
              : [],
          });
    const targetMessageId =
      messageId ||
      appendOptimisticMessage(optimisticMessage);

    registerRetryPayload(targetMessageId, {
      kind: 'document',
      file,
      mimetype,
      filename: safeName,
      caption,
      replyToMessage,
      optimisticMessage,
    });

    updateMessage(targetMessageId, { status: 'uploading', upload_progress: 20 });
    scheduleOptimisticSentStatus(targetMessageId);

    return queueOutgoingRequest(async () => {
      try {
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 45 },
        );
        const documentBase64 = await fileToBase64Payload(file, 'Não foi possível ler o documento selecionado.');
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 75 },
        );

        const result = await sendWhatsappDocumentMessage({
          to: conversation.contact_phone,
          documentBase64,
          mimetype: mimetype || file?.type || 'application/octet-stream',
          filename: safeName,
          caption,
          contextMessageId: replyToMessage?.id || null,
          replyTo: replyToMessage?.content || null,
          agentName: currentUserName,
          routeSelector: activeManualRouteSelector,
          clientMessageId: optimisticMessage?.client_message_id,
        });

        commitSendSuccess(targetMessageId, result, caption || safeName);
      } catch (error) {
        commitSendFailure(
          targetMessageId,
          { status: 'failed', upload_progress: 0 },
          error?.message || 'Não foi possível enviar o documento.'
        );
      }
    });

    return targetMessageId;
  };

  const enqueueVideoSend = ({ messageId, file, mimetype, filename, caption, replyToMessage, previewUrl }) => {
    const safeName = String(filename || file?.name || 'video').trim() || 'video';
    const optimisticMessage =
      messageId
        ? null
        : createOrderedOptimisticMessage({
            conversationId: conversation.id,
            content: caption || safeName,
            messageType: 'video',
            replyToMessage,
            replyPreview: buildReplyPreview(replyToMessage),
            status: 'uploading',
            uploadProgress: 20,
            attachments: previewUrl ? [{ type: 'video', url: previewUrl, name: safeName, mimeType: mimetype || file?.type || 'video/mp4' }] : [],
          });
    const targetMessageId = messageId || appendOptimisticMessage(optimisticMessage);

    registerRetryPayload(targetMessageId, {
      kind: 'video',
      file,
      mimetype,
      filename: safeName,
      caption,
      replyToMessage,
      optimisticMessage,
    });

    updateMessage(targetMessageId, { status: 'uploading', upload_progress: 20 });
    scheduleOptimisticSentStatus(targetMessageId);

    return queueOutgoingRequest(async () => {
      try {
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 45 },
        );
        const videoBase64 = await fileToBase64Payload(file, 'Não foi possível ler o vídeo selecionado.');
        updateMessage(targetMessageId, (message) =>
          message.status === 'sent' ? message : { ...message, status: 'uploading', upload_progress: 75 },
        );

        const result = await sendWhatsappVideoMessage({
          to: conversation.contact_phone,
          videoBase64,
          mimetype: mimetype || file?.type || 'video/mp4',
          filename: safeName,
          caption,
          contextMessageId: replyToMessage?.id || null,
          replyTo: replyToMessage?.content || null,
          agentName: currentUserName,
          routeSelector: activeManualRouteSelector,
          clientMessageId: optimisticMessage?.client_message_id,
        });

        commitSendSuccess(targetMessageId, result, caption || safeName);
      } catch (error) {
        commitSendFailure(
          targetMessageId,
          { status: 'failed', upload_progress: 0 },
          error?.message || 'Não foi possível enviar o vídeo.'
        );
      }
    });
  };

  const enqueueTemplateSend = ({ messageId, template }) => {
    const previewText = buildTemplatePreview(template);
    const templateButtons = getTemplateButtons(template);
    const headerParameters =
      template.headerMediaUrl && template.headerFormat && template.headerFormat !== 'TEXT'
        ? [template.headerMediaUrl]
        : [];
    const optimisticMessage =
      messageId
        ? null
        : createOrderedOptimisticMessage({
            conversationId: conversation.id,
            content: previewText || `Template: ${template.name}`,
            messageType: 'template',
            attachments:
              template.headerType === 'image' && template.headerMediaUrl
                ? [{ type: 'image', url: template.headerMediaUrl, name: 'Template header image' }]
                : [],
            templateButtons,
            status: 'pending',
          });

    const targetMessageId =
      messageId ||
      appendOptimisticMessage(optimisticMessage);

    registerRetryPayload(targetMessageId, {
      kind: 'template',
      template,
      optimisticMessage,
    });

    updateMessage(targetMessageId, { status: 'pending', upload_progress: 0 });
    scheduleOptimisticSentStatus(targetMessageId);

    return queueOutgoingRequest(async () => {
      try {
        const result = await sendWhatsappTemplateMessage({
          to: conversation.contact_phone,
          templateName: template.name,
          language: template.language || 'pt_BR',
          parameters: Array.isArray(template.bodyVariables) ? template.bodyVariables : [],
          buttonParameters: Array.isArray(template.buttonParameters) ? template.buttonParameters : [],
          headerParameters,
          headerFormat: template.headerFormat || '',
          previewText,
          agentName: currentUserName,
          routeSelector: defaultHsmRouteSelector,
        });

        commitSendSuccess(targetMessageId, result, previewText || `Template: ${template.name}`);
      } catch (error) {
        commitSendFailure(
          targetMessageId,
          {},
          error?.message || 'Não foi possível enviar o template.'
        );
      }
    });

    return targetMessageId;
  };

  const resolveQuickReplyText = (value) => {
    const customer = conversation?.customer || {};
    const replacements = {
      nome: conversation?.contact_name || customer.name || '',
      telefone: conversation?.contact_phone || customer.phone || '',
      servico: conversation?.sector || conversation?.department || customer.service || '',
      protocolo: conversation?.protocol || conversation?.protocol_number || conversation?.id || '',
      atendente: currentUserName || '',
      usuario: customer.username || customer.user || customer.usuario || '',
      senha: customer.password || customer.senha || '',
      plano: customer.plan || customer.plano || '',
      vencimento: customer.dueDate || customer.vencimento || customer.expirationDate || '',
    };

    return String(value || '').replace(/\{#([^}]+)\}/g, (_, hashKey) => {
      const key = String(hashKey || '').trim().toLowerCase();
      return replacements[key] ?? '';
    });
  };

  const handleExecuteQuickReply = async (reply) => {
    if (!conversation?.id) {
      toast.error('Selecione uma conversa antes de enviar a resposta rápida.');
      return;
    }
    if (!isWithin24hWindow) {
      toast.error('A janela de 24h está fechada. Use um template HSM para retomar o contato.');
      return;
    }

    const actions = getQuickReplyActions(reply);
    if (!actions.length) {
      toast.error('Esta resposta rápida não possui ações configuradas.');
      return;
    }

    try {
      for (const action of actions) {
        const typingDelay = Math.max(0, Math.min(300, Number(action.typingDelaySeconds) || 0));
        const nextDelay = Math.max(0, Math.min(300, Number(action.nextActionDelaySeconds) || 0));

        if (action.type === 'timer' || action.type === 'wait') {
          await delaySeconds(Math.max(nextDelay, Math.max(0, Math.min(300, Number(action.waitSeconds) || 0))));
          continue;
        }

        if (typingDelay > 0) {
          await delaySeconds(typingDelay);
        }

        if (action.type === 'text') {
          const content = resolveQuickReplyText(action.content);
          if (content.trim()) {
            await enqueueTextSend({ content, replyToMessage: null });
          }
        } else if (['image', 'video', 'audio', 'document'].includes(action.type)) {
          const mediaPayload = resolveQuickReplyMediaPayload(action);
          if (!mediaPayload?.dataUrl) {
            toast.message(`Ação "${action.type}" ignorada: nenhum arquivo configurado.`);
          } else {
            console.info(
              `Executando ação de ${mediaPayload.kind}: mimeType=${mediaPayload.mimeType}, endpoint=${mediaPayload.endpoint}, sizeKb=${mediaPayload.approxSizeKb}`
            );
            const file = dataUrlToFile(mediaPayload.dataUrl, mediaPayload.fileName, mediaPayload.mimeType);
            const caption = resolveQuickReplyText(mediaPayload.caption);
            if (mediaPayload.kind === 'image') {
              await enqueueImageSend({
                file,
                mimetype: mediaPayload.mimeType || file.type,
                caption,
                replyToMessage: null,
                previewUrl: mediaPayload.dataUrl,
              });
            } else if (mediaPayload.kind === 'video') {
              await enqueueVideoSend({
                file,
                mimetype: mediaPayload.mimeType || file.type,
                filename: mediaPayload.fileName || file.name,
                caption,
                replyToMessage: null,
                previewUrl: mediaPayload.dataUrl,
              });
            } else if (mediaPayload.kind === 'audio') {
              await enqueueAudioSend({
                file,
                mimetype: mediaPayload.mimeType || file.type,
                replyToMessage: null,
              });
            } else {
              await enqueueDocumentSend({
                file,
                mimetype: mediaPayload.mimeType || file.type,
                filename: mediaPayload.fileName || file.name,
                caption,
                replyToMessage: null,
              });
            }
          }
        } else if (action.type === 'ura') {
          const uraPayload = resolveQuickReplyUraPayload(action, resolveQuickReplyText);
          if (!uraPayload.buttons.length) {
            toast.message('URA ignorada: adicione ao menos uma opção válida.');
          } else {
            try {
              await sendWhatsappInteractiveMessage({
                to: conversation.contact_phone,
                text: uraPayload.text,
                buttonText: uraPayload.buttonText,
                buttons: uraPayload.buttons,
                footer: uraPayload.footer,
                agentName: currentUserName,
              });
              console.info(`URA enviada como botões com ${uraPayload.buttons.length} opções`);
            } catch (error) {
              console.warn('Envio de URA por botões ainda não possui integração ativa.', error);
              toast.message('Envio de URA por botões ainda não possui integração ativa. A sequência continuará.');
            }
          }
        } else if (action.type === 'transfer') {
          const customerMessage = resolveQuickReplyText(action.metadata?.customerMessage || '');
          if (customerMessage.trim()) {
            await enqueueTextSend({ content: customerMessage, replyToMessage: null });
          }
          toast.message('Transferência automática ainda precisa de integração. A sequência continuará.');
        } else {
          toast.message('Esta ação ainda não está disponível para envio.');
        }

        if (nextDelay > 0) {
          await delaySeconds(nextDelay);
        }
      }

      await incrementQuickReplyUsage(reply);
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
    } catch (error) {
      toast.error(error?.message || 'Não foi possível executar a resposta rápida.');
    }
  };

  const handleSendText = async ({ content, replyToMessage }) => {
    if (!conversation?.id || !content.trim()) return;
    clearComposerAfterSend();
    enqueueTextSend({
      content,
      replyToMessage,
    });
  };

  const handleSendImage = async ({
    file,
    mimetype,
    caption,
    replyToMessage,
    previewUrl,
  }) => {
    if (!conversation?.id || !file) return;
    if (replyToMessage) {
      setReplyTo(null);
    }
    enqueueImageSend({
      file,
      mimetype,
      caption,
      replyToMessage,
      previewUrl,
    });
  };

  const handleSendAudio = async ({ file, audioBase64, mimetype, replyToMessage }) => {
    if (!conversation?.id || (!file && !audioBase64)) return;
    if (replyToMessage) {
      setReplyTo(null);
    }
    enqueueAudioSend({
      file,
      audioBase64,
      mimetype,
      replyToMessage,
    });
  };

  const handleSendDocument = async ({ file, mimetype, filename, caption, replyToMessage }) => {
    if (!conversation?.id || !file) return;
    if (replyToMessage) {
      setReplyTo(null);
    }
    enqueueDocumentSend({
      file,
      mimetype,
      filename,
      caption,
      replyToMessage,
    });
  };

  const handleSendVideo = async ({ file, mimetype, filename, caption, replyToMessage, previewUrl }) => {
    if (!conversation?.id || !file) return;
    if (replyToMessage) {
      setReplyTo(null);
    }
    enqueueVideoSend({
      file,
      mimetype,
      filename,
      caption,
      replyToMessage,
      previewUrl,
    });
  };

  const handleSendPreviewImages = async ({ items }) => {
    const safeItems = Array.isArray(items) ? items.filter((item) => item?.file) : [];
    if (!conversation?.id || safeItems.length === 0) return;

    const currentReplyTo = replyTo || null;

    setImageFiles(null);
    setReplyTo(null);

    safeItems.forEach((item, index) => {
      handleSendImage({
        file: item.file,
        mimetype: item.file.type || 'image/jpeg',
        caption: String(item.caption || '').trim(),
        replyToMessage: index === 0 ? currentReplyTo : null,
        previewUrl: item.url,
      });
    });
  };

  const handleSendTemplate = async (template) => {
    if (!conversation?.id || !template?.name) return;
    enqueueTemplateSend({ template });
  };

  const handleResolveConversation = async () => {
    if (!conversation?.id || isResolvingConversation) {
      return;
    }

    const resolvedAt = new Date().toISOString();
    const lastClientMessageAt =
      conversation.last_client_message_time ||
      conversation.last_received_at ||
      conversation.last_message_time ||
      resolvedAt;
    const lastClientMessageMs = Date.parse(String(lastClientMessageAt || ''));
    const resolvedUntil =
      Number.isFinite(lastClientMessageMs) && lastClientMessageMs > 0
        ? new Date(lastClientMessageMs + 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.parse(resolvedAt) + 24 * 60 * 60 * 1000).toISOString();
    const resolutionLabel = resolveType === 'lack_of_interaction' ? 'falta de interação' : 'atendimento encerrado';

    setIsResolvingConversation(true);

    try {
      const savedPreference = await saveConversationPreference(conversation.id, {
        resolution_status: 'resolved',
        resolution_type: resolveType,
        resolved_at: resolvedAt,
        resolved_until: resolvedUntil,
        resolved_by_id: currentUserId,
        resolved_by_name: currentUserName,
        sourceConversationIds: conversation.source_conversation_ids,
      });

      queryClient.setQueryData(['conversation-preferences'], (current = []) => {
        const nextItems = Array.isArray(current) ? [...current] : [];
        const currentIndex = nextItems.findIndex(
          (item) => String(item?.conversation_id || item?.id || '') === String(conversation.id)
        );

        if (currentIndex >= 0) {
          nextItems[currentIndex] = savedPreference;
        } else {
          nextItems.unshift(savedPreference);
        }

        return nextItems;
      });

      const resolutionMessage = buildConversationResolutionSystemMessage({
        conversationId: conversation.id,
        type: resolveType,
        agentName: currentUserName,
      });

      setMessages((currentMessages) => mergeMessages(currentMessages, [resolutionMessage]));

      if (onUpdateConversation) {
        onUpdateConversation({
          ...conversation,
          resolution_status: 'resolved',
          resolution_type: resolveType,
          resolved_at: resolvedAt,
          resolved_until: resolvedUntil,
          resolved_by_id: currentUserId,
          resolved_by_name: currentUserName,
          is_daily_resolved: false,
        });
      }

      setResolveDialogOpen(false);
      onClearConversation?.();
      toast.success(`Conversa encerrada como ${resolutionLabel}.`);
    } catch (error) {
      toast.error(error?.message || 'Não foi possível encerrar a conversa.');
    } finally {
      setIsResolvingConversation(false);
    }
  };

  const handleTransferConversation = async () => {
    if (!conversation?.id || !transferUserId || isTransferringConversation) {
      return;
    }

    setIsTransferringConversation(true);

    try {
      const result = await assignConversationToUser(conversation.id, transferUserId, {
        sourceConversationIds: conversation.source_conversation_ids,
        matchingServiceIds: conversation.matching_service_ids,
      });

      if (result?.conversation && onUpdateConversation) {
        onUpdateConversation({
          ...conversation,
          ...result.conversation,
        });
      }

      setTransferDialogOpen(false);
      setTransferUserId('');
      await queryClient.invalidateQueries({ queryKey: ['conversations', 'attendance'] });

      if (!isCurrentUserAdmin) {
        onClearConversation?.();
      }

      toast.success('Atendimento transferido.');
    } catch (error) {
      toast.error(error?.message || 'NÃ£o foi possÃ­vel transferir o atendimento.');
    } finally {
      setIsTransferringConversation(false);
    }
  };

  const handleRetryMessage = (message) => {
    const retryKey = String(message?.temp_id || message?.id || '').trim();
    if (!retryKey) return;

    const retryPayload = retryPayloadsRef.current.get(retryKey);
    if (!retryPayload) {
      toast.message('Não há dados suficientes para reenviar esta mensagem.');
      return;
    }

    if (retryPayload.kind === 'text') {
      enqueueTextSend({ ...retryPayload, messageId: retryKey });
      return;
    }

    if (retryPayload.kind === 'image') {
      enqueueImageSend({ ...retryPayload, messageId: retryKey });
      return;
    }

    if (retryPayload.kind === 'audio') {
      enqueueAudioSend({ ...retryPayload, messageId: retryKey });
      return;
    }

    if (retryPayload.kind === 'video') {
      enqueueVideoSend({ ...retryPayload, messageId: retryKey });
      return;
    }

    if (retryPayload.kind === 'document') {
      enqueueDocumentSend({ ...retryPayload, messageId: retryKey });
      return;
    }

    if (retryPayload.kind === 'template') {
      enqueueTemplateSend({ ...retryPayload, messageId: retryKey });
      return;
    }

    toast.message('Reenvio indisponível para este tipo de mensagem.');
  };

  const handleReact = async (message, emoji) => {
    const reactionMessageId = message?.server_message_id || message?.id;
    if (!conversation?.id || !reactionMessageId) return;

    const currentAgentReaction = getReactionList(message).find((reaction) => reaction.from === 'agent')?.emoji || '';
    const nextEmoji = currentAgentReaction === emoji ? '' : emoji;
    const previousReactions = getReactionList(message);

    updateMessage(message.id, {
      reactions: applyReactionChange(previousReactions, 'agent', nextEmoji),
      pending_agent_reaction: nextEmoji,
      pending_agent_reaction_at: new Date().toISOString(),
    });

    try {
      await reactToWhatsappMessage({
        conversationId: conversation.id,
        messageId: reactionMessageId,
        emoji: nextEmoji,
        from: 'agent',
      });
    } catch (error) {
      updateMessage(message.id, {
        reactions: previousReactions,
        pending_agent_reaction: null,
        pending_agent_reaction_at: null,
      });
      toast.error(error?.message || 'Não foi possível reagir a mensagem.');
    }
  };

  const handleForwardMessage = (message) => {
    console.info('forward_message', message);
    toast.message('Encaminhamento ainda não está disponível neste painel.');
  };

  const handleDeleteMessage = (message) => {
    console.info('delete_message', message);
    toast.message('Exclusão de mensagem ainda não está disponível neste painel.');
  };

  const handleMessageInfo = (message) => {
    console.info('message_info', message);
    const createdAt = message?.created_date ? format(new Date(message.created_date), 'HH:mm') : '--:--';
    toast.message(`Mensagem ${message?.status || 'sem status'} enviada às ${createdAt}.`);
  };

  useEffect(() => {
    if (!searchMode && stickToBottomRef.current && !isLoadingOlder) {
      messagesEndRef.current?.scrollIntoView({
        behavior: messages.length > INITIAL_MESSAGE_PAGE_SIZE ? 'smooth' : 'auto',
      });
    }
  }, [messages, searchMode, isLoadingOlder]);

  const filteredMessages = msgSearch
    ? messages.filter((message) =>
        String(message.content || '').toLowerCase().includes(msgSearch.toLowerCase())
      )
    : messages;

  const grouped = groupMessagesByDate(filteredMessages);
  const st = statusConfig[conversation?.status] || statusConfig.waiting;
  const visibleLabels = Array.isArray(conversation?.visible_labels) ? conversation.visible_labels : [];

  if (!conversation) {
    return (
      <div className="chat-app-shell flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
            <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
              <rect x="11" y="2" width="6" height="24" rx="2.5" fill="url(#pg2)" />
              <rect x="2" y="11" width="24" height="6" rx="2.5" fill="url(#pg2)" />
              <defs>
                <linearGradient id="pg2" x1="2" y1="2" x2="26" y2="26" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#4ade80" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">Selecione uma conversa</h3>
            <p className="text-sm text-muted-foreground mt-1">Escolha um atendimento para começar</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app-shell flex-1 flex flex-col h-full bg-background min-w-0">
      <div className="chat-header h-14 px-4 flex items-center justify-between border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <ContactAvatar
              src={conversation.avatar_url}
              name={conversation.contact_name || 'Contato'}
              className="w-9 h-9"
              textClassName="text-sm"
            />
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
                st.color
              )}
            />
          </div>
          <div data-chat-selection-surface="true" className="min-w-0 select-text">
            <h3
              data-chat-selection-surface="true"
              className="font-semibold text-sm text-foreground leading-tight truncate select-text"
            >
              {conversation.contact_name}
            </h3>
            <div data-chat-selection-surface="true" className="flex items-center gap-2 flex-wrap select-text">
              <span
                data-chat-selection-surface="true"
                className="text-[11px] text-muted-foreground select-text"
              >
                {conversation.contact_phone}
              </span>
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', st.color)} />
              <span
                data-chat-selection-surface="true"
                className="text-[11px] text-muted-foreground select-text"
              >
                {st.label}
              </span>
              {visibleLabels.slice(0, 2).map((label) => (
                <LabelBadge key={label.id} label={label} compact />
              ))}
              {visibleLabels.length > 2 ? (
                <span
                  data-chat-selection-surface="true"
                  className="text-[10px] font-medium text-muted-foreground select-text"
                >
                  +{visibleLabels.length - 2}
                </span>
              ) : null}
              <Badge
                variant="outline"
                className={cn(
                  'h-5 text-[10px] gap-1',
                  isWithin24hWindow
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700'
                    : 'border-amber-500/25 bg-amber-500/10 text-amber-700'
                )}
              >
                <TimerReset className="w-3 h-3" />
                {isWithin24hWindow ? '24h aberta' : 'Somente HSM'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setSearchMode(!searchMode);
              setMsgSearch('');
            }}
            title="Buscar mensagens"
          >
            <Search className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', showInfo && 'bg-accent text-accent-foreground')}
            onClick={onToggleInfo}
            title="Informações do contato"
          >
            <Info className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setTransferUserId('');
              setTransferDialogOpen(true);
            }}
            title="Transferência"
          >
            <i className="fa-solid fa-arrow-right-arrow-left text-[14px]" aria-hidden="true" />
            <span className="sr-only">Transferência</span>
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 rounded-full border border-destructive/30 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
            onClick={() => setResolveDialogOpen(true)}
            title="Encerrar atendimento"
          >
            <Power className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {searchMode && (
        <div className="chat-header px-4 py-2 border-b border-border flex-shrink-0">
          <Input
            autoFocus
            value={msgSearch}
            onChange={(event) => setMsgSearch(event.target.value)}
            placeholder="Buscar nas mensagens..."
            className="h-8 text-sm bg-background"
          />
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="relative h-full min-w-0 flex-1 transition-[flex-basis,width] duration-200 ease-out">
          <div
          ref={scrollContainerRef}
          data-chat-overlay-boundary="true"
          className="chat-thread-surface attendance-scrollbar relative z-0 h-full overflow-y-auto px-4 pt-4 pb-28 space-y-0.5"
          style={{
            background:
              'radial-gradient(circle at top left, hsl(var(--primary) / 0.12) 0%, transparent 36%), linear-gradient(180deg, hsl(var(--wa-background)) 0%, hsl(var(--background)) 100%)',
          }}
          onScroll={(event) => {
            const element = event.currentTarget;
            const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
            stickToBottomRef.current = distanceFromBottom < 120;

            if (element.scrollTop < 120) {
              void loadOlderMessages();
            }
          }}
          >
          {(hasOlderMessages || hasHistoryMessages) && (
            <div className="flex justify-center py-3">
              <button
                type="button"
                onClick={() => void handleLoadMoreMessages()}
                disabled={isLoadingOlder || isLoadingHistory}
                className="text-[11px] text-muted-foreground bg-muted/80 px-3 py-1 rounded-full shadow-sm transition hover:bg-muted disabled:cursor-wait disabled:opacity-70"
              >
                {isLoadingOlder || isLoadingHistory ? 'Carregando historico...' : 'Ver Mais'}
              </button>
            </div>
          )}

          {isLoadingMessages && messages.length === 0 ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
              <Clock className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{msgSearch ? 'Nenhuma mensagem encontrada' : 'Nenhuma mensagem ainda'}</p>
            </div>
          ) : (
            grouped.map((item, index) => {
              if (item.type === 'separator') {
                return (
                  <div key={`sep-${index}`} className="flex justify-center py-3">
                    <span className="text-[11px] text-muted-foreground bg-muted/80 px-3 py-1 rounded-full shadow-sm">
                      {item.label}
                    </span>
                  </div>
                );
              }

              return (
                <ChatMessage
                  key={
                    item.data.client_message_id ||
                    item.data.provider_message_id ||
                    item.data.server_message_id ||
                    item.data.id
                  }
                  message={item.data}
                  contactAvatarUrl={conversation.avatar_url}
                  contactName={conversation.contact_name}
                  currentUserName={currentUserName}
                  onReply={(message) => setReplyTo(message)}
                  onReact={(message, emoji) => void handleReact(message, emoji)}
                  onForward={handleForwardMessage}
                  onRetry={handleRetryMessage}
                  onDelete={handleDeleteMessage}
                  onInfo={handleMessageInfo}
                  onOpenMedia={(mediaItem) => {
                    setLightboxActiveId(mediaItem.id);
                    setIsLightboxOpen(true);
                  }}
                  onStartConversation={(phone) => onOpenStartConversation?.(phone)}
                />
              );
            })
          )}
          <div ref={messagesEndRef} />
          </div>

          <div className="absolute inset-x-0 bottom-0 z-30">
          <MessageInput
            value={draftValue}
            onValueChange={handleDraftValueChange}
            onSendText={handleSendText}
            onSendAudio={handleSendAudio}
            onSendDocument={handleSendDocument}
            onSendVideo={handleSendVideo}
            onSendTemplate={handleSendTemplate}
            onImageFiles={setImageFiles}
            isPending={false}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            canSendFreeText={isWithin24hWindow}
            windowStatusLabel={windowStatusLabel}
            templates={visibleTemplates}
            focusKey={conversation.id}
            onEscapeToConversationList={onClearConversation}
            onOpenQuickReplies={() => setQuickReplyPanelOpen(true)}
            onOpenStartConversation={() => onOpenStartConversation?.(conversation.contact_phone || conversation.phone || '')}
            />
          </div>

          {imageFiles?.length ? (
            <ImagePreviewModal
              files={imageFiles}
              onSend={handleSendPreviewImages}
              onClose={() => setImageFiles(null)}
            />
          ) : null}
        </div>

        <div
          className={cn(
            'h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
            quickReplyPanelOpen ? 'w-[min(86vw,390px)]' : 'w-0'
          )}
        >
          <QuickReplySidePanel
            open={quickReplyPanelOpen}
            onClose={() => setQuickReplyPanelOpen(false)}
            onExecute={(reply) => void handleExecuteQuickReply(reply)}
            conversation={conversation}
            currentUser={currentUser}
            templates={templates}
            isWithin24hWindow={isWithin24hWindow}
          />
        </div>
      </div>

      <ChatMediaLightbox
        open={isLightboxOpen}
        onOpenChange={setIsLightboxOpen}
        items={lightboxItems}
        activeId={lightboxActiveId}
        onActiveIdChange={setLightboxActiveId}
      />

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encerrar atendimento</DialogTitle>
            <DialogDescription>
              Escolha como este atendimento deve ser encerrado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setResolveType('resolved')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                resolveType === 'resolved' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              )}
            >
              <p className="text-sm font-medium text-foreground">Resolvido</p>
              <p className="text-xs text-muted-foreground">Finaliza o atendimento com sucesso.</p>
            </button>

            <button
              type="button"
              onClick={() => setResolveType('lack_of_interaction')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                resolveType === 'lack_of_interaction'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/40'
              )}
            >
              <p className="text-sm font-medium text-foreground">Falta de interação</p>
              <p className="text-xs text-muted-foreground">Fecha o atendimento por ausência de resposta do cliente.</p>
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)} disabled={isResolvingConversation}>
              Cancelar
            </Button>
            <Button onClick={() => void handleResolveConversation()} disabled={isResolvingConversation}>
              {isResolvingConversation ? 'Encerrando...' : 'Confirmar encerramento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferência</DialogTitle>
            <DialogDescription>
              Selecione um usuário online do mesmo serviço para receber este atendimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="transfer-user">
              Usuário disponível
            </label>
            <select
              id="transfer-user"
              value={transferUserId}
              onChange={(event) => setTransferUserId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              disabled={isTransferringConversation}
            >
              <option value="">Selecione um usuário</option>
              {transferUsers.map((user) => (
                <option key={user.id || user.email} value={user.id || user.email}>
                  {user.full_name || user.name || user.email || user.id}
                </option>
              ))}
            </select>
            {transferUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum usuário ativo disponível para este serviço no momento.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransferDialogOpen(false)}
              disabled={isTransferringConversation}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleTransferConversation()}
              disabled={!transferUserId || isTransferringConversation}
            >
              {isTransferringConversation ? 'Transferindo...' : 'Confirmar transferência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
