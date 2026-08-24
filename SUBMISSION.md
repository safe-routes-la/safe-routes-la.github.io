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

**Safe Routes to School**
https://safe-routes-la.github.io

**1,026 kids were robbed on the way to school.**

Between 2020 and 2024, 1,838 children aged 10 to 18 were robbed on the streets
of Los Angeles. 1,026 of those robberies happened during school commute hours.
Fifty-six percent of every robbery of a kid that age, crammed into five hours of
the day.

Every one of those blocks is already sitting in the city's public data. Not one
map app routes around them.

Ours does.

Pick a school, type your address, and you get three routes with the tradeoff
spelled out, plus the reason in plain English: *"Skips 552 m of South Fairfax
Avenue, which scores 65 at this hour. Goes along Venice Boulevard instead, at 20.
Costs you 3 minutes. Total exposure drops 50%."* That is an argument you can
check, not a suggestion you have to trust.

**Then we added the bus, and the numbers got serious.** Minutes on board are
minutes you are not on the street. From Exposition and Normandie to LACES,
walking is 118 minutes and 9.3 km of sidewalk. Route 206 changing to Route 33 is
40 minutes with 750 m on foot. **Exposure drops 80%, and it is faster.** We plan
one transfer, because two is advice nobody follows, and we charge you for
waiting: a minute at a stop costs the same as 80 m of walking on that block,
because standing still on a bad corner is exposure without progress.

**Built on 85,634 real crimes.** Plus 128,534 streetlights, 5,395 transit stops,
668 schools, and 431,599 blocks of Los Angeles, every single one scored.

The filtering is where the real work went. Out of a million LAPD records we keep
only what threatens someone walking, and only what happened in public space.
That drops 81,000 indoor incidents. Domestic violence is serious and it is also
not a hazard of walking past a building, and counting it would have branded
ordinary residential neighbourhoods as dangerous. That mistake would have hurt
the exact neighbourhoods this is for. Crimes against children count triple,
because a crime against a 13 year old tells you more about the risk to a 13 year
old.

**One thing we did not go looking for.** Divide incidents by how long each part
of the day lasts and the afternoon walk home comes out worst: 4,246 an hour
against 3,804 after dark. The most dangerous hour of a student's day is the one
nobody supervises.

**The engineering.** A\* over 431,599 blocks, minimising length x (1 + lambda x
risk^1.5). Every block multiplier is at least 1, so straight line distance never
overestimates what is left, the heuristic is admissible, and the route is
provably the cheapest one rather than a good guess. We prove it against Dijkstra
in the repo and the costs come out identical. Kernel density by grid
convolution, a custom binary format that turns 40 MB of JSON into 5 MB over the
wire, and the whole router running client side in under 10 ms.

**No server. No API keys. No hosting bill.** It is static files, so any city can
run its own copy for free, and one bounding box in a config file is the only Los
Angeles specific thing in the codebase. Chicago, New York, Seattle, Toronto and
London all publish the same open data.

It hits four UN Sustainable Development Goals: 11 on safe cities and transport
for children, 4 on safe access to education, 16 on ending violence against
children, and 10 on inequality, because the students carrying this risk are the
ones with no car and no ride.

And we tell you what it cannot do. Reported crime is not all crime. Locations
are rounded to protect victims. The data stops in December 2024. This is a
second opinion about a walk, not a promise about one.

Walking is the most basic transportation there is. For a lot of students it is
the only kind they have. We made it safer.

---

## Video link

`fill in, and check sharing is set to anyone with the link`

## Code link

https://github.com/safe-routes-la/safe-routes-la.github.io

## Parental consent

Yes
