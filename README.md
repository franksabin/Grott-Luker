# Grott Luker & Co. — Client Decision Support Toolkit

A React application for **Grott Luker & Co., CPAs** (Portsmouth, NH): internal
decision-support tools for CPAs, alongside client-facing planning tools that
showcase **BlueLine Advisors**' specialties.

## Getting started

Node.js is installed at `C:\Program Files\nodejs\` but not on PATH. Prepend it:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\Users\joshu\grott-luker-toolkit
npm install
npm run dev      # http://localhost:5174
npm run build    # production build to dist/
```

## The tools

### CPA Decision Support Toolkit (internal — the CPA enters client figures)

| # | Tool | Purpose |
|---|------|---------|
| 1 | Roth Conversion Analyzer | Conversion tax cost, marginal rate, IRMAA exposure, future RMD reduction |
| 2 | Owner Compensation Optimizer | Sole prop / LLC vs. S-corp: payroll & SE tax, QBI, total tax by strategy |
| 3 | Estimated Tax & Safe Harbor Planner | Projected tax, safe-harbor test, remaining quarterly payments |
| 4 | Multi-Year Tax Projection Planner | 10-year projection with RMDs, Social Security timing, Roth conversion overlay |
| 5 | QBI Deduction Optimizer | §199A thresholds, phase-in, W-2 wage/property limits, SSTB phase-out |

### BlueLine Specialty Planning Tools (client-facing)

| # | Tool | Purpose |
|---|------|---------|
| 1 | Am I on Track to Retire? | Nest-egg projection, sustainable income vs. needs |
| 2 | Cash Balance Plan Analyzer | Illustrative contribution and deduction ranges |
| 3 | Should I Roll Over My 401(k)? | 20-year fee comparison plus planning considerations |
| 4 | How Will Divorce Affect My Finances? | After-tax property division and equalization |
| 5 | Know Your Numbers | One-page financial snapshot (also available as a client intake form) |

## Client intake — Know Your Numbers

Know Your Numbers exists in two forms sharing one set of fields and one report:

- **Client form** — `/client/know-your-numbers` (public). Captures name and email,
  then the figures, then submits. Clients see their own snapshot and can print it.
  This route renders without any links back into the internal toolkit.
- **CPA results viewer** — `/client-results`, reachable from the
  **View client results** button on the dashboard. Open during the CPA beta (no
  passcode configured); see Security below. Lists
  every submission and renders the full snapshot for each. Includes
  **Copy client link** for sending the form to a client.

Shared code so all three surfaces stay in sync:

```
src/lib/knowYourNumbers.js   # field definitions + compute() (single source of truth)
src/lib/submission.js        # validation, shared by the Worker and the dev API
src/components/KynInputs.jsx # the data-entry panels
src/components/KynSnapshot.jsx # the snapshot report + charts
```

### Data handling

Submissions contain personal financial information. The current controls:

- Staff routes require the `x-cpa-passcode` header to match the `CPA_PASSCODE`
  secret **when that secret is set**. During the closed CPA beta (decision Sept
  2026) the secret is intentionally unset, so `/client-results` is open to anyone
  with the URL. To turn the gate on: `npx wrangler secret put CPA_PASSCODE`; the
  results page shows the passcode prompt on the next load with no code change.
- The passcode is held in `sessionStorage` only — it clears when the tab closes.
- Only known figure keys are stored; unknown fields are discarded. Values are
  capped and coerced to numbers.
- The public submit endpoint returns no client data.

Not yet in place, and worth deciding on before real client use: rate limiting on
the public endpoint, a retention/deletion policy, and per-user staff logins
instead of one shared passcode.

## Deployment (Cloudflare Workers + D1)

The built SPA and the API run in one Worker (`worker/index.js`); `/api/*` is
handled by the Worker and everything else is served from `dist/`.

One-time setup:

```bash
npx wrangler d1 create grott-luker-snapshots
```

Paste the returned `database_id` into `wrangler.jsonc`, then:

```bash
npx wrangler d1 execute grott-luker-snapshots --remote --file=./schema.sql
```

```bash
npx wrangler secret put CPA_PASSCODE
```

```bash
npm run build && npx wrangler deploy
```

### Local development

`wrangler dev` depends on workerd, which has no win32-arm64 build, so it will not
run on this machine. Instead `vite-dev-api.js` serves the same routes during
`npm run dev` using `node:sqlite`, backed by `.dev-data/snapshots.db`
(gitignored). Set `$env:CPA_PASSCODE = "…"` before starting the dev server to
test the passcode gate; unset, staff routes are open like production. Delete
`.dev-data` to reset test data.

## Architecture

```
src/
  main.jsx, App.jsx          # entry + React Router routes
  index.css                  # complete design system + print/PDF styles
  components/
    Layout.jsx               # navy header, footer; `client` prop = public chrome
    ToolShell.jsx            # per-tool scaffold: toolbar, timestamp, disclosure
    ui.jsx                   # Field / MoneyField / ResultRow / Stat / etc.
    charts.jsx               # DonutChart / StackedBar / BarCompare / RangeBar
  lib/
    tools.js                 # tool registry (drives the two dashboard sections)
    format.js                # currency/percent parsing + formatting
    tax.js                   # shared federal tax engine (2025), SS, IRMAA, QBI, RMD
    states.js                # simplified state rate table
    api.js                   # submissions API client
  pages/                     # Dashboard + one file per tool + client pages
worker/index.js              # Cloudflare Worker: /api/* + static assets
vite-dev-api.js              # local dev API (node:sqlite) mirroring the Worker
schema.sql                   # D1 schema
public/brand/                # gl-logo-white.png, blueline-logo(-dark).png
```

## Printouts

Every tool prints to a client-ready PDF via the browser print stylesheet, with a
BlueLine lockup, contact details, and the SEC disclosure rendered once at the end
of the report.

## Important

All calculations are simplified estimates for **educational and planning purposes
only** and are disclosed as such. They are not tax, legal, accounting, or
investment advice. Rates reflect 2025 parameters and should be reviewed with
Grott Luker & Co. before any decision.
