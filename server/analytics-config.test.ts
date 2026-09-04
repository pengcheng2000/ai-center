import { describe, expect, it } from "vitest";
import { resolveAnalyticsConfig } from "../client/src/lib/analytics";

describe("Analytics 可选配置", () => {
  it("缺少配置或仍为模板占位符时不加载", () => {
    expect(resolveAnalyticsConfig({})).toBeNull();
    expect(resolveAnalyticsConfig({ VITE_ANALYTICS_ENDPOINT: "%VITE_ANALYTICS_ENDPOINT%", VITE_ANALYTICS_WEBSITE_ID: "demo" })).toBeNull();
  });

  it("仅接受 HTTP(S) 地址并生成兼容的 umami 脚本地址", () => {
    expect(resolveAnalyticsConfig({ VITE_ANALYTICS_ENDPOINT: "https://analytics.example.com/base/", VITE_ANALYTICS_WEBSITE_ID: "site-1" })).toEqual({ scriptUrl: "https://analytics.example.com/base/umami", websiteId: "site-1" });
    expect(resolveAnalyticsConfig({ VITE_ANALYTICS_ENDPOINT: "javascript:alert(1)", VITE_ANALYTICS_WEBSITE_ID: "site-1" })).toBeNull();
  });
});
