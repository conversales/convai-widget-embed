import {
  ReadonlySignal,
  Signal,
  useComputed,
  useSignal,
  useSignalEffect,
} from "@preact/signals";
import {
  KeyboardEventHandler,
  TargetedEvent,
  useCallback,
} from "preact/compat";
import { Button } from "../components/Button";
import { SizeTransition } from "../components/SizeTransition";
import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import {
  getWidgetAvailabilityMessage,
  useFileInputMaxFiles,
  useIsConversationTextOnly,
  useTextInputEnabled,
  useWidgetConfig,
  useWidgetAvailability,
} from "../contexts/widget-config";
import { useProductCart } from "../contexts/product-cart";
import { isContinuePaymentMessage, isCheckoutFlowStep } from "../utils/checkout";
import { cn } from "../utils/cn";
import { CallButton } from "./CallButton";
import { TriggerMuteButton } from "./TriggerMuteButton";
import { useConversationMode } from "../contexts/conversation-mode";
import { PendingFilePreview } from "./PendingFilePreview";
import { UploadFileButton } from "./UploadFileButton";
import { ACCEPTED_FILE_EXTENSIONS, useFileUpload } from "./useFileUpload";
import { PoweredBy } from "./PoweredBy";
import { useLeadCaptureRequired } from "./LeadCaptureForm";

export function SheetActions({
  showTranscript,
  scrollPinned,
}: {
  showTranscript: boolean;
  scrollPinned: Signal<boolean>;
}) {
  const config = useWidgetConfig();
  const textInputEnabled = useTextInputEnabled();
  const leadCaptureRequired = useLeadCaptureRequired();
  const availability = useWidgetAvailability();
  const maxFiles = useFileInputMaxFiles();
  const userMessage = useSignal("");
  const isFocused = useSignal(false);
  const text = useTextContents();
  const {
    isDisconnected,
    status,
    lastId,
    transcript,
    startSession,
    sendUserMessage,
    sendMultimodalMessage,
  } = useConversation();
  const cart = useProductCart();

  const fileError = useSignal<string | null>(null);
  // Auto-dismiss the validation toast 4s after it's set; a new message resets
  // the timer because useSignalEffect re-runs (and cleans up) on change.
  useSignalEffect(() => {
    if (!fileError.value) return;
    const id = setTimeout(() => {
      fileError.value = null;
    }, 4000);
    return () => clearTimeout(id);
  });

  // Only expose the conversation id while fully connected — during the
  // "connecting" phase of a reconnect, `lastId` still holds the previous
  // conversation's id, which would cause uploads to target the wrong endpoint.
  const conversationId = status.value === "connected" ? lastId.value : null;
  const {
    pendingFile,
    isUploading,
    hasReachedLimit,
    addFile,
    removeFile,
    markFileAsSent,
  } = useFileUpload({ conversationId, maxFiles: maxFiles.value });

  const uploadEnabled = useComputed(
    () =>
      !pendingFile.value &&
      !hasReachedLimit.value &&
      status.value === "connected"
  );
  const availabilityMessage = useComputed(() => {
    if (availability.value.checking) {
      return "Checking availability...";
    }

    if (!availability.value.allowed) {
      return getWidgetAvailabilityMessage(availability.value.message);
    }

    return null;
  });

  const handleFileSelect = useCallback(
    (file: File) => {
      const error = addFile(file);
      if (!error) return;
      if (error === "unsupported_type") {
        fileError.value = `${text.file_type_unsupported.peek()} ${ACCEPTED_FILE_EXTENSIONS.join(", ")}.`;
        return;
      }
      const messageByCode = {
        too_large: text.file_too_large,
        limit_reached: text.file_limit_reached,
      };
      fileError.value = messageByCode[error].peek();
    },
    [addFile, text, fileError]
  );

  const canSend = useComputed(() => {
    if (
      leadCaptureRequired.value ||
      availability.value.checking ||
      !availability.value.allowed
    ) {
      return false;
    }

    const hasText = !!userMessage.value.trim();
    const hasReadyFile = pendingFile.value?.status === "ready";
    return (hasText || hasReadyFile) && !isUploading.value;
  });

  const predefinedQuestions = useComputed(() =>
    (config.value.predefined_questions ?? [])
      .map(question => question.trim())
      .filter(Boolean)
      .slice(0, 5)
  );
  const hasUserMessages = useComputed(() =>
    transcript.value.some(
      entry => entry.type === "message" && entry.role === "user"
    )
  );

  const handleSendMessage = useCallback(
    async (e: TargetedEvent<HTMLElement>) => {
      e.preventDefault();
      // Runtime guard — the send button's `disabled` prop and the keydown
      // canSend check both reflect render-time state, so a click/keypress
      // racing with an upload starting could otherwise fall through to the
      // text-only path and silently drop the in-flight file.
      if (!canSend.peek()) return;

      const message = userMessage.value.trim();
      const pending = pendingFile.value;

      if (pending?.status === "ready" && !isDisconnected.value) {
        scrollPinned.value = true;
        sendMultimodalMessage({
          text: message || undefined,
          file: {
            fileId: pending.fileId,
            fileName: pending.file.name,
            mimeType: pending.file.type,
            previewUrl: pending.previewUrl,
          },
        });
        markFileAsSent();
        userMessage.value = "";
        return;
      }

      if (message) {
        scrollPinned.value = true;
        userMessage.value = "";

        if (isContinuePaymentMessage(message)) {
          if (cart.handleContinuePaymentRequest()) {
            return;
          }

          if (isCheckoutFlowStep(cart.checkoutStep.value)) {
            cart.beginCheckoutUrlRequest();
            if (isDisconnected.value) {
              await startSession(e.currentTarget, message, { silent: true });
            } else {
              sendUserMessage(message, { silent: true });
            }
            return;
          }
        }

        if (isDisconnected.value) {
          await startSession(e.currentTarget, message);
        } else {
          sendUserMessage(message);
        }
      }
    },
    [
      userMessage,
      scrollPinned,
      isDisconnected,
      startSession,
      sendUserMessage,
      sendMultimodalMessage,
      pendingFile,
      markFileAsSent,
      canSend,
      cart,
      config,
    ]
  );

  const handlePredefinedQuestion = useCallback(
    async (question: string, e: TargetedEvent<HTMLElement>) => {
      scrollPinned.value = true;

      if (isContinuePaymentMessage(question)) {
        if (cart.handleContinuePaymentRequest()) {
          return;
        }

        if (isCheckoutFlowStep(cart.checkoutStep.value)) {
          cart.beginCheckoutUrlRequest();
          if (isDisconnected.value) {
            await startSession(e.currentTarget, question, { silent: true });
            return;
          }
          sendUserMessage(question, { silent: true });
          return;
        }
      }

      if (isDisconnected.value) {
        await startSession(e.currentTarget, question);
        return;
      }
      sendUserMessage(question);
    },
    [
      isDisconnected,
      scrollPinned,
      sendUserMessage,
      startSession,
      cart,
      config,
    ]
  );

  return (
    <div className="sticky bottom-0 pointer-events-none z-10 max-h-[50%] flex flex-col">
      <div
        className="sheet-actions relative w-full flex flex-col pointer-events-auto min-h-0 items-center px-3 pb-1.5"
      >
        {!hasUserMessages.value && predefinedQuestions.value.length > 0 && (
          <div className="w-full px-1 pb-2 flex flex-col items-end gap-2">
            {predefinedQuestions.value.map(question => (
              <Button
                key={question}
                variant="secondary"
                className="max-w-full min-h-0 rounded-[999px] border border-base-border bg-base px-4 py-2 text-sm text-base-primary shadow-sm hover:bg-base-hover active:bg-base-active whitespace-normal text-left"
                onClick={event => {
                  void handlePredefinedQuestion(question, event);
                }}
              >
                {question}
              </Button>
            ))}
          </div>
        )}
        {fileError.value && (
          <div className="w-full px-1 pb-1.5 text-xs text-base-error text-center">
            {fileError.value}
          </div>
        )}
        {availabilityMessage.value && (
          <div
            className={`w-full px-1 pb-1.5 text-xs text-center ${availability.value.allowed ? "text-base-subtle" : "text-base-error"}`}
          >
            {availabilityMessage.value}
          </div>
        )}
        {textInputEnabled.value && (
          <div
            className={cn(
              "bg-base relative flex flex-col min-h-0 rounded-[calc(var(--el-sheet-radius)-8px)] border border-base-border w-full transition-shadow overflow-hidden",
              isFocused.value && "ring-2 ring-accent"
            )}
          >
            {pendingFile.value && (
              <div className="px-3 pt-3">
                <PendingFilePreview
                  pendingFile={pendingFile.value}
                  onRemove={removeFile}
                />
              </div>
            )}
            <SheetTextarea
              userMessage={userMessage}
              isFocused={isFocused}
              canSend={canSend}
              disabled={
                leadCaptureRequired.value ||
                availability.value.checking ||
                !availability.value.allowed
              }
              onSendMessage={handleSendMessage}
            />
            <div className="sheet-input-actions absolute bottom-0 left-0 right-0 flex gap-1.5 items-center justify-end px-3 pb-3 pt-2 pointer-events-none">
              <div className="pointer-events-auto flex gap-1.5 items-center">
                <SheetButtons
                  canSend={canSend}
                  onSendMessage={handleSendMessage}
                  showTranscript={showTranscript}
                  uploadEnabled={uploadEnabled}
                  onFileSelect={handleFileSelect}
                />
              </div>
            </div>
          </div>
        )}
        {!textInputEnabled.value && (
          <div className="w-full flex gap-1.5 items-center justify-end">
            <SheetButtons
              canSend={canSend}
              onSendMessage={handleSendMessage}
              showTranscript={showTranscript}
              uploadEnabled={uploadEnabled}
              onFileSelect={handleFileSelect}
            />
          </div>
        )}
        <PoweredBy inline />
      </div>
    </div>
  );
}

function SheetTextarea({
  userMessage,
  isFocused,
  canSend,
  disabled,
  onSendMessage,
}: {
  userMessage: Signal<string>;
  isFocused: Signal<boolean>;
  canSend: ReadonlySignal<boolean>;
  disabled: boolean;
  onSendMessage: (e: TargetedEvent<HTMLElement>) => Promise<void>;
}) {
  const text = useTextContents();
  const textOnly = useIsConversationTextOnly();
  const leadCaptureRequired = useLeadCaptureRequired();
  const availability = useWidgetAvailability();
  const { isDisconnected, conversationIndex, sendUserActivity } =
    useConversation();

  const handleChange = useCallback(
    (e: TargetedEvent<HTMLTextAreaElement>) => {
      userMessage.value = e.currentTarget.value;
    },
    [userMessage]
  );

  const handleKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    async e => {
      if (e.isComposing) {
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend.peek()) {
          await onSendMessage(e);
        }
      }
    },
    [onSendMessage, canSend]
  );

  const handleFocus = useCallback(() => {
    isFocused.value = true;
  }, [isFocused]);

  const handleBlur = useCallback(() => {
    isFocused.value = false;
  }, [isFocused]);

  return (
    <textarea
      aria-label={text.input_label}
      disabled={disabled}
      value={userMessage.value}
      onInput={sendUserActivity}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={
        availability.value.checking
          ? "Checking availability..."
          : !availability.value.allowed
            ? "Chat is temporarily unavailable"
            : leadCaptureRequired.value
              ? text.lead_capture_title.value
              : textOnly.value
                ? isDisconnected.value && conversationIndex.value > 0
                  ? text.input_placeholder_new_conversation.value
                  : text.input_placeholder_text_only.value
                : text.input_placeholder.value
      }
      className="w-full h-full resize-none bg-base leading-5 outline-hidden text-sm text-base-primary placeholder:text-base-subtle disabled:cursor-not-allowed disabled:text-base-subtle p-3 pb-[60px] min-h-18 max-h-full field-sizing-content"
    />
  );
}

function SheetButtons({
  canSend,
  onSendMessage,
  showTranscript = false,
  uploadEnabled,
  onFileSelect,
}: {
  canSend: ReadonlySignal<boolean>;
  onSendMessage: (e: TargetedEvent<HTMLElement>) => Promise<void>;
  showTranscript?: boolean;
  uploadEnabled: ReadonlySignal<boolean>;
  onFileSelect: (file: File) => void;
}) {
  const text = useTextContents();
  const textOnly = useIsConversationTextOnly();
  const textInputEnabled = useTextInputEnabled();
  const { isDisconnected, status } = useConversation();
  const { isTextMode } = useConversationMode();
  const uploadButtonVisible = useComputed(
    () => textInputEnabled.value && uploadEnabled.value
  );

  const showCallButton = useComputed(() => {
    return !isDisconnected.value || (!textOnly.value && showTranscript);
  });
  const showMuteButton = useComputed(() => {
    return !textOnly.value && !isDisconnected.value && !isTextMode.value;
  });

  return (
    <>
      <SizeTransition visible={showMuteButton.value}>
        <TriggerMuteButton className="bg-base text-base-primary hover:bg-base-hover active:bg-base-active" />
      </SizeTransition>
      <SizeTransition visible={showCallButton.value}>
        <CallButton
          iconOnly
          isDisconnected={isDisconnected.value}
          disabled={
            status.value === "disconnecting" || status.value === "connecting"
          }
          className="bg-base text-base-primary hover:bg-base-hover active:bg-base-active"
        />
      </SizeTransition>
      <SizeTransition visible={uploadButtonVisible.value}>
        <UploadFileButton
          iconOnly
          onFileSelect={onFileSelect}
          disabled={!uploadEnabled.value}
          className="bg-base text-base-primary hover:bg-base-hover active:bg-base-active"
        />
      </SizeTransition>
      {textInputEnabled.value && (
        <Button
          icon="send"
          onClick={onSendMessage}
          variant="primary"
          disabled={!canSend.value}
          aria-label={text.send_message.value}
        />
      )}
    </>
  );
}
