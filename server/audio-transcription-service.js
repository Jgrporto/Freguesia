import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const DEFAULT_WHISPER_MODEL = process.env.WHISPER_MODEL || "tiny";
const DEFAULT_WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE || "pt";
const DEFAULT_PYTHON_BIN = process.env.WHISPER_PYTHON_BIN || "python3";
const DEFAULT_TMP_DIR = process.env.WHISPER_TMP_DIR || "server/data/whisper-tmp";
const DEFAULT_MAX_AUDIO_MB = Number.parseInt(process.env.WHISPER_MAX_AUDIO_MB || "25", 10);
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.WHISPER_TIMEOUT_MS || "180000", 10);
const WHISPER_ENABLED = String(process.env.WHISPER_ENABLED || "true").trim().toLowerCase() !== "false";

const nowIso = () => new Date().toISOString();
const normalizeMessageId = (value) => String(value || "").trim();

const audioMimeToExtension = (mimeType = "") => {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return ".mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return ".m4a";
  if (normalized.includes("wav")) return ".wav";
  if (normalized.includes("webm")) return ".webm";
  if (normalized.includes("ogg") || normalized.includes("opus")) return ".ogg";
  return ".ogg";
};

const getMessageIdentifiers = (message = {}) => [
  message.id,
  message.provider_message_id,
  message.providerMessageId,
  message.server_message_id,
  message.serverMessageId,
  message.client_message_id,
  message.clientMessageId,
  message.wamid,
  message.messageId,
  message.message_id,
  message.temp_id,
  message.raw?.id,
].map(normalizeMessageId).filter(Boolean);

const isAudioAttachment = (attachment = {}) => {
  const type = String(attachment?.type || "").trim().toLowerCase();
  const mime = String(attachment?.mimeType || attachment?.mimetype || attachment?.mime_type || "").trim().toLowerCase();
  return type === "audio" || mime.startsWith("audio/");
};

const extractMediaIdFromUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "https://local.invalid");
    return String(parsed.searchParams.get("id") || "").trim();
  } catch {
    const match = raw.match(/[?&]id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
};

const resolveAudioAttachment = (message = {}) => {
  const attachment = (Array.isArray(message.attachments) ? message.attachments : []).find(isAudioAttachment);
  if (!attachment) return null;
  const mediaId = normalizeMessageId(
    attachment.id || attachment.mediaId || attachment.media_id || extractMediaIdFromUrl(attachment.url),
  );
  return {
    ...attachment,
    mediaId,
    mimeType: attachment.mimeType || attachment.mimetype || attachment.mime_type || "audio/ogg",
  };
};

const findStoredMessage = (store, messageId) => {
  const targetId = normalizeMessageId(messageId);
  if (!targetId) return null;
  for (const [conversationId, messages] of Object.entries(store?.messages || {})) {
    if (!Array.isArray(messages)) continue;
    const index = messages.findIndex((message) => getMessageIdentifiers(message).includes(targetId));
    if (index >= 0) return { conversationId, index, message: messages[index] };
  }
  return null;
};

const isProcessingTranscriptionFresh = (transcription = {}) => {
  if (String(transcription?.status || "").trim().toLowerCase() !== "processing") return false;
  const timestamp = Date.parse(String(transcription?.updatedAt || transcription?.createdAt || ""));
  if (!Number.isFinite(timestamp)) return false;
  const timeoutMs = Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0 ? DEFAULT_TIMEOUT_MS : 180000;
  return Date.now() - timestamp <= timeoutMs;
};

const buildTranscriptionPatch = (patch = {}) => ({
  status: patch.status || "idle",
  text: patch.text || "",
  language: patch.language || DEFAULT_WHISPER_LANGUAGE,
  model: patch.model || DEFAULT_WHISPER_MODEL,
  provider: "local-whisper",
  createdAt: patch.createdAt || nowIso(),
  updatedAt: nowIso(),
  error: patch.error || "",
  sourceAttachmentId: patch.sourceAttachmentId || "",
  sourceMediaId: patch.sourceMediaId || "",
});

const updateStoredMessageTranscription = async ({ readStore, writeStore, messageId, updater }) => {
  const store = await readStore();
  const found = findStoredMessage(store, messageId);
  if (!found) {
    const error = new Error("Message not found");
    error.statusCode = 404;
    throw error;
  }

  const current = found.message || {};
  const currentTranscription = current.transcription && typeof current.transcription === "object"
    ? current.transcription
    : null;
  const nextTranscription = typeof updater === "function" ? updater(currentTranscription, current) : updater;
  const nextMessage = {
    ...current,
    transcription: nextTranscription,
  };

  store.messages[found.conversationId][found.index] = nextMessage;
  await writeStore(store);
  return { conversationId: found.conversationId, message: nextMessage };
};

const runWhisperScript = ({ audioPath, mimeType }) => new Promise((resolve, reject) => {
  const scriptPath = path.resolve(process.cwd(), "server/whisper-transcribe.py");
  const args = [
    scriptPath,
    "--audio",
    audioPath,
    "--model",
    DEFAULT_WHISPER_MODEL,
    "--language",
    DEFAULT_WHISPER_LANGUAGE,
    "--mime-type",
    mimeType || "audio/ogg",
  ];

  const child = spawn(DEFAULT_PYTHON_BIN, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let settled = false;

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    child.kill("SIGKILL");
    reject(new Error(`Whisper timeout after ${DEFAULT_TIMEOUT_MS}ms`));
  }, DEFAULT_TIMEOUT_MS);

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  child.on("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    reject(error);
  });

  child.on("close", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    const output = String(stdout || "").trim();
    if (code !== 0) {
      reject(new Error(stderr.trim() || output || `Whisper exited with code ${code}`));
      return;
    }
    try {
      const parsed = JSON.parse(output || "{}");
      if (!parsed?.ok) {
        reject(new Error(parsed?.error || stderr.trim() || "Whisper transcription failed"));
        return;
      }
      resolve(parsed);
    } catch (error) {
      reject(new Error(`Invalid Whisper JSON output: ${error?.message || error}`));
    }
  });
});

export const transcribeAudioMessage = async ({ messageId, readStore, writeStore, downloadMediaBuffer, force = false }) => {
  if (!WHISPER_ENABLED) {
    const error = new Error("Whisper transcription is disabled");
    error.statusCode = 503;
    throw error;
  }

  const initialStore = await readStore({ mutable: false });
  const found = findStoredMessage(initialStore, messageId);
  if (!found) {
    const error = new Error("Message not found");
    error.statusCode = 404;
    throw error;
  }

  const currentTranscription = found.message?.transcription;
  if (currentTranscription?.status === "done" && String(currentTranscription?.text || "").trim()) {
    return {
      ok: true,
      messageId: found.message.id || messageId,
      conversationId: found.conversationId,
      transcription: currentTranscription,
      message: found.message,
      cached: true,
    };
  }

  if (!force && isProcessingTranscriptionFresh(currentTranscription)) {
    return {
      ok: true,
      messageId: found.message.id || messageId,
      conversationId: found.conversationId,
      transcription: currentTranscription,
      message: found.message,
      processing: true,
    };
  }

  const attachment = resolveAudioAttachment(found.message);
  if (!attachment) {
    const error = new Error("Message does not have an audio attachment");
    error.statusCode = 400;
    throw error;
  }
  if (!attachment.mediaId) {
    const error = new Error("Audio media id not found");
    error.statusCode = 400;
    throw error;
  }

  const startedAt = nowIso();
  await updateStoredMessageTranscription({
    readStore,
    writeStore,
    messageId,
    updater: (previous) => ({
      ...(previous || {}),
      status: "processing",
      text: previous?.text || "",
      language: DEFAULT_WHISPER_LANGUAGE,
      model: DEFAULT_WHISPER_MODEL,
      provider: "local-whisper",
      createdAt: previous?.createdAt || startedAt,
      updatedAt: nowIso(),
      error: "",
      sourceAttachmentId: attachment.id || "",
      sourceMediaId: attachment.mediaId,
    }),
  });

  const tmpDir = path.resolve(process.cwd(), DEFAULT_TMP_DIR);
  await fs.mkdir(tmpDir, { recursive: true });
  let audioPath = "";

  try {
    const { buffer, mimeType } = await downloadMediaBuffer(attachment.mediaId);
    const maxBytes = Math.max(1, Number.isFinite(DEFAULT_MAX_AUDIO_MB) ? DEFAULT_MAX_AUDIO_MB : 25) * 1024 * 1024;
    if (!Buffer.isBuffer(buffer) || buffer.length <= 0) {
      throw new Error("Downloaded audio is empty");
    }
    if (buffer.length > maxBytes) {
      throw new Error(`Audio exceeds ${DEFAULT_MAX_AUDIO_MB}MB limit`);
    }

    audioPath = path.join(tmpDir, `${randomUUID()}${audioMimeToExtension(mimeType || attachment.mimeType)}`);
    await fs.writeFile(audioPath, buffer);

    const whisperResult = await runWhisperScript({ audioPath, mimeType: mimeType || attachment.mimeType });
    const finalTranscription = buildTranscriptionPatch({
      status: "done",
      text: String(whisperResult.text || "").trim(),
      language: whisperResult.language || DEFAULT_WHISPER_LANGUAGE,
      model: whisperResult.model || DEFAULT_WHISPER_MODEL,
      sourceAttachmentId: attachment.id || "",
      sourceMediaId: attachment.mediaId,
      createdAt: startedAt,
    });

    const updated = await updateStoredMessageTranscription({
      readStore,
      writeStore,
      messageId,
      updater: () => finalTranscription,
    });

    return {
      ok: true,
      messageId: updated.message.id || messageId,
      conversationId: updated.conversationId,
      transcription: finalTranscription,
      message: updated.message,
    };
  } catch (error) {
    const errorTranscription = buildTranscriptionPatch({
      status: "error",
      text: "",
      language: DEFAULT_WHISPER_LANGUAGE,
      model: DEFAULT_WHISPER_MODEL,
      sourceAttachmentId: attachment.id || "",
      sourceMediaId: attachment.mediaId,
      createdAt: startedAt,
      error: error?.message || "Whisper transcription failed",
    });
    await updateStoredMessageTranscription({
      readStore,
      writeStore,
      messageId,
      updater: () => errorTranscription,
    });
    throw error;
  } finally {
    if (audioPath) {
      await fs.rm(audioPath, { force: true }).catch(() => undefined);
    }
  }
};
