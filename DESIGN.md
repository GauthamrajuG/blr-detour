# Design

Impeccable mode: **Operate**. The visitor completes a task: pick a route and go.

## Shape brief (from `/impeccable shape`, applied manually)

1. **Job and audience.** A Bengaluru commuter, phone in hand, often in a moving auto or
   car, decides which way to go in under ten seconds.
2. **Outcome and proof.** They pick a route card. Success means they understood _why_ it
   ranked where it did: which chokepoint it avoids, what it costs in minutes, and how
   sure we are.
3. **Direction.** Route cards are the hero; the map is context. One memorable device: the
   **jam strip**, a horizontal bar on each card showing the route as segments, with
   chokepoints drawn as yellow-and-black kerb hatching where they fall along the trip.
   It borrows the painted kerb stripes at Bengaluru junctions, and it carries
   information: where on the route the trouble is.
4. **Scope.** One screen. Search at the top; map behind; cards in a bottom sheet on
   mobile and a left panel from 900 px. No login, no onboarding flow.
5. **States and ranges.** 0 to 4 routes. Trips of 2 to 45 km. Times of 8 to 120 min.
   States: idle (with example trips), loading (skeleton cards), ready, empty (no route),
   error (what failed, what to do), stale ("Estimated, not live"), demo banner.
6. **Interaction.** Tap a card to select it: the map highlights its path and the card
   opens its steps in place. Weight sliders re-rank live; cards slide to their new
   positions so the change is visible. The sheet has three heights: peek, half, full.
7. **Constraints.** Keyboard and screen reader complete. Reduced motion respected.
   Strings in `messages/en.ts`.

## Visual world

### Use scene decides light or dark

Daylight in an open auto means glare, so the default is a light, high-contrast theme.
At night the system dark theme takes over, with a dimmed map and no bright surfaces.

### Color (light)

| Token       | Hex       | Role                                                                                    |
| ----------- | --------- | --------------------------------------------------------------------------------------- |
| `paper`     | `#F4F7F4` | Sheet and panel surface, a cool chalk tint                                              |
| `ink`       | `#13201B` | Text and strong UI; tinted toward asphalt green, never pure black                       |
| `ink-soft`  | `#43534C` | Secondary text (7.4:1 on paper)                                                         |
| `signboard` | `#0D6A46` | Accent: selected route, primary actions. Taken from Indian highway direction boards     |
| `kerb`      | `#F2C230` | Chokepoint hatching and the "jam" signal, always paired with ink, never text on its own |
| `flood`     | `#2B5C9C` | Monsoon flood-prone roads                                                               |
| `brick`     | `#A33820` | Errors and "slower" deltas                                                              |

Dark mode swaps to `paper #101A16`, `ink #E4EDE8`, `ink-soft #A7B6AE`,
`signboard #46C08A`. Kerb yellow stays the same.

### Type

**Atkinson Hyperlegible Next**, self-hosted, for everything. It was drawn by the
Braille Institute to keep letters distinct at a glance and for low vision, which is
exactly the auto-passenger problem. One family, fixed rem scale at a 1.2 ratio:
13 / 15 / 17 / 20 / 24 / 34 px. Travel times use tabular figures at 34 px bold.
Kannada will fall back to Noto Sans Kannada when strings arrive.

### Layout

```
Mobile (< 900 px)                    Desktop (>= 900 px)
+---------------------------+        +-----------+-------------------+
| From [__________] [loc]   |        | From/To   |                   |
| To   [__________] [swap]  |        | chips     |                   |
| (Now)(+30 min)(Tmrw 8 AM) |        |-----------|       MAP         |
|                           |        | cards     |                   |
|           MAP             |        | cards     |                   |
| +-----------------------+ |        | settings  |                   |
| | ==== handle           | |        | freshness |                   |
| | card (selected)       | |        +-----------+-------------------+
| | card                  | |
+---------------------------+
```

Left-aligned throughout. Cards are separated by rules, not boxed with shadows; the
selected card gets a signboard-green outline and a tinted fill.

### Motion (Emil Kowalski curves)

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for entering and selection.
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` for cards moving during a re-rank.
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` for the bottom sheet.
- 160 ms press feedback, 200 ms step expansion, 260 ms re-rank, 320 ms sheet.
- No bounce. No page-load choreography. Reduced motion keeps only opacity changes.

## Review against generic defaults

I checked the first plan against the frontend-design skill's list of generated-UI tells
and changed three things:

- I first reached for a warm cream surface. That is the most common generated default,
  so I moved to a cool chalk tint that also reads cleaner in glare.
- I had a "3 routes · 5:40 PM · Live" meta line. Middle-dot meta strings are a template
  tell; the header now says it in a short sentence.
- I had considered a monospace face for times. Monospace as a "technical" costume is
  a tell; tabular figures in the main face do the job.

## Anti-patterns honoured

No Inter or Arial display, no purple-to-blue gradients, no nested cards, no gray text on
colored surfaces, no pure black or gray, no bounce easing, no eyebrow labels, no
gradient text.
