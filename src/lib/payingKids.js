// Paying Your Kids: the family payroll arithmetic for one tax year, plus the Roth projection per child.
// Pure functions; the page renders the result and scripts/test-payingkids.mjs checks it.
import { ordinaryTax, STANDARD_DEDUCTION } from './tax.js'
import { toNumber } from './format.js'
import { getState } from './states.js'
import { projectRoth } from './kidsRoth.js'

export const IRA_LIMIT = 7500 // 2026 IRA contribution limit (under 50)
export const FICA = 0.153 // employee 7.65% + employer 7.65%
export const FUTA_RATE = 0.006
export const FUTA_BASE = 7000
export const SE_FACTOR = 0.9235
// Self-employment tax the owner saves on the margin: the full 15.3% below the Social Security wage base,
// but only Medicare (2.9%) plus Additional Medicare (0.9%) once earnings are above it.
export const SE_RATE_BELOW = 0.153
export const SE_RATE_ABOVE = 0.038
export const QBI_RATE = 0.2 // §199A deduction rate

// The Roth illustration's defaults: the CPA changes these on screen.
export const ROTH_DEFAULTS = { stopAge: '22', retireAge: '65', growth: '7', incomeRate: '4', inflation: '3' }
// A blank field means "use the default", so a typed 0 stays a real 0 (0% growth).
const pick = (v, fallback) => (String(v ?? '').trim() === '' ? fallback : toNumber(v))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function computeKids(form) {
  const entity = form.entity
  const ownerFed = toNumber(form.bracket) / 100
  const st = getState(form.state)
  const stateRate = st.wage / 100
  const planMinAge = toNumber(form.planMinAge) || 21
  const std = STANDARD_DEDUCTION.single
  // The owner's net profit decides which self-employment rate applies at the margin; it is a choice, not inferred from the bracket.
  const seAbove = form.seBase === 'above'
  const seRate = seAbove ? SE_RATE_ABOVE : SE_RATE_BELOW
  // QBI (IRC 199A): shifting wages out of a pass-through also shrinks the owner's qualified business income, so the
  // deduction (20% of it) shrinks too. A C-corporation has no QBI. "No" is for a specified service business above the
  // threshold, a loss year, or any owner who gets no deduction; unset counts as yes.
  const qbiShare = entity !== 'ccorp' && form.qbi !== 'no' ? QBI_RATE : 0
  // Clamped so a stray keystroke cannot produce an absurd or page-breaking projection.
  const rothPlan = {
    stopAge: clamp(pick(form.stopAge, 22), 0, 120),
    retireAge: clamp(pick(form.retireAge, 65), 1, 120),
    growth: clamp(pick(form.growth, 7), -20, 30) / 100,
    incomeRate: clamp(pick(form.incomeRate, 4), 0, 15) / 100,
    inflation: clamp(pick(form.inflation, 3), 0, 15) / 100,
  }

  const kids = form.kids
    .map((k) => {
      const age = toNumber(k.age)
      const wages = Math.max(0, toNumber(k.hours) * toNumber(k.rate))
      if (!wages || !age) return null
      // Payroll taxes on the child's wages.
      const ficaExempt = entity === 'soleprop' && age < 18
      const futaExempt = entity === 'soleprop' && age < 21
      const fica = ficaExempt ? 0 : wages * FICA
      const futa = futaExempt ? 0 : Math.min(wages, FUTA_BASE) * FUTA_RATE
      // Child's own income tax: single filer, standard deduction, ordinary brackets.
      const childTaxable = Math.max(0, wages - std)
      const childFed = ordinaryTax(childTaxable, 'single')
      const childState = childTaxable * stateRate
      // Sole proprietor also saves self-employment tax on the shifted income, at the rate that applies at the margin.
      const ownerSe = entity === 'soleprop' ? wages * SE_FACTOR * seRate : 0
      // Owner's federal saving: the wages come off taxable income, less the deduction for half of the SE tax that shrinks
      // with it, and less 20% of what is left when the QBI deduction shrinks. The state saving is the flat rate on the wages.
      const halfSe = ownerSe / 2
      const ownerFedTax = ownerFed * (wages - halfSe) * (1 - qbiShare)
      const ownerIncomeTax = ownerFedTax + wages * stateRate
      const roth = Math.min(wages, IRA_LIMIT)
      const proj = projectRoth({ age, annual: roth, ...rothPlan })
      const planEligible = age >= planMinAge
      const net = ownerIncomeTax + ownerSe - childFed - childState - fica - futa
      return { ...k, age, wages, ficaExempt, futaExempt, fica, futa, childTaxable, childFed, childState, ownerIncomeTax, ownerFedTax, halfSe, ownerSe, roth, proj, planEligible, net }
    })
    .filter(Boolean)

  const sum = (f) => kids.reduce((s, k) => s + f(k), 0)
  return {
    entity, ownerFed, st, stateRate, planMinAge, std, kids, seAbove, seRate, qbiShare, rothPlan,
    wages: sum((k) => k.wages),
    // Each child reaches retirement on a different date, so only the today's-dollar income adds up honestly.
    rothIncomeReal: sum((k) => (k.proj ? k.proj.incomeReal : 0)),
    ownerIncomeTax: sum((k) => k.ownerIncomeTax),
    ownerSe: sum((k) => k.ownerSe),
    childFed: sum((k) => k.childFed),
    childState: sum((k) => k.childState),
    fica: sum((k) => k.fica),
    futa: sum((k) => k.futa),
    roth: sum((k) => k.roth),
    net: sum((k) => k.net),
    eligibleKids: kids.filter((k) => k.planEligible).length,
    taxIfOwnerKeeps: sum((k) => k.ownerIncomeTax + k.ownerSe),
    taxIfKidsPaid: sum((k) => k.childFed + k.childState + k.fica + k.futa),
  }
}
