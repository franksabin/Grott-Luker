// Lightweight, dependency-free charts that animate as inputs change.
// Calm, professional palette — navy family plus a few muted semantic tones.
import { money as fmtMoney, percent } from '../lib/format.js'

// Sequential navy scale for compositions.
export const PALETTE = ['#14335c', '#2f5788', '#4f7cae', '#7ea6c9', '#a9c3da', '#cdd9e8']

// Semantic tones for breakdowns (kept muted, never neon).
export const TONE = {
  net: '#2e7d5b', // proceeds / positive
  tax: '#c0794a', // taxes (muted terracotta)
  cost: '#9aa3b0', // costs (slate gray)
  debt: '#54627a', // debt (slate)
  state: '#d9a066', // state tax (muted amber)
  navy: '#14335c',
  accent: '#4f7cae',
}

function colorAt(d, i) {
  return d.color || PALETTE[i % PALETTE.length]
}

export function Legend({ data, format = fmtMoney, total, showPct = true, showValue = true }) {
  const t = total != null ? total : data.reduce((s, d) => s + d.value, 0)
  return (
    <ul className="chart-legend">
      {data.map((d, i) => (
        <li key={i}>
          <span className="chart-dot" style={{ background: colorAt(d, i) }} />
          <span className="chart-legend-label">{d.label}</span>
          {showValue ? (
            <span className="chart-legend-val">
              {format(d.value)}
              {showPct && t > 0 ? <span className="muted"> · {percent((d.value / t) * 100, 0)}</span> : null}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function DonutChart({
  data,
  size = 176,
  thickness = 26,
  centerLabel,
  centerValue,
  format = fmtMoney,
  legend = true,
}) {
  const clean = data.filter((d) => d.value > 0)
  const total = clean.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let acc = 0

  return (
    <div className="chart-donut-wrap">
      <div className="chart-donut-figure" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="chart-donut">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={thickness} />
            {total > 0 &&
              clean.map((d, i) => {
                const len = (d.value / total) * c
                const seg = (
                  <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={colorAt(d, i)}
                    strokeWidth={thickness}
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-acc}
                    className="chart-donut-seg"
                  />
                )
                acc += len
                return seg
              })}
          </g>
        </svg>
        {centerValue != null || centerLabel != null ? (
          <div className="chart-donut-center">
            <div className="chart-donut-value">{centerValue}</div>
            <div className="chart-donut-label">{centerLabel}</div>
          </div>
        ) : null}
      </div>
      {legend ? <Legend data={clean} format={format} total={total} /> : null}
    </div>
  )
}

export function StackedBar({ data, format = fmtMoney, height = 24, legend = true }) {
  const clean = data.filter((d) => d.value > 0)
  const total = clean.reduce((s, d) => s + d.value, 0)
  return (
    <div>
      <div className="chart-stack" style={{ height }}>
        {total > 0 ? (
          clean.map((d, i) => (
            <div
              key={i}
              className="chart-stack-seg"
              style={{ width: `${(d.value / total) * 100}%`, background: colorAt(d, i) }}
              title={`${d.label}: ${format(d.value)}`}
            />
          ))
        ) : (
          <div className="chart-stack-empty" />
        )}
      </div>
      {legend ? <Legend data={clean} format={format} total={total} /> : null}
    </div>
  )
}

// Vertical grouped bars for comparisons. groups: [{ label, bars: [{ label, value, color }] }]
export function BarCompare({ groups, format = fmtMoney, height = 190, legend = true }) {
  const values = groups.flatMap((g) => g.bars.map((b) => Math.max(0, b.value)))
  const max = Math.max(1, ...values)
  const legendData = (groups[0]?.bars || []).map((b) => ({ label: b.label, value: 0, color: b.color }))
  return (
    <div className="chart-bars">
      <div className="chart-bars-plot" style={{ height }}>
        {groups.map((g, gi) => (
          <div key={gi} className="chart-bar-group">
            <div className="chart-bar-cols">
              {g.bars.map((b, bi) => (
                <div className="chart-bar-col" key={bi}>
                  <span className="chart-bar-val">{format(b.value)}</span>
                  <div
                    className="chart-bar"
                    style={{
                      height: `${(Math.max(0, b.value) / max) * 100}%`,
                      background: b.color || PALETTE[bi % PALETTE.length],
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="chart-bar-glabel">{g.label}</div>
          </div>
        ))}
      </div>
      {legend && legendData.length > 1 ? (
        <Legend data={legendData} showValue={false} />
      ) : null}
    </div>
  )
}

// Simple range indicator (low → high) on a track, with an optional reference marker.
export function RangeBar({ low, high, ceiling, reference, format = fmtMoney }) {
  const top = Math.max(ceiling || high, high, reference || 0, 1)
  const leftPct = (low / top) * 100
  const widthPct = Math.max(2, ((high - low) / top) * 100)
  const refPct = reference != null ? (reference / top) * 100 : null
  return (
    <div className="chart-range">
      <div className="chart-range-track">
        <div className="chart-range-fill" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
        {refPct != null ? (
          <div className="chart-range-ref" style={{ left: `${refPct}%` }} title={`Reference: ${format(reference)}`} />
        ) : null}
      </div>
      <div className="chart-range-labels">
        <span>{format(low)}</span>
        <span>{format(high)}</span>
      </div>
    </div>
  )
}
