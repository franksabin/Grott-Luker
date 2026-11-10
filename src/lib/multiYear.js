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
//      living (optional, default 0: annual living costs in today's dollars, used only for sensitivity runs; see below),
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
  const incomeAgiHistory = [] // the same, with no RMD and no conversion: what IRMAA would be on the household's own income
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

    // IRMAA: Medicare surcharge at 65+, set by MAGI two years earlier. In the first two years that MAGI is already history, so nothing
    // done today (a conversion) can change it; the current year's MAGI before any conversion is the best available proxy, the same in
    // both scenarios.
    const magiRef = t >= 2 ? agiHistory[t - 2] : before.agi
    const irmaa = age >= 65 ? irmaaSurcharge(magiRef / idx, filing).annualHousehold * idx : 0
    lifetimeIrmaa += irmaa
    agiHistory.push(agi)

    // The same year on the household's own income alone (no RMD, no conversion): the tax it would owe, and the IRMAA it would pay.
    const incomeOnly = taxYear({ ...ctx, ordinaryBefore: wagesY + pensionY + otherY }, 0)
    const incomeMagiRef = t >= 2 ? incomeAgiHistory[t - 2] : before.agi // history is not caused by the RMD or a conversion either, so in the first two years all of it is income's
    const incomeIrmaa = age >= 65 ? irmaaSurcharge(incomeMagiRef / idx, filing).annualHousehold * idx : 0
    incomeAgiHistory.push(incomeOnly.agi)

    // Cash. Spending is not modeled: the household's own income (wages, pension, Social Security, other) is assumed to cover living costs
    // and the tax and IRMAA it would owe on its own, so those never touch wealth. The portfolio pays the rest, the same way in both
    // scenarios: the RMD lands in the taxable account and the tax it adds comes out of that account, as does the extra IRMAA the RMD and
    // the conversion trigger. Those two are charged even when the account is empty. It then goes below zero, which stands for cash found
    // by selling other assets, so the shortfall costs the portfolio's full return (below), not the taxable account's after-drag return.
    // The tax on the conversion itself comes out of the taxable account only while it holds cash, then is withheld from the conversion.
    const rmdTax = before.tax - incomeOnly.tax
    const irmaaExtra = irmaa - incomeIrmaa
    const convTax = Math.max(0, tax - before.tax)
    pretax -= rmd + conversion
    side += rmd
    side -= rmdTax + irmaaExtra
    // Living costs are not modeled, so `living` is 0 unless a sensitivity run sets it. Then whatever the household's income, after the tax and
    // IRMAA it owes on its own, does not cover comes out of the taxable account, in both scenarios.
    const livingY = (i.living > 0 ? i.living : 0) * idx
    const livingFromSavings = livingY > 0 ? Math.max(0, livingY - (wagesY + ssY + pensionY + otherY - incomeOnly.tax - incomeIrmaa)) : 0
    side -= livingFromSavings
    const convFromSide = Math.min(Math.max(0, side), convTax)
    side -= convFromSide
    const withheld = convTax - convFromSide
    roth += Math.max(0, conversion - withheld)
    // Growth.
    pretax *= 1 + r
    roth *= 1 + r
    side *= 1 + (side < 0 ? r : rTax)

    rows.push({ t, year, age, wages: wagesY, ss: ssY, taxableSS, pension: pensionY, other: otherY, rmd, conversion, agi, std, senior, taxable, fedTax, stateTax, tax, marginal, fill, irmaa, rmdTax, convTax, irmaaExtra, livingFromSavings, withheld, pretax, roth, side })
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

// The tax rate on dollars that are still pre-tax at the end of the plan, if the client is the one who takes them out rather than heirs:
// the rate the client's own RMDs are taxed at in the do-nothing run (marginal federal plus state, weighted by the RMD; a year whose
// deductions absorb the whole RMD, so nothing is taxed, counts at 0%), or the last year's rate when no RMD is ever taken. The same
// rate is applied to both scenarios, so it never favors one of them.
export function ownRateOf(none, stateRate) {
  let weight = 0
  let weighted = 0
  for (const row of none.rows) {
    if (row.rmd > 0) {
      weight += row.rmd
      weighted += row.rmd * (row.taxable > 0.5 ? row.marginal + stateRate : 0)
    }
  }
  const last = none.rows[none.rows.length - 1]
  return clampRate(weight > 0 ? weighted / weight : last.marginal + stateRate)
}
const clampRate = (v) => Math.min(0.6, Math.max(0, v))

// Present value: dollars `t` years from now, discounted at `rate` a year. The default is a long-run inflation rate, so it restates
// future dollars in today's purchasing power.
export const DISCOUNT_RATE = 0.025
export const discountFactor = (rate, t) => 1 / Math.pow(1 + rate, t)

// i.ownRate (a fraction) overrides the derived rate; i.discount (a fraction) overrides DISCOUNT_RATE.
//
// Two ways to value what is left at the end of the plan:
//   with heirs (familyWealth): pre-tax is worth (1 − heirs' rate), the existing headline;
//   the client alone (ownWealth): pre-tax is worth (1 − the client's own rate on it), no heirs involved.
// Balances at the end of the plan are discounted over the whole horizon; each year's tax and IRMAA is discounted from the start of that year
// (this year's is not discounted).
export function computeMultiYear(i) {
  const plan = runScenario(i, true)
  const none = runScenario(i, false)
  const discount = Number.isFinite(i.discount) ? Math.max(0, i.discount) : DISCOUNT_RATE
  const ownRateAuto = ownRateOf(none, i.stateRate)
  const ownRate = i.ownRate != null && Number.isFinite(i.ownRate) ? clampRate(i.ownRate) : ownRateAuto
  const fEnd = discountFactor(discount, plan.years)
  const pvFlows = (rows, key) => rows.reduce((s, row) => s + row[key] * discountFactor(discount, row.t), 0)
  const addViews = (sc) => {
    const ownNow = (pretax, roth, side) => pretax * (1 - ownRate) + roth + side
    sc.ownWealth = [ownNow(i.pretax, i.roth, i.taxable), ...sc.rows.map((row) => ownNow(row.pretax, row.roth, row.side))]
    sc.endOwn = sc.ownWealth[sc.ownWealth.length - 1]
    sc.pvEndOwn = sc.endOwn * fEnd
    sc.pvFamily = sc.familyWealth * fEnd
    sc.pvHeirsTax = sc.heirsTax * fEnd
    sc.pvLifetimeTax = pvFlows(sc.rows, 'tax')
    sc.pvLifetimeIrmaa = pvFlows(sc.rows, 'irmaa')
  }
  addViews(plan)
  addViews(none)
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
  const delta = plan.familyWealth - none.familyWealth
  const deltaOwn = plan.endOwn - none.endOwn
  return {
    plan, none, thisYear, delta, taxDelta: plan.lifetimeTax - none.lifetimeTax, irmaaDelta: plan.lifetimeIrmaa - none.lifetimeIrmaa,
    // The client alone, and what heirs add on top of that (the existing headline is `delta`, the two together).
    deltaOwn,
    heirsAddOn: delta - deltaOwn,
    ownRate,
    ownRateAuto, // what the rate would be without an override
    ownRateDerived: !(i.ownRate != null && Number.isFinite(i.ownRate)),
    discount,
    years: plan.years,
    // Today's dollars. Positive tax and IRMAA deltas are costs, as in `taxDelta` and `irmaaDelta`.
    pv: {
      deltaOwn: deltaOwn * fEnd,
      delta: delta * fEnd,
      heirsAddOn: (delta - deltaOwn) * fEnd,
      taxDelta: plan.pvLifetimeTax - none.pvLifetimeTax,
      irmaaDelta: plan.pvLifetimeIrmaa - none.pvLifetimeIrmaa,
    },
  }
}
