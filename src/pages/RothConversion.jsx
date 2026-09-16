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
  ResultRow,
  Assumptions,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { StackedBar, BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, irmaaSurcharge, STANDARD_DEDUCTION, rmdDivisor, seniorDeduction, TAX_YEAR } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const BLANK = {
  iraBalance: '',
  conversion: '',
  filing: 'married',
  state: 'NH',
  otherIncome: '',
  age: '',
}

const SAMPLE = {
  iraBalance: '1200000',
  conversion: '100000',
  filing: 'married',
  state: 'NH',
  otherIncome: '90000',
  age: '64',
}

function compute(form) {
  const conversion = toNumber(form.conversion)
  const otherIncome = toNumber(form.otherIncome)
  const st = getState(form.state)
  const filing = form.filing
  const stdDed = STANDARD_DEDUCTION[filing === 'single' ? 'single' : 'married']

  // Senior deduction (2025–2028) for a filer 65+; it phases out 6% of MAGI over
  // $75k / $150k, so a conversion can also erode it. One person assumed.
  const age = toNumber(form.age)
  const seniors = age >= 65 ? 1 : 0
  const baseSenior = seniorDeduction(otherIncome, filing, seniors)
  const convSenior = seniorDeduction(otherIncome + conversion, filing, seniors)
  const baseTaxable = Math.max(0, otherIncome - stdDed - baseSenior)
  const convTaxable = Math.max(0, otherIncome + conversion - stdDed - convSenior)
  const baseFed = ordinaryTax(baseTaxable, filing)
  const convFed = ordinaryTax(convTaxable, filing)
  const federalTax = convFed - baseFed
  const stateTax = conversion * (st.wage / 100)

  const marginalRate = conversion > 0 ? (federalTax + stateTax) / conversion : 0

  // IRMAA: conversion raises MAGI, which can trigger surcharges (2-year lookback).
  const baseIrmaa = irmaaSurcharge(otherIncome, filing)
  const convIrmaa = irmaaSurcharge(otherIncome + conversion, filing)
  const extraIrmaa = Math.max(0, convIrmaa.annualHousehold - baseIrmaa.annualHousehold)

  const totalCost = federalTax + stateTax + extraIrmaa
  const netToRoth = conversion - federalTax - stateTax

  // Future RMD reduction: converting removes this amount from future RMDs.
  const divisor = rmdDivisor(73)
  const rmdAvoidedAt73 = conversion / divisor
  const futureTaxAvoidedAnnual = rmdAvoidedAt73 * marginalRate

  return {
    conversion,
    federalTax,
    stateTax,
    extraIrmaa,
    totalCost,
    netToRoth,
    marginalRate,
    rmdAvoidedAt73,
    futureTaxAvoidedAnnual,
    stateName: st.name,
    convIrmaaApplies: convIrmaa.tierApplies,
    baseSenior,
    convSenior,
    seniorLost: baseSenior - convSenior,
  }
}

export default function RothConversion() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => {
    const other = toNumber(form.otherIncome)
    const std = STANDARD_DEDUCTION[form.filing === 'single' ? 'single' : 'married']
    return [
      { label: 'Taxable income before conversion', formula: `max(0, other income ${money(other, 2)} − standard deduction ${money(std, 2)}${r.baseSenior > 0 ? ` − senior deduction ${money(r.baseSenior, 2)}` : ''})`, result: money(Math.max(0, other - std - r.baseSenior), 2) },
      { label: 'Taxable income after conversion', formula: `max(0, ${money(other, 2)} + ${money(r.conversion, 2)} − ${money(std, 2)}${r.convSenior > 0 || r.baseSenior > 0 ? ` − senior deduction ${money(r.convSenior, 2)}` : ''})`, result: money(Math.max(0, other + r.conversion - std - r.convSenior), 2), note: r.seniorLost > 0 ? `The conversion phases out ${money(r.seniorLost, 2)} of the $6,000 senior deduction (6% of MAGI over the threshold).` : undefined },
      { label: 'Federal tax on the conversion', formula: `${TAX_YEAR} bracket tax(after) − tax(before)`, result: money(r.federalTax, 2) },
      { label: 'State tax on the conversion', formula: `${money(r.conversion, 2)} × ${r.stateName} rate`, result: money(r.stateTax, 2) },
      { label: 'Added IRMAA (annual, household)', formula: 'surcharge at MAGI with conversion − surcharge without (two-year lookback)', result: money(r.extraIrmaa, 2) },
      { label: 'Total cost of converting', formula: `${money(r.federalTax, 2)} + ${money(r.stateTax, 2)} + ${money(r.extraIrmaa, 2)}`, result: money(r.totalCost, 2) },
      { label: 'Effective rate on the conversion', formula: `(federal + state) ÷ ${money(r.conversion, 2)}`, result: percent(r.marginalRate * 100, 1) },
      { label: 'Net to Roth if tax is paid from the conversion', formula: `${money(r.conversion, 2)} − federal − state`, result: money(r.netToRoth, 2) },
      { label: 'First-year RMD avoided (age 73)', formula: `${money(r.conversion, 2)} ÷ 26.5 (Uniform Lifetime divisor)`, result: money(r.rmdAvoidedAt73, 2) },
      { label: 'Future tax avoided per year', formula: `${money(r.rmdAvoidedAt73, 2)} × ${percent(r.marginalRate * 100, 1)}`, result: money(r.futureTaxAvoidedAnnual, 2) },
    ]
  }, [r, form.otherIncome, form.filing])

  return (
    <ToolShell
      title="Roth Conversion Analyzer"
      subtitle="Model the tax cost of converting pre-tax retirement dollars to a Roth against the long-term benefit — marginal brackets, IRMAA exposure, and the future RMDs a conversion removes."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Conversion Details">
            <MoneyField
              label="Traditional IRA / 401(k) balance"
              value={form.iraBalance}
              onChange={set('iraBalance')}
              info="Total pre-tax retirement balance. Provides context for how much could ultimately be converted over time."
            />
            <MoneyField
              label="Amount to convert this year"
              value={form.conversion}
              onChange={set('conversion')}
              info="The pre-tax amount you are considering moving to a Roth this year. It is added to ordinary income and taxed now."
            />
            <MoneyField
              label="Other taxable income this year"
              value={form.otherIncome}
              onChange={set('otherIncome')}
              info="Approximate taxable income apart from the conversion. This determines the brackets the conversion falls into."
            />
            <div className="field-row">
              <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
              <NumberField label="Current age" value={form.age} onChange={set('age')} suffix="yrs" />
            </div>
          </Panel>
          <RefinePanel summary="state of residence">
            <SelectField
              label="State of residence"
              value={form.state}
              onChange={set('state')}
              options={STATES.map((s) => ({ value: s.code, label: s.name }))}
            />
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Roth Conversion Summary"
              meta="Cost of converting this year"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label="Estimated cost to convert"
              value={money(r.totalCost)}
              note={`On a ${money(r.conversion)} conversion · ${percent(r.marginalRate * 100)} effective marginal rate`}
            />
            <StatTiles
              items={[
                { label: 'Net into Roth', value: money(r.netToRoth), tone: 'good', note: 'grows tax-free' },
                { label: 'Added IRMAA surcharge', value: money(r.extraIrmaa), tone: r.extraIrmaa > 0 ? 'bad' : undefined, note: 'annual, household' },
                { label: 'Future tax avoided per year', value: money(r.futureTaxAvoidedAnnual), tone: 'good', note: 'first RMD year, age 73' },
              ]}
            />

            <div className="result-list">
              <ResultRow label="Amount converted" value={r.conversion} />
              <ResultRow label="Estimated federal tax" raw={`(${money(r.federalTax)})`} negative />
              <ResultRow label={`Estimated state tax (${r.stateName})`} raw={`(${money(r.stateTax)})`} negative />
              <ResultRow label="Added IRMAA surcharge (annual)" raw={`(${money(r.extraIrmaa)})`} negative info="A conversion raises MAGI, which can push Medicare Part B & D premiums into a higher bracket two years later." />
              <ResultRow label="Total cost to convert" value={r.totalCost} total />
              <ResultRow label="Net amount into Roth" value={r.netToRoth} sub />
            </div>

            <Narrative>
              Converting {money(r.conversion)} this year is estimated to cost{' '}
              {money(r.federalTax)} in federal tax
              {r.stateTax > 0 ? ` and ${money(r.stateTax)} in ${r.stateName} tax` : ''}
              {r.extraIrmaa > 0 ? `, plus about ${money(r.extraIrmaa)} in added IRMAA surcharges` : ''}. That
              places roughly {money(r.netToRoth)} into the Roth to grow tax-free, and removes an estimated{' '}
              {money(r.rmdAvoidedAt73)} from your first-year RMD at age 73 —
              about {money(r.futureTaxAvoidedAnnual)} of tax avoided that year at today’s rate.
            </Narrative>

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                How the conversion breaks down
              </div>
              <StackedBar
                data={[
                  { label: 'Into Roth (grows tax-free)', value: Math.max(0, r.netToRoth), color: TONE.net },
                  { label: 'Federal tax', value: r.federalTax, color: TONE.tax },
                  { label: 'State tax', value: r.stateTax, color: TONE.state },
                ]}
              />
            </div>

            <div className="chart-block" style={{ marginTop: 20 }}>
              <BarCompare
                height={150}
                groups={[
                  { label: 'Tax now (convert)', bars: [{ label: 'Tax now', value: r.federalTax + r.stateTax, color: TONE.tax }] },
                  { label: 'Est. annual RMD tax avoided', bars: [{ label: 'RMD tax avoided', value: r.futureTaxAvoidedAnnual, color: TONE.net }] },
                ]}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Assumptions
        items={[
          'Uses 2026 federal ordinary brackets and standard deduction. The conversion is taxed as ordinary income stacked on your other income.',
          'At 65+, the $6,000 senior deduction (2025–2028) is applied for one person and phased out at 6% of MAGI over $75,000 / $150,000 — a conversion that pushes MAGI through that range costs part of the deduction, which is included in the federal tax shown.',
          'State tax applies a simplified rate for the selected state and does not reflect brackets, credits, or retirement-income exclusions.',
          'IRMAA impact uses the 2026 surcharge schedule and reflects the two-year MAGI lookback; married figures assume two enrolled individuals.',
          'The RMD reduction is illustrative, using the first-year (age 73) Uniform Lifetime divisor applied to the converted amount at today’s marginal rate.',
          'Long-term benefit depends on future tax rates, growth, and time horizon, which are not projected here. Paying conversion tax from outside funds is assumed.',
        ]}
      />
    </ToolShell>
  )
}
