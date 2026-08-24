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

**Safe Routes to School** / https://safe-routes-la.github.io

Between 2020 and 2024, 1,838 children aged 10 to 18 were robbed on the streets
of Los Angeles, and 1,026 of those robberies happened during school commute
hours. That is 56% of them inside about five hours of the day, on blocks that
the city already publishes in its open data. No map app routes around them.
Safe Routes to School does. You pick a school, type your address, and get three
routes with the tradeoff written out: skips 552 m of South Fairfax Avenue,
which scores 65 at this hour, goes along Venice Boulevard instead at 20, costs
you three minutes, cuts total exposure in half. You can check that reasoning
instead of having to trust it.

Buses change the problem, because minutes spent on board are minutes off the
street. Going from Exposition and Normandie up to LACES takes 118 minutes and
9.3 km of sidewalk on foot, while Route 206 changing to Route 33 takes 40
minutes with 750 m of walking and cuts exposure by 80%. We plan one transfer,
and we charge for waiting, since a minute standing at a stop costs the same as
80 m of walking on that block. Splitting the data by hour also turned up
something we were not looking for. Per hour, the afternoon walk home is worse
than after dark, 4,246 incidents against 3,804, which makes the most dangerous
hour of a student's day the one nobody supervises.

The model runs on 85,634 violent incidents, 128,534 streetlights, 5,395 transit
stops and 431,599 scored blocks, and most of the judgement went into filtering
rather than into the maths. Out of a million LAPD records we keep only offences
that threaten someone walking, and only those that happened in public space,
which drops 81,000 indoor incidents. Domestic violence is serious and it is
also not a hazard of walking past a building, so counting it would have branded
ordinary residential neighbourhoods dangerous and damaged the places this is
meant to help. Crimes against children count triple. Routing is A* minimising
length times (1 + lambda times risk to the 1.5), and since every block
multiplier is at least 1, straight line distance never overestimates what is
left to walk. That makes the heuristic admissible, so each route is provably
the cheapest one rather than a good guess, and `validate.py` confirms it
against Dijkstra with the costs coming out identical.

There is no server behind any of this. The scored graph is built offline and
packed into a 5 MB binary, so the router runs in the browser and the site costs
nothing to keep online, which means a city could run its own copy for free. One
bounding box in a config file is the only Los Angeles specific thing in the
codebase, and Chicago, Seattle, Toronto and London all publish incident data in
a compatible shape. The work touches SDG 11 on safe transport for children,
SDG 4 on safe access to education, SDG 16 on ending violence against children,
and SDG 10, because the students carrying this risk are the ones without a car
or a ride. We are equally clear about the limits: reported crime is not all
crime, locations are rounded to protect victims, and the data stops in December
2024. This is a second opinion about a walk rather than a promise about one.
For a lot of students, walking is the only transport they have, and we made it
safer.

---

## Video link

`fill in, and check sharing is set to anyone with the link`

## Code link

https://github.com/safe-routes-la/safe-routes-la.github.io

## Parental consent

Yes
