import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useCallback } from "preact/compat";
import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import {
  useLeadsCaptureEnabled,
  useWidgetAvailability,
} from "../contexts/widget-config";

export function isLeadCaptureMessage(message: string) {
  const lines = message
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  return (
    lines.length >= 3 &&
    lines[0].startsWith("Name:") &&
    lines[1].startsWith("PhoneNumber:") &&
    lines[2].startsWith("Email:")
  );
}

export function useLeadCaptureRequired() {
  const leadsCaptureEnabled = useLeadsCaptureEnabled();
  const { transcript, conversationIndex } = useConversation();

  return useComputed(() => {
    if (!leadsCaptureEnabled.value) {
      return false;
    }

    return !transcript.value.some(
      entry =>
        entry.type === "message" &&
        entry.role === "user" &&
        entry.conversationIndex === conversationIndex.value &&
        typeof entry.message === "string" &&
        isLeadCaptureMessage(entry.message)
    );
  });
}

export function LeadCaptureForm() {
  const text = useTextContents();
  const { isDisconnected, sendUserMessage, startSession, conversationIndex } =
    useConversation();
  const leadCaptureRequired = useLeadCaptureRequired();
  const availability = useWidgetAvailability();
  const name = useSignal("");
  const phoneNumber = useSignal("");
  const email = useSignal("");
  useSignalEffect(() => {
    conversationIndex.value;
    name.value = "";
    phoneNumber.value = "";
    email.value = "";
  });

  const isValid =
    !!name.value.trim() &&
    !!phoneNumber.value.trim() &&
    !!email.value.trim() &&
    !availability.value.checking &&
    availability.value.allowed;

  const handleSubmit = useCallback(
    async (event: Event) => {
      event.preventDefault();

      if (!isValid) {
        return;
      }

      const message = [
        `Name: ${name.value.trim()}`,
        `PhoneNumber: ${phoneNumber.value.trim()}`,
        `Email: ${email.value.trim()}`,
      ].join("\n");

      if (isDisconnected.value) {
        await startSession(event.currentTarget as HTMLElement, message);
        return;
      }

      sendUserMessage(message);
    },
    [
      email,
      isDisconnected,
      isValid,
      name,
      phoneNumber,
      sendUserMessage,
      startSession,
    ]
  );

  if (!leadCaptureRequired.value) {
    return null;
  }

  if (!availability.value.checking && !availability.value.allowed) {
    return null;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-8 rounded-[20px] border border-base-border bg-base px-4 py-4 shadow-sm"
    >
      <div className="mb-3 text-sm font-medium text-base-primary">
        {text.lead_capture_title}
      </div>
      <div className="flex flex-col gap-2.5">
        <input
          type="text"
          disabled={availability.value.checking || !availability.value.allowed}
          value={name.value}
          onInput={event => {
            name.value = event.currentTarget.value;
          }}
          placeholder={text.lead_capture_name.value}
          className="h-10 rounded-input border border-base-border bg-base px-3 text-sm text-base-primary outline-hidden"
        />
        <input
          type="tel"
          disabled={availability.value.checking || !availability.value.allowed}
          value={phoneNumber.value}
          onInput={event => {
            phoneNumber.value = event.currentTarget.value;
          }}
          placeholder={text.lead_capture_phone.value}
          className="h-10 rounded-input border border-base-border bg-base px-3 text-sm text-base-primary outline-hidden"
        />
        <input
          type="email"
          disabled={availability.value.checking || !availability.value.allowed}
          value={email.value}
          onInput={event => {
            email.value = event.currentTarget.value;
          }}
          placeholder={text.lead_capture_email.value}
          className="h-10 rounded-input border border-base-border bg-base px-3 text-sm text-base-primary outline-hidden"
        />
        <button
          type="submit"
          disabled={!isValid}
          className="mt-1 inline-flex h-10 items-center justify-center rounded-button bg-accent px-4 text-sm font-medium text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {text.lead_capture_submit}
        </button>
      </div>
    </form>
  );
}
