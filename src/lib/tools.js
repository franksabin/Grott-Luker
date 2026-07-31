// Registry of tools, split into two dashboard sections:
//   'cpa'      — internal CPA decision-support tools (Grott Luker staff)
//   'blueline' — client-facing planning tools showcasing BlueLine's expertise
import {
  RefreshCw,
  Wallet,
  CalendarClock,
  LineChart,
  Percent,
  Target,
  PiggyBank,
  ArrowLeftRight,
  Scale,
  ClipboardList,
} from 'lucide-react'

export const GROUPS = {
  cpa: {
    id: 'cpa',
    eyebrow: 'For Grott Luker CPAs',
    title: 'CPA Decision Support Toolkit',
    description:
      'Internal planning tools used by Grott Luker CPAs during client meetings and year-end planning. The CPA enters information collected from the client, models scenarios, and generates a polished summary to guide the conversation.',
  },
  blueline: {
    id: 'blueline',
    eyebrow: 'Specialized planning by BlueLine Advisors',
    title: 'BlueLine Specialty Planning Tools',
    description:
      'Client-facing planning resources that showcase the areas BlueLine Advisors specializes in — retirement income, cash balance plans, rollovers, life transitions, and financial discovery.',
  },
}

export const TOOLS = [
  // ---------- CPA Decision Support Toolkit ----------
  {
    id: 'roth-conversion',
    group: 'cpa',
    path: '/tools/roth-conversion',
    index: 'CPA 01',
    icon: RefreshCw,
    title: 'Roth Conversion Analyzer',
    short: 'Roth Conversion Analyzer',
    description:
      'Model the tax cost of a Roth conversion against its long-term benefit — current-year tax, marginal brackets, IRMAA exposure, future RMD reduction, and lifetime wealth impact.',
  },
  {
    id: 'owner-comp',
    group: 'cpa',
    path: '/tools/owner-comp',
    index: 'CPA 02',
    icon: Wallet,
    title: 'Owner Compensation Optimizer',
    short: 'Owner Compensation Optimizer',
    description:
      'Compare owner compensation strategies — reasonable salary vs. distributions for an S-corporation — including payroll and self-employment tax, QBI effects, and estimated total tax by strategy.',
  },
  {
    id: 'estimated-tax',
    group: 'cpa',
    path: '/tools/estimated-tax',
    index: 'CPA 03',
    icon: CalendarClock,
    title: 'Estimated Tax & Safe Harbor Planner',
    short: 'Estimated Tax & Safe Harbor',
    description:
      'Project the year’s tax, test the safe-harbor thresholds, account for withholding, and calculate the remaining quarterly payments needed to avoid an underpayment penalty.',
  },
  {
    id: 'multi-year-projection',
    group: 'cpa',
    path: '/tools/multi-year-projection',
    index: 'CPA 04',
    icon: LineChart,
    title: 'Multi-Year Tax Projection Planner',
    short: 'Multi-Year Tax Projection',
    description:
      'Project taxable income and tax across several years to visualize the impact of Roth conversions, RMDs, Social Security timing, and other events — and find low-bracket planning windows.',
  },
  {
    id: 'qbi-optimizer',
    group: 'cpa',
    path: '/tools/qbi-optimizer',
    index: 'CPA 05',
    icon: Percent,
    title: 'QBI Deduction Optimizer',
    short: 'QBI Deduction Optimizer',
    description:
      'Estimate the Section 199A qualified business income deduction, including the taxable-income thresholds, W-2 wage and property limitations, and how planning moves change the deduction.',
  },

  // ---------- BlueLine Specialty Planning Tools ----------
  {
    id: 'retire-track',
    group: 'blueline',
    path: '/tools/retire-track',
    index: 'BL 01',
    icon: Target,
    title: 'Am I on Track to Retire?',
    short: 'Retirement Readiness',
    description:
      'A retirement readiness snapshot — projected retirement income from all sources against estimated needs, with a simple view of sustainability through retirement.',
  },
  {
    id: 'cash-balance',
    group: 'blueline',
    path: '/tools/cash-balance',
    index: 'BL 02',
    icon: PiggyBank,
    title: 'Cash Balance Plan Analyzer',
    short: 'Cash Balance Analyzer',
    description:
      'Understand the characteristics of businesses that commonly evaluate Cash Balance Plans, with illustrative contribution and deduction ranges.',
  },
  {
    id: 'rollover-401k',
    group: 'blueline',
    path: '/tools/rollover-401k',
    index: 'BL 03',
    icon: ArrowLeftRight,
    title: 'Should I Roll Over My 401(k)?',
    short: '401(k) Rollover',
    description:
      'Compare leaving a 401(k) in place against rolling it to an IRA — weighing fees, investment flexibility, creditor protection, and other planning considerations side by side.',
  },
  {
    id: 'divorce-division',
    group: 'blueline',
    path: '/tools/divorce-division',
    index: 'BL 04',
    icon: Scale,
    title: 'How Will Divorce Affect My Finances?',
    short: 'Divorce Financial Impact',
    description:
      'Illustrate the after-tax consequences of a proposed property division and how embedded taxes affect an equalized split.',
  },
  {
    id: 'know-your-numbers',
    group: 'blueline',
    path: '/tools/know-your-numbers',
    index: 'BL 05',
    icon: ClipboardList,
    title: 'Know Your Numbers',
    short: 'Know Your Numbers',
    description:
      'A clean, client-shareable one-page financial snapshot: net worth, cash flow, savings rate, debt summary, and asset allocation.',
  },
]

export function getTool(id) {
  return TOOLS.find((t) => t.id === id)
}

export function toolsByGroup(groupId) {
  return TOOLS.filter((t) => t.group === groupId)
}
