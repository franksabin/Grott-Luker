// Client for the submissions API (Cloudflare Worker + D1 in production, and a
// node:sqlite-backed Vite dev middleware locally).
//
// The CPA passcode is held in sessionStorage only — it is cleared when the tab
// closes and is never written to localStorage or a cookie.

const PASSCODE_KEY = 'gl.cpa.passcode'

export function getPasscode() {
  try {
    return sessionStorage.getItem(PASSCODE_KEY) || ''
  } catch {
    return ''
  }
}

export function setPasscode(code) {
  try {
    sessionStorage.setItem(PASSCODE_KEY, code)
  } catch {
    /* sessionStorage unavailable — the passcode simply won't persist. */
  }
}

export function clearPasscode() {
  try {
    sessionStorage.removeItem(PASSCODE_KEY)
  } catch {
    /* no-op */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, passcode } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(passcode ? { 'x-cpa-passcode': passcode } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      0,
    )
  }

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      /* Non-JSON response — fall through to the status-based message. */
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status)
  }
  return data
}

// Public: a client submitting their own snapshot.
export function submitSnapshot({ name, email, phone, notes, figures }) {
  return request('/snapshots', {
    method: 'POST',
    body: { name, email, phone, notes, figures },
  })
}

// CPA-only: list submissions (summary rows, no full figures).
export function listSnapshots(passcode) {
  return request('/snapshots', { passcode })
}

// CPA-only: fetch one submission including all figures.
export function getSnapshot(id, passcode) {
  return request(`/snapshots/${encodeURIComponent(id)}`, { passcode })
}

// ---------------- Mileage & Expense Log ----------------

// Public: a client submitting their year-end mileage/expense log.
export function submitMileageLog({ name, email, phone, notes, taxYear, trips, expenses }) {
  return request('/mileage-logs', {
    method: 'POST',
    body: { name, email, phone, notes, taxYear, trips, expenses },
  })
}

// CPA-only: list mileage log submissions (summary rows).
export function listMileageLogs(passcode) {
  return request('/mileage-logs', { passcode })
}

// CPA-only: one submission including all entries.
export function getMileageLog(id, passcode) {
  return request(`/mileage-logs/${encodeURIComponent(id)}`, { passcode })
}

// ---------------- Charitable Donation Log ----------------
export function submitDonationLog({ name, email, phone, notes, taxYear, gifts }) {
  return request('/donation-logs', { method: 'POST', body: { name, email, phone, notes, taxYear, gifts } })
}
export function listDonationLogs(passcode) {
  return request('/donation-logs', { passcode })
}
export function getDonationLog(id, passcode) {
  return request(`/donation-logs/${encodeURIComponent(id)}`, { passcode })
}
