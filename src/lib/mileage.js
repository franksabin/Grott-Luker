// Mileage & Expense Log — rates, math, and submission validation.
//
// Pure JS: shared by the React pages, the Cloudflare Worker, and the Vite dev
// API so every layer computes and validates identically.
import { toNumber } from './format.js'
import { isValidEmail } from './knowYourNumbers.js'
import { CATEGORIES, CATEGORY_BY_ID, INDUSTRY_BY_ID, DEFAULT_INDUSTRY, classify } from './expenseGuide.js'

/**
 * IRS standard mileage rates, dollars per mile, by effective period.
 * The IRS occasionally changes rates mid-year (2022 and 2026 both did), so the
 * table is keyed by effective date, not by tax year. Rates are applied by trip
 * date. Verify each January against irs.gov/tax-professionals/standard-mileage-rates.
 */
export const RATE_PERIODS = [
  { from: '2024-01-01', business: 0.67, charity: 0.14, medical: 0.21 },
  { from: '2025-01-01', business: 0.7, charity: 0.14, medical: 0.21 },
  { from: '2026-01-01', business: 0.725, charity: 0.14, medical: 0.205 }, // Notice 2026-10
  { from: '2026-07-01', business: 0.76, charity: 0.14, medical: 0.235 }, // IRB 2026-29 (mid-year increase)
]

export const PURPOSES = [
  { id: 'business', label: 'Business' },
  { id: 'charity', label: 'Charity' },
  { id: 'medical', label: 'Medical / moving' },
]

// Expense categories live in expenseGuide.js (with industry guidance).
// Kept under the old name for the pages that import it.
export const EXPENSE_TYPES = CATEGORIES.map((c) => ({ id: c.id, label: c.label, deductible: c.treatment === 'ok' || c.treatment === 'limited' ? c.share : 0 }))

export const TAX_YEARS = [2024, 2025, 2026]

export function ratesFor(dateStr) {
  const d = String(dateStr || '')
  let match = RATE_PERIODS[0]
  for (const p of RATE_PERIODS) if (d >= p.from) match = p
  return match
}

export function rateFor(dateStr, purpose) {
  const r = ratesFor(dateStr)
  return r[purpose] ?? r.business
}

/** Rate periods that intersect a tax year — for the "rates in use" panel. */
export function periodsForYear(year) {
  const y = String(year)
  return RATE_PERIODS.filter((p, i) => {
    const next = RATE_PERIODS[i + 1]
    const startsInYear = p.from.startsWith(y)
    const spansYear = p.from < `${y}-01-01` && (!next || next.from > `${y}-01-01`)
    return startsInYear || spansYear
  })
}

let seq = 0
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

export const blankTrip = (year) => ({
  id: newId(),
  date: `${year}-`,
  client: '',
  description: '',
  miles: '',
  purpose: 'business',
})
export const blankExpense = (year) => ({
  id: newId(),
  date: `${year}-`,
  client: '',
  matter: '',
  amount: '',
  type: 'meal',
})

export function blankLog(year = new Date().getFullYear()) {
  return { taxYear: year, industry: DEFAULT_INDUSTRY, trips: [blankTrip(year)], expenses: [blankExpense(year)] }
}

export function sampleLog(year = 2026) {
  return {
    taxYear: year,
    industry: 'realtor',
    trips: [
      { id: newId(), date: `${year}-01-14`, client: 'Hanover Dental', description: 'Site visit — Hanover, NH', miles: '62', purpose: 'business' },
      { id: newId(), date: `${year}-02-03`, client: 'Seacoast Realty', description: 'Closing — Portsmouth', miles: '18', purpose: 'business' },
      { id: newId(), date: `${year}-03-22`, client: 'NH Food Bank', description: 'Volunteer delivery — Manchester', miles: '58', purpose: 'charity' },
      { id: newId(), date: `${year}-05-09`, client: 'Portside LLC', description: 'Inventory count — Kittery, ME', miles: '41', purpose: 'business' },
      { id: newId(), date: `${year}-08-19`, client: '—', description: 'Board meeting — Concord', miles: '94', purpose: 'business' },
      { id: newId(), date: `${year}-09-02`, client: 'Wentworth Clinic', description: 'Specialist appointment — Dover', miles: '26', purpose: 'medical' },
    ],
    expenses: [
      { id: newId(), date: `${year}-01-14`, client: 'Hanover Dental', matter: 'Q1 planning, equipment purchase', amount: '86.40', type: 'meal' },
      { id: newId(), date: `${year}-02-19`, client: 'Board', matter: 'Working lunch — budget review', amount: '142.00', type: 'meal' },
      { id: newId(), date: `${year}-06-11`, client: 'Portside LLC', matter: 'Client appreciation — ballgame', amount: '210.00', type: 'entertainment' },
      { id: newId(), date: `${year}-03-01`, client: '—', matter: 'MLS and board dues', amount: '1240.00', type: 'dues' },
      { id: newId(), date: `${year}-04-18`, client: '—', matter: 'Yard signs and lockboxes', amount: '386.50', type: 'supplies' },
      { id: newId(), date: `${year}-07-30`, client: 'The Kims', matter: 'Closing gift — cutting board', amount: '85.00', type: 'gifts' },
      { id: newId(), date: `${year}-10-05`, client: '—', matter: 'New laptop', amount: '1899.00', type: 'equipment' },
    ],
  }
}

const isCompleteDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))

export function compute(log) {
  const trips = (log?.trips || []).map((t) => {
    const miles = Math.max(0, toNumber(t.miles))
    const dated = isCompleteDate(t.date)
    const rate = dated ? rateFor(t.date, t.purpose) : rateFor(`${log.taxYear}-01-01`, t.purpose)
    return { ...t, milesNum: miles, rate, amount: miles * rate, counted: miles > 0 }
  })
  const byPurpose = {}
  for (const p of PURPOSES) byPurpose[p.id] = { miles: 0, amount: 0 }
  for (const t of trips) {
    if (!t.counted) continue
    byPurpose[t.purpose].miles += t.milesNum
    byPurpose[t.purpose].amount += t.amount
  }
  const totalMiles = Object.values(byPurpose).reduce((s, v) => s + v.miles, 0)
  const totalMileage = Object.values(byPurpose).reduce((s, v) => s + v.amount, 0)

  const industry = INDUSTRY_BY_ID[log?.industry] ? log.industry : DEFAULT_INDUSTRY
  const expenses = (log?.expenses || []).map((e) => {
    const amount = Math.max(0, toNumber(e.amount))
    const c = classify(e.type, industry)
    const counted = amount > 0
    const inEstimate = c.treatment === 'ok' || c.treatment === 'limited'
    return {
      ...e,
      amountNum: amount,
      category: c,
      treatment: c.treatment,
      deductible: inEstimate ? amount * c.share : 0,
      review: c.treatment === 'ask' ? amount : 0,
      excluded: c.treatment === 'not' ? amount : 0,
      counted,
    }
  })
  const mealsTotal = expenses.filter((e) => e.type === 'meal').reduce((s, e) => s + e.amountNum, 0)
  const entTotal = expenses.filter((e) => e.type === 'entertainment').reduce((s, e) => s + e.amountNum, 0)
  const expensesTotal = expenses.reduce((s, e) => s + e.amountNum, 0)
  const expenseDeductible = expenses.reduce((s, e) => s + e.deductible, 0)
  const reviewTotal = expenses.reduce((s, e) => s + e.review, 0)
  const excludedTotal = expenses.reduce((s, e) => s + e.excluded, 0)
  // Totals by treatment, for the report and the math trace.
  const byTreatment = {}
  for (const t of ['ok', 'limited', 'ask', 'not']) byTreatment[t] = { amount: 0, deductible: 0, count: 0 }
  for (const e of expenses) {
    if (!e.counted) continue
    byTreatment[e.treatment].amount += e.amountNum
    byTreatment[e.treatment].deductible += e.deductible
    byTreatment[e.treatment].count += 1
  }

  return {
    trips,
    expenses,
    byPurpose,
    totalMiles,
    totalMileage,
    industry,
    mealsTotal,
    entTotal,
    expensesTotal,
    expenseDeductible,
    reviewTotal,
    excludedTotal,
    byTreatment,
    estimatedDeduction: totalMileage + expenseDeductible,
    tripCount: trips.filter((t) => t.counted).length,
    expenseCount: expenses.filter((e) => e.counted).length,
  }
}

export function hasAnyEntries(log) {
  const r = compute(log)
  return r.tripCount > 0 || r.expenseCount > 0
}

/* ---------------- Submission validation (server + client) ---------------- */

export const MILEAGE_LIMITS = {
  name: 120,
  email: 200,
  phone: 40,
  notes: 2000,
  text: 160,
  rows: 500,
  miles: 100000,
  amount: 1e6,
  body: 200000,
}

const trimmed = (v, max) => String(v ?? '').trim().slice(0, max)

export function normalizeMileageSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid request body.' }
  }
  const name = trimmed(body.name, MILEAGE_LIMITS.name)
  if (name.length < 2) return { error: 'A name is required.' }
  const email = trimmed(body.email, MILEAGE_LIMITS.email)
  if (!isValidEmail(email)) return { error: 'A valid email address is required.' }
  const phone = trimmed(body.phone, MILEAGE_LIMITS.phone)
  const notes = trimmed(body.notes, MILEAGE_LIMITS.notes)

  const taxYear = Number.parseInt(body.taxYear, 10)
  if (!TAX_YEARS.includes(taxYear)) return { error: 'Tax year is not supported.' }
  const industry = INDUSTRY_BY_ID[body.industry] ? body.industry : DEFAULT_INDUSTRY

  const tripsIn = Array.isArray(body.trips) ? body.trips.slice(0, MILEAGE_LIMITS.rows) : []
  const expensesIn = Array.isArray(body.expenses) ? body.expenses.slice(0, MILEAGE_LIMITS.rows) : []

  const trips = tripsIn
    .map((t) => ({
      id: trimmed(t?.id, 40) || newId(),
      date: isCompleteDate(t?.date) ? t.date : '',
      client: trimmed(t?.client, MILEAGE_LIMITS.text),
      description: trimmed(t?.description, MILEAGE_LIMITS.text),
      miles: String(Math.min(MILEAGE_LIMITS.miles, Math.max(0, toNumber(t?.miles)))),
      purpose: PURPOSES.some((p) => p.id === t?.purpose) ? t.purpose : 'business',
    }))
    .filter((t) => toNumber(t.miles) > 0)

  const expenses = expensesIn
    .map((e) => ({
      id: trimmed(e?.id, 40) || newId(),
      date: isCompleteDate(e?.date) ? e.date : '',
      client: trimmed(e?.client, MILEAGE_LIMITS.text),
      matter: trimmed(e?.matter, MILEAGE_LIMITS.text),
      amount: String(Math.min(MILEAGE_LIMITS.amount, Math.max(0, toNumber(e?.amount)))),
      type: CATEGORY_BY_ID[e?.type] ? e.type : 'meal',
    }))
    .filter((e) => toNumber(e.amount) > 0)

  if (!trips.length && !expenses.length) {
    return { error: 'Add at least one trip or expense before submitting.' }
  }

  const log = { taxYear, industry, trips, expenses }
  const r = compute(log)
  return {
    value: {
      name,
      email,
      phone,
      notes,
      taxYear,
      industry,
      log,
      totalMiles: Math.round(r.totalMiles),
      estimatedDeduction: Math.round(r.estimatedDeduction * 100) / 100,
    },
  }
}
