import { useState, useEffect } from 'react'
import { X, Copy, Mail, Check } from 'lucide-react'
import { buildEmail } from '../lib/emailRequests.js'

export default function RequestInfoModal({ open, onClose, spec }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)

  // (Re)initialize the editable email whenever the modal is opened for a tool.
  useEffect(() => {
    if (open) {
      const email = buildEmail(spec)
      setSubject(email.subject)
      setBody(email.body)
      setCopied(false)
    }
  }, [open, spec])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const copyEmail = async () => {
    const text = `Subject: ${subject}\n\n${body}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  const openInEmail = () => {
    const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = href
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Request client information"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Request Client Information</div>
            <h2 className="modal-title">Draft a client information request</h2>
          </div>
          <button className="iconbtn modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="modal-intro">
          This email lists exactly the information this tool needs. Personalize
          the client name and your signature, then copy it or open it in your
          email app. Your client can simply reply with their answers.
        </p>

        <label className="field-label">Subject</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />

        <label className="field-label" style={{ marginTop: 16 }}>
          Message
        </label>
        <textarea
          className="input modal-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          spellCheck
        />

        <div className="modal-actions">
          <button className="btn btn-subtle" onClick={onClose}>
            Close
          </button>
          <span className="toolbar-spacer" />
          <button className="btn btn-ghost" onClick={copyEmail}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy email'}
          </button>
          <button className="btn btn-primary" onClick={openInEmail}>
            <Mail size={16} /> Open in email app
          </button>
        </div>
      </div>
    </div>
  )
}
