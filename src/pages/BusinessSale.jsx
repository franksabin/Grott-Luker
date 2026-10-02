import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SelectField,
  SegmentedField,
  PillField,
  RefinePanel,
  StatTiles,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { StackedBar, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { capitalGainsTax, niitTax, TAX_YEAR } from '../lib/tax.js'
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
  otherIncome: '0',
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

  const rawGain = salePrice - costBasis - sellingExpenses
  const totalGain = Math.max(0, rawGain)
  // Basis plus selling expenses above the price: nothing to tax. Whether the
  // loss is deductible depends on the assets sold and is not modeled.
  const loss = Math.max(0, -rawGain)

  // Corporate-level tax (C-corp asset sale only).
  const corpTax = isCCorpAsset ? totalGain * CORP_RATE : 0

  // Personal-level long-term capital gain.
  // For a C-corp asset sale, the shareholder is taxed on the net distribution
  // above basis; simplified as (gain − corporate tax).
  const personalGain = isCCorpAsset ? Math.max(0, totalGain - corpTax) : totalGain

  const fedCapGains = capitalGainsTax(personalGain, otherIncome, filing)
  const magi = otherIncome + personalGain
  const niit = niitTax(personalGain, magi, filing)
  const fedPersonal = fedCapGains + niit // owner-level federal tax, excludes the corporate layer
  const federalTax = corpTax + fedPersonal

  const stateTax = personalGain * (st.capGains / 100)

  const totalTax = federalTax + stateTax
  const netProceeds = salePrice - sellingExpenses - debtPayoff // pre-tax cash
  const liquidAfterTax = netProceeds - totalTax

  const effectiveTaxRate = totalGain > 0 ? totalTax / totalGain : 0

  // Installment illustration — equal annual recognition. A one-year note is
  // the same as being paid at closing, so the illustration needs 2+ years.
  const installment = form.installment === 'yes'
  const installmentYears = Math.max(1, Math.round(toNumber(form.installmentYears) || 1))
  let year1 = null
  if (installment && totalGain > 0 && installmentYears >= 2) {
    const years = installmentYears
    const gainPerYear = totalGain / years
    const personalPerYear = personalGain / years
    const fedY1 =
      capitalGainsTax(personalPerYear, otherIncome, filing) +
      niitTax(personalPerYear, otherIncome + personalPerYear, filing)
    const stateY1 = personalPerYear * (st.capGains / 100)
    const corpY1 = corpTax / years
    year1 = {
      years,
      gainPerYear,
      corp: corpY1,
      federal: fedY1,
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
    loss,
    corpTax,
    fedCapGains,
    niit,
    fedPersonal,
    federalTax,
    stateTax,
    totalTax,
    netProceeds,
    liquidAfterTax,
    effectiveTaxRate,
    isCCorpAsset,
    stateName: st.name,
    installment,
    installmentYears,
    year1,
  }
}

export default function BusinessSale() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Total gain', formula: `${money(r.salePrice, 2)} − basis ${money(r.costBasis, 2)} − selling expenses ${money(r.sellingExpenses, 2)}`, result: money(r.totalGain, 2) },
    ...(r.isCCorpAsset ? [{ label: 'Corporate-level tax', formula: `${money(r.totalGain, 2)} × ${percent(CORP_RATE * 100, 0)} (C-corp asset sale)`, result: money(r.corpTax, 2) }] : []),
    { label: 'Federal long-term capital gains tax', formula: `${TAX_YEAR} 0% / 15% / 20% breakpoints, gain stacked on other income`, result: money(r.fedCapGains, 2) },
    { label: 'Net investment income tax', formula: `3.8% × gain above the MAGI threshold`, result: money(r.niit, 2) },
    { label: 'State tax', formula: `gain × ${r.stateName} capital-gains rate`, result: money(r.stateTax, 2) },
    { label: 'Total tax', formula: 'corporate + federal + NIIT + state', result: money(r.totalTax, 2) },
    { label: 'Effective rate on the gain', formula: `${money(r.totalTax, 2)} ÷ ${money(r.totalGain, 2)}`, result: percent(r.effectiveTaxRate * 100, 1) },
    { label: 'Pre-tax cash', formula: `${money(r.salePrice, 2)} − selling expenses − debt payoff ${money(r.debtPayoff, 2)}`, result: money(r.netProceeds, 2) },
    { label: 'Net liquidity after tax', formula: `${money(r.netProceeds, 2)} − ${money(r.totalTax, 2)}`, result: money(r.liquidAfterTax, 2) },
    ...(r.year1 ? [{ label: `Installment · year 1 of ${r.year1.years}`, formula: `gain ${money(r.year1.gainPerYear, 2)} recognized per year`, result: money(r.year1.total, 2), note: 'Federal + state on the first installment only; later years depend on income then.' }] : []),
  ], [r])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const entityLabel = (ENTITY_OPTIONS.find((o) => o.value === form.entity) || ENTITY_OPTIONS[1]).label
  const structureLabel = (STRUCTURE_OPTIONS.find((o) => o.value === form.structure) || STRUCTURE_OPTIONS[0]).label
  const filingLabel = (FILING_OPTIONS.find((o) => o.value === form.filing) || FILING_OPTIONS[0]).label

  // Labels and copy shared by the screen and the print report so the two never
  // disagree. A negative result is a shortfall: label it, show it in parentheses.
  const shortfall = r.liquidAfterTax < 0
  const preTaxShort = r.netProceeds < 0
  const rate = percent(r.effectiveTaxRate * 100, 1)
  const liquidLabel = shortfall ? 'Estimated shortfall after taxes' : 'Estimated liquid proceeds after taxes'
  const liquidValue = shortfall ? `(${money(-r.liquidAfterTax)})` : money(r.liquidAfterTax)
  const netLabel = preTaxShort ? 'Shortfall after costs and debt, before tax' : 'Net proceeds after costs and debt, before tax'
  const netValue = preTaxShort ? `(${money(-r.netProceeds)})` : money(r.netProceeds)
  const federalLabel = r.isCCorpAsset ? 'Estimated federal tax on the distribution' : 'Estimated federal tax'
  const taxNote = r.isCCorpAsset ? 'corporate, federal, NIIT, state' : 'federal, NIIT, state'
  const uses = r.totalTax + r.sellingExpenses + r.debtPayoff
  const featureNote = r.loss > 0
    ? `No taxable gain — cost basis and selling expenses exceed the price by ${money(r.loss)}`
    : shortfall
      ? `Taxes, costs, and debt exceed the sale price · ${rate} effective tax rate on the ${money(r.totalGain)} gain`
      : `On a ${money(r.totalGain)} capital gain · ${rate} effective tax rate on the gain`
  const narrative = r.salePrice <= 0
    ? 'Enter a sale price, cost basis, selling expenses, and any debt to be paid off to see the estimate.'
    : r.loss > 0
    ? `On a sale price of ${money(r.salePrice)}, cost basis and selling expenses exceed the price by ${money(r.loss)}, so we estimate no taxable gain and no tax on the sale. After selling expenses of ${money(r.sellingExpenses)} and debt payoff of ${money(r.debtPayoff)}, ${shortfall ? `the proceeds fall short by ${money(-r.liquidAfterTax)} — the sale price does not cover the costs and debt` : `this leaves an estimated ${money(r.liquidAfterTax)} in liquid proceeds`}. Whether the loss is deductible depends on the assets sold and is not modeled here.`
    : `On a sale price of ${money(r.salePrice)}, we estimate a capital gain of ${money(r.totalGain)} and combined taxes and transaction costs of approximately ${money(r.totalTax + r.sellingExpenses)}. After debt payoff of ${money(r.debtPayoff)}, ${shortfall
      ? `the proceeds fall short by ${money(-r.liquidAfterTax)} — the sale price does not cover taxes, transaction costs, and debt payoff, and the difference would have to come from other funds. The effective rate is ${rate} on the gain.`
      : `this leaves an estimated ${money(r.liquidAfterTax)} in liquid proceeds after taxes — an effective rate of ${rate} on the gain.`}${r.isCCorpAsset ? ' As a C-corporation asset sale, the gain is taxed once at the corporate level and again when the proceeds are distributed.' : ''}`
  const shortfallText = `Taxes, transaction costs, and debt payoff total ${money(uses)} against a ${money(r.salePrice)} sale price — a shortfall of ${money(-r.liquidAfterTax)}. There are no liquid proceeds to allocate, so the allocation chart is omitted; the gap would have to be covered from other funds or negotiated into the deal (for example, the buyer assuming part of the debt).`
  const noTaxText = r.salePrice <= 0
    ? 'Enter a sale price and cost basis to see how the estimated tax breaks down.'
    : r.loss > 0
      ? `No tax is estimated: cost basis and selling expenses exceed the sale price by ${money(r.loss)}, so there is no gain for federal, NIIT, or state tax to apply to.`
      : r.totalGain > 0
        ? `No tax is estimated: the ${money(r.totalGain)} gain falls within the 0% federal capital-gains bracket at this income level, below the NIIT threshold, and ${r.stateName} applies no tax to it.`
        : 'No tax is estimated: the sale price equals cost basis plus selling expenses, so there is no gain.'

  const assumptions = [
    'Gain is treated as long-term capital gain taxed at 2026 federal rates. Ordinary-income recapture (e.g., depreciation, inventory, or certain asset classes in an asset sale) is not separately modeled.',
    'The 3.8% Net Investment Income Tax is applied where modified income exceeds the applicable threshold.',
    'A C-corporation asset sale is illustrated with two layers of tax: a 21% corporate rate on the gain, then personal capital-gains tax on the net distribution. This is a simplification of a fact-specific area.',
    'State tax applies a single simplified capital-gains rate for the selected state and does not reflect brackets, credits, or nonresident sourcing.',
    'Installment treatment assumes equal annual recognition of gain over two or more years and ignores interest income and applicable limitations.',
    'Federal capital-gains brackets depend on total taxable income; the “other household taxable income” figure is used to place the gain in the correct bracket.',
    ...(r.loss > 0 ? ['Cost basis plus selling expenses above the sale price produce no tax in this estimate; whether and how the loss is deductible depends on the assets sold and is not modeled.'] : []),
  ]
  const inputs = [
    ['Sale price', money(r.salePrice)],
    ['Cost basis', money(r.costBasis)],
    ['Selling expenses', money(r.sellingExpenses)],
    ['Debt to be paid off', money(r.debtPayoff)],
    ['Entity type', entityLabel],
    ['Transaction structure', structureLabel],
    ['Filing status', filingLabel],
    ['State of residence', r.stateName],
    ['Other household taxable income', money(toNumber(form.otherIncome))],
    ['Installment sale', r.installment ? (r.installmentYears >= 2 ? `Yes — over ${r.installmentYears} years` : 'Yes — 1 year, same as closing') : 'No — paid at closing'],
  ]
  const gainRows = [
    { label: 'Sale price', value: money(r.salePrice) },
    { label: 'Less: cost basis', value: `(${money(r.costBasis)})`, sub: true },
    { label: 'Less: selling expenses', value: `(${money(r.sellingExpenses)})`, sub: true },
    { label: 'Capital gain', value: money(r.totalGain), total: true },
    ...(r.loss > 0 ? [{ label: 'Loss on the sale — no gain to tax; deductibility not modeled', value: `(${money(r.loss)})`, sub: true }] : []),
  ]
  const useRows = [
    ...(r.isCCorpAsset ? [{ label: 'Estimated corporate-level tax (21%)', value: `(${money(r.corpTax)})` }] : []),
    { label: `${federalLabel} (capital gains plus NIIT)`, value: `(${money(r.fedPersonal)})` },
    { label: `Estimated state tax (${r.stateName})`, value: `(${money(r.stateTax)})` },
    { label: 'Transaction costs (selling expenses)', value: `(${money(r.sellingExpenses)})` },
    { label: 'Debt payoff at closing', value: `(${money(r.debtPayoff)})` },
    { label: netLabel, value: netValue, sub: true },
    { label: liquidLabel, value: liquidValue, total: true },
  ]
  const installmentRows = r.year1
    ? [
        { label: 'Gain recognized per year', value: money(r.year1.gainPerYear) },
        ...(r.isCCorpAsset ? [{ label: 'Corporate-level tax — year 1', value: `(${money(r.year1.corp)})`, negative: true }] : []),
        { label: r.isCCorpAsset ? 'Federal tax on the distribution — year 1' : 'Estimated federal tax — year 1', value: `(${money(r.year1.federal)})`, negative: true },
        { label: 'Estimated state tax — year 1', value: `(${money(r.year1.state)})`, negative: true },
        { label: 'Estimated total tax — year 1', value: money(r.year1.total), total: true },
      ]
    : []
  // Every dollar of the sale price lands in exactly one of these segments.
  const saleMix = [
    { label: 'Liquid proceeds after taxes', value: Math.max(0, r.liquidAfterTax), color: TONE.net },
    ...(r.isCCorpAsset ? [{ label: 'Corporate-level tax (21%)', value: r.corpTax, color: TONE.navy }] : []),
    { label: 'Federal tax', value: r.fedPersonal, color: TONE.tax },
    { label: 'State tax', value: r.stateTax, color: TONE.state },
    { label: 'Transaction costs', value: r.sellingExpenses, color: TONE.cost },
    { label: 'Debt payoff', value: r.debtPayoff, color: TONE.debt },
  ]
  const taxMix = [
    ...(r.isCCorpAsset ? [{ label: 'Corporate-level tax (21%)', value: r.corpTax, color: TONE.navy }] : []),
    { label: 'Federal capital-gains tax', value: r.fedCapGains, color: TONE.tax },
    { label: 'Net investment income tax (3.8%)', value: r.niit, color: TONE.cost },
    { label: `${r.stateName} state tax`, value: r.stateTax, color: TONE.state },
  ]
  // The C-corp asset branch and the installment branch add rows, a legend item,
  // and prose; only those branches need the tighter page spacing.
  const tight = r.isCCorpAsset || Boolean(r.year1)
  const printReport = (
    <PrintDoc>
      <PrintPage compact={tight}>
        <PrintBand
          title="Business Sale Net Liquidity Estimate"
          subtitle="What the sale leaves in hand after taxes, transaction costs, and debt payoff — liquidity only."
          meta={`${entityLabel} · ${structureLabel} · ${filingLabel} · ${r.stateName}`}
          metaRight={today}
        />
        <PrintFeature label={liquidLabel} value={liquidValue} note={featureNote} />
        <PrintTiles
          items={[
            { label: 'Sale price', value: money(r.salePrice) },
            { label: 'Capital gain', value: money(r.totalGain), note: r.loss > 0 ? `loss of ${money(r.loss)}` : 'price − basis − selling costs' },
            { label: 'Total tax', value: money(r.totalTax), note: taxNote },
            { label: 'Effective rate on the gain', value: rate },
          ]}
        />
        <PrintSection title="From sale price to net liquidity">
          <PrintRows rows={gainRows} />
        </PrintSection>
        <PrintSection title="Taxes, costs, and debt paid from the proceeds">
          <PrintRows rows={useRows} />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        <PrintSection title="Where the sale price goes" className="pr-chart">
          {shortfall ? (
            <PrintProse>{shortfallText}</PrintProse>
          ) : r.salePrice > 0 ? (
            <StackedBar height={56} data={saleMix} />
          ) : (
            <PrintProse>Enter a sale price, cost basis, and selling expenses to see how the price is allocated.</PrintProse>
          )}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact={tight}>
        <PrintPageHead title="Business Sale Net Liquidity Estimate" right={today} />
        <PrintCols>
          <PrintSection title="Tax detail on the gain">
            <PrintRows
              rows={[
                ...(r.isCCorpAsset ? [{ label: 'Corporate-level tax (21%)', value: money(r.corpTax) }] : []),
                { label: 'Federal long-term capital gains tax', value: money(r.fedCapGains) },
                { label: 'Net investment income tax (3.8%)', value: money(r.niit) },
                { label: `State tax (${r.stateName})`, value: money(r.stateTax) },
                { label: 'Total tax', value: money(r.totalTax), total: true },
                { label: 'Effective rate on the gain', value: rate, sub: true },
                { label: 'Tax as a share of the sale price', value: percent(r.salePrice > 0 ? (r.totalTax / r.salePrice) * 100 : 0, 1), sub: true },
              ]}
            />
          </PrintSection>
          <div>
            <PrintSection title="Where the tax comes from" className="pr-chart">
              {r.totalTax > 0 ? <StackedBar height={28} data={taxMix} /> : <PrintProse>{noTaxText}</PrintProse>}
            </PrintSection>
            {r.year1 ? (
              <PrintSection title={`Installment sale · year 1 of ${r.year1.years}`} note={`vs. ${money(r.totalTax)} if all paid at closing`}>
                <PrintRows rows={installmentRows} />
              </PrintSection>
            ) : null}
          </div>
        </PrintCols>
        <PrintSection title="How the structure changes the tax">
          <PrintTable
            head={['', 'Asset sale', 'Stock / equity sale']}
            widths={['24%', '38%', '38%']}
            rows={[
              ['What the buyer acquires', 'The individual business assets; the entity usually stays with the seller', 'The ownership interest itself; the entity and its history go with it'],
              ['Pass-through entity (LLC, partnership, S-corp)', 'One layer of tax at the owner level; part of the gain can be ordinary-income recapture. A sole proprietorship is always sold this way', 'One layer of tax, generally capital gain (partnership “hot assets” can produce some ordinary income)'],
              ['C-corporation', 'Two layers — 21% corporate tax, then capital-gains tax when proceeds are distributed', 'One layer of capital-gains tax to the shareholder; §1202 exclusion may apply to qualifying stock'],
              ['Why buyers care', 'Stepped-up basis in the assets — more depreciation going forward', 'No basis step-up; buyer inherits the entity\'s liabilities'],
              ['Typical negotiation', 'Buyers prefer it; sellers may ask for a higher price to cover the extra tax', 'Sellers prefer it; buyers may discount the price'],
            ]}
          />
        </PrintSection>
        <PrintNote title="Reading the result">
          The effective rate is measured on the gain, not the sale price. Selling expenses reduce both the gain and the cash received; debt payoff reduces cash but not the taxable gain.
          {r.year1 ? ` The installment illustration assumes equal payments over ${r.year1.years} years; later years depend on income in those years, and interest on the note is not modeled.` : ''}
          {' '}This estimator stops at net liquidity after taxes. By design, it does not address retirement planning, retirement readiness, investment projections, or withdrawal planning. Those conversations are best had directly with Grott Luker &amp; Co.
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
      title="Business Sale & Net Liquidity Estimator"
      subtitle="Estimate after-tax proceeds and net liquidity from the sale of a business. This tool illustrates liquidity after taxes only — it does not address how proceeds might later be invested or drawn upon."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
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
            <PillField
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
            <SegmentedField
              label="Filing status"
              value={form.filing}
              onChange={set('filing')}
              options={FILING_OPTIONS}
            />
          </Panel>

          <RefinePanel summary="state, other income, installment sale">
            <SelectField
              label="State of residence"
              value={form.state}
              onChange={set('state')}
              options={STATES.map((s) => ({ value: s.code, label: s.name }))}
              info="Used to apply a simplified state tax rate to the gain. State treatment varies widely."
            />
            <MoneyField
              label="Other household taxable income (this year)"
              value={form.otherIncome}
              onChange={set('otherIncome')}
              info="Approximate taxable income apart from the sale. Capital gains stack on top of ordinary income, so this determines which capital-gains rate applies."
              hint="Optional — improves the accuracy of the capital-gains rate estimate."
            />
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
                hint="Two or more years; a one-year note is the same as being paid at closing."
              />
            ) : null}
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Net Liquidity Summary"
              meta="Estimated after-tax proceeds"
              metaRight={today}
            />

            <FeatureBlock label={liquidLabel} value={liquidValue} note={featureNote} />

            <StatTiles
              items={[
                { label: 'Capital gain', value: money(r.totalGain), note: r.loss > 0 ? `loss of ${money(r.loss)}` : undefined },
                { label: 'Total tax', value: money(r.totalTax), tone: 'bad', note: taxNote },
                { label: 'Effective rate on the gain', value: rate },
              ]}
            />

            <div className="result-list">
              <ResultRow label="Sale price" value={r.salePrice} />
              <ResultRow label="Less: cost basis" raw={`(${money(r.costBasis)})`} />
              <ResultRow label="Less: selling expenses" raw={`(${money(r.sellingExpenses)})`} />
              <ResultRow label="Capital gain" value={r.totalGain} total />
              {r.loss > 0 ? (
                <ResultRow
                  label="Loss on the sale"
                  info="Cost basis plus selling expenses exceed the sale price, so there is no gain to tax. Whether the loss is deductible depends on the assets sold and is not modeled."
                  raw={`(${money(r.loss)})`}
                  sub
                />
              ) : null}
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
                label={federalLabel}
                info="Federal long-term capital gains tax plus, where applicable, the 3.8% Net Investment Income Tax. Any corporate-level tax is shown on its own row above."
                raw={`(${money(r.fedPersonal)})`}
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
                label={netLabel}
                info="Sale price less selling expenses and debt payoff, before income taxes."
                raw={netValue}
                negative={preTaxShort}
              />
              <ResultRow
                label={liquidLabel}
                raw={liquidValue}
                total
                positive={!shortfall}
                negative={shortfall}
              />
            </div>

            <Narrative>{narrative}</Narrative>

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Where the sale price goes
              </div>
              {shortfall ? (
                <p className="small muted" style={{ margin: 0 }}>{shortfallText}</p>
              ) : (
                <StackedBar data={saleMix} />
              )}
            </div>

            <div className="report-footer">
              Prepared for discussion with Grott Luker &amp; Co.
            </div>
          </section>

          {r.year1 ? (
            <Panel title="Installment Sale Illustration">
              <p className="small muted" style={{ marginTop: 0 }}>
                Assuming the gain is recognized evenly over {r.year1.years} years
                (equal annual payments). Interest income on the installment note
                is not modeled.
              </p>
              <div className="result-list">
                {installmentRows.map((row) => (
                  <ResultRow key={row.label} label={row.label} raw={row.value} total={row.total} negative={row.negative} />
                ))}
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

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
