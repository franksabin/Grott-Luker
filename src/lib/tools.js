// Registry of tools, split into three dashboard sections:
//   'primary'        — Grott Luker's own CPA decision-support tools
//   'business-owner' — BlueLine tools for specific business-owner questions
//   'wealth-life'     — BlueLine tools for individual/family wealth & life events
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
} from 'lucide-react'

export const GROUPS = {
  primary: {
    id: 'primary',
    eyebrow: 'For Grott Luker CPAs',
    title: 'Primary Grott Luker Toolkit',
    description:
      'Internal planning tools used by Grott Luker CPAs during client meetings and year-end planning. The CPA enters information collected from the client, models scenarios, and generates a polished summary to guide the conversation.',
  },
  'business-owner': {
    id: 'business-owner',
    eyebrow: 'For business-owner clients · by BlueLine Advisors',
    title: 'Business Owner Planning',
    description:
      'Specific questions business owners ask before a plan document, payroll change, or entity election — retirement plan design and owner compensation strategy.',
  },
  'wealth-life': {
    id: 'wealth-life',
    eyebrow: 'For individuals & families · by BlueLine Advisors',
    title: 'Wealth & Life Planning',
    description:
      'Client-facing planning resources for retirement readiness, 401(k) decisions, major life transitions, and financial discovery.',
  },
}

export const TOOLS = [
  // ---------- Primary Grott Luker Toolkit ----------
  {
    id: 'estimated-tax',
    group: 'primary',
    path: '/tools/estimated-tax',
    index: 'GL 01',
    icon: CalendarClock,
    title: 'Estimated Tax & Safe Harbor Planner',
    short: 'Estimated Tax & Safe Harbor',
    description:
      'Project the year’s tax, test the safe-harbor thresholds, account for withholding, and calculate the remaining quarterly payments needed to avoid an underpayment penalty.',
  },
  {
    id: 'multi-year-projection',
    group: 'primary',
    path: '/tools/multi-year-projection',
    index: 'GL 02',
    icon: LineChart,
    title: 'Multi-Year Tax Projection Planner',
    short: 'Multi-Year Tax Projection',
    description:
      'Project taxable income and tax across several years to visualize the impact of Roth conversions, RMDs, Social Security timing, and other events — and find low-bracket planning windows.',
  },
  {
    id: 'roth-conversion',
    group: 'primary',
    path: '/tools/roth-conversion',
    index: 'GL 03',
    icon: RefreshCw,
    title: 'Roth Conversion Analyzer',
    short: 'Roth Conversion Analyzer',
    description:
      'Model the tax cost of a Roth conversion against its long-term benefit — current-year tax, marginal brackets, IRMAA exposure, future RMD reduction, and lifetime wealth impact.',
  },
  {
    id: 'know-your-numbers',
    group: 'primary',
    path: '/tools/know-your-numbers',
    index: 'GL 04',
    icon: ClipboardList,
    shareable: true,
    title: 'Know Your Numbers',
    short: 'Know Your Numbers',
    description:
      'A clean, client-shareable one-page financial snapshot: net worth, cash flow, savings rate, debt summary, and asset allocation.',
  },

  // ---------- Business Owner Planning ----------
  {
    id: 'qbi-optimizer',
    group: 'business-owner',
    path: '/tools/qbi-optimizer',
    index: 'BO 01',
    icon: Percent,
    title: 'QBI Deduction Optimizer',
    short: 'QBI Deduction Optimizer',
    description:
      'Estimate the Section 199A qualified business income deduction, including the taxable-income thresholds, W-2 wage and property limitations, and how planning moves change the deduction.',
  },
  {
    id: 'owner-comp',
    group: 'business-owner',
    path: '/tools/owner-comp',
    index: 'BO 02',
    icon: Wallet,
    title: 'Owner Compensation Optimizer',
    short: 'Owner Compensation Optimizer',
    description:
      'Compare owner compensation strategies — reasonable salary vs. distributions for an S-corporation — including payroll and self-employment tax, QBI effects, and estimated total tax by strategy.',
  },
  {
    id: 'cash-balance',
    group: 'business-owner',
    path: '/tools/cash-balance',
    index: 'BO 03',
    icon: PiggyBank,
    title: 'Cash Balance Plan Analyzer',
    short: 'Cash Balance Analyzer',
    description:
      'Understand the characteristics of businesses that commonly evaluate Cash Balance Plans, with illustrative contribution and deduction ranges.',
  },

  // ---------- Wealth & Life Planning ----------
  {
    id: 'retire-track',
    group: 'wealth-life',
    path: '/tools/retire-track',
    index: 'WL 01',
    icon: Target,
    title: 'Am I on Track to Retire?',
    short: 'Retirement Readiness',
    description:
      'A retirement readiness snapshot with an income-coverage score — projected income from savings, Social Security, pension, and other sources against estimated needs, with adjustable return, inflation, and withdrawal-rate assumptions.',
  },
  {
    id: 'rollover-401k',
    group: 'wealth-life',
    path: '/tools/rollover-401k',
    index: 'WL 02',
    icon: ArrowLeftRight,
    title: 'Should I Roll Over My 401(k)?',
    short: '401(k) Rollover',
    description:
      'Compares all four options side by side — rolling to a new employer plan, leaving it in place, rolling to an IRA, or cashing out — with fee drag, tax and penalty impact, and the qualitative factors that matter alongside the numbers.',
  },
  {
    id: 'divorce-division',
    group: 'wealth-life',
    path: '/tools/divorce-division',
    index: 'WL 03',
    icon: Scale,
    title: 'How Will Divorce Affect My Finances?',
    short: 'Divorce Financial Impact',
    description:
      'Illustrate the after-tax consequences of a proposed property division across any mix of assets — cash, investments, real estate, retirement, HSA, 529s, and more — and how embedded taxes shift an equalized split.',
  },
]

export function getTool(id) {
  return TOOLS.find((t) => t.id === id)
}

export function toolsByGroup(groupId) {
  return TOOLS.filter((t) => t.group === groupId)
}
