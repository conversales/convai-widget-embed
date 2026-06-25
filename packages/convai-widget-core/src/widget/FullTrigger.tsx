import { HTMLAttributes } from "preact/compat";
import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import { clsx } from "clsx";
import { Avatar } from "../components/Avatar";
import { InOutTransition } from "../components/InOutTransition";
import { TriggerActions } from "./TriggerActions";
import { StatusLabel } from "./StatusLabel";

interface FullTriggerProps extends HTMLAttributes<HTMLDivElement> {
  onDismiss?: () => void;
}

export function FullTrigger({
  className,
  onDismiss,
  ...rest
}: FullTriggerProps) {
  const { isDisconnected } = useConversation();
  const text = useTextContents();

  return (
    <div
      className={clsx("flex min-h-11 flex-col gap-1 rounded-sheet p-1.5", className)}
      {...rest}
    >
      <div className="flex min-w-0 items-center gap-1.5 p-0.5">
        <Avatar
          size="sm"
          imageClassName="!bg-contain !bg-no-repeat bg-center"
        />
        <div className="relative max-w-40 truncate text-xs">
          <span
            className={clsx(
              "block transition-[transform,opacity] duration-200",
              !isDisconnected.value && "opacity-0 scale-90"
            )}
          >
            {text.main_label}
          </span>
          <InOutTransition active={!isDisconnected.value}>
            <StatusLabel className="absolute top-1/2 -translate-y-1/2 transition-[transform,opacity] duration-200 data-hidden:opacity-0 data-hidden:scale-90" />
          </InOutTransition>
        </div>
      </div>
      <div className="flex items-center">
        <TriggerActions onDismiss={onDismiss} />
      </div>
    </div>
  );
}
