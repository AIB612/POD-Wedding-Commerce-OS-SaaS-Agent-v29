# Wedding website themes (source)

Source for `assets/wedding/wb-themes.js` (the 生成婚礼网站 generator themes).

- `themes/<theme>.css`: page styles per theme
- `envelopes/<theme>.css` (+ `_common.css`, `_tail.css`): envelope opening animations
- `base.css`: shared base styles
- `render.js`: page, envelope and print-card renderers

Edit these files, then run `npm run build:wedding-themes` to regenerate `assets/wedding/wb-themes.js`.
