import { computeHsa, ficaSaved, ficaExplain, hsaFlags, parseAmount, plural, HSA, DEFAULTS } from '../src/lib/hsa.js'
import { money } from '../src/lib/format.js'
import { getState } from '../src/lib/states.js'
import { SS_WAGE_BASE } from '../src/lib/tax.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol
let seed = 4242
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pickOne = (a) => a[Math.floor(rnd() * a.length)]

// Defaults, as on the page: self-only, 40, full year, not eligible on December 1 unless chosen, qualifying plan, payroll deduction, 24%, NH
// (no state tax), 6% growth, retire at 65, $2,000 a year of bills.
const F = (o) => ({ coverage: 'self', age: '40', spouseAge: '', months: '', dec1: 'no', plan: 'yes', medicare: 'no', funding: 'payroll', wages: '', employer: '', amount: '', bracket: '24', state: 'NH', balance: '', retireAge: '65', growth: '6', spend: '2000', ...o })
// Future value of a level end-of-year deposit d for n years at growth g.
const annuity = (d, n, g) => (g === 0 ? d * n : (d * ((1 + g) ** n - 1)) / g)

// ---------- 0. Reading what a person types ----------
{
  ok(parseAmount('250k') === 250000 && parseAmount('1.5K') === 1500 && parseAmount('$1,234.50') === 1234.5 && parseAmount(' 12 000 ') === 12000, 'k means thousand; $, commas and spaces are ignored')
  ok(parseAmount('−5') === -5 && parseAmount('–10') === -10 && parseAmount('-3') === -3 && parseAmount('(500)') === -500, 'Unicode minus, en dash and parentheses are negative')
  ok(parseAmount('') === 0 && parseAmount(null) === 0 && parseAmount(undefined) === 0 && parseAmount('abc') === 0 && parseAmount(Infinity) === 0 && parseAmount(7) === 7, 'blank, junk and non-finite read as 0; numbers pass through')
  ok(computeHsa(F({ wages: '100k' })).wages === 100000 && computeHsa(F({ growth: '−10' })).growth === -0.1, '100k pay and a Unicode-minus growth are read correctly by the engine')
  ok(plural(1, 'year') === '1 year' && plural(2, 'year') === '2 years' && plural(0, 'month') === '0 months' && plural(12, 'month') === '12 months', 'plural')
}

// ---------- 1. The 2026 limits ----------
{
  ok(HSA.self === 4400 && HSA.family === 8750 && HSA.catchUp === 1000, 'limits: 4,400 / 8,750 / 1,000')
  ok(computeHsa(F()).limit === 4400, 'self-only under 55: 4,400', computeHsa(F()).limit)
  ok(computeHsa(F({ coverage: 'family' })).limit === 8750, 'family under 55: 8,750')
  ok(computeHsa(F({ age: '54' })).limit === 4400 && computeHsa(F({ age: '55' })).limit === 5400 && computeHsa(F({ age: '54.9' })).limit === 4400, 'catch-up starts at exactly 55')
  ok(computeHsa(F({ coverage: 'family', age: '55', spouseAge: '57' })).limit === 10750, 'family, both 55+: 8,750 + 2 × 1,000')
  ok(computeHsa(F({ coverage: 'family', age: '50', spouseAge: '56' })).limit === 9750, 'family, only the spouse 55+: 9,750')
  ok(computeHsa(F({ coverage: 'family', age: '50', spouseAge: '55' })).limit === 9750 && computeHsa(F({ coverage: 'family', age: '50', spouseAge: '54' })).limit === 8750, 'the spouse’s catch-up also starts at exactly 55')
  ok(computeHsa(F({ coverage: 'family', age: '56', spouseAge: '' })).limit === 9750, 'family, spouse age blank: no spouse catch-up')
  ok(computeHsa(F({ coverage: 'self', age: '40', spouseAge: '60' })).limit === 4400, 'self-only ignores a spouse age')
  ok(computeHsa(F({ age: '' })).limit === 4400, 'blank age: no catch-up, still 4,400')
}

// ---------- 1b. Worked examples from the research (IRS Notice 2008-52, Pub. 969, Form 8889 instructions; 2026 figures) ----------
{
  const v1 = computeHsa(F({ age: '42', employer: '1200' }))
  ok(v1.limit === 4400 && v1.room === 3200, 'V1: age 42, self-only, employer 1,200: limit 4,400, room 3,200', [v1.limit, v1.room])
  ok(computeHsa(F({ age: '56', coverage: 'family' })).limit === 9750, 'V2: age 56, family: 9,750')
  const v3 = F({ age: '40', months: '2' })
  ok(near(computeHsa({ ...v3, dec1: 'no' }).limit, 733.33) && computeHsa({ ...v3, dec1: 'yes' }).limit === 4400, 'V3: new plan Nov 1: 733.33 without the last-month rule, 4,400 with it', [computeHsa({ ...v3, dec1: 'no' }).limit])
  ok(near(computeHsa(F({ age: '45', coverage: 'family', months: '8', dec1: 'no' })).limit, 8 * 729.1667, 0.01), 'V5: family Jan–Aug then no plan: 8 × 729.17 = 5,833.33', computeHsa(F({ age: '45', coverage: 'family', months: '8', dec1: 'no' })).limit)
  ok(near(computeHsa(F({ age: '66', months: '6', dec1: 'no' })).limit, 2700), 'V6: age 66 self-only, Medicare starts July 1: (4,400 + 1,000) × 6/12 = 2,700')
  ok(computeHsa(F({ age: '58', coverage: 'family', spouseAge: '56' })).limit === 10750, 'V7: couple 58 and 56 on family coverage: 8,750 + 1,000 + 1,000')
  ok(computeHsa(F({ age: '58', coverage: 'family', spouseAge: '' })).limit === 9750, 'V8: husband 58 on family coverage, wife on Medicare (spouse age left blank): 9,750')
  ok(computeHsa(F({ age: '57', coverage: 'family', months: '3', dec1: 'yes' })).limit === 9750, 'V11: age 57 family on the last-month rule: the full 9,750, catch-up included')
}

// ---------- 2. Part-year eligibility ----------
{
  ok(computeHsa(F({ months: '12' })).limit === 4400, '12 months: full limit')
  ok(near(computeHsa(F({ months: '6', dec1: 'no' })).limit, 2200), '6 months, not eligible on Dec 1: 2,200', computeHsa(F({ months: '6', dec1: 'no' })).limit)
  const lm = computeHsa(F({ months: '6', dec1: 'yes' }))
  ok(lm.limit === 4400 && lm.lastMonth && !lm.prorated, '6 months but eligible on Dec 1: full limit (last-month rule)')
  ok(near(computeHsa(F({ months: '3', dec1: 'no', coverage: 'family' })).limit, 8750 / 4), '3 months family: a quarter of 8,750')
  ok(computeHsa(F({ months: '0', dec1: 'no' })).months === 1 && computeHsa(F({ months: '99', dec1: 'no' })).months === 12, 'months clamp to 1–12')
  // The December 1 rule has to be chosen: an unset or "no" answer never grants the full-year limit
  const unset = computeHsa({ ...F({ age: '66', months: '6' }), dec1: undefined })
  ok(!unset.lastMonth && near(unset.limit, 2700), 'December 1 unset: age 66 and 6 months gives 2,700, not 5,400', unset.limit)
  ok(near(computeHsa(F({ age: '66', months: '6' })).limit, 2700), 'the page default (No) gives 2,700 for a Medicare-mid-year client')
  ok(!computeHsa(F({ months: '12', dec1: 'yes' })).lastMonth, 'a full year is not "last-month rule"')
  ok(near(computeHsa(F({ coverage: 'family', age: '56', spouseAge: '57', months: '6', dec1: 'no' })).catchAmount, 1000), 'catch-up shown for 2 spouses prorated is 2,000 × 6/12 = 1,000')
  ok(computeHsa(F({ age: '56' })).catchAmount === 1000 && computeHsa(F()).catchAmount === 0, 'catch-up amount: 1,000 at 55+, none under')
}

// ---------- 3. Employer money, the typed amount, excess ----------
{
  const emp = computeHsa(F({ coverage: 'family', employer: '3000' }))
  ok(emp.room === 5750 && emp.contribution === 5750 && emp.excess === 0 && emp.employerCounted === 3000, 'family 8,750 less 3,000 from the employer: 5,750 of room', emp.room)
  const big = computeHsa(F({ employer: '9000' }))
  ok(big.room === 0 && big.employerCounted === 4400 && big.employerExcess === 4600, 'employer over the limit: no room, only the limit is counted, 4,600 is excess', [big.room, big.employerCounted, big.employerExcess])
  ok(big.projection.yearly === 4400, 'employer 9,000 against a 4,400 limit: the projection deposits 4,400, not 9,000', big.projection.yearly)
  const over = computeHsa(F({ amount: '6000' }))
  ok(over.contribution === 4400 && over.excess === 1600, 'typing 6,000 against 4,400: contribution 4,400, excess 1,600', [over.contribution, over.excess])
  const under = computeHsa(F({ amount: '1500' }))
  ok(under.contribution === 1500 && under.excess === 0, 'typing less than the room is honored')
  ok(computeHsa(F({ amount: '0' })).contribution === 0, 'typing 0 means no contribution')
  ok(computeHsa(F({ amount: '-50' })).contribution === 0, 'negative amounts become 0')
  ok(computeHsa(F({ employer: '-500' })).room === 4400, 'a negative employer amount is ignored')
  ok(computeHsa(F({ employer: '0.0001' })).employerExcess === 0 && computeHsa(F({ employer: '4400.4' })).employerExcess < 0.5, 'a sub-dollar overage is tiny, not a defect')
}

// ---------- 4. Not eligible ----------
{
  const med = computeHsa(F({ medicare: 'yes', age: '66' }))
  ok(!med.eligible && med.room === 0 && med.contribution === 0 && med.projection === null && med.taxSaved === 0, 'Medicare: not eligible, nothing saved, no projection')
  const np = computeHsa(F({ plan: 'no' }))
  ok(!np.eligible && np.contribution === 0 && np.projection === null, 'no qualifying plan: not eligible')
  ok(computeHsa(F({ plan: 'no', amount: '4000' })).excess === 0 && computeHsa(F({ plan: 'no', employer: '9000' })).employerExcess === 0, 'ineligible: no excess is reported (the flag explains why)')
}

// ---------- 5. Tax saved this year ----------
{
  // NH has no wage tax; payroll deduction with pay blank = under the wage base: 24% + 7.65%
  const r = computeHsa(F())
  ok(near(r.fedSaved, 4400 * 0.24) && r.stateSaved === 0 && near(r.ficaSaved, 4400 * 0.0765), 'payroll, NH, pay blank: federal 1,056 + payroll tax 336.60', [r.fedSaved, r.ficaSaved])
  ok(near(r.taxSaved, 4400 * (0.24 + 0.0765)), 'total 1,392.60', r.taxSaved)
  const pa = computeHsa(F({ state: 'PA' }))
  ok(near(pa.stateSaved, 4400 * getState('PA').wage / 100), 'PA saves its flat rate on the contribution', pa.stateSaved)
  for (const code of ['CA', 'NJ']) {
    const x = computeHsa(F({ state: code }))
    ok(x.stateSaved === 0 && !x.stateConforms, `${code} does not follow the federal deduction: no state saving`, x.stateSaved)
  }
  ok(computeHsa(F({ state: 'NY' })).stateConforms, 'NY follows the federal deduction')
  ok(computeHsa(F({ state: '' })).stateName === 'New Hampshire' && computeHsa(F({ state: 'ZZ' })).stateName === 'New Hampshire', 'a blank or unknown state falls back to New Hampshire')
  // Pay above the wage base: only the 1.45% Medicare is saved
  const hi = computeHsa(F({ wages: '250000' }))
  ok(near(hi.ficaSaved, 4400 * 0.0145), 'pay 250,000: Medicare only, 63.80', hi.ficaSaved)
  // Pay that straddles the base: 186,000 less 4,400 leaves 181,600, so 2,900 of the contribution was in the Social Security zone
  ok(near(ficaSaved(186000, 4400), 0.062 * 2900 + 0.0145 * 4400), 'pay 186,000 straddles the base: 6.2% on 2,900 + 1.45% on 4,400 = 243.60', ficaSaved(186000, 4400))
  ok(near(ficaSaved(SS_WAGE_BASE, 4400), 4400 * 0.0765), 'pay exactly at the base: the whole contribution still comes off Social Security pay, full 7.65%', ficaSaved(SS_WAGE_BASE, 4400))
  ok(near(ficaSaved(SS_WAGE_BASE + 4400, 4400), 4400 * 0.0145) && near(ficaSaved(SS_WAGE_BASE + 4399, 4400), 0.062 * 1 + 4400 * 0.0145), 'Medicare only from base + contribution; one dollar below that, 6.2% on a dollar more', [ficaSaved(SS_WAGE_BASE + 4400, 4400), ficaSaved(SS_WAGE_BASE + 4399, 4400)])
  ok(near(ficaSaved(60000, 4400), 4400 * 0.0765), 'pay 60,000: the full 7.65%')
  ok(near(ficaSaved(null, 4400), 4400 * 0.0765), 'pay blank (null) is treated as under the base')
  ok(ficaSaved(0, 4400) === 0, 'zero pay: nothing to deduct, nothing saved')
  ok(near(ficaSaved(1000, 4400), 1000 * 0.0765), 'payroll cannot deduct more than the pay: saving on 1,000 only')
  ok(ficaSaved(60000, 0) === 0, 'no contribution saves nothing')
  // On the tax return instead of payroll: income tax only, no payroll-tax saving
  const own = computeHsa(F({ funding: 'return', state: 'PA' }))
  ok(own.ficaSaved === 0 && near(own.taxSaved, 4400 * (0.24 + getState('PA').wage / 100)), 'deducted on the return: no payroll-tax saving', own.taxSaved)
  // Employer money is not counted as a saving of the employee's own
  ok(near(computeHsa(F({ employer: '1000' })).fedSaved, 3400 * 0.24), 'the saving is on the employee’s own contribution only')
  // The bracket choice
  ok(near(computeHsa(F({ bracket: '10' })).fedSaved, 440) && near(computeHsa(F({ bracket: '37' })).fedSaved, 4400 * 0.37), 'bracket drives the federal saving')
  ok(near(computeHsa(F({ bracket: '' })).fed, 0.24), 'blank bracket falls back to 24%')
  ok(computeHsa(F({ bracket: '240' })).fed === 0.5 && computeHsa(F({ bracket: '-5' })).fed === 0, 'the bracket is clamped to 0%–50%')
}

// ---------- 5b. Validation cases from the tax research ----------
{
  // (1) W-2 single, pay 100,000, 22% bracket, NH, 4,400 through payroll: 968 + 272.80 + 63.80 = 1,304.60
  const a = computeHsa(F({ wages: '100000', bracket: '22' }))
  ok(near(a.fedSaved, 968) && near(a.ficaSaved, 336.6) && near(a.taxSaved, 1304.6), 'research case 1: 968 federal + 336.60 payroll tax = 1,304.60', [a.fedSaved, a.ficaSaved, a.taxSaved])
  // (2) pay 187,000 straddles the wage base: 117.80 Social Security + 63.80 Medicare = 181.60
  ok(near(ficaSaved(187000, 4400), 181.6), 'research case 2: pay 187,000 saves 181.60, not 336.60', ficaSaved(187000, 4400))
  // (3) pay 202,000: Social Security already stopped, Medicare 63.80 (the 0.9% Additional Medicare Tax, 18.00 here, is not modeled)
  ok(near(ficaSaved(202000, 4400), 63.8), 'research case 3: pay 202,000 saves Medicare only, 63.80 (the 18.00 Additional Medicare Tax is disclosed, not modeled)', ficaSaved(202000, 4400))
  // (4) sole proprietor: income tax only, no SE tax saving
  const sp = computeHsa(F({ funding: 'return', bracket: '22' }))
  ok(near(sp.taxSaved, 968) && sp.ficaSaved === 0, 'research case 4: self-employed saves 968 and no SE tax', sp.taxSaved)
  // (5) California resident, family limit 8,750: federal and payroll tax, no state
  const ca = computeHsa(F({ coverage: 'family', state: 'CA', wages: '100000', bracket: '24' }))
  ok(ca.stateSaved === 0 && near(ca.fedSaved, 8750 * 0.24) && near(ca.ficaSaved, 8750 * 0.0765), 'research case 5: California saves no state tax on 8,750', [ca.stateSaved, ca.fedSaved, ca.ficaSaved])
  // Pay below the contribution: only the pay itself can come out of payroll
  ok(near(computeHsa(F({ wages: '2000' })).ficaSaved, 2000 * 0.0765), 'pay under the contribution: payroll tax saved only on the pay')
}

// ---------- 5c. The wording of the payroll-tax line in the math trace ----------
{
  const ex = (o) => ficaExplain(computeHsa(F(o)))
  ok(/deducted on the return/.test(ex({ funding: 'return' })), 'trace: on-the-return funding says there is no payroll-tax saving')
  ok(/7\.65%/.test(ex({})) && /assumed to be under/.test(ex({})), 'trace: blank pay says the full 7.65% on an assumed pay under the base')
  ok(/Medicare \+ \$2,900\.00 × 6\.2% Social Security/.test(ex({ wages: '186000' })), 'trace: pay that straddles the base shows the 2,900 in the Social Security zone', ex({ wages: '186000' }))
  ok(/above the \$184,500 Social Security wage base/.test(ex({ wages: '250000' })), 'trace: high pay says it is above the wage base')
  ok(!/above/.test(ex({ wages: '60000', employer: '4400' })) && /nothing is saved/.test(ex({ wages: '60000', employer: '4400' })), 'trace: an employer that fills the limit does NOT claim pay is above the base', ex({ wages: '60000', employer: '4400' }))
  ok(!/above/.test(ex({ wages: '60000', amount: '0' })) && /nothing is saved/.test(ex({ wages: '60000', amount: '0' })), 'trace: a $0 contribution does not blame pay either')
  ok(/pay is \$0/.test(ex({ wages: '0' })), 'trace: $0 pay says there is nothing to deduct')
  ok(/can only deduct the pay itself/.test(ex({ wages: '2000' })), 'trace: pay under the contribution says only the pay can be deducted')
}

// ---------- 6. Projection, hand-computed and closed-form ----------
{
  // 40 → 65 with no growth and no bills: 25 deposits of 4,400
  const z = computeHsa(F({ growth: '0', spend: '0' })).projection
  ok(z.years === 25 && near(z.investBalance, 110000) && near(z.spendBalance, 110000), '0% growth, no bills: 25 × 4,400 = 110,000', z.investBalance)
  ok(near(z.putIn, 110000) && near(z.growthEarned, 0), 'put in 110,000, growth 0')
  // Level deposit at 6%: the annuity formula
  const g = computeHsa(F({ spend: '0' })).projection
  ok(near(g.investBalance, annuity(4400, 25, 0.06), 0.01), '6% growth: 4,400 a year for 25 years', [g.investBalance, annuity(4400, 25, 0.06)])
  ok(near(g.growthEarned, annuity(4400, 25, 0.06) - 110000), 'growth earned = the annuity less the 110,000 put in')
  // Existing balance grows alongside
  const b0 = computeHsa(F({ balance: '10000', spend: '0' })).projection
  ok(near(b0.investBalance, 10000 * 1.06 ** 25 + annuity(4400, 25, 0.06)), 'a 10,000 starting balance compounds too', b0.investBalance)
  ok(near(b0.putIn, 10000 + 110000) && b0.putInSeries[0] === 10000, 'put in counts the starting balance, and the put-in line starts there')
  ok(computeHsa(F({ balance: '-500', spend: '0' })).projection.putInSeries[0] === 0 && computeHsa(F({ balance: '-500' })).projection.spendBalances[0] === 0, 'a negative balance is treated as 0')
  // Pay from the account: it pays 2,000 a year, so only the net 2,400 grows
  const s = computeHsa(F()).projection
  ok(near(s.spendBalance, annuity(4400 - 2000, 25, 0.06)), 'bills paid from the account: net 2,400 a year', s.spendBalance)
  ok(near(s.extra, annuity(2000, 25, 0.06)), 'what leaving it alone adds = the bills compounded', s.extra)
  ok(s.bank === 2000 * 25, 'receipts banked: 2,000 × 25 years = 50,000', s.bank)
  ok(near(s.gain, annuity(2000, 25, 0.06) - 50000) && s.gain > 0, 'of the extra, the growth is the bills compounded less the 50,000 of bills themselves', s.gain)
  ok(near(computeHsa(F({ growth: '0' })).projection.gain, 0), 'at 0% growth there is no growth: the whole extra is the person’s own money')
  const neg = computeHsa(F({ growth: '-5' })).projection
  ok(neg.investBalance > 0 && neg.investBalance < 25 * 4400 && neg.investBalance >= neg.spendBalance && neg.gain < 0, 'at −5% growth the account shrinks, leaving it alone is still ahead on balance, and the gain is negative', [neg.investBalance, neg.spendBalance, neg.gain])
  // Bills larger than the deposit never push the balance below zero
  const big = computeHsa(F({ spend: '9000' })).projection
  ok(big.spendBalance === 0 && big.spendBalances.every((v) => v >= 0), 'bills above the deposit: balance stops at 0')
  // When the account runs dry it pays only what it has: with no growth, 25 deposits of 4,400 all go to bills, the rest is out of pocket
  const dry = computeHsa(F({ spend: '9000', growth: '0' })).projection
  ok(near(dry.aPaid, 110000) && near(dry.bank, 225000) && near(dry.aOut, 115000), 'bills 9,000, 0% growth: the account pays 110,000 of 225,000; the person still pays 115,000', [dry.aPaid, dry.bank, dry.aOut])
  ok(near(s.aPaid, 50000) && near(s.aPaid, s.bank) && s.aOut === 0, 'bills the account can cover: it pays all 50,000 and the person pays none', [s.aPaid, s.aOut])
  // No growth: the account at the end = start + deposits − what it paid
  const cons = computeHsa(F({ growth: '0', balance: '3000', spend: '2500' })).projection
  ok(near(cons.spendBalance, cons.putIn - cons.aPaid), 'conservation at 0% growth: balance = start + deposits − bills paid', [cons.spendBalance, cons.aPaid])
  ok(s.reimbursable === 50000, 'receipts reimbursable = the bills paid yourself (50,000), capped by the balance', s.reimbursable)
  const capped = computeHsa(F({ spend: '20000', amount: '1000' })).projection
  ok(capped.reimbursable === capped.investBalance && capped.reimbursable < capped.bank, 'reimbursable never exceeds the balance')
  ok(near(big.investBalance, annuity(4400, 25, 0.06)), 'the left-alone balance is unaffected by the bill size')
  // Deposits stop at 65 (Medicare) but growth runs to the retirement age
  const late = computeHsa(F({ retireAge: '70', spend: '0' })).projection
  ok(late.years === 30 && late.depositYears === 25 && near(late.investBalance, annuity(4400, 25, 0.06) * 1.06 ** 5), 'retire at 70: deposits stop at 65, growth continues 5 more years', late.investBalance)
  // The age-65 edge: exactly 65 and not enrolled keeps depositing to the retirement age; 64 deposits once
  const a65 = computeHsa(F({ age: '65', retireAge: '80' })).projection
  const a64 = computeHsa(F({ age: '64', retireAge: '80' })).projection
  ok(a65.years === 15 && a65.depositYears === 15, 'age 65 not enrolled, retire 80: 15 deposits', [a65.years, a65.depositYears])
  ok(a64.years === 16 && a64.depositYears === 1, 'age 64, retire 80: one deposit, then growth only', [a64.years, a64.depositYears])
  const old = computeHsa(F({ age: '66', retireAge: '70', spend: '0' })).projection
  ok(old.years === 4 && old.depositYears === 4 && near(old.investBalance, annuity(5400, 4, 0.06)), 'age 66, not on Medicare, retire 70: 4 deposits of 5,400 (catch-up)', old.investBalance)
  // Employer money is deposited too
  const em = computeHsa(F({ employer: '1000', spend: '0', growth: '0' })).projection
  ok(near(em.investBalance, 25 * 4400) && em.yearly === 4400, 'employer 1,000 + own 3,400 still totals the limit')
  // A part-year start that is not eligible on December 1 means eligibility ended during the year: only this year's deposit is assumed
  const part = computeHsa(F({ months: '6', dec1: 'no', spend: '0', growth: '0' }))
  ok(part.contribution === 2200 && part.projection.yearly === 2200 && part.projection.depositYears === 1 && part.projection.endsThisYear, 'part-year, not eligible on Dec 1: one deposit of 2,200', [part.projection.yearly, part.projection.depositYears])
  ok(near(part.projection.investBalance, 2200) && part.projection.putInSeries[1] === 2200 && part.projection.putInSeries[25] === 2200, 'the put-in line steps to 2,200 and stays there', part.projection.putInSeries.slice(0, 3))
  ok(near(part.projection.taxSavedOverTime, 2200 * 0.3165), 'part-year tax saved over time is this year’s saving once', part.projection.taxSavedOverTime)
  const partG = computeHsa(F({ months: '6', dec1: 'no', spend: '0' })).projection
  ok(near(partG.investBalance, 2200 * 1.06 ** 24), 'the single 2,200 deposit keeps compounding for the other 24 years', partG.investBalance)
  // Medicare started this year, client past 65: 2,700 and no more deposits (this was the path the page's own tooltip prescribes)
  const med66 = computeHsa(F({ age: '66', months: '6', retireAge: '70', spend: '0', growth: '0' }))
  ok(near(med66.limit, 2700) && med66.projection.depositYears === 1 && near(med66.projection.putIn, 2700) && med66.projection.years === 4, 'Medicare mid-year at 66: 2,700, one deposit, balance grows to 70', [med66.limit, med66.projection.depositYears, med66.projection.putIn])
  // Eligible on December 1 (last-month rule) is a full year, and keeps depositing
  const lm2 = computeHsa(F({ months: '6', dec1: 'yes', spend: '0', growth: '0' })).projection
  ok(!lm2.endsThisYear && lm2.depositYears === 25 && near(lm2.investBalance, 25 * 4400), 'eligible on Dec 1: a full year every year', [lm2.depositYears, lm2.investBalance])
  const typedPart = computeHsa(F({ months: '6', dec1: 'no', amount: '1500' })).projection
  ok(typedPart.yearly === 1500 && typedPart.depositYears === 1, 'a typed amount in a part-year start is one deposit too')
  const empPart = computeHsa(F({ months: '3', dec1: 'no', employer: '3000' }))
  ok(empPart.employerCounted === 1100 && empPart.projection.yearly === 1100 && empPart.projection.depositYears === 1, 'part-year with a 3,000 employer seed: 1,100 counted, one deposit', [empPart.employerCounted, empPart.projection.yearly])
  // Time-to-retirement edge cases
  ok(computeHsa(F({ age: '' })).projection === null, 'blank age: no projection')
  ok(computeHsa(F({ age: '17' })).projection === null && computeHsa(F({ age: '18' })).projection?.years === 47, 'under 18: no projection; at 18 the projection runs to 65')
  ok(computeHsa(F({ age: '65', retireAge: '65' })).projection === null, 'at the retirement age: no projection')
  ok(computeHsa(F({ age: '70', retireAge: '65' })).projection === null, 'past the retirement age: no projection')
  ok(computeHsa(F({ retireAge: '30' })).retireAge === 50 && computeHsa(F({ retireAge: '120' })).retireAge === 80, 'retire age clamps to 50–80')
  ok(computeHsa(F({ growth: '99' })).growth === 0.2 && computeHsa(F({ growth: '-99' })).growth === -0.1, 'growth clamps to −10%…20%')
  ok(computeHsa(F({ growth: '' })).growth === 0.06 && computeHsa(F({ spend: '' })).spend === 2000 && computeHsa(F({ retireAge: '' })).retireAge === 65, 'blank assumptions fall back to the defaults')
  ok(computeHsa(F({ spend: '-100' })).spend === 0, 'negative bills become 0')
  // Tax saved over the deposit years: level when nothing changes, and only over the years that deposit
  ok(near(computeHsa(F()).projection.taxSavedOverTime, computeHsa(F()).taxSaved * 25), 'tax saved over time = this year × 25 deposit years')
  const stop = computeHsa(F({ age: '50', retireAge: '70' })).projection
  ok(stop.years === 20 && stop.depositYears === 15 && near(stop.taxSavedOverTime, 1392.6 * 15), 'deposits stop at 65: 15 years of saving, not 20', [stop.years, stop.depositYears, stop.taxSavedOverTime])
  ok(computeHsa(F({ age: '64', retireAge: '66' })).projection.depositYears === 1, 'age 64, retire 66: one deposit year')
}

// ---------- 7. Flags ----------
{
  const ids = (o) => hsaFlags(computeHsa(F(o))).map((w) => w.id)
  const flag = (o, id) => hsaFlags(computeHsa(F(o))).find((w) => w.id === id)
  ok(flag({ medicare: 'yes' }, 'medicare')?.level === 'block', 'Medicare is a block')
  ok(flag({ plan: 'no' }, 'plan')?.level === 'block' && /1,700/.test(flag({ plan: 'no' }, 'plan').text) && /3,400/.test(flag({ plan: 'no' }, 'plan').text), 'no plan is a block that states the 2026 deductibles')
  ok(flag({ amount: '6000' }, 'excess')?.level === 'warn' && /1,600/.test(flag({ amount: '6000' }, 'excess').text), 'excess names the dollars over')
  ok(!ids({}).includes('excess') && !ids({ amount: '4400' }).includes('excess'), 'no excess flag at or under the room')
  ok(!ids({ months: '1', dec1: 'no', amount: '367' }).includes('excess'), 'a sub-dollar overage (367 against 366.67) is not flagged as "$0 over"')
  ok(flag({ employer: '9000' }, 'employer-excess')?.level === 'warn' && /4,600/.test(flag({ employer: '9000' }, 'employer-excess').text), 'employer money over the limit is flagged with the dollars over')
  ok(ids({ months: '6', dec1: 'yes' }).includes('lastmonth') && !ids({ months: '6', dec1: 'no' }).includes('lastmonth') && !ids({ months: '12', dec1: 'yes' }).includes('lastmonth'), 'last-month rule flag only for part-year and eligible on Dec 1')
  ok(/2027/.test(flag({ months: '6', dec1: 'yes' }, 'lastmonth').text) && !/Medicare/.test(flag({ months: '6', dec1: 'yes' }, 'lastmonth').text) && /Medicare/.test(flag({ months: '6', dec1: 'yes', age: '63' }, 'lastmonth').text), 'the testing period runs through 2027; near 65 the flag adds that enrolling in Medicare fails it')
  ok(ids({ months: '6', dec1: 'no' }).includes('prorated'), 'prorated flag')
  ok(ids({ state: 'CA' }).includes('state') && ids({ state: 'NJ' }).includes('state') && !ids({ state: 'NY' }).includes('state'), 'state flag for CA and NJ only')
  ok(ids({ coverage: 'family', age: '56', spouseAge: '57' }).includes('catchup') && !ids({ coverage: 'self', age: '56' }).includes('catchup'), 'catch-up flag for family coverage')
  ok(!ids({ age: '63' }).includes('medicare-soon') && ids({ age: '64' }).includes('medicare-soon') && ids({ age: '66', retireAge: '70' }).includes('medicare-soon') && ids({ age: '80', retireAge: '80' }).includes('medicare-soon') && !ids({ age: '50' }).includes('medicare-soon'), 'Medicare-soon flag from 64 on, for as long as the person is not enrolled')
  ok(ids({ retireAge: '70' }).includes('stop') && !ids({ retireAge: '65' }).includes('stop') && !ids({ retireAge: '70', months: '6' }).includes('stop'), 'deposits-stop flag when retiring after 65, but not for a part-year start (it has its own note)')
  ok(ids({}).includes('deadline') && !ids({ medicare: 'yes' }).includes('deadline') && /April 15, 2027/.test(flag({}, 'deadline').text), 'deadline flag: April 15 of next year, only when eligible')
  ok(/paychecks not yet paid/.test(flag({}, 'deadline').text) && !/paychecks/.test(flag({ funding: 'return' }, 'deadline').text), 'the payroll-timing caveat appears only for a payroll deduction')
  ok(/4,500/.test(flag({}, 'next-year').text) && /9,000/.test(flag({}, 'next-year').text), 'the 2027 limits are mentioned for planning')
  ok(/taxes the earnings/.test(flag({ state: 'CA' }, 'state').text) && /may tax the earnings/.test(flag({ state: 'NJ' }, 'state').text), 'California taxes HSA earnings; New Jersey may')
  const family = { coverage: 'family', age: '56', spouseAge: '57', retireAge: '70' }
  ok(['next-year', 'stop', 'catchup'].every((id) => flag(family, id)?.print === false) && ['deadline', 'medicare-soon'].every((id) => flag({ ...family, age: '64' }, id) && flag({ ...family, age: '64' }, id).print !== false), 'the 2027, deposits-stop and catch-up notes stay off the print (the assumptions cover the catch-up); the deadline and Medicare notes print')
  ok(ids({ age: '' }).includes('age') && ids({ age: '12' }).includes('age') && !ids({ age: '30' }).includes('age'), 'age flag until an adult age is entered')
  // An ineligible result carries only its reasons: no flag about a limit or a state that no longer applies
  ok(ids({ medicare: 'yes', months: '6', dec1: 'yes', coverage: 'family', age: '60', spouseAge: '60', state: 'CA' }).join() === 'medicare', 'Medicare: only the Medicare reason is shown', ids({ medicare: 'yes', months: '6', dec1: 'yes', coverage: 'family', age: '60', spouseAge: '60', state: 'CA' }))
  ok(ids({ plan: 'no', amount: '9000', employer: '9000', age: '' }).join() === 'plan,age', 'no plan: the reason, then the age prompt, nothing about excess')
  const order = hsaFlags(computeHsa(F({ medicare: 'yes', plan: 'no', age: '', amount: '9000' }))).map((w) => w.level)
  ok(order.length >= 3 && order.join() === [...order].sort((a, b) => ['block', 'warn', 'info'].indexOf(a) - ['block', 'warn', 'info'].indexOf(b)).join(), 'flags are ordered block, warn, info', order)
  const mixed = hsaFlags(computeHsa(F({ amount: '9000', employer: '9000', age: '10', state: 'CA' }))).map((w) => w.level)
  ok(mixed.join() === [...mixed].sort((a, b) => ['block', 'warn', 'info'].indexOf(a) - ['block', 'warn', 'info'].indexOf(b)).join() && mixed.includes('warn'), 'warnings come before the information lines when an age prompt is also showing', mixed)
}

// ---------- 7b. Boundaries, guards and wording the mutation audit found unprotected ----------
{
  const ids = (o) => hsaFlags(computeHsa(F(o))).map((w) => w.id)
  const flag = (o, id) => hsaFlags(computeHsa(F(o))).find((w) => w.id === id)
  ok(parseAmount('\u20145') === -5 && parseAmount('250 k') === 250000 && parseAmount('$250k') === 250000 && parseAmount('-5k') === -5000 && parseAmount('(5k)') === -5000 && parseAmount('85k/yr') === 85000, 'parseAmount: em dash, spaced k, $…k, negative k, (5k), 85k/yr')
  ok(computeHsa(F({ amount: '  ' })).contribution === 4400 && computeHsa(F({ wages: ' ' })).wagesTyped === false && computeHsa(F({ bracket: ' ' })).fed === 0.24, 'whitespace-only amount, pay and bracket are blank, not 0')
  ok(computeHsa(F({ wages: '-5000' })).wages === 0 && ficaSaved(-100, 100) === 0, 'negative pay is 0')
  // months and the December 1 rule
  const m11 = computeHsa(F({ months: '11', dec1: 'no' }))
  ok(near(m11.limit, 4400 * 11 / 12) && m11.prorated && !m11.lastMonth, '11 months, not eligible on Dec 1: 11/12 of the limit')
  const m11y = computeHsa(F({ months: '11', dec1: 'yes' }))
  ok(m11y.limit === 4400 && m11y.lastMonth && !m11y.prorated, '11 months, eligible on Dec 1: full limit')
  ok(!computeHsa(F()).prorated && !computeHsa(F()).lastMonth && !ids({}).includes('prorated') && !ids({}).includes('lastmonth'), 'a full year (the default) is neither prorated nor last-month')
  ok(!computeHsa(F({ months: '12', dec1: 'no' })).prorated, '12 months explicitly: not prorated')
  ok(computeHsa(F({ age: '57', months: '3', dec1: 'yes' })).catchAmount === 1000, 'last-month rule: the catch-up is the full 1,000, not prorated')
  ok(!ids({ months: '6', dec1: 'yes' }).includes('prorated') && ids({ months: '6', dec1: 'yes' }).includes('lastmonth'), 'eligible on Dec 1: the last-month flag, never the prorated flag as well')
  ok(computeHsa(F({ months: '6.4' })).months === 6 && computeHsa(F({ months: '11.6' })).months === 12 && !computeHsa(F({ months: '11.6' })).prorated, 'fractional months round to nearest')
  // whole years
  ok(computeHsa(F({ age: '40.5' })).age === 40 && computeHsa(F({ age: '40.5' })).years === 25, 'a fractional age counts as the whole year already reached')
  const frac = computeHsa(F({ age: '64.5', retireAge: '70' })).projection
  ok(frac.years === 6 && frac.depositYears === 1 && frac.putIn > 0, 'age 64.5, retire 70: six years, one deposit year, no contradictory zero')
  ok(computeHsa(F({ coverage: 'family', age: '50', spouseAge: '54.9' })).catchUps === 0 && computeHsa(F({ retireAge: '70.9' })).retireAge === 70, 'whole years for a spouse’s age and the retirement age')
  // a projection needs something to project
  ok(computeHsa(F({ amount: '0' })).projection === null && computeHsa(F({ amount: '0', balance: '5000' })).projection !== null, 'nothing deposited and no balance: no projection; a balance alone still projects')
  ok(computeHsa(F({ amount: '0', employer: '1000' })).projection !== null, 'employer money alone still projects')
  // the one-year horizon
  const one = computeHsa(F({ age: '64', retireAge: '65' })).projection
  ok(one && one.years === 1 && one.depositYears === 1 && near(one.investBalance, 5400) && one.putInSeries.length === 2, 'age 64, retire 65: a one-year projection exists')
  // bills with cents never print "-$0"
  const cents = computeHsa(F({ age: '30', retireAge: '60', spend: '1234.56' })).projection
  ok(cents.aOut >= 0 && money(cents.aOut) === '$0', 'bills with cents: nothing still owed prints $0, never -$0', cents.aOut)
  // flags: thresholds and the statements they carry
  ok(ids({ age: '17' }).includes('age') && !ids({ age: '18' }).includes('age'), 'age prompt shows at 17, not at 18')
  ok(/8,500/.test(flag({ plan: 'no' }, 'plan').text) && /17,000/.test(flag({ plan: 'no' }, 'plan').text), 'no-plan flag states the out-of-pocket maximums')
  ok(/For planning 2027/.test(flag({}, 'next-year').text), 'next-year flag names 2027')
  ok(/6%/.test(flag({ amount: '6000' }, 'excess').text) && /6%/.test(flag({ employer: '9000' }, 'employer-excess').text), 'both excess flags state the 6% excise tax')
  ok(/reach back six months/.test(flag({ age: '64' }, 'medicare-soon').text), 'Medicare flag states the six-month look-back')
  ok(/4\/12/.test(flag({ months: '4' }, 'prorated').text) && /no deposits are assumed after this year/.test(flag({ months: '4' }, 'prorated').text) && /full-year limit applies instead/.test(flag({ months: '4' }, 'prorated').text), 'prorated flag names the fraction, says no later deposits are assumed, and points to the December 1 alternative')
  ok(/limit of \$4,400/.test(flag({ employer: '9000' }, 'employer-excess').text) && /limit of \$1,100/.test(flag({ months: '3', employer: '3000' }, 'employer-excess').text), 'employer-excess flag names the limit that applies (full year or prorated)')
  ok(!ids({ employer: '4400.4' }).includes('employer-excess') && ids({ employer: '4400.6' }).includes('employer-excess'), 'employer overage under 50 cents is not flagged; over it is')
  ok(ids({ amount: '4400.5' }).includes('excess') && !ids({ amount: '4400.4' }).includes('excess') && ids({ amount: '4400.6' }).includes('excess'), 'typed overage: flagged from 50 cents')
  ok(!/Medicare/.test(flag({ months: '6', dec1: 'yes', age: '62' }, 'lastmonth').text) && /Medicare/.test(flag({ months: '6', dec1: 'yes', age: '63' }, 'lastmonth').text), 'last-month flag mentions Medicare from 63')
  ok(!ids({ coverage: 'family', age: '40', spouseAge: '40' }).includes('catchup') && ids({ coverage: 'family', age: '40', spouseAge: '55' }).includes('catchup'), 'catch-up note only when someone is 55+')
  // the ineligible reasons say what can still be done
  ok(/April 15, 2027/.test(flag({ medicare: 'yes' }, 'medicare').text) && /April 15, 2027/.test(flag({ plan: 'no' }, 'plan').text), 'the not-eligible reasons say the months before the change can still be contributed for until April 15')
  ok(/other can still contribute up to the family limit/.test(flag({ medicare: 'yes', coverage: 'family' }, 'medicare').text) && !/other can still contribute/.test(flag({ medicare: 'yes', coverage: 'self' }, 'medicare').text), 'family Medicare note: the other spouse can still contribute; not shown for self-only')
  // ficaExplain
  ok(!/only deduct/.test(ficaExplain(computeHsa(F({ wages: '4400' })))) && !/only deduct/.test(ficaExplain(computeHsa(F({ wages: '186000' })))) && /only deduct/.test(ficaExplain(computeHsa(F({ wages: '4399' })))), 'trace: the pay-limit note appears only when pay is below the contribution')
  ok(/\$0\.30 × 6\.2% Social Security/.test(ficaExplain(computeHsa(F({ wages: '188899.7' })))), 'trace: 30 cents of Social Security zone is shown, not "above the base"')
  // answers left unset count as the defaults, and no count of years is ever negative
  ok(computeHsa({ ...F(), medicare: undefined }).eligible && computeHsa({ ...F(), plan: undefined }).eligible, 'unset Medicare and plan answers count as the defaults (eligible)')
  ok(computeHsa({ ...F(), funding: undefined }).payroll && near(computeHsa({ ...F(), funding: undefined }).ficaSaved, 336.6), 'an unset contribution method counts as payroll')
  const past = computeHsa(F({ age: '70', retireAge: '65' }))
  ok(past.years === 0 && past.depositYears === 0, 'past the retirement age: zero years and zero deposit years, never negative', [past.years, past.depositYears])
  ok(computeHsa(F({ coverage: 'self', spouseAge: '60' })).spouseAge === 0, 'self-only ignores a spouse age in the result too')
  // projection extras and constants
  const gb = computeHsa(F({ balance: '10000', spend: '0' })).projection
  ok(near(gb.growthEarned, 10000 * 1.06 ** 25 + annuity(4400, 25, 0.06) - 10000 - 110000, 0.01), 'growth earned with a starting balance')
  ok(HSA.dpcCap.one === 150 && HSA.dpcCap.more === 300, 'direct primary care caps')
  const blankAssump = computeHsa(F({ retireAge: '', growth: '', spend: '' }))
  ok(String(blankAssump.retireAge) === DEFAULTS.retireAge && String(blankAssump.growth * 100) === DEFAULTS.growth && String(blankAssump.spend) === DEFAULTS.spend, 'DEFAULTS match what the engine uses for a blank field')
}

// ---------- 8. Random invariants ----------
for (let i = 0; i < 1500; i++) {
  const f = F({
    coverage: pickOne(['self', 'family']),
    age: pickOne(['', '17', '18', '30', '44', '54', '55', '62', '64', '65', '67', '80']),
    spouseAge: pickOne(['', '40', '55', '63']),
    months: pickOne(['', '1', '5', '11', '12', '13']),
    dec1: pickOne(['yes', 'no']),
    plan: pickOne(['yes', 'yes', 'no']),
    medicare: pickOne(['no', 'no', 'yes']),
    funding: pickOne(['payroll', 'return']),
    wages: pickOne(['', '0', '40000', '184500', '184501', '300000']),
    employer: pickOne(['', '0', '1000', '4000', '12000']),
    amount: pickOne(['', '0', '1500', '4400', '9000']),
    bracket: pickOne(['', '10', '22', '37']),
    state: pickOne(['NH', 'CA', 'NJ', 'PA', 'NY', 'TX']),
    balance: pickOne(['', '0', '25000']),
    retireAge: pickOne(['', '55', '65', '70', '90']),
    growth: pickOne(['', '0', '6', '15', '-5']),
    spend: pickOne(['', '0', '2000', '20000']),
  })
  const r = computeHsa(f)
  const tag = JSON.stringify(f).slice(0, 170)
  ok([r.limit, r.room, r.contribution, r.excess, r.taxSaved, r.fedSaved, r.stateSaved, r.ficaSaved, r.employerCounted, r.employerExcess, r.catchAmount].every(Number.isFinite), 'random: finite', tag)
  ok(r.contribution >= 0 && r.contribution <= r.room + 1e-9 && r.room <= r.limit + 1e-9, 'random: 0 ≤ contribution ≤ room ≤ limit', tag)
  ok(r.contribution + r.employerCounted <= r.limit + 1e-9, 'random: own money plus the counted employer money never exceed the limit', tag)
  ok(r.employerCounted + r.employerExcess <= r.employer + 1e-9 && (r.eligible ? near(r.employerCounted + r.employerExcess, r.employer, 1e-9) : r.employerCounted === 0), 'random: the employer money splits into counted and excess', tag)
  // An independent recomputation of the tax from the typed inputs
  const fedRate = (f.bracket === '' ? 24 : Number(f.bracket)) / 100
  const stRate = ['CA', 'NJ'].includes(f.state) ? 0 : getState(f.state).wage / 100
  const expTax = r.contribution * (fedRate + stRate) + (f.funding === 'return' ? 0 : ficaSaved(f.wages === '' ? null : Number(f.wages), r.contribution))
  ok(near(r.taxSaved, expTax, 1e-6), 'random: tax saved matches an independent recomputation from the inputs', tag)
  ok(r.ficaSaved <= r.contribution * (HSA.ssRate + HSA.medicareRate) + 1e-9 && r.ficaSaved >= 0, 'random: payroll-tax saving within 0–7.65%', tag)
  ok(!r.payroll ? r.ficaSaved === 0 : true, 'random: no payroll saving when funded on the return', tag)
  ok(r.eligible || (r.contribution === 0 && r.taxSaved === 0 && r.projection === null), 'random: ineligible means nothing saved', tag)
  ok(r.stateConforms || r.stateSaved === 0, 'random: nonconforming states save nothing', tag)
  const fl = hsaFlags(r)
  ok(r.eligible || fl.every((w) => w.level === 'block' || w.id === 'age'), 'random: an ineligible result shows only its reasons (and the age prompt)', tag)
  ok(fl.every((w) => typeof w.text === 'string' && w.text.length > 20 && !/NaN|undefined|Infinity/.test(w.text)), 'random: every flag has clean text', tag)
  if (r.projection) {
    const p = r.projection
    ok(p.spendBalances.length === p.years + 1 && p.investBalances.length === p.years + 1 && p.putInSeries.length === p.years + 1, 'random: series lengths', tag)
    ok(p.spendBalances.every((v) => v >= 0 && Number.isFinite(v)), 'random: balances never negative', tag)
    ok(p.investBalance >= p.spendBalance - 1e-6, 'random: leaving the account alone is never behind on balance', tag)
    ok(p.putInSeries[0] === p.balance0 && p.putInSeries.every((v, k) => k === 0 || v >= p.putInSeries[k - 1] - 1e-9), 'random: the put-in line starts at the balance and never falls', tag)
    ok(p.yearly <= r.limit + 1e-9 && p.yearly >= 0, 'random: the yearly deposit never exceeds this year’s limit', tag)
    ok(!r.prorated || p.depositYears <= 1, 'random: a part-year start that is not eligible on December 1 deposits once', tag)
    // The left-alone balance, recomputed in closed form
    let exp = p.balance0 * (1 + p.growth) ** p.years
    for (let t = 0; t < p.depositYears; t++) exp += p.yearly * (1 + p.growth) ** (p.years - 1 - t)
    ok(near(p.investBalance, exp, 1e-5 * Math.max(1, exp)), 'random: the balance matches a closed-form recomputation', tag)
    ok(p.depositYears <= p.years && p.bank === p.spend * p.years, 'random: deposit years and receipts bank', tag)
    ok(p.aPaid >= -1e-9 && p.aPaid <= p.bank + 1e-6 && near(p.aOut, p.bank - p.aPaid, 1e-6) && p.aOut >= 0, 'random: the account never pays more than the bills; the rest is out of pocket', tag)
    ok(near(p.gain, p.extra - p.aPaid, 1e-6) && (p.growth < 0 || p.gain >= -1e-6), 'random: gain = extra − the bills the account paid, and is not negative unless growth is', tag)
    ok(p.reimbursable <= p.bank + 1e-9 && p.reimbursable <= p.investBalance + 1e-9, 'random: reimbursable within bills and balance', tag)
    ok(near(p.taxSavedOverTime, expTax * p.depositYears, 1e-6), 'random: tax saved over time = this year’s independently computed saving × deposit years', tag)
    if (f.growth === '0') ok(near(p.spendBalance, p.putIn - p.aPaid, 1e-6), 'random: 0% growth conservation', tag)
  }
}

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
