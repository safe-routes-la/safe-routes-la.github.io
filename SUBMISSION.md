# YCS "Code for Transportation" — submission answers

Fill in team name / members, then paste the rest into the Google Form.

---

## Team name
`<fill in>`

## Team members
`<fill in>`

---

## Project description

**Safe Routes to School — risk-aware walking directions for LA students**

Between 2020 and 2024, 1,838 children aged 10–18 were robbed on the streets of
Los Angeles. 1,026 of them — 56% — were robbed during school commute hours.
Every mapping app in the world will give a kid the shortest way to school. None
of them will give them the safest one.

We built the one that does.

Pick a school and a starting point, and the app computes two walking routes: the
shortest one, and the one that minimises exposure to violent street crime. Then
it tells you what the tradeoff actually costs — *"walking 4 minutes longer cuts
your exposure by 61%."*

**How it works.** We pulled 85,634 violent-crime incidents from the LAPD open
data portal, 128,534 streetlight locations from the LA Bureau of Street
Lighting, 668 school locations from the California Department of Education, and
the full walkable street network of central Los Angeles from OpenStreetMap.

The filtering is where most of the thinking went. Out of roughly a million raw
LAPD records we keep only incidents that describe a threat to someone *walking
down a street* — robbery, assault, threats, brandishing — and only those that
occurred in public pedestrian space. That premise filter alone drops ~81,000
incidents that happened inside homes. Domestic violence is real and serious, but
it is not a walking-route hazard, and including it would have mislabelled dense
residential neighbourhoods as dangerous to walk through.

Each surviving incident is weighted by severity, by recency (2.5-year
exponential half-life), and — critically — by whether the victim was a child.
A crime against a 13-year-old predicts danger to a 13-year-old better than a
crime against an adult does, so juvenile-victim incidents count triple.

Incidents are split into three time-of-day buckets and spread as Gaussian
kernels with a 120 m bandwidth, chosen to match the block-level uncertainty in
LAPD's geocoding rather than to imply precision we don't have. Every street
segment is sampled every 25 m and scored, then rank-normalised, so a score of
0.9 means "worse than 90% of blocks in LA" — something a parent can act on.
Streetlight density earns a block up to a 35% risk reduction; arterial roads
take a penalty.

Routing is A\* run entirely in the browser, minimising
`length × (1 + λ · risk^1.5)`, where λ is a slider the user controls from
"shortest walk" to "safest walk." Because every edge multiplier is at least 1,
straight-line distance is an admissible heuristic — so the route returned is
provably optimal, not an approximation. There is no backend: the graph is
precomputed offline, so the whole thing deploys as static files and costs
nothing to run.

**Why it matters for transportation.** The federal Safe Routes to School program
has existed since 1971 and is almost entirely about cars — crosswalks, speed
bumps, crossing guards. But ask an LA teenager what they're actually afraid of
on the walk home and they won't say traffic. Walking is the most basic mode of
transportation there is, and for a lot of students it's the only one they have.
If the walk doesn't feel safe, kids stop walking — which pushes them into cars,
onto worse schedules, or into missing school. Making the walk safer is a
transportation problem, and it's one that public data can actually solve.

The same pipeline runs on any city that publishes geocoded incident data.

---

## Video link
`<fill in — check sharing is set to "anyone with the link">`

Script and shot list: see VIDEO.md

## Code link
https://github.com/adrian-erlikhman/safe-routes-to-school

(Public. Live site: https://adrianerlikhman.is-a.dev/safe-routes-to-school/)

## Parental consent
Yes
