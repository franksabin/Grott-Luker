import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  NumberField,
  MoneyField,
  PillField,
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
import { LineChart, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import {
  LIMITS,
  GRID_MIN_AGE,
  GRID_MAX_AGE,
  EMPLOYER_PCT_WITH_CB,
  EMPLOYEE_COST_PCT,
  TAXABLE_DRAG,
  catchUp,
  computeCashBalance,
} from '../lib/cashBalance.js'

const COMP = [
  { value: '100000', label: '$100k' },
  { value: '150000', label: '$150k' },
  { value: '200000', label: '$200k' },
  { value: '250000', label: '$250k' },
  { value: '300000', label: '$300k' },
  { value: '360000', label: '$360k+' },
]
const BRACKET = [
  { value: '24', label: '24%' },
  { value: '32', label: '32%' },
  { value: '35', label: '35%' },
  { value: '37', label: '37%' },
]
const YEARS = ['5', '10', '15', '20', '25', '30'].map((v) => ({ value: v, label: v }))

// The tool answers on load with a representative owner; Reset returns here.
const DEFAULTS = {
  age: '52',
  comp: '360000',
  fed: '32',
  years: '15',
  ret: '5',
  state: '0',
  employees: '0',
  avgPay: '60000',
}

export default function CashBalance() {
  const [form, setForm] = useState(DEFAULTS)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const r = useMemo(
    () =>
      computeCashBalance({
        age: toNumber(form.age),
        comp: toNumber(form.comp),
        fed: toNumber(form.fed) / 100,
        state: toNumber(form.state) / 100,
        years: Math.max(1, Math.round(toNumber(form.years)) || 15),
        ret: toNumber(form.ret) / 100,
        employees: toNumber(form.employees),
        avgPay: toNumber(form.avgPay),
      }),
    [form],
  )

  const steps = useMemo(
    () => [
      { label: 'Maximum cash balance contribution', formula: `${LIMITS.year} grid · age ${r.age} · considered earnings ${money(toNumber(form.comp))}`, result: money(r.cb), note: r.age < GRID_MIN_AGE || r.age > GRID_MAX_AGE ? `The grid covers ages ${GRID_MIN_AGE}–${GRID_MAX_AGE}; the nearest row is used.` : undefined },
      { label: '401(k) alongside the cash balance plan', formula: `deferral ${money(LIMITS.deferral)} + catch-up ${money(catchUp(r.age))} + ${percent(EMPLOYER_PCT_WITH_CB * 100, 0)} employer × ${money(Math.min(toNumber(form.comp), LIMITS.compensation))}`, result: money(r.k401WithCb) },
      { label: '401(k) on its own', formula: `§415(c) ${money(LIMITS.dcAnnualAdditions)} + catch-up ${money(catchUp(r.age))}`, result: money(r.k401Only) },
      { label: 'Combined tax rate', formula: `${form.fed}% federal + ${form.state}% state`, result: percent(r.rate * 100, 1) },
      { label: 'Tax saved on the cash balance contribution', formula: `${money(r.cb)} × ${percent(r.rate * 100, 1)}`, result: money(r.taxCb) },
      { label: 'Tax saved on both plans', formula: `(${money(r.k401WithCb)} + ${money(r.cb)}) × ${percent(r.rate * 100, 1)}`, result: money(r.taxAll) },
      ...(r.employeeCost > 0 ? [{ label: 'Employee contributions', formula: `${form.employees} × ${money(toNumber(form.avgPay))} × ${percent(EMPLOYEE_COST_PCT * 100, 1)}`, result: money(r.employeeCost) }] : []),
      { label: 'Net cost of the cash balance, after tax', formula: `${money(r.cb)} − ${money(r.taxCb)}${r.employeeCost > 0 ? ` + ${money(r.employeeCost)} × (1 − ${percent(r.rate * 100, 1)})` : ''}`, result: money(r.netCost) },
      { label: 'Owner outlay for both plans, after tax', formula: `(${money(r.k401WithCb)} + ${money(r.cb)}) × (1 − ${percent(r.rate * 100, 1)})${r.employeeCost > 0 ? ` + ${money(r.employeeCostAfterTax)} employee cost after tax` : ''}`, result: money(r.outlayBoth) },
      { label: `Balance after ${r.n} years, 401(k) + cash balance`, formula: `${money(r.k401WithCb + r.cb)} a year × ((1 + ${form.ret}%)^${r.n} − 1) ÷ ${form.ret}%`, result: money(r.vBoth) },
      { label: `Balance after ${r.n} years, 401(k) only`, formula: `${money(r.k401Only)} a year, same return`, result: money(r.v401) },
      { label: `Balance after ${r.n} years, no plan`, formula: `${money(r.k401Only)} × (1 − ${percent(r.rate * 100, 1)}) a year at ${form.ret}% × (1 − ${percent(TAXABLE_DRAG * 100, 0)} tax drag)`, result: money(r.vNone) },
    ],
    [r, form],
  )

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const compLabel = COMP.find((o) => o.value === form.comp)?.label || money(toNumber(form.comp))
  const offGrid = r.age !== r.gridAge
  const ageEntered = toNumber(form.age)
  const employeeWord = toNumber(form.employees) === 1 ? 'employee' : 'employees'
  const assumptions = [
    `Cash balance contributions are the maximums from Kongruent's ${LIMITS.year} actuarial grid by age (${GRID_MIN_AGE}–${GRID_MAX_AGE}) and considered earnings, subject to the §415(b) limit; pay between grid columns uses the lower column.${offGrid ? ` Age ${r.age} is outside the grid, so the nearest row (age ${r.gridAge}) is used.` : ''}`,
    `The first-year contribution — ${money(r.k401WithCb + r.cb)} combined, ${money(r.k401Only)} in the 401(k)-only path — is held level for all ${r.n} years. In practice the grid amount rises with age, the catch-up changes at 60–63, and the §415(b) limit eventually caps the cash balance account, so this is an illustration of the first-year design, not a funding schedule.`,
    `${LIMITS.year} limits: ${money(LIMITS.compensation)} compensation, ${money(LIMITS.dcAnnualAdditions)} annual additions, ${money(LIMITS.deferral)} deferrals, catch-up ${money(LIMITS.catchUp)} at 50 and ${money(LIMITS.catchUp60)} at 60–63.`,
    `In the combined design, employer 401(k) contributions are 6% of pay (3% safe harbor plus 3% profit sharing), the level typically permitted alongside a cash balance plan. The 401(k)-only scenario uses the full annual additions limit plus catch-up.`,
    `The no-plan scenario invests the after-tax equivalent of the 401(k)-only contribution outside a plan with a ${percent(TAXABLE_DRAG * 100, 0)} annual tax drag on returns.`,
    `Employee cost (${percent(EMPLOYEE_COST_PCT * 100, 1)} of pay) is counted in the combined design only; the safe-harbor cost of a stand-alone 401(k) is not modeled. It is illustrative and excludes plan administration, actuarial fees, PBGC premiums, and prior benefit accruals. The actuary sets the actual required contribution.`,
    'Federal bracket and state rate are applied to the deduction as entered; no other income effects are modeled.',
  ]
  const narrativeText =
    `At ${r.age} on ${money(toNumber(form.comp))} of pay, the ${LIMITS.year} grid allows a ${money(r.cb)} cash balance contribution${offGrid ? ` (nearest grid row, age ${r.gridAge})` : ''}. ` +
    `Paired with ${money(r.k401WithCb)} through the 401(k), the business deducts ${money(r.k401WithCb + r.cb)} a year and saves about ${money(r.taxAll)} in tax at a ${percent(r.rate * 100, 0)} combined rate. ` +
    `Held level for ${r.n} years at ${form.ret}%, that grows to ${money(r.vBoth)}, against ${money(r.v401)} from a 401(k) alone and ${money(r.vNone)} investing the same after-tax dollars outside a plan.` +
    (r.employeeCost > 0 ? ` Covering ${toNumber(form.employees)} ${employeeWord} adds about ${money(r.employeeCost)} a year before tax, ${money(r.employeeCostAfterTax)} after the deduction.` : '')
  const inputs = [
    ['Age', form.age === '' ? `not entered · modeled at ${r.age}` : `${ageEntered} yrs${ageEntered !== r.age ? ` · modeled at ${r.age}` : ''}`],
    ['Plan compensation', compLabel],
    ['Federal tax bracket', `${form.fed}%`],
    ['Years until retirement', `${r.n} years`],
    ['Assumed annual return', `${form.ret}%`],
    ['State income tax rate', `${form.state}%`],
    ['Eligible employees (other than owners)', String(toNumber(form.employees))],
    ['Average employee pay', money(toNumber(form.avgPay))],
  ]
  const milestones = Array.from(new Set([1, ...Array.from({ length: Math.floor(r.n / 5) }, (_, i) => (i + 1) * 5), r.n]))
    .filter((y) => y >= 1 && y <= r.n)
    .sort((a, b) => a - b)
  const tickFmt = (v) => {
    const a = Math.abs(v)
    const s = a >= 1e6 ? `$${(a / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M` : a >= 1000 ? `$${Math.round(a / 1000).toLocaleString('en-US')}k` : money(a)
    return v < 0 ? `−${s}` : s
  }
  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Cash Balance Plan Illustration"
          subtitle="What a cash balance plan adds on top of a 401(k): the contribution, the tax saved, the net cost, and the balance at retirement."
          meta={`Age ${r.age} · ${money(toNumber(form.comp))} pay · ${r.n} years · ${form.ret}% return`}
          metaRight={today}
        />
        <PrintFeature
          label={`Projected balance after ${r.n} years — 401(k) + cash balance`}
          value={money(r.vBoth)}
          note={`vs. ${money(r.v401)} with a 401(k) only · ${money(r.vNone)} with no plan`}
        />
        <PrintTiles
          items={[
            { label: 'Cash balance contribution', value: money(r.cb), note: 'business deduction' },
            { label: 'Tax saved per year', value: money(r.taxAll), note: 'both plans', best: true },
            { label: 'Net cost of cash balance', value: money(r.netCost), note: 'after tax, this year' },
            { label: 'vs. 401(k) only', value: `+${money(r.vBoth - r.v401)}`, note: 'at retirement' },
          ]}
        />
        <PrintSection title="What this means">
          <PrintProse>{narrativeText}</PrintProse>
        </PrintSection>
        <PrintSection title="Projected balance by year" className="pr-chart">
          <LineChart
            xEnd={`Year ${r.n}`}
            format={tickFmt}
            series={[
              { label: '401(k) + cash balance', color: TONE.net, points: r.series.both },
              { label: '401(k) only', color: TONE.accent, points: r.series.k401 },
              { label: 'No plan (taxable)', color: TONE.cost, points: r.series.none },
            ]}
          />
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact={r.employeeCost > 0 || offGrid}>
        <PrintPageHead title="Cash Balance Plan Illustration" right={today} />
        <PrintSection title="This year's contribution and tax" note={`${percent(r.rate * 100, 0)} combined rate`}>
          <PrintRows
            rows={[
              { label: 'Cash balance contribution (business deduction)', value: money(r.cb) },
              { label: '401(k) alongside it (deferral, catch-up, 6% employer)', value: money(r.k401WithCb), sub: true },
              { label: 'Tax saved on the cash balance contribution', value: `−${money(r.taxCb)}` },
              ...(r.employeeCost > 0 ? [{ label: `Employee contributions, after tax (${toNumber(form.employees)} × ${percent(EMPLOYEE_COST_PCT * 100, 1)} of pay, less ${percent(r.rate * 100, 0)} tax saved)`, value: `+${money(r.employeeCostAfterTax)}` }] : []),
              { label: 'Net cost of the cash balance, after tax', value: money(r.netCost), total: true },
              { label: 'Owner outlay for both plans, after tax (adds the 401(k) net of its deduction)', value: money(r.outlayBoth), sub: true },
            ]}
          />
        </PrintSection>
        <PrintSection title="Three paths at retirement" note={`${r.n} years at ${form.ret}% · no plan invests the same after-tax dollars in a taxable account`}>
          <PrintTable
            head={['', 'No plan', '401(k) only', '401(k) + cash balance']}
            widths={['34%', '22%', '22%', '22%']}
            align={['left', 'right', 'right', 'right']}
            rows={[
              ['Plan contribution per year', '$0', money(r.k401Only), money(r.k401WithCb + r.cb)],
              ['Tax saved per year', '$0', money(r.tax401Only), money(r.taxAll)],
              ...(r.employeeCost > 0 ? [['Employee contributions, after tax', '—', '—', money(r.employeeCostAfterTax)]] : []),
              ['Owner outlay per year, after tax', money(r.outlayNone), money(r.outlay401), money(r.outlayBoth)],
              [`Balance after ${r.n} years`, money(r.vNone), money(r.v401), money(r.vBoth)],
              ['Advantage over no plan', '—', `+${money(r.v401 - r.vNone)}`, `+${money(r.vBoth - r.vNone)}`],
            ]}
          />
        </PrintSection>
        <PrintCols>
          <PrintSection title="Balance along the way">
            <PrintTable
              head={['Year', 'No plan', '401(k) only', '401(k) + CB']}
              widths={['16%', '28%', '28%', '28%']}
              rows={milestones.map((y) => [String(y), money(r.series.none[y]), money(r.series.k401[y]), money(r.series.both[y])])}
            />
          </PrintSection>
          <PrintSection title="Plan limits applied" note={`${LIMITS.year}`}>
            <PrintRows
              rows={[
                { label: '401(k) elective deferral', value: money(LIMITS.deferral) },
                { label: `Catch-up at age ${r.age}`, value: money(catchUp(r.age)) },
                { label: `Employer 6% × ${money(Math.min(toNumber(form.comp), LIMITS.compensation))}`, value: money(EMPLOYER_PCT_WITH_CB * Math.min(toNumber(form.comp), LIMITS.compensation)) },
                { label: '401(k) alongside a cash balance plan', value: money(r.k401WithCb), total: true },
                { label: '401(k) on its own (§415(c) + catch-up)', value: money(r.k401Only), sub: true },
              ]}
            />
          </PrintSection>
        </PrintCols>
        <PrintNote title="Reading the result">
          The cash balance contribution is a required, actuarially set amount once the plan is adopted, not a discretionary one, so the owner needs income that can carry it for several years. Employees generally must receive contributions too, which is why the employee count matters more than any other refinement. The 401(k) alongside a cash balance plan is smaller than a 401(k) on its own because employer money is normally held to 6% of pay in the combined design.
        </PrintNote>
        <PrintSection title="Inputs used in this estimate">
          <PrintInputs items={inputs} />
        </PrintSection>
        <PrintSection title="Assumptions">
          <PrintAssumptions items={assumptions} />
        </PrintSection>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="Cash Balance Plan Analyzer"
      subtitle="What a cash balance plan adds on top of a 401(k) for a business owner: the maximum contribution by age and pay from the 2026 actuarial grid, the tax saved, the net cost, and the balance at retirement against a 401(k) alone and no plan at all."
      onReset={() => setForm(DEFAULTS)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="The owner">
            <NumberField label="Age" value={form.age} onChange={set('age')} suffix="yrs" hint={`The ${LIMITS.year} grid covers ages ${GRID_MIN_AGE} to ${GRID_MAX_AGE}; ages outside it use the nearest row.`} />
            <PillField
              label="Plan compensation"
              info="W-2 wages or, for a sole proprietor or partner, net earned income. This sets the cash balance limit; the contribution itself is paid by the business, not from take-home pay."
              value={form.comp}
              onChange={set('comp')}
              options={COMP}
            />
            <PillField label="Federal tax bracket" value={form.fed} onChange={set('fed')} options={BRACKET} />
            <PillField label="Years until retirement" value={form.years} onChange={set('years')} options={YEARS} />
          </Panel>
          <RefinePanel summary="return rate, state tax, employees">
            <div className="field-row">
              <NumberField label="Assumed annual return" value={form.ret} onChange={set('ret')} suffix="%" info="Applied to all three scenarios. Cash balance assets are usually invested near the plan's interest crediting rate, so 4–6% is typical." />
              <NumberField label="State income tax rate" value={form.state} onChange={set('state')} suffix="%" info="New Hampshire has no tax on wages; enter the resident state's top rate for owners elsewhere." />
            </div>
            <div className="field-row">
              <NumberField label="Eligible employees (other than owners)" value={form.employees} onChange={set('employees')} />
              <MoneyField label="Average employee pay" value={form.avgPay} onChange={set('avgPay')} hint={`Employee cost is estimated at ${percent(EMPLOYEE_COST_PCT * 100, 1)} of pay: 3% safe harbor, 3% profit sharing, 2.5% pay credit.`} />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Cash Balance Plan Illustration"
              meta={`Age ${r.age} · ${money(toNumber(form.comp))} pay · ${r.n} years · ${form.ret}% return`}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={`Projected balance after ${r.n} years — 401(k) + cash balance`}
              value={money(r.vBoth)}
              note={`vs. ${money(r.v401)} with a 401(k) only`}
            />
            <StatTiles
              items={[
                { label: 'Cash balance contribution', value: money(r.cb) },
                { label: 'Tax saved per year', value: money(r.taxAll), tone: 'good', note: 'both plans' },
                { label: 'vs. 401(k) only', value: `+${money(r.vBoth - r.v401)}`, note: 'at retirement' },
              ]}
            />
            <div className="result-list">
              <ResultRow label="Cash balance contribution (business deduction)" value={r.cb} />
              <ResultRow label="401(k) alongside it (deferral, catch-up, 6% employer)" value={r.k401WithCb} sub />
              <ResultRow label="Tax saved on the cash balance contribution" value={r.taxCb} positive />
              {r.employeeCost > 0 ? <ResultRow label={`Employee contributions, after tax (${toNumber(form.employees)} × ${percent(EMPLOYEE_COST_PCT * 100, 1)} of pay, less ${percent(r.rate * 100, 0)} tax saved)`} value={r.employeeCostAfterTax} negative /> : null}
              <ResultRow label="Net cost of the cash balance, after tax" value={r.netCost} total />
              <ResultRow label="Owner outlay for both plans, after tax (adds the 401(k) net of its deduction)" value={r.outlayBoth} sub />
            </div>

            <Narrative>{narrativeText}</Narrative>

            <ScenarioCards
              sub="at retirement"
              scenarios={[
                { label: 'No plan', value: money(r.vNone), rows: [{ label: 'Annual contribution', value: '$0' }, { label: 'Tax saved', value: '$0' }] },
                { label: '401(k) only', value: money(r.v401), rows: [{ label: 'Annual contribution', value: money(r.k401Only) }, { label: 'Tax saved', value: money(r.k401Only * r.rate) }] },
                { label: '401(k) + cash balance', value: money(r.vBoth), best: true, rows: [{ label: 'Annual contribution', value: money(r.k401WithCb + r.cb) }, { label: 'Tax saved', value: money(r.taxAll) }] },
              ]}
            />

            <div className="chart-block">
              <LineChart
                xEnd={`Year ${r.n}`}
                format={tickFmt}
                series={[
                  { label: '401(k) + cash balance', color: TONE.net, points: r.series.both },
                  { label: '401(k) only', color: TONE.accent, points: r.series.k401 },
                  { label: 'No plan (taxable)', color: TONE.cost, points: r.series.none },
                ]}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">
        The cash balance contribution is a required, actuarially set amount once the plan is adopted, not a discretionary one, so the owner needs income that can carry it for several years. Employees generally must receive contributions too, which is why the employee count matters more than any other refinement. The 401(k) alongside a cash balance plan is smaller than a 401(k) on its own because employer money is normally held to 6% of pay in the combined design.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
