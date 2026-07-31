import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, MoneyField, ResultRow, Stat, Assumptions, Note, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
import { DonutChart, StackedBar, PALETTE, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'

// Fixed liquidity classification, disclosed in Assumptions.
const ASSETS = [
  { key: 'businessOwnership', label: 'Business ownership', liquid: false },
  { key: 'employerStock', label: 'Employer stock', liquid: true },
  { key: 'individualSecurities', label: 'Individual securities', liquid: true },
  { key: 'realEstate', label: 'Real estate', liquid: false },
  { key: 'cryptocurrency', label: 'Cryptocurrency', liquid: true },
  { key: 'deferredComp', label: 'Deferred compensation', liquid: false },
]

const INCOME = [
  { key: 'employmentIncome', label: 'Employment income' },
  { key: 'businessIncome', label: 'Business income' },
  { key: 'investmentIncome', label: 'Investment income' },
  { key: 'otherIncome', label: 'Other income' },
]

const BLANK = {
  businessOwnership: '',
  employerStock: '',
  individualSecurities: '',
  realEstate: '',
  cryptocurrency: '',
  deferredComp: '',
  employmentIncome: '',
  businessIncome: '',
  investmentIncome: '',
  otherIncome: '',
}

const SAMPLE = {
  businessOwnership: '4000000',
  employerStock: '200000',
  individualSecurities: '600000',
  realEstate: '1200000',
  cryptocurrency: '100000',
  deferredComp: '300000',
  employmentIncome: '0',
  businessIncome: '800000',
  investmentIncome: '60000',
  otherIncome: '0',
}

function compute(form) {
  const assetVals = ASSETS.map((a) => ({ ...a, value: toNumber(form[a.key]) }))
  const totalAssets = assetVals.reduce((s, a) => s + a.value, 0)
  const sortedAssets = [...assetVals].sort((a, b) => b.value - a.value)
  const largest = sortedAssets[0] || { label: '—', value: 0 }
  const largestPct = totalAssets > 0 ? (largest.value / totalAssets) * 100 : 0

  const liquid = assetVals.filter((a) => a.liquid).reduce((s, a) => s + a.value, 0)
  const illiquid = totalAssets - liquid
  const liquidPct = totalAssets > 0 ? (liquid / totalAssets) * 100 : 0
  const illiquidPct = totalAssets > 0 ? (illiquid / totalAssets) * 100 : 0

  const incomeVals = INCOME.map((i) => ({ ...i, value: toNumber(form[i.key]) }))
  const totalIncome = incomeVals.reduce((s, i) => s + i.value, 0)
  const sortedIncome = [...incomeVals].sort((a, b) => b.value - a.value)
  const largestIncome = sortedIncome[0] || { label: '—', value: 0 }
  const incomeDependencePct = totalIncome > 0 ? (largestIncome.value / totalIncome) * 100 : 0

  // Shock: a 50% decline in the single largest asset.
  const shockLoss = largest.value * 0.5
  const shockPctOfNetWorth = totalAssets > 0 ? (shockLoss / totalAssets) * 100 : 0

  return {
    assetVals,
    totalAssets,
    largest,
    largestPct,
    liquid,
    illiquid,
    liquidPct,
    illiquidPct,
    incomeVals,
    totalIncome,
    largestIncome,
    incomeDependencePct,
    shockLoss,
    shockPctOfNetWorth,
  }
}

export default function ConcentratedWealth() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  return (
    <ToolShell
      title="Concentrated Wealth Exposure Analyzer"
      subtitle="Illustrate concentration using straightforward arithmetic — how much of your wealth and income rests on a single source, how much is liquid, and how a simple shock would affect your net worth."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Assets">
            {ASSETS.map((a) => (
              <MoneyField key={a.key} label={a.label} value={form[a.key]} onChange={set(a.key)} />
            ))}
          </Panel>
          <Panel title="Income by Source">
            {INCOME.map((i) => (
              <MoneyField key={i.key} label={i.label} value={form[i.key]} onChange={set(i.key)} />
            ))}
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Concentration Summary"
              meta="Exposure snapshot"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="1 · Largest asset as a share of net worth"
              value={percent(r.largestPct)}
              note={r.largest.value > 0 ? `${r.largest.label} · ${money(r.largest.value)}` : 'Enter assets to begin'}
            />

            <Narrative>
              The largest single holding{r.largest.value > 0 ? ` (${r.largest.label})` : ''}{' '}
              represents {percent(r.largestPct)} of a {money(r.totalAssets)} net
              worth, of which {percent(r.illiquidPct)} is illiquid. Income
              dependence on a single source is {percent(r.incomeDependencePct)}. A
              hypothetical 50% decline in the largest asset would reduce net worth
              by approximately {percent(r.shockPctOfNetWorth)} ({money(r.shockLoss)}).
            </Narrative>
            <div className="stat-grid" style={{ marginBottom: 4 }}>
              <Stat
                label="2 · Income dependence"
                value={percent(r.incomeDependencePct)}
                note={`${r.largestIncome.label} · ${money(r.largestIncome.value)}`}
              />
            </div>

            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginTop: 16, fontFamily: 'var(--font-sans)' }}>
              3 · Liquid vs. illiquid net worth
            </h3>
            <div className="result-list" style={{ marginBottom: 16 }}>
              <ResultRow label="Liquid net worth" value={r.liquid} raw={`${money(r.liquid)} · ${percent(r.liquidPct)}`} />
              <ResultRow label="Illiquid net worth" value={r.illiquid} raw={`${money(r.illiquid)} · ${percent(r.illiquidPct)}`} />
              <ResultRow label="Total net worth" value={r.totalAssets} total />
            </div>
            <StackedBar
              data={[
                { label: 'Liquid', value: r.liquid, color: TONE.net },
                { label: 'Illiquid', value: r.illiquid, color: TONE.cost },
              ]}
            />
          </section>

          <Panel title="4 · Shock Scenario">
            <div className="stat-grid">
              <Stat label="Loss from shock" value={money(r.shockLoss)} note={`50% of ${r.largest.label}`} />
              <Stat label="Reduction in net worth" value={percent(r.shockPctOfNetWorth)} />
            </div>
            <Note>
              A 50% decline in your largest asset
              {r.largest.value > 0 ? ` (${r.largest.label})` : ''} would reduce
              your net worth by approximately{' '}
              <strong>{percent(r.shockPctOfNetWorth)}</strong>
              {r.shockLoss > 0 ? ` (${money(r.shockLoss)})` : ''}.
            </Note>
          </Panel>

          <Panel title="Asset Composition">
            <DonutChart
              centerValue={percent(r.largestPct)}
              centerLabel="Largest holding"
              data={r.assetVals
                .filter((a) => a.value > 0)
                .sort((a, b) => b.value - a.value)
                .map((a, i) => ({ label: a.label, value: a.value, color: PALETTE[i % PALETTE.length] }))}
            />
          </Panel>
        </div>
      </div>

      <Assumptions
        items={[
          'All figures are simple arithmetic based on the values entered. No forecasting or probability modeling is performed.',
          'Liquidity is classified as follows — Liquid: employer stock, individual securities, cryptocurrency. Illiquid: business ownership, real estate, deferred compensation.',
          'Net worth here equals total assets entered; this tool does not incorporate liabilities.',
          'The shock scenario applies a hypothetical one-time 50% decline to the single largest asset. It is an illustration, not a prediction.',
          'This tool presents no scores, ratings, or recommendations of any kind.',
        ]}
      />
    </ToolShell>
  )
}
