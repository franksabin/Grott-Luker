// Cloudflare Worker: submissions API for the Know Your Numbers client form.
//
// Routes (everything else falls through to the static site assets):
//   POST /api/snapshots        public  — a client submits their snapshot
//   GET  /api/snapshots        staff   — list submissions (summary rows)
//   GET  /api/snapshots/:id    staff   — one submission including all figures
//
// Staff routes require the `x-cpa-passcode` header to match the CPA_PASSCODE
// secret. If that secret is not configured the staff routes fail closed, so a
// missing secret can never mean open access to client financial data.
import { normalizeSubmission, LIMITS } from '../src/lib/submission.js'

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
