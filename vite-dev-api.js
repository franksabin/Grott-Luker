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

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > LIMITS.body) return { tooLarge: true }
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

      const passcode = process.env.CPA_PASSCODE || 'dev'
      if (!process.env.CPA_PASSCODE) {
        server.config.logger.warn(
          '[dev-api] CPA_PASSCODE not set — using "dev" for the local staff passcode.',
        )
      }

      const isStaff = (req) => (req.headers['x-cpa-passcode'] || '') === passcode

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
