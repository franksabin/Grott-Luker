import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, percent, toNumber } from '../lib/format.js'
import { selfEmploymentTax, TAX_YEAR } from '../lib/tax.js'

// 2026 limits per IRS Notice 2025-67 (indexed annually — verify each January).
const LIMITS = {
  deferral401k: 24500,
  catchUp401k: 8000,
  superCatchUp401k: 11250, // ages 60–63
  total415c: 72000,
  compCap: 360000,
  simpleDeferral: 17000,
  simpleCatchUp: 4000,
  // SECURE 2.0 §117: employers with 25 or fewer employees automatically get 110% of the SIMPLE
  // deferral and catch-up limits (Notice 2025-67 figures for 2026).
  simpleDeferralSmall: 18100,
  simpleCatchUpSmall: 4400,
  simpleSuperCatchUp: 5250, // ages 60–63 (not scaled by the 110% rule)
  simpleSmallEmployerMax: 25,
  simpleMatch: 0.03,
  sepRate: 0.25,
}

const ENTITY = [
  { value: 'se', label: 'Sole prop / LLC (Schedule C)' },
  { value: 'scorp', label: 'S-corp (W-2 owner)' },
]

const BLANK = { entity: 'se', earnings: '', age: '', employees: '0' }
const SAMPLE = { entity: 'se', earnings: '185000', age: '52', employees: '0' }

function compute(form) {
  const entity = form.entity === 'scorp' ? 'scorp' : 'se'
  const earnings = Math.max(0, toNumber(form.earnings))
  const age = toNumber(form.age)
  const employees = Math.max(0, Math.round(toNumber(form.employees)))

  // Compensation base for employer contributions.
  // Schedule C: net SE earnings less half of SE tax; employer % is 25% of comp after the
  // contribution itself, which works out to 20% of adjusted net earnings.
  const seTax = entity === 'se' ? selfEmploymentTax(earnings) : 0
  const adjNet = entity === 'se' ? Math.max(0, earnings - seTax / 2) : earnings
  const comp = Math.min(adjNet, LIMITS.compCap)
  const employerRate = entity === 'se' ? 0.2 : LIMITS.sepRate
  const employerMax = comp * employerRate

  const catch401 = age >= 60 && age <= 63 ? LIMITS.superCatchUp401k : age >= 50 ? LIMITS.catchUp401k : 0

  // SIMPLE limits: the 110% small-employer figures apply automatically at 25 or fewer employees.
  const simpleSmall = employees <= LIMITS.simpleSmallEmployerMax
  const simpleLimit = simpleSmall ? LIMITS.simpleDeferralSmall : LIMITS.simpleDeferral
  const simpleCatchBase = simpleSmall ? LIMITS.simpleCatchUpSmall : LIMITS.simpleCatchUp
  const catchSimple = age >= 60 && age <= 63 ? LIMITS.simpleSuperCatchUp : age >= 50 ? simpleCatchBase : 0

  // SEP
  const sep = { id: 'sep', label: 'SEP IRA', employer: Math.min(employerMax, LIMITS.total415c), employee: 0 }
  sep.total = sep.employer

  // Solo 401(k) — employer piece limited by the §415(c) dollar ceiling (catch-up sits outside it)
  // and by the §415(c)(1)(B) 100%-of-compensation ceiling on all additions combined.
  const deferral = Math.min(comp, LIMITS.deferral401k + catch401)
  const employer401 = Math.min(employerMax, Math.max(0, LIMITS.total415c - Math.min(comp, LIMITS.deferral401k)))
  const employerUncapped = Math.min(employer401, Math.max(0, LIMITS.total415c + catch401 - deferral))
  const employerSolo = Math.min(employerUncapped, Math.max(0, comp - deferral))
  const solo = { id: 'solo', label: 'Solo 401(k)', employee: deferral, employer: employerSolo, compCapped: employerSolo < employerUncapped }
  solo.total = solo.employee + solo.employer

  // SIMPLE IRA — the 3% match cannot exceed what the owner defers.
  const simpleDef = Math.min(comp, simpleLimit + catchSimple)
  const simple = { id: 'simple', label: 'SIMPLE IRA', employee: simpleDef, employer: Math.min(comp * LIMITS.simpleMatch, simpleDef) }
  simple.total = simple.employee + simple.employer

  // "Best" is the largest plan the owner can actually adopt: with common-law employees a Solo 401(k)
  // is not available, so it is shown for comparison but never crowned.
  const plans = [sep, solo, simple]
  const available = employees > 0 ? plans.filter((p) => p.id !== 'solo') : plans
  const best = available.reduce((a, b) => (b.total > a.total ? b : a), available[0])
  const soloBlocked = employees > 0 && solo.total > best.total
  // A tie only means something once there is compensation to contribute from.
  const tie = comp > 0 && employees === 0 && sep.total === solo.total
  return { entity, earnings, age, employees, seTax, adjNet, comp, employerRate, catch401, catchSimple, simpleSmall, simpleLimit, simpleCatchBase, sep, solo, simple, plans, best, soloBlocked, tie }
}

export default function RetirementPlanComparison() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    ...(r.entity === 'se' ? [
      { label: 'Self-employment tax', formula: `on ${money(r.earnings, 2)} × 92.35% (12.4% SS to wage base + 2.9% Medicare)`, result: money(r.seTax, 2) },
      { label: 'Net earnings after ½ SE tax', formula: `${money(r.earnings, 2)} − ${money(r.seTax / 2, 2)}`, result: money(r.adjNet, 2) },
    ] : []),
    { label: 'Compensation base', formula: `min(${money(r.adjNet, 2)}, cap ${money(LIMITS.compCap)})`, result: money(r.comp, 2) },
    { label: 'Employer contribution ceiling', formula: `${Math.round(r.employerRate * 100)}% × ${money(r.comp, 2)}`, result: money(r.comp * r.employerRate, 2), note: r.entity === 'se' ? '25% of compensation solved for the self-employed = 20% of net earnings.' : undefined },
    { label: 'SEP IRA', formula: `min(employer ceiling, ${money(LIMITS.total415c)})`, result: money(r.sep.total, 2) },
    { label: 'Solo 401(k) — employee deferral', formula: `min(comp, ${money(LIMITS.deferral401k)}${r.catch401 ? ` + catch-up ${money(r.catch401)}` : ''})`, result: money(r.solo.employee, 2) },
    { label: 'Solo 401(k) — employer', formula: `min(employer ceiling, ${money(LIMITS.total415c)} − deferral, comp − deferral)`, result: money(r.solo.employer, 2), note: r.solo.compCapped ? 'Limited by the §415(c) 100%-of-compensation ceiling.' : undefined },
    { label: 'Solo 401(k) — total', formula: `${money(r.solo.employee, 2)} + ${money(r.solo.employer, 2)}`, result: money(r.solo.total, 2) },
    { label: 'SIMPLE IRA — deferral', formula: `min(comp, ${money(r.simpleLimit)}${r.catchSimple ? ` + catch-up ${money(r.catchSimple)}` : ''})`, result: money(r.simple.employee, 2), note: r.simpleSmall ? '110% small-employer limit (25 or fewer employees).' : undefined },
    { label: 'SIMPLE IRA — 3% match', formula: `min(3% × ${money(r.comp, 2)}, deferral)`, result: money(r.simple.employer, 2) },
    { label: 'SIMPLE IRA — total', formula: `${money(r.simple.employee, 2)} + ${money(r.simple.employer, 2)}`, result: money(r.simple.total, 2) },
    { label: 'Largest available', formula: r.employees > 0 ? 'max of SEP and SIMPLE (Solo 401(k) requires no employees)' : 'max of the three', result: r.best.label },
  ], [r])
  const hasEmployees = r.employees > 0
  const bestAvail = r.best
  const soloBlocked = r.soloBlocked
  const isBest = (p) => p.total > 0 && p.total === r.best.total && !(hasEmployees && p.id === 'solo')
  const splitNote = (p) => (p.employee ? `${money(p.employee)} employee + ${money(p.employer)} employer` : 'employer contribution only')
  const employeeWord = `${r.employees} employee${r.employees > 1 ? 's' : ''}`
  const simpleLimitLabel = r.simpleSmall ? '110% small-employer limit (25 or fewer employees)' : 'standard limit (more than 25 employees)'
  const narrative = (
    <>
      On {money(r.earnings)} of {r.entity === 'se' ? 'net self-employment earnings' : 'W-2 wages'}
      {r.entity === 'se' ? ` (${money(r.adjNet)} after half of self-employment tax)` : ''}, a SEP allows {money(r.sep.total)}; a Solo 401(k) allows {money(r.solo.total)} by adding a {money(r.solo.employee)} employee deferral to the {money(r.solo.employer)} employer contribution; a SIMPLE allows {money(r.simple.total)}.
      {r.solo.total > r.sep.total ? ` The Solo 401(k) advantage over the SEP (${money(r.solo.total - r.sep.total)}) is the employee deferral — it matters most at moderate income, and it disappears once compensation is high enough that the employer piece alone reaches the ${money(LIMITS.total415c)} cap.` : ''}
      {r.tie ? ` The SEP and the Solo 401(k) tie at ${money(r.sep.total)}: compensation is high enough that the employer contribution alone reaches the ${money(LIMITS.total415c)} cap, so the employee deferral adds nothing — the SEP wins on simplicity unless Roth or loan features matter.` : ''}
      {r.solo.compCapped ? ` The Solo 401(k) employer piece is held to ${money(r.solo.employer)} because total contributions cannot exceed 100% of compensation.` : ''}
      {hasEmployees ? ` With ${employeeWord}, a Solo 401(k) is off the table, a SEP must contribute the same percentage for every eligible employee, and a SIMPLE requires the 3% match (or 2% non-elective) for all — the owner's numbers above don't include those costs.` : ' With no employees, all three are available and the comparison above is the whole picture.'}
    </>
  )

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const entityLabel = (ENTITY.find((e) => e.value === r.entity) || ENTITY[0]).label
  const inputs = [
    ['How the business pays the owner', entityLabel],
    [r.entity === 'se' ? 'Net self-employment earnings' : 'Owner W-2 wages', money(r.earnings)],
    ['Owner age', form.age || '—'],
    ['Employees (other than owner/spouse)', String(r.employees)],
  ]
  const assumptions = [
    `${TAX_YEAR} limits: 401(k) deferral ${money(LIMITS.deferral401k)} (+${money(LIMITS.catchUp401k)} at 50, +${money(LIMITS.superCatchUp401k)} at 60–63); §415(c) total ${money(LIMITS.total415c)} and not more than 100% of compensation; compensation cap ${money(LIMITS.compCap)}.`,
    `SIMPLE IRA: SECURE 2.0 §117 gives employers with 25 or fewer employees the 110% limits automatically — ${money(LIMITS.simpleDeferralSmall)} deferral, ${money(LIMITS.simpleCatchUpSmall)} catch-up at 50 (${money(LIMITS.simpleSuperCatchUp)} at 60–63); above 25 employees the standard ${money(LIMITS.simpleDeferral)} / ${money(LIMITS.simpleCatchUp)} apply unless the employer elects the higher match. The 3% match cannot exceed the owner's deferral.`,
    'Schedule C employer contributions use 20% of net earnings after half of self-employment tax (the 25%-of-compensation rule solved for the self-employed).',
    'S-corp figures use W-2 wages only; distributions are not compensation.',
    'Employee-coverage costs for SEP and SIMPLE plans with staff are not computed here.',
    'Deadlines and features are summarized; plan documents and payroll timing govern.',
  ]
  const printReport = (
    <PrintDoc>
      <PrintPage compact>
        <PrintBand
          title="Retirement Plan Comparison"
          subtitle="SEP IRA vs. Solo 401(k) vs. SIMPLE IRA — the maximum deductible contribution under each plan."
          meta={`Tax year ${TAX_YEAR} limits · ${entityLabel} · age ${form.age || '—'} · ${hasEmployees ? employeeWord : 'no employees'}`}
          metaRight={today}
        />
        <PrintFeature
          label={hasEmployees ? 'Largest deductible contribution available with employees' : 'Largest deductible contribution'}
          value={money(bestAvail.total)}
          note={`${bestAvail.label}${r.tie ? ' (ties with the Solo 401(k))' : ''} · ${bestAvail.employee ? `${money(bestAvail.employee)} employee deferral + ${money(bestAvail.employer)} employer` : 'employer contribution only'}${soloBlocked ? ` · a Solo 401(k) would allow ${money(r.solo.total)} but requires no employees` : ''}`}
        />
        <PrintTiles
          items={r.plans.map((p) => ({
            label: p.label,
            value: money(p.total),
            note: hasEmployees && p.id === 'solo' ? 'not available with employees' : splitNote(p),
            best: isBest(p),
          }))}
        />
        <PrintSection title="Maximum contribution by plan" note={`compensation base ${money(r.comp)}`}>
          <PrintRows
            rows={[
              { label: `SEP IRA — ${Math.round(r.employerRate * 100)}% of compensation`, value: money(r.sep.total), total: isBest(r.sep) },
              { label: `Solo 401(k) — ${money(r.solo.employee)} deferral + employer${hasEmployees ? ' (not available with employees)' : ''}`, value: money(r.solo.total), total: isBest(r.solo) },
              { label: `SIMPLE IRA — ${money(r.simple.employee)} deferral + 3% match`, value: money(r.simple.total), total: isBest(r.simple) },
              ...(!hasEmployees && r.solo.total > r.sep.total
                ? [{ label: 'Solo 401(k) advantage over SEP — the employee deferral', value: `+${money(r.solo.total - r.sep.total)}`, sub: true }]
                : []),
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        <PrintSection title="Employee deferral and employer contribution by plan" note="a SEP has no employee deferral, so its employee bar is $0" className="pr-chart">
          <BarCompare height={230} groups={r.plans.map((p) => ({ label: p.label, bars: [{ label: 'Employee deferral', value: p.employee, color: TONE.accent }, { label: 'Employer contribution', value: p.employer, color: TONE.navy }] }))} />
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Retirement Plan Comparison" right={today} />
        <PrintSection title="How each maximum is built" note="employee deferral + employer contribution">
          <PrintTable
            head={['', 'SEP IRA', 'Solo 401(k)', 'SIMPLE IRA']}
            widths={['31%', '23%', '23%', '23%']}
            rows={[
              ['Employee deferral', money(r.sep.employee), money(r.solo.employee), money(r.simple.employee)],
              ['Catch-up included (age-based)', '—', r.catch401 ? money(r.catch401) : 'none', r.catchSimple ? money(r.catchSimple) : 'none'],
              ['Employer contribution', money(r.sep.employer), money(r.solo.employer), money(r.simple.employer)],
              ['Maximum deductible total', money(r.sep.total), money(r.solo.total), money(r.simple.total)],
              ['Share of compensation base', r.comp ? percent((r.sep.total / r.comp) * 100, 1) : '—', r.comp ? percent((r.solo.total / r.comp) * 100, 1) : '—', r.comp ? percent((r.simple.total / r.comp) * 100, 1) : '—'],
            ]}
          />
        </PrintSection>
        <PrintSection title="Practical differences">
          <PrintTable
            head={['', 'SEP IRA', 'Solo 401(k)', 'SIMPLE IRA']}
            widths={['16%', '28%', '28%', '28%']}
            rows={[
              ['Set-up deadline', 'Return due date incl. extensions', 'Return due date (deferrals need year-end election)', 'October 1'],
              ['Employees', 'Same % for all eligible', 'Owner (and spouse) only', 'Match 3% or give 2% to all'],
              ['Roth option', 'Yes (since 2023)', 'Yes', 'Yes (since 2023)'],
              ['Loans', 'No', 'Yes, if plan allows', 'No'],
              ['Annual filing', 'None', 'Form 5500-EZ once assets exceed $250k', 'None'],
              ['Best when', 'Simplicity; high income; late decision', 'Maximize at moderate income; want Roth or loans', 'Small payroll; modest contributions'],
            ]}
          />
        </PrintSection>
        <PrintCols>
          <PrintSection title="Compensation base">
            <PrintRows
              rows={[
                ...(r.entity === 'se' ? [
                  { label: 'Net self-employment earnings', value: money(r.earnings) },
                  { label: 'Self-employment tax', value: money(r.seTax), sub: true },
                  { label: 'Net earnings after ½ SE tax', value: money(r.adjNet) },
                ] : [
                  { label: 'Owner W-2 wages', value: money(r.earnings) },
                ]),
                { label: `Compensation base (cap ${money(LIMITS.compCap)})`, value: money(r.comp), total: true },
                { label: `Employer ceiling — ${Math.round(r.employerRate * 100)}% of base`, value: money(r.comp * r.employerRate) },
              ]}
            />
          </PrintSection>
          <div>
            <PrintSection title="Inputs used in this estimate">
              <PrintInputs items={inputs} />
            </PrintSection>
            <PrintSection title={`Statutory limits applied (${TAX_YEAR})`}>
              <PrintRows
                rows={[
                  { label: '401(k) employee deferral', value: money(LIMITS.deferral401k) },
                  { label: r.catch401 ? `401(k) catch-up — age ${r.age >= 60 && r.age <= 63 ? '60–63' : '50 and over'}` : '401(k) catch-up — under 50', value: r.catch401 ? `+${money(r.catch401)}` : 'none' },
                  { label: 'Combined 401(k) / SEP ceiling — §415(c)', value: money(LIMITS.total415c) },
                  { label: `SIMPLE deferral — ${r.simpleSmall ? '110% small-employer limit' : 'standard limit'}`, value: money(r.simpleLimit) },
                  { label: r.catchSimple ? `SIMPLE catch-up — age ${r.age >= 60 && r.age <= 63 ? '60–63' : `50+ (${r.simpleSmall ? '110% limit' : 'standard'})`}` : 'SIMPLE catch-up — under 50', value: r.catchSimple ? `+${money(r.catchSimple)}` : 'none' },
                ]}
              />
            </PrintSection>
          </div>
        </PrintCols>
        <PrintNote title="Reading the result">
          {hasEmployees
            ? `With ${employeeWord} on payroll, the Solo 401(k) figures are shown for comparison only — that plan is not available, so the headline is the largest plan this owner can actually adopt. The SEP and SIMPLE figures exclude the required contributions for staff. `
            : 'With no employees, all three plans are available to this owner and the Solo 401(k) is the largest whenever the employee deferral adds to an employer piece that has not yet reached the cap. '}
          SIMPLE figures use the {simpleLimitLabel}.
          Once an owner wants to put away materially more than {money(LIMITS.total415c)} a year and has steady profits, a defined-benefit or cash balance plan is the next conversation — see the Cash Balance Plan Analyzer.
        </PrintNote>
        <PrintSection title="Assumptions">
          <PrintAssumptions items={assumptions} />
        </PrintSection>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="Retirement Plan Comparison"
      subtitle="SEP IRA vs. Solo 401(k) vs. SIMPLE IRA for a self-employed owner — the maximum deductible contribution under each from net earnings and age, and what changes once there are employees."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Owner">
            <SegmentedField label="How the business pays the owner" value={form.entity} onChange={set('entity')} options={ENTITY} />
            <MoneyField
              label={r.entity === 'se' ? 'Net self-employment earnings (Schedule C profit)' : 'Owner W-2 wages'}
              value={form.earnings}
              onChange={set('earnings')}
              info={r.entity === 'se' ? 'Net profit before the retirement contribution and before the deduction for half of self-employment tax.' : 'Only W-2 wages count as compensation for plan purposes — S-corp distributions do not.'}
            />
            <NumberField label="Owner age" value={form.age} onChange={set('age')} hint={r.catch401 ? `Catch-up eligible: +${money(r.catch401)} 401(k) · +${money(r.catchSimple)} SIMPLE` : undefined} />
          </Panel>
          <RefinePanel summary="employees">
            <NumberField label="Employees (other than owner/spouse)" value={form.employees} onChange={set('employees')} info="Common-law employees working 1,000+ hours. Changes which plans are available and what they cost." />
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Maximum Contribution by Plan" meta={`Tax year ${TAX_YEAR} limits · compensation base ${money(r.comp)}`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={hasEmployees ? 'Largest deductible contribution available with employees' : 'Largest deductible contribution'}
              value={money(r.best.total)}
              note={`${r.best.label}${r.tie ? ' (ties with the Solo 401(k))' : ''}${r.best.employee ? ` · ${money(r.best.employee)} employee + ${money(r.best.employer)} employer` : ' · employer contribution only'}${soloBlocked ? ` · a Solo 401(k) would allow ${money(r.solo.total)} but requires no employees` : ''}`}
            />
            <StatTiles
              items={[
                { label: 'Compensation base', value: money(r.comp), note: r.entity === 'se' ? 'after ½ SE tax' : 'W-2 wages' },
                { label: 'Solo 401(k) deferral', value: money(r.solo.employee), note: r.catch401 ? `incl. ${money(r.catch401)} catch-up` : 'no catch-up' },
                hasEmployees
                  ? { label: 'Solo 401(k) vs. SEP', value: `+${money(r.solo.total - r.sep.total)}`, note: 'not available with employees' }
                  : { label: 'Solo 401(k) vs. SEP', value: `+${money(r.solo.total - r.sep.total)}`, tone: r.tie ? undefined : 'good', note: r.tie ? 'tie — employer piece reaches the cap' : 'employee deferral advantage' },
              ]}
            />
            <div className="result-list">
              <ResultRow label={`SEP IRA — ${Math.round(r.employerRate * 100)}% of compensation`} value={r.sep.total} total={isBest(r.sep)} />
              <ResultRow label={`Solo 401(k) — ${money(r.solo.employee)} deferral + employer${hasEmployees ? ' (not available with employees)' : ''}`} value={r.solo.total} total={isBest(r.solo)} />
              <ResultRow label={`SIMPLE IRA — ${money(r.simple.employee)} deferral + 3% match`} value={r.simple.total} total={isBest(r.simple)} />
            </div>
            <Narrative>{narrative}</Narrative>

            <ScenarioCards
              sub="maximum contribution"
              scenarios={r.plans.map((p) => ({
                label: p.label,
                value: money(p.total),
                best: isBest(p),
                rows: [
                  { label: 'Employee deferral', value: money(p.employee) },
                  { label: 'Employer', value: money(p.employer) },
                ],
              }))}
            />

            <div className="chart-block">
              <BarCompare height={170} groups={r.plans.map((p) => ({ label: p.label, bars: [{ label: 'Employee', value: p.employee, color: TONE.accent }, { label: 'Employer', value: p.employer, color: TONE.navy }] }))} />
            </div>

            <div className="panel-title" style={{ border: 'none', marginTop: 18, paddingBottom: 6 }}>Practical differences</div>
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead><tr><th></th><th>SEP IRA</th><th>Solo 401(k)</th><th>SIMPLE IRA</th></tr></thead>
              <tbody>
                <tr><td>Set-up deadline</td><td>Return due date incl. extensions</td><td>Return due date (deferrals need year-end election)</td><td>October 1</td></tr>
                <tr><td>Employees</td><td>Same % for all eligible</td><td>Owner (and spouse) only</td><td>Match 3% or give 2% to all</td></tr>
                <tr><td>Roth option</td><td>Yes (since 2023)</td><td>Yes</td><td>Yes (since 2023)</td></tr>
                <tr><td>Loans</td><td>No</td><td>Yes, if plan allows</td><td>No</td></tr>
                <tr><td>Annual filing</td><td>None</td><td>Form 5500-EZ once assets exceed $250k</td><td>None</td></tr>
                <tr><td>Best when</td><td>Simplicity; high income; late decision</td><td>Maximize at moderate income; want Roth or loans</td><td>Small payroll; modest contributions</td></tr>
              </tbody>
            </table>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Beyond these three">
        Once an owner wants to put away materially more than {money(LIMITS.total415c)} a year and has steady profits, a defined-benefit or cash balance plan is the next conversation — see the Cash Balance Plan Analyzer.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
