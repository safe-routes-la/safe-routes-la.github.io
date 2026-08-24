"""Shared configuration for the Safe Routes pipeline."""
import os

# ---------------------------------------------------------------- study area
# Central / West / South Los Angeles. Covers Mid-City, Koreatown, Downtown,
# Hollywood, South LA, Culver City -- ~250 sq mi of dense walk-to-school area.
BBOX = dict(south=33.920, west=-118.500, north=34.140, east=-118.180)

# ------------------------------------------------------------------- sources
SOCRATA_CRIME = "https://data.lacity.org/resource/2nrs-mtv8.json"
CDE_SCHOOLS   = "https://www.cde.ca.gov/schooldirectory/report?rid=dl1&tp=txt"
OVERPASS      = "https://overpass-api.de/api/interpreter"

# Crimes that represent a threat to someone *walking down a street*.
# Deliberately excludes property crime, fraud, and domestic/indoor offenses:
# those inflate the risk surface without describing pedestrian danger.
CRIME_PATTERNS = [
    "ROBBERY", "ASSAULT", "CRIMINAL THREATS", "SNATCHING", "BRANDISH",
    "KIDNAPPING", "SHOTS FIRED", "DISCHARGE FIREARMS", "LEWD", "INDECENT EXPOSURE",
]

# Only incidents in public pedestrian space -- the places a route can send you.
PREMISE_PATTERNS = [
    "STREET", "SIDEWALK", "ALLEY", "BUS STOP", "PARK", "DRIVEWAY",
    "TUNNEL", "UNDERPASS", "VACANT LOT", "PEDESTRIAN",
]

# --------------------------------------------------------------- risk weights
# Severity multipliers -- an armed robbery should not count the same as a
# verbal threat when deciding whether to route a 12-year-old down a block.
SEVERITY = {
    "ASSAULT WITH DEADLY WEAPON, AGGRAVATED ASSAULT": 3.0,
    "SHOTS FIRED AT INHABITED DWELLING":              3.0,
    "DISCHARGE FIREARMS/SHOTS FIRED":                 3.0,
    "KIDNAPPING":                                     3.0,
    "ROBBERY":                                        2.5,
    "ATTEMPTED ROBBERY":                              2.0,
    "PURSE SNATCHING":                                2.0,
    "BRANDISH WEAPON":                                2.0,
    "BATTERY - SIMPLE ASSAULT":                       1.5,
    "CRIMINAL THREATS - NO WEAPON DISPLAYED":         1.0,
}
DEFAULT_SEVERITY = 1.5

# A crime against a 13-year-old predicts danger to a 13-year-old better than a
# crime against an adult does. Weight juvenile-victim incidents accordingly.
JUVENILE_WEIGHT = 3.0
JUVENILE_AGE    = (5, 18)

# Exponential recency decay: a 2024 incident outweighs a 2020 one.
RECENCY_HALFLIFE_YEARS = 2.5
REFERENCE_YEAR = 2025.0

# Kernel density: how far a single incident's influence reaches along a street.
KERNEL_BANDWIDTH_M = 120.0

# Protective factor: streetlights reduce modelled risk, capped so that a
# well-lit block in a high-crime area never scores as "safe".
LIGHT_RADIUS_M   = 60.0
LIGHT_MAX_CREDIT = 0.35

# ---------------------------------------------------------------------- paths
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Bulk downloads are cached but never committed; `data/` holds only the small
# derived artefacts the site actually serves, so GitHub Pages can publish the
# repository root directly with no build step.
RAW  = os.path.join(ROOT, ".cache")
OUT  = os.path.join(ROOT, "data")

def in_bbox(lat, lon):
    return (BBOX["south"] <= lat <= BBOX["north"]
            and BBOX["west"] <= lon <= BBOX["east"])
