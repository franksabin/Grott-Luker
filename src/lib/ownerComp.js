// Owner compensation comparison: sole proprietor / disregarded LLC versus an S corporation with a
// reasonable salary plus distributions. Pure functions so the page, the print report and the tests
// share one calculation. Every figure is carried in whole dollars, as on a return.
import { toNumber } from './format.js'
import { ordinaryTax, selfEmploymentTax, ficaOnSalary, STANDARD_DEDUCTION } from './tax.js'
import { getState } from './states.js'
import { entityTax, businessStateInfo } from './stateBusinessTax.js'

// Simplified QBI: 20% of qualified income, limited to 20% of taxable income.
export function qbiDeduction(qbiIncome, taxableBeforeQbi) {
  return Math.min(0.2 * Math.max(0, qbiIncome), 0.2 * Math.max(0, taxableBeforeQbi))
}

// The largest salary the profit can fund once the employer share of payroll tax is paid on it
// (salary + employer FICA = net profit). Fixed-point iteration; converges in a handful of steps.
export function fundableSalary(netProfit) {
  let s = netProfit
  for (let i = 0; i < 40; i++) s = netProfit - ficaOnSalary(s) / 2
  s = Math.max(0, Math.floor(s))
  // Whole-dollar touch-up so the capped salary leaves a $0 distribution, not $1 or $2.
  const fits = (x) => x + Math.round(ficaOnSalary(x) / 2) <= netProfit
  while (fits(s + 1)) s += 1
  while (s > 0 && !fits(s)) s -= 1
  return s
}

// Every figure is carried in whole dollars (as on a return) so that each total is exactly the sum
// of the rows shown, and the screen, the print report and the bridge rows all foot to the dollar.
export function compute(form) {
  const R = Math.round
  const netProfit = R(toNumber(form.netProfit))
  const maxSalary = fundableSalary(netProfit)
  const salary = Math.min(R(toNumber(form.salary)), maxSalary)
  const otherIncome = R(toNumber(form.otherIncome))
  const st = getState(form.state) // where the owner lives: personal income tax
  const biz = getState(form.bizState || form.state) // where the business operates: entity-level taxes
  const bizDiffers = biz.code !== st.code
  const filing = form.filing
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']
  const stateRate = st.wage / 100
  const grossEntered = String(form.receipts ?? '').trim() !== ''
  const entityIn = {
    netProfit,
    salary,
    grossReceipts: grossEntered ? R(toNumber(form.receipts)) : null,
    nhBptRatePct: String(form.nhBptRate ?? '').trim() === '' ? undefined : toNumber(form.nhBptRate),
    nhPayMethod: form.nhPayMethod || 'salary',
    nhPayCustom: toNumber(form.nhPayCustom),
    nhSoleFed: form.nhSoleFed || 'expense',
  }
  // The home state may credit tax paid to the business state; off unless the preparer turns it on.
  const homeCredit = form.homeCredit === 'yes' && bizDiffers

  // --- Strategy 1: Sole proprietor / disregarded LLC (all profit is SE income) ---
  // Entity-level state taxes that are deductible reduce Schedule C profit before SE tax.
  const soleEntity = entityTax(biz.code, 'sole', entityIn)
  const soleProfit = netProfit - soleEntity.federalDeduction
  const se = R(selfEmploymentTax(soleProfit))
  const seHalf = R(se / 2) // deductible half of SE tax
  const soleQbiIncome = soleProfit - seHalf
  const soleOrdinaryBeforeQbi = soleQbiIncome + otherIncome - stdDed
  const soleQbi = R(qbiDeduction(soleQbiIncome, soleOrdinaryBeforeQbi))
  const soleTaxable = Math.max(0, soleOrdinaryBeforeQbi - soleQbi)
  const soleIncomeTax = R(ordinaryTax(soleTaxable, filing))
  const soleStateGross = R(Math.max(0, soleQbiIncome + otherIncome) * stateRate)
  const soleHomeCredit = homeCredit ? Math.min(soleStateGross, soleEntity.total) : 0
  const soleState = soleStateGross - soleHomeCredit
  const soleTotal = se + soleIncomeTax + soleState + soleEntity.total

  // --- Strategy 2: S-corporation (reasonable salary + distribution) ---
  const fica = R(ficaOnSalary(salary)) // total FICA burden on the salary
  const employerFica = R(ficaOnSalary(salary) / 2) // employer half is a business expense
  const scorpEntity = entityTax(biz.code, 'scorp', { ...entityIn, employerFica })
  // The distribution is the K-1 income left after the salary, the employer payroll tax and the
  // entity-level state taxes the S corporation deducts.
  const distribution = Math.max(0, netProfit - salary - employerFica - scorpEntity.federalDeduction)
  const scorpQbiIncome = distribution // K-1 pass-through, net of wages
  const scorpOrdinaryBeforeQbi = salary + distribution + otherIncome - stdDed
  const scorpQbi = R(qbiDeduction(scorpQbiIncome, scorpOrdinaryBeforeQbi))
  const scorpTaxable = Math.max(0, scorpOrdinaryBeforeQbi - scorpQbi)
  const scorpIncomeTax = R(ordinaryTax(scorpTaxable, filing))
  const scorpStateGross = R(Math.max(0, salary + distribution + otherIncome) * stateRate)
  const scorpHomeCredit = homeCredit ? Math.min(scorpStateGross, scorpEntity.total) : 0
  const scorpState = scorpStateGross - scorpHomeCredit
  const scorpTotal = fica + scorpIncomeTax + scorpState + scorpEntity.total

  const savings = soleTotal - scorpTotal

  return {
    netProfit,
    soleProfit,
    salary,
    distribution,
    se,
    seHalf,
    fica,
    employerFica,
    soleQbi,
    scorpQbi,
    soleTaxable,
    scorpTaxable,
    soleIncomeTax,
    scorpIncomeTax,
    soleState,
    scorpState,
    soleTotal,
    scorpTotal,
    savings,
    stateRate,
    stateName: st.name,
    stateCode: st.code,
    // Business state and entity-level taxes
    bizCode: biz.code,
    bizName: biz.name,
    bizDiffers,
    bizInfo: businessStateInfo(biz.code, biz.name),
    soleEntity,
    scorpEntity,
    soleEntityTax: soleEntity.total,
    scorpEntityTax: scorpEntity.total,
    entityChange: scorpEntity.total - soleEntity.total, // positive = the S corporation owes more entity-level tax
    homeCredit,
    soleHomeCredit,
    scorpHomeCredit,
    receiptsEntered: grossEntered,
  }
}
