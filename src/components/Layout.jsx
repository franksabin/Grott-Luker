import { Link, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { TOOLS } from '../lib/tools.js'

// `client` renders the public, client-facing chrome: same branding, but no
// links into the internal CPA toolkit.
export default function Layout({ client = false }) {
  const { pathname } = useLocation()

  // Scroll to top on route change.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // Anonymous usage ping when a tool is opened (staff routes only). Fire-and-
  // forget; failures are silent and nothing is shown in the UI.
  useEffect(() => {
    if (client || !import.meta.env.PROD) return
    const tool = TOOLS.find((t) => t.path === pathname)
    if (!tool) return
    const payload = JSON.stringify({ tool_id: tool.id })
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/usage', new Blob([payload], { type: 'application/json' }))
      } else {
        fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
      }
    } catch {
      /* ignore */
    }
  }, [pathname, client])

  const year = new Date().getFullYear()
  // The dashboard hero already carries the toolkit eyebrow; repeating it in
  // the header 120px above reads as clutter. Show it only where it adds context.
  const showKicker = pathname !== '/'

  return (
    <div className="app">
      <header className="site-header no-print">
        <div className="container">
          {client ? (
            <span className="brand-stack">
              <img className="brand-full-logo" src="/brand/gl-logo-white-tight.png" alt="Grott Luker & Co." />
              {showKicker ? <span className="brand-kicker">Client Decision Support Toolkit</span> : null}
            </span>
          ) : (
            <Link to="/" className="brand-stack" aria-label="Grott Luker & Co. — home">
              <img className="brand-full-logo" src="/brand/gl-logo-white-tight.png" alt="Grott Luker & Co." />
              {showKicker ? <span className="brand-kicker">Client Decision Support Toolkit</span> : null}
            </Link>
          )}
          <span className="brand-powered-pill">
            <span className="powered-by-label">Powered by</span>
            <img className="brand-bl-logo" src="/brand/blueline-logo-white.png" alt="BlueLine Advisors" />
          </span>
        </div>
      </header>

      {/* Print-only lightweight brand line so printouts/PDFs are identified. */}
      <div className="print-only" style={{ padding: '0 12px', marginBottom: 8 }}>
        <strong style={{ color: '#14335c', fontSize: 16 }}>Grott Luker &amp; Co.</strong>
        <span style={{ color: '#66707e', marginLeft: 8, fontSize: 12 }}>
          Client Decision Support Toolkit
        </span>
      </div>

      <main className="main">
        <div className="container">
          <Outlet />
        </div>
      </main>

      <footer className="site-footer no-print">
        <div className="container">
          <div className="footer-top">
            <div>
              <div className="footer-firm">Grott Luker &amp; Co.</div>
              <div>Certified Public Accountants · Portsmouth, New Hampshire</div>
            </div>
            <div className="footer-attrib">
              <span className="footer-attrib-label">Decision Support Technology by</span>
              <a
                href="https://www.blueline-advisors.com"
                target="_blank"
                rel="noopener noreferrer"
                className="brand-lockup brand-lockup-lg"
              >
                <img className="brand-full-logo" src="/brand/blueline-logo-white.png" alt="BlueLine Advisors" />
              </a>
            </div>
          </div>
          <p className="footer-legal">
            These educational planning tools provide estimates based on
            information entered by the user. They are intended to support
            conversations with Grott Luker &amp; Co. and should not be
            interpreted as tax, legal, accounting, or investment advice.
            <br />
            © {year} Grott Luker &amp; Co. · Decision support technology by
            BlueLine Advisors.
          </p>
        </div>
      </footer>

      {/* Printout footer — rendered once at the end of the report (print only). */}
      <div className="print-footer">
        <div className="print-footer-lockup">
          <span className="print-footer-label">Powered by</span>
          <img
            className="print-footer-logo"
            src="/brand/blueline-logo-dark.png"
            alt="BlueLine Advisors"
          />
        </div>
        <div className="print-footer-contact">
          www.blueline-advisors.com &nbsp;·&nbsp; 99 Water Street, Suite 3, Exeter, NH
          &nbsp;·&nbsp; (603) 418-0940
        </div>
        <p className="print-footer-disclosure">
          BlueLine Advisors, LLC is an SEC registered investment adviser.
          Registration does not imply a certain level of skill or training.
          Investing involves risk, including possible loss of principal. Past
          performance does not guarantee future results. The content on this
          website is for informational purposes only and should not be construed
          as investment, legal, tax, or accounting advice. Use of this website
          does not create an advisory relationship with BlueLine Advisors, LLC.
        </p>
      </div>
    </div>
  )
}
