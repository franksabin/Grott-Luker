import { useState } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import KynInputs from '../components/KynInputs.jsx'
import KynSnapshot from '../components/KynSnapshot.jsx'
import { BLANK, SAMPLE } from '../lib/knowYourNumbers.js'

// Internal CPA version: the CPA enters figures collected from the client.
// Clients fill out /client/know-your-numbers instead, and submissions land in
// the CPA results viewer at /client-results.
export default function KnowYourNumbers() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <ToolShell
      title="Know Your Numbers"
      subtitle="A clean, one-page financial snapshot — a conversation starter you can share and bring to your next meeting."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
    >
      {/* Inputs are hidden when printing so the snapshot prints on its own. */}
      <KynInputs form={form} set={set} className="no-print" />
      <KynSnapshot form={form} />
    </ToolShell>
  )
}
