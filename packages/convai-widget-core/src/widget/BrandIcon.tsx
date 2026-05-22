import { clsx } from "clsx";
import conversalesLogo from "../assets/conversales-logo.png";

interface BrandIconProps {
  className?: string;
}

export function BrandIcon({ className }: BrandIconProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] bg-white",
        className
      )}
    >
      <img
        src={conversalesLogo}
        alt=""
        className="h-full w-full object-cover"
      />
    </span>
  );
}