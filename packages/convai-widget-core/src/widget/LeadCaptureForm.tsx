import {
  signal,
  useComputed,
  useSignal,
  useSignalEffect,
} from "@preact/signals";
import { useCallback } from "preact/compat";
import { useConversation } from "../contexts/conversation";
import { useAttribute } from "../contexts/attributes";
import { useTextContents } from "../contexts/text-contents";
import {
  useLeadsCaptureEnabled,
  useWidgetAvailability,
} from "../contexts/widget-config";

const leadCaptureCompletionVersion = signal(0);
const leadCaptureCompletedAgentKeys = new Set<string>();

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
  const { transcript } = useConversation();
  const agentId = useAttribute("agent-id");
  const signedUrl = useAttribute("signed-url");

  return useComputed(() => {
    if (!leadsCaptureEnabled.value) {
      return false;
    }

    leadCaptureCompletionVersion.value;
    if (isLeadCaptureCompleted(agentId.value, signedUrl.value)) {
      return false;
    }

    return !transcript.value.some(
      entry =>
        entry.type === "message" &&
        entry.role === "user" &&
        typeof entry.message === "string" &&
        isLeadCaptureMessage(entry.message)
    );
  });
}

export function LeadCaptureForm() {
  const text = useTextContents();
  const { isDisconnected, sendUserMessage, startSession, conversationIndex } =
    useConversation();
  const agentId = useAttribute("agent-id");
  const signedUrl = useAttribute("signed-url");
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
        const conversationId = await startSession(
          event.currentTarget as HTMLElement,
          message
        );
        if (conversationId) {
          markLeadCaptureCompleted(agentId.value, signedUrl.value);
        }
        return;
      }

      sendUserMessage(message);
      markLeadCaptureCompleted(agentId.value, signedUrl.value);
    },
    [
      agentId,
      email,
      isDisconnected,
      isValid,
      name,
      phoneNumber,
      sendUserMessage,
      signedUrl,
      startSession,
    ]
  );

  if (!leadCaptureRequired.value) {
    return null;
  }

  if (!availability.value.checking && !availability.value.allowed) {
    return null;
  }

  const fieldClassName =
    "h-9 rounded-input border border-base-border bg-base px-3 text-sm text-base-primary outline-hidden placeholder:text-base-subtle";

  return (
    <div className="px-8 flex justify-center">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[260px] min-w-0 flex-col gap-3 rounded-[calc(var(--el-bubble-radius)+6px)] border border-base-border bg-base px-4 py-4 text-base-primary shadow-sm"
      >
        <div className="text-center text-sm font-medium leading-5">
          {text.lead_capture_title}
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            disabled={availability.value.checking || !availability.value.allowed}
            value={name.value}
            onInput={event => {
              name.value = event.currentTarget.value;
            }}
            placeholder={text.lead_capture_name.value}
            className={fieldClassName}
          />
          <input
            type="tel"
            disabled={availability.value.checking || !availability.value.allowed}
            value={phoneNumber.value}
            onInput={event => {
              phoneNumber.value = event.currentTarget.value;
            }}
            placeholder={text.lead_capture_phone.value}
            className={fieldClassName}
          />
          <input
            type="email"
            disabled={availability.value.checking || !availability.value.allowed}
            value={email.value}
            onInput={event => {
              email.value = event.currentTarget.value;
            }}
            placeholder={text.lead_capture_email.value}
            className={fieldClassName}
          />
          <button
            type="submit"
            disabled={!isValid}
            className="mt-1 inline-flex h-9 w-full items-center justify-center rounded-button bg-accent px-4 text-sm font-medium text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {text.lead_capture_submit}
          </button>
        </div>
      </form>
    </div>
  );
}

function markLeadCaptureCompleted(
  agentId: string | undefined,
  signedUrl: string | undefined
) {
  leadCaptureCompletedAgentKeys.add(getLeadCaptureAgentKey(agentId, signedUrl));
  leadCaptureCompletionVersion.value++;
}

function isLeadCaptureCompleted(
  agentId: string | undefined,
  signedUrl: string | undefined
) {
  return leadCaptureCompletedAgentKeys.has(
    getLeadCaptureAgentKey(agentId, signedUrl)
  );
}

function getLeadCaptureAgentKey(
  agentId: string | undefined,
  signedUrl: string | undefined
) {
  if (agentId) {
    return agentId;
  }

  if (signedUrl) {
    try {
      return new URL(signedUrl).searchParams.get("agent_id") || "default";
    } catch {
      return "default";
    }
  }

  return "default";
}
