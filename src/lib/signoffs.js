// Tool sign-offs: a Grott Luker CPA marks a tool as tested and ready.
// Shared by the pages, the Worker, and the dev API.
import { TOOLS } from './tools.js'

// Reviewers who can sign a tool off, in two groups: the Grott Luker CPAs and the BlueLine team.
export const REVIEWER_GROUPS = [
  { id: 'gl', label: 'Grott Luker', names: ['Travers', 'Deb', 'Jacques'] },
  { id: 'bl', label: 'BlueLine', names: ['Jenn', 'Frank', 'Paula'] },
]
export const CPAS = REVIEWER_GROUPS.flatMap((g) => g.names)

// Every change to a calculator's results or method is one entry, in order. The last entry is the tool's current version, and its date is
// the "last updated" date shown on the tool. Each review is stamped with the version it was given on, so the record says what was reviewed.
//   at              when the change went live (ISO with offset). It is also the version's identity, so do not change it once published.
//   label           how the page names that date
//   extent          'major' (figures changed for some clients), 'minor' (wording or layout only), or 'correction' (a wrong figure fixed)
//   done            what was done, one short sentence each, shown on the tool page
//   keepsApprovals  true: earlier reviews keep counting and show as "Carried over"; false: they stop counting until someone signs again
// scripts/calc-fingerprints.mjs (run by `npm run test:engine`) fails when a tool's calculation files change, as a reminder to add an entry here.
export const EXTENT_LABEL = {
  major: 'Major: figures changed for some clients',
  minor: 'Minor: wording or layout, no figures changed',
  correction: 'Correction: a figure was wrong and is fixed',
}
export const EXTENT_SHORT = { major: 'major change', minor: 'minor change', correction: 'correction' }
export const MATH_CHANGES = {
  'multi-year-projection': [
    {
      at: '2026-11-09T00:00:00-05:00',
      label: 'Nov 9, 2026',
      extent: 'major',
      done: [
        'The headline is the benefit to the client alone, with the present value under it. Income now pays its own tax and IRMAA; the taxable account pays only what RMDs and conversions add.',
        'IRMAA in the first two years is fixed (it was charged two years early). Lifetime IRMAA changes only for clients already on Medicare. A “Check this result” note now flags spending and early withholding.',
        'Unchanged: RMDs, conversions, the tax each year, lifetime tax, and total converted.',
      ],
      keepsApprovals: true, // decided 2026-11-09: Jacques's Oct 27 approval of the output carries over
    },
  ],
}

// The version a review is stamped with when it is given: the tool's current change, or 'original' when no change has been recorded.
export const ORIGINAL = 'original'
const changesOf = (toolId) => MATH_CHANGES[toolId] || []
export const currentChange = (toolId) => changesOf(toolId).at(-1) || null
export const versionOf = (toolId) => currentChange(toolId)?.at || ORIGINAL
export const lastUpdated = (toolId) => currentChange(toolId)

// How a review's version reads on the page. '' is a review made before versions were tracked.
export function versionLabel(toolId, version) {
  if (!version) return 'Before version tracking'
  if (version === ORIGINAL) return 'Original release'
  const c = changesOf(toolId).find((x) => x.at === version)
  return c ? `${c.label} version` : 'Earlier version'
}

// SQL shared by the Worker and the dev API, so both keep the same record. Every review is a row, identified by tool, reviewer and version.
export const SIGNOFF_SQL = {
  table: `CREATE TABLE IF NOT EXISTS tool_signoffs (tool_id TEXT NOT NULL, cpa TEXT NOT NULL, version TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, note TEXT, PRIMARY KEY (tool_id, cpa, version))`,
  list: `SELECT tool_id, cpa, version, created_at, note FROM tool_signoffs ORDER BY created_at DESC`,
  // Parameters: tool_id, cpa, version, created_at, note. Re-signing the same version replaces that review's date.
  add: `INSERT OR REPLACE INTO tool_signoffs (tool_id, cpa, version, created_at, note) VALUES (?, ?, ?, ?, ?)`,
  // Parameters: tool_id, cpa, tool_id, cpa. Takes back the reviewer's latest review on the tool only; earlier reviews stay on the record.
  withdrawLatest: `DELETE FROM tool_signoffs WHERE tool_id = ? AND cpa = ? AND created_at = (SELECT MAX(created_at) FROM tool_signoffs WHERE tool_id = ? AND cpa = ?)`,
  // This fails on a table created before versions were kept, which is how the upgrade is detected.
  probe: `SELECT version FROM tool_signoffs LIMIT 0`,
  // Upgrades a table from before versions were kept. Every old row is kept, with version '' (not recorded).
  upgrade: [
    `DROP TABLE IF EXISTS tool_signoffs_next`,
    `CREATE TABLE tool_signoffs_next (tool_id TEXT NOT NULL, cpa TEXT NOT NULL, version TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, note TEXT, PRIMARY KEY (tool_id, cpa, version))`,
    `INSERT INTO tool_signoffs_next (tool_id, cpa, version, created_at, note) SELECT tool_id, cpa, '', created_at, note FROM tool_signoffs`,
    `DROP TABLE tool_signoffs`,
    `ALTER TABLE tool_signoffs_next RENAME TO tool_signoffs`,
  ],
}

// The version comes from the registry, never from the browser, so a review cannot be stamped with a version the reviewer did not see.
export function normalizeSignoff(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body.' }
  const toolId = String(body.toolId || '').trim()
  const cpa = String(body.cpa || '').trim()
  if (!TOOLS.some((t) => t.id === toolId)) return { error: 'Unknown tool.' }
  if (!CPAS.includes(cpa)) return { error: 'Unknown reviewer.' }
  const note = String(body.note || '').trim().slice(0, 500)
  return { value: { toolId, cpa, note, version: versionOf(toolId) } }
}

// rows: [{ tool_id, cpa, version, created_at, note }] → { [toolId]: [{ cpa, version, created_at, note }] }, every review, newest first.
export function groupSignoffs(rows) {
  const out = {}
  for (const r of rows || []) {
    ;(out[r.tool_id] ||= []).push({ cpa: r.cpa, version: r.version || '', created_at: r.created_at, note: r.note || '' })
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => (Date.parse(b.created_at) - Date.parse(a.created_at)) || CPAS.indexOf(a.cpa) - CPAS.indexOf(b.cpa))
  }
  return out
}

// A review is "earlier" when the tool has changed since it was given and that change does not carry approvals over.
// (A tool with no recorded change has no earlier reviews.)
export function isEarlier(toolId, row) {
  const c = currentChange(toolId)
  if (!c || c.keepsApprovals) return false
  return (row?.version || '') !== c.at
}

// Each reviewer's latest review on the tool. Their earlier reviews are on the record but do not stand for them.
export function latestReviews(toolId, signoffs) {
  const best = new Map()
  for (const s of signoffs?.[toolId] || []) {
    const cur = best.get(s.cpa)
    if (!cur || Date.parse(s.created_at) > Date.parse(cur.created_at)) best.set(s.cpa, s)
  }
  return [...best.values()]
}

// The reviews that stand today: each reviewer's latest, unless that one is earlier.
export const currentSignoffs = (toolId, signoffs) => latestReviews(toolId, signoffs).filter((s) => !isEarlier(toolId, s))
export const staleSignoffs = (toolId, signoffs) => latestReviews(toolId, signoffs).filter((s) => isEarlier(toolId, s))

// Every review on the tool, newest first, with its status. Status says whether it still stands.
export function reviewRecord(toolId, signoffs) {
  const current = currentChange(toolId)
  const latest = new Set(latestReviews(toolId, signoffs))
  return (signoffs?.[toolId] || []).map((s) => {
    let status
    if (!latest.has(s)) status = 'Superseded by a later review'
    else if (isEarlier(toolId, s)) status = 'Earlier version'
    else if (current && (s.version || '') !== current.at) status = 'Carried over'
    else status = 'Current'
    return { ...s, status, versionText: versionLabel(toolId, s.version) }
  })
}

// A tool is client ready when a CPA has signed off on its current numbers, or the registry marks it live outright.
export function isReady(tool, signoffs) {
  return tool?.status === 'live' || currentSignoffs(tool?.id, signoffs).length > 0
}
// Signed off, but only on earlier numbers.
export function needsReReview(tool, signoffs) {
  return tool?.status !== 'live' && staleSignoffs(tool?.id, signoffs).length > 0 && currentSignoffs(tool?.id, signoffs).length === 0
}
