"""Evaluate descriptor generalization with identical descriptors kept together.

This diagnostic fits a fresh pipeline in one stratified group holdout and never
replaces the app's current model artifacts.
"""
from pathlib import Path
import time

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "cleaned_nyc311.csv"
REPORT_PATH = BASE_DIR / "ML_GROUP_HOLDOUT_AUDIT.md"
MATRIX_PATH = BASE_DIR / "ml_confusion_matrix_group_holdout.csv"
MIN_CLASS_SAMPLES = 5


def load_evaluation_data():
    frame = pd.read_csv(DATA_PATH, usecols=["complaint_type", "descriptor"])
    frame = frame.dropna(subset=["complaint_type"])
    frame["complaint_type"] = frame["complaint_type"].astype(str).str.strip()
    frame["descriptor"] = frame["descriptor"].fillna("Unknown").astype(str).str.strip()
    frame = frame[(frame["complaint_type"] != "") & (frame["descriptor"].str.len() > 0)]
    counts = frame["complaint_type"].value_counts()
    retained = counts[counts >= MIN_CLASS_SAMPLES].index
    rare_rows = int((~frame["complaint_type"].isin(retained)).sum())
    frame = frame[frame["complaint_type"].isin(retained)].copy()
    frame["_group"] = frame["descriptor"].str.casefold().str.replace(r"\s+", " ", regex=True).str.strip()
    return frame, rare_rows


def evaluate():
    if not DATA_PATH.exists():
        raise SystemExit(f"Dataset not found: {DATA_PATH}")
    frame, rare_rows = load_evaluation_data()
    if frame["complaint_type"].nunique() < 2:
        raise SystemExit("Need at least two complaint classes for evaluation.")

    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    train_index, test_index = next(splitter.split(frame["descriptor"], frame["complaint_type"], frame["_group"]))
    train = frame.iloc[train_index]
    test = frame.iloc[test_index]
    overlap = set(train["_group"]) & set(test["_group"])
    if overlap:
        raise RuntimeError(f"Group split leaked {len(overlap)} normalized descriptors.")

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
    pipeline.fit(train["descriptor"], train["complaint_type"])
    train_seconds = time.perf_counter() - started
    predicted = pipeline.predict(test["descriptor"])
    truth = test["complaint_type"]
    labels = sorted(set(truth) | set(predicted))
    accuracy = accuracy_score(truth, predicted)
    weighted = precision_recall_fscore_support(truth, predicted, average="weighted", zero_division=0)
    macro = precision_recall_fscore_support(truth, predicted, average="macro", zero_division=0)
    report = classification_report(truth, predicted, labels=labels, output_dict=True, zero_division=0)
    matrix = confusion_matrix(truth, predicted, labels=labels)
    pd.DataFrame(matrix, index=labels, columns=labels).to_csv(MATRIX_PATH)

    class_group_counts = frame.groupby("complaint_type")["_group"].nunique()
    no_test_class_count = int((~class_group_counts.index.isin(set(truth))).sum())
    rare_test = [
        (label, int(report[label]["support"]), float(report[label]["f1-score"]))
        for label in labels if report[label]["support"] < 20
    ]
    lines = [
        "# Descriptor-group holdout audit (diagnostic)", "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}", "",
        "## Evaluation design", "",
        "Input is the NYC 311 descriptor only; complaint_type remains the target. ",
        "Normalized identical descriptors are assigned to only one side of a stratified 5-fold group split. ",
        "This prevents exact descriptor phrases from appearing in both train and test. ",
        "The pipeline is fitted from scratch on the training fold. No model artifact is saved or replaced.", "",
        f"- Rows after excluding classes with fewer than {MIN_CLASS_SAMPLES} examples: {len(frame):,}",
        f"- Rows in rare classes excluded: {rare_rows:,}",
        f"- Train/test rows: {len(train):,} / {len(test):,}",
        f"- Distinct normalized descriptors: {frame['_group'].nunique():,}",
        f"- Train/test descriptor overlap: {len(overlap)}",
        f"- Classes represented in this test fold: {truth.nunique()} of {frame['complaint_type'].nunique()}",
        f"- Classes without a test-fold descriptor group: {no_test_class_count}",
        f"- Fit seconds: {train_seconds:.2f}", "",
        "## Results", "",
        f"- Accuracy: {accuracy:.4f}",
        f"- Weighted precision / recall / F1: {weighted[0]:.4f} / {weighted[1]:.4f} / {weighted[2]:.4f}",
        f"- Macro precision / recall / F1: {macro[0]:.4f} / {macro[1]:.4f} / {macro[2]:.4f}",
        f"- Confusion matrix: `{MATRIX_PATH.name}`", "",
        "## Low-support test classes", "",
        "Classes with fewer than 20 test examples (support, F1):",
    ]
    lines.extend([f"- {label}: {support}, {f1:.4f}" for label, support, f1 in rare_test] or ["- None under this threshold."])
    lines += [
        "", "## Interpretation and limits", "",
        "This grouped score is substantially more relevant to unseen descriptor phrases than the previous random row split, ",
        "which allowed repeated descriptors to appear on both sides. Categories whose descriptor variants occur in only one ",
        "group cannot be meaningfully scored as unseen groups and may be absent from this fold. This tests generalization to ",
        "unseen NYC descriptor phrases only; it does not validate natural-language reports or West Bengal categories. ",
        "Keep the currently installed V3 artifacts unchanged until a candidate meets an agreed evaluation criterion and has ",
        "local-domain validation data.", "", "## Per-class report", "", "```text",
        classification_report(truth, predicted, labels=labels, zero_division=0), "```", "",
    ]
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Rows={len(frame)}; test={len(test)}; test_classes={truth.nunique()}/{frame['complaint_type'].nunique()}; overlap={len(overlap)}")
    print(f"Accuracy={accuracy:.4f}; weighted_f1={weighted[2]:.4f}; macro_f1={macro[2]:.4f}")
    print(f"Saved diagnostic report {REPORT_PATH.name}; installed V3 artifacts were not modified.")
    print(classification_report(truth, predicted, labels=labels, zero_division=0))


if __name__ == "__main__":
    evaluate()
