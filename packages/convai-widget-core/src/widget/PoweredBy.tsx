import { useWidgetConfig } from "../contexts/widget-config";
import { clsx } from "clsx";
import { BrandIcon } from "./BrandIcon";

interface PoweredByProps {
  inline?: boolean;
}

export function PoweredBy({ inline = false }: PoweredByProps) {
  const config = useWidgetConfig();

  if (config.value.disable_banner) {
    return null;
  }

  return (
    <p
      className={clsx(
        "pointer-events-auto flex items-center gap-1.5 text-[11px] font-medium text-base-subtle",
        inline
          ? "justify-center px-2 pt-1"
          : clsx(
              "rounded-full bg-base px-3 py-2 shadow-sm ring-1 ring-base-border z-10",
              config.value.placement.startsWith("top")
                ? "-translate-y-[calc(var(--el-overlay-padding))]"
                : "translate-y-[calc(var(--el-overlay-padding))]"
            )
      )}
    >
      <span>Powered by</span>
      <BrandIcon className="h-4 w-4" />
      <a
        href={config.value.override_link || "https://conversales.in"}
        className="text-base-primary transition-opacity hover:opacity-70 focus-visible:outline-hidden"
        rel="noreferrer"
        target="_blank"
      >
        Conversales AI
      </a>
    </p>
  );
}
