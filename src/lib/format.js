// Formatting and parsing helpers shared across all tools.

export function toNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0
  if (value == null) return 0
  const cleaned = String(value).replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return isFinite(n) ? n : 0
}

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function money(value, decimals = 0) {
  const n = toNumber(value)
  return decimals === 2 ? usd2.format(n) : usd0.format(n)
}

// For results that can be negative — shows a leading minus and lets callers
// color it. Kept as plain currency; sign handled by formatter.
export function moneySigned(value) {
  return money(value, 0)
}

export function percent(value, decimals = 1) {
  const n = toNumber(value)
  return `${n.toFixed(decimals)}%`
}

export function number(value, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value))
}

// Timestamp shown on every estimate.
export function timestampNow() {
  const now = new Date()
  return now.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function clampPct(n) {
  if (!isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}
