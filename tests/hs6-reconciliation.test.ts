import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Parent = { hs4: string; export_value_usd: number };
type Hs6Record = { hs4: string; export_value_usd: number };

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), "public", "data", name), "utf8")) as T;

describe("HS6 reconciliation", () => {
  for (const scope of ["global", "usa"]) {
    it(`sums every ${scope} HS6 group to its HS4 parent`, () => {
      const hs4 = read<{ groups: { children: Parent[] }[] }>(`${scope}-hs4-2024.json`);
      const hs6 = read<{ records: Hs6Record[] }>(`${scope}-hs6-2024.json`);
      const sums = new Map<string, number>();
      for (const record of hs6.records) sums.set(record.hs4, (sums.get(record.hs4) ?? 0) + record.export_value_usd);

      for (const parent of hs4.groups.flatMap((group) => group.children)) {
        expect(sums.get(parent.hs4)).toBeCloseTo(parent.export_value_usd, 2);
      }
    });
  }
});
