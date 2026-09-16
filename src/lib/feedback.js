// CPA roadmap poll — shared between the client page, the Worker, and the dev API.
// Questions are defined once here so the form, validation, and the tally in
// Client results can never drift apart.
import { TOOLS } from './tools.js'
import { isValidEmail } from './knowYourNumbers.js'

export const FEEDBACK_LIMITS = {
  body: 16 * 1024,
  name: 80,
  email: 120,
  firm: 80,
  text: 1200,
  otherIdea: 200,
}

const liveTools = TOOLS.filter((t) => t.status === 'live')
const devTools = TOOLS.filter((t) => t.status === 'testing')

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

// The poll, in display order. `type`: multi | pick3 | single | text.
export const QUESTIONS = [
  {
    id: 'usedTools',
    type: 'multi',
    title: 'Which live tools have you used, or would use in the next month?',
    hint: 'Pick as many as apply.',
    options: liveTools.map((t) => ({ id: t.id, label: t.title })),
  },
  {
    id: 'priority',
    type: 'pick3',
    max: 3,
    title: 'Which in-development tools should we finish and review first?',
    hint: 'Choose up to three.',
    options: devTools.map((t) => ({ id: t.id, label: t.title })),
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
  {
    id: 'blockers',
    type: 'text',
    title: 'Anything wrong, confusing, or missing that would stop you using it?',
    hint: 'A number that looked off, a tool that needs another input, a report a client would not understand — anything.',
  },
]

const optionIds = (q) => new Set(q.options.map((o) => o.id))
const trimmed = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function blankAnswers() {
  return {
    usedTools: [],
    priority: [],
    newIdeas: [],
    otherIdea: '',
    frequency: '',
    sharing: '',
    blockers: '',
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
    if (q.type === 'multi' || q.type === 'pick3') {
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
    out.usedTools.length || out.priority.length || out.newIdeas.length || out.otherIdea ||
    out.frequency || out.sharing || out.blockers
  if (!answered) return { error: 'Answer at least one question before sending.' }
  return { value: out }
}

// Tally a list of submissions into per-question counts for the results view.
export function tally(rows) {
  const n = rows.length
  const counts = {}
  for (const q of QUESTIONS) {
    if (!q.options) continue
    counts[q.id] = q.options.map((o) => ({
      id: o.id,
      label: o.label,
      count: rows.filter((r) => (Array.isArray(r[q.id]) ? r[q.id].includes(o.id) : r[q.id] === o.id)).length,
    }))
    counts[q.id].sort((a, b) => b.count - a.count)
  }
  const text = rows
    .filter((r) => r.blockers || r.otherIdea)
    .map((r) => ({ id: r.id, created_at: r.created_at, name: r.name, firm: r.firm, blockers: r.blockers, otherIdea: r.otherIdea }))
  return { n, counts, text }
}
