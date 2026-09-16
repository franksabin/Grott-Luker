// CPA roadmap poll — shared between the form, the Worker, the dev API, and the
// tally in Client results, so the questions can never drift apart.
//
// Version 2 (2026-09-16). Stage one is the CPA tools in depth: each tool is
// described (model, inputs, outputs) and the CPA says what to add, change, or
// include. Stage two is one open question per BlueLine section. No grading.
import { TOOLS, GROUPS, GROUP_ORDER } from './tools.js'
import { isValidEmail } from './knowYourNumbers.js'

export const FEEDBACK_LIMITS = {
  body: 32 * 1024,
  name: 80,
  email: 120,
  firm: 80,
  text: 1500,
  otherIdea: 200,
}

export const CPA_GROUP = 'cpa'
export const OTHER_GROUPS = GROUP_ORDER.filter((g) => g !== CPA_GROUP)

// What each CPA tool does, what it takes, and what it gives back. Written from
// the tool code; keep in step when a tool changes.
export const CPA_TOOL_SPECS = {
  'estimated-tax': {
    quick: "Projects this year’s tax, tests the safe harbor, and sizes the remaining quarterly payments.",
    model:
      'Projects the year’s federal tax (and a simplified state tax) from expected income, tests both safe-harbor bases (90% of this year’s tax, or 100%/110% of last year’s), nets the withholding and estimated payments already in, and spreads what remains over the quarters left.',
    inputs: ['Expected total income this year', 'Withholding expected this year', 'Estimated payments already made', 'Filing status', 'Quarters remaining', 'Prior-year total tax (for the safe harbor)', 'State'],
    outputs: ['Projected federal and state tax', 'Safe-harbor amount under each basis', 'Already covered vs. remaining required', 'Suggested payment per remaining quarter', 'Projected balance due at filing', 'Every step of the math'],
  },
  'multi-year-projection': {
    quick: "Ten years of taxable income and tax, with and without annual Roth conversions.",
    model:
      'A ten-year projection of taxable income and federal tax. Wages stop at the retirement age, Social Security starts at the claim age, the IRA grows and pays RMDs, and an optional Roth conversion of a set amount runs for a set number of years. Shows the path with conversions against the path without.',
    inputs: ['Current age and filing status', 'Wages or other income', 'Social Security (annual)', 'Traditional IRA / 401(k) balance', 'Annual Roth conversion and for how many years', 'Age to stop working', 'Age to claim Social Security'],
    outputs: ['Total federal tax over ten years, with and without conversions', 'Ten-year tax difference', 'Ending IRA balance both ways', 'Taxable income by year, charted, with the bracket each year', 'Year-by-year table'],
  },
  'roth-conversion': {
    quick: "What converting a set amount costs this year in tax and IRMAA, and what it saves later.",
    model:
      'The cost of converting a given amount this year: federal tax on the conversion stacked on top of other income, state tax, the IRMAA surcharge it triggers two years out, and the RMD and future tax it avoids.',
    inputs: ['Traditional IRA / 401(k) balance', 'Amount to convert this year', 'Other taxable income this year', 'Filing status and age', 'State of residence'],
    outputs: ['Federal and state tax on the conversion', 'Added IRMAA surcharge', 'Total cost and effective rate on the conversion', 'Net amount into the Roth', 'First-year RMD avoided at 73 and future tax avoided per year'],
  },
  'exchange-1031': {
    quick: "Planned: a full or partial like-kind exchange — gain deferred, gain recognized on boot, and the new basis.",
    model:
      'Planned. A full or partial like-kind exchange: realized gain on the relinquished property, cash and mortgage boot, gain recognized, §1250 recapture at 25% with the balance at capital-gains rates plus NIIT, deferred gain, and carryover basis in the replacement property. Full exchange, partial exchange, and outright sale side by side, with the 45- and 180-day deadlines.',
    inputs: ['Relinquished property: sale price, selling costs, cost, improvements, depreciation, mortgage payoff', 'Replacement property: price, closing costs, new mortgage, cash added or taken', 'Filing status, other income, state', 'Sale closing date'],
    outputs: ['Realized gain and boot', 'Gain recognized, recapture, and tax due', 'Gain deferred and replacement-property basis', 'Full vs. partial vs. taxable sale', 'Identification and closing deadlines'],
  },
  'retirement-tax-map': {
    quick: "Each retirement income source traced to AGI, taxable Social Security, tax, IRMAA, and after-tax cash flow, for two scenarios.",
    model:
      'Maps each retirement income source into the return: gross income, how much Social Security becomes taxable, AGI, taxable income, federal and state tax, effective rate, IRMAA exposure, and after-tax cash flow. A second scenario can be run alongside for comparison.',
    inputs: ['Filing status and state', 'Income by source: wages, Social Security, pension, IRA withdrawals, Roth withdrawals, capital gains, interest and dividends, other', 'The same for a second scenario, optionally'],
    outputs: ['Gross income, taxable Social Security, AGI, taxable income', 'Federal, state, and total tax; effective rate', 'IRMAA tier and annual surcharge', 'After-tax cash flow', 'Scenario A vs. B side by side'],
  },
  'withholding-checkup': {
    quick: "From a mid-year pay stub to the W-4 adjustment that avoids an April surprise.",
    model:
      'Annualizes year-to-date pay stubs by pay frequency, projects the full-year tax with deductions, credits, other income, and any bonus still coming, compares it with withholding on its current pace plus estimated payments, and turns the gap into a W-4 Step 4(c) amount per remaining paycheck. Also shows the minimum to clear the 90% safe harbor.',
    inputs: ['Filing status and pay frequency', 'Pay periods paid so far', 'YTD wages and federal withholding, for each spouse', 'Bonus or other wages still expected', 'Other income, deductions (standard or itemized), credits, estimated payments'],
    outputs: ['Projected full-year tax and marginal rate', 'Projected withholding at the current pace', 'Balance due or refund at filing', 'Extra withholding per paycheck to close the gap, or how much to reduce it', 'Minimum per paycheck to avoid a penalty'],
  },
  'capital-gains-harvesting': {
    quick: "Room left in the 0% and 15% brackets, and what harvesting losses against planned gains saves.",
    model:
      'How much long-term gain fits in the 0% and 15% brackets given ordinary income, the tax on planned long- and short-term realizations, and the offset from harvesting losses, including the $3,000 ordinary-income offset, the carryforward, and the 3.8% net investment income tax.',
    inputs: ['Filing status', 'Ordinary taxable income before gains', 'Long-term and short-term gains planned', 'Unrealized losses available', 'Loss carryforward from prior years', 'Other investment income'],
    outputs: ['Headroom left in the 0% and 15% brackets', 'Gains after losses, long and short', 'Long-term tax, short-term tax, NIIT, ordinary-income offset', 'Federal tax with vs. without harvesting, and the amount saved', 'Carryforward to next year'],
  },
  'charitable-giving-optimizer': {
    quick: "Give annually, bunch into a donor-advised fund, or give from the IRA as a QCD — which saves the most.",
    model:
      'Same gifts, three routes: give every year, bunch two or three years into one (usually a donor-advised fund), or give from an IRA as a qualified charitable distribution at 70½ or older. Applies the 2026 rules: SALT cap and phase-down, the 0.5%-of-AGI floor on itemized gifts, the §68 cap for top-bracket filers, the non-itemizer deduction, and the senior deduction.',
    inputs: ['Filing status and AGI', 'Charitable giving per year', 'Age and annual IRA required distribution', 'State and local taxes paid, mortgage interest, other itemized deductions', 'Bunching window (2 or 3 years)'],
    outputs: ['Tax saved under each route over the window', 'Deduction actually captured each year', 'Best route for this client', 'Donor-advised fund vs. QCD comparison table'],
  },
}

// CPA tools in dashboard order, each with its spec (planned tools fall back to their plan).
export const CPA_TOOLS = TOOLS.filter((t) => t.group === CPA_GROUP).map((t) => {
  const spec = CPA_TOOL_SPECS[t.id] || {}
  return {
    id: t.id,
    label: t.title,
    status: t.status,
    path: t.path,
    planned: t.id === 'exchange-1031' || (!CPA_TOOL_SPECS[t.id] && !!t.plan),
    quick: spec.quick || t.description,
    shot: t.id === 'exchange-1031' || !CPA_TOOL_SPECS[t.id] ? null : `/poll/${t.id}.jpg`,
    model: spec.model || t.plan || t.description,
    inputs: spec.inputs || t.planInputs || [],
    outputs: spec.outputs || [],
  }
})

// The BlueLine sections, each with the titles of the tools it holds.
export const SECTIONS = OTHER_GROUPS.map((gid) => ({
  id: gid,
  title: GROUPS[gid].title,
  description: GROUPS[gid].description,
  tools: TOOLS.filter((t) => t.group === gid).map((t) => ({ id: t.id, label: t.title, status: t.status })),
}))

export const TOOL_COUNT = TOOLS.length
export const CPA_COUNT = CPA_TOOLS.length

// Legacy (poll v1) scale, kept so older answers still read in Client results.
export const RATINGS = [
  { id: 0, label: 'Not useful', short: 'No' },
  { id: 1, label: 'Marginal', short: 'Low' },
  { id: 2, label: 'Useful', short: 'Useful' },
  { id: 3, label: 'Very useful', short: 'Very' },
  { id: 4, label: 'Must have', short: 'Must' },
]
export const RATING_MAX = RATINGS.length - 1
export const RATED_TOOLS = GROUP_ORDER.flatMap((gid) =>
  TOOLS.filter((t) => t.group === gid).map((t) => ({ id: t.id, label: t.title, group: gid, groupTitle: GROUPS[gid].title, status: t.status })),
)

const trimmed = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function blankAnswers() {
  return {
    version: 2,
    toolNotes: {}, // { toolId: text } — what to add, change, or include
    toolAsIs: [], // toolIds marked "works as is"
    toolRank: [], // toolIds in order of interest, most interested first
    sectionNotes: {}, // { groupId: text } — add, remove, thoughts
    anythingElse: '',
    name: '',
    email: '',
    firm: '',
  }
}

// Validate + clean a poll submission. Returns { value } or { error }.
export function normalizeFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body.' }
  const out = blankAnswers()
  const cpaIds = new Set(CPA_TOOLS.map((t) => t.id))
  const sectionIds = new Set(SECTIONS.map((s) => s.id))

  const notes = body.toolNotes && typeof body.toolNotes === 'object' && !Array.isArray(body.toolNotes) ? body.toolNotes : {}
  for (const id of cpaIds) {
    const v = trimmed(notes[id], FEEDBACK_LIMITS.text)
    if (v) out.toolNotes[id] = v
  }
  const idList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => cpaIds.has(x)))] : [])
  out.toolAsIs = idList(body.toolAsIs)
  out.toolRank = idList(body.toolRank) // order preserved, duplicates dropped

  const sec = body.sectionNotes && typeof body.sectionNotes === 'object' && !Array.isArray(body.sectionNotes) ? body.sectionNotes : {}
  for (const id of sectionIds) {
    const v = trimmed(sec[id], FEEDBACK_LIMITS.text)
    if (v) out.sectionNotes[id] = v
  }
  out.anythingElse = trimmed(body.anythingElse, FEEDBACK_LIMITS.text)

  out.name = trimmed(body.name, FEEDBACK_LIMITS.name)
  out.email = trimmed(body.email, FEEDBACK_LIMITS.email)
  out.firm = trimmed(body.firm, FEEDBACK_LIMITS.firm)
  if (out.email && !isValidEmail(out.email)) return { error: 'That email address does not look right.' }

  const answered =
    Object.keys(out.toolNotes).length || out.toolAsIs.length || out.toolRank.length ||
    Object.keys(out.sectionNotes).length || out.anythingElse
  if (!answered) return { error: 'Answer at least one question before sending.' }
  return { value: out }
}

const isV2 = (r) => r && (r.version === 2 || r.toolNotes || r.sectionNotes)

// Tally submissions for the results view.
export function tally(rows) {
  const v2 = rows.filter(isV2)
  const legacy = rows.filter((r) => !isV2(r) && r.toolInterest && Object.keys(r.toolInterest).length)
  const who = (r) => ({ id: r.id, created_at: r.created_at, name: r.name || '', firm: r.firm || '' })

  // Interest: each CPA's ranking, 1 = most interested. Score = average of
  // (N − rank + 1) / N over those who ranked the tool, as a percentage.
  const N = CPA_TOOLS.length
  const cpaTools = CPA_TOOLS.map((t) => {
    const ranks = v2.map((r) => (r.toolRank || []).indexOf(t.id) + 1).filter((k) => k > 0)
    const avgRank = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null
    return {
      ...t,
      asIs: v2.filter((r) => (r.toolAsIs || []).includes(t.id)).length,
      notes: v2.filter((r) => r.toolNotes?.[t.id]).map((r) => ({ ...who(r), text: r.toolNotes[t.id] })),
      ranked: ranks.length,
      firstPicks: v2.filter((r) => (r.toolRank || [])[0] === t.id).map(who),
      avgRank,
      score: avgRank === null ? null : Math.round(((N - avgRank + 1) / N) * 100),
    }
  })
  const ranking = [...cpaTools].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.firstPicks.length - a.firstPicks.length)
  const sections = SECTIONS.map((s) => ({
    ...s,
    notes: v2.filter((r) => r.sectionNotes?.[s.id]).map((r) => ({ ...who(r), text: r.sectionNotes[s.id] })),
  }))
  const anythingElse = v2.filter((r) => r.anythingElse).map((r) => ({ ...who(r), text: r.anythingElse }))

  // Legacy ratings, only if any v1 answers exist.
  let legacyTools = null
  if (legacy.length) {
    legacyTools = RATED_TOOLS.map((t) => {
      const votes = legacy.map((r) => r.toolInterest?.[t.id]).filter((v) => Number.isInteger(v))
      const avg = votes.length ? votes.reduce((x, y) => x + y, 0) / votes.length : null
      return { ...t, n: votes.length, score: avg === null ? null : Math.round((avg / RATING_MAX) * 100) }
    }).filter((t) => t.n > 0).sort((a, b) => b.score - a.score)
  }
  return { n: rows.length, n2: v2.length, nLegacy: legacy.length, cpaTools, ranking, sections, anythingElse, legacyTools }
}

// ---------------------------------------------------------------------------
// Pairing: each named CPA takes the CPA tools they ranked highest, spread
// evenly with a cap per CPA. Greedy by rank: every (CPA, tool, rank) sorted by
// rank; a tool goes to the first CPA in that order who still has room, ties to
// whoever has fewer tools. Tools nobody ranked are dealt to whoever has room.
// Only the latest response per name counts.
// ---------------------------------------------------------------------------
export function pairing(rows, perCpa) {
  const byName = new Map()
  for (const r of [...rows].filter(isV2).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    const key = (r.name || '').trim().toLowerCase()
    if (!key) continue
    byName.set(key, r)
  }
  const cpas = [...byName.values()].map((r) => ({ id: r.id, name: r.name.trim(), firm: r.firm || '', ranks: r.toolRank || [], tools: [] }))
  const anonymous = rows.filter(isV2).length - rows.filter((r) => isV2(r) && (r.name || '').trim()).length
  if (cpas.length === 0) return { cpas, anonymous, cap: 0, unassigned: CPA_TOOLS.map((t) => t.id) }

  const cap = Math.max(1, perCpa || Math.ceil(CPA_TOOLS.length / cpas.length))
  const prefs = []
  for (const c of cpas) c.ranks.forEach((id, i) => { if (CPA_TOOLS.some((t) => t.id === id)) prefs.push({ cpa: c, id, rank: i + 1 }) })
  prefs.sort((a, b) => a.rank - b.rank)
  const taken = new Set()
  for (const p of prefs) {
    if (taken.has(p.id)) continue
    const same = prefs.filter((q) => q.id === p.id && q.rank === p.rank && q.cpa.tools.length < cap)
    if (!same.length) continue
    const pick = same.reduce((a, b) => (b.cpa.tools.length < a.cpa.tools.length ? b : a))
    pick.cpa.tools.push({ id: p.id, label: CPA_TOOLS.find((t) => t.id === p.id).label, rank: p.rank, reason: 'ranked' })
    taken.add(p.id)
  }
  const unassigned = []
  for (const t of CPA_TOOLS) {
    if (taken.has(t.id)) continue
    const open = cpas.filter((c) => c.tools.length < cap)
    if (!open.length) { unassigned.push(t.id); continue }
    const c = open.reduce((a, b) => (b.tools.length < a.tools.length ? b : a))
    c.tools.push({ id: t.id, label: t.label, rank: null, reason: 'assigned' })
  }
  return { cpas, anonymous, cap, unassigned }
}
