import { Button, BaseButtonProps } from "./Button";

interface DismissButtonProps extends Omit<BaseButtonProps, "icon" | "aria-label"> {
  onDismiss?: () => void;
}

export function DismissButton({
  onDismiss,
  className,
  ...rest
}: DismissButtonProps) {
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <Button
      onClick={handleClick}
      variant="ghost"
      icon="x"
      aria-label="Dismiss"
      className={className}
      {...rest}
    />
  );
}
