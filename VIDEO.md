# Video script, about 2:45

The rubric wants purpose, impact, functionality, and a live demonstration of the
project in use. Record the demo in one take if you can, because judges can tell
when a demo is real.

Before recording, open https://safe-routes-la.github.io and let the graph
finish loading, then reload once so it is warm. If you have opened the site
before, hard refresh with Ctrl+Shift+R so you are not running a cached older
version.

Screen record at 1920x1080 with the sidebar visible. Face cam off unless the
competition asks for it. The map is the thing worth watching.

---

## 0:00 to 0:25, the number

On screen: the Method tab, with 1,026 filling the panel.

> Between 2020 and 2024, one thousand and twenty-six kids between ten and
> eighteen were robbed on the streets of Los Angeles during school commute
> hours. That is fifty-six percent of every robbery of a kid that age, packed
> into about five hours of the day.
>
> Those five hours are the walk to school and the walk home.

Say it and stop. Do not oversell it. The number does the work.

---

## 0:25 to 0:45, why nobody solves it

> Every map app will give that kid the shortest way to school. None of them will
> give them the safest one.
>
> The federal Safe Routes to School program has existed since 1971, and it is
> almost entirely about cars. Crosswalks, speed bumps, crossing guards. But ask
> an LA teenager what they are actually scared of on the walk home and they will
> not say traffic.

---

## 0:45 to 1:50, the demo

This is the most important minute in the video. Do it live.

1. Type a school name. Let the autocomplete fill it in.
2. Type a real address into the second field. Let the lookup resolve it.
3. Hit compare.

> It gives me three routes, not one, because there is no single right answer
> about how much detour a walk is worth. Shortest, balanced, safest.

4. Click through the three cards so the line on the map changes.

> And then it explains itself, which is the part I care about most. It is not
> just drawing me a green line. It says: skips five hundred and fifty metres of
> South Fairfax Avenue, which scores sixty-five at this hour, goes along Venice
> Boulevard instead, at twenty, costs you three minutes, and total exposure
> drops fifty percent.
>
> That is an argument I can check, not a suggestion I have to trust.

5. Scroll to the hour comparison.

> Same path, scored at every hour of the day. Risk is not a property of a place
> on its own, it is a property of a place at an hour.

6. Open the street by street list.

> And it names every street, so you can actually follow it while you walk.

7. Switch to the School tab, pick a school, run the report.

> This is the other half. One route only helps one student. This scores all
> sixteen directions a student might walk in from. Approaching this school from
> the south southeast means two and a half times the exposure of coming in from
> the east northeast.
>
> That is a sentence a principal can act on. It says where to put a crossing
> guard.

8. Zoom out to show the risk layer over the city.

> Four hundred and thirty-one thousand blocks, every one of them scored.

---

## 1:50 to 2:25, how it works

On screen: the Method tab. Cut briefly to `validate.py` output showing PASS.

> This runs on eighty-five thousand real violent crime records from the LAPD
> open data portal, a hundred and twenty-eight thousand streetlights, and the
> whole walkable street network of central LA.
>
> The filtering mattered more than the modelling. Out of about a million raw
> records I keep only crimes that threaten someone walking down a street, and
> only the ones that happened in public space. That second filter alone drops
> eighty-one thousand indoor incidents. Domestic violence is real and serious,
> and it is also not a hazard of walking past a building. Leaving it in would
> have labelled ordinary residential neighbourhoods as dangerous to walk
> through, and that is the kind of mistake that does actual harm to the
> neighbourhoods this is supposed to help.
>
> Crimes against children count triple, because a crime against a thirteen year
> old tells you more about the risk to a thirteen year old than a crime against
> an adult does.
>
> The routing is A-star, minimising length times one plus lambda times risk to
> the one point five. Because every block multiplier is at least one, straight
> line distance never overestimates what is left to walk, so the heuristic is
> admissible and the route is provably the cheapest one rather than a good
> guess. I check that against Dijkstra in the repo and the costs come out
> identical.

If you have room, mention the surprise:

> One thing I did not expect. Divide incidents by how long each time window
> lasts and the afternoon walk home turns out to be the worst hour of a
> student's day, worse hour for hour than after dark.

---

## 2:25 to 2:45, scale and close

> There is no backend. The graph is precomputed and the router runs in your
> browser, so this deploys as static files and costs nothing to host. Any city
> can run its own copy for free.
>
> And one bounding box in a config file is the only Los Angeles specific thing
> in it. Chicago, New York, Seattle, Toronto, London, they all publish the same
> kind of open incident data. Pointing this at any of them is configuration, not
> a rewrite.
>
> Walking is the most basic form of transportation there is, and for a lot of
> students it is the only one they have. This makes it safer.

---

## Notes

Show the live site rather than localhost, because a public URL reads as
finished work.

Cut the loading bar. Nobody needs to watch 5 MB arrive.

If you show code, show the risk model in `build_graph.py` or the validation
output. Skip the boilerplate.

Say the limitations out loud if you have time. The Method tab lists them.
Judges trust a project more when it tells them what it cannot do, and it costs
you about eight seconds.
