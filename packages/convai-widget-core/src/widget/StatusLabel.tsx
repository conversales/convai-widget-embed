import { clsx } from "clsx";
import { HTMLAttributes, useState } from "preact/compat";
import { useConversation } from "../contexts/conversation";
import { useComputed, useSignalEffect } from "@preact/signals";
import { InOutTransition } from "../components/InOutTransition";
import { useTextContents } from "../contexts/text-contents";
import { useConversationMode } from "../contexts/conversation-mode";
import { useIsConversationTextOnly } from "../contexts/widget-config";

export function useStatusLabelText() {
  const { status, mode } = useConversation();
  const { isVoiceMode } = useConversationMode();
  const isConversationTextOnly = useIsConversationTextOnly();
  const text = useTextContents();

  return useComputed(() => {
    if (status.value === "disconnected" || status.value === "disconnecting") {
      return text.start_chat.value;
    }

    if (status.value === "connecting") {
      return text.connecting_status.value;
    }

    if (isVoiceMode.value && !isConversationTextOnly.value) {
      return mode.value === "speaking"
        ? text.speaking_status.value
        : text.listening_status.value;
    }

    return text.chatting_status.value;
  });
}

export function StatusLabel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { status, isSpeaking } = useConversation();
  const { isVoiceMode } = useConversationMode();
  const isConversationTextOnly = useIsConversationTextOnly();
  const currentLabel = useStatusLabelText();

  const [label, setLabel] = useState(currentLabel.peek());
  useSignalEffect(() => {
    const label = currentLabel.value;
    const shouldDelayUpdate =
      status.value === "connected" &&
      isVoiceMode.value &&
      !isConversationTextOnly.value &&
      !isSpeaking.value;

    if (!shouldDelayUpdate) {
      setLabel(label);
    } else {
      const timeout = setTimeout(() => {
        setLabel(label);
      }, 500);
      return () => clearTimeout(timeout);
    }
  });

  return (
    <div
      className={clsx(
        "relative overflow-hidden text-xs font-medium",
        status.value === "disconnected"
          ? "text-base-subtle"
          : "text-base-primary",
        className
      )}
      {...props}
    >
      <InOutTransition key={label} initial={false} active={true}>
        <div
          className={clsx(
            "whitespace-nowrap transition-[opacity,transform] ease-out duration-200 data-hidden:opacity-0 transform data-hidden:translate-y-2",
            status.value !== "disconnected" && "animate-text"
          )}
        >
          {label}
        </div>
      </InOutTransition>
    </div>
  );
}
