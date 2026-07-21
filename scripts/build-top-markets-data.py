#!/usr/bin/env python3
"""Publish 2024 TOP20 China food-export destination data from OEC/BACI."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests


YEAR = 2024
USD_TO_CNY = 7.121679
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "public" / "data"
MARKETS_DIR = DATA_DIR / "markets"
CHAPTERS = {"02", "03", "04", "07", "08", "09", "10", "12", "16", "17", "19", "20", "21"}
BASE_URL = "https://api-v2.oec.world/tesseract/data.jsonrecords"
HEADERS = {"User-Agent": "food-export-opportunity-explorer/1.0"}


def code(value: int | str, width: int) -> str:
    return f"{int(value):08d}"[-width:]


def request_url(drilldowns: str, importer_codes: list[str] | None = None) -> str:
    include = "Exporter%20Country:aschn;Year:2024"
    if importer_codes:
        include = f"Exporter%20Country:aschn;Importer%20Country:{','.join(importer_codes)};Year:2024"
    return (
        f"{BASE_URL}?cube=trade_i_baci_a_92&drilldowns={drilldowns.replace(',', '%2C').replace(' ', '%20')}"
        f"&include={include}&locale=zh-CN&parents=true&measures=Trade%20Value"
    )


def fetch_rows(url: str) -> list[dict]:
    response = requests.get(url, headers=HEADERS, timeout=180)
    response.raise_for_status()
    return response.json().get("data", [])


def top_markets() -> list[dict]:
    totals: dict[str, float] = defaultdict(float)
    names: dict[str, str] = {}
    for row in fetch_rows(request_url("Importer Country,HS2")):
        hs2 = code(row["HS2 ID"], 2)
        value = row.get("Trade Value")
        if hs2 in CHAPTERS and isinstance(value, (int, float)) and value > 0:
            market_id = row["Importer Country ID"]
            totals[market_id] += value
            names[market_id] = row["Importer Country"]

    markets = []
    for rank, (market_id, value) in enumerate(sorted(totals.items(), key=lambda item: item[1], reverse=True)[:20], 1):
        scope = "usa" if market_id == "nausa" else market_id
        markets.append(
            {
                "scope": scope,
                "data_key": market_id,
                "name": names[market_id],
                "rank": rank,
                "export_value_usd": value,
                "export_value_cny": value * USD_TO_CNY,
            }
        )
    if len(markets) != 20 or not any(market["scope"] == "usa" for market in markets):
        raise ValueError("Expected USA plus 19 other TOP destinations")
    return markets


def global_names() -> tuple[dict[str, str], dict[str, tuple[str, str]]]:
    payload = json.loads((DATA_DIR / "global-hs4-2024.json").read_text(encoding="utf-8"))
    chapter_names = {group["hs2"]: group["name"] for group in payload["groups"]}
    product_names = {
        child["hs4"]: (child["name_cn"], child["name_en"])
        for group in payload["groups"]
        for child in group["children"]
    }
    return chapter_names, product_names


def publish(markets: list[dict], hs4_rows: list[dict], hs6_rows: list[dict], hs4_url: str, hs6_url: str) -> None:
    chapter_names, product_names = global_names()
    market_ids = {market["data_key"] for market in markets}
    hs4_by_market: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    hs6_by_market: dict[str, list[dict]] = defaultdict(list)

    for row in hs4_rows:
        market_id = row["Importer Country ID"]
        hs2 = code(row["HS2 ID"], 2)
        value = row.get("Trade Value")
        if market_id not in market_ids or hs2 not in CHAPTERS or not isinstance(value, (int, float)) or value <= 0:
            continue
        hs4 = code(row["HS4 ID"], 4)
        name_cn, name_en = product_names.get(hs4, (str(row.get("HS4") or hs4), ""))
        hs4_by_market[market_id][hs2].append(
            {
                "hs2": hs2,
                "hs4": hs4,
                "name_cn": name_cn,
                "name_en": name_en,
                "export_value_usd": value,
                "export_value_cny": value * USD_TO_CNY,
            }
        )

    for row in hs6_rows:
        market_id = row["Importer Country ID"]
        hs2 = code(row["HS2 ID"], 2)
        value = row.get("Trade Value")
        name_cn = str(row.get("HS6") or "").strip()
        if market_id not in market_ids or hs2 not in CHAPTERS or not isinstance(value, (int, float)) or value <= 0 or not name_cn:
            continue
        hs6_by_market[market_id].append(
            {
                "hs2": hs2,
                "hs4": code(row["HS4 ID"], 4),
                "hs6": code(row["HS6 ID"], 6),
                "name_cn": name_cn,
                "export_value_usd": value,
                "export_value_cny": value * USD_TO_CNY,
            }
        )

    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    MARKETS_DIR.mkdir(parents=True, exist_ok=True)
    for market in markets:
        market_id = market["data_key"]
        groups = []
        for hs2, children in hs4_by_market[market_id].items():
            children.sort(key=lambda child: child["export_value_usd"], reverse=True)
            groups.append(
                {
                    "hs2": hs2,
                    "name": chapter_names[hs2],
                    "export_value_usd": sum(child["export_value_usd"] for child in children),
                    "export_value_cny": sum(child["export_value_cny"] for child in children),
                    "children": children,
                }
            )
        groups.sort(key=lambda group: group["export_value_usd"], reverse=True)
        records = sorted(hs6_by_market[market_id], key=lambda record: (record["hs2"], record["hs4"], -record["export_value_usd"]))
        hs4_totals = {child["hs4"]: child["export_value_usd"] for group in groups for child in group["children"]}
        hs6_totals: dict[str, float] = defaultdict(float)
        for record in records:
            hs6_totals[record["hs4"]] += record["export_value_usd"]
        if hs4_totals.keys() != hs6_totals.keys() or any(abs(hs4_totals[key] - hs6_totals[key]) > 1 for key in hs4_totals):
            raise ValueError(f"HS4/HS6 reconciliation failed for {market['name']}")

        label = f"中国 → {market['name']}"
        shared = {
            "year": YEAR,
            "scope": market["scope"],
            "scope_label": label,
            "source": "OEC/BACI",
            "fetched_at": fetched_at,
            "currency": "CNY",
            "conversion": {"usd_to_cny": USD_TO_CNY},
        }
        (MARKETS_DIR / f"{market_id}-hs4-2024.json").write_text(
            json.dumps({**shared, "source_url": hs4_url, "groups": groups}, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (MARKETS_DIR / f"{market_id}-hs6-2024.json").write_text(
            json.dumps({**shared, "source_url": hs6_url, "records": records}, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote {market['name']}: {len(groups)} HS2, {len(records)} HS6.")


def main() -> None:
    markets = top_markets()
    codes = [market["data_key"] for market in markets]
    hs4_url = request_url("Importer Country,HS4", codes)
    hs6_url = request_url("Importer Country,HS6", codes)
    publish(markets, fetch_rows(hs4_url), fetch_rows(hs6_url), hs4_url, hs6_url)
    (DATA_DIR / "markets.json").write_text(
        json.dumps(
            {
                "year": YEAR,
                "scope": "China food exports to TOP20 destinations",
                "source": "OEC/BACI",
                "source_url": request_url("Importer Country,HS2"),
                "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                "markets": markets,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
