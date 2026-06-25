import {
  useIsConversationTextOnly,
  useWidgetConfig,
} from "../contexts/widget-config";
import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import { useCallback } from "preact/compat";
import { SizeTransition } from "../components/SizeTransition";
import { CallButton } from "./CallButton";
import { TriggerMuteButton } from "./TriggerMuteButton";
import { Button } from "../components/Button";
import { clsx } from "clsx";
import { ExpandableProps } from "./Trigger";
import { Avatar } from "../components/Avatar";
import { DismissButton } from "../components/DismissButton";
import { ShopifyCartBadge } from "./ShopifyCartBadge";

interface ExpandableTriggerActionsProps extends ExpandableProps {
  onDismiss?: () => void;
}

export function ExpandableTriggerActions({
  expanded,
  onDismiss,
}: ExpandableTriggerActionsProps) {
  const textOnly = useIsConversationTextOnly();
  const variant = useWidgetConfig().value.variant;
  const { isDisconnected } = useConversation();
  const text = useTextContents();
  const isFull = variant === "full";
  const compactCollapsed = !isFull && !expanded.value;
  const actionPad = compactCollapsed ? "p-0.5" : "p-1";
  const launcherButtonClass = compactCollapsed ? "h-8 min-w-8" : undefined;
  const toggleExpanded = useCallback(() => {
    expanded.value = !expanded.value;
  }, [expanded]);

  return (
    <>
      {variant === "full" && (
        <SizeTransition
          visible={!expanded.value && !isDisconnected.value}
          className={actionPad}
        >
          <Avatar size={compactCollapsed ? "xs" : "sm"} />
        </SizeTransition>
      )}
      <SizeTransition
        grow={variant !== "tiny"}
        visible={!textOnly.value && !expanded.value && !isDisconnected.value}
        className={actionPad}
      >
        <CallButton
          iconOnly
          isDisconnected={false}
          className={launcherButtonClass}
        />
      </SizeTransition>
      <SizeTransition
        visible={!textOnly.value && !expanded.value && !isDisconnected.value}
        className={actionPad}
      >
        <TriggerMuteButton className={launcherButtonClass} />
      </SizeTransition>
      <SizeTransition grow={isDisconnected.value} visible className={actionPad}>
        <div className="relative">
          <Button
            className={clsx("w-full", launcherButtonClass)}
          variant="primary"
          iconClassName={clsx(
            (expanded.value || !isDisconnected.value) &&
              "transition-transform duration-200",
            expanded.value && "-rotate-180"
          )}
          icon={
            expanded.value
              ? "chevron-up"
              : isDisconnected.value
                ? textOnly.value
                  ? "chat"
                  : "phone"
                : "chevron-up"
          }
          aria-label={
            expanded.value
              ? text.collapse
              : isDisconnected.value
                ? textOnly.value
                  ? text.start_chat
                  : text.start_call
                : text.expand
          }
          onClick={
            !expanded.value && !isDisconnected.value
              ? toggleExpanded
              : undefined
          }
        >
          {!expanded.value && isDisconnected.value && variant !== "tiny"
            ? textOnly.value
              ? text.start_chat
              : text.start_call
            : undefined}
          </Button>
          {isDisconnected.value && !expanded.value && <ShopifyCartBadge />}
        </div>
      </SizeTransition>
      <SizeTransition
        visible={!!onDismiss && !expanded.value && isDisconnected.value}
        className={actionPad}
      >
        <DismissButton onDismiss={onDismiss} />
      </SizeTransition>
    </>
  );
}
