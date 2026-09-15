// Local development API for the submissions endpoints.
//
// Production runs these routes in a Cloudflare Worker against D1. `wrangler dev`
// would normally stand that up locally, but it depends on workerd, which has no
// win32-arm64 build — so on this machine the dev server mirrors the exact same
// routes using node:sqlite. Same validation module, same SQL shape, same JSON.
//
// Dev only: this plugin is `apply: 'serve'` and never runs in a build.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { normalizeSubmission, LIMITS } from './src/lib/submission.js'
import { normalizeMileageSubmission, MILEAGE_LIMITS } from './src/lib/mileage.js'
import { normalizeDonationSubmission, DONATION_LIMITS } from './src/lib/donations.js'

const DATA_DIR = '.dev-data'
const DB_FILE = 'snapshots.db'
const LIST_LIMIT = 200

function openDb(root) {
  const dir = path.join(root, DATA_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(path.join(dir, DB_FILE))
  db.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'))
  return db
}

function send(res, status, data) {
  const payload = JSON.stringify(data)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

async function readBody(req, limit = LIMITS.body) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return { tooLarge: true }
    chunks.push(chunk)
  }
  return { raw: Buffer.concat(chunks).toString('utf8') }
}

export default function devApi() {
  return {
    name: 'gl-dev-api',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      let db
      try {
        db = openDb(root)
      } catch (err) {
        server.config.logger.error(
          `[dev-api] Could not open the local SQLite database: ${err.message}`,
        )
        return
      }

      // Mirrors the Worker: no CPA_PASSCODE means staff routes are open.
      const passcode = process.env.CPA_PASSCODE || ''
      if (!process.env.CPA_PASSCODE) {
        server.config.logger.warn(
          '[dev-api] CPA_PASSCODE not set — staff routes are open (beta mode), matching the Worker.',
        )
      }

      const isStaff = (req) => !passcode || (req.headers['x-cpa-passcode'] || '') === passcode

      // Mounted at /api, so req.url here is relative (e.g. "/snapshots").
      server.middlewares.use('/api', async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const route = url.pathname.replace(/\/+$/, '') || '/'

        try {
          if (route === '/snapshots' && req.method === 'POST') {
            const { raw, tooLarge } = await readBody(req)
            if (tooLarge) return send(res, 413, { error: 'Submission is too large.' })

            let body
            try {
              body = JSON.parse(raw)
            } catch {
              return send(res, 400, { error: 'Invalid JSON.' })
            }

            const { value, error } = normalizeSubmission(body)
            if (error) return send(res, 400, { error })

            const id = crypto.randomUUID()
            db.prepare(
              `INSERT INTO snapshots
                 (id, created_at, name, email, phone, notes, figures,
                  net_worth, total_assets, total_liabilities, annual_cash_flow)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              id,
              new Date().toISOString(),
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
            return send(res, 201, { ok: true, id })
          }

          if (route === '/snapshots' && req.method === 'GET') {
            if (!isStaff(req)) return send(res, 401, { error: 'Unauthorized.' })
            const rows = db
              .prepare(
                `SELECT id, created_at, name, email, phone, net_worth
                   FROM snapshots
                  ORDER BY created_at DESC
                  LIMIT ?`,
              )
              .all(LIST_LIMIT)
            return send(res, 200, { snapshots: rows })
          }

          const detail = route.match(/^\/snapshots\/([^/]+)$/)
          if (detail) {
            if (req.method !== 'GET') {
              return send(res, 405, { error: 'Method not allowed.' })
            }
            if (!isStaff(req)) return send(res, 401, { error: 'Unauthorized.' })
            const row = db
              .prepare(`SELECT * FROM snapshots WHERE id = ?`)
              .get(decodeURIComponent(detail[1]))
            if (!row) return send(res, 404, { error: 'Not found.' })
            let figures = {}
            try {
              figures = JSON.parse(row.figures) || {}
            } catch {
              figures = {}
            }
            return send(res, 200, { snapshot: { ...row, figures } })
          }

          if (route === '/mileage-logs' && req.method === 'POST') {
            const { raw, tooLarge } = await readBody(req, MILEAGE_LIMITS.body)
            if (tooLarge) return send(res, 413, { error: 'Submission is too large.' })
            let body
            try {
              body = JSON.parse(raw)
            } catch {
              return send(res, 400, { error: 'Invalid JSON.' })
            }
            const { value, error } = normalizeMileageSubmission(body)
            if (error) return send(res, 400, { error })
            const id = crypto.randomUUID()
            db.prepare(
              `INSERT INTO mileage_logs
                 (id, created_at, name, email, phone, notes, tax_year, log, total_miles, estimated_deduction)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(id, new Date().toISOString(), value.name, value.email, value.phone || null,
              value.notes || null, value.taxYear, JSON.stringify(value.log), value.totalMiles, value.estimatedDeduction)
            return send(res, 201, { ok: true, id })
          }
          if (route === '/mileage-logs' && req.method === 'GET') {
            if (!isStaff(req)) return send(res, 401, { error: 'Unauthorized.' })
            const rows = db.prepare(
              `SELECT id, created_at, name, email, phone, tax_year, total_miles, estimated_deduction
                 FROM mileage_logs ORDER BY created_at DESC LIMIT ?`,
            ).all(LIST_LIMIT)
            return send(res, 200, { logs: rows })
          }
          const mdetail = route.match(/^\/mileage-logs\/([^/]+)$/)
          if (mdetail) {
            if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' })
            if (!isStaff(req)) return send(res, 401, { error: 'Unauthorized.' })
            const row = db.prepare(`SELECT * FROM mileage_logs WHERE id = ?`).get(decodeURIComponent(mdetail[1]))
            if (!row) return send(res, 404, { error: 'Not found.' })
            let log = null
            try {
              log = JSON.parse(row.log)
            } catch {
              log = null
            }
            return send(res, 200, { log: { ...row, log } })
          }
          if (route === '/donation-logs' && req.method === 'POST') {
            const { raw, tooLarge } = await readBody(req, DONATION_LIMITS.body)
            if (tooLarge) return send(res, 413, { error: 'Submission is too large.' })
            let body
            try { body = JSON.parse(raw) } catch { return send(res, 400, { error: 'Invalid JSON.' }) }
            const { value, error } = normalizeDonationSubmission(body)
            if (error) return send(res, 400, { error })
            const id = crypto.randomUUID()
            db.prepare(`INSERT INTO donation_logs (id, created_at, name, email, phone, notes, tax_year, log, total_gifts, estimated_deduction)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(id, new Date().toISOString(), value.name, value.email, value.phone || null, value.notes || null,
                value.taxYear, JSON.stringify(value.log), value.totalGifts, value.estimatedDeduction)
            return send(res, 201, { ok: true, id })
          }
          if (route === '/donation-logs' && req.method === 'GET') {
            if (!isStaff(req)) return send(res, 401, { error: 'Unauthorized.' })
            const rows = db.prepare(`SELECT id, created_at, name, email, phone, tax_year, total_gifts, estimated_deduction FROM donation_logs ORDER BY created_at DESC LIMIT ?`).all(LIST_LIMIT)
            return send(res, 200, { logs: rows })
          }
          const ddetail = route.match(/^\/donation-logs\/([^/]+)$/)
          if (ddetail) {
            if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' })
            if (!isStaff(req)) return send(res, 401, { error: 'Unauthorized.' })
            const row = db.prepare(`SELECT * FROM donation_logs WHERE id = ?`).get(decodeURIComponent(ddetail[1]))
            if (!row) return send(res, 404, { error: 'Not found.' })
            let log = null
            try { log = JSON.parse(row.log) } catch { log = null }
            return send(res, 200, { log: { ...row, log } })
          }
          if (route === '/usage' && req.method === 'POST') {
            const { raw } = await readBody(req)
            let body = {}
            try {
              body = JSON.parse(raw || '{}')
            } catch {
              return send(res, 400, { error: 'Invalid JSON.' })
            }
            const toolId = typeof body?.tool_id === 'string' ? body.tool_id.slice(0, 64) : ''
            if (!/^[a-z0-9-]+$/.test(toolId)) return send(res, 400, { error: 'Invalid tool_id.' })
            db.prepare(`INSERT INTO usage_events (tool_id, ts) VALUES (?, ?)`).run(toolId, new Date().toISOString())
            res.statusCode = 204
            return res.end()
          }

          return send(res, 404, { error: 'Not found.' })
        } catch (err) {
          server.config.logger.error(`[dev-api] ${err.stack || err.message}`)
          return send(res, 500, { error: 'Server error.' })
        }
      })

      server.config.logger.info('  [dev-api] submissions API ready at /api/snapshots')
    },
  }
}
