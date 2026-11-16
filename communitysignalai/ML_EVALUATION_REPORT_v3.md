# Leakage-safe NYC 311 model evaluation (V3)

Generated: 2026-11-13 20:05:35

## Evaluation design

Input is the NYC 311 `descriptor` field only; `complaint_type` is the target. 
The legacy `report_text` column is intentionally ignored because it contains 
the target label. A stratified 80/20 holdout split (random_state=42) is used. 
Classes with fewer than 5 examples are excluded from fitting; 
62 rows across those rare classes were excluded. The vectorizer 
is fitted inside the sklearn Pipeline on training rows only.

## Results

- Rows evaluated: 5,988
- Classes evaluated: 113
- Accuracy: 0.7849
- Weighted precision / recall / F1: 0.8581 / 0.7849 / 0.7783
- Macro precision / recall / F1: 0.8220 / 0.8353 / 0.8138
- Training seconds: 6.12
- Artifacts: `community_signal_pipeline_v3.joblib`, `community_signal_model_v3.pkl`, `tfidf_vectorizer_v3.pkl`

Confusion matrix: `ml_confusion_matrix_v3.csv`.

## Rare-class evaluation

Classes with fewer than 20 test examples (support, F1):
- APPLIANCE: 17, 1.0000
- Abandoned Bike: 3, 1.0000
- Air Quality: 9, 0.9412
- Animal in a Park: 5, 1.0000
- Animal-Abuse: 16, 0.8148
- Asbestos: 1, 0.6667
- Bike/Roller/Skate: 3, 0.0536
- Boilers: 5, 1.0000
- Broken Parking Meter: 1, 1.0000
- Bus Stop Shelter Complaint: 1, 0.0000
- Cannabis Retailer: 8, 0.9333
- Commercial Disposal Complaint: 1, 0.5000
- Construction Lead Dust: 1, 1.0000
- Construction Safety Enforcement: 6, 1.0000
- Curb Condition: 8, 1.0000
- Day Care: 1, 1.0000
- Dead Animal: 12, 0.9565
- Dead/Dying Tree: 9, 1.0000
- Drinking: 11, 1.0000
- Drug Activity: 9, 1.0000
- ELEVATOR: 1, 1.0000
- Electrical: 3, 1.0000
- Emergency Response Team (ERT): 4, 1.0000
- Food Establishment: 19, 0.7647
- Food Poisoning: 2, 0.0000
- Graffiti: 15, 1.0000
- Hazardous Materials: 1, 0.0000
- Highway Condition: 6, 0.8571
- Illegal Posting: 9, 0.9412
- Illegal Tree Damage: 7, 1.0000
- Indoor Air Quality: 11, 0.7826
- Indoor Sewage: 1, 1.0000
- Lead: 14, 1.0000
- Litter Basket Complaint: 2, 1.0000
- Litter Basket Request: 2, 1.0000
- Lost Property: 10, 0.8235
- Lot Condition: 2, 0.0000
- Missed Collection: 12, 0.7368
- Mobile Food Vendor: 3, 0.5714
- Mosquitoes: 1, 1.0000
- Noise - House of Worship: 4, 0.0225
- Non-Residential Heat: 3, 1.0000
- Outdoor Dining: 4, 1.0000
- Overgrown Tree/Branches: 15, 1.0000
- Panhandling: 14, 0.0000
- Plumbing: 4, 1.0000
- Real Time Enforcement: 6, 1.0000
- Residential Disposal Complaint: 19, 0.9444
- Root/Sewer/Sidewalk Condition: 7, 1.0000
- SAFETY: 9, 1.0000
- Sanitation Worker or Vehicle Complaint: 3, 0.8571
- Sewer Maintenance: 3, 0.6667
- Smoking or Vaping: 14, 1.0000
- Special Projects Inspection Team (SPIT): 4, 1.0000
- Standing Water: 1, 0.0000
- Street Sign - Damaged: 5, 0.2857
- Street Sign - Dangling: 5, 0.4444
- Street Sign - Missing: 4, 0.3333
- Street Sweeping Complaint: 3, 1.0000
- Taxi Complaint: 15, 0.7097
- Taxi Report: 1, 1.0000
- Traffic: 9, 1.0000
- Unleashed Dog: 2, 1.0000
- Unsanitary Animal Pvt Property: 3, 1.0000
- Unsanitary Pigeon Condition: 2, 1.0000
- Urinating in Public: 4, 0.0000
- Vendor Enforcement: 11, 0.9565
- Violation of Park Rules: 4, 1.0000
- Water Conservation: 7, 0.9333
- Water Maintenance: 10, 0.9000
- Wood Pile Remaining: 4, 1.0000

## Dataset distribution

- Rows used: 29,938; classes retained: 113
- Largest class: Noise - Residential (5,377 rows; 18.0%)
- Smallest retained class: 5 rows

## Limitations

NYC 311 descriptors are short administrative labels, not natural-language citizen reports. 
This holdout measures prediction from that descriptor field and does not establish 
performance on free-text submissions. NYC categories, wording, and service processes 
do not validate the model for West Bengal civic reports. Confidence scores are not 
calibrated probabilities. Rare classes below the minimum sample threshold are not modeled. 
Results are empirical for this split only and are not a claim of 100% real-world accuracy.

## Per-class report

```text
                                         precision    recall  f1-score   support

                              APPLIANCE       1.00      1.00      1.00        17
                         Abandoned Bike       1.00      1.00      1.00         3
                      Abandoned Vehicle       1.00      1.00      1.00        71
                            Air Quality       1.00      0.89      0.94         9
                       Animal in a Park       1.00      1.00      1.00         5
                           Animal-Abuse       1.00      0.69      0.81        16
                               Asbestos       0.50      1.00      0.67         1
                      Bike/Roller/Skate       0.03      1.00      0.05         3
                       Blocked Driveway       1.00      1.00      1.00       365
                                Boilers       1.00      1.00      1.00         5
                   Broken Parking Meter       1.00      1.00      1.00         1
                           Building/Use       1.00      1.00      1.00        24
             Bus Stop Shelter Complaint       0.00      0.00      0.00         1
                      Cannabis Retailer       1.00      0.88      0.93         8
          Commercial Disposal Complaint       0.33      1.00      0.50         1
                 Construction Lead Dust       1.00      1.00      1.00         1
        Construction Safety Enforcement       1.00      1.00      1.00         6
                     Consumer Complaint       1.00      0.88      0.94        26
                         Curb Condition       1.00      1.00      1.00         8
                            DOOR/WINDOW       0.93      1.00      0.96        53
                           Damaged Tree       1.00      1.00      1.00        29
                               Day Care       1.00      1.00      1.00         1
                            Dead Animal       1.00      0.92      0.96        12
                        Dead/Dying Tree       1.00      1.00      1.00         9
                      Derelict Vehicles       1.00      1.00      1.00        34
                        Dirty Condition       0.92      0.99      0.95        67
                               Drinking       1.00      1.00      1.00        11
                          Drug Activity       1.00      1.00      1.00         9
                               ELECTRIC       1.00      1.00      1.00        35
                               ELEVATOR       1.00      1.00      1.00         1
                             Electrical       1.00      1.00      1.00         3
                               Elevator       1.00      1.00      1.00        21
          Emergency Response Team (ERT)       1.00      1.00      1.00         4
                             Encampment       0.00      0.00      0.00        45
                        FLOORING/STAIRS       1.00      1.00      1.00        23
                     Food Establishment       0.87      0.68      0.76        19
                         Food Poisoning       0.00      0.00      0.00         2
             For Hire Vehicle Complaint       0.89      0.86      0.88        37
                                GENERAL       0.96      0.78      0.86        32
          General Construction/Plumbing       1.00      0.98      0.99        45
                               Graffiti       1.00      1.00      1.00        15
                         HEAT/HOT WATER       1.00      1.00      1.00       650
                    Hazardous Materials       0.00      0.00      0.00         1
                      Highway Condition       0.75      1.00      0.86         6
             Homeless Person Assistance       1.00      1.00      1.00        30
                        Illegal Dumping       1.00      1.00      1.00        40
                      Illegal Fireworks       0.00      0.00      0.00        38
                        Illegal Parking       1.00      1.00      1.00       964
                        Illegal Posting       1.00      0.89      0.94         9
                    Illegal Tree Damage       1.00      1.00      1.00         7
                     Indoor Air Quality       0.75      0.82      0.78        11
                          Indoor Sewage       1.00      1.00      1.00         1
                                   Lead       1.00      1.00      1.00        14
                Litter Basket Complaint       1.00      1.00      1.00         2
                  Litter Basket Request       1.00      1.00      1.00         2
                          Lost Property       1.00      0.70      0.82        10
                          Lot Condition       0.00      0.00      0.00         2
                Maintenance or Facility       0.96      0.92      0.94        25
                      Missed Collection       1.00      0.58      0.74        12
                     Mobile Food Vendor       0.50      0.67      0.57         3
                             Mosquitoes       1.00      1.00      1.00         1
                                  Noise       0.99      0.99      0.99        85
                     Noise - Commercial       0.00      0.00      0.00       211
                     Noise - Helicopter       0.44      1.00      0.62        20
               Noise - House of Worship       0.01      0.50      0.02         4
                           Noise - Park       0.00      0.00      0.00        26
                    Noise - Residential       0.95      0.29      0.44      1076
                Noise - Street/Sidewalk       0.35      0.84      0.49       572
                        Noise - Vehicle       0.95      1.00      0.98       119
            Non-Emergency Police Matter       0.88      1.00      0.94        37
                   Non-Residential Heat       1.00      1.00      1.00         3
                            Obstruction       1.00      0.95      0.98        21
                         Outdoor Dining       1.00      1.00      1.00         4
                Overgrown Tree/Branches       1.00      1.00      1.00        15
                          PAINT/PLASTER       1.00      0.90      0.95        49
                               PLUMBING       0.99      1.00      0.99        84
                            Panhandling       0.00      0.00      0.00        14
                               Plumbing       1.00      1.00      1.00         4
                  Real Time Enforcement       1.00      1.00      1.00         6
         Residential Disposal Complaint       1.00      0.89      0.94        19
                                 Rodent       1.00      1.00      1.00        34
          Root/Sewer/Sidewalk Condition       1.00      1.00      1.00         7
                                 SAFETY       1.00      1.00      1.00         9
 Sanitation Worker or Vehicle Complaint       0.75      1.00      0.86         3
                                  Sewer       0.97      0.94      0.95        31
                      Sewer Maintenance       0.67      0.67      0.67         3
                     Sidewalk Condition       0.73      0.96      0.83        23
                      Smoking or Vaping       1.00      1.00      1.00        14
                            Snow or Ice       0.97      1.00      0.99        39
Special Projects Inspection Team (SPIT)       1.00      1.00      1.00         4
                         Standing Water       0.00      0.00      0.00         1
                       Street Condition       0.99      0.90      0.94       116
                 Street Light Condition       0.98      1.00      0.99        53
                  Street Sign - Damaged       0.50      0.20      0.29         5
                 Street Sign - Dangling       0.50      0.40      0.44         5
                  Street Sign - Missing       0.50      0.25      0.33         4
              Street Sweeping Complaint       1.00      1.00      1.00         3
                         Taxi Complaint       0.69      0.73      0.71        15
                            Taxi Report       1.00      1.00      1.00         1
                                Traffic       1.00      1.00      1.00         9
               Traffic Signal Condition       1.00      0.97      0.99        39
                   UNSANITARY CONDITION       0.99      1.00      1.00       118
                          Unleashed Dog       1.00      1.00      1.00         2
         Unsanitary Animal Pvt Property       1.00      1.00      1.00         3
            Unsanitary Pigeon Condition       1.00      1.00      1.00         2
                    Urinating in Public       0.00      0.00      0.00         4
                     Vendor Enforcement       0.92      1.00      0.96        11
                Violation of Park Rules       1.00      1.00      1.00         4
                             WATER LEAK       1.00      1.00      1.00        45
                     Water Conservation       0.88      1.00      0.93         7
                      Water Maintenance       0.90      0.90      0.90        10
                           Water System       1.00      0.99      0.99        85
                    Wood Pile Remaining       1.00      1.00      1.00         4

                               accuracy                           0.78      5988
                              macro avg       0.82      0.84      0.81      5988
                           weighted avg       0.86      0.78      0.78      5988

```
