// The Roth planner's "Check this result" cautions: they fire only where the answer is likely to be significantly off, and say true things.
// Run with: node scripts/test-cautions.mjs   (or npm run test:engine)
import { computeMultiYear } from '../src/lib/multiYear.js'
import { resultCautions, yearSpans, REFERENCE_LIVING, SENSITIVE } from '../src/lib/multiYearCautions.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
let seed = 8675309
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pickOne = (a) => a[Math.floor(rnd() * a.length)]

const money = (v) => '$' + Math.round(v).toLocaleString('en-US')
const signed = (v) => (v < 0 ? '−' : '+') + money(Math.abs(v))
const approx = (v) => signed(Math.round(v / 1000) * 1000)
const fmt = { money, signed, approx }
const run = (c) => { const r = computeMultiYear(c); return { r, cs: resultCautions(r, c, fmt) } }
const ids = (cs) => cs.map((x) => x.id).join()
const rough = (v) => { const m = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 1); return Math.round(v / m) * m }
const lowest = (sc) => Math.min(0, ...sc.rows.map((row) => row.side))

const SAMPLE = { birthYear: 1964, filing: 'single', endAge: 95, retireAge: 62, wages: 0, ssAnnual: 50400, ssStartAge: 68, pension: 0, otherIncome: 4000, pretax: 900000, roth: 0, taxable: 150000, ret: 0.07, infl: 0.02, index: true, stateRate: 0, mode: 'fill', flatAmount: 75000, flatYears: 12, fillBracket: 22, fillUntilAge: 74, beneficiaryRate: 0.32 }
// 55, no cash, no income: converts to the top of the 24% bracket with the tax withheld from the conversions
const YOUNG = { ...SAMPLE, birthYear: 1971, taxable: 0, pretax: 900000, wages: 0, otherIncome: 0, ssAnnual: 0, ssStartAge: 70, fillBracket: 24, fillUntilAge: 74 }

// What the text should quote for the living-costs sensitivity, worked out independently
const livingExpect = (c, r) => {
  const living = c.filing === 'married' ? 75000 : 50000
  const s = computeMultiYear({ ...c, living, ownRate: r.ownRate })
  const g = c.index ? 1 + c.infl : 1
  const draws = s.plan.rows.filter((row) => row.livingFromSavings > 0.5)
  const avg = draws.reduce((a, row) => a + row.livingFromSavings / g ** row.t, 0) / (draws.length || 1)
  const financed = lowest(s.plan) < Math.min(lowest(r.plan), 0) - 0.5 || lowest(s.none) < Math.min(lowest(r.none), 0) - 0.5
  return { living, s, draws, avg, financed }
}

// ---------- 0. Year spans
ok(yearSpans([{ t: 0, year: 2026 }, { t: 1, year: 2027 }, { t: 2, year: 2028 }]) === '2026–2028', 'a run of years is one span')
ok(yearSpans([{ t: 3, year: 2029 }]) === '2029' && yearSpans([]) === '', 'one year, no years')
ok(yearSpans([{ t: 0, year: 2026 }, { t: 1, year: 2027 }, { t: 14, year: 2040 }, { t: 15, year: 2041 }]) === '2026–2027 and 2040–2041', 'years with a gap are two spans, not one range that implies the gap years too')
ok(yearSpans([{ t: 0, year: 2026 }, { t: 5, year: 2031 }, { t: 9, year: 2035 }]) === '2026, 2031 and 2035', 'three separate years')

// ---------- 1. The shipped sample: a retired client with $4k of income and $150k of cash
{
  const { r, cs } = run(SAMPLE)
  ok(ids(cs) === 'living-costs', 'sample: only the living-costs caution fires (62, $4k of income until Social Security at 68)', ids(cs))
  const e = livingExpect(SAMPLE, r)
  const t = cs[0]?.text || ''
  ok(t.includes(`spends ${money(e.living)} a year (today’s dollars)`) && t.includes(`about ${money(e.avg)} a year (today’s dollars)`) && t.includes(signed(r.deltaOwn)), 'sample: the text quotes the spending, the gap in today’s dollars, and the benefit shown to the dollar', t)
  ok(Math.abs(e.avg - 46000) < 1, 'sample: the 2026 gap is 50,000 − 4,000 = 46,000 in today’s dollars, and the average over the draw years is the same (the gap does not drift with inflation)', e.avg)
  ok(t.includes('2026–2031'), 'sample: the years of the gap', t)
  ok(e.financed && t.includes('more than the taxable account holds') && t.includes(`roughly ${signed(rough(e.s.deltaOwn))}`) && !t.includes(approx(e.s.deltaOwn)), 'sample: the gap is more than the $150k of cash, so the figure is said to rest on financing and is rounded to two figures', t)
  ok(/larger at higher spending and smaller at lower/.test(t) && /income other than RMDs/.test(t), 'sample: the text says the effect moves with spending and that RMDs are not counted as income', t)
}

// ---------- 2. Quiet where it should be
ok(ids(run({ ...SAMPLE, taxable: 5e6 }).cs) === '', 'ample cash ($5M): the gap is easily paid, nothing to say')
ok(ids(run({ ...SAMPLE, pension: 120000 }).cs) === '', 'income of $120k covers $50k of living costs: no gap, nothing to say')
ok(ids(run({ ...SAMPLE, mode: 'none' }).cs) === '' && ids(run({ ...SAMPLE, fillUntilAge: 50 }).cs) === '', 'no conversions, nothing to caution about')
ok(resultCautions(undefined, SAMPLE, fmt).length === 0 && resultCautions({}, SAMPLE, fmt).length === 0, 'no result, no crash')
{
  const r = computeMultiYear(SAMPLE)
  const before = JSON.stringify(r)
  resultCautions(r, SAMPLE, fmt)
  ok(JSON.stringify(r) === before && !('living' in SAMPLE), 'asking for cautions changes neither the result nor the inputs')
}

// ---------- 3. Married households use the married reference
{
  const c = { ...SAMPLE, filing: 'married', birthYear: 1958, fillBracket: 24, pretax: 750000, taxable: 0, ssAnnual: 40000, ret: 0.06, infl: 0.025 }
  const { r, cs } = run(c)
  const e = livingExpect(c, r)
  ok(cs.some((x) => x.id === 'living-costs' && x.text.includes(`spends ${money(75000)}`) && x.text.includes(`about ${money(e.avg)} a year (today’s dollars)`)), 'married: the reference is $75,000 and the gap is in today’s dollars', cs.map((x) => x.text))
  ok(e.avg <= 75000 + 1e-6, 'married: the quoted gap never exceeds the quoted spending', e.avg)
}

// ---------- 4. Tax withheld before 59½: only when it is material at the end of the plan
{
  const { r, cs } = run(YOUNG)
  const early = cs.find((x) => x.id === 'early-withheld')
  const rows = r.plan.rows.filter((row) => row.withheld > 0.5 && row.age < 60)
  const total = rows.reduce((a, row) => a + row.withheld, 0)
  const grown = rows.reduce((a, row) => a + row.withheld * 0.1 * 1.07 ** (r.years - row.t), 0)
  ok(early && rows.length > 0 && early.text.includes(money(total)) && early.text.includes(money(total * 0.1)) && early.text.includes(`${approx(grown).slice(1)} by age 95`), 'age 55, no cash: the withheld total, 10% of it, and that 10% grown to age 95 are quoted', early?.text)
  ok(early && early.text.includes(yearSpans(rows)), 'and the years are the ones before 60', early?.text)
  ok(ids(cs) === 'living-costs,early-withheld', 'living-costs comes first when both fire', ids(cs))
  const short = run({ ...YOUNG, endAge: 70 })
  ok(ids(short.cs) === 'early-withheld', 'a short plan (to 70): only the early-distribution caution', ids(short.cs))
  ok(ids(run({ ...YOUNG, taxable: 5e6 }).cs).split(',').indexOf('early-withheld') === -1, 'age 55 with ample cash: tax is paid from cash, nothing is withheld, no early-distribution caution')
  ok(ids(run({ ...YOUNG, birthYear: 1964 }).cs).split(',').indexOf('early-withheld') === -1, 'age 62, no cash: withheld, but not before 59½, so no caution')
  // Material? Withholding exists before 60 but the penalty is tiny against the benefit: stay quiet
  const tiny = run({ ...YOUNG, filing: 'married', taxable: 0, mode: 'flat', flatAmount: 50000, flatYears: 3 })
  ok(tiny.r.plan.rows.some((row) => row.withheld > 0.5 && row.age < 60) && ids(tiny.cs).split(',').indexOf('early-withheld') === -1, 'a few hundred dollars withheld before 60 is not worth a caution', ids(tiny.cs))
}

// ---------- 4a. Years paid from cash are not named as withheld years (lowered bar: real cases rarely mix the two and still fire)
{
  const c = { ...YOUNG, endAge: 70, taxable: 60000 } // 2026: cash pays the tax; 2027-2030: withheld, before 60
  const r = computeMultiYear(c)
  const rows = r.plan.rows.filter((row) => row.withheld > 0.5 && row.age < 60)
  const early = resultCautions(r, c, fmt, { share: 0, floor: 0 }).find((x) => x.id === 'early-withheld')
  ok(r.plan.rows[0].withheld < 0.5 && rows.length === 4 && early && early.text.includes('2027–2030') && !early.text.includes('2026–2030'), 'years whose tax was paid from cash are left out of the withheld years', early?.text)
}

// ---------- 4b. The plain wording (the gap fits in the taxable account), reached with a lowered bar because real cases rarely fire there
{
  const c = { ...SAMPLE, taxable: 5e6 }
  const r = computeMultiYear(c)
  ok(resultCautions(r, c, fmt).length === 0, 'with $5M of cash the real bar is not met')
  const cs = resultCautions(r, c, fmt, { share: 0, floor: 0 })
  const e = livingExpect(c, r)
  const t = cs[0]?.text || ''
  ok(cs.length === 1 && !e.financed && t.includes(`about ${approx(e.s.deltaOwn)}`) && !t.includes('roughly') && !t.includes('more than the taxable account holds') && t.includes('savings would have to cover the gap.'), 'plain wording: "about", rounded to $1,000, and no mention of financing', t)
}

// ---------- 5. The trigger rules, re-derived independently, over random scenarios; and the texts are clean
let fired = 0, quietWithGap = 0, tested = 0, financedFires = 0, plainFires = 0, earlyFires = 0, earlyQuiet = 0
for (let k = 0; k < 500; k++) {
  const c = {
    birthYear: pickOne([1950, 1955, 1959, 1960, 1964, 1968, 1971, 1975]), filing: pickOne(['married', 'single']), endAge: pickOne([70, 85, 90, 95]), retireAge: pickOne([55, 62, 65, 70]),
    wages: pickOne([0, 60000, 150000]), ssAnnual: pickOne([0, 30000, 50400, 70000]), ssStartAge: pickOne([62, 67, 70]), pension: pickOne([0, 0, 20000, 60000]), otherIncome: pickOne([0, 4000, 25000]),
    pretax: pickOne([150000, 500000, 900000, 2500000]), roth: pickOne([0, 80000, 400000]), taxable: pickOne([0, 25000, 150000, 600000, 2000000]),
    ret: pickOne([0.03, 0.05, 0.07]), infl: pickOne([0.02, 0.025]), index: pickOne([true, false]), stateRate: pickOne([0, 0.05, 0.1]),
    mode: pickOne(['flat', 'fill', 'fill']), flatAmount: pickOne([25000, 75000]), flatYears: pickOne([5, 12]), fillBracket: pickOne([12, 22, 24]), fillUntilAge: pickOne([70, 74, 80]),
    beneficiaryRate: pickOne([0.12, 0.24, 0.32, 0.37]),
  }
  const { r, cs } = run(c)
  const tag = JSON.stringify(c).slice(0, 170)
  if (r.plan.totalConverted <= 0) { ok(cs.length === 0, 'nothing converted: no cautions', tag); continue }
  tested++
  const e = livingExpect(c, r)
  const bar = Math.max(0.15 * Math.abs(r.deltaOwn), 0.02 * Math.max(1, r.none.endOwn))
  const expectLiving = e.draws.length > 0 && Math.abs(e.s.deltaOwn - r.deltaOwn) >= bar
  const liv = cs.find((x) => x.id === 'living-costs')
  ok(!!liv === expectLiving, 'living-costs fires exactly when a gap exists and the benefit moves by the bar', tag)
  if (liv) {
    ok(e.avg <= e.living + 1e-6, 'the quoted gap in today’s dollars never exceeds the quoted spending', tag)
    ok(liv.text.includes(`about ${money(e.avg)} a year (today’s dollars)`) && liv.text.includes(yearSpans(e.draws)) && liv.text.includes(signed(r.deltaOwn)), 'the gap, the years and the benefit shown are quoted as computed', tag)
    ok(e.financed ? liv.text.includes('roughly') && liv.text.includes('more than the taxable account holds') : liv.text.includes(`about ${approx(e.s.deltaOwn)}`) && !liv.text.includes('more than the taxable account holds'), 'the wording says the figure rests on financing exactly when the gap passed the taxable account', tag)
    fired++
    if (e.financed) financedFires++; else plainFires++
  } else if (e.draws.length) quietWithGap++
  const earlyRows = r.plan.rows.filter((row) => row.withheld > 0.5 && row.age < 60)
  const grown = earlyRows.reduce((a, row) => a + row.withheld * 0.1 * (1 + c.ret) ** (r.years - row.t), 0)
  const expectEarly = earlyRows.length > 0 && grown >= bar
  ok(cs.some((x) => x.id === 'early-withheld') === expectEarly, 'early-withheld fires exactly when the penalty, grown to the end of the plan, reaches the bar', tag)
  if (expectEarly) earlyFires++; else if (earlyRows.length) earlyQuiet++
  ok(cs.every((x) => x.id && x.title && x.text && !/NaN|undefined|Infinity|null|\[object/.test(x.text)), 'texts are complete and clean', tag)
}
ok(fired > 20 && quietWithGap > 20 && financedFires > 5, 'the random cases exercise firing, quiet-with-a-gap and the financed wording', [fired, quietWithGap, financedFires, plainFires, tested])
ok(earlyFires > 3 && earlyQuiet > 3, 'and both sides of the early-distribution bar', [earlyFires, earlyQuiet])
ok(SENSITIVE.share === 0.15 && SENSITIVE.floor === 0.02 && REFERENCE_LIVING.single === 50000 && REFERENCE_LIVING.married === 75000, 'the thresholds and reference living costs are the ones the page documents')

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
