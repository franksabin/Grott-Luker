import { useEffect, useRef, useState } from 'react'

// The two views of the Roth Conversion & RMD Planner. Each view renders this at the top of its
// input column; the wrapper in MultiYearProjection.jsx owns which one is mounted.
export const VIEWS = [
  { value: 'plan', label: 'Plan to the end' },
  { value: 'year', label: 'This year only (Q4 estimator)' },
]

// Switching views unmounts one page and mounts the other, which drops keyboard focus to the body.
// The wrapper calls requestViewFocus() just before it changes the view; the ViewSwitch that mounts
// next consumes the flag, puts focus back on its active button, and announces the new view.
let focusAfterSwitch = false
export function requestViewFocus() {
  focusAfterSwitch = true
}

// Visually hidden, still read by screen readers (no stylesheet needed).
const HIDDEN = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

export default function ViewSwitch({ view, onChange }) {
  const activeRef = useRef(null)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    if (!focusAfterSwitch) return
    focusAfterSwitch = false
    if (activeRef.current) activeRef.current.focus()
    // Set after mount so the already-present live region sees a text change and announces it.
    const label = (VIEWS.find((v) => v.value === view) || {}).label
    setAnnounce(label ? `Showing ${label}` : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="segmented view-switch no-print" role="group" aria-label="Planner view">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            ref={view === v.value ? activeRef : null}
            type="button"
            className={view === v.value ? 'is-active' : ''}
            aria-pressed={view === v.value}
            onClick={() => {
              if (view !== v.value) onChange(v.value)
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <span className="no-print" role="status" aria-live="polite" style={HIDDEN}>{announce}</span>
    </>
  )
}
