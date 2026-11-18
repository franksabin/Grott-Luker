// The check that a calculator's calculation files have not changed without a decision (scripts/calc-fingerprints.mjs): how it finds each tool's
// files, what it ignores, and what it reports. Then the real check against this repository.
// Run with: node scripts/test-calc-fingerprints.mjs   (or npm run test:engine)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fingerprints, compare, describe, normalize, BASELINE } from './calc-fingerprints.mjs'
import { TOOLS } from '../src/lib/tools.js'

let pass = 0, fail = 0
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg, extra ?? '') } }

// ---------- 1. What counts as a change
const base = 'export const rate = 0.22\nexport const tax = (x) => x * rate\n'
ok(normalize(base) === normalize(base.replace(/\n/g, '\r\n')), 'line endings do not matter')
ok(normalize(base) === normalize('// a comment\n' + base + '\n\n   \n'), 'full-line comments and blank lines do not matter')
ok(normalize(base) === normalize(base.replace('= 0.22', '= 0.22   ')), 'trailing spaces do not matter')
ok(normalize(base) !== normalize(base.replace('0.22', '0.24')), 'a changed number does matter')
ok(normalize(base) !== normalize(base.replace('x * rate', 'x * rate * 2')), 'a changed formula does matter')

// ---------- 2. A small project: three tools, one shared library, a component, and files that are not calculations
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calc-fp-'))
const w = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }
const setup = () => {
  w('src/App.jsx', `import PageA from './pages/PageA.jsx'\nimport PageB from './pages/PageB.jsx'\nimport PageC from './pages/PageC.jsx'\n<Route path="tools/a" element={<PageA />} />\n<Route path="tools/b" element={<PageB />} />\n<Route path="tools/c" element={<PageC />} />\n`)
  w('src/pages/PageA.jsx', `import { a } from '../lib/calcA.js'\nimport { call } from '../lib/api.js'\nimport Shell from '../components/Shell.jsx'\nimport { money } from '../lib/format.js'\nexport default () => 'A wording'\n`)
  w('src/pages/PageB.jsx', `import { b } from '../lib/calcB.js'\nimport { shared } from '../lib/shared.js'\nexport default () => 'B wording'\n`)
  w('src/pages/PageC.jsx', `import { money } from '../lib/format.js'\nexport default () => 'C math lives here: ' + money(1 * 0.05)\n`)
  w('src/components/Shell.jsx', `import { shared } from '../lib/shared.js'\nimport { email } from '../lib/emailRequests.js'\nimport { viaShell } from '../lib/viaShell.js'\nexport default () => null\n`)
  w('src/lib/viaShell.js', 'export const viaShell = 1\n')
  w('src/lib/calcA.js', `import { shared } from './shared.js'\nexport const a = (x) => x * 2 + shared\n`)
  w('src/lib/calcB.js', `import { shared } from './shared.js'\nexport const b = (x) => x * 3 + shared\n`)
  w('src/lib/shared.js', 'export const shared = 10\n')
  w('src/lib/api.js', 'export const call = () => 1\n')
  w('src/lib/emailRequests.js', 'export const email = "Hello"\n')
  w('src/lib/format.js', 'export const money = (v) => "$" + v\n')
}
setup()
const tools = [{ id: 'a', path: '/tools/a' }, { id: 'b', path: '/tools/b' }, { id: 'c', path: '/tools/c' }]
try {
  const first = fingerprints({ root, tools })
  const fp = first.fingerprints
  ok(first.problems.length === 0, 'every tool is found through its route', first.problems)
  ok(Object.keys(fp.a).join() === 'lib/calcA.js,lib/format.js,lib/shared.js,lib/viaShell.js', 'tool a: its library, the shared helper, and a library reached only through a shared component; not api.js or email', Object.keys(fp.a))
  ok(Object.keys(fp.b).join() === 'lib/calcB.js,lib/shared.js', 'tool b: its library and the shared one', Object.keys(fp.b))
  ok(Object.keys(fp.c).join() === 'lib/format.js,pages/PageC.jsx', 'tool c has no library of its own, so its page counts', Object.keys(fp.c))
  ok(compare(fp, fp).length === 0, 'nothing changed: nothing reported')
  const again = (mut) => { setup(); mut(); return fingerprints({ root, tools }).fingerprints }
  const wi = (rel, f) => () => w(rel, f(fs.readFileSync(path.join(root, rel), 'utf8')))
  const ids = (r) => r.map((x) => x.id).join()

  // a shared library changes: every tool that uses it is reported, once per file
  let r = compare(fp, again(() => w('src/lib/shared.js', 'export const shared = 11\n')))
  ok(ids(r) === 'a,b' && r.every((x) => x.files.join() === 'lib/shared.js'), 'a change to a shared library is reported for every tool that uses it', JSON.stringify(r))
  ok(describe(r) === '  lib/shared.js: 2 tools (a, b)', 'and it reads as one change touching two tools', describe(r))
  // one tool's own library
  r = compare(fp, again(() => w('src/lib/calcA.js', `import { shared } from './shared.js'\nexport const a = (x) => x * 2.5 + shared\n`)))
  ok(ids(r) === 'a' && r[0].files.join() === 'lib/calcA.js', 'a change to one tool’s own library is reported for that tool only', JSON.stringify(r))
  // not calculations
  ok(compare(fp, again(() => w('src/lib/api.js', 'export const call = () => 2\n'))).length === 0 && compare(fp, again(() => w('src/lib/emailRequests.js', 'export const email = "Hi there"\n'))).length === 0, 'api and email wording are not calculations')
  // a page with an engine: its wording is free
  ok(compare(fp, again(() => w('src/pages/PageA.jsx', fs.readFileSync(path.join(root, 'src/pages/PageA.jsx'), 'utf8').replace('A wording', 'A new wording')))).length === 0, 'a tool with its own library: page wording is free')
  // a page without one: its page is the math
  r = compare(fp, again(() => w('src/pages/PageC.jsx', `import { money } from '../lib/format.js'\nexport default () => 'C math lives here: ' + money(1 * 0.06)\n`)))
  ok(ids(r) === 'c' && r[0].files.join() === 'pages/PageC.jsx', 'a tool with no library of its own: a change to its page is reported', JSON.stringify(r))
  // comments, blank lines, spaces, line endings
  ok(compare(fp, again(() => w('src/lib/calcB.js', `// now with a comment\r\nimport { shared } from './shared.js'  \r\n\r\nexport const b = (x) => x * 3 + shared\r\n`))).length === 0, 'comments, blank lines, trailing spaces and line endings in a calculation file are ignored')
  // the shared helper
  r = compare(fp, again(() => w('src/lib/format.js', 'export const money = (v) => "$" + Math.round(v)\n')))
  ok(ids(r) === 'a,c', 'a change to the shared formatting helper is reported for the tools that use it', ids(r))
  // files added and removed
  w('src/lib/extra.js', 'export const extra = 1\n')
  r = compare(fp, again(() => { w('src/lib/extra.js', 'export const extra = 1\n'); w('src/lib/calcB.js', `import { shared } from './shared.js'\nimport { extra } from './extra.js'\nexport const b = (x) => x * 3 + shared + extra\n`) }))
  ok(ids(r) === 'b' && r[0].files.includes('lib/calcB.js') && r[0].files.includes('lib/extra.js (added)'), 'a new library import is reported as added', JSON.stringify(r))
  setup()
  ok(compare({}, fp).length === 3 && compare({}, fp).every((x) => x.kind === 'new'), 'a tool with nothing recorded is reported as new')
  ok(compare({ a: { 'lib/calcA.js': 'x', 'lib/gone.js': 'y' } }, { a: { 'lib/calcA.js': 'x' } })[0].files.join() === 'lib/gone.js (removed)', 'a calculation file that disappears is reported as removed')
  // a tool with no route is a problem, not a silent gap
  const missing = fingerprints({ root, tools: [...tools, { id: 'd', path: '/tools/d' }] })
  ok(missing.problems.length === 1 && /d: no page found/.test(missing.problems[0]), 'a tool with no route is reported as a problem', missing.problems)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

// ---------- 3. This repository
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const real = fingerprints({ root: repo, tools: TOOLS })
ok(real.problems.length === 0, 'every calculator is traced to its page', real.problems)
ok(TOOLS.every((t) => Object.keys(real.fingerprints[t.id] || {}).length > 0), 'every calculator has files to watch')
ok(Object.keys(real.fingerprints['multi-year-projection']).filter((f) => /multiYear|oneYear|tax/.test(f)).length >= 4, 'the Roth planner is watched on its engine, its one-year engine, its notes and the tax code', Object.keys(real.fingerprints['multi-year-projection']))
ok(!Object.values(real.fingerprints).some((files) => Object.keys(files).some((f) => /lib\/(api|emailRequests|feedback|signoffs|submission|tools)\.js$/.test(f))), 'no calculator is watched on a file that is only plumbing or wording')
const recorded = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).tools : null
ok(recorded && TOOLS.every((t) => recorded[t.id]), 'a baseline is recorded for every calculator (run: node scripts/calc-fingerprints.mjs --update)')
const drift = recorded ? compare(recorded, real.fingerprints) : []
ok(drift.length === 0, `calculation files changed since the last recorded version; add a dated entry to MATH_CHANGES in src/lib/signoffs.js for each affected tool, then run: node scripts/calc-fingerprints.mjs --update\n${describe(drift)}`)

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
