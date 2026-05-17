import { ReadonlySignal, useComputed } from "@preact/signals";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { InOutTransition } from "../components/InOutTransition";
import { useConversation } from "../contexts/conversation";
import { useTextContents } from "../contexts/text-contents";
import { SheetLanguageSelect } from "./SheetLanguageSelect";
import { useWidgetSize } from "../contexts/widget-size";
import { ConversationModeToggleButton } from "./ConversationModeToggleButton";
import { BrandIcon } from "./BrandIcon";
import { StatusLabel } from "./StatusLabel";

interface SheetHeaderProps {
  showBackButton: boolean;
  onBackClick?: () => void;
  onDismiss?: () => void;
  showStatusLabel: ReadonlySignal<boolean>;
  showLanguageSelector: ReadonlySignal<boolean>;
  showConversationModeToggle: ReadonlySignal<boolean>;
  showExpandButton: ReadonlySignal<boolean>;
}

export function SheetHeader({
  showBackButton,
  onBackClick,
  onDismiss,
  showStatusLabel,
  showLanguageSelector,
  showConversationModeToggle,
  showExpandButton,
}: SheetHeaderProps) {
  const text = useTextContents();
  const { toggleSize, variant } = useWidgetSize();
  const { transcript, conversationIndex } = useConversation();

  return (
    <div className="sheet-header-on-accent w-full relative shrink-0 z-10 border-b border-base-border/70 bg-transparent">
      <div className="h-16 absolute top-0 w-full bg-transparent" />
      <div className="h-4 absolute top-16 w-full bg-gradient-to-b from-base to-transparent backdrop-blur-[1px] [mask-image:linear-gradient(to_bottom,black,transparent)] shadow-scroll-fade-bottom" />
      <div className="relative flex min-h-16 items-start justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 pe-20">
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
          <BrandIcon className="h-7 w-7 shadow-sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-base-primary">
              Conversales AI
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
          <InOutTransition active={showConversationModeToggle}>
            <ConversationModeToggleButton
              variant="ghost"
              className="h-8 w-8 transition-opacity data-hidden:opacity-0"
            />
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
