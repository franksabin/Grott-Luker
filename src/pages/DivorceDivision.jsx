import { useState, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, NumberField, MoneyField, SliderField, RefinePanel, StatTiles, ResultRow, Assumptions, Note, InfoTip, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ASSET_TYPES, getAssetType, computeDivision } from '../lib/taxAdjustment.js'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'

let COUNTER = 0
const uid = () => `asset-${COUNTER++}`

const makeAsset = (over = {}) => ({
  id: uid(),
  label: '',
  type: 'taxable_investments',
  value: '',
  basis: '',
  allocationA: '50',
  ...over,
})

const BLANK = () => [
  makeAsset({ label: 'Marital home', type: 'primary_residence' }),
  makeAsset({ label: 'Brokerage account', type: 'taxable_investments' }),
  makeAsset({ label: 'Retirement (Traditional)', type: 'retirement_pretax' }),
]

const SAMPLE = () => [
  makeAsset({ label: 'Marital home', type: 'primary_residence', value: '1200000', basis: '400000', allocationA: '100' }),
  makeAsset({ label: 'Joint brokerage', type: 'taxable_investments', value: '900000', basis: '350000', allocationA: '0' }),
  makeAsset({ label: '401(k) — pre-tax', type: 'retirement_pretax', value: '800000', basis: '0', allocationA: '50' }),
  makeAsset({ label: 'Roth IRA', type: 'retirement_roth', value: '250000', basis: '0', allocationA: '0' }),
  makeAsset({ label: 'Cash / savings', type: 'cash', value: '300000', basis: '300000', allocationA: '50' }),
]

const TYPE_OPTIONS = ASSET_TYPES.map((t) => ({ value: t.id, label: t.label }))

export default function DivorceDivision() {
  const [assets, setAssets] = useState(BLANK)
  const [nameA, setNameA] = useState('Spouse A')
  const [nameB, setNameB] = useState('Spouse B')
  const [capGains, setCapGains] = useState('23.8')
  const [ordinary, setOrdinary] = useState('32')
  const [exclusion, setExclusion] = useState('500000')

  const updateAsset = (id, patch) =>
    setAssets((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const removeAsset = (id) => setAssets((list) => list.filter((a) => a.id !== id))
  const addAsset = () => setAssets((list) => [...list, makeAsset()])

  const rates = useMemo(
    () => ({
      capitalGainsRate: toNumber(capGains) / 100,
      ordinaryRate: toNumber(ordinary) / 100,
      residenceExclusion: toNumber(exclusion),
    }),
    [capGains, ordinary, exclusion]
  )

  const result = useMemo(
    () => computeDivision(assets.map((a) => ({ ...a, allocationA: a.allocationA })), rates, { a: nameA, b: nameB }),
    [assets, rates, nameA, nameB]
  )

  const { totals, lines, grossEqualization, afterTaxEqualization } = result
  const eqName = (side) => (side === 'a' ? nameA : nameB)
  const steps = useMemo(() => [
    ...lines.filter((l) => l.valuation.grossValue > 0).map((l) => ({
      label: l.asset.label || 'Asset',
      formula: `${money(l.valuation.grossValue)} − embedded tax ${money(l.valuation.grossValue - l.valuation.afterTax)} (${percent(l.valuation.effectiveRate * 100, 1)})`,
      result: `${money(l.valuation.afterTax)} after tax · ${toNumber(l.asset.allocationA)}% to ${nameA}`,
    })),
    { label: 'Gross split', formula: `${nameA} vs. ${nameB}`, result: `${money(totals.grossA)} vs. ${money(totals.grossB)}` },
    { label: 'After-tax split', formula: 'gross less embedded tax on each side', result: `${money(totals.afterTaxA)} vs. ${money(totals.afterTaxB)}` },
    { label: 'Equalizing payment · gross', formula: `|${money(totals.grossA)} − ${money(totals.grossB)}| ÷ 2`, result: `${money(grossEqualization.amount)} from ${eqName(grossEqualization.from)}` },
    { label: 'Equalizing payment · after tax', formula: `|${money(totals.afterTaxA)} − ${money(totals.afterTaxB)}| ÷ 2`, result: `${money(afterTaxEqualization.amount)} from ${eqName(afterTaxEqualization.from)}` },
    { label: 'Rates used', formula: 'capital gains · ordinary · residence exclusion', result: `${capGains}% · ${ordinary}% · ${money(toNumber(exclusion))}` },
  ], [lines, totals, grossEqualization, afterTaxEqualization, nameA, nameB, capGains, ordinary, exclusion])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const nAssets = lines.length
  const assetWord = nAssets === 1 ? 'asset' : 'assets'
  const hasValues = totals.grossTotal > 0
  const hasTax = totals.embeddedTaxTotal > 0
  // Shift in the equalizing payment. When embedded tax reverses who pays, the
  // honest figure is the full swing (both payments combined), not |a| − |b|.
  const flipped =
    grossEqualization.amount > 0 && afterTaxEqualization.amount > 0 && grossEqualization.from !== afterTaxEqualization.from
  const paymentShift = flipped ? grossEqualization.amount + afterTaxEqualization.amount : Math.abs(result.equalizationDelta)
  const shiftNote = flipped ? 'Direction of payment reverses' : 'Face vs. after-tax difference'
  const payTxt = (eq) => `${eqName(eq.from)} pays ${eqName(eq.to)} ${money(eq.amount)}`
  const shiftSentence = flipped
    ? `On face value alone, ${payTxt(grossEqualization)}; after embedded tax the payment reverses — ${payTxt(afterTaxEqualization)}, a swing of ${money(paymentShift)}.`
    : grossEqualization.amount === 0 && afterTaxEqualization.amount === 0
      ? 'The division is equal on both a face-value and an after-tax basis, so no equalizing payment is needed.'
      : `Equalizing on an after-tax basis rather than face value changes the required payment by approximately ${money(paymentShift)}.`
  const narrative = `A division of ${money(totals.grossA)} vs ${money(totals.grossB)} on paper is worth ${money(totals.afterTaxA)} vs ${money(totals.afterTaxB)} after an estimated ${money(totals.embeddedTaxTotal)} of embedded taxes. ${shiftSentence}`
  const assumptions = [
    'Embedded tax is estimated per asset type: taxable investments, investment real estate, and business interests use the capital-gains rate on gain over basis; a primary residence applies that rate only to gain above the exclusion; pre-tax retirement applies the ordinary rate to the full balance; Roth, HSA, 529, cash, and other assets carry no embedded tax.',
    'All rates are user-entered assumptions and are applied uniformly; actual rates depend on each party’s post-divorce circumstances.',
    'Depreciation recapture, state-specific rules, transfer timing, and holding periods are not separately modeled.',
    'Retirement accounts are assumed transferable between parties without immediate tax (e.g., via a QDRO or incident-to-divorce transfer); tax is treated as embedded in future withdrawals.',
    'The equalizing payment is the cash transfer that would equalize each party’s share on the indicated basis. The “shift” is the change in that payment between the face-value and after-tax bases; when embedded tax reverses who pays, it counts the full swing (both payments combined).',
  ]
  // Fit-by-design helpers: long party names and asset descriptions are clipped
  // with an ellipsis so no row, tile, header, or input cell can wrap.
  const clip = (s, max, block = false, right = false) => (
    <span
      style={{
        display: block ? 'block' : 'inline-block',
        maxWidth: max,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        verticalAlign: 'bottom',
        ...(right ? { marginLeft: 'auto', textAlign: 'right' } : {}),
      }}
    >
      {s}
    </span>
  )
  const inputs = [
    ['Party A', clip(nameA, 150, true)],
    ['Party B', clip(nameB, 150, true)],
    ['Assets listed', `${nAssets}`],
    ['Combined face value', money(totals.grossTotal)],
    ['Capital gains rate', `${capGains}%`],
    ['Ordinary income rate', `${ordinary}%`],
    ['Home-sale exclusion', money(toNumber(exclusion))],
  ]
  const eqRow = (basis, eq, opts = {}) => ({
    label:
      eq.amount > 0 ? (
        <>Equalizing payment — {basis} · {clip(eqName(eq.from), 130)} pays {clip(eqName(eq.to), 130)}</>
      ) : (
        `Equalizing payment — ${basis}`
      ),
    value: eq.amount > 0 ? money(eq.amount) : `${money(0)} · Already equal`,
    ...opts,
  })
  const shareNote =
    `${nameA} / ${nameB}`.length <= 32 ? (
      `${nameA} / ${nameB}`
    ) : (
      <>
        {clip(nameA, 150, true)}
        {clip(nameB, 150, true)}
      </>
    )
  const MAX_TABLE_ROWS = 24
  const tableLines = lines.slice(0, MAX_TABLE_ROWS)
  const hiddenLines = lines.length - tableLines.length
  const PRINT_TYPE = {
    cash: 'Cash / bank',
    taxable_investments: 'Taxable investments',
    primary_residence: 'Primary residence',
    investment_real_estate: 'Investment real estate',
    business_interest: 'Business interest',
    retirement_pretax: 'Pre-tax retirement',
    retirement_roth: 'Roth retirement',
    hsa: 'HSA',
    education_529: '529 plan',
    other: 'Other',
  }
  const typeLabel = (id) => PRINT_TYPE[id] || getAssetType(id).label
  const allocPct = (v) => Math.max(0, Math.min(100, toNumber(v)))
  const tableRows = [
    ...tableLines.map(({ asset, valuation }) => [
      clip(asset.label || 'Asset', 146, true),
      clip(typeLabel(asset.type), 98, true),
      money(valuation.grossValue),
      getAssetType(asset.type).usesBasis ? money(toNumber(asset.basis)) : '—',
      percent(allocPct(asset.allocationA), 0),
      money(valuation.embeddedTax),
      money(valuation.afterTax),
    ]),
    ...(hiddenLines > 0
      ? [[`… and ${hiddenLines} more asset${hiddenLines === 1 ? '' : 's'}`, clip('on-screen table', 98, true), '', '', '', '', '']]
      : []),
    ['Total', '', money(totals.grossTotal), '', '', money(totals.embeddedTaxTotal), money(totals.afterTaxTotal)],
  ]
  const sideRows = (gross, after, pct) => [
    { label: 'Face value received', value: money(gross) },
    { label: 'Less: estimated embedded tax', value: money(gross - after) },
    { label: 'After-tax value received', value: money(after), total: true },
    { label: 'Share of after-tax total', value: percent(pct, 1), sub: true },
  ]
  const taxByType = Object.values(
    lines.reduce((acc, l) => {
      const k = l.asset.type
      acc[k] = acc[k] || { label: typeLabel(k), tax: 0, value: 0 }
      acc[k].tax += l.valuation.embeddedTax
      acc[k].value += l.valuation.grossValue
      return acc
    }, {})
  )
    .filter((t) => t.tax > 0)
    .sort((a, b) => b.tax - a.tax)
  const embeddedPct = totals.grossTotal > 0 ? (totals.embeddedTaxTotal / totals.grossTotal) * 100 : 0
  const showAssetChart = hasTax && nAssets > 0 && nAssets <= 6
  const showTypeRows = hasTax && nAssets > 6 && nAssets <= 12
  const showSideCols = nAssets <= 18
  const glabel = (s) => (
    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s}</span>
  )
  const printReport = (
    <PrintDoc>
      <PrintPage compact>
        <PrintBand
          title="Tax-Adjusted Property Division"
          subtitle="An even split of face value is rarely an even split of what each party keeps after embedded taxes."
          meta={`${nAssets} ${assetWord} · ${money(totals.grossTotal)} face value · ${capGains}% capital gains / ${ordinary}% ordinary`}
          metaRight={today}
        />
        <PrintFeature
          label="Equalizing payment (after tax)"
          value={money(afterTaxEqualization.amount)}
          note={
            afterTaxEqualization.amount > 0
              ? `${eqName(afterTaxEqualization.from)} pays ${eqName(afterTaxEqualization.to)} to equalize after-tax value`
              : 'Shares are already equal after tax'
          }
        />
        <PrintTiles
          items={[
            { label: 'Total embedded tax', value: money(totals.embeddedTaxTotal), note: `${percent(embeddedPct)} of face value` },
            { label: 'Tax shifts payment by', value: money(paymentShift), note: shiftNote },
            { label: 'Share of after-tax value', value: `${percent(result.afterTaxSharePctA, 0)} / ${percent(100 - result.afterTaxSharePctA, 0)}`, note: shareNote },
            { label: 'After-tax total', value: money(totals.afterTaxTotal), note: `of ${money(totals.grossTotal)} face value` },
          ]}
        />
        <PrintSection title="The division at a glance" note="all assets combined">
          <PrintRows
            rows={[
              { label: 'Face value total', value: money(totals.grossTotal) },
              { label: 'Less: estimated embedded tax', value: money(totals.embeddedTaxTotal) },
              { label: 'After-tax total', value: money(totals.afterTaxTotal), total: true },
              eqRow('face value', grossEqualization, { sub: true }),
              eqRow('after tax', afterTaxEqualization),
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        {hasValues ? (
          <PrintSection title="Face value vs. after-tax value by party" className="pr-chart">
            <BarCompare
              height={225}
              groups={[
                {
                  label: nameA,
                  bars: [
                    { label: 'Face value', value: totals.grossA, color: TONE.cost },
                    { label: 'After-tax value', value: totals.afterTaxA, color: TONE.net },
                  ],
                },
                {
                  label: nameB,
                  bars: [
                    { label: 'Face value', value: totals.grossB, color: TONE.cost },
                    { label: 'After-tax value', value: totals.afterTaxB, color: TONE.net },
                  ],
                },
              ]}
            />
          </PrintSection>
        ) : (
          <PrintSection title="Face value vs. after-tax value by party">
            <PrintProse>
              No asset values have been entered yet. Once the assets carry values, this section charts the face value and the after-tax value received by each party.
            </PrintProse>
          </PrintSection>
        )}
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Tax-Adjusted Property Division" right={today} />
        <PrintSection title="Asset-by-asset detail" note="embedded tax estimated per asset type">
          <PrintTable
            head={[
              'Asset',
              'Type',
              'Value',
              'Cost basis',
              <>
                <span style={{ display: 'block' }}>% to</span>
                {clip(nameA, 78, true, true)}
              </>,
              'Embedded tax',
              'After tax',
            ]}
            widths={['25%', '17%', '11%', '11%', '14%', '11%', '11%']}
            align={['left', 'left', 'right', 'right', 'right', 'right', 'right']}
            rowClass={(row, i) => (i === tableRows.length - 1 ? 'is-strong' : '')}
            rows={tableRows}
          />
        </PrintSection>
        {showAssetChart ? (
          <PrintSection title="Embedded tax by asset" note="what each asset would cost in tax if realized" className="pr-chart">
            <BarCompare
              height={150}
              legend={false}
              groups={lines.map(({ asset, valuation }) => ({
                label: glabel(asset.label || 'Asset'),
                bars: [{ label: 'Embedded tax', value: valuation.embeddedTax, color: TONE.cost }],
              }))}
            />
          </PrintSection>
        ) : null}
        {showTypeRows ? (
          <PrintSection title="Embedded tax by asset type" note="effective rate = embedded tax ÷ face value of that type">
            <PrintRows
              rows={[
                ...taxByType.map((t) => ({ label: `${t.label} · ${percent((t.tax / t.value) * 100, 1)} effective`, value: money(t.tax) })),
                { label: 'Total embedded tax', value: money(totals.embeddedTaxTotal), total: true },
              ]}
            />
          </PrintSection>
        ) : null}
        {!hasTax && nAssets > 0 ? (
          <PrintSection title="Embedded tax by asset">
            <PrintProse>
              None of the listed assets carries embedded tax at the assumed rates — cash, Roth, HSA, 529, and “other” assets are treated as already after-tax, and the taxable assets show no gain over basis — so face value and after-tax value are identical for every asset.
            </PrintProse>
          </PrintSection>
        ) : null}
        {showSideCols ? (
          <PrintCols>
            <PrintSection title={clip(nameA, 300, true)}>
              <PrintRows rows={sideRows(totals.grossA, totals.afterTaxA, result.afterTaxSharePctA)} />
            </PrintSection>
            <PrintSection title={clip(nameB, 300, true)}>
              <PrintRows rows={sideRows(totals.grossB, totals.afterTaxB, 100 - result.afterTaxSharePctA)} />
            </PrintSection>
          </PrintCols>
        ) : null}
        <PrintNote title="Reading the result — a CPA’s emphasis, not a lawyer’s">
          This tool focuses on the tax consequences of dividing property — the embedded taxes that determine what each party actually keeps. It does not address legal entitlements, negotiation strategy, support obligations, or the many non-tax factors involved in a divorce settlement.
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
      title="How Will Divorce Affect My Finances?"
      subtitle="Illustrate the after-tax consequences of a proposed property division. Because assets carry different embedded taxes, an even split of face value is rarely an even split of what each party can actually keep."
      onReset={() => setAssets(BLANK())}
      onSample={() => setAssets(SAMPLE())}
      steps={steps}
      printReport={printReport}
    >
      <Panel title="Assets & Proposed Allocation">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Asset</th>
                <th style={{ minWidth: 180 }}>
                  Type <InfoTip text="Determines how embedded tax is estimated for each asset." />
                </th>
                <th className="num">Value</th>
                <th className="num">Cost basis</th>
                <th className="num" style={{ minWidth: 110 }}>% to {nameA}</th>
                <th className="num">After-tax value</th>
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ asset, valuation }) => (
                <tr key={asset.id}>
                  <td>
                    <input
                      className="input"
                      value={asset.label}
                      placeholder="Description"
                      onChange={(e) => updateAsset(asset.id, { label: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="select"
                      value={asset.type}
                      onChange={(e) => updateAsset(asset.id, { type: e.target.value })}
                    >
                      {TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      className="input"
                      style={{ textAlign: 'right', minWidth: 100 }}
                      inputMode="decimal"
                      value={asset.value}
                      onChange={(e) => updateAsset(asset.id, { value: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="input"
                      style={{ textAlign: 'right', minWidth: 100 }}
                      inputMode="decimal"
                      value={asset.basis}
                      onChange={(e) => updateAsset(asset.id, { basis: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="input"
                      style={{ textAlign: 'right', minWidth: 70 }}
                      inputMode="decimal"
                      value={asset.allocationA}
                      onChange={(e) => updateAsset(asset.id, { allocationA: e.target.value })}
                    />
                  </td>
                  <td className="num">{money(valuation.afterTax)}</td>
                  <td className="no-print">
                    <button className="iconbtn" onClick={() => removeAsset(asset.id)} aria-label="Remove asset">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost btn-sm no-print" style={{ marginTop: 14 }} onClick={addAsset}>
          <Plus size={15} /> Add asset
        </button>
      </Panel>

      <div className="tool-grid">
        <div>
          <Panel title="Parties">
            <div className="field-row">
              <NumberField label="Party A name" value={nameA} onChange={setNameA} />
              <NumberField label="Party B name" value={nameB} onChange={setNameB} />
            </div>
          </Panel>
          <RefinePanel summary="capital gains rate, ordinary rate, home-sale exclusion">
            <div className="field-row">
              <SliderField
                label="Capital gains rate"
                value={capGains}
                onChange={setCapGains}
                min={0}
                max={40}
                step={0.1}
                readout={`${capGains}%`}
                info="Assumed combined long-term capital gains rate (federal + NIIT + state) applied to unrealized gains on taxable assets."
              />
              <SliderField
                label="Ordinary income rate"
                value={ordinary}
                onChange={setOrdinary}
                min={0}
                max={50}
                step={0.5}
                readout={`${ordinary}%`}
                info="Assumed marginal ordinary rate applied to pre-tax retirement balances, which are taxed as income when withdrawn."
              />
            </div>
            <MoneyField
              label="Home-sale exclusion"
              value={exclusion}
              onChange={setExclusion}
              info="Assumed capital-gains exclusion on a primary residence (e.g., up to $500,000 for a married couple). Gain above this is taxed."
            />
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Tax-Adjusted Division"
              meta={`${lines.length} assets · ${money(totals.grossTotal)} face value · ${capGains}% / ${ordinary}%`}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Equalizing payment (after tax)"
              value={money(afterTaxEqualization.amount)}
              note={
                afterTaxEqualization.amount > 0
                  ? `${eqName(afterTaxEqualization.from)} pays ${eqName(afterTaxEqualization.to)} to equalize after-tax value`
                  : 'Shares are already equal after tax'
              }
            />
            <StatTiles
              items={[
                {
                  label: 'Total embedded tax',
                  value: money(totals.embeddedTaxTotal),
                  tone: 'bad',
                  note: `${percent(totals.grossTotal > 0 ? (totals.embeddedTaxTotal / totals.grossTotal) * 100 : 0)} of face value`,
                },
                {
                  label: 'Embedded tax shifts payment by',
                  value: money(paymentShift),
                  note: shiftNote,
                },
                {
                  label: 'Share of after-tax value',
                  value: `${percent(result.afterTaxSharePctA, 0)} / ${percent(100 - result.afterTaxSharePctA, 0)}`,
                  note: `${nameA} / ${nameB}`,
                },
              ]}
            />
            <div className="result-list">
              <ResultRow label="Face value total" value={totals.grossTotal} />
              <ResultRow label="Total embedded tax" value={totals.embeddedTaxTotal} negative />
              <ResultRow label="After-tax total" value={totals.afterTaxTotal} total />
              <ResultRow
                label="Equalizing payment — face value"
                raw={grossEqualization.amount > 0 ? `${money(grossEqualization.amount)} · ${eqName(grossEqualization.from)} → ${eqName(grossEqualization.to)}` : `${money(0)} · Already equal`}
                sub
              />
              <ResultRow
                label="Equalizing payment — after tax"
                raw={afterTaxEqualization.amount > 0 ? `${money(afterTaxEqualization.amount)} · ${eqName(afterTaxEqualization.from)} → ${eqName(afterTaxEqualization.to)}` : `${money(0)} · Already equal`}
                positive
              />
            </div>

            <Narrative>{narrative}</Narrative>

            <div className="chart-block" style={{ marginTop: 20 }}>
              <BarCompare
                groups={[
                  {
                    label: nameA,
                    bars: [
                      { label: 'Face value', value: totals.grossA, color: TONE.cost },
                      { label: 'After-tax value', value: totals.afterTaxA, color: TONE.net },
                    ],
                  },
                  {
                    label: nameB,
                    bars: [
                      { label: 'Face value', value: totals.grossB, color: TONE.cost },
                      { label: 'After-tax value', value: totals.afterTaxB, color: TONE.net },
                    ],
                  },
                ]}
              />
            </div>

            <table className="data-table" style={{ marginTop: 20 }}>
              <thead>
                <tr>
                  <th></th>
                  <th className="num">{nameA}</th>
                  <th className="num">{nameB}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Face (book) value</td>
                  <td className="num">{money(totals.grossA)}</td>
                  <td className="num">{money(totals.grossB)}</td>
                </tr>
                <tr>
                  <td>Estimated after-tax value</td>
                  <td className="num">{money(totals.afterTaxA)}</td>
                  <td className="num">{money(totals.afterTaxB)}</td>
                </tr>
                <tr>
                  <td>Share of after-tax value</td>
                  <td className="num">{percent(result.afterTaxSharePctA)}</td>
                  <td className="num">{percent(100 - result.afterTaxSharePctA)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>Face value total</td>
                  <td className="num" colSpan={2}>{money(totals.grossTotal)}</td>
                </tr>
                <tr>
                  <td>After-tax total</td>
                  <td className="num" colSpan={2}>{money(totals.afterTaxTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="A CPA’s emphasis, not a lawyer’s">
        This tool focuses on the tax consequences of dividing property — the
        embedded taxes that determine what each party actually keeps. It does not
        address legal entitlements, negotiation strategy, support obligations, or
        the many non-tax factors involved in a divorce settlement.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
