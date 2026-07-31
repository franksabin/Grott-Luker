// Shared federal tax engine (2025 parameters, simplified).
// Used by the Business Sale estimator and the Retirement Income Tax Map.
// All figures are estimates. Real returns involve credits, phaseouts,
// AMT, QBI limits, state specifics, and more — disclosed per tool.

export const TAX_YEAR = 2025

// Ordinary income brackets — 2025.
export const ORDINARY_BRACKETS = {
  single: [
    { upTo: 11925, rate: 0.1 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married: [
    { upTo: 23850, rate: 0.1 },
    { upTo: 96950, rate: 0.12 },
    { upTo: 206700, rate: 0.22 },
    { upTo: 394600, rate: 0.24 },
    { upTo: 501050, rate: 0.32 },
    { upTo: 751600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
}

// Long-term capital gains breakpoints — 2025 (taxable-income based).
export const LTCG_BREAKS = {
  single: { zeroTo: 48350, fifteenTo: 533400 },
  married: { zeroTo: 96700, fifteenTo: 600050 },
}

export const STANDARD_DEDUCTION = {
  single: 15000,
  married: 30000,
}

// Net Investment Income Tax thresholds (MAGI).
export const NIIT = {
  rate: 0.038,
  threshold: { single: 200000, married: 250000 },
}

export function normalizeFiling(status) {
  return status === 'married' || status === 'mfj' ? 'married' : 'single'
}

// Tax on ordinary income using marginal brackets.
export function ordinaryTax(taxableOrdinary, filing) {
  const f = normalizeFiling(filing)
  const brackets = ORDINARY_BRACKETS[f]
  let tax = 0
  let last = 0
  let income = Math.max(0, taxableOrdinary)
  for (const b of brackets) {
    if (income <= last) break
    const slice = Math.min(income, b.upTo) - last
    tax += slice * b.rate
    last = b.upTo
    if (income <= b.upTo) break
  }
  return tax
}

// Marginal ordinary rate at a given taxable income (for deduction estimates).
export function marginalOrdinaryRate(taxableOrdinary, filing) {
  const f = normalizeFiling(filing)
  const brackets = ORDINARY_BRACKETS[f]
  const income = Math.max(0, taxableOrdinary)
  let last = 0
  for (const b of brackets) {
    if (income <= b.upTo) return b.rate
    last = b.upTo
  }
  return brackets[brackets.length - 1].rate
}

// Long-term capital gains tax; gains stack on top of ordinary taxable income.
export function capitalGainsTax(ltcg, ordinaryTaxable, filing) {
  const f = normalizeFiling(filing)
  const gains = Math.max(0, ltcg)
  if (gains === 0) return 0
  const brk = LTCG_BREAKS[f]
  const ord = Math.max(0, ordinaryTaxable)

  let remaining = gains
  let tax = 0
  let cursor = ord

  // 0% band
  const zeroRoom = Math.max(0, brk.zeroTo - cursor)
  const inZero = Math.min(remaining, zeroRoom)
  remaining -= inZero
  cursor += inZero

  // 15% band
  const fifteenRoom = Math.max(0, brk.fifteenTo - cursor)
  const inFifteen = Math.min(remaining, fifteenRoom)
  tax += inFifteen * 0.15
  remaining -= inFifteen

  // 20% band
  tax += Math.max(0, remaining) * 0.2

  return tax
}

// Net investment income tax on investment income above the MAGI threshold.
export function niitTax(investmentIncome, magi, filing) {
  const f = normalizeFiling(filing)
  const over = Math.max(0, magi - NIIT.threshold[f])
  const base = Math.min(Math.max(0, investmentIncome), over)
  return base * NIIT.rate
}

// Provisional-income test for Social Security taxation.
// Returns the taxable portion of Social Security benefits.
export function taxableSocialSecurity(ssBenefits, otherIncome, taxExemptInterest, filing) {
  const f = normalizeFiling(filing)
  const ss = Math.max(0, ssBenefits)
  if (ss === 0) return 0
  const provisional = Math.max(0, otherIncome) + Math.max(0, taxExemptInterest) + ss * 0.5
  const base1 = f === 'married' ? 32000 : 25000
  const base2 = f === 'married' ? 44000 : 34000

  if (provisional <= base1) return 0

  if (provisional <= base2) {
    return Math.min(0.5 * (provisional - base1), 0.5 * ss)
  }

  const tier1 = Math.min(0.5 * (base2 - base1), 0.5 * ss)
  const taxable = 0.85 * (provisional - base2) + tier1
  return Math.min(taxable, 0.85 * ss)
}

// IRMAA — Medicare Part B & D income-related surcharge (2025 schedule, based
// on MAGI). Returns the ESTIMATED ANNUAL surcharge PER PERSON above the base
// premium (i.e., the extra cost attributable to income). Part B base premium
// is excluded — only the surcharge is returned.
const IRMAA_TIERS = {
  single: [
    { upTo: 106000, partB: 0, partD: 0 },
    { upTo: 133000, partB: 74.0, partD: 13.7 },
    { upTo: 167000, partB: 185.0, partD: 35.3 },
    { upTo: 200000, partB: 295.9, partD: 57.0 },
    { upTo: 500000, partB: 406.9, partD: 78.6 },
    { upTo: Infinity, partB: 443.9, partD: 85.8 },
  ],
  married: [
    { upTo: 212000, partB: 0, partD: 0 },
    { upTo: 266000, partB: 74.0, partD: 13.7 },
    { upTo: 334000, partB: 185.0, partD: 35.3 },
    { upTo: 400000, partB: 295.9, partD: 57.0 },
    { upTo: 750000, partB: 406.9, partD: 78.6 },
    { upTo: Infinity, partB: 443.9, partD: 85.8 },
  ],
}

// Social Security wage base (2025) and payroll / self-employment tax helpers.
export const SS_WAGE_BASE = 176100

// Self-employment tax on net self-employment earnings.
export function selfEmploymentTax(netSE) {
  const base = Math.max(0, netSE) * 0.9235
  const ss = Math.min(base, SS_WAGE_BASE) * 0.124
  const medicare = base * 0.029
  return ss + medicare
}

// Combined employer + employee FICA on a W-2 salary.
export function ficaOnSalary(salary) {
  const s = Math.max(0, salary)
  const ss = Math.min(s, SS_WAGE_BASE) * 0.124
  const medicare = s * 0.029
  return ss + medicare
}

// Section 199A QBI thresholds (2025).
export const QBI_THRESHOLDS = {
  single: { start: 197300, end: 247300 },
  married: { start: 394600, end: 494600 },
}

// Uniform Lifetime Table divisor (approximate) for a given age, for RMDs.
export function rmdDivisor(age) {
  const table = {
    73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
    87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
    94: 9.5, 95: 8.9,
  }
  if (age < 73) return null
  if (age > 95) return 8.9
  return table[age] || 8.9
}

export function irmaaSurcharge(magi, filing) {
  const f = normalizeFiling(filing)
  const tiers = IRMAA_TIERS[f]
  const m = Math.max(0, magi)
  let tier = tiers[0]
  for (const t of tiers) {
    if (m <= t.upTo) {
      tier = t
      break
    }
  }
  const monthlyPerPerson = tier.partB + tier.partD
  const people = f === 'married' ? 2 : 1
  return {
    monthlyPerPerson,
    annualPerPerson: monthlyPerPerson * 12,
    annualHousehold: monthlyPerPerson * 12 * people,
    people,
    tierApplies: monthlyPerPerson > 0,
  }
}
