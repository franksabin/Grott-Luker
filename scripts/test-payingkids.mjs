import { computeKids, ROTH_DEFAULTS, IRA_LIMIT } from '../src/lib/payingKids.js'
import { getState } from '../src/lib/states.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol
let seed = 9001
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pickOne = (a) => a[Math.floor(rnd() * a.length)]

const K = (age, hours, rate, i = 1) => ({ id: `k${i}`, age: String(age), hours: String(hours), rate: String(rate) })
const F = (o) => ({ entity: 'soleprop', bracket: '32', state: 'NH', planMinAge: '21', seBase: 'below', ...ROTH_DEFAULTS, kids: [], ...o })

// ---------- 1. The sample: sole proprietor, 32%, NH ----------
{
  const kids = [K(17, 500, 16, 1), K(15, 400, 15, 2)]
  const above = computeKids(F({ seBase: 'above', kids }))
  ok(near(above.wages, 14000), 'wages 14,000', above.wages)
  ok(near(above.ownerIncomeTax, 14000 * 0.32), 'owner income tax saved 4,480', above.ownerIncomeTax)
  ok(near(above.ownerSe, 14000 * 0.9235 * 0.038), 'above the wage base: SE saved at 3.8% x 92.35% = 491.30', above.ownerSe)
  ok(above.fica === 0 && above.futa === 0 && above.childFed === 0 && above.childState === 0, 'under 18: no payroll tax, no income tax')
  ok(near(above.net, 4480 + 491.302), 'net 4,971.30', above.net)
  ok(near(above.roth, 7500 + 6000), 'Roth room 13,500', above.roth)
  const below = computeKids(F({ seBase: 'below', kids }))
  ok(near(below.ownerSe, 14000 * 0.9235 * 0.153), 'below the wage base: SE saved at 15.3% x 92.35% = 1,978.14', below.ownerSe)
  ok(near(below.net, 4480 + 1978.137), 'net 6,458.14', below.net)
  // The SE choice is explicit: nothing is inferred from the bracket, and an old saved value falls back to "below"
  ok(near(computeKids(F({ seBase: 'below', bracket: '37', kids })).ownerSe, below.ownerSe), 'a 37% bracket does not change the SE choice')
  ok(near(computeKids(F({ seBase: 'auto', kids })).ownerSe, below.ownerSe) && near(computeKids(F({ seBase: undefined, kids })).ownerSe, below.ownerSe), '"auto" or missing falls back to below')
}

// ---------- 2. Payroll tax by entity and age (12,000 of wages, 24%, NH) ----------
{
  const at = (entity, age) => computeKids(F({ entity, bracket: '24', kids: [K(age, 600, 20)] }))
  const sp = (age) => at('soleprop', age)
  ok(sp(17).fica === 0 && sp(17).futa === 0, 'sole prop age 17: no FICA, no FUTA')
  ok(near(sp(18).fica, 1836) && sp(18).futa === 0, 'sole prop age 18: FICA 1,836, still no FUTA', [sp(18).fica, sp(18).futa])
  ok(near(sp(20).fica, 1836) && sp(20).futa === 0, 'sole prop age 20: FUTA exempt until 21')
  ok(near(sp(21).fica, 1836) && near(sp(21).futa, 42), 'sole prop age 21: FUTA 0.6% of the first 7,000 = 42', sp(21).futa)
  ok(near(sp(18).net, 12000 * 0.24 + 12000 * 0.9235 * 0.153 - 1836), 'sole prop age 18 net 2,739.56', sp(18).net)
  ok(near(sp(17).net, 12000 * 0.24 + 12000 * 0.9235 * 0.153), 'sole prop age 17 net 4,575.55', sp(17).net)
  for (const entity of ['scorp', 'ccorp']) {
    const r = at(entity, 15)
    ok(near(r.fica, 1836) && near(r.futa, 42) && r.ownerSe === 0, `${entity}: a corporation pays FICA and FUTA on a 15-year-old and the owner saves no SE tax`, [r.fica, r.futa, r.ownerSe])
    ok(near(r.net, 12000 * 0.24 - 1836 - 42), `${entity} net 1,002`, r.net)
  }
}

// ---------- 3. The child's own tax ----------
{
  const r = computeKids(F({ kids: [K(17, 1000, 20)] })) // 20,000 of wages
  ok(near(r.childFed, 390), 'wages 20,000: taxable 3,900 at 10% = 390', r.childFed)
  const none = computeKids(F({ kids: [K(17, 805, 20)] })) // 16,100
  ok(none.childFed === 0 && none.childState === 0, 'wages equal to the standard deduction: no tax')
  const pa = computeKids(F({ state: 'PA', kids: [K(17, 1000, 20)] }))
  ok(near(pa.childState, 3900 * getState('PA').wage / 100), 'state tax on the wages above the federal standard deduction', pa.childState)
  ok(near(pa.ownerIncomeTax, 20000 * (0.32 + getState('PA').wage / 100)), 'owner state saving uses the same flat rate')
}

// ---------- 4. Roth room, blanks and bracket ----------
{
  ok(near(computeKids(F({ kids: [K(17, 1000, 20)] })).roth, IRA_LIMIT), 'Roth room is capped at 7,500')
  ok(near(computeKids(F({ kids: [K(17, 100, 20)] })).roth, 2000), 'Roth room is the wages when under the cap')
  const blanks = computeKids(F({ kids: [K(17, 600, 15, 1), { id: 'k2', age: '', hours: '', rate: '' }, { id: 'k3', age: '12', hours: '', rate: '' }] }))
  ok(blanks.kids.length === 1, 'blank rows and a child with no wages are ignored')
  ok(near(computeKids(F({ bracket: '12', kids: [K(17, 600, 15)] })).ownerIncomeTax, 9000 * 0.12), 'a 12% bracket works')
  ok(computeKids(F({ kids: [K(17, 600, 15)] })).eligibleKids === 0 && computeKids(F({ kids: [K(22, 600, 15)] })).eligibleKids === 1, '401(k) eligibility uses the plan minimum age')
}

// ---------- 5. Roth inputs: defaults, typed zeros, clamps ----------
{
  const rp = (o) => computeKids(F({ kids: [K(17, 600, 15)], ...o })).rothPlan
  ok(near(rp({ growth: '' }).growth, 0.07) && near(rp({ growth: '0' }).growth, 0), 'blank growth is 7%, a typed 0 stays 0')
  ok(near(rp({ growth: '70' }).growth, 0.3) && near(rp({ growth: '-50' }).growth, -0.2), 'growth is clamped to -20%..30%')
  ok(near(rp({ inflation: '50' }).inflation, 0.15) && near(rp({ incomeRate: '40' }).incomeRate, 0.15), 'inflation and income rate are clamped to 15%')
  ok(rp({ retireAge: '5000' }).retireAge === 120 && rp({ retireAge: 'abc$%' }).retireAge === 1, 'retire age is clamped to 1..120')
  ok(rp({ stopAge: '500' }).stopAge === 120, 'stop age is clamped')
  const huge = computeKids(F({ kids: [K(17, 600, 15)], retireAge: '90000', growth: '9999' }))
  ok(huge.kids[0].proj && Number.isFinite(huge.kids[0].proj.balance) && huge.kids[0].proj.balances.length <= 121, 'a huge retire age cannot blow up the projection', huge.kids[0].proj && huge.kids[0].proj.balances.length)
  // A child at or past the retirement age gets no projection and is left out of the combined income
  const old = computeKids(F({ kids: [K(70, 500, 20, 1), K(17, 600, 15, 2)] }))
  ok(old.kids[0].proj === null && old.kids[1].proj, 'a 70-year-old gets no projection')
  ok(near(old.rothIncomeReal, old.kids[1].proj.incomeReal), 'combined today-dollar income counts only the children with a projection')
}

// ---------- 6. Random invariants ----------
for (let i = 0; i < 500; i++) {
  const entity = pickOne(['soleprop', 'scorp', 'ccorp'])
  const kids = Array.from({ length: pickOne([1, 2, 3]) }, (_, k) => K(pickOne([3, 12, 16, 17, 18, 20, 21, 25, 40, 64, 70]), pickOne([0, 40, 300, 800, 2000, 90000]), pickOne([0, 8, 15, 30, 400]), k + 1))
  const f = F({ entity, bracket: pickOne(['10', '12', '22', '24', '32', '37']), state: pickOne(['NH', 'CA', 'PA', 'MA']), seBase: pickOne(['below', 'above']), growth: pickOne(['', '0', '7', '12', '70']), retireAge: pickOne(['', '55', '65', '90', '9000']), stopAge: pickOne(['', '18', '22', '60']), kids })
  const r = computeKids(f)
  const tag = JSON.stringify(f).slice(0, 150)
  ok(Number.isFinite(r.net) && Number.isFinite(r.wages) && Number.isFinite(r.rothIncomeReal), 'random: totals are finite', tag)
  ok(near(r.net, r.ownerIncomeTax + r.ownerSe - r.childFed - r.childState - r.fica - r.futa, 1e-6), 'random: net identity', tag)
  ok(r.kids.every((k) => near(k.net, k.ownerIncomeTax + k.ownerSe - k.childFed - k.childState - k.fica - k.futa, 1e-6)), 'random: per-child net identity', tag)
  ok(r.kids.every((k) => (entity === 'soleprop' && k.age < 18 ? k.fica === 0 : near(k.fica, k.wages * 0.153, 1e-6))), 'random: FICA rule', tag)
  ok(r.kids.every((k) => (entity === 'soleprop' && k.age < 21 ? k.futa === 0 : near(k.futa, Math.min(k.wages, 7000) * 0.006, 1e-6))), 'random: FUTA rule', tag)
  ok(r.kids.every((k) => k.roth <= IRA_LIMIT + 1e-9 && k.roth <= k.wages + 1e-9), 'random: Roth room within limits', tag)
  ok(entity === 'soleprop' || r.ownerSe === 0, 'random: only a sole proprietor saves SE tax', tag)
  ok(r.kids.every((k) => !k.proj || (k.proj.balances.length === k.proj.retireAge - k.age + 1 && k.proj.balance >= 0 || f.growth === '-50')), 'random: projection series is consistent', tag)
}

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
