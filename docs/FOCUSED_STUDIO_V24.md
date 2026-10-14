# V24 Focused Studio

This version deliberately reduces navigation complexity and concentrates the product around the POD Studio flow.

## Storefront
- Keeps only the first wedding scene: **Cream Garden Wedding**.
- Removes extra wedding-scene switching from the storefront.
- Moves the main **POD Design Studio** entry into the first-screen right product panel.
- Rebuilds the second and third homepage sections as a cleaner scene-to-product story and one-design-to-many-products story.

## Studio scenarios
Only six business scenarios remain:
1. Creator / personal IP
2. Niche communities
3. Corporate & team swag
4. Art & design
5. Wedding & personalised gifts
6. Holidays & trends

Wedding visual styles are no longer separate Studio scenarios.

## Product catalog
The Studio catalog now has **97 core SKUs** in 16 first-level categories:
Apparel, Headwear, Footwear, Drinkware, Bags, Tech & accessories, Stationery, Wall art, Home & living, Corporate & office, Gifts, Pets, Outdoor, Sports, Seasonal, Branding & packaging.

The previous dedicated `wedding` catalog category was removed. Wedding products live in their natural product categories and are bundled by the Wedding & Gifts scenario.

## Sustainability
Products support simple sustainability labels such as:
`Eco`, `Organic`, `Recycled`, `FSC Paper`, `Plastic-free Packaging`, `Local Production`.
The all-products screen also includes an Eco-only filter.

## Product mockup presentation
Vector fallback mockups use one uniform warm beige background and no artificial ground shadow, so newly added products remain visually consistent with the white-label catalog.

## Validation performed
- `studio-data.js` regenerated from `server/data/studio-catalog.json`.
- 97 product IDs validated.
- All scenario-kit product references validated.
- 16 category IDs validated.
- Inline JavaScript in `index.html` syntax checked.
- `studio.js`, `studio-mockups.js`, and `server/studio-test.js` syntax checked with Node.
- Browser screenshot validation could not be completed in this environment because local/file page navigation is blocked by the browser administrator policy.
