"""Run a small smoke inference with the leakage-safe V3 pipeline."""
from pathlib import Path
import joblib

BASE_DIR = Path(__file__).resolve().parent
pipeline_path = BASE_DIR / "models" / "community_signal_pipeline_v3.joblib"
pipeline = joblib.load(pipeline_path)
queries = [
    "Loud music/party",
    "Banging/Pounding",
    "Food Vendor",
    "Street Light Condition",
    "Broken water pipe flooding roadway",
]
for query in queries:
    probabilities = pipeline.predict_proba([query])[0]
    print(f"{query!r} -> {pipeline.predict([query])[0]} ({probabilities.max():.1%} uncalibrated score)")
print("NYC descriptor model only; scores are not calibrated and not validated for West Bengal reports.")
