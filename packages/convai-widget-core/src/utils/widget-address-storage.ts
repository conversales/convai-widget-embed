import type { DeliveryAddress } from "../types/product-card";

const ADDRESSES_PREFIX = "xi:convai-widget-addresses:";

export function hasCompleteAddress(
  address?: DeliveryAddress | null
): address is DeliveryAddress {
  return !!(
    address?.fullName?.trim() &&
    address?.street?.trim() &&
    address?.city?.trim() &&
    address?.state?.trim() &&
    address?.pin?.trim() &&
    address?.phone?.trim()
  );
}

function getStorageKey(scope: string): string {
  return `${ADDRESSES_PREFIX}${scope}`;
}

export function loadSavedAddresses(
  scope: string
): Record<string, DeliveryAddress> {
  try {
    const raw = localStorage.getItem(getStorageKey(scope));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, DeliveryAddress>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

export function getSavedAddressForEmail(
  scope: string,
  email: string
): DeliveryAddress | null {
  const key = email.trim().toLowerCase();
  if (!key) {
    return null;
  }

  const saved = loadSavedAddresses(scope)[key];
  return hasCompleteAddress(saved) ? saved : null;
}

export function saveAddressForEmail(
  scope: string,
  email: string,
  address: DeliveryAddress
): void {
  const key = email.trim().toLowerCase();
  if (!key || !hasCompleteAddress(address)) {
    return;
  }

  try {
    const addresses = loadSavedAddresses(scope);
    addresses[key] = address;
    localStorage.setItem(getStorageKey(scope), JSON.stringify(addresses));
  } catch {
    // localStorage may be unavailable or full
  }
}

export function formatSavedAddressLines(address: DeliveryAddress): string[] {
  const cityLine = [address.city, address.state, address.pin]
    .map(part => part.trim())
    .filter(Boolean)
    .join(", ");

  return [address.fullName, address.street, cityLine, address.countryCode]
    .map(part => part.trim())
    .filter(Boolean);
}
