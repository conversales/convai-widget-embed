import { parseCartFromAgentText } from "./shopify-cart-parse";
import {
  inferShopOrigin,
  isLikelyCheckoutUrl,
  pickBestCheckoutUrl,
} from "./shopify-checkout-url";

const CHECKOUT_URL_LABEL =
  /(?:Checkout|Payment|Pay(?:ment)?|Order|purchase)\s*(?:URL|Link|link|Page|here)?:?\s*(https?:\/\/\S+)/i;
const CHECKOUT_URL_NEXT_LINE =
  /(?:Checkout|Payment)\s*URL:\s*(?:\r?\n|\s+)(https?:\/\/[^\s\n]+)/i;
const CHECKOUT_MARKDOWN_LINK =
  /\[(?:[^\]]*(?:checkout|payment|pay|order|purchase)[^\]]*)\]\((https?:\/\/[^)\s]+)\)/i;
const ANY_MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
const ANY_HTTP_URL = /https?:\/\/[^\s<>"')\]]+/gi;

export function cleanAgentUrl(url: string): string {
  return url
    .replace(/\s*\[blocked\]$/i, "")
    .replace(/[.,;]+$/g, "")
    .trim();
}

function pickCheckoutUrl(urls: string[]): string | null {
  return pickBestCheckoutUrl(urls);
}

export { isLikelyCheckoutUrl };

export function extractCheckoutUrlFromMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  const labeled =
    trimmed.match(CHECKOUT_URL_LABEL)?.[1] ??
    trimmed.match(CHECKOUT_URL_NEXT_LINE)?.[1];
  if (labeled) {
    return cleanAgentUrl(labeled);
  }

  const checkoutMarkdown = trimmed.match(CHECKOUT_MARKDOWN_LINK)?.[1];
  if (checkoutMarkdown) {
    return cleanAgentUrl(checkoutMarkdown);
  }

  if (
    /checkout|payment|proceed to pay|complete your (?:order|purchase)|ready to checkout/i.test(
      trimmed
    )
  ) {
    const markdownLinks = [...trimmed.matchAll(ANY_MARKDOWN_LINK)].map(match =>
      cleanAgentUrl(match[2])
    );
    const markdownCheckout = pickCheckoutUrl(markdownLinks);
    if (markdownCheckout) {
      return markdownCheckout;
    }

    const urls = [...trimmed.matchAll(ANY_HTTP_URL)].map(match =>
      cleanAgentUrl(match[0])
    );
    const checkoutUrl = pickCheckoutUrl(urls);
    if (checkoutUrl) {
      return checkoutUrl;
    }
  }

  return null;
}

export function findCheckoutUrlInTranscript(
  entries: Array<{ type: string; role?: string; message?: string }>
): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "message" || entry.role !== "agent" || !entry.message) {
      continue;
    }

    const fromMessage = extractCheckoutUrlFromMessage(entry.message);
    if (fromMessage) {
      return fromMessage;
    }

    const fromCart = parseCartFromAgentText(entry.message)?.checkoutUrl;
    if (fromCart) {
      return cleanAgentUrl(fromCart);
    }
  }

  return null;
}

export function inferShopOriginFromTranscript(
  entries: Array<{ type: string; role?: string; message?: string }>
): string | null {
  const urls: string[] = [];

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "message" || !entry.message) {
      continue;
    }

    urls.push(
      ...[...entry.message.matchAll(ANY_HTTP_URL)].map(match =>
        cleanAgentUrl(match[0])
      )
    );
  }

  return inferShopOrigin(...urls);
}

export function formatCheckoutAgentMessage(message: string): {
  introText: string;
  checkoutUrl: string | null;
} {
  const checkoutUrl = extractCheckoutUrlFromMessage(message);
  if (!checkoutUrl) {
    return { introText: message, checkoutUrl: null };
  }

  const introText = message
    .replace(checkoutUrl, "")
    .replace(/\s*\[blocked\]/gi, "")
    .replace(CHECKOUT_URL_LABEL, "")
    .replace(CHECKOUT_MARKDOWN_LINK, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*Here is your secure checkout link:?\s*/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { introText, checkoutUrl };
}

export function normalizeMerchantDomain(
  value: string | undefined
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }

  return `https://${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}
