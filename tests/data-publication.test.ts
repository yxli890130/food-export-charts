import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const publicData = (name: string) => join(process.cwd(), "public", "data", name);

describe("published trade data", () => {
  it("publishes the global HS4 dataset for browser use", () => {
    expect(existsSync(publicData("global-hs4-2024.json"))).toBe(true);
  });

  it("publishes the China-to-US HS4 dataset for browser use", () => {
    expect(existsSync(publicData("usa-hs4-2024.json"))).toBe(true);
  });
});
