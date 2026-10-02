// Print-only report primitives. A tool passes `printReport` to ToolShell; the
// screen layout is hidden when printing and these pages are rendered instead.
// Pages are sized to US Letter with 0.5in margins so the page count is fixed.
import { useEffect } from 'react'

export function PrintDoc({ children }) {
  useEffect(() => {
    document.body.classList.add('has-print-report')
    return () => document.body.classList.remove('has-print-report')
  }, [])
  return <div className="pr-doc print-only">{children}</div>
}

export function PrintPage({ children, last = false, compact = false }) {
  return <section className={`pr-page${last ? ' is-last' : ''}${compact ? ' is-compact' : ''}`}>{children}</section>
}

// Two (or three) blocks side by side. Children are usually PrintSections.
export function PrintCols({ children, cols = 2 }) {
  return <div className={`pr-cols${cols === 3 ? ' is-3' : ''}`}>{children}</div>
}

export function PrintBand({ title, subtitle, meta, metaRight }) {
  return (
    <header className="pr-band">
      <div className="pr-band-row">
        <img className="pr-logo" src="/brand/gl-logo-white-tight.png" alt="Grott Luker & Co." />
        <div className="pr-band-title">
          <div className="pr-band-eyebrow">Client Decision Support Toolkit</div>
          <h1>{title}</h1>
          {subtitle ? <div className="pr-band-sub">{subtitle}</div> : null}
        </div>
      </div>
      <div className="pr-band-meta">
        <span>{meta}</span>
        <span>{metaRight}</span>
      </div>
    </header>
  )
}

export function PrintPageHead({ title, right }) {
  return (
    <div className="pr-pagehead">
      <span>Grott Luker &amp; Co. · {title}</span>
      <span>{right}</span>
    </div>
  )
}

export function PrintSection({ title, note, children, className = '' }) {
  return (
    <section className={`pr-section ${className}`}>
      {title ? (
        <div className="pr-section-head">
          <h2>{title}</h2>
          {note ? <span>{note}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function PrintFeature({ label, value, note }) {
  return (
    <div className="pr-feature">
      <div className="pr-feature-label">{label}</div>
      <div className="pr-feature-value">{value}</div>
      {note ? <div className="pr-feature-note">{note}</div> : null}
    </div>
  )
}

export function PrintTiles({ items }) {
  return (
    <div className="pr-tiles" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={i} className={`pr-tile${it.best ? ' is-best' : ''}`}>
          <div className="pr-tile-label">{it.label}</div>
          <div className="pr-tile-value">{it.value}</div>
          {it.note ? <div className="pr-tile-note">{it.note}</div> : null}
        </div>
      ))}
    </div>
  )
}

export function PrintRows({ rows }) {
  return (
    <div className="pr-rows">
      {rows.map((r, i) => (
        <div key={i} className={`pr-row${r.total ? ' is-total' : ''}${r.sub ? ' is-sub' : ''}`}>
          <span>{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  )
}

// align: per-column 'left' | 'right' (right = numeric, tabular). rowClass(row, i) → 'is-strong' | 'is-tint' | ''.
export function PrintTable({ head, rows, widths, align, rowClass }) {
  const cls = (j) => (align && align[j] === 'right' ? 'num' : undefined)
  return (
    <table className="pr-table">
      {widths ? <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup> : null}
      <thead>
        <tr>{head.map((h, i) => <th key={i} className={cls(i)}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={rowClass ? rowClass(r, i) || undefined : undefined}>{r.map((c, j) => <td key={j} className={cls(j)}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

export function PrintProse({ children }) {
  return <div className="pr-prose">{children}</div>
}

export function PrintNote({ title, children }) {
  return (
    <div className="pr-note">
      {title ? <div className="pr-note-title">{title}</div> : null}
      <div>{children}</div>
    </div>
  )
}

export function PrintInputs({ items }) {
  return (
    <dl className="pr-inputs">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PrintAssumptions({ items }) {
  return (
    <ul className="pr-assumptions">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}

export function PrintFooter({ page, pages }) {
  return (
    <footer className="pr-footer">
      <div className="pr-footer-row">
        <span className="pr-footer-firm">Grott Luker &amp; Co. · Certified Public Accountants · Portsmouth, New Hampshire</span>
        <span className="pr-footer-powered">
          Powered by <img src="/brand/blueline-logo-dark.png" alt="BlueLine Advisors" />
        </span>
      </div>
      <p className="pr-footer-disc">
        Prepared for discussion with Grott Luker &amp; Co. This report is an estimate built from the inputs shown and simplified federal tax rules; it is not tax, legal, or investment advice and should be reviewed with your CPA before any decision. BlueLine Advisors, LLC, an SEC-registered investment adviser, builds and maintains the toolkit; registration does not imply a particular level of skill, and use of the toolkit does not create an advisory relationship with BlueLine.
      </p>
      <div className="pr-footer-page">Page {page} of {pages}</div>
    </footer>
  )
}
