# Eternalgy Design System — V2
**Source Reference:** `public/domestic-v4.html` (Domestic V4 · Solar PV Planner)  
**Last Extracted:** May 2026  
**Status:** Living Document — Foundation for all future Eternalgy UI

---

## 1. Philosophy

The Eternalgy design language is **mobile-first, data-dense, and trust-building**. Every element answers one implicit user question: *"Can I trust this solar calculation?"*

- **Dark-on-light hierarchy** — white cards float on a muted green field
- **Green as the signal colour** — green means "good outcome", "active", "confirmed"
- **Numbers as heroes** — large weight-800 figures are the primary communication unit
- **No decoration without data** — every visual element (bar, chart, badge) carries a real value

---

## 2. Colour Palette

### 2.1 Primary Accent (Green)

| Token        | Hex       | Usage |
|-------------|-----------|-------|
| `primary`   | `#16a34a` | Active states, CTA borders, positive values |
| `light`     | `#22c55e` | On-dark text (hero savings, LIVE badge, nav accents) |
| `bg`        | `#dcfce7` | Tinted backgrounds for selected/active elements |
| `border`    | `#86efac` | Borders of green-tinted cards/modals |
| `dark`      | `#14532d` | Deep emphasis text on green backgrounds |

### 2.2 Application Shell

| Token            | Hex       | Usage |
|-----------------|-----------|-------|
| `page-bg`       | `#bbf7d0` | Outermost body background (browser chrome) |
| `app-bg`        | `#f1f5f1` | The #root container background |
| `navbar-bg`     | `#0d1f0f` | Top nav + hero dark cards |
| `dark-card`     | `#1a2e1c` | Darker variant dark cards |
| `darkest-card`  | `#091407` | Bottom metric strip on hero card |

### 2.3 Semantic Colours

| State   | Background | Border    | Text / Heading |
|---------|-----------|-----------|---------------|
| Success | `#dcfce7` | `#86efac` | `#16a34a` |
| Warning | `#fffbeb` | `#fde68a` | `#d97706` / `#92400e` |
| Error   | `#fef2f2` | `#fecaca` | `#991b1b` |
| Info    | `#eff6ff` | —         | `#3b82f6` / `#60a5fa` |

### 2.4 Neutral Scale

| Token     | Hex       | Usage |
|----------|-----------|-------|
| `gray-50` | `#fafafa` | Alternating table row (odd) |
| `gray-100`| `#f3f4f6` | Card section dividers, table bg |
| `gray-200`| `#e5e7eb` | Divider lines, inactive step connectors |
| `gray-300`| `#d1d5db` | Inactive button borders, before-bar fill |
| `gray-400`| `#9ca3af` | Step labels, sub-text, meta info |
| `gray-500`| `#6b7280` | Field labels, secondary text |
| `gray-700`| `#374151` | Body text, table values |
| `gray-900`| `#111827` | Primary headings, numbers |

---

## 3. Typography

**Font Family:** `Plus Jakarta Sans` (Google Fonts)  
**Fallback:** `-apple-system, BlinkMacSystemFont, sans-serif`  
**Weights used:** 400 · 500 · 600 · 700 · 800

### 3.1 Type Scale

| Role                  | Size  | Weight | Color     | Notes |
|----------------------|-------|--------|-----------|-------|
| Hero Value           | 58px  | 800    | `#22c55e` | On dark bg, letter-spacing -2px, line-height 1 |
| Large Metric         | 36px  | 800    | context   | Finance net cost |
| Section Number       | 32px  | 800    | context   | Total savings summary |
| Card Amount          | 30px  | 800    | context   | Before/After bill amounts |
| Chart Headline       | 26px  | 800    | `#16a34a` | 25-year forecast value |
| Card Heading         | 24px  | 800    | `#111827` | Bill total |
| Standard Heading     | 18px  | 700    | `#111827` | Step card titles |
| Metric Value (chip)  | 22px  | 800    | context   | MetricChip value |
| Subheading           | 16px  | 700    | `#111827` | Card icon subheadings |
| CTA Button           | 15px  | 700    | `#fff`    | |
| Body / Row           | 13px  | 600    | `#374151` | Table rows, expand button title |
| Body Small           | 12px  | 500    | `#374151` | Detail rows, bill breakdown |
| Label / Meta         | 11px  | 600    | `#6b7280` | Field labels, legend text |
| Step Label           | 11px  | 600    | `#9ca3af` | Uppercase, letter-spacing 0.05em |
| Caption              | 10px  | 500-600| `#9ca3af` | Sub-labels, footnotes |
| Micro                | 9px   | 400    | `#9ca3af` | Chart axis ticks |

### 3.2 Step Label Pattern
```
font-size: 11px
font-weight: 600
color: #9ca3af
text-transform: uppercase
letter-spacing: 0.05em
```

---

## 4. Spacing & Radius

### 4.1 Spacing Tokens

| Token    | Value  | Usage |
|---------|--------|-------|
| `xs`    | 3px    | Icon margin, step circle inner gap |
| `sm`    | 6-8px  | Tag padding, gap between inline items |
| `md`    | 10-12px| Card section gap, inner card padding |
| `lg`    | 14-16px| Card padding horizontal, field gap |
| `xl`    | 18-20px| Card standard padding, section header bottom |
| `2xl`   | 24-28px| Desktop body padding |

### 4.2 Border Radius

| Component         | Radius |
|------------------|--------|
| App shell         | 36px   |
| Hero/dark card    | 20px   |
| Standard card     | 16px   |
| CTA button        | 14px   |
| Input field       | 12px   |
| Info banner       | 12px   |
| Metric chip       | 12px   |
| Expand button     | 10px   |
| Table container   | 10px   |
| SegmentedButton   | 10px   |
| Tag/badge         | 20px (pill) |
| Step connector    | 1px    |
| Small dot         | 2px    |

---

## 5. Elevation & Shadow

| Level      | Value | Used on |
|-----------|-------|---------|
| App shell | `0 32px 80px rgba(0,0,0,0.22)` | #root container (desktop) |
| Modal     | `0 24px 60px rgba(0,0,0,0.24)` | Overlay modals |
| None      | —     | Cards (depth via colour, not shadow) |

---

## 6. Component Library

### 6.1 NavBar
- Background: `#0d1f0f`
- Height: ~44px with 11px vertical padding
- Logo (img) + brand text column + right-side controls
- **Brand:** ETERNALGY 13px/700/`#fff`, subtitle 10px/`#4b5563`
- **Language toggle:** transparent bg, `rgba(255,255,255,0.22)` border, 8px radius
- **LIVE badge:** `#1e3a20` bg, `#22c55e` text, no border, 8px radius
- `position: sticky; top: 0; z-index: 200`

### 6.2 StepProgress
- White bar, `border-bottom: 1px solid #f3f4f6`
- Circles: 26×26px, 50% radius
  - Active/done: `#16a34a` fill, white text/checkmark
  - Inactive: `#d1d5db` fill
- Labels: 10px, 700 if active, 500 otherwise
- Connectors: `flex:1`, height 2px, `#16a34a` if done, `#e5e7eb` if not

### 6.3 Card
- Background: `#fff` (default) or `#1a2e1c` (dark)
- Border-radius: 16px
- Padding: 18px 16px
- No shadow — contrast with `#f1f5f1` page bg provides depth
- Wrapped in `SectionWrap` which adds `padding: 10px 14px 0`

### 6.4 Tag / Badge
- `display: inline-block`
- Background: `#dcfce7`, color: `#16a34a`
- Font: 11px, 700
- Padding: `3px 8px`
- Border-radius: 20px (pill)
- Custom colors passed as props

### 6.5 FieldLabel
- Font: 11px, 600
- Color: `#6b7280`
- Margin-bottom: 6px

### 6.6 TextField
- Outer: flex row, `border: 1px solid #d1d5db`, `border-radius: 12px`, padding `12px 14px`, bg `#fff`
- Prefix (e.g. "RM"): `#6b7280`, weight 700
- Input: no border, transparent bg, 18px/700/`#111827`
- Full width, `type="number"`

### 6.7 SelectField
- Outer: `border: 1px solid #d1d5db`, `border-radius: 12px`, bg `#fff`, `overflow: hidden`
- Select: no border, transparent bg, padding `14px 12px`, 14px/600/`#111827`
- Full width; browser default chevron

### 6.8 SegmentedButton
- Flex pair inside a `display: flex; gap: 8px` row
- Each button: `flex: 1`, padding `10px 8px`, `border-radius: 10px`
- **Active:** `border: 2px solid #16a34a`, bg `#dcfce7`, color `#16a34a`, weight 700
- **Inactive:** `border: 2px solid #e5e7eb`, bg `#fff`, color `#6b7280`, weight 600

### 6.9 MetricChip
- Background: `#f8faf8`, border-radius: 12px, padding `12px 8px`, text-align center
- Icon: 20px emoji, margin-bottom 4px
- Value: 22px/800/contextual color, line-height 1
- Label: 10px/`#6b7280`/600, margin-top 3px
- Sub: 9px/`#9ca3af`

### 6.10 CTA Buttons

**Primary Dark (Analyse Bill):**
```
background: #111827
color: #fff
border: none
border-radius: 14px
padding: 15px
font-size: 15px
font-weight: 700
width: 100%
```

**Primary Green (Generate ROI):**
```
background: #16a34a
color: #fff
border: none
border-radius: 14px
padding: 15px
font-size: 15px
font-weight: 700
width: 100%
```

**Disabled state:** `opacity: 0.6`, `cursor: not-allowed`  
**Loading state:** `opacity: 0.75`, `cursor: wait`

### 6.11 Expand / Accordion Button
- bg: `#f8faf8`, border: none, border-radius: 10px, padding: `11px 14px`
- Full width, flex row, space-between
- Left: title 13px/600/`#111827`, subtitle 11px/`#6b7280`
- Right: `▲` / `▼` in `#9ca3af`, 11px

### 6.12 Info Banners

**Warning (yellow):**
```
background: #fffbeb
border: 1px solid #fde68a
color: #92400e
border-radius: 12px
padding: 12px 14px
font-size: 12px
font-weight: 700
```

**Error (red):**
```
background: #fef2f2
border: 1px solid #fecaca
color: #991b1b
border-radius: 12px
padding: 12px 14px
font-size: 12px
font-weight: 600
```

**Success (green):**
```
background: #dcfce7
border: 1px solid #86efac
border-radius: 12px
padding: 12px 14px
color: #16a34a
```

### 6.13 Dark Package Banner
```
background: #0d1f0f
border-radius: 12px
padding: 12px 14px
```
- Label: 10px/`#22c55e`/700, package name 11px/`#9ca3af`
- Price: 16px/700/`#fff`

### 6.14 Divider
```
height: 1px
background: #e5e7eb
margin: 12px 0
```

### 6.15 Modal Overlay
- Fixed inset, bg: `rgba(13, 31, 15, 0.48)`, flex center
- Card: max-width 360px, bg `#f0fdf4`, border `1px solid #86efac`, border-radius 22px, shadow `0 24px 60px rgba(0,0,0,0.24)`
- Header: bg `#0d1f0f`, padding `14px 16px`, title 15px/800/`#fff`, subtitle 11px/`#9ca3af`
- Close button: transparent, `#86efac` color, 13px/800

### 6.16 Data Table (Grid)
- Container: border-radius 10px, `overflow: hidden`, `border: 1px solid #f3f4f6`
- Header: bg `#f8faf8`, padding `8px 12px`, 10px/700/`#9ca3af`, uppercase
- Row: `border-top: 1px solid #f3f4f6`, alternating `#fff` / `#fafafa`
- Row padding: `8-10px 12px`, font 12px
- Positive delta: `#16a34a`, neutral: `#6b7280`

### 6.17 FlowBar (Progress Bar Row)
- Label row: flex space-between, 11px
- Bar track: height 8px, bg `#f3f4f6`, border-radius 4px, overflow hidden
- Fill: green `#16a34a` / yellow `#d97706` / blue `#60a5fa`

### 6.18 SavingsHero (Dark Hero Card)
- Container: bg `#0d1f0f`, border-radius 20px, overflow hidden
- Step label: 10px/`#22c55e`/700/uppercase/letter-spacing 0.08em
- Hero number: 58px/800/`#22c55e`, letter-spacing -2px, line-height 1
- SVG confidence ring: 64×64, `#1a3a1a` track, `#22c55e` fill, inner text 13px/800/`#fff`
- Bottom metrics strip: bg `#091407`, 3 columns, `border-right: 1px solid #1a2e1a`
  - Value: 20px/800/`#fff`
  - Label: 10px/600/`#22c55e`

### 6.19 BeforeAfter Comparison
- Two side-by-side panels with arrow + tag in center
- Before panel: bg `#f3f4f6`, amount in `#9ca3af` with line-through
- After panel: bg `#dcfce7`, `border: 2px solid #86efac`, amount in `#16a34a`
- Horizontal bar comparison below: track bg `#f3f4f6`, before fill `#d1d5db`, after fill `#16a34a`

### 6.20 Finance Equation Chips
Inline chips showing `repayment − savings = net`:
```
bg: #fff           → repayment chip
bg: #dcfce7        → savings chip (green)
bg: #fffbeb        → net chip (yellow, bordered)
```
Each: `padding: 4px 10px`, `border-radius: 8px`, 12px/600

---

## 7. Layout System

```
body
└── #root (max-width: 430px, min-height: 100vh, bg: #f1f5f1)
    ├── NavBar (sticky)
    ├── StepProgress
    └── [SectionWrap > Card]... (vertical stack)
```

- Mobile: full width, no rounding
- Desktop (≥500px): 28px vertical body padding, #root gets `border-radius: 36px`, `box-shadow: 0 32px 80px rgba(0,0,0,0.22)`
- Body centers #root with `display: flex; justify-content: center`
- Body background `#bbf7d0` creates the green "phone frame" visible on desktop

---

## 8. Icon / Emoji Language

| Emoji | Meaning |
|-------|---------|
| ☀️    | Solar output, sun peak |
| 🏠    | Home / household consumption |
| ⚡    | Energy / electricity flow |
| 💰    | FiT income / export revenue |
| 📉    | Bill reduction |
| 💳    | Financing / loan |
| 🔋    | Battery storage |
| 📊    | Bill component breakdown |
| 🎯    | Payback target / milestone |
| ✓     | Completed step (inside circle) |

---

## 9. Motion & Interaction

- Scroll to element: `scrollIntoView({ behavior: 'smooth', block: 'start' })` with 80ms delay
- `-webkit-tap-highlight-color: transparent` on all elements
- No CSS transitions defined — interactions feel immediate and snappy
- Expand/collapse: DOM show/hide (no animation), chevron flips ▼↔▲

---

## 10. Extended Design Language (New Elements)

The following components extend the existing system using the same design tokens:

### 10.1 Toast / Notification
- Appears bottom-center, fixed position
- Same shape as Tag but larger: `border-radius: 12px`, `padding: 12px 16px`
- Colour follows semantic states (green success, red error, yellow warning)

### 10.2 Loading Skeleton
- Same border-radius as target element
- Background: `#f3f4f6` with shimmer from `#e5e7eb`
- Replaces content during API fetch

### 10.3 Tooltip
- Dark bg: `#111827`, white text, 10px/600
- `border-radius: 8px`, `padding: 6px 10px`
- Arrow 6px triangle pointing to target

### 10.4 Progress Ring (Standalone)
- Same SVG pattern as confidence ring (see SavingsHero)
- Track: `#1a3a1a` or `#f3f4f6` (on light bg)
- Fill: `#22c55e` or `#16a34a`

### 10.5 Horizontal Tab Bar (alternative to StepProgress)
- Same green/gray active logic as SegmentedButton
- Full-width, scrollable on mobile
- Each tab: 13px/600, padding `10px 16px`

### 10.6 Empty State
- Icon (large emoji): 40px
- Title: 16px/700/`#111827`
- Body: 13px/`#6b7280`
- Optional CTA button below

### 10.7 Stat Card (standalone metric)
- Inherits MetricChip layout but full-width or 2-col
- Label top, hero value middle, sub-note below
- Applicable to dashboard/summary views

---

## 11. Do / Don't

| ✅ Do | ❌ Don't |
|------|---------|
| Use weight 800 for all monetary values | Use light weights (300/400) for numbers |
| Use `#16a34a` for positive outcomes only | Use green decoratively without meaning |
| Show step labels in uppercase, gray | Use step labels as headings |
| Keep cards white on the muted green page | Add drop shadows to individual cards |
| Use dark (`#0d1f0f`) for hero/featured info | Overuse the dark card style |
| Pair every CTA with a FieldLabel or step context | Float buttons without context |
| Use `#22c55e` (light) only on dark backgrounds | Use light green on white (contrast fails) |
| Use pill tags (border-radius 20px) for status | Use square badges |
