// Cash balance plan model.
// Source: Kongruent "2026 Maximum Contribution for Cash Balance Plans" grid
// and "2026 Qualified Plan Limitations" (Jeffrey Jackson, E.A., F.C.A.).
// Update GRID and LIMITS together when the next year's sheet arrives.

export const LIMITS = {
  year: 2026,
  compensation: 360000, // §401(a)(17)
  dcAnnualAdditions: 72000, // §415(c)
  deferral: 24500, // 401(k) elective deferral
  catchUp: 8000, // age 50+
  catchUp60: 11250, // ages 60–63
  dbAccrualLimit: 290000, // §415(b)
  taxableWageBase: 184500,
}

// Employer 401(k) money that typically sits alongside a cash balance plan:
// 3% safe harbor non-elective + 3% profit sharing (6% of pay). Kongruent's
// combination illustration uses exactly this design.
export const EMPLOYER_PCT_WITH_CB = 0.06

// Employee cost in the same design: 3% SH + 3% PS + 2.5% cash balance pay credit.
export const EMPLOYEE_COST_PCT = 0.085

// Annual tax drag on returns for money invested outside a plan.
export const TAXABLE_DRAG = 0.2

// Considered-earnings columns, high to low, and the first age row.
export const GRID_COMPS = [360000, 300000, 250000, 200000, 150000, 100000]
export const GRID_MIN_AGE = 35
export const GRID_MAX_AGE = 70

// Maximum cash balance contribution, rows = ages 35..70, columns = GRID_COMPS.
export const GRID = [
  [97000, 97000, 97000, 97000, 97000, 97000], // 35
  [102000, 102000, 102000, 102000, 102000, 102000], // 36
  [107000, 107000, 107000, 107000, 107000, 107000], // 37
  [113000, 113000, 113000, 113000, 113000, 113000], // 38
  [119000, 119000, 119000, 119000, 119000, 119000], // 39
  [125000, 125000, 125000, 125000, 125000, 125000], // 40
  [131000, 131000, 131000, 131000, 131000, 131000], // 41
  [138000, 138000, 138000, 138000, 138000, 138000], // 42
  [144000, 144000, 144000, 144000, 144000, 144000], // 43
  [152000, 152000, 152000, 152000, 152000, 152000], // 44
  [160000, 160000, 160000, 160000, 160000, 160000], // 45
  [168000, 168000, 168000, 168000, 168000, 160000], // 46
  [176000, 176000, 176000, 176000, 176000, 158000], // 47
  [185000, 185000, 185000, 185000, 185000, 157000], // 48
  [195000, 195000, 195000, 195000, 195000, 155000], // 49
  [205000, 205000, 205000, 205000, 205000, 154000], // 50
  [215000, 215000, 215000, 215000, 215000, 152000], // 51
  [226000, 226000, 226000, 226000, 226000, 150000], // 52
  [238000, 238000, 238000, 238000, 223000, 148000], // 53
  [250000, 250000, 250000, 250000, 220000, 147000], // 54
  [262000, 262000, 262000, 262000, 217000, 145000], // 55
  [276000, 276000, 276000, 276000, 214000, 142000], // 56
  [290000, 290000, 290000, 280000, 210000, 140000], // 57
  [305000, 305000, 305000, 276000, 207000, 138000], // 58
  [320000, 320000, 320000, 271000, 204000, 136000], // 59
  [337000, 337000, 333000, 267000, 200000, 133000], // 60
  [354000, 354000, 327000, 262000, 196000, 131000], // 61
  [372000, 372000, 321000, 257000, 192000, 128000], // 62
  [365000, 365000, 314000, 251000, 189000, 126000], // 63
  [357000, 357000, 308000, 246000, 185000, 123000], // 64
  [349000, 349000, 301000, 241000, 181000, 120000], // 65
  [367000, 353000, 294000, 235000, 176000, 118000], // 66
  [386000, 344000, 287000, 229000, 172000, 115000], // 67
  [402000, 335000, 279000, 224000, 168000, 112000], // 68
  [392000, 326000, 272000, 218000, 163000, 109000], // 69
  [380000, 317000, 264000, 211000, 159000, 106000], // 70
]

// Grid lookup. Ages outside 35–70 use the nearest row; compensation picks the
// highest column the pay reaches (pay between columns uses the lower column).
export function cbMax(age, comp) {
  const row = Math.min(GRID.length - 1, Math.max(0, Math.round(age) - GRID_MIN_AGE))
  let col = GRID_COMPS.length - 1
  for (let i = 0; i < GRID_COMPS.length; i++) {
    if (comp >= GRID_COMPS[i]) {
      col = i
      break
    }
  }
  return GRID[row][col]
}

export function catchUp(age) {
  if (age >= 60 && age <= 63) return LIMITS.catchUp60
  if (age >= 50) return LIMITS.catchUp
  return 0
}

// Future value of level annual contributions after n years at rate r.
export function fvFactor(r, n) {
  return r > 0 ? (Math.pow(1 + r, n) - 1) / r : n
}

// inputs: { age, comp, fed, state, years, ret, employees, avgPay }
// rates as decimals (0.32), ret as decimal (0.05).
export function computeCashBalance(i) {
  const age = Math.min(75, Math.max(25, i.age || 0))
  const rate = (i.fed || 0) + (i.state || 0)
  const cb = cbMax(age, i.comp)
  const k401Only = LIMITS.dcAnnualAdditions + catchUp(age)
  const k401WithCb = LIMITS.deferral + catchUp(age) + EMPLOYER_PCT_WITH_CB * Math.min(i.comp, LIMITS.compensation)
  const taxCb = cb * rate
  const taxAll = (k401WithCb + cb) * rate
  const employeeCost = (i.employees || 0) * (i.avgPay || 0) * EMPLOYEE_COST_PCT
  const netCost = cb - taxCb + employeeCost * (1 - rate)
  const n = i.years
  const r = i.ret
  const f = fvFactor(r, n)
  const fTaxable = fvFactor(r * (1 - TAXABLE_DRAG), n)
  const v401 = k401Only * f
  const vBoth = (k401WithCb + cb) * f
  const vNone = k401Only * (1 - rate) * fTaxable
  const path = (perYear, factorRate) =>
    Array.from({ length: n + 1 }, (_, t) => perYear * fvFactor(factorRate, t))
  return {
    age,
    rate,
    cb,
    k401Only,
    k401WithCb,
    taxCb,
    taxAll,
    employeeCost,
    netCost,
    n,
    r,
    v401,
    vBoth,
    vNone,
    series: {
      none: path(k401Only * (1 - rate), r * (1 - TAXABLE_DRAG)),
      k401: path(k401Only, r),
      both: path(k401WithCb + cb, r),
    },
  }
}
