import { HTMLAttributes } from "preact/compat";
import { clsx } from "clsx";
import { Avatar } from "./Avatar";

interface ExpandButtonProps extends HTMLAttributes<HTMLButtonElement> {
  onExpand?: () => void;
}

export function ExpandButton({
  className,
  onExpand,
  ...rest
}: ExpandButtonProps) {
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onExpand) {
      onExpand();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={clsx(
        "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95",
        className
      )}
      aria-label="Open chat"
      {...rest}
    >
      <Avatar size="xs" className="h-8 w-8" />
    </button>
  );
}
