// Retirement plan comparison engine: what an owner can put into each plan, what it costs to cover
// employees and run the plan, and the net result for the owner. Pure functions; the page renders
// the result and scripts/test-plancost.mjs checks it.
//
// Rules verified against IRS Notice 2025-67, IRC 408(k), 408(p), 401(k)(12), 404(a)(3), 416 and Pub. 560.
// Deliberately not modeled: cross-tested profit sharing, SECURE 2.0 credits, vesting, QBI effects, state rules.
import { selfEmploymentTax } from './tax.js'
import { toNumber } from './format.js'
import { getState } from './states.js'

// 2026 limits per IRS Notice 2025-67 (indexed annually — verify each January).
export const LIMITS = {
  deferral401k: 24500,
  catchUp401k: 8000,
  superCatchUp401k: 11250, // ages 60–63
  total415c: 72000,
  compCap: 360000, // §401(a)(17)
  simpleDeferral: 17000,
  simpleCatchUp: 4000,
  // SECURE 2.0 §117: an employer with 25 or fewer employees paid at least $5,000 (owner included) gets the
  // 110% SIMPLE deferral limit automatically. The age-50 catch-up for those plans is fixed at 110% of the
  // 2024 amount, so for 2026 it is $3,850 — lower than the $4,000 standard catch-up (Notice 2025-67).
  simpleDeferralSmall: 18100,
  simpleCatchUpSmall: 3850,
  simpleSuperCatchUp: 5250, // ages 60–63 (both tiers)
  simpleSmallEmployerMax: 25,
  simpleMatch: 0.03,
  simpleNec: 0.02,
  simpleMaxEmployees: 100, // employees paid at least simpleMinPay in the prior year, owner included
  simpleMinPay: 5000,
  sepRate: 0.25,
  hce: 160000, // highly compensated employee threshold for 2026 plan years
  rothCatchWage: 150000, // prior-year FICA wages above this make 401(k) catch-ups Roth
  shNec: 0.03, // safe-harbor non-elective contribution
  deductionCap: 0.25, // §404(a)(3): employer contributions deductible up to 25% of covered pay (deferrals excluded)
}

// Annual plan fees: a base fee plus a per-participant fee (the owner counts as a participant). Employer-paid
// amounts only. SEP and SIMPLE are $0 at the big custodians (Schwab, Fidelity, Ascensus; participant-paid fees run
// $0–$40). The 401(k) figure is a typical list price for bundled recordkeeping, light TPA work and Form 5500
// (low about $1,200 + $30 a participant, high about $2,900 + $92). Estimates only — the page lets the CPA
// override each plan's total.
export const FEES = {
  sep: { base: 0, per: 0 },
  solo: { base: 0, per: 0 },
  simple: { base: 0, per: 0 },
  sh401k: { base: 1900, per: 84 },
}

const num = (v) => toNumber(v)
const pick = (v, fallback) => (String(v ?? '').trim() === '' ? fallback : toNumber(v))
// For the self-employed a plan rate r applies to compensation net of the contribution itself, so the
// owner's effective rate on adjusted net earnings is r / (1 + r); 25% becomes 20%.
const ownerRate = (entity, r) => (entity === 'se' ? r / (1 + r) : r)

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

// Both ways of entering staff produce the same list: [{ wage, covered }].
export function staffOf(form) {
  let list
  if (form.staffMode === 'each') {
    list = (form.emps || [])
      .map((e) => ({ wage: Math.max(0, num(e.wage)), covered: e.covered !== false }))
      .filter((e) => e.wage > 0)
  } else {
    const n = Math.max(0, Math.round(num(form.empCount)))
    const wage = Math.max(0, num(form.empWage))
    const coveredN = String(form.empCovered ?? '').trim() === '' ? n : Math.min(n, Math.max(0, Math.round(num(form.empCovered))))
    list = Array.from({ length: n }, (_, i) => ({ wage, covered: i < coveredN }))
  }
  const covered = list.filter((e) => e.covered)
  // An employee whose wage has not been entered yet counts toward the SIMPLE size tests rather than hiding.
  const countsAtMin = (e) => e.wage >= LIMITS.simpleMinPay || e.wage === 0
  return {
    mode: form.staffMode === 'each' ? 'each' : 'avg',
    list,
    covered,
    headcount: list.length,
    coveredCount: covered.length,
    payroll: covered.reduce((s, e) => s + Math.min(e.wage, LIMITS.compCap), 0), // covered wages up to the compensation cap
    payrollRaw: covered.reduce((s, e) => s + e.wage, 0),
    paidMin: list.filter(countsAtMin).length,
    highlyPaid: covered.filter((e) => e.wage >= LIMITS.hce).length,
  }
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

export function computePlans(form) {
  const entity = form.entity === 'scorp' ? 'scorp' : 'se'
  const earnings = Math.max(0, num(form.earnings))
  const age = num(form.age)
  const staff = staffOf(form)
  const hasStaff = staff.coveredCount > 0

  // Owner's marginal rate: federal bracket plus a flat state rate.
  const fed = pick(form.bracket, 32) / 100
  const stateRate = getState(form.state || 'NH').wage / 100
  const t = { fed, state: stateRate, rate: fed + stateRate }

  const sepPlanRate = Math.min(LIMITS.sepRate, Math.max(0, pick(form.sepRate, 25) / 100))
  const maxRate = ownerRate(entity, LIMITS.sepRate) // the 401(k) employer piece is not tied to the SEP rate input
  const catch401 = age >= 60 && age <= 63 ? LIMITS.superCatchUp401k : age >= 50 ? LIMITS.catchUp401k : 0

  // The owner's compensation. Staff contributions and plan fees are business expenses, so for a Schedule C owner
  // they come off the profit before the owner's own contribution is figured (Pub. 560); an S-corp owner's W-2 pay
  // is fixed. `deduct` is what the chosen plan costs the business.
  const baseFor = (deduct) => {
    const e = Math.max(0, earnings - deduct)
    const seTax = entity === 'se' ? selfEmploymentTax(e) : 0
    const adjNet = entity === 'se' ? Math.max(0, e - seTax / 2) : earnings
    return {
      e,
      seTax,
      adjNet,
      comp: Math.min(adjNet, LIMITS.compCap),
      // SIMPLE compensation: net earnings from self-employment (92.35% of profit, before half of SE tax) or W-2 pay.
      simpleComp: entity === 'se' ? 0.9235 * e : earnings,
    }
  }
  const pre = baseFor(0)

  // SIMPLE limits: the 110% figures apply automatically at 25 or fewer employees paid $5,000+ (owner counted).
  const simpleCount = staff.paidMin + 1
  const simpleSmall = simpleCount <= LIMITS.simpleSmallEmployerMax
  const simpleLimit = simpleSmall ? LIMITS.simpleDeferralSmall : LIMITS.simpleDeferral
  const simpleCatchBase = simpleSmall ? LIMITS.simpleCatchUpSmall : LIMITS.simpleCatchUp
  const catchSimple = age >= 60 && age <= 63 ? LIMITS.simpleSuperCatchUp : age >= 50 ? simpleCatchBase : 0

  // Fees: default total for this many participants, overridable per plan.
  const participants = staff.coveredCount + 1
  const feeDefaults = Object.fromEntries(Object.entries(FEES).map(([k, f]) => [k, f.base + f.per * participants]))
  const feeKeys = { sep: 'feeSep', solo: 'feeSolo', simple: 'feeSimple', sh401k: 'feeSh' }
  const feeFor = (id) => Math.max(0, pick(form[feeKeys[id]], feeDefaults[id]))

  // Share of covered staff who defer enough to earn the full SIMPLE match. 100% is the most it can cost.
  const participation = Math.min(1, Math.max(0, pick(form.participation, 100) / 100))

  // Owner-side maximums for one plan, from that plan's compensation base.
  const sepOwner = (b) => (entity === 'se'
    ? Math.min(b.adjNet * (sepPlanRate / (1 + sepPlanRate)), LIMITS.compCap * sepPlanRate, LIMITS.total415c)
    : Math.min(sepPlanRate * b.comp, LIMITS.total415c))
  const k401Owner = (b) => {
    const employerMax = b.comp * maxRate
    const deferral = Math.min(b.comp, LIMITS.deferral401k + catch401)
    const employer401 = Math.min(employerMax, Math.max(0, LIMITS.total415c - Math.min(b.comp, LIMITS.deferral401k)))
    const employerUncapped = Math.min(employer401, Math.max(0, LIMITS.total415c + catch401 - deferral))
    const employer = Math.min(employerUncapped, Math.max(0, b.comp - deferral))
    return { employerMax, deferral, employer, compCapped: employer < employerUncapped }
  }

  // Tax saved by deducting `d` of staff contributions and fees. Income tax at the owner's rate; for a Schedule C owner
  // the lower profit also cuts self-employment tax, and the deduction for half of that tax shrinks with it.
  // An S-corp owner's wages, and so FICA, do not change.
  const taxSavedBy = (d) => {
    if (entity !== 'se') return t.rate * d
    const seSaved = selfEmploymentTax(earnings) - selfEmploymentTax(Math.max(0, earnings - d))
    return seSaved + t.rate * (d - seSaved / 2)
  }

  // Everything that depends on staff, fees and tax; `p` carries id/label/available/employee/employer/staffCost.
  // An S-corp owner's 401(k) catch-up is Roth when prior-year W-2 pay is over the threshold, so it earns no deduction.
  const finish = (p, rothCatch = 0) => {
    p.total = p.employee + p.employer
    p.fees = feeFor(p.id)
    p.rothCatch = rothCatch
    p.taxDeferred = (p.total - rothCatch) * t.rate
    p.deductible = p.staffCost + p.fees
    p.afterTaxCost = p.deductible - taxSavedBy(p.deductible)
    p.net = p.taxDeferred - p.afterTaxCost
    p.perThousand = p.total > 0 ? (p.afterTaxCost / p.total) * 1000 : 0
    p.staffRate = staff.payroll > 0 ? p.staffCost / staff.payroll : 0
    return p
  }
  const rothCatchOf = (deferral) => {
    if (entity !== 'scorp' || earnings <= LIMITS.rothCatchWage || !catch401) return 0
    return Math.min(catch401, Math.max(0, deferral - Math.min(LIMITS.deferral401k, deferral)))
  }

  // SEP: the same percentage of pay for every eligible employee as for the owner.
  const sepStaff = sepPlanRate * staff.payroll
  const sepBase = baseFor(sepStaff + feeFor('sep'))
  const sep = finish({
    id: 'sep', label: 'SEP IRA', available: true,
    employer: sepOwner(sepBase), employee: 0, staffCost: sepStaff, base: sepBase,
  })

  // Solo 401(k) — employer piece limited by the §415(c) dollar ceiling (catch-up sits outside it)
  // and by the §415(c)(1)(B) 100%-of-compensation ceiling on all additions combined.
  const soloBase = baseFor(feeFor('solo'))
  const soloAmt = k401Owner(soloBase)
  const solo = finish({
    id: 'solo', label: 'Solo 401(k)', available: !hasStaff,
    reason: hasStaff ? `Not available: a Solo 401(k) is only for an owner (and spouse) with no covered employees, and ${staff.coveredCount} would have to be covered.` : undefined,
    employee: soloAmt.deferral, employer: soloAmt.employer, compCapped: soloAmt.compCapped, staffCost: 0, base: soloBase,
  }, rothCatchOf(soloAmt.deferral))

  // SIMPLE IRA — employer either matches up to 3% of pay for staff who defer, or gives 2% to every
  // eligible employee. The owner is a participant like anyone else; the 3% match cannot exceed the owner's deferral.
  const simpleVariant = (option) => {
    const staffCost = option === 'nec' ? LIMITS.simpleNec * staff.payroll : participation * LIMITS.simpleMatch * staff.payrollRaw
    const base = baseFor(staffCost + feeFor('simple'))
    const employee = Math.min(base.simpleComp, simpleLimit + catchSimple)
    const employer = option === 'nec'
      ? LIMITS.simpleNec * Math.min(base.simpleComp, LIMITS.compCap)
      : Math.min(base.simpleComp * LIMITS.simpleMatch, employee)
    return finish({ id: 'simple', label: 'SIMPLE IRA', option, employee, employer, staffCost, base })
  }
  const match = simpleVariant('match')
  const nec = simpleVariant('nec')
  const simpleOk = simpleCount <= LIMITS.simpleMaxEmployees
  // Without staff only the match exists; with staff the owner takes whichever leaves more after cost.
  const simpleChosen = hasStaff && nec.net > match.net ? nec : match
  const simple = {
    ...simpleChosen,
    available: simpleOk,
    reason: simpleOk ? undefined : `Not available: a SIMPLE IRA is limited to employers with ${LIMITS.simpleMaxEmployees} or fewer employees paid at least ${LIMITS.simpleMinPay.toLocaleString('en-US')}, owner included.`,
    variants: { match, nec },
  }

  // 401(k) with staff, safe harbor: the 3% non-elective goes to every eligible employee, so the owner may defer the
  // full limit, no ADP test is needed, and the plan is exempt from top-heavy rules. §404(a)(3): the employer's
  // deductible contributions for the owner and staff together cannot exceed 25% of their pay.
  const shStaff = LIMITS.shNec * staff.payroll
  const shBase = baseFor(shStaff + feeFor('sh401k'))
  const shAmt = k401Owner(shBase)
  const shRate = ownerRate(entity, LIMITS.shNec)
  const deductionRoom = Math.max(0, LIMITS.deductionCap * (shBase.comp + staff.payroll) - shStaff)
  const sh401k = finish({
    id: 'sh401k', label: '401(k), safe harbor', available: true,
    employee: shAmt.deferral,
    employer: Math.min(shBase.comp * shRate, Math.max(0, shBase.comp - shAmt.deferral), deductionRoom),
    staffCost: shStaff, base: shBase,
  }, rothCatchOf(shAmt.deferral))

  // Display order: with covered staff the safe-harbor 401(k) replaces the Solo 401(k) as the 401(k) route.
  const plans = hasStaff ? [sep, simple, sh401k, solo] : [sep, solo, simple]
  const usable = plans.filter((p) => p.available)
  const pickMax = (list, key) => list.reduce((a, b) => (b[key] > a[key] ? b : a), list[0])
  const bestByTotal = pickMax(usable, 'total')
  const best = hasStaff ? pickMax(usable, 'net') : bestByTotal
  // A tie only means something once there is compensation to contribute from.
  const tie = pre.comp > 0 && !hasStaff && sep.total === solo.total

  const warnings = []
  if (hasStaff) {
    warnings.push({ id: 'solo', level: 'block', text: solo.reason })
  } else if (staff.headcount > 0) {
    warnings.push({ id: 'excluded', level: 'info', text: 'All of the employees are marked as not covered, so a Solo 401(k) is still shown as available. Confirm with the plan document that each one can be excluded (under 21 or under 1,000 hours a year, for example).' })
  }
  if (!simpleOk) warnings.push({ id: 'simple', level: 'block', text: simple.reason })
  if (hasStaff && staff.payroll === 0) warnings.push({ id: 'wage', level: 'warn', text: 'Enter the employees’ wages: without them the cost of covering staff shows as $0.' })
  if (hasStaff) warnings.push({ id: 'sep', level: 'warn', text: `A SEP must give every eligible employee the same percentage of pay as the owner (${+(sepPlanRate * 100).toFixed(1)}%): that is the cost shown.` })
  if (simpleOk && simpleCount > LIMITS.simpleSmallEmployerMax) warnings.push({ id: 'simple26', level: 'info', text: `With ${simpleCount} employees paid $5,000 or more (owner included) the SIMPLE IRA uses the standard limits. A written election to give a 4% match or 3% non-elective contribution would unlock the higher ${LIMITS.simpleDeferralSmall.toLocaleString('en-US')} limit.` })
  if (staff.highlyPaid > 0) warnings.push({ id: 'hce', level: 'info', text: `${staff.highlyPaid} covered employee${staff.highlyPaid > 1 ? 's earn' : ' earns'} at least ${LIMITS.hce.toLocaleString('en-US')} and would be highly compensated like the owner; the testing rules for them are not modeled.` })
  if (hasStaff && rothCatchOf(soloAmt.deferral) > 0) warnings.push({ id: 'roth', level: 'info', text: `An S-corp owner paid over ${LIMITS.rothCatchWage.toLocaleString('en-US')} must make 401(k) catch-up contributions as Roth in 2026, so the catch-up earns no deduction and is left out of the tax deferred.` })

  return {
    entity, earnings, age, seTax: pre.seTax, adjNet: pre.adjNet, comp: pre.comp,
    employerRate: ownerRate(entity, sepPlanRate), employerMax: pre.comp * ownerRate(entity, sepPlanRate), sepPlanRate, maxRate, catch401, catchSimple,
    simpleSmall, simpleCount, simpleLimit, simpleCatchBase, participation,
    staff, hasStaff, t, participants, feeDefaults,
    sep, solo, simple, sh401k, plans, usable, best, bestByTotal, tie,
    soloBlocked: hasStaff && solo.total > best.total,
    warnings,
  }
}
