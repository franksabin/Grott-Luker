import { useState, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, NumberField, MoneyField, SliderField, RefinePanel, StatTiles, ResultRow, Assumptions, Note, InfoTip, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ASSET_TYPES, computeDivision } from '../lib/taxAdjustment.js'

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

  return (
    <ToolShell
      title="How Will Divorce Affect My Finances?"
      subtitle="Illustrate the after-tax consequences of a proposed property division. Because assets carry different embedded taxes, an even split of face value is rarely an even split of what each party can actually keep."
      onReset={() => setAssets(BLANK())}
      onSample={() => setAssets(SAMPLE())}
      steps={steps}
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
                  value: money(Math.abs(result.equalizationDelta)),
                  note: 'Face vs. after-tax difference',
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

            <Narrative>
              A division that looks equal on paper ({money(totals.grossA)} vs{' '}
              {money(totals.grossB)}) is worth {money(totals.afterTaxA)} vs{' '}
              {money(totals.afterTaxB)} after an estimated{' '}
              {money(totals.embeddedTaxTotal)} of embedded taxes. Equalizing on an
              after-tax basis rather than face value changes the required payment
              by approximately {money(Math.abs(result.equalizationDelta))}.
            </Narrative>

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

      <Assumptions
        items={[
          'Embedded tax is estimated per asset type: taxable investments, investment real estate, and business interests use the capital-gains rate on gain over basis; a primary residence applies that rate only to gain above the exclusion; pre-tax retirement applies the ordinary rate to the full balance; Roth and cash carry no embedded tax.',
          'All rates are user-entered assumptions and are applied uniformly; actual rates depend on each party’s post-divorce circumstances.',
          'Depreciation recapture, state-specific rules, transfer timing, and holding periods are not separately modeled.',
          'Retirement accounts are assumed transferable between parties without immediate tax (e.g., via a QDRO or incident-to-divorce transfer); tax is treated as embedded in future withdrawals.',
          'The equalizing payment is the cash transfer that would equalize each party’s share on the indicated basis.',
        ]}
      />
    </ToolShell>
  )
}
