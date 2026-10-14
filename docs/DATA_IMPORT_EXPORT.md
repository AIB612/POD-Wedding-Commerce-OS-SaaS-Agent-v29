# Data Import / Export

## Supported formats

- Excel `.xlsx`
- CSV `.csv`

## Supported modules

Import and export:
- Products
- Orders
- Customers
- Shipments
- Creators / Influencers
- Affiliates
- Campaigns
- Shipping Zones / regional shipping & tax configuration

Export-only summary:
- Finance
- Full multi-sheet Excel backup

## Import workflow

1. Download `templates/commerce-os-import-template.xlsx`.
2. Edit one business-data sheet.
3. In Admin open **数据导入 / 导出**.
4. Choose the matching module.
5. Upload `.xlsx` or `.csv`.
6. Server parses and validates the file.
7. Admin displays total rows, valid rows, error rows and row-level field errors.
8. A short-lived server-side `preview_token` is issued.
9. User explicitly approves the import.
10. Commit uses the server-side validated preview; browser-edited rows are not trusted.

Preview tokens expire after 10 minutes.

## Excel template conventions

Each data sheet contains:
- Row 1: canonical field names.
- Row 2: `required` / `optional`.
- Row 3: field type.
- Row 4: example data.

When the official template is uploaded, rows 2 and 3 are automatically recognized as metadata and are not imported.

Arrays accept comma, semicolon or pipe-separated values. Dates should use `YYYY-MM-DD` or ISO-8601.

## APIs

- `GET /api/saas/data/entities`
- `GET /api/saas/data/template.xlsx`
- `GET /api/saas/data/export/:entity?format=xlsx|csv`
- `GET /api/saas/data/export/all?format=xlsx`
- `POST /api/saas/data/import/preview?entity=<entity>&format=xlsx|csv`
- `POST /api/saas/data/import/commit`

Import commit requires the normal Admin authentication and the explicit approval gate (`x-action-approved: true` or approved request body).

## Upsert behavior

Imports update an existing record when the entity key matches; otherwise a new record is created. Keys include:
- Products: SKU
- Orders: ID
- Customers: email
- Shipments: tracking number
- Creators: handle
- Affiliates: code
- Campaigns: ID

## Production recommendations

For production, replace in-memory preview storage with Redis or a database table, and persist imports through the production repository layer / transaction. Keep tenant ID server-assigned; never accept tenant ID from spreadsheet rows.


## Shipping Zones

Shipping zone rules are available in Excel and CSV import/export.

Key fields:

- `countries`: comma-separated ISO country codes
- `standard_base`
- `standard_per_kg`
- `express_base`
- `express_per_kg`
- `free_shipping_threshold`
- `tax_mode`
- `tax_rate`
- `active`

The import validator supports boolean values:
`true / false / 1 / 0 / yes / no`.

After import, review the Logistics page and explicitly sync rules to connected seller stores.

## v10 Logistics workbook update

The polished Excel template now includes a dedicated **Shipping Zones** sheet in addition to **Shipments**.

- `Shipments`: operational carrier / tracking / ETA records.
- `Shipping Zones`: regional shipping prices, per-kg rules, free-shipping threshold and tax rule metadata.

API credentials are deliberately excluded from Excel import/export. Credentials belong in **API / 协议** so secrets are not circulated in spreadsheets.
