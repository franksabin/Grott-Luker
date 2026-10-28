// Tests for the entity-level state business tax rules and their use in the owner-compensation comparison.
// Run with: node scripts/test-statebiz.mjs   (or npm run test:engine)
// Expected values are worked by hand from the statute; see the notes in src/lib/stateBusinessTax.js.
import { entityTax, nhThresholds, businessStateInfo, MODELED_STATES } from '../src/lib/stateBusinessTax.js'
import { compute } from '../src/lib/ownerComp.js'
import { selfEmploymentTax } from '../src/lib/tax.js'

let pass = 0
let fail = 0
const ok = (cond, msg, extra) => {
  if (cond) pass++
  else {
    fail++
    console.log('FAIL:', msg, extra ?? '')
  }
}
const eq = (a, b, msg) => ok(a === b, msg, [a, b])

const base = { netProfit: 300000, salary: 120000, employerFica: 9180, grossReceipts: null, taxYear: 2026 }

// ---------- New Hampshire, S corporation ----------
{
  const e = entityTax('NH', 'scorp', base)
  eq(e.betBase, 290820, 'S corp BET base = salary 120,000 + distribution 170,820')
  eq(e.bet, 1600, 'S corp BET = 0.55% of 290,820')
  eq(e.bptBase, 169220, 'S corp BPT base = 300,000 - 120,000 - 9,180 - BET 1,600')
  eq(e.bpt, 12692, 'S corp BPT = 7.5% of 169,220')
  eq(e.credit, 1600, 'BET credited against the BPT')
  eq(e.total, 12692, 'total is the larger of BPT and BET when the BPT is larger')
  eq(e.unusedCredit, 0, 'no unused credit')
  eq(e.federalDeduction, 12692, 'an S corporation deducts all of its entity taxes federally')
  const hi = entityTax('NH', 'scorp', { ...base, nhBptRatePct: 8.5 })
  eq(hi.bpt, 14384, 'BPT at an 8.5% rate = 14,384')
}

// ---------- New Hampshire, sole proprietor ----------
{
  const e = entityTax('NH', 'sole', base)
  eq(e.betBase, 277050, 'sole prop BET base = net SE earnings 300,000 x 92.35%')
  eq(e.bet, 1524, 'sole prop BET = 0.55% of 277,050')
  eq(e.ownerPay, 120000, 'default deduction is the S-corp salary')
  eq(e.bptBase, 178476, 'BPT base = 300,000 - BET 1,524 - owner pay 120,000')
  eq(e.bpt, 13386, 'sole prop BPT = 7.5% of 178,476')
  eq(e.total, 13386, 'total = BPT when BPT is larger than the BET')
  eq(e.federalDeduction, 1524 + 11862, 'default: the BET and the BPT after credit are deducted federally (Rev. Rul. 81-288)')
  const itemized = entityTax('NH', 'sole', { ...base, nhSoleFed: 'itemized' })
  eq(itemized.federalDeduction, 1524, 'personal-state-tax alternative deducts only the BET')
  eq(itemized.bpt, 13386, 'the BPT itself is the same under either federal treatment')
  const safe = entityTax('NH', 'sole', { ...base, nhPayMethod: 'safe' })
  eq(safe.ownerPay, 75000, 'safe harbor deduction is 75,000')
  eq(safe.bpt, 16761, 'BPT with the safe harbor = 7.5% of 223,476')
  const custom = entityTax('NH', 'sole', { ...base, nhPayMethod: 'custom', nhPayCustom: 50000 })
  eq(custom.bpt, 18636, 'BPT with a 50,000 deduction = 7.5% of 248,476')
  // Earned income is net earnings from self-employment under IRC 1402: 92.35% of Schedule C profit (Rev 301.13).
  // With the BPT deducted on Schedule C it lowers Schedule C profit, and so the cap, so the cap is solved by iteration.
  const full = entityTax('NH', 'sole', { ...base, nhPayMethod: 'earned' })
  eq(full.ownerPay, 275455, 'full earned income, BPT deducted: 92.35% of (298,476 less the 203 BPT after credit)')
  eq(full.bptAfterCredit, 203, 'BPT after the BET credit on the amount earned income does not cover')
  eq(full.bpt, 1727, 'BPT = 7.5% of 298,476 - 275,455')
  eq(full.total, 1727, 'total is the BPT when the BPT is the larger')
  eq(full.ownerPay, Math.round(0.9235 * (298476 - full.bptAfterCredit)), 'the cap is 92.35% of Schedule C profit after the BPT deduction')
  const fullItem = entityTax('NH', 'sole', { ...base, nhPayMethod: 'earned', nhSoleFed: 'itemized' })
  eq(fullItem.ownerPay, Math.round(0.9235 * 298476), 'full earned income, BPT not deducted: 92.35% of 298,476')
  eq(fullItem.bpt, 1712, 'BPT = 7.5% of 298,476 - 275,643 (22,833)')
  const over = entityTax('NH', 'sole', { ...base, nhPayMethod: 'custom', nhPayCustom: 900000 })
  eq(over.ownerPay, full.ownerPay, 'the deduction cannot exceed earned income')
  const tiny = entityTax('NH', 'sole', { netProfit: 400, salary: 0, employerFica: 0, grossReceipts: 200000, taxYear: 2026, nhPayMethod: 'earned' })
  eq(tiny.ownerPay, 0, 'no deduction when net earnings from self-employment are under $400')
  // A BET larger than the BPT: an S corporation paying almost all of its profit as salary.
  const bigSalary = entityTax('NH', 'scorp', { netProfit: 300000, salary: 280000, employerFica: 15499, grossReceipts: null, taxYear: 2026 })
  eq(bigSalary.bet, 1565, 'BET = 0.55% of 280,000 + 4,501')
  eq(bigSalary.bpt, 220, 'BPT = 7.5% of 2,936')
  eq(bigSalary.total, 1565, 'total is the BET when the BET is larger')
  eq(bigSalary.unusedCredit, 1345, 'the unused BET credit is shown')
}

// ---------- New Hampshire thresholds ----------
{
  const low = entityTax('NH', 'scorp', { netProfit: 100000, salary: 40000, employerFica: 3060, grossReceipts: 100000, taxYear: 2026 })
  eq(low.total, 0, 'gross receipts of 100,000 are below both return thresholds')
  ok(low.notes.some((n) => /Below both/.test(n)), 'a note says no return is required')
  const assumed = entityTax('NH', 'scorp', { netProfit: 100000, salary: 40000, employerFica: 3060, grossReceipts: null, taxYear: 2026 })
  eq(assumed.bpt, 4271, 'blank receipts are assumed above the BPT threshold: 7.5% of 56,940')
  eq(assumed.grossAssumed, true, 'the assumption is flagged')
  ok(assumed.notes.some((n) => /assumed to exceed/.test(n)), 'a note states the assumption')
  const mid = entityTax('NH', 'scorp', { netProfit: 120000, salary: 50000, employerFica: 3825, grossReceipts: null, taxYear: 2026 })
  eq(mid.bet, 0, 'receipts of 120,000 and a base under 298,000 owe no BET')
  eq(mid.bpt, 4963, 'BPT = 7.5% of 120,000 - 50,000 - 3,825')
  eq(mid.total, 4963, 'only the BPT is owed')
  const withReceipts = entityTax('NH', 'scorp', { netProfit: 120000, salary: 50000, employerFica: 3825, grossReceipts: 400000, taxYear: 2026 })
  eq(withReceipts.bet, 639, 'receipts of 400,000 trigger the BET on a base of 116,175')
  eq(withReceipts.bpt, 4915, 'the BET deduction lowers the BPT base to 65,536')
  eq(withReceipts.total, 4915, 'the BET credit leaves the total at the BPT')
  eq(nhThresholds(2026).bpt, 109000, 'BPT threshold 109,000 in 2026')
  eq(nhThresholds(2026).bet, 298000, 'BET threshold 298,000 in 2026')
  eq(nhThresholds(2027).bet, 400000, 'BET threshold 400,000 from 2027')
  const y27 = entityTax('NH', 'scorp', { netProfit: 330000, salary: 60000, employerFica: 4590, grossReceipts: 350000, taxYear: 2027 })
  eq(y27.bet, 0, 'receipts of 350,000 are under the 2027 BET threshold')
  const noReceipts = entityTax('NH', 'scorp', base)
  ok(noReceipts.notes.some((n) => /not entered/.test(n)), 'a note says gross receipts were assumed')
}

// ---------- Other modeled states ----------
{
  eq(entityTax('CA', 'scorp', base).total, 2562, 'CA S corp tax = 1.5% of 170,820')
  eq(entityTax('CA', 'scorp', { netProfit: 40000, salary: 30000, employerFica: 2295, taxYear: 2026 }).total, 800, 'CA minimum is 800')
  eq(entityTax('CA', 'sole', base).total, 0, 'CA sole proprietor owes no entity tax here')
  eq(entityTax('IL', 'scorp', base).total, 2562, 'IL replacement tax = 1.5% of 170,820')
  eq(entityTax('IL', 'sole', base).total, 0, 'IL sole proprietor owes none here')
  eq(entityTax('MA', 'scorp', base).total, 456, 'MA minimum excise is 456')
  ok(entityTax('MA', 'scorp', { ...base, grossReceipts: 7000000 }).notes.length > 0, 'MA warns when receipts reach 6 million')
  eq(entityTax('CA', 'scorp', base).federalDeduction, 2562, 'CA tax is deducted federally by the S corporation')
}

// ---------- Unreviewed states are reported as not modeled ----------
{
  for (const code of ['FL', 'TX', 'TN', 'WA', 'OH', 'NY', 'ME', 'VT']) {
    const e = entityTax(code, 'scorp', base)
    eq(e.total, 0, `${code} adds nothing`)
    eq(e.applies, false, `${code} does not apply a rule`)
    const info = businessStateInfo(code, code)
    eq(info.status, 'unreviewed', `${code} is unreviewed`)
    ok(info.notice.includes('not modeled'), `${code} carries a not-modeled notice`)
  }
  ok(businessStateInfo('TX', 'Texas').notice.includes('franchise'), 'Texas notice names its franchise tax')
  for (const code of Object.keys(MODELED_STATES)) eq(businessStateInfo(code, code).status, 'modeled', `${code} is modeled`)
}

// ---------- compute(): the sample client in New Hampshire ----------
{
  const sample = { netProfit: '300000', salary: '120000', otherIncome: '0', filing: 'married', state: 'NH' }
  const r = compute(sample)
  eq(r.scorpEntityTax, 12692, 'compute: S corp NH tax')
  eq(r.soleEntityTax, 13386, 'compute: sole prop NH tax')
  eq(r.distribution, 158128, 'compute: K-1 income = 300,000 - 120,000 - 9,180 - 12,692')
  eq(r.soleProfit, 300000 - 1524 - 11862, 'compute: Schedule C profit after the BET and the BPT, both deducted by default')
  eq(r.savings, r.soleTotal - r.scorpTotal, 'compute: savings is the difference of the totals')
  eq(r.soleTotal, r.se + r.soleIncomeTax + r.soleState + r.soleEntityTax, 'compute: sole total includes the entity tax')
  eq(r.scorpTotal, r.fica + r.scorpIncomeTax + r.scorpState + r.scorpEntityTax, 'compute: S corp total includes the entity tax')
  eq(r.entityChange, 12692 - 13386, 'compute: entity change is S corp minus sole prop')
  const itemized = compute({ ...sample, nhSoleFed: 'itemized' })
  eq(itemized.soleProfit, 300000 - 1524, 'compute: without the BPT deduction Schedule C profit falls only by the BET')
  ok(itemized.savings > r.savings, 'compute: not deducting the sole prop BPT widens the S corp advantage', [itemized.savings, r.savings])
  const fl = compute({ ...sample, state: 'FL' })
  eq(fl.soleEntityTax + fl.scorpEntityTax, 0, 'compute: Florida adds no entity tax')
}

// ---------- compute(): business state versus home state ----------
{
  const sample = { netProfit: '300000', salary: '120000', otherIncome: '0', filing: 'married', state: 'MA', bizState: 'NH' }
  const off = compute(sample)
  eq(off.bizCode, 'NH', 'business state is NH')
  eq(off.stateCode, 'MA', 'owner state is MA')
  eq(off.bizDiffers, true, 'the states differ')
  eq(off.soleHomeCredit + off.scorpHomeCredit, 0, 'no home-state credit unless turned on')
  ok(off.scorpState > 0 && off.soleState > 0, 'MA personal tax still applies to the owner')
  const on = compute({ ...sample, homeCredit: 'yes' })
  eq(on.scorpHomeCredit, Math.min(on.scorpState + on.scorpHomeCredit, on.scorpEntityTax), 'credit is capped at the personal tax and the entity tax')
  eq(on.soleState, off.soleState - on.soleHomeCredit, 'sole prop state tax falls by the credit')
  ok(on.savings !== off.savings, 'the credit changes the comparison')
  const same = compute({ ...sample, state: 'NH', homeCredit: 'yes' })
  eq(same.homeCredit, false, 'no credit when the business and the owner are in the same state')
}

// ---------- Invariants over random inputs ----------
{
  let seed = 31337
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  for (let k = 0; k < 3000; k++) {
    const form = {
      netProfit: String(pick([0, 20000, 60000, 109000, 150000, 300000, 600000, 1500000])),
      salary: String(pick([0, 30000, 80000, 120000, 300000])),
      otherIncome: String(pick([0, 40000])),
      filing: pick(['single', 'married']),
      state: pick(['NH', 'MA', 'ME', 'CA', 'IL', 'TX', 'FL']),
      bizState: pick(['', '', 'NH', 'CA', 'IL', 'MA', 'TX']),
      receipts: pick(['', '', '250000', '500000', '5000000']),
      nhBptRate: pick(['', '7.5', '8.5']),
      nhPayMethod: pick(['salary', 'safe', 'earned', 'custom']),
      nhPayCustom: pick(['', '40000', '900000']),
      nhSoleFed: pick(['itemized', 'expense']),
      homeCredit: pick(['no', 'yes']),
    }
    const r = compute(form)
    ok(r.soleEntityTax >= 0 && r.scorpEntityTax >= 0, 'entity taxes never negative')
    ok(r.distribution >= 0, 'distribution never negative')
    eq(r.savings, r.soleTotal - r.scorpTotal, 'savings foots')
    ok(r.soleEntity.credit <= r.soleEntity.bet || !r.soleEntity.applies, 'credit never exceeds the BET')
    if (r.bizCode === 'NH') {
      for (const e of [r.soleEntity, r.scorpEntity]) {
        eq(e.total, Math.max(e.bpt, e.bet), 'NH total is the larger of BPT and BET')
        eq(e.credit, Math.min(e.bet, e.bpt), 'NH credit is the smaller of BPT and BET')
        ok(e.federalDeduction <= e.total + 1e-9, 'federal deduction never exceeds the tax paid')
      }
    }
    ok(r.soleState >= 0 && r.scorpState >= 0, 'state tax after the credit is never negative')
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
