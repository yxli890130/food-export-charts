import { describe, expect, it } from "vitest";
import { resolveExplorerState } from "../src/lib/explorer-state";

describe("explorer URL state", () => {
  it("uses the requested valid market, currency, and HS selection", () => {
    expect(
      resolveExplorerState({ scope: "usa", currency: "usd", hs2: "07", hs4: "0712" }),
    ).toEqual({ scope: "usa", currency: "usd", tab: "products", hs2: "07", hs4: "0712", hs6: undefined, country: undefined, q: undefined });
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
      q: undefined,
    });
  });

  it("preserves a six-digit HS6 only beneath its matching HS4", () => {
    expect(resolveExplorerState({ scope: "asjpn", currency: "cny", hs2: "07", hs4: "0712", hs6: "071290" }))
      .toEqual({ scope: "asjpn", currency: "cny", tab: "products", hs2: "07", hs4: "0712", hs6: "071290", country: undefined, q: undefined });
  });

  it("drops a missing or mismatched HS6 selection", () => {
    expect(resolveExplorerState({ scope: "usa", currency: "usd", hs2: "07", hs4: "0712", hs6: "090210" }))
      .toEqual({ scope: "usa", currency: "usd", tab: "products", hs2: "07", hs4: "0712", hs6: undefined, country: undefined, q: undefined });
  });

  it("keeps a trimmed product query and removes control characters", () => {
    expect(resolveExplorerState({ q: "  HS07\n12  " }).q).toBe("HS0712");
  });

  it("limits product queries to 80 characters", () => {
    expect(resolveExplorerState({ q: "蔬".repeat(100) }).q).toHaveLength(80);
  });

  it("drops an empty product query", () => {
    expect(resolveExplorerState({ q: "   " }).q).toBeUndefined();
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
      q: undefined,
    });
  });
});
