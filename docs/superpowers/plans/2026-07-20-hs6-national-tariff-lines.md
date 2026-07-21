# HS6 国家官方细分品目 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在美国和日本的 2024 目的地视图中，将 HS6 下钻至可核对的官方细分品目。

**Architecture:** 构建脚本从 USITC 的 2024 HTS Revision 10 CSV 和日本海关 2024-01-01 英文进口统计目录生成两份静态 JSON。USITC 原始下载对无浏览器请求返回 403 时，脚本通过 Jina Reader 获取同一原始 CSV，但静态数据仍保留 USITC 原始来源链接与获取限制。客户端仅在已选择 HS6 时按需读取对应目的地的数据文件；URL 保存合法的 `hs6` 选择。产品验证卡从 HS6 层移除。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Playwright、Python requests + BeautifulSoup。

---

## Files and responsibilities

- Create: `scripts/build-tariff-lines.py` — 下载、解析和校验两份官方 2024 目录。
- Create: `public/data/tariff-lines/usa-2024.json` — 美国 HTS10 静态目录。
- Create: `public/data/tariff-lines/jpn-2024.json` — 日本 9 位进口统计目录。
- Create: `tests/tariff-line-publication.test.ts` — 静态目录完整性校验。
- Modify: `src/lib/trade-types.ts` — 声明官方细分品目数据结构。
- Modify: `src/lib/explorer-state.ts` — 解析和清理 `hs6` URL 参数。
- Modify: `src/lib/trade-format.ts` — 在分享链接中写入 `hs6`。
- Modify: `tests/explorer-state.test.ts` — 状态恢复和非法 HS6 的回归测试。
- Modify: `src/components/explorer.tsx` — 按需读取目录，展示美国/日本目录或待接入提示，移除验证卡。
- Modify: `app/globals.css` — 仅添加目录区块的样式。
- Modify: `e2e/explorer.spec.ts` — 验证日本路径、URL 恢复和全球待接入提示。
- Modify: `package.json` — 增加 `sync:tariff-lines` 命令。
- Modify: `README.md` — 说明目录来源、版本与边界。

没有 `.git` 仓库；不要初始化仓库或创建提交。

### Task 1: 发布两份经校验的官方目录

**Files:**
- Create: `tests/tariff-line-publication.test.ts`
- Create: `scripts/build-tariff-lines.py`
- Create: `public/data/tariff-lines/usa-2024.json`
- Create: `public/data/tariff-lines/jpn-2024.json`
- Modify: `package.json`

- [ ] **Step 1: 写数据发布失败测试**

```ts
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
```

- [ ] **Step 2: 运行测试并确认它因目录不存在而失败**

Run: `npm test -- tests/tariff-line-publication.test.ts`  
Expected: FAIL，`usa-2024.json` 或 `jpn-2024.json` 不存在。

- [ ] **Step 3: 实现最小目录构建脚本**

创建 `scripts/build-tariff-lines.py`，固定两份来源和版本：

```py
USA_SOURCE_URL = "https://www.usitc.gov/sites/default/files/tata/hts/hts_2024_revision_10_csv.csv"
USA_RETRIEVAL_URL = f"https://r.jina.ai/http://{USA_SOURCE_URL.removeprefix('https://')}"
JPN_INDEX = "https://www.customs.go.jp/english/tariff/2024_01_01/index.htm"
JPN_CHAPTER = "https://www.customs.go.jp/english/tariff/2024_01_01/data/e_{chapter}.htm"
CHAPTERS = ("02", "03", "04", "07", "08", "09", "10", "12", "16", "17", "19", "20", "21")
```

脚本必须：

1. 用 `requests.get(..., timeout=180)` 先读取 USITC 原始 CSV；若返回 403，再读取 `USA_RETRIEVAL_URL` 并丢弃 `Markdown Content:\n` 之前的 Jina 元数据。用 `csv.DictReader` 读取 `HTS Number`、`Description`、`Unit of Quantity`，挑出十位数字编码、英文品名且首六位属于 `CHAPTERS` 的叶子统计条目；将点号或空格从编码中移除。
2. 对每个日本章节 URL 用 `BeautifulSoup(response.text, "html.parser")` 提取正文文本行；维护最近一次出现的六位数字作为 HS6 前缀，并将后续三位数字补到该前缀。仅输出九位数字、首六位属于 `CHAPTERS`、且有紧随描述的叶子行；去重时保留第一条完整名称与单位。
3. 通过 `validate(records, width)` 拒绝非数字编码、错误长度、`code[:6] != hs6`、空名称和重复编码。
4. 发布 `usa-2024.json` 与 `jpn-2024.json`，字段为 `countryScope`、`countryName`、`year`、`codeSystem`、`publisher`、`sourceUrl`、`fetchedAt`、`records`；美国发布机构为 `United States International Trade Commission`，日本为 `Japan Customs, Ministry of Finance`。
5. 用 `json.dumps(..., ensure_ascii=False, indent=2)` 写文件，并在成功时打印两个记录数。

在 `package.json` 的 `scripts` 中增加：

```json
"sync:tariff-lines": "python scripts/build-tariff-lines.py"
```

- [ ] **Step 4: 构建静态目录并重新运行数据测试**

Run: `npm run sync:tariff-lines; npm test -- tests/tariff-line-publication.test.ts`  
Expected: PASS，两个数据集均存在、均为 2024、没有重复正式编码。

- [ ] **Step 5: 记录数据边界**

确认两个 JSON 中的 `sourceUrl` 分别保留 USITC 2024 Revision 10 原始 CSV 地址和 Japan Customs 2024-01-01 目录首页；美国 JSON 同时以 `retrievalNote` 记录“USITC 原始地址对自动请求返回 403，构建时通过 Jina Reader 获取同一官方 CSV”。不把目录中的税率字段发布到页面。

### Task 2: 在 URL 中保存合法 HS6 选择

**Files:**
- Modify: `src/lib/trade-types.ts`
- Modify: `src/lib/explorer-state.ts`
- Modify: `src/lib/trade-format.ts`
- Modify: `tests/explorer-state.test.ts`

- [ ] **Step 1: 写 URL 状态失败测试**

追加以下测试：

```ts
it("preserves a six-digit HS6 only beneath its matching HS4", () => {
  expect(resolveExplorerState({ scope: "asjpn", currency: "cny", hs2: "07", hs4: "0712", hs6: "071290" }))
    .toEqual({ scope: "asjpn", currency: "cny", hs2: "07", hs4: "0712", hs6: "071290" });
});

it("drops a missing or mismatched HS6 selection", () => {
  expect(resolveExplorerState({ scope: "usa", currency: "usd", hs2: "07", hs4: "0712", hs6: "090210" }))
    .toEqual({ scope: "usa", currency: "usd", hs2: "07", hs4: "0712", hs6: undefined });
});
```

- [ ] **Step 2: 运行状态测试并确认失败**

Run: `npm test -- tests/explorer-state.test.ts`  
Expected: FAIL，返回对象不包含 `hs6`。

- [ ] **Step 3: 实现状态和查询参数**

将 `ExplorerState` 扩展为 `hs6?: string`。在 `resolveExplorerState` 中仅在 `hs4` 存在、`hs6` 匹配 `/^\d{6}$/` 且 `hs6.startsWith(hs4)` 时保留它。将 `makeExplorerQuery` 的参数扩展为 `hs6?: string`，并在有值时执行 `params.set("hs6", hs6)`。

- [ ] **Step 4: 运行状态和格式化测试**

Run: `npm test -- tests/explorer-state.test.ts tests/trade-format.test.ts`  
Expected: PASS。

### Task 3: 在详情抽屉显示官方目录并移除验证卡

**Files:**
- Modify: `src/lib/trade-types.ts`
- Modify: `src/components/explorer.tsx`
- Modify: `app/globals.css`
- Modify: `e2e/explorer.spec.ts`

- [ ] **Step 1: 写端到端失败测试**

将现有全球详情测试末尾改为确认待接入提示，并新增日本测试：

```ts
await expect(page.getByText("该目的地 2024 官方细分目录尚未接入")).toBeVisible();

test("shows Japanese 2024 national tariff lines beneath HS6", async ({ page }) => {
  await page.goto("/?scope=asjpn&currency=cny&hs2=09&hs4=0902&hs6=090210");
  await expect(page.getByRole("dialog", { name: /HS0902/ })).toBeVisible();
  await expect(page).toHaveURL(/hs6=090210/);
  await expect(page.getByRole("heading", { name: "2024 日本 9 位官方统计品目" })).toBeVisible();
  await expect(page.getByText(/090210/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "产品验证卡" })).toHaveCount(0);
});
```

- [ ] **Step 2: 运行端到端测试并确认失败**

Run: `npm run test:e2e -- e2e/explorer.spec.ts`  
Expected: FAIL，找不到“2024 日本 9 位官方统计品目”。

- [ ] **Step 3: 定义目录类型并加载数据**

在 `src/lib/trade-types.ts` 添加：

```ts
export type TariffLine = { hs6: string; code: string; name: string; unit?: string };
export type TariffLineDataset = {
  countryScope: "usa" | "asjpn";
  countryName: string;
  year: 2024;
  codeSystem: string;
  publisher: string;
  sourceUrl: string;
  fetchedAt: string;
  records: TariffLine[];
};
```

在 `Explorer` 内增加 `tariffDataset`、`tariffStatus` 状态。只有 `scope === "usa" || scope === "asjpn"` 且已选 HS6 时，读取 `/data/tariff-lines/${scope === "usa" ? "usa" : "jpn"}-2024.json`。用 `record.hs6 === selectedHs6.hs6` 过滤和排序结果；取消 effect 时不要更新状态。

- [ ] **Step 4: 绑定 HS6 选择与 URL**

从 `initialState` 解构 `hs6`，将 `selectedHs6Code` 初始化为 `hs6`。`chooseHs6` 改为调用 `go({ hs6: record.hs6 })`；切换市场、HS2 或 HS4 时传入 `hs6: undefined`。当 URL 已选的 HS6 不在当前 HS4 返回的数据中时，使用第一条 HS6 并用 `go({ hs6: first.hs6 })` 纠正地址。

- [ ] **Step 5: 替换 HS6 下方内容**

删除 `productDraft` 状态、`chooseHs6` 中的草稿重置、`validation-card` JSX 和对应输入字段。紧接 HS6 列表渲染：

```tsx
<section className="tariff-lines" aria-live="polite">
  <div className="tariff-lines-heading">
    <div><span>HS6 后官方分类</span><h3>{scope === "usa" ? "2024 美国 HTS10 官方细分品目" : scope === "asjpn" ? "2024 日本 9 位官方统计品目" : "官方细分品目"}</h3></div>
    {tariffStatus === "ready" && <b>{tariffLines.length} 项</b>}
  </div>
  {scope !== "usa" && scope !== "asjpn" && <p>该目的地 2024 官方细分目录尚未接入。</p>}
  {(scope === "usa" || scope === "asjpn") && tariffStatus === "loading" && <p>正在加载 2024 官方细分目录…</p>}
  {(scope === "usa" || scope === "asjpn") && tariffStatus === "error" && <p>官方细分目录加载失败；请重试或打开来源核对。</p>}
  {tariffStatus === "ready" && tariffLines.length === 0 && <p>该 HS6 在已接入的 2024 官方目录中没有可显示的细分记录。</p>}
</section>
```

`ready` 且有记录时，每行展示 `code`、`name`、`unit ?? "未提供计量单位"`；页脚链接使用 `tariffDataset.sourceUrl` 并标注发布机构和 `2024`。`ready` 且无记录时显示无映射提示；`global` 或其他目的地显示“该目的地 2024 官方细分目录尚未接入”。

- [ ] **Step 6: 添加最小样式**

在 `app/globals.css` 复用 `.hs6-section` 的边框与排版层级，新增 `.tariff-lines`、`.tariff-line-row`、`.tariff-source`。每个正式编码使用等宽字体，条目行在窄屏下改为单列；不要修改现有全局色彩或布局规则。

- [ ] **Step 7: 运行端到端测试并确认通过**

Run: `npm run test:e2e -- e2e/explorer.spec.ts`  
Expected: PASS，全球显示待接入，日本 URL 恢复 HS6 并展示 2024 目录，页面没有产品验证卡。

### Task 4: 更新说明并进行全量验证

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-20-hs6-national-tariff-lines-design.md`

- [ ] **Step 1: 更新 README 数据边界**

在“数据边界”中说明：美国使用 USITC 2024 HTS Revision 10，日本使用 Japan Customs 2024-01-01 进口统计目录；两者只提供官方分类，不代表现行税率、准入结论或 SKU。运行步骤增加 `npm run sync:tariff-lines`。

- [ ] **Step 2: 将规格状态改为已实施并写入实际来源快照**

把规格文件状态从“已确认设计，待实施计划”改为“已实施并验证”，记录实际构建日期、两个来源 URL、美国 2024 Revision 10（2024-11-22）和日本 2024-01-01 目录快照。

- [ ] **Step 3: 运行全部验证**

Run: `npm test; npm run test:e2e; npm run build`  
Expected: 全部 Vitest 测试、Playwright 测试和 Next.js 生产构建通过。

- [ ] **Step 4: 进行本地可视化检查**

Run: `npm run dev -- --port 3000`，打开 `http://localhost:3000/?scope=asjpn&currency=cny&hs2=09&hs4=0902&hs6=090210`。确认目录标题、至少一条九位编码、官方来源链接和没有产品验证卡。
