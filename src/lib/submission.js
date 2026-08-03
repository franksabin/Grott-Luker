// Validation and normalization for client-submitted snapshots.
//
// Shared by the Cloudflare Worker (production) and the local Vite dev API so
// both enforce identical rules. Pure JS — no React, no platform APIs.
import { FIELD_KEYS, compute, isValidEmail } from './knowYourNumbers.js'
import { toNumber } from './format.js'

export const LIMITS = {
  name: 120,
  email: 200,
  phone: 40,
  notes: 2000,
  // Sanity ceiling per figure; guards against absurd or malicious values.
  figure: 1e12,
  // Max raw request body size in bytes.
  body: 20000,
}

function trimmed(value, max) {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

/**
 * Validate an incoming submission body.
 * Returns { value } on success or { error } with a client-safe message.
 */
export function normalizeSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid request body.' }
  }

  const name = trimmed(body.name, LIMITS.name)
  if (name.length < 2) return { error: 'A name is required.' }

  const email = trimmed(body.email, LIMITS.email)
  if (!isValidEmail(email)) return { error: 'A valid email address is required.' }

  const phone = trimmed(body.phone, LIMITS.phone)
  const notes = trimmed(body.notes, LIMITS.notes)

  const rawFigures = body.figures
  if (!rawFigures || typeof rawFigures !== 'object' || Array.isArray(rawFigures)) {
    return { error: 'Figures are missing.' }
  }

  // Only known keys are kept; anything else the client sends is discarded.
  const figures = {}
  let entered = 0
  for (const key of FIELD_KEYS) {
    const n = toNumber(rawFigures[key])
    if (!Number.isFinite(n) || n < 0) {
      figures[key] = 0
      continue
    }
    const capped = Math.min(n, LIMITS.figure)
    figures[key] = capped
    if (capped > 0) entered += 1
  }
  if (entered === 0) return { error: 'At least one figure is required.' }

  const totals = compute(figures)

  return {
    value: {
      name,
      email,
      phone,
      notes,
      figures,
      netWorth: totals.netWorth,
      totalAssets: totals.totalAssets,
      totalLiabilities: totals.totalLiabilities,
      annualCashFlow: totals.annualCashFlow,
    },
  }
}
