"""Train and honestly evaluate a leakage-safe NYC 311 text classifier.

The V1/V2 artifacts are retained for reproducibility but are never overwritten.
Only descriptor text is used as input; complaint_type is the target.
"""
from collections import Counter
from pathlib import Path
import json
import time

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "cleaned_nyc311.csv"
MODEL_DIR = BASE_DIR / "models"
PIPELINE_PATH = MODEL_DIR / "community_signal_pipeline_v3.joblib"
MODEL_PATH = MODEL_DIR / "community_signal_model_v3.pkl"
VECTORIZER_PATH = MODEL_DIR / "tfidf_vectorizer_v3.pkl"
REPORT_PATH = BASE_DIR / "ML_EVALUATION_REPORT_v3.md"
MATRIX_PATH = BASE_DIR / "ml_confusion_matrix_v3.csv"
MIN_CLASS_SAMPLES = 5


def main():
    if not DATA_PATH.exists():
        raise SystemExit(f"Dataset not found: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, usecols=["complaint_type", "descriptor"])
    df = df.dropna(subset=["complaint_type"])
    df["complaint_type"] = df["complaint_type"].astype(str).str.strip()
    # Legitimate input only. This deliberately does not read the legacy
    # report_text column because it was constructed with the target label.
    df["descriptor"] = df["descriptor"].fillna("Unknown").astype(str).str.strip()
    df = df[(df["complaint_type"] != "") & (df["descriptor"].str.len() > 0)]
    counts = df["complaint_type"].value_counts()
    retained = counts[counts >= MIN_CLASS_SAMPLES].index
    removed_rows = int((~df["complaint_type"].isin(retained)).sum())
    df = df[df["complaint_type"].isin(retained)].copy()
    if df["complaint_type"].nunique() < 2:
        raise SystemExit("Need at least two classes with five examples each.")

    x_train, x_test, y_train, y_test = train_test_split(
        df["descriptor"], df["complaint_type"], test_size=0.20,
        random_state=42, stratify=df["complaint_type"],
    )
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2), sublinear_tf=True, min_df=2,
            max_features=4000, stop_words="english",
        )),
        ("classifier", LogisticRegression(
            C=2.0, max_iter=500, class_weight="balanced",
            solver="lbfgs", random_state=42,
        )),
    ])
    started = time.perf_counter()
    pipeline.fit(x_train, y_train)
    train_seconds = time.perf_counter() - started
    predictions = pipeline.predict(x_test)
    accuracy = accuracy_score(y_test, predictions)
    weighted = precision_recall_fscore_support(
        y_test, predictions, average="weighted", zero_division=0,
    )
    macro = precision_recall_fscore_support(
        y_test, predictions, average="macro", zero_division=0,
    )
    labels = sorted(set(y_test) | set(predictions))
    report = classification_report(y_test, predictions, labels=labels,
                                   output_dict=True, zero_division=0)
    matrix = confusion_matrix(y_test, predictions, labels=labels)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, PIPELINE_PATH)
    # Separate compatible artifacts are retained for legacy inference callers.
    joblib.dump(pipeline.named_steps["classifier"], MODEL_PATH)
    joblib.dump(pipeline.named_steps["tfidf"], VECTORIZER_PATH)
    pd.DataFrame(matrix, index=labels, columns=labels).to_csv(MATRIX_PATH)

    low_support = [
        (label, int(report[label]["support"]), float(report[label]["f1-score"]))
        for label in labels if report[label]["support"] < 20
    ]
    distribution = df["complaint_type"].value_counts()
    report_lines = [
        "# Leakage-safe NYC 311 model evaluation (V3)", "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}", "",
        "## Evaluation design", "",
        "Input is the NYC 311 `descriptor` field only; `complaint_type` is the target. ",
        "The legacy `report_text` column is intentionally ignored because it contains ",
        "the target label. A stratified 80/20 holdout split (random_state=42) is used. ",
        f"Classes with fewer than {MIN_CLASS_SAMPLES} examples are excluded from fitting; ",
        f"{removed_rows} rows across those rare classes were excluded. The vectorizer ",
        "is fitted inside the sklearn Pipeline on training rows only.", "",
        "## Results", "",
        f"- Rows evaluated: {len(y_test):,}",
        f"- Classes evaluated: {len(labels)}",
        f"- Accuracy: {accuracy:.4f}",
        f"- Weighted precision / recall / F1: {weighted[0]:.4f} / {weighted[1]:.4f} / {weighted[2]:.4f}",
        f"- Macro precision / recall / F1: {macro[0]:.4f} / {macro[1]:.4f} / {macro[2]:.4f}",
        f"- Training seconds: {train_seconds:.2f}",
        f"- Artifacts: `{PIPELINE_PATH.name}`, `{MODEL_PATH.name}`, `{VECTORIZER_PATH.name}`", "",
        "Confusion matrix: `ml_confusion_matrix_v3.csv`.", "",
        "## Rare-class evaluation", "",
        "Classes with fewer than 20 test examples (support, F1):",
    ]
    report_lines += [f"- {label}: {support}, {f1:.4f}" for label, support, f1 in low_support]
    if not low_support:
        report_lines.append("- None under this test-support threshold.")
    report_lines += [
        "", "## Dataset distribution", "",
        f"- Rows used: {len(df):,}; classes retained: {df['complaint_type'].nunique()}",
        f"- Largest class: {distribution.index[0]} ({int(distribution.iloc[0]):,} rows; {distribution.iloc[0] / len(df):.1%})",
        f"- Smallest retained class: {int(distribution.min())} rows", "",
        "## Limitations", "",
        "NYC 311 descriptors are short administrative labels, not natural-language citizen reports. ",
        "This holdout measures prediction from that descriptor field and does not establish ",
        "performance on free-text submissions. NYC categories, wording, and service processes ",
        "do not validate the model for West Bengal civic reports. Confidence scores are not ",
        "calibrated probabilities. Rare classes below the minimum sample threshold are not modeled. ",
        "Results are empirical for this split only and are not a claim of 100% real-world accuracy.", "",
        "## Per-class report", "", "```text",
        classification_report(y_test, predictions, labels=labels, zero_division=0), "```", "",
    ]
    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"Accuracy={accuracy:.4f}; weighted F1={weighted[2]:.4f}; macro F1={macro[2]:.4f}")
    print(f"Saved {PIPELINE_PATH.name} and evaluation report {REPORT_PATH.name}")


if __name__ == "__main__":
    main()
