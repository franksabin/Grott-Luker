import { projectRoth } from '../src/lib/kidsRoth.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol
let seed = 777
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

// ---------- 1. Hand-computed cases ----------
{
  // Two deposits of 1,000 at ages 63 and 64, 10% growth, retire 65: V(64) = 1,000; V(65) = 1,000 x 1.1 + 1,000 = 2,100
  const p = projectRoth({ age: 63, annual: 1000, stopAge: 64, retireAge: 65, growth: 0.10, incomeRate: 0.04, inflation: 0.03 })
  ok(near(p.balance, 2100), 'two deposits at 10% = 2,100', p.balance)
  ok(near(p.contributed, 2000), 'contributed 2,000', p.contributed)
  ok(p.years === 2 && p.last === 64, 'two years, last age 64', [p.years, p.last])
  ok(near(p.income, 84), 'income = 2,100 x 4% = 84', p.income)
  ok(near(p.balanceReal, 2100 / 1.03 ** 2), 'today dollars = 2,100 / 1.03^2', p.balanceReal)
  ok(near(p.incomeReal, 84 / 1.03 ** 2), 'income in today dollars', p.incomeReal)
  ok(p.balances.length === 3 && near(p.balances[0], 0) && near(p.balances[1], 1000) && near(p.balances[2], 2100), 'balances by birthday', p.balances)
  ok(p.contributedSeries.length === 3 && near(p.contributedSeries[2], 2000), 'contributed series', p.contributedSeries)
}
{
  // No growth: the balance is just the deposits. Age 15 through 22 is 8 deposits of 7,500.
  const p = projectRoth({ age: 15, annual: 7500, stopAge: 22, growth: 0, inflation: 0 })
  ok(near(p.balance, 60000) && near(p.contributed, 60000) && p.years === 8, '8 x 7,500 at 0% = 60,000', [p.balance, p.years])
  ok(near(p.balanceReal, p.balance) && near(p.incomeReal, p.income), 'no inflation: real equals nominal')
  ok(near(p.income, 2400), '4% of 60,000 = 2,400', p.income)
}
{
  // One deposit at the last year before retirement earns nothing: it lands on the 65th birthday.
  const p = projectRoth({ age: 64, annual: 1000, stopAge: 64, retireAge: 65, growth: 0.10 })
  ok(near(p.balance, 1000), 'a deposit in the final year earns nothing', p.balance)
}

// ---------- 2. Closed form: deposits at ages a..s land on birthdays a+1..s+1 and grow to the retirement age ----------
{
  const age = 17, stop = 22, retire = 65, g = 0.07, c = 7500
  const closed = c * Math.pow(1 + g, retire - (stop + 1)) * ((Math.pow(1 + g, stop - age + 1) - 1) / g)
  const p = projectRoth({ age, annual: c, stopAge: stop, retireAge: retire, growth: g })
  ok(near(p.balance, closed, 1e-4), 'age 17-22 at 7%: loop equals the geometric series', [p.balance, closed])
  ok(p.balance > 900000 && p.balance < 940000, 'age 17-22 at 7% is about $919k', p.balance)
}
for (let i = 0; i < 300; i++) {
  const age = 5 + Math.floor(rnd() * 30)
  const stop = age + Math.floor(rnd() * 15)
  const retire = stop + 2 + Math.floor(rnd() * 40)
  const g = 0.01 + rnd() * 0.12
  const c = 500 + Math.floor(rnd() * 7000)
  const p = projectRoth({ age, annual: c, stopAge: stop, retireAge: retire, growth: g })
  const closed = c * Math.pow(1 + g, retire - (stop + 1)) * ((Math.pow(1 + g, stop - age + 1) - 1) / g)
  ok(near(p.balance, closed, 1e-6 * closed), 'random: loop equals closed form', [age, stop, retire, g, c])
  ok(p.balances.length === retire - age + 1 && near(p.balances[p.balances.length - 1], p.balance), 'random: series ends at the balance')
  ok(p.balances.every((v, k) => k === 0 || v >= p.balances[k - 1]), 'random: balance never falls at positive growth')
  ok(near(p.contributed, c * (stop - age + 1)), 'random: contributed = annual x years')
  const richer = projectRoth({ age, annual: c, stopAge: stop, retireAge: retire, growth: g + 0.01 })
  ok(richer.balance > p.balance, 'random: higher growth gives a larger balance')
  const longer = projectRoth({ age, annual: c, stopAge: stop + 1, retireAge: retire + 1, growth: g })
  ok(longer.balance > p.balance, 'random: paying one more year gives a larger balance')
}

// ---------- 3. Edges ----------
{
  const past = projectRoth({ age: 25, annual: 5000, stopAge: 22, growth: 0.05 })
  ok(past.years === 1 && past.last === 25 && near(past.contributed, 5000), 'past the stop age still funds this year', [past.years, past.last])
  ok(projectRoth({ age: 66, annual: 5000, retireAge: 65 }) === null, 'age at or past retirement returns null')
  ok(projectRoth({ age: 65, annual: 5000, retireAge: 65 }) === null, 'age equal to retirement returns null')
  ok(projectRoth({ age: 15, annual: 0 }) === null && projectRoth({ age: 0, annual: 5000 }) === null, 'no contribution or no age returns null')
  const capped = projectRoth({ age: 60, annual: 1000, stopAge: 99, retireAge: 65, growth: 0 })
  ok(capped.last === 64 && capped.years === 5, 'stop age beyond retirement is capped at the year before', [capped.last, capped.years])
  const junk = projectRoth({ age: 15, annual: 7500, stopAge: NaN, retireAge: NaN, growth: NaN, incomeRate: NaN, inflation: NaN })
  ok(junk && Number.isFinite(junk.balance) && Number.isFinite(junk.income) && Number.isFinite(junk.incomeReal), 'NaN inputs fall back to finite numbers', junk)
  const zeroRate = projectRoth({ age: 15, annual: 7500, incomeRate: 0 })
  ok(zeroRate.income === 0, 'a zero income rate gives zero income')
}

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
