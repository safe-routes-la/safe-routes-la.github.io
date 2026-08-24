# Safe Routes to School — Los Angeles

**Walking directions for LA students that route around the streets where kids
actually get hurt.**

### → [adrianerlikhman.is-a.dev/safe-routes-to-school](https://adrianerlikhman.is-a.dev/safe-routes-to-school/)

No install, no backend, no API key. 431,599 blocks of Los Angeles scored for
risk, routed in your browser in under 10 ms.

Every map app in the world will give a child the *shortest* way to school.
None of them will give them the *safest* one. This does.

---

## The problem

Between 2020 and 2024, **1,838 children aged 10–18 were robbed on the streets
of Los Angeles.** 1,026 of them — **56%** — were robbed during school commute
hours: 6:30–9:00 a.m. or 2:00–6:00 p.m.

That is not a coincidence. It is a predictable, repeating, *geographic* pattern,
and it happens on a small number of identifiable blocks. Those blocks are in the
public record. Nobody routes around them.

The federal Safe Routes to School program has existed since 1971 and focuses
almost entirely on **cars** — crosswalks, speed bumps, crossing guards. But when
you ask an LA teenager what they're actually afraid of on the walk home, they
don't say traffic. This project models the threat they *do* name.

## What it does

Pick a school and a starting point. The app computes two walking routes:

- the **shortest** route — what Google Maps hands you
- the **safest** route — the path that minimises exposure to violent street crime

…then tells you exactly what the tradeoff costs. A real result, walking to
LACES in Mid-City after dark: *"Walking 3 minutes longer cuts exposure to
violent street crime by 50%."* The worst block on the shortest route scores
0.65; on the safe route, 0.28.

Three things make the answer non-obvious:

1. **Time of day matters.** The risk surface is computed separately for the
   morning walk, the afternoon walk, and after dark. Morning and after-dark
   risk correlate at 0.90 overall — but **78,669 blocks differ by more than
   0.15** between them, which is more than enough to change a route.
2. **Who the victim was matters.** A crime against a 13-year-old predicts danger
   to a 13-year-old far better than a crime against an adult does. Incidents
   with juvenile victims are weighted 3× in the model.
3. **You choose the tradeoff.** A slider runs from "shortest walk" to "safest
   walk." There is no single correct answer — a 20-minute detour is not always
   worth it, and the tool refuses to pretend otherwise.

## How it works

### Data

| Source | What we take | Records |
|---|---|---|
| [LAPD Crime Data 2020–2024](https://data.lacity.org/Public-Safety/Crime-Data-from-2020-to-Present/2nrs-mtv8) (`data.lacity.org`) | Violent incidents in public pedestrian space | 85,634 |
| [LA Bureau of Street Lighting](https://maps.lacity.org/lahub/rest/services/Bureau_of_Street_Lighting/MapServer) | Streetlight point locations | 128,534 |
| [CA Dept. of Education directory](https://www.cde.ca.gov/ds/si/ds/pubschls.asp) | Public school locations | 668 in area |
| [OpenStreetMap](https://www.openstreetmap.org) via Overpass | Walkable street network | 431,599 blocks |

**Filtering is where most of the modelling judgement lives.** The raw LAPD feed
contains ~1M incidents; we keep only those that describe a threat to a person
*walking down a street*:

- **Offence filter** — robbery, assault, ADW, criminal threats, brandishing,
  kidnapping, indecent exposure. Property crime, fraud, and vehicle theft are
  excluded: a stolen catalytic converter tells you nothing about whether a child
  is safe on that block.
- **Premise filter** — street, sidewalk, alley, bus stop, park, underpass.
  This is the important one. It drops ~81,000 incidents that occurred inside
  homes and apartments. Domestic violence is a real and serious problem, but it
  is *not* a walking-route hazard, and including it would systematically
  mislabel dense residential neighbourhoods as dangerous to walk through.

### The risk model

Each surviving incident gets a weight:

```
w = severity × juvenile_multiplier × recency_decay
```

- **severity** — armed robbery (2.5) and ADW (3.0) count for more than a
  verbal threat (1.0)
- **juvenile_multiplier** — 3.0 if the victim was 5–18
- **recency_decay** — exponential, 2.5-year half-life, so 2024 outweighs 2020

Incidents are split into three time buckets (morning / afternoon / after dark)
and each becomes a **Gaussian kernel** with a 120 m bandwidth. Every street
segment is sampled every 25 m, and each sample sums the kernels around it —
so risk decays smoothly with distance instead of stopping at an arbitrary
administrative boundary.

Two normalisation choices do a lot of work here:

**Per-hour rates, not raw counts.** The buckets cover unequal spans — "after
dark" is 12 hours and would look worst simply for being longest. Dividing by
span surfaces something genuinely surprising:

| Bucket | Incidents | Span | **Per hour** |
|---|---|---|---|
| Morning (05–10) | 10,261 | 5 h | 2,052 |
| **Afternoon (10–17)** | 29,721 | 7 h | **4,246** |
| After dark (17–05) | 45,652 | 12 h | 3,804 |

The **afternoon walk home is the most dangerous hour of a student's day** —
worse, hour for hour, than after dark. That is exactly the 2–6 p.m. window the
robbery statistic points at, and it falls straight out of the data.

**Pooled ranking.** Raw kernel values are unitless, so scores are
rank-normalised into 0–1 — 0.9 means "worse than 90% of blocks." But the ranking
is computed against the *pooled* distribution of all three buckets rather than
each bucket separately. Normalising per bucket forces all three to an identical
marginal distribution, silently erasing the fact that some hours are genuinely
more dangerous — which is the entire point of having buckets. Pooling keeps them
comparable: 0.7 means the same absolute danger at 8 a.m. as at 9 p.m.

Then two adjustments:

- **Streetlight credit** — up to −35%, capped so a well-lit block in a
  high-crime area never scores as genuinely safe
- **Road-type penalty** — walking an eight-lane arterial is worse than a
  residential street at equal crime counts; alleys are penalised, footpaths
  and pedestrian streets get a small credit

### Routing

The street network is cut into edges at genuine intersections (shared OSM node
IDs, not coordinate rounding), reduced to its largest connected component, and
shipped to the browser with a risk score per time bucket baked into every edge.

Routing is **A\*** run client-side, minimising:

```
cost(edge) = length × (1 + λ · risk^1.5)
```

where λ comes from the slider. The `risk^1.5` exponent means mildly-elevated
blocks are tolerated while genuinely bad ones are avoided hard — a linear
penalty produces mushy routes that dodge everything a little and nothing much.

The heuristic is straight-line distance. Since every edge multiplier is ≥ 1,
the heuristic never overestimates the true remaining cost, so **A\* is
admissible here and the route returned is provably optimal**, not approximate.

There is no backend. The graph is precomputed offline and the entire router
runs in the browser, which means the whole thing deploys as static files and
costs nothing to host.

## Verification

Claiming a route is "optimal" is easy; `pipeline/validate.py` checks it.
It re-implements the browser's cost function in Python and compares A\*
against plain Dijkstra on random origin/destination pairs:

```
A* optimality vs Dijkstra (identical cost required):
  0: lam=0.0  bucket=am    cost=    1,607.0  settled dijkstra= 3,632 astar=   590  (16% of the work)  MATCH
  1: lam=2.0  bucket=pm    cost=    2,851.6  settled dijkstra= 4,922 astar= 1,327  (27% of the work)  MATCH
  2: lam=5.0  bucket=night cost=    3,501.8  settled dijkstra=   841 astar=   376  (45% of the work)  MATCH
  3: lam=0.0  bucket=am    cost=    1,884.0  settled dijkstra= 7,858 astar= 1,117  (14% of the work)  MATCH
  4: lam=2.0  bucket=pm    cost=    3,338.0  settled dijkstra= 9,203 astar= 2,874  (31% of the work)  MATCH
  5: lam=5.0  bucket=night cost=    2,090.3  settled dijkstra= 2,775 astar= 1,019  (37% of the work)  MATCH
  -> PASS
```

Identical costs confirm the heuristic is admissible; settling 14–45% of the
nodes confirms it is doing real work rather than degenerating to Dijkstra.

It also checks the model earns its keep — six random after-dark trips:

```
    1429 m ->   1452 m (+ 1.6%)   exposure      747 ->      603  (+19.2%)
    1785 m ->   1802 m (+ 1.0%)   exposure      276 ->      157  (+43.1%)
    1711 m ->   1815 m (+ 6.1%)   exposure      351 ->      239  (+31.9%)
    1568 m ->   1696 m (+ 8.2%)   exposure      562 ->      349  (+37.9%)
    1801 m ->   2183 m (+21.2%)   exposure      581 ->      237  (+59.3%)
    1371 m ->   1382 m (+ 0.8%)   exposure      810 ->      601  (+25.9%)
  -> exposure reduced on 6/6 trips
```

And that the time buckets are substantive, not decoration: morning and
after-dark risk correlate at 0.90, but **78,669 blocks differ by more than
0.15** between them.

## Running it

```bash
pip install numpy scipy
```

Fetch the source data (~100 MB, cached in `.cache/`, resumable):

```bash
python pipeline/fetch_crime.py && python pipeline/fetch_lights.py && python pipeline/fetch_schools.py && python pipeline/fetch_osm.py
```

Build the scored routing graph into `data/`:

```bash
python pipeline/build_graph.py && python pipeline/validate.py
```

Serve the site — it is static, so anything will do:

```bash
python -m http.server 8000
```

### Pointing it at another city

Change `BBOX` in `pipeline/config.py`, swap `SOCRATA_CRIME` for that city's
incident dataset, and re-run. Everything downstream — the kernel density, the
lighting credit, the graph build, the router — is city-agnostic.

## Repository layout

```
index.html  app.js        the entire front end; no build step, no framework
data/                     served artefacts: graph.bin.gz, schools.json, meta
pipeline/
  config.py               study area, crime filters, model weights
  fetch_crime.py          LAPD incidents via the Socrata SODA API
  fetch_lights.py         streetlights via the city's ArcGIS MapServer
  fetch_schools.py        CDE school directory
  fetch_osm.py            walkable street network, tiled + mirrored Overpass
  geo.py                  local planar projection
  build_graph.py          intersection splitting, risk model, binary packing
  validate.py             graph checks + the A* optimality proof above
```

## Honest limitations

We think stating these plainly makes the tool more useful, not less:

- **Reported crime is not all crime.** Under-reporting varies by neighbourhood
  and by immigration status, so a low score can partly reflect low reporting
  rather than genuine safety.
- **Crime data is geocoded to the block, not the address** — LAPD rounds
  locations for privacy. The 120 m kernel bandwidth is chosen to match roughly
  that uncertainty rather than to imply precision we don't have.
- **The dataset ends in December 2024**, when LAPD migrated to NIBRS. It is a
  complete and stable five-year record, but it is not live.
- **This does not replace judgement.** It is a second opinion about a walk, not
  a guarantee about one, and a "safe" route through an empty street at night may
  still be worse than a busier one the model scores higher.
- **Risk is relative to Los Angeles.** A 0.2 score means "quiet by LA
  standards," which is not the same as "quiet."

## Data & credits

Crime data © City of Los Angeles, published under the LA Open Data terms.
Street network © OpenStreetMap contributors, ODbL. Basemap © CARTO.
School directory © California Department of Education.
