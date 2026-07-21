import { Explorer } from "@/components/explorer";
import { resolveExplorerState } from "@/lib/explorer-state";
import { getMarketOptions, getTradeDataset } from "@/lib/trade-data";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: Props) {
  const state = resolveExplorerState(await searchParams);
  const dataset = getTradeDataset(state.scope);

  return (
    <Explorer
      key={JSON.stringify({ state, scope: dataset.scope })}
      basePath="/"
      guided
      dataset={dataset}
      markets={getMarketOptions()}
      initialState={{ ...state, scope: dataset.scope }}
    />
  );
}
