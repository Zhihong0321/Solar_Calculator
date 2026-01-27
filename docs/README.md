# Solar Calculator

A solar savings calculator application that helps users calculate potential savings from solar energy installations using real TNB (Tenaga Nasional Berhad) tariff data.

## Features

- Landing page with database connectivity testing
- PostgreSQL database integration
- API endpoints for exploring database schema and tariff data
- Real TNB tariff data from 2025

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (copy from Railway):
```bash
DATABASE_URL=your_postgresql_connection_string
```

3. Start the application:
```bash
npm start
```

For development:
```bash
npm run dev
```

## API Endpoints

- `GET /` - Landing page
- `GET /api/health` - Database connection test
- `GET /api/schema` - Database schema exploration
- `GET /api/tnb-tariff` - TNB tariff 2025 data

### Read-only investigation endpoints (for Railway)

- `GET /readonly/schema/product` — Returns actual column definitions for the `product` table from `information_schema`.
- `GET /readonly/product/options` — Returns dropdown-friendly options from `product`:
  - Filters: `solar_output_rating > 0` and `active = true` (only if the `active` column exists and is boolean)
  - Fields: `{ id, label, value }` where `label = product.name` (fallback to `"<solar_output_rating>W"` if name is missing) and `value = product.solar_output_rating`
  - Limit: 100 records, ordered by `solar_output_rating DESC`
- `GET /readonly/product/sample?limit=10` — Returns limited `product` rows for verification.

## Deployment

This project is configured for Railway deployment with PostgreSQL database integration.