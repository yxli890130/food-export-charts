import importlib.util
import unittest
from pathlib import Path

module_path = Path(__file__).with_name("build-tariff-lines.py")
spec = importlib.util.spec_from_file_location("build_tariff_lines", module_path)
assert spec and spec.loader
build_tariff_lines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_tariff_lines)
is_stat_suffix = build_tariff_lines.is_stat_suffix
merge_record = build_tariff_lines.merge_record


class JapanTariffParserTests(unittest.TestCase):
    def test_accepts_only_a_plain_three_digit_statistical_suffix(self):
        self.assertTrue(is_stat_suffix("100"))
        self.assertFalse(is_stat_suffix("100 1"))
        self.assertFalse(is_stat_suffix("(4.8%〜5%)"))

    def test_merges_multiple_official_conditions_for_one_code(self):
        records = {}
        merge_record(records, {"hs6": "080310", "code": "080310100", "name": "April to September"})
        merge_record(records, {"hs6": "080310", "code": "080310100", "name": "October to March"})

        self.assertEqual(len(records), 1)
        self.assertEqual(records["080310100"]["name"], "April to September / October to March")


if __name__ == "__main__":
    unittest.main()
