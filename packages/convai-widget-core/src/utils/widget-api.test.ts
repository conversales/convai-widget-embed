import { afterEach, describe, expect, it, vi } from "vitest";
import { getWidgetApiBaseUrl } from "./widget-api";

describe("getWidgetApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the production widget API", () => {
    vi.stubEnv("VITE_WIDGET_API_URL", "");
    expect(getWidgetApiBaseUrl()).toBe("https://api.conversales.in");
  });

  it("uses VITE_WIDGET_API_URL when explicitly set", () => {
    vi.stubEnv("VITE_WIDGET_API_URL", "http://localhost:8082/");
    expect(getWidgetApiBaseUrl()).toBe("http://localhost:8082");
  });
});
