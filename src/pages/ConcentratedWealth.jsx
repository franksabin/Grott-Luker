import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, MoneyField, ResultRow, StatTiles, Assumptions, Note, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
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
  const steps = useMemo(() => [
    { label: 'Total assets', formula: r.assetVals.filter((a) => a.value > 0).map((a) => `${a.label} ${money(a.value)}`).join(' + ') || 'no assets entered', result: money(r.totalAssets, 2) },
    { label: 'Largest single asset', formula: `${r.largest.label} ÷ total`, result: `${percent(r.largestPct, 1)} (${money(r.largest.value)})` },
    { label: 'Liquid assets', formula: 'employer stock + individual securities + cryptocurrency', result: `${money(r.liquid, 2)} (${percent(r.liquidPct, 1)})` },
    { label: 'Illiquid assets', formula: 'business + real estate + deferred compensation', result: `${money(r.illiquid, 2)} (${percent(r.illiquidPct, 1)})` },
    { label: 'Total income', formula: r.incomeVals.filter((i) => i.value > 0).map((i) => `${i.label} ${money(i.value)}`).join(' + ') || 'no income entered', result: money(r.totalIncome, 2) },
    { label: 'Income dependence', formula: `${r.largestIncome.label} ÷ total income`, result: percent(r.incomeDependencePct, 1) },
    { label: 'Shock test', formula: `50% × ${r.largest.label} ${money(r.largest.value)}`, result: `${money(r.shockLoss, 2)} (${percent(r.shockPctOfNetWorth, 1)} of assets)` },
  ], [r])

  return (
    <ToolShell
      title="Concentrated Wealth Exposure Analyzer"
      subtitle="Illustrate concentration using straightforward arithmetic — how much of your wealth and income rests on a single source, how much is liquid, and how a simple shock would affect your net worth."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
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
              label="Largest asset as a share of net worth"
              value={percent(r.largestPct)}
              note={r.largest.value > 0 ? `${r.largest.label} · ${money(r.largest.value)}` : 'Enter assets to begin'}
            />
            <StatTiles
              items={[
                { label: 'Income dependence', value: percent(r.incomeDependencePct), note: `${r.largestIncome.label} · ${money(r.largestIncome.value)}` },
                { label: 'Illiquid share', value: percent(r.illiquidPct), note: money(r.illiquid) },
                { label: 'Loss in a 50% shock', value: money(r.shockLoss), tone: 'bad', note: `${percent(r.shockPctOfNetWorth)} of net worth` },
              ]}
            />
            <div className="result-list">
              <ResultRow label="Liquid net worth" value={r.liquid} raw={`${money(r.liquid)} · ${percent(r.liquidPct)}`} />
              <ResultRow label="Illiquid net worth" value={r.illiquid} raw={`${money(r.illiquid)} · ${percent(r.illiquidPct)}`} />
              <ResultRow label="Total net worth" value={r.totalAssets} total />
            </div>

            <Narrative>
              The largest single holding{r.largest.value > 0 ? ` (${r.largest.label})` : ''}{' '}
              represents {percent(r.largestPct)} of a {money(r.totalAssets)} net
              worth, of which {percent(r.illiquidPct)} is illiquid. Income
              dependence on a single source is {percent(r.incomeDependencePct)}. A
              hypothetical 50% decline in the largest asset would reduce net worth
              by approximately {percent(r.shockPctOfNetWorth)} ({money(r.shockLoss)}).
            </Narrative>

            <div className="chart-block">
              <StackedBar
                data={[
                  { label: 'Liquid', value: r.liquid, color: TONE.net },
                  { label: 'Illiquid', value: r.illiquid, color: TONE.cost },
                ]}
              />
            </div>
            <div className="chart-block" style={{ marginTop: 20 }}>
              <DonutChart
                centerValue={percent(r.largestPct)}
                centerLabel="Largest holding"
                data={r.assetVals
                  .filter((a) => a.value > 0)
                  .sort((a, b) => b.value - a.value)
                  .map((a, i) => ({ label: a.label, value: a.value, color: PALETTE[i % PALETTE.length] }))}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>

          <Panel title="Shock Scenario">
            <Note>
              A 50% decline in your largest asset
              {r.largest.value > 0 ? ` (${r.largest.label})` : ''} would reduce
              your net worth by approximately{' '}
              <strong>{percent(r.shockPctOfNetWorth)}</strong>
              {r.shockLoss > 0 ? ` (${money(r.shockLoss)})` : ''}.
            </Note>
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
