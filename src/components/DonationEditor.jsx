import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { Panel, Note, ReportHeader, FeatureBlock, Stat } from './ui.jsx'
import { money, number } from '../lib/format.js'
import { GIFT_TYPES, TAX_YEARS, THRESHOLDS, blankGift, compute } from '../lib/donations.js'

export function DonationEditor({ log, setLog, className = '' }) {
  const r = compute(log)
  const year = log.taxYear
  const update = (id, patch) => setLog((l) => ({ ...l, gifts: l.gifts.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
  const remove = (id) => setLog((l) => ({ ...l, gifts: l.gifts.length > 1 ? l.gifts.filter((g) => g.id !== id) : l.gifts }))
  const add = () => setLog((l) => ({ ...l, gifts: [...l.gifts, blankGift(year)] }))

  return (
    <div className={className}>
      <Panel title="Tax year">
        <select className="input" style={{ maxWidth: 160 }} value={year} onChange={(e) => setLog((l) => ({ ...l, taxYear: Number(e.target.value) }))}>
          {TAX_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="hint" style={{ marginTop: 8 }}>
          Rules flagged as you go: written acknowledgment for any gift of {money(THRESHOLDS.acknowledgment)} or more · Form 8283 once non-cash gifts exceed {money(THRESHOLDS.form8283)} · qualified appraisal for a non-cash item over {money(THRESHOLDS.appraisal)}.
        </div>
      </Panel>

      <Panel title="Gifts">
        <div className="mlog-tablewrap">
          <table className="data-table mlog-table" style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th>Date</th><th>Organization</th><th>Description</th><th>Type</th>
                <th className="num">Amount / FMV</th><th className="num">Cost basis</th><th>Receipt</th><th /><th />
              </tr>
            </thead>
            <tbody>
              {r.gifts.map((g) => (
                <tr key={g.id} className={g.flags.length ? 'dlog-flag' : ''}>
                  <td><input className="input" type="date" value={g.date} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => update(g.id, { date: e.target.value })} /></td>
                  <td><input className="input" value={g.organization} placeholder="Charity" onChange={(e) => update(g.id, { organization: e.target.value })} /></td>
                  <td><input className="input" value={g.description} placeholder={g.type === 'cash' ? 'Purpose (optional)' : g.type === 'securities' ? 'Shares / ticker' : 'What was donated'} onChange={(e) => update(g.id, { description: e.target.value })} /></td>
                  <td>
                    <select className="input" value={g.type} onChange={(e) => update(g.id, { type: e.target.value })}>
                      {GIFT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="num"><input className="input num" inputMode="decimal" value={g.amount} placeholder="0.00" onChange={(e) => update(g.id, { amount: e.target.value })} /></td>
                  <td className="num">
                    {g.type === 'securities' ? (
                      <input className="input num" inputMode="decimal" value={g.basis} placeholder="0.00" onChange={(e) => update(g.id, { basis: e.target.value })} />
                    ) : <span className="mlog-muted">—</span>}
                  </td>
                  <td>
                    <label className="dlog-check">
                      <input type="checkbox" checked={!!g.acknowledged} onChange={(e) => update(g.id, { acknowledged: e.target.checked })} /> {g.type === 'securities' ? 'Letter' : 'Receipt'}
                    </label>
                    {g.type === 'securities' ? (
                      <label className="dlog-check"><input type="checkbox" checked={g.longTerm !== false} onChange={(e) => update(g.id, { longTerm: e.target.checked })} /> Held &gt; 1 yr</label>
                    ) : null}
                  </td>
                  <td>{g.flags.length ? <span className="dlog-flagtxt" title={g.flags.join(' · ')}><AlertTriangle size={13} /> {g.flags.length}</span> : null}</td>
                  <td className="num"><button type="button" className="mlog-del" aria-label="Remove gift" onClick={() => remove(g.id)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4}>Total</td><td className="num">{money(r.total, 2)}</td><td colSpan={4} /></tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={add}><Plus size={14} /> Add gift</button>
        {r.gifts.some((g) => g.flags.length) ? (
          <ul className="dlog-flaglist">
            {r.gifts.filter((g) => g.flags.length).map((g) => (
              <li key={g.id}><strong>{g.organization || 'Gift'} · {money(g.amountNum, 2)}:</strong> {g.flags.join(' · ')}</li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  )
}

export function DonationReport({ log, clientName, dateLabel }) {
  const r = compute(log)
  const today = dateLabel || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <section className="report">
      <ReportHeader sectionTitle={`Charitable Donation Log — Tax year ${log.taxYear}`} meta={clientName ? `Prepared for ${clientName}` : 'Year-to-date summary'} metaRight={today} />
      <FeatureBlock label="Estimated deductible contributions" value={money(r.deductible, 2)} note={`${r.giftCount} ${r.giftCount === 1 ? 'gift' : 'gifts'} · ${money(r.total, 2)} given${r.avoidedGain > 0 ? ` · ${money(r.avoidedGain)} of capital gain avoided` : ''}`} />
      <div className="stat-grid" style={{ marginTop: 14 }}>
        {GIFT_TYPES.map((t) => <Stat key={t.id} label={t.label} value={money(r.byType[t.id].total)} note={`${r.byType[t.id].count} ${r.byType[t.id].count === 1 ? 'gift' : 'gifts'}`} />)}
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <Stat label="Form 8283" value={r.needs8283 ? 'Required' : 'Not required'} note={`Non-cash total ${money(r.nonCashTotal)}`} feature={r.needs8283} />
        <Stat label="Appraisals" value={number(r.appraisalCount)} note="Non-cash items over $5,000" feature={r.appraisalCount > 0} />
        <Stat label="Receipts missing" value={number(r.missingAck)} note="Gifts of $250+ without acknowledgment" feature={r.missingAck > 0} />
      </div>
      {r.giftCount > 0 ? (
        <>
          <h3 className="report-h3">Gifts</h3>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Organization</th><th>Description</th><th>Type</th><th className="num">Amount / FMV</th><th className="num">Deductible</th><th>Documentation</th></tr></thead>
            <tbody>
              {r.gifts.filter((g) => g.counted).map((g) => (
                <tr key={g.id}>
                  <td>{g.date || '—'}</td><td>{g.organization || '—'}</td><td>{g.description || '—'}</td>
                  <td>{GIFT_TYPES.find((t) => t.id === g.type)?.label}</td>
                  <td className="num">{money(g.amountNum, 2)}</td><td className="num">{money(g.deductible, 2)}</td>
                  <td>{g.flags.length ? g.flags.join('; ') : g.needsAck ? 'Acknowledgment on file' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <Note title="Substantiation">
        Cash gifts under $250 need a bank record or receipt; $250 and over need a contemporaneous written acknowledgment stating whether goods or services were received. Non-cash gifts over $500 in total require Form 8283; a single item or group over $5,000 requires a qualified appraisal. Appreciated securities held more than a year are deductible at fair market value with no capital gain recognized.
      </Note>
      <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
    </section>
  )
}
