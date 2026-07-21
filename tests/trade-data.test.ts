import { describe, expect, it } from "vitest";
import { formatTradeValue, getTradeDataset, makeExplorerQuery } from "../src/lib/trade-data";

describe("trade-data adapter", () => {
  it("keeps every HS2 total equal to its published HS4 children", () => {
    const dataset = getTradeDataset("global");

    expect(dataset.groups).toHaveLength(13);
    for (const group of dataset.groups) {
      const childTotal = group.children.reduce((total, child) => total + child.export_value_usd, 0);
      expect(group.export_value_usd).toBeCloseTo(childTotal, 2);
    }
  });

  it("labels the US slice and formats the precomputed currency fields", () => {
    const dataset = getTradeDataset("usa");

    expect(dataset.scopeLabel).toBe("中国 → 美国");
    expect(formatTradeValue(dataset.groups[0].export_value_cny, "cny")).toMatch(/^¥/);
    expect(formatTradeValue(dataset.groups[0].export_value_usd, "usd")).toMatch(/^US\$/);
  });

  it("creates a shareable query that preserves the current exploration state", () => {
    expect(makeExplorerQuery({ scope: "usa", currency: "usd", hs2: "07", hs4: "0712" })).toBe(
      "?scope=usa&currency=usd&hs2=07&hs4=0712",
    );
  });
});
