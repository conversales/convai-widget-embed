import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export const MOBILE_VIEWPORT_MAX_WIDTH = 768;
export const MOBILE_VIEWPORT_MEDIA_QUERY = `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH}px)`;

function readIsMobileViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.innerWidth <= MOBILE_VIEWPORT_MAX_WIDTH ||
    window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY).matches
  );
}

export function useIsMobileViewport() {
  const isMobile = useSignal(readIsMobileViewport());

  useEffect(() => {
    const update = () => {
      isMobile.value = readIsMobileViewport();
    };

    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY);
    update();
    window.addEventListener("resize", update, { passive: true });
    mediaQuery.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      mediaQuery.removeEventListener("change", update);
    };
  }, []);

  return isMobile;
}
