"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ExplorerState } from "@/lib/explorer-state";
import { formatTradeValue, makeExplorerQuery, marketDataKey } from "@/lib/trade-format";
import type { Currency, Hs6Dataset, MarketOption, Scope, TariffLineDataset, TradeDataset } from "@/lib/trade-types";
import { Analysis } from "@/components/analysis";

type Props = {
  basePath: "/" | "/explore";
  guided: boolean;
  dataset: TradeDataset;
  markets: MarketOption[];
  initialState: ExplorerState;
};

const pendingCoverage = [
  ["01", "活动物"],
  ["05", "其他动物产品"],
  ["06", "活树、花卉"],
  ["11", "制粉工业产品"],
  ["13", "虫胶、树胶和树脂"],
  ["14", "植物编结材料"],
  ["15", "动植物油脂"],
  ["18", "可可及制品"],
  ["22", "饮料、酒及醋"],
  ["23", "食品工业残渣及饲料"],
] as const;

function valueOf(item: { export_value_cny: number; export_value_usd: number }, currency: Currency) {
  return currency === "cny" ? item.export_value_cny : item.export_value_usd;
}

function briefDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("zh-CN");
}

export function Explorer({
  basePath,
  guided,
  dataset,
  markets,
  initialState,
}: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [hs6Dataset, setHs6Dataset] = useState<Hs6Dataset>();
  const [hs6Status, setHs6Status] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [tariffDataset, setTariffDataset] = useState<TariffLineDataset>();
  const [tariffStatus, setTariffStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const { scope, currency, tab, hs2, hs4, hs6, country } = initialState;
  const selectedGroup = dataset.groups.find((group) => group.hs2 === hs2);
  const selectedDetail = selectedGroup?.children.find((child) => child.hs4 === hs4);
  const total = useMemo(
    () => dataset.groups.reduce((sum, group) => sum + valueOf(group, currency), 0),
    [currency, dataset.groups],
  );
  const maximum = valueOf(dataset.groups[0], currency);
  const hs6Records = useMemo(
    () => hs6Dataset?.records.filter((record) => record.hs4 === selectedDetail?.hs4) ?? [],
    [hs6Dataset, selectedDetail?.hs4],
  );
  const selectedHs6 = hs6Records.find((record) => record.hs6 === hs6) ?? hs6Records[0];
  const tariffLines = useMemo(
    () => tariffDataset?.records.filter((record) => record.hs6 === selectedHs6?.hs6) ?? [],
    [tariffDataset, selectedHs6?.hs6],
  );

  useEffect(() => {
    if (!selectedDetail) {
      setHs6Status("idle");
      return;
    }

    let cancelled = false;
    setHs6Status("loading");
    const hs6File = scope === "global"
      ? "/data/global-hs6-2024.json"
      : `/data/markets/${marketDataKey(scope)}-hs6-2024.json`;
    fetch(hs6File)
      .then((response) => {
        if (!response.ok) throw new Error("HS6 data request failed");
        return response.json() as Promise<Hs6Dataset>;
      })
      .then((payload) => {
        if (!cancelled) {
          setHs6Dataset(payload);
          setHs6Status("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setHs6Status("error");
      });

    return () => {
      cancelled = true;
    };
  }, [scope, selectedDetail]);

  useEffect(() => {
    if (!selectedHs6 || (scope !== "usa" && scope !== "asjpn")) {
      setTariffStatus("idle");
      return;
    }

    let cancelled = false;
    setTariffStatus("loading");
    const file = scope === "usa" ? "/data/tariff-lines/usa-2024.json" : "/data/tariff-lines/jpn-2024.json";
    fetch(file)
      .then((response) => {
        if (!response.ok) throw new Error("Tariff-line data request failed");
        return response.json() as Promise<TariffLineDataset>;
      })
      .then((payload) => {
        if (!cancelled) {
          setTariffDataset(payload);
          setTariffStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setTariffStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [scope, selectedHs6]);

  const go = (next: Partial<ExplorerState>) => {
    const state = { scope, currency, tab, hs2, hs4, hs6, country, ...next };
    router.replace(`${basePath}${makeExplorerQuery(state)}`, { scroll: false });
  };

  const handleNavigate = (params: Record<string, string | undefined>) => {
    go({
      tab: (params.tab ?? "products") as "products" | "countries" | "matrix",
      hs2: params.hs2,
      hs4: params.hs4,
      country: params.country,
    });
  };

  const switchScope = (nextScope: Scope) => go({ scope: nextScope, hs2: undefined, hs4: undefined, hs6: undefined, country: undefined });
  const switchCurrency = (nextCurrency: Currency) => go({ currency: nextCurrency });
  const chooseGroup = (nextHs2: string) =>
    go(hs2 === nextHs2 ? { hs2: undefined, hs4: undefined, hs6: undefined, country: undefined } : { hs2: nextHs2, hs4: undefined, hs6: undefined, country: undefined });
  const chooseDetail = (nextHs2: string, nextHs4: string) => go({ hs2: nextHs2, hs4: nextHs4, hs6: undefined });
  const closeDetail = () => go({ hs4: undefined, hs6: undefined });
  const chooseHs6 = (nextHs6: string) => go({ hs6: nextHs6 });

  const copyView = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="site-shell">
      <div className="paper-grain" aria-hidden="true" />
      <header className="masthead">
        <Link href="/" className="wordmark" aria-label="返回首页">
          <span>FIELD</span>
          <strong>NOTES</strong>
        </Link>
        <div className="masthead-title">
          <p>中国食品出口机会探索</p>
          <span>先列证据，再下判断</span>
        </div>
        <div className="header-actions">
          <span className="year-tag">2024 已加载</span>
          <Link className="text-link" href={guided ? "/explore" : "/"}>
            {guided ? "自由探索" : "引导阅读"} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <nav className="step-nav" aria-label="研究步骤">
        {[
          ["01", "看全貌", "#overview"],
          ["02", "定边界", "#coverage"],
          ["03", "产品×国家", "#analysis"],
          ["04", "找产品", "#ranking"],
          ["05", "做验证", "#roadmap"],
        ].map(([number, label, href], index) => (
          <a className={index < 4 ? "step-active" : "step-pending"} href={href} key={number}>
            <b>{number}</b> {label}
          </a>
        ))}
      </nav>

      <section className="hero section-anchor" id="overview">
        <div className="section-kicker">{guided ? "01 / 看全貌" : "自由探索 / 数据视图"}</div>
        <div className="hero-grid">
          <div>
            <h1>中国食品出口机会探索</h1>
            <p className="hero-copy">
              从已验证的 HS2 与 HS4 出口数据开始。这里展示的是研究起点，不是自动生成的进入建议。
            </p>
            <div className="boundary-strip" aria-label="数据覆盖范围">
              <span><b>{scope === "global" ? "13 / 23" : `${dataset.groups.length} / 13`}</b> 个 HS2 已覆盖</span>
              <span><b>仅 2024</b> 年度快照</span>
              <span><b>HS6</b> 可下钻</span>
            </div>
          </div>
          <aside className="total-card">
            <span>{dataset.scopeLabel}</span>
            <strong>{formatTradeValue(total, currency)}</strong>
            <p>{scope === "global" ? "已覆盖 13 类的合计，不代表 HS01–HS23 总额。" : "按当前目的地已覆盖 HS2 的合计。"}</p>
          </aside>
        </div>
        {guided && (
          <div className="reading-note">
            <span className="note-mark">◎</span>
            <p><b>本阶段观察：</b>按当前口径，先比较已覆盖类别的相对规模；不推断增长趋势、利润或市场机会。</p>
            <a href="#coverage">下一步：确认研究边界 ↓</a>
          </div>
        )}
      </section>

      <section className="controls" aria-label="数据视图控制">
        <div className="control-group market-control">
          <label htmlFor="market-scope">数据视图</label>
          <select id="market-scope" value={scope} onChange={(event) => switchScope(event.target.value)}>
            <option value="global">中国 → 全球</option>
            <optgroup label="2024 年已覆盖 HS2 的 TOP20 目的地">
              {markets.map((market) => <option value={market.scope} key={market.scope}>#{market.rank} 中国 → {market.name}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="control-group">
          <span>金额显示</span>
          <div className="segmented" role="group" aria-label="金额显示">
            <button className={currency === "cny" ? "selected" : ""} onClick={() => switchCurrency("cny")}>人民币</button>
            <button className={currency === "usd" ? "selected" : ""} onClick={() => switchCurrency("usd")}>美元</button>
          </div>
        </div>
      </section>

      <section className="content-grid section-anchor" id="coverage">
        <aside className="coverage-panel">
          <div className="section-kicker">02 / 定边界</div>
          <h2>研究范围不是行业结论</h2>
          <p>已加载类别可以继续比较；其余类别暂未接入，不能被重新纳入或参与重算。</p>
          <div className="coverage-count"><b>{dataset.groups.length}</b><span>已覆盖<br />HS2 类别</span></div>
          <ol className="covered-list">
            {dataset.groups.map((group) => <li key={group.hs2}><b>HS{group.hs2}</b><span>{group.name}</span><i>已加载</i></li>)}
          </ol>
          <div className="pending-list-wrap">
            <p className="pending-heading">10 类尚未接入 · 不可重算</p>
            <div className="pending-list">
              {pendingCoverage.map(([code, name]) => <span key={code}>HS{code} {name}</span>)}
            </div>
          </div>
        </aside>

        <section className="ranking-panel section-anchor" id="ranking">
          <div className="ranking-heading">
            <div>
              <div className="section-kicker">04 / 找产品</div>
              <h2>从 HS2 下钻到 HS4</h2>
              <p>{dataset.scopeLabel} · 点击一个大类展开可用的 HS4 统计品目。</p>
            </div>
            <span className="data-badge">{dataset.groups.length} 个 HS2</span>
          </div>
          <div className="ranking-list">
            {dataset.groups.map((group, index) => {
              const groupValue = valueOf(group, currency);
              const open = selectedGroup?.hs2 === group.hs2;
              return (
                <article className={`group-row ${open ? "is-open" : ""}`} key={group.hs2}>
                  <button
                    className="group-toggle"
                    aria-expanded={open}
                    aria-label={`HS${group.hs2} ${group.name}`}
                    onClick={() => chooseGroup(group.hs2)}
                  >
                    <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="group-name"><b>HS{group.hs2}</b><span>{group.name}</span></span>
                    <span className="bar-track"><i style={{ width: `${(groupValue / maximum) * 100}%` }} /></span>
                    <strong>{formatTradeValue(groupValue, currency)}</strong>
                    <span className="chevron" aria-hidden="true">{open ? "−" : "+"}</span>
                  </button>
                  {open && (
                    <div className="children-panel">
                      <p>HS4 金额来自同一来源与年份；点击品目查看其父级占比与已加载市场切片。</p>
                      {group.children.map((child) => {
                        const childValue = valueOf(child, currency);
                        const childMax = valueOf(group.children[0], currency);
                        return (
                          <button
                            className="child-row"
                            key={child.hs4}
                            aria-label={`HS${child.hs4} ${child.name_cn}`}
                            onClick={() => chooseDetail(group.hs2, child.hs4)}
                          >
                            <span><b>HS{child.hs4}</b>{child.name_cn}</span>
                            <i><em style={{ width: `${(childValue / childMax) * 100}%` }} /></i>
                            <strong>{formatTradeValue(childValue, currency)}</strong>
                            <small>查看 →</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <section className="analysis-section section-anchor" id="analysis">
        <div className="analysis-intro">
          <div className="section-kicker">03 / 产品 × 国家 × 出口额</div>
          <h2>换一个方向看数据</h2>
          <p>同一份 UN Comtrade 2024 数据，可以从产品、国家和交叉矩阵三个方向查看。这里用于发现值得继续研究的组合，不是自动机会排名。</p>
        </div>
        <Analysis
          basePath={basePath}
          scope={scope}
          currency={currency}
          tab={tab}
          hs2={hs2}
          hs4={hs4}
          country={country}
          onNavigate={handleNavigate}
        />
      </section>

      <section className="roadmap section-anchor" id="roadmap">
        <div>
          <div className="section-kicker">下一段研究路线</div>
          <h2>已知数据只能支持到这里</h2>
          <p>后续步骤保留在网页中，但不会用占位数字制造“已完成”的错觉。</p>
        </div>
        <div className="roadmap-cards">
          <article><span>03</span><h3>找市场</h3><p>美国与其余 TOP19 目的地均可切换至 HS4、HS6。</p><b>已加载 2024 TOP20 目的地</b></article>
          <article><span>04+</span><h3>拆到 HS6</h3><p>HS4 → HS6 已加载；目标国总进口与中国份额尚未接入。</p><b>HS6 已加载 · 进口数据待接入</b></article>
          <article><span>05</span><h3>做验证</h3><p>需求、买家、准入和中国供给四类证据。</p><b>待人工研究与证据卡</b></article>
        </div>
      </section>

      <footer className="ledger">
        <div><span>DATA LEDGER</span><p>{dataset.source} · {dataset.year} · {dataset.scopeLabel}</p></div>
        <div><span>金额口径</span><p>人民币为既有平均汇率显示；排序基于同一币种数值。</p></div>
        <div><span>更新时间</span><p>{briefDate(dataset.fetched_at)}</p></div>
        <a href={dataset.source_url} target="_blank" rel="noreferrer">查看数据来源 ↗</a>
      </footer>

      {selectedDetail && selectedGroup && (
        <div className="drawer-backdrop" onClick={closeDetail}>
          <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`HS${selectedDetail.hs4} · ${selectedDetail.name_cn}`} onClick={(event) => event.stopPropagation()}>
            <button className="drawer-close" onClick={closeDetail} aria-label="关闭详情">×</button>
            <p className="crumb">全部范围 / HS{selectedGroup.hs2} {selectedGroup.name}</p>
            <div className="drawer-title"><span>HS{selectedDetail.hs4}</span><h2>{selectedDetail.name_cn}</h2></div>
            <p className="english-name">{selectedDetail.name_en}</p>
            <div className="detail-total"><span>{dataset.scopeLabel} · 2024</span><strong>{formatTradeValue(valueOf(selectedDetail, currency), currency)}</strong></div>
            <dl className="detail-facts">
              <div><dt>在 HS{selectedGroup.hs2} 中占比</dt><dd>{((valueOf(selectedDetail, currency) / valueOf(selectedGroup, currency)) * 100).toFixed(1)}%</dd></div>
              <div><dt>同级 HS4 数量</dt><dd>{selectedGroup.children.length} 个</dd></div>
              <div><dt>当前统计范围</dt><dd>{dataset.scopeLabel}</dd></div>
            </dl>
            <div className="guardrail-box"><b>重要边界</b><p>当前没有五年序列、全量目的地分布或市场准入数据。因此此处不显示趋势、CAGR、市场份额或“推荐进入”结论。</p></div>
            <section className="hs6-section" aria-live="polite">
              <div className="hs6-heading">
                <div><span>HS4 下钻</span><h3>具体 HS6 食品</h3></div>
                {hs6Status === "ready" && <b>{hs6Records.length} 项</b>}
              </div>
              <p>HS6 是贸易统计品目，不等同于具体 SKU、等级、包装或品牌。</p>
              {hs6Status === "loading" && <p className="hs6-loading">正在加载同口径 HS6 数据…</p>}
              {hs6Status === "error" && <p className="hs6-error">HS6 数据加载失败；请重试或返回上一级。</p>}
              {hs6Status === "ready" && (
                <div className="hs6-list">
                  {hs6Records.map((record) => (
                    <button className={`hs6-row ${selectedHs6?.hs6 === record.hs6 ? "is-selected" : ""}`} key={record.hs6} onClick={() => chooseHs6(record.hs6)} aria-pressed={selectedHs6?.hs6 === record.hs6}>
                      <span>HS{record.hs6}</span>
                      <strong>{record.name_cn}</strong>
                      <em>{formatTradeValue(valueOf(record, currency), currency)}</em>
                    </button>
                  ))}
                </div>
              )}
            </section>
            {selectedHs6 && (
              <section className="tariff-lines" aria-live="polite">
                <div className="tariff-lines-heading">
                  <div>
                    <span>HS6 后官方分类</span>
                    <h3>{scope === "usa" ? "2024 美国 HTS10 官方细分品目" : scope === "asjpn" ? "2024 日本 9 位官方统计品目" : "官方细分品目"}</h3>
                  </div>
                  {tariffStatus === "ready" && <b>{tariffLines.length} 项</b>}
                </div>
                {scope !== "usa" && scope !== "asjpn" && <p>该目的地 2024 官方细分目录尚未接入。</p>}
                {(scope === "usa" || scope === "asjpn") && tariffStatus === "loading" && <p>正在加载 2024 官方细分目录…</p>}
                {(scope === "usa" || scope === "asjpn") && tariffStatus === "error" && <p>官方细分目录加载失败；请重试或打开来源核对。</p>}
                {tariffStatus === "ready" && tariffLines.length === 0 && <p>该 HS6 在已接入的 2024 官方目录中没有可显示的细分记录。</p>}
                {tariffStatus === "ready" && tariffLines.length > 0 && (
                  <>
                    <div className="tariff-line-list">
                      {tariffLines.map((line) => <div className="tariff-line-row" key={line.code}><b>{line.code}</b><span>{line.name}</span><small>{line.unit ?? "未提供计量单位"}</small></div>)}
                    </div>
                    <a className="tariff-source" href={tariffDataset?.sourceUrl} target="_blank" rel="noreferrer">{tariffDataset?.publisher} · {tariffDataset?.year} 官方来源 ↗</a>
                  </>
                )}
              </section>
            )}
            <button className="copy-button" onClick={copyView}>{copied ? "已复制当前视图" : "复制当前视图链接"}</button>
          </aside>
        </div>
      )}
    </main>
  );
}
