---
name: 3d-light-ui-transform
description: >
  Transform any existing flat or simple UI into a high-end, premium 3D light-theme interface.
  Use this skill whenever the user wants to redesign, upgrade, or convert a UI into a 3D,
  light-themed, tactile, or premium product-level experience. Triggers include: "redesign my
  UI", "make it look premium", "add depth", "3D interface", "light theme upgrade", "make it
  look like Apple/Linear/Stripe", "add parallax", "elevated cards", "glass morphism light",
  "modern SaaS UI", or any request to visually enhance an existing component or page.
  Always use this skill when the deliverable is a polished, production-grade visual UI with
  shadows, depth, motion, or elevated design quality — even if the user doesn't say "3D" explicitly.
---

# 3D Light-Theme UI Transformation Skill

## Executive Summary

This skill enables front-end engineers and designers to systematically convert flat, legacy, or simple UIs into premium, light-themed interfaces with authentic 3D depth, tactile shadows, physics-based micro-interactions, and accessibility-first architecture. The transformation follows a token-driven design system, reusable component library, and performance-budgeted delivery pipeline — producing interfaces that feel like world-class SaaS products (Linear, Stripe, Vercel, Apple) while remaining WCAG 2.1 AA compliant, sub-2.5s LCP, and zero CLS on first paint.

---

## 1. Vision & Success Metrics

### Goals
- Achieve premium perceived quality with measurable UI metrics
- Deliver modular, token-driven light-theme design system
- Ship accessible, performant 3D UI in production

### KPIs

| Metric | Target |
|--------|--------|
| Lighthouse Performance | ≥ 90 |
| LCP | ≤ 2.5s |
| CLS | ≤ 0.05 |
| FID / INP | ≤ 100ms |
| WCAG Contrast AA | ≥ 4.5:1 body, ≥ 3:1 large |
| Animation FPS | 60fps (GPU-composited only) |
| Perceived Premium Score (user test) | ≥ 80/100 |
| Task Completion Rate | ≥ 95% |

---

## 2. Reference Architecture Map

| Layer | Existing (Flat) | Target (3D Light) |
|-------|----------------|-------------------|
| Color system | Hard-coded hex values | Design token JSON, semantic aliases |
| Typography | Mixed font scales | 8pt grid, fluid type scale, variable fonts |
| Shadows | None or `box-shadow: 0 1px 3px` | 6-level elevation system with ambient + key light |
| Surfaces | White/gray fills | Layered translucent surfaces, frosted glass |
| Motion | CSS transitions (basic) | Spring physics, GPU-composited transforms |
| 3D | None | CSS `perspective`, `transform3d`, SVG depth maps |
| Components | Flat cards, basic buttons | Elevated, tilting cards; haptic-feel buttons |
| Icons | PNG or basic SVGs | Consistent stroke-fill, optically balanced |
| Accessibility | Minimal | Focus rings, ARIA, skip links, reduced-motion |
| Build | Raw CSS | CSS custom properties + PostCSS + token pipeline |

---

## 3. Design Language System

### 3.1 Typography

Use a fluid type scale on an 8pt grid. Prefer variable fonts for weight animation.

```json
// tokens/typography.json
{
  "font": {
    "family": {
      "display": "\"Inter Variable\", system-ui, sans-serif",
      "mono": "\"JetBrains Mono\", monospace"
    },
    "scale": {
      "xs":   { "size": "0.75rem",  "line": "1rem",    "weight": "400" },
      "sm":   { "size": "0.875rem", "line": "1.25rem", "weight": "400" },
      "base": { "size": "1rem",     "line": "1.5rem",  "weight": "400" },
      "lg":   { "size": "1.125rem", "line": "1.75rem", "weight": "500" },
      "xl":   { "size": "1.25rem",  "line": "1.75rem", "weight": "500" },
      "2xl":  { "size": "1.5rem",   "line": "2rem",    "weight": "600" },
      "3xl":  { "size": "1.875rem", "line": "2.25rem", "weight": "700" },
      "4xl":  { "size": "2.25rem",  "line": "2.5rem",  "weight": "800" },
      "5xl":  { "size": "3rem",     "line": "1",       "weight": "900" }
    },
    "tracking": {
      "tight": "-0.025em",
      "normal": "0",
      "wide": "0.025em",
      "display": "-0.04em"
    }
  }
}
```

**Rules:**
- Display headings: tight tracking (`-0.03em` to `-0.05em`), heavy weight (700–900)
- Body: `0` tracking, 400–500 weight
- Never use `font-size` below `0.75rem` (12px)
- Line lengths: 60–75 characters for reading comfort

### 3.2 Color — Light Palette

**Light theme only.** All surfaces must be light. No dark mode tokens included.

```json
// tokens/color.json
{
  "color": {
    "background": {
      "canvas":   "#F8F9FB",
      "base":     "#FFFFFF",
      "subtle":   "#F2F4F7",
      "muted":    "#E8ECF0",
      "overlay":  "rgba(255,255,255,0.72)"
    },
    "border": {
      "default":  "#E2E6EA",
      "strong":   "#CBD2DA",
      "focus":    "#0066FF"
    },
    "text": {
      "primary":   "#0D1117",
      "secondary": "#4A5568",
      "tertiary":  "#8896A5",
      "disabled":  "#B0BAC4",
      "inverse":   "#FFFFFF",
      "brand":     "#0052CC"
    },
    "brand": {
      "50":  "#EFF6FF",
      "100": "#DBEAFE",
      "200": "#BFDBFE",
      "300": "#93C5FD",
      "400": "#60A5FA",
      "500": "#3B82F6",
      "600": "#2563EB",
      "700": "#1D4ED8",
      "800": "#1E40AF",
      "900": "#1E3A8A"
    },
    "status": {
      "success": "#059669",
      "warning": "#D97706",
      "error":   "#DC2626",
      "info":    "#0284C7"
    }
  }
}
```

**Contrast requirements (WCAG 2.1 AA):**
- Body text on `background.base`: ≥ 4.5:1 → use `text.primary` (#0D1117) ✓ 17:1
- Secondary text: ≥ 4.5:1 → use `text.secondary` (#4A5568) ✓ 7.2:1
- Interactive elements large text: ≥ 3:1

### 3.3 Elevation & Shadow Tokens

Six-level system. Shadows simulate a single overhead diffuse light source (top-center).

```css
/* tokens/elevation.css */
:root {
  /* Ambient base + key light shadow */
  --elevation-0: none;

  --elevation-1:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 1px 3px rgba(0, 0, 0, 0.06);

  --elevation-2:
    0 2px 4px rgba(0, 0, 0, 0.04),
    0 4px 8px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.04);

  --elevation-3:
    0 4px 6px rgba(0, 0, 0, 0.04),
    0 8px 16px rgba(0, 0, 0, 0.06),
    0 2px 4px rgba(0, 0, 0, 0.04);

  --elevation-4:
    0 8px 12px rgba(0, 0, 0, 0.05),
    0 16px 32px rgba(0, 0, 0, 0.08),
    0 4px 8px rgba(0, 0, 0, 0.04);

  --elevation-5:
    0 16px 24px rgba(0, 0, 0, 0.06),
    0 32px 48px rgba(0, 0, 0, 0.10),
    0 8px 16px rgba(0, 0, 0, 0.04);

  --elevation-6:
    0 24px 40px rgba(0, 0, 0, 0.08),
    0 48px 80px rgba(0, 0, 0, 0.12),
    0 12px 24px rgba(0, 0, 0, 0.06);

  /* Border accompaniment for depth realism */
  --elevation-border-1: inset 0 1px 0 rgba(255,255,255,0.9),
                         inset 0 -1px 0 rgba(0,0,0,0.04);
  --elevation-border-2: inset 0 1px 0 rgba(255,255,255,0.95),
                         inset 0 -1px 0 rgba(0,0,0,0.06);
}
```

**Usage guide:**
- `elevation-1`: Hover states, chips, tags
- `elevation-2`: Cards, panels, dropdowns
- `elevation-3`: Floating action buttons, popovers
- `elevation-4`: Modals, drawers
- `elevation-5`: Command palette, full-screen overlays
- `elevation-6`: Tooltips anchored to high-z content

### 3.4 Motion

All animations must use GPU-composited properties only (`transform`, `opacity`). Never animate `box-shadow`, `width`, `height`, `top`, `left`.

```json
// tokens/motion.json
{
  "motion": {
    "duration": {
      "instant":  "50ms",
      "fast":     "120ms",
      "normal":   "200ms",
      "slow":     "350ms",
      "slower":   "500ms"
    },
    "easing": {
      "standard":    "cubic-bezier(0.4, 0, 0.2, 1)",
      "decelerate":  "cubic-bezier(0, 0, 0.2, 1)",
      "accelerate":  "cubic-bezier(0.4, 0, 1, 1)",
      "spring":      "cubic-bezier(0.34, 1.56, 0.64, 1)",
      "sharp":       "cubic-bezier(0.4, 0, 0.6, 1)"
    }
  }
}
```

### 3.5 Iconography

- **Style:** 1.5px stroke, round caps/joins, 24px grid with 2px optical padding
- **Format:** Inline SVG (no icon fonts)
- **Filled vs outlined:** Outlined for navigation/labels; filled for active/selected states
- **Size tokens:** `icon-xs` 12px, `icon-sm` 16px, `icon-md` 20px, `icon-lg` 24px, `icon-xl` 32px

---

## 4. 3D UI Techniques

### 4.1 Perspective & Transform3D

```css
/* Establish 3D context on container */
.scene {
  perspective: 1000px;
  perspective-origin: 50% 50%;
}

/* Card with 3D depth */
.card-3d {
  transform-style: preserve-3d;
  transform: translateZ(0); /* GPU promote */
  transition: transform var(--motion-normal) var(--easing-spring);
  will-change: transform;
}

.card-3d:hover {
  transform: translateY(-4px) rotateX(2deg) rotateY(-1deg);
}
```

### 4.2 Lighting Model

Simulate a top-left overhead light source using:
1. **Highlight:** `inset 0 1px 0 rgba(255,255,255,0.9)` (top edge light catch)
2. **Rim light:** subtle gradient `background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%)`
3. **Shadow:** elevation tokens (ambient + key)
4. **Specular sheen:** pseudo-element overlay that tracks mouse position via JS

### 4.3 Parallax Layers

Three-depth parallax system:
- **Layer 0 (background):** moves at 0.2× scroll speed (static texture/gradient)
- **Layer 1 (content):** moves at 1× (normal)
- **Layer 2 (foreground):** moves at 1.3× (floating elements, badges)

```javascript
// Lightweight parallax — no library needed
const parallaxItems = document.querySelectorAll('[data-parallax]');
let ticking = false;

window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      const scrollY = window.scrollY;
      parallaxItems.forEach(el => {
        const speed = parseFloat(el.dataset.parallax) || 0.5;
        el.style.transform = `translateY(${scrollY * speed * -1}px)`;
      });
      ticking = false;
    });
    ticking = true;
  }
});
```

### 4.4 Glass Morphism (Light)

Light-theme frosted glass — uses white-tinted blur, NOT dark:

```css
.glass-panel {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: var(--elevation-3),
              inset 0 1px 0 rgba(255,255,255,0.95);
}
```

### 4.5 Depth Maps & SVG Extrusion

For hero illustrations, use layered SVGs with `filter: drop-shadow()` and staggered z-translate on scroll:

```html
<!-- Generative prompt for AI image tools -->
<!-- "Isometric 3D UI component, soft white background, pastel blue accents,
      ambient occlusion shadows, product photography lighting, top-left key light,
      8K render, no text, isolated on white, SVG-compatible geometry" -->
```

---

## 5. Component Library Blueprint

### Atoms

| Component | Light-Theme Rules | 3D Affordance |
|-----------|------------------|---------------|
| Button (Primary) | Brand fill, white text, 4px radius | `elevation-2` resting, `elevation-1` pressed (translateY +1px) |
| Button (Ghost) | Transparent, brand border | Subtle `elevation-1` on hover |
| Input | White fill, `border.default`, 6px radius | `elevation-1` on focus with brand ring |
| Badge | `background.subtle`, `text.secondary` | Flat (no elevation) |
| Avatar | Ring border, `elevation-2` | Subtle tilt on hover |
| Checkbox/Radio | White fill, brand check color | Scale 1.05 on check animation |

### Molecules

| Component | Composition | 3D Behavior |
|-----------|------------|-------------|
| Card | Surface + content + optional media | `elevation-2` → `elevation-4` on hover, tilt 2–3° |
| Dropdown | Trigger + floating panel | Slide in with `translateY(-8px)` → `translateY(0)` + `elevation-5` |
| Toast | Icon + text + dismiss | Slide in from bottom + `elevation-5` |
| Form Field | Label + input + helper | No elevation; focus ring only |
| Search Bar | Icon + input + shortcut | `elevation-2` on focus |

### Organisms

| Component | Notes |
|-----------|-------|
| Navigation Bar | Sticky; glass morphism on scroll; `elevation-3` when floating |
| Data Table | Alternating `background.subtle` rows; sortable headers with tilt icon |
| Modal | `elevation-6`; backdrop `rgba(15,23,42,0.3)`; entrance `scale(0.96) → scale(1)` |
| Command Palette | Full-width, center; `elevation-6`; blur backdrop |
| Hero Section | Three-layer parallax; floating 3D illustration; gradient mesh background |

---

## 6. React Component — 3D Elevated Card

```tsx
// components/Card3D.tsx
import { useRef, useState, useCallback } from 'react';

interface Card3DProps {
  children: React.ReactNode;
  className?: string;
  elevation?: 1 | 2 | 3 | 4;
  tiltStrength?: number;
}

export function Card3D({
  children,
  className = '',
  elevation = 2,
  tiltStrength = 8,
}: Card3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('');
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const x = (e.clientX - left) / width;   // 0–1
    const y = (e.clientY - top)  / height;  // 0–1
    const rotateX = (y - 0.5) * -tiltStrength;
    const rotateY = (x - 0.5) *  tiltStrength;
    setTransform(`perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(8px)`);
    setGlowPos({ x: x * 100, y: y * 100 });
  }, [tiltStrength]);

  const handleMouseLeave = useCallback(() => {
    setTransform('perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0px)');
    setGlowPos({ x: 50, y: 50 });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`card-3d elevation-${elevation} ${className}`}
      style={{
        transform,
        transition: transform
          ? 'transform 50ms cubic-bezier(0.4, 0, 0.2, 1)'
          : 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px',
        background: '#ffffff',
      }}
      role="article"
    >
      {/* Specular highlight overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${glowPos.x}% ${glowPos.y}%,
            rgba(255,255,255,0.25) 0%,
            transparent 60%)`,
          pointerEvents: 'none',
          borderRadius: 'inherit',
          transition: 'background 80ms ease',
        }}
      />
      {children}
    </div>
  );
}
```

```css
/* Card elevation classes — map to CSS custom properties */
.elevation-1 { box-shadow: var(--elevation-1), var(--elevation-border-1); }
.elevation-2 { box-shadow: var(--elevation-2), var(--elevation-border-2); }
.elevation-3 { box-shadow: var(--elevation-3), var(--elevation-border-2); }
.elevation-4 { box-shadow: var(--elevation-4), var(--elevation-border-2); }
```

---

## 7. Interaction Patterns

### Navigation
- Sticky header: transitions from transparent → glass morphism at 60px scroll
- Active state: brand-colored bottom border + bold weight (no background highlight)
- Mobile: drawer from left, `elevation-6`, spring entrance animation

### Modals & Dialogs
```css
.modal-overlay {
  background: rgba(15, 23, 42, 0.25);
  backdrop-filter: blur(4px);
}

.modal-panel {
  transform-origin: center bottom;
  animation: modal-enter 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

### Cards with 3D Affordance
- Rest: `elevation-2`
- Hover: `elevation-4` + tilt 2–4° + `translateY(-4px)` + specular glow
- Active/click: `elevation-1` + `translateY(+1px)` (press-in haptic feel)

### Button Press Physics
```css
.btn-primary {
  transition: transform 80ms var(--easing-standard),
              box-shadow 80ms var(--easing-standard);
}
.btn-primary:hover  { transform: translateY(-1px); box-shadow: var(--elevation-3); }
.btn-primary:active { transform: translateY(1px);  box-shadow: var(--elevation-1); }
```

---

## 8. Accessibility & Performance Budget

### Accessibility Checklist
- [ ] All interactive elements have visible focus ring (`outline: 2px solid var(--color-border-focus); outline-offset: 2px`)
- [ ] Color contrast ≥ 4.5:1 body text, ≥ 3:1 large text and UI components
- [ ] `prefers-reduced-motion`: disable parallax and tilt, keep simple opacity fades
- [ ] All icons have `aria-hidden="true"` + companion text or `aria-label`
- [ ] Modals trap focus; return focus on close
- [ ] Skip-to-content link at page top
- [ ] Keyboard navigation: Tab, Shift+Tab, Enter, Escape, Arrow keys all functional

```css
/* Reduced motion override — always include */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  [data-parallax] { transform: none !important; }
  .card-3d { transform: none !important; }
}
```

### Performance Budget

| Asset | Budget |
|-------|--------|
| Total JS (compressed) | ≤ 200KB |
| Total CSS | ≤ 50KB |
| Hero image (WebP) | ≤ 120KB |
| Icon sprite (SVG) | ≤ 30KB |
| Custom font (woff2 variable) | ≤ 80KB |
| LCP | ≤ 2.5s on 4G |
| CLS | ≤ 0.05 |
| TBT | ≤ 200ms |

**3D performance rules:**
- Only animate `transform` and `opacity` (GPU composited)
- Use `will-change: transform` only on actively animating elements; remove after animation
- Cap `backdrop-filter` blur at 24px (beyond = GPU thrash on low-end)
- Parallax: `requestAnimationFrame` with `ticking` guard (see §4.3)
- Avoid `filter: drop-shadow()` on elements that repaint frequently

---

## 9. Handoff Guide

### Token Pipeline

```
tokens/*.json
  → Style Dictionary build
  → dist/css/variables.css   (CSS custom properties)
  → dist/js/tokens.js        (JS constants)
  → dist/ios/tokens.swift    (optional)
```

### Figma Token Schema (Tokens Studio format)

```json
{
  "$type": "shadow",
  "elevation/2": {
    "$value": [
      { "x": 0, "y": 2, "blur": 4,  "spread": 0, "color": "rgba(0,0,0,0.04)" },
      { "x": 0, "y": 4, "blur": 8,  "spread": 0, "color": "rgba(0,0,0,0.06)" },
      { "x": 0, "y": 1, "blur": 2,  "spread": 0, "color": "rgba(0,0,0,0.04)" }
    ]
  }
}
```

### CI Checks
```yaml
# .github/workflows/design-lint.yml
- name: Token parity check
  run: node scripts/check-token-parity.js

- name: Contrast audit
  run: npx @accessibility/contrast-checker --config a11y.config.json

- name: Bundle size
  run: npx bundlesize --config bundlesize.config.json

- name: Lighthouse CI
  run: npx lhci autorun
```

### Code Scaffolding

```bash
# Generate new component with 3D skeleton
npx plop component --name CardProduct --elevation 2 --tilt true --glass false
```

---

## 10. Validation Plan

### Usability Tests
1. **Card click affordance:** Do users perceive cards as clickable? (Target: ≥ 85%)
2. **Focus visibility:** Can keyboard users track their position? (Target: 100% pass)
3. **Hierarchy clarity:** Do users identify the primary CTA within 3 seconds? (Target: ≥ 90%)

### A/B Tests
| Variant | Hypothesis | Metric |
|---------|-----------|--------|
| A: Elevation-2 cards | Control | Click-through rate |
| B: Elevation-4 + tilt | Tactile feel increases engagement | +15% CTR expected |

### Automated Testing
```typescript
// Example: test card elevation tokens are applied
it('Card renders with correct elevation CSS var', () => {
  const { container } = render(<Card3D elevation={2} />);
  expect(container.firstChild).toHaveStyle(
    'box-shadow: var(--elevation-2)'
  );
});
```

### Composable Test Scenarios
- [ ] Light source consistency across all card orientations
- [ ] Shadow rendering on non-white backgrounds (`background.subtle`)
- [ ] Tilt respects `prefers-reduced-motion`
- [ ] All tokens compile without conflicts
- [ ] Contrast passes on all text/background combos

---

## 11. Generative Asset Prompts

### 3D Hero Illustration (for Midjourney / DALL-E / Firefly)
```
"Isometric 3D UI dashboard components floating in space, soft white background,
pastel blue and lavender accent colors, ambient occlusion, soft product photography
lighting with top-left key light, subtle shadows, depth of field blur on far elements,
clean minimal style, no text, no dark backgrounds, rendered at 4K"
```

### SVG Texture (Light Noise)
```
"Subtle grain texture overlay, extremely low opacity white noise, 400x400px tileable,
light gray tones only, no dark pixels, for use as CSS background-image on white surfaces"
```

### Icon Generation Prompt
```
"Single line icon, 24px grid, 1.5px stroke weight, rounded caps, light gray (#8896A5),
minimal, geometric, no fill, isolated on white, SVG format, [ICON SUBJECT]"
```

---

## Quick Reference: Step-by-Step Transform Checklist

1. **Audit** existing CSS — extract all colors, shadows, type sizes into a token map
2. **Replace** all values with design tokens from §3 (color, typography, elevation, motion)
3. **Add** elevation CSS variables (§3.3) to `:root`
4. **Wrap** card/panel components with `Card3D` pattern (§6)
5. **Add** `perspective` and `transform-style: preserve-3d` to layout containers
6. **Implement** glass navbar (§7) with scroll detection
7. **Apply** parallax to hero section background (§4.3)
8. **Add** `prefers-reduced-motion` overrides (§8)
9. **Run** contrast + Lighthouse audits
10. **Deliver** tokens to Figma via Tokens Studio for designer sync
