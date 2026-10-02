# Print reports — how every calculator prints

(Originally the working guide for the October 2026 print-report build. Dev server: `npm run dev` on port 5174; the checker expects it there.)


Repo: `C:\Users\FrankSabin\AppData\Local\Temp\Grott-Luker` (React + Vite). Dev server is ALREADY RUNNING at
http://localhost:5174 with hot reload. Do NOT start servers, do NOT run `vite build`, do NOT commit, do NOT deploy.

## What "done" looks like
Open the tool, press Ctrl+P, and get a fixed-page, report-style PDF — exactly like the reference
`src/pages/CharitableGiving.jsx` (search for `const printReport = (`). The screen layout is hidden when
printing; `<PrintDoc>` pages render instead. The reference is 2 Letter pages:

- **Page 1**: `PrintBand` (navy cover: GL logo, eyebrow, title, one-line subtitle, meta line left/right) →
  `PrintFeature` (the ONE headline number, 40px, with a short note) → `PrintTiles` (3–4 tiles; mark the winner `best: true`) →
  a `PrintSection` of `PrintRows` (the key comparison rows) → `PrintSection "What this means"` with `PrintProse`
  (the tool's existing Narrative text, reused) → `PrintSection className="pr-chart"` with the tool's main chart,
  BIG (BarCompare height≈230; LineChart fills the width; it should take the lower third of the page) → `PrintFooter page={1} pages={N}`.
- **Page 2**: `PrintPageHead` → supporting detail (a `PrintTable`, extra `PrintRows`, a second chart, year-by-year table) →
  `PrintNote title="Reading the result"` (reuse the tool's existing Note text) → `PrintSection "Inputs used in this estimate"`
  with `PrintInputs items={[[label, value], …]}` (every input the user typed, formatted) → `PrintSection "Assumptions"`
  with `PrintAssumptions items={assumptions}` → `PrintFooter page={2} pages={N}`.
- Every page is `7.5in × 10in` with `overflow: hidden`. Content that does not fit is silently clipped and the footer
  disappears. That is the #1 failure mode. Each page must end with its footer visible.
- Default N = 2. Use 3 only when the tool has a year-by-year table that is genuinely useful on paper (e.g. the Roth/RMD
  planner, 1031 with several assets). Never 1. Pass `last` on the final `PrintPage`.

## Primitives (`src/components/PrintReport.jsx`) — import what you use
`PrintDoc, PrintPage({last, compact}), PrintBand({title, subtitle, meta, metaRight}), PrintPageHead({title, right}),
PrintSection({title, note, className}), PrintFeature({label, value, note}), PrintTiles({items:[{label,value,note,best}]}),
PrintRows({rows:[{label,value,sub,total}]}), PrintTable({head, rows, widths}), PrintProse, PrintNote({title}),
PrintInputs({items:[[k,v]]}), PrintAssumptions({items}), PrintFooter({page, pages}), PrintCols({cols:2|3})`.
- `PrintCols` puts 2–3 PrintSections side by side (inputs beside assumptions, two short row lists, a small chart beside rows). Great for fitting page 2.
- `compact` on a PrintPage tightens rows/prose/tables ~10% when a page is just slightly over.
- Charts: wrap in `<PrintSection title="…" className="pr-chart">`. Print CSS already handles BarCompare, LineChart, StackedBar, DonutChart, Legend, BracketBars, RangeBar inside `.pr-chart`. Pass `legend={false}` to BarCompare when there is one bar per group. Never shrink the chart to make room — move a section to page 2 instead.
- Values in rows are plain weight (not bold) by CSS; labels sit 36px in from the left rule edge, values 90px in from the right. Do not override these.

## House rules learned from the client's markups
1. Big headline number; big chart; row values plain weight; nothing hugging the page edges.
2. Reuse the tool's own copy: Narrative → PrintProse, Note → PrintNote, Assumptions → PrintAssumptions. Hoist the
   assumptions array into a `const assumptions = […]` and use it in BOTH the screen `<Assumptions items={assumptions} />` and the print.
3. The numbers must come from the same computed result object the screen uses (`r`, `ra`, `plan`…). No re-computation.
4. Handle conditional branches: if the tool shows different content for some inputs (e.g. QCD only at 70½, scenario B optional, equipment vs real property), the print must branch the same way and must still fit on every branch. Test the sample (`?sample=1`) at minimum; if the tool has a second meaningful mode, switch it in the browser, print, and confirm it fits too (see "Checking other modes").
5. Title on the band = the report's name (e.g. "Owner Compensation Comparison"), not the marketing tool title. Eyebrow is fixed. Subtitle = one plain sentence.
6. `today` = `new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })` as metaRight on page 1 and `right` on page heads.
7. No new CSS, no changes to `src/index.css`, `PrintReport.jsx`, `ToolShell.jsx`, `charts.jsx`, `tax.js`, or any file other than YOUR page file. If you truly need something shared, write it in your final report instead and use inline `style={{…}}` as a stopgap.
8. Edit in complete blocks (one Edit that inserts the whole `printReport` tree, one Edit that adds `printReport={printReport}` to ToolShell, one for the imports). Every intermediate save is hot-reloaded; a syntax error in your file blanks the WHOLE app for every other agent until you fix it. Run the checker right after each edit.
9. Keep `inputsSummary` out (the print report replaces it). Keep `steps` (Show the math) untouched.

## Wiring
```jsx
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
…
const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const assumptions = [ … ]           // hoisted from the JSX
const inputs = [ ['Filing status', …], … ]
const printReport = ( <PrintDoc> … </PrintDoc> )
return <ToolShell … printReport={printReport}> …
```
Define `printReport` AFTER every variable it uses (TDZ errors blank the page). If the component returns early for a "planned" state, build the print after that return.

## Checking (mandatory, after every edit)
```
python "scripts/check_print.py" <route-slug> <N> <PageFileBasename> [tag]
```
e.g. `python …\check_print.py estimated-tax 2 EstimatedTax`
It syntax-checks your file, prints the live page to PDF, verifies page count, verifies each page's footer text survived
(if the footer is missing, content overflowed), flags NaN/undefined, reports content fill % per page, and writes PNGs
(`scripts/print-out/<tag>-p1.png`, `-p2.png`). You MUST Read the PNGs and look at them: nothing cut off, chart big,
headline big, sections balanced, page 2 not half-empty (fill ≥ 60% is the target; the checker fails below 55%).
"ok": true is necessary but not sufficient — you are the designer.

### Checking other modes
To print a non-sample state, append query flags your page already supports, or temporarily set the sample constant,
print, then restore it. Never leave temporary changes in the file. If a mode is rare, make the print branch defensively
(e.g. `{r.qcdEligible ? … : null}`) and keep both branches under the page height by design (shorter rows, PrintCols).

## Route slugs ↔ page files
estimated-tax→EstimatedTax · multi-year-projection→MultiYearProjection · 1031-exchange→Exchange1031 · retirement-tax-map→RetirementTaxMap ·
withholding-checkup→WithholdingCheckup · capital-gains-harvesting→CapitalGainsHarvesting · qbi-optimizer→QbiOptimizer · owner-comp→OwnerComp ·
cash-balance→CashBalance · business-sale→BusinessSale · retirement-plan-comparison→RetirementPlanComparison · paying-your-kids→PayingKids ·
retire-track→RetireTrack · rollover-401k→Rollover401k · divorce-division→DivorceDivision · concentrated-wealth→ConcentratedWealth ·
social-security-timing→SocialSecurityTiming · arm-vs-fixed→ArmVsFixed · solar-panels→SolarPanels
(`cash-balance` has no sample; its defaults compute on load — print it as is.)


## Update after round 1 (shared layer fixed — remove stopgaps that are now redundant)
- Legends now print correctly inside `.pr-chart`: horizontal, 9.5px, small dots (`.pr-chart .chart-legend li` rule added). You may use the built-in `legend` of StackedBar / BarCompare / DonutChart / LineChart again. A page-local `PrintLegend` is fine to keep only if it adds information the built-in legend lacks.
- `.pr-chart .chart-stack` is now `width: auto` with the 36px side insets — remove `paddingRight: 72` / `width: calc(100% - 72px)` wrappers around StackedBars.
- The site-wide print cap `.chart-block svg, .chart-bars { max-height: 150px }` no longer applies inside `.pr-chart` — fixed-height wrapper divs around BarCompare are no longer needed (harmless if kept).
- BarCompare's group labels hang ~26px below the `height` you pass. Budget `height + 26` when stacking things under a chart. Keep any `paddingBottom` wrapper you added for this.
- `.pr-chart .bracket-chart` now has a 10px top margin (the dots no longer touch the section rule) — remove page-level paddingTop wrappers.
- `PrintTable` now takes `align={['left','right','right']}` (right = numeric, tabular, nowrap) and `rowClass={(row, i) => 'is-strong' | 'is-tint' | ''}`. Prefer these over inline `<span style="text-align:right">` helpers; replacing existing inline helpers is optional.
- `.pr-section-head > span` (direct child only) — JSX passed as `note` no longer inherits italics on inner spans.
- LineChart tools: a full-width LineChart (1000:480) is ~325px tall plus legend, so page 1 is band / feature / tiles / prose / chart; the key rows go to the top of page 2. That is the house pattern (RetireTrack, CashBalance, Solar follow it).
- The checker now also flags a footer that runs to the page's bottom edge, content overlapping the footer, and text touching the left/right edges.
