import { useComputed, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { useAttribute } from "../contexts/attributes";
import { getWidgetSessionScope } from "../utils/widget-session-storage";
import {
  getOrCreateUserId,
  resolveWidgetUserId,
} from "../utils/widget-user-id";

export function useWidgetStorageScope() {
  const agentId = useAttribute("agent-id");
  const signedUrl = useAttribute("signed-url");
  const userIdAttr = useAttribute("user-id");
  const visitorId = useSignal(resolveWidgetUserId(userIdAttr.value));

  useEffect(() => {
    const explicitUserId = userIdAttr.value?.trim();
    if (explicitUserId) {
      visitorId.value = explicitUserId;
      return;
    }

    let cancelled = false;
    void getOrCreateUserId().then(id => {
      if (!cancelled) {
        visitorId.value = id;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userIdAttr.value, visitorId]);

  return useComputed(() =>
    getWidgetSessionScope(agentId.value, signedUrl.value, visitorId.value)
  );
}

export function useWidgetUserId() {
  const userIdAttr = useAttribute("user-id");
  const visitorId = useSignal(resolveWidgetUserId(userIdAttr.value));

  useEffect(() => {
    const explicitUserId = userIdAttr.value?.trim();
    if (explicitUserId) {
      visitorId.value = explicitUserId;
      return;
    }

    let cancelled = false;
    void getOrCreateUserId().then(id => {
      if (!cancelled) {
        visitorId.value = id;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userIdAttr.value, visitorId]);

  return useComputed(() => visitorId.value);
}
