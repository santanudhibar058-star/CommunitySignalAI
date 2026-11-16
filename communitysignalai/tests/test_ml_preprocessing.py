import unittest
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.clean_data import build_report_text, prepare_dataset


class DescriptorOnlyPreprocessingTests(unittest.TestCase):
    def test_report_text_never_contains_target_label(self):
        frame = pd.DataFrame({
            "complaint_type": ["TARGET_SECRET"],
            "descriptor": ["  Water   leak "],
        })
        report_text = build_report_text(frame)
        self.assertEqual(report_text.iloc[0], "water leak")
        self.assertNotIn("TARGET_SECRET", report_text.iloc[0])

    def test_prepare_dataset_keeps_descriptor_only_legacy_text(self):
        frame = pd.DataFrame({
            "unique_key": [1, 2],
            "complaint_type": ["TARGET_SECRET", "Noise"],
            "descriptor": ["Water leak", None],
        })
        cleaned = prepare_dataset(frame)
        self.assertEqual(cleaned["report_text"].tolist(), ["water leak", "unknown"])
        self.assertTrue(frame["descriptor"].isna().iloc[1])
        self.assertNotIn("TARGET_SECRET", " ".join(cleaned["report_text"]))


if __name__ == "__main__":
    unittest.main()
