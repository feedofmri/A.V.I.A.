# A.V.I.A. Cockpit: Frontend Design Spec

The A.V.I.A. Cockpit takes its look from the Ostelian space-tech concept: near-black navy, frosted glass tiles with a blue glow rising from the bottom edge, ultra-light type and thin line art. This doc covers visual design only (theme, tokens, components, per-view layouts, charts and states), not APIs or state.

> **How reliable the values are.** The Behance project gave me four images: a full marketing-site page, a hero close-up, a text slide and a row of four stat tiles. It has no dashboard screens and names no fonts or hex codes. Colors below are estimated by eye from the images, and fonts are the closest open-source matches. Sample the real values with an eyedropper before you lock the tokens. The six A.V.I.A. cockpit screenshots the source doc refers to were not shared, so the per-view layouts follow that doc's text descriptions.

## 1. Design direction

**"Mission control, seen through frosted glass at night."** Calm, dark and confident, with data kept dense but quiet. Color is reserved for status, so a Warning or Critical state is the first thing the eye lands on.

1. **Dark first, single theme.** Deep navy canvas. No light mode.
2. **Glass, not boxes.** Every card is a translucent tile with a hairline border brighter at the top edge and a soft blue glow rising from the bottom.
3. **Light type, big numbers.** Thin weights at large sizes for values and headings. Tiny tracked uppercase for labels.
4. **Thin line art.** 1 to 1.5 px strokes for charts, icons and illustrations. No filled blobs.
5. **Color means status.** Blue-white is the neutral voice. Green, amber, red and gray appear only to mark Nominal, Warning, Critical and Not tracked.
6. **Quiet motion.** Slow fades, gentle glow pulses and smooth number tweens. Nothing bouncy.

## 2. What the reference shows and how the Cockpit uses it

| Reference detail | Where in the images | Cockpit use |
| --- | --- | --- |
| Near-black navy page with a faint grain and soft blue vignette | All images | App background |
| Segmented nav pill, active item filled white with dark text, the rest small tracked uppercase in muted blue-gray | Site header | View tabs: Overview, Digital twin, Analytics, Alerts, Behavioral health, Mission setup |
| Dark pill CTA with a round white arrow button on its right | Hero, footer CTA | Pulse ↗ button and the modal's primary action |
| Small glass telemetry card (`SAT-7A · ACTIVE`, altitude, velocity, status) | Hero, bottom right | Offline status card, crew telemetry blocks and tooltips |
| Four rounded-square stat tiles: big light number, small caption, line illustration, blue glow at the bottom | Stat-tiles image | Crew cards and Analytics vital cards |
| Map card with a floating callout (`COASTAL CHANGE DETECTED`), mini sparkline and a year scrubber with one lit dot | Site, middle section | Digital twin canvas with a floating risk callout and the predictive timeline |
| Light-weight geometric sans for headings | Hero image | Page and card titles |
| Glowing dot on a thin vertical line | Text slide | Timeline rail, Alerts timeline and Needs-attention markers |
| Staggered cards with top-right circular arrow buttons | Industry cards | Optional: alert rows and crew cards use the same arrow affordance to open details |
| Logo mark: circle crossed by a thin orbit line, wordmark in spaced uppercase | Header, footer | A.V.I.A. logotype in the sidebar |

Do not reuse Ostelian's photos, logo or name. They are the original designer's work. Build your own Earth, orbit and body-model assets in the same style.

## 3. Design tokens

### 3.1 Color

Values are eyeballed from the screenshots. The four status colors are **not** in the reference; I added them to suit the palette.

| Token | Value | Use |
| --- | --- | --- |
| `--bg-void` | `#05070D` | Outermost background, behind the sidebar |
| `--bg-base` | `#080B14` | Main canvas |
| `--surface` | `rgba(16, 22, 38, 0.62)` | Glass tile fill (with backdrop blur 16 to 24 px) |
| `--surface-raised` | `rgba(24, 33, 56, 0.72)` | Modal, drawer, tooltip |
| `--border` | `rgba(255, 255, 255, 0.10)` | Default hairline |
| `--border-top` | `rgba(190, 212, 255, 0.38)` | Brighter top edge on tiles |
| `--glow` | `#3F67A8` | Blue glow rising from the bottom of tiles |
| `--accent-ice` | `#BFD3F2` | Glowing dot, active line, focus ring |
| `--text-1` | `#F2F5FA` | Values and titles |
| `--text-2` | `#9AA7BD` | Captions and inactive nav |
| `--text-3` | `#5E6B82` | Hints, axis labels |
| `--ok` | `#5EE0A8` | Nominal |
| `--warn` | `#F5B94A` | Warning |
| `--crit` | `#FF5C6C` | Critical |
| `--off` | `#5E6B82` | Not tracked |

Status colors are used at three strengths: solid for the dot, 15% fill for the pill background, and 40% for a faint tile glow when a crew card is in that state.

### 3.2 Typography

The reference fonts are not named. These open-source families are the closest matches by eye. **Bundle them locally**, because the app is offline and cannot load Google Fonts.

| Role | Family | Weight | Notes |
| --- | --- | --- | --- |
| Page and card titles | Manrope | 200 to 300 | Wide, thin geometric look as in the hero heading |
| Big numbers and captions | Space Grotesk | 400 | Matches the stat tiles |
| Labels, nav, status text | Manrope | 500 | 11 px, uppercase, 0.08 em tracking |
| Telemetry readouts, timestamps, IDs | JetBrains Mono | 400 | Tabular figures, `SAT-7A`-style tags |

| Style | Size / line height | Use |
| --- | --- | --- |
| Display | 48 / 52 | Mission label on an empty state only |
| Value XL | 56 / 56 | Crew card HR, SpO2, EDA |
| Value L | 32 / 36 | Analytics vital cards, forecast stats |
| Title | 24 / 30 | View heading |
| Body | 14 / 22 | Alert text, explanations |
| Caption | 12 / 16 | Tile captions, units |
| Label | 11 / 14 | Uppercase tracked labels |

Use `font-variant-numeric: tabular-nums` on every number that updates, so values do not jitter when they change.

### 3.3 Shape, spacing and effects

| Token | Value |
| --- | --- |
| Radius: tile / card | 24 px (the stat tiles are close to 28 px) |
| Radius: pill, button, chip | 999 px |
| Radius: input | 14 px |
| Border | 1 px, `--border`, with a 1 px top gradient highlight |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48 px |
| Page padding | 32 px; gap between tiles 20 px |
| Tile glow | `radial-gradient(120% 70% at 50% 110%, var(--glow), transparent 70%)` at about 55% opacity |
| Backdrop blur | 16 px on tiles, 24 px on modal and drawer |
| Background grain | 3% noise overlay on `--bg-base`, bundled as a small local PNG or SVG filter |
| Focus ring | 2 px `--accent-ice` with a 4 px soft outer glow |

```css
:root {
  --bg-void:#05070D; --bg-base:#080B14;
  --surface:rgba(16,22,38,.62); --surface-raised:rgba(24,33,56,.72);
  --border:rgba(255,255,255,.10); --border-top:rgba(190,212,255,.38);
  --glow:#3F67A8; --accent-ice:#BFD3F2;
  --text-1:#F2F5FA; --text-2:#9AA7BD; --text-3:#5E6B82;
  --ok:#5EE0A8; --warn:#F5B94A; --crit:#FF5C6C; --off:#5E6B82;
  --r-tile:24px; --r-pill:999px; --r-input:14px;
}
.tile{
  background: var(--surface);
  border:1px solid var(--border);
  border-top-color: var(--border-top);
  border-radius: var(--r-tile);
  backdrop-filter: blur(16px);
  position:relative; overflow:hidden;
}
.tile::after{ /* bottom glow */
  content:""; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(120% 70% at 50% 110%, var(--glow), transparent 70%);
  opacity:.55;
}
```

## 4. Core components

| Component | Look | States |
| --- | --- | --- |
| **Glass tile** | The `.tile` recipe above. Caption top, value center, line illustration or sparkline behind the value, glow at the bottom. | Hover: border-top brightens, glow +10%. Selected: 1.5 px `--accent-ice` border. |
| **View tabs (nav pill)** | One rounded capsule holding six items, 11 px uppercase tracked labels in `--text-2`. The active item is a filled white pill with dark text. | Hover: label to `--text-1`. Active slides between items over 220 ms. |
| **Primary button** | Dark glass pill with a 12 px label and a separate 36 px white circle holding a dark arrow (the "Request a demo" pattern). Pulse ↗ and Submit use it. | Hover: circle nudges 2 px right and the arrow rotates 0 to 45°. Disabled: 40% opacity, no glow. |
| **Ghost button** | Transparent pill, 1 px `--border`, `--text-2` label. | Hover: border to `--border-top`. |
| **Status pill** | Dot plus label (`Nominal`, `Warning`, `Critical`, `Not tracked`). Fill is the status color at 15%, text at 100%. | Critical dot pulses (see Section 9). |
| **Telemetry card** | Small glass card with a mono header (`SAT-7A · ACTIVE` pattern, here the crew tag and status), then label / value rows in 11 px / 12 px mono. | Used for the offline status popover and the twin region readouts. |
| **Stat strip item** | Big value over a 11 px caption. Used inside tiles and above charts. | Number tweens over 400 ms when data changes. |
| **Timeline rail** | 1 px vertical line in `--border` with a glowing 8 px `--accent-ice` dot at the active point. | Dot glow pulses once when a new event lands. |
| **Slider** | 2 px track, `--accent-ice` fill, 14 px white thumb with a soft glow, mono value label above the thumb. | Dragging: thumb scales to 1.15. |
| **Chip (Mock / Estimated)** | 10 px uppercase, 1 px dashed `--text-3` border, no fill. | Static. Tooltip explains why the panel is not model-driven. |
| **Tooltip / popover** | `--surface-raised`, 12 px radius, 24 px blur, 150 ms fade. |  |
| **Toast** | Bottom-center glass pill with a status dot. Auto-dismiss after 4 s. |  |

## 5. App shell

```
+------------------------------------------------------------------------------------+
| (o) A.V.I.A.   [ Overview | Digital twin | Analytics | Alerts | Behavioral | Setup ] |
|                 MISSION  Artemis Transit · Day 142       (Pulse ↗)   * Offline · on-board |
+-----------+------------------------------------------------------------------------+
| CREW      |                                                                        |
|  * Okafor |   View title                                      range / tab controls |
|  * Brandt |                                                                        |
|  * Sato   |   +----------+ +----------+ +----------+ +----------+                  |
|  * Diaz   |   |  glass   | |  glass   | |  glass   | |  glass   |   ... view body  |
|           |   |  tile    | |  tile    | |  tile    | |  tile    |                  |
| VIEWING   |   +----------+ +----------+ +----------+ +----------+                  |
| Dr. Brandt|                                                                        |
+-----------+------------------------------------------------------------------------+
```

- **Top bar:** 72 px tall, transparent over the canvas, a hairline bottom border. Logo left (circle with a thin orbit line plus spaced uppercase wordmark), view pill centered, Pulse button and offline indicator right. The mission label sits under the logo or in a second row on narrow widths.
- **Sidebar:** 248 px wide glass panel with a hairline right border. Each crew row is a 56 px item: initials avatar, name, role, and a status dot on the right with a subtext such as `2 open · warning`. The active row gets a faint glow and a 2 px `--accent-ice` rail on its left edge.
- **Offline indicator:** green dot with a slow 3 s breathing glow, label `Offline · on-board models`. Click opens a telemetry card with confidence and data quality.
- **Canvas:** `--bg-base` with grain, and one large soft blue radial gradient fixed behind the top right corner, echoing the planet limb in the hero.
- **Target size:** designed for 1440 × 900 and up. Below 1100 px the sidebar collapses to a 72 px icon rail.

## 6. View layouts

Layouts follow the source doc's text descriptions of each view, restyled in the Ostelian language.

### 6.1 Overview

```
+----------------+----------------+----------------+----------------+
| Okafor  [Nom]  | Brandt  [Nom]  | Sato   [Warn]  | Diaz   [Warn]  |
|  72   97   2.8 |  61   98   1.9 |  68   98   2.1 |  96   97   5.1 |
|  bpm  SpO2  EDA|                |                |                |
| ||||||||||||   | ||||||||||||   | ||||||||||||   | ||||||||||||   |  24 h HR bars
| flag text      | flag text      | flag text      | flag text      |
+----------------+----------------+----------------+----------------+
| Needs attention (glass list, timeline rail)  | Today's countermeasures |
|  o Pulse sleep · M. Sato · 4.9 h  09:12      |  [ ] Resistive exercise |
|  o Pulse vitals · R. Diaz · EDA 5.1 08:47    |  [ ] Cardio             |
+----------------------------------------------+-------------------------+
```

- **Crew card** is a tall glass tile, about 300 px wide. The status pill sits top right. Three Value XL numbers sit in a row with 11 px unit captions under them. The 24 h bars are 1.5 px-wide rounded bars in `--accent-ice` at 70%, with the latest bar fully lit.
- Warning or Critical cards swap the bottom glow from blue to the status color at 40%. Nominal cards keep the blue glow.
- **Needs attention** is a glass panel with a vertical timeline rail on the left. Each row has a glowing dot in the status color, a title, a mono source tag (`PULSE VITALS`, `PULSE SLEEP`, `BONE MODEL`), a timestamp, and a circular arrow button at the right to open the alert.

### 6.2 Digital twin

```
+------------------------------------------+  +------------------------------+
|  [ Skeletal | Cardiovascular | Dermal ]   |  | TELEMETRY                    |
|                                          |  |  region      TODAY  PROJECTED|
|        (3D / layered body model)         |  |  femoral      ...     ...    |
|        regions tinted by status          |  |  lumbar       ...     ...    |
|        floating callout card             |  |                              |
|                                          |  | WHAT-IF · COUNTERMEASURE     |
|  Today o------------o-------------- +60 d |  | ADHERENCE        [====o--] 70%|
+------------------------------------------+  |  Warning at +39 d            |
  legend: Nominal  Warning  Critical  Not tracked
```

- **Canvas tile** is large and mostly empty, like the map card in the reference. The body model is drawn in thin white line art with a faint inner glow. Regions fill with status color at 25%, with a 1 px outline at 100%.
- **Floating callout** mirrors the `COASTAL CHANGE DETECTED` card: a small glass card anchored to a region with a mini sparkline and one line of mono text, such as `FEMORAL · WARNING AT +39 D`.
- **Predictive timeline** copies the year scrubber: five or six tick labels in `--text-3`, one lit dot on the current offset, and a 1 px line to the track. Dragging the dot moves the projection.
- **Right panel** holds the TELEMETRY table (mono, tabular figures) and the adherence slider. The `Warning at +X d` line is a status pill that updates live.
- The Dermal tab and any g/cm² value carry a **Mock** or **Estimated** chip.

### 6.3 Analytics

```
+----------+ +----------+ +----------+ +----------+ +----------+
| Heart    | | SpO2     | | EDA      | | HRV      | | Sleep    |   5 selectable tiles
| 72 bpm   | | 97 %     | | 2.8 µS   | | 46 ms    | | 6.2 h    |
+----------+ +----------+ +----------+ +----------+ +----------+
+--------------------------------------------------------------+
| Heart rate                         [ 24h | 7d | 30d ]         |
|   ||| ||| ||||| ||| |||  ╱╱╱ ╱╱╱ ╱╱╱ ╱╱╱ ╱╱╱ ╱╱╱ ╱╱╱   |
|  - - - - - - - - - - - - - - warning line - - - - - - - - -  |
|   history (solid)            forecast (hatched)              |
|  MIN 61    MEAN 70    MAX 96    FORECAST END 74              |
|                       Hatched bars are the 7-step GRU Fusion forecast. |
+--------------------------------------------------------------+
```

- The selected vital tile has the `--accent-ice` border and a stronger glow. Each tile has a small line illustration behind its value, as in the reference tiles (a wave for heart rate, an arc for SpO2, and so on).
- The chart tile is full width. See Section 7 for the bar and hatch styling.

### 6.4 Alerts

```
+--------------------------------------------+  +-----------------------------+
| Alerts   [ All | Vitals | Sleep | Bone ]    |  | M. Sato (Pulse sleep)       |
|                                            |  | Sleep 4.9 h, below warning  |
|  o M. Sato  Pulse sleep   4.9 h     Warning |  |                             |
|  o R. Diaz  Pulse vitals  EDA 5.1   Warning |  | Flagged by on-board sleep   |
|  o (Dermal scan)  rash 0.4 cm²   [Mock]    |  |  model  ·  timeline rail    |
|                                            |  | Why: ...explanation text... |
|                                            |  | Top contributors: Sleep 62% |
|                                            |  |                  Stress 21% |
+--------------------------------------------+  +-----------------------------+
```

- **Feed rows** are 64 px glass strips with a status dot, title, mono source tag, relative time, a status pill and a circular arrow button. Selected row: `--accent-ice` left rail and a brighter border.
- **Detail drawer** slides in from the right over 260 ms. It uses `--surface-raised` and 24 px blur. The "flagged by" history uses the timeline rail with a glowing dot. Contribution percentages are two thin horizontal bars (1.5 px) with mono values.

### 6.5 Behavioral health

- A wide glass tile with the sentiment line chart. The line is 1.5 px `--accent-ice` with a soft glow under it. It carries a **Not model-derived** chip.
- Two entry tiles (Voice entry, Text entry) show only metadata (date, length, a lock icon) until the crew member consents. The privacy notice sits in a muted caption row: "Journal text stays private to the crew member...".
- **Strain markers** is a pill row at the bottom: `Sleep · 3`, `Workload · 2`, `Isolation · 1`. Each pill is ghost-style with a small dot, and the count in mono.

### 6.6 Mission setup

- Two-column form on glass tiles: crew baseline fields (HR, RMSSD, EDA, sleep, respiration) and mission day and phase.
- Inputs are 44 px tall, 14 px radius, `--surface` fill, 1 px `--border`. The label sits above in 11 px uppercase. Focus uses the focus ring from Section 3.3.

## 7. Charts

| Element | Style |
| --- | --- |
| Historical bars | 10 to 14 px wide, 4 px top radius, `--accent-ice` at 80%, with a faint vertical gradient to 30% at the base |
| Forecast bars (7) | Same width, filled with a 45° hatch pattern (1.5 px lines, 5 px gap) in `--accent-ice` at 70%, plus a 1 px outline. A thin vertical divider labeled `FORECAST` separates history from forecast. |
| Warning line | 1 px dashed `--warn`, label right-aligned in mono 10 px |
| Bars crossing the threshold | Same shape, tinted `--warn`, with the value in a hover tooltip |
| Gridlines | 1 px `rgba(255,255,255,0.06)`, horizontal only |
| Axis labels | 11 px `--text-3`, tabular numbers |
| Sparklines (crew cards) | 1.5 px line or hairline bars, no axes, glow filter `drop-shadow(0 0 6px var(--glow))` |
| Hover | Crosshair line plus a telemetry card tooltip: value, time, and `Forecast` or `Measured` tag |
| Entry animation | Bars grow from the baseline over 500 ms, staggered by 30 ms |

The chart note under the plot reads **"Hatched bars are the 7-step GRU Fusion forecast."** Draw the hatch as an SVG `<pattern>` so it scales cleanly.

## 8. Pulse ↗ modal

- Centered glass panel, 560 px wide, 24 px radius, dark scrim at 60% with a 6 px background blur.
- Header: crew selector (pill dropdown), mission day, close button as a 36 px ghost circle.
- Body: two columns of inputs for required vitals. An **Advanced** toggle and a **Sleep architecture** group expand with a 200 ms height animation.
- Inline validation: red text in `--crit` at 12 px under the field, and the field border turns `--crit` at 60%. A soft hint chip appears for SpO2 below 94%.
- Footer: ghost Cancel, and the primary button with the circular arrow (`Submit vitals`). While sending, the arrow circle becomes a spinner.

## 9. Motion and states

| Moment | Behavior |
| --- | --- |
| View change | 200 ms cross-fade, content rises 8 px |
| Number update | 400 ms tween, tabular figures so nothing shifts |
| New alert | Row slides in, the timeline dot flashes once, the sidebar status dot updates |
| Critical status dot | Slow 2 s pulse of the outer glow. No flashing, no sound. |
| Offline indicator | 3 s breathing glow while models are loaded |
| Loading | Skeleton tiles: the glass shape with a slow shimmer sweeping left to right |
| Empty (no alerts) | Centered thin line illustration (orbit and dot), one line of text in `--text-2` |
| Error | Tile shows a `--crit` hairline border, a short message and a ghost Retry button |
| Models offline | Offline indicator turns `--off` gray with the label `Models offline`; Submit is disabled |
| Sensor not tracked | Gray `--off` dot and the label `Not tracked`; the region or value is dimmed to 50% |

Respect `prefers-reduced-motion`: replace tweens and pulses with instant changes and a static glow.

## 10. Assets and offline rules

- Bundle every font, icon and image. No CDN, no remote map or image tiles.
- **Hero imagery:** make a dark Earth limb (a CSS radial gradient plus a small local WebP) for the empty state and the login or splash screen. Do not use the Behance photos.
- **Icons:** 1.5 px stroke, 20 px grid, rounded caps. Use a bundled set such as Lucide, or custom SVG in the same stroke.
- **Body model:** one SVG or low-poly GLB with named regions that match `twin_regions`.
- **Grain texture:** a 256 px tileable noise PNG at about 3% opacity.

## 11. Accessibility

- Status is never color alone: always a label or an icon beside the dot.
- Text contrast: `--text-1` on `--bg-base` is above 15:1. `--text-3` is for hints only and is not used for anything a user must read.
- Visible focus ring on every interactive element, and full keyboard control of tabs, sliders and the drawer.
- Minimum hit area 40 px for buttons and slider thumbs.
- Thin type (weight 200 to 300) is for 24 px and above. Use weight 400 or higher for anything smaller.

## 12. Open items

1. **Real font and hex values:** the Behance images do not name them. Share the project's type and color notes if the designer posted any, or sample from the images.
2. **The six A.V.I.A. cockpit screenshots** mentioned in the source doc. If you share them, I will align Section 6 to the exact layouts instead of the text descriptions.
3. **Reference scope:** the Ostelian images are a marketing site. Dense dashboard patterns (tables, forms, drawers) here are extensions of its style, not copies.
4. **Body model asset:** decide whether you build a 3D model or a layered 2D SVG, since it sets the canvas treatment in 6.2.
