import { describe, expect, it } from "vitest";
import { formatTradeValue, makeExplorerQuery } from "../src/lib/trade-format";

describe("browser-safe trade helpers", () => {
  it("formats currency without relying on the server data loader", () => {
    expect(formatTradeValue(120_000_000, "cny")).toBe("¥1.2 亿");
    expect(formatTradeValue(1_200_000_000, "usd")).toBe("US$1.20B");
  });

  it("builds shareable client-side query parameters with tab and country", () => {
    expect(makeExplorerQuery({ scope: "global", currency: "cny", hs2: "20" })).toBe(
      "?scope=global&currency=cny&hs2=20",
    );
  });

  it("includes tab=matrix when set", () => {
    expect(makeExplorerQuery({ scope: "global", currency: "cny", tab: "matrix" })).toBe(
      "?scope=global&currency=cny&tab=matrix",
    );
  });

  it("includes country parameter when set", () => {
    expect(makeExplorerQuery({ scope: "global", currency: "usd", tab: "countries", country: "392" })).toBe(
      "?scope=global&currency=usd&tab=countries&country=392",
    );
  });
});