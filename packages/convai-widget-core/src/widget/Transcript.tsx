import { Fragment } from "preact";
import { ReadonlySignal, Signal } from "@preact/signals";
import { DisplayTranscriptEntry } from "../utils/display-transcript";
import { TranscriptMessage } from "./TranscriptMessage";
import { useStickToBottom } from "../utils/useStickToBottom";
import { LeadCaptureForm, useLeadCaptureRequired } from "./LeadCaptureForm";
import { useLeadsCaptureEnabled } from "../contexts/widget-config";

interface TranscriptProps {
  scrollPinned: Signal<boolean>;
  transcript: ReadonlySignal<DisplayTranscriptEntry[]>;
}

export function Transcript({ scrollPinned, transcript }: TranscriptProps) {
  const leadsCaptureEnabled = useLeadsCaptureEnabled();
  const leadCaptureRequired = useLeadCaptureRequired();
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
      className="px-4 pt-5 pb-4 grow overflow-y-auto z-2"
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div ref={contentRef} className="flex flex-col gap-6">
        {leadCaptureRequired.value && transcript.value.length === 0 && <LeadCaptureForm />}
        {transcript.value.map((entry, index) => {
          const isAgentMessage =
            entry.type === "message" && entry.role !== "user";

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
                animateIn={!firstRender.current}
              />
              {leadsCaptureEnabled.value && leadCaptureRequired.value && isAgentMessage && (
                <LeadCaptureForm />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
