// Charitable Donation Log — entries, substantiation flags, and submission validation.
// Pure JS shared by the React pages, the Cloudflare Worker, and the Vite dev API.
import { toNumber } from './format.js'
import { isValidEmail } from './knowYourNumbers.js'
import { TAX_YEARS, newId } from './mileage.js'

export { TAX_YEARS }

export const GIFT_TYPES = [
  { id: 'cash', label: 'Cash / check / card' },
  { id: 'noncash', label: 'Non-cash (goods)' },
  { id: 'securities', label: 'Appreciated securities' },
]

// Substantiation thresholds (IRC §170(f)(8), §170(f)(11); Form 8283).
export const THRESHOLDS = {
  acknowledgment: 250, // contemporaneous written acknowledgment for any single gift ≥ $250
  form8283: 500, // total non-cash gifts > $500 → Form 8283 Section A
  appraisal: 5000, // a non-cash item (or similar group) > $5,000 → qualified appraisal, Section B
}

const isCompleteDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))

export const blankGift = (year) => ({
  id: newId(),
  date: `${year}-`,
  organization: '',
  description: '',
  type: 'cash',
  amount: '',
  basis: '',
  longTerm: true,
  acknowledged: false,
})

export function blankLog(year = new Date().getFullYear()) {
  return { taxYear: year, gifts: [blankGift(year)] }
}

export function sampleLog(year = 2026) {
  return {
    taxYear: year,
    gifts: [
      { id: newId(), date: `${year}-01-20`, organization: 'Seacoast Family Promise', description: 'Annual gift', type: 'cash', amount: '2500', basis: '', longTerm: true, acknowledged: true },
      { id: newId(), date: `${year}-03-11`, organization: 'Portsmouth Public Library', description: 'Spring appeal', type: 'cash', amount: '150', basis: '', longTerm: true, acknowledged: false },
      { id: newId(), date: `${year}-04-06`, organization: 'Goodwill NNE', description: 'Furniture, clothing (2 carloads)', type: 'noncash', amount: '850', basis: '', longTerm: true, acknowledged: true },
      { id: newId(), date: `${year}-06-02`, organization: 'NH Food Bank', description: 'Summer drive', type: 'cash', amount: '300', basis: '', longTerm: true, acknowledged: true },
      { id: newId(), date: `${year}-09-15`, organization: 'Cross Roads House', description: 'Donated used car (2014 Subaru)', type: 'noncash', amount: '6200', basis: '', longTerm: true, acknowledged: false },
      { id: newId(), date: `${year}-11-24`, organization: 'Community foundation (DAF)', description: '120 sh VTI', type: 'securities', amount: '31800', basis: '14200', longTerm: true, acknowledged: true },
    ],
  }
}

export function compute(log) {
  const gifts = (log?.gifts || []).map((g) => {
    const amount = Math.max(0, toNumber(g.amount))
    const basis = Math.max(0, toNumber(g.basis))
    const type = GIFT_TYPES.some((t) => t.id === g.type) ? g.type : 'cash'
    const counted = amount > 0
    const needsAck = counted && amount >= THRESHOLDS.acknowledgment
    const needsAppraisal = counted && type === 'noncash' && amount > THRESHOLDS.appraisal
    // Long-term appreciated securities: deduct FMV, no gain recognized. Short-term: deduction limited to basis.
    const deductible = type === 'securities' && !g.longTerm ? Math.min(amount, basis || amount) : amount
    const avoidedGain = type === 'securities' && g.longTerm && basis > 0 ? Math.max(0, amount - basis) : 0
    return { ...g, type, amountNum: amount, basisNum: basis, counted, needsAck, needsAppraisal, deductible, avoidedGain,
      flags: [
        needsAck && !g.acknowledged ? 'Get written acknowledgment (≥ $250)' : null,
        needsAppraisal ? 'Qualified appraisal required (> $5,000 non-cash)' : null,
        type === 'securities' && !g.longTerm ? 'Held ≤ 1 year — deduction limited to cost basis' : null,
      ].filter(Boolean) }
  })
  const sum = (arr, k) => arr.reduce((s, g) => s + (g.counted ? g[k] : 0), 0)
  const byType = {}
  for (const t of GIFT_TYPES) {
    const rows = gifts.filter((g) => g.type === t.id)
    byType[t.id] = { count: rows.filter((g) => g.counted).length, total: sum(rows, 'amountNum'), deductible: sum(rows, 'deductible') }
  }
  const total = sum(gifts, 'amountNum')
  const deductible = sum(gifts, 'deductible')
  const avoidedGain = sum(gifts, 'avoidedGain')
  const nonCashTotal = byType.noncash.total + byType.securities.total
  const needs8283 = nonCashTotal > THRESHOLDS.form8283
  const appraisalCount = gifts.filter((g) => g.needsAppraisal).length
  const missingAck = gifts.filter((g) => g.needsAck && !g.acknowledged).length
  return { gifts, byType, total, deductible, avoidedGain, nonCashTotal, needs8283, appraisalCount, missingAck, giftCount: gifts.filter((g) => g.counted).length }
}

export function hasAnyEntries(log) {
  return compute(log).giftCount > 0
}

export const DONATION_LIMITS = { name: 120, email: 200, phone: 40, notes: 2000, text: 160, rows: 500, amount: 1e8, body: 200000 }
const trimmed = (v, max) => String(v ?? '').trim().slice(0, max)

export function normalizeDonationSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body.' }
  const name = trimmed(body.name, DONATION_LIMITS.name)
  if (name.length < 2) return { error: 'A name is required.' }
  const email = trimmed(body.email, DONATION_LIMITS.email)
  if (!isValidEmail(email)) return { error: 'A valid email address is required.' }
  const phone = trimmed(body.phone, DONATION_LIMITS.phone)
  const notes = trimmed(body.notes, DONATION_LIMITS.notes)
  const taxYear = Number.parseInt(body.taxYear, 10)
  if (!TAX_YEARS.includes(taxYear)) return { error: 'Tax year is not supported.' }
  const gifts = (Array.isArray(body.gifts) ? body.gifts.slice(0, DONATION_LIMITS.rows) : [])
    .map((g) => ({
      id: trimmed(g?.id, 40) || newId(),
      date: isCompleteDate(g?.date) ? g.date : '',
      organization: trimmed(g?.organization, DONATION_LIMITS.text),
      description: trimmed(g?.description, DONATION_LIMITS.text),
      type: GIFT_TYPES.some((t) => t.id === g?.type) ? g.type : 'cash',
      amount: String(Math.min(DONATION_LIMITS.amount, Math.max(0, toNumber(g?.amount)))),
      basis: String(Math.min(DONATION_LIMITS.amount, Math.max(0, toNumber(g?.basis)))),
      longTerm: g?.longTerm !== false,
      acknowledged: g?.acknowledged === true,
    }))
    .filter((g) => toNumber(g.amount) > 0)
  if (!gifts.length) return { error: 'Add at least one gift before submitting.' }
  const log = { taxYear, gifts }
  const r = compute(log)
  return { value: { name, email, phone, notes, taxYear, log, totalGifts: Math.round(r.total * 100) / 100, estimatedDeduction: Math.round(r.deductible * 100) / 100 } }
}
