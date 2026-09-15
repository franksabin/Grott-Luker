import { Calculator } from 'lucide-react'

/**
 * Step-by-step calculation trace. `steps` is produced by each tool's compute()
 * from the same numbers it reports, so the trace can never drift from the
 * result. Each step: { label, formula, result, note? }.
 *
 * Collapsed on screen; when opened it also prints as an appendix page.
 */
export default function MathTrace({ steps, title = 'Show the math' }) {
  if (!steps || !steps.length) return null
  return (
    <details className="math-trace">
      <summary>
        <Calculator size={15} /> {title}
        <span className="math-trace-hint">Every figure below is the one used in the result above.</span>
      </summary>
      <div className="math-trace-body">
        <div className="math-trace-title print-only">Calculation detail</div>
        <ol>
          {steps.map((s, i) => (
            <li key={i}>
              <div className="mt-label">{s.label}</div>
              <div className="mt-formula">{s.formula}</div>
              <div className="mt-result">{s.result}</div>
              {s.note ? <div className="mt-note">{s.note}</div> : null}
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}
