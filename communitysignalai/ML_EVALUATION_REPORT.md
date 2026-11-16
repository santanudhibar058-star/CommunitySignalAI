# Legacy ML evaluation status

The previously reported V1/V2 evaluation metrics are invalid and must not be used. The preprocessing pipeline included `complaint_type` in `report_text`, while also using `complaint_type` as the prediction target. This direct target leakage invalidated the reported 100% V2 score and the baseline comparison.

Corrected artifacts and a descriptor-only stratified holdout evaluation are in [ML_EVALUATION_REPORT_v3.md](ML_EVALUATION_REPORT_v3.md). V3 evaluates NYC 311 administrative descriptors only. It is not validated for natural language reports or West Bengal civic use, and its confidence scores are not calibrated probabilities.

V1 and V2 model files are retained for reproducibility but are not loaded by the active Flask inference endpoint.
