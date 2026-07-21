import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type TariffLineDataset = {
  countryScope: "usa" | "asjpn";
  year: number;
  codeSystem: string;
  publisher: string;
  sourceUrl: string;
  fetchedAt: string;
  records: Array<{ hs6: string; code: string; name: string; unit?: string }>;
};

const pathFor = (name: string) => join(process.cwd(), "public", "data", "tariff-lines", name);

describe("published 2024 national tariff lines", () => {
  for (const [file, scope, width] of [["usa-2024.json", "usa", 10], ["jpn-2024.json", "asjpn", 9]] as const) {
    it(`publishes valid ${scope} tariff lines`, () => {
      expect(existsSync(pathFor(file))).toBe(true);
      const data = JSON.parse(readFileSync(pathFor(file), "utf8")) as TariffLineDataset;
      expect(data.countryScope).toBe(scope);
      expect(data.year).toBe(2024);
      expect(data.publisher.length).toBeGreaterThan(0);
      expect(data.sourceUrl).toMatch(/^https:\/\//);
      expect(data.records.length).toBeGreaterThan(0);
      expect(new Set(data.records.map((record) => record.code)).size).toBe(data.records.length);
      expect(data.records.every((record) => /^\d{6}$/.test(record.hs6) && new RegExp(`^\\d{${width}}$`).test(record.code) && record.code.startsWith(record.hs6) && record.name.length > 0)).toBe(true);
    });
  }
});
