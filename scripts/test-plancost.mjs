import { computePlans, staffOf, LIMITS, FEES } from '../src/lib/retirementPlans.js'
import { selfEmploymentTax } from '../src/lib/tax.js'
import { mandateFor, STATE_MANDATES } from '../src/lib/stateMandates.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol
let seed = 31337
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pickOne = (a) => a[Math.floor(rnd() * a.length)]

const F = (o) => ({ entity: 'scorp', earnings: '', age: '', staffMode: 'avg', empCount: '0', empWage: '', empCovered: '', emps: [], bracket: '32', state: 'NH', sepRate: '25', participation: '100', ...o })
const Fd = (o) => F({ sepRate: '', ...o }) // SEP rate left blank: the engine picks the default
const plan = (r, id) => r.plans.find((p) => p.id === id)

// ---------- 1. Owner only, Schedule C 185,000, age 52 (hand-computed) ----------
{
  const r = computePlans(F({ entity: 'se', earnings: '185000', age: '52' }))
  // SE tax = 170,847.50 x 12.4% + 170,847.50 x 2.9%; half deducted
  const se = 170847.5 * 0.124 + 170847.5 * 0.029
  const adj = 185000 - se / 2
  ok(near(r.seTax, se), 'SE tax 26,139.67', r.seTax)
  ok(near(r.sep.total, adj * 0.2), 'SEP = 20% of adjusted net earnings', r.sep.total)
  ok(near(r.solo.employee, 32500) && near(r.solo.employer, adj * 0.2) && near(r.solo.total, 32500 + adj * 0.2), 'Solo 401(k) = 32,500 deferral + 20%', r.solo.total)
  // SIMPLE: 25 or fewer employees (owner counted) -> 18,100 + 3,850 catch-up; compensation is 92.35% of profit
  ok(near(r.simple.employee, 21950), 'SIMPLE deferral 18,100 + 3,850 catch-up', r.simple.employee)
  ok(near(r.simple.employer, 0.03 * 0.9235 * 185000), 'SIMPLE match = 3% of 92.35% of profit', r.simple.employer)
  ok(r.solo.available && !r.hasStaff && r.best.id === 'solo', 'no staff: solo available and largest')
  ok(near(r.sep.taxDeferred, r.sep.total * 0.32), 'tax deferred = contribution x 32%')
  ok(r.warnings.length === 0, 'no warnings without staff', r.warnings)
  ok(r.plans.length === 3, 'three plans without staff')
}
{
  // Pub. 560 vector: P = 200,000 after staff costs -> SE tax about 28,234, SEP about 37,177
  const r = computePlans(F({ entity: 'se', earnings: '200000', age: '40' }))
  ok(near(r.seTax, 28234.3, 0.1), 'SE tax on 200,000 is about 28,234', r.seTax)
  ok(Math.abs(r.sep.total - 37177) < 1, 'SEP at 25% about 37,177', r.sep.total)
}

// ---------- 2. S-corp owner 120,000, age 45, two employees at 40,000 ----------
{
  const r = computePlans(F({ earnings: '120000', age: '45', empCount: '2', empWage: '40000' }))
  const t = 0.32
  ok(r.hasStaff && r.staff.coveredCount === 2 && near(r.staff.payroll, 80000), 'staff parsed', r.staff.payroll)
  ok(r.plans.length === 4 && r.plans[3].id === 'solo', 'four plans with staff, Solo last')
  ok(!r.solo.available && r.warnings.some((w) => w.id === 'solo' && w.level === 'block'), 'Solo 401(k) flagged not available with staff')
  // SEP at 25%: staff 20,000; owner 30,000
  const sep = plan(r, 'sep')
  ok(near(sep.staffCost, 20000) && near(sep.total, 30000), 'SEP: staff 20,000, owner 30,000', [sep.staffCost, sep.total])
  ok(near(sep.taxDeferred, 9600) && near(sep.afterTaxCost, 13600) && near(sep.net, -4000), 'SEP net -4,000', [sep.taxDeferred, sep.afterTaxCost, sep.net])
  ok(near(sep.perThousand, 453.33, 0.01), 'SEP cost per $1,000 sheltered', sep.perThousand)
  // SIMPLE: match 21,700 / staff 2,400 -> net 5,312; 2% non-elective 20,500 / staff 1,600 -> net 5,472 (chosen)
  const mt = r.simple.variants.match, nec = r.simple.variants.nec
  ok(near(mt.total, 21700) && near(mt.staffCost, 2400) && near(mt.net, 5312), 'SIMPLE match net 5,312', [mt.total, mt.staffCost, mt.net])
  ok(near(nec.total, 20500) && near(nec.staffCost, 1600) && near(nec.net, 5472), 'SIMPLE 2% non-elective net 5,472', [nec.total, nec.staffCost, nec.net])
  ok(r.simple.option === 'nec' && near(r.simple.net, 5472), 'owner takes the better SIMPLE option')
  // Safe harbor 3%: deferral 24,500 + 3% x 120,000; staff 2,400; fees default 1,900 + 84 x 3 participants
  const sh = plan(r, 'sh401k')
  ok(near(sh.total, 28100) && near(sh.staffCost, 2400), 'safe harbor: 28,100 sheltered, 2,400 staff', [sh.total, sh.staffCost])
  ok(near(sh.fees, 1900 + 84 * 3), 'safe harbor default fees 2,152', sh.fees)
  ok(near(sh.net, 28100 * t - (2400 + 2152) * (1 - t)), 'safe harbor net', sh.net)
  // ranking: highest net among usable
  ok(near(r.best.net, Math.max(...r.usable.map((p) => p.net))), 'best is the highest net')
}

// ---------- 3. Schedule C: staff cost and fees come off the owner's profit; SE tax falls too ----------
{
  const r = computePlans(F({ entity: 'se', earnings: '200000', age: '40', empCount: '5', empWage: '50000' }))
  const sep = plan(r, 'sep')
  ok(near(sep.staffCost, 62500), 'SEP staff cost 25% of 250,000', sep.staffCost)
  const e = 200000 - 62500 - sep.fees
  const adj = e - selfEmploymentTax(e) / 2
  ok(near(sep.total, adj * 0.2), 'SEP owner contribution is figured on profit after the staff contribution', [sep.total, adj * 0.2])
  // SIMPLE compensation is 92.35% of profit after the staff cost; match is 3% of that
  const mt = r.simple.variants.match
  const eM = 200000 - mt.staffCost - mt.fees
  ok(near(mt.employer, Math.min(0.03 * 0.9235 * eM, mt.employee)), 'SIMPLE match uses 92.35% of profit after staff cost', mt.employer)
  // Staff contributions also cut self-employment tax
  const d = 62500 + sep.fees
  const seSaved = selfEmploymentTax(200000) - selfEmploymentTax(200000 - d)
  const saved = seSaved + 0.32 * (d - seSaved / 2)
  ok(near(sep.afterTaxCost, d - saved, 0.01), 'SEP after-tax cost counts the SE tax saved', [sep.afterTaxCost, d - saved])
  ok(seSaved > 8000 && seSaved < 9500, 'SE tax saved by deducting 62,500 is about 8,800', seSaved)
  // The same staff cost for an S-corp owner saves income tax only
  const s = computePlans(F({ entity: 'scorp', earnings: '200000', age: '40', empCount: '5', empWage: '50000' }))
  ok(near(plan(s, 'sep').afterTaxCost, 62500 * 0.68, 0.01), 'S-corp: after-tax cost is 68% of the staff cost', plan(s, 'sep').afterTaxCost)
  ok(sep.afterTaxCost < 62500 * 0.68, 'Schedule C costs less after tax than the same cost for an S-corp owner')
}
{
  // S-corp owner's W-2 pay is fixed: staff cost does not shrink it
  const r = computePlans(F({ earnings: '150000', age: '40', empCount: '5', empWage: '50000' }))
  ok(near(plan(r, 'sep').total, 37500), 'S-corp SEP = 25% x 150,000 regardless of staff', plan(r, 'sep').total)
  ok(near(plan(r, 'sep').staffCost, 62500), 'research vector: staff 62,500, ratio 1.67', plan(r, 'sep').staffCost)
}

// ---------- 4. SIMPLE rules ----------
{
  const wage = '40000'
  const at = (n, o = {}) => computePlans(F({ earnings: '100000', age: '45', empCount: String(n), empWage: wage, ...o }))
  ok(at(24).simpleSmall && at(24).simple.employee === 18100, '24 employees + owner = 25: higher limit')
  ok(!at(25).simpleSmall && at(25).simple.employee === 17000, '25 employees + owner = 26: standard limit')
  ok(at(99).simple.available && !at(100).simple.available, '100 employees + owner = 101: not available')
  ok(at(100).warnings.some((w) => w.id === 'simple' && w.level === 'block'), 'flag raised for more than 100')
  ok(at(30).warnings.some((w) => w.id === 'simple26'), 'info about the election for 26-100')
  // Employees paid under $5,000 do not count toward the size tests
  const part = computePlans(F({ earnings: '100000', age: '45', staffMode: 'each', emps: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, wage: '3000', covered: true })) }))
  ok(part.simpleSmall && part.simpleCount === 1, 'part-timers under 5,000 are not counted', part.simpleCount)
  // Catch-up by tier and age
  ok(computePlans(F({ earnings: '100000', age: '55' })).simple.employee === 18100 + 3850, 'age 55 small tier: 21,950')
  ok(computePlans(F({ earnings: '100000', age: '55', empCount: '40', empWage: wage })).simple.employee === 17000 + 4000, 'age 55 standard tier: 21,000')
  ok(computePlans(F({ earnings: '100000', age: '62' })).simple.employee === 18100 + 5250, 'age 62: 23,350')
  ok(computePlans(F({ earnings: '100000', age: '62', empCount: '40', empWage: wage })).simple.employee === 17000 + 5250, 'age 62 standard: 22,250')
  // Participation scales only the match
  const half = at(10, { participation: '50' })
  ok(near(half.simple.variants.match.staffCost, 0.5 * 0.03 * 400000), 'participation 50% halves the match cost', half.simple.variants.match.staffCost)
  ok(near(half.simple.variants.nec.staffCost, 0.02 * 400000), 'non-elective ignores participation')
  // The match is not capped at 360,000 of pay; the 2% is
  const hi = computePlans(F({ earnings: '100000', age: '45', staffMode: 'each', emps: [{ id: 'h', wage: '500000', covered: true }] }))
  ok(near(hi.simple.variants.match.staffCost, 0.03 * 500000), '3% match on the full 500,000', hi.simple.variants.match.staffCost)
  ok(near(hi.simple.variants.nec.staffCost, 0.02 * 360000), '2% non-elective capped at 360,000', hi.simple.variants.nec.staffCost)
}

// ---------- 5. Availability and flags ----------
{
  const none = computePlans(F({ earnings: '100000', age: '45', empCount: '3', empWage: '40000', empCovered: '0' }))
  ok(!none.hasStaff && none.solo.available && none.warnings.some((w) => w.id === 'excluded'), 'all employees excluded: Solo 401(k) stays available with a caution')
  const some = computePlans(F({ earnings: '100000', age: '45', empCount: '3', empWage: '40000', empCovered: '1' }))
  ok(some.hasStaff && !some.solo.available && some.staff.coveredCount === 1 && near(some.staff.payroll, 40000), 'one covered employee blocks the Solo 401(k)')
  const nowage = computePlans(F({ earnings: '100000', age: '45', empCount: '3', empWage: '' }))
  ok(nowage.warnings.some((w) => w.id === 'wage'), 'missing wage flagged')
  const hce = computePlans(F({ earnings: '100000', age: '45', empCount: '2', empWage: '250000' }))
  ok(hce.warnings.some((w) => w.id === 'hce'), 'highly paid employee flagged')
  ok(near(hce.staff.payroll, 2 * 250000), 'wages under the 360,000 cap count in full')
  ok(near(staffOf(F({ staffMode: 'each', emps: [{ id: 'x', wage: '900000', covered: true }] })).payroll, 360000), 'wage above the cap counts at 360,000')
  // each-employee mode matches the average mode
  const avg = computePlans(F({ earnings: '150000', age: '50', empCount: '3', empWage: '45000' }))
  const each = computePlans(F({ earnings: '150000', age: '50', staffMode: 'each', emps: [1, 2, 3].map((i) => ({ id: `e${i}`, wage: '45000', covered: true })) }))
  ok(avg.plans.every((p, i) => near(p.net, each.plans[i].net, 1e-6) && near(p.total, each.plans[i].total, 1e-6)), 'each-employee entry equals average entry')
  ok(each.warnings.length === avg.warnings.length, 'same warnings in both modes')
  // Blank rows are ignored
  const blank = staffOf(F({ staffMode: 'each', emps: [{ id: 'a', wage: '', covered: true }, { id: 'b', wage: '30000', covered: true }] }))
  ok(blank.headcount === 1 && blank.coveredCount === 1, 'blank employee rows are ignored')
}

// ---------- 6. Roth catch-up for an S-corp owner paid over 150,000 ----------
{
  const r = computePlans(F({ earnings: '200000', age: '52', empCount: '4', empWage: '45000' }))
  const sh = plan(r, 'sh401k')
  ok(near(sh.rothCatch, 8000), 'catch-up is Roth for a high-paid S-corp owner', sh.rothCatch)
  ok(near(sh.taxDeferred, (sh.total - 8000) * 0.32), 'Roth catch-up earns no deduction', sh.taxDeferred)
  ok(r.warnings.some((w) => w.id === 'roth'), 'Roth catch-up noted')
  const low = computePlans(F({ earnings: '120000', age: '52', empCount: '4', empWage: '45000' }))
  ok(plan(low, 'sh401k').rothCatch === 0, 'no Roth requirement at 120,000')
  const sched = computePlans(F({ entity: 'se', earnings: '300000', age: '52', empCount: '4', empWage: '45000' }))
  ok(plan(sched, 'sh401k').rothCatch === 0, 'no Roth requirement for a Schedule C owner')
  ok(plan(r, 'sep').rothCatch === 0 && plan(r, 'simple').rothCatch === 0, 'SEP and SIMPLE are exempt')
}

// ---------- 7. Fees, tax rate and state ----------
{
  const base = F({ earnings: '120000', age: '45', empCount: '4', empWage: '45000' })
  const r = computePlans(base)
  ok(near(plan(r, 'sh401k').fees, FEES.sh401k.base + FEES.sh401k.per * 5), 'default fee uses participants including the owner', plan(r, 'sh401k').fees)
  const o = computePlans({ ...base, feeSh: '5000' })
  ok(near(plan(o, 'sh401k').fees, 5000), 'fee override')
  ok(near(plan(o, 'sh401k').net, plan(r, 'sh401k').net - (5000 - plan(r, 'sh401k').fees) * 0.68), 'override flows through net at 1 - 32%')
  const ca = computePlans({ ...base, state: 'CA', bracket: '37' })
  ok(ca.t.rate > 0.4, 'federal bracket plus state rate', ca.t.rate)
  ok(plan(ca, 'sep').taxDeferred > plan(r, 'sep').taxDeferred, 'higher rate defers more')
  const lowSep = computePlans({ ...base, sepRate: '10' })
  ok(near(plan(lowSep, 'sep').staffCost, 0.1 * 180000) && near(plan(lowSep, 'sep').total, 12000), 'SEP at 10%: staff 18,000, owner 12,000', [plan(lowSep, 'sep').staffCost, plan(lowSep, 'sep').total])
  // The 401(k) employer piece does not shrink when the SEP rate is lowered
  ok(near(plan(lowSep, 'sh401k').employer, plan(r, 'sh401k').employer), '401(k) employer piece is independent of the SEP rate')
  // Schedule C SEP at a lower rate uses r / (1 + r)
  const sc = computePlans(F({ entity: 'se', earnings: '100000', age: '40', sepRate: '10' }))
  ok(near(sc.sep.total, sc.adjNet * (0.1 / 1.1)), 'Schedule C owner at 10% gets 9.0909%', sc.sep.total)
}

// ---------- 7a. Review fixes ----------
{
  // The SEP default is the lowest rate that already gives the owner 72,000; a typed rate always wins.
  const hi = computePlans(Fd({ earnings: '500000', age: '45', empCount: '3', empWage: '50000' }))
  ok(near(hi.sepPlanRate, 0.2, 1e-4) && hi.sepDefaulted, 'S-corp at 500,000: SEP defaults to 20%', hi.sepPlanRate)
  ok(near(hi.sep.total, 72000) && near(hi.sep.staffCost, 30000, 1) && near(hi.sep.net, 2640, 1), 'S-corp 500k, 3 x 50k: SEP owner 72,000, staff 30,000, net +2,640', [hi.sep.total, hi.sep.staffCost, hi.sep.net])
  const typed = computePlans(F({ earnings: '500000', age: '45', empCount: '3', empWage: '50000', sepRate: '25' }))
  ok(typed.sepPlanRate === 0.25 && !typed.sepDefaulted && near(typed.sep.net, -2460), 'a typed 25% is respected (net -2,460)', [typed.sepPlanRate, typed.sep.net])
  const mid = computePlans(Fd({ earnings: '120000', age: '45', empCount: '2', empWage: '40000' }))
  ok(mid.sepPlanRate === 0.25 && !mid.sepDefaulted, 'at 120,000 the owner never reaches 72,000, so the default stays 25%')
  const sc = computePlans(Fd({ entity: 'se', earnings: '500000', age: '45', empCount: '2', empWage: '50000' }))
  ok(sc.sepDefaulted && near(sc.sep.total, 72000, 1) && sc.sepPlanRate < 0.25, 'Schedule C at 500,000: default is below 25% and the owner still gets 72,000', [sc.sepPlanRate, sc.sep.total])
  const lowerStillHits = computePlans(F({ entity: 'se', earnings: '500000', age: '45', empCount: '2', empWage: '50000', sepRate: String(+((sc.sepPlanRate - 0.01) * 100).toFixed(2)) }))
  ok(lowerStillHits.sep.total < 72000 - 1, 'one point lower and the owner falls short, so the default really is the lowest rate', lowerStillHits.sep.total)
  // No employee's SEP contribution can pass 72,000
  const big = computePlans(F({ earnings: '100000', age: '45', staffMode: 'each', emps: [{ id: 'a', wage: '400000', covered: true }, { id: 'b', wage: '50000', covered: true }] }))
  ok(near(big.sep.staffCost, 72000 + 12500), 'SEP staff cost caps each employee at 72,000', big.sep.staffCost)
  // Highly compensated means MORE than 160,000
  ok(!computePlans(F({ earnings: '100000', empCount: '1', empWage: '160000' })).warnings.some((w) => w.id === 'hce'), '160,000 exactly is not highly compensated')
  ok(computePlans(F({ earnings: '100000', empCount: '1', empWage: '160001' })).warnings.some((w) => w.id === 'hce'), '160,001 is highly compensated')
  // Roth catch-up is flagged with or without staff
  const noStaff = computePlans(F({ earnings: '200000', age: '52' }))
  ok(noStaff.warnings.some((w) => w.id === 'roth') && near(noStaff.solo.rothCatch, 8000), 'Roth catch-up flagged for an S-corp owner with no employees', noStaff.solo.rothCatch)
  ok(!computePlans(F({ earnings: '200000', age: '45' })).warnings.some((w) => w.id === 'roth'), 'no Roth flag under 50')
  // The SIMPLE one-plan rule is stated whenever staff exist
  ok(computePlans(F({ earnings: '120000', age: '45', empCount: '3', empWage: '40000' })).warnings.some((w) => w.id === 'simple-one-plan'), 'SIMPLE one-plan note with staff')
  ok(!computePlans(F({ earnings: '120000', age: '45' })).warnings.some((w) => w.id === 'simple-one-plan'), 'no SIMPLE one-plan note without staff')
  // "all" (the placeholder word) means everyone is covered; a number still limits it
  ok(computePlans(F({ earnings: '100000', empCount: '4', empWage: '30000', empCovered: 'all' })).staff.coveredCount === 4, 'covered = "all" means everyone')
  ok(computePlans(F({ earnings: '100000', empCount: '4', empWage: '30000', empCovered: '2' })).staff.coveredCount === 2, 'covered = 2')
  // An absurd employee count must not hang or crash
  const t0 = Date.now()
  const huge = computePlans(F({ earnings: '100000', empCount: '2000000000', empWage: '30000' }))
  ok(huge.staff.headcount === 100000 && Date.now() - t0 < 2000 && !huge.simple.available, 'huge count is clamped and fast', [huge.staff.headcount, Date.now() - t0])
  // Brackets of 10% and 12% flow through
  const b12 = computePlans(F({ earnings: '90000', age: '40', empCount: '2', empWage: '35000', bracket: '12' }))
  ok(near(b12.t.rate, 0.12) && near(b12.sep.taxDeferred, b12.sep.total * 0.12), '12% bracket works')
}

// ---------- 7b. State auto-IRA mandates ----------
{
  const at = (state, n) => computePlans(F({ earnings: '120000', age: '45', state, empCount: String(n), empWage: '40000' }))
  const flagged = (r) => r.warnings.some((w) => w.id === 'state')
  ok(flagged(at('CA', 1)) && flagged(at('OR', 1)) && flagged(at('MD', 1)), 'CA, OR and MD apply at one employee')
  ok(!flagged(at('NH', 40)) && !flagged(at('TX', 40)) && !flagged(at('FL', 40)), 'NH, TX and FL have no mandate at any size')
  ok(!flagged(at('VT', 1)) && flagged(at('VT', 2)), 'Vermont starts at 2 employees')
  ok(!flagged(at('CT', 4)) && flagged(at('CT', 5)), 'Connecticut starts at 5')
  ok(!flagged(at('NV', 5)) && flagged(at('NV', 6)), 'Nevada is more than 5')
  ok(!flagged(at('NJ', 9)) && flagged(at('NJ', 10)) && !flagged(at('NY', 9)) && flagged(at('NY', 10)), 'New Jersey and New York start at 10')
  ok(!flagged(computePlans(F({ earnings: '120000', age: '45', state: 'CA' }))), 'no employees entered: no state flag')
  // The flag follows the employee headcount even when the plan would not cover them
  ok(flagged(computePlans(F({ earnings: '120000', age: '45', state: 'IL', empCount: '8', empWage: '40000', empCovered: '0' }))), 'headcount counts whether or not employees are covered')
  ok(/not open yet/.test(mandateFor('WA', 20).text) && /not open yet/.test(mandateFor('HI', 2).text), 'enacted-but-not-open programs say so')
  ok(!/not open yet/.test(mandateFor('CA', 3).text) && /CalSavers/.test(mandateFor('CA', 3).text), 'live programs name the program')
  ok(mandateFor('NH', 50) === null && mandateFor('CA', 0) === null, 'null when nothing applies')
  ok(Object.values(STATE_MANDATES).every((m) => m.name && m.program && m.min >= 1 && m.rule), 'every state entry is complete')
  ok(Object.keys(STATE_MANDATES).length === 17, '17 states with a program')
}

// ---------- 8. Random invariants ----------
for (let i = 0; i < 400; i++) {
  const entity = pickOne(['se', 'scorp'])
  const earnings = pickOne([0, 20000, 60000, 120000, 185000, 300000, 450000, 900000])
  const age = pickOne([0, 35, 49, 52, 60, 63, 64, 70])
  const mode = pickOne(['avg', 'each'])
  const n = pickOne([0, 1, 2, 5, 12, 40, 99, 120])
  const form = mode === 'avg'
    ? F({ entity, earnings: String(earnings), age: String(age), empCount: String(n), empWage: pickOne(['', '3000', '30000', '60000', '150000', '500000']), empCovered: pickOne(['', '0', '1']), sepRate: pickOne(['25', '10', '']), participation: pickOne(['100', '50', '0']) })
    : F({ entity, earnings: String(earnings), age: String(age), staffMode: 'each', emps: Array.from({ length: Math.min(n, 15) }, (_, k) => ({ id: `r${k}`, wage: String(pickOne([0, 4000, 25000, 70000, 180000, 700000])), covered: rnd() > 0.2 })) })
  const r = computePlans(form)
  const tag = JSON.stringify(form).slice(0, 160)
  const afterTax = (p) => {
    const d = p.deductible
    if (entity === 'scorp') return d - r.t.rate * d
    const sv = selfEmploymentTax(earnings) - selfEmploymentTax(Math.max(0, earnings - d))
    return d - (sv + r.t.rate * (d - sv / 2))
  }
  ok(r.plans.every((p) => ['total', 'employee', 'employer', 'staffCost', 'fees', 'taxDeferred', 'afterTaxCost', 'net', 'perThousand', 'staffRate'].every((k) => Number.isFinite(p[k]))), 'random: every plan figure is finite', tag)
  ok(r.plans.every((p) => p.employee >= 0 && p.employer >= 0 && p.staffCost >= 0 && p.fees >= 0), 'random: no negative amounts', tag)
  ok(r.plans.every((p) => near(p.net, p.taxDeferred - p.afterTaxCost, 1e-6)), 'random: net = tax deferred - after-tax cost', tag)
  ok(r.plans.every((p) => near(p.afterTaxCost, afterTax(p), 1e-6)), 'random: after-tax cost identity', tag)
  ok(r.plans.every((p) => p.afterTaxCost <= p.deductible + 1e-6 && p.afterTaxCost >= 0), 'random: after-tax cost is between zero and the pre-tax cost', tag)
  ok(r.sep.total <= LIMITS.total415c + 1e-6, 'random: SEP within 72,000', tag)
  ok(r.plans.filter((p) => p.id === 'solo' || p.id === 'sh401k').every((p) => p.total <= LIMITS.total415c + LIMITS.superCatchUp401k + 1e-6), 'random: 401(k) within limit plus catch-up', tag)
  ok(r.hasStaff ? !r.solo.available : r.solo.available, 'random: Solo 401(k) available only without covered staff', tag)
  ok(!r.hasStaff || r.usable.every((p) => p.net <= r.best.net + 1e-6), 'random: best has the highest net when staff exist', tag)
  if (r.hasStaff) {
    ok(near(r.sh401k.staffCost, 0.03 * r.staff.payroll, 1e-6), 'random: safe harbor staff cost is 3% of covered pay', tag)
    ok(r.sep.staffCost <= 0.25 * r.staff.payroll + 1e-6, 'random: SEP staff cost within 25% of covered pay', tag)
    ok(r.sh401k.employer + r.sh401k.staffCost <= 0.25 * (r.sh401k.base.comp + r.staff.payroll) + 1e-6, 'random: safe harbor within the 25% deduction ceiling', tag)
  }
  ok(near(computePlans({ ...form }).best.net, r.best.net, 1e-9), 'random: deterministic', tag)
}

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
