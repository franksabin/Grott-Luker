import { useState, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  PillField,
  SelectField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  ResultRow,
  Assumptions,
  Note,
  DisclosureBox,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, percent } from '../lib/format.js'
import { TAX_YEAR } from '../lib/tax.js'
import { STATES } from '../lib/states.js'
import { LIMITS, computePlans } from '../lib/retirementPlans.js'

const ENTITY = [
  { value: 'se', label: 'Sole prop / LLC (Schedule C)' },
  { value: 'scorp', label: 'S-corp (W-2 owner)' },
]
const STAFF_MODE = [
  { value: 'avg', label: 'Number and average wage' },
  { value: 'each', label: 'Each employee' },
]
const BRACKET = [22, 24, 32, 35, 37].map((b) => ({ value: String(b), label: `${b}%` }))

const blankEmp = (id) => ({ id, wage: '', covered: true })

const BLANK = {
  entity: 'se',
  earnings: '',
  age: '',
  staffMode: 'avg',
  empCount: '0',
  empWage: '',
  empCovered: '',
  emps: [blankEmp('e1'), blankEmp('e2')],
  bracket: '32',
  state: 'NH',
  sepRate: '25',
  feeSep: '',
  feeSolo: '',
  feeSimple: '',
  feeSh: '',
}
const SAMPLE = { ...BLANK, earnings: '185000', age: '52' }

// ?sample=1 wins (ToolShell also applies it); in dev, ?state=<base64 JSON> merges over BLANK
// (a test hook, dead code in a production build).
function initialForm() {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('sample')) return SAMPLE
    if (import.meta.env.DEV) {
      const s = q.get('state')
      if (s) {
        const o = JSON.parse(atob(s.replace(/ /g, '+')))
        const merged = { ...BLANK }
        Object.keys(o).forEach((k) => { merged[k] = typeof o[k] === 'number' ? String(o[k]) : o[k] })
        return merged
      }
    }
  } catch (e) {
    // fall through to blank
  }
  return BLANK
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const signed = (v) => (v < 0 ? `−${money(-v)}` : money(v))
const pct0 = (x) => `${+(x * 100).toFixed(1)}%`

export default function RetirementPlanComparison() {
  const [form, setForm] = useState(initialForm)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const setEmp = (id, key) => (v) => setForm((f) => ({ ...f, emps: f.emps.map((e) => (e.id === id ? { ...e, [key]: v } : e)) }))
  const addEmp = () => setForm((f) => ({ ...f, emps: [...f.emps, blankEmp(`e${Date.now()}`)] }))
  const removeEmp = (id) => setForm((f) => ({ ...f, emps: f.emps.length > 1 ? f.emps.filter((e) => e.id !== id) : f.emps.map((e) => blankEmp(e.id)) }))
  const r = useMemo(() => computePlans(form), [form])
  const { staff, hasStaff, t } = r
  const rate = pct0(t.rate)
  // From October of the plan year some set-up windows have closed; say so rather than let a new plan assume otherwise.
  const now = new Date()
  const late = now.getFullYear() === TAX_YEAR && now.getMonth() >= 9

  const best = r.best
  const netLabel = best.net >= 0 ? 'Net first-year benefit of the best plan' : 'Net first-year cost of the best plan'
  const employeeWord = `${staff.coveredCount} covered employee${staff.coveredCount > 1 ? 's' : ''}`
  const optionText = (p) => (p.id === 'simple' && hasStaff ? (p.option === 'nec' ? '2% non-elective' : '3% match') : '')
  // Short name and a small second line for the on-screen table.
  const planName = (p) => (p.id === 'sh401k' ? '401(k)' : p.id === 'simple' ? 'SIMPLE IRA' : p.label)
  const planSub = (p) => (p.id === 'sh401k' ? 'safe harbor' : p.id === 'simple' && hasStaff ? optionText(p) : '')
  const planHead = (p) => (p.id === 'simple' && hasStaff ? `SIMPLE IRA (${optionText(p)})` : p.label)
  const isBest = (p) => p.available && p.id === best.id && (hasStaff ? p.net !== 0 || p.total > 0 : p.total > 0 && p.total === r.bestByTotal.total)
  const splitNote = (p) => (p.employee ? `${money(p.employee)} employee + ${money(p.employer)} employer` : 'employer contribution only')
  const simpleLimitLabel = r.simpleSmall ? '110% small-employer limit (25 or fewer employees)' : 'standard limit (more than 25 employees)'

  // Rows shared by the screen table and the print table: one column per plan.
  const planRows = (plans) => [
    ['Owner deferral', ...plans.map((p) => (p.available ? money(p.employee) : '—'))],
    ['Employer, for owner', ...plans.map((p) => (p.available ? money(p.employer) : '—'))],
    ['Owner shelters', ...plans.map((p) => (p.available ? money(p.total) : '—'))],
    [`Tax deferred at ${rate}`, ...plans.map((p) => (p.available ? money(p.taxDeferred) : '—'))],
    ['Employer, for staff', ...plans.map((p) => (p.available ? money(p.staffCost) : '—'))],
    ['Plan fees (est.)', ...plans.map((p) => (p.available ? money(p.fees) : '—'))],
    ['After-tax cost', ...plans.map((p) => (p.available ? money(p.afterTaxCost) : '—'))],
    ['Net benefit (cost)', ...plans.map((p) => (p.available ? signed(p.net) : 'Not available'))],
    ['Cost per $1,000 sheltered', ...plans.map((p) => (p.available ? money(p.perThousand) : '—'))],
  ]

  const steps = useMemo(() => {
    const base = [
      ...(r.entity === 'se' ? [
        { label: 'Self-employment tax', formula: `on ${money(r.earnings, 2)} × 92.35% (12.4% SS to wage base + 2.9% Medicare)`, result: money(r.seTax, 2) },
        { label: 'Net earnings after ½ SE tax', formula: `${money(r.earnings, 2)} − ${money(r.seTax / 2, 2)}`, result: money(r.adjNet, 2) },
      ] : []),
      { label: 'Compensation base', formula: `min(${money(r.adjNet, 2)}, cap ${money(LIMITS.compCap)})`, result: money(r.comp, 2) },
      { label: 'Employer contribution ceiling', formula: `${Math.round(r.employerRate * 1000) / 10}% × ${money(r.comp, 2)}`, result: money(r.employerMax, 2), note: r.entity === 'se' ? `A ${pct0(r.sepPlanRate)} plan rate becomes ${pct0(r.employerRate)} of net earnings for the self-employed (the 25%-of-compensation rule solved for the self-employed = 20%).` : undefined },
      { label: 'SEP IRA — owner', formula: `min(employer ceiling, ${money(LIMITS.total415c)})`, result: money(r.sep.total, 2) },
      { label: 'Solo 401(k) — employee deferral', formula: `min(comp, ${money(LIMITS.deferral401k)}${r.catch401 ? ` + catch-up ${money(r.catch401)}` : ''})`, result: money(r.solo.employee, 2) },
      { label: 'Solo 401(k) — employer', formula: `min(employer ceiling, ${money(LIMITS.total415c)} − deferral, comp − deferral)`, result: money(r.solo.employer, 2), note: r.solo.compCapped ? 'Limited by the §415(c) 100%-of-compensation ceiling.' : undefined },
      { label: 'Solo 401(k) — total', formula: `${money(r.solo.employee, 2)} + ${money(r.solo.employer, 2)}`, result: money(r.solo.total, 2) },
      { label: 'SIMPLE IRA — deferral', formula: `min(comp, ${money(r.simpleLimit)}${r.catchSimple ? ` + catch-up ${money(r.catchSimple)}` : ''})`, result: money(r.simple.employee, 2), note: r.simpleSmall ? '110% small-employer limit (25 or fewer employees).' : undefined },
      { label: 'SIMPLE IRA — compensation', formula: r.entity === 'se' ? `92.35% × ${money(r.earnings, 2)} (net earnings from self-employment, before half of SE tax)` : `${money(r.earnings, 2)} W-2 wages`, result: money(r.entity === 'se' ? 0.9235 * r.earnings : r.earnings, 2) },
      { label: 'SIMPLE IRA — 3% match', formula: `min(3% × SIMPLE compensation, deferral)`, result: money(r.simple.variants.match.employer, 2), note: r.simpleSmall ? undefined : 'The standard limits apply: more than 25 employees paid $5,000 or more, owner included.' },
    ]
    if (!hasStaff) {
      return [
        ...base,
        { label: 'SIMPLE IRA — total', formula: `${money(r.simple.employee, 2)} + ${money(r.simple.employer, 2)}`, result: money(r.simple.total, 2) },
        { label: 'Largest available', formula: 'max of the three', result: r.bestByTotal.label },
      ]
    }
    const v = r.simple.variants
    return [
      ...base,
      { label: 'Covered payroll', formula: `${staff.coveredCount} employees, each wage capped at ${money(LIMITS.compCap)}`, result: money(staff.payroll, 2) },
      { label: 'Tax rate on the owner’s contribution', formula: `${percent(t.fed * 100, 0)} federal + ${percent(t.state * 100, 1)} ${STATES.find((s) => s.code === form.state)?.name || 'state'}`, result: pct0(t.rate) },
      { label: 'SEP — staff cost', formula: `${pct0(r.sepPlanRate)} × ${money(staff.payroll, 2)} (the same percentage for every eligible employee)`, result: money(r.sep.staffCost, 2) },
      { label: 'SIMPLE — staff cost, 3% match', formula: `every employee defers at least 3% × ${money(staff.payrollRaw, 2)} (the most the match can cost)`, result: money(v.match.staffCost, 2) },
      { label: 'SIMPLE — staff cost, 2% non-elective', formula: `2% × ${money(staff.payroll, 2)} (every eligible employee)`, result: money(v.nec.staffCost, 2), note: `The owner takes the ${optionText(r.simple)} option: it leaves more after cost.` },
      { label: '401(k) safe harbor — staff cost', formula: `3% non-elective × ${money(staff.payroll, 2)}`, result: money(r.sh401k.staffCost, 2) },
      ...r.plans.filter((p) => p.available).map((p) => ({
        label: `${planHead(p)} — net`,
        formula: `${money(p.total - p.rothCatch, 2)} deductible × ${pct0(t.rate)} − (${money(p.staffCost, 2)} staff + ${money(p.fees, 2)} fees) × (1 − ${pct0(t.rate)})`,
        result: signed(p.net),
      })),
      { label: 'Best net result', formula: 'highest net among the plans available', result: best.label },
    ]
  }, [r, form.state]) // eslint-disable-line react-hooks/exhaustive-deps

  const narrative = hasStaff ? (
    <>
      With {employeeWord} and {money(staff.payroll)} of covered pay, the owner shelters {money(r.sep.total)} in a SEP at a cost of {money(r.sep.staffCost)} in staff contributions, {money(r.simple.total)} in a SIMPLE for {money(r.simple.staffCost)}, or {money(r.sh401k.total)} in a safe-harbor 401(k) for {money(r.sh401k.staffCost)}.
      {' '}After tax at {rate}, {best.label} leaves the most: {money(best.total)} sheltered, {money(best.staffCost)} for staff and {money(best.fees)} in fees, a net of {signed(best.net)}.
      {best.net < 0 ? ' Every available plan costs more after tax than the tax it defers, so the case for any of them rests on retirement saving and retaining staff rather than on this year’s tax.' : ''}
      {' '}The tax saved is a deferral: the money is taxed when it comes out. The cost of funding staff is real money that does not come back.
    </>
  ) : (
    <>
      On {money(r.earnings)} of {r.entity === 'se' ? 'net self-employment earnings' : 'W-2 wages'}
      {r.entity === 'se' ? ` (${money(r.adjNet)} after half of self-employment tax)` : ''}, a SEP allows {money(r.sep.total)}; a Solo 401(k) allows {money(r.solo.total)} by adding a {money(r.solo.employee)} employee deferral to the {money(r.solo.employer)} employer contribution; a SIMPLE allows {money(r.simple.total)}.
      {r.solo.total > r.sep.total ? ` The Solo 401(k) advantage over the SEP (${money(r.solo.total - r.sep.total)}) is the employee deferral — it matters most at moderate income, and it disappears once compensation is high enough that the employer piece alone reaches the ${money(LIMITS.total415c)} cap.` : ''}
      {r.tie ? ` The SEP and the Solo 401(k) tie at ${money(r.sep.total)}: compensation is high enough that the employer contribution alone reaches the ${money(LIMITS.total415c)} cap, so the employee deferral adds nothing — the SEP wins on simplicity unless Roth or loan features matter.` : ''}
      {r.solo.compCapped ? ` The Solo 401(k) employer piece is held to ${money(r.solo.employer)} because total contributions cannot exceed 100% of compensation.` : ''}
      {' '}With no employees, all three are available and the comparison above is the whole picture. Add employees under Employees to see what covering them costs.
    </>
  )

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const entityLabel = (ENTITY.find((e) => e.value === r.entity) || ENTITY[0]).label
  const stateName = STATES.find((s) => s.code === form.state)?.name || form.state
  const inputs = [
    ['How the business pays the owner', entityLabel],
    [r.entity === 'se' ? 'Net self-employment earnings' : 'Owner W-2 wages', money(r.earnings)],
    ['Owner age', form.age || '—'],
    ['Employees (other than owner/spouse)', staff.headcount ? `${staff.headcount}${staff.coveredCount !== staff.headcount ? `, ${staff.coveredCount} covered` : ''}` : 'none'],
    ...(staff.headcount ? [['Covered payroll', money(staff.payroll)], ['Average covered wage', money(staff.coveredCount ? staff.payrollRaw / staff.coveredCount : 0)]] : []),
    ...(hasStaff ? [['Owner’s tax rate', `${percent(t.fed * 100, 0)} federal + ${stateName}`]] : []),
  ]
  const assumptions = [
    `${TAX_YEAR} limits: 401(k) deferral ${money(LIMITS.deferral401k)} (+${money(LIMITS.catchUp401k)} at 50, +${money(LIMITS.superCatchUp401k)} at 60–63); §415(c) total ${money(LIMITS.total415c)} and not more than 100% of compensation; compensation cap ${money(LIMITS.compCap)}.`,
    `SIMPLE IRA: SECURE 2.0 §117 gives employers with 25 or fewer employees paid $5,000 or more (owner counted) the higher limits automatically: ${money(LIMITS.simpleDeferralSmall)} deferral and a ${money(LIMITS.simpleCatchUpSmall)} catch-up at 50, which is lower than the standard ${money(LIMITS.simpleCatchUp)} (Notice 2025-67), and ${money(LIMITS.simpleSuperCatchUp)} at 60–63. Employers with 26 to 100 get the higher limits only by electing a 4% match or 3% non-elective contribution, and the higher limits assume no 401(a) or 403(b) plan in the prior 3 years; the standard ${money(LIMITS.simpleDeferral)} / ${money(LIMITS.simpleCatchUp)} are shown above 25. SIMPLE pay is 92.35% of profit for the self-employed, and the 3% match cannot exceed the owner's deferral.`,
    'Schedule C employer contributions use 20% of net earnings after half of self-employment tax (the 25%-of-compensation rule solved for the self-employed). S-corp figures use W-2 wages only; distributions are not compensation.',
    ...(hasStaff ? [
      `Staff cost: a SEP gives every eligible employee the owner’s percentage of pay; a SIMPLE matches 3% of pay for employees who defer (every employee is assumed to, the most it can cost) or gives 2% to all; a safe-harbor 401(k) gives 3% to all. Pay above ${money(LIMITS.compCap)} is not counted; employees marked not covered are assumed properly excluded.`,
      `Net = tax deferred on what the owner shelters at ${rate} less the after-tax cost of staff contributions and fees (both deductible; for a Schedule C owner they also lower self-employment tax). Fees are estimates you can change. The tax saved is a deferral; the staff cost is permanent. Not modeled: cross-tested profit sharing (an administrator can sometimes cut the staff cost for an older owner with much younger staff), SECURE 2.0 small-employer credits, vesting, forfeitures, QBI effects and state rules.`,
    ] : ['Employee-coverage costs appear once employees are entered under Employees.']),
    'Deadlines and features are summarized; plan documents and payroll timing govern.',
  ]

  const blocks = r.warnings.filter((w) => w.level === 'block' || w.level === 'warn')
  const infos = r.warnings.filter((w) => w.level === 'info')
  const shownPlans = r.plans // available first in display order; unavailable plans show as not available
  const tableHead = ['', ...shownPlans.map((p) => planHead(p))]
  const rows = planRows(shownPlans)
  const staffSummary = staff.headcount
    ? `${staff.headcount} employee${staff.headcount > 1 ? 's' : ''}${staff.coveredCount !== staff.headcount ? `, ${staff.coveredCount} covered` : ''} · ${money(staff.payroll)} covered pay`
    : null

  const practical = [
    ['Set-up deadline', 'Return due date incl. extensions', 'Return due date (deferrals need year-end election)', 'October 1', 'Safe harbor: by year-end'],
    ['Employees', 'Same % for all eligible', 'Owner (and spouse) only', 'Match 3% or give 2% to all', 'Safe harbor 3% to all'],
    ['Roth option', 'Yes (since 2023)', 'Yes', 'Yes (since 2023)', 'Yes'],
    ['Loans', 'No', 'Yes, if plan allows', 'No', 'Yes, if plan allows'],
    ['Annual filing', 'None', 'Form 5500-EZ once assets exceed $250k', 'None', 'Form 5500 and testing'],
    ['Best when', 'Simplicity; high income; late decision', 'Maximize at moderate income; want Roth or loans', 'Small payroll; modest contributions', 'Owner wants the most; staff are younger'],
  ]

  const feature = hasStaff
    ? { label: netLabel, value: money(Math.abs(best.net)), note: `${best.label}${best.id === 'simple' ? ` (${optionText(best)})` : ''} · owner shelters ${money(best.total)} · staff funding ${money(best.staffCost)} · fees ${money(best.fees)} · at ${rate}` }
    : {
        label: 'Largest deductible contribution',
        value: money(r.bestByTotal.total),
        note: `${r.bestByTotal.label}${r.tie ? ' (ties with the Solo 401(k))' : ''}${r.bestByTotal.employee ? ` · ${money(r.bestByTotal.employee)} employee + ${money(r.bestByTotal.employer)} employer` : ' · employer contribution only'}`,
      }

  const printReport = (
    <PrintDoc>
      <PrintPage compact>
        <PrintBand
          title="Retirement Plan Comparison"
          subtitle={hasStaff ? 'SEP, SIMPLE and 401(k) options with employees: what the owner can shelter, what covering staff costs, and the net result.' : 'SEP IRA vs. Solo 401(k) vs. SIMPLE IRA — the maximum deductible contribution under each plan.'}
          meta={`Tax year ${TAX_YEAR} limits · ${entityLabel} · age ${form.age || '—'} · ${hasStaff ? employeeWord : 'no employees'}`}
          metaRight={today}
        />
        <PrintFeature label={feature.label} value={feature.value} note={feature.note} />
        <PrintTiles
          items={(hasStaff ? r.plans.filter((p) => p.available).slice(0, 4) : r.plans).map((p) => ({
            label: planHead(p),
            value: hasStaff ? signed(p.net) : money(p.total),
            note: hasStaff ? `${money(p.total)} sheltered · ${money(p.staffCost)} for staff` : splitNote(p),
            best: isBest(p),
          }))}
        />
        {blocks.some((w) => w.level === 'block') ? (
          <PrintNote title="Not available">{blocks.filter((w) => w.level === 'block').map((w) => cap(w.text.replace(/^Not available: /, ''))).join(' ')}</PrintNote>
        ) : null}
        {hasStaff ? (
          <PrintSection title="Plan by plan" note={`net = tax deferred at ${rate} − after-tax cost of staff and fees`}>
            <PrintTable
              head={tableHead}
              widths={['24%', ...shownPlans.map(() => `${76 / shownPlans.length}%`)]}
              align={['left', ...shownPlans.map(() => 'right')]}
              rowClass={(row) => (row[0].startsWith('Net benefit') ? 'is-strong' : '')}
              rows={rows}
            />
          </PrintSection>
        ) : (
          <PrintSection title="Maximum contribution by plan" note={`compensation base ${money(r.comp)}`}>
            <PrintRows
              rows={[
                { label: `SEP IRA — ${Math.round(r.employerRate * 1000) / 10}% of net earnings`, value: money(r.sep.total), total: isBest(r.sep) },
                { label: `Solo 401(k) — ${money(r.solo.employee)} deferral + employer`, value: money(r.solo.total), total: isBest(r.solo) },
                { label: `SIMPLE IRA — ${money(r.simple.employee)} deferral + 3% match`, value: money(r.simple.total), total: isBest(r.simple) },
                ...(r.solo.total > r.sep.total ? [{ label: 'Solo 401(k) advantage over SEP — the employee deferral', value: `+${money(r.solo.total - r.sep.total)}`, sub: true }] : []),
              ]}
            />
          </PrintSection>
        )}
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        {hasStaff ? null : (
          <PrintSection title="Employee deferral and employer contribution by plan" note="a SEP has no employee deferral, so its employee bar is $0" className="pr-chart">
            <BarCompare height={230} groups={r.plans.map((p) => ({ label: p.label, bars: [{ label: 'Employee deferral', value: p.employee, color: TONE.accent }, { label: 'Employer contribution', value: p.employer, color: TONE.navy }] }))} />
          </PrintSection>
        )}
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Retirement Plan Comparison" right={today} />
        {hasStaff ? (
          <PrintSection title="Tax deferred vs. what it costs after tax" note="staff contributions and fees, after the deduction" className="pr-chart">
            <BarCompare height={150} groups={r.plans.filter((p) => p.available).map((p) => ({ label: planHead(p), bars: [{ label: 'Tax deferred', value: p.taxDeferred, color: TONE.net }, { label: 'After-tax cost', value: p.afterTaxCost, color: TONE.tax }] }))} />
          </PrintSection>
        ) : (
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
        )}
        <PrintSection title="Practical differences">
          <PrintTable
            head={hasStaff ? ['', 'SEP IRA', 'Solo 401(k)', 'SIMPLE IRA', '401(k) with staff'] : ['', 'SEP IRA', 'Solo 401(k)', 'SIMPLE IRA']}
            widths={hasStaff ? ['13%', '21%', '22%', '21%', '23%'] : ['16%', '28%', '28%', '28%']}
            rows={practical.map((row) => (hasStaff ? row : row.slice(0, 4)))}
          />
        </PrintSection>
        {hasStaff ? (
          <PrintCols>
            <PrintSection title="Inputs used in this estimate">
              <PrintInputs items={[inputs[0], inputs[1], inputs[2], inputs[inputs.length - 1]]} />
            </PrintSection>
            <PrintSection title="Employees covered">
              <PrintInputs items={inputs.slice(3, inputs.length - 1)} />
            </PrintSection>
          </PrintCols>
        ) : (
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
                { label: `Employer ceiling — ${Math.round(r.employerRate * 1000) / 10}% of base`, value: money(r.employerMax) },
              ]}
            />
          </PrintSection>
          <div>
            <PrintSection title="Inputs used in this estimate">
              <PrintInputs items={inputs} />
            </PrintSection>
            {hasStaff ? null : (
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
            )}
          </div>
        </PrintCols>
        )}
        <PrintNote title="Reading the result">
          {hasStaff
            ? `With ${employeeWord} on payroll the Solo 401(k) is not available, so the headline is the plan that leaves the owner the most after funding staff. Contributions for staff are deductible but are a real cost; the tax saved on the owner’s contribution is a deferral. SIMPLE figures use the ${simpleLimitLabel}. `
            : 'With no employees, all three plans are available to this owner and the Solo 401(k) is the largest whenever the employee deferral adds to an employer piece that has not yet reached the cap. '}
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
      subtitle="SEP IRA vs. Solo 401(k) vs. SIMPLE IRA for a self-employed owner: the maximum deductible contribution under each from net earnings and age, and, once there are employees, what covering them costs and what is left for the owner."
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

          <Panel title="Employees (other than the owner and spouse)">
            <SegmentedField label="How to enter them" value={form.staffMode} onChange={set('staffMode')} options={STAFF_MODE} />
            {form.staffMode === 'each' ? (
              <>
                <div className="emp-grid emp-head">
                  <span>Annual wage</span>
                  <span>Covered</span>
                  <span />
                </div>
                {form.emps.map((e, i) => (
                  <div className="emp-grid" key={e.id}>
                    <div className="input-money"><span>$</span><input className="input" type="text" inputMode="decimal" aria-label={`Employee ${i + 1} annual wage`} placeholder="0" value={e.wage} onChange={(ev) => setEmp(e.id, 'wage')(ev.target.value)} /></div>
                    <label className="emp-cov"><input type="checkbox" aria-label={`Employee ${i + 1} covered by the plan`} checked={e.covered !== false} onChange={(ev) => setEmp(e.id, 'covered')(ev.target.checked)} /></label>
                    <button type="button" className="mlog-del" aria-label={`Remove employee ${i + 1}`} onClick={() => removeEmp(e.id)}><X size={15} /></button>
                  </div>
                ))}
                <button type="button" className="btn btn-subtle btn-sm emp-add" onClick={addEmp}><Plus size={14} /> Add employee</button>
                <div className="hint">Untick Covered for an employee the plan can exclude (under 21, or part-time under 1,000 hours a year).</div>
              </>
            ) : (
              <>
                <div className="field-row">
                  <NumberField label="Number of employees" value={form.empCount} onChange={set('empCount')} placeholder="0" info="Common-law employees, not counting the owner or spouse." />
                  <MoneyField label="Average annual wage" value={form.empWage} onChange={set('empWage')} placeholder="0" info="Wages above $360,000 are not counted for contributions." />
                </div>
                <div className="field-row">
                  <NumberField label="Covered by the plan" value={form.empCovered} onChange={set('empCovered')} placeholder="all" hint="Leave blank if all would be covered." />
                </div>
              </>
            )}
            {staffSummary ? <div className="hint emp-summary">{staffSummary}</div> : null}
            {blocks.filter((w) => w.level === 'block' || w.id === 'wage').map((w) => (
              <DisclosureBox key={w.id}>
                <b>{w.level === 'block' ? 'Not available. ' : 'Note. '}</b>
                {cap(w.text.replace(/^Not available: /, ''))}
              </DisclosureBox>
            ))}
          </Panel>

          <RefinePanel title="Owner’s tax rate and plan assumptions" summary="tax rate, SEP rate, plan fees">
            <PillField label="Owner’s federal bracket" value={form.bracket} onChange={set('bracket')} options={BRACKET} info="Used to value the tax deferred on the owner’s contribution and the deduction for staff contributions and fees." />
            <div className="field-row">
              <SelectField label="State" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} info="A flat state rate on top of the federal bracket." />
              <NumberField label="SEP contribution rate" value={form.sepRate} onChange={set('sepRate')} suffix="%" placeholder="25" hint="25% is the maximum. A lower rate costs less for staff." />
            </div>
            <div className="refine-sub">Annual plan fees (leave blank for the estimate)</div>
            <div className="field-row">
              <MoneyField label="SEP IRA" value={form.feeSep} onChange={set('feeSep')} placeholder={Math.round(r.feeDefaults.sep).toLocaleString("en-US")} />
              <MoneyField label="SIMPLE IRA" value={form.feeSimple} onChange={set('feeSimple')} placeholder={Math.round(r.feeDefaults.simple).toLocaleString("en-US")} />
              {hasStaff ? (
                <MoneyField label="401(k), safe harbor" value={form.feeSh} onChange={set('feeSh')} placeholder={Math.round(r.feeDefaults.sh401k).toLocaleString("en-US")} />
              ) : (
                <MoneyField label="Solo 401(k)" value={form.feeSolo} onChange={set('feeSolo')} placeholder={Math.round(r.feeDefaults.solo).toLocaleString("en-US")} />
              )}
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle={hasStaff ? 'Plan Cost and Net Benefit' : 'Maximum Contribution by Plan'} meta={`Tax year ${TAX_YEAR} limits · compensation base ${money(r.comp)}${hasStaff ? ` · ${employeeWord}` : ''}`} metaRight={today} />
            {hasStaff
              ? blocks.map((w) => (
                  <DisclosureBox key={w.id}>
                    <b>{w.level === 'block' ? 'Not available. ' : 'Note. '}</b>
                    {cap(w.text.replace(/^Not available: /, ''))}
                  </DisclosureBox>
                ))
              : null}
            <FeatureBlock label={feature.label} value={feature.value} note={feature.note} />
            {hasStaff ? (
              <StatTiles
                items={[
                  { label: 'Owner shelters', value: money(best.total), note: `in the ${best.label}` },
                  { label: 'Employer contribution for staff', value: money(best.staffCost), note: `${pct0(best.staffRate)} of covered pay` },
                  { label: best.net >= 0 ? 'Net after tax' : 'Net cost after tax', value: signed(best.net), tone: best.net >= 0 ? 'good' : 'bad', note: `at ${rate}, after fees` },
                ]}
              />
            ) : (
              <StatTiles
                items={[
                  { label: 'Compensation base', value: money(r.comp), note: r.entity === 'se' ? 'after ½ SE tax' : 'W-2 wages' },
                  { label: 'Solo 401(k) deferral', value: money(r.solo.employee), note: r.catch401 ? `incl. ${money(r.catch401)} catch-up` : 'no catch-up' },
                  { label: 'Solo 401(k) vs. SEP', value: `+${money(r.solo.total - r.sep.total)}`, tone: r.tie ? undefined : 'good', note: r.tie ? 'tie — employer piece reaches the cap' : 'employee deferral advantage' },
                ]}
              />
            )}
            {hasStaff ? (
              <div className="mlog-tablewrap">
                <table className="data-table plan-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th className="num">Owner shelters</th>
                      <th className="num">Tax deferred</th>
                      <th className="num">After-tax cost</th>
                      <th className="num">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownPlans.map((p) => (p.available ? (
                      <tr key={p.id} className={p.id === best.id ? 'is-chosen' : ''}>
                        <td>{planName(p)}{planSub(p) ? <div className="plan-sub">{planSub(p)}</div> : null}</td>
                        <td className="num">{money(p.total)}</td>
                        <td className="num">{money(p.taxDeferred)}</td>
                        <td className="num">{money(p.afterTaxCost)}</td>
                        <td className="num">{signed(p.net)}</td>
                      </tr>
                    ) : (
                      <tr key={p.id}>
                        <td>{planName(p)}</td>
                        <td colSpan={4} className="plan-na">{p.id === 'solo' ? 'Not available with covered employees' : 'Not available above 100 employees'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
                <div className="hint">After-tax cost is staff contributions plus fees after the deduction they carry. Net is the tax deferred minus that cost.</div>
              </div>
            ) : (
              <div className="result-list">
                <ResultRow label={`SEP IRA — ${Math.round(r.employerRate * 1000) / 10}% of net earnings`} value={r.sep.total} total={isBest(r.sep)} />
                <ResultRow label={`Solo 401(k) — ${money(r.solo.employee)} deferral + employer`} value={r.solo.total} total={isBest(r.solo)} />
                <ResultRow label={`SIMPLE IRA — ${money(r.simple.employee)} deferral + 3% match`} value={r.simple.total} total={isBest(r.simple)} />
              </div>
            )}
            <Narrative>{narrative}</Narrative>
            {infos.map((w) => (
              <div className="hint plan-info" key={w.id}>{w.text}</div>
            ))}
            {late ? (
              <Note title={`Timing for ${TAX_YEAR}`}>
                <ul className="plan-timing">
                  <li><b>SEP IRA:</b> can still be set up for {TAX_YEAR} up to the return due date, including extensions.</li>
                  <li><b>SIMPLE IRA:</b> a new one had to be in place by October 1, so a business that does not already have one starts January 1, {TAX_YEAR + 1}.</li>
                  {hasStaff ? (
                    <li><b>401(k) with staff:</b> a new safe-harbor plan has to be in place well before year-end, so a new one generally starts January 1, {TAX_YEAR + 1}.</li>
                  ) : (
                    <li><b>Solo 401(k):</b> an owner with no employees can defer from pay if the plan is adopted by December 31; a sole proprietor can also set one up after year-end and still make {TAX_YEAR} deferrals by the return due date.</li>
                  )}
                </ul>
                Confirm dates with the plan administrator.
              </Note>
            ) : null}

            <ScenarioCards
              sub={hasStaff ? 'net first-year benefit (cost)' : 'maximum contribution'}
              scenarios={r.plans.filter((p) => p.available).map((p) => ({
                label: planHead(p),
                value: hasStaff ? signed(p.net) : money(p.total),
                best: isBest(p),
                rows: hasStaff
                  ? [
                      { label: 'Owner shelters', value: money(p.total) },
                      { label: 'Employer contribution for staff', value: money(p.staffCost) },
                      { label: 'Plan fees', value: money(p.fees) },
                    ]
                  : [
                      { label: 'Employee deferral', value: money(p.employee) },
                      { label: 'Employer', value: money(p.employer) },
                    ],
              }))}
            />

            <div className="chart-block">
              {hasStaff ? (
                <BarCompare height={170} groups={r.plans.filter((p) => p.available).map((p) => ({ label: planHead(p), bars: [{ label: 'Tax deferred', value: p.taxDeferred, color: TONE.net }, { label: 'After-tax cost', value: p.afterTaxCost, color: TONE.tax }] }))} />
              ) : (
                <BarCompare height={170} groups={r.plans.map((p) => ({ label: p.label, bars: [{ label: 'Employee', value: p.employee, color: TONE.accent }, { label: 'Employer', value: p.employer, color: TONE.navy }] }))} />
              )}
            </div>

            <div className="panel-title" style={{ border: 'none', marginTop: 18, paddingBottom: 6 }}>Practical differences</div>
            <div className="mlog-tablewrap">
              <table className="data-table" style={{ fontSize: 13 }}>
                <thead><tr><th></th><th>SEP IRA</th><th>Solo 401(k)</th><th>SIMPLE IRA</th>{hasStaff ? <th>401(k) with staff</th> : null}</tr></thead>
                <tbody>
                  {practical.map((row) => (
                    <tr key={row[0]}>{(hasStaff ? row : row.slice(0, 4)).map((c, i) => <td key={i}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Beyond these plans">
        Once an owner wants to put away materially more than {money(LIMITS.total415c)} a year and has steady profits, a defined-benefit or cash balance plan is the next conversation — see the Cash Balance Plan Analyzer.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
