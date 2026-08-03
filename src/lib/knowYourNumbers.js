// Shared Know Your Numbers definitions and math.
//
// Deliberately dependency-light (no React) so the Cloudflare Worker can import
// the field list and validate submissions against the same single source of
// truth the UI renders from.
import { toNumber } from './format.js'

export const ASSET_CATS = [
  { key: 'cash', label: 'Cash & bank accounts' },
  { key: 'investments', label: 'Investments (non-retirement)' },
  { key: 'retirement', label: 'Retirement accounts' },
  { key: 'realEstate', label: 'Real estate' },
  { key: 'business', label: 'Business interests' },
  { key: 'otherAssets', label: 'Personal property & other' },
]

export const LIABILITY_CATS = [
  { key: 'mortgage', label: 'Mortgage' },
  { key: 'autoLoans', label: 'Auto loans' },
  { key: 'studentLoans', label: 'Student loans' },
  { key: 'creditCards', label: 'Credit cards' },
  { key: 'otherDebt', label: 'Other debt' },
]

export const INCOME_CATS = [
  { key: 'employment', label: 'Employment income' },
  { key: 'businessIncome', label: 'Business / self-employment' },
  { key: 'investmentIncome', label: 'Investment income' },
  { key: 'otherIncome', label: 'Other income' },
]

export const EXPENSE_CATS = [
  { key: 'housing', label: 'Housing' },
  { key: 'living', label: 'Living expenses' },
  { key: 'debtPayments', label: 'Debt payments' },
  { key: 'otherExpenses', label: 'Other expenses' },
]

export const EXTRA_CATS = [
  { key: 'annualSavings', label: 'Annual savings & investing' },
  { key: 'lifeCoverage', label: 'Life insurance coverage' },
  { key: 'disabilityMonthly', label: 'Disability coverage (monthly benefit)' },
]

export const ALL_CATS = [
  ...ASSET_CATS,
  ...LIABILITY_CATS,
  ...INCOME_CATS,
  ...EXPENSE_CATS,
  ...EXTRA_CATS,
]

// Every figure key the tool accepts — used by the Worker to reject unknown fields.
export const FIELD_KEYS = ALL_CATS.map((c) => c.key)

export const BLANK = FIELD_KEYS.reduce((acc, k) => ({ ...acc, [k]: '' }), {})

export const SAMPLE = {
  cash: '85000',
  investments: '420000',
  retirement: '610000',
  realEstate: '750000',
  business: '250000',
  otherAssets: '90000',
  mortgage: '380000',
  autoLoans: '32000',
  studentLoans: '18000',
  creditCards: '6000',
  otherDebt: '0',
  employment: '210000',
  businessIncome: '60000',
  investmentIncome: '18000',
  otherIncome: '0',
  housing: '54000',
  living: '78000',
  debtPayments: '42000',
  otherExpenses: '24000',
  annualSavings: '48000',
  lifeCoverage: '1000000',
  disabilityMonthly: '8000',
}

function sumKeys(form, cats) {
  return cats.reduce((s, c) => s + toNumber(form[c.key]), 0)
}

export function compute(form) {
  const totalAssets = sumKeys(form, ASSET_CATS)
  const totalLiabilities = sumKeys(form, LIABILITY_CATS)
  const netWorth = totalAssets - totalLiabilities

  const totalIncome = sumKeys(form, INCOME_CATS)
  const totalExpenses = sumKeys(form, EXPENSE_CATS)
  const annualCashFlow = totalIncome - totalExpenses

  const annualSavings = toNumber(form.annualSavings)
  const savingsRate = totalIncome > 0 ? (annualSavings / totalIncome) * 100 : 0
  const debtPayments = toNumber(form.debtPayments)
  const dti = totalIncome > 0 ? (debtPayments / totalIncome) * 100 : 0

  const allocation = ASSET_CATS.map((c) => ({
    label: c.label,
    value: toNumber(form[c.key]),
    pct: totalAssets > 0 ? (toNumber(form[c.key]) / totalAssets) * 100 : 0,
  })).filter((c) => c.value > 0)

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    totalIncome,
    totalExpenses,
    annualCashFlow,
    annualSavings,
    savingsRate,
    debtPayments,
    dti,
    allocation,
  }
}

// True when the client has actually entered something worth submitting.
export function hasAnyFigures(form) {
  return FIELD_KEYS.some((k) => toNumber(form[k]) > 0)
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim())
}
