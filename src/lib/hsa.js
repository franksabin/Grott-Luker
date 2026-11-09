// HSA Savings Planner: this year's maximum contribution, the tax it saves, and a projection to retirement under two ways of
// using the account. Pure functions; the page renders the result and scripts/test-hsa.mjs checks it.
//
// Rules: IRC 223, Rev. Proc. 2025-19 (2026 limits), Notice 2008-52 (part-year and last-month rule), IRS Pub. 969 and Form 8889.
// Deliberately not modeled: the HDHP-versus-other-plan decision, Medicare enrollment timing beyond a flag, long-term-care and Medicare
// premium rules, the 0.9% Additional Medicare Tax, state tax on the earnings, and state-by-state detail beyond whether the state
// follows the federal deduction.
import { toNumber, money } from './format.js'
import { getState } from './states.js'
import { SS_WAGE_BASE, TAX_YEAR } from './tax.js'

// 2026 limits (Rev. Proc. 2025-19). Refresh every January; the 2027 figures are already published (Rev. Proc. 2026-24).
export const HSA = {
  self: 4400,
  family: 8750,
  catchUp: 1000, // each spouse aged 55 or older by year-end, deposited in that spouse's own HSA
  catchUpAge: 55,
  medicareAge: 65,
  minDeductible: { self: 1700, family: 3400 },
  maxOutOfPocket: { self: 8500, family: 17000 },
  dpcCap: { one: 150, more: 300 }, // a direct primary care arrangement above this a month disqualifies
  // States that do not follow the federal HSA deduction or exclusion.
  nonConforming: ['CA', 'NJ'],
  ssRate: 0.062,
  medicareRate: 0.0145,
  next: { year: 2027, self: 4500, family: 9000 },
}

export const DEFAULTS = { retireAge: '65', growth: '6', spend: '2000' }

// Fidelity's Retiree Health Care Cost Estimate (25th edition, released July 21, 2026): a single 65-year-old retiring that year, after
// Medicare, not counting long-term care, over-the-counter drugs or most dental. A benchmark for scale only; refresh each summer.
export const RETIREE_HEALTH = { amount: 185500, year: 2026 }

// A stricter reading of what a person types than the shared toNumber, which would turn "250k" into 250 and "−5" (a Unicode minus) into +5:
// thousands separators, $ and spaces are ignored, "k" means thousand, parentheses and Unicode dashes mean negative.
export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let t = String(v ?? '').trim().toLowerCase().replace(/[−–—]/g, '-').replace(/[$,\s]/g, '')
  const paren = /^\((.*)\)$/.exec(t)
  if (paren) t = `-${paren[1]}`
  const k = /^(-?\d*\.?\d+)k/.exec(t)
  if (k) return Number(k[1]) * 1000
  return toNumber(t)
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const blank = (v) => String(v ?? '').trim() === ''
const num = parseAmount
const pick = (v, fallback) => parseAmount(blank(v) ? fallback : v)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Employee-share payroll tax saved when `c` comes out of pay through a payroll deduction: Medicare 1.45% on all of it, Social
// Security 6.2% only on the part of pay below the Social Security wage base. `wages` null means "under the base", so the full
// 7.65%. (The 0.9% Additional Medicare Tax is not modeled.)
export function ficaSaved(wages, c) {
  if (c <= 0) return 0
  if (wages == null) return (HSA.ssRate + HSA.medicareRate) * c
  const w = Math.max(0, wages)
  const d = Math.min(c, w) // payroll cannot deduct more than the pay
  const ss = HSA.ssRate * (Math.min(w, SS_WAGE_BASE) - Math.min(w - d, SS_WAGE_BASE))
  return ss + HSA.medicareRate * d
}

export function computeHsa(form) {
  const family = form.coverage === 'family'
  const age = blank(form.age) ? 0 : Math.floor(num(form.age)) // whole years: the limits and the horizon count them that way
  const spouseAge = family && !blank(form.spouseAge) ? Math.floor(num(form.spouseAge)) : 0
  const catchUps = (age >= HSA.catchUpAge ? 1 : 0) + (family && spouseAge >= HSA.catchUpAge ? 1 : 0)
  const months = clamp(Math.round(pick(form.months, 12)), 1, 12)
  // Eligible on December 1: the full-year limit (last-month rule), with a testing period through the end of the next year. It has to be
  // chosen: a person whose plan ended or whose Medicare started part way through the year is not eligible on December 1.
  const lastMonth = months < 12 && form.dec1 === 'yes'
  const prorated = months < 12 && !lastMonth
  const baseLimit = family ? HSA.family : HSA.self
  const fullLimit = baseLimit + catchUps * HSA.catchUp
  const limit = prorated ? (fullLimit * months) / 12 : fullLimit
  const catchAmount = catchUps * HSA.catchUp * (prorated ? months / 12 : 1)

  const medicare = form.medicare === 'yes'
  const noPlan = form.plan === 'no'
  const eligible = !medicare && !noPlan

  const payroll = form.funding !== 'return' // through an employer payroll deduction; otherwise deducted on the tax return
  const employer = Math.max(0, num(form.employer))
  const employerCounted = eligible ? Math.min(employer, limit) : 0
  const employerExcess = eligible ? Math.max(0, employer - limit) : 0
  const room = eligible ? Math.max(0, limit - employer) : 0
  const asked = blank(form.amount) ? room : Math.max(0, num(form.amount))
  const contribution = Math.min(asked, room)
  const excess = eligible ? Math.max(0, asked - room) : 0

  // Tax saved on the contribution.
  const fed = clamp(pick(form.bracket, 24), 0, 50) / 100
  const st = getState(form.state || 'NH')
  const stateConforms = !HSA.nonConforming.includes(st.code)
  const stateRate = stateConforms ? st.wage / 100 : 0
  const wagesTyped = !blank(form.wages)
  const wages = wagesTyped ? Math.max(0, num(form.wages)) : 0
  const fedSaved = contribution * fed
  const stateSaved = contribution * stateRate
  const ficaNow = payroll ? ficaSaved(wagesTyped ? wages : null, contribution) : 0
  const taxSaved = fedSaved + stateSaved + ficaNow

  // Projection to retirement: level deposits at year-end (this year's amount, no limit increases, no catch-up added at 55), steady growth.
  // Deposits stop at Medicare age unless the person is already past it and not enrolled. A part-year start that is not eligible on
  // December 1 means eligibility ended during the year (a plan change or Medicare), so only this year's deposit is assumed. Growth runs
  // to the retirement age either way.
  const retireAge = clamp(Math.floor(pick(form.retireAge, DEFAULTS.retireAge)), 50, 80)
  const growth = clamp(pick(form.growth, DEFAULTS.growth), -10, 20) / 100
  const spend = Math.max(0, pick(form.spend, DEFAULTS.spend))
  const balance0 = Math.max(0, num(form.balance))
  const yearly = contribution + employerCounted
  const years = age >= 18 ? Math.max(0, Math.floor(retireAge - age)) : 0
  const stopAge = age >= HSA.medicareAge ? retireAge : Math.min(retireAge, HSA.medicareAge)
  const depositYears = Math.min(years, Math.max(0, Math.floor(stopAge - age)), prorated ? 1 : Infinity)
  let a = balance0 // pay from the account: it pays each year's medical bills
  let b = balance0 // pay from your pocket: the account is left alone
  let put = 0
  let aPaid = 0 // bills the account actually paid; once it runs dry the rest comes out of pocket
  const spendBalances = [a]
  const investBalances = [b]
  const putInSeries = [balance0]
  for (let t = 0; t < years; t++) {
    const dep = t < depositYears && eligible ? yearly : 0
    const avail = a * (1 + growth) + dep
    const paid = Math.min(spend, avail)
    a = avail - paid
    aPaid += paid
    b = b * (1 + growth) + dep
    put += dep
    spendBalances.push(a)
    investBalances.push(b)
    putInSeries.push(balance0 + put)
  }
  const bank = spend * years // qualified expenses paid out of pocket, each one a receipt that can be reimbursed tax free later
  const projection = years > 0 && eligible && (yearly > 0 || balance0 > 0)
    ? {
        age, years, retireAge, stopAge, depositYears, growth, spend, balance0, yearly,
        endsThisYear: prorated, // true when only this year's deposit is assumed
        spendBalance: a,
        investBalance: b,
        putIn: balance0 + put,
        growthEarned: b - balance0 - put,
        extra: b - a, // what leaving the account alone adds to the balance
        bank,
        aPaid, // bills paid from the account when it pays them as they come (at most `bank`)
        aOut: Math.max(0, bank - aPaid), // bills the person still pays out of pocket under that option (zero unless the account runs dry)
        gain: b - a - aPaid, // of `extra`, what is growth rather than the person's own money coming back
        reimbursable: Math.min(bank, b), // receipts the left-alone account could repay tax free at retirement
        taxSavedOverTime: taxSaved * depositYears,
        spendBalances,
        investBalances,
        putInSeries,
      }
    : null

  return {
    family, age, spouseAge, catchUps, catchAmount, months, lastMonth, prorated, baseLimit, fullLimit, limit, eligible, medicare, noPlan,
    payroll, employer, employerCounted, employerExcess, room, asked, contribution, excess, fed, stateRate, stateConforms,
    stateName: st.name, stateCode: st.code, wagesTyped, wages, fedSaved, stateSaved, ficaSaved: ficaNow, taxSaved, retireAge, growth,
    spend, balance0, years, depositYears, projection,
  }
}

// The payroll-tax line of the math trace, worded for whichever case applies.
export function ficaExplain(r) {
  if (!r.payroll) return 'deducted on the return, so no payroll-tax saving'
  const c = r.contribution
  if (c <= 0) return 'no contribution from payroll, so nothing is saved'
  if (!r.wagesTyped) return `${money(c, 2)} × 7.65% (pay assumed to be under the ${money(SS_WAGE_BASE)} Social Security wage base)`
  const d = Math.min(c, r.wages)
  if (d <= 0) return 'pay is $0, so there is nothing to deduct through payroll'
  const note = d < c ? ' (payroll can only deduct the pay itself)' : ''
  const ssDollars = (r.ficaSaved - HSA.medicareRate * d) / HSA.ssRate
  if (ssDollars < 0.005) return `${money(d, 2)} × 1.45% Medicare (pay of ${money(r.wages)} is above the ${money(SS_WAGE_BASE)} Social Security wage base, so no Social Security saving)${note}`
  return `${money(d, 2)} × 1.45% Medicare + ${money(ssDollars, 2)} × 6.2% Social Security (only the part of pay below the ${money(SS_WAGE_BASE)} wage base)${note}`
}

const usd = (v) => money(v)

// What the person should know straight away, in order of importance. level: block (cannot contribute), warn (a number was changed),
// info (worth knowing). print: false keeps an info line off the printed report. An ineligible result carries only the reasons.
export function hsaFlags(r) {
  const out = []
  const partYearNote = `you can still contribute for the months before the change, until April 15, ${TAX_YEAR + 1}: run the estimate for those months.`
  if (r.medicare) out.push({ id: 'medicare', level: 'block', text: `Not eligible: once enrolled in any part of Medicare you cannot contribute to an HSA. The balance already in the account stays yours and can still pay medical costs tax free.${r.family ? ' If only one spouse is on Medicare, the other can still contribute up to the family limit: run the estimate for the spouse who is not enrolled.' : ''} If Medicare started this year, ${partYearNote}` })
  if (r.noPlan) out.push({ id: 'plan', level: 'block', text: `Not eligible: an HSA needs a qualifying high-deductible health plan (${TAX_YEAR}: deductible of at least ${usd(HSA.minDeductible.self)} self-only or ${usd(HSA.minDeductible.family)} family, out-of-pocket maximum no more than ${usd(HSA.maxOutOfPocket.self)} or ${usd(HSA.maxOutOfPocket.family)}), or an exchange bronze or catastrophic plan. Other coverage, such as a general-purpose health FSA (including a spouse’s), also disqualifies. If your plan changed this year, ${partYearNote}` })
  if (r.age < 18) out.push({ id: 'age', level: 'info', text: 'Enter an age of 18 or older to include the catch-up (age 55 and over) and to see the projection.' })
  if (!r.eligible) return out

  if (r.excess >= 0.5) out.push({ id: 'excess', level: 'warn', text: `The amount entered is ${usd(r.excess)} over this year’s room. An excess contribution owes a 6% excise tax every year it stays in the account; withdrawing it with its earnings by the return due date (including extensions) avoids that. The result uses the maximum.` })
  if (r.employerExcess >= 0.5) out.push({ id: 'employer-excess', level: 'warn', text: `The employer’s ${usd(r.employer)} is ${usd(r.employerExcess)} over the ${TAX_YEAR} limit of ${usd(r.limit)}. Employer money above the limit is taxable to you and owes the 6% excise tax each year it stays in the account. The result counts only the limit.` })
  // Blocks first, then warnings, then the information lines.
  const rank = { block: 0, warn: 1, info: 2 }
  const lead = out.sort((x, y) => rank[x.level] - rank[y.level])
  const info = []
  if (r.lastMonth) info.push({ id: 'lastmonth', level: 'info', text: `Eligible on December 1, so the full-year limit applies (the last-month rule). Stay eligible through the end of ${TAX_YEAR + 1}, or the extra amount becomes taxable income plus a 10% additional tax${r.age >= HSA.medicareAge - 2 ? ' (enrolling in Medicare counts as losing eligibility)' : ''}.` })
  if (r.prorated) info.push({ id: 'prorated', level: 'info', text: `Not eligible on December 1, so the limit is ${r.months}/12 of the annual amount, and no deposits are assumed after this year. If the plan is still in force on December 1, the full-year limit applies instead.` })
  if (!r.stateConforms) info.push({ id: 'state', level: 'info', text: `${r.stateName} does not follow the federal HSA deduction, so there is no state saving, and it ${r.stateCode === 'CA' ? 'taxes' : 'may tax'} the earnings each year; the projection does not subtract that.` })
  if (r.family && r.catchUps > 0) info.push({ id: 'catchup', level: 'info', print: false, text: 'Each spouse’s $1,000 catch-up has to go into that spouse’s own HSA, and counts only if that spouse is also eligible (not on Medicare); the family amount can be split any way between the spouses.' })
  if (r.age >= HSA.medicareAge - 1) info.push({ id: 'medicare-soon', level: 'info', text: 'Medicare ends HSA contributions, and Part A can reach back six months from when you apply for Medicare or Social Security (never before the month you turn 65): stop six months before you apply, or the month before you turn 65 if that is later, to avoid an excess.' })
  info.push({ id: 'deadline', level: 'info', text: `${TAX_YEAR} contributions can be made until April 15, ${TAX_YEAR + 1} (no extension), designated for ${TAX_YEAR}.${r.payroll ? ' A payroll deduction only reaches paychecks not yet paid; a deposit on your own by then saves income tax but not payroll tax.' : ''}` })
  info.push({ id: 'next-year', level: 'info', print: false, text: `For planning ${HSA.next.year}: the limits are ${usd(HSA.next.self)} self-only and ${usd(HSA.next.family)} family, and the catch-up stays ${usd(HSA.catchUp)}.` })
  const p = r.projection
  if (p && !r.prorated && p.depositYears < p.years) info.push({ id: 'stop', level: 'info', print: false, text: `Deposits stop at ${HSA.medicareAge} in this projection, when most people enroll in Medicare and lose eligibility; the balance keeps growing to ${p.retireAge}.` })
  return [...lead, ...info]
}
