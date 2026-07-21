import { describe, expect, it } from "vitest";
import { resolveExplorerState } from "../src/lib/explorer-state";

describe("explorer URL state", () => {
  it("uses the requested valid market, currency, and HS selection", () => {
    expect(
      resolveExplorerState({ scope: "usa", currency: "usd", hs2: "07", hs4: "0712" }),
    ).toEqual({ scope: "usa", currency: "usd", tab: "products", hs2: "07", hs4: "0712", hs6: undefined, country: undefined });
  });

  it("preserves a published TOP20 destination scope", () => {
    expect(resolveExplorerState({ scope: "asjpn", currency: "cny" })).toEqual({
      scope: "asjpn",
      currency: "cny",
      tab: "products",
      hs2: undefined,
      hs4: undefined,
      hs6: undefined,
      country: undefined,
    });
  });

  it("preserves a six-digit HS6 only beneath its matching HS4", () => {
    expect(resolveExplorerState({ scope: "asjpn", currency: "cny", hs2: "07", hs4: "0712", hs6: "071290" }))
      .toEqual({ scope: "asjpn", currency: "cny", tab: "products", hs2: "07", hs4: "0712", hs6: "071290", country: undefined });
  });

  it("drops a missing or mismatched HS6 selection", () => {
    expect(resolveExplorerState({ scope: "usa", currency: "usd", hs2: "07", hs4: "0712", hs6: "090210" }))
      .toEqual({ scope: "usa", currency: "usd", tab: "products", hs2: "07", hs4: "0712", hs6: undefined, country: undefined });
  });

  it("falls back to the honest default for unsupported values", () => {
    expect(resolveExplorerState({ scope: "worldwide", currency: "eur", hs2: ["07", "08"] })).toEqual({
      scope: "global",
      currency: "cny",
      tab: "products",
      hs2: undefined,
      hs4: undefined,
      hs6: undefined,
      country: undefined,
    });
  });
});