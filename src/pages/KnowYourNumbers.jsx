import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import { Panel, MoneyField, ResultRow, Stat, Note, ReportHeader, FeatureBlock, Narrative } from '../components/ui.jsx'
import { DonutChart, StackedBar, PALETTE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'

const ASSET_CATS = [
  { key: 'cash', label: 'Cash & bank accounts' },
  { key: 'investments', label: 'Investments (non-retirement)' },
  { key: 'retirement', label: 'Retirement accounts' },
  { key: 'realEstate', label: 'Real estate' },
  { key: 'business', label: 'Business interests' },
  { key: 'otherAssets', label: 'Personal property & other' },
]

const LIABILITY_CATS = [
  { key: 'mortgage', label: 'Mortgage' },
  { key: 'autoLoans', label: 'Auto loans' },
  { key: 'studentLoans', label: 'Student loans' },
  { key: 'creditCards', label: 'Credit cards' },
  { key: 'otherDebt', label: 'Other debt' },
]

const INCOME_CATS = [
  { key: 'employment', label: 'Employment income' },
  { key: 'businessIncome', label: 'Business / self-employment' },
  { key: 'investmentIncome', label: 'Investment income' },
  { key: 'otherIncome', label: 'Other income' },
]

const EXPENSE_CATS = [
  { key: 'housing', label: 'Housing' },
  { key: 'living', label: 'Living expenses' },
  { key: 'debtPayments', label: 'Debt payments' },
  { key: 'otherExpenses', label: 'Other expenses' },
]

const ALL_KEYS = [
  ...ASSET_CATS,
  ...LIABILITY_CATS,
  ...INCOME_CATS,
  ...EXPENSE_CATS,
  { key: 'annualSavings' },
  { key: 'lifeCoverage' },
  { key: 'disabilityMonthly' },
]

const BLANK = ALL_KEYS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})

const SAMPLE = {
  cash: '85000',
  investments: '420000',
  retirement: '610000',
  realEstate: '750000',
  business: '250000',
  otherAssets: '90000',
  mortgage: '380000',
  autoLoans: '32000',
  studentLoans: '18000',
  creditCards: '6000',
  otherDebt: '0',
  employment: '210000',
  businessIncome: '60000',
  investmentIncome: '18000',
  otherIncome: '0',
  housing: '54000',
  living: '78000',
  debtPayments: '42000',
  otherExpenses: '24000',
  annualSavings: '48000',
  lifeCoverage: '1000000',
  disabilityMonthly: '8000',
}

function sumKeys(form, cats) {
  return cats.reduce((s, c) => s + toNumber(form[c.key]), 0)
}

function compute(form) {
  const totalAssets = sumKeys(form, ASSET_CATS)
  const totalLiabilities = sumKeys(form, LIABILITY_CATS)
  const netWorth = totalAssets - totalLiabilities

  const totalIncome = sumKeys(form, INCOME_CATS)
  const totalExpenses = sumKeys(form, EXPENSE_CATS)
  const annualCashFlow = totalIncome - totalExpenses

  const annualSavings = toNumber(form.annualSavings)
  const savingsRate = totalIncome > 0 ? (annualSavings / totalIncome) * 100 : 0
  const debtPayments = toNumber(form.debtPayments)
  const dti = totalIncome > 0 ? (debtPayments / totalIncome) * 100 : 0

  const allocation = ASSET_CATS.map((c) => ({
    label: c.label,
    value: toNumber(form[c.key]),
    pct: totalAssets > 0 ? (toNumber(form[c.key]) / totalAssets) * 100 : 0,
  })).filter((c) => c.value > 0)

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    totalIncome,
    totalExpenses,
    annualCashFlow,
    annualSavings,
    savingsRate,
    debtPayments,
    dti,
    allocation,
  }
}

export default function KnowYourNumbers() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  return (
    <ToolShell
      title="Know Your Numbers"
      subtitle="A clean, one-page financial snapshot — a conversation starter you can share and bring to your next meeting."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      {/* Inputs — hidden when printing so the snapshot prints on one page. */}
      <div className="tool-grid no-print">
        <div>
          <Panel title="Assets">
            {ASSET_CATS.map((c) => (
              <MoneyField key={c.key} label={c.label} value={form[c.key]} onChange={set(c.key)} />
            ))}
          </Panel>
          <Panel title="Liabilities">
            {LIABILITY_CATS.map((c) => (
              <MoneyField key={c.key} label={c.label} value={form[c.key]} onChange={set(c.key)} />
            ))}
          </Panel>
        </div>
        <div>
          <Panel title="Income (annual)">
            {INCOME_CATS.map((c) => (
              <MoneyField key={c.key} label={c.label} value={form[c.key]} onChange={set(c.key)} />
            ))}
          </Panel>
          <Panel title="Expenses (annual)">
            {EXPENSE_CATS.map((c) => (
              <MoneyField key={c.key} label={c.label} value={form[c.key]} onChange={set(c.key)} />
            ))}
          </Panel>
          <Panel title="Savings & Insurance">
            <MoneyField label="Annual savings & investing" value={form.annualSavings} onChange={set('annualSavings')} />
            <MoneyField label="Life insurance coverage" value={form.lifeCoverage} onChange={set('lifeCoverage')} />
            <MoneyField label="Disability coverage (monthly benefit)" value={form.disabilityMonthly} onChange={set('disabilityMonthly')} />
          </Panel>
        </div>
      </div>

      {/* The shareable snapshot. */}
      <section className="report" style={{ marginBottom: 24 }}>
        <ReportHeader
          sectionTitle="Financial Snapshot"
          meta="A one-page picture of where things stand today"
          metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        />
        <FeatureBlock
          label="Net worth"
          value={money(r.netWorth)}
          note={`${money(r.totalAssets)} in assets · ${money(r.totalLiabilities)} in liabilities`}
        />
        <div className="stat-grid" style={{ marginBottom: 0 }}>
          <Stat label="Annual cash flow" value={money(r.annualCashFlow)} note={`${money(r.annualCashFlow / 12)} / month`} />
          <Stat label="Savings rate" value={percent(r.savingsRate)} note={`${money(r.annualSavings)} / year`} />
          <Stat label="Total debt" value={money(r.totalLiabilities)} />
        </div>
        <Narrative>
          Net worth stands at {money(r.netWorth)}, with {money(r.totalAssets)} in
          total assets against {money(r.totalLiabilities)} in liabilities. The
          household brings in {money(r.totalIncome)} of income against{' '}
          {money(r.totalExpenses)} of expenses each year — an annual cash flow of{' '}
          {money(r.annualCashFlow)} — and saves about {percent(r.savingsRate)} of
          income.
        </Narrative>
        <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
      </section>

      <div className="tool-grid">
        <div>
          <Panel title="Net Worth">
            <div className="result-list">
              <ResultRow label="Total assets" value={r.totalAssets} />
              <ResultRow label="Total liabilities" raw={`(${money(r.totalLiabilities)})`} negative />
              <ResultRow label="Net worth" value={r.netWorth} total positive={r.netWorth >= 0} negative={r.netWorth < 0} />
            </div>
          </Panel>

          <Panel title="Cash Flow Summary">
            <div className="result-list">
              <ResultRow label="Total income (annual)" value={r.totalIncome} />
              <ResultRow label="Total expenses (annual)" raw={`(${money(r.totalExpenses)})`} negative />
              <ResultRow label="Net cash flow (annual)" value={r.annualCashFlow} total />
              <ResultRow label="Net cash flow (monthly)" value={r.annualCashFlow / 12} sub />
            </div>
          </Panel>

          <Panel title="Insurance Snapshot">
            <div className="result-list">
              <ResultRow label="Life insurance coverage" value={toNumber(form.lifeCoverage)} />
              <ResultRow label="Disability benefit (monthly)" value={toNumber(form.disabilityMonthly)} />
            </div>
          </Panel>
        </div>

        <div>
          <Panel title="Debt Summary">
            <div className="result-list">
              {LIABILITY_CATS.map((c) => (
                <ResultRow key={c.key} label={c.label} value={toNumber(form[c.key])} />
              ))}
              <ResultRow label="Total debt" value={r.totalLiabilities} total />
              <ResultRow label="Debt payments as % of income" raw={percent(r.dti)} sub />
            </div>
          </Panel>

          <Panel title="Asset Allocation by Category">
            <DonutChart
              centerValue={money(r.totalAssets)}
              centerLabel="Total assets"
              data={r.allocation
                .sort((a, b) => b.value - a.value)
                .map((c, i) => ({ label: c.label, value: c.value, color: PALETTE[i % PALETTE.length] }))}
            />
          </Panel>

          <Panel title="Where Income Goes">
            <StackedBar
              data={[
                ...EXPENSE_CATS.map((c, i) => ({
                  label: c.label,
                  value: toNumber(form[c.key]),
                  color: PALETTE[(i + 1) % PALETTE.length],
                })),
                { label: 'Surplus / unallocated', value: Math.max(0, r.annualCashFlow), color: '#2e7d5b' },
              ]}
            />
          </Panel>
        </div>
      </div>

      <Note>
        This snapshot summarizes the figures you entered. It intentionally
        contains no tax assumptions, projections, or recommendations — it is
        simply a clear picture of where things stand today, ready to discuss with
        Grott Luker &amp; Co.
      </Note>
    </ToolShell>
  )
}
