import { useState, useMemo, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, NumberField, MoneyField, SliderField, Stat, Assumptions, Note, InfoTip, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ASSET_TYPES, computeDivision, DEFAULT_RATES } from '../lib/taxAdjustment.js'

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

  return (
    <ToolShell
      title="How Will Divorce Affect My Finances?"
      subtitle="Illustrate the after-tax consequences of a proposed property division. Because assets carry different embedded taxes, an even split of face value is rarely an even split of what each party can actually keep."
      onReset={() => setAssets(BLANK())}
      onSample={() => setAssets(SAMPLE())}
    >
      <Panel title="Tax Assumptions">
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
        <div className="field-row">
          <MoneyField
            label="Home-sale exclusion"
            value={exclusion}
            onChange={setExclusion}
            info="Assumed capital-gains exclusion on a primary residence (e.g., up to $500,000 for a married couple). Gain above this is taxed."
          />
          <div className="field-row" style={{ marginBottom: 0 }}>
            <NumberField label="Party A name" value={nameA} onChange={setNameA} />
            <NumberField label="Party B name" value={nameB} onChange={setNameB} />
          </div>
        </div>
      </Panel>

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
        <Panel title="Tax-Adjusted Allocation">
          <table className="data-table">
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
        </Panel>

        <div>
          <Panel title="Equalization Analysis">
            <FeatureBlock
              compact
              label="Equalizing payment (after tax)"
              value={money(afterTaxEqualization.amount)}
              note={
                afterTaxEqualization.amount > 0
                  ? `${eqName(afterTaxEqualization.from)} pays ${eqName(afterTaxEqualization.to)} to equalize after-tax value`
                  : 'Shares are already equal after tax'
              }
            />
            <div className="stat-grid">
              <Stat
                label="Equalizing payment — face value"
                value={money(grossEqualization.amount)}
                note={grossEqualization.amount > 0 ? `${eqName(grossEqualization.from)} → ${eqName(grossEqualization.to)}` : 'Already equal'}
              />
              <Stat
                label="Embedded tax shifts payment by"
                value={money(Math.abs(result.equalizationDelta))}
                note="Face vs. after-tax difference"
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
          </Panel>

          <Panel title="Estimated Tax Consequences">
            <div className="stat-grid">
              <Stat label="Total embedded tax" value={money(totals.embeddedTaxTotal)} />
              <Stat
                label="As % of face value"
                value={percent(totals.grossTotal > 0 ? (totals.embeddedTaxTotal / totals.grossTotal) * 100 : 0)}
              />
            </div>
          </Panel>
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
