// Roth IRA illustration for the wages paid to a child: contributions from this year through a stop
// age, grown at an assumed return to the retirement age, then turned into income at a withdrawal rate.
//
// Conventions (conservative; the page states them):
//  - A contribution is made at the END of each year of work: the contribution for age t is deposited on
//    the child's (t + 1)th birthday and earns nothing before then.
//  - The same dollar amount is contributed every year (no raise in pay, no indexing of the IRA limit).
//  - The starting balance is zero and growth is a constant rate, with no fees or taxes.
//  - This year's wages always count, so a child already past the stop age still gets one contribution.
//  - balances[i] is the balance on the child's birthday at age (age + i); balances[0] is 0.

const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback)

export function projectRoth({ age, annual, stopAge = 22, retireAge = 65, growth = 0.07, incomeRate = 0.04, inflation = 0.03 }) {
  const start = Math.floor(finite(age, 0))
  const retire = Math.floor(finite(retireAge, 65))
  const put = finite(annual, 0)
  if (!(put > 0) || !(start > 0) || retire <= start) return null
  const g = Math.max(-0.99, finite(growth, 0))
  const rate = Math.max(0, finite(incomeRate, 0))
  const infl = Math.max(-0.99, finite(inflation, 0))
  // Last age with a contribution: not before this year, never at or after retirement.
  const last = Math.max(start, Math.min(Math.floor(finite(stopAge, 22)), retire - 1))

  const balances = [0]
  const contributedSeries = [0]
  let balance = 0
  let contributed = 0
  for (let t = start; t < retire; t++) {
    const c = t <= last ? put : 0
    balance = balance * (1 + g) + c
    contributed += c
    balances.push(balance)
    contributedSeries.push(contributed)
  }
  const yearsOut = retire - start
  const deflator = Math.pow(1 + infl, yearsOut)
  const income = balance * rate
  return {
    age: start,
    retireAge: retire,
    last,
    years: last - start + 1,
    annual: put,
    contributed,
    balance,
    income,
    growth: g,
    incomeRate: rate,
    inflation: infl,
    yearsOut,
    balanceReal: balance / deflator,
    incomeReal: income / deflator,
    balances,
    contributedSeries,
  }
}
