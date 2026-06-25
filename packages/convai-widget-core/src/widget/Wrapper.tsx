import { memo } from "preact/compat";
import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useWidgetConfig } from "../contexts/widget-config";
import { Root } from "../contexts/root-portal";
import { Sheet } from "./Sheet";
import { Trigger } from "./Trigger";
import { useConversation } from "../contexts/conversation";
import { InOutTransition } from "../components/InOutTransition";
import { useTerms } from "../contexts/terms";
import { TermsModal } from "./TermsModal";
import { ErrorModal } from "./ErrorModal";
import { useWidgetSize } from "../contexts/widget-size";
import { cn } from "../utils/cn";
import { useShadowHost } from "../contexts/shadow-host";
import { ExpandButton } from "../components/ExpandButton";
import { useIsMobileViewport } from "../hooks/useIsMobileViewport";
import { lockBodyScroll } from "../utils/lockBodyScroll";
import { Placement } from "../types/config";

const HORIZONTAL = {
  left: "items-start",
  center: "items-center",
  right: "items-end",
};

const VERTICAL = {
  top: "flex-col-reverse justify-end",
  bottom: "flex-col justify-end",
};

const PLACEMENT_CLASSES: Record<Placement, string> = {
  "top-left": `${VERTICAL.top} ${HORIZONTAL.left}`,
  top: `${VERTICAL.top} ${HORIZONTAL.center}`,
  "top-right": `${VERTICAL.top} ${HORIZONTAL.right}`,
  "bottom-left": `${VERTICAL.bottom} ${HORIZONTAL.left}`,
  bottom: `${VERTICAL.bottom} ${HORIZONTAL.center}`,
  "bottom-right": `${VERTICAL.bottom} ${HORIZONTAL.right}`,
};

// Keep the contents hidden initially to avoid FOUC in Safari
// Once styles are loaded they will override this
const HIDDEN_STYLE = {
  display: "none",
};

export const Wrapper = memo(function Wrapper() {
  const config = useWidgetConfig();
  const expanded = useSignal(config.peek().default_expanded);
  const hidden = useSignal(false);
  const sawError = useSignal(false);
  const { error, isDisconnected } = useConversation();
  const terms = useTerms();
  const { variant } = useWidgetSize();
  const isMobile = useIsMobileViewport();
  const expandable = useComputed(
    () => config.value.transcript_enabled || config.value.text_input_enabled
  );
  const isMobileFullscreen = useComputed(() => {
    if (!isMobile.value || hidden.value) {
      return false;
    }

    if (config.value.always_expanded) {
      return true;
    }

    return expanded.value;
  });
  const showTrigger = useComputed(
    () => !config.value.always_expanded && !isMobileFullscreen.value
  );
  const shadowHost = useShadowHost();

  useSignalEffect(() => {
    variant.value = isMobileFullscreen.value ? "fullscreen" : "compact";
  });

  useSignalEffect(() => {
    if (!isMobileFullscreen.value) {
      return;
    }

    return lockBodyScroll();
  });

  const overlayClassName = useComputed(() =>
    cn(
      "overlay !flex transition-[opacity] duration-200 data-hidden:opacity-0",
      isMobileFullscreen.value
        ? "overlay-mobile-fullscreen"
        : PLACEMENT_CLASSES[config.value.placement]
    )
  );
  useSignalEffect(() => {
    if (error.value) {
      if (expandable.value) {
        sawError.value = true;
        expanded.value = true;
      } else {
        sawError.value = false;
      }
    }
  });

  // Listen for custom expansion events
  useSignalEffect(() => {
    const handleExpandEvent = ((event: CustomEvent) => {
      if (!event.detail || event.detail._convaiEventHandled) {
        return;
      }

      event.detail._convaiEventHandled = true;
      if (event.detail.action === "expand") {
        expanded.value = true;
      } else if (event.detail.action === "collapse") {
        expanded.value = false;
      } else if (event.detail.action === "toggle") {
        expanded.value = !expanded.value;
      }
    }) as EventListener;

    const host = shadowHost.value;
    // Listen for custom events on the document
    document.addEventListener("elevenlabs-agent:expand", handleExpandEvent);
    host?.addEventListener("elevenlabs-agent:expand", handleExpandEvent);

    return () => {
      document.removeEventListener(
        "elevenlabs-agent:expand",
        handleExpandEvent
      );
      host?.removeEventListener("elevenlabs-agent:expand", handleExpandEvent);
    };
  });

  const state = useComputed(() => {
    if (!expandable.value && !!error.value && !sawError.value) {
      return "error";
    }
    if (!terms.termsAccepted.value && terms.termsShown.value) {
      return "terms";
    }
    return "conversation";
  });

  const isError = useComputed(() => state.value === "error");
  const isTerms = useComputed(() => state.value === "terms");
  const isConversation = useComputed(() => state.value === "conversation");

  const handleDismiss = () => {
    hidden.value = true;
  };

  const handleSheetCollapse = () => {
    expanded.value = false;
    hidden.value = false;
  };

  const handleSheetDismiss = () => {
    if (
      !config.value.always_expanded &&
      !config.value.default_expanded &&
      expandable.value
    ) {
      expanded.value = false;
      return;
    }

    hidden.value = true;
  };

  const handleExpand = () => {
    hidden.value = false;
  };

  const showConversation = useComputed(
    () => isConversation.value && !hidden.value
  );
  const showTerms = useComputed(() => isTerms.value && !hidden.value);
  const showError = useComputed(() => isError.value && !hidden.value);

  const showDismiss = useComputed(() => config.value.dismissible);
  const showSheetDismiss = useComputed(
    () => showDismiss.value || (expandable.value && !config.value.always_expanded)
  );

  // Show expand button when widget is hidden and dismissible is enabled
  const showExpandButton = useComputed(
    () => config.value.dismissible && hidden.value
  );

  return (
    <>
      <InOutTransition initial={false} active={showConversation}>
        <Root className={overlayClassName} style={HIDDEN_STYLE}>
          {!hidden.value &&
            (config.value.always_expanded ? (
              <Sheet
                open
                forceFullscreen={isMobileFullscreen}
                onDismiss={showDismiss.value ? handleSheetDismiss : undefined}
              />
            ) : (
              <>
                {expandable.value && (
                  <Sheet
                    open={expanded}
                    forceFullscreen={isMobileFullscreen}
                    onDismiss={
                      showSheetDismiss.value
                        ? showDismiss.value
                          ? handleSheetDismiss
                          : handleSheetCollapse
                        : undefined
                    }
                  />
                )}
                <div
                  className={cn(
                    "widget-launcher",
                    showTrigger.value &&
                      expanded.value &&
                      !isMobileFullscreen.value &&
                      (config.value.placement.startsWith("top") ? "mb-3" : "mt-3")
                  )}
                >
                  {showTrigger.value && (
                    <Trigger
                      expandable={expandable.value}
                      expanded={expanded}
                      onDismiss={
                        showDismiss.value
                          ? expandable.value
                            ? handleSheetDismiss
                            : handleDismiss
                          : undefined
                      }
                    />
                  )}
                </div>
              </>
            ))}
        </Root>
      </InOutTransition>
      <InOutTransition initial={false} active={showTerms}>
        <Root className={overlayClassName} style={HIDDEN_STYLE}>
          <TermsModal />
        </Root>
      </InOutTransition>
      <InOutTransition initial={false} active={showError}>
        <Root className={overlayClassName} style={HIDDEN_STYLE}>
          <ErrorModal sawError={sawError} />
        </Root>
      </InOutTransition>
      <InOutTransition initial={false} active={showExpandButton}>
        <Root className={overlayClassName} style={HIDDEN_STYLE}>
          <ExpandButton onExpand={handleExpand} />
        </Root>
      </InOutTransition>
    </>
  );
});
