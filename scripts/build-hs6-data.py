#!/usr/bin/env python3
"""Publish 2024 OEC/BACI HS6 records for the food explorer."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import requests


YEAR = 2024
USD_TO_CNY = 7.121679
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "data"
CHAPTERS = {"02", "03", "04", "07", "08", "09", "10", "12", "16", "17", "19", "20", "21"}
BASE_URL = "https://api-v2.oec.world/tesseract/data.jsonrecords"


def code(value: int | str, width: int) -> str:
    return f"{int(value):08d}"[-width:]


def source_url(scope: str) -> str:
    include = "Exporter%20Country:aschn;Year:2024"
    if scope == "usa":
        include = "Exporter%20Country:aschn;Importer%20Country:nausa;Year:2024"
    return (
        f"{BASE_URL}?cube=trade_i_baci_a_92&drilldowns=HS6&include={include}"
        "&locale=zh-CN&parents=true&measures=Trade%20Value"
    )


def fetch_records(scope: str) -> list[dict]:
    url = source_url(scope)
    response = requests.get(url, headers={"User-Agent": "food-export-opportunity-explorer/1.0"}, timeout=90)
    response.raise_for_status()
    records = []

    for row in response.json().get("data", []):
        hs2 = code(row["HS2 ID"], 2)
        value = row.get("Trade Value")
        if hs2 not in CHAPTERS or not isinstance(value, (int, float)) or value <= 0:
            continue
        name_cn = str(row.get("HS6") or "").strip()
        if not name_cn:
            continue
        records.append(
            {
                "hs2": hs2,
                "hs4": code(row["HS4 ID"], 4),
                "hs6": code(row["HS6 ID"], 6),
                "name_cn": name_cn,
                "export_value_usd": value,
                "export_value_cny": value * USD_TO_CNY,
            }
        )

    records.sort(key=lambda record: (record["hs2"], record["hs4"], -record["export_value_usd"]))
    unique = {(record["hs2"], record["hs4"], record["hs6"]) for record in records}
    if len(unique) != len(records):
        raise ValueError(f"Duplicate HS6 records in {scope} response")
    return records


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    for scope, label in (("global", "中国 → 全球"), ("usa", "中国 → 美国")):
        records = fetch_records(scope)
        payload = {
            "year": YEAR,
            "scope": scope,
            "scope_label": label,
            "source": "OEC/BACI",
            "source_url": source_url(scope),
            "fetched_at": fetched_at,
            "currency": "CNY",
            "conversion": {"usd_to_cny": USD_TO_CNY},
            "records": records,
        }
        (OUTPUT_DIR / f"{scope}-hs6-2024.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote {len(records)} {scope} HS6 records.")


if __name__ == "__main__":
    main()
