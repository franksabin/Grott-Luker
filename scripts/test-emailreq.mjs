// Every calculator has a client-information email, and the items the CPA most likely already has
// (last year's return, standing facts) always print last so they can be deleted before sending.
// Run with: node scripts/test-emailreq.mjs   (or npm run test:engine)
import fs from 'node:fs'
import { EMAIL_REQUESTS, buildEmail } from '../src/lib/emailRequests.js'

let pass = 0
let fail = 0
const ok = (cond, msg, extra) => {
  if (cond) pass++
  else {
    fail++
    console.log('FAIL:', msg, extra ?? '')
  }
}

// Tool ids and groups, read from the registry text so the test does not need the icon library.
const registry = fs.readFileSync(new URL('../src/lib/tools.js', import.meta.url), 'utf8')
const tools = [...registry.matchAll(/id: '([^']+)',\s*group: '([^']+)'/g)].map((m) => ({ id: m[1], group: m[2] }))
ok(tools.length >= 20, 'found the tool registry', tools.length)

// 1. Every calculator (everything except the client-facing shareables) has a request.
for (const t of tools.filter((x) => x.group !== 'client-intake')) {
  const spec = EMAIL_REQUESTS[t.id]
  ok(!!spec, `${t.id} has a client information request`)
  if (!spec) continue
  ok(typeof spec.subject === 'string' && spec.subject.length > 10, `${t.id} has a subject`)
  ok(typeof spec.intro === 'string' && spec.intro.length > 30, `${t.id} has an intro`)
  ok(Array.isArray(spec.questions) && spec.questions.length >= 1, `${t.id} asks at least one question the client must answer`)
}

// 2. Structure of every spec: clean strings, no duplicates, on-file items last in the built email.
for (const [id, spec] of Object.entries(EMAIL_REQUESTS)) {
  const items = [...(spec.questions || []), ...(spec.onFile || [])]
  ok(items.every((q) => typeof q === 'string' && q.trim() === q && q.length > 5), `${id}: every item is a clean string`)
  ok(new Set(items.map((q) => q.toLowerCase())).size === items.length, `${id}: no duplicate items`)
  if (!spec.questions) continue
  const { body } = buildEmail(spec, '', '')
  const numbered = body.split('\n').filter((l) => /^\d+\. /.test(l))
  ok(numbered.length === items.length, `${id}: every item appears in the email`, [numbered.length, items.length])
  ok(numbered.every((l, i) => l.startsWith(`${i + 1}. `)), `${id}: numbering runs 1 to N`)
  items.forEach((q, i) => ok(numbered[i] === `${i + 1}. ${q}`, `${id}: item ${i + 1} is in order`))
  // The on-file items are the last lines of the numbered list.
  const onFile = spec.onFile || []
  onFile.forEach((q, k) => ok(numbered[spec.questions.length + k] === `${spec.questions.length + k + 1}. ${q}`, `${id}: on-file item ${k + 1} comes after every client question`))
  if (onFile.length) ok(spec.questions.length >= 1, `${id}: at least one question remains if the CPA deletes the on-file items`)
}

// 3. The calculators where the CPA is most likely to already hold the figures actually use the list.
for (const id of ['estimated-tax', 'qbi-optimizer', 'exchange-1031', 'multi-year-projection', 'withholding-checkup', 'capital-gains-harvesting', 'business-sale', 'paying-your-kids', 'owner-comp']) {
  ok((EMAIL_REQUESTS[id]?.onFile || []).length >= 1, `${id} lists items the CPA likely has`)
}
ok(/prior|last year/i.test((EMAIL_REQUESTS['estimated-tax'].onFile || []).join(' ')), 'estimated-tax puts last year’s tax in the on-file list')
ok(!(EMAIL_REQUESTS['estimated-tax'].questions || []).some((q) => /last year/i.test(q)), 'estimated-tax does not ask the client for last year’s tax')

// 4. Reply-style emails mention only what a tool asks; shareable (link) emails are unchanged.
const kyn = buildEmail(EMAIL_REQUESTS['know-your-numbers'], 'https://example.com/form', '')
ok(kyn.body.includes('It will ask for:'), 'a link email still introduces the list')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
