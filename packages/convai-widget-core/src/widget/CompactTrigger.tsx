import { HTMLAttributes } from "preact/compat";
import { clsx } from "clsx";
import { Avatar } from "../components/Avatar";
import { TriggerActions } from "./TriggerActions";
import { ShopifyCartBadge } from "./ShopifyCartBadge";

interface CompactTriggerProps extends HTMLAttributes<HTMLDivElement> {
  onDismiss?: () => void;
}

export function CompactTrigger({
  className,
  onDismiss,
  ...rest
}: CompactTriggerProps) {
  return (
    <div
      className={clsx("rounded-compact-sheet flex min-h-11 items-center gap-1 p-1.5", className)}
      {...rest}
    >
      <div className="relative mx-0.5 shrink-0">
        <Avatar
          size="sm"
          imageClassName="!bg-contain !bg-no-repeat bg-center"
        />
        <ShopifyCartBadge />
      </div>
      <TriggerActions onDismiss={onDismiss} />
    </div>
  );
}
