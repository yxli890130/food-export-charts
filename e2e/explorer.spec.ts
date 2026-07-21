import { expect, test } from "@playwright/test";

test("opens a HS4 detail and preserves it in the URL", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "中国食品出口机会探索" })).toBeVisible();
  await page.getByRole("button", { name: /HS07 食用蔬菜/ }).click();
  await expect(page).toHaveURL(/hs2=07/);
  await page.locator("#ranking").getByRole("button", { name: "HS0712 干制蔬菜", exact: true }).click();

  await expect(page).toHaveURL(/hs2=07&hs4=0712/);
  await expect(page.getByRole("dialog", { name: /HS0712/ })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("definition").filter({ hasText: "中国 → 全球" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "具体 HS6 食品" })).toBeVisible();
  await expect(page.getByRole("button", { name: /HS071290 干杂菜/ })).toBeVisible();
  await expect(page.getByText("该目的地 2024 官方细分目录尚未接入")).toBeVisible();
});

test("switches from the global view to a TOP20 destination", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("combobox", { name: "数据视图" }).selectOption("asjpn");
  await expect(page).toHaveURL(/scope=asjpn/);
  await expect(page.getByText("中国 → 日本", { exact: true })).toBeVisible();
  await expect(page.getByText("HS6 可下钻", { exact: true })).toBeVisible();
});

test("shows Japanese 2024 national tariff lines beneath HS6", async ({ page }) => {
  await page.goto("/?scope=asjpn&currency=cny&hs2=09&hs4=0902&hs6=090210");

  await expect(page.getByRole("dialog", { name: /HS0902/ })).toBeVisible();
  await expect(page).toHaveURL(/hs6=090210/);
  await expect(page.getByRole("heading", { name: "2024 日本 9 位官方统计品目" })).toBeVisible();
  await expect(page.getByText(/090210/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "产品验证卡" })).toHaveCount(0);
});


test("shows U.S. 2024 HTS10 lines beneath HS6", async ({ page }) => {
  await page.goto("/?scope=usa&currency=usd&hs2=09&hs4=0902&hs6=090210");

  await expect(page.getByRole("dialog", { name: /HS0902/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2024 美国 HTS10 官方细分品目" })).toBeVisible();
  await expect(page.getByText(/090210/).first()).toBeVisible();
});

test("explores HS4 destinations from the product view", async ({ page }) => {
  await page.goto("/?scope=global&currency=cny&tab=products");

  await expect(page.getByRole("heading", { name: "按产品看目的国" })).toBeVisible();
  await page.getByRole("button", { name: /HS0712 干制蔬菜/ }).click();
  await expect(page.getByRole("heading", { name: "TOP15 出口目的国" })).toBeVisible();
  await expect(page.getByRole("button", { name: /美国.*亿.*%/ })).toBeVisible();
});

test("searches HS4 products and restores the query from the URL", async ({ page }) => {
  await page.goto("/?scope=global&currency=cny&tab=products&q=%E5%B9%B2%E5%88%B6%E8%94%AC%E8%8F%9C");

  const search = page.getByRole("searchbox", { name: "查找 HS4 产品" });
  await expect(search).toHaveValue("干制蔬菜");
  await expect(page.getByText(/找到 1 个产品/)).toBeVisible();
  await expect(page.getByRole("button", { name: /HS0712 干制蔬菜/ })).toBeVisible();

  await search.fill("HS0712");
  await expect(page).toHaveURL(/q=%E5%B9%B2%E5%88%B6%E8%94%AC%E8%8F%9C/);
  await expect(page.getByText("输入已修改，点击“搜索”或按 Enter 查看结果。")).toBeVisible();
  await expect(page.getByRole("button", { name: /HS0712 干制蔬菜/ })).toBeVisible();

  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page).toHaveURL(/q=HS0712/);
  await expect(page.getByRole("button", { name: /HS0712 干制蔬菜/ })).toBeVisible();

  await search.fill("干制蔬菜");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=%E5%B9%B2%E5%88%B6%E8%94%AC%E8%8F%9C/);

  await page.getByRole("button", { name: "清除产品搜索" }).click();
  await expect(page).not.toHaveURL(/(?:\?|&)q=/);
  await expect(page.getByText(/当前显示 116 个产品/)).toBeVisible();
});

test("explains an empty product search result", async ({ page }) => {
  await page.goto("/?scope=global&currency=cny&tab=products&q=not-a-food-product");

  await expect(page.getByText("当前数据范围内没有匹配产品")).toBeVisible();
  await expect(page.getByText(/检查 HS 编码/)).toBeVisible();
});
test("shows a country's leading HS4 products", async ({ page }) => {
  await page.goto("/?scope=global&currency=cny&tab=countries&country=392");

  await expect(page.getByRole("heading", { name: "按国家看主要产品" })).toBeVisible();
  await expect(page.getByRole("button", { name: /#1 日本/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /HS1604 调制或保藏鱼/ })).toBeVisible();
});

test("renders the product-country matrix with clickable values", async ({ page }) => {
  await page.goto("/?scope=global&currency=cny&tab=matrix");

  await expect(page.getByRole("heading", { name: "产品 × 国家交叉矩阵" })).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.getByRole("button", { name: "日本" })).toBeVisible();
  await expect(page.getByRole("gridcell", { name: /HS0712 干制蔬菜/ })).toBeVisible();
});
