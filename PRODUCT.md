# Product

> Written following Impeccable's `init` playbook. The interview was answered by the
> project brief rather than live Q&A. Facts marked _(inferred)_ came from my reading
> of the brief, not from a confirmed answer, and should be checked.

## Platform

web

## Stack

Next.js App Router, TypeScript strict, Tailwind CSS v4, MapLibre GL JS, Zod, Vitest,
Playwright. Chosen by the brief.

## Users

Bengaluru commuters. Mostly on a phone, often in a car or an auto, sometimes already
moving. Many check before leaving office in the 5 to 8 PM window. _(inferred)_ A
passenger in an auto is the hardest case: one hand on the grab rail, the phone moving,
bright sun or a dark cabin, a glance of a few seconds at a time.

## Product Purpose

Recommend a route that avoids the jam, even when it is a few minutes longer on paper,
and say plainly why. The comparison between routes is the product. The map is
supporting context.

## Positioning

"Skip the jam, not just the signal." General navigation apps optimise for the shortest
expected time. BLR Detour weighs calm, predictability, and monsoon risk too, and names
the local chokepoint it is steering around (Silk Board, Hebbal, Marathahalli bridge).

## Operating Context

Glance use, one-handed, variable light. Patchy mobile data on some stretches.
Bengaluru-specific: chokepoints, metro construction, seasonal flooding (June to
October).

## Capabilities and Constraints

- No login for the MVP.
- No live closure data. Chokepoints, road works, and flood roads are curated files with
  a visible verification date. Never present them as live.
- Traffic data quality depends on the provider. Every number shows where it came from:
  Live, Historical estimate, or Estimated, not live.
- Demo mode must work fully with no API keys.

## Brand Commitments

None existing. _(inferred)_ No "AI-powered" claims. Plain English, short sentences.

## Evidence on Hand

None yet: no user research, no trip logs. The seed data for zones is from general
knowledge and is labeled as not field-checked.

## Product Principles

1. Every number has a reason next to it.
2. Say how sure we are. A range beats a false-precise minute.
3. Calm counts. A route with fewer signals is worth a few minutes to many people.
4. Local names, not coordinates.

## Accessibility & Inclusion

WCAG 2.2 AA. 44 px minimum targets. Keyboard-operable cards and sliders. Screen-reader
summaries for each route. Respect reduced motion. All strings in a messages file so
Kannada can follow English.
