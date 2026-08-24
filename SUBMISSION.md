# YCS "Code for Transportation" submission

Fill in the team name and members, then paste the rest into the form.

- Live site: https://safe-routes-la.github.io
- Code: https://github.com/safe-routes-la/safe-routes-la.github.io
- Video script and shot list: `VIDEO.md`

---

## Team name

`fill in`

## Team members

Adrian Erlikhman, Michael `<surname>`

## Project description

**Safe Routes to School: walking directions for LA students that account for
where students actually get hurt**

Between 2020 and 2024, 1,838 children aged 10 to 18 were robbed on the streets
of Los Angeles. 1,026 of those robberies happened during school commute hours,
which is 56% of them inside about five hours of the day. Those robberies repeat
in specific places, and every one of those places is already published in the
city's open data. No map app routes around them.

Ours does. You pick a school, type where you start, and it offers three routes
with the tradeoff spelled out. Then it explains itself in words. A real result
walking to LACES in Mid City after dark: "Skips 552 m of South Fairfax Avenue,
which scores 65 at this hour. Goes along Venice Boulevard instead, at 20. Costs
you 3 minutes. Total exposure drops 50%." Underneath that you get the same route
scored at every hour of the day and a street by street list you can follow while
walking.

It also produces a school report, scoring all sixteen directions a student might
approach a school from. Walking into LACES from the south southeast in the
evening means 2.5 times the exposure of walking in from the east northeast. That
is the version a principal or a city council member can act on, because it says
where to put a crossing guard rather than what one student should do tomorrow.

**Walking or riding.** Buses change the problem rather than just the route,
because minutes on board are minutes off the street. Switch modes and the app
plans single-ride and one-transfer itineraries from LA Metro's published
schedule data: walk to a stop, wait, ride, walk the rest. A real trip from
Exposition and Normandie up to LACES takes 118 minutes and 9.3 km of sidewalk on
foot, against 40 minutes and 750 m on foot riding Route 206 then Route 33.
Exposure drops 80%, and it is faster.

Waiting is charged honestly. Standing at a stop is exposure without progress, so
a minute of waiting costs the same as 80 m of walking on that block, which is
deliberately above walking pace. A stop on a bad corner is not a safe place to
spend eight minutes. We stop at one transfer, because a second one adds another
wait to stand through and is advice nobody follows.

**Where the data comes from.** 85,634 violent incidents from the LAPD open data
portal, 128,534 streetlights from the Bureau of Street Lighting, 668 school
locations from the California Department of Education, 18,473 km of walkable street
from OpenStreetMap cut into 431,599 blocks, and 5,395 transit stops with 171
route patterns from LA Metro's GTFS feeds.

**What we threw away mattered more than what we kept.** The raw LAPD file holds
about a million records. We keep only offences that threaten someone walking
down a street, and only incidents that happened in public space. That second
filter drops roughly 81,000 records that happened indoors. Domestic violence is
serious and it is also not a hazard of walking past a building, so counting it
would have marked ordinary residential neighbourhoods as dangerous to walk
through. Getting that wrong would have done real damage to the neighbourhoods
this is supposed to help.

Incidents are weighted by severity, by recency on a 2.5 year half life, and by
whether the victim was a child. Crimes against children count triple, because a
crime against a 13 year old tells you more about the risk to a 13 year old than
a crime against an adult does.

**The finding we did not expect.** Splitting incidents by time of day only means
something once you divide by how long each window lasts. Per hour, the morning
runs at 2,052 incidents, the evening at 3,804, and the afternoon at 4,246. The
afternoon walk home is the worst hour of a student's day, worse hour for hour
than after dark, and it lines up exactly with the 2pm to 6pm window the robbery
figure points at. We were not looking for it.

**How the routing works.** A\* minimising length × (1 + λ · risk^1.5), run
across a ladder of seven λ values, keeping only the routes that genuinely
differ. Because every block multiplier is at least 1, straight line distance
never overestimates the remaining cost, so the heuristic is admissible and each
route is provably the cheapest one under that cost rather than an approximation.
`validate.py` checks this against Dijkstra on random pairs and the costs come
out identical while A\* settles 14% to 45% of the nodes.

The whole thing runs in the browser. The scored graph is built offline and
packed into a binary that ships pre-gzipped at 5.2 MB, so there is no server
behind the page and no cost to keeping it online.

**Why this is transportation work.** Walking is the most basic mode of transport
there is, and for a lot of students it is the only one they have. When the walk
stops feeling safe, students stop walking, which pushes them into cars, onto
worse schedules, or out of school altogether. The federal Safe Routes to School
program has existed since 1971 and deals almost entirely with cars. This deals
with the thing students actually name.

**Sustainable Development Goals.** The project addresses SDG 11 (targets 11.2 on
safe transport with attention to children and 11.7 on safe public space), SDG 4
(target 4.a on safe learning environments, since a commute a child is scared to
make keeps them out of school), SDG 16 (target 16.2 on ending violence against
children, using records institutions already publish), and SDG 10, because the
students carrying this risk are the ones without a car or a ride.

**Why it scales.** One bounding box in a config file is the only Los Angeles
specific thing in the codebase. The pipeline needs geocoded incident records,
school locations, and OpenStreetMap, which already covers the planet. Chicago,
New York, Seattle, Denver, Austin, Baltimore, Toronto and London all publish
incident data in a compatible shape, so pointing this at another city is
configuration rather than a rewrite. Since there is no backend and no per user
cost, any city can stand up its own copy for the price of static hosting, which
is nothing.

**What it cannot tell you**, stated in the app itself: reported crime is not all
crime and reporting rates vary between neighbourhoods, locations are rounded to
protect victims, the data stops in December 2024, and scores are relative to Los
Angeles. It is a second opinion about a walk rather than a promise about one.

---

## Video link

`fill in, and check sharing is set to anyone with the link`

## Code link

https://github.com/safe-routes-la/safe-routes-la.github.io

## Parental consent

Yes
