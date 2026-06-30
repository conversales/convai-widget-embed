import { useComputed, useSignal } from "@preact/signals";
import {
  useFirstMessage,
  useIsConversationTextOnly,
  useTextOnly,
  useWidgetConfig,
} from "../contexts/widget-config";
import { useConversation } from "../contexts/conversation";
import { buildDisplayTranscript, type DisplayTranscriptEntry } from "../utils/display-transcript";
import { InOutTransition } from "../components/InOutTransition";
import { cn } from "../utils/cn";
import { Placement } from "../types/config";
import { Transcript } from "./Transcript";
import { FeedbackPage } from "./FeedbackPage";
import { FeedbackActions } from "./FeedbackActions";
import { Signalish } from "../utils/signalish";
import type { ReadonlySignal } from "@preact/signals";
import { SheetHeader } from "./SheetHeader";
import { useSheetContent } from "../contexts/sheet-content";
import { useWidgetSize } from "../contexts/widget-size";
import { SheetActions } from "./SheetActions";
import { AvatarOverlay } from "./AvatarOverlay";
import { useLeadCaptureRequired } from "./LeadCaptureForm";
import { SheetHistory } from "./SheetHistory";

interface SheetProps {
  open: Signalish<boolean>;
  onDismiss?: () => void;
  forceFullscreen?: ReadonlySignal<boolean>;
}

const ORIGIN_CLASSES: Record<Placement, string> = {
  "top-left": "origin-top-left",
  top: "origin-top",
  "top-right": "origin-top-right",
  "bottom-left": "origin-bottom-left",
  "bottom-right": "origin-bottom-right",
  bottom: "origin-bottom",
};

export function Sheet({ open, onDismiss, forceFullscreen }: SheetProps) {
  const textOnly = useTextOnly();
  const isConversationTextOnly = useIsConversationTextOnly();
  const config = useWidgetConfig();
  const placement = config.value.placement;
  const { isDisconnected, startSession, transcript, conversationIndex } =
    useConversation();
  const firstMessage = useFirstMessage();
  const { currentContent, currentConfig } = useSheetContent();
  const { variant: sizeVariant } = useWidgetSize();
  const leadCaptureRequired = useLeadCaptureRequired();

  const filteredTranscript = useComputed<DisplayTranscriptEntry[]>(() => {
    const isTextOnly = textOnly.value || isConversationTextOnly.value;
    return buildDisplayTranscript(transcript.value, {
      showAgentStatus: config.value.show_agent_status ?? false,
      transcriptEnabled: isTextOnly || (config.value.transcript_enabled ?? false),
      // Prepend first message only when the widget is text-only
      // (not when it switched to text-only due to user input)
      firstMessage:
        isTextOnly && textOnly.value && firstMessage.value
          ? firstMessage.value
          : undefined,
      firstMessageConversationIndex: conversationIndex.peek(),
    });
  });
  const showTranscript = useComputed(
    () =>
      leadCaptureRequired.value ||
      filteredTranscript.value.length > 0 ||
      (!isDisconnected.value && config.value.transcript_enabled)
  );
  const scrollPinned = useSignal(true);

  const showAvatar = useComputed(
    () =>
      currentContent.value !== "feedback" &&
      currentContent.value !== "history" &&
      !showTranscript.value
  );
  const showStatusLabel = useComputed(
    () =>
      currentContent.value !== "feedback" &&
      currentContent.value !== "history" &&
      !!config.value.show_agent_status
  );

  const showLanguageSelector = useComputed(
    () =>
      currentContent.value !== "feedback" &&
      currentContent.value !== "history" &&
      (!showTranscript.value || isDisconnected.value)
  );

  const showExpandButton = useComputed(() => showTranscript.value);
  const showSheetDismiss = useComputed(
    () =>
      !!onDismiss &&
      (!config.value.dismissible ||
        isDisconnected.value ||
        isConversationTextOnly.value)
  );

  const isFullscreen = useComputed(
    () => forceFullscreen?.value || sizeVariant.value === "fullscreen"
  );

  return (
    <InOutTransition initial={false} active={open}>
      <div
        data-variant={isFullscreen.value ? "fullscreen" : sizeVariant.value}
        className={cn(
          "sheet",
          "sheet-surface flex flex-col pointer-events-auto z-2",
          "transition-[width,height,max-width,max-height,transform,border-radius,opacity,inset,bottom,top,left,right,margin,padding] duration-200",
          isFullscreen.value
            ? "sheet-mobile-fullscreen fixed inset-0 overflow-hidden shadow-none data-hidden:scale-100 data-hidden:opacity-0"
            : "overflow-visible absolute shadow-lg data-hidden:scale-90 data-hidden:opacity-0",
          !isFullscreen.value && ORIGIN_CLASSES[placement],
          !isFullscreen.value &&
            (placement.startsWith("top")
              ? config.value.always_expanded
                ? "top-0"
                : "top-20"
              : config.value.always_expanded
                ? "bottom-0"
                : "bottom-20")
        )}
      >
        <SheetHeader
          showBackButton={currentConfig.showHeaderBack}
          onBackClick={currentConfig.onHeaderBack}
          onDismiss={showSheetDismiss.value ? onDismiss : undefined}
          showStatusLabel={showStatusLabel}
          showLanguageSelector={showLanguageSelector}
          showExpandButton={showExpandButton}
        />
        <InOutTransition active={currentContent.value === "transcript"}>
          <div className="grow flex flex-col min-h-0 relative overflow-hidden transition-opacity duration-300 ease-out data-hidden:opacity-0">
            <Transcript
              transcript={filteredTranscript}
              scrollPinned={scrollPinned}
            />
            <SheetActions
              showTranscript={showTranscript.value}
              scrollPinned={scrollPinned}
            />
          </div>
        </InOutTransition>
        <InOutTransition active={currentContent.value === "history"}>
          <div className="grow flex flex-col min-h-0 relative overflow-hidden transition-opacity duration-300 ease-out data-hidden:opacity-0">
            <SheetHistory />
          </div>
        </InOutTransition>
        <InOutTransition active={currentContent.value === "feedback"}>
          <div className="absolute inset-0 top-[88px] flex flex-col bg-base transition-transform duration-300 ease-out data-hidden:translate-x-full">
            <FeedbackPage />
            <FeedbackActions />
          </div>
        </InOutTransition>
        <AvatarOverlay
          showAvatar={showAvatar}
          showTranscript={showTranscript}
          isDisconnected={isDisconnected}
          onStartSession={startSession}
        />
      </div>
    </InOutTransition>
  );
}
