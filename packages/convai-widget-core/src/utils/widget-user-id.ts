import FingerprintJS from "@fingerprintjs/fingerprintjs";

export const WIDGET_USER_ID_STORAGE_KEY = "elevenlabs_convai_user_id";

export function getStoredUserId(): string {
  try {
    return localStorage.getItem(WIDGET_USER_ID_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function resolveWidgetUserId(explicitUserId?: string | null): string {
  return explicitUserId?.trim() || getStoredUserId();
}

export async function getOrCreateUserId(): Promise<string> {
  const existing = getStoredUserId();
  if (existing) {
    return existing;
  }

  let userId = "";
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    userId = result.visitorId;
  } catch (error) {
    console.warn(
      "[ConversationalAI] FingerprintJS failed, falling back to random UUID:",
      error
    );
    userId = crypto.randomUUID();
  }

  try {
    localStorage.setItem(WIDGET_USER_ID_STORAGE_KEY, userId);
  } catch {
    // localStorage may be unavailable
  }

  return userId;
}
