import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { useAttribute } from "../contexts/attributes";
import { useConversation } from "../contexts/conversation";
import { useAccountId } from "../contexts/widget-config";
import type { ProductCardData } from "../types/product-card";
import {
  getProductDisplayName,
  isProductDetailsRequestMessage,
} from "../utils/product-display";
import {
  getRequestedProductNameFromDetailMessage,
  isValidProductDetailName,
  parseAgentProductDetailContent,
  resolveProductDetails,
  stripExpandedCardMetadataFromDescription,
} from "../utils/product-details";

export function useProductDetailEnrichment(product: ProductCardData) {
  const agentId = useAttribute("agent-id");
  const accountId = useAccountId();
  const { transcript } = useConversation();
  const loading = useSignal(true);
  const awaitingAgentDetails = useSignal(true);
  const agentDetailMessage = useSignal("");
  const resolvedProduct = useSignal<ProductCardData>(product);
  const recommendations = useSignal<ProductCardData[]>([]);
  const expectedProductName = getProductDisplayName(product.name).toLowerCase();

  const displayFields = useComputed(() => {
    const resolved = resolvedProduct.value;
    const baseName = isValidProductDetailName(product.name, "Product");

    if (!agentDetailMessage.value) {
      return {
        name: isValidProductDetailName(resolved.name, baseName),
        price: resolved.price || product.price,
        description: stripExpandedCardMetadataFromDescription(
          resolved.description || product.description
        ),
        colors: [] as string[],
        category: resolved.category,
        sizes: resolved.sizes,
        imageUrl: product.imageUrl || resolved.imageUrl,
        availability: undefined as string | undefined,
      };
    }

    const parsed = parseAgentProductDetailContent(agentDetailMessage.value, {
      ...resolved,
      name: baseName,
      imageUrl: product.imageUrl || resolved.imageUrl,
    });

    return {
      name: parsed.name,
      price: parsed.price || resolved.price || product.price,
      description: parsed.description ?? resolved.description,
      colors: parsed.colors,
      category: resolved.category,
      sizes: resolved.sizes,
      imageUrl: product.imageUrl || resolved.imageUrl || parsed.imageUrl,
      availability: parsed.availability,
    };
  });

  useEffect(() => {
    const abort = new AbortController();
    loading.value = true;
    resolvedProduct.value = product;
    recommendations.value = [];
    agentDetailMessage.value = "";
    awaitingAgentDetails.value = true;

    const currentAgentId = agentId.value?.trim();
    if (!currentAgentId) {
      loading.value = false;
      awaitingAgentDetails.value = false;
      return () => {
        abort.abort();
      };
    }

    void resolveProductDetails(
      product,
      {
        agentId: currentAgentId,
        accountId: accountId.value.trim() || undefined,
        productId: product.id,
        imageUrl: product.imageUrl,
        productName: product.name,
        productUrl: product.productUrl,
      },
      abort.signal
    ).then(result => {
      if (abort.signal.aborted) {
        return;
      }

      resolvedProduct.value = result.product;
      recommendations.value = result.recommendations;
      loading.value = false;
    });

    return () => {
      abort.abort();
    };
  }, [
    product.id,
    product.name,
    product.imageUrl,
    product.productUrl,
    product.price,
    agentId.value,
    accountId.value,
  ]);

  useSignalEffect(() => {
    transcript.value;
    const entries = transcript.peek();
    let awaitingAgent = false;
    let latestAgentMessage = "";
    let latestStreaming = false;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.type !== "message") {
        continue;
      }

      if (
        entry.role === "user" &&
        isProductDetailsRequestMessage(entry.message)
      ) {
        const requestedName = getRequestedProductNameFromDetailMessage(
          entry.message
        );
        if (
          requestedName &&
          getProductDisplayName(requestedName).toLowerCase() ===
            expectedProductName
        ) {
          awaitingAgent = true;
          latestAgentMessage = "";
          latestStreaming = false;
        }
        continue;
      }

      if (!awaitingAgent) {
        continue;
      }

      if (entry.role === "user") {
        awaitingAgent = false;
        continue;
      }

      if (entry.role !== "agent") {
        continue;
      }

      latestAgentMessage = entry.message;
      latestStreaming = entry.isStreaming === true;
    }

    if (latestAgentMessage) {
      agentDetailMessage.value = latestAgentMessage;
      awaitingAgentDetails.value = latestStreaming;
      return;
    }

    awaitingAgentDetails.value = awaitingAgent;
  });

  return {
    displayFields,
    loading,
    awaitingAgentDetails,
    recommendations,
    resolvedProduct,
  };
}
