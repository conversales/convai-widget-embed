import type { WidgetConfig } from "../types/config";

export const BusinessModes = ["normal", "d2c", "real_estate"] as const;
export type BusinessMode = (typeof BusinessModes)[number];

export type PriceDisplayMode = "standard" | "starting";

export type BusinessModeFeatures = {
  mode: BusinessMode;
  showProductCards: boolean;
  showCartActions: boolean;
  checkoutEnabled: boolean;
  cartSyncEnabled: boolean;
  defaultAgentLabel: string;
  showAvailability: boolean;
  priceDisplayMode: PriceDisplayMode;
};

export function parseBusinessMode(
  value: string | undefined
): BusinessMode | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "realestate") {
    return "real_estate";
  }

  return BusinessModes.includes(normalized as BusinessMode)
    ? (normalized as BusinessMode)
    : null;
}

export function inferLegacyBusinessMode(config: WidgetConfig): BusinessMode {
  if (config.product_cards?.enabled === false) {
    return "normal";
  }

  return "d2c";
}

export function resolveBusinessModeFeatures(
  mode: BusinessMode
): BusinessModeFeatures {
  switch (mode) {
    case "normal":
      return {
        mode,
        showProductCards: false,
        showCartActions: false,
        checkoutEnabled: false,
        cartSyncEnabled: false,
        defaultAgentLabel: "",
        showAvailability: false,
        priceDisplayMode: "standard",
      };
    case "real_estate":
      return {
        mode,
        showProductCards: true,
        showCartActions: false,
        checkoutEnabled: false,
        cartSyncEnabled: false,
        defaultAgentLabel: "Your Property Advisor",
        showAvailability: false,
        priceDisplayMode: "starting",
      };
    case "d2c":
    default:
      return {
        mode: "d2c",
        showProductCards: true,
        showCartActions: true,
        checkoutEnabled: true,
        cartSyncEnabled: true,
        defaultAgentLabel: "Your AI Stylist",
        showAvailability: true,
        priceDisplayMode: "standard",
      };
  }
}

export function applyBusinessModeToConfig(config: WidgetConfig): WidgetConfig {
  const mode = config.business_mode ?? inferLegacyBusinessMode(config);
  const features = resolveBusinessModeFeatures(mode);
  const existingProductCards = config.product_cards ?? {};

  return {
    ...config,
    business_mode: mode,
    product_cards: features.showProductCards
      ? {
          ...existingProductCards,
          enabled: true,
          show_images: existingProductCards.show_images ?? true,
          agent_label:
            existingProductCards.agent_label?.trim() ||
            features.defaultAgentLabel,
        }
      : {
          ...existingProductCards,
          enabled: false,
        },
  };
}
