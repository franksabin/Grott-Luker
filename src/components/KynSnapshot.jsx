import { Panel, ResultRow, Stat, Note, ReportHeader, FeatureBlock, Narrative } from './ui.jsx'
import { DonutChart, StackedBar, PALETTE } from './charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { LIABILITY_CATS, EXPENSE_CATS, compute } from '../lib/knowYourNumbers.js'

// The Know Your Numbers snapshot: letterhead report plus the supporting
// summary panels and charts. Shared by the internal CPA tool, the client's own
// copy after submitting, and the CPA-side results viewer.
export default function KynSnapshot({ form, clientName, dateLabel }) {
  const r = compute(form)
  const shownDate =
    dateLabel ||
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <>
      <section className="report" style={{ marginBottom: 24 }}>
        <ReportHeader
          sectionTitle="Financial Snapshot"
          meta={
            clientName
              ? `Prepared for ${clientName}`
              : 'A one-page picture of where things stand today'
          }
          metaRight={shownDate}
        />
        <FeatureBlock
          label="Net worth"
          value={money(r.netWorth)}
          note={`${money(r.totalAssets)} in assets · ${money(r.totalLiabilities)} in liabilities`}
        />
        <div className="stat-grid" style={{ marginBottom: 0 }}>
          <Stat
            label="Annual cash flow"
            value={money(r.annualCashFlow)}
            note={`${money(r.annualCashFlow / 12)} / month`}
          />
          <Stat
            label="Savings rate"
            value={percent(r.savingsRate)}
            note={`${money(r.annualSavings)} / year`}
          />
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
              <ResultRow
                label="Total liabilities"
                raw={`(${money(r.totalLiabilities)})`}
                negative
              />
              <ResultRow
                label="Net worth"
                value={r.netWorth}
                total
                positive={r.netWorth >= 0}
                negative={r.netWorth < 0}
              />
            </div>
          </Panel>

          <Panel title="Cash Flow Summary">
            <div className="result-list">
              <ResultRow label="Total income (annual)" value={r.totalIncome} />
              <ResultRow
                label="Total expenses (annual)"
                raw={`(${money(r.totalExpenses)})`}
                negative
              />
              <ResultRow label="Net cash flow (annual)" value={r.annualCashFlow} total />
              <ResultRow label="Net cash flow (monthly)" value={r.annualCashFlow / 12} sub />
            </div>
          </Panel>

          <Panel title="Insurance Snapshot">
            <div className="result-list">
              <ResultRow label="Life insurance coverage" value={toNumber(form.lifeCoverage)} />
              <ResultRow
                label="Disability benefit (monthly)"
                value={toNumber(form.disabilityMonthly)}
              />
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
              data={[...r.allocation]
                .sort((a, b) => b.value - a.value)
                .map((c, i) => ({
                  label: c.label,
                  value: c.value,
                  color: PALETTE[i % PALETTE.length],
                }))}
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
                {
                  label: 'Surplus / unallocated',
                  value: Math.max(0, r.annualCashFlow),
                  color: '#2e7d5b',
                },
              ]}
            />
          </Panel>
        </div>
      </div>

      <Note>
        This snapshot summarizes the figures entered. It intentionally contains no
        tax assumptions, projections, or recommendations — it is simply a clear
        picture of where things stand today, ready to discuss with Grott Luker
        &amp; Co.
      </Note>
    </>
  )
}
