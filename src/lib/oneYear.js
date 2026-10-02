// One-year Roth conversion estimator: the fourth-quarter question "how much should this client
// convert before December 31, and what will it cost?" It prices conversions against the client's
// actual projected income for the year. All tax arithmetic goes through taxYear() in multiYear.js,
// the same function the multi-year planner uses, so the two views cannot disagree.
import {
  TAX_YEAR,
  STANDARD_DEDUCTION,
  ADDITIONAL_STANDARD,
  SENIOR_DEDUCTION,
  normalizeFiling,
  irmaaSurcharge,
  irmaaHeadroom,
} from './tax.js'
import { bracketsFor, taxYear, fillConversion, topOf } from './multiYear.js'

export const BRACKET_PCTS = [10, 12, 22, 24, 32, 35]
export const LADDER_STEP = 10000 // the "next $10,000" probe and the base grid
const NICE = [10000, 25000, 50000, 75000, 100000, 150000, 200000, 250000, 300000, 400000, 500000]
const MAX_ROWS = 12

const cents = (x) => Math.round(x * 100) / 100

// f: {
//   filing, age, spouseAge (blank → same as age), wages, pension, otherOrdinary (interest, rental, IRA distributions
//   and the RMD — ordinary income before any conversion), ss (gross Social Security), ltcg (long-term gains and
//   qualified dividends), itemized (0 → standard deduction), stateRate (decimal), cap (pre-tax IRA available, or null;
//   an entered 0 is a real limit), taxExempt (tax-exempt interest: counts toward Social Security taxation and IRMAA MAGI),
//   nii (net investment income for the 3.8% tax; blank/0 → the gains line), ages are ages at December 31 of the tax year,
//   target: 'b12' | 'b22' | 'b24' | 'irmaa' | 'amount', amount
// }
export function computeOneYear(f) {
  const filing = normalizeFiling(f.filing)
  const married = filing === 'married'
  const age = f.age
  const spouseAge = married ? (f.spouseAge > 0 ? f.spouseAge : age) : null
  const ages = married ? [age, spouseAge] : [age]
  const aged = ages.filter((a) => a >= 65).length // additional standard deduction (permanent)
  const seniors = TAX_YEAR <= SENIOR_DEDUCTION.lastYear ? aged : 0 // senior deduction (through 2028)
  // Premiums in TAX_YEAR + 2 are set by this year's MAGI; they apply to anyone on Medicare by then.
  const medicare = ages.filter((a) => a + 2 >= 65).length
  const cap = f.cap == null || f.cap === '' ? null : Math.max(0, Number(f.cap) || 0)
  const te = Math.max(0, f.taxExempt || 0)

  const brackets = bracketsFor(filing, 1)
  const stdBase = STANDARD_DEDUCTION[filing]
  const addStd = aged * ADDITIONAL_STANDARD[filing]
  const std = stdBase + addStd
  const ctx = {
    filing,
    brackets,
    std,
    ordinaryBefore: f.wages + f.pension + f.otherOrdinary,
    ssY: f.ss,
    seniors,
    stateRate: f.stateRate,
    idx: 1,
    ltcg: f.ltcg || 0,
    itemized: f.itemized || 0,
    taxExempt: te,
    nii: f.nii > 0 ? f.nii : f.ltcg || 0,
  }
  const base = taxYear(ctx, 0)

  // IRMAA MAGI is AGI plus tax-exempt interest.
  const irmaaAnnual = (agi) => irmaaSurcharge(agi + te, filing).annualPerPerson * medicare
  const baseIrmaa = irmaaAnnual(base.agi)

  // Cost of converting `conversion` this year, relative to converting nothing.
  const costAt = (conversion) => {
    const c = Math.max(0, conversion)
    const y = taxYear(ctx, c)
    const nextY = taxYear(ctx, c + LADDER_STEP)
    const addedFed = y.fedTax - base.fedTax
    const addedNiit = y.niit - base.niit
    const addedState = y.stateTax - base.stateTax
    const addedTax = y.tax - base.tax
    const irmaaNow = irmaaAnnual(y.agi)
    const irmaaAdded = Math.max(0, irmaaNow - baseIrmaa)
    return {
      conversion: c,
      y,
      addedFed,
      addedNiit,
      addedState,
      addedTax,
      effectiveRate: c > 0 ? addedTax / c : 0,
      nextRate: (nextY.tax - y.tax) / LADDER_STEP,
      bracket: y.ordinaryTaxable > 0.5 ? y.marginal : null,
      taxableSSPct: f.ss > 0 ? y.taxableSS / f.ss : 0,
      irmaaAnnual: irmaaNow,
      irmaaAdded,
      totalCost: addedTax + irmaaAdded,
      netIfWithheld: c - addedTax,
    }
  }

  // Sweet spots: the conversion that fills each bracket exactly, and the IRMAA line.
  const spots = []
  for (const pct of BRACKET_PCTS) {
    const top = topOf(brackets, pct)
    if (!(top > base.ordinaryTaxable + 0.5)) continue // already past this bracket
    const full = fillConversion(ctx, top)
    if (!(full > 0.5)) continue
    spots.push({ id: `b${pct}`, label: `Top of the ${pct}% bracket`, short: `Top of ${pct}%`, pct, top, conversion: cents(cap != null ? Math.min(full, cap) : full), full: cents(full), capped: cap != null && full > cap })
  }
  // The bracket the client is in now: how much room is left before the next rate.
  const current = spots.length ? spots[0] : null

  let irmaaLine = { applies: medicare > 0, atTop: false, threshold: null, limit: null, exclusive: false, room: null, stepUp: 0, baseAnnual: baseIrmaa, medicare }
  if (medicare > 0) {
    const h = irmaaHeadroom(base.agi + te, filing)
    if (h.atTop || h.threshold == null) {
      irmaaLine.atTop = true
    } else {
      // Largest conversion that keeps MAGI at or under the threshold (MAGI rises at least $1 per $1 converted).
      // h.limit is the highest MAGI that stays in the current tier (the threshold itself, or one dollar under it
      // when the surcharge steps up AT the threshold).
      const inTier = (agi) => agi + te <= h.limit
      let lo = 0
      let hi = Math.max(0, h.limit - (base.agi + te))
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2
        if (inTier(taxYear(ctx, mid).agi)) lo = mid
        else hi = mid
      }
      const stepPerPerson = irmaaSurcharge(h.exclusive ? h.threshold : h.threshold + 1, filing).annualPerPerson - irmaaSurcharge(base.agi + te, filing).annualPerPerson
      irmaaLine = { applies: true, atTop: false, threshold: h.threshold, limit: h.limit, exclusive: h.exclusive, room: cents(lo), stepUp: stepPerPerson * medicare, baseAnnual: baseIrmaa, medicare }
      const full = cents(lo)
      if (full > 0.5) spots.push({ id: 'irmaa', label: `Up to the IRMAA line (${money0(h.limit)} MAGI)`, short: 'Up to the IRMAA line', pct: null, top: h.threshold, conversion: cap != null ? Math.min(full, cap) : full, full, capped: cap != null && full > cap })
    }
  }

  // The amount to price.
  let amount = 0
  let chosenSpot = null
  if (f.target === 'amount') amount = Math.max(0, f.amount || 0)
  else {
    chosenSpot = spots.find((s) => s.id === f.target) || null
    amount = chosenSpot ? chosenSpot.conversion : 0
  }
  let capBinds = !!(chosenSpot && chosenSpot.capped)
  if (cap != null && amount > cap) { amount = cap; capBinds = true }
  const chosen = costAt(amount)

  // Ladder of amounts: the sweet spots and the chosen amount always; round amounts fill the gaps.
  const maxShown = Math.max(100000, amount, ...spots.filter((s) => s.pct != null && s.pct <= 24).map((s) => s.conversion))
  const rowsMap = new Map()
  const add = (amt, role, label) => {
    const key = Math.round(amt)
    if (!(amt > 0.5)) return
    if (cap != null && amt > cap + 0.5) return
    const cur = rowsMap.get(key)
    if (cur) { cur.roles.push(role); if (label && !cur.labels.includes(label)) cur.labels.push(label) } else rowsMap.set(key, { amount: amt, roles: [role], labels: label ? [label] : [] })
  }
  NICE.filter((n) => n <= maxShown * 1.0001).forEach((n) => add(n, 'round'))
  spots.forEach((s) => add(s.conversion, 'spot', s.short))
  if (amount > 0.5) add(amount, 'chosen', 'Your amount')
  let list = [...rowsMap.values()].sort((a, b) => a.amount - b.amount)
  // Thin the round amounts if there are too many rows, dropping the one nearest its neighbour first.
  while (list.length > MAX_ROWS) {
    let drop = -1
    let best = Infinity
    list.forEach((r, k) => {
      if (!r.roles.every((x) => x === 'round')) return
      const gap = Math.min(k > 0 ? r.amount - list[k - 1].amount : Infinity, k < list.length - 1 ? list[k + 1].amount - r.amount : Infinity)
      if (gap < best) { best = gap; drop = k }
    })
    if (drop < 0) break
    list.splice(drop, 1)
  }
  const ladder = list.map((r) => ({ ...costAt(r.amount), labels: r.labels, isChosen: r.roles.includes('chosen'), isSpot: r.roles.includes('spot') }))

  return {
    filing, married, ages, aged, seniors, medicare, cap, capBinds, std, stdBase, addStd, taxExempt: te,
    ctx, base, baseIrmaa, irmaaLine,
    spots, current,
    target: f.target, chosenSpot, amount, chosen, ladder,
  }
}

function money0(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
