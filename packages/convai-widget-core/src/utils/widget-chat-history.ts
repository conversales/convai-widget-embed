import type { TranscriptEntry } from "../contexts/conversation";

const HISTORY_PREFIX = "xi:convai-widget-history:";
const HISTORY_VERSION = 1;
const MAX_HISTORY_ENTRIES = 50;

export type ChatHistoryEntry = {
  id: string;
  conversationId: string | null;
  transcript: TranscriptEntry[];
  startedAt: number;
  endedAt: number;
  preview: string;
};

type ChatHistoryStore = {
  version: typeof HISTORY_VERSION;
  chats: ChatHistoryEntry[];
};

function getStorageKey(scope: string): string {
  return `${HISTORY_PREFIX}${scope}`;
}

function sanitizeTranscript(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.map(entry => {
    if (entry.type !== "message") {
      return entry;
    }

    return {
      ...entry,
      isStreaming: false,
      fileInput: entry.fileInput
        ? {
            ...entry.fileInput,
            previewUrl: null,
          }
        : entry.fileInput,
    };
  });
}

export function getPreviewText(transcript: TranscriptEntry[]): string {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index];
    if (
      entry.type === "message" &&
      entry.role === "agent" &&
      entry.message.trim()
    ) {
      return entry.message.trim();
    }
  }

  for (const entry of transcript) {
    if (
      entry.type === "message" &&
      entry.role === "user" &&
      entry.message.trim()
    ) {
      return entry.message.trim();
    }
  }

  return "Conversation";
}

export function loadChatHistory(scope: string): ChatHistoryEntry[] {
  try {
    const raw = localStorage.getItem(getStorageKey(scope));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as ChatHistoryStore;
    if (parsed.version !== HISTORY_VERSION || !Array.isArray(parsed.chats)) {
      return [];
    }

    return parsed.chats.map(chat => ({
      ...chat,
      transcript: sanitizeTranscript(chat.transcript),
    }));
  } catch {
    return [];
  }
}

export function archiveChatToHistory(
  scope: string,
  transcript: TranscriptEntry[],
  conversationId: string | null
): ChatHistoryEntry | null {
  const hasMessages = transcript.some(
    entry => entry.type === "message" && entry.message.trim()
  );
  if (!hasMessages) {
    return null;
  }

  const sanitized = sanitizeTranscript(transcript);
  const entry: ChatHistoryEntry = {
    id: conversationId ?? `chat_${Date.now()}`,
    conversationId,
    transcript: sanitized,
    startedAt: Date.now(),
    endedAt: Date.now(),
    preview: getPreviewText(sanitized),
  };

  const existing = loadChatHistory(scope).filter(chat => chat.id !== entry.id);
  const chats = [entry, ...existing].slice(0, MAX_HISTORY_ENTRIES);

  try {
    const payload: ChatHistoryStore = {
      version: HISTORY_VERSION,
      chats,
    };
    localStorage.setItem(getStorageKey(scope), JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable or full
  }

  return entry;
}

export function formatHistoryTimestamp(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 1) {
    return "now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  return new Date(timestamp).toLocaleDateString();
}

export function pickupToChatHistoryEntry(pickup: {
  found: boolean;
  conversationId: string | null;
  lastId: string | null;
  transcript: TranscriptEntry[];
}): ChatHistoryEntry | null {
  if (!pickup.found || pickup.transcript.length === 0) {
    return null;
  }

  const sanitized = sanitizeTranscript(pickup.transcript);
  const id = pickup.conversationId ?? pickup.lastId ?? `remote_${Date.now()}`;

  return {
    id,
    conversationId: pickup.conversationId ?? pickup.lastId,
    transcript: sanitized,
    startedAt: Date.now(),
    endedAt: Date.now(),
    preview: getPreviewText(sanitized),
  };
}

export function mergeChatHistoryEntries(
  localChats: ChatHistoryEntry[],
  remoteChat: ChatHistoryEntry | null
): ChatHistoryEntry[] {
  if (!remoteChat) {
    return localChats;
  }

  const withoutDuplicate = localChats.filter(chat => chat.id !== remoteChat.id);
  return [remoteChat, ...withoutDuplicate].slice(0, MAX_HISTORY_ENTRIES);
}
