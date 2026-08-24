# Video script — ~2:45

The rubric wants purpose, impact, functionality, **and a live demonstration**.
Record the demo in one unbroken take if you can; judges notice when a demo is
real. Screen-record at 1920×1080 with the sidebar visible.

Before recording: open <https://adrianerlikhman.is-a.dev/safe-routes-to-school/>
and let the graph finish loading, then reload once so it's warm and the
progress bar is quick.

---

## 0:00 — 0:25 · The number

> "Between 2020 and 2024, one thousand and twenty-six kids between the ages of
> ten and eighteen were robbed on the streets of Los Angeles during school
> commute hours. That's fifty-six percent of every robbery of a kid in that age
> range — more than half — packed into about five hours of the day.
>
> Those five hours are the walk to school, and the walk home."

**On screen:** the "Why it matters" tab, with `1,026` filling the panel.

Say it plainly and stop. Don't oversell — the number does the work.

---

## 0:25 — 0:50 · Why nobody solves this

> "Every map app in the world will give that kid the *shortest* way to school.
> None of them will give them the *safest* one.
>
> The federal Safe Routes to School program has existed since 1971, and it's
> almost entirely about cars — crosswalks, speed bumps, crossing guards. But
> ask an LA teenager what they're actually afraid of on the walk home, and they
> won't say traffic."

**On screen:** scroll the "Why it matters" tab through the SDG list.

---

## 0:50 — 1:50 · The demo (the part that matters most)

Pick a school with a genuinely bad surrounding area so the contrast is visible.
Do this live:

1. Type a school name — let the autocomplete fill in.
2. Click a starting point about a kilometre away.
3. Both routes appear instantly.

> "Green is the safest route. The dotted amber line is the shortest one — what
> your phone would have told you.
>
> Here, walking three minutes longer cuts exposure to violent street crime by
> half. The worst block on the shortest route scores 0.65 out of 1. On the safe
> route, 0.28."

4. **Switch the time of day to "After dark."** The routes change.

> "This is the part I'm most proud of. Risk isn't a property of a place — it's a
> property of a place *at an hour*. The safest way home at six in the evening
> is not the safest way at eight in the morning. Seventy-eight thousand blocks
> in this model change meaningfully between morning and night."

5. **Drag the detour slider** from "shortest" to "safest."

> "And there's no single right answer, so the tool doesn't pretend there is.
> You decide how much detour is worth it."

6. Zoom out to show the heatmap over the whole city.

> "That's every block in central Los Angeles, scored — four hundred and
> thirty-one thousand of them."

---

## 1:50 — 2:25 · How it works

> "This runs on 85,634 real violent-crime incidents from the LAPD open data
> portal, 128,534 streetlights from the Bureau of Street Lighting, and the
> entire walkable street network of central LA.
>
> The filtering mattered more than the modelling. Out of about a million raw
> records, I kept only crimes that threaten someone *walking down a street*,
> and only the ones that happened in public space — that last filter alone
> drops eighty-one thousand indoor incidents. Domestic violence is real and
> serious, but it isn't a walking-route hazard, and leaving it in would have
> labelled ordinary residential neighbourhoods as dangerous to walk through.
>
> Crimes against children count triple, because a crime against a thirteen-
> year-old predicts danger to a thirteen-year-old better than a crime against
> an adult does.
>
> The routing is A-star, minimising length times one plus lambda times risk to
> the one-point-five. Because every edge multiplier is at least one,
> straight-line distance never overestimates the remaining cost — so the
> heuristic is admissible and the route is *provably* optimal, not just
> plausible. I verify that against Dijkstra in the repo."

**On screen:** the "How it works" tab, then cut briefly to `validate.py`
output showing `MATCH ... -> PASS`.

---

## 2:25 — 2:45 · Scale, and close

> "There's no backend. The graph is precomputed and the router runs in your
> browser, so this deploys as static files and costs nothing to host — which
> means any city can run its own copy for free.
>
> And nothing here is specific to Los Angeles except one bounding box in a
> config file. Chicago, New York, Seattle, Toronto, London — they all publish
> the same kind of open incident data. Pointing this at any of them is a
> configuration change, not a rewrite.
>
> Walking is the most basic form of transportation there is, and for a lot of
> students it's the only one they have. This makes it safer."

---

## Recording notes

- **Show the live site, not localhost.** A public URL reads as finished work.
- Don't narrate the loading bar. Cut it.
- If you show code, show `build_graph.py`'s risk model or `validate.py`'s
  output — not boilerplate.
- Mention the limitations honestly if you have room; the "How it works" tab
  lists them. Judges trust a project more when it states what it can't do.
- Keep your face-cam off unless the competition wants it. The map is the star.
