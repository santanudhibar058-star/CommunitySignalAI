# Descriptor-group holdout audit (diagnostic)

Generated: 2026-11-15 12:36:20

## Evaluation design

Input is the NYC 311 descriptor only; complaint_type remains the target. 
Normalized identical descriptors are assigned to only one side of a stratified 5-fold group split. 
This prevents exact descriptor phrases from appearing in both train and test. 
The pipeline is fitted from scratch on the training fold. No model artifact is saved or replaced.

- Rows after excluding classes with fewer than 5 examples: 29,938
- Rows in rare classes excluded: 62
- Train/test rows: 21,743 / 8,195
- Distinct normalized descriptors: 514
- Train/test descriptor overlap: 0
- Classes represented in this test fold: 45 of 113
- Classes without a test-fold descriptor group: 68
- Fit seconds: 11.77

## Results

- Accuracy: 0.0503
- Weighted precision / recall / F1: 0.1146 / 0.0503 / 0.0688
- Macro precision / recall / F1: 0.1278 / 0.0999 / 0.1035
- Confusion matrix: `ml_confusion_matrix_group_holdout.csv`

## Low-support test classes

Classes with fewer than 20 test examples (support, F1):
- Abandoned Bike: 0, 0.0000
- Abandoned Vehicle: 0, 0.0000
- Air Quality: 4, 0.5000
- Animal in a Park: 2, 0.0000
- Animal-Abuse: 4, 0.0000
- Broken Parking Meter: 0, 0.0000
- Building/Use: 5, 0.0000
- Cannabis Retailer: 1, 0.0000
- Commercial Disposal Complaint: 0, 0.0000
- DOOR/WINDOW: 0, 0.0000
- Damaged Tree: 13, 0.8571
- Dead Animal: 8, 0.0000
- ELECTRIC: 18, 0.0000
- Food Establishment: 18, 0.5385
- Food Poisoning: 0, 0.0000
- Graffiti: 0, 0.0000
- Highway Condition: 0, 0.0000
- Homeless Person Assistance: 0, 0.0000
- Illegal Posting: 0, 0.0000
- Illegal Tree Damage: 3, 0.0000
- Indoor Air Quality: 5, 0.0000
- Lot Condition: 0, 0.0000
- Missed Collection: 8, 0.7692
- Mobile Food Vendor: 2, 0.0000
- Noise - House of Worship: 7, 0.0000
- Non-Residential Heat: 0, 0.0000
- Obstruction: 5, 0.0000
- Outdoor Dining: 0, 0.0000
- Overgrown Tree/Branches: 11, 0.8421
- PAINT/PLASTER: 4, 0.0000
- Plumbing: 0, 0.0000
- SAFETY: 2, 0.0000
- Sanitation Worker or Vehicle Complaint: 0, 0.0000
- Sewer Maintenance: 3, 0.1429
- Sidewalk Condition: 17, 0.0000
- Snow or Ice: 0, 0.0000
- Standing Water: 1, 0.0000
- Street Light Condition: 0, 0.0000
- Street Sign - Damaged: 6, 0.0000
- Street Sign - Dangling: 3, 0.0000
- Street Sign - Missing: 2, 0.0000
- Traffic: 2, 0.0000
- Traffic Signal Condition: 17, 0.7857
- UNSANITARY CONDITION: 0, 0.0000
- Unsanitary Animal Pvt Property: 12, 0.0000
- Vendor Enforcement: 0, 0.0000
- Violation of Park Rules: 2, 0.0000
- Water Conservation: 2, 0.0667
- Water Maintenance: 6, 0.0000

## Interpretation and limits

This grouped score is substantially more relevant to unseen descriptor phrases than the previous random row split, 
which allowed repeated descriptors to appear on both sides. Categories whose descriptor variants occur in only one 
group cannot be meaningfully scored as unseen groups and may be absent from this fold. This tests generalization to 
unseen NYC descriptor phrases only; it does not validate natural-language reports or West Bengal categories. 
Keep the currently installed V3 artifacts unchanged until a candidate meets an agreed evaluation criterion and has 
local-domain validation data.

## Per-class report

```text
                                        precision    recall  f1-score   support

                        Abandoned Bike       0.00      0.00      0.00         0
                     Abandoned Vehicle       0.00      0.00      0.00         0
                           Air Quality       0.50      0.50      0.50         4
                      Animal in a Park       0.00      0.00      0.00         2
                          Animal-Abuse       0.00      0.00      0.00         4
                  Broken Parking Meter       0.00      0.00      0.00         0
                          Building/Use       0.00      0.00      0.00         5
                     Cannabis Retailer       0.00      0.00      0.00         1
         Commercial Disposal Complaint       0.00      0.00      0.00         0
                    Consumer Complaint       0.91      0.81      0.86        26
                           DOOR/WINDOW       0.00      0.00      0.00         0
                          Damaged Tree       0.80      0.92      0.86        13
                           Dead Animal       0.00      0.00      0.00         8
                              ELECTRIC       0.00      0.00      0.00        18
                    Food Establishment       0.88      0.39      0.54        18
                        Food Poisoning       0.00      0.00      0.00         0
                               GENERAL       0.00      0.00      0.00        24
         General Construction/Plumbing       0.00      0.00      0.00        41
                              Graffiti       0.00      0.00      0.00         0
                     Highway Condition       0.00      0.00      0.00         0
            Homeless Person Assistance       0.00      0.00      0.00         0
                       Illegal Parking       1.00      0.39      0.57       802
                       Illegal Posting       0.00      0.00      0.00         0
                   Illegal Tree Damage       0.00      0.00      0.00         3
                    Indoor Air Quality       0.00      0.00      0.00         5
                         Lot Condition       0.00      0.00      0.00         0
               Maintenance or Facility       0.00      0.00      0.00        20
                     Missed Collection       1.00      0.62      0.77         8
                    Mobile Food Vendor       0.00      0.00      0.00         2
                                 Noise       0.97      0.55      0.70        51
                    Noise - Commercial       0.00      0.00      0.00       859
              Noise - House of Worship       0.00      0.00      0.00         7
                          Noise - Park       0.00      0.00      0.00       103
                   Noise - Residential       0.00      0.00      0.00      3470
               Noise - Street/Sidewalk       0.00      0.00      0.00      2427
                  Non-Residential Heat       0.00      0.00      0.00         0
                           Obstruction       0.00      0.00      0.00         5
                        Outdoor Dining       0.00      0.00      0.00         0
               Overgrown Tree/Branches       1.00      0.73      0.84        11
                         PAINT/PLASTER       0.00      0.00      0.00         4
                              PLUMBING       0.00      0.00      0.00        26
                              Plumbing       0.00      0.00      0.00         0
        Residential Disposal Complaint       0.00      0.00      0.00        22
                                SAFETY       0.00      0.00      0.00         2
Sanitation Worker or Vehicle Complaint       0.00      0.00      0.00         0
                                 Sewer       0.00      0.00      0.00        24
                     Sewer Maintenance       0.09      0.33      0.14         3
                    Sidewalk Condition       0.00      0.00      0.00        17
                           Snow or Ice       0.00      0.00      0.00         0
                        Standing Water       0.00      0.00      0.00         1
                      Street Condition       0.00      0.00      0.00        41
                Street Light Condition       0.00      0.00      0.00         0
                 Street Sign - Damaged       0.00      0.00      0.00         6
                Street Sign - Dangling       0.00      0.00      0.00         3
                 Street Sign - Missing       0.00      0.00      0.00         2
                               Traffic       0.00      0.00      0.00         2
              Traffic Signal Condition       1.00      0.65      0.79        17
                  UNSANITARY CONDITION       0.00      0.00      0.00         0
        Unsanitary Animal Pvt Property       0.00      0.00      0.00        12
                    Vendor Enforcement       0.00      0.00      0.00         0
               Violation of Park Rules       0.00      0.00      0.00         2
                    Water Conservation       0.04      0.50      0.07         2
                     Water Maintenance       0.00      0.00      0.00         6
                          Water System       0.00      0.00      0.00        66

                              accuracy                           0.05      8195
                             macro avg       0.13      0.10      0.10      8195
                          weighted avg       0.11      0.05      0.07      8195

```
