import { Style } from "../styles/Style";
import { AttributesProvider } from "../contexts/attributes";
import { LanguageConfigProvider } from "../contexts/language-config";
import { WidgetConfigProvider } from "../contexts/widget-config";
import { AudioConfigProvider } from "../contexts/audio-config";
import { ServerLocationProvider } from "../contexts/server-location";
import { SessionConfigProvider } from "../contexts/session-config";
import { ConversationProvider } from "../contexts/conversation";
import { ProductCartProvider } from "../contexts/product-cart";
import {
  CartSyncWatcher,
  ShopifyCartProvider,
} from "../contexts/shopify-cart";
import { TextContentsProvider } from "../contexts/text-contents";
import { AvatarConfigProvider } from "../contexts/avatar-config";
import { TermsProvider } from "../contexts/terms";
import { CustomAttributes } from "../types/attributes";
import { Wrapper } from "./Wrapper";
import { SheetContentProvider } from "../contexts/sheet-content";
import { FeedbackProvider } from "../contexts/feedback";
import { ShadowHostProvider } from "../contexts/shadow-host";
import { WidgetSizeProvider } from "../contexts/widget-size";
import { ConversationModeProvider } from "../contexts/conversation-mode";
import { EventBridge } from "./EventBridge";

export function ConvAIWidget(attributes: CustomAttributes) {
  return (
    <ShadowHostProvider>
      <AttributesProvider value={attributes}>
        <ServerLocationProvider>
          <WidgetConfigProvider>
            <WidgetSizeProvider>
              <LanguageConfigProvider>
                <TermsProvider>
                  <SessionConfigProvider>
                    <ConversationProvider>
                      <ShopifyCartProvider>
                        <CartSyncWatcher />
                        <ProductCartProvider>
                        <ConversationModeProvider>
                          <AudioConfigProvider>
                            <TextContentsProvider>
                              <AvatarConfigProvider>
                                <SheetContentProvider>
                                  <FeedbackProvider>
                                    <Style />
                                    <EventBridge>
                                      <Wrapper />
                                    </EventBridge>
                                  </FeedbackProvider>
                                </SheetContentProvider>
                              </AvatarConfigProvider>
                            </TextContentsProvider>
                          </AudioConfigProvider>
                        </ConversationModeProvider>
                      </ProductCartProvider>
                      </ShopifyCartProvider>
                    </ConversationProvider>
                  </SessionConfigProvider>
                </TermsProvider>
              </LanguageConfigProvider>
            </WidgetSizeProvider>
          </WidgetConfigProvider>
        </ServerLocationProvider>
      </AttributesProvider>
    </ShadowHostProvider>
  );
}
