import type { TranscriptEntry } from "../contexts/conversation";

const PRODUCTION_WIDGET_API_BASE_URL = "https://api.conversales.in";

const DEFAULT_WIDGET_AVAILABILITY_MESSAGE =
  "Usage limit has been reached. Please recharge to continue.";

export interface WidgetAvailabilityState {
  checking: boolean;
  allowed: boolean;
  message: string | null;
}

const DEFAULT_WIDGET_AVAILABILITY: WidgetAvailabilityState = {
  checking: false,
  allowed: true,
  message: null,
};

function getWidgetAvailabilityMessage(message: string | null | undefined) {
  return typeof message === "string" && message.trim()
    ? message.trim()
    : DEFAULT_WIDGET_AVAILABILITY_MESSAGE;
}

export type WidgetHistoryPickup = {
  found: boolean;
  conversationId: string | null;
  lastId: string | null;
  conversationIndex: number;
  transcript: TranscriptEntry[];
  status: string | null;
};

export type WidgetHistoryPickupParams = {
  agentId: string;
  accountId?: string;
  userId?: string;
};

export function getWidgetApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_WIDGET_API_URL;
  if (typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, "");
  }

  return PRODUCTION_WIDGET_API_BASE_URL;
}

function parseApiPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const data = record.data;
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : record;
}

function sanitizeTranscript(entries: unknown): TranscriptEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.filter(
    (entry): entry is TranscriptEntry =>
      !!entry && typeof entry === "object" && "type" in entry
  );
}

export async function fetchWidgetAvailability(
  agentId: string,
  signal: AbortSignal
): Promise<WidgetAvailabilityState> {
  try {
    const response = await fetch(
      `${getWidgetApiBaseUrl()}/api/v1/widget/checkAvailability?agentId=${encodeURIComponent(agentId)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      }
    );

    const payload = await response.json().catch(() => null);
    const data = parseApiPayload(payload);
    const message = getWidgetAvailabilityMessage(
      typeof data.message === "string" ? data.message : null
    );

    if (!response.ok) {
      return {
        checking: false,
        allowed: false,
        message,
      };
    }

    return {
      checking: false,
      allowed: data.allowed !== false,
      message: data.allowed === false ? message : null,
    };
  } catch {
    return DEFAULT_WIDGET_AVAILABILITY;
  }
}

export async function fetchWidgetHistoryPickup(
  params: WidgetHistoryPickupParams,
  signal?: AbortSignal
): Promise<WidgetHistoryPickup | null> {
  const agentId = params.agentId.trim();
  const accountId = params.accountId?.trim();
  const userId = params.userId?.trim();

  if (!agentId || (!accountId && !userId)) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams({ agentId });
    if (accountId) {
      searchParams.set("accountId", accountId);
    }
    if (userId) {
      searchParams.set("userId", userId);
    }

    const response = await fetch(
      `${getWidgetApiBaseUrl()}/api/v1/widget/historyPickup?${searchParams.toString()}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return null;
    }

    const data = parseApiPayload(payload);
    return {
      found: data.found === true,
      conversationId:
        typeof data.conversationId === "string" ? data.conversationId : null,
      lastId: typeof data.lastId === "string" ? data.lastId : null,
      conversationIndex:
        typeof data.conversationIndex === "number" ? data.conversationIndex : 0,
      transcript: sanitizeTranscript(data.transcript),
      status: typeof data.status === "string" ? data.status : null,
    };
  } catch {
    return null;
  }
}
