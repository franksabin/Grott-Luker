// Tool sign-offs: a Grott Luker CPA marks a tool as tested and ready.
// Shared by the pages, the Worker, and the dev API.
import { TOOLS } from './tools.js'

// Reviewers who can sign a tool off: the Grott Luker team plus Frank and Jenn at BlueLine.
export const CPAS = ['Travers', 'Deb', 'Jacques', 'Paula', 'Frank', 'Jenn']

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

// A tool is client ready when a CPA has signed it off, or the registry marks it live outright.
export function isReady(tool, signoffs) {
  return tool?.status === 'live' || (signoffs?.[tool?.id]?.length || 0) > 0
}
