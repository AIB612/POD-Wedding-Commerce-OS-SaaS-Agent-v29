# V25 · Synced storefront scenarios

- First-screen studio CTA simplified to **开始设计** only.
- `Cream Garden Wedding` replaced with a dropdown using the exact 6 scenarios from `studio-data.js`.
- Scenario order on storefront: Wedding & personalised gifts, Holidays & trends, Creators & personal IP, Niche communities, Corporate & team swag, Art & design.
- Wedding & personalised gifts and Holidays & trends show `★ Recommended for you`.
- Right-side kit/product list is generated from the same Studio scenario data and changes with the dropdown.
- Scene image, hotspots, audience text, kit count and Studio link all update together.
- Selected storefront scenario is passed to `studio.html?scenario=...` and retained in the session when returning.
- Existing Studio Design / Pricing / Delivery / Packaging / Review UI components were not changed.
