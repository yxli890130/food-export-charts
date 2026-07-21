export type Scope = string;
export type Currency = "cny" | "usd";

export type TradeChild = {
  hs2: string;
  hs4: string;
  name_en: string;
  name_cn: string;
  export_value_usd: number;
  export_value_cny: number;
};

export type TradeGroup = {
  hs2: string;
  name: string;
  export_value_usd: number;
  export_value_cny: number;
  children: TradeChild[];
};

export type TradeDataset = {
  year: number;
  source: string;
  source_url: string;
  fetched_at: string;
  conversion: { rate: number; source_url: string };
  groups: TradeGroup[];
  scope: Scope;
  scopeLabel: string;
};

export type Hs6Record = {
  hs2: string;
  hs4: string;
  hs6: string;
  name_cn: string;
  export_value_usd: number;
  export_value_cny: number;
};

export type Hs6Dataset = {
  year: number;
  scope: Scope;
  scope_label: string;
  source: string;
  source_url: string;
  fetched_at: string;
  records: Hs6Record[];
};

export type TariffLine = {
  hs6: string;
  code: string;
  name: string;
  unit?: string;
};

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

export type TradeMatrixProduct = {
  hs2: string;
  hs4: string;
  name_cn: string;
  name_en: string;
  export_value_usd: number;
  export_value_cny: number;
  partner_count: number;
};

export type TradeMatrixCountry = {
  partner_code: number;
  partner_name: string;
  export_value_usd: number;
  export_value_cny: number;
};

export type TradeMatrixCell = {
  hs4: string;
  partner_code: number;
  export_value_usd: number;
  export_value_cny: number;
};

export type TradeMatrixDataset = {
  year: number;
  fetched_at: string;
  source: string;
  source_url: string;
  hs_version: string;
  coverage: string;
  products: TradeMatrixProduct[];
  countries: TradeMatrixCountry[];
  cells: TradeMatrixCell[];
};

export type MarketOption = {
  scope: Scope;
  data_key: string;
  name: string;
  rank: number;
  export_value_usd: number;
  export_value_cny: number;
};
