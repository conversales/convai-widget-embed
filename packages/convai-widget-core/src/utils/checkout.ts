import type {
  CartItem,
  CheckoutStep,
  DeliveryAddress,
} from "../types/product-card";
import { cleanAgentUrl, extractCheckoutUrlFromMessage } from "./agent-response";
import type { DisplayTranscriptEntry } from "./display-transcript";
import { isAddToCartUserMessage } from "./product-display";

const CONTINUE_PAYMENT_PATTERN = /^continue(?:\s+to)?\s+payment\.?$/i;

export const CHECKOUT_FLOW_STEPS: CheckoutStep[] = [
  "email",
  "address",
  "discount",
  "review",
  "complete",
];

export const DIRECT_CHECKOUT_STEPS: CheckoutStep[] = [
  "cart_pending",
  "confirmation",
  "complete",
];

export function isCheckoutFlowStep(step: CheckoutStep): boolean {
  return CHECKOUT_FLOW_STEPS.includes(step);
}

export function isContinuePaymentMessage(message: string): boolean {
  return CONTINUE_PAYMENT_PATTERN.test(message.trim());
}

export function shouldHideCheckoutTranscriptEntry(
  entry: DisplayTranscriptEntry,
  checkoutStep: CheckoutStep,
  entries: DisplayTranscriptEntry[] = [],
  entryIndex = -1
): boolean {
  if (entry.type !== "message") {
    return false;
  }

  if (
    shouldHideCartConfirmationAgentEntry(
      entry,
      entryIndex,
      entries,
      checkoutStep
    )
  ) {
    return true;
  }

  if (!isCheckoutFlowStep(checkoutStep)) {
    return false;
  }

  if (entry.role === "user" && isContinuePaymentMessage(entry.message)) {
    return true;
  }

  if (entry.role === "agent" && extractCheckoutUrlFromMessage(entry.message)) {
    return true;
  }

  return false;
}

function findLastAddToCartUserIndex(entries: DisplayTranscriptEntry[]): number {
  let lastAddIndex = -1;

  for (let index = 0; index < entries.length; index += 1) {
    const candidate = entries[index];
    if (
      candidate.type === "message" &&
      candidate.role === "user" &&
      isAddToCartUserMessage(candidate.message, candidate.displayMessage)
    ) {
      lastAddIndex = index;
    }
  }

  return lastAddIndex;
}

export function isAgentReplyAfterAddToCart(
  entry: DisplayTranscriptEntry,
  entryIndex: number,
  entries: DisplayTranscriptEntry[]
): boolean {
  if (entry.type !== "message" || entry.role !== "agent" || entryIndex < 0) {
    return false;
  }

  const lastAddIndex = findLastAddToCartUserIndex(entries);
  if (lastAddIndex === -1 || entryIndex <= lastAddIndex) {
    return false;
  }

  for (let index = lastAddIndex + 1; index < entryIndex; index += 1) {
    const candidate = entries[index];
    if (candidate.type === "message" && candidate.role === "user") {
      return false;
    }
  }

  return true;
}

export function shouldHideCartConfirmationAgentEntry(
  entry: DisplayTranscriptEntry,
  entryIndex: number,
  entries: DisplayTranscriptEntry[],
  checkoutStep: CheckoutStep
): boolean {
  if (checkoutStep !== "confirmation" && checkoutStep !== "cart_pending") {
    return false;
  }

  return isAgentReplyAfterAddToCart(entry, entryIndex, entries);
}

function isShopifyUrl(url: URL): boolean {
  return /\.myshopify\.com$/i.test(url.hostname);
}

function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function appendShopifyCheckoutParams(
  url: URL,
  cart: {
    email: string;
    discountCode: string;
    deliveryAddress: DeliveryAddress;
  }
) {
  const email = cart.email.trim();
  const discountCode = cart.discountCode.trim();
  const address = cart.deliveryAddress;
  const { firstName, lastName } = splitFullName(address.fullName);

  if (email && !url.searchParams.has("checkout[email]")) {
    url.searchParams.set("checkout[email]", email);
  }
  if (discountCode && !url.searchParams.has("discount")) {
    url.searchParams.set("discount", discountCode);
  }
  if (
    firstName &&
    !url.searchParams.has("checkout[shipping_address][first_name]")
  ) {
    url.searchParams.set("checkout[shipping_address][first_name]", firstName);
  }
  if (
    lastName &&
    !url.searchParams.has("checkout[shipping_address][last_name]")
  ) {
    url.searchParams.set("checkout[shipping_address][last_name]", lastName);
  }
  if (
    address.street.trim() &&
    !url.searchParams.has("checkout[shipping_address][address1]")
  ) {
    url.searchParams.set(
      "checkout[shipping_address][address1]",
      address.street.trim()
    );
  }
  if (
    address.city.trim() &&
    !url.searchParams.has("checkout[shipping_address][city]")
  ) {
    url.searchParams.set(
      "checkout[shipping_address][city]",
      address.city.trim()
    );
  }
  if (
    address.state.trim() &&
    !url.searchParams.has("checkout[shipping_address][province]")
  ) {
    url.searchParams.set(
      "checkout[shipping_address][province]",
      address.state.trim()
    );
  }
  if (
    address.pin.trim() &&
    !url.searchParams.has("checkout[shipping_address][zip]")
  ) {
    url.searchParams.set("checkout[shipping_address][zip]", address.pin.trim());
  }
  if (
    address.countryCode.trim() &&
    !url.searchParams.has("checkout[shipping_address][country]")
  ) {
    url.searchParams.set(
      "checkout[shipping_address][country]",
      address.countryCode.trim()
    );
  }
  if (
    address.phone.trim() &&
    !url.searchParams.has("checkout[shipping_address][phone]")
  ) {
    url.searchParams.set(
      "checkout[shipping_address][phone]",
      address.phone.trim()
    );
  }
}

function appendGenericCheckoutParams(
  url: URL,
  cart: {
    items: CartItem[];
    email: string;
    discountCode: string;
    deliveryAddress: DeliveryAddress;
  }
) {
  const email = cart.email.trim();
  const discountCode = cart.discountCode.trim();
  const address = cart.deliveryAddress;

  if (email && !url.searchParams.has("email")) {
    url.searchParams.set("email", email);
  }
  if (discountCode && !url.searchParams.has("discount")) {
    url.searchParams.set("discount", discountCode);
  }
  if (address.fullName.trim() && !url.searchParams.has("name")) {
    url.searchParams.set("name", address.fullName.trim());
  }
  if (address.street.trim() && !url.searchParams.has("address")) {
    url.searchParams.set("address", address.street.trim());
  }
  if (address.city.trim() && !url.searchParams.has("city")) {
    url.searchParams.set("city", address.city.trim());
  }
  if (address.state.trim() && !url.searchParams.has("state")) {
    url.searchParams.set("state", address.state.trim());
  }
  if (address.pin.trim() && !url.searchParams.has("pin")) {
    url.searchParams.set("pin", address.pin.trim());
  }
  if (address.phone.trim() && !url.searchParams.has("phone")) {
    url.searchParams.set("phone", address.phone.trim());
  }

  cart.items.forEach((item, index) => {
    const itemKey = `item_${index}`;
    const productIdKey = `product_id_${index}`;
    if (!url.searchParams.has(itemKey)) {
      url.searchParams.set(
        itemKey,
        item.size ? `${item.product.name} (${item.size})` : item.product.name
      );
    }
    if (item.product.id && !url.searchParams.has(productIdKey)) {
      url.searchParams.set(productIdKey, item.product.id);
    }
  });
}

export function resolveCheckoutUrl(
  responseUrl: string | undefined,
  cart?: {
    items: CartItem[];
    email: string;
    discountCode: string;
    deliveryAddress: DeliveryAddress;
  }
): string | null {
  const base = responseUrl?.trim();
  if (!base) {
    return null;
  }

  const cleaned = cleanAgentUrl(base);

  if (!cart) {
    return cleaned;
  }

  try {
    const url = new URL(cleaned);

    if (isShopifyUrl(url)) {
      appendShopifyCheckoutParams(url, cart);
    } else {
      appendGenericCheckoutParams(url, cart);
    }

    return url.toString();
  } catch {
    return cleaned;
  }
}
