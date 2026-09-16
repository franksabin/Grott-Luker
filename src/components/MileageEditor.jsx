import { Plus, Trash2 } from 'lucide-react'
import { Panel, Note, ReportHeader, FeatureBlock, Stat } from './ui.jsx'
import { money, number } from '../lib/format.js'
import {
  PURPOSES,
  TAX_YEARS,
  blankTrip,
  blankExpense,
  compute,
  periodsForYear,
  newId,
} from '../lib/mileage.js'
import { INDUSTRIES, CATEGORY_BY_ID, TREATMENTS, industryFor, categoryGroups } from '../lib/expenseGuide.js'

const fmtRate = (r) => `$${r.toFixed(3).replace(/0$/, '')}`

function Flag({ treatment }) {
  return <span className={`exp-flag ${treatment}`}>{TREATMENTS[treatment].short}</span>
}

/* ---------------- Editor (inputs) ---------------- */

export function MileageEditor({ log, setLog, className = '' }) {
  const r = compute(log)
  const year = log.taxYear
  const industry = industryFor(log.industry)
  const groups = categoryGroups(industry.id)

  const updateRow = (key, id, patch) =>
    setLog((l) => ({ ...l, [key]: l[key].map((row) => (row.id === id ? { ...row, ...patch } : row)) }))
  const removeRow = (key, id) =>
    setLog((l) => ({ ...l, [key]: l[key].length > 1 ? l[key].filter((row) => row.id !== id) : l[key] }))
  const addRow = (key, maker) => setLog((l) => ({ ...l, [key]: [...l[key], maker(year)] }))
  const setYear = (y) => setLog((l) => ({ ...l, taxYear: Number(y) }))
  const setIndustry = (id) => setLog((l) => ({ ...l, industry: id }))

  // One click from the attention list: a new expense row with the category set
  // and the item as its description. Reuses a still-blank row if there is one.
  const addFromGuide = (item, cat) =>
    setLog((l) => {
      const blankIdx = l.expenses.findIndex((e) => !e.amount && !e.matter && !e.client)
      const row = { id: newId(), date: `${l.taxYear}-`, client: '', matter: item, amount: '', type: cat }
      if (blankIdx >= 0) {
        const next = [...l.expenses]
        next[blankIdx] = { ...next[blankIdx], matter: item, type: cat }
        return { ...l, expenses: next }
      }
      return { ...l, expenses: [...l.expenses, row] }
    })

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

      <Panel title="Your line of work">
        <div className="ind-grid">
          <div>
            <label className="field-label" htmlFor="mlog-industry">What kind of work is this log for?</label>
            <select id="mlog-industry" className="input" value={industry.id} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRIES.map((i) => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </select>
            <div className="hint" style={{ marginTop: 8 }}>
              Picking your line of work changes the checklist on the right and puts your usual categories first in the expense picker. The rules are general; your CPA decides.
            </div>
            <div className="ind-head" style={{ marginTop: 18 }}>Usually not deductible</div>
            <ul className="ind-watch">
              {industry.avoid.map(([cat, why]) => (
                <li key={cat}>
                  <b>{CATEGORY_BY_ID[cat]?.label.split(':')[0]}</b>
                  <span>{why}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="ind-head">Pay extra attention to these. Click to add one to the log.</div>
            <ul className="ind-attn">
              {industry.attention.map(([item, cat]) => (
                <li key={item}>
                  <button type="button" className="ind-add" onClick={() => addFromGuide(item, cat)} title={`Add “${item}” as an expense line`}>
                    <Plus size={13} /> {item}
                  </button>
                  <Flag treatment={CATEGORY_BY_ID[cat].treatment} />
                </li>
              ))}
            </ul>
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

      <Panel title="Expenses">
        <div className="mlog-tablewrap">
          <table className="data-table mlog-table exp">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client / vendor</th>
                <th>What and why</th>
                <th className="num">Amount</th>
                <th>Category</th>
                <th className="num">Counted</th>
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
                    <input className="input" value={e.client} placeholder="Client or vendor" onChange={(ev) => updateRow('expenses', e.id, { client: ev.target.value })} />
                  </td>
                  <td>
                    <input className="input" value={e.matter} placeholder="What it was, who was there, why" onChange={(ev) => updateRow('expenses', e.id, { matter: ev.target.value })} />
                  </td>
                  <td className="num">
                    <input className="input num" inputMode="decimal" value={e.amount} placeholder="0.00" onChange={(ev) => updateRow('expenses', e.id, { amount: ev.target.value })} />
                  </td>
                  <td>
                    <select className="input cat" value={e.type} onChange={(ev) => updateRow('expenses', e.id, { type: ev.target.value })}>
                      {groups.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.options.map((x) => (
                            <option key={x.id} value={x.id}>{x.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <div className="exp-cell">
                      <strong>{e.counted ? (e.treatment === 'ask' ? '—' : money(e.deductible, 2)) : '—'}</strong>
                      <Flag treatment={e.treatment} />
                    </div>
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
                <td colSpan={3}>Total logged · counted in the estimate</td>
                <td className="num">{money(r.expensesTotal, 2)}</td>
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
          <Flag treatment="ok" /> counted in full · <Flag treatment="limited" /> counted at 50%, or capped · <Flag treatment="ask" /> recorded for your CPA, not counted yet · <Flag treatment="not" /> recorded, not deductible.
          Keep receipts for any single expense of $75 or more.
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
  const industry = industryFor(log.industry)
  const purposeRows = PURPOSES.map((p) => ({ ...p, ...r.byPurpose[p.id] })).filter((p) => p.miles > 0)
  const today =
    dateLabel ||
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <section className="report">
      <ReportHeader
        sectionTitle={`Mileage & Expense Log — Tax year ${log.taxYear}`}
        meta={`${clientName ? `Prepared for ${clientName} · ` : ''}${industry.label}`}
        metaRight={today}
      />

      <FeatureBlock
        label="Estimated deduction — mileage plus counted expenses"
        value={money(r.estimatedDeduction, 2)}
        note={`${number(r.totalMiles)} miles across ${r.tripCount} ${r.tripCount === 1 ? 'trip' : 'trips'} · ${r.expenseCount} expense ${r.expenseCount === 1 ? 'entry' : 'entries'}${r.reviewTotal > 0 ? ` · ${money(r.reviewTotal, 2)} more awaiting CPA review` : ''}`}
      />

      <div className="stat-grid" style={{ marginTop: 14 }}>
        {PURPOSES.map((p) => (
          <Stat key={p.id} label={`${p.label} miles`} value={number(r.byPurpose[p.id].miles)} note={money(r.byPurpose[p.id].amount, 2)} />
        ))}
      </div>

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <Stat label="Expenses logged" value={money(r.expensesTotal, 2)} note={`${r.expenseCount} ${r.expenseCount === 1 ? 'entry' : 'entries'}`} />
        <Stat label="Counted in the estimate" value={money(r.expenseDeductible, 2)} note="Deductible and partly deductible" feature />
        <Stat label="For CPA review" value={money(r.reviewTotal, 2)} note="Equipment, phone, home office, inventory" />
        <Stat label="Not deductible" value={money(r.excludedTotal, 2)} note="Recorded, counted at zero" />
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
          <h3 className="report-h3">Expenses</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client / vendor</th>
                <th>What and why</th>
                <th>Category</th>
                <th>Treatment</th>
                <th className="num">Amount</th>
                <th className="num">Counted</th>
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
                    <td>{e.category.label}</td>
                    <td><Flag treatment={e.treatment} /></td>
                    <td className="num">{money(e.amountNum, 2)}</td>
                    <td className="num">{e.treatment === 'ask' ? 'review' : money(e.deductible, 2)}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Counted in the estimate</td>
                <td className="num">{money(r.expensesTotal, 2)}</td>
                <td className="num">{money(r.expenseDeductible, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      ) : null}

      <Note title={`Notes for ${industry.label.toLowerCase()}`}>
        {industry.avoid.map(([cat, why]) => (
          <div key={cat} style={{ marginBottom: 6 }}>
            <strong>{CATEGORY_BY_ID[cat]?.label.split(':')[0]}.</strong> {why}
          </div>
        ))}
        <div>Deductions depend on documentation, not arithmetic: keep receipts for any single expense of $75 or more, and record the business purpose and who was present.</div>
      </Note>
      <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
    </section>
  )
}
