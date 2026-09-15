// Cloudflare Worker: submissions API for the Know Your Numbers client form.
//
// Routes (everything else falls through to the static site assets):
//   POST /api/snapshots        public  — a client submits their snapshot
//   GET  /api/snapshots        staff   — list submissions (summary rows)
//   GET  /api/snapshots/:id    staff   — one submission including all figures
//   POST /api/usage            public  — anonymous tool-open ping { tool_id }
//   POST /api/mileage-logs     public  — a client submits a mileage/expense log
//   GET  /api/mileage-logs     staff   — list logs (summary rows)
//   GET  /api/mileage-logs/:id staff   — one log including all entries
//   POST /api/donation-logs    public  — a client submits a charitable donation log
//   GET  /api/donation-logs     staff   — list; GET /api/donation-logs/:id staff — detail
//
// Staff routes require the `x-cpa-passcode` header to match the CPA_PASSCODE
// secret. If that secret is not configured the staff routes fail closed, so a
// missing secret can never mean open access to client financial data.
import { normalizeSubmission, LIMITS } from '../src/lib/submission.js'
import { normalizeMileageSubmission, MILEAGE_LIMITS } from '../src/lib/mileage.js'
import { normalizeDonationSubmission, DONATION_LIMITS } from '../src/lib/donations.js'

const LIST_LIMIT = 200

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

// Length-independent comparison so the passcode check does not leak length or
// prefix information through response timing.
function safeEqual(a, b) {
  const enc = new TextEncoder()
  const av = enc.encode(String(a))
  const bv = enc.encode(String(b))
  let diff = av.length ^ bv.length
  const len = Math.max(av.length, bv.length)
  for (let i = 0; i < len; i++) {
    diff |= (av[i] ?? 0) ^ (bv[i] ?? 0)
  }
  return diff === 0
}

function isStaff(request, env) {
  const expected = env.CPA_PASSCODE
  // Fail closed: no configured passcode means no staff access at all.
  if (!expected) return false
  return safeEqual(request.headers.get('x-cpa-passcode') || '', expected)
}

async function handleCreate(request, env) {
  const raw = await request.text()
  if (raw.length > LIMITS.body) {
    return json({ error: 'Submission is too large.' }, 413)
  }

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }

  const { value, error } = normalizeSubmission(body)
  if (error) return json({ error }, 400)

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO snapshots
       (id, created_at, name, email, phone, notes, figures,
        net_worth, total_assets, total_liabilities, annual_cash_flow)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      createdAt,
      value.name,
      value.email,
      value.phone || null,
      value.notes || null,
      JSON.stringify(value.figures),
      value.netWorth,
      value.totalAssets,
      value.totalLiabilities,
      value.annualCashFlow,
    )
    .run()

  // Deliberately returns no client data back to the public caller.
  return json({ ok: true, id }, 201)
}

async function handleList(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, name, email, phone, net_worth
       FROM snapshots
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(LIST_LIMIT)
    .all()

  return json({ snapshots: results || [] })
}

async function handleDetail(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM snapshots WHERE id = ?`)
    .bind(id)
    .first()

  if (!row) return json({ error: 'Not found.' }, 404)

  let figures = {}
  try {
    figures = JSON.parse(row.figures) || {}
  } catch {
    figures = {}
  }

  return json({ snapshot: { ...row, figures } })
}

/* ---------------- Mileage & Expense Log ---------------- */

async function handleMileageCreate(request, env) {
  const raw = await request.text()
  if (raw.length > MILEAGE_LIMITS.body) return json({ error: 'Submission is too large.' }, 413)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }
  const { value, error } = normalizeMileageSubmission(body)
  if (error) return json({ error }, 400)
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO mileage_logs
       (id, created_at, name, email, phone, notes, tax_year, log, total_miles, estimated_deduction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, new Date().toISOString(), value.name, value.email, value.phone || null,
      value.notes || null, value.taxYear, JSON.stringify(value.log), value.totalMiles, value.estimatedDeduction)
    .run()
  return json({ ok: true, id }, 201)
}

async function handleMileageList(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, name, email, phone, tax_year, total_miles, estimated_deduction
       FROM mileage_logs ORDER BY created_at DESC LIMIT ?`,
  ).bind(LIST_LIMIT).all()
  return json({ logs: results || [] })
}

async function handleMileageDetail(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM mileage_logs WHERE id = ?`).bind(id).first()
  if (!row) return json({ error: 'Not found.' }, 404)
  let log = null
  try {
    log = JSON.parse(row.log)
  } catch {
    log = null
  }
  return json({ log: { ...row, log } })
}

/* ---------------- Charitable Donation Log ---------------- */

async function handleDonationCreate(request, env) {
  const raw = await request.text()
  if (raw.length > DONATION_LIMITS.body) return json({ error: 'Submission is too large.' }, 413)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }
  const { value, error } = normalizeDonationSubmission(body)
  if (error) return json({ error }, 400)
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO donation_logs (id, created_at, name, email, phone, notes, tax_year, log, total_gifts, estimated_deduction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, new Date().toISOString(), value.name, value.email, value.phone || null, value.notes || null,
    value.taxYear, JSON.stringify(value.log), value.totalGifts, value.estimatedDeduction).run()
  return json({ ok: true, id }, 201)
}

async function handleDonationList(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, created_at, name, email, phone, tax_year, total_gifts, estimated_deduction FROM donation_logs ORDER BY created_at DESC LIMIT ?`,
  ).bind(LIST_LIMIT).all()
  return json({ logs: results || [] })
}

async function handleDonationDetail(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM donation_logs WHERE id = ?`).bind(id).first()
  if (!row) return json({ error: 'Not found.' }, 404)
  let log = null
  try { log = JSON.parse(row.log) } catch { log = null }
  return json({ log: { ...row, log } })
}

// Anonymous usage ping. Accepts { tool_id } and records a timestamp. No PII.
async function handleUsage(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }
  const toolId = typeof body?.tool_id === 'string' ? body.tool_id.slice(0, 64) : ''
  if (!/^[a-z0-9-]+$/.test(toolId)) return json({ error: 'Invalid tool_id.' }, 400)
  await env.DB.prepare(`INSERT INTO usage_events (tool_id, ts) VALUES (?, ?)`)
    .bind(toolId, new Date().toISOString())
    .run()
  return new Response(null, { status: 204 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const { pathname } = url

    // Not an API call — serve the built SPA.
    if (!pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('Not found', { status: 404 })
    }

    if (!env.DB) {
      return json({ error: 'Storage is not configured.' }, 503)
    }

    try {
      if (pathname === '/api/snapshots') {
        if (request.method === 'POST') return await handleCreate(request, env)
        if (request.method === 'GET') {
          if (!isStaff(request, env)) return json({ error: 'Unauthorized.' }, 401)
          return await handleList(env)
        }
        return json({ error: 'Method not allowed.' }, 405)
      }

      if (pathname === '/api/mileage-logs') {
        if (request.method === 'POST') return await handleMileageCreate(request, env)
        if (request.method === 'GET') {
          if (!isStaff(request, env)) return json({ error: 'Unauthorized.' }, 401)
          return await handleMileageList(env)
        }
        return json({ error: 'Method not allowed.' }, 405)
      }
      const mdetail = pathname.match(/^\/api\/mileage-logs\/([^/]+)$/)
      if (mdetail) {
        if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
        if (!isStaff(request, env)) return json({ error: 'Unauthorized.' }, 401)
        return await handleMileageDetail(env, decodeURIComponent(mdetail[1]))
      }

      if (pathname === '/api/donation-logs') {
        if (request.method === 'POST') return await handleDonationCreate(request, env)
        if (request.method === 'GET') {
          if (!isStaff(request, env)) return json({ error: 'Unauthorized.' }, 401)
          return await handleDonationList(env)
        }
        return json({ error: 'Method not allowed.' }, 405)
      }
      const ddetail = pathname.match(/^\/api\/donation-logs\/([^/]+)$/)
      if (ddetail) {
        if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
        if (!isStaff(request, env)) return json({ error: 'Unauthorized.' }, 401)
        return await handleDonationDetail(env, decodeURIComponent(ddetail[1]))
      }

      if (pathname === '/api/usage') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
        return await handleUsage(request, env)
      }

      const detail = pathname.match(/^\/api\/snapshots\/([^/]+)$/)
      if (detail) {
        if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
        if (!isStaff(request, env)) return json({ error: 'Unauthorized.' }, 401)
        return await handleDetail(env, decodeURIComponent(detail[1]))
      }

      return json({ error: 'Not found.' }, 404)
    } catch (err) {
      // Log server-side; return nothing that could leak schema or data.
      console.error('API error', err)
      return json({ error: 'Server error.' }, 500)
    }
  },
}
