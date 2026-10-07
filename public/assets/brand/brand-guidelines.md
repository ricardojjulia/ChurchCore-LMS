# ChurchCore LMS Brand Guidelines

## The Visual Identity: "The Shield of Formation"

The ChurchCore LMS brand mark represents a modern heraldic crest uniting:
1. **The Shield Crest:** Institutional integrity, academic excellence, and protective theological guardianship.
2. **The Open Scriptures:** The Word of God as the unchanging foundation of all curriculum.
3. **The Ascending Steps:** Progressive spiritual formation, discipleship growth, and mastery pathways.
4. **The Cross Apex:** Christological primacy anchoring all knowledge and learning.

---

## Color Tokens

| Token | Hex | Name | Usage |
|---|---:|---|---|
| `SAPPHIRE_NAVY` | `#0E1E36` | Cathedral Midnight | Primary dark surfaces, outer crest fill, header backgrounds |
| `SAPPHIRE_ACCENT` | `#1E3A68` | Royal Sapphire | Interactive states, secondary brand accents, card depth |
| `CHAMPAGNE_GOLD` | `#D4AF37` | Luminous Gold | Metallic borders, cross apex, achievement highlights |
| `GOLD_LIGHT` | `#F3E7C4` | Celestial Highlight | Gradient top stops, active text highlights |
| `TEXT_MUTED` | `#8DA9C4` | Oxford Muted | Secondary typography, metadata labels, subtle borders |
| `SURFACE_LIGHT` | `#F9F7F1` | Altar Cream | Warm light backgrounds, badge ribbon backgrounds |

---

## Asset Directory (`public/assets/brand/`)

| File | Type | Use Case |
|---|---|---|
| `favicon.svg` | Scalable Vector | 16px, 32px, and 48px browser tabs & bookmarks |
| `icon-mark.svg` | Scalable Vector | Light-surface standalone heraldic emblem (sidebar, avatars, stamps) |
| `icon-mark-dark.svg` | Scalable Vector | Dark-surface standalone heraldic emblem with metallic luminous gradients |
| `logo-horizontal-light.svg` | Scalable Vector | Full horizontal logo for light / white / cream backgrounds |
| `logo-horizontal-dark.svg` | Scalable Vector | Full horizontal logo for dark / navy / midnight surfaces |
| `app-icon.png` | 1024x1024 High-Res | Native iOS & Android store icons, PWA manifests, splash screens |

---

## Scaling & Clear Space Rules

* **Minimum Size:**
  * Do not render `icon-mark.svg` below 24px (use `favicon.svg` for micro-dimensions $\le 20\text{px}$).
  * Do not render horizontal lockups below 120px in width.
* **Clear Space:** Maintain a clear space around the shield equal to at least half the width of the cross apex on all sides.
* **Contrast:** Always use `icon-mark-dark.svg` on surfaces with luminance $< 40\%$.

---

## Global CSS Variables

```css
:root {
  --church-navy: #0E1E36;
  --church-sapphire: #1E3A68;
  --church-gold: #D4AF37;
  --church-gold-light: #F3E7C4;
  --church-cream: #F9F7F1;
  --church-muted: #8DA9C4;
}
```
