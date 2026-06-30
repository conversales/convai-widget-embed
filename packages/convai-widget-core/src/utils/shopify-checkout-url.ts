import { cleanAgentUrl } from "./agent-response";
import { extractCartCookieToken } from "./shopify-cart-cookie";
import { isShopifyStorefront } from "./shopify-theme-cart";

export function isLikelyCheckoutUrl(url: string): boolean {
  const cleaned = cleanAgentUrl(url);
  return /checkout|\/pay(?:\/|$)|\/cart\/c\//i.test(cleaned);
}

export function inferShopOrigin(
  ...sources: Array<string | null | undefined>
): string | null {
  for (const source of sources) {
    if (!source?.trim()) {
      continue;
    }

    const cleaned = cleanAgentUrl(source.trim());
    if (!/^https?:\/\//i.test(cleaned)) {
      continue;
    }

    try {
      return new URL(cleaned).origin;
    } catch {
      continue;
    }
  }

  if (isShopifyStorefront() && typeof window !== "undefined") {
    return window.location.origin;
  }

  return null;
}

export function buildShopifyCartCheckoutUrl(
  cartId: string,
  shopOrigin: string
): string | null {
  const token = extractCartCookieToken(cartId);
  if (!token || !shopOrigin.trim()) {
    return null;
  }

  const origin = shopOrigin.replace(/\/+$/, "");
  return `${origin}/cart/c/${token}`;
}

export function normalizeCheckoutUrlInput(
  url: string,
  shopOrigin?: string | null
): string | null {
  const cleaned = cleanAgentUrl(url.trim());
  if (!cleaned) {
    return null;
  }

  if (/^https?:\/\//i.test(cleaned)) {
    try {
      return new URL(cleaned).toString();
    } catch {
      return null;
    }
  }

  if (cleaned.startsWith("/") && shopOrigin) {
    try {
      return new URL(cleaned, shopOrigin).toString();
    } catch {
      return null;
    }
  }

  return null;
}

export function pickBestCheckoutUrl(urls: string[]): string | null {
  if (urls.length === 0) {
    return null;
  }

  const cleaned = urls.map(url => cleanAgentUrl(url)).filter(Boolean);
  const checkoutUrls = cleaned.filter(isLikelyCheckoutUrl);
  return checkoutUrls[0] ?? cleaned[0] ?? null;
}
