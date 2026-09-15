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
}

export const GROUP_ORDER = ['cpa', 'business-owner', 'individual-family']

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
    id: 'roth-conversion',
    group: 'cpa',
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

  // ---------- Business Owner Planning ----------
  {
    id: 'qbi-optimizer',
    group: 'business-owner',
    owner: 'blueline',
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

  // ---------- Individual & Family Planning ----------
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
    id: 'know-your-numbers',
    group: 'individual-family',
    owner: 'blueline',
    status: 'live',
    path: '/tools/know-your-numbers',
    icon: ClipboardList,
    shareable: true,
    title: 'Know Your Numbers',
    short: 'Know Your Numbers',
    description:
      'A clean, client-shareable one-page financial snapshot: net worth, cash flow, savings rate, debt summary, and asset allocation.',
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
