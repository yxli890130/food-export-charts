import type { Currency, Scope } from "./trade-types";

type QueryValue = string | string[] | undefined;

export type Tab = "products" | "countries" | "matrix";

export type ExplorerState = {
  scope: Scope;
  currency: Currency;
  tab: Tab;
  hs2?: string;
  hs4?: string;
  hs6?: string;
  country?: string;
};

const first = (value: QueryValue): string | undefined =>
  typeof value === "string" ? value : undefined;

const VALID_TABS: Tab[] = ["products", "countries", "matrix"];

export function resolveExplorerState(query: Record<string, QueryValue>): ExplorerState {
  const requestedScope = first(query.scope);
  const scope = requestedScope === "usa" || requestedScope === "global" || /^[a-z]{5}$/.test(requestedScope ?? "")
    ? requestedScope
    : "global";
  const currency = first(query.currency) === "usd" ? "usd" : "cny";
  const hs2 = first(query.hs2)?.match(/^\d{2}$/)?.[0];
  const hs4 = hs2 ? first(query.hs4)?.match(/^\d{4}$/)?.[0] : undefined;
  const requestedHs6 = first(query.hs6);
  const hs6 = hs4 && requestedHs6?.match(/^\d{6}$/)?.[0]?.startsWith(hs4) ? requestedHs6 : undefined;
  const tab = first(query.tab) as Tab;
  const country = first(query.country)?.match(/^\d{1,5}$/)?.[0];

  return {
    scope: scope ?? "global",
    currency,
    tab: VALID_TABS.includes(tab) ? tab : "products",
    hs2,
    hs4,
    hs6,
    country,
  };
}