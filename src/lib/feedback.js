// CPA roadmap poll — shared between the client page, the Worker, and the dev API.
// Questions are defined once here so the form, validation, and the tally in
// Client results can never drift apart.
import { TOOLS, GROUPS, GROUP_ORDER } from './tools.js'
import { isValidEmail } from './knowYourNumbers.js'

export const FEEDBACK_LIMITS = {
  body: 16 * 1024,
  name: 80,
  email: 120,
  firm: 80,
  text: 1200,
  otherIdea: 200,
}

// Interest scale for every tool. Stored as 0–4; "haven't looked" is simply unrated.
export const RATINGS = [
  { id: 0, label: 'Not useful', short: 'No' },
  { id: 1, label: 'Marginal', short: 'Low' },
  { id: 2, label: 'Useful', short: 'Useful' },
  { id: 3, label: 'Very useful', short: 'Very' },
  { id: 4, label: 'Must have', short: 'Must' },
]
export const RATING_MAX = RATINGS.length - 1

// All tools, in dashboard order, with the section they live in.
export const RATED_TOOLS = GROUP_ORDER.flatMap((gid) =>
  TOOLS.filter((t) => t.group === gid).map((t) => ({
    id: t.id,
    label: t.title,
    group: gid,
    groupTitle: GROUPS[gid].title,
    status: t.status,
    description: t.description,
  })),
)

export const NEW_TOOL_IDEAS = [
  { id: 'entity-choice', label: 'Entity choice — LLC vs. S-corp vs. C-corp' },
  { id: 'estate-gift', label: 'Estate & gift tax exposure' },
  { id: 'backdoor-roth', label: 'Backdoor & mega-backdoor Roth' },
  { id: 'rmd-planner', label: 'RMD planner (multiple accounts, QCD offsets)' },
  { id: 'equity-comp', label: 'Equity compensation — RSU / ISO / AMT' },
  { id: 'rental-real-estate', label: 'Rental real estate & cost segregation' },
  { id: 'residency-change', label: 'State residency / domicile change' },
  { id: 'niit-planning', label: 'NIIT & additional Medicare tax planning' },
  { id: 'education-529', label: '529 & education funding' },
  { id: 'hsa-strategy', label: 'HSA strategy' },
  { id: 'tax-doc-checklist', label: 'Shareable tax-document checklist for clients' },
  { id: 'onboarding-intake', label: 'Shareable new-client intake form' },
]

export const FREQUENCY = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'A few times a month' },
  { id: 'seasonal', label: 'Mainly in planning season' },
  { id: 'rarely', label: 'Rarely — not yet part of my process' },
]

export const SHARING = [
  { id: 'print', label: 'Print or save the PDF for the client' },
  { id: 'screen', label: 'Walk through it live in a meeting' },
  { id: 'link', label: 'Email the client a link to fill in themselves' },
  { id: 'internal', label: 'Internal use only for now' },
]

// The poll, in display order. `type`: rating | multi | pick3 | single.
export const TOOL_COUNT = RATED_TOOLS.length
export const DEV_COUNT = RATED_TOOLS.filter((t) => t.status === 'testing').length
export const QUESTIONS = [
  {
    id: 'toolInterest',
    type: 'rating',
    title: 'How useful would each tool be in your practice?',
    hint: 'Rate every tool you have an opinion on. Skip any you have not looked at — a skip is not a zero.',
    options: RATED_TOOLS,
  },
  {
    id: 'newIdeas',
    type: 'multi',
    title: 'What is missing? Which of these would you actually use?',
    hint: 'Pick any — and add your own below.',
    options: NEW_TOOL_IDEAS,
    other: { id: 'otherIdea', placeholder: 'Something else we should build…' },
  },
  {
    id: 'frequency',
    type: 'single',
    title: 'Realistically, how often would you use the toolkit?',
    options: FREQUENCY,
  },
  {
    id: 'sharing',
    type: 'single',
    title: 'How would you most likely bring a client into it?',
    options: SHARING,
  },
]

const optionIds = (q) => new Set(q.options.map((o) => o.id))
const trimmed = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function blankAnswers() {
  return {
    toolInterest: {},
    newIdeas: [],
    otherIdea: '',
    frequency: '',
    sharing: '',
    name: '',
    email: '',
    firm: '',
  }
}

// Validate + clean a poll submission. Returns { value } or { error }.
export function normalizeFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body.' }
  const out = blankAnswers()
  for (const q of QUESTIONS) {
    const ids = q.options ? optionIds(q) : null
    if (q.type === 'rating') {
      const src = body[q.id] && typeof body[q.id] === 'object' && !Array.isArray(body[q.id]) ? body[q.id] : {}
      const clean = {}
      for (const o of q.options) {
        const v = Number(src[o.id])
        if (Number.isInteger(v) && v >= 0 && v <= RATING_MAX) clean[o.id] = v
      }
      out[q.id] = clean
    } else if (q.type === 'multi' || q.type === 'pick3') {
      const arr = Array.isArray(body[q.id]) ? body[q.id].filter((v) => ids.has(v)) : []
      out[q.id] = [...new Set(arr)].slice(0, q.type === 'pick3' ? q.max : q.options.length)
      if (q.other) out[q.other.id] = trimmed(body[q.other.id], FEEDBACK_LIMITS.otherIdea)
    } else if (q.type === 'single') {
      out[q.id] = ids.has(body[q.id]) ? body[q.id] : ''
    } else if (q.type === 'text') {
      out[q.id] = trimmed(body[q.id], FEEDBACK_LIMITS.text)
    }
  }
  out.name = trimmed(body.name, FEEDBACK_LIMITS.name)
  out.email = trimmed(body.email, FEEDBACK_LIMITS.email)
  out.firm = trimmed(body.firm, FEEDBACK_LIMITS.firm)
  if (out.email && !isValidEmail(out.email)) return { error: 'That email address does not look right.' }

  const answered =
    Object.keys(out.toolInterest).length || out.newIdeas.length || out.otherIdea ||
    out.frequency || out.sharing
  if (!answered) return { error: 'Answer at least one question before sending.' }
  return { value: out }
}

// Tally a list of submissions into per-question counts for the results view.
export function tally(rows) {
  const n = rows.length
  const counts = {}
  // Per-tool interest: average of 0–RATING_MAX ratings among those who rated it, plus the spread.
  const tools = RATED_TOOLS.map((t) => {
    const votes = rows.map((r) => r.toolInterest?.[t.id]).filter((v) => Number.isInteger(v))
    const dist = RATINGS.map((r) => votes.filter((v) => v === r.id).length)
    const avg = votes.length ? votes.reduce((x, y) => x + y, 0) / votes.length : null
    const mustHave = dist[RATING_MAX]
    return { ...t, n: votes.length, avg, dist, mustHave, score: avg === null ? null : Math.round((avg / RATING_MAX) * 100) }
  })
  tools.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.n - a.n || b.mustHave - a.mustHave)
  for (const q of QUESTIONS) {
    if (!q.options || q.type === 'rating') continue
    counts[q.id] = q.options.map((o) => ({
      id: o.id,
      label: o.label,
      count: rows.filter((r) => (Array.isArray(r[q.id]) ? r[q.id].includes(o.id) : r[q.id] === o.id)).length,
    }))
    counts[q.id].sort((a, b) => b.count - a.count)
  }
  const text = rows
    .filter((r) => r.otherIdea)
    .map((r) => ({ id: r.id, created_at: r.created_at, name: r.name, firm: r.firm, otherIdea: r.otherIdea }))
  return { n, counts, tools, text }
}
