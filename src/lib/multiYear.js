// Multi-year projection with Roth conversions, RMDs by birth year, bracket
// filling, and an inheritance view: what the family keeps after the heirs'
// tax on whatever is still pre-tax at the end.
import {
  ORDINARY_BRACKETS,
  STANDARD_DEDUCTION,
  TAX_YEAR,
  normalizeFiling,
  taxableSocialSecurity,
  seniorDeduction,
  SENIOR_DEDUCTION,
  rmdDivisor,
  rmdStartAge,
  irmaaSurcharge,
  ADDITIONAL_STANDARD,
  capitalGainsTax,
  niitTax,
} from './tax.js'

export const BRACKET_TOPS = { 12: 0.12, 22: 0.22, 24: 0.24 }
export const TAXABLE_DRAG = 0.2 // tax drag on returns in the taxable account

// Ordinary tax on `taxable` with brackets scaled by `idx` (inflation indexing).
export function bracketsFor(filing, idx) {
  return ORDINARY_BRACKETS[filing].map((b) => ({ upTo: b.upTo === Infinity ? Infinity : b.upTo * idx, rate: b.rate }))
}
export function taxWith(brackets, taxable) {
  let tax = 0
  let last = 0
  const inc = Math.max(0, taxable)
  const fill = []
  for (const b of brackets) {
    const slice = Math.max(0, Math.min(inc, b.upTo) - last)
    fill.push({ rate: b.rate, amount: slice })
    tax += slice * b.rate
    last = b.upTo
    if (inc <= b.upTo) break
  }
  return { tax, fill }
}
export function topOf(brackets, ratePct) {
  const b = brackets.find((x) => Math.round(x.rate * 100) === ratePct)
  return b ? b.upTo : 0
}

// One year's income tax for a given income before conversion and a conversion amount.
// Shared by the multi-year projection and the one-year estimator so the two cannot disagree.
// ctx: { filing, brackets, std, ordinaryBefore, ssY, seniors, stateRate, idx = 1, ltcg = 0, itemized = 0, taxExempt = 0, nii = 0 }
//   ordinaryBefore  ordinary income before any conversion (wages, pension, other, RMD), without Social Security
//   ssY             gross Social Security benefits for the year
//   seniors         how many taxpayers get the senior deduction (age 65+, through 2028)
//   ltcg, itemized  optional: long-term gains/qualified dividends, and itemized deductions (used when larger than std)
//   taxExempt       optional: tax-exempt interest (counts toward Social Security taxation, not toward AGI)
//   nii             optional: net investment income for the 3.8% tax (NIIT applies above $200,000 / $250,000 of MAGI)
export function taxYear(ctx, conversion = 0) {
  const { filing, brackets, std, ordinaryBefore, ssY, seniors, stateRate, idx = 1, ltcg = 0, itemized = 0, taxExempt = 0, nii = 0 } = ctx
  const ordinary = ordinaryBefore + conversion
  const taxableSS = taxableSocialSecurity(ssY, ordinary + ltcg, taxExempt, filing)
  const ordinaryAGI = ordinary + taxableSS
  const agi = ordinaryAGI + ltcg
  const senior = seniorDeduction(agi, filing, seniors)
  const deduction = Math.max(std, itemized)
  const ordinaryTaxable = Math.max(0, ordinaryAGI - deduction - senior)
  // Whatever deduction the ordinary income cannot absorb spills onto the gains.
  const ltcgTaxable = Math.max(0, ltcg - Math.max(0, deduction + senior - ordinaryAGI))
  const taxable = ordinaryTaxable + ltcgTaxable
  const { tax: fedOrdinary, fill } = taxWith(brackets, ordinaryTaxable)
  const fedGains = ltcgTaxable > 0 ? capitalGainsTax(ltcgTaxable / idx, ordinaryTaxable / idx, filing) * idx : 0
  const niit = nii > 0 ? niitTax(nii, agi, filing) : 0
  const fedTax = fedOrdinary + fedGains + niit
  const stateTax = taxable * stateRate
  const tax = fedTax + stateTax
  const filled = fill.filter((f) => f.amount > 0.5)
  const marginal = filled.length ? filled[filled.length - 1].rate : brackets[0].rate
  return { ordinary, taxableSS, agi, senior, deduction, taxable, ordinaryTaxable, ltcgTaxable, fedOrdinary, fedGains, niit, fedTax, stateTax, tax, fill, marginal }
}

// Conversion that takes ordinary taxable income exactly to `top`. Taxable income rises with the
// conversion by more than a dollar per dollar where Social Security becomes taxable and where the
// senior deduction phases out, so a fixed-point iteration can overshoot there; bisect instead.
// Taxable income never falls as the conversion grows, so the largest conversion that stays at or
// under `top` is well defined.
export function fillConversion(ctx, top) {
  const t0 = taxYear(ctx, 0).ordinaryTaxable
  if (t0 >= top) return 0
  let lo = 0
  let hi = Math.max(1, top - t0)
  for (let k = 0; k < 60 && taxYear(ctx, hi).ordinaryTaxable <= top; k++) hi *= 2
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2
    if (taxYear(ctx, mid).ordinaryTaxable <= top) lo = mid
    else hi = mid
  }
  return lo
}

// Run one scenario.
// i: { birthYear, filing, endAge, retireAge, wages, ssAnnual, ssStartAge, pension, otherIncome,
//      pretax, roth, taxable, ret, infl, index (bool), stateRate,
//      mode: 'none' | 'flat' | 'fill', flatAmount, flatYears, fillBracket, fillUntilAge,
//      beneficiaryRate }
export function runScenario(i, withPlan) {
  const filing = normalizeFiling(i.filing)
  const people = filing === 'married' ? 2 : 1
  const startAge = TAX_YEAR - i.birthYear
  const rmdAge = rmdStartAge(i.birthYear)
  const years = Math.max(1, i.endAge - startAge + 1)
  const r = i.ret
  const rTax = r * (1 - TAXABLE_DRAG)
  const g = i.index ? 1 + i.infl : 1

  let pretax = i.pretax
  let roth = i.roth
  let side = i.taxable
  let lifetimeTax = 0
  let lifetimeIrmaa = 0
  let totalConverted = 0
  const agiHistory = []
  const rows = []
  const wealth = [] // after-tax family wealth at the end of each year, year 0 first

  const wealthNow = (rate) => pretax * (1 - rate) + roth + side
  wealth.push(wealthNow(i.beneficiaryRate))

  for (let t = 0; t < years; t++) {
    const age = startAge + t
    const year = TAX_YEAR + t
    const idx = Math.pow(g, t)
    const brackets = bracketsFor(filing, idx)
    // Additional standard deduction for each taxpayer 65 or older (both spouses are assumed the same age).
    const aged = age >= 65 ? people : 0
    const std = (STANDARD_DEDUCTION[filing] + aged * ADDITIONAL_STANDARD[filing]) * idx

    const wagesY = age < i.retireAge ? i.wages * idx : 0
    const ssY = age >= i.ssStartAge ? i.ssAnnual * idx : 0
    const pensionY = i.pension * idx
    const otherY = i.otherIncome * idx
    const divisor = age >= rmdAge ? rmdDivisor(age, rmdAge) : null
    const rmd = divisor ? pretax / divisor : 0

    // Income before any conversion.
    const ordinaryBefore = wagesY + pensionY + otherY + rmd
    const seniors = age >= 65 && year <= SENIOR_DEDUCTION.lastYear ? people : 0
    const ctx = { filing, brackets, std, ordinaryBefore, ssY, seniors, stateRate: i.stateRate, idx }
    const before = taxYear(ctx, 0)

    // Conversion for the year.
    let conversion = 0
    if (withPlan && i.mode === 'flat' && t < i.flatYears) conversion = i.flatAmount
    if (withPlan && i.mode === 'fill' && age <= i.fillUntilAge) {
      // Fill to the top of the chosen bracket.
      conversion = fillConversion(ctx, topOf(brackets, i.fillBracket))
    }
    conversion = Math.min(conversion, Math.max(0, pretax - rmd))

    const { taxableSS, agi, senior, taxable, fedTax, stateTax, tax, fill, marginal } = taxYear(ctx, conversion)
    lifetimeTax += tax
    totalConverted += conversion

    // IRMAA: Medicare surcharge at 65+, set by MAGI two years earlier (the
    // first two years use the current year's MAGI as the best available proxy).
    const magiRef = t >= 2 ? agiHistory[t - 2] : agi
    const irmaa = age >= 65 ? irmaaSurcharge(magiRef / idx, filing).annualHousehold * idx : 0
    lifetimeIrmaa += irmaa
    agiHistory.push(agi)

    // Cash. The RMD lands in the taxable account. The tax the household owes
    // WITHOUT a conversion (on wages, pension, Social Security, RMD) and IRMAA
    // come out of the taxable account while it lasts; any shortfall is paid
    // from that same income, which the model treats as spent and does not
    // track — identically in both scenarios. Only the extra tax caused by the
    // conversion is charged to the conversion: taxable account first, then
    // withheld from the conversion itself.
    const baselineTax = before.tax
    const convTax = Math.max(0, tax - baselineTax)
    pretax -= rmd + conversion
    side += rmd
    const payFromSide = (amount) => {
      const paid = Math.min(Math.max(0, side), Math.max(0, amount))
      side -= paid
      return paid
    }
    payFromSide(irmaa)
    payFromSide(baselineTax)
    const convFromSide = payFromSide(convTax)
    const withheld = convTax - convFromSide
    roth += Math.max(0, conversion - withheld)
    // Growth.
    pretax *= 1 + r
    roth *= 1 + r
    side *= 1 + rTax

    rows.push({ t, year, age, wages: wagesY, ss: ssY, taxableSS, pension: pensionY, other: otherY, rmd, conversion, agi, std, senior, taxable, fedTax, stateTax, tax, marginal, fill, irmaa, withheld, pretax, roth, side })
    wealth.push(wealthNow(i.beneficiaryRate))
  }
  const last = rows[rows.length - 1]
  const heirsTax = last.pretax * i.beneficiaryRate
  return {
    rows, wealth, lifetimeTax, lifetimeIrmaa, totalConverted, rmdAge, startAge, years,
    endPretax: last.pretax, endRoth: last.roth, endSide: last.side,
    heirsTax, familyWealth: last.pretax - heirsTax + last.roth + last.side,
  }
}

export function computeMultiYear(i) {
  const plan = runScenario(i, true)
  const none = runScenario(i, false)
  // This year's conversion on its own: what it costs now and what it triggers.
  const p0 = plan.rows[0]
  const n0 = none.rows[0]
  const filing = normalizeFiling(i.filing)
  const irmaaWith = irmaaSurcharge(p0.agi, filing).annualHousehold
  const irmaaWithout = irmaaSurcharge(n0.agi, filing).annualHousehold
  const thisYear = {
    conversion: p0.conversion,
    tax: p0.tax - n0.tax,
    rate: p0.conversion > 0 ? (p0.tax - n0.tax) / p0.conversion : 0,
    netToRoth: Math.max(0, p0.conversion - p0.withheld),
    irmaaLater: p0.age + 2 >= 65 ? Math.max(0, irmaaWith - irmaaWithout) : 0,
    irmaaApplies: p0.age + 2 >= 65,
  }
  return { plan, none, thisYear, delta: plan.familyWealth - none.familyWealth, taxDelta: plan.lifetimeTax - none.lifetimeTax, irmaaDelta: plan.lifetimeIrmaa - none.lifetimeIrmaa }
}
