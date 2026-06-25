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
      className={clsx("rounded-compact-sheet flex items-center gap-0.5 p-1", className)}
      {...rest}
    >
      <div className="relative mx-0.5">
        <Avatar size="xs" />
        <ShopifyCartBadge />
      </div>
      <TriggerActions onDismiss={onDismiss} />
    </div>
  );
}
