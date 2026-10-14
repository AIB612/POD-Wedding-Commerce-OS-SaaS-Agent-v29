# V27 · Right Rail Flow

- Restored kit state button to `In selection` once all products in a kit are selected.
- Removed the per-kit direct-design shortcut from scenario cards to avoid duplicate primary actions.
- Removed the left-rail `Start designing` CTA; the left rail now remains selection/product management only.
- Added one large sticky primary CTA at the bottom of the right-hand card whenever products are selected.
- The right CTA now drives the complete flow: Start designing → Pricing → Delivery → Packaging → Review → final submit/request.
- Design and delivery CTAs are gated until the required information for the current step is complete.
- Final request action moved out of the Review centre component into the right-hand card.
- Offline mode exposes Export plan in the same right-hand final action area; server submit remains clearly identified as requiring the server.
- Kit detail drawer now adds the kit to selection instead of bypassing the right-hand flow.
- Existing Design / Pricing / Delivery / Packaging / Review component layouts and controls were otherwise preserved.
