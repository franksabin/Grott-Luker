// Tool sign-offs: a Grott Luker CPA marks a tool as tested and ready.
// Shared by the pages, the Worker, and the dev API.
import { TOOLS } from './tools.js'

// Reviewers who can sign a tool off, in two groups: the Grott Luker CPAs and the BlueLine team.
export const REVIEWER_GROUPS = [
  { id: 'gl', label: 'Grott Luker', names: ['Travers', 'Deb', 'Jacques'] },
  { id: 'bl', label: 'BlueLine', names: ['Jenn', 'Frank', 'Paula'] },
]
export const CPAS = REVIEWER_GROUPS.flatMap((g) => g.names)

export function normalizeSignoff(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body.' }
  const toolId = String(body.toolId || '').trim()
  const cpa = String(body.cpa || '').trim()
  if (!TOOLS.some((t) => t.id === toolId)) return { error: 'Unknown tool.' }
  if (!CPAS.includes(cpa)) return { error: 'Unknown reviewer.' }
  const note = String(body.note || '').trim().slice(0, 500)
  return { value: { toolId, cpa, note } }
}

// rows: [{ tool_id, cpa, created_at, note }] → { [toolId]: [{ cpa, created_at, note }] }
export function groupSignoffs(rows) {
  const out = {}
  for (const r of rows || []) {
    ;(out[r.tool_id] ||= []).push({ cpa: r.cpa, created_at: r.created_at, note: r.note || '' })
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => CPAS.indexOf(a.cpa) - CPAS.indexOf(b.cpa))
  return out
}

// When a calculator's results last changed. A sign-off given before that moment was given on different numbers: it stays on record
// and on the page, but it no longer counts toward "Ready" until the reviewer signs again. Add an entry whenever a tool's math changes
// in a way a reviewer would want to see again (not for wording or layout).
//   at              the moment the change went live (ISO with offset)
//   label           how the page names that date
//   what            what changed and what to do about it, shown on the tool page
//   keepsApprovals  true: earlier sign-offs keep counting and the page only shows the dated note; leave it out to make earlier
//                   sign-offs read "earlier" and send the tool back to "Needs re-review" until someone signs again
export const MATH_CHANGES = {
  'multi-year-projection': {
    at: '2026-11-09T00:00:00-05:00',
    label: 'Nov 9, 2026',
    what: 'the headline is now the benefit to the client alone, with present values, and the household’s own income now pays its own tax and IRMAA instead of the taxable account. RMDs, conversions and the tax each year are unchanged; end-of-plan wealth and the benefit figures changed. Re-run any plan prepared before this date.',
    keepsApprovals: true, // decided 2026-11-09: Jacques's Oct 27 approval of the output carries over
  },
}

// A sign-off is out of date when it predates the tool's last math change. (A date that cannot be read is never out of date.)
export function isStaleSignoff(toolId, row) {
  const change = MATH_CHANGES[toolId]
  return !!change && !change.keepsApprovals && Date.parse(row?.created_at) < Date.parse(change.at)
}
export const currentSignoffs = (toolId, signoffs) => (signoffs?.[toolId] || []).filter((s) => !isStaleSignoff(toolId, s))
export const staleSignoffs = (toolId, signoffs) => (signoffs?.[toolId] || []).filter((s) => isStaleSignoff(toolId, s))

// A tool is client ready when a CPA has signed off on its current numbers, or the registry marks it live outright.
export function isReady(tool, signoffs) {
  return tool?.status === 'live' || currentSignoffs(tool?.id, signoffs).length > 0
}
// Signed off once, but only on earlier numbers.
export function needsReReview(tool, signoffs) {
  return tool?.status !== 'live' && (signoffs?.[tool?.id]?.length || 0) > 0 && currentSignoffs(tool?.id, signoffs).length === 0
}
