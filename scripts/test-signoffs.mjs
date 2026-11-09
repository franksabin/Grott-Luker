// Sign-offs and the "math changed" rule. A tool with a recorded math change either keeps earlier approvals (keepsApprovals) and shows only a dated note,
// or marks approvals given before the change as "earlier" and sends the tool back to "Needs re-review" until someone signs again.
// Run with: node scripts/test-signoffs.mjs   (or npm run test:engine)
import { MATH_CHANGES, isStaleSignoff, currentSignoffs, staleSignoffs, isReady, needsReReview, groupSignoffs } from '../src/lib/signoffs.js'
import { TOOLS } from '../src/lib/tools.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }

const roth = TOOLS.find((t) => t.id === 'multi-year-projection')
const other = TOOLS.find((t) => t.id !== 'multi-year-projection' && !MATH_CHANGES[t.id] && t.status !== 'live')
const row = (tool_id, cpa, created_at) => ({ tool_id, cpa, created_at, note: null })

// ---------- 1. The registry is well formed, and what it says about the Roth planner today
ok(roth && other, 'the tools exist')
for (const [id, c] of Object.entries(MATH_CHANGES)) {
  ok(TOOLS.some((t) => t.id === id), `math change for a real tool: ${id}`)
  ok(Number.isFinite(Date.parse(c.at)) && c.label && c.what, `math change has a readable date, a label and a sentence: ${id}`, c)
}
const rothChange = MATH_CHANGES['multi-year-projection']
ok(rothChange && rothChange.keepsApprovals === true && /unchanged/.test(rothChange.what), 'the Roth planner entry keeps earlier approvals and its note says what did not change')
const jacques = groupSignoffs([row('multi-year-projection', 'Jacques', '2026-10-27T18:45:31.810Z')])
ok(isReady(roth, jacques) && !needsReReview(roth, jacques) && staleSignoffs(roth.id, jacques).length === 0 && currentSignoffs(roth.id, jacques).length === 1, 'Jacques’s Oct 27 approval of the Roth planner still counts: Ready, nothing marked earlier')

// ---------- 2. Without keepsApprovals, an approval given before the change stays on record but stops counting
const at = Date.parse('2026-11-09T00:00:00-05:00')
MATH_CHANGES[other.id] = { at: '2026-11-09T00:00:00-05:00', label: 'Nov 9, 2026', what: 'test entry' }
try {
  const before = groupSignoffs([row(other.id, 'Jacques', '2026-10-27T18:45:31.810Z')])
  ok(!isReady(other, before) && needsReReview(other, before), 'an approval from before the change no longer makes the tool Ready; it needs re-review')
  ok(currentSignoffs(other.id, before).length === 0 && staleSignoffs(other.id, before).length === 1 && staleSignoffs(other.id, before)[0].cpa === 'Jacques', 'the old approval is kept and reported as earlier, not deleted')
  // Signing again replaces the row (the API uses INSERT OR REPLACE on tool and reviewer), so the same reviewer now has a current row
  const after = groupSignoffs([row(other.id, 'Jacques', new Date(at + 3600e3).toISOString())])
  ok(isReady(other, after) && !needsReReview(other, after), 'an approval after the change makes it Ready')
  ok(isReady(other, groupSignoffs([row(other.id, 'Jacques', new Date(at).toISOString())])), 'an approval at the exact moment of the change counts')
  ok(!isReady(other, groupSignoffs([row(other.id, 'Jacques', new Date(at - 1).toISOString())])), 'an approval one millisecond earlier does not')
  const mixed = groupSignoffs([row(other.id, 'Jacques', '2026-10-27T18:45:31.810Z'), row(other.id, 'Deb', new Date(at + 86400e3).toISOString())])
  ok(isReady(other, mixed) && !needsReReview(other, mixed) && currentSignoffs(other.id, mixed).map((s) => s.cpa).join() === 'Deb' && staleSignoffs(other.id, mixed).map((s) => s.cpa).join() === 'Jacques', 'one current and one earlier approval: Ready on the current one, the earlier one still listed as earlier')
  ok(isReady(other, groupSignoffs([row(other.id, 'Jacques', 'not a date')])) && !isStaleSignoff(other.id, { created_at: undefined }), 'a date that cannot be read is never treated as earlier')
  ok(isReady({ ...other, status: 'live' }, before) && !needsReReview({ ...other, status: 'live' }, before), 'a tool the registry marks live stays Ready')
  // keepsApprovals switches the rule off for that tool only
  MATH_CHANGES[other.id].keepsApprovals = true
  ok(isReady(other, before) && !needsReReview(other, before) && staleSignoffs(other.id, before).length === 0, 'keepsApprovals: the same old approval counts again')
} finally {
  delete MATH_CHANGES[other.id]
}

// ---------- 3. Everything else is as it was
const old = groupSignoffs([row(other.id, 'Travers', '2026-09-20T12:00:00.000Z')])
ok(isReady(other, old) && !needsReReview(other, old), 'a tool with no recorded change keeps counting every approval, however old')
ok(!isReady(other, {}) && !needsReReview(other, {}) && !isReady(roth, {}) && !needsReReview(roth, {}), 'no approvals: not Ready, and not "needs re-review" either')
ok(!isStaleSignoff('hsa-planner', row('hsa-planner', 'Jacques', '2020-01-01T00:00:00Z')), 'a tool without an entry is never out of date')
ok(isReady(undefined, {}) === false && needsReReview(undefined, {}) === false, 'no tool, no crash')

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
