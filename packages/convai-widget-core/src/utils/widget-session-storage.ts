import type { TranscriptEntry } from "../contexts/conversation";
import type {
  CartItem,
  CheckoutStep,
  PaymentStatus,
  ProductCardData,
} from "../types/product-card";

const STORAGE_PREFIX = "xi:convai-widget-session:";
const SESSION_VERSION = 1;

export type PersistedCartState = {
  items: CartItem[];
  checkoutStep: CheckoutStep;
  paymentStatus: PaymentStatus;
  checkoutUrl: string | null;
  email: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  pin: string;
  phone: string;
  countryCode: string;
  discountCode: string;
  pendingProduct: ProductCardData | null;
  selectedSize: string | null;
};

export type PersistedWidgetSession = {
  version: typeof SESSION_VERSION;
  transcript: TranscriptEntry[];
  conversationIndex: number;
  lastId: string | null;
  cart: PersistedCartState;
  savedAt: number;
};

export function getWidgetSessionScope(
  agentId?: string,
  signedUrl?: string,
  userId?: string
): string {
  const base = agentId?.trim() || signedUrl?.trim() || "default";
  const visitor = userId?.trim();
  return visitor ? `${base}:${visitor}` : base;
}

function getStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

export function createEmptyCartState(): PersistedCartState {
  return {
    items: [],
    checkoutStep: "none",
    paymentStatus: "idle",
    checkoutUrl: null,
    email: "",
    fullName: "",
    street: "",
    city: "",
    state: "",
    pin: "",
    phone: "",
    countryCode: "IN",
    discountCode: "",
    pendingProduct: null,
    selectedSize: null,
  };
}

function sanitizeTranscript(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries
    .filter(entry => {
      if (
        entry.type === "message" &&
        entry.role === "agent" &&
        entry.isStreaming &&
        !entry.message.trim()
      ) {
        return false;
      }
      return true;
    })
    .map(entry => {
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

export function loadWidgetSession(
  scope: string
): PersistedWidgetSession | null {
  try {
    const raw = localStorage.getItem(getStorageKey(scope));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedWidgetSession;
    if (
      parsed.version !== SESSION_VERSION ||
      !Array.isArray(parsed.transcript)
    ) {
      return null;
    }

    return {
      ...parsed,
      transcript: sanitizeTranscript(parsed.transcript),
      cart: {
        ...createEmptyCartState(),
        ...parsed.cart,
      },
    };
  } catch {
    return null;
  }
}

export function saveWidgetSession(
  scope: string,
  session: Omit<PersistedWidgetSession, "version" | "savedAt">
): void {
  try {
    const payload: PersistedWidgetSession = {
      version: SESSION_VERSION,
      transcript: sanitizeTranscript(session.transcript),
      conversationIndex: session.conversationIndex,
      lastId: session.lastId,
      cart: session.cart,
      savedAt: Date.now(),
    };
    localStorage.setItem(getStorageKey(scope), JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable or full
  }
}

export function updateWidgetSession(
  scope: string,
  partial: Partial<Omit<PersistedWidgetSession, "version" | "savedAt">>
): void {
  const current = loadWidgetSession(scope);
  saveWidgetSession(scope, {
    transcript: partial.transcript ?? current?.transcript ?? [],
    conversationIndex:
      partial.conversationIndex ?? current?.conversationIndex ?? 0,
    lastId: partial.lastId ?? current?.lastId ?? null,
    cart: partial.cart ?? current?.cart ?? createEmptyCartState(),
  });
}

export function clearWidgetSession(scope: string): void {
  try {
    localStorage.removeItem(getStorageKey(scope));
  } catch {
    // ignore
  }
}
