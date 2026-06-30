import { describe, expect, it } from "vitest";
import {
  applyBusinessModeToConfig,
  parseBusinessMode,
  resolveBusinessModeFeatures,
} from "./business-mode";
import type { WidgetConfig } from "../types/config";

const baseConfig = {
  variant: "compact",
  placement: "bottom-right",
  avatar: { type: "orb", color_1: "#000", color_2: "#fff" },
  feedback_mode: "none",
  language: "en",
  mic_muting_enabled: true,
  transcript_enabled: true,
  text_input_enabled: true,
  default_expanded: false,
  always_expanded: false,
  dismissible: false,
  text_contents: {},
  language_presets: {},
  disable_banner: false,
  text_only: false,
  supports_text_only: true,
} satisfies WidgetConfig;

describe("business-mode", () => {
  it("parses business mode aliases", () => {
    expect(parseBusinessMode("real-estate")).toBe("real_estate");
    expect(parseBusinessMode("D2C")).toBe("d2c");
    expect(parseBusinessMode("normal")).toBe("normal");
  });

  it("disables commerce UI in normal mode", () => {
    const config = applyBusinessModeToConfig({
      ...baseConfig,
      business_mode: "normal",
    });

    expect(config.product_cards?.enabled).toBe(false);
    expect(resolveBusinessModeFeatures("normal").checkoutEnabled).toBe(false);
  });

  it("keeps listing cards without cart in real estate mode", () => {
    const config = applyBusinessModeToConfig({
      ...baseConfig,
      business_mode: "real_estate",
    });

    expect(config.product_cards?.enabled).toBe(true);
    expect(config.product_cards?.agent_label).toBe("Your Property Advisor");
    const features = resolveBusinessModeFeatures("real_estate");
    expect(features.showCartActions).toBe(false);
    expect(features.showAvailability).toBe(false);
    expect(features.priceDisplayMode).toBe("starting");
  });

  it("keeps d2c commerce enabled", () => {
    const config = applyBusinessModeToConfig({
      ...baseConfig,
      business_mode: "d2c",
    });

    expect(config.product_cards?.enabled).toBe(true);
    expect(resolveBusinessModeFeatures("d2c").cartSyncEnabled).toBe(true);
  });
});
