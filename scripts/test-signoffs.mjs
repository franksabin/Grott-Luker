// Sign-offs and the "math changed" rule: an approval given before a tool's results last changed stays on record but no longer makes the tool Ready.
// Run with: node scripts/test-signoffs.mjs   (or npm run test:engine)
import { MATH_CHANGES, isStaleSignoff, currentSignoffs, staleSignoffs, isReady, needsReReview, groupSignoffs } from '../src/lib/signoffs.js'
import { TOOLS } from '../src/lib/tools.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }

const roth = TOOLS.find((t) => t.id === 'multi-year-projection')
const other = TOOLS.find((t) => t.id !== 'multi-year-projection' && !MATH_CHANGES[t.id] && t.status !== 'live')
const row = (tool_id, cpa, created_at) => ({ tool_id, cpa, created_at, note: null })

// The registry is well formed
ok(roth && other, 'the tools exist')
for (const [id, c] of Object.entries(MATH_CHANGES)) {
  ok(TOOLS.some((t) => t.id === id), `math change for a real tool: ${id}`)
  ok(Number.isFinite(Date.parse(c.at)) && c.label && c.what, `math change has a readable date, a label and a sentence: ${id}`, c)
}
const at = Date.parse(MATH_CHANGES['multi-year-projection'].at)

// What is on record today: Jacques signed the Roth planner on Oct 27, before the change
const before = groupSignoffs([row('multi-year-projection', 'Jacques', '2026-10-27T18:45:31.810Z')])
ok(!isReady(roth, before) && needsReReview(roth, before), 'an Oct 27 sign-off on the Roth planner no longer makes it Ready; it needs re-review')
ok(currentSignoffs(roth.id, before).length === 0 && staleSignoffs(roth.id, before).length === 1 && staleSignoffs(roth.id, before)[0].cpa === 'Jacques', 'the old sign-off is kept and reported as out of date, not deleted')

// A sign-off after the change counts, and re-signing replaces the old row (the API uses INSERT OR REPLACE on tool and reviewer)
const after = groupSignoffs([row('multi-year-projection', 'Jacques', new Date(at + 3600e3).toISOString())])
ok(isReady(roth, after) && !needsReReview(roth, after), 'a sign-off after the change makes it Ready')
ok(isReady(roth, groupSignoffs([row('multi-year-projection', 'Jacques', new Date(at).toISOString())])), 'a sign-off at the exact moment of the change counts')
ok(!isReady(roth, groupSignoffs([row('multi-year-projection', 'Jacques', new Date(at - 1).toISOString())])), 'a sign-off one millisecond earlier does not')

// Mixed: one old, one new
const mixed = groupSignoffs([row('multi-year-projection', 'Jacques', '2026-10-27T18:45:31.810Z'), row('multi-year-projection', 'Deb', new Date(at + 86400e3).toISOString())])
ok(isReady(roth, mixed) && !needsReReview(roth, mixed) && currentSignoffs(roth.id, mixed).map((s) => s.cpa).join() === 'Deb' && staleSignoffs(roth.id, mixed).map((s) => s.cpa).join() === 'Jacques', 'one current and one earlier sign-off: Ready on the current one, the earlier one still listed as earlier')

// Nothing else changes
ok(isReady(other, groupSignoffs([row(other.id, 'Travers', '2026-09-20T12:00:00.000Z')])) && !needsReReview(other, groupSignoffs([row(other.id, 'Travers', '2026-09-20T12:00:00.000Z')])), 'a tool with no recorded math change keeps counting every sign-off, however old')
ok(!isReady(other, {}) && !needsReReview(other, {}) && !isReady(roth, {}) && !needsReReview(roth, {}), 'no sign-offs: not Ready, and not "needs re-review" either')
ok(isReady({ ...roth, status: 'live' }, before) && !needsReReview({ ...roth, status: 'live' }, before), 'a tool the registry marks live stays Ready')
ok(isReady(roth, groupSignoffs([row('multi-year-projection', 'Jacques', 'not a date')])) && !isStaleSignoff('multi-year-projection', { created_at: undefined }), 'a date that cannot be read is never treated as out of date')
ok(!isStaleSignoff('hsa-planner', row('hsa-planner', 'Jacques', '2020-01-01T00:00:00Z')), 'a tool without an entry is never out of date')
ok(isReady(undefined, {}) === false && needsReReview(undefined, {}) === false, 'no tool, no crash')

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
