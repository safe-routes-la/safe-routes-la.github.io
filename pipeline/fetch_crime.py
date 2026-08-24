"""Download street-space violent crime incidents from the LAPD open dataset.

Source: data.lacity.org resource 2nrs-mtv8 ("Crime Data from 2020 to Present").
LAPD froze this dataset when it migrated to NIBRS, so it is a stable, complete
2020-01-01 .. 2024-12-30 record -- good for a reproducible model.
"""
import json, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

PAGE = 50000


def soql_where():
    crime = " OR ".join(f"crm_cd_desc like '%{p}%'" for p in C.CRIME_PATTERNS)
    prem  = " OR ".join(f"premis_desc like '%{p}%'" for p in C.PREMISE_PATTERNS)
    box = (f"lat >= {C.BBOX['south']} AND lat <= {C.BBOX['north']} AND "
           f"lon >= {C.BBOX['west']} AND lon <= {C.BBOX['east']}")
    # (0,0) is LAPD's null island for redacted/unknown locations.
    return f"({crime}) AND ({prem}) AND ({box}) AND lat != 0"


def fetch():
    fields = "dr_no,date_occ,time_occ,crm_cd_desc,premis_desc,vict_age,lat,lon,area_name"
    where = soql_where()
    rows, offset = [], 0
    while True:
        qs = urllib.parse.urlencode({
            "$select": fields, "$where": where,
            "$limit": PAGE, "$offset": offset, "$order": "dr_no",
        })
        url = f"{C.SOCRATA_CRIME}?{qs}"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=180) as r:
                    batch = json.load(r)
                break
            except Exception as e:
                if attempt == 3:
                    raise
                print(f"  retry {attempt+1} after {e}", flush=True)
                time.sleep(3 * (attempt + 1))
        rows.extend(batch)
        print(f"  fetched {len(rows):,}", flush=True)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


if __name__ == "__main__":
    os.makedirs(C.RAW, exist_ok=True)
    print("Querying LAPD crime data...", flush=True)
    rows = fetch()
    path = os.path.join(C.RAW, "crime.json")
    with open(path, "w") as f:
        json.dump(rows, f)
    print(f"wrote {len(rows):,} incidents -> {path}", flush=True)
