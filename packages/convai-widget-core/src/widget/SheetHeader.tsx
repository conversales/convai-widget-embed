import { ReadonlySignal } from "@preact/signals";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { InOutTransition } from "../components/InOutTransition";
import { useTextContents } from "../contexts/text-contents";
import { SheetLanguageSelect } from "./SheetLanguageSelect";
import { StatusLabel } from "./StatusLabel";
import { Avatar } from "../components/Avatar";
import { useAttribute } from "../contexts/attributes";

interface SheetHeaderProps {
  showBackButton: boolean;
  onBackClick?: () => void;
  onDismiss?: () => void;
  showStatusLabel: ReadonlySignal<boolean>;
  showLanguageSelector: ReadonlySignal<boolean>;
  showExpandButton: ReadonlySignal<boolean>;
}

export function SheetHeader({
  showBackButton,
  onBackClick,
  onDismiss,
  showStatusLabel,
  showLanguageSelector,
  showExpandButton,
}: SheetHeaderProps) {
  const text = useTextContents();
  const name = useAttribute("name");
  const agentName = useAttribute("agent-name");
  const displayName = agentName.value?.trim() || name.value?.trim() || "Conversales AI";

  return (
    <div className="sheet-header-on-accent w-full relative shrink-0 z-10 border-b border-base-border/70 bg-transparent">
      <div className="h-[72px] absolute top-0 w-full bg-transparent" />
      <div className="h-4 absolute top-[72px] w-full bg-gradient-to-b from-base to-transparent backdrop-blur-[1px] [mask-image:linear-gradient(to_bottom,black,transparent)] shadow-scroll-fade-bottom" />
      <div className="relative flex min-h-[72px] items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5 pe-20">
          {showBackButton && (
            <Button
              variant="ghost"
              onClick={onBackClick}
              aria-label={text.go_back}
              className="h-8 w-8 shrink-0"
            >
              <Icon name="chevron-up" className="-rotate-90" size="xs" />
            </Button>
          )}
          <div
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full p-[1px]"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.96)",
              border: "1px solid rgba(255, 255, 255, 0.88)",
              backgroundClip: "padding-box",
              boxShadow:
                "0 0 0 2px color-mix(in srgb, var(--el-accent) 18%, transparent), 0 0 10px color-mix(in srgb, var(--el-accent) 28%, transparent), 0 1px 3px rgba(15, 23, 42, 0.14)",
            }}
          >
            <Avatar
              size="header"
              imageScale={1.12}
              backgroundColor="#ffffff"
              imageBackgroundColor="#ffffff"
              className="overflow-hidden rounded-full"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-base-primary">
              {displayName}
            </div>
            <InOutTransition active={showStatusLabel}>
              <div className="mt-1 transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:-translate-y-1">
                <StatusLabel className="max-w-fit" />
              </div>
            </InOutTransition>
          </div>
        </div>
        <div className="absolute end-3 top-1/2 flex -translate-y-1/2 flex-row items-center gap-2">
          <InOutTransition active={showLanguageSelector}>
            <div className="transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:-translate-y-4">
              <SheetLanguageSelect />
            </div>
          </InOutTransition>
          <InOutTransition active={!!onDismiss}>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onDismiss?.();
              }}
              className="appearance-none inline-flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent p-0 text-base-primary shadow-none outline-hidden transition-[background-color,opacity] duration-200 data-hidden:opacity-0 hover:bg-base-hover active:bg-base-active"
            >
              <Icon name="x" />
            </button>
          </InOutTransition>
        </div>
      </div>
    </div>
  );
}
