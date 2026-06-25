import { useWidgetConfig } from "../contexts/widget-config";
import { useConversation } from "../contexts/conversation";
import { CallButton } from "./CallButton";
import { TriggerLanguageSelect } from "./TriggerLanguageSelect";
import { TriggerMuteButton } from "./TriggerMuteButton";
import { SizeTransition } from "../components/SizeTransition";
import { DismissButton } from "../components/DismissButton";
import { cn } from "../utils/cn";

interface TriggerActionsProps {
  onDismiss?: () => void;
}

export function TriggerActions({ onDismiss }: TriggerActionsProps) {
  const variant = useWidgetConfig().value.variant;
  const { isDisconnected, status } = useConversation();

  return (
    <>
      <CallButton
        isDisconnected={isDisconnected.value}
        iconOnly={variant === "tiny" || variant === "compact"}
        className={cn(
          "z-1 m-0.5",
          variant === "compact" && "h-8 min-w-8",
          variant !== "compact" && variant !== "tiny" && "m-1 w-full"
        )}
        disabled={
          status.value === "disconnecting" || status.value === "connecting"
        }
      />
      <TriggerLanguageSelect visible={isDisconnected.value} />
      <SizeTransition visible={!isDisconnected.value} className="p-1">
        <TriggerMuteButton />
      </SizeTransition>
      <SizeTransition visible={!!onDismiss} className="p-1">
        <DismissButton onDismiss={onDismiss} />
      </SizeTransition>
    </>
  );
}
