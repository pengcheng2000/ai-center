export type AnalyticsConfig = { scriptUrl: string; websiteId: string };

export function resolveAnalyticsConfig(env: Record<string, unknown>): AnalyticsConfig | null {
  const endpoint = typeof env.VITE_ANALYTICS_ENDPOINT === "string" ? env.VITE_ANALYTICS_ENDPOINT.trim() : "";
  const websiteId = typeof env.VITE_ANALYTICS_WEBSITE_ID === "string" ? env.VITE_ANALYTICS_WEBSITE_ID.trim() : "";
  if (!endpoint || !websiteId || endpoint.includes("%VITE_") || websiteId.includes("%VITE_")) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.pathname = `${url.pathname.replace(/\/$/, "")}/umami`;
    return { scriptUrl: url.toString(), websiteId };
  } catch {
    return null;
  }
}

export function installAnalytics(env: Record<string, unknown>) {
  if (typeof document === "undefined") return;
  const config = resolveAnalyticsConfig(env);
  if (!config || document.querySelector("script[data-platform-analytics]")) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = config.scriptUrl;
  script.dataset.websiteId = config.websiteId;
  script.dataset.platformAnalytics = "true";
  document.head.appendChild(script);
}
