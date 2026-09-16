import { useState, useMemo } from 'react'
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
import { capitalGainsTax, niitTax, marginalOrdinaryRate, STANDARD_DEDUCTION, TAX_YEAR } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

// Unrecaptured §1250 gain is taxed at ordinary rates, capped at 25%.
const SEC1250_CAP = 0.25
const ID_DAYS = 45
const CLOSE_DAYS = 180

const BLANK = {
  salePrice: '',
  sellingCosts: '',
  cost: '',
  depreciation: '',
  oldDebt: '',
  replacementPrice: '',
  replacementCosts: '0',
  newDebt: '',
  closingDate: '',
  filing: 'married',
  otherIncome: '',
  state: 'NH',
}

const SAMPLE = {
  salePrice: '1200000',
  sellingCosts: '72000',
  cost: '650000',
  depreciation: '180000',
  oldDebt: '400000',
  replacementPrice: '1400000',
  replacementCosts: '15000',
  newDebt: '700000',
  closingDate: '2026-10-15',
  filing: 'married',
  otherIncome: '250000',
  state: 'NH',
}

function addDays(iso, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d
}
const fmtDate = (d) => (d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—')

// Tax on a recognized gain: §1250 portion first (capped at 25%), the rest at
// capital-gains rates stacked above ordinary income and the §1250 gain, NIIT on
// the whole gain above the MAGI threshold, and a flat state rate.
function taxOnGain(gain, depreciation, otherTaxable, otherIncome, filing, stateRate, marginal) {
  const g = Math.max(0, gain)
  const unrecap = Math.min(g, Math.max(0, depreciation))
  const capital = g - unrecap
  const rate1250 = Math.min(SEC1250_CAP, marginal)
  const tax1250 = unrecap * rate1250
  const taxLtcg = capitalGainsTax(capital, otherTaxable + unrecap, filing)
  const niit = niitTax(g, otherIncome + g, filing)
  const state = g * stateRate
  return { gain: g, unrecap, capital, rate1250, tax1250, taxLtcg, niit, state, total: tax1250 + taxLtcg + niit + state }
}

function compute(form) {
  const filing = form.filing === 'single' ? 'single' : 'married'
  const salePrice = toNumber(form.salePrice)
  const sellingCosts = toNumber(form.sellingCosts)
  const cost = toNumber(form.cost)
  const depreciation = Math.min(toNumber(form.depreciation), cost)
  const oldDebt = toNumber(form.oldDebt)
  const replacementPrice = toNumber(form.replacementPrice)
  const replacementCosts = toNumber(form.replacementCosts)
  const newDebt = toNumber(form.newDebt)
  const otherIncome = toNumber(form.otherIncome)
  const st = getState(form.state)
  const stateRate = st.capGains / 100

  const amountRealized = Math.max(0, salePrice - sellingCosts)
  const adjustedBasis = Math.max(0, cost - depreciation)
  const realizedGain = Math.max(0, amountRealized - adjustedBasis)
  const netEquity = Math.max(0, amountRealized - oldDebt) // cash the intermediary holds

  // Replacement side.
  const equityIn = Math.max(0, replacementPrice + replacementCosts - newDebt) // cash needed to close
  const cashBoot = Math.max(0, netEquity - equityIn) // cash the taxpayer takes out
  const cashAdded = Math.max(0, equityIn - netEquity) // fresh cash the taxpayer brings
  const debtRelief = Math.max(0, oldDebt - newDebt)
  const mortgageBoot = Math.max(0, debtRelief - cashAdded) // debt relief not offset by new debt or cash
  const totalBoot = cashBoot + mortgageBoot
  const recognizedGain = Math.min(realizedGain, totalBoot)
  const deferredGain = realizedGain - recognizedGain
  const replacementBasis = Math.max(0, replacementPrice + replacementCosts - deferredGain)
  const isFull = realizedGain > 0 && recognizedGain === 0
  const tradingDown = replacementPrice + replacementCosts < amountRealized

  const otherTaxable = Math.max(0, otherIncome - STANDARD_DEDUCTION[filing])
  const marginal = marginalOrdinaryRate(otherTaxable, filing)
  const exchange = taxOnGain(recognizedGain, depreciation, otherTaxable, otherIncome, filing, stateRate, marginal)
  const sale = taxOnGain(realizedGain, depreciation, otherTaxable, otherIncome, filing, stateRate, marginal)

  // What a fully deferred exchange would take from here.
  const needReplaceDebt = Math.max(0, debtRelief - cashAdded)
  const fullFix = cashBoot > 0 || mortgageBoot > 0
    ? `reinvest the ${money(cashBoot)} taken out${mortgageBoot > 0 ? ` and replace ${money(needReplaceDebt)} of debt, or add that much cash` : ''}`
    : ''

  const idDate = addDays(form.closingDate, ID_DAYS)
  const closeDate = addDays(form.closingDate, CLOSE_DAYS)

  return {
    filing, salePrice, sellingCosts, cost, depreciation, oldDebt, replacementPrice, replacementCosts, newDebt, otherIncome, st, stateRate,
    amountRealized, adjustedBasis, realizedGain, netEquity, equityIn, cashBoot, cashAdded, debtRelief, mortgageBoot, totalBoot,
    recognizedGain, deferredGain, replacementBasis, isFull, tradingDown, marginal, exchange, sale, fullFix, idDate, closeDate,
    cashAfterExchange: cashBoot - exchange.total,
    cashAfterSale: netEquity - sale.total,
  }
}

export default function Exchange1031() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  const steps = useMemo(() => [
    { label: 'Amount realized', formula: `sale price ${money(r.salePrice, 2)} − selling costs ${money(r.sellingCosts, 2)}`, result: money(r.amountRealized, 2) },
    { label: 'Adjusted basis', formula: `cost and improvements ${money(r.cost, 2)} − depreciation ${money(r.depreciation, 2)}`, result: money(r.adjustedBasis, 2) },
    { label: 'Realized gain', formula: `${money(r.amountRealized, 2)} − ${money(r.adjustedBasis, 2)}`, result: money(r.realizedGain, 2) },
    { label: 'Exchange proceeds held by the intermediary', formula: `${money(r.amountRealized, 2)} − mortgage paid off ${money(r.oldDebt, 2)}`, result: money(r.netEquity, 2) },
    { label: 'Cash needed to close the replacement', formula: `${money(r.replacementPrice, 2)} + closing costs ${money(r.replacementCosts, 2)} − new mortgage ${money(r.newDebt, 2)}`, result: money(r.equityIn, 2) },
    { label: 'Cash boot (taken out)', formula: `max(0, ${money(r.netEquity, 2)} − ${money(r.equityIn, 2)})`, result: money(r.cashBoot, 2) },
    { label: 'Cash added from outside the exchange', formula: `max(0, ${money(r.equityIn, 2)} − ${money(r.netEquity, 2)})`, result: money(r.cashAdded, 2) },
    { label: 'Mortgage boot (net debt relief)', formula: `max(0, (${money(r.oldDebt, 2)} − ${money(r.newDebt, 2)}) − cash added ${money(r.cashAdded, 2)})`, result: money(r.mortgageBoot, 2) },
    { label: 'Gain recognized', formula: `lesser of realized gain ${money(r.realizedGain, 2)} and total boot ${money(r.totalBoot, 2)}`, result: money(r.recognizedGain, 2) },
    { label: 'Gain deferred', formula: `${money(r.realizedGain, 2)} − ${money(r.recognizedGain, 2)}`, result: money(r.deferredGain, 2) },
    { label: 'Basis in the replacement property', formula: `${money(r.replacementPrice + r.replacementCosts, 2)} − deferred gain ${money(r.deferredGain, 2)}`, result: money(r.replacementBasis, 2) },
    { label: 'Unrecaptured §1250 gain (recognized)', formula: `lesser of gain recognized and depreciation taken · taxed at ${percent(r.exchange.rate1250 * 100, 0)}`, result: `${money(r.exchange.unrecap, 2)} → ${money(r.exchange.tax1250, 2)}` },
    { label: 'Capital gain portion (recognized)', formula: `${money(r.exchange.capital, 2)} stacked above ${money(r.otherIncome, 2)} other income, ${TAX_YEAR} 0/15/20% breaks`, result: money(r.exchange.taxLtcg, 2) },
    { label: 'Net investment income tax', formula: `3.8% × gain above the MAGI threshold`, result: money(r.exchange.niit, 2) },
    { label: `State (${r.st.name})`, formula: `${percent(r.st.capGains, 1)} × ${money(r.recognizedGain, 2)}`, result: money(r.exchange.state, 2) },
    { label: 'Tax due now, exchange as entered', formula: 'sum of the four lines above', result: money(r.exchange.total, 2) },
    { label: 'Tax on an outright sale, for comparison', formula: `same rates on the full ${money(r.realizedGain, 2)} realized gain`, result: money(r.sale.total, 2) },
    ...(r.idDate ? [{ label: 'Deadlines', formula: `${ID_DAYS} and ${CLOSE_DAYS} days from the ${form.closingDate} closing`, result: `identify by ${fmtDate(r.idDate)} · close by ${fmtDate(r.closeDate)}` }] : []),
  ], [r, form.closingDate])

  const ready = r.salePrice > 0 && r.cost > 0
  const exchangeLabel = r.realizedGain === 0 ? 'Exchange as entered' : r.isFull ? 'Full exchange (as entered)' : 'Partial exchange (as entered)'

  return (
    <ToolShell
      title="1031 Exchange Analyzer"
      subtitle="Full or partial like-kind exchange of investment real estate: the gain realized, the boot that makes part of it taxable, depreciation recapture, the tax due now against an outright sale, the gain deferred, the carryover basis, and the 45- and 180-day deadlines."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Property sold (relinquished)">
            <div className="field-row">
              <MoneyField label="Sale price" value={form.salePrice} onChange={set('salePrice')} />
              <MoneyField label="Selling costs" value={form.sellingCosts} onChange={set('sellingCosts')} info="Commissions, transfer tax, legal, intermediary fee." />
            </div>
            <div className="field-row">
              <MoneyField label="Cost plus improvements" value={form.cost} onChange={set('cost')} info="Original purchase price plus capital improvements over the years." />
              <MoneyField label="Depreciation taken" value={form.depreciation} onChange={set('depreciation')} info="Total depreciation claimed (or allowable) since purchase. This part of the gain is taxed at up to 25% when recognized." />
            </div>
            <MoneyField label="Mortgage paid off at closing" value={form.oldDebt} onChange={set('oldDebt')} />
          </Panel>
          <Panel title="Property bought (replacement)">
            <div className="field-row">
              <MoneyField label="Purchase price" value={form.replacementPrice} onChange={set('replacementPrice')} />
              <MoneyField label="New mortgage" value={form.newDebt} onChange={set('newDebt')} info="Debt on the replacement. Debt you give up and do not replace is mortgage boot unless you add cash." />
            </div>
            <Field label="Closing date of the sale" hint="Sets the 45-day identification and 180-day completion deadlines.">
              <input className="input" type="date" value={form.closingDate} onChange={(e) => set('closingDate')(e.target.value)} />
            </Field>
          </Panel>
          <Panel title="Taxpayer">
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <MoneyField label="Other taxable income this year" value={form.otherIncome} onChange={set('otherIncome')} info="Income apart from this sale. Sets which capital-gains rate and whether NIIT applies." />
          </Panel>
          <RefinePanel summary="replacement closing costs, state">
            <div className="field-row">
              <MoneyField label="Replacement closing costs" value={form.replacementCosts} onChange={set('replacementCosts')} info="Added to the replacement basis and to the cash needed to close." />
              <SelectField label="State of residence" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} info="Simplified flat rate on the recognized gain. Some states do not recognize deferral or claw it back on a later sale; ask before relying on it." />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Like-Kind Exchange Illustration"
              meta={ready ? `${money(r.salePrice)} sold · ${money(r.replacementPrice)} bought · ${r.st.name}` : 'Enter the sale and the replacement to begin'}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={`Tax due now — ${exchangeLabel.toLowerCase()}`}
              value={money(r.exchange.total)}
              note={`vs. ${money(r.sale.total)} on an outright sale · ${money(r.deferredGain)} of gain deferred`}
            />
            <StatTiles
              items={[
                { label: 'Gain deferred', value: money(r.deferredGain), tone: r.deferredGain > 0 ? 'good' : undefined, note: `of ${money(r.realizedGain)} realized` },
                { label: 'Boot recognized', value: money(r.recognizedGain), tone: r.recognizedGain > 0 ? 'bad' : undefined, note: r.totalBoot > 0 ? `${money(r.cashBoot)} cash · ${money(r.mortgageBoot)} debt` : 'no boot' },
                { label: 'Basis in replacement', value: money(r.replacementBasis), note: 'carries over, less deferral' },
              ]}
            />
            <div className="result-list">
              <ResultRow label="Amount realized (after selling costs)" value={r.amountRealized} />
              <ResultRow label="Adjusted basis (cost less depreciation)" value={r.adjustedBasis} sub />
              <ResultRow label="Realized gain" value={r.realizedGain} />
              <ResultRow label="Cash boot taken out" value={r.cashBoot} sub />
              <ResultRow label="Mortgage boot (debt relief not replaced)" value={r.mortgageBoot} sub />
              <ResultRow label="Gain recognized" value={r.recognizedGain} />
              <ResultRow label={`Unrecaptured §1250 gain at ${percent(r.exchange.rate1250 * 100, 0)}`} value={r.exchange.tax1250} sub />
              <ResultRow label="Capital gain at 0/15/20%" value={r.exchange.taxLtcg} sub />
              <ResultRow label="Net investment income tax" value={r.exchange.niit} sub />
              <ResultRow label={`State tax (${r.st.name})`} value={r.exchange.state} sub />
              <ResultRow label="Tax due now" value={r.exchange.total} total negative={r.exchange.total > 0} />
            </div>

            <Narrative>
              {ready ? (
                <>
                  Selling for {money(r.salePrice)} after {money(r.sellingCosts)} of costs against a {money(r.adjustedBasis)} adjusted basis realizes a {money(r.realizedGain)} gain, {money(r.depreciation)} of it depreciation recapture.
                  {' '}
                  {r.realizedGain === 0
                    ? 'There is no gain to defer.'
                    : r.isFull
                      ? `Reinvesting the full ${money(r.netEquity)} of proceeds and replacing the debt leaves no boot, so the whole gain is deferred and the replacement takes a ${money(r.replacementBasis)} basis.`
                      : `The exchange as entered leaves ${money(r.totalBoot)} of boot (${money(r.cashBoot)} cash taken out, ${money(r.mortgageBoot)} debt not replaced), so ${money(r.recognizedGain)} is taxed now, about ${money(r.exchange.total)}, and ${money(r.deferredGain)} is deferred. To defer everything, ${r.fullFix}.`}
                  {' '}An outright sale would cost about {money(r.sale.total)} in tax today and leave {money(r.cashAfterSale)} in hand.
                  {r.idDate ? ` Identify replacement property by ${fmtDate(r.idDate)} and close by ${fmtDate(r.closeDate)}.` : ''}
                </>
              ) : (
                'Enter the sale, the replacement, and the taxpayer’s other income. The estimate updates as you type.'
              )}
            </Narrative>

            <ScenarioCards
              sub="tax and cash today"
              scenarios={[
                { label: 'Outright sale', value: money(r.sale.total), rows: [{ label: 'Gain taxed now', value: money(r.realizedGain) }, { label: 'Cash after tax', value: money(r.cashAfterSale) }, { label: 'Gain deferred', value: '$0' }] },
                { label: exchangeLabel, value: money(r.exchange.total), best: r.realizedGain > 0, rows: [{ label: 'Gain taxed now', value: money(r.recognizedGain) }, { label: 'Cash after tax', value: money(r.cashAfterExchange) }, { label: 'Gain deferred', value: money(r.deferredGain) }] },
              ]}
            />

            {r.realizedGain > 0 ? (
              <div className="chart-block">
                <BarCompare
                  height={150}
                  groups={[
                    { label: 'Outright sale', bars: [{ label: 'Tax due now', value: r.sale.total, color: TONE.tax }] },
                    { label: exchangeLabel, bars: [{ label: 'Tax due now', value: r.exchange.total, color: TONE.tax }] },
                  ]}
                />
              </div>
            ) : null}

            {r.idDate ? (
              <div className="result-list" style={{ marginTop: 8 }}>
                <ResultRow label={`Identify replacement property within ${ID_DAYS} days`} raw={fmtDate(r.idDate)} />
                <ResultRow label={`Close on the replacement within ${CLOSE_DAYS} days`} raw={fmtDate(r.closeDate)} />
              </div>
            ) : null}
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Reading the result">
        Boot is what makes an exchange partial: cash the seller takes out, and debt given up that is not replaced with new debt or fresh cash. Every dollar of boot is taxed, up to the realized gain, and the depreciation portion comes first at up to 25%. Trading down in price or in debt is the usual cause. The deferred gain does not disappear; it lowers the basis of the replacement and is taxed when that property is sold outside an exchange, or eliminated at death under current law.
      </Note>

      <Assumptions
        items={[
          'Both properties are held for investment or business use and qualify as like-kind real property; personal residences and dealer inventory do not.',
          'Gain recognized equals the lesser of realized gain and total boot. Mortgage boot is net debt relief less cash the taxpayer adds; new debt offsets old debt dollar for dollar.',
          'Recognized gain is taxed as unrecaptured §1250 gain first (ordinary rate capped at 25%), then at the 2026 0/15/20% long-term rates stacked above other taxable income after the standard deduction. NIIT applies to the gain above the MAGI threshold; active real estate professionals may be exempt.',
          'State tax is a flat simplified rate on the recognized gain. Several states tax the deferred gain when the replacement is out of state or on a later sale; not modeled.',
          'Deadlines are 45 and 180 calendar days from the sale closing. The 180-day period ends earlier if the tax return, including extensions, is due first. A qualified intermediary must hold the proceeds; the taxpayer may not touch them.',
          'Replacement basis is purchase price plus closing costs less deferred gain. Depreciation on the replacement is not modeled.',
          'Baseline model. Not reviewed by Grott Luker & Co.',
        ]}
      />
    </ToolShell>
  )
}
