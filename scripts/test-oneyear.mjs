import { computeOneYear } from '../src/lib/oneYear.js'
import { runScenario, computeMultiYear, taxYear, bracketsFor } from '../src/lib/multiYear.js'
import { irmaaSurcharge } from '../src/lib/tax.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol
let seed = 4242
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]

const F = (o) => ({ filing: 'single', age: 60, spouseAge: 0, wages: 0, pension: 0, otherOrdinary: 0, ss: 0, ltcg: 0, itemized: 0, stateRate: 0, cap: null, target: 'amount', amount: 0, ...o })

// ---------- 1. Hand-computed cases (2026 single: std 16,100; 10% to 12,400; 12% to 50,400; 22% to 105,700) ----------
{
  const r = computeOneYear(F({ wages: 40000, amount: 30000 }))
  ok(near(r.base.tax, 2620), 'base tax 2,620', r.base.tax)
  ok(near(r.chosen.addedTax, 3950), 'added tax on 30,000 = 3,950', r.chosen.addedTax)
  ok(near(r.chosen.effectiveRate, 3950 / 30000, 1e-9), 'effective rate')
  const b12 = r.spots.find((s) => s.id === 'b12')
  ok(b12 && near(b12.conversion, 26500), 'top of 12% = 26,500', b12 && b12.conversion)
  ok(!r.spots.find((s) => s.id === 'b10'), 'no 10% spot when already past it')
  const atB12 = computeOneYear(F({ wages: 40000, target: 'b12' }))
  ok(near(atB12.chosen.addedTax, 3180), 'cost of filling the 12% bracket = 3,180', atB12.chosen.addedTax)
  ok(atB12.chosen.bracket === 0.12, 'bracket reached is 12%')
  ok(near(atB12.chosen.nextRate, 0.22, 1e-9), 'next $10,000 costs 22%', atB12.chosen.nextRate)
  ok(near(atB12.chosen.netIfWithheld, 26500 - 3180), 'net if withheld')
}
// ---------- 2. Gains stack above the conversion ----------
{
  const r = computeOneYear(F({ wages: 30000, ltcg: 30000, amount: 40000 }))
  ok(near(r.base.tax, 1420), 'base tax with 0% gains', r.base.tax)
  ok(near(r.chosen.addedTax, 9650), 'conversion pushes gains into 15%: added 9,650', r.chosen.addedTax)
}
// ---------- 2b. Corrected rules: per-person senior phase-out, additional standard deduction, NIIT, muni interest, IRMAA edge, cap ----------
{
  // Married, both 66, $200,000 of pension: std 32,200 + 2x1,650; senior 2 x (6,000 - 6% of 50,000) = 6,000
  const r = computeOneYear(F({ filing: 'married', age: 66, spouseAge: 66, pension: 200000 }))
  ok(near(r.base.deduction, 35500), 'MFJ both 66: standard deduction incl. additional = 35,500', r.base.deduction)
  ok(near(r.base.senior, 6000), 'MFJ both 66 at 200k: senior deduction = 2 x 3,000', r.base.senior)
  ok(near(r.base.tax, 24294), 'MFJ both 66 at 200k: tax 24,294', r.base.tax)
  const hi = computeOneYear(F({ filing: 'married', age: 66, spouseAge: 66, pension: 250000 }))
  ok(near(hi.base.senior, 0), 'MFJ both 66 at 250k: senior deduction fully phased out', hi.base.senior)
  const one = computeOneYear(F({ filing: 'married', age: 66, spouseAge: 60, pension: 200000 }))
  ok(near(one.base.senior, 3000), 'MFJ one spouse 66: senior = 1 x 3,000', one.base.senior)
  ok(near(one.base.deduction, 32200 + 1650), 'MFJ one spouse 66: additional standard for one', one.base.deduction)
  // Single 70, $40,000 pension: std 16,100 + 2,050; senior 6,000
  const s70 = computeOneYear(F({ age: 70, pension: 40000 }))
  ok(near(s70.base.deduction, 18150), 'single 70: standard deduction 18,150', s70.base.deduction)
  ok(near(s70.base.tax, 1654), 'single 70 at 40k: tax 1,654', s70.base.tax)
  // Itemizing drops the additional standard deduction
  const it = computeOneYear(F({ age: 70, pension: 80000, itemized: 25000 }))
  ok(near(it.base.deduction, 25000), 'itemized 25,000 beats 18,150', it.base.deduction)
  // Not 65 yet: no additional, no senior
  const y = computeOneYear(F({ age: 64, pension: 40000 }))
  ok(near(y.base.deduction, 16100) && y.base.senior === 0, 'age 64: neither', [y.base.deduction, y.base.senior])
}
{
  // NIIT: gains are the default investment income; a conversion pushes MAGI over the threshold
  const r = computeOneYear(F({ age: 66, pension: 90000, otherOrdinary: 40000, ss: 30000, ltcg: 100000, amount: 80000 }))
  ok(near(r.base.agi, 255500), 'NIIT case base AGI 255,500', r.base.agi)
  ok(near(r.base.niit, 0.038 * 55500, 0.01), 'base NIIT on the 55,500 over the threshold', r.base.niit)
  ok(near(r.chosen.addedNiit, 3800 - 0.038 * 55500, 0.01), 'conversion adds NIIT up to 3,800', r.chosen.addedNiit)
  // A larger investment-income figure raises NIIT
  const big = computeOneYear(F({ age: 66, pension: 90000, otherOrdinary: 40000, ss: 30000, ltcg: 100000, nii: 150000, amount: 80000 }))
  ok(big.chosen.y.niit > r.chosen.y.niit, 'explicit NII overrides the gains default', [big.chosen.y.niit, r.chosen.y.niit])
}
{
  // Tax-exempt interest: counts in the Social Security test and in IRMAA MAGI, not in AGI
  const a = computeOneYear(F({ age: 70, ss: 30000, pension: 40000 }))
  const b = computeOneYear(F({ age: 70, ss: 30000, pension: 40000, taxExempt: 20000 }))
  ok(b.base.taxableSS > a.base.taxableSS, 'muni interest raises taxable Social Security', [b.base.taxableSS, a.base.taxableSS])
  const c = computeOneYear(F({ age: 70, pension: 100000, taxExempt: 20000 }))
  ok(near(c.base.agi, 100000), 'muni interest is not in AGI')
  ok(near(c.baseIrmaa, (81.2 + 14.5) * 12, 0.01), 'muni interest puts MAGI 120,000 into the first IRMAA tier', c.baseIrmaa)
  const d = computeOneYear(F({ age: 70, pension: 100000 }))
  ok(d.baseIrmaa === 0, 'without it, no IRMAA at 100,000')
}
{
  // IRMAA top-tier boundary: CMS tier 5 is "less than $500,000"; $500,000 is the top tier
  const at = computeOneYear(F({ age: 70, otherOrdinary: 500000 }))
  ok(near(at.baseIrmaa, (487 + 91) * 12, 0.01), 'MAGI exactly 500,000 is the top tier', at.baseIrmaa)
  const under = computeOneYear(F({ age: 70, otherOrdinary: 499999 }))
  ok(near(under.baseIrmaa, (446.3 + 83.3) * 12, 0.01), 'MAGI 499,999 is tier 5', under.baseIrmaa)
  ok(under.irmaaLine.exclusive === true && under.irmaaLine.limit === 499999, 'line is 499,999', under.irmaaLine)
}
{
  // Pre-tax IRA balance cap
  const zero = computeOneYear(F({ wages: 30000, target: 'b22', cap: 0 }))
  ok(zero.amount === 0 && zero.capBinds === true, 'an entered cap of 0 is a real limit', [zero.amount, zero.capBinds])
  const small = computeOneYear(F({ wages: 30000, target: 'b22', cap: 20000 }))
  ok(small.chosen.conversion === 20000 && small.capBinds === true, 'bracket target limited by a small balance flags capBinds', [small.chosen.conversion, small.capBinds])
  ok(small.current && small.current.full > 20000, 'room figure keeps the uncapped amount in .full', small.current)
  const none = computeOneYear(F({ wages: 30000, target: 'b22', cap: null }))
  ok(none.capBinds === false && none.cap === null, 'blank cap means no limit')
}

// ---------- 3. Cross-check against the multi-year engine's first year ----------
{
  let n = 0
  for (let k = 0; k < 600; k++) {
    const filing = pick(['single', 'married'])
    const age = pick([56, 60, 64, 66, 69, 72])
    const wages = pick([0, 0, 45000, 120000, 260000])
    const ss = age >= 62 ? pick([0, 24000, 48000, 70000]) : 0
    const pension = pick([0, 20000, 45000])
    const other = pick([0, 5000, 30000])
    const stateRate = pick([0, 0.05])
    const c = pick([10000, 40000, 90000, 180000])
    const mi = {
      birthYear: 2026 - age, filing, endAge: age + 1, retireAge: age + 5, wages, ssAnnual: ss, ssStartAge: Math.min(age, 62), pension, otherIncome: other,
      pretax: 5000000, roth: 0, taxable: 0, ret: 0.05, infl: 0, index: false, stateRate, mode: 'flat', flatAmount: c, flatYears: 1, fillBracket: 22, fillUntilAge: age, beneficiaryRate: 0.3,
    }
    const my = runScenario(mi, true).rows[0]
    const ty = computeMultiYear(mi).thisYear
    const o = computeOneYear(F({ filing, age, spouseAge: filing === 'married' ? age : 0, wages, pension, otherOrdinary: other, ss, stateRate, amount: c }))
    n++
    ok(near(o.chosen.y.tax, my.tax, 1e-6), 'tax matches planner year 0', [o.chosen.y.tax, my.tax, mi])
    ok(near(o.chosen.y.agi, my.agi, 1e-6), 'AGI matches planner year 0')
    ok(near(o.chosen.y.senior, my.senior, 1e-6), 'senior deduction matches')
    ok(near(o.chosen.y.taxableSS, my.taxableSS, 1e-6), 'taxable SS matches')
    if (ty.irmaaApplies) ok(near(o.chosen.irmaaAdded, ty.irmaaLater, 1e-6), 'IRMAA added matches planner', [o.chosen.irmaaAdded, ty.irmaaLater])
    // fill mode: same exact solver
    const fmi = { ...mi, mode: 'fill', fillBracket: 22, fillUntilAge: age + 1, flatAmount: 0, flatYears: 0 }
    const fy = runScenario(fmi, true).rows[0]
    const of = computeOneYear(F({ filing, age, spouseAge: filing === 'married' ? age : 0, wages, pension, otherOrdinary: other, ss, stateRate, target: 'b22' }))
    const s22 = of.spots.find((s) => s.id === 'b22')
    if (fy.conversion > 0.5) ok(s22 && near(s22.conversion, fy.conversion, 0.01), 'bracket fill matches planner', [s22 && s22.conversion, fy.conversion])
    else ok(!s22, 'no fill spot when planner converts nothing', s22)
  }
  console.log('cross-checked', n, 'planner cases')
}
// ---------- 4. Invariants over random inputs ----------
{
  let n = 0
  for (let k = 0; k < 3000; k++) {
    const filing = pick(['single', 'married'])
    const age = pick([50, 58, 62, 63, 64, 66, 70, 75])
    const f = F({
      filing, age, spouseAge: filing === 'married' ? pick([0, age - 4, age + 3]) : 0,
      wages: pick([0, 30000, 90000, 200000]), pension: pick([0, 25000]), otherOrdinary: pick([0, 8000, 40000, 100000]),
      ss: age >= 62 ? pick([0, 30000, 60000]) : 0, ltcg: pick([0, 0, 20000, 120000]), itemized: pick([0, 0, 45000]),
      stateRate: pick([0, 0.04]), cap: pick([null, null, 60000, 400000]), target: pick(['b12', 'b22', 'b24', 'irmaa', 'amount']), amount: pick([0, 25000, 80000, 250000]),
    })
    const r = computeOneYear(f)
    n++
    ok(r.chosen.addedTax >= -1e-6, 'added tax never negative', [r.chosen.addedTax, f])
    ok(r.chosen.effectiveRate <= 1 + 1e-9, 'effective rate <= 100%')
    ok(r.chosen.irmaaAdded >= 0, 'IRMAA added >= 0')
    if (r.cap) ok(r.chosen.conversion <= r.cap + 1e-6, 'never converts more than the cap', [r.chosen.conversion, r.cap])
    for (let i = 1; i < r.ladder.length; i++) {
      ok(r.ladder[i].conversion > r.ladder[i - 1].conversion, 'ladder amounts increase')
      ok(r.ladder[i].addedTax >= r.ladder[i - 1].addedTax - 1e-6, 'tax rises with the amount', [r.ladder[i - 1].conversion, r.ladder[i].conversion])
    }
    ok(r.ladder.length <= 12, 'ladder length capped', r.ladder.length)
    if (r.chosen.conversion > 0.5) ok(r.ladder.some((x) => x.isChosen), 'chosen amount appears in the ladder')
    for (const s of r.spots) {
      if (s.pct != null && !s.capped) {
        const y = taxYear(r.ctx, s.full)
        ok(near(y.ordinaryTaxable, s.top, 0.01), `spot b${s.pct} lands on its top`, [y.ordinaryTaxable, s.top])
        ok(taxYear(r.ctx, s.full + 1).ordinaryTaxable > s.top - 1e-9, 'one more dollar crosses the top')
      }
      if (s.id === 'irmaa') {
        const th = s.top
        ok(taxYear(r.ctx, s.full).agi <= th + 1e-6, 'IRMAA spot stays at or under the line', [taxYear(r.ctx, s.full).agi, th])
        ok(taxYear(r.ctx, s.full + 1).agi > th - 1e-6, 'one more dollar crosses the IRMAA line')
        const per = (m) => irmaaSurcharge(m, r.filing).annualPerPerson
        ok(per(taxYear(r.ctx, s.full).agi) === per(r.base.agi), 'no IRMAA step inside the room')
      }
    }
  }
  console.log('invariants over', n, 'random inputs')
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
