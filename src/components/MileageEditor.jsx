import { Plus, Trash2 } from 'lucide-react'
import { Panel, Note, ReportHeader, FeatureBlock, Stat } from './ui.jsx'
import { money, number } from '../lib/format.js'
import {
  PURPOSES,
  EXPENSE_TYPES,
  TAX_YEARS,
  blankTrip,
  blankExpense,
  compute,
  periodsForYear,
} from '../lib/mileage.js'

const fmtRate = (r) => `$${r.toFixed(3).replace(/0$/, '')}`

/* ---------------- Editor (inputs) ---------------- */

export function MileageEditor({ log, setLog, className = '' }) {
  const r = compute(log)
  const year = log.taxYear

  const updateRow = (key, id, patch) =>
    setLog((l) => ({ ...l, [key]: l[key].map((row) => (row.id === id ? { ...row, ...patch } : row)) }))
  const removeRow = (key, id) =>
    setLog((l) => ({ ...l, [key]: l[key].length > 1 ? l[key].filter((row) => row.id !== id) : l[key] }))
  const addRow = (key, maker) => setLog((l) => ({ ...l, [key]: [...l[key], maker(year)] }))
  const setYear = (y) => setLog((l) => ({ ...l, taxYear: Number(y) }))

  const periods = periodsForYear(year)

  return (
    <div className={className}>
      <Panel title="Tax year">
        <div className="mlog-year">
          <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
            {TAX_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="mlog-rates">
            {periods.map((p, i) => {
              const next = periods[i + 1]
              const from = p.from < `${year}-01-01` ? `Jan 1` : fmtDate(p.from)
              const to = next ? `${fmtDate(next.from, -1)}` : 'Dec 31'
              return (
                <div key={p.from} className="mlog-rate">
                  <div className="mlog-rate-when">
                    {from} – {to}
                  </div>
                  <div className="mlog-rate-vals">
                    <span>Business <b>{fmtRate(p.business)}</b></span>
                    <span>Charity <b>{fmtRate(p.charity)}</b></span>
                    <span>Medical <b>{fmtRate(p.medical)}</b></span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hint">
            IRS standard rates apply automatically by each trip’s date. Verify against irs.gov every January.
          </div>
        </div>
      </Panel>

      <Panel title="Travel">
        <div className="mlog-tablewrap">
          <table className="data-table mlog-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Description &amp; destination</th>
                <th className="num">Miles</th>
                <th>Purpose</th>
                <th className="num">Rate</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.trips.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input className="input" type="date" value={t.date} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => updateRow('trips', t.id, { date: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" value={t.client} placeholder="Client" onChange={(e) => updateRow('trips', t.id, { client: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" value={t.description} placeholder="Where and why" onChange={(e) => updateRow('trips', t.id, { description: e.target.value })} />
                  </td>
                  <td className="num">
                    <input className="input num" inputMode="decimal" value={t.miles} placeholder="0" onChange={(e) => updateRow('trips', t.id, { miles: e.target.value })} />
                  </td>
                  <td>
                    <select className="input" value={t.purpose} onChange={(e) => updateRow('trips', t.id, { purpose: e.target.value })}>
                      {PURPOSES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num mlog-muted">{fmtRate(t.rate)}</td>
                  <td className="num">
                    <strong>{t.counted ? money(t.amount, 2) : '—'}</strong>
                  </td>
                  <td className="num">
                    <button type="button" className="mlog-del" aria-label="Remove trip" onClick={() => removeRow('trips', t.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num">{number(r.totalMiles)}</td>
                <td colSpan={2} />
                <td className="num">{money(r.totalMileage, 2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRow('trips', blankTrip)}>
          <Plus size={14} /> Add trip
        </button>
      </Panel>

      <Panel title="Meals & Entertainment">
        <div className="mlog-tablewrap">
          <table className="data-table mlog-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Matter(s) discussed</th>
                <th className="num">Amount</th>
                <th>Type</th>
                <th className="num">Deductible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.expenses.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input className="input" type="date" value={e.date} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(ev) => updateRow('expenses', e.id, { date: ev.target.value })} />
                  </td>
                  <td>
                    <input className="input" value={e.client} placeholder="Client" onChange={(ev) => updateRow('expenses', e.id, { client: ev.target.value })} />
                  </td>
                  <td>
                    <input className="input" value={e.matter} placeholder="What was discussed" onChange={(ev) => updateRow('expenses', e.id, { matter: ev.target.value })} />
                  </td>
                  <td className="num">
                    <input className="input num" inputMode="decimal" value={e.amount} placeholder="0.00" onChange={(ev) => updateRow('expenses', e.id, { amount: ev.target.value })} />
                  </td>
                  <td>
                    <select className="input" value={e.type} onChange={(ev) => updateRow('expenses', e.id, { type: ev.target.value })}>
                      {EXPENSE_TYPES.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <strong>{e.counted ? money(e.deductible, 2) : '—'}</strong>
                  </td>
                  <td className="num">
                    <button type="button" className="mlog-del" aria-label="Remove expense" onClick={() => removeRow('expenses', e.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num">{money(r.mealsTotal + r.entTotal, 2)}</td>
                <td />
                <td className="num">{money(r.expenseDeductible, 2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRow('expenses', blankExpense)}>
          <Plus size={14} /> Add expense
        </button>
        <div className="hint" style={{ marginTop: 10 }}>
          Business meals are generally 50% deductible; entertainment is generally not deductible. Keep receipts for any single expense of $75 or more.
        </div>
      </Panel>
    </div>
  )
}

function fmtDate(iso, dayOffset = 0) {
  const d = new Date(`${iso}T00:00:00`)
  if (dayOffset) d.setDate(d.getDate() + dayOffset)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ---------------- Report (printable) ---------------- */

export function MileageReport({ log, clientName, dateLabel }) {
  const r = compute(log)
  const purposeRows = PURPOSES.map((p) => ({ ...p, ...r.byPurpose[p.id] })).filter((p) => p.miles > 0)
  const today =
    dateLabel ||
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <section className="report">
      <ReportHeader
        sectionTitle={`Mileage & Expense Log — Tax year ${log.taxYear}`}
        meta={clientName ? `Prepared for ${clientName}` : 'Year-to-date summary'}
        metaRight={today}
      />

      <FeatureBlock
        label="Estimated deduction — mileage plus deductible meals"
        value={money(r.estimatedDeduction, 2)}
        note={`${number(r.totalMiles)} miles across ${r.tripCount} ${r.tripCount === 1 ? 'trip' : 'trips'} · ${r.expenseCount} meal/entertainment ${r.expenseCount === 1 ? 'entry' : 'entries'}`}
      />

      <div className="stat-grid" style={{ marginTop: 14 }}>
        {PURPOSES.map((p) => (
          <Stat key={p.id} label={`${p.label} miles`} value={number(r.byPurpose[p.id].miles)} note={money(r.byPurpose[p.id].amount, 2)} />
        ))}
      </div>

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <Stat label="Meals logged" value={money(r.mealsTotal, 2)} note="50% generally deductible" />
        <Stat label="Entertainment logged" value={money(r.entTotal, 2)} note="Generally not deductible" />
        <Stat label="Deductible meals" value={money(r.expenseDeductible, 2)} feature />
      </div>

      {r.tripCount > 0 ? (
        <>
          <h3 className="report-h3">Travel</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Description</th>
                <th>Purpose</th>
                <th className="num">Miles</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {r.trips
                .filter((t) => t.counted)
                .map((t) => (
                  <tr key={t.id}>
                    <td>{t.date || '—'}</td>
                    <td>{t.client || '—'}</td>
                    <td>{t.description || '—'}</td>
                    <td>{PURPOSES.find((p) => p.id === t.purpose)?.label}</td>
                    <td className="num">{number(t.milesNum)}</td>
                    <td className="num">{fmtRate(t.rate)}</td>
                    <td className="num">{money(t.amount, 2)}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              {purposeRows.map((p) => (
                <tr key={p.id}>
                  <td colSpan={4}>{p.label} subtotal</td>
                  <td className="num">{number(p.miles)}</td>
                  <td />
                  <td className="num">{money(p.amount, 2)}</td>
                </tr>
              ))}
            </tfoot>
          </table>
        </>
      ) : null}

      {r.expenseCount > 0 ? (
        <>
          <h3 className="report-h3">Meals &amp; Entertainment</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Matter(s) discussed</th>
                <th>Type</th>
                <th className="num">Amount</th>
                <th className="num">Deductible</th>
              </tr>
            </thead>
            <tbody>
              {r.expenses
                .filter((e) => e.counted)
                .map((e) => (
                  <tr key={e.id}>
                    <td>{e.date || '—'}</td>
                    <td>{e.client || '—'}</td>
                    <td>{e.matter || '—'}</td>
                    <td>{EXPENSE_TYPES.find((x) => x.id === e.type)?.label}</td>
                    <td className="num">{money(e.amountNum, 2)}</td>
                    <td className="num">{money(e.deductible, 2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      ) : null}

      <Note title="Substantiation">
        Deductions depend on documentation, not arithmetic: keep receipts for any single expense of $75 or more, and record the business purpose and who was present. Personal commuting miles are not deductible.
      </Note>
      <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
    </section>
  )
}
