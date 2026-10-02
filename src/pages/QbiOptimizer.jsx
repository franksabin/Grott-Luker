import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  SegmentedField,
  RefinePanel,
  StatTiles,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { marginalOrdinaryRate, QBI_THRESHOLDS, QBI_MINIMUM, TAX_YEAR } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const YESNO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

// W-2 wages and UBIA live in the refine panel, so they carry a default of 0.
const BLANK = {
  qbi: '',
  w2wages: '0',
  ubia: '0',
  taxableIncome: '',
  filing: 'married',
  sstb: 'no',
}

const SAMPLE = {
  qbi: '400000',
  w2wages: '120000',
  ubia: '200000',
  taxableIncome: '450000',
  filing: 'married',
  sstb: 'no',
}

function compute(form) {
  const qbi = toNumber(form.qbi)
  const w2 = toNumber(form.w2wages)
  const ubia = toNumber(form.ubia)
  const taxableIncome = toNumber(form.taxableIncome)
  const filing = form.filing
  const isSSTB = form.sstb === 'yes'
  const { start, end } = QBI_THRESHOLDS[filing === 'single' ? 'single' : 'married']

  const twentyPct = 0.2 * Math.max(0, qbi)
  const incomeLimit = 0.2 * Math.max(0, taxableIncome)

  // Wage/property limit (the greater of the two tests).
  const wageLimit = Math.max(0.5 * w2, 0.25 * w2 + 0.025 * ubia)

  let deduction
  let phase // 'below' | 'phasein' | 'above'
  let limitBinds = 'none'
  // Share of the 20%-of-QBI shortfall below the wage limit that is lost in the phase-in (0–1).
  let ratio = 0
  // QBI that counts as coming from a qualified trade or business (for the §199A(i) minimum).
  let activeQbi = Math.max(0, qbi)

  if (taxableIncome <= start) {
    // Below threshold: full 20%, no wage limit, SSTB allowed.
    phase = 'below'
    deduction = Math.min(twentyPct, incomeLimit)
    if (incomeLimit < twentyPct) limitBinds = 'taxable income'
  } else if (taxableIncome >= end) {
    // Above threshold.
    phase = 'above'
    if (isSSTB) {
      // An SSTB above the range is not a qualified trade or business: no QBI, no deduction.
      deduction = 0
      activeQbi = 0
      limitBinds = 'SSTB (fully phased out)'
    } else {
      deduction = Math.min(twentyPct, wageLimit, incomeLimit)
      if (deduction === wageLimit && wageLimit < twentyPct) limitBinds = 'W-2 wage / property'
      else if (deduction === incomeLimit && incomeLimit < twentyPct) limitBinds = 'taxable income'
    }
  } else {
    // Phase-in range.
    phase = 'phasein'
    ratio = (taxableIncome - start) / (end - start)
    if (isSSTB) {
      // SSTB: both QBI and wage figures reduced by the applicable percentage (1 - ratio).
      const applicable = 1 - ratio
      const adjQbi = twentyPct * applicable
      const adjWageLimit = wageLimit * applicable
      const reduction = Math.max(0, adjQbi - adjWageLimit) * ratio
      const afterPhaseOut = adjQbi - reduction
      deduction = Math.min(afterPhaseOut, incomeLimit)
      activeQbi = Math.max(0, qbi) * applicable
      limitBinds = incomeLimit < afterPhaseOut ? 'taxable income' : 'SSTB phase-out'
    } else {
      const excessOverWage = Math.max(0, twentyPct - wageLimit)
      const reduction = excessOverWage * ratio
      const afterPhaseIn = twentyPct - reduction
      deduction = Math.min(afterPhaseIn, incomeLimit)
      // Name whichever limit actually produced the number: the cap can bind even inside the phase-in.
      if (incomeLimit < afterPhaseIn) limitBinds = 'taxable income'
      else if (reduction > 0) limitBinds = 'W-2 wage / property (phasing in)'
    }
  }

  deduction = Math.max(0, deduction)
  // §199A(i) minimum deduction (2026+): $400 when QBI from active qualified trades or businesses
  // is at least $1,000. An SSTB above the range has no qualified QBI; inside the phase-in only the
  // applicable percentage of its QBI counts.
  const minimumApplies = activeQbi >= QBI_MINIMUM.activeQbi && deduction < QBI_MINIMUM.deduction
  if (minimumApplies) {
    deduction = QBI_MINIMUM.deduction
    limitBinds = '§199A(i) $400 minimum'
  }
  const marginal = marginalOrdinaryRate(Math.max(0, taxableIncome - deduction), filing)
  const taxSavings = deduction * marginal

  return {
    qbi,
    twentyPct,
    wageLimit,
    incomeLimit,
    deduction,
    phase,
    ratio,
    activeQbi,
    limitBinds,
    isSSTB,
    marginal,
    taxSavings,
    start,
    end,
    taxableIncome,
    minimumApplies,
  }
}

const PHASE_LABEL = {
  below: 'Below the threshold — full deduction available',
  phasein: 'In the phase-in range — limitations partially apply',
  above: 'Above the threshold — full limitations apply',
}

// One phrase per limitBinds value, used by the screen narrative, the print rows and the print table
// so the same label never reads two different ways. Each reads naturally after "the".
const BIND_PHRASE = {
  'taxable income': '20%-of-taxable-income cap binds',
  'W-2 wage / property': 'W-2 wage / property limit binds',
  'W-2 wage / property (phasing in)': 'phased-in W-2 wage / property limit binds',
  'SSTB phase-out': 'SSTB phase-out reduces it',
  'SSTB (fully phased out)': 'SSTB phase-out eliminates it',
  '§199A(i) $400 minimum': '§199A(i) $400 minimum applies',
}
const bindClause = (key) => (key === 'none' ? '' : `; the ${BIND_PHRASE[key]}`)
const bindLabel = (key) => (key === 'none' ? 'no limit binds' : BIND_PHRASE[key])

export default function QbiOptimizer() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: '20% of qualified business income', formula: `20% × ${money(r.qbi, 2)}`, result: money(r.twentyPct, 2) },
    { label: 'W-2 wage / property limit', formula: `greater of 50% × W-2 wages, or 25% × W-2 wages + 2.5% × UBIA`, result: money(r.wageLimit, 2) },
    { label: 'Taxable-income limit', formula: `20% × taxable income ${money(r.taxableIncome, 2)}`, result: money(r.incomeLimit, 2) },
    { label: 'Threshold test', formula: `taxable income vs. ${money(r.start)} threshold and ${money(r.end)} end of phase-in (${r.isSSTB ? 'SSTB' : 'non-SSTB'})`, result: r.phase === 'below' ? 'below threshold' : r.phase === 'above' ? 'above phase-in' : `${percent(((r.taxableIncome - r.start) / (r.end - r.start)) * 100, 0)} through phase-in` },
    { label: 'QBI deduction', formula: r.phase === 'below' ? 'lesser of 20% QBI and taxable-income limit' : r.phase === 'above' ? (r.isSSTB ? 'SSTB fully phased out' : 'lesser of 20% QBI, wage/property limit, taxable-income limit') : 'wage limit (and SSTB reduction) phased in proportionally', result: money(r.deduction, 2), note: r.limitBinds !== 'none' ? `Binding limit: ${r.limitBinds}.` : 'No limit binds.' },
    ...(r.minimumApplies ? [{ label: 'Minimum deduction', formula: `active QBI ${money(r.qbi)} ≥ ${money(QBI_MINIMUM.activeQbi)} → floor of ${money(QBI_MINIMUM.deduction)}`, result: money(r.deduction, 2) }] : []),
    { label: 'Marginal rate after deduction', formula: `${TAX_YEAR} bracket at taxable income − deduction`, result: percent(r.marginal * 100, 0) },
    { label: 'Estimated tax savings', formula: `${money(r.deduction, 2)} × ${percent(r.marginal * 100, 0)}`, result: money(r.taxSavings, 2) },
  ], [r])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const filingLabel = form.filing === 'single' ? 'Single' : 'Married filing jointly'
  const phaseInPct = r.phase === 'phasein' ? percent(((r.taxableIncome - r.start) / (r.end - r.start)) * 100, 0) : null
  const positionLabel = r.phase === 'below' ? 'Below the threshold' : r.phase === 'above' ? 'Above the end of the phase-in' : `${phaseInPct} of the way through the phase-in`
  // Shortfall of the wage / property limit below 20% of QBI — the amount the phase-in works on.
  const wageShortfall = Math.max(0, r.twentyPct - r.wageLimit)
  const wageTestApplies = r.phase === 'below'
    ? 'Not applied — taxable income is below the threshold'
    : r.phase === 'above'
      ? (r.isSSTB
        ? 'Moot — an SSTB above the range has no deduction'
        : wageShortfall > 0 ? 'Applies in full — below 20% of QBI' : 'Not limiting — exceeds 20% of QBI')
      : (r.isSSTB
        ? `Phasing in — ${phaseInPct} through the SSTB phase-out`
        : wageShortfall > 0 ? `Phasing in — ${phaseInPct} of the ${money(wageShortfall)} shortfall is lost` : 'Not limiting — exceeds 20% of QBI, so nothing phases in')
  const sstbEffect = r.phase === 'below'
    ? 'No effect below the threshold'
    : r.phase === 'above'
      ? 'Not a qualified trade or business above the range — no QBI'
      : 'QBI and wage limit cut by the applicable percentage'
  // The two wage/property sub-tests, shown so the reader can see which one produced r.wageLimit.
  const w2Print = toNumber(form.w2wages)
  const ubiaPrint = toNumber(form.ubia)
  const wageTestA = 0.5 * w2Print
  const wageTestB = 0.25 * w2Print + 0.025 * ubiaPrint
  const winningTest = r.wageLimit <= 0 ? 'no wages or UBIA entered' : wageTestA >= wageTestB ? '50% of W-2 wages' : '25% of wages + 2.5% of UBIA'
  const inputs = [
    ['Qualified business income', money(r.qbi)],
    ['Taxable income (before QBI)', money(r.taxableIncome)],
    ['Filing status', filingLabel],
    ['Specified service business?', r.isSSTB ? 'Yes' : 'No'],
    ['W-2 wages paid by the business', money(toNumber(form.w2wages))],
    ['Qualified property (UBIA)', money(toNumber(form.ubia))],
  ]
  const assumptions = [
    'Uses 2026 Section 199A taxable-income thresholds ($201,750 single / $403,500 married, with $75k / $150k phase-in ranges per Rev. Proc. 2025-32).',
    'Below the threshold, the deduction is 20% of QBI capped at 20% of taxable income. Above it, the greater of the two W-2 wage/property tests applies, and SSTBs lose the deduction entirely.',
    'The 2025 tax law made §199A permanent, widened the phase-in range to $75k / $150k, and added a $400 minimum deduction when QBI from active qualified trades or businesses is at least $1,000. The tool assumes the QBI is from an active business and applies the minimum only to qualified QBI: an SSTB above the range is not a qualified trade or business (§199A(d)(1)) and gets no minimum, and inside the phase-in only the applicable percentage of SSTB income counts.',
    'The phase-in range applies a simplified proportional reduction; the actual computation is done per-business and can be more nuanced.',
    'Net capital gains reduce the taxable-income cap in practice; this tool uses taxable income as entered.',
    'Tax savings apply the estimated marginal ordinary rate to the deduction and are illustrative.',
  ]
  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="QBI Deduction Estimate"
          subtitle="The §199A deduction after the income threshold, wage and property limits, and any SSTB phase-out."
          meta={`Section 199A · ${TAX_YEAR} · ${filingLabel} · ${r.isSSTB ? 'Specified service business' : 'Not a specified service business'}`}
          metaRight={today}
        />
        <PrintFeature
          label="Estimated QBI deduction"
          value={money(r.deduction)}
          note={`Estimated tax savings of ${money(r.taxSavings)} at a ${percent(r.marginal * 100, 0)} marginal rate`}
        />
        <PrintTiles
          items={[
            { label: 'Full 20% of QBI', value: money(r.twentyPct), note: 'before limits' },
            { label: 'W-2 wage / property limit', value: money(r.wageLimit), note: winningTest },
            { label: '20% of taxable income', value: money(r.incomeLimit), note: 'overall cap' },
            { label: 'Estimated tax savings', value: money(r.taxSavings), note: `${percent(r.marginal * 100, 0)} marginal rate`, best: r.taxSavings > 0 },
          ]}
        />
        <PrintSection title="How the deduction is limited" note={PHASE_LABEL[r.phase]}>
          <PrintRows
            rows={[
              { label: '20% of qualified business income', value: money(r.twentyPct) },
              { label: 'W-2 wage / property limit — greater of 50% of wages, or 25% of wages plus 2.5% of UBIA', value: money(r.wageLimit), sub: true },
              { label: '20% of taxable income (overall cap)', value: money(r.incomeLimit), sub: true },
              { label: `Estimated QBI deduction — ${bindLabel(r.limitBinds)}`, value: money(r.deduction), total: true },
              { label: `Estimated tax savings at a ${percent(r.marginal * 100, 0)} marginal rate`, value: money(r.taxSavings), sub: true },
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>
            At {money(r.taxableIncome)} of taxable income, this is{' '}
            {PHASE_LABEL[r.phase].toLowerCase()}. The full 20% of QBI would be{' '}
            {money(r.twentyPct)}; after applying the relevant limits, the
            estimated deduction is {money(r.deduction)}{bindClause(r.limitBinds)}. That
            is worth about {money(r.taxSavings)} in tax at the current marginal rate.
          </PrintProse>
        </PrintSection>
        <PrintSection title="Full 20% vs. limited deduction" className="pr-chart">
          {r.twentyPct > 0 ? (
            /* BarCompare draws its group labels below the fixed-height plot; give them room. */
            <div style={{ paddingBottom: 26 }}>
              <BarCompare
                height={230}
                legend={false}
                groups={[
                  { label: 'Unlimited 20% of QBI', bars: [{ label: 'Full 20%', value: r.twentyPct, color: TONE.cost }] },
                  { label: 'Your estimated deduction', bars: [{ label: 'Estimated', value: r.deduction, color: TONE.net }] },
                ]}
              />
            </div>
          ) : (
            <PrintProse>
              No qualified business income was entered, so there is nothing to compare yet. Enter the
              business's net qualified income and taxable income to see the full 20% against the limited deduction.
            </PrintProse>
          )}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last>
        <PrintPageHead title="QBI Deduction Estimate" right={today} />
        <PrintSection title="The three tests behind the number">
          <PrintTable
            head={['Test', 'How it is computed', 'Amount', 'How it applies here']}
            widths={['17%', '35%', '13%', '35%']}
            rows={[
              ['20% of QBI', `20% × ${money(r.qbi)} of qualified business income`, money(r.twentyPct), 'Starting point before any limit'],
              ['W-2 wage / property', `Greater of 50% × ${money(w2Print)} wages = ${money(wageTestA)}, or 25% × wages + 2.5% × ${money(ubiaPrint)} UBIA = ${money(wageTestB)}`, money(r.wageLimit), wageTestApplies],
              ['Taxable-income cap', `20% × ${money(r.taxableIncome)} taxable income before the deduction`, money(r.incomeLimit), 'Always applies as the overall ceiling'],
              ...(r.isSSTB ? [['SSTB status', 'Specified service trade or business', '—', sstbEffect]] : []),
              ...(r.minimumApplies ? [['§199A(i) minimum', `Qualified QBI of ${money(r.activeQbi)} is at least ${money(QBI_MINIMUM.activeQbi)}`, money(QBI_MINIMUM.deduction), 'Floor applied — computed amount was lower']] : []),
              ['Estimated deduction', r.limitBinds === 'none' ? 'No limit binds' : `The ${BIND_PHRASE[r.limitBinds]}`, money(r.deduction), `Worth about ${money(r.taxSavings)} at a ${percent(r.marginal * 100, 0)} marginal rate`],
            ]}
          />
        </PrintSection>
        <PrintCols>
          <PrintSection title="Where this income sits" note={filingLabel}>
            <PrintRows
              rows={[
                { label: 'Threshold — limits begin', value: money(r.start) },
                { label: 'End of the phase-in range', value: money(r.end) },
                { label: 'Taxable income before QBI', value: money(r.taxableIncome), total: true },
                { label: 'Position', value: positionLabel, sub: true },
              ]}
            />
          </PrintSection>
          <PrintSection title="Taxable income against the phase-in range" className="pr-chart">
            <div style={{ paddingBottom: 22 }}>
              <BarCompare
                height={140}
                legend={false}
                groups={[
                  { label: 'Threshold', bars: [{ label: 'Threshold', value: r.start, color: TONE.cost }] },
                  { label: 'Taxable income', bars: [{ label: 'Taxable income', value: r.taxableIncome, color: r.phase === 'below' ? TONE.net : r.phase === 'above' ? TONE.tax : TONE.accent }] },
                  { label: 'End of phase-in', bars: [{ label: 'End of phase-in', value: r.end, color: TONE.debt }] },
                ]}
              />
            </div>
          </PrintSection>
        </PrintCols>
        <PrintSection title="How the three income bands work" note={`${filingLabel} · taxable income before the deduction`}>
          <PrintTable
            head={['Band', 'Taxable income', 'Business that is not an SSTB', 'Specified service business']}
            widths={['22%', '20%', '29%', '29%']}
            rows={[
              [r.phase === 'below' ? 'Below the threshold (this estimate)' : 'Below the threshold', `Up to ${money(r.start)}`, 'Full 20% of QBI, capped only at 20% of taxable income', 'Same — SSTB status has no effect'],
              [r.phase === 'phasein' ? 'Phase-in range (this estimate)' : 'Phase-in range', `${money(r.start)} – ${money(r.end)}`, 'The W-2 wage / property limit is phased in proportionally', 'QBI and the wage limit both shrink by the applicable percentage'],
              [r.phase === 'above' ? 'Above the range (this estimate)' : 'Above the range', `Over ${money(r.end)}`, 'Lesser of 20% of QBI, the wage / property limit, and the cap', 'No deduction — not a qualified trade or business'],
            ]}
          />
        </PrintSection>
        <PrintNote title="Reading the result">
          Near the thresholds ({money(r.start)}–{money(r.end)} of taxable income for this filing status), small moves — retirement contributions, timing income, or increasing <span style={{ whiteSpace: 'nowrap' }}>W-2 wages</span> — can meaningfully change the deduction. That is where a CPA adds the most value.
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
      title="QBI Deduction Optimizer"
      subtitle="Estimate the Section 199A qualified business income deduction — including the taxable-income thresholds, the W-2 wage and property limitations, and the specified-service (SSTB) phase-out that reduce it at higher incomes."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Business & Income">
            <MoneyField
              label="Qualified business income"
              value={form.qbi}
              onChange={set('qbi')}
              info="Net qualified income from the business (generally net profit, with some adjustments)."
            />
            <MoneyField
              label="Taxable income (before QBI)"
              value={form.taxableIncome}
              onChange={set('taxableIncome')}
              info="Total taxable income before the QBI deduction. This determines whether the limitations apply."
            />
            <div className="field-row">
              <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
              <SegmentedField
                label="Specified service business?"
                value={form.sstb}
                onChange={set('sstb')}
                options={YESNO}
                info="SSTBs (law, accounting, consulting, health, financial services, etc.) lose the deduction entirely above the upper threshold."
              />
            </div>
          </Panel>
          <RefinePanel summary="W-2 wages, qualified property">
            <MoneyField
              label="W-2 wages paid by the business"
              value={form.w2wages}
              onChange={set('w2wages')}
              info="Total W-2 wages the business pays. Above the threshold, the deduction is limited to 50% of wages (or 25% of wages plus 2.5% of property)."
            />
            <MoneyField
              label="Qualified property (UBIA)"
              value={form.ubia}
              onChange={set('ubia')}
              info="Unadjusted basis of qualified business property. Used in the alternative wage/property limit test."
            />
          </RefinePanel>
          <Note title="Why planning matters here">
            Near the thresholds ({money(r.start)}–{money(r.end)} of taxable income
            for this filing status), small moves — retirement contributions,
            timing income, or increasing W-2 wages — can meaningfully change the
            deduction. That is where a CPA adds the most value.
          </Note>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="QBI Deduction Estimate"
              meta="Section 199A"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Estimated QBI deduction"
              value={money(r.deduction)}
              note={`Estimated tax savings of ${money(r.taxSavings)} at a ${percent(r.marginal * 100, 0)} marginal rate`}
            />
            <StatTiles
              items={[
                { label: 'Full 20% of QBI', value: money(r.twentyPct), note: 'before limits' },
                { label: 'W-2 wage / property limit', value: money(r.wageLimit) },
                { label: 'Estimated tax savings', value: money(r.taxSavings), tone: 'good', note: `${percent(r.marginal * 100, 0)} marginal rate` },
              ]}
            />
            <div className="result-list">
              <ResultRow label="20% of qualified business income" value={r.twentyPct} />
              <ResultRow label="W-2 wage / property limit" value={r.wageLimit} sub info="The greater of 50% of W-2 wages, or 25% of wages plus 2.5% of qualified property." />
              <ResultRow label="20% of taxable income (overall cap)" value={r.incomeLimit} sub />
              <ResultRow label="Estimated QBI deduction" value={r.deduction} total positive />
              <ResultRow label="Estimated tax savings" value={r.taxSavings} sub positive />
            </div>

            <Narrative>
              At {money(r.taxableIncome)} of taxable income, this is{' '}
              {PHASE_LABEL[r.phase].toLowerCase()}. The full 20% of QBI would be{' '}
              {money(r.twentyPct)}; after applying the relevant limits, the
              estimated deduction is {money(r.deduction)}{bindClause(r.limitBinds)}. That
              is worth about {money(r.taxSavings)} in tax at the current marginal rate.
            </Narrative>

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Full 20% vs. limited deduction
              </div>
              <BarCompare
                groups={[
                  { label: 'Unlimited 20%', bars: [{ label: 'Full 20%', value: r.twentyPct, color: TONE.cost }] },
                  { label: 'Your estimate', bars: [{ label: 'Estimated', value: r.deduction, color: TONE.net }] },
                ]}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
