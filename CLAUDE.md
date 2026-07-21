# 中国食品出口机会探索

## 产品目标

把贸易数据转化为可验证的"HS6 统计产品 × 目的国"候选工具。

## 核心原则

- 数据来源：UN Comtrade（中国出口 2024 数据）
- 货币：美元计算，人民币显示（记录汇率来源）
- 阶段：P0→P1→P2→P3→P4

## 关键约束

- 缺失值 ≠ 0，差异必须记录
- API Key 仅从环境变量读取
- 不自动 push 或部署
- 用脚本生成数据，不手改 public/data/

## 完成标准

- 数据含完整元数据（来源、时间、完整性）
- 通过 `npm test`、`npm run test:e2e`、`npm run build`
- 核心路径：HS2→HS4→HS6→国家，以及反向

## 参考

- 完整规则见 `.claude/rules/` 目录
  - `data-standards.md` - 数据口径
  - `project-structure.md` - 目录约定
  - `ux-standards.md` - 交互标准
