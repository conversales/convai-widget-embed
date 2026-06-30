import { clsx } from "clsx";
import { SizeTransition } from "../components/SizeTransition";
import { Avatar } from "../components/Avatar";
import { ExpandableTriggerActions } from "./ExpandableTriggerActions";
import { ExpandableProps } from "./Trigger";

interface CompactExpandableTriggerProps extends ExpandableProps {
  onDismiss?: () => void;
}

export function CompactExpandableTrigger({
  expanded,
  className,
  onDismiss,
  ...rest
}: CompactExpandableTriggerProps) {
  return (
    <div
      className={clsx(
        expanded.value
          ? "flex items-center justify-center rounded-full p-0"
          : "rounded-compact-sheet flex min-h-11 items-center gap-0.5 p-1.5",
        className
      )}
      {...rest}
    >
      <SizeTransition visible={!expanded.value} className="shrink-0 p-0.5">
        <Avatar
          size="sm"
          imageClassName="!bg-contain !bg-no-repeat bg-center"
        />
      </SizeTransition>
      <div className="flex shrink-0 items-center">
        <ExpandableTriggerActions expanded={expanded} onDismiss={onDismiss} />
      </div>
    </div>
  );
}
