#!/usr/bin/env python3
"""Enforce the colour invariants in BRAND.md against the live stylesheet.

A brand spec nobody checks is a document that quietly stops being true. This
reads the tokens straight out of index.html -- not a copy -- and fails if any
of the properties BRAND.md claims have stopped holding.

    python tools/brand_check.py

What it enforces, and why each one matters:

  * The risk ramp rises in L* at every step. Non-monotone lightness makes two
    different risk values look equally severe.
  * No step smaller than MIN_STEP. Below that, adjacent bands stop being
    separable -- including without colour vision, since the ramp is designed to
    be readable by lightness alone.
  * The calmest band still clears the ground. It is meant to recede, not vanish.
  * Body text clears WCAG AA. --faint shipped at 4.10:1 once, on every note in
    the panel; that is what this check exists to stop happening again.
  * The route hue stays far from every step of the ramp. This is the only rule
    here that is load-bearing for correctness rather than taste: if the route
    and a risk value can be confused, the map lies.
"""
import colorsys
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS = ROOT / "index.html"

MIN_STEP = 10.0          # L*, separability of adjacent bands
MIN_CALM = 2.0           # calmest band vs ground; recede, do not vanish
MIN_HUE_GAP = 120.0      # degrees between the route and every risk step
AA_NORMAL = 4.5          # WCAG 2.1 AA, normal-size text
AA_LARGE = 3.0


def _lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hexcol: str) -> float:
    h = hexcol.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def lstar(hexcol: str) -> float:
    y = luminance(hexcol)
    return 116 * (y ** (1 / 3)) - 16 if y > 0.008856 else 903.3 * y


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def hue(hexcol: str) -> float:
    h = hexcol.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return colorsys.rgb_to_hsv(r, g, b)[0] * 360


def hue_gap(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def tokens() -> dict:
    """Pull the custom properties out of the stylesheet's :root block."""
    text = CSS.read_text(encoding="utf-8")
    start = text.index(":root{")
    end = text.index("}", start)
    found = dict(re.findall(r"(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})",
                            text[start:end]))
    if not found:
        sys.exit("brand_check: found no colour tokens in :root -- has the "
                 "stylesheet moved?")
    return found


def main() -> int:
    t = tokens()
    need = ["--paper", "--ink", "--dim", "--faint", "--accent",
            "--r-1", "--r-2", "--r-3", "--r-4", "--r-5"]
    missing = [k for k in need if k not in t]
    if missing:
        sys.exit(f"brand_check: missing token(s): {', '.join(missing)}")

    ground = t["--paper"]
    ramp = [t[f"--r-{i}"] for i in range(1, 6)]
    fails = []

    def check(ok: bool, label: str, detail: str):
        print(f"  {'PASS' if ok else 'FAIL'}  {label:44} {detail}")
        if not ok:
            fails.append(label)

    print(f"ground --paper {ground}\n")

    print("text contrast vs ground")
    for name, floor in (("--ink", AA_NORMAL), ("--accent", AA_NORMAL),
                        ("--dim", AA_NORMAL), ("--faint", AA_NORMAL)):
        r = contrast(t[name], ground)
        check(r >= floor, f"{name} clears AA for normal text",
              f"{t[name]}  {r:5.2f}:1  (need {floor})")

    # Accent is used as a fill with --paper text on it (buttons, selected tabs).
    r = contrast(ground, t["--accent"])
    check(r >= AA_NORMAL, "--paper on an --accent fill is legible",
          f"{r:5.2f}:1  (need {AA_NORMAL})")

    print("\nrisk ramp")
    ls = [lstar(c) for c in ramp]
    steps = [ls[i + 1] - ls[i] for i in range(4)]
    check(all(s > 0 for s in steps), "L* rises at every step",
          " -> ".join(f"{v:.1f}" for v in ls))
    check(min(steps) >= MIN_STEP, "no step below the separability floor",
          f"min {min(steps):.1f}  (need {MIN_STEP})")
    calm = contrast(ramp[0], ground)
    check(calm >= MIN_CALM, "calmest band still clears the ground",
          f"{ramp[0]}  {calm:5.2f}:1  (need {MIN_CALM})")
    # The ramp must be one family: a hue jump would reintroduce categories.
    hues = [hue(c) for c in ramp]
    spread = max(hue_gap(h, hues[0]) for h in hues)
    check(spread <= 45, "ramp stays one hue family",
          f"spread {spread:.0f} deg  (need <= 45)")

    print("\nroute vs ramp")
    rh = hue(t["--accent"])
    gap = min(hue_gap(rh, h) for h in hues)
    check(gap >= MIN_HUE_GAP,
          "route hue cannot be mistaken for a risk value",
          f"{t['--accent']} at {rh:.0f} deg, nearest ramp step {gap:.0f} deg "
          f"away  (need {MIN_HUE_GAP})")

    print("\n" + "=" * 68)
    if fails:
        print(f"brand_check: {len(fails)} invariant(s) broken -> {fails}")
        print("Fix the token, or change BRAND.md and this file together and "
              "say why in the commit.")
        return 1
    print("brand_check: every invariant in BRAND.md still holds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
