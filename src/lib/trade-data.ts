import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marketDataKey } from "./trade-format";
import type { MarketOption, Scope, TradeDataset, TradeGroup } from "./trade-types";
export { formatTradeValue, makeExplorerQuery } from "./trade-format";
export type { Currency, MarketOption, Scope, TradeChild, TradeDataset, TradeGroup } from "./trade-types";

type RawDataset = Omit<TradeDataset, "scope" | "scopeLabel"> & {
  scope?: Scope;
  scope_label?: string;
  conversion: { rate?: number; source_url?: string };
};

const dataRoot = join(process.cwd(), "public", "data");

export function getMarketOptions(): MarketOption[] {
  const payload = JSON.parse(readFileSync(join(dataRoot, "markets.json"), "utf8")) as { markets: MarketOption[] };
  return payload.markets;
}

export function getTradeDataset(requestedScope: Scope): TradeDataset {
  const scope = requestedScope === "global" ? "global" : requestedScope;
  const file = scope === "global"
    ? join(dataRoot, "global-hs4-2024.json")
    : join(dataRoot, "markets", `${marketDataKey(scope)}-hs4-2024.json`);

  if (!existsSync(file)) return getTradeDataset("global");
  const raw = JSON.parse(readFileSync(file, "utf8")) as RawDataset;
  const label = raw.scope_label ?? (scope === "global" ? "中国 → 全球" : raw.scope ?? scope);

  return { ...raw, scope: raw.scope ?? scope, scopeLabel: label };
}
