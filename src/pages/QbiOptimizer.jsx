import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  SegmentedField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { marginalOrdinaryRate, QBI_THRESHOLDS } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const YESNO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

const BLANK = {
  qbi: '',
  w2wages: '',
  ubia: '',
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

  if (taxableIncome <= start) {
    // Below threshold: full 20%, no wage limit, SSTB allowed.
    phase = 'below'
    deduction = Math.min(twentyPct, incomeLimit)
    if (deduction === incomeLimit && incomeLimit < twentyPct) limitBinds = 'taxable income'
  } else if (taxableIncome >= end) {
    // Above threshold.
    phase = 'above'
    if (isSSTB) {
      deduction = 0
      limitBinds = 'SSTB (fully phased out)'
    } else {
      deduction = Math.min(twentyPct, wageLimit, incomeLimit)
      if (deduction === wageLimit && wageLimit < twentyPct) limitBinds = 'W-2 wage / property'
      else if (deduction === incomeLimit && incomeLimit < twentyPct) limitBinds = 'taxable income'
    }
  } else {
    // Phase-in range.
    phase = 'phasein'
    const ratio = (taxableIncome - start) / (end - start)
    if (isSSTB) {
      // SSTB: both QBI and wage figures reduced by the applicable percentage (1 - ratio).
      const applicable = 1 - ratio
      const adjQbi = twentyPct * applicable
      const adjWageLimit = wageLimit * applicable
      const reduction = Math.max(0, adjQbi - adjWageLimit) * ratio
      deduction = Math.min(adjQbi - reduction, incomeLimit)
      limitBinds = 'SSTB phase-out'
    } else {
      const excessOverWage = Math.max(0, twentyPct - wageLimit)
      const reduction = excessOverWage * ratio
      deduction = Math.min(twentyPct - reduction, incomeLimit)
      if (reduction > 0) limitBinds = 'W-2 wage / property (phasing in)'
    }
  }

  deduction = Math.max(0, deduction)
  const marginal = marginalOrdinaryRate(Math.max(0, taxableIncome - deduction), filing)
  const taxSavings = deduction * marginal

  return {
    qbi,
    twentyPct,
    wageLimit,
    incomeLimit,
    deduction,
    phase,
    limitBinds,
    isSSTB,
    marginal,
    taxSavings,
    start,
    end,
    taxableIncome,
  }
}

const PHASE_LABEL = {
  below: 'Below the threshold — full deduction available',
  phasein: 'In the phase-in range — limitations partially apply',
  above: 'Above the threshold — full limitations apply',
}

export default function QbiOptimizer() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  return (
    <ToolShell
      title="QBI Deduction Optimizer"
      subtitle="Estimate the Section 199A qualified business income deduction — including the taxable-income thresholds, the W-2 wage and property limitations, and the specified-service (SSTB) phase-out that reduce it at higher incomes."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
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
            <Narrative>
              At {money(r.taxableIncome)} of taxable income, this is{' '}
              {PHASE_LABEL[r.phase].toLowerCase()}. The full 20% of QBI would be{' '}
              {money(r.twentyPct)}; after applying the relevant limits, the
              estimated deduction is {money(r.deduction)}
              {r.limitBinds !== 'none' ? `, with the ${r.limitBinds} limit binding` : ''}. That
              is worth about {money(r.taxSavings)} in tax at the current marginal rate.
            </Narrative>

            <div className="result-list">
              <ResultRow label="20% of qualified business income" value={r.twentyPct} />
              <ResultRow label="W-2 wage / property limit" value={r.wageLimit} sub info="The greater of 50% of W-2 wages, or 25% of wages plus 2.5% of qualified property." />
              <ResultRow label="20% of taxable income (overall cap)" value={r.incomeLimit} sub />
              <ResultRow label="Estimated QBI deduction" value={r.deduction} total positive />
              <ResultRow label="Estimated tax savings" value={r.taxSavings} sub positive />
            </div>

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

      <Assumptions
        items={[
          'Uses 2025 Section 199A taxable-income thresholds ($197,300 single / $394,600 married, with $50k / $100k phase-in ranges).',
          'Below the threshold, the deduction is 20% of QBI capped at 20% of taxable income. Above it, the greater of the two W-2 wage/property tests applies, and SSTBs lose the deduction entirely.',
          'The phase-in range applies a simplified proportional reduction; the actual computation is done per-business and can be more nuanced.',
          'Net capital gains reduce the taxable-income cap in practice; this tool uses taxable income as entered.',
          'Tax savings apply the estimated marginal ordinary rate to the deduction and are illustrative.',
        ]}
      />
    </ToolShell>
  )
}
