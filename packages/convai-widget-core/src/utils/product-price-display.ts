import type { PriceDisplayMode } from "./business-mode";

const STARTING_PRICE_PREFIX = /^starting\s+(?:from|at)\s+/i;
const HAS_CURRENCY = /^[$€£₹¥]|(?:^|\s)(?:rs\.?|usd|eur|gbp|inr|cad|aud)\b/i;

export function formatProductPriceForDisplay(
  price: string | undefined,
  mode: PriceDisplayMode
): string | undefined {
  const trimmed = price?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (mode === "standard") {
    return trimmed;
  }

  if (STARTING_PRICE_PREFIX.test(trimmed)) {
    return trimmed;
  }

  return `Starting from ${trimmed}`;
}

export function formatShopifyNumericPrice(
  cents: number,
  currency?: { symbol?: string; code?: string }
): string {
  const amount = (cents / 100).toFixed(2);
  if (currency?.symbol) {
    return `${currency.symbol}${amount}`;
  }
  if (currency?.code) {
    return `${currency.code} ${amount}`;
  }
  return amount;
}

export function formatShopifyPriceValue(
  value: unknown,
  currency?: { symbol?: string; code?: string }
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (HAS_CURRENCY.test(trimmed)) {
      return trimmed;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return formatShopifyNumericPrice(numeric, currency);
    }
    return trimmed;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return formatShopifyNumericPrice(value, currency);
  }

  return undefined;
}
