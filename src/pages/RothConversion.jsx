import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  SelectField,
  ResultRow,
  Assumptions,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { StackedBar, BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, irmaaSurcharge, STANDARD_DEDUCTION, rmdDivisor } from '../lib/tax.js'
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

  const baseTaxable = Math.max(0, otherIncome - stdDed)
  const convTaxable = Math.max(0, otherIncome + conversion - stdDed)
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
  }
}

export default function RothConversion() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  return (
    <ToolShell
      title="Roth Conversion Analyzer"
      subtitle="Model the tax cost of converting pre-tax retirement dollars to a Roth against the long-term benefit — marginal brackets, IRMAA exposure, and the future RMDs a conversion removes."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
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
            <SelectField
              label="State of residence"
              value={form.state}
              onChange={set('state')}
              options={STATES.map((s) => ({ value: s.code, label: s.name }))}
            />
          </Panel>
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
            <Narrative>
              Converting {money(r.conversion)} this year is estimated to cost{' '}
              {money(r.federalTax)} in federal tax
              {r.stateTax > 0 ? ` and ${money(r.stateTax)} in ${r.stateName} tax` : ''}
              {r.extraIrmaa > 0 ? `, plus about ${money(r.extraIrmaa)} in added IRMAA surcharges` : ''}. That
              places roughly {money(r.netToRoth)} into the Roth to grow tax-free, and removes an estimated{' '}
              {money(r.rmdAvoidedAt73)} from your first-year RMD at age 73 —
              about {money(r.futureTaxAvoidedAnnual)} of tax avoided that year at today’s rate.
            </Narrative>

            <div className="result-list">
              <ResultRow label="Amount converted" value={r.conversion} />
              <ResultRow label="Estimated federal tax" raw={`(${money(r.federalTax)})`} negative />
              <ResultRow label={`Estimated state tax (${r.stateName})`} raw={`(${money(r.stateTax)})`} negative />
              <ResultRow label="Added IRMAA surcharge (annual)" raw={`(${money(r.extraIrmaa)})`} negative info="A conversion raises MAGI, which can push Medicare Part B & D premiums into a higher bracket two years later." />
              <ResultRow label="Total cost to convert" value={r.totalCost} total />
              <ResultRow label="Net amount into Roth" value={r.netToRoth} sub />
            </div>

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
          'Uses 2025 federal ordinary brackets and standard deduction. The conversion is taxed as ordinary income stacked on your other income.',
          'State tax applies a simplified rate for the selected state and does not reflect brackets, credits, or retirement-income exclusions.',
          'IRMAA impact uses the 2025 surcharge schedule and reflects the two-year MAGI lookback; married figures assume two enrolled individuals.',
          'The RMD reduction is illustrative, using the first-year (age 73) Uniform Lifetime divisor applied to the converted amount at today’s marginal rate.',
          'Long-term benefit depends on future tax rates, growth, and time horizon, which are not projected here. Paying conversion tax from outside funds is assumed.',
        ]}
      />
    </ToolShell>
  )
}
