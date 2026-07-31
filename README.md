# Grott Luker & Co. — Client Decision Support Toolkit

A production-quality React application presenting six client planning tools as a
polished, premium client portal for **Grott Luker & Co., CPAs** (Portsmouth, NH).
Decision support technology by **BlueLine Advisors** (understated attribution).

## Getting started

Node.js is installed at `C:\Program Files\nodejs\` but not on PATH. Prepend it:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\Users\joshu\grott-luker-toolkit
npm install
npm run dev      # http://localhost:5174
npm run build    # production build to dist/
```

## The six tools

| # | Tool | Purpose |
|---|------|---------|
| 1 | Business Sale & Net Liquidity Estimator | After-tax proceeds and net liquidity from a business sale |
| 2 | Cash Balance Plan Analyzer | Educational contribution/deduction ranges (no recommendations) |
| 3 | Retirement Income Tax Map | How income sources drive taxable income, SS taxation, IRMAA; scenario compare |
| 4 | Concentrated Wealth Exposure Analyzer | Concentration, income dependence, liquidity, shock — arithmetic only |
| 5 | Divorce Asset Division Tax Adjustment Tool | After-tax value and equalization; built on `src/lib/taxAdjustment.js` |
| 6 | Know Your Numbers | One-page, client-shareable financial snapshot |

## Architecture

```
src/
  main.jsx, App.jsx          # entry + React Router routes
  index.css                  # complete design system + print/PDF styles
  components/
    Layout.jsx               # navy header (GL logo), footer (BlueLine attribution)
    ToolShell.jsx            # per-tool scaffold: toolbar, timestamp, disclosure
    ui.jsx                   # Field / MoneyField / ResultRow / Stat / Bar / etc.
  lib/
    tools.js                 # tool registry (drives dashboard + routes)
    format.js                # currency/percent parsing + formatting
    tax.js                   # shared federal tax engine (2025), SS, IRMAA
    states.js                # simplified state rate table
    taxAdjustment.js         # reusable after-tax division module (Tool 5)
  pages/                     # Dashboard + one file per tool
public/brand/                # gl-logo-white.png, blueline-logo.png
scripts/verify-math.mjs      # Node sanity check of the calc modules
```

## Shared requirements met by every tool

Clean responsive layout · Save as PDF · print-friendly formatting · Reset ·
Sample data · inline term explanations (hover tooltips) · calculation summary ·
Assumptions section · generation timestamp · standard closing disclosure.

## Important

All calculations are simplified estimates for **educational and planning
purposes only** and are clearly disclosed as such. They are not tax, legal,
accounting, or investment advice. Rates reflect 2025 parameters and should be
reviewed with Grott Luker & Co. before any decision.
