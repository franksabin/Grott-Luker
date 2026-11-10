// When the Roth planner's answer is likely to be significantly off, because of something it does not model.
// Each caution is tied to one known limitation and fires only when that limitation is likely to matter for the case in front of the user.
//
//   living-costs    The planner does not model spending: it assumes the household's income covers living costs. To see whether that matters, the
//                   plan is run again with a reference level of living costs; any gap the income leaves is paid out of the taxable account (and
//                   past that, financed at the portfolio's return). The caution fires only when that moves the benefit to the client alone by a
//                   lot, and it says what the benefit would be. The effect grows with spending, so a quiet result is a result at the reference
//                   level only.
//   early-withheld  Tax withheld from a conversion before 59½ is itself an early distribution with a 10% additional tax, which is not modeled.
//                   It fires only when that penalty, grown to the end of the plan, is as large as the bar below.
//
// Pure functions of the engine result and inputs, so they can be tested without the page.
import { computeMultiYear } from './multiYear.js'

// Living costs used for the sensitivity run, in today's dollars a year (a modest standard of living; the client's own may differ).
export const REFERENCE_LIVING = { single: 50000, married: 75000 }
// "Significantly off": the effect is at least this share of the benefit shown AND at least this share of the client's after-tax wealth if
// nothing is converted (so a small benefit does not trip it over a small dollar change).
export const SENSITIVE = { share: 0.15, floor: 0.02 }

// Years as text, one span per run of consecutive years: "2026–2031 and 2040–2060".
export function yearSpans(rows) {
  const spans = []
  for (const row of rows) {
    const last = spans[spans.length - 1]
    if (last && row.t === last.t1 + 1) { last.t1 = row.t; last.y1 = row.year } else spans.push({ t0: row.t, t1: row.t, y0: row.year, y1: row.year })
  }
  const one = (s) => (s.y0 === s.y1 ? `${s.y0}` : `${s.y0}–${s.y1}`)
  return spans.length <= 1 ? spans.map(one).join('') : `${spans.slice(0, -1).map(one).join(', ')} and ${one(spans[spans.length - 1])}`
}

const lowest = (sc) => Math.min(0, ...sc.rows.map((row) => row.side))
// Two significant figures, for a figure that rests on a loan the model assumes (a rough guide only).
const rough = (v) => {
  if (!Number.isFinite(v) || v === 0) return 0
  const m = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 1)
  return Math.round(v / m) * m
}

// r: the result of computeMultiYear(inputs). fmt: { money, signed, approx } formatters (approx rounds, for figures that are estimates).
// opts.share / opts.floor override SENSITIVE (the tests use this to reach wording that real cases rarely produce).
// Returns [{ id, title, text }], most important first.
export function resultCautions(r, inputs, fmt, opts = {}) {
  const out = []
  if (!r || !r.plan || !r.plan.rows || !(r.plan.totalConverted > 0)) return out
  const married = String(inputs.filing).toLowerCase().startsWith('m')
  const g = inputs.index ? 1 + (Number(inputs.infl) || 0) : 1
  const { share, floor } = { ...SENSITIVE, ...opts }
  const bar = Math.max(share * Math.abs(r.deltaOwn), floor * Math.max(1, r.none.endOwn))

  // Living costs: run the same plan with them, holding the client's own rate where it was.
  const living = married ? REFERENCE_LIVING.married : REFERENCE_LIVING.single
  const s = computeMultiYear({ ...inputs, living, ownRate: r.ownRate })
  const draws = s.plan.rows.filter((row) => row.livingFromSavings > 0.5)
  if (draws.length && Math.abs(s.deltaOwn - r.deltaOwn) >= bar) {
    // The gap in today's dollars, to compare with the spending quoted, which is in today's dollars.
    const avg = draws.reduce((a, row) => a + row.livingFromSavings / Math.pow(g, row.t), 0) / draws.length
    // Past the taxable account the model finances the gap at the portfolio's return, so the figure is only a rough guide.
    const financed = lowest(s.plan) < Math.min(lowest(r.plan), 0) - 0.5 || lowest(s.none) < Math.min(lowest(r.none), 0) - 0.5
    out.push({
      id: 'living-costs',
      title: 'Living costs are not modeled',
      text: `The figure above assumes the household’s income covers its living costs. If it spends ${fmt.money(living)} a year (today’s dollars), income other than RMDs falls short by about ${fmt.money(avg)} a year (today’s dollars) in ${yearSpans(draws)}, and savings would have to cover the gap${financed ? ', which is more than the taxable account holds, so the rest is assumed to come from other savings at the portfolio’s return' : ''}. On that assumption the benefit to the client alone would be ${financed ? 'roughly' : 'about'} ${financed ? fmt.signed(rough(s.deltaOwn)) : fmt.approx(s.deltaOwn)}, not ${fmt.signed(r.deltaOwn)}. The effect is larger at higher spending and smaller at lower.`,
    })
  }

  // Tax withheld from a conversion before age 60: the 10% additional tax applies to the withheld part. Size it where the benefit is measured,
  // at the end of the plan: the penalty paid in year t grows for the years left at the portfolio's return.
  const early = r.plan.rows.filter((row) => row.withheld > 0.5 && row.age < 60)
  if (early.length) {
    const total = early.reduce((a, row) => a + row.withheld, 0)
    const ret = Number(inputs.ret) || 0
    const grown = early.reduce((a, row) => a + row.withheld * 0.1 * Math.pow(1 + ret, r.years - row.t), 0)
    if (grown >= bar) {
      const endAge = r.plan.rows[r.plan.rows.length - 1].age
      out.push({
        id: 'early-withheld',
        title: 'Tax withheld before age 59½',
        text: `In ${yearSpans(early)} ${fmt.money(total)} of conversion tax is withheld from the conversions, before age 59½. That withheld part is an early distribution with a 10% additional tax (about ${fmt.money(total * 0.1)} when paid, about ${fmt.approx(grown).replace(/^[+−]/, '')} by age ${endAge} with growth), which is not modeled, so the benefit shown is overstated by about that much. Paying the tax from outside cash avoids it.`,
      })
    }
  }
  return out
}
