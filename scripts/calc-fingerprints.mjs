// Fails when a calculator's calculation files change without anyone deciding what that change means for its reviewers.
//
// Each calculator is traced to the files that do its math: the library files its page imports (directly, or through shared components),
// minus the ones that are only wording or plumbing. A fingerprint of those files is recorded in scripts/calc-fingerprints.json.
// If a fingerprint no longer matches, a calculation file changed since the last recorded version.
//
//   node scripts/calc-fingerprints.mjs            check (this is what `npm run test:engine` runs)
//   node scripts/calc-fingerprints.mjs --update   record the current files as the new baseline
//
// When the check fails: if the change affects any figure, add a dated entry for that tool to MATH_CHANGES in src/lib/signoffs.js, then
// run --update. If it affects no figure (a refactor, a comment), run --update without an entry.
// Full-line comments, blank lines and trailing spaces are ignored, so editing them does not trip the check.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Library files that are not calculations: server calls, email and form wording, the sign-off record, and the tool registry.
export const NOT_CALCULATION = ['api.js', 'emailRequests.js', 'feedback.js', 'signoffs.js', 'submission.js', 'tools.js', 'useSignoffs.js', 'useUsage.js']

export const normalize = (text) => text
  .split('\n')
  .map((line) => line.replace(/\s+$/, ''))
  .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))
  .join('\n')
const hashOf = (text) => crypto.createHash('sha256').update(normalize(text)).digest('hex').slice(0, 12)

function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, 'index.js'), path.join(base, 'index.jsx')]
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null
}

// Every file under srcRoot that `entry` imports, directly or through other files.
export function closure(entry, srcRoot) {
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(js|jsx|mjs)$/.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const resolved = resolveImport(file, m[1])
      if (resolved && resolved.startsWith(srcRoot)) stack.push(resolved)
    }
  }
  return [...seen]
}

// Library files every tool shares (number parsing and formatting). A change to one counts for all tools, but a tool that has nothing else
// behind it has its math in its page.
export const SHARED_HELPERS = ['format.js']

// The calculation files behind a page. A tool with no library of its own is fingerprinted by its page as well, since that is where its math is.
export function calcFiles(page, srcRoot) {
  const libRoot = path.join(srcRoot, 'lib') + path.sep
  const files = closure(page, srcRoot).filter((f) => f.startsWith(libRoot) && !NOT_CALCULATION.includes(path.basename(f)))
  const ownLibrary = files.filter((f) => !SHARED_HELPERS.includes(path.basename(f)))
  return ownLibrary.length ? files : [...files, page]
}

// The page a tool opens, found the way the app finds it: its <Route> in src/App.jsx.
export function pageForTool(root, toolPath) {
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')
  const imports = new Map([...app.matchAll(/import\s+(\w+)\s+from\s+'(\.\/pages\/[^']+)'/g)].map((m) => [m[1], m[2]]))
  const slug = toolPath.replace(/^\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const route = app.match(new RegExp(`<Route\\s+path="${slug}"\\s+element=\\{<(\\w+)`))
  const file = route && imports.get(route[1])
  return file ? path.join(root, 'src', file) : null
}

// tools: [{ id, path }]. Returns { fingerprints: { [toolId]: { [file under src]: hash } }, problems: [text] }.
export function fingerprints({ root, tools }) {
  const srcRoot = path.join(root, 'src') + path.sep
  const out = {}
  const problems = []
  for (const t of tools) {
    const page = pageForTool(root, t.path)
    if (!page) { problems.push(`${t.id}: no page found for ${t.path} in src/App.jsx`); continue }
    const files = {}
    for (const f of calcFiles(page, srcRoot)) files[path.relative(srcRoot, f).replace(/\\/g, '/')] = hashOf(fs.readFileSync(f, 'utf8'))
    out[t.id] = Object.fromEntries(Object.entries(files).sort())
  }
  return { fingerprints: out, problems }
}

// What differs between the recorded fingerprints and the current ones: [{ id, kind: 'new' | 'changed', files: [text] }].
export function compare(recorded, current) {
  const report = []
  for (const [id, files] of Object.entries(current)) {
    const was = recorded?.[id]
    if (!was) { report.push({ id, kind: 'new', files: Object.keys(files) }); continue }
    const changed = Object.keys(files).filter((f) => was[f] !== files[f]).map((f) => (was[f] === undefined ? `${f} (added)` : f))
    const removed = Object.keys(was).filter((f) => !(f in files)).map((f) => `${f} (removed)`)
    if (changed.length || removed.length) report.push({ id, kind: 'changed', files: [...changed, ...removed] })
  }
  return report
}

// The same report grouped by file, so a shared file like tax.js reads as one change that touches many tools.
export function describe(report) {
  const byFile = new Map()
  for (const r of report) for (const f of r.files) (byFile.get(f) || byFile.set(f, []).get(f)).push(r.id)
  return [...byFile].map(([file, ids]) => `  ${file}: ${ids.length} tool${ids.length === 1 ? '' : 's'} (${ids.join(', ')})`).join('\n')
}

export const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'calc-fingerprints.json')

// ---- command line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { TOOLS } = await import(pathToFileURL(path.join(root, 'src', 'lib', 'tools.js')).href)
  const { fingerprints: current, problems } = fingerprints({ root, tools: TOOLS })
  if (problems.length) { console.log('FAIL:\n  ' + problems.join('\n  ')); process.exit(1) }
  if (process.argv.includes('--update')) {
    fs.writeFileSync(BASELINE, JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), tools: current }, null, 2) + '\n')
    console.log(`recorded the calculation files of ${Object.keys(current).length} tools in scripts/calc-fingerprints.json`)
    process.exit(0)
  }
  const recorded = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).tools : {}
  const report = compare(recorded, current)
  if (report.length) {
    console.log('FAIL: calculation files changed since the last recorded version:\n' + describe(report))
    console.log('\nIf the change affects any figure, add a dated entry for each affected tool to MATH_CHANGES in src/lib/signoffs.js,')
    console.log('then run: node scripts/calc-fingerprints.mjs --update      (if no figure is affected, run the update without an entry)')
    process.exit(1)
  }
  console.log(`${Object.keys(current).length} tools: calculation files unchanged since the last recorded version`)
}
