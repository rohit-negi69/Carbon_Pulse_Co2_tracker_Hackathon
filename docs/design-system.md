---
name: CarbonPulse
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#2b6954'
  on-secondary: '#ffffff'
  secondary-container: '#adedd3'
  on-secondary-container: '#306d58'
  tertiary: '#006194'
  on-tertiary: '#ffffff'
  tertiary-container: '#007bb9'
  on-tertiary-container: '#fdfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#b0f0d6'
  secondary-fixed-dim: '#95d3ba'
  on-secondary-fixed: '#002117'
  on-secondary-fixed-variant: '#0b513d'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#93ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  data-tabular:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an institutional-grade, high-trust climate intelligence environment. It blends modern European SaaS restraint with high-precision analytical utility. The aesthetic targets sustainability executives, carbon accountants, and operations directors who require empirical rigor rather than decorative ecological tropes.

The visual execution combines architectural minimalism with subtle tactile data elements. It relies on crisp low-contrast delineations, muted slate surfaces, and calibrated botanical greens that signal authority and vitality without veering into playful consumer motifs. Interactions must feel decisive, rapid, and transparent, avoiding heavy theatrical motion in favor of precise numerical transitions and high-legibility telemetry.

## Colors

The palette balances institutional gravitas with actionable ecological telemetry:

- **Primary (`#059669` / Emerald 600)**: Serves as the primary operational action color, positive delta indicator, and primary active state token. Paired with a brighter tier (`#10B981`) exclusively for data-density points and miniature telemetry highlights.
- **Secondary (`#064E3B` / Deep Forest)**: Grounding tone utilized for structural headers, primary high-emphasis badges, and deep semantic focal points.
- **Tertiary (`#0284C7` / Sky 600)**: Reserved for carbon offset tracking, neutrality verification indicators, and water/atmospheric sub-indices.
- **Neutral (`#0F172A` / Slate 900)**: The foundational typography and border anchor. Canvas surfaces utilize soft slate tones (`#F8FAFC` base, `#F1F5F9` sub-tier), preventing pure white glare across complex analytics dashboards.
- **Functional Semantics**:
  - Warning/Transition: Amber (`#D97706` / `#F59E0B`) for trajectory risks and near-threshold metrics.
  - Critical/Excess: Rose (`#E11D48`) for target breaches and statutory compliance lapses.

## Typography

The typographic architecture establishes distinct roles for structural navigation and analytical consumption:

- **Display & Headlines (`Plus Jakarta Sans`)**: Applied to all view titles, structural milestones, and primary metric aggregates. Its subtle geometric curvature softens industrial data layouts without reducing legibility.
- **Body & Data Tables (`Inter`)**: Deployed for explanatory copy, analytical narratives, lists, and form structures. Inter’s neutral grotesque skeleton guarantees maximum clarity across dense data matrices.
- **Tabular Numerics**: All numeric telemetry values, calculator outputs, and chart indicators must enforce `font-feature-settings: "tnum" 1, "cv05" 1` to prevent layout reflow during live data recalculations.

## Layout & Spacing

The layout model utilizes a responsive 12-column fluid grid governed by an 8pt architectural rhythm, nested within a maximum reading canvas of `1440px`.

- **Breakpoints**:
  - Desktop (`≥1024px`): Full 12-column grid, `2rem` margin, `1.5rem` gutters. Allows dense dual-panel split screens (e.g., interactive carbon modeler on the left, live carbon balance sheet on the right).
  - Tablet (`768px - 1023px`): 8-column layout, `1.5rem` margin, `1rem` gutters. Side-by-side modules collapse to single-column blocks with sticky computational summaries.
  - Mobile (`<768px`): 4-column layout, `1rem` margins and gutters. Analytical tables reflow into discrete vertical data cards; interactive sliders expand to full canvas width.
- **Spacing Rhythm**: Internal container paddings strictly follow `space-md` (`1rem`) for standard cards and `space-lg` (`1.5rem`) for analytical hubs. Micro-spacing within telemetry groups (e.g., badge icons to labels) relies on `space-xs` (`0.25rem`) and `space-sm` (`0.5rem`).

## Elevation & Depth

This design system avoids theatrical drop shadows in favor of a layered, high-precision architectural depth model combining tonal planes and fine borders:

- **Surface Tiers**:
  - `Base Canvas`: Slate `#F8FAFC`.
  - `Surface Level 1 (Cards, Modules)`: Pure `#FFFFFF` bordered with an imperceptible line (`1px solid #E2E8F0`).
  - `Surface Level 2 (Sub-panels, Inputs, Recessed calculation cells)`: Slate `#F1F5F9` with inset definition.
- **Shadow Profile**: Where elevation is required (such as flyout filters, active tooltips, or elevated calculation modules), use a single low-amplitude, slate-tinted ambient shadow: `0 4px 20px -2px rgba(15, 23, 42, 0.06), 0 1px 3px 0 rgba(15, 23, 42, 0.04)`.
- **Active State Highlights**: Modals and focused interactive widgets receive a crisp 1px bounding ring in Forest/Emerald tint (`rgba(5, 150, 105, 0.25)`) rather than an expansive colored glow.

## Shapes

The shape system employs Level 1 (Soft) geometry to project precision, efficiency, and engineering authority:

- **Base Radius (`0.25rem` / 4px)**: Applied to micro-components, data-cell selections, radio/checkbox containers, and inline telemetry indicators.
- **Standard Radius (`0.5rem` / 8px)**: Applied to core UI structures including metric cards, calculation input panels, data tables, and modal dialogs.
- **Extended Radius (`0.75rem` / 12px)**: Restricted exclusively to high-level parent layout canvases and contextual overlay sheets.
- **Pill Exception**: Full circular radii (`9999px`) are strictly reserved for qualitative telemetry badges, scope status pills (Scope 1, 2, 3), and counter chips.

## Components

### Buttons
- **Primary**: Solid Emerald (`#059669`) background, `#FFFFFF` text, `0.25rem` radius. On hover, transitions to `#047857`. Focus state adds a `2px` offset ring in `#10B981`.
- **Secondary**: Slate `#FFFFFF` background, `1px solid #CBD5E1` border, `#0F172A` text. Hover brings surface `#F8FAFC` and border `#94A3B8`.
- **Ghost/Tertiary**: No background or border; `#059669` or `#475569` text with an internal pad of `space-sm` to `space-md`.

### Cards & Metric Modules
- Encased in `#FFFFFF` with `1px solid #E2E8F0` and `0.5rem` border radius.
- Standard layout contains:
  1. Top header row: Metric title in `label-sm` uppercase, coupled with a Scope pill badge.
  2. Core aggregate: Large display metric in `Plus Jakarta Sans` (`headline-lg`), using tabular numbers.
  3. Contextual footer: Delta telemetry tag showing variance over prior baseline period.

### Telemetry Badges & Chips
- Ultra-compact indicators with `9999px` border radius, padding `2px 8px`, and `label-sm` font.
- **Emissions Neutral / Target Met**: Background `#ECFDF5`, text `#065F46`, left-anchored dot in `#10B981`.
- **Offset Verification**: Background `#F0F9FF`, text `#0369A1`, left-anchored dot in `#0284C7`.
- **Target Risk**: Background `#FFFBEB`, text `#92400E`, left-anchored dot in `#F59E0B`.
- **Target Exceeded**: Background `#FFF1F2`, text `#9F1239`, left-anchored dot in `#E11D48`.

### Calculator Widgets & Inputs
- **Numeric Entry Fields**: `#FFFFFF` background, inset border `1px solid #CBD5E1`, padding `8px 12px`, with monospaced or tabular font for live carbon coefficient inputs. Trailing static units (`tCO2e`, `kWh`, `MWh`) styled in `#64748B`.
- **Interactive Sliders**: Track height `4px` in `#E2E8F0`, filled progress line in `#059669`. Thumb is an `18px` circle (`#FFFFFF`) with a `2px solid #059669` rim and crisp micro-shadow for precise touch-point targeting.

### Data Visualizations & Tables
- **Charts**: Use clean Cartesian grids with stroke `#F1F5F9`. Primary area paths use `#059669` at 15% gradient fill; comparison baselines use dashed lines in `#94A3B8`.
- **Tables**: Borderless interior cells with a simple `1px solid #F1F5F9` bottom row divider. Alternating rows remain white to preserve typographic hierarchy. Column headers use `label-sm` in `#64748B` with subtle sort arrows.

### Checkboxes & Radios
- Square (`0.25rem` radius for checkboxes) and round (for radio) form fields using `1px solid #CBD5E1`. Checked state fills instantly with `#059669`, displaying a white geometric tick or radio dot.