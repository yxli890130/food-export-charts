import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Hs6Record = {
  hs2: string;
  hs4: string;
  hs6: string;
  name_cn: string;
  export_value_usd: number;
  export_value_cny: number;
};

const dataFile = (name: string) => join(process.cwd(), "public", "data", name);

describe("published HS6 trade data", () => {
  for (const scope of ["global", "usa"]) {
    it(`publishes concrete HS6 food records for ${scope}`, () => {
      const file = dataFile(`${scope}-hs6-2024.json`);
      expect(existsSync(file)).toBe(true);

      const payload = JSON.parse(readFileSync(file, "utf8")) as { records: Hs6Record[] };
      expect(payload.records.length).toBeGreaterThan(0);
      expect(new Set(payload.records.map((record) => `${record.hs6}:${record.hs4}`)).size).toBe(payload.records.length);
      expect(payload.records.every((record) => /^\d{6}$/.test(record.hs6) && record.name_cn.length > 0)).toBe(true);
      expect(payload.records.every((record) => record.export_value_usd > 0 && record.export_value_cny > 0)).toBe(true);
    });
  }
});
