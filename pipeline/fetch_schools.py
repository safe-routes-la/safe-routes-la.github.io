"""Extract in-bbox public schools from the CA Dept of Education directory.

CDE publishes a tab-delimited statewide directory with lat/lon for every
public school -- more complete than the LAUSD-only city layer because it
also carries charters and magnets, which plenty of kids walk to.
"""
import csv, json, os, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

RAW_PATH = os.path.join(C.RAW, "cde_schools.txt")

# Grade levels whose students actually walk themselves to school.
KEEP_LEVELS = {"Elementary", "Intermediate/Middle/Junior High", "High School",
               "Elementary-High Combination", "Junior High"}


def download():
    if os.path.exists(RAW_PATH) and os.path.getsize(RAW_PATH) > 1_000_000:
        return
    print("downloading CDE school directory...", flush=True)
    urllib.request.urlretrieve(C.CDE_SCHOOLS, RAW_PATH)


def parse():
    out = []
    with open(RAW_PATH, encoding="utf-8", errors="replace", newline="") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            if r.get("StatusType") != "Active":
                continue
            if r.get("EILName") not in KEEP_LEVELS:
                continue
            name = (r.get("School") or "").strip()
            if not name or name == "No Data":
                continue
            try:
                lat, lon = float(r["Latitude"]), float(r["Longitude"])
            except (TypeError, ValueError):
                continue
            if not C.in_bbox(lat, lon):
                continue
            out.append({
                "id":   r["CDSCode"],
                "name": name,
                "lat":  round(lat, 6),
                "lon":  round(lon, 6),
                "level": r["EILName"],
                "district": (r.get("District") or "").strip(),
                "city": (r.get("City") or "").strip(),
                "grades": (r.get("GSserved") or "").strip(),
            })
    return out


if __name__ == "__main__":
    os.makedirs(C.RAW, exist_ok=True)
    download()
    schools = parse()
    schools.sort(key=lambda s: s["name"])
    path = os.path.join(C.OUT, "schools.json")
    os.makedirs(C.OUT, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(schools, f)
    print(f"{len(schools):,} schools in study area -> {path}")
    from collections import Counter
    for lvl, n in Counter(s["level"] for s in schools).most_common():
        print(f"   {n:5}  {lvl}")
