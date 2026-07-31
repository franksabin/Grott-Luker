import { HelpCircle } from 'lucide-react'
import { money, percent as pct, toNumber, clampPct } from '../lib/format.js'

/* Inline explanation for unfamiliar financial terms. */
export function InfoTip({ text }) {
  return (
    <span className="infotip" tabIndex={0} role="note">
      <HelpCircle size={14} strokeWidth={2} />
      <span className="infotip-bubble">{text}</span>
    </span>
  )
}

export function Field({ label, info, children, hint }) {
  return (
    <div className="field">
      <label className="field-label">
        {label}
        {info ? <InfoTip text={info} /> : null}
      </label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function MoneyField({ label, info, value, onChange, hint, placeholder }) {
  return (
    <Field label={label} info={info} hint={hint}>
      <div className="input-money">
        <span>$</span>
        <input
          className="input"
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Field>
  )
}

export function NumberField({ label, info, value, onChange, hint, suffix, placeholder }) {
  const inner = (
    <input
      className="input"
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
  return (
    <Field label={label} info={info} hint={hint}>
      {suffix ? (
        <div className="input-suffix">
          {inner}
          <span>{suffix}</span>
        </div>
      ) : (
        inner
      )}
    </Field>
  )
}

export function SelectField({ label, info, value, onChange, options, hint }) {
  return (
    <Field label={label} info={info} hint={hint}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Panel({ title, children, style }) {
  return (
    <section className="panel" style={style}>
      {title ? <div className="panel-title">{title}</div> : null}
      {children}
    </section>
  )
}

export function ResultRow({ label, info, value, total, sub, negative, positive, raw }) {
  const cls = ['result-row', total ? 'is-total' : '', sub ? 'is-sub' : '']
    .filter(Boolean)
    .join(' ')
  const valCls = [
    'result-value',
    negative ? 'val-negative' : '',
    positive ? 'val-positive' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <span className="result-label">
        {label}
        {info ? <InfoTip text={info} /> : null}
      </span>
      <span className={valCls}>{raw != null ? raw : money(value)}</span>
    </div>
  )
}

export function Stat({ label, value, note, feature }) {
  return (
    <div className={`stat${feature ? ' stat-feature' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  )
}

export function Bar({ label, value, max, display }) {
  const width = clampPct(max > 0 ? (toNumber(value) / max) * 100 : 0)
  return (
    <div className="bar-row">
      <div className="bar-head">
        <span>{label}</span>
        <strong>{display != null ? display : money(value)}</strong>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

export function SectionHeading({ children }) {
  return <h2 className="section-heading">{children}</h2>
}

export function Assumptions({ items }) {
  return (
    <Panel title="Assumptions">
      <ul className="assumptions" style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </Panel>
  )
}

export function Note({ title, children }) {
  return (
    <div className="note">
      {title ? <div className="note-title">{title}</div> : null}
      {children}
    </div>
  )
}

/* Navy monogram mark for white report letterheads (the GL logo is white-only). */
export function BrandMark({ size = 40 }) {
  return (
    <span
      className="brand-mark"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      GL
    </span>
  )
}

/* Client-report letterhead. */
export function ReportHeader({ sectionTitle, meta, metaRight }) {
  return (
    <>
      <div className="report-letterhead">
        <BrandMark size={44} />
        <div>
          <div className="lh-firm">Grott Luker &amp; Co.</div>
          <div className="lh-sub">Certified Public Accountants · Portsmouth, New Hampshire</div>
        </div>
      </div>
      {meta || metaRight ? (
        <div className="report-meta">
          <span>{meta}</span>
          <span>{metaRight}</span>
        </div>
      ) : null}
      {sectionTitle ? <h2 className="report-section-title">{sectionTitle}</h2> : null}
    </>
  )
}

export function FeatureBlock({ label, value, note, compact }) {
  return (
    <div className={`feature-block${compact ? ' is-compact' : ''}`}>
      <div className="fb-label">{label}</div>
      <div className="fb-value">{value}</div>
      {note ? <div className="fb-note">{note}</div> : null}
    </div>
  )
}

export function Callout({ label, value, rightLabel, rightValue, tone = 'good' }) {
  return (
    <div className={`callout callout-${tone}`}>
      <div className="callout-split">
        <div>
          <div className="callout-label">{label}</div>
          <div className="callout-value">{value}</div>
        </div>
        {rightLabel != null ? (
          <div style={{ textAlign: 'right' }}>
            <div className="callout-label">{rightLabel}</div>
            <div className="callout-value">{rightValue}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function DisclosureBox({ children }) {
  return <div className="disclosure-box">{children}</div>
}

export function Narrative({ children }) {
  return (
    <div className="report-narrative">
      <div className="report-narrative-label">Summary</div>
      <p>{children}</p>
    </div>
  )
}

export function SliderField({ label, info, value, onChange, min = 0, max = 100, step = 1, readout }) {
  return (
    <div className="field">
      <div className="slider-head">
        <label className="field-label" style={{ margin: 0 }}>
          {label}
          {info ? <InfoTip text={info} /> : null}
        </label>
        <span className="slider-value">{readout != null ? readout : value}</span>
      </div>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function SegmentedField({ label, info, value, onChange, options }) {
  return (
    <Field label={label} info={info}>
      <div className={`segmented${options.length > 2 ? ' cols-3' : ''}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={value === o.value ? 'is-active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  )
}

export { money, pct }
