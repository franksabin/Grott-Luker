import { Link, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

export default function Layout() {
  const { pathname } = useLocation()

  // Scroll to top on route change.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const year = new Date().getFullYear()

  return (
    <div className="app">
      <header className="site-header no-print">
        <div className="container">
          <Link to="/" className="brand-link" aria-label="Grott Luker & Co. — home">
            <img
              className="brand-logo"
              src="/brand/gl-logo-white.png"
              alt="Grott Luker & Co."
            />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-tag">Client Decision Support Toolkit</span>
          </Link>
          <nav className="header-nav">
            <Link to="/">Dashboard</Link>
          </nav>
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
              <a href="https://www.blueline-advisors.com" target="_blank" rel="noopener noreferrer">
                <img src="/brand/blueline-logo.png" alt="BlueLine Advisors" />
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
