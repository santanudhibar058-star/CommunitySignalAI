import requests
import pandas as pd

API_URL = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"

# Get 5,000 reports from different time periods
months = [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07"
]

all_data = []

for month in months:

    print("Downloading:", month)

    start_date = month + "-01T00:00:00"

    if month == "2025-10":
        end_date = "2025-11-01T00:00:00"
    elif month == "2025-11":
        end_date = "2025-12-01T00:00:00"
    elif month == "2025-12":
        end_date = "2026-01-01T00:00:00"
    else:
        year = int(month[:4])
        m = int(month[5:7])

        if m == 12:
            end_date = f"{year + 1}-01-01T00:00:00"
        else:
            end_date = f"{year}-{m + 1:02d}-01T00:00:00"

    params = {
        "$limit": 3000,
        "$where": f"created_date >= '{start_date}' AND created_date < '{end_date}'"
    }

    response = requests.get(API_URL, params=params)

    if response.status_code == 200:
        data = response.json()
        all_data.extend(data)
        print("Records:", len(data))
    else:
        print("Failed:", response.status_code)

df = pd.DataFrame(all_data)

df.to_csv("data/raw_nyc311.csv", index=False)

print("\n================================")
print("DOWNLOAD COMPLETE")
print("Total records:", len(df))
print("Total columns:", len(df.columns))
print("================================")