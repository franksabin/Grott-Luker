import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SelectField,
  SegmentedField,
  ResultRow,
  Stat,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { StackedBar, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { capitalGainsTax, niitTax } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const ENTITY_OPTIONS = [
  { value: 'sole_prop', label: 'Sole proprietorship' },
  { value: 'llc', label: 'LLC (single or multi-member)' },
  { value: 'partnership', label: 'Partnership' },
  { value: 's_corp', label: 'S-Corporation' },
  { value: 'c_corp', label: 'C-Corporation' },
]

const STRUCTURE_OPTIONS = [
  { value: 'asset', label: 'Asset sale' },
  { value: 'stock', label: 'Stock / equity sale' },
]

const FILING_OPTIONS = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const BLANK = {
  salePrice: '',
  costBasis: '',
  sellingExpenses: '',
  debtPayoff: '',
  otherIncome: '',
  entity: 'llc',
  structure: 'asset',
  filing: 'married',
  state: 'NH',
  installment: 'no',
  installmentYears: '5',
}

const SAMPLE = {
  salePrice: '6000000',
  costBasis: '1200000',
  sellingExpenses: '360000',
  debtPayoff: '750000',
  otherIncome: '200000',
  entity: 'llc',
  structure: 'asset',
  filing: 'married',
  state: 'NH',
  installment: 'no',
  installmentYears: '5',
}

const CORP_RATE = 0.21

function compute(form) {
  const salePrice = toNumber(form.salePrice)
  const costBasis = toNumber(form.costBasis)
  const sellingExpenses = toNumber(form.sellingExpenses)
  const debtPayoff = toNumber(form.debtPayoff)
  const otherIncome = toNumber(form.otherIncome)
  const st = getState(form.state)
  const filing = form.filing
  const isCCorpAsset = form.entity === 'c_corp' && form.structure === 'asset'

  const totalGain = Math.max(0, salePrice - costBasis - sellingExpenses)

  // Corporate-level tax (C-corp asset sale only).
  const corpTax = isCCorpAsset ? totalGain * CORP_RATE : 0

  // Personal-level long-term capital gain.
  // For a C-corp asset sale, the shareholder is taxed on the net distribution
  // above basis; simplified as (gain − corporate tax).
  const personalGain = isCCorpAsset ? Math.max(0, totalGain - corpTax) : totalGain

  const fedCapGains = capitalGainsTax(personalGain, otherIncome, filing)
  const magi = otherIncome + personalGain
  const niit = niitTax(personalGain, magi, filing)
  const federalTax = corpTax + fedCapGains + niit

  const stateTax = personalGain * (st.capGains / 100)

  const totalTax = federalTax + stateTax
  const netProceeds = salePrice - sellingExpenses - debtPayoff // pre-tax cash
  const liquidAfterTax = netProceeds - totalTax

  const effectiveTaxRate = totalGain > 0 ? totalTax / totalGain : 0

  // Installment illustration — equal annual recognition.
  const installment = form.installment === 'yes'
  const years = Math.max(1, Math.round(toNumber(form.installmentYears) || 1))
  let year1 = null
  if (installment && totalGain > 0) {
    const gainPerYear = personalGain / years
    const fedY1 =
      capitalGainsTax(gainPerYear, otherIncome, filing) +
      niitTax(gainPerYear, otherIncome + gainPerYear, filing)
    const stateY1 = gainPerYear * (st.capGains / 100)
    const corpY1 = corpTax / years
    year1 = {
      years,
      gainPerYear,
      federal: corpY1 + fedY1,
      state: stateY1,
      total: corpY1 + fedY1 + stateY1,
    }
  }

  return {
    salePrice,
    costBasis,
    sellingExpenses,
    debtPayoff,
    totalGain,
    corpTax,
    fedCapGains,
    niit,
    federalTax,
    stateTax,
    totalTax,
    netProceeds,
    liquidAfterTax,
    effectiveTaxRate,
    isCCorpAsset,
    stateName: st.name,
    installment,
    year1,
  }
}

export default function BusinessSale() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  return (
    <ToolShell
      title="Business Sale & Net Liquidity Estimator"
      subtitle="Estimate after-tax proceeds and net liquidity from the sale of a business. This tool illustrates liquidity after taxes only — it does not address how proceeds might later be invested or drawn upon."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Transaction Details">
            <div className="field-row">
              <MoneyField
                label="Sale price"
                value={form.salePrice}
                onChange={set('salePrice')}
                info="The total agreed purchase price for the business or its assets, before any costs or taxes."
              />
              <MoneyField
                label="Cost basis"
                value={form.costBasis}
                onChange={set('costBasis')}
                info="Your tax basis in what is being sold — generally what you originally invested plus improvements, less depreciation. Gain is measured against this."
              />
            </div>
            <div className="field-row">
              <MoneyField
                label="Selling expenses"
                value={form.sellingExpenses}
                onChange={set('sellingExpenses')}
                info="Transaction costs such as broker/advisor fees, legal and accounting fees, and closing costs."
              />
              <MoneyField
                label="Debt to be paid off"
                value={form.debtPayoff}
                onChange={set('debtPayoff')}
                info="Business debt that must be repaid from the sale proceeds at closing. Reduces cash received but is not tax-deductible against the gain."
              />
            </div>
          </Panel>

          <Panel title="Structure & Taxation">
            <SelectField
              label="Entity type"
              value={form.entity}
              onChange={set('entity')}
              options={ENTITY_OPTIONS}
              info="How the business is taxed. Pass-through entities are taxed once at the owner level; C-corporations can face tax at both the company and owner level."
            />
            <SegmentedField
              label="Transaction structure"
              value={form.structure}
              onChange={set('structure')}
              options={STRUCTURE_OPTIONS}
              info="In an asset sale the buyer purchases the assets; in a stock/equity sale the buyer purchases the ownership interest. The structure affects how gain is taxed."
            />
            <div className="field-row">
              <SegmentedField
                label="Filing status"
                value={form.filing}
                onChange={set('filing')}
                options={FILING_OPTIONS}
              />
              <SelectField
                label="State of residence"
                value={form.state}
                onChange={set('state')}
                options={STATES.map((s) => ({ value: s.code, label: s.name }))}
                info="Used to apply a simplified state tax rate to the gain. State treatment varies widely."
              />
            </div>
            <MoneyField
              label="Other household taxable income (this year)"
              value={form.otherIncome}
              onChange={set('otherIncome')}
              info="Approximate taxable income apart from the sale. Capital gains stack on top of ordinary income, so this determines which capital-gains rate applies."
              hint="Optional — improves the accuracy of the capital-gains rate estimate."
            />
          </Panel>

          <Panel title="Installment Sale">
            <SegmentedField
              label="Installment sale?"
              value={form.installment}
              onChange={set('installment')}
              options={[
                { value: 'no', label: 'No — paid at closing' },
                { value: 'yes', label: 'Yes — paid over time' },
              ]}
              info="An installment sale spreads the sale price — and the taxable gain — across multiple years as payments are received, which can defer and sometimes reduce tax."
            />
            {form.installment === 'yes' ? (
              <NumberField
                label="Number of years"
                value={form.installmentYears}
                onChange={set('installmentYears')}
                suffix="yrs"
              />
            ) : null}
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Net Liquidity Summary"
              meta="Estimated after-tax proceeds"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />

            <FeatureBlock
              label="Estimated liquid proceeds after taxes"
              value={money(r.liquidAfterTax)}
              note={`On a ${money(r.totalGain)} capital gain · ${percent(r.effectiveTaxRate * 100)} effective tax rate`}
            />

            <Narrative>
              On a sale price of {money(r.salePrice)}, we estimate a capital gain
              of {money(r.totalGain)} and combined taxes and transaction costs of
              approximately {money(r.totalTax + r.sellingExpenses)}. After debt
              payoff of {money(r.debtPayoff)}, this leaves an estimated{' '}
              {money(r.liquidAfterTax)} in liquid proceeds after taxes — an
              effective rate of {percent(r.effectiveTaxRate * 100)} on the gain.
            </Narrative>

            <div className="result-list">
              <ResultRow label="Sale price" value={r.salePrice} />
              <ResultRow label="Less: cost basis" value={-r.costBasis} raw={`(${money(r.costBasis)})`} />
              <ResultRow
                label="Less: selling expenses"
                raw={`(${money(r.sellingExpenses)})`}
              />
              <ResultRow label="Capital gain" value={r.totalGain} total />
            </div>

            <div className="result-list" style={{ marginTop: 20 }}>
              {r.isCCorpAsset ? (
                <ResultRow
                  label="Estimated corporate-level tax (21%)"
                  info="A C-corporation asset sale is taxed first at the corporate level, then again when proceeds are distributed to owners."
                  raw={`(${money(r.corpTax)})`}
                  negative
                />
              ) : null}
              <ResultRow
                label="Estimated federal tax"
                info="Federal long-term capital gains tax plus, where applicable, the 3.8% Net Investment Income Tax and any corporate-level tax."
                raw={`(${money(r.federalTax)})`}
                negative
              />
              <ResultRow
                label={`Estimated state tax (${r.stateName})`}
                raw={`(${money(r.stateTax)})`}
                negative
              />
              <ResultRow
                label="Estimated transaction costs"
                info="Selling expenses entered above."
                raw={`(${money(r.sellingExpenses)})`}
                negative
              />
              <ResultRow
                label="Debt payoff at closing"
                raw={`(${money(r.debtPayoff)})`}
                negative
              />
            </div>

            <div className="result-list" style={{ marginTop: 20 }}>
              <ResultRow
                label="Net proceeds (after costs & debt, pre-tax)"
                info="Sale price less selling expenses and debt payoff, before income taxes."
                value={r.netProceeds}
              />
              <ResultRow
                label="Estimated liquid proceeds after taxes"
                value={r.liquidAfterTax}
                total
                positive={r.liquidAfterTax >= 0}
                negative={r.liquidAfterTax < 0}
              />
            </div>

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Where the sale price goes
              </div>
              <StackedBar
                data={[
                  { label: 'Liquid proceeds after taxes', value: Math.max(0, r.liquidAfterTax), color: TONE.net },
                  { label: 'Federal tax', value: r.federalTax, color: TONE.tax },
                  { label: 'State tax', value: r.stateTax, color: TONE.state },
                  { label: 'Transaction costs', value: r.sellingExpenses, color: TONE.cost },
                  { label: 'Debt payoff', value: r.debtPayoff, color: TONE.debt },
                ]}
              />
            </div>

            <div className="report-footer">
              Prepared for discussion with Grott Luker &amp; Co.
            </div>
          </section>

          {r.installment && r.year1 ? (
            <Panel title="Installment Sale Illustration">
              <p className="small muted" style={{ marginTop: 0 }}>
                Assuming the gain is recognized evenly over {r.year1.years} years
                (equal annual payments). Interest income on the installment note
                is not modeled.
              </p>
              <div className="result-list">
                <ResultRow label="Gain recognized per year" value={r.year1.gainPerYear} />
                <ResultRow label="Estimated federal tax — Year 1" raw={`(${money(r.year1.federal)})`} negative />
                <ResultRow label="Estimated state tax — Year 1" raw={`(${money(r.year1.state)})`} negative />
                <ResultRow label="Estimated total tax — Year 1" value={r.year1.total} total />
              </div>
            </Panel>
          ) : null}

          <Note title="What this tool does not cover">
            This estimator stops at net liquidity after taxes. By design, it does
            not address retirement planning, retirement readiness, investment
            projections, or withdrawal planning. Those conversations are best had
            directly with Grott Luker &amp; Co.
          </Note>
        </div>
      </div>

      <Assumptions
        items={[
          'Gain is treated as long-term capital gain taxed at 2025 federal rates. Ordinary-income recapture (e.g., depreciation, inventory, or certain asset classes in an asset sale) is not separately modeled.',
          'The 3.8% Net Investment Income Tax is applied where modified income exceeds the applicable threshold.',
          'A C-corporation asset sale is illustrated with two layers of tax: a 21% corporate rate on the gain, then personal capital-gains tax on the net distribution. This is a simplification of a fact-specific area.',
          'State tax applies a single simplified capital-gains rate for the selected state and does not reflect brackets, credits, or nonresident sourcing.',
          'Installment treatment assumes equal annual recognition of gain and ignores interest income and applicable limitations.',
          'Federal capital-gains brackets depend on total taxable income; the “other household taxable income” figure is used to place the gain in the correct bracket.',
        ]}
      />
    </ToolShell>
  )
}
