import { ReadonlySignal } from "@preact/signals";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { InOutTransition } from "../components/InOutTransition";
import { useConversation } from "../contexts/conversation";
import { useProductCart } from "../contexts/product-cart";
import { useSheetContent } from "../contexts/sheet-content";
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
}: SheetHeaderProps) {
  const text = useTextContents();
  const name = useAttribute("name");
  const agentName = useAttribute("agent-name");
  const { resetConversation } = useConversation();
  const cart = useProductCart();
  const { currentContent } = useSheetContent();
  const displayName =
    agentName.value?.trim() || name.value?.trim() || "Conversales AI";

  const handleStartNew = () => {
    currentContent.value = "transcript";
    void (async () => {
      await resetConversation();
      cart.resetSession();
    })();
  };

  const handleOpenHistory = () => {
    currentContent.value = "history";
  };

  return (
    <div className="sheet-header-on-accent w-full relative shrink-0 z-10 overflow-visible border-b border-base-border/70 bg-transparent">
      <div className="h-[72px] absolute top-0 w-full bg-transparent" />
      <div className="h-4 absolute top-[72px] w-full bg-gradient-to-b from-base to-transparent backdrop-blur-[1px] [mask-image:linear-gradient(to_bottom,black,transparent)] shadow-scroll-fade-bottom" />
      <div className="relative flex min-h-[72px] items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5 pe-28">
          {showBackButton && (
            <Button
              variant="ghost"
              onClick={onBackClick}
              aria-label={text.go_back.value}
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
        <div className="absolute end-2 top-1/2 flex -translate-y-1/2 flex-row items-center gap-0.5">
          <InOutTransition active={showLanguageSelector}>
            <div className="transition-[opacity,transform] duration-200 data-hidden:opacity-0 data-hidden:-translate-y-4">
              <SheetLanguageSelect />
            </div>
          </InOutTransition>
          <div className="sheet-header-actions flex items-center">
            <button
              type="button"
              className="sheet-header-action"
              aria-label={text.start_new_conversation.value}
              title={text.start_new_conversation.value}
              data-label={text.start_new_conversation.value}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleStartNew();
              }}
            >
              <Icon name="plus" size="sm" />
            </button>
            <button
              type="button"
              className="sheet-header-action"
              aria-label={text.history.value}
              title={text.history.value}
              data-label={text.history.value}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleOpenHistory();
              }}
            >
              <Icon name="history" size="sm" />
            </button>
          </div>
          <InOutTransition active={!!onDismiss}>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onDismiss?.();
              }}
              className="sheet-header-action appearance-none shadow-none outline-hidden"
            >
              <Icon name="x" size="sm" />
            </button>
          </InOutTransition>
        </div>
      </div>
    </div>
  );
}
