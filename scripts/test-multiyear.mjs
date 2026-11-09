// The multi-year Roth planner's two views of the same plan: the client alone (no heirs) and with heirs, each also in today's dollars.
// Run with: node scripts/test-multiyear.mjs   (or npm run test:engine)
import { computeMultiYear, runScenario, ownRateOf, discountFactor, DISCOUNT_RATE, taxYear, bracketsFor } from '../src/lib/multiYear.js'
import { irmaaSurcharge, normalizeFiling, SENIOR_DEDUCTION } from '../src/lib/tax.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol
let seed = 31337
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pickOne = (a) => a[Math.floor(rnd() * a.length)]

// The accountant's sample: single, 62 in 2026, $900k pre-tax, fill the 22% bracket through 74.
const SAMPLE = { birthYear: 1964, filing: 'single', endAge: 95, retireAge: 62, wages: 0, ssAnnual: 50400, ssStartAge: 68, pension: 0, otherIncome: 4000, pretax: 900000, roth: 0, taxable: 150000, ret: 0.07, infl: 0.02, index: true, stateRate: 0, mode: 'fill', flatAmount: 75000, flatYears: 12, fillBracket: 22, fillUntilAge: 74, beneficiaryRate: 0.32 }
// Small enough to do by hand: single, 60 in 2026, two years, no growth, no income, convert 10,000 once (under the standard deduction, so no tax).
const HAND = { birthYear: 1966, filing: 'single', endAge: 61, retireAge: 60, wages: 0, ssAnnual: 0, ssStartAge: 70, pension: 0, otherIncome: 0, pretax: 100000, roth: 0, taxable: 0, ret: 0, infl: 0.02, index: false, stateRate: 0, mode: 'flat', flatAmount: 10000, flatYears: 1, fillBracket: 22, fillUntilAge: 70, beneficiaryRate: 0.32 }

// ---------- 1. Fixed figures (numbers taken from the engine as it was before; the sample's with-heirs figures moved when the cash rule changed, see section 9) ----------
{
  const s = computeMultiYear(SAMPLE)
  // The IRMAA the conversions cause once the taxable account is empty used to go uncharged. It is charged now, so the plan ends with its taxable account at −20,322.39 (that IRMAA, compounded at the 7% portfolio return) and the benefit is 1,955,101.99 − 20,322.39
  ok(near(s.plan.endSide, -20322.39, 0.02) && near(s.delta, 1934779.6, 0.02) && near(s.taxDelta, -589811.72, 0.02) && near(s.irmaaDelta, -52539.3, 0.02), 'sample: delta, lifetime tax and IRMAA deltas', [s.delta, s.taxDelta, s.irmaaDelta])
  ok(near(s.plan.familyWealth, 8751360.27, 0.02) && near(s.none.familyWealth, 6816580.66, 0.02), 'sample: family wealth, plan and do nothing')
  ok(near(s.plan.lifetimeTax, 218623.14, 0.02) && near(s.none.lifetimeTax, 808434.86, 0.02) && near(s.plan.totalConverted, 1206438.66, 0.02), 'sample: lifetime tax and total converted')
  const m = computeMultiYear({ ...SAMPLE, filing: 'married', mode: 'flat', flatAmount: 60000, flatYears: 8, birthYear: 1958, endAge: 90, ssAnnual: 60000, pretax: 1500000, roth: 100000, taxable: 300000, stateRate: 0.05, beneficiaryRate: 0.24, ret: 0.05 })
  ok(near(m.delta, 108580.68, 0.02) && near(m.plan.familyWealth, 4543073.4, 0.02) && near(m.none.familyWealth, 4434492.71, 0.02) && near(m.taxDelta, -1549.53, 0.02), 'married, flat conversions: figures unchanged')
  const n = computeMultiYear({ ...SAMPLE, mode: 'none', pretax: 400000, ret: 0.06 })
  ok(n.delta === 0 && near(n.plan.familyWealth, 2721349.16, 0.02) && n.plan.totalConverted === 0, 'no conversions: plan equals do nothing')
}

// ---------- 2. A case done by hand ----------
{
  const h = computeMultiYear(HAND)
  ok(h.years === 2 && h.plan.totalConverted === 10000 && h.plan.rows[0].tax === 0, 'hand case: two years, 10,000 converted, no tax', [h.years, h.plan.totalConverted, h.plan.rows[0].tax])
  ok(near(h.ownRate, 0.1, 1e-12) && h.ownRateDerived, 'hand case: no RMDs, so the client’s own rate is the last year’s bracket, 10%')
  ok(near(h.deltaOwn, 1000, 1e-6), 'client alone: converting 10,000 that would have cost 10% later is worth 1,000', h.deltaOwn)
  ok(near(h.delta, 3200, 1e-6), 'with heirs at 32%: worth 3,200', h.delta)
  ok(near(h.heirsAddOn, 2200, 1e-6), 'heirs add the difference, 2,200', h.heirsAddOn)
  ok(near(h.pv.deltaOwn, 1000 / 1.025 ** 2, 1e-6) && near(h.pv.delta, 3200 / 1.025 ** 2, 1e-6) && near(h.pv.heirsAddOn, 2200 / 1.025 ** 2, 1e-6), 'present values: divide by 1.025 twice', [h.pv.deltaOwn, h.pv.delta])
  ok(h.pv.taxDelta === 0 && h.pv.irmaaDelta === 0, 'no tax and no IRMAA either way: nothing to discount')
  ok(near(h.none.endOwn, 90000, 1e-6) && near(h.plan.endOwn, 90000 * 0.9 + 10000, 1e-6), 'client wealth at the end: 100,000 × (1 − 10%) do nothing; 90,000 × 90% + 10,000 Roth with the plan')
  // The client's own rate can be set
  const o = computeMultiYear({ ...HAND, ownRate: 0.2 })
  ok(near(o.deltaOwn, 2000, 1e-6) && !o.ownRateDerived && near(o.heirsAddOn, 1200, 1e-6), 'own rate 20%: client alone 2,000, heirs add 1,200', [o.deltaOwn, o.heirsAddOn])
  ok(near(computeMultiYear({ ...HAND, ownRate: 0.32 }).heirsAddOn, 0, 1e-6), 'if the heirs are taxed like the client, they add nothing')
  ok(near(computeMultiYear({ ...HAND, ownRate: 0.4 }).heirsAddOn, -800, 1e-6), 'and if the client is taxed more than the heirs, the heirs’ view is the smaller one (−800)')
  // Discount rate
  const z = computeMultiYear({ ...HAND, discount: 0 })
  ok(near(z.pv.deltaOwn, z.deltaOwn, 1e-9) && z.discount === 0, 'a 0% discount rate leaves every value as it was')
  ok(near(computeMultiYear({ ...HAND, discount: 0.05 }).pv.deltaOwn, 1000 / 1.05 ** 2, 1e-6), '5% discount rate')
}

// ---------- 3. The client's own rate, derived from the do-nothing run ----------
{
  const row = (rmd, marginal, taxable = 50000) => ({ rmd, marginal, taxable })
  ok(near(ownRateOf({ rows: [row(0, 0.12), row(10000, 0.22), row(30000, 0.24)] }, 0), (10000 * 0.22 + 30000 * 0.24) / 40000, 1e-12), 'weighted by the RMD; years without an RMD do not count')
  ok(near(ownRateOf({ rows: [row(10000, 0.22), row(10000, 0.24)] }, 0.05), 0.28, 1e-12), 'state rate is added to the federal marginal rate')
  ok(near(ownRateOf({ rows: [row(0, 0.12), row(0, 0.22)] }, 0.03), 0.25, 1e-12), 'no RMD ever: the last year’s rate')
  // An RMD year whose deductions absorb the whole RMD pays nothing, federal or state, so it counts at 0%
  ok(near(ownRateOf({ rows: [row(10000, 0.1, 0), row(30000, 0.24)] }, 0.05), (30000 * 0.29) / 40000, 1e-12), 'sheltered RMD years count at 0%, not at the lowest bracket plus state', ownRateOf({ rows: [row(10000, 0.1, 0), row(30000, 0.24)] }, 0.05))
  ok(ownRateOf({ rows: [row(10000, 0.1, 0.5)] }, 0.05) === 0 && near(ownRateOf({ rows: [row(10000, 0.1, 0.6)] }, 0.05), 0.15, 1e-12), 'a taxable income of 50 cents or less counts as sheltered (0%); above it, taxed at marginal plus state')
  ok(ownRateOf({ rows: [row(10000, 0.1, 0)] }, 0.05) === 0, 'all RMD years sheltered: 0%')
  ok(ownRateOf({ rows: [row(1, 0.37)] }, 0.5) === 0.6, 'capped at 60%')
  const sampleOwn = computeMultiYear(SAMPLE).ownRate
  ok(sampleOwn > 0.2 && sampleOwn < 0.3, 'the sample’s own rate is in the 22–24% band plus the occasional step up', sampleOwn)
  // It depends on the do-nothing run only, so the plan chosen cannot move it
  ok(near(computeMultiYear({ ...SAMPLE, fillBracket: 24 }).ownRate, sampleOwn, 1e-12) && near(computeMultiYear({ ...SAMPLE, mode: 'none' }).ownRate, sampleOwn, 1e-12), 'the derived rate does not depend on the conversion plan')
  ok(computeMultiYear({ ...SAMPLE, ownRate: NaN }).ownRateDerived && computeMultiYear({ ...SAMPLE, ownRate: null }).ownRateDerived && !computeMultiYear({ ...SAMPLE, ownRate: 0 }).ownRateDerived, 'a missing or non-numeric override means derived; 0% is a real choice')
  const ov = computeMultiYear({ ...SAMPLE, ownRate: 0.31 })
  ok(ov.ownRate === 0.31 && near(ov.ownRateAuto, sampleOwn, 1e-12) && computeMultiYear(SAMPLE).ownRateAuto === computeMultiYear(SAMPLE).ownRate, 'the derived rate is still reported when an override is entered')
  ok(computeMultiYear({ ...SAMPLE, ownRate: 0.9 }).ownRate === 0.6 && computeMultiYear({ ...SAMPLE, ownRate: -0.1 }).ownRate === 0, 'an override is clamped to 0–60%')
}

// ---------- 4. Present value ----------
{
  ok(DISCOUNT_RATE === 0.025, 'the default discount rate is 2.5%')
  ok(near(discountFactor(0.025, 34), 1 / 1.025 ** 34, 1e-15) && discountFactor(0, 10) === 1 && discountFactor(0.05, 0) === 1, 'discount factor')
  const s = computeMultiYear(SAMPLE)
  const f = 1 / 1.025 ** 34
  ok(s.years === 34 && s.discount === 0.025, 'sample: 34 years at 2.5% by default')
  ok(near(s.pv.deltaOwn, s.deltaOwn * f, 1e-6) && near(s.pv.delta, s.delta * f, 1e-6) && near(s.pv.heirsAddOn, s.heirsAddOn * f, 1e-6), 'end-of-plan benefits are discounted over all 34 years')
  ok(near(s.plan.pvHeirsTax, s.plan.heirsTax * f, 1e-6) && near(s.none.pvFamily, s.none.familyWealth * f, 1e-6) && near(s.plan.pvEndOwn, s.plan.endOwn * f, 1e-6), 'heirs’ tax, family wealth and client wealth too')
  // Yearly tax and IRMAA: each year discounted from the start of that year (this year's is not discounted)
  let pvTax = 0
  let pvIrmaa = 0
  s.plan.rows.forEach((row, t) => { pvTax += row.tax / 1.025 ** t; pvIrmaa += row.irmaa / 1.025 ** t })
  ok(near(s.plan.pvLifetimeTax, pvTax, 1e-6) && near(s.plan.pvLifetimeIrmaa, pvIrmaa, 1e-6), 'lifetime tax and IRMAA, discounted year by year')
  ok(near(s.pv.taxDelta, s.plan.pvLifetimeTax - s.none.pvLifetimeTax, 1e-9) && s.pv.taxDelta < 0 && s.pv.taxDelta > s.taxDelta, 'the tax saved is worth less today than the nominal sum, and is still a saving', [s.pv.taxDelta, s.taxDelta])
  ok(near(s.plan.pvLifetimeTax - s.plan.rows.slice(1).reduce((a, row, k) => a + row.tax / 1.025 ** (k + 1), 0), s.plan.rows[0].tax, 1e-6), 'this year’s tax enters at full value')
  // More discounting always shrinks today's value of a later benefit
  const rates = [0, 0.01, 0.025, 0.05, 0.08]
  const pvs = rates.map((d) => computeMultiYear({ ...SAMPLE, discount: d }).pv.deltaOwn)
  ok(pvs.every((v, k) => k === 0 || v < pvs[k - 1]), 'a higher discount rate gives a smaller present value', pvs)
  ok(computeMultiYear({ ...SAMPLE, discount: -0.05 }).discount === 0 && computeMultiYear({ ...SAMPLE, discount: undefined }).discount === 0.025 && computeMultiYear({ ...SAMPLE, discount: NaN }).discount === 0.025, 'negative discount rates are 0; missing or non-numeric is the default')
  // The existing figures do not depend on the discount rate or the own rate
  const a = computeMultiYear({ ...SAMPLE, discount: 0.08, ownRate: 0.1 })
  ok(a.delta === s.delta && a.plan.familyWealth === s.plan.familyWealth && a.taxDelta === s.taxDelta, 'the heirs-view figures do not move with the discount or the own rate')
}

// ---------- 5. Identities ----------
{
  const s = computeMultiYear(SAMPLE)
  ok(near(s.delta, s.deltaOwn + s.heirsAddOn, 1e-6), 'client alone + heirs add = the heirs-view benefit')
  ok(near(s.pv.delta, s.pv.deltaOwn + s.pv.heirsAddOn, 1e-6), '…and the same in today’s dollars')
  ok(s.plan.ownWealth.length === s.years + 1 && s.none.ownWealth.length === s.years + 1 && s.plan.endOwn === s.plan.ownWealth[s.years], 'a client-wealth series of years + 1 points ending at the end value')
  const w0 = SAMPLE.pretax * (1 - s.ownRate) + SAMPLE.roth + SAMPLE.taxable
  ok(near(s.plan.ownWealth[0], w0, 1e-6) && near(s.none.ownWealth[0], w0, 1e-6), 'both series start from today’s balances')
  const lastP = s.plan.rows[s.years - 1]
  ok(near(s.plan.endOwn, lastP.pretax * (1 - s.ownRate) + lastP.roth + lastP.side, 1e-6), 'client wealth at the end = pre-tax × (1 − own rate) + Roth + taxable')
  ok(near(s.heirsAddOn, (SAMPLE.beneficiaryRate - s.ownRate) * (s.none.endPretax - s.plan.endPretax), 1e-6), 'heirs add exactly (heirs’ rate − own rate) × the pre-tax the plan removed')
  ok(near(s.plan.ownWealth[1], s.plan.rows[0].pretax * (1 - s.ownRate) + s.plan.rows[0].roth + s.plan.rows[0].side, 1e-6), 'the series is year-end balances')
}

// ---------- 6. Edges ----------
{
  const z = computeMultiYear({ ...SAMPLE, pretax: 0, roth: 100000, taxable: 0 })
  ok(Number.isFinite(z.deltaOwn) && z.deltaOwn === 0 && z.pv.deltaOwn === 0, 'nothing pre-tax: nothing to convert, no benefit either way')
  const short = computeMultiYear({ ...SAMPLE, birthYear: 1948, endAge: 79, pretax: 600000 })
  ok(short.years >= 1 && Number.isFinite(short.pv.deltaOwn) && Number.isFinite(short.ownRate), 'a short horizon still values both ways')
  const early = computeMultiYear({ ...SAMPLE, birthYear: 1990, endAge: 62, pretax: 300000 })
  ok(early.years >= 1 && Number.isFinite(early.ownRate) && early.ownRate >= 0.1 - 1e-9, 'no RMD before the end: the last year’s bracket is used')
  const one = runScenario({ ...SAMPLE, endAge: 63 }, true)
  ok(one.years === 2, 'runScenario is untouched: horizon in years')
}

// ---------- 7. Random invariants ----------
for (let k = 0; k < 400; k++) {
  const c = {
    birthYear: pickOne([1950, 1955, 1959, 1960, 1964, 1968, 1975]), filing: pickOne(['married', 'single']), endAge: pickOne([85, 90, 95, 100]), retireAge: pickOne([55, 62, 65, 70]),
    wages: pickOne([0, 60000, 150000]), ssAnnual: pickOne([0, 30000, 50400, 70000]), ssStartAge: pickOne([62, 67, 70]), pension: pickOne([0, 20000]), otherIncome: pickOne([0, 4000, 25000]),
    pretax: pickOne([0, 150000, 500000, 900000, 2500000]), roth: pickOne([0, 80000, 400000]), taxable: pickOne([0, 50000, 150000, 600000]),
    ret: pickOne([0, 0.03, 0.05, 0.07]), infl: pickOne([0.02, 0.025]), index: pickOne([true, false]), stateRate: pickOne([0, 0.05, 0.1]),
    mode: pickOne(['none', 'flat', 'fill', 'fill']), flatAmount: pickOne([25000, 75000]), flatYears: pickOne([5, 12]), fillBracket: pickOne([12, 22, 24]), fillUntilAge: pickOne([70, 74, 80]),
    beneficiaryRate: pickOne([0.12, 0.24, 0.32, 0.37]),
    discount: pickOne([undefined, 0, 0.025, 0.05]), ownRate: pickOne([undefined, undefined, 0.12, 0.24, 0.35]),
  }
  const r = computeMultiYear(c)
  const tag = JSON.stringify(c).slice(0, 160)
  const d = c.discount === undefined ? 0.025 : c.discount
  const f = 1 / (1 + d) ** r.years
  ok([r.deltaOwn, r.heirsAddOn, r.delta, r.ownRate, r.pv.deltaOwn, r.pv.delta, r.pv.heirsAddOn, r.pv.taxDelta, r.pv.irmaaDelta].every(Number.isFinite), 'random: finite', tag)
  ok(near(r.delta, r.deltaOwn + r.heirsAddOn, 1e-4), 'random: client alone + heirs add = heirs view', tag)
  ok(r.ownRate >= 0 && r.ownRate <= 0.6 && (c.ownRate === undefined ? r.ownRateDerived : !r.ownRateDerived), 'random: own rate within 0–60% and flagged derived or not correctly', tag)
  ok(near(r.pv.deltaOwn, r.deltaOwn * f, 1e-4) && near(r.pv.delta, r.delta * f, 1e-4), 'random: present value = nominal × the end-of-plan factor', tag)
  ok(Math.abs(r.pv.deltaOwn) <= Math.abs(r.deltaOwn) + 1e-6 && r.pv.deltaOwn * r.deltaOwn >= -1e-9, 'random: discounting shrinks a benefit and never flips its sign', tag)
  ok(near(r.heirsAddOn, (c.beneficiaryRate - r.ownRate) * (r.none.endPretax - r.plan.endPretax), 1e-4), 'random: heirs add (heirs’ rate − own rate) × the pre-tax removed', tag)
  ok(c.mode === 'none' || r.plan.totalConverted === 0 ? Math.abs(r.deltaOwn) < 1e-6 && Math.abs(r.pv.taxDelta) < 1e-6 : true, 'random: no conversion, no difference', tag)
  ok(d === 0 ? near(r.pv.taxDelta, r.taxDelta, 1e-6) && near(r.pv.irmaaDelta, r.irmaaDelta, 1e-6) : true, 'random: at 0% the present values of the tax and IRMAA deltas equal the nominal ones', tag)
  ok(r.plan.ownWealth.length === r.years + 1 && r.none.ownWealth.length === r.years + 1 && r.plan.ownWealth.every(Number.isFinite), 'random: series lengths and finite', tag)
}

// ---------- 8. Gaps the independent review found (each was shown with a surviving mutant) ----------
{
  // Present values on the do-nothing side and for IRMAA, recomputed independently with the row index as the number of years
  const c = { ...SAMPLE, discount: 0.05, fillUntilAge: 66 }
  const L = computeMultiYear(c)
  const pvOf = (rows, key) => rows.reduce((a, row, t) => a + row[key] / 1.05 ** t, 0)
  ok(L.plan.endPretax > 0, 'this configuration leaves pre-tax in the plan, so the heirs’ tax present values are not zero', L.plan.endPretax)
  for (const [name, sc] of [['plan', L.plan], ['do nothing', L.none]]) {
    ok(near(sc.pvEndOwn, sc.endOwn / 1.05 ** L.years, 1e-6), `${name}: client wealth at the end, discounted over all the years`)
    ok(near(sc.pvLifetimeTax, pvOf(sc.rows, 'tax'), 1e-6) && near(sc.pvLifetimeIrmaa, pvOf(sc.rows, 'irmaa'), 1e-6), `${name}: lifetime tax and IRMAA, discounted year by year`)
    ok(near(sc.pvFamily, sc.familyWealth / 1.05 ** L.years, 1e-6) && near(sc.pvHeirsTax, sc.heirsTax / 1.05 ** L.years, 1e-6), `${name}: family wealth and heirs’ tax, discounted over all the years`)
  }
  ok(near(L.pv.taxDelta, pvOf(L.plan.rows, 'tax') - pvOf(L.none.rows, 'tax'), 1e-6) && near(L.pv.irmaaDelta, pvOf(L.plan.rows, 'irmaa') - pvOf(L.none.rows, 'irmaa'), 1e-6), 'the present-value tax and IRMAA deltas')
  ok(L.pv.irmaaDelta !== L.irmaaDelta && Math.abs(L.pv.irmaaDelta) < Math.abs(L.irmaaDelta), 'the IRMAA delta is discounted, not the nominal one')

  // Every point of the client-alone series, with a Roth balance so that term is exercised
  const c2 = { ...SAMPLE, roth: 120000 }
  const s2 = computeMultiYear(c2)
  for (const [name, sc] of [['plan', s2.plan], ['do nothing', s2.none]]) {
    ok(near(sc.ownWealth[0], c2.pretax * (1 - s2.ownRate) + c2.roth + c2.taxable, 1e-6), `${name}: the series starts from today’s pre-tax, Roth and taxable balances`)
    ok(sc.rows.every((row, k) => near(sc.ownWealth[k + 1], row.pretax * (1 - s2.ownRate) + row.roth + row.side, 1e-6)), `${name}: every later point is that year’s end balances at the client’s own rate`)
  }

  // The state rate's path into the own rate, and the no-RMD fallback reading the do-nothing run
  const st = computeMultiYear({ ...SAMPLE, stateRate: 0.05 })
  let w = 0
  let ws = 0
  for (const row of st.none.rows) if (row.rmd > 0) { w += row.rmd; ws += row.rmd * (row.taxable > 0.5 ? row.marginal + 0.05 : 0) }
  ok(near(st.ownRate, ws / w, 1e-12), 'the own rate is the RMD-weighted marginal rate plus the state rate, recomputed from the do-nothing rows')
  ok(st.ownRate > computeMultiYear(SAMPLE).ownRate + 0.04, 'a 5% state rate raises the own rate by about 5 points')
  const e70 = [{ mode: 'none' }, { mode: 'fill', fillBracket: 22 }, { mode: 'fill', fillBracket: 24 }, { mode: 'flat', flatAmount: 150000, flatYears: 12 }].map((o) => computeMultiYear({ ...SAMPLE, endAge: 70, ...o }).ownRate)
  ok(e70.every((v) => v === e70[0]), 'with no RMD before the end, the own rate does not depend on the conversion plan', e70)

  // Overrides and the discount rate, by value
  const z = computeMultiYear({ ...SAMPLE, ownRate: 0 })
  ok(z.ownRate === 0 && !z.ownRateDerived && near(z.none.endOwn, z.none.endPretax + z.none.endRoth + z.none.endSide, 1e-6), 'an own rate of 0% values pre-tax at face value')
  const auto = computeMultiYear(SAMPLE).ownRate
  for (const bad of [NaN, null, undefined, '', 'x', Infinity]) {
    const q = computeMultiYear({ ...SAMPLE, ownRate: bad })
    ok(q.ownRateDerived && q.ownRate === auto, `own rate ${String(bad)} falls back to the derived rate`)
    const d = computeMultiYear({ ...SAMPLE, discount: bad })
    ok(d.discount === 0.025, `discount ${String(bad)} falls back to 2.5%`)
  }
  ok(computeMultiYear({ ...SAMPLE, discount: 0.01 }).discount === 0.01 && computeMultiYear({ ...SAMPLE, discount: 0.08 }).discount === 0.08, 'a chosen discount rate is used as is')
}

// ---------- 9. The cash rule: income pays its own tax and IRMAA; the portfolio pays what the RMD and the conversion add ----------
{
  // Where cash is ample nothing changed: figures taken from the engine before the rule changed
  const a500 = computeMultiYear({ ...SAMPLE, taxable: 500000 })
  const a5m = computeMultiYear({ ...SAMPLE, taxable: 5000000 })
  ok(near(a500.delta, 1997563.77, 0.02) && near(a500.deltaOwn, 1829417.45, 0.02), 'ample cash ($500k taxable): figures as before the cash-rule change', [a500.delta, a500.deltaOwn])
  ok(near(a5m.delta, a500.delta, 0.01) && near(a5m.deltaOwn, a500.deltaOwn, 0.01), 'ample cash: the benefit does not depend on how much cash there is ($500k vs $5M)', [a5m.delta, a500.delta])
  // With real income (pension, other income, Social Security) and ample cash: the old rule charged that income's tax to savings in both runs, the new one does not, and the benefit is the same to the cent
  const aInc = computeMultiYear({ ...SAMPLE, pension: 60000, otherIncome: 25000, taxable: 5000000 })
  ok(near(aInc.deltaOwn, 434019.96, 0.02) && near(aInc.delta, 443513.81, 0.02), 'ample cash with income: benefit as before the cash-rule change', [aInc.deltaOwn, aInc.delta])

  // A case by hand: single, 65 in 2026, $100,000 pension, $500,000 pre-tax, no cash, no growth, convert $50,000 once (2026), three years.
  //   Do nothing: taxable income 100,000 − 16,100 − 2,050 − (6,000 − 6% × 25,000) = 77,350, tax 1,240 + 4,560 + 22% × 26,950 = 11,729; MAGI 100,000, no IRMAA.
  //   With the conversion: MAGI 150,000, taxable income 130,350, tax 23,882, so the conversion costs 12,153.
  //   IRMAA runs two years behind. 2026 and 2027 are set by MAGI already on record (100,000 here), which a 2026 conversion cannot change; 2028 is set by
  //   2026's MAGI of 150,000, a tier the pension alone does not reach: 2,884.80 of IRMAA that the conversion causes.
  const H2 = { birthYear: 1961, filing: 'single', endAge: 67, retireAge: 60, wages: 0, ssAnnual: 0, ssStartAge: 70, pension: 100000, otherIncome: 0, pretax: 500000, roth: 0, taxable: 0, ret: 0, infl: 0.02, index: false, stateRate: 0, mode: 'flat', flatAmount: 50000, flatYears: 1, fillBracket: 22, fillUntilAge: 70, beneficiaryRate: 0.32 }
  const h = computeMultiYear(H2)
  const p0 = h.plan.rows[0]
  const irmaaX = 2884.8
  ok(near(irmaaSurcharge(150000, 'single').annualHousehold, irmaaX, 1e-9) && irmaaSurcharge(100000, 'single').annualHousehold === 0, 'hand case: 150,000 of MAGI is in an IRMAA tier that 100,000 is not', irmaaSurcharge(150000, 'single').annualHousehold)
  ok(h.years === 3 && near(h.none.rows[0].tax, 11729, 0.01) && near(p0.tax, 23882, 0.01) && near(p0.convTax, 12153, 0.01), 'hand case: tax 11,729 without, 23,882 with, so the conversion costs 12,153', [h.none.rows[0].tax, p0.tax, p0.convTax])
  ok(h.plan.rows.every((row, k) => near(row.irmaa, k === 2 ? irmaaX : 0, 1e-9) && near(row.irmaaExtra, k === 2 ? irmaaX : 0, 1e-9)) && h.none.rows.every((row) => row.irmaa === 0 && row.irmaaExtra === 0), 'hand case: nothing in 2026 or 2027, all of the 2028 surcharge is the conversion’s, and doing nothing owes none', h.plan.rows.map((row) => row.irmaa))
  ok(near(p0.withheld, 12153, 0.01) && near(p0.roth, 50000 - 12153, 0.01), 'hand case: no cash, so the conversion’s tax is withheld from the conversion', [p0.withheld, p0.roth])
  ok(near(h.plan.endSide, -irmaaX, 1e-9) && h.none.endSide === 0, 'hand case: the IRMAA is charged to wealth even though the taxable account is empty (it used to be dropped)', [h.plan.endSide, irmaaX])
  ok(near(h.ownRate, 0.22, 1e-12) && near(h.deltaOwn, -(12153 - 0.22 * 50000) - irmaaX, 1e-6), 'hand case: client alone = (22% saved later − 12,153 paid now) − IRMAA, so −4,037.80', h.deltaOwn)
  ok(near(h.thisYear.tax, 12153, 0.01) && near(h.thisYear.rate, 12153 / 50000, 1e-9) && near(h.thisYear.netToRoth, 37847, 0.01) && near(h.thisYear.irmaaLater, irmaaX, 1e-9), 'hand case: the first-year figures the page prints (tax, rate, net into the Roth, IRMAA it triggers)', JSON.stringify(h.thisYear))
  // The two-year lag, directly: one conversion in 2026 causes exactly one year of extra IRMAA, in 2028, and no more (2029 and 2030 follow MAGI from 2027 and 2028, which hold no conversion)
  const h3 = computeMultiYear({ ...H2, endAge: 69 })
  ok(h3.plan.rows.map((row) => row.irmaaExtra).every((v, k) => near(v, k === 2 ? irmaaX : 0, 1e-9)) && h3.plan.rows.map((row) => row.side).every((v, k) => near(v, k < 2 ? 0 : -irmaaX, 1e-9)), 'two-year lag: a 2026 conversion adds IRMAA in 2028 only; the shortfall then stays at −2,884.80 with no growth', JSON.stringify(h3.plan.rows.map((row) => [row.irmaaExtra, row.side])))
  // Doubling the conversion year does not move the first two years' IRMAA, whatever is converted in them
  const big = computeMultiYear({ ...H2, flatAmount: 400000 })
  ok(big.plan.rows[0].irmaa === 0 && big.plan.rows[1].irmaa === 0 && big.plan.rows[2].irmaa > irmaaX, 'two-year lag: a larger 2026 conversion still adds nothing in 2026 or 2027, and more in 2028', big.plan.rows.map((row) => row.irmaa))
  // A shortfall costs the portfolio's full return (5% here), not the taxable account's after-drag 4%
  const h4 = computeMultiYear({ ...H2, endAge: 69, ret: 0.05 })
  ok(near(h4.plan.rows[2].side, -irmaaX * 1.05, 1e-6) && near(h4.plan.rows[4].side, -irmaaX * 1.05 ** 3, 1e-6), 'a negative taxable balance compounds at the full return (5%), not at 80% of it', h4.plan.rows.map((row) => row.side))

  // The household's own income pays the tax and IRMAA it owes: with no RMD and no conversion the taxable account only grows
  const I = { ...SAMPLE, birthYear: 1975, endAge: 70, retireAge: 62, wages: 90000, ssAnnual: 0, pension: 150000, otherIncome: 25000, pretax: 800000, roth: 50000, taxable: 100000, ret: 0.05, mode: 'none', stateRate: 0.05 }
  const ic = computeMultiYear(I)
  ok(ic.years === 20 && ic.none.rows.some((row) => row.irmaa > 0) && ic.none.rows.some((row) => row.tax > 30000), 'income case: a 20-year horizon with real income tax and IRMAA', [ic.years])
  ok(near(ic.none.endSide, 100000 * 1.04 ** 20, 1e-3) && near(ic.plan.endSide, ic.none.endSide, 1e-6), 'income case: income tax and IRMAA on income alone never touch the taxable account (it grows at 80% of the return, nothing else)', [ic.none.endSide, 100000 * 1.04 ** 20])

  // Every year of every scenario, re-simulated independently from the rows and the shared tax functions
  const resim = (c, sc) => {
    const filing = normalizeFiling(c.filing)
    const people = filing === 'married' ? 2 : 1
    const g = c.index ? 1 + c.infl : 1
    const incAgi = []
    const realAgi = []
    let side = c.taxable
    return sc.rows.map((row, t) => {
      const idx = g ** t
      const seniors = row.age >= 65 && row.year <= SENIOR_DEDUCTION.lastYear ? people : 0
      const own = row.wages + row.pension + row.other
      const ctx = { filing, brackets: bracketsFor(filing, idx), std: row.std, ordinaryBefore: own, ssY: row.ss, seniors, stateRate: c.stateRate, idx }
      const inc = taxYear(ctx, 0)
      const withRmd = taxYear({ ...ctx, ordinaryBefore: own + row.rmd }, 0)
      const real = taxYear({ ...ctx, ordinaryBefore: own + row.rmd }, row.conversion)
      const irmaaAt = (ref) => (row.age >= 65 ? irmaaSurcharge(ref / idx, filing).annualHousehold * idx : 0)
      const incIrmaa = irmaaAt(t >= 2 ? incAgi[t - 2] : withRmd.agi) // the first two years are history: the year's MAGI before any conversion, in both
      const realIrmaa = irmaaAt(t >= 2 ? realAgi[t - 2] : withRmd.agi)
      incAgi.push(inc.agi)
      realAgi.push(real.agi)
      const rmdTax = withRmd.tax - inc.tax
      const irmaaExtra = realIrmaa - incIrmaa
      const convTax = Math.max(0, real.tax - withRmd.tax)
      side += row.rmd
      side -= rmdTax + irmaaExtra
      const paid = Math.min(Math.max(0, side), convTax)
      side -= paid
      side *= 1 + (side < 0 ? c.ret : c.ret * 0.8)
      return { rmdTax, irmaaExtra, convTax, withheld: convTax - paid, side, tax: real.tax, irmaa: realIrmaa }
    })
  }
  const tolOf = (b) => 1e-7 * Math.max(1, Math.abs(b))
  let negativeSide = 0
  for (let k = 0; k < 300; k++) {
    const c = {
      birthYear: pickOne([1950, 1955, 1959, 1960, 1964, 1968, 1975]), filing: pickOne(['married', 'single']), endAge: pickOne([85, 90, 95, 100]), retireAge: pickOne([55, 62, 65, 70]),
      wages: pickOne([0, 60000, 150000]), ssAnnual: pickOne([0, 30000, 50400, 70000]), ssStartAge: pickOne([62, 67, 70]), pension: pickOne([0, 20000, 60000]), otherIncome: pickOne([0, 4000, 25000]),
      pretax: pickOne([150000, 500000, 900000, 2500000]), roth: pickOne([0, 80000, 400000]), taxable: pickOne([0, 0, 50000, 150000, 600000]),
      ret: pickOne([0, 0, 0.03, 0.05, 0.07]), infl: pickOne([0.02, 0.025]), index: pickOne([true, false]), stateRate: pickOne([0, 0.05, 0.1]),
      mode: pickOne(['none', 'flat', 'fill', 'fill']), flatAmount: pickOne([25000, 75000]), flatYears: pickOne([5, 12]), fillBracket: pickOne([12, 22, 24]), fillUntilAge: pickOne([70, 74, 80]),
      beneficiaryRate: pickOne([0.12, 0.24, 0.32, 0.37]),
    }
    const r = computeMultiYear(c)
    const tag = JSON.stringify(c).slice(0, 170)
    for (const [name, sc] of [['plan', r.plan], ['do nothing', r.none]]) {
      const sim = resim(c, sc)
      const bad = sc.rows.findIndex((row, t) => !(near(row.rmdTax, sim[t].rmdTax, tolOf(sim[t].rmdTax)) && near(row.irmaaExtra, sim[t].irmaaExtra, tolOf(sim[t].irmaaExtra)) && near(row.convTax, sim[t].convTax, tolOf(sim[t].convTax)) && near(row.withheld, sim[t].withheld, tolOf(sim[t].withheld)) && near(row.side, sim[t].side, tolOf(sim[t].side)) && near(row.tax, sim[t].tax, tolOf(sim[t].tax)) && near(row.irmaa, sim[t].irmaa, tolOf(sim[t].irmaa))))
      ok(bad < 0, `cash rule: ${name}: tax, IRMAA, the portfolio’s share of each, the withholding and the taxable balance re-simulate in every year`, `${tag} year index ${bad}`)
      ok(sc.rows.every((row) => row.rmdTax >= -1e-9 && row.irmaaExtra >= -1e-9 && row.convTax >= -1e-9 && row.withheld >= -1e-9), `cash rule: ${name}: the portfolio’s tax, IRMAA and withholding are never negative`, tag)
      ok(sc.rows.every((row) => (row.rmd > 0 || row.rmdTax === 0) && row.withheld <= row.convTax + 1e-9 && row.withheld <= row.conversion + 1e-9), `cash rule: ${name}: no RMD, no RMD tax; withholding never exceeds the conversion tax or the conversion`, tag)
      ok(near(sc.familyWealth, sc.endPretax * (1 - c.beneficiaryRate) + sc.endRoth + sc.endSide, 1e-6 * Math.max(1, Math.abs(sc.familyWealth))), `cash rule: ${name}: family wealth still adds the taxable balance, negative or not`, tag)
      ok(sc.wealth.length === sc.rows.length + 1 && near(sc.wealth[0], c.pretax * (1 - c.beneficiaryRate) + c.roth + c.taxable, 1e-6 * Math.max(1, c.pretax)) && sc.rows.every((row, j) => near(sc.wealth[j + 1], row.pretax * (1 - c.beneficiaryRate) + row.roth + row.side, 1e-6 * Math.max(1, Math.abs(sc.wealth[j + 1])))), `cash rule: ${name}: the with-heirs wealth series is each year's pre-tax at (1 − heirs' rate) + Roth + taxable, negative or not`, tag)
      if (c.ret === 0) {
        // No growth: the balances lose exactly what the portfolio paid in tax, IRMAA and conversion tax, and nothing else
        const paid = sc.rows.reduce((a, row) => a + row.rmdTax + row.irmaaExtra + row.convTax, 0)
        ok(near(sc.endPretax + sc.endRoth + sc.endSide, c.pretax + c.roth + c.taxable - paid, 1e-6 * Math.max(1, c.pretax + c.roth + c.taxable)), `cash rule: ${name}: with no growth the balances fall by exactly the tax and IRMAA the portfolio paid`, tag)
      }
      if (sc.rows.some((row) => row.side < 0)) negativeSide++
    }
    if (c.mode === 'none') ok(r.plan.rows.every((row) => row.convTax === 0 && row.withheld === 0) && Math.abs(r.deltaOwn) < 1e-6, 'cash rule: no conversion, no conversion tax, and the two scenarios are one', tag)
  }
  ok(negativeSide > 0, 'cash rule: the random cases include runs where the taxable account is overdrawn by what the RMD and the conversion add', negativeSide)
}

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
