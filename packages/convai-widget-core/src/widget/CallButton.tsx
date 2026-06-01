import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import { BaseButtonProps, Button } from "../components/Button";
import { cn } from "../utils/cn";
import { useLeadCaptureRequired } from "./LeadCaptureForm";

interface CallButtonProps extends BaseButtonProps {
  iconOnly?: boolean;
  isDisconnected?: boolean;
}

export function CallButton({
  iconOnly,
  isDisconnected,
  children,
  disabled: disabledProp,
  ...props
}: CallButtonProps) {
  const { endSession, startSession } = useConversation();
  const text = useTextContents();
  const leadCaptureRequired = useLeadCaptureRequired();

  return (
    <Button
      variant={isDisconnected ? "primary" : "secondary"}
      icon={isDisconnected ? "phone" : "phone-off"}
      onClick={isDisconnected ? e => startSession(e.currentTarget) : endSession}
      aria-label={isDisconnected ? text.start_call : text.end_call}
      disabled={disabledProp || (!!isDisconnected && leadCaptureRequired.value)}
      {...props}
    >
      {!iconOnly
        ? (children ??
          (isDisconnected ? text.start_call : text.end_call))
        : undefined}
    </Button>
  );
}
