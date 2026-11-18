// Sign-offs: every review is kept with the version it was given on. A review on an earlier version stops counting unless the change carries
// approvals over, and then it shows as "Carried over". Withdrawing takes back a reviewer's latest review only.
// Run with: node scripts/test-signoffs.mjs   (or npm run test:engine)
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  MATH_CHANGES, EXTENT_LABEL, SIGNOFF_SQL, normalizeSignoff, groupSignoffs, versionOf, versionLabel, lastUpdated, currentChange,
  isEarlier, currentSignoffs, staleSignoffs, reviewRecord, isReady, needsReReview,
} from '../src/lib/signoffs.js'
import { TOOLS } from '../src/lib/tools.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }
const row = (tool_id, cpa, created_at, version = '') => ({ tool_id, cpa, version, created_at, note: null })

const roth = TOOLS.find((t) => t.id === 'multi-year-projection')
const other = TOOLS.find((t) => t.id !== roth.id && !MATH_CHANGES[t.id] && t.status !== 'live')
ok(roth && other, 'the tools exist')

// ---------- 1. The registry: every change is dated, in order, and says what was done
for (const [id, list] of Object.entries(MATH_CHANGES)) {
  ok(TOOLS.some((t) => t.id === id), `registry names a real tool: ${id}`)
  ok(Array.isArray(list) && list.length > 0, `each tool has a list of changes: ${id}`)
  let prev = -Infinity
  for (const c of list) {
    ok(Number.isFinite(Date.parse(c.at)) && Date.parse(c.at) > prev, `changes are dated and in order: ${c.label}`, c.at)
    prev = Date.parse(c.at)
    ok(c.label && EXTENT_LABEL[c.extent] && Array.isArray(c.done) && c.done.length > 0 && c.done.every((d) => typeof d === 'string' && d.length > 0), `a change has a label, an extent and what was done: ${c.label}`)
  }
}

// ---------- 2. The Roth planner today
const rothHistory = MATH_CHANGES[roth.id]
const rothFirst = rothHistory[0]
const rothCur = currentChange(roth.id)
ok(rothFirst.at === '2026-11-09T00:00:00-05:00' && rothFirst.label === 'Nov 9, 2026' && rothFirst.extent === 'major' && rothFirst.keepsApprovals === true, 'the Roth planner’s first recorded change is the major one of Nov 9, 2026, and earlier approvals carry over')
ok(rothFirst.done.some((d) => /Unchanged:.*RMDs.*conversions/.test(d)), 'that entry says what did not change')
ok(rothHistory.length >= 2 && rothCur === rothHistory[rothHistory.length - 1] && rothCur.at === '2026-11-18T00:00:00-05:00' && rothCur.label === 'Nov 18, 2026', 'the current version is the last entry: Nov 18, 2026')
ok(rothCur.extent === 'minor' && rothCur.keepsApprovals === true && /blank/.test(rothCur.done.join(' ')), 'it is a minor change (the new spending input, blank by default), and approvals carry over')
ok(lastUpdated(roth.id) === rothCur, 'last updated is the current change')
ok(lastUpdated(other.id) === null && versionOf(other.id) === 'original', 'a tool with no recorded change has no last-updated date and is the original release')

// ---------- 3. Stamping: the version comes from the registry, never from the browser
const n1 = normalizeSignoff({ toolId: roth.id, cpa: 'Deb', note: 'x', version: 'nonsense' })
ok(n1.value && n1.value.version === rothCur.at, 'a review is stamped with the current version, whatever the browser sends')
ok(normalizeSignoff({ toolId: other.id, cpa: 'Deb' }).value.version === 'original', 'a tool with no change is stamped original')
ok(normalizeSignoff({ toolId: 'nope', cpa: 'Deb' }).error && normalizeSignoff({ toolId: roth.id, cpa: 'Nobody' }).error, 'an unknown tool or reviewer is refused')

// ---------- 4. Jacques’s review from before versions were kept: carried over, still Ready
const legacy = groupSignoffs([row(roth.id, 'Jacques', '2026-10-27T18:45:31.810Z', '')])
ok(isReady(roth, legacy) && !needsReReview(roth, legacy), 'Jacques’s pre-version approval still counts on the Roth planner')
ok(reviewRecord(roth.id, legacy)[0].status === 'Carried over' && reviewRecord(roth.id, legacy)[0].versionText === 'Before version tracking', 'his review reads Carried over, with its version not recorded')

// ---------- 5. Every review is kept: a review on the new version is added, the old one stays on the record
const hist = groupSignoffs([
  row(roth.id, 'Jacques', '2026-10-27T18:45:31.810Z', ''),
  row(roth.id, 'Jacques', '2026-11-20T10:00:00.000Z', rothCur.at),
  row(roth.id, 'Deb', '2026-11-21T10:00:00.000Z', rothCur.at),
])
ok(hist[roth.id].length === 3, 'all three reviews are kept')
const rec = reviewRecord(roth.id, hist)
ok(rec[0].cpa === 'Deb' && rec[0].status === 'Current' && rec[0].versionText === 'Nov 18, 2026 version', 'newest first: Deb is current on the Nov 18, 2026 version')
ok(rec[1].cpa === 'Jacques' && rec[1].status === 'Current' && rec[1].versionText === 'Nov 18, 2026 version', 'Jacques’s re-review is current')
// A review given on the Nov 9 version is still on the record under that date, and carries over to the newer one
const onFirst = reviewRecord(roth.id, groupSignoffs([row(roth.id, 'Travers', '2026-11-12T09:00:00.000Z', rothFirst.at)]))[0]
ok(onFirst.versionText === 'Nov 9, 2026 version' && onFirst.status === 'Carried over', 'a review on the Nov 9 version reads Nov 9, 2026 version, carried over to the Nov 18 update')
ok(rec[2].cpa === 'Jacques' && rec[2].status === 'Superseded by a later review' && rec[2].versionText === 'Before version tracking', 'his earlier review is kept and shown as superseded')
ok(currentSignoffs(roth.id, hist).length === 2 && staleSignoffs(roth.id, hist).length === 0, 'two reviewers stand')

// ---------- 6. A change that does not carry approvals over: earlier reviews stop counting until someone signs again
const TEMP = { at: '2026-11-09T00:00:00-05:00', label: 'Nov 9, 2026', extent: 'minor', done: ['test entry'], keepsApprovals: false }
MATH_CHANGES[other.id] = [TEMP]
try {
  const before = groupSignoffs([row(other.id, 'Jacques', '2026-10-27T18:45:31.810Z', '')])
  ok(!isReady(other, before) && needsReReview(other, before), 'an earlier review no longer makes the tool Ready')
  ok(reviewRecord(other.id, before)[0].status === 'Earlier version', 'it stays on the record as an earlier version')
  const again = groupSignoffs([row(other.id, 'Jacques', '2026-10-27T18:45:31.810Z', ''), row(other.id, 'Jacques', '2026-11-12T09:00:00.000Z', TEMP.at)])
  ok(isReady(other, again) && reviewRecord(other.id, again).map((r) => r.status).join() === 'Current,Superseded by a later review', 'signing again on the new version makes it Ready, and the old review is superseded')
  ok(!isEarlier(other.id, { version: TEMP.at }), 'a review on the current version is not earlier')
  const mixed = groupSignoffs([row(other.id, 'Jacques', '2026-10-27T18:45:31.810Z', ''), row(other.id, 'Deb', '2026-11-12T09:00:00.000Z', TEMP.at)])
  ok(currentSignoffs(other.id, mixed).map((s) => s.cpa).join() === 'Deb' && staleSignoffs(other.id, mixed).map((s) => s.cpa).join() === 'Jacques', 'one current and one earlier: each reviewer’s own latest decides')
  MATH_CHANGES[other.id][0].keepsApprovals = true
  ok(isReady(other, before) && staleSignoffs(other.id, before).length === 0 && reviewRecord(other.id, before)[0].status === 'Carried over', 'with approvals carried over, the same earlier review counts again')
} finally {
  delete MATH_CHANGES[other.id]
}

// ---------- 7. A tool with no recorded change: every review counts, however old
const oldOnly = groupSignoffs([row(other.id, 'Travers', '2020-01-01T00:00:00.000Z', 'original')])
ok(isReady(other, oldOnly) && reviewRecord(other.id, oldOnly)[0].status === 'Current' && reviewRecord(other.id, oldOnly)[0].versionText === 'Original release', 'a tool with no change: every review counts, shown as the original release')
ok(!isReady(other, {}) && !needsReReview(other, {}) && reviewRecord(other.id, {}).length === 0, 'no reviews: not Ready, and nothing on the record')
ok(isReady({ ...other, status: 'live' }, {}) && !needsReReview({ ...other, status: 'live' }, {}), 'a tool the registry marks live stays Ready')
ok(isReady(undefined, {}) === false && needsReReview(undefined, {}) === false, 'no tool, no crash')
ok(versionLabel(roth.id, '') === 'Before version tracking' && versionLabel(roth.id, 'original') === 'Original release' && versionLabel(roth.id, rothCur.at) === 'Nov 18, 2026 version' && versionLabel(roth.id, rothFirst.at) === 'Nov 9, 2026 version' && versionLabel(roth.id, '2001-01-01T00:00:00Z') === 'Earlier version', 'version labels')

// ---------- 8. The database: the upgrade of the live table, the key, and withdrawal, run on the same SQL the Worker and the dev API use
const db = new DatabaseSync(':memory:')
// the table as it is live today, before versions were kept
db.exec('CREATE TABLE tool_signoffs (tool_id TEXT NOT NULL, cpa TEXT NOT NULL, created_at TEXT NOT NULL, note TEXT, PRIMARY KEY (tool_id, cpa))')
db.prepare('INSERT INTO tool_signoffs (tool_id, cpa, created_at, note) VALUES (?, ?, ?, ?)').run('multi-year-projection', 'Jacques', '2026-10-27T18:45:31.810Z', null)
db.prepare('INSERT INTO tool_signoffs (tool_id, cpa, created_at, note) VALUES (?, ?, ?, ?)').run('estimated-tax', 'Travers', '2026-10-27T15:20:06.362Z', 'kept')
let probeFailed = false
try { db.prepare(SIGNOFF_SQL.probe).all() } catch { probeFailed = true }
ok(probeFailed, 'the probe fails on the old table, which is how the upgrade is detected')
db.exec(`BEGIN;\n${SIGNOFF_SQL.upgrade.join(';\n')};\nCOMMIT;`)
const up = db.prepare(SIGNOFF_SQL.list).all()
ok(up.length === 2 && up.every((r) => r.version === '') && up.find((r) => r.cpa === 'Travers').note === 'kept', 'the upgrade keeps every row, with its version not recorded')
let probeOk = true
try { db.prepare(SIGNOFF_SQL.probe).all() } catch { probeOk = false }
ok(probeOk, 'after the upgrade the probe passes, so it does not run again')
// a new version adds a review; the same version replaces only that version’s review
db.prepare(SIGNOFF_SQL.add).run('multi-year-projection', 'Jacques', rothCur.at, '2026-11-20T10:00:00.000Z', null)
db.prepare(SIGNOFF_SQL.add).run('multi-year-projection', 'Jacques', rothCur.at, '2026-11-21T10:00:00.000Z', 'again')
const after = db.prepare(SIGNOFF_SQL.list).all().filter((r) => r.tool_id === 'multi-year-projection')
ok(after.length === 2 && after.some((r) => r.version === '') && after.some((r) => r.version === rothCur.at && r.note === 'again'), 'a new version adds a review; the same version replaces only that one')
// withdrawing takes back the latest review only
db.prepare(SIGNOFF_SQL.withdrawLatest).run('multi-year-projection', 'Jacques', 'multi-year-projection', 'Jacques')
const wd = db.prepare(SIGNOFF_SQL.list).all().filter((r) => r.tool_id === 'multi-year-projection')
ok(wd.length === 1 && wd[0].version === '', 'withdrawing removes the latest review and keeps the earlier one')
db.prepare(SIGNOFF_SQL.withdrawLatest).run('estimated-tax', 'Deb', 'estimated-tax', 'Deb')
ok(db.prepare(SIGNOFF_SQL.list).all().length === 2, 'withdrawing a reviewer who has no review removes nothing')
// the rows the database returns feed the same status rules as the page
const fromDb = groupSignoffs(db.prepare(SIGNOFF_SQL.list).all())
ok(isReady(roth, fromDb) && reviewRecord(roth.id, fromDb)[0].status === 'Carried over', 'read back from the database, the Roth planner’s carried-over approval still counts')
// the definition in schema.sql is the same table
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
ok(/tool_signoffs \([\s\S]*version\s+TEXT NOT NULL DEFAULT ''[\s\S]*PRIMARY KEY \(tool_id, cpa, version\)/.test(schema), 'schema.sql defines the same table')

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
