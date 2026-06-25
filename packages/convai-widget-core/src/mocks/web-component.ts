import type { AGENTS } from "./browser";
import { afterEach, beforeAll, beforeEach } from "vitest";
import { CustomAttributes } from "../types/attributes";
import { registerWidget } from "../index";

const MOUNTED_COMPONENTS = new Set<HTMLElement>();

function cleanupWidgets() {
  MOUNTED_COMPONENTS.forEach(element => {
    element.remove();
  });
  MOUNTED_COMPONENTS.clear();
  document.querySelectorAll("conversales-convai").forEach(element => {
    element.remove();
  });
}

export function setupWebComponent(
  attributes: CustomAttributes & { "agent-id": keyof typeof AGENTS }
) {
  cleanupWidgets();
  const element = document.createElement("conversales-convai");
  // We override the default "fixed" position to avoid issues with playwright
  // considering the widget to be out of the viewport.
  element.style.position = "absolute";
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  MOUNTED_COMPONENTS.add(element);
  document.body.appendChild(element);
  return element;
}

beforeAll(() => {
  registerWidget();
});
beforeEach(cleanupWidgets);
afterEach(cleanupWidgets);
