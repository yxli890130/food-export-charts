import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "public", "data");

const datasets = [
  ["中国食品出口额_HS4子类数据_2024_人民币版.json", "global-hs4-2024.json"],
  ["中国出口美国食品额_HS4子类数据_2024_人民币版.json", "usa-hs4-2024.json"],
];

await mkdir(outputDir, { recursive: true });
await Promise.all(
  datasets.map(([source, target]) =>
    copyFile(resolve(projectRoot, source), resolve(outputDir, target)),
  ),
);
