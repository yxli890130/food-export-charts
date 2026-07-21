# 开发日志

## 2026-07-21 · GitHub 初始归档完成

- 清理并排除本地缓存、开发日志和 Claude Code 规划状态
- 修复 `global-hs4-2024.json` 与 HS6 数据源不一致问题
- 验证：Vitest 21/21、Playwright 7/7、Next.js 生产构建通过
- 创建初始提交：`d3e4593`
- GitHub：<https://github.com/yxli890130/food-export-charts>
- 远程验证：`master` 已与 `origin/master` 同步，工作区干净

## 2026-07-20 · P0 完成

### 目标

将现有 2024 HS2/HS4 浏览页升级为可回答“产品—国家—出口额”的三维探索工具。

### 已完成

#### 数据管道
- 构建脚本 `scripts/build_food_export_data.py`：从 UN Comtrade 批量获取 2024 年中国食品出口数据
- HS6 参考：从 Comtrade 官方 HS reference 文件获取
- 硬性完成门：任一章无 HS4 或无目的地数据时脚本失败
- 数据产出：
  - `public/data/overview/2024.json`：13 个 HS2 总览
  - `public/data/categories/{hs2}.json`：HS4 + HS6 + TOP15 目的国（13 个文件）
  - `public/data/countries/{pc}.json`：198 个目的国维度数据
  - `public/data/matrix/2024.json`：116 HS4 × 198 目的国 × 7,360 个出口单元
  - `public/data/manifest.json`：数据来源和完整性清单

#### 前端三维分析
- 新增 `src/components/analysis.tsx`：三个分析视图
  - **按产品看目的国**（tab=products）：全部 116 个有出口记录的 HS4 按出口额降序展示，展开后显示 TOP15 出口国
  - **按国家看产品**（tab=countries）：展开目的国显示 TOP30 HS4 产品
  - **交叉矩阵**（tab=matrix）：116 HS4 中的前60个 × 15 目的国热力图，单元格可点击
- 新增 `tab`、`country` URL 参数，三视图间可跳转
- 与现有 HS2/HS4 浏览、HS6 下钻和税号细分视图共存

#### 修改的文件
- `src/lib/trade-types.ts`：新增 TradeMatrix 类型
- `src/lib/explorer-state.ts`：新增 tab/country 参数解析
- `src/lib/trade-format.ts`：makeExplorerQuery 支持 tab/country
- `src/components/explorer.tsx`：接入 Analysis 组件
- `app/globals.css`：新增分析视图样式（热力图/产品列表/国家列表）
- `tests/explorer-state.test.ts`：同步新状态字段
- `tests/trade-format.test.ts`：新增 tab/country 查询测试
- `CLAUDE.md`：项目规则
- `.gitignore`：排除 .cache

#### 验证结果
- npm test：21/21 通过
- tsc --noEmit：无错误
- Python 数据测试：5/5 通过
- Next.js build：通过（2026-07-21 复验）
- 矩阵数据：116 HS4 × 198 目的国，7,360 个正出口单元

### 数据差异记录

Comtrade 与 OEC/BACI 在以下章节差异显著：
- HS16：37.8% — 可能与 HS16 的统计范围差异有关
- HS10：19.9%
其余 11 章差异在 0.9%–13.4% 之间，属合理范围

### 失败与降级记录

- OEC HS6 查询返回 0 行 → 改用 UN Comtrade
- HS reference 文件三次下载截断 → 改用 retry + Accept-Encoding: identity
- 终端编码问题 → 设置 PYTHONIOENCODING=utf-8
- HS1207、HS2004 的 HS6 请求网络截断 → 重跑后完成

### 未解决

- 三维分析三个入口（产品/国家/矩阵）均基于 2024 年 UN Comtrade 数据，与现有 OEC/BACI 数据并存的页面可能让用户混淆。下阶段应统一数据源或添加来源标签。
- HS6 下的目的国分布虽然已内置在 `categories/{hs2}.json` 中，但前三视图未直接展示 HS6 级目的国。当前 HS6 只能在查看 HS4 详情后通过侧边栏访问。
- 矩阵热力图颜色基于 `sqrt` 归一化，在大金额范围极端值（如日本 ¥550 亿）下，小金额差异不敏感。

### 下一步

1. 启动 `npm run dev` 并浏览器打开，验证三个分析视图交互
2. 确认 `/explore?tab=matrix` 可直接访问交叉矩阵
3. 确认产品→国家→产品跳转链路
4. 验证 Matrix 数据已在 `public/data/matrix/2024.json` 中

## 2026-07-21 · v1.1 产品搜索与结果反馈

### 已完成

- 在"按产品看目的国"视图增加搜索框，支持 HS4 编码、中英文名称匹配
- 搜索与 HS2 范围、机会初筛条件叠加生效
- 搜索词写入 URL 的 `q` 参数，刷新、复制链接和浏览器前进/后退后恢复
- 本地受控输入，150ms 防抖同步 URL，不触发网络请求
- 结果数量反馈 + 无结果可行动提示
- 安全 `<mark>` 高亮匹配片段（HS 编码、中文名、英文名）
- 一键清除按钮，清除后恢复完整产品列表
- `ExplorerState.q` 扩展：含控制字符移除、80 字符上限、纯空格丢弃
- 响应式 CSS：桌面搜索栏两列布局，移动端单列自适应
- 新增 `docs/superpowers/specs/2026-07-21-hs4-product-search-design.md` 设计规格
- 新增 `docs/superpowers/plans/2026-07-21-hs4-product-search.md` 实施计划
- 同步更新 README 功能概览和制作进度

### 修改的文件
- `src/lib/explorer-state.ts` — `q` 字段与合法化规则
- `src/lib/trade-format.ts` — `makeExplorerQuery` 支持 `q`
- `src/components/explorer.tsx` — 透传 `q`，导航保留
- `src/components/analysis.tsx` — `ProductSearch`、`HighlightedText`、过滤逻辑、空状态
- `app/globals.css` — 搜索组件样式（桌面 + 移动端）
- `tests/explorer-state.test.ts` — 新增 3 项搜索状态测试
- `tests/trade-format.test.ts` — 新增搜索词序列化测试
- `e2e/explorer.spec.ts` — 新增搜索流程和空结果测试
- `README.md` — 更新功能概览和制作进度

### 验证结果
- `npm test`：8 个文件、**25 项**全部通过（+4 搜索相关）
- `npm run test:e2e`：**9 条测试**全部通过（+2 搜索相关）
- `npm run build`：Next.js 16.2.10 生产构建通过
- 浏览器验证：输入 `0712` 定位到 HS0712，高亮标记可见，`q=0712` 在 URL 中
- 搜索与 HS2 范围、机会初筛可叠加
- 无结果显示可行动提示，清除按钮恢复完整列表
- 控制台无错误（仅 favicon 404，不影响功能）

### 下一步

1. 浏览器真实走查产品搜索功能
2. 决定下阶段优先级：矩阵颜色优化、五年趋势数据，或目标国份额/竞争供应国
3. 未经明确指令不继续 push 或部署

