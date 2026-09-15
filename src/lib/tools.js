// Registry of tools.
//
// Each tool carries three independent attributes:
//   group  — which dashboard section it lives in (who it's for)
//   owner  — who built it: 'grott' | 'blueline'   (drives the provenance chip)
//   status — 'live' | 'testing'                    (testing tools are hidden
//            unless a CPA turns on "Show in-development tools"; never shown
//            on client routes)
import {
  RefreshCw,
  CalendarClock,
  LineChart,
  Percent,
  Target,
  PiggyBank,
  Wallet,
  ArrowLeftRight,
  Scale,
  ClipboardList,
  Briefcase,
  Layers,
  Map,
  Car,
  FileCheck,
  TrendingUp,
  HeartHandshake,
  Landmark,
  Clock,
  Gift,
} from 'lucide-react'

export const OWNERS = {
  grott: { id: 'grott', label: 'Grott Luker' },
  blueline: { id: 'blueline', label: 'BlueLine' },
}

export const GROUPS = {
  cpa: {
    id: 'cpa',
    title: 'CPA Tools',
    eyebrow: 'For Grott Luker CPAs',
    description: 'Projections, safe harbors, conversions, and year-end planning.',
  },
  'business-owner': {
    id: 'business-owner',
    title: 'Business Owner Planning',
    eyebrow: 'For business-owner clients',
    description: 'Entity, compensation, and retirement plan design.',
  },
  'individual-family': {
    id: 'individual-family',
    title: 'Individual & Family Planning',
    eyebrow: 'For individuals & families',
    description: 'Retirement readiness, life transitions, and financial discovery.',
  },
  'client-intake': {
    id: 'client-intake',
    title: 'Shareable',
    eyebrow: 'Send to a client',
    description: 'Clients fill these in themselves; submissions arrive in Client results.',
  },
}

export const GROUP_ORDER = ['cpa', 'business-owner', 'individual-family', 'client-intake']

export const TOOLS = [
  // ---------- CPA Tools ----------
  {
    id: 'estimated-tax',
    group: 'cpa',
    owner: 'grott',
    status: 'live',
    path: '/tools/estimated-tax',
    icon: CalendarClock,
    title: 'Estimated Tax & Safe Harbor Planner',
    short: 'Estimated Tax & Safe Harbor',
    description:
      'Project the year’s tax, test the safe-harbor thresholds, account for withholding, and calculate the remaining quarterly payments needed to avoid an underpayment penalty.',
  },
  {
    id: 'multi-year-projection',
    group: 'cpa',
    owner: 'grott',
    status: 'live',
    path: '/tools/multi-year-projection',
    icon: LineChart,
    title: 'Multi-Year Tax Projection Planner',
    short: 'Multi-Year Tax Projection',
    description:
      'Project taxable income and tax across several years to visualize the impact of Roth conversions, RMDs, Social Security timing, and other events — and find low-bracket planning windows.',
  },
  {
    id: 'retirement-tax-map',
    group: 'cpa',
    owner: 'blueline',
    status: 'testing',
    path: '/tools/retirement-tax-map',
    icon: Map,
    title: 'Retirement Income Tax Map',
    short: 'Retirement Income Tax Map',
    description:
      'See how each retirement income source contributes to taxable income, how Social Security becomes taxable, and where IRMAA and after-tax cash flow land — with a second scenario for comparison.',
  },
  {
    id: 'withholding-checkup',
    group: 'cpa',
    owner: 'grott',
    status: 'testing',
    path: '/tools/withholding-checkup',
    icon: FileCheck,
    title: 'Withholding Checkup (W-4)',
    short: 'Withholding Checkup',
    description:
      'Will this client owe in April? Compare year-to-date withholding against projected tax and get the W-4 adjustment that closes the gap before year-end.',
    plan:
      'A mid-year answer to the most common client question. Projects full-year tax from YTD pay stubs, compares it to withholding to date, and translates any shortfall into an extra-per-paycheck amount for the remaining pay periods.',
    planInputs: [
      'Filing status and state',
      'YTD wages and federal withholding (from a recent pay stub)',
      'Pay frequency and remaining pay periods',
      'Other income, deductions, and credits expected',
    ],
  },
  {
    id: 'capital-gains-harvesting',
    group: 'cpa',
    owner: 'grott',
    status: 'testing',
    path: '/tools/capital-gains-harvesting',
    icon: TrendingUp,
    title: 'Capital Gains & Loss Harvesting Planner',
    short: 'Gains & Loss Harvesting',
    description:
      'How much gain can be realized this year inside the 0% or 15% bracket, and which losses are worth harvesting against it — with the wash-sale window flagged.',
    plan:
      'A Q4 planning tool: shows the headroom left in the current capital-gains bracket, the tax on realizing a given gain, and the offset from harvesting losses, including the $3,000 ordinary-income limit and carryforward.',
    planInputs: [
      'Filing status, ordinary taxable income, and state',
      'Unrealized gains and losses by position (long vs. short)',
      'Planned realizations this year',
      'Loss carryforward from prior years',
    ],
  },
  {
    id: 'charitable-giving-optimizer',
    group: 'cpa',
    owner: 'grott',
    status: 'testing',
    path: '/tools/charitable-giving-optimizer',
    icon: HeartHandshake,
    title: 'Charitable Giving Optimizer',
    short: 'Charitable Giving',
    description:
      'Bunching vs. the standard deduction, donor-advised fund timing, and qualified charitable distributions for clients over 70½ — which route saves the most tax.',
    plan:
      'Compares annual giving against bunching two or three years of gifts into one, funding a DAF, or giving from an IRA via QCD. Shows the deduction actually captured under each route.',
    planInputs: [
      'Filing status and taxable income',
      'Annual charitable giving and other itemized deductions',
      'Age and IRA balance (for QCD eligibility)',
      'Appreciated securities available to gift',
    ],
  },

  // ---------- Business Owner Planning ----------
  {
    id: 'qbi-optimizer',
    group: 'business-owner',
    owner: 'grott',
    status: 'live',
    path: '/tools/qbi-optimizer',
    icon: Percent,
    title: 'QBI Deduction Optimizer',
    short: 'QBI Deduction Optimizer',
    description:
      'Estimate the Section 199A qualified business income deduction, including the taxable-income thresholds, W-2 wage and property limitations, and how planning moves change the deduction.',
  },
  {
    id: 'owner-comp',
    group: 'business-owner',
    owner: 'blueline',
    status: 'live',
    path: '/tools/owner-comp',
    icon: Wallet,
    title: 'Owner Compensation Optimizer',
    short: 'Owner Compensation Optimizer',
    description:
      'Compare owner compensation strategies — reasonable salary vs. distributions for an S-corporation — including payroll and self-employment tax, QBI effects, and estimated total tax by strategy.',
  },
  {
    id: 'cash-balance',
    group: 'business-owner',
    owner: 'blueline',
    status: 'live',
    path: '/tools/cash-balance',
    icon: PiggyBank,
    title: 'Cash Balance Plan Analyzer',
    short: 'Cash Balance Analyzer',
    description:
      'Understand the characteristics of businesses that commonly evaluate Cash Balance Plans, with illustrative contribution and deduction ranges.',
  },
  {
    id: 'business-sale',
    group: 'business-owner',
    owner: 'blueline',
    status: 'testing',
    path: '/tools/business-sale',
    icon: Briefcase,
    title: 'Business Sale & Net Liquidity Estimator',
    short: 'Business Sale & Net Liquidity',
    description:
      'Estimate after-tax proceeds and net liquidity from the sale of a business — what actually lands after federal, state, and transaction costs.',
  },
  {
    id: 'retirement-plan-comparison',
    group: 'business-owner',
    owner: 'blueline',
    status: 'testing',
    path: '/tools/retirement-plan-comparison',
    icon: Landmark,
    title: 'Retirement Plan Comparison',
    short: 'SEP vs. Solo 401(k) vs. SIMPLE',
    description:
      'Maximum contribution, cost, and complexity for a self-employed owner under a SEP, a Solo 401(k), and a SIMPLE IRA — side by side.',
    plan:
      'The question every self-employed client asks. Computes the maximum deductible contribution under each plan type from net earnings and age, and notes deadlines and employee-coverage implications.',
    planInputs: [
      'Entity type and net self-employment earnings or W-2 wages',
      'Owner age (catch-up eligibility)',
      'Number of employees and whether they must be covered',
      'Desired contribution level',
    ],
  },

  // ---------- Individual & Family Planning ----------
  {
    id: 'roth-conversion',
    group: 'individual-family',
    owner: 'grott',
    status: 'live',
    path: '/tools/roth-conversion',
    icon: RefreshCw,
    title: 'Roth Conversion Analyzer',
    short: 'Roth Conversion Analyzer',
    description:
      'Model the tax cost of a Roth conversion against its long-term benefit — current-year tax, marginal brackets, IRMAA exposure, future RMD reduction, and lifetime wealth impact.',
  },
  {
    id: 'retire-track',
    group: 'individual-family',
    owner: 'blueline',
    status: 'live',
    path: '/tools/retire-track',
    icon: Target,
    title: 'Am I on Track to Retire?',
    short: 'Retirement Readiness',
    description:
      'A retirement readiness snapshot with an income-coverage score — projected income from savings, Social Security, pension, and other sources against estimated needs, with adjustable return, inflation, and withdrawal-rate assumptions.',
  },
  {
    id: 'rollover-401k',
    group: 'individual-family',
    owner: 'blueline',
    status: 'live',
    path: '/tools/rollover-401k',
    icon: ArrowLeftRight,
    title: 'Should I Roll Over My 401(k)?',
    short: '401(k) Rollover',
    description:
      'Compares all four options side by side — rolling to a new employer plan, leaving it in place, rolling to an IRA, or cashing out — with fee drag, tax and penalty impact, and the qualitative factors that matter alongside the numbers.',
  },
  {
    id: 'divorce-division',
    group: 'individual-family',
    owner: 'blueline',
    status: 'live',
    path: '/tools/divorce-division',
    icon: Scale,
    title: 'How Will Divorce Affect My Finances?',
    short: 'Divorce Financial Impact',
    description:
      'Illustrate the after-tax consequences of a proposed property division across any mix of assets — cash, investments, real estate, retirement, HSA, 529s, and more — and how embedded taxes shift an equalized split.',
  },
  {
    id: 'concentrated-wealth',
    group: 'individual-family',
    owner: 'blueline',
    status: 'testing',
    path: '/tools/concentrated-wealth',
    icon: Layers,
    title: 'Concentrated Wealth Exposure Analyzer',
    short: 'Concentrated Wealth Exposure',
    description:
      'Illustrate how much of a client’s wealth and income rests on a single source, how much is liquid, and how a simple shock would affect net worth.',
  },
  {
    id: 'social-security-timing',
    group: 'individual-family',
    owner: 'blueline',
    status: 'testing',
    path: '/tools/social-security-timing',
    icon: Clock,
    title: 'Social Security Timing',
    short: 'Social Security Timing',
    description:
      'Claim at 62, full retirement age, or 70 — monthly benefit, break-even age, lifetime value, and the survivor consideration for a couple.',
    plan:
      'Shows the benefit at each claiming age from the client\'s PIA, cumulative lifetime benefits under each choice, and the break-even age. Includes the higher earner\'s survivor-benefit effect for married clients.',
    planInputs: [
      'Primary insurance amount (from the SSA statement) for each spouse',
      'Birth dates',
      'Planned claiming ages to compare',
      'Life-expectancy assumption and an optional discount rate',
    ],
  },

  // ---------- Shareable ----------
  {
    id: 'know-your-numbers',
    group: 'client-intake',
    owner: 'blueline',
    status: 'live',
    path: '/tools/know-your-numbers',
    icon: ClipboardList,
    shareable: true,
    clientPath: '/client/know-your-numbers',
    title: 'Know Your Numbers',
    short: 'Know Your Numbers',
    description:
      'A clean, client-shareable one-page financial snapshot: net worth, cash flow, savings rate, debt summary, and asset allocation.',
  },
  {
    id: 'mileage-log',
    group: 'client-intake',
    owner: 'grott',
    status: 'testing',
    path: '/tools/mileage-log',
    icon: Car,
    shareable: true,
    clientPath: '/client/mileage-log',
    title: 'Mileage & Expense Log',
    short: 'Mileage & Expense Log',
    description:
      'Log business, charity, and medical mileage plus meals through the year. IRS standard rates apply automatically by trip date; clients keep the log all year and send it in January.',
  },
  {
    id: 'charitable-donation-log',
    group: 'client-intake',
    owner: 'grott',
    status: 'testing',
    planned: true,
    shareable: true,
    clientPath: '/client/charitable-donation-log',
    path: '/tools/charitable-donation-log',
    icon: Gift,
    title: 'Charitable Donation Log',
    short: 'Donation Log',
    description:
      'Cash and non-cash gifts through the year, with the receipt and appraisal thresholds flagged as entries are made. Clients keep the log and send it in January.',
    plan:
      'A Shareable companion to the Mileage & Expense Log. Each entry checks the substantiation rule that applies: written acknowledgment at $250, Form 8283 at $500 of non-cash gifts, qualified appraisal at $5,000.',
    planInputs: [
      'Date, organization, and amount for cash gifts',
      'Description and fair market value for non-cash gifts',
      'Whether an acknowledgment letter was received',
      'Appreciated securities gifted (cost basis, holding period)',
    ],
  },
]

export function getTool(id) {
  return TOOLS.find((t) => t.id === id)
}

export function toolsByGroup(groupId, { includeTesting = false } = {}) {
  return TOOLS.filter(
    (t) => t.group === groupId && (includeTesting || t.status === 'live'),
  )
}

export function liveTools() {
  return TOOLS.filter((t) => t.status === 'live')
}
