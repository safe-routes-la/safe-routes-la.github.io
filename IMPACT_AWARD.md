# YCS Impact Award: draft answers

Form: https://forms.gle/wPg5yoMKnZKYvHnS6 (from the 3 September 2026 email).
The award is monthly and tied to the month of the competition, so this entry is
for **August 2026**.

Everything in `[brackets]` is a fact only the team can supply. Fill or delete
it before pasting. Word counts are for the text as written, brackets included.

---

## What are some new features or improvements your project has had since the competition? (100 word min)

Since the competition we have kept shipping. The whole interface is now
available in Spanish with one tap, including the route explanations, the bus
directions and the school report, because most LAUSD families speak Spanish at
home and a safety tool a parent cannot read is not a safety tool. Any route can
be printed as a one-page walking card, the streets in order with each block's
score, for a student who does not carry a phone. A school can paste a two-line
snippet into its own website, or send a link, that opens the planner with that
school already chosen. The site installs to a home screen and keeps working with
no data connection after the first visit, since the 5 MB scored graph and the
router live on the device. Every route has a report-a-problem link that opens a
pre-filled issue, and we removed our last CDN dependency so nothing about the
page relies on a third party staying up.

*(162 words)*

## What real-world impact has your project achieved so far? Specify any metrics. (150 word min)

The tool scores 431,599 blocks of central Los Angeles at three times of day,
from 85,634 violent incidents, 128,534 streetlights and 5,395 transit stops,
covering 668 public schools. On six random evening trips the validation script
reduced exposure on all six, by 19% to 59%, for detours ranging from under a
minute to 21 minutes. The worked example on the live site, a walk to LACES in
Mid City, halves exposure for three extra minutes. The transit version of a nine
kilometre trip from Exposition Park cuts exposure by 65% and is faster than
walking. The per-hour analysis surfaced something nobody had put in front of
us: the afternoon walk home is, hour for hour, more dangerous than after dark,
4,246 incidents per hour against 3,804, which is now the strongest argument we
have when we talk to a school. Since placing third, [we have shared the site
with N students and families at LACES / presented it to X / it was featured on
Y]. GitHub reports [N] unique visitors to the repository in the last two weeks
[Insights, then Traffic], and the site has been opened [N] times [if you add a
counter, see Next steps]. Every school in the study area now has its own link
and its own sixteen-direction report, and the whole thing is available in
Spanish, which is the language of [about 40%] of the families it is for.

*(235 words)*

## What are your next steps for expanding on the impact of your project? (150 word min)

Three directions. First, into schools rather than onto screens. The school
report scores all sixteen approaches to a campus and names the worst one; we
plan to run it for every LAUSD high school in the study area and hand each
principal a one-page result showing where a crossing guard, a lighting request
or a walking group would do the most good, starting with LACES and the campuses
around Mid City and Koreatown. Second, families. The Spanish version and the
printable cards exist for households without a phone or a data plan, so we want
to distribute cards through counsellors and parent centres at the start of the
[spring] semester and measure whether they get used. Third, make it someone
else's too. The only Los Angeles specific thing in the pipeline is one bounding
box, and Chicago, New York, Seattle, Toronto and London publish compatible data;
we will stand up a second city as proof, document the process, and invite
student teams elsewhere to run their own. Alongside that: refresh the data once
LAPD's new records feed is stable, add a privacy-respecting count of routes
planned so we can report real usage instead of estimates, and bring the
per-hour finding to LADOT's Safe Routes to School program, which today plans
almost entirely around traffic.

*(214 words)*

## How has YCS helped you grow your skills and what have you learned? (100 word min)

YCS gave us a deadline and a rubric, and both changed how we build. Technically
we went further than in any class: A* with a provable admissibility argument,
kernel density estimation over a street graph, LA Metro's GTFS feed reduced to
something a browser can plan with, a hand-packed binary format that turned
40 MB of JSON into 5 MB, and since then service workers and a full
translation layer. The bigger lesson was judgement. The most important
decisions in this project were about what to throw away, and explaining why
dropping 81,000 indoor incidents was the right call taught us that a model is
an argument you have to be able to defend out loud. The three-minute video
forced us to say what the project is in plain words, which is harder than the
code. And placing third, then being asked to show impact, pushed us from a
project that works to one that people can actually use: a version in the
language families speak, a card for a student without a phone, a page a school
can embed.

*(180 words)*

## Files to upload (up to 10, 10 MB each)

Screenshots in `docs/screenshots/` were taken in a sandbox with the basemap
tiles blocked, so they show routes on a blank ground. **Retake them on the live
site with the map behind them before uploading**, they will look far better.
Suggested set:

1. The Spanish route view, worked example (`spanish.png`).
2. Bus or rail options for a long trip (`bus.png`).
3. The school report for LACES (`school-report.png`).
4. The printed walking card (`walking-card.png`, or print to PDF from the site).
5. The phone layout (`phone.png`).
6. The embedded, school-preset version (`embed.png`).
7. The site loaded with no connection (`offline.png`).
8. The Code for Transportation results email or the certificate, if you
   requested one.
9. The competition video (already on Drive: "YCS VIDEO FINAL.mp4"), or a link
   to it in the comments box.

## Any additional comments?

Live site: https://safe-routes-la.github.io (Spanish:
https://safe-routes-la.github.io/?lang=es). Code:
https://github.com/safe-routes-la/safe-routes-la.github.io. Team: Adrian
Erlikhman, Ryan Erlikhman, Michael Tarekegn. We would be glad to be included in
the winner spotlight and to have the project featured on the YCS site.
