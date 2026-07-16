# Icons

Drop SVG icons here for Claude to use in the app (nav icons, section glyphs,
custom art, etc.). These are **source/reference assets** — Claude wires the ones
you want into the app; not every file here ships automatically.

## How to add icons (GitHub website)

1. Open this folder on GitHub: `design/icons/`
2. **Add file → Upload files**, drag your `.svg` files in.
3. **Commit changes** (to whatever branch you're working on — tell Claude which).

## Naming

Use descriptive, kebab-case names so it's obvious what each maps to, e.g.

- `nav-home.svg`, `nav-train.svg`, `nav-progress.svg`, `nav-library.svg`, `nav-body.svg`
- `section-pulse.svg`, `section-main.svg`, `section-cooldown.svg`

## Tips for recolour + glow

Icons work best when they use `currentColor` (or `fill="currentColor"` /
`stroke="currentColor"`) instead of hard-coded hex colours — that lets the app
tint them and add a glow to match each screen. If yours use fixed colours,
Claude can convert them on the way in.
