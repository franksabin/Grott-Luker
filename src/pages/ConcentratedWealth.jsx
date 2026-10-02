import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, MoneyField, ResultRow, StatTiles, Assumptions, Note, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
import { DonutChart, StackedBar, PALETTE, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'

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

// Entries are asset values and income amounts; a negative entry has no meaning
// here (liabilities are not modeled), so it is treated as $0 on screen and in print.
const amount = (v) => Math.max(0, toNumber(v))

function compute(form) {
  const assetVals = ASSETS.map((a) => ({ ...a, value: amount(form[a.key]) }))
  const totalAssets = assetVals.reduce((s, a) => s + a.value, 0)
  const sortedAssets = [...assetVals].sort((a, b) => b.value - a.value)
  const largest = sortedAssets[0] || { label: '—', value: 0 }
  const largestPct = totalAssets > 0 ? (largest.value / totalAssets) * 100 : 0

  const liquid = assetVals.filter((a) => a.liquid).reduce((s, a) => s + a.value, 0)
  const illiquid = totalAssets - liquid
  const liquidPct = totalAssets > 0 ? (liquid / totalAssets) * 100 : 0
  const illiquidPct = totalAssets > 0 ? (illiquid / totalAssets) * 100 : 0
  const employerStock = assetVals.find((a) => a.key === 'employerStock')?.value || 0

  const incomeVals = INCOME.map((i) => ({ ...i, value: amount(form[i.key]) }))
  const totalIncome = incomeVals.reduce((s, i) => s + i.value, 0)
  const sortedIncome = [...incomeVals].sort((a, b) => b.value - a.value)
  const largestIncome = sortedIncome[0] || { label: '—', value: 0 }
  const incomeDependencePct = totalIncome > 0 ? (largestIncome.value / totalIncome) * 100 : 0

  // Shock: a 50% decline in the single largest asset, everything else held constant.
  const shockLoss = largest.value * 0.5
  const shockPctOfNetWorth = totalAssets > 0 ? (shockLoss / totalAssets) * 100 : 0
  const netWorthAfterShock = totalAssets - shockLoss

  return {
    assetVals,
    sortedAssets,
    totalAssets,
    largest,
    largestPct,
    liquid,
    illiquid,
    liquidPct,
    illiquidPct,
    employerStock,
    incomeVals,
    sortedIncome,
    totalIncome,
    largestIncome,
    incomeDependencePct,
    shockLoss,
    shockPctOfNetWorth,
    netWorthAfterShock,
    hasAssets: largest.value > 0,
    hasIncome: totalIncome > 0,
  }
}

// Print legend with one-decimal shares so it agrees with the headline, tiles,
// rows and table (the shared Legend rounds to whole percents).
function PctLegend({ data, total, column = false }) {
  const t = total > 0 ? total : data.reduce((s, d) => s + d.value, 0)
  return (
    <ul
      className="chart-legend"
      style={column ? { display: 'flex', flexDirection: 'column', flex: 1, padding: 0, margin: 0, gap: 4 } : undefined}
    >
      {data.map((d, i) => (
        <li key={i} style={column ? { display: 'flex', width: '100%' } : undefined}>
          <span className="chart-dot" style={{ background: d.color }} />
          <span className="chart-legend-label" style={column ? { flex: 1 } : undefined}>{d.label}</span>
          <span className="chart-legend-val">
            {money(d.value)}
            <span className="muted"> · {percent(t > 0 ? (d.value / t) * 100 : 0)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
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

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const assumptions = [
    'All figures are simple arithmetic based on the values entered. No forecasting or probability modeling is performed.',
    'Liquidity is classified as follows — Liquid: employer stock, individual securities, cryptocurrency. Illiquid: business ownership, real estate, deferred compensation.',
    'Net worth here equals total assets entered; this tool does not incorporate liabilities. An entry below zero is treated as $0.',
    'The shock scenario applies a hypothetical one-time 50% decline to the single largest asset and holds every other value constant. It is an illustration, not a prediction.',
    'This tool presents no scores, ratings, or recommendations of any kind.',
  ]
  const inputs = [
    ...ASSETS.map((a) => [a.label, money(amount(form[a.key]))]),
    ...INCOME.map((i) => [i.label, money(amount(form[i.key]))]),
  ]
  const { hasAssets, hasIncome } = r
  const shareOfAssets = (v) => percent(r.totalAssets > 0 ? (v / r.totalAssets) * 100 : 0)
  const shareOfIncome = (v) => percent(r.totalIncome > 0 ? (v / r.totalIncome) * 100 : 0)
  const incomeTileNote = hasIncome ? `${r.largestIncome.label} · ${money(r.largestIncome.value)}` : 'No income entered'
  const donutData = r.sortedAssets
    .filter((a) => a.value > 0)
    .map((a, i) => ({ label: a.label, value: a.value, color: PALETTE[i % PALETTE.length] }))
  const liquidityData = [
    { label: 'Liquid', value: r.liquid, color: TONE.net },
    { label: 'Illiquid', value: r.illiquid, color: TONE.cost },
  ]

  // One note, used verbatim on screen (Shock Scenario panel) and in print (Reading the result).
  const shockNote = hasAssets ? (
    <>
      The shock test halves the largest asset ({r.largest.label}, {money(r.largest.value)} → {money(r.largest.value - r.shockLoss)}) and holds every
      other value constant, leaving <strong>{money(r.netWorthAfterShock)}</strong> of net worth — a {percent(r.shockPctOfNetWorth)} reduction. It is
      arithmetic, not a forecast.{' '}
      {r.liquid > 0
        ? `${money(r.liquid)} (${percent(r.liquidPct)}) sits in the liquid categories — employer stock, individual securities, cryptocurrency — and could ordinarily be sold on short notice${r.employerStock > 0 ? ', although employer stock may be limited by trading windows or holding-period rules' : ''}; the business, real estate, and deferred compensation could not.`
        : 'None of the assets entered falls in the liquid categories (employer stock, individual securities, cryptocurrency), so no part of this net worth could ordinarily be sold on short notice.'}
      {hasIncome ? ` Income dependence of ${percent(r.incomeDependencePct)} is the share of annual income resting on the single largest source (${r.largestIncome.label}).` : ''}
    </>
  ) : (
    <>
      Enter at least one asset to run the shock test. It halves the single largest asset, holds every other value constant, and reports the
      reduction in net worth as a dollar amount and a share.
    </>
  )

  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Concentrated Wealth Exposure"
          subtitle="How much of the net worth and income rests on a single source, how much is liquid, and what a simple shock would do."
          meta={`${money(r.totalAssets)} net worth · ${money(r.totalIncome)} annual income · ${hasAssets ? `largest holding: ${r.largest.label}` : 'no assets entered'}`}
          metaRight={today}
        />
        <PrintFeature
          label="Largest asset as a share of net worth"
          value={percent(r.largestPct)}
          note={hasAssets ? `${r.largest.label} · ${money(r.largest.value)} of ${money(r.totalAssets)} total assets` : 'Enter assets to begin'}
        />
        <PrintTiles
          items={[
            { label: 'Liquid share', value: percent(r.liquidPct), note: money(r.liquid) },
            { label: 'Illiquid share', value: percent(r.illiquidPct), note: money(r.illiquid) },
            { label: 'Income dependence', value: percent(r.incomeDependencePct), note: incomeTileNote },
            { label: 'Loss in a 50% shock', value: money(r.shockLoss), note: `${percent(r.shockPctOfNetWorth)} of net worth` },
          ]}
        />
        <PrintSection title="Net worth by liquidity" note="assets entered; liabilities not included">
          <PrintRows
            rows={[
              { label: 'Liquid net worth — employer stock, individual securities, cryptocurrency', value: `${money(r.liquid)} · ${percent(r.liquidPct)}` },
              { label: 'Illiquid net worth — business ownership, real estate, deferred compensation', value: `${money(r.illiquid)} · ${percent(r.illiquidPct)}` },
              { label: 'Total net worth', value: money(r.totalAssets), total: true },
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>
            The largest single holding{hasAssets ? ` (${r.largest.label})` : ''}{' '}
            represents {percent(r.largestPct)} of a {money(r.totalAssets)} net
            worth, of which {percent(r.illiquidPct)} is illiquid. Income
            dependence on a single source is {percent(r.incomeDependencePct)}. A
            hypothetical 50% decline in the largest asset would reduce net worth
            by approximately {percent(r.shockPctOfNetWorth)} ({money(r.shockLoss)}).
          </PrintProse>
        </PrintSection>
        <PrintSection title="Where the net worth sits" note="each asset as a share of total assets" className="pr-chart">
          {hasAssets ? (
            <div style={{ display: 'flex', alignItems: 'center', paddingRight: 36 }}>
              <DonutChart
                size={250}
                thickness={38}
                centerValue={percent(r.largestPct)}
                centerLabel="Largest holding"
                legend={false}
                data={donutData}
              />
              <PctLegend data={donutData} total={r.totalAssets} column />
            </div>
          ) : (
            <PrintProse>
              No assets have been entered, so there is no composition to chart. Enter the value of each holding on the left to see how the net
              worth is distributed across business ownership, employer stock, individual securities, real estate, cryptocurrency, and deferred
              compensation.
            </PrintProse>
          )}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last>
        <PrintPageHead title="Concentrated Wealth Exposure" right={today} />
        <PrintSection title="Asset detail" note="largest to smallest">
          <PrintTable
            head={['Asset', 'Liquidity', 'Value', 'Share of net worth']}
            widths={['37%', '21%', '21%', '21%']}
            align={['left', 'left', 'right', 'right']}
            rows={r.sortedAssets.map((a) => [a.label, a.liquid ? 'Liquid' : 'Illiquid', money(a.value), shareOfAssets(a.value)])}
          />
        </PrintSection>
        <PrintCols>
          <PrintSection title="Income by source" note={hasIncome ? `${money(r.totalIncome)} total` : 'no income entered'}>
            <PrintRows
              rows={[
                ...r.sortedIncome.map((i) => ({ label: i.label, value: `${money(i.value)} · ${shareOfIncome(i.value)}` })),
                { label: 'Total income', value: money(r.totalIncome), total: true },
              ]}
            />
          </PrintSection>
          <PrintSection title="Shock scenario" note={hasAssets ? '50% decline in the largest asset' : 'no assets entered'}>
            <PrintRows
              rows={[
                { label: `${hasAssets ? r.largest.label : 'Largest asset'} today`, value: money(r.largest.value) },
                { label: 'Hypothetical 50% decline', value: money(r.shockLoss) },
                { label: 'Share of net worth lost', value: percent(r.shockPctOfNetWorth), sub: true },
                { label: 'Net worth after the shock', value: money(r.netWorthAfterShock), total: true },
              ]}
            />
          </PrintSection>
        </PrintCols>
        <PrintSection title="Liquid vs. illiquid net worth" note={`${percent(r.liquidPct)} liquid · ${percent(r.illiquidPct)} illiquid`} className="pr-chart">
          {hasAssets ? (
            <>
              <StackedBar height={36} legend={false} data={liquidityData} />
              <PctLegend data={liquidityData.filter((d) => d.value > 0)} total={r.totalAssets} />
            </>
          ) : (
            <PrintProse>
              No assets have been entered, so the liquidity split cannot be drawn. Employer stock, individual securities, and cryptocurrency count
              as liquid; business ownership, real estate, and deferred compensation count as illiquid.
            </PrintProse>
          )}
        </PrintSection>
        <PrintNote title="Reading the result">{shockNote}</PrintNote>
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
      title="Concentrated Wealth Exposure Analyzer"
      subtitle="Illustrate concentration using straightforward arithmetic — how much of your wealth and income rests on a single source, how much is liquid, and how a simple shock would affect your net worth."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
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
              metaRight={today}
            />
            <FeatureBlock
              label="Largest asset as a share of net worth"
              value={percent(r.largestPct)}
              note={hasAssets ? `${r.largest.label} · ${money(r.largest.value)}` : 'Enter assets to begin'}
            />
            <StatTiles
              items={[
                { label: 'Income dependence', value: percent(r.incomeDependencePct), note: incomeTileNote },
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
              The largest single holding{hasAssets ? ` (${r.largest.label})` : ''}{' '}
              represents {percent(r.largestPct)} of a {money(r.totalAssets)} net
              worth, of which {percent(r.illiquidPct)} is illiquid. Income
              dependence on a single source is {percent(r.incomeDependencePct)}. A
              hypothetical 50% decline in the largest asset would reduce net worth
              by approximately {percent(r.shockPctOfNetWorth)} ({money(r.shockLoss)}).
            </Narrative>

            <div className="chart-block">
              <StackedBar data={liquidityData} />
            </div>
            <div className="chart-block" style={{ marginTop: 20 }}>
              <DonutChart
                centerValue={percent(r.largestPct)}
                centerLabel="Largest holding"
                data={donutData}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>

          <Panel title="Shock Scenario">
            <Note>{shockNote}</Note>
          </Panel>
        </div>
      </div>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
