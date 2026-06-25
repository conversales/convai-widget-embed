const SHOPIFY_CART_GID_PATTERN = /gid:\/\/shopify\/Cart\/(.+)$/i;

/**
 * Converts a Storefront API cart GID into the token stored in Shopify's `cart` cookie.
 * Example GID: gid://shopify/Cart/hWNDkwg7UMZV9kOTMnLMOIX7?key=abc
 * Cookie value: hWNDkwg7UMZV9kOTMnLMOIX7?key=abc
 */
export function extractCartCookieToken(cartId: string): string | null {
  const trimmed = cartId.trim();
  const gidMatch = trimmed.match(SHOPIFY_CART_GID_PATTERN);
  if (gidMatch?.[1]) {
    return gidMatch[1];
  }

  if (/^[a-zA-Z0-9_-]+\?key=[a-f0-9]+$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function extractNumericVariantId(variantId: string): string | null {
  const trimmed = variantId.trim();
  const gidMatch = trimmed.match(/gid:\/\/shopify\/ProductVariant\/(\d+)/i);
  if (gidMatch?.[1]) {
    return gidMatch[1];
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

const CART_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function setShopifyCartCookie(cartId: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const token = extractCartCookieToken(cartId);
  if (!token) {
    return false;
  }

  // Shopify sets this cookie with the raw token (including ?key=); encoding breaks sync.
  document.cookie = `cart=${token}; path=/; max-age=${CART_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  return true;
}

export function readShopifyCartCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(/(?:^|;\s*)cart=([^;]*)/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
