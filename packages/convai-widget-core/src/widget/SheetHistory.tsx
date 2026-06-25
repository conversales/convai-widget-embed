import { Fragment } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { useAttribute } from "../contexts/attributes";
import { useAccountId } from "../contexts/widget-config";
import { useSheetContent } from "../contexts/sheet-content";
import { useWidgetStorageScope, useWidgetUserId } from "../hooks/useWidgetStorageScope";
import { useTextContents } from "../contexts/text-contents";
import {
  formatHistoryTimestamp,
  loadChatHistory,
  mergeChatHistoryEntries,
  pickupToChatHistoryEntry,
  type ChatHistoryEntry,
} from "../utils/widget-chat-history";
import { buildDisplayTranscript } from "../utils/display-transcript";
import { fetchWidgetHistoryPickup } from "../utils/widget-api";
import { TranscriptMessage } from "./TranscriptMessage";

export function SheetHistory() {
  const text = useTextContents();
  const agentId = useAttribute("agent-id");
  const signedUrl = useAttribute("signed-url");
  const accountId = useAccountId();
  const userId = useWidgetUserId();
  const sessionScope = useWidgetStorageScope();
  const agentName = useAttribute("agent-name");
  const name = useAttribute("name");
  const { currentContent, historyDetailOpen } = useSheetContent();
  const displayName =
    agentName.value?.trim() || name.value?.trim() || "Conversales AI";
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentContent.value !== "history") {
      setSelectedChatId(null);
      historyDetailOpen.value = false;
    }
  }, [currentContent.value]);

  useSignalEffect(() => {
    if (!historyDetailOpen.value && selectedChatId) {
      setSelectedChatId(null);
    }
  });

  useEffect(() => {
    const abort = new AbortController();
    const scope = sessionScope.value;
    const localChats = loadChatHistory(scope);

    setChats(localChats);
    setLoading(true);

    let currentAgentId = agentId.value?.trim();
    if (signedUrl.value) {
      const params = new URL(signedUrl.value).searchParams;
      currentAgentId = params.get("agent_id") ?? currentAgentId;
    }

    const currentAccountId = accountId.value.trim();
    const currentUserId = userId.value.trim();

    if (!currentAgentId || (!currentAccountId && !currentUserId)) {
      setLoading(false);
      return () => {
        abort.abort();
      };
    }

    void fetchWidgetHistoryPickup(
      {
        agentId: currentAgentId,
        accountId: currentAccountId || undefined,
        userId: currentUserId || undefined,
      },
      abort.signal
    ).then(pickup => {
      if (abort.signal.aborted) {
        return;
      }

      const remoteChat = pickup ? pickupToChatHistoryEntry(pickup) : null;
      setChats(mergeChatHistoryEntries(localChats, remoteChat));
      setLoading(false);
    });

    return () => {
      abort.abort();
    };
  }, [
    sessionScope.value,
    agentId.value,
    signedUrl.value,
    accountId.value,
    userId.value,
  ]);

  const selectedChat = chats.find(chat => chat.id === selectedChatId) ?? null;

  const displayTranscript = useMemo(() => {
    if (!selectedChat) {
      return [];
    }

    return buildDisplayTranscript(selectedChat.transcript, {
      showAgentStatus: false,
      transcriptEnabled: true,
    });
  }, [selectedChat]);

  const openChat = (chatId: string) => {
    setSelectedChatId(chatId);
    historyDetailOpen.value = true;
  };

  const closeChat = () => {
    setSelectedChatId(null);
    historyDetailOpen.value = false;
  };

  if (selectedChat) {
    return (
      <div className="flex min-h-0 grow flex-col overflow-hidden">
        <div className="sheet-history-detail flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 pt-5 pb-4">
          {displayTranscript.map((entry, index) => (
            <Fragment key={`${selectedChat.id}-${index}-${entry.conversationIndex}`}>
              <TranscriptMessage entry={entry} animateIn={false} />
            </Fragment>
          ))}
        </div>
        <div className="sheet-history-footer">
          <button type="button" className="sheet-history-back" onClick={closeChat}>
            ← {text.go_back.value}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 grow flex-col overflow-hidden">
      <div className="sheet-history-list">
        {loading ? (
          <div className="flex grow items-center justify-center px-2 py-10 text-center text-sm text-base-subtle">
            Loading...
          </div>
        ) : chats.length === 0 ? (
          <div className="flex grow items-center justify-center px-2 py-10 text-center text-sm text-base-subtle">
            No previous conversations yet.
          </div>
        ) : (
          chats.map(chat => (
            <HistoryListItem
              key={chat.id}
              chat={chat}
              displayName={displayName}
              onSelect={() => {
                openChat(chat.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function HistoryListItem({
  chat,
  displayName,
  onSelect,
}: {
  chat: ChatHistoryEntry;
  displayName: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="sheet-history-item" onClick={onSelect}>
      <div className="sheet-history-item-avatar">
        <Avatar
          size="header"
          imageScale={1.12}
          backgroundColor="#ffffff"
          imageBackgroundColor="#ffffff"
          className="overflow-hidden rounded-full"
        />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-[#0f172a]">
            {displayName}
          </span>
          <span className="shrink-0 text-xs font-medium text-[#64748b]">
            {formatHistoryTimestamp(chat.endedAt)}
          </span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm leading-5 text-[#475569]">
          {chat.preview}
        </div>
      </div>
      <Icon
        name="chevron-up"
        size="xs"
        className="shrink-0 -rotate-90 text-[#94a3b8]"
      />
    </button>
  );
}
