import { useState, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  SelectField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
  Field,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { TAX_YEAR } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'
import {
  MAX_ASSETS,
  ID_DAYS,
  CLOSE_DAYS,
  DEFAULT_SELL_COST_PCT,
  DEFAULT_BUY_COST_PCT,
  ASSET_TYPES,
  blankAsset,
  computeExchange,
  addDays,
} from '../lib/exchange1031.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const YESNO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

const BLANK = () => ({
  relinquished: [blankAsset({ name: 'Property sold' })],
  replacement: [blankAsset({ name: 'Property bought' })],
  sellPct: String(DEFAULT_SELL_COST_PCT),
  buyPct: String(DEFAULT_BUY_COST_PCT),
  otherCosts: '',
  cashOut: '',
  closingDate: '',
  filing: 'married',
  otherIncome: '',
  state: 'NH',
  expenseEquipment: 'yes',
})

const SAMPLE = () => ({
  relinquished: [
    blankAsset({ name: 'Rental duplex — Dover', type: 'real', price: '800000', cost: '420000', depreciation: '130000', debt: '260000' }),
    blankAsset({ name: 'Farmland — Lee', type: 'real', price: '600000', cost: '210000', depreciation: '0', debt: '0' }),
    blankAsset({ name: 'Tractor and implements', type: 'equipment', price: '90000', cost: '140000', depreciation: '140000', debt: '0' }),
  ],
  replacement: [
    blankAsset({ name: 'Mixed-use building — Portsmouth', type: 'real', price: '1500000', debt: '650000' }),
    blankAsset({ name: 'New tractor', type: 'equipment', price: '120000', debt: '90000' }),
  ],
  sellPct: String(DEFAULT_SELL_COST_PCT),
  buyPct: String(DEFAULT_BUY_COST_PCT),
  otherCosts: '2500',
  cashOut: '100000',
  closingDate: '2026-10-15',
  filing: 'married',
  otherIncome: '250000',
  state: 'NH',
  expenseEquipment: 'yes',
})

const fmtDate = (d) => (d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—')

function AssetCard({ asset, side, onChange, onRemove, canRemove, sellPct, buyPct }) {
  const isReal = asset.type !== 'equipment'
  const isSold = side === 'sold'
  const price = toNumber(asset.price)
  const pct = isSold ? sellPct : buyPct
  return (
    <div className={`xasset${isReal ? '' : ' is-equip'}`}>
      <div className="xasset-head">
        <input
          className="input xasset-name"
          type="text"
          value={asset.name}
          placeholder={isSold ? 'What was sold' : 'What was bought'}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="pills xasset-type" role="group" aria-label="Asset type">
          {ASSET_TYPES.map((t) => (
            <button key={t.value} type="button" className="pill" aria-pressed={asset.type === t.value} onClick={() => onChange({ type: t.value })}>
              {t.label}
            </button>
          ))}
        </div>
        {canRemove ? (
          <button className="iconbtn no-print" onClick={onRemove} aria-label="Remove">
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
      <div className="xasset-grid">
        <MoneyField label={isSold ? 'Sale price' : 'Purchase price'} value={asset.price} onChange={(v) => onChange({ price: v })} hint={price > 0 ? `${isSold ? 'Selling' : 'Closing'} costs ${percent(pct, 1)} ≈ ${money(price * (pct / 100))}` : undefined} />
        <MoneyField label={isSold ? 'Mortgage paid off' : 'New mortgage / loan'} value={asset.debt} onChange={(v) => onChange({ debt: v })} />
        {isSold ? (
          <>
            <MoneyField label="Cost plus improvements" value={asset.cost} onChange={(v) => onChange({ cost: v })} />
            <MoneyField label="Depreciation taken" value={asset.depreciation} onChange={(v) => onChange({ depreciation: v })} info={isReal ? 'Taxed at up to 25% when recognized (unrecaptured §1250 gain).' : 'Recaptured as ordinary income on sale (§1245). Equipment does not qualify for 1031 treatment.'} />
          </>
        ) : null}
      </div>
      {!isReal ? (
        <div className="xasset-flag">
          {isSold
            ? 'Equipment and other personal property have not qualified for like-kind treatment since 2018. This is treated as a taxable sale alongside the exchange.'
            : 'Bought outside the exchange with cash. Exchange proceeds cannot be used for it without creating boot.'}
        </div>
      ) : null}
    </div>
  )
}

export default function Exchange1031() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const updateAsset = (side, id, patch) => setForm((f) => ({ ...f, [side]: f[side].map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  const removeAsset = (side, id) => setForm((f) => ({ ...f, [side]: f[side].filter((a) => a.id !== id) }))
  const addAsset = (side) => setForm((f) => (f[side].length >= MAX_ASSETS ? f : { ...f, [side]: [...f[side], blankAsset()] }))

  const st = getState(form.state)
  const r = useMemo(
    () =>
      computeExchange({
        relinquished: form.relinquished,
        replacement: form.replacement,
        sellPct: toNumber(form.sellPct),
        buyPct: toNumber(form.buyPct),
        otherCosts: form.otherCosts,
        cashOut: form.cashOut,
        filing: form.filing,
        otherIncome: form.otherIncome,
        stateRate: st.capGains / 100,
        expenseEquipment: form.expenseEquipment !== 'no',
      }),
    [form, st],
  )
  const idDate = addDays(form.closingDate, ID_DAYS)
  const closeDate = addDays(form.closingDate, CLOSE_DAYS)

  const steps = useMemo(() => [
    ...r.relReal.map((a) => ({ label: `${a.name || 'Property sold'} — realized gain`, formula: `(${money(a.price, 2)} − costs ${money(a.costs, 2)}) − (cost ${money(a.cost, 2)} − depreciation ${money(a.depreciation, 2)})`, result: money(a.gain, 2) })),
    { label: 'Amount realized, all real property', formula: `${money(r.salePrice, 2)} − selling costs ${money(r.sellingCosts, 2)} (${percent(r.sellPct * 100, 1)}${r.otherCosts ? ` + ${money(r.otherCosts, 2)} other` : ''})`, result: money(r.amountRealized, 2) },
    { label: 'Realized gain, all real property', formula: `${money(r.amountRealized, 2)} − adjusted basis ${money(r.adjustedBasis, 2)}`, result: money(r.realizedGain, 2), note: `${money(r.depreciation, 2)} of it is depreciation recapture.` },
    { label: 'Proceeds held by the intermediary', formula: `${money(r.amountRealized, 2)} − mortgages paid off ${money(r.oldDebt, 2)}`, result: money(r.netEquity, 2) },
    { label: 'Cash needed to close the replacements', formula: `${money(r.replacementPrice, 2)} + closing costs ${money(r.replacementCosts, 2)} (${percent(r.buyPct * 100, 1)}) − new mortgages ${money(r.newDebt, 2)}`, result: money(r.equityIn, 2) },
    { label: 'Cash taken out', formula: `requested ${money(r.cashOutRequested, 2)}${r.surplus > 0 ? ` + proceeds not reinvested ${money(r.surplus, 2)}` : ''}`, result: money(r.cashBoot, 2) },
    { label: 'Cash brought in', formula: `max(0, ${money(r.equityIn, 2)} − (${money(r.netEquity, 2)} − ${money(r.cashOut, 2)}))`, result: money(r.cashAdded, 2) },
    { label: 'Mortgage boot', formula: `max(0, debt relief (${money(r.oldDebt, 2)} − ${money(r.newDebt, 2)}) − cash brought in ${money(r.cashAdded, 2)})`, result: money(r.mortgageBoot, 2) },
    { label: 'Gain recognized on the exchange', formula: `lesser of realized gain ${money(r.realizedGain, 2)} and total boot ${money(r.totalBoot, 2)}`, result: money(r.recognizedGain, 2) },
    { label: 'Gain deferred', formula: `${money(r.realizedGain, 2)} − ${money(r.recognizedGain, 2)}`, result: money(r.deferredGain, 2) },
    { label: 'Carryover basis, all replacement property', formula: `${money(r.replacementTotal, 2)} − deferred gain ${money(r.deferredGain, 2)}`, result: money(r.replacementBasis, 2), note: r.repReal.length > 1 ? 'Allocated across the replacements by price in the table below.' : undefined },
    { label: 'Unrecaptured §1250 gain recognized', formula: `lesser of gain recognized and depreciation · ${percent(r.exchangeTax.rate1250 * 100, 0)}`, result: `${money(r.exchangeTax.unrecap, 2)} → ${money(r.exchangeTax.tax1250, 2)}` },
    { label: 'Capital gain recognized', formula: `${money(r.exchangeTax.capital, 2)} stacked above ${money(r.otherIncome, 2)} other income, ${TAX_YEAR} 0/15/20%`, result: money(r.exchangeTax.taxLtcg, 2) },
    { label: 'Net investment income tax', formula: '3.8% × recognized real-property gain above the MAGI threshold', result: money(r.exchangeTax.niit, 2) },
    { label: `State (${st.name}) on the exchange`, formula: `${percent(st.capGains, 1)} × ${money(r.recognizedGain, 2)}`, result: money(r.exchangeTax.state, 2) },
    ...(r.relEquip.length || r.repEquip.length ? [
      ...r.equipSold.map((a) => ({ label: `${a.name || 'Equipment sold'} — taxable sale`, formula: `(${money(a.price, 2)} − costs ${money(a.costs, 2)}) − adjusted basis ${money(a.adjustedBasis, 2)}`, result: a.loss > 0 ? `loss ${money(a.loss, 2)}` : `gain ${money(a.gain, 2)} · §1245 recapture ${money(a.recapture, 2)} · §1231 ${money(a.sec1231, 2)}` })),
      ...(r.repEquip.length ? [{ label: 'Equipment bought', formula: r.expenseEquipment ? `${money(r.equipBoughtTotal, 2)} expensed in ${TAX_YEAR} (100% bonus depreciation)` : `${money(r.equipBoughtTotal, 2)}, depreciated over its class life (not expensed here)`, result: r.expenseEquipment ? `−${money(r.bonus, 2)} ordinary income` : '—' }] : []),
      { label: 'Ordinary income from equipment, net', formula: `recapture ${money(r.equipRecapture, 2)} − losses ${money(r.equipLoss, 2)} − expensing ${money(r.bonus, 2)}`, result: money(r.ordinaryNet, 2), note: r.ordinaryNet < 0 ? 'Negative: a deduction against other income this year.' : undefined },
      { label: 'Tax on equipment (federal ordinary + capital + state)', formula: `${money(r.ordinaryNet, 2)} × ${percent(r.marginal * 100, 0)} + gains at 0/15/20% + state`, result: money(r.equipTax, 2) },
    ] : []),
    { label: 'Tax due now, everything as entered', formula: `exchange ${money(r.exchangeTax.total, 2)} + equipment ${money(r.equipTax, 2)}`, result: money(r.taxNow, 2) },
    { label: 'Tax on an outright sale of everything', formula: `same rates on the full ${money(r.realizedGain, 2)} real-property gain + equipment ${money(r.equipTax, 2)}`, result: money(r.taxSale, 2) },
    { label: 'Taxpayer cash after closing', formula: `cash out ${money(r.cashBoot, 2)} − cash in ${money(r.cashAdded, 2)} + equipment proceeds ${money(r.equipProceeds, 2)} − equipment cash needed ${money(r.equipCashNeeded, 2)} − tax ${money(r.taxNow, 2)}`, result: money(r.cashPosition, 2) },
    ...(idDate ? [{ label: 'Deadlines', formula: `${ID_DAYS} and ${CLOSE_DAYS} days from the ${form.closingDate} closing`, result: `identify by ${fmtDate(idDate)} · close by ${fmtDate(closeDate)}` }] : []),
  ], [r, st, form.closingDate, idDate, closeDate])

  const exchangeLabel = r.realizedGain === 0 ? 'Exchange as entered' : r.isFull ? 'Full exchange' : 'Partial exchange'
  const relCount = r.relReal.length
  const repCount = r.repReal.length
  const shape = relCount && repCount ? `${relCount}-for-${repCount}` : ''
  const cashDirection = r.cashBoot > 0 ? `${money(r.cashBoot)} cash out` : r.cashAdded > 0 ? `${money(r.cashAdded)} cash in` : 'no cash either way'

  return (
    <ToolShell
      title="1031 Exchange Analyzer"
      subtitle="One-for-one, two-for-one, or three-for-two: like-kind exchange of investment real estate with any number of properties on each side, closing costs at a default percentage, cash taken out or brought in, and equipment such as tractors handled as the taxable sale it now is."
      onReset={() => setForm(BLANK())}
      onSample={() => setForm(SAMPLE())}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Sold (relinquished)">
            {form.relinquished.map((a) => (
              <AssetCard key={a.id} asset={a} side="sold" sellPct={toNumber(form.sellPct)} buyPct={toNumber(form.buyPct)} onChange={(p) => updateAsset('relinquished', a.id, p)} onRemove={() => removeAsset('relinquished', a.id)} canRemove={form.relinquished.length > 1} />
            ))}
            {form.relinquished.length < MAX_ASSETS ? (
              <button className="btn btn-ghost btn-sm no-print" onClick={() => addAsset('relinquished')}><Plus size={15} /> Add another asset sold</button>
            ) : null}
            <MoneyField label="Cash taken out at closing (optional)" value={form.cashOut} onChange={set('cashOut')} info="Money the taxpayer wants in hand from the sale proceeds. Every dollar is boot, taxed up to the realized gain. Leave blank to reinvest everything." />
          </Panel>
          <Panel title="Bought (replacement)">
            {form.replacement.map((a) => (
              <AssetCard key={a.id} asset={a} side="bought" sellPct={toNumber(form.sellPct)} buyPct={toNumber(form.buyPct)} onChange={(p) => updateAsset('replacement', a.id, p)} onRemove={() => removeAsset('replacement', a.id)} canRemove={form.replacement.length > 1} />
            ))}
            {form.replacement.length < MAX_ASSETS ? (
              <button className="btn btn-ghost btn-sm no-print" onClick={() => addAsset('replacement')}><Plus size={15} /> Add another asset bought</button>
            ) : null}
            <Field label="Closing date of the first sale" hint="Sets the 45-day identification and 180-day completion deadlines.">
              <input className="input" type="date" value={form.closingDate} onChange={(e) => set('closingDate')(e.target.value)} />
            </Field>
          </Panel>
          <Panel title="Taxpayer">
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <MoneyField label="Other taxable income this year" value={form.otherIncome} onChange={set('otherIncome')} info="Income apart from these sales. Sets the capital-gains rate, the recapture rate, and whether NIIT applies." />
          </Panel>
          <RefinePanel summary={`closing costs ${form.sellPct}% / ${form.buyPct}%, equipment expensing, state`}>
            <div className="field-row">
              <NumberField label="Selling costs" value={form.sellPct} onChange={set('sellPct')} suffix="% of price" info="Commissions, transfer tax, legal, intermediary fee. Applied to every asset sold. 5–7% is typical for brokered real estate." />
              <NumberField label="Purchase closing costs" value={form.buyPct} onChange={set('buyPct')} suffix="% of price" info="Title, recording, lender and legal fees. Applied to every asset bought and added to its basis." />
            </div>
            <div className="field-row">
              <MoneyField label="Other exchange costs" value={form.otherCosts} onChange={set('otherCosts')} info="Flat amounts not tied to a price, such as the qualified intermediary's fee." />
              <SelectField label="State of residence" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} info="Simplified flat rate on recognized gain. Some states do not follow federal deferral or claw it back later." />
            </div>
            <SegmentedField label={`Expense equipment bought in ${TAX_YEAR} (100% bonus depreciation)`} value={form.expenseEquipment} onChange={set('expenseEquipment')} options={YESNO} info="Full expensing was restored permanently for property acquired after January 19, 2025. It offsets the recapture on the equipment sold." />
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Like-Kind Exchange Illustration"
              meta={r.ready ? `${shape} · ${money(r.salePrice)} sold · ${money(r.replacementPrice)} bought · ${cashDirection}` : 'Enter what was sold and what was bought'}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={`Tax due now — ${exchangeLabel.toLowerCase()}${r.relEquip.length ? ' plus equipment' : ''}`}
              value={money(r.taxNow)}
              note={`vs. ${money(r.taxSale)} selling everything outright · ${money(r.deferredGain)} of gain deferred`}
            />
            <StatTiles
              items={[
                { label: 'Gain deferred', value: money(r.deferredGain), tone: r.deferredGain > 0 ? 'good' : undefined, note: `of ${money(r.realizedGain)} realized` },
                { label: r.cashAdded > 0 ? 'Cash brought in' : 'Cash taken out', value: money(r.cashAdded > 0 ? r.cashAdded : r.cashBoot), tone: r.cashBoot > 0 ? 'bad' : undefined, note: r.mortgageBoot > 0 ? `+ ${money(r.mortgageBoot)} mortgage boot` : r.totalBoot > 0 ? 'this is boot' : 'no boot' },
                { label: 'Cash after closing', value: money(r.cashPosition), tone: r.cashPosition < 0 ? 'bad' : undefined, note: 'after tax, all assets' },
              ]}
            />
            <div className="result-list">
              <ResultRow label={`Amount realized, ${relCount} ${relCount === 1 ? 'property' : 'properties'} (after ${percent(r.sellPct * 100, 1)} costs)`} value={r.amountRealized} />
              <ResultRow label="Adjusted basis, all sold" value={r.adjustedBasis} sub />
              <ResultRow label="Realized gain" value={r.realizedGain} />
              <ResultRow label="Cash taken out" value={r.cashBoot} sub />
              <ResultRow label="Cash brought in" value={r.cashAdded} sub />
              <ResultRow label="Mortgage boot (debt relief not replaced)" value={r.mortgageBoot} sub />
              <ResultRow label="Gain recognized on the exchange" value={r.recognizedGain} />
              <ResultRow label={`Unrecaptured §1250 gain at ${percent(r.exchangeTax.rate1250 * 100, 0)}`} value={r.exchangeTax.tax1250} sub />
              <ResultRow label="Capital gain at 0/15/20%" value={r.exchangeTax.taxLtcg} sub />
              <ResultRow label="Net investment income tax" value={r.exchangeTax.niit} sub />
              <ResultRow label={`State tax (${st.name})`} value={r.exchangeTax.state} sub />
              {r.relEquip.length || r.repEquip.length ? <ResultRow label={`Equipment: recapture ${money(r.equipRecapture)}${r.bonus ? ` less ${money(r.bonus)} expensed` : ''}, net tax`} value={r.equipTax} sub /> : null}
              <ResultRow label="Tax due now" value={r.taxNow} total negative={r.taxNow > 0} positive={r.taxNow < 0} />
            </div>

            <Narrative>
              {r.ready ? (
                <>
                  {relCount === 1 ? 'The property' : `The ${relCount} properties`} sold for {money(r.salePrice)} after {money(r.sellingCosts)} of costs against a {money(r.adjustedBasis)} adjusted basis, realizing a {money(r.realizedGain)} gain, {money(r.depreciation)} of it depreciation recapture.
                  {' '}
                  {r.realizedGain === 0
                    ? 'There is no gain to defer.'
                    : r.isFull
                      ? `Reinvesting the full ${money(r.netEquity)} of proceeds${r.cashAdded > 0 ? ` plus ${money(r.cashAdded)} of new cash` : ''} and replacing the debt leaves no boot, so the whole gain is deferred and the ${repCount === 1 ? 'replacement takes' : `${repCount} replacements share`} a ${money(r.replacementBasis)} basis.`
                      : `As entered there is ${money(r.totalBoot)} of boot (${money(r.cashBoot)} cash out, ${money(r.mortgageBoot)} debt not replaced), so ${money(r.recognizedGain)} is taxed now, about ${money(r.exchangeTax.total)}, and ${money(r.deferredGain)} is deferred. To defer everything, ${r.fullFix}.`}
                  {r.relEquip.length ? ` The equipment sold is a separate taxable sale: ${money(r.equipRecapture)} of §1245 recapture at ordinary rates${r.bonus ? `, offset by expensing the ${money(r.equipBoughtTotal)} of equipment bought` : ''}, for a net ${money(r.equipTax)} in tax.` : ''}
                  {' '}Selling everything outright would cost about {money(r.taxSale)} in tax and leave {money(r.cashAfterSale)} in hand; the exchange leaves {money(r.cashPosition)}.
                  {idDate ? ` Identify replacement property by ${fmtDate(idDate)} and close by ${fmtDate(closeDate)}.` : ''}
                </>
              ) : (
                'Enter each asset sold and bought. Mark tractors, vehicles, and other equipment as Equipment so they are taxed correctly outside the exchange. The estimate updates as you type.'
              )}
            </Narrative>

            <ScenarioCards
              sub="tax and cash today"
              scenarios={[
                { label: 'Sell everything outright', value: money(r.taxSale), rows: [{ label: 'Gain taxed now', value: money(r.realizedGain + r.equipRecapture + r.equipSec1231) }, { label: 'Cash after tax', value: money(r.cashAfterSale) }, { label: 'Gain deferred', value: '$0' }] },
                { label: `${exchangeLabel}${r.relEquip.length ? ' + equipment' : ''}`, value: money(r.taxNow), best: r.realizedGain > 0, rows: [{ label: 'Gain taxed now', value: money(r.recognizedGain + r.equipRecapture + r.equipSec1231) }, { label: 'Cash after tax', value: money(r.cashPosition) }, { label: 'Gain deferred', value: money(r.deferredGain) }] },
              ]}
            />

            {r.ready ? (
              <table className="data-table" style={{ marginTop: 14 }}>
                <thead><tr><th>Asset</th><th>Treatment</th><th className="num">Price</th><th className="num">Gain / basis</th></tr></thead>
                <tbody>
                  {r.relReal.map((a) => (
                    <tr key={a.id}><td>{a.name || 'Property sold'}</td><td>Relinquished · like-kind</td><td className="num">{money(a.price)}</td><td className="num">{money(a.gain)} gain</td></tr>
                  ))}
                  {r.equipSold.map((a) => (
                    <tr key={a.id}><td>{a.name || 'Equipment sold'}</td><td>Taxable sale · §1245</td><td className="num">{money(a.price)}</td><td className="num">{a.loss > 0 ? `${money(a.loss)} loss` : `${money(a.gain)} gain`}</td></tr>
                  ))}
                  {r.repReal.map((a) => (
                    <tr key={a.id}><td>{a.name || 'Property bought'}</td><td>Replacement · carryover basis</td><td className="num">{money(a.price)}</td><td className="num">{money(a.basis)} basis</td></tr>
                  ))}
                  {r.repEquip.map((a) => (
                    <tr key={a.id}><td>{a.name || 'Equipment bought'}</td><td>{r.expenseEquipment ? `Expensed in ${TAX_YEAR}` : 'Depreciable'}</td><td className="num">{money(a.price)}</td><td className="num">{money(a.total)} basis</td></tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {r.realizedGain > 0 ? (
              <div className="chart-block">
                <BarCompare
                  height={150}
                  groups={[
                    { label: 'Sell outright', bars: [{ label: 'Tax due now', value: r.taxSale, color: TONE.tax }] },
                    { label: exchangeLabel, bars: [{ label: 'Tax due now', value: r.taxNow, color: TONE.tax }] },
                  ]}
                />
              </div>
            ) : null}

            {idDate ? (
              <div className="result-list" style={{ marginTop: 8 }}>
                <ResultRow label={`Identify replacement property within ${ID_DAYS} days`} raw={fmtDate(idDate)} />
                <ResultRow label={`Close on the replacement within ${CLOSE_DAYS} days`} raw={fmtDate(closeDate)} />
              </div>
            ) : null}
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">
        Boot is what makes an exchange partial: cash taken out, proceeds not reinvested, and debt given up that is not replaced with new debt or fresh cash. Every dollar of boot is taxed, up to the realized gain, with the depreciation portion first at up to 25%. With several properties on either side the test is run on the totals: all proceeds must go into all replacements and total debt must be replaced. Equipment is the trap in a farm or business sale: since 2018 it cannot ride along in the exchange, its depreciation is recaptured at ordinary rates the year it is sold, and the usual answer is to expense the replacement equipment in the same year.
      </Note>

      <Assumptions
        items={[
          'Real property held for investment or business use qualifies as like-kind; personal residences and dealer inventory do not. Equipment, vehicles, livestock, and other personal property have been excluded from §1031 since 2018 and are treated as taxable sales here.',
          `Selling costs default to ${DEFAULT_SELL_COST_PCT}% of price and purchase closing costs to ${DEFAULT_BUY_COST_PCT}%, applied to every asset; both are adjustable. Purchase costs are added to basis.`,
          'With several properties, realized gain, proceeds, and debt are totaled across all real property (losses on one net against gains on another) and the carryover basis is allocated to the replacements in proportion to price. The exchange-group rules of Reg. §1.1031(j)-1 can produce a different answer for mixed exchanges; the actuary of a 1031, the intermediary or tax adviser, should confirm.',
          'Gain recognized is the lesser of realized gain and total boot. Boot is cash taken out, proceeds not reinvested, and net debt relief not offset by cash brought in.',
          `Recognized real-property gain is taxed as unrecaptured §1250 gain first (ordinary rate capped at 25%), then at the ${TAX_YEAR} 0/15/20% rates stacked above other taxable income after the standard deduction, plus NIIT above the MAGI threshold. Equipment gain is §1245 recapture at the marginal ordinary rate up to depreciation taken, the excess as §1231 gain at capital rates; NIIT is not applied to equipment from an active business.`,
          'Equipment bought is expensed in full when the toggle is on (100% bonus depreciation, permanent for property acquired after January 19, 2025); it is assumed to be placed in service in the same tax year as the equipment sale.',
          'State tax is a flat simplified rate on recognized gain and net ordinary equipment income. Several states tax deferred gain when the replacement is out of state or on a later sale; not modeled.',
          'Deadlines run 45 and 180 calendar days from the first sale closing; the 180-day period ends earlier if the return, including extensions, is due first. A qualified intermediary must hold the proceeds.',
          'Baseline model. Not reviewed by Grott Luker & Co.',
        ]}
      />
    </ToolShell>
  )
}
