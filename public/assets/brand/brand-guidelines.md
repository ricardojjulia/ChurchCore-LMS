# ChurchCore LMS Brand Guidelines

ChurchCore LMS uses a flat, modern mark built for product interfaces first. The identity combines a two-stroke open book, a weighted cross-stem, restrained growth forms, and minimal tech-node details.

## Color Tokens

| Token | Hex | Usage |
|---|---:|---|
| `PRIMARY_NAVY` | `#0B2545` | Primary mark, text, dark surfaces |
| `SECONDARY_CREAM` | `#F9F7F1` | Soft backgrounds and dark-mode mark color |
| `ACCENT_BLUE` | `#134074` | Hover states, secondary brand text, subtle depth |
| `TEXT_MUTED` | `#8DA9C4` | Muted dark-mode text, borders, secondary labels |

## Assets

| File | Use |
|---|---|
| `favicon.svg` | 16px and 32px micro-mark: book, cross-stem, one tech node |
| `icon-mark.svg` | Standard standalone symbol for sidebar, avatars, and empty states |
| `logo-horizontal-light.svg` | Horizontal logo for white or cream backgrounds |
| `logo-horizontal-dark.svg` | Horizontal logo for navy or dark backgrounds |
| `app-icon.png` | 512x512 rounded squircle app icon |

## Scaling Rules

- Use `favicon.svg` below 32px.
- Use `icon-mark.svg` for square placements from 32px upward.
- Use horizontal logos in navigation, README headers, and marketing/documentation surfaces.
- Do not use the experimental vertical wordmark as a primary asset.
- Keep clear space around the mark equal to at least one cross-stem width.

## CSS Variables

The app exposes these variables in `src/app/globals.css`:

```css
:root {
  --church-navy: #0B2545;
  --church-cream: #F9F7F1;
  --church-accent: #134074;
  --church-muted: #8DA9C4;
}
```
