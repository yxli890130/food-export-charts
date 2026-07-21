#!/usr/bin/env python3
"""
Build 2024 China food export data: HS2 → HS4 → HS6 × destination country.

Outputs chunked JSON files under public/data/ for the Next.js frontend.
Primary source: UN Comtrade (key from env COMTRADE_API_KEY).
USD for calculation; CNY for display (uses 2024 SAFE average rate).

Usage:
    python scripts/build_food_export_data.py

Environment:
    COMTRADE_API_KEY - required for full data access
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import hashlib
import collections
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from http.client import IncompleteRead

# ── Config ──────────────────────────────────────────────────────────────
API_ROOT = "https://comtradeapi.un.org"
PROJECT_ROOT = Path(r"D:\Codex\food-export-charts")
CACHE_DIR = PROJECT_ROOT / ".cache" / "trade"
OUTPUT_DIR = PROJECT_ROOT / "public" / "data"
USER_AGENT = "food-export-opportunity-explorer/0.1"
YEAR = 2024
USD_TO_CNY = 7.121679

# 13 retained food-related HS2 chapters with Chinese names
CHAPTERS: dict[str, str] = {
    "02": "肉及食用杂碎",
    "03": "鱼、甲壳类和软体动物",
    "04": "乳品、蛋、蜂蜜",
    "07": "食用蔬菜、根茎",
    "08": "食用水果和坚果",
    "09": "咖啡、茶、香辛料",
    "10": "谷物",
    "12": "油籽、种子及植物材料",
    "16": "肉、鱼及水产制品",
    "17": "糖及糖食",
    "19": "谷物、面粉、淀粉制品",
    "20": "蔬果及植物制品",
    "21": "其他食品调制品",
}

# Chinese HS4 names (from existing project data, verified)
HS4_CN: dict[str, str] = {
    "0201": "牛肉", "0202": "冷冻牛肉", "0203": "猪肉", "0204": "绵羊及山羊肉",
    "0205": "马肉", "0206": "食用杂碎", "0207": "禽肉", "0208": "其他肉类",
    "0209": "动物脂肪", "0210": "腌制或熏制肉类",
    "0301": "活鱼", "0302": "鲜或冷藏的非鱼片鱼类", "0303": "冷冻的非鱼片鱼类",
    "0304": "鱼片及其他鱼肉", "0305": "干、盐腌、熏制或盐水浸渍鱼", "0306": "甲壳动物", "0307": "软体动物",
    "0308": "其他水生无脊椎动物", "0309": "供人食用的水产动物细粉、粗粉及团粒",
    "0401": "乳及奶油（未浓缩）", "0402": "浓缩乳及奶油", "0403": "酸奶等发酵乳制品",
    "0404": "乳清及其他乳制品", "0405": "黄油及乳脂", "0406": "乳酪及凝乳",
    "0407": "带壳禽蛋及蛋黄", "0408": "去壳禽蛋及蛋黄制品", "0409": "天然蜂蜜", "0410": "其他食用动物产品",
    "0701": "马铃薯", "0702": "番茄", "0703": "洋葱、青葱、大蒜及其他葱属蔬菜",
    "0704": "甘蓝、花椰菜等芸薹属蔬菜", "0705": "莴苣及菊苣", "0706": "胡萝卜、芜菁等食用根茎",
    "0707": "黄瓜及小黄瓜", "0708": "豆类蔬菜", "0709": "其他鲜或冷藏蔬菜", "0710": "冷冻蔬菜",
    "0711": "暂时保藏蔬菜", "0712": "干制蔬菜", "0713": "干荚豆", "0714": "木薯、甘薯等根茎",
    "0801": "椰子、巴西坚果及腰果", "0802": "其他坚果", "0803": "香蕉", "0804": "热带水果",
    "0805": "柑橘类水果", "0806": "葡萄", "0807": "瓜类", "0808": "苹果及梨",
    "0809": "核果类水果", "0810": "其他水果", "0811": "冷冻水果及坚果", "0812": "暂时保藏水果及坚果",
    "0813": "干果", "0814": "柑橘或瓜果皮",
    "0901": "咖啡", "0902": "茶", "0903": "马黛茶", "0904": "胡椒、辣椒及甜椒",
    "0905": "香草", "0906": "肉桂", "0907": "丁香", "0908": "肉豆蔻、肉豆蔻衣及小豆蔻",
    "0909": "孜然、茴香等香辛料种子", "0910": "其他香辛料",
    "1001": "小麦及混合麦", "1002": "黑麦", "1003": "大麦", "1004": "燕麦",
    "1005": "玉米", "1006": "稻米", "1007": "高粱", "1008": "荞麦、小米及其他谷物",
    "1201": "大豆", "1202": "花生", "1203": "椰干", "1204": "亚麻籽", "1205": "油菜籽",
    "1206": "葵花籽", "1207": "其他含油子仁及果实", "1208": "油子仁或果实粉末",
    "1209": "播种用种子、果实及孢子", "1210": "啤酒花", "1211": "药用、香料及杀虫等用植物",
    "1212": "角豆、海藻及其他食用植物产品", "1213": "谷物秸秆及谷壳", "1214": "饲料用植物产品",
    "1601": "香肠及类似肉制品", "1602": "其他调制或保藏肉、杂碎或血",
    "1603": "肉、鱼、甲壳及软体动物提取物或汁", "1604": "调制或保藏鱼；鱼子酱",
    "1605": "调制或保藏甲壳动物、软体动物",
    "1701": "原糖及精制糖", "1702": "其他糖及糖浆", "1703": "糖蜜", "1704": "糖食",
    "1901": "麦芽提取物及谷物、面粉等食品调制品", "1902": "面食", "1903": "木薯粉及其代用品制品",
    "1904": "谷物制品及膨化谷物食品", "1905": "面包、糕点、饼干等烘焙食品",
    "2001": "醋或醋酸保藏食品", "2002": "调制或保藏番茄", "2003": "调制或保藏食用菌",
    "2004": "其他冷冻蔬菜", "2005": "其他调制或保藏蔬菜", "2006": "糖渍蔬果坚果",
    "2007": "果酱、果冻、果泥及果糊", "2008": "其他调制或保藏水果、坚果及植物食用部分", "2009": "水果、坚果或蔬菜汁",
    "2101": "咖啡、茶及马黛茶提取物等", "2102": "酵母及其他发酵粉", "2103": "调味汁、调味品及芥子粉",
    "2104": "汤料、肉汤及其制品", "2105": "冰淇淋及其他冰食", "2106": "其他食品调制品",
}

# Fixed partner reference (lightweight, embedded to avoid runtime dependency)
PARTNER_NAMES: dict[int, str] = {
    0: "全球", 4: "阿富汗", 8: "阿尔巴尼亚", 12: "阿尔及利亚", 20: "安道尔",
    24: "安哥拉", 28: "安提瓜和巴布达", 31: "阿塞拜疆", 32: "阿根廷",
    36: "澳大利亚", 40: "奥地利", 44: "巴哈马", 48: "巴林", 50: "孟加拉国",
    51: "亚美尼亚", 52: "巴巴多斯", 56: "比利时", 64: "不丹", 68: "玻利维亚",
    70: "波黑", 76: "巴西", 84: "伯利兹", 96: "文莱", 100: "保加利亚",
    104: "缅甸", 108: "布隆迪", 112: "白俄罗斯", 116: "柬埔寨", 120: "喀麦隆",
    124: "加拿大", 132: "佛得角", 144: "斯里兰卡", 148: "乍得", 152: "智利",
    156: "中国", 158: "台湾", 162: "圣诞岛", 166: "科科斯群岛",
    170: "哥伦比亚", 174: "科摩罗", 178: "刚果共和国", 180: "刚果民主共和国",
    188: "哥斯达黎加", 191: "克罗地亚", 192: "古巴", 196: "塞浦路斯",
    203: "捷克", 208: "丹麦", 212: "多米尼克", 214: "多米尼加",
    218: "厄瓜多尔", 222: "萨尔瓦多", 226: "赤道几内亚", 231: "埃塞俄比亚",
    232: "厄立特里亚", 233: "爱沙尼亚", 242: "斐济", 246: "芬兰",
    248: "奥兰群岛", 250: "法国", 251: "法国", 258: "法属波利尼西亚",
    262: "吉布提", 266: "加蓬", 268: "格鲁吉亚", 270: "冈比亚",
    276: "德国", 288: "加纳", 292: "直布罗陀", 296: "基里巴斯",
    300: "希腊", 304: "格陵兰", 308: "格林纳达", 312: "瓜德罗普",
    320: "危地马拉", 324: "几内亚", 328: "圭亚那", 332: "海地",
    336: "梵蒂冈", 340: "洪都拉斯", 344: "香港", 348: "匈牙利",
    352: "冰岛", 356: "印度", 360: "印度尼西亚", 364: "伊朗",
    368: "伊拉克", 372: "爱尔兰", 376: "以色列", 380: "意大利",
    381: "意大利", 384: "科特迪瓦", 388: "牙买加", 392: "日本",
    398: "哈萨克斯坦", 400: "约旦", 404: "肯尼亚", 408: "朝鲜",
    410: "韩国", 414: "科威特", 417: "吉尔吉斯斯坦", 418: "老挝",
    422: "黎巴嫩", 426: "莱索托", 428: "拉脱维亚", 430: "利比里亚",
    434: "利比亚", 438: "列支敦士登", 440: "立陶宛", 442: "卢森堡",
    446: "澳门", 450: "马达加斯加", 454: "马拉维", 458: "马来西亚",
    462: "马尔代夫", 466: "马里", 470: "马耳他", 474: "马提尼克",
    478: "毛里塔尼亚", 480: "毛里求斯", 484: "墨西哥", 490: "亚洲其他地区（未另列明）", 492: "摩纳哥",
    496: "蒙古", 498: "摩尔多瓦", 499: "黑山", 504: "摩洛哥",
    508: "莫桑比克", 512: "阿曼", 516: "纳米比亚", 520: "瑙鲁",
    524: "尼泊尔", 528: "荷兰", 530: "荷属安的列斯", 540: "新喀里多尼亚",
    548: "瓦努阿图", 554: "新西兰", 558: "尼加拉瓜", 562: "尼日尔",
    566: "尼日利亚", 578: "挪威", 580: "北马里亚纳群岛", 586: "巴基斯坦",
    591: "巴拿马", 598: "巴布亚新几内亚", 600: "巴拉圭", 604: "秘鲁",
    608: "菲律宾", 616: "波兰", 620: "葡萄牙", 624: "几内亚比绍",
    626: "东帝汶", 634: "卡塔尔", 638: "留尼汪", 642: "罗马尼亚",
    643: "俄罗斯", 646: "卢旺达", 654: "圣赫勒拿", 659: "圣基茨和尼维斯",
    660: "安圭拉", 662: "圣卢西亚", 666: "圣皮埃尔和密克隆",
    670: "圣文森特和格林纳丁斯", 674: "圣马力诺", 678: "圣多美和普林西比",
    682: "沙特阿拉伯", 686: "塞内加尔", 688: "塞尔维亚", 690: "塞舌尔",
    694: "塞拉利昂", 699: "印度", 702: "新加坡", 703: "斯洛伐克", 704: "越南",
    705: "斯洛文尼亚", 706: "索马里", 710: "南非", 716: "津巴布韦",
    724: "西班牙", 728: "南苏丹", 729: "苏丹", 732: "西撒哈拉",
    740: "苏里南", 748: "斯威士兰", 752: "瑞典", 756: "瑞士",
    760: "叙利亚", 762: "塔吉克斯坦", 764: "泰国", 768: "多哥",
    772: "托克劳", 776: "汤加", 780: "特立尼达和多巴哥", 784: "阿联酋",
    788: "突尼斯", 792: "土耳其", 795: "土库曼斯坦", 800: "乌干达",
    804: "乌克兰", 807: "北马其顿", 818: "埃及", 826: "英国",
    831: "根西岛", 832: "泽西岛", 833: "马恩岛", 834: "坦桑尼亚",
    840: "美国", 842: "美国", 854: "布基纳法索", 858: "乌拉圭",
    860: "乌兹别克斯坦", 862: "委内瑞拉", 882: "萨摩亚", 887: "也门",
    894: "赞比亚", 899: "科索沃",
}


# ── Helpers ─────────────────────────────────────────────────────────────

def _cache_path(url: str) -> Path:
    h = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{h}.json"


def _api_key() -> str:
    key = os.environ.get("COMTRADE_API_KEY")
    if not key:
        raise ValueError("COMTRADE_API_KEY environment variable is required")
    return key


def _fetch_json(url: str, api_key: str, retries: int = 3) -> dict:
    cache = _cache_path(url)
    if cache.exists():
        return json.loads(cache.read_text("utf-8"))

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = Request(url, headers={
                "User-Agent": USER_AGENT,
                "Ocp-Apim-Subscription-Key": api_key,
            })
            with urlopen(req, timeout=120) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_suffix(cache.suffix + ".tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False), "utf-8")
            tmp.replace(cache)
            return payload
        except (OSError, IncompleteRead) as e:
            last_error = e
            if attempt + 1 >= retries:
                raise
            time.sleep(2 ** attempt)
    raise last_error  # type: ignore[misc]


def _comtrade_url(
    cmd_code: str,
    partner_code: int | None = None,
    max_records: int = 500,
    period: str = "2024",
) -> str:
    parts = [f"reporterCode=156&period={period}&flowCode=X&partner2Code=0"]
    if partner_code is not None:
        parts.append(f"partnerCode={partner_code}")
    parts.append(f"cmdCode={cmd_code}&maxRecords={max_records}")
    return f"{API_ROOT}/data/v1/get/C/A/HS?{'&'.join(parts)}"


def _fmt_cny(usd: float) -> float:
    return round(usd * USD_TO_CNY, 2)


def _fmt_val(v: float | None) -> float:
    return round(v, 2) if v else 0.0


# ── Reference loaders ───────────────────────────────────────────────────

def _load_hs_reference() -> dict:
    url = "https://comtradeapi.un.org/files/v1/app/reference/HS.json"
    cache = _cache_path(url)
    if cache.exists():
        try:
            return json.loads(cache.read_text("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            cache.unlink()

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
            with urlopen(req, timeout=120) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_suffix(cache.suffix + ".tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False), "utf-8")
            tmp.replace(cache)
            return payload
        except (OSError, IncompleteRead, json.JSONDecodeError) as error:
            last_error = error
            if attempt + 1 < 3:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to download HS reference after 3 attempts: {last_error}")


def _partner_name(code: int) -> str:
    return PARTNER_NAMES.get(code, f"CN{code}")


# ── Data fetch stages ───────────────────────────────────────────────────

def fetch_hs4_and_hs6(api_key: str) -> dict:
    """
    For each HS2 chapter, fetch HS4 × destination data.
    Also fetch HS6 × destination data for each active HS4.
    Returns structured dict keyed by HS2 → HS4 → HS6 → list of partners.
    """
    ref = _load_hs_reference()
    hs_items = ref.get("results", [])

    # Build complete HS4 → HS6 hierarchy in two passes. Reference order is not contractual.
    hs4_items = {
        str(item.get("id")): item
        for item in hs_items
        if str(item.get("parent", "")) in CHAPTERS
        and len(str(item.get("id", ""))) == 4
        and str(item.get("id", "")).isdigit()
    }
    hs4_children: dict[str, list[dict]] = collections.defaultdict(list)
    for hs4 in hs4_items:
        hs4_children[hs4] = []
    for item in hs_items:
        parent = str(item.get("parent", ""))
        item_id = str(item.get("id", ""))
        if parent in hs4_items and len(item_id) == 6 and item_id.isdigit():
            hs4_children[parent].append({
                "hs6": item_id,
                "name_en": item.get("text", ""),
            })
    for children in hs4_children.values():
        children.sort(key=lambda child: child["hs6"])

    result: dict = {}
    gaps: list[dict] = []

    for hs2 in sorted(CHAPTERS):
        print(f"  [{hs2}] {CHAPTERS[hs2]} — fetching HS4 partners...")

        # Build comma-separated HS4 codes for this chapter.
        hs4_list = sorted(k for k in hs4_items if k.startswith(hs2))
        if not hs4_list:
            gaps.append({"hs2": hs2, "level": "HS4", "reason": "No HS4 entries in reference"})
            print(f"    FAILED: no HS4 entries in reference")
            continue

        # Fetch HS4 × destination using explicit HS4 codes; cmdCode=07 would only return HS2.
        url = _comtrade_url(cmd_code=",".join(hs4_list), max_records=250000)
        try:
            payload = _fetch_json(url, api_key)
            rows = payload.get("data", [])
        except Exception as e:
            gaps.append({"hs2": hs2, "level": "HS2", "reason": str(e)})
            print(f"    FAILED: {e}")
            continue

        # Aggregate by HS4 (cmdCode[:4])
        hs4_groups: dict[str, dict] = {}
        for row in rows:
            cc = str(row.get("cmdCode", ""))[:4]
            if cc not in hs4_children:
                continue
            if cc not in hs4_groups:
                hs4_groups[cc] = {
                    "hs4": cc,
                    "name_en": hs4_items.get(cc, {}).get("text", cc),
                    "name_cn": HS4_CN.get(cc, cc),
                    "export_value_usd": 0,
                    "partners": [],
                    "hs6_children": [],
                }
            pc = row.get("partnerCode")
            pv = (row.get("primaryValue") or 0)
            if pc == 0:
                hs4_groups[cc]["export_value_usd"] = _fmt_val(pv)
            elif pc is not None:
                hs4_groups[cc]["partners"].append({
                    "partner_code": int(pc),
                    "partner_name": _partner_name(int(pc)),
                    "export_value_usd": _fmt_val(pv),
                })

        # Sort partners descending
        for g in hs4_groups.values():
            g["partners"].sort(key=lambda p: -p["export_value_usd"])

        # Fetch HS6 × destination for each active HS4
        active_hs4 = sorted(hs4_groups.keys())
        for hs4 in active_hs4:
            children = hs4_children.get(hs4, [])
            hs6_codes = [c["hs6"] for c in children]
            if not hs6_codes:
                continue

            hs6_codes_str = ",".join(hs6_codes)
            url = _comtrade_url(cmd_code=hs6_codes_str, max_records=250000)
            try:
                payload = _fetch_json(url, api_key)
                hs6_rows = payload.get("data", [])
            except Exception as e:
                gaps.append({"hs2": hs2, "hs4": hs4, "level": "HS6", "reason": str(e)})
                print(f"    HS6 {hs4} FAILED: {e}")
                continue

            # Aggregate by HS6
            hs6_groups: dict[str, dict] = {}
            # Pre-populate with reference children
            for child in children:
                hs6_groups[child["hs6"]] = {
                    "hs6": child["hs6"],
                    "name_en": child["name_en"],
                    "name_cn": "",
                    "export_value_usd": 0,
                    "partners": [],
                }

            for row in hs6_rows:
                hc = str(row.get("cmdCode", ""))
                if hc not in hs6_groups:
                    continue
                pc = row.get("partnerCode")
                pv = (row.get("primaryValue") or 0)
                if pc == 0:
                    hs6_groups[hc]["export_value_usd"] = _fmt_val(pv)
                elif pc is not None:
                    hs6_groups[hc]["partners"].append({
                        "partner_code": int(pc),
                        "partner_name": _partner_name(int(pc)),
                        "export_value_usd": _fmt_val(pv),
                    })

            for g in hs6_groups.values():
                g["partners"].sort(key=lambda p: -p["export_value_usd"])

            hs4_groups[hs4]["hs6_children"] = [
                hs6_groups[c["hs6"]] for c in children
                if c["hs6"] in hs6_groups
            ]

        result[hs2] = {
            "hs2": hs2,
            "name": CHAPTERS[hs2],
            "export_value_usd": sum(
                g["export_value_usd"] for g in hs4_groups.values()
            ),
            "hs4_children": [hs4_groups[k] for k in sorted(hs4_groups.keys())],
        }
        print(f"    {len(hs4_groups)} HS4, "
              f"{sum(len(g['hs6_children']) for g in hs4_groups.values())} HS6, "
              f"{sum(len(g['partners']) for g in hs4_groups.values())} partners")

    return {"result": result, "gaps": gaps}


# ── Output writers ──────────────────────────────────────────────────────

def write_overview(data: dict, fetched_at: str) -> None:
    out = OUTPUT_DIR / "overview" / "2024.json"
    out.parent.mkdir(parents=True, exist_ok=True)

    groups = []
    for hs2 in sorted(data["result"]):
        g = data["result"][hs2]
        groups.append({
            "hs2": g["hs2"],
            "name": g["name"],
            "export_value_usd": _fmt_val(g["export_value_usd"]),
            "export_value_cny": _fmt_cny(g["export_value_usd"]),
        })
    groups.sort(key=lambda g: -g["export_value_usd"])

    total = sum(g["export_value_usd"] for g in groups)
    payload = {
        "year": YEAR,
        "fetched_at": fetched_at,
        "source": "UN Comtrade",
        "source_url": "https://comtradeapi.un.org/data/v1/get/C/A/HS",
        "hs_version": "HS2022 (via Comtrade H6 classification)",
        "chapters_covered": len(CHAPTERS),
        "total_export_value_usd": _fmt_val(total),
        "total_export_value_cny": _fmt_cny(total),
        "conversion": {
            "usd_to_cny": USD_TO_CNY,
            "method": "2024 working-day average of USD/CNY central parity",
            "source_url": "https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do?startDate=2024-01-01&endDate=2024-12-31",
        },
        "gaps": data["gaps"],
        "groups": groups,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    print(f"  wrote overview/2024.json ({len(groups)} HS2)")


def write_categories(data: dict, fetched_at: str) -> None:
    """Write one JSON per HS2 (category), containing HS4 + HS6 + partners."""
    cat_dir = OUTPUT_DIR / "categories"
    cat_dir.mkdir(parents=True, exist_ok=True)

    for hs2 in sorted(data["result"]):
        g = data["result"][hs2]
        total = g["export_value_usd"]

        out = cat_dir / f"{hs2}.json"
        payload = {
            "year": YEAR,
            "fetched_at": fetched_at,
            "hs2": hs2,
            "name": g["name"],
            "export_value_usd": _fmt_val(total),
            "export_value_cny": _fmt_cny(total),
            "hs4_children": [
                {
                    "hs4": h4["hs4"],
                    "name_en": h4["name_en"],
                    "name_cn": h4.get("name_cn", ""),
                    "export_value_usd": _fmt_val(h4["export_value_usd"]),
                    "export_value_cny": _fmt_cny(h4["export_value_usd"]),
                    "partner_count": len(h4["partners"]),
                    "top15_partners": [
                        {
                            "partner_code": p["partner_code"],
                            "partner_name": p["partner_name"],
                            "export_value_usd": _fmt_val(p["export_value_usd"]),
                            "export_value_cny": _fmt_cny(p["export_value_usd"]),
                            "share_pct": round(
                                p["export_value_usd"] / h4["export_value_usd"] * 100, 1
                            ) if h4["export_value_usd"] > 0 else 0,
                        }
                        for p in h4["partners"][:15]
                    ],
                    "hs6_children": [
                        {
                            "hs6": h6["hs6"],
                            "name_en": h6["name_en"],
                            "name_cn": h6.get("name_cn", ""),
                            "export_value_usd": _fmt_val(h6["export_value_usd"]),
                            "export_value_cny": _fmt_cny(h6["export_value_usd"]),
                            "partner_count": len(h6["partners"]),
                            "top15_partners": [
                                {
                                    "partner_code": p["partner_code"],
                                    "partner_name": p["partner_name"],
                                    "export_value_usd": _fmt_val(p["export_value_usd"]),
                                    "export_value_cny": _fmt_cny(p["export_value_usd"]),
                                    "share_pct": round(
                                        p["export_value_usd"] / h6["export_value_usd"] * 100, 1
                                    ) if h6["export_value_usd"] > 0 else 0,
                                }
                                for p in h6["partners"][:15]
                            ],
                        }
                        for h6 in h4["hs6_children"]
                    ],
                }
                for h4 in g["hs4_children"]
            ],
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
        print(f"  wrote categories/{hs2}.json ({len(payload['hs4_children'])} HS4)")


def write_partner_index(data: dict, api_key: str) -> None:
    """Build per-country index from all HS4/HS6 partner data."""
    country_dir = OUTPUT_DIR / "countries"
    country_dir.mkdir(parents=True, exist_ok=True)

    # Aggregate all partners across all HS4/HS6
    country_products: dict[int, dict] = {}
    country_hs4: dict[int, dict] = {}

    for hs2 in data["result"]:
        g = data["result"][hs2]
        for h4 in g["hs4_children"]:
            for p in h4["partners"]:
                pc = p["partner_code"]
                if pc not in country_hs4:
                    country_hs4[pc] = {}
                if h4["hs4"] not in country_hs4[pc]:
                    country_hs4[pc][h4["hs4"]] = {
                        "hs4": h4["hs4"],
                        "name_cn": h4.get("name_cn", ""),
                        "name_en": h4.get("name_en", ""),
                        "export_value_usd": 0,
                        "hs2": hs2,
                    }
                country_hs4[pc][h4["hs4"]]["export_value_usd"] += p["export_value_usd"]

            for h6 in h4["hs6_children"]:
                for p in h6["partners"]:
                    pc = p["partner_code"]
                    if pc not in country_products:
                        country_products[pc] = {}
                    if h6["hs6"] not in country_products[pc]:
                        country_products[pc][h6["hs6"]] = {
                            "hs6": h6["hs6"],
                            "name_en": h6["name_en"],
                            "hs4": h4["hs4"],
                            "hs2": hs2,
                            "export_value_usd": 0,
                        }
                    country_products[pc][h6["hs6"]]["export_value_usd"] += p["export_value_usd"]

    for pc in country_hs4:
        combined = list(country_hs4[pc].values())
        combined.sort(key=lambda x: -x["export_value_usd"])
        total = sum(x["export_value_usd"] for x in combined)
        out = country_dir / f"{pc}.json"
        payload = {
            "year": YEAR,
            "partner_code": pc,
            "partner_name": _partner_name(pc),
            "total_export_value_usd": _fmt_val(total),
            "total_export_value_cny": _fmt_cny(total),
            "hs4_products": [
                {
                    "hs4": c["hs4"],
                    "name_cn": c["name_cn"],
                    "name_en": c["name_en"],
                    "export_value_usd": _fmt_val(c["export_value_usd"]),
                    "export_value_cny": _fmt_cny(c["export_value_usd"]),
                    "share_pct": round(c["export_value_usd"] / total * 100, 1),
                    "hs2": c["hs2"],
                }
                for c in combined[:50]
            ],
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")

    print(f"  wrote countries/ for {len(country_hs4)} partners")
    return None


def write_matrix(data: dict, fetched_at: str) -> None:
    """Write compact HS4 × destination matrix used by all three analysis directions."""
    product_map: dict[str, dict] = {}
    country_totals: dict[int, float] = collections.defaultdict(float)
    cells: list[dict] = []

    for hs2, group in data["result"].items():
        for h4 in group["hs4_children"]:
            product_map[h4["hs4"]] = {
                "hs2": hs2,
                "hs4": h4["hs4"],
                "name_cn": h4.get("name_cn", ""),
                "name_en": h4.get("name_en", ""),
                "export_value_usd": _fmt_val(h4["export_value_usd"]),
                "export_value_cny": _fmt_cny(h4["export_value_usd"]),
                "partner_count": len(h4["partners"]),
            }
            for partner in h4["partners"]:
                value = partner["export_value_usd"]
                if value <= 0:
                    continue
                pc = partner["partner_code"]
                country_totals[pc] += value
                cells.append({
                    "hs4": h4["hs4"],
                    "partner_code": pc,
                    "export_value_usd": _fmt_val(value),
                    "export_value_cny": _fmt_cny(value),
                })

    products = sorted(product_map.values(), key=lambda item: -item["export_value_usd"])
    countries = sorted(
        ({
            "partner_code": code,
            "partner_name": _partner_name(code),
            "export_value_usd": _fmt_val(value),
            "export_value_cny": _fmt_cny(value),
        } for code, value in country_totals.items()),
        key=lambda item: -item["export_value_usd"],
    )
    payload = {
        "year": YEAR,
        "fetched_at": fetched_at,
        "source": "UN Comtrade",
        "source_url": "https://comtradeapi.un.org/data/v1/get/C/A/HS",
        "hs_version": "HS2022 (via Comtrade H6 classification)",
        "coverage": "13 retained HS2 chapters; partner cells with reported positive values",
        "products": products,
        "countries": countries,
        "cells": cells,
    }
    matrix_dir = OUTPUT_DIR / "matrix"
    matrix_dir.mkdir(parents=True, exist_ok=True)
    (matrix_dir / "2024.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "utf-8"
    )
    print(f"  wrote matrix/2024.json ({len(products)} HS4 × {len(countries)} partners, {len(cells)} cells)")


def write_manifest(data: dict, fetched_at: str) -> None:
    overview_file = OUTPUT_DIR / "overview" / "2024.json"
    overview = json.loads(overview_file.read_text("utf-8"))

    total_records = 0
    for hs2 in data["result"]:
        g = data["result"][hs2]
        for h4 in g["hs4_children"]:
            total_records += len(h4["partners"])
            for h6 in h4["hs6_children"]:
                total_records += len(h6["partners"])

    manifest = {
        "year": YEAR,
        "fetched_at": fetched_at,
        "source": "UN Comtrade",
        "hs_version": "HS2022 (via Comtrade H6 classification)",
        "chapters_covered": len(CHAPTERS),
        "total_export_value_usd": overview["total_export_value_usd"],
        "total_export_value_cny": overview["total_export_value_cny"],
        "total_destination_records": total_records,
        "gaps": len(data["gaps"]),
        "conversion": {
            "usd_to_cny": USD_TO_CNY,
            "method": "2024 working-day average of USD/CNY central parity",
            "source_url": "https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do?startDate=2024-01-01&endDate=2024-12-31",
        },
        "files": {
            "overview": "overview/2024.json",
            "categories": [f"categories/{hs2}.json" for hs2 in sorted(data["result"])],
            "countries": f"countries/ (per partner code)",
        },
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8"
    )
    print(f"  wrote manifest.json")
    print(f"  total destination records: {total_records}")


# ── Main ────────────────────────────────────────────────────────────────

def main() -> None:
    # Force UTF-8 for console output (handles Chinese characters)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    elif "PYTHONIOENCODING" not in os.environ:
        os.environ["PYTHONIOENCODING"] = "utf-8"
    api_key = _api_key()
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    print("Fetching data from UN Comtrade...")
    data = fetch_hs4_and_hs6(api_key)

    # Hard completeness gate: never publish an apparently successful empty dataset.
    missing_chapters = sorted(set(CHAPTERS) - set(data["result"]))
    empty_chapters = sorted(
        hs2 for hs2, group in data["result"].items()
        if not group["hs4_children"] or group["export_value_usd"] <= 0
    )
    hs6_count = sum(
        len(hs4["hs6_children"])
        for group in data["result"].values()
        for hs4 in group["hs4_children"]
    )
    partner_count = sum(
        len(hs4["partners"])
        for group in data["result"].values()
        for hs4 in group["hs4_children"]
    )
    if missing_chapters or empty_chapters or hs6_count == 0 or partner_count == 0:
        raise RuntimeError(
            "Data completeness gate failed: "
            f"missing_chapters={missing_chapters}, empty_chapters={empty_chapters}, "
            f"hs6_count={hs6_count}, partner_records={partner_count}"
        )

    print(f"Validated {len(data['result'])} chapters, {hs6_count} HS6 and {partner_count} HS4 partner records.")
    print("\nWriting output files...")
    write_overview(data, fetched_at)
    write_categories(data, fetched_at)
    write_partner_index(data, api_key)
    write_matrix(data, fetched_at)
    write_manifest(data, fetched_at)

    print(f"\nDone. Gaps: {len(data['gaps'])}")
    if data["gaps"]:
        for g in data["gaps"]:
            print(f"  [{g.get('hs2')}][{g.get('hs4','')}] {g['reason']}")

    # Sanity: compare OEC/BACI totals with Comtrade
    print("\n--- Sanity check (OEC/BACI vs Comtrade) ---")
    try:
        oec = json.loads((PROJECT_ROOT / "public" / "data" / "global-hs4-2024.json").read_text("utf-8"))
        for g in oec["groups"]:
            hs2 = g["hs2"]
            ct = data["result"].get(hs2, {}).get("export_value_usd", 0)
            oec_val = g["export_value_usd"]
            diff = abs(ct - oec_val) / max(ct, oec_val) * 100 if max(ct, oec_val) > 0 else 0
            flag = " ⚠️" if diff > 15 else ""
            print(f"  HS{hs2} Comtrade={ct:,.0f} OEC={oec_val:,.0f} diff={diff:.1f}%{flag}")
    except Exception as e:
        print(f"  OEC comparison skipped: {e}")


if __name__ == "__main__":
    main()