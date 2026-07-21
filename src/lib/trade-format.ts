import type { Currency, Scope } from "./trade-types";

export function formatTradeValue(value: number, currency: Currency): string {
  if (currency === "cny") {
    return value >= 100_000_000
      ? `¥${(value / 100_000_000).toFixed(1)} 亿`
      : `¥${(value / 10_000).toFixed(0)} 万`;
  }

  return value >= 1_000_000_000
    ? `US$${(value / 1_000_000_000).toFixed(2)}B`
    : `US$${(value / 1_000_000).toFixed(1)}M`;
}

export function makeExplorerQuery({
  scope,
  currency,
  tab,
  hs2,
  hs4,
  hs6,
  country,
  q,
}: {
  scope: Scope;
  currency: Currency;
  tab?: "products" | "countries" | "matrix";
  hs2?: string;
  hs4?: string;
  hs6?: string;
  country?: string;
  q?: string;
}): string {
  const params = new URLSearchParams({ scope, currency });
  if (tab && tab !== "products") params.set("tab", tab);
  if (hs2) params.set("hs2", hs2);
  if (hs4) params.set("hs4", hs4);
  if (hs6) params.set("hs6", hs6);
  if (country) params.set("country", country);
  if (q?.trim()) params.set("q", q.trim());
  return `?${params.toString()}`;
}

export function marketDataKey(scope: Scope): string {
  return scope === "usa" ? "nausa" : scope;
}
