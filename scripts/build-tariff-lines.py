#!/usr/bin/env python3
"""Publish 2024 U.S. and Japan official tariff lines beneath the explorer HS6 records."""

from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "tariff-lines"
CHAPTERS = {"02", "03", "04", "07", "08", "09", "10", "12", "16", "17", "19", "20", "21"}
USA_SOURCE_URL = "https://www.usitc.gov/sites/default/files/tata/hts/hts_2024_revision_10_csv.csv"
USA_RETRIEVAL_URL = f"https://r.jina.ai/http://{USA_SOURCE_URL.removeprefix('https://')}"
JPN_SOURCE_URL = "https://www.customs.go.jp/english/tariff/2024_01_01/index.htm"
JPN_CHAPTER_URL = "https://www.customs.go.jp/english/tariff/2024_01_01/data/e_{chapter}.htm"
HEADERS = {"User-Agent": "food-export-opportunity-explorer/1.0"}


def digits(value: str) -> str:
    return "".join(char for char in value if char.isdigit())


def fetched_at() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def retrieve_usa_csv() -> str:
    direct = requests.get(USA_SOURCE_URL, headers=HEADERS, timeout=180)
    if direct.ok:
        return direct.text

    fallback = requests.get(USA_RETRIEVAL_URL, headers=HEADERS, timeout=180)
    fallback.raise_for_status()
    marker = "Markdown Content:\n"
    if marker not in fallback.text:
        raise ValueError("Jina retrieval did not return the USITC CSV content")
    return fallback.text.split(marker, 1)[1]


def unit(value: str) -> str | None:
    try:
        values = json.loads(value)
    except json.JSONDecodeError:
        return value or None
    return ", ".join(str(item) for item in values) or None


def is_stat_suffix(value: str) -> bool:
    return bool(re.fullmatch(r"\d{3}", value.strip()))


def merge_record(records: dict[str, dict], record: dict) -> None:
    existing = records.get(record["code"])
    if not existing:
        records[record["code"]] = record
        return
    names = existing["name"].split(" / ")
    if record["name"] not in names:
        existing["name"] = f"{existing['name']} / {record['name']}"


def usa_records() -> list[dict]:
    contexts: dict[int, str] = {}
    records: list[dict] = []
    for row in csv.DictReader(io.StringIO(retrieve_usa_csv())):
        code = digits(row["HTS Number"])
        description = row["Description"].strip()
        indent = int(row["Indent"] or 0)
        if description:
            contexts = {level: text for level, text in contexts.items() if level < indent}
            contexts[indent] = description
        if len(code) != 10 or code[:2] not in CHAPTERS or not description:
            continue
        name = " — ".join(text for _, text in sorted(contexts.items()) if text)
        records.append({"hs6": code[:6], "code": code, "name": name, **({"unit": unit(row["Unit of Quantity"])} if unit(row["Unit of Quantity"]) else {})})
    return records


def japan_records() -> list[dict]:
    records: dict[str, dict] = {}
    for chapter in sorted(CHAPTERS):
        response = requests.get(JPN_CHAPTER_URL.format(chapter=chapter), headers=HEADERS, timeout=180)
        response.raise_for_status()
        current_hs6 = ""
        current_name = ""
        soup = BeautifulSoup(response.content, "html.parser")
        for table_row in soup.find_all("tr"):
            cells = [" ".join(cell.stripped_strings) for cell in table_row.find_all(["th", "td"])]
            if len(cells) < 4:
                continue
            hs_code = digits(cells[1])
            suffix = cells[2].strip()
            description = cells[3].strip()
            if len(hs_code) == 6:
                current_hs6 = hs_code
                current_name = description
            if not current_hs6 or not is_stat_suffix(suffix) or not description:
                continue
            code = f"{current_hs6}{suffix}"
            name = description if description == current_name else f"{current_name} — {description}".strip(" —")
            merge_record(records, {"hs6": current_hs6, "code": code, "name": name})
    return list(records.values())


def validate(records: list[dict], width: int) -> list[dict]:
    unique = {record["code"]: record for record in records}
    if len(unique) != len(records):
        raise ValueError("Duplicate tariff-line codes")
    ordered = sorted(unique.values(), key=lambda record: record["code"])
    for record in ordered:
        if not re.fullmatch(r"\d{6}", record["hs6"]):
            raise ValueError(f"Invalid HS6: {record}")
        if not re.fullmatch(rf"\d{{{width}}}", record["code"]) or not record["code"].startswith(record["hs6"]):
            raise ValueError(f"Invalid national code: {record}")
        if not record["name"].strip():
            raise ValueError(f"Missing name: {record}")
    return ordered


def publish(filename: str, payload: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    usa = validate(usa_records(), 10)
    japan = validate(japan_records(), 9)
    published = fetched_at()
    publish("usa-2024.json", {
        "countryScope": "usa", "countryName": "美国", "year": 2024, "codeSystem": "HTS10",
        "publisher": "United States International Trade Commission", "sourceUrl": USA_SOURCE_URL,
        "retrievalNote": "USITC 原始地址对自动请求返回 403；构建时通过 Jina Reader 获取同一官方 CSV。",
        "fetchedAt": published, "records": usa,
    })
    publish("jpn-2024.json", {
        "countryScope": "asjpn", "countryName": "日本", "year": 2024, "codeSystem": "日本进口统计9位码",
        "publisher": "Japan Customs, Ministry of Finance", "sourceUrl": JPN_SOURCE_URL,
        "fetchedAt": published, "records": japan,
    })
    print(f"Wrote {len(usa)} U.S. HTS10 lines and {len(japan)} Japanese 9-digit lines.")


if __name__ == "__main__":
    main()
