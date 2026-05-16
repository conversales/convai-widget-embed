import { setSourceInfo } from "@elevenlabs/client/internal";
import { PACKAGE_VERSION } from "./version";
import register from "preact-custom-element";
import { CustomAttributeList } from "./types/attributes";
import { ConvAIWidget } from "./widget";

setSourceInfo({ name: "widget", version: PACKAGE_VERSION });

const DEFAULT_TAG_NAME = "conversales-convai";
const LEGACY_TAG_NAMES = ["elevenlabs-convai"];
const SCRIPT_ATTRIBUTE_ALIASES = {
  "capture-lead": "leads-capture",
  "leads-capture": "leads-capture",
} as const;

const observedTagNames = new Set<string>();
let loaderAttributeObserver: MutationObserver | null = null;
let loaderScriptElement: HTMLScriptElement | null = null;

export type { CustomAttributes } from "./types/attributes";

function getLoaderScriptElement() {
  if (typeof document === "undefined") {
    return null;
  }

  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }

  return (
    Array.from(document.scripts)
      .reverse()
      .find(script => {
        const src = script.getAttribute("src") ?? "";

        return (
          Object.keys(SCRIPT_ATTRIBUTE_ALIASES).some(attributeName =>
            script.hasAttribute(attributeName)
          ) ||
          src.includes("nexus-widget") ||
          src.includes("convai-widget-embed")
        );
      }) ?? null
  );
}

function getForwardedScriptAttributes(script: HTMLScriptElement) {
  return Object.entries(SCRIPT_ATTRIBUTE_ALIASES).flatMap(
    ([sourceAttribute, targetAttribute]) => {
      const value = script.getAttribute(sourceAttribute);

      return value === null ? [] : ([[targetAttribute, value]] as const);
    }
  );
}

function applyForwardedAttributes(
  element: Element,
  attributes: ReadonlyArray<readonly [string, string]>
) {
  for (const [attributeName, value] of attributes) {
    if (!element.hasAttribute(attributeName)) {
      element.setAttribute(attributeName, value);
    }
  }
}

function syncAddedNodeAttributes(
  node: Node,
  attributes: ReadonlyArray<readonly [string, string]>
) {
  if (!(node instanceof Element) || observedTagNames.size === 0) {
    return;
  }

  const selector = Array.from(observedTagNames).join(",");

  if (observedTagNames.has(node.tagName.toLowerCase())) {
    applyForwardedAttributes(node, attributes);
  }

  if (!selector) {
    return;
  }

  node.querySelectorAll(selector).forEach(element => {
    applyForwardedAttributes(element, attributes);
  });
}

function syncScriptAttributesToWidgets(tagNames: string[]) {
  if (typeof document === "undefined") {
    return;
  }

  const script = getLoaderScriptElement();
  if (!script) {
    return;
  }

  const forwardedAttributes = getForwardedScriptAttributes(script);
  if (forwardedAttributes.length === 0) {
    return;
  }

  loaderScriptElement = script;
  tagNames.forEach(tagName => {
    observedTagNames.add(tagName);
    document
      .querySelectorAll(tagName)
      .forEach(element =>
        applyForwardedAttributes(element, forwardedAttributes)
      );
  });

  if (loaderAttributeObserver || typeof MutationObserver === "undefined") {
    return;
  }

  loaderAttributeObserver = new MutationObserver(mutations => {
    const activeScript = loaderScriptElement ?? getLoaderScriptElement();
    if (!activeScript) {
      return;
    }

    const activeAttributes = getForwardedScriptAttributes(activeScript);
    if (activeAttributes.length === 0) {
      return;
    }

    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        syncAddedNodeAttributes(node, activeAttributes);
      });
    }
  });

  loaderAttributeObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function defineWidget(tagName: string) {
  if (customElements.get(tagName)) {
    return;
  }

  register(ConvAIWidget, tagName, [...CustomAttributeList], {
    shadow: true,
    mode: "open",
  });
}

export function registerWidget(tagName = DEFAULT_TAG_NAME) {
  defineWidget(tagName);

  const tagNames =
    tagName === DEFAULT_TAG_NAME
      ? [DEFAULT_TAG_NAME, ...LEGACY_TAG_NAMES]
      : [tagName];

  syncScriptAttributesToWidgets(tagNames);

  if (tagName === DEFAULT_TAG_NAME) {
    for (const legacyTagName of LEGACY_TAG_NAMES) {
      defineWidget(legacyTagName);
    }
  }
}
