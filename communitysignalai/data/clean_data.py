"""Prepare the NYC 311 reference table without putting its target in model text."""
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DATA_PATH = BASE_DIR / "data" / "raw_nyc311.csv"
CLEAN_DATA_PATH = BASE_DIR / "data" / "cleaned_nyc311.csv"


def build_report_text(frame):
    """Build inference-style text from the descriptor only, never the target."""
    if "descriptor" not in frame.columns:
        raise ValueError("The dataset must include a descriptor column.")
    return (
        frame["descriptor"].fillna("Unknown").astype(str)
        .str.lower().str.replace(r"\s+", " ", regex=True).str.strip()
    )


def prepare_dataset(frame):
    """Clean a supplied frame without mutating it or mixing labels into text."""
    if "unique_key" not in frame.columns or "complaint_type" not in frame.columns:
        raise ValueError("NYC 311 data must include unique_key and complaint_type.")
    df = frame.copy()
    df = df.drop_duplicates(subset="unique_key")
    df = df.dropna(subset=["complaint_type"])
    if "descriptor" not in df.columns:
        df["descriptor"] = "Unknown"
    df["descriptor"] = df["descriptor"].fillna("Unknown").astype(str)
    for column in ("created_date", "closed_date"):
        if column in df.columns:
            df[column] = pd.to_datetime(df[column], errors="coerce")
    if "created_date" in df.columns:
        df = df.dropna(subset=["created_date"])
        df["year"] = df["created_date"].dt.year
        df["month"] = df["created_date"].dt.month
        df["day_of_week"] = df["created_date"].dt.day_name()
        df["hour"] = df["created_date"].dt.hour
    # Keep this legacy column name for older notebooks, but its contents are
    # descriptor-only. The model pipeline itself reads descriptor directly.
    df["report_text"] = build_report_text(df)
    return df


def main():
    if not RAW_DATA_PATH.exists():
        raise SystemExit(f"NYC 311 reference data not found: {RAW_DATA_PATH}")
    df = prepare_dataset(pd.read_csv(RAW_DATA_PATH))
    print("Cleaned shape:", df.shape)
    print("\nMissing values:")
    print(df.isnull().sum().sort_values(ascending=False).head(10))
    print("\nSample descriptor-only report text:")
    print(df[["complaint_type", "descriptor", "report_text"]].head())
    df.to_csv(CLEAN_DATA_PATH, index=False)
    print(f"\nCleaned dataset saved to {CLEAN_DATA_PATH}")


if __name__ == "__main__":
    main()
