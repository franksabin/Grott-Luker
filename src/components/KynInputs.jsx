import { Panel, MoneyField } from './ui.jsx'
import {
  ASSET_CATS,
  LIABILITY_CATS,
  INCOME_CATS,
  EXPENSE_CATS,
} from '../lib/knowYourNumbers.js'

// The Know Your Numbers data-entry panels, shared by the internal CPA tool and
// the client-facing form so both always ask for exactly the same figures.
export default function KynInputs({ form, set, className = '' }) {
  return (
    <div className={`tool-grid ${className}`.trim()}>
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
          <MoneyField
            label="Annual savings & investing"
            value={form.annualSavings}
            onChange={set('annualSavings')}
          />
          <MoneyField
            label="Life insurance coverage"
            value={form.lifeCoverage}
            onChange={set('lifeCoverage')}
          />
          <MoneyField
            label="Disability coverage (monthly benefit)"
            value={form.disabilityMonthly}
            onChange={set('disabilityMonthly')}
          />
        </Panel>
      </div>
    </div>
  )
}
