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
} from './tax.js'

export const BRACKET_TOPS = { 12: 0.12, 22: 0.22, 24: 0.24 }
export const TAXABLE_DRAG = 0.2 // tax drag on returns in the taxable account

// Ordinary tax on `taxable` with brackets scaled by `idx` (inflation indexing).
function bracketsFor(filing, idx) {
  return ORDINARY_BRACKETS[filing].map((b) => ({ upTo: b.upTo === Infinity ? Infinity : b.upTo * idx, rate: b.rate }))
}
function taxWith(brackets, taxable) {
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
function topOf(brackets, ratePct) {
  const b = brackets.find((x) => Math.round(x.rate * 100) === ratePct)
  return b ? b.upTo : 0
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
  let totalConverted = 0
  const rows = []
  const wealth = [] // after-tax family wealth at the end of each year, year 0 first

  const wealthNow = (rate) => pretax * (1 - rate) + roth + side
  wealth.push(wealthNow(i.beneficiaryRate))

  for (let t = 0; t < years; t++) {
    const age = startAge + t
    const year = TAX_YEAR + t
    const idx = Math.pow(g, t)
    const brackets = bracketsFor(filing, idx)
    const std = STANDARD_DEDUCTION[filing] * idx

    const wagesY = age < i.retireAge ? i.wages * idx : 0
    const ssY = age >= i.ssStartAge ? i.ssAnnual * idx : 0
    const pensionY = i.pension * idx
    const otherY = i.otherIncome * idx
    const divisor = age >= rmdAge ? rmdDivisor(age, rmdAge) : null
    const rmd = divisor ? pretax / divisor : 0

    // Income before any conversion.
    const ordinaryBefore = wagesY + pensionY + otherY + rmd
    const taxableSSBefore = taxableSocialSecurity(ssY, ordinaryBefore, 0, filing)
    const seniors = age >= 65 && year <= SENIOR_DEDUCTION.lastYear ? people : 0
    const agiBefore = ordinaryBefore + taxableSSBefore
    const seniorBefore = seniorDeduction(agiBefore, filing, seniors)
    const taxableBefore = Math.max(0, agiBefore - std - seniorBefore)

    // Conversion for the year.
    let conversion = 0
    if (withPlan && i.mode === 'flat' && t < i.flatYears) conversion = i.flatAmount
    if (withPlan && i.mode === 'fill' && age <= i.fillUntilAge) {
      // Fill to the top of the chosen bracket. Social Security taxation and the
      // senior phase-out move with income, so iterate a few times.
      const top = topOf(brackets, i.fillBracket)
      conversion = Math.max(0, top - taxableBefore)
      for (let k = 0; k < 4; k++) {
        const ord = ordinaryBefore + conversion
        const tss = taxableSocialSecurity(ssY, ord, 0, filing)
        const agi = ord + tss
        const sen = seniorDeduction(agi, filing, seniors)
        const taxable = Math.max(0, agi - std - sen)
        conversion = Math.max(0, conversion + (top - taxable))
      }
    }
    conversion = Math.min(conversion, Math.max(0, pretax - rmd))

    const ordinary = ordinaryBefore + conversion
    const taxableSS = taxableSocialSecurity(ssY, ordinary, 0, filing)
    const agi = ordinary + taxableSS
    const senior = seniorDeduction(agi, filing, seniors)
    const taxable = Math.max(0, agi - std - senior)
    const { tax: fedTax, fill } = taxWith(brackets, taxable)
    const stateTax = taxable * i.stateRate
    const tax = fedTax + stateTax
    const filled = fill.filter((f) => f.amount > 0.5)
    const marginal = filled.length ? filled[filled.length - 1].rate : brackets[0].rate
    lifetimeTax += tax
    totalConverted += conversion

    // Cash: RMD lands in the taxable account; tax is paid from the taxable
    // account first, then withheld from the conversion.
    pretax -= rmd + conversion
    side += rmd
    const fromSide = Math.min(side, tax)
    side -= fromSide
    const withheld = tax - fromSide
    roth += Math.max(0, conversion - withheld)
    // Growth.
    pretax *= 1 + r
    roth *= 1 + r
    side *= 1 + rTax

    rows.push({ t, year, age, wages: wagesY, ss: ssY, taxableSS, pension: pensionY, other: otherY, rmd, conversion, agi, std, senior, taxable, fedTax, stateTax, tax, marginal, fill, pretax, roth, side })
    wealth.push(wealthNow(i.beneficiaryRate))
  }
  const last = rows[rows.length - 1]
  const heirsTax = last.pretax * i.beneficiaryRate
  return {
    rows, wealth, lifetimeTax, totalConverted, rmdAge, startAge, years,
    endPretax: last.pretax, endRoth: last.roth, endSide: last.side,
    heirsTax, familyWealth: last.pretax - heirsTax + last.roth + last.side,
  }
}

export function computeMultiYear(i) {
  const plan = runScenario(i, true)
  const none = runScenario(i, false)
  return { plan, none, delta: plan.familyWealth - none.familyWealth, taxDelta: plan.lifetimeTax - none.lifetimeTax }
}
