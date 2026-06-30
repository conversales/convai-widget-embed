import { page, userEvent } from "vitest/browser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Worker } from "../mocks/browser";
import { setupWebComponent } from "../mocks/web-component";

async function sendListingRequest() {
  const textInput = page.getByRole("textbox", {
    name: "Text message input",
  });
  await textInput.fill("Show listings");
  await userEvent.keyboard("{Enter}");
}

describe("Business mode product cards", () => {
  beforeAll(() => Worker.start({ quiet: true }));
  afterAll(() => Worker.stop());

  it("shows starting prices without availability or cart in real estate mode", async () => {
    setupWebComponent({
      "agent-id": "real_estate_listings",
      "business-mode": "real_estate",
      variant: "compact",
    });

    await sendListingRequest();

    await expect.element(page.getByText("Sunset Villa")).toBeInTheDocument();
    await expect
      .element(page.getByText("Starting from $450,000"))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("Starting from ₹85 Lakhs"))
      .toBeInTheDocument();
    await expect.element(page.getByText("In Stock")).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /Add .* to cart/i }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "View", exact: true }).first())
      .toBeInTheDocument();
  });

  it("shows standard prices and cart actions in d2c mode", async () => {
    setupWebComponent({
      "agent-id": "d2c_listings",
      "business-mode": "d2c",
      variant: "compact",
    });

    await sendListingRequest();

    await expect
      .element(page.getByText("Canvas Lunch Bag"))
      .toBeInTheDocument();
    await expect.element(page.getByText("Rs. 32.00")).toBeInTheDocument();
    await expect
      .element(page.getByText("Starting from"))
      .not.toBeInTheDocument();
    await expect
      .element(
        page.getByRole("button", { name: "Add Canvas Lunch Bag to cart" })
      )
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "View", exact: true }).first())
      .toBeInTheDocument();
  });
});
