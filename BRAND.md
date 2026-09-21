# WalkHome LA — brand spec

Every value here is measured, and the measurement is printed next to it. If you
change a colour, re-run the check in the section that governs it and put the new
number in. A spec whose numbers are decorative is worse than no spec.

The tokens themselves live in `:root` in `index.html`. This file explains *why*
each one is what it is; the stylesheet is the source of truth for *what*.

---

## The name

**WalkHome LA.** Not "Safe Routes to School" — that is the name of the federal
programme this project exists to argue against. From the Method tab:

> The federal Safe Routes to School program dates to 1971 and deals almost
> entirely with cars: crosswalks, speed bumps, crossing guards. Ask a student in
> Los Angeles what worries them on the walk home and traffic is rarely the
> answer.

Carrying that programme's name while making that argument was untenable.

"Walk**Home**" names the moment the data says is worst — the afternoon walk
home, at 4,246 incidents/hour against 3,804 after dark.

**The word "safe" is not used in the name, ever.** The printed card says this is
"a second opinion about a walk, not a guarantee", and a name that promises
safety contradicts the product's own disclaimer. "Safer" is acceptable in body
copy, because it is comparative and is literally what the router computes.

Written **WalkHome**, one word, capital W and H. Never "Walk Home", "Walkhome"
or "WALKHOME". The "LA" is a separate lockup element, not part of the word.

---

## Colour

Ground is `--paper` `#071118` — a cool near-black, so the risk layer is the only
bright thing on screen. A quiet block can fall nearly to the background and a
bad one can glow; that range is what the old cream ground could not give.

### Text, measured against the ground

| Token | Value | Contrast | Rating |
|---|---|---|---|
| `--ink` | `#dfe7ea` | 15.20:1 | AAA |
| `--accent` | `#35c8ff` | 9.85:1 | AAA |
| `--dim` | `#8aa0a8` | 6.96:1 | AA |
| `--faint` | `#6b8189` | 4.65:1 | AA |

`--faint` was `#63787f` until it was measured at **4.10:1** — below the 4.5:1
AA floor for normal text, on every note and section heading in the panel. It was
lifted until it passed. Do not darken it again.

### The risk ramp

Risk is a **magnitude, not a set of categories**. A green-amber-red ramp invents
category boundaries the data does not have, so the scale is one warm family with
stepped lightness. Warm because heat is how people already read a magnitude.

| Token | Value | L\* | Δ L\* | vs ground | Hue |
|---|---|---|---|---|---|
| `--r-1` | `#7d3612` | 31.9 | — | 2.18:1 | 20° |
| `--r-2` | `#a34a12` | 42.4 | +10.4 | 3.22:1 | 23° |
| `--r-3` | `#d87321` | 58.9 | +16.6 | 5.80:1 | 27° |
| `--r-4` | `#f0a03c` | 72.2 | +13.3 | 8.89:1 | 33° |
| `--r-5` | `#ffd08a` | 86.1 | +13.9 | 13.28:1 | 36° |

Three properties must hold, and all three are checkable:

1. **L\* rises at every step.** Non-monotone lightness makes two different risk
   values look equally severe.
2. **No step smaller than ~10 L\*.** Below that, adjacent bands stop being
   separable, including for most colour-vision deficiencies — the ramp is
   readable by lightness alone, so it does not depend on hue discrimination.
3. **The calmest band stays visible.** `--r-1` sits at 2.18:1, deliberately low:
   a quiet block should recede. But it must not vanish. The previously proposed
   `#6b2d10` measured 1.82:1, dimmer than the ramp it replaced, and was rejected.

### The route

`--accent` `#35c8ff`, hue **196°**. Every step of the risk ramp is between 20°
and 36°, so the route sits a **minimum of 160° away** from anything on the
scale. This is the one rule in the palette that is load-bearing for
correctness rather than taste: **nothing on the risk scale may ever be cool.**
If the route and a risk value could be confused, the map lies.

`--paper` on an `--accent` fill measures 9.85:1, so accent-filled buttons and
selected tabs carry legible dark text.

---

## Type

`Fraunces` for the wordmark and display figures, `IBM Plex Sans` for interface,
`IBM Plex Mono` for anything the eye scans as a column.

Scale, a 1.2 ratio from 11px, rounded to whole and half pixels so nothing lands
on a third of a pixel and blurs:

`--fs-micro` 11 · `--fs-small` 12.5 · `--fs-body` 14 · `--fs-lead` 15.5 ·
`--fs-title` 21 · `--fs-display` 30

### Figures are tabular, everywhere, without exception

Numbers in this product change while you are looking at them: the clock moves
the time window, a different card changes the minutes, a different hour
re-scores every block. Proportional digits re-flow the row on each change, which
reads as instability in a tool whose entire claim is measurement.

Every figure is `tabular-nums lining-nums`. Verified by setting the same
element to `11 min`, `88 min`, `10 min` and `47 min`: **113.78px in all four
cases.**

### Optical sizing

Fraunces carries an `opsz` axis, so display text is *drawn* for display size
rather than scaled up from text size. The wordmark sets `opsz 40`; the large
figures in the Method tab set `opsz 96`.

---

## Motion

Four durations and three curves. The interface only makes four kinds of move,
and anything outside them reads as a different product.

| Token | Value | For |
|---|---|---|
| `--t-fast` | 120ms | State flips the eye should not have to watch — hover, tint |
| `--t-base` | 200ms | Something changing position or size under a finger |
| `--t-slow` | 320ms | A surface arriving or leaving |
| `--t-draw` | 1000ms | The mark walking its route |

| Token | Curve | For |
|---|---|---|
| `--e-out` | `cubic-bezier(.4,0,.2,1)` | Decelerate into place. The default. |
| `--e-spring` | `cubic-bezier(.34,1.56,.64,1)` | Overshoot, for things that *land* |
| `--e-sheet` | `cubic-bezier(.32,.72,0,1)` | Long tail, so a dragged surface settles rather than stops |

**Everything is disabled under `prefers-reduced-motion: reduce`.** Not reduced —
disabled. The only animation carrying meaning is the mark drawing itself, and
its meaning survives as a static mark.

---

## The mark

A walk that steps around a block it would otherwise have crossed, and arrives at
a door.

- The warm square is `--r-3`, straight off the risk ramp. The line is
  `--accent`, straight off the map. **The logo is built from the product's own
  data colours**, which is why it reads as this product rather than as
  decoration.
- **The line hugs the block on two sides.** That adjacency is the whole idea —
  without it the bend is decoration; with it, it is avoidance.
- **The roof is 40% of the house and the body is flanked wider than the stroke.**
  At an even split the silhouette reads as an upward *arrow*, not a building.
  This was gotten wrong once and caught at 128px.
- **The doorway is knocked out in the tile colour** and the walk ends inside it.
  The doorway is what sells the house at small sizes; without it, the arrow
  reading returns.

Six shapes total. Verified legible at 16, 24, 32, 64 and 128px, and on a light
ground.

### Files

| File | Use | Notes |
|---|---|---|
| `icon.svg` | Favicon, manifest | Source of truth for the mark |
| `icon-192.png` | PWA icon, `purpose: any` | The tile as-is |
| `icon-512.png` | PWA icon, `purpose: any maskable` | Mark inset to ~62% so a circular mask cannot crop the house off |
| `og-image.png` | Link previews, 1200×630 | Generated from `docs/og-source.html` |

### Print

The walking card is a physical object a student carries and hands to a teacher,
so it carries the mark too — ink only. The tile drops away, the block becomes a
35% grey that survives a bad photocopier, and the doorway is knocked out white.

### Never

- Never recolour the mark. The two colours are the two data colours.
- Never put the mark on a mid-tone. It needs either the near-black ground or a
  light ground; on mid-grey the block and the line both lose separation.
- Never stretch it. The tile is square and the geometry is tuned to that square.
- Never add a stroke, glow, gradient or shadow to the mark itself. The palette
  has no gradients anywhere, by design.

---

## Voice

The product's credibility rests on not overclaiming, so the writing does too.

- **Say the number.** "78,669 blocks differ by more than 0.15", not "many
  blocks differ".
- **Name the limit in the same breath as the claim.** The holdout results file
  opens by saying the holdout has never been run on Los Angeles, and it keeps
  saying so until someone runs it.
- **Never promise safety.** A second opinion about a walk, not a guarantee.
- **Comparative, not absolute.** "Safer", "calmer", "less exposure" — all
  measured against the shortest route, which is the thing being argued with.
- **Both languages are first-class.** Every user-facing string exists in English
  and Spanish. A string that ships in one language is a bug.
