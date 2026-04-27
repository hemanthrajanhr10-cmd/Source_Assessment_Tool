---
name: Source Assessment Tool
description: Enterprise SQL Server and Fabric workspace assessment intelligence platform.
colors:
  void-black: "#09090b"
  charcoal-surface: "#18181b"
  charcoal-raised: "#27272a"
  charcoal-border: "#3f3f46"
  ash-primary: "#f4f4f5"
  ash-secondary: "#a1a1aa"
  ash-muted: "#71717a"
  intelligence-amber: "#f59e0b"
  intelligence-amber-bright: "#fbbf24"
  status-emerald: "#34d399"
  status-red: "#f87171"
  status-blue: "#60a5fa"
typography:
  display:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.1em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
rounded:
  sm: "8px"
  md: "12px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.intelligence-amber}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.intelligence-amber-bright}"
  button-secondary:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ash-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "#303033"
    textColor: "{colors.ash-primary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ash-secondary}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ash-primary}"
  button-danger:
    backgroundColor: "rgba(239,68,68,0.10)"
    textColor: "{colors.status-red}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  badge-default:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ash-secondary}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-success:
    backgroundColor: "rgba(52,211,153,0.10)"
    textColor: "{colors.status-emerald}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-error:
    backgroundColor: "rgba(248,113,113,0.10)"
    textColor: "{colors.status-red}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-info:
    backgroundColor: "rgba(96,165,250,0.10)"
    textColor: "{colors.status-blue}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: Source Assessment Tool

## 1. Overview

**Creative North Star: "The Intelligence Brief"**

SAT's visual language is structured like a classified intelligence report: dense with fact, stripped of decoration, formatted for rapid scanning under pressure. A consultant sharing their screen with a client's data team doesn't need the UI to impress anyone. It needs to project that every number on screen is real, defensible, and arrived at by a system that knew exactly what it was looking for.

The dark surface (void-black base, #09090b) earns its keep. SAT is operated in meeting rooms and on shared screens where ambient-lit SaaS gradients would signal "beta tool." The near-black ground with precise amber signals reads as instrumentation. Surfaces layer from void to surface to raised, each step carrying its own containment logic. This isn't a dark theme for aesthetic effect; it's a tonal hierarchy that communicates structure before the user reads a word.

Amber is the intelligence signal. It marks brand identity, active navigation states, primary actions, and interactive affordances. It appears deliberately. The rest of the palette is disciplined grey and semantic status color only. When amber appears on screen, it means something specific.

**Key Characteristics:**
- Three-tier dark surface system (void-black, charcoal-surface, charcoal-raised)
- Single accent color (intelligence-amber) carrying both identity and interactivity
- Syne display type: geometric weight, technical confidence
- DM Sans body type: humanist warmth that holds up across dense data tables
- JetBrains Mono for all numeric and technical data output
- Status signals use icon plus color always; color is never the sole signal
- Shadows are structural: depth communicates containment, not just state

## 2. Colors: The Signal Palette

One accent that means something. Everything else is a tonal step or a semantic signal.

### Primary
- **Intelligence Amber** (#f59e0b): The identity color and interactivity signal. Used on the logo mark, active navigation states, primary CTA buttons, focus rings, progress indicators, and hover glows. Its presence means: this is live, actionable, or selected. At rest, covers no more than 15% of any given screen.
- **Intelligence Amber Bright** (#fbbf24): The hover and active state variant. Appears only as a state shift from the base amber; never used independently as a static color.

### Neutral
- **Void Black** (#09090b): The page floor. Body background only. Nothing else sits at this depth.
- **Charcoal Surface** (#18181b): Default container and card background. One layer above void.
- **Charcoal Raised** (#27272a): Secondary button fills, elevated surfaces, input backgrounds, dropdown panel bodies.
- **Charcoal Border** (#3f3f46): Dividers and visible borders between raised surfaces.
- **Ash Primary** (#f4f4f5): Default body text, headings, high-emphasis labels.
- **Ash Secondary** (#a1a1aa): Supporting text, secondary labels, icon fills at rest.
- **Ash Muted** (#71717a): Placeholder text, tertiary labels, footer copy, inactive nav items.

### Tertiary
- **Status Emerald** (#34d399): Completed, success, MFA-enabled states, positive indicators. Always paired with an icon.
- **Status Red** (#f87171): Failed, error, destructive action states. Always paired with an icon.
- **Status Blue** (#60a5fa): Running, in-progress, informational states. Always paired with an icon.

### Named Rules
**The Signal Rule.** Intelligence-amber is the only accent hue in the system. It shares no stage with secondary brand colors, decorative gradients, or other hue families. When amber appears, it means something.

**The Icon-Plus-Color Rule.** Every status signal uses an icon alongside the color. No state is communicated by color alone. Success is emerald plus CheckCircle. Error is red plus XCircle. Running is blue plus Loader2. Cancelled is zinc plus StopCircle.

## 3. Typography

**Display Font:** Syne (with system-ui, sans-serif fallback)
**Body Font:** DM Sans (with system-ui, -apple-system, sans-serif fallback)
**Mono Font:** JetBrains Mono (with Fira Code, monospace fallback)

**Character:** Syne's geometric structure keeps page titles and section headers from reading like commodity SaaS. DM Sans at body size is warm without being soft — it holds up across dense tables and long label strings. JetBrains Mono handles all numeric data, connection strings, SQL output, and technical identifiers. Its tabular figures prevent column jitter in live-updating assessment tables.

### Hierarchy
- **Display** (Syne, 700, clamp(1.5rem, 3vw, 2.5rem), lh 1.1, ls -0.02em): Page titles and primary session or job headings. One per primary view.
- **Headline** (Syne, 600, 1.25rem, lh 1.2, ls -0.01em): Section headers, panel titles, modal headings.
- **Title** (DM Sans, 600, 0.9375rem, lh 1.4): Sub-section headers, expandable panel titles, table column groups.
- **Body** (DM Sans, 400, 0.875rem, lh 1.6): All description text and prose content. Maximum line length: 70ch.
- **Label** (DM Sans, 600, 0.6875rem, lh 1, ls 0.1em, uppercase): Form field labels, section category tags, data table column headers. They read as instrument panel markings.
- **Mono** (JetBrains Mono, 400, 0.8125rem, lh 1.5, tabular-nums): All numeric metric values, connection strings, host names, query output, and any data the system discovered.

### Named Rules
**The Mono Data Rule.** All numeric values in data tables, metric displays, connection strings, and query outputs use JetBrains Mono with `font-variant-numeric: tabular-nums`. Non-monospace rendering of tabular data is a readability failure.

**The Label-as-Instrument Rule.** Form labels are written as instrument panel markings: short, uppercase, minimal. "HOST" not "Enter the server host name." "PORT" not "What port should we connect on?" The tool speaks in the user's register.

## 4. Elevation

Surfaces carry inherent depth at rest. SAT's layering system is structural: void-black forms the floor, charcoal-surface containers sit above it, and charcoal-raised panels float one layer higher. Containment is communicated before interaction begins.

### Shadow Vocabulary
- **Ambient card** (`0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)`): Applied to all card and panel surfaces at rest. Structural, always present.
- **Elevated card** (`0 4px 12px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.3)`): Hover state elevation for interactive card surfaces.
- **Amber glow** (`0 0 24px rgba(245,158,11,0.18)`): Applied to the active primary action element on screen. One glow per view.
- **Amber glow strong** (`0 0 48px rgba(245,158,11,0.3)`): Progress completion states and prominent CTAs in empty state views.
- **Dropdown** (`0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)`): Floating menus and autocomplete panels. Heavy enough to separate definitively from the background.
- **Inner highlight** (`inset 0 1px 0 rgba(255,255,255,0.05)`): Top-edge material cue applied to cards and surface containers.

### Named Rules
**The Structural Depth Rule.** Containers carry their ambient shadow at rest. Shadows in SAT indicate structure and containment, not interaction state alone. An unshadowed card is a design error.

**The Glow Discipline Rule.** Amber glow is applied to exactly one primary interactive element per view. Its rarity is what makes it directional. Multiple glowing elements cancel each other out.

## 5. Components

### Buttons
Compact, direct, rounded with controlled tension (8px radius: not pill, not sharp).

- **Shape:** 8px radius across all sizes and variants.
- **Primary:** Intelligence-amber fill (#f59e0b), void-black text, semibold. On hover: fill lifts to amber-bright (#fbbf24), shadow gains amber glow. Active: `scale(0.97)` press response.
- **Secondary:** Charcoal-raised fill (#27272a), ash-primary text, charcoal-border border. Hover: fill lightens one tonal step, border brightens.
- **Ghost:** No background, ash-secondary text. Hover: text lifts to ash-primary, charcoal-raised fill at 60% opacity. Used for tertiary actions where a bordered button would create noise.
- **Danger:** Red-500/10 tinted fill, status-red text, red-500/20 border. A solid red background is an alarm; a tinted red is a signal.
- **Focus ring:** 2px solid amber-500/50, 2px offset on void-black. Visible, branded, non-jarring.

### Badges
Pill-shaped (full radius), 11px text, always icon-paired.

- **Default:** Charcoal-raised fill, ash-secondary text, 1px charcoal-border ring.
- **Success / Error / Warning / Info:** Transparent fill with 10% status-color background tint, matching hue text, 1px status-color ring at 20% opacity.
- Every status badge includes a matching icon to the left of the label.

### Cards
Two distinct containment surfaces.

- **Standard Card:** `rounded-xl` (12px), charcoal-surface background (#18181b), zinc-800 border at 70% opacity, ambient card shadow, 1px inner highlight.
- **Glass Card:** `rounded-xl`, white/3% background, white/6% border, 20px backdrop-blur. Reserved for overlays and floating panels that must appear lifted from the page. Never used for primary content containers.

**The No-Nested-Cards Rule.** Cards never contain cards. Sub-sections within a card use dividers, tonal background shifts, or section labels, not nested card components.

### Inputs / Form Fields
- **Style:** `rounded-lg` (8px), zinc-800 border, zinc-900/70 background, zinc-600 placeholder text. Inset shadow adds depth.
- **Focus:** Border shifts to amber-500/60; 3px amber-500/10 ring appears outside the border.
- **Labels:** Uppercase, 0.1em letter-spacing, 0.6875rem, semibold zinc-500. Spaced 6px below label to input.
- **Disabled:** 40% opacity across all form elements.

### Navigation
- **Shell:** Sticky, 56px height, zinc-950/85 background with 20px backdrop-blur, zinc-800/80 bottom border.
- **Nav items:** `rounded-lg` (8px), 12px DM Sans text, 150ms ease-out transition.
- **Default:** Ash-muted (#71717a) text, transparent fill.
- **Hover:** Ash-primary (#f4f4f5) text, charcoal-raised/50 fill.
- **Active:** Intelligence-amber (#f59e0b variant) text, amber-500/10 fill, amber-500/20 border.
- **Logo mark:** Amber-500/10 icon container with amber-400 icon; Syne wordmark with amber-400 accent.

### Data Table
SAT's primary output surface. Assessment findings render here. This component matters more than any other.

- Container: charcoal-surface background, zinc-800 border, ambient card shadow.
- Column headers: Label styling (0.6875rem, uppercase, 0.1em tracking, ash-muted color).
- Row hover: zinc-800/30 background lift, 150ms transition.
- Null and empty cells: ash-muted em-dash. Never blank.
- Numeric values: JetBrains Mono, tabular-nums, right-aligned.
- Boolean values: success badge (emerald) for true, default badge (zinc) for false.
- Search and pagination controls sit in-line at the table header and footer; they do not float.

## 6. Do's and Don'ts

### Do:
- **Do** use intelligence-amber only for brand identity, active/selected states, primary CTAs, and focus rings. Its rarity is the signal.
- **Do** pair every status color with a matching icon. Color is never the sole signal for status.
- **Do** use JetBrains Mono with `tabular-nums` for all numeric and technical data in tables and metric displays.
- **Do** use `rounded-xl` (12px) for card containers and `rounded-lg` (8px) for controls. Keep the hierarchy consistent and never invert it.
- **Do** allow surfaces to carry their ambient shadow at rest. Depth is structural here, not earned by hover alone.
- **Do** write form labels as instrument markings: short, uppercase, direct. The user is a DBA; treat them like one.
- **Do** keep body text within 70ch line length on description and explanation copy.
- **Do** use the three-tier surface system (void, surface, raised) to communicate containment before adding any other visual treatment.

### Don't:
- **Don't** use hero-metric templates: big number, small label, gradient accent background, surrounding stats. This is the generic SaaS dashboard pattern SAT was built to make obsolete.
- **Don't** use gradient text (no `background-clip: text` with a gradient fill). The `.text-gradient-amber` utility in `index.css` is a legacy helper; do not use it in new components.
- **Don't** use side-stripe borders (no `border-left` or `border-right` greater than 1px as a colored accent) on cards, list items, callouts, or alerts.
- **Don't** nest cards inside cards. Ever. Dividers and tonal shifts handle internal card structure.
- **Don't** build cluttered data grids: every table needs column hierarchy, consistent null handling, row hover states, and breathing room above the first data row.
- **Don't** use rounded corners beyond `rounded-xl` (12px) for containers. Pill-shaped containers signal consumer applications, not intelligence tooling.
- **Don't** write playful or cheerful empty states. Empty state copy is informative and direct.
- **Don't** use glassmorphism decoratively. The glass card surface exists for overlays and floating panels only.
- **Don't** reach for a modal as the first solution. Inline expansion, slide-over panels, and contextual detail views handle most cases without blocking the primary view.
- **Don't** apply amber glow to more than one element per view. Competing glows lose all directional value.
- **Don't** let status colors appear without their paired icon. A red badge with no icon is inaccessible and ambiguous.
