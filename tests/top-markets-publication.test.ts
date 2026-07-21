import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Market = { scope: string; data_key: string; name: string; rank: number };

const dataPath = (...parts: string[]) => join(process.cwd(), "public", "data", ...parts);

describe("TOP20 destination publication", () => {
  it("publishes the USA and remaining TOP19 destinations with their own HS4 and HS6 data", () => {
    const manifestPath = dataPath("markets.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { markets: Market[] };
    expect(manifest.markets).toHaveLength(20);
    expect(manifest.markets.some((market) => market.scope === "usa" && market.name === "美国")).toBe(true);
    expect(new Set(manifest.markets.map((market) => market.scope)).size).toBe(20);

    for (const market of manifest.markets) {
      expect(existsSync(dataPath("markets", `${market.data_key}-hs4-2024.json`))).toBe(true);
      expect(existsSync(dataPath("markets", `${market.data_key}-hs6-2024.json`))).toBe(true);
    }
  });
});
