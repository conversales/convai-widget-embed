import { Fragment } from "preact";
import { ReadonlySignal, Signal } from "@preact/signals";
import { DisplayTranscriptEntry } from "../utils/display-transcript";
import { TranscriptMessage } from "./TranscriptMessage";
import { useStickToBottom } from "../utils/useStickToBottom";
import { LeadCaptureForm, useLeadCaptureRequired } from "./LeadCaptureForm";
import { useLeadsCaptureEnabled, useCheckoutCommerceEnabled } from "../contexts/widget-config";
import { ProductCartTranscriptCards } from "./ProductCartFlow";
import { useProductCart } from "../contexts/product-cart";
import { shouldHideCheckoutTranscriptEntry } from "../utils/checkout";

interface TranscriptProps {
  scrollPinned: Signal<boolean>;
  transcript: ReadonlySignal<DisplayTranscriptEntry[]>;
}

export function Transcript({ scrollPinned, transcript }: TranscriptProps) {
  const leadsCaptureEnabled = useLeadsCaptureEnabled();
  const leadCaptureRequired = useLeadCaptureRequired();
  const checkoutEnabled = useCheckoutCommerceEnabled();
  const cart = useProductCart();
  const {
    scrollContainer,
    contentRef,
    handleScroll,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    firstRender,
  } = useStickToBottom({ scrollPinned });

  let firstAgentMessageRendered = false;

  return (
    <div
      ref={scrollContainer}
      className="px-4 pt-5 pb-4 grow overflow-y-auto overflow-x-hidden z-2 min-w-0"
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div ref={contentRef} className="flex min-w-0 max-w-full flex-col gap-6">
        {leadCaptureRequired.value && transcript.value.length === 0 && <LeadCaptureForm />}
        {transcript.value.map((entry, index) => {
          const isAgentMessage =
            entry.type === "message" && entry.role !== "user";

          if (
            shouldHideCheckoutTranscriptEntry(
              entry,
              cart.checkoutStep.value,
              transcript.value,
              index
            )
          ) {
            return null;
          }

          if (leadCaptureRequired.value && firstAgentMessageRendered) {
            return null;
          }

          if (leadCaptureRequired.value && isAgentMessage) {
            firstAgentMessageRendered = true;
          }

          return (
            <Fragment key={`${index}-${entry.conversationIndex}`}>
              <TranscriptMessage
                entry={entry}
                entryIndex={index}
                entries={transcript.value}
                animateIn={!firstRender.current}
              />
              {leadsCaptureEnabled.value && leadCaptureRequired.value && isAgentMessage && (
                <LeadCaptureForm />
              )}
            </Fragment>
          );
        })}
        {checkoutEnabled.value && <ProductCartTranscriptCards />}
      </div>
    </div>
  );
}
