# Solar Calculator

A solar savings calculator application that helps users calculate potential savings from solar energy installations using real TNB (Tenaga Nasional Berhad) tariff data.

## Features

- Landing page with database connectivity testing
- PostgreSQL database integration
- API endpoints for exploring database schema and tariff data
- Real TNB tariff data from 2025
- Solar savings calculator that supports optional battery storage add-ons with grid import reduction reporting
- Zero import optimizer that auto-sizes available batteries to target a 100 kWh/month grid import tier and recalculates bill savings against the original TNB bill input

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

## Deployment

This project is configured for Railway deployment with PostgreSQL database integration.

After the agent commits changes in this environment, you still need to push the
updates to your GitHub repository from your own machine because the container
does not have remote credentials configured. Run a standard `git push` (for
example, `git push origin main`) to trigger Railway's redeploy.

## Battery Add-On Options

The solar savings calculator can model lithium battery storage add-ons that divert excess solar export to offset nighttime grid import. Available capacities and default pricing:

| Capacity (kWh) | Price (RM) |
| -------------- | ---------- |
| 5              | 5,000      |
| 10             | 7,500      |
| 15             | 10,000     |

When a battery is selected, the calculator reports how many kilowatt-hours per day are used to charge the battery and how much grid import is avoided each day, adjusting export savings accordingly and recalculating the Energy Efficiency Incentive (EEI) tier based on the reduced grid import.

Enabling the zero import optimizer automatically chooses the smallest 5/10/15 kWh battery that can push nighttime import toward 100 kWh/month (best effort if export energy is limited). The backend recomputes the projected bill total using the reduced import, subtracts export credits, and reports the updated savings versus the user's original bill amount.
