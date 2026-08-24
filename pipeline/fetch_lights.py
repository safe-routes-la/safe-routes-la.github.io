"""Download streetlight points from the LA Bureau of Street Lighting service.

The Socrata mirror of this dataset returns empty rows over the SODA API, so we
go to the city's own ArcGIS MapServer instead. Geometry only -- we just need
"is this block lit", not the lamp's wattage.
"""
import json, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

LAYER = ("https://maps.lacity.org/lahub/rest/services/"
         "Bureau_of_Street_Lighting/MapServer/0/query")
PAGE = 2000


def get(params):
    url = LAYER + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return json.load(r)
        except Exception as ex:
            if attempt == 3:
                raise
            print(f"    retry {attempt+1}: {ex}", flush=True)
            time.sleep(5 * (attempt + 1))


def main():
    os.makedirs(C.RAW, exist_ok=True)
    b = C.BBOX
    envelope = f"{b['west']},{b['south']},{b['east']},{b['north']}"
    base = {
        "where": "1=1",
        "geometry": envelope,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }

    total = get({**base, "returnCountOnly": "true"}).get("count", 0)
    print(f"{total:,} streetlights in study area", flush=True)

    pts, offset = [], 0
    while offset < total:
        res = get({**base, "resultOffset": offset, "resultRecordCount": PAGE})
        feats = res.get("features", [])
        if not feats:
            break
        for ft in feats:
            g = ft.get("geometry") or {}
            if "y" in g and "x" in g:
                pts.append([round(g["y"], 6), round(g["x"], 6)])
        offset += len(feats)
        print(f"  {len(pts):,}/{total:,}", flush=True)
        if len(feats) < PAGE and not res.get("exceededTransferLimit"):
            break

    path = os.path.join(C.RAW, "streetlights.json")
    with open(path, "w") as f:
        json.dump(pts, f, separators=(",", ":"))
    print(f"wrote {len(pts):,} points -> {path}")


if __name__ == "__main__":
    main()
