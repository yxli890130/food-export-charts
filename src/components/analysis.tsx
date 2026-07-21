"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TradeMatrixDataset, TradeMatrixCountry, TradeMatrixProduct, TradeMatrixCell } from "@/lib/trade-types";
import { formatTradeValue, makeExplorerQuery } from "@/lib/trade-format";
import type { Currency, Scope } from "@/lib/trade-types";
import type { Tab } from "@/lib/explorer-state";

type Props = {
  basePath: "/" | "/explore";
  scope: Scope;
  currency: Currency;
  tab: Tab;
  hs2?: string;
  hs4?: string;
  country?: string;
  q?: string;
  onNavigate: (params: Record<string, string | undefined>) => void;
};

/* ─── Data loading hook ─── */

function useMatrix(): TradeMatrixDataset | null {
  const [data, setData] = useState<TradeMatrixDataset | null>(null);
  useEffect(() => {
    fetch("/data/matrix/2024.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);
  return data;
}

/* ─── 1. Products view: HS4 → TOP15 countries ─── */

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>;
}

function ProductsView({
  matrix, currency, hs2, hs4, q, onNavigate, basePath, scope,
}: {
  matrix: TradeMatrixDataset; currency: Currency; hs2?: string; hs4?: string; q?: string;
  onNavigate: Props["onNavigate"]; basePath: string; scope: Scope;
}) {
  const [minExportUsd, setMinExportUsd] = useState(50_000_000);
  const [minCountries, setMinCountries] = useState(20);
  const [maxTop3Share, setMaxTop3Share] = useState(80);
  const [screeningEnabled, setScreeningEnabled] = useState(false);
  const [query, setQuery] = useState(q ?? "");
  const queryValue = query.trim();
  const normalizedQuery = queryValue.toLocaleLowerCase().replace(/^hs/, "");

  useEffect(() => {
    setQuery(q ?? "");
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = query.trim() || undefined;
      if (nextQuery !== q) onNavigate({ q: nextQuery });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, q, onNavigate]);

  const cellMap = useMemo(() => {
    const map = new Map<string, TradeMatrixCell[]>();
    for (const cell of matrix.cells) {
      const key = cell.hs4;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cell);
    }
    return map;
  }, [matrix]);

  const products = useMemo(() => {
    let list = [...matrix.products];
    if (hs2) list = list.filter((p) => p.hs2 === hs2);
    if (normalizedQuery) {
      list = list.filter((p) => {
        const code = p.hs4.toLocaleLowerCase();
        const chineseName = (p.name_cn ?? "").toLocaleLowerCase();
        const englishName = (p.name_en ?? "").toLocaleLowerCase();
        return code.includes(normalizedQuery)
          || chineseName.includes(normalizedQuery)
          || englishName.includes(normalizedQuery);
      });
    }
    if (screeningEnabled) {
      list = list.filter((p) => {
        const cells = [...(cellMap.get(p.hs4) ?? [])].sort((a, b) => b.export_value_usd - a.export_value_usd);
        const top3 = cells.slice(0, 3).reduce((sum, cell) => sum + cell.export_value_usd, 0);
        const top3Share = p.export_value_usd > 0 ? top3 / p.export_value_usd * 100 : 100;
        return p.export_value_usd >= minExportUsd
          && p.partner_count >= minCountries
          && top3Share <= maxTop3Share;
      });
    }
    return list.sort((a, b) => b.export_value_usd - a.export_value_usd);
  }, [matrix, hs2, normalizedQuery, screeningEnabled, minExportUsd, minCountries, maxTop3Share, cellMap]);

  const countryMap = useMemo(() => {
    const map = new Map<number, TradeMatrixCountry>();
    for (const c of matrix.countries) map.set(c.partner_code, c);
    return map;
  }, [matrix]);

  const valueOf = (v: { export_value_usd: number; export_value_cny: number }) =>
    currency === "cny" ? v.export_value_cny : v.export_value_usd;

  const [expanded, setExpanded] = useState<string | null>(hs4 ?? null);

  return (
    <section>
      <div className="analysis-toolbar">
        <h2>按产品看目的国</h2>
        <p>选择一个 HS4 子类，查看其 TOP15 出口目的国和具体 HS6 产品。</p>
      </div>
      <div className="matrix-tabs">
        <button className="tab-active" onClick={() => {}}>按产品</button>
        <button className="tab-inactive" onClick={() => onNavigate({ tab: "countries" })}>按国家</button>
        <button className="tab-inactive" onClick={() => onNavigate({ tab: "matrix" })}>交叉矩阵</button>
      </div>
      <div className="product-search" role="search">
        <label htmlFor="product-search-input">
          <span>查找 HS4 产品</span>
          <small>输入 HS 编码、中文名或英文名</small>
        </label>
        <div className="product-search-input-wrap">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            id="product-search-input"
            type="search"
            value={query}
            maxLength={80}
            placeholder="例如：0712、干制蔬菜、dried vegetables"
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby="product-search-feedback"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="清除产品搜索">清除</button>
          )}
        </div>
        <p id="product-search-feedback" className="product-search-feedback" aria-live="polite">
          {queryValue
            ? <>找到 <b>{products.length}</b> 个产品{hs2 || screeningEnabled ? "（基于当前筛选范围）" : ""}</>
            : <>当前显示 <b>{products.length}</b> 个产品，按 2024 年出口额从高到低排列</>}
        </p>
      </div>
      <details className="screening-panel" onToggle={(e) => setScreeningEnabled(e.currentTarget.open)}>
        <summary>机会初筛条件 <span className="screening-hint">展开后按条件缩小范围，不是自动评分</span></summary>
        <div className="screening-controls">
          <label>
            <span>最低出口额（美元）</span>
            <select value={minExportUsd} onChange={(e) => setMinExportUsd(Number(e.target.value))}>
              <option value={0}>不限</option>
              <option value={10_000_000}>≥ ¥0.7 亿</option>
              <option value={50_000_000}>≥ ¥3.6 亿</option>
              <option value={100_000_000}>≥ ¥7.1 亿</option>
              <option value={500_000_000}>≥ ¥35.6 亿</option>
              <option value={1_000_000_000}>≥ ¥71.2 亿</option>
            </select>
          </label>
          <label>
            <span>最少覆盖国家数</span>
            <select value={minCountries} onChange={(e) => setMinCountries(Number(e.target.value))}>
              <option value={0}>不限</option>
              <option value={5}>≥ 5 国</option>
              <option value={10}>≥ 10 国</option>
              <option value={20}>≥ 20 国</option>
              <option value={50}>≥ 50 国</option>
              <option value={80}>≥ 80 国</option>
            </select>
          </label>
          <label>
            <span>TOP3 目的国集中度上限</span>
            <select value={maxTop3Share} onChange={(e) => setMaxTop3Share(Number(e.target.value))}>
              <option value={100}>不限</option>
              <option value={90}>≤ 90%</option>
              <option value={80}>≤ 80%</option>
              <option value={60}>≤ 60%</option>
              <option value={40}>≤ 40%</option>
            </select>
          </label>
        </div>
        <p className="screening-note">筛选基于 2024 年 UN Comtrade 数据，用于缩小研究范围，<b>不是市场机会结论</b>。集中度越低表示出口市场越分散。</p>
      </details>

      <div className="product-list">
        {products.length === 0 && (
          <div className="product-search-empty" role="status">
            <b>当前数据范围内没有匹配产品</b>
            <p>请检查 HS 编码，尝试更短的关键词，或清除产品搜索和机会初筛条件。</p>
            <button type="button" onClick={() => setQuery("")}>清除产品搜索</button>
          </div>
        )}
        {products.map((p) => {
          const cells = cellMap.get(p.hs4) ?? [];
          const top15 = cells
            .filter((c) => c.export_value_usd > 0)
            .sort((a, b) => b.export_value_usd - a.export_value_usd)
            .slice(0, 15);
          const open = expanded === p.hs4;
          return (
            <article key={p.hs4} className={`product-card ${open ? "is-open" : ""}`}>
              <button
                className="product-card-header"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : p.hs4)}
              >
                <b>HS<HighlightedText text={p.hs4} query={normalizedQuery} /></b>
                <span className="product-name"><HighlightedText text={p.name_cn || p.name_en} query={queryValue} /></span>
                <span className="product-value">{formatTradeValue(valueOf(p), currency)}</span>
                <span className="partner-count">{p.partner_count} 国</span>
                <span className={`chevron ${open ? "open" : ""}`} aria-hidden="true">▸</span>
              </button>
              {open && (
                <div className="product-detail">
                  <div className="country-list">
                    <h4>TOP15 出口目的国</h4>
                    {top15.map((cell) => {
                      const country = countryMap.get(cell.partner_code);
                      const share = cell.export_value_usd / p.export_value_usd * 100;
                      return (
                        <button
                          key={`${cell.hs4}-${cell.partner_code}`}
                          className="country-row"
                          onClick={() => onNavigate({ tab: "countries", country: String(cell.partner_code) })}
                        >
                          <span className="country-name">{country?.partner_name ?? `CN${cell.partner_code}`}</span>
                          <span className="bar-track">
                            <i style={{ width: `${Math.min(share, 100)}%` }} />
                          </span>
                          <strong>{formatTradeValue(valueOf(cell), currency)}</strong>
                          <small>{share.toFixed(1)}%</small>
                        </button>
                      );
                    })}
                    {top15.length === 0 && <p className="empty-note">无可用的目的国数据。</p>}
                  </div>
                  <a className="detail-link" href={`${basePath}${makeExplorerQuery({ scope, currency, hs2: p.hs2, hs4: p.hs4 })}`}>
                    查看 HS4 完整详情 →
                  </a>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ─── 2. Countries view: country → TOP HS4 products ─── */

function CountriesView({
  matrix, currency, scope, country, onNavigate, basePath,
}: {
  matrix: TradeMatrixDataset; currency: Currency; scope: Scope; country?: string;
  onNavigate: Props["onNavigate"]; basePath: string;
}) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(country ?? null);
  const valueOf = (v: { export_value_usd: number; export_value_cny: number }) =>
    currency === "cny" ? v.export_value_cny : v.export_value_usd;
  const productMap = useMemo(() => {
    const map = new Map<string, TradeMatrixProduct>();
    for (const p of matrix.products) map.set(p.hs4, p);
    return map;
  }, [matrix]);

  const countryProducts = useMemo(() => {
    const map = new Map<number, { product: TradeMatrixProduct; cell: TradeMatrixCell }[]>();
    for (const cell of matrix.cells) {
      if (cell.export_value_usd <= 0) continue;
      const product = productMap.get(cell.hs4);
      if (!product) continue;
      if (!map.has(cell.partner_code)) map.set(cell.partner_code, []);
      map.get(cell.partner_code)!.push({ product, cell });
    }
    for (const [, list] of map) {
      list.sort((a, b) => b.cell.export_value_usd - a.cell.export_value_usd);
    }
    return map;
  }, [matrix, productMap]);

  const topCountries = useMemo(
    () => matrix.countries
      .filter((c) => c.export_value_usd > 0)
      .sort((a, b) => b.export_value_usd - a.export_value_usd)
      .slice(0, 50),
    [matrix],
  );

  const filtered = selectedCountry
    ? topCountries.filter((c) => String(c.partner_code) === selectedCountry)
    : topCountries;

  return (
    <section>
      <div className="analysis-toolbar">
        <h2>按国家看主要产品</h2>
        <p>选择一个目的国，查看中国向该国出口的主要 HS4 产品。</p>
      </div>
      <div className="matrix-tabs">
        <button className="tab-inactive" onClick={() => onNavigate({ tab: "products" })}>按产品</button>
        <button className="tab-active" onClick={() => {}}>按国家</button>
        <button className="tab-inactive" onClick={() => onNavigate({ tab: "matrix" })}>交叉矩阵</button>
      </div>

      <div className="country-list-view">
        {filtered.map((c) => {
          const products = countryProducts.get(c.partner_code) ?? [];
          const topProducts = products.slice(0, 30);
          const open = selectedCountry === String(c.partner_code);
          return (
            <article key={c.partner_code} className={`country-card ${open ? "is-open" : ""}`}>
              <button
                className="country-card-header"
                onClick={() => setSelectedCountry(open ? null : String(c.partner_code))}
                aria-expanded={open}
              >
                <b className="country-rank">#{c.partner_code > 0 ? topCountries.indexOf(c) + 1 : "-"}</b>
                <span className="country-name">{c.partner_name}</span>
                <span className="country-value">{formatTradeValue(valueOf(c), currency)}</span>
                <span className={`chevron ${open ? "open" : ""}`} aria-hidden="true">▸</span>
              </button>
              {open && (
                <div className="country-detail">
                  <div className="country-products">
                    {topProducts.map(({ product, cell }) => {
                      const share = cell.export_value_usd / c.export_value_usd * 100;
                      return (
                        <button
                          key={cell.hs4}
                          className="product-row"
                          onClick={() => onNavigate({ tab: "products", hs2: product.hs2, hs4: product.hs4 })}
                        >
                          <span className="product-name">HS{cell.hs4} {product.name_cn || product.name_en}</span>
                          <span className="bar-track">
                            <i style={{ width: `${Math.min(share, 100)}%` }} />
                          </span>
                          <strong>{formatTradeValue(valueOf(cell), currency)}</strong>
                          <small>{share.toFixed(1)}%</small>
                        </button>
                      );
                    })}
                    {topProducts.length === 0 && <p className="empty-note">该国家无 HS4 级出口记录。</p>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ─── 3. Matrix view: HS4 × country heatmap ─── */

function MatrixView({
  matrix, currency, hs2, country, onNavigate, basePath, scope,
}: {
  matrix: TradeMatrixDataset; currency: Currency; hs2?: string; country?: string;
  onNavigate: Props["onNavigate"]; basePath: string; scope: Scope;
}) {
  const valueOf = (v: { export_value_usd: number; export_value_cny: number }) =>
    currency === "cny" ? v.export_value_cny : v.export_value_usd;

  // Filter to top 15 countries and relevant products
  const topCountries = useMemo(
    () => matrix.countries
      .filter((c) => c.export_value_usd > 0)
      .sort((a, b) => b.export_value_usd - a.export_value_usd)
      .slice(0, 15),
    [matrix],
  );
  const countryCodes = useMemo(() => new Set(topCountries.map((c) => c.partner_code)), [topCountries]);

  const products = useMemo(() => {
    let list = matrix.products;
    if (hs2) list = list.filter((p) => p.hs2 === hs2);
    if (country) {
      const pc = parseInt(country, 10);
      list = list.filter((p) =>
        matrix.cells.some((c) => c.hs4 === p.hs4 && c.partner_code === pc && c.export_value_usd > 0),
      );
    }
    return list.sort((a, b) => b.export_value_usd - a.export_value_usd).slice(0, 60);
  }, [matrix, hs2, country]);

  // Build cell map: hs4 → partner_code → value
  const cellMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const cell of matrix.cells) {
      if (!countryCodes.has(cell.partner_code) && cell.partner_code !== parseInt(country ?? "0", 10)) continue;
      if (cell.export_value_usd <= 0) continue;
      if (!map.has(cell.hs4)) map.set(cell.hs4, new Map());
      map.get(cell.hs4)!.set(cell.partner_code, cell.export_value_usd);
    }
    return map;
  }, [matrix, countryCodes, country]);

  // Find global max for color normalization
  const globalMax = useMemo(() => {
    let max = 0;
    for (const [hs4, pmap] of cellMap) {
      for (const value of pmap.values()) {
        if (value > max) max = value;
      }
    }
    return max;
  }, [cellMap]);

  const pct = (value: number) => Math.round(Math.sqrt(value / globalMax) * 100);

  return (
    <section>
      <div className="analysis-toolbar">
        <h2>{country ? `${topCountries.find((c) => String(c.partner_code) === country)?.partner_name ?? country}  × 产品矩阵` : "产品 × 国家交叉矩阵"}</h2>
        <p>颜色深浅表示出口额。点击单元格查看产品—国家组合。</p>
      </div>
      <div className="matrix-tabs">
        <button className="tab-inactive" onClick={() => onNavigate({ tab: "products" })}>按产品</button>
        <button className="tab-inactive" onClick={() => onNavigate({ tab: "countries" })}>按国家</button>
        <button className="tab-active" onClick={() => {}}>交叉矩阵</button>
      </div>

      <div className="matrix-scroll">
        <table className="matrix-table" role="grid">
          <thead>
            <tr>
              <th className="matrix-corner">产品 → 国家 ↓</th>
              {topCountries.map((c) => (
                <th key={c.partner_code} className="matrix-country-col">
                  <button
                    className="matrix-col-header"
                    onClick={() => onNavigate({ tab: "countries", country: String(c.partner_code) })}
                    title={c.partner_name}
                  >
                    {c.partner_name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const pmap = cellMap.get(p.hs4);
              return (
                <tr key={p.hs4}>
                  <td className="matrix-product-row">
                    <span className="matrix-product-code">HS{p.hs4}</span>
                    <span className="matrix-product-name">{p.name_cn || p.name_en}</span>
                  </td>
                  {topCountries.map((c) => {
                    const value = pmap?.get(c.partner_code) ?? 0;
                    const intensity = value > 0 ? pct(value) : 0;
                    return (
                      <td key={c.partner_code} className="matrix-cell">
                        {value > 0 ? (
                          <button
                            className="matrix-cell-btn"
                            style={{
                              backgroundColor: `var(--matrix-${Math.min(Math.floor(intensity / 20) * 20, 100)})`,
                              opacity: intensity > 0 ? 1 : 0.1,
                            }}
                            onClick={() => onNavigate({ tab: "products", hs2: p.hs2, hs4: p.hs4 })}
                            title={`${c.partner_name} · HS${p.hs4} ${p.name_cn || p.name_en}`}
                          >
                            <span className="matrix-cell-value">{formatTradeValue(currency === "cny" ? value * 7.121679 : value, currency)}</span>
                          </button>
                        ) : (
                          <span className="matrix-empty">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!country && (
        <div className="matrix-note">
          <p>显示 TOP15 目的国 × 前 60 个 HS4 产品。矩阵中每个单元格是可点击的，点击后跳转至产品详情。</p>
        </div>
      )}
    </section>
  );
}

/* ─── Main Analysis component ─── */

export function Analysis({
  basePath, scope, currency, tab, hs2, hs4, country, q, onNavigate,
}: Props) {
  const matrix = useMatrix();
  const [loadError, setLoadError] = useState(false);

  if (matrix === null && !loadError) {
    return <div className="analysis-loading"><p>正在加载产品—国家矩阵数据…</p></div>;
  }

  if (!matrix) {
    return (
      <div className="analysis-error">
        <p>矩阵数据加载失败。请确认数据文件已生成。</p>
      </div>
    );
  }

  return (
    <div className="analysis-container">
      {tab === "products" && (
        <ProductsView
          matrix={matrix}
          currency={currency}
          hs2={hs2}
          hs4={hs4}
          q={q}
          onNavigate={onNavigate}
          basePath={basePath}
          scope={scope}
        />
      )}
      {tab === "countries" && (
        <CountriesView
          matrix={matrix}
          currency={currency}
          scope={scope}
          country={country}
          onNavigate={onNavigate}
          basePath={basePath}
        />
      )}
      {tab === "matrix" && (
        <MatrixView
          matrix={matrix}
          currency={currency}
          hs2={hs2}
          country={country}
          onNavigate={onNavigate}
          basePath={basePath}
          scope={scope}
        />
      )}
    </div>
  );
}