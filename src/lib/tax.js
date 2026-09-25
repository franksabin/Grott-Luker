// Shared federal tax engine (2026 parameters, simplified).
// Sources: Rev. Proc. 2025-32 (brackets, standard deduction, LTCG breakpoints,
// §199A thresholds), IRS Notice 2025-67 (retirement limits), SSA 2026 COLA
// fact sheet (wage base), CMS 2026 Medicare Part B/D premium release (IRMAA).
// Used by the Business Sale estimator and the Retirement Income Tax Map.
// All figures are estimates. Real returns involve credits, phaseouts,
// AMT, QBI limits, state specifics, and more — disclosed per tool.

export const TAX_YEAR = 2026

// Ordinary income brackets — 2026 (Rev. Proc. 2025-32 §3.01).
export const ORDINARY_BRACKETS = {
  single: [
    { upTo: 12400, rate: 0.1 },
    { upTo: 50400, rate: 0.12 },
    { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 },
    { upTo: 256225, rate: 0.32 },
    { upTo: 640600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married: [
    { upTo: 24800, rate: 0.1 },
    { upTo: 100800, rate: 0.12 },
    { upTo: 211400, rate: 0.22 },
    { upTo: 403550, rate: 0.24 },
    { upTo: 512450, rate: 0.32 },
    { upTo: 768700, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
}

// Long-term capital gains breakpoints — 2026 (Rev. Proc. 2025-32 §3.03, taxable-income based).
export const LTCG_BREAKS = {
  single: { zeroTo: 49450, fifteenTo: 545500 },
  married: { zeroTo: 98900, fifteenTo: 613700 },
}

// Standard deduction — 2026 (Rev. Proc. 2025-32 §3.14).
export const STANDARD_DEDUCTION = {
  single: 16100,
  married: 32200,
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

// IRMAA — Medicare Part B & D income-related surcharge (2026 schedule per CMS,
// standard Part B premium $202.90; surcharge = total premium − standard; based
// on MAGI). Returns the ESTIMATED ANNUAL surcharge PER PERSON above the base
// premium (i.e., the extra cost attributable to income). Part B base premium
// is excluded — only the surcharge is returned.
const IRMAA_TIERS = {
  single: [
    { upTo: 109000, partB: 0, partD: 0 },
    { upTo: 137000, partB: 81.2, partD: 14.5 },
    { upTo: 171000, partB: 202.9, partD: 37.5 },
    { upTo: 205000, partB: 324.6, partD: 60.4 },
    { upTo: 500000, partB: 446.3, partD: 83.3 },
    { upTo: Infinity, partB: 487.0, partD: 91.0 },
  ],
  married: [
    { upTo: 218000, partB: 0, partD: 0 },
    { upTo: 274000, partB: 81.2, partD: 14.5 },
    { upTo: 342000, partB: 202.9, partD: 37.5 },
    { upTo: 410000, partB: 324.6, partD: 60.4 },
    { upTo: 750000, partB: 446.3, partD: 83.3 },
    { upTo: Infinity, partB: 487.0, partD: 91.0 },
  ],
}

// Social Security wage base (2026, SSA COLA fact sheet) and payroll / self-employment tax helpers.
export const SS_WAGE_BASE = 184500

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

// Section 199A QBI thresholds (2026, Rev. Proc. 2025-32 §3.26; OBBBA widened the
// phase-in range to $75k single / $150k married).
export const QBI_THRESHOLDS = {
  single: { start: 201750, end: 276750 },
  married: { start: 403500, end: 553500 },
}

// ---------------------------------------------------------------------------
// One Big Beautiful Bill Act (P.L. 119-21) provisions in effect for 2026.
// ---------------------------------------------------------------------------

// §164(b)(6) SALT cap: $40,400 for 2026, reduced by 30% of MAGI over $505,000,
// never below $10,000.
export const SALT_CAP = { base: 40400, phaseStart: 505000, phaseRate: 0.3, floor: 10000 }
export function saltCap(magi) {
  const over = Math.max(0, Math.max(0, magi) - SALT_CAP.phaseStart)
  return Math.max(SALT_CAP.floor, SALT_CAP.base - SALT_CAP.phaseRate * over)
}

// §170(b)(1)(I): itemized charitable deductions allowed only above 0.5% of AGI.
export const CHARITY_AGI_FLOOR = 0.005

// §170(p): non-itemizers may deduct cash gifts up to $1,000 ($2,000 MFJ).
export const NONITEMIZER_CHARITY = { single: 1000, married: 2000 }

// §68 (as amended): itemized deductions are reduced by 2/37 of the lesser of
// (a) total itemized deductions or (b) the amount by which taxable income plus
// itemized deductions exceeds the start of the 37% bracket — i.e. deductions are
// worth at most 35 cents on the dollar to top-bracket filers.
export function itemizedAfterCap(itemized, taxableAfterItemized, filing) {
  const f = normalizeFiling(filing)
  const b = ORDINARY_BRACKETS[f]
  const topStart = b[b.length - 2].upTo
  const excess = Math.max(0, Math.max(0, taxableAfterItemized) + itemized - topStart)
  const reduction = (2 / 37) * Math.min(Math.max(0, itemized), excess)
  return { allowed: Math.max(0, itemized - reduction), reduction }
}

// §151(d)(5) senior deduction (2025–2028): $6,000 per individual 65+, reduced by
// 6% of MAGI over $75,000 ($150,000 MFJ). Available whether or not itemizing.
export const SENIOR_DEDUCTION = { amount: 6000, phaseStart: { single: 75000, married: 150000 }, phaseRate: 0.06, lastYear: 2028 }
export function seniorDeduction(magi, filing, seniors = 1) {
  if (seniors <= 0) return 0
  const f = normalizeFiling(filing)
  const over = Math.max(0, Math.max(0, magi) - SENIOR_DEDUCTION.phaseStart[f])
  return Math.max(0, SENIOR_DEDUCTION.amount * seniors - SENIOR_DEDUCTION.phaseRate * over)
}

// §199A(i) minimum deduction: $400 when active QBI is at least $1,000.
export const QBI_MINIMUM = { deduction: 400, activeQbi: 1000 }

// Uniform Lifetime Table divisor (approximate) for a given age, for RMDs.
// Uniform Lifetime Table divisors for RMDs (ages 72–105). RMDs begin at 73 for
// those born 1951–1959 and at 75 for those born 1960 or later (SECURE 2.0).
const UNIFORM_LIFETIME = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0,
  102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6,
}
export function rmdStartAge(birthYear) {
  if (!birthYear) return 73
  if (birthYear >= 1960) return 75
  if (birthYear >= 1951) return 73
  return 72
}
export function rmdDivisor(age, startAge = 73) {
  if (age < startAge) return null
  if (age > 105) return UNIFORM_LIFETIME[105]
  return UNIFORM_LIFETIME[age] || UNIFORM_LIFETIME[105]
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
