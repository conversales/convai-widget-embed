import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import { clsx } from "clsx";
import { SizeTransition } from "../components/SizeTransition";
import { Avatar } from "../components/Avatar";
import { ExpandableTriggerActions } from "./ExpandableTriggerActions";
import { ExpandableProps } from "./Trigger";

interface FullExpandableTriggerProps extends ExpandableProps {
  onDismiss?: () => void;
}

export function FullExpandableTrigger({
  expanded,
  className,
  onDismiss,
  ...rest
}: FullExpandableTriggerProps) {
  const { isDisconnected } = useConversation();
  const text = useTextContents();

  return (
    <div
      className={clsx(
        "transition-[border-radius] flex min-h-11 flex-col gap-1 p-1.5",
        !expanded.value && isDisconnected.value
          ? "rounded-sheet"
          : "rounded-compact-sheet",
        className
      )}
      {...rest}
    >
      <SizeTransition
        visible={!expanded.value && isDisconnected.value}
        className="shrink-0 p-0.5"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar
            size="sm"
            imageClassName="!bg-contain !bg-no-repeat bg-center"
          />
          <div className="max-w-40 truncate text-xs">{text.main_label}</div>
        </div>
      </SizeTransition>
      <div className="flex items-center">
        <ExpandableTriggerActions expanded={expanded} onDismiss={onDismiss} />
      </div>
    </div>
  );
}
