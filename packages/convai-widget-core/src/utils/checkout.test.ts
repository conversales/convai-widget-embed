import { describe, expect, it } from "vitest";
import type { DisplayTranscriptEntry } from "./display-transcript";
import {
  shouldHideCartConfirmationAgentEntry,
  shouldHideCheckoutTranscriptEntry,
} from "./checkout";

function msg(role: "agent" | "user", message: string): DisplayTranscriptEntry {
  return {
    type: "message",
    role,
    message,
    isText: true,
    conversationIndex: 0,
  };
}

describe("shouldHideCartConfirmationAgentEntry", () => {
  it("hides the agent reply after an add-to-cart user message in confirmation", () => {
    const entries = [
      msg("user", "Add Hudderton Backpack to cart"),
      msg(
        "agent",
        "The Hudderton Backpack has been added to your cart. Active Cart ID: gid://shopify/Cart/test"
      ),
    ];

    expect(
      shouldHideCartConfirmationAgentEntry(
        entries[1],
        1,
        entries,
        "confirmation"
      )
    ).toBe(true);
  });

  it("keeps earlier agent messages before the add-to-cart action", () => {
    const entries = [
      msg("agent", "Here are some bags available for you."),
      msg("user", "Add Hudderton Backpack to cart"),
      msg("agent", "Added to cart successfully."),
    ];

    expect(
      shouldHideCartConfirmationAgentEntry(
        entries[0],
        0,
        entries,
        "confirmation"
      )
    ).toBe(false);
  });

  it("keeps agent replies once the user sends another message", () => {
    const entries = [
      msg("user", "Add Hudderton Backpack to cart"),
      msg("agent", "Added to cart successfully."),
      msg("user", "continue payment"),
      msg(
        "agent",
        "Here is your secure checkout link: https://example.com/checkout"
      ),
    ];

    expect(
      shouldHideCartConfirmationAgentEntry(entries[3], 3, entries, "email")
    ).toBe(false);
  });
});

describe("shouldHideCheckoutTranscriptEntry", () => {
  it("hides cart confirmation agent replies via the shared helper", () => {
    const entries = [
      msg("user", "Add Scout Backpack to cart"),
      msg("agent", "Scout Backpack has been added to your cart."),
    ];

    expect(
      shouldHideCheckoutTranscriptEntry(entries[1], "cart_pending", entries, 1)
    ).toBe(true);
  });
});
