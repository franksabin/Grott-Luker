"""Print every calculator from the LIVE site to PDF, verify footers, build contact sheets.
Usage: python print_live_all.py [base_url]
Outputs: deliver/<Title>-report.pdf, deliver/sheets/<slug>.png, and a JSON summary on stdout.
"""
import json, pathlib, re, subprocess, sys, time, uuid, shutil
import fitz

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://grott-luker.fsabin.workers.dev"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
HERE = pathlib.Path(__file__).resolve().parent
DELIVER = HERE / "print-out" / "live"; SHEETS = DELIVER / "sheets"
DELIVER.mkdir(exist_ok=True); SHEETS.mkdir(exist_ok=True)

TOOLS = [
  ("estimated-tax", "Estimated-Tax-Safe-Harbor"), ("multi-year-projection", "Roth-Conversion-RMD-Planner"), ("1031-exchange", "1031-Exchange"),
  ("retirement-tax-map", "Retirement-Income-Tax-Map"), ("withholding-checkup", "Withholding-Checkup"), ("charitable-giving-optimizer", "Charitable-Giving-Optimizer"),
  ("qbi-optimizer", "QBI-Deduction-Optimizer"), ("owner-comp", "Owner-Compensation"), ("cash-balance", "Cash-Balance-Plan"), ("business-sale", "Business-Sale-Net-Liquidity"),
  ("retirement-plan-comparison", "Retirement-Plan-Comparison"), ("paying-your-kids", "Paying-Your-Kids"),
  ("capital-gains-harvesting", "Capital-Gains-Harvesting"), ("retire-track", "On-Track-to-Retire"), ("rollover-401k", "401k-Rollover"), ("divorce-division", "Divorce-Finances"),
  ("concentrated-wealth", "Concentrated-Wealth"), ("social-security-timing", "Social-Security-Timing"), ("arm-vs-fixed", "ARM-vs-Fixed-Mortgage"), ("solar-panels", "Solar-Panels"),
]

def print_one(slug, name):
    pdf = DELIVER / f"{name}-report.pdf"
    url = f"{BASE}/tools/{slug}?sample=1&staff=1"
    for attempt in range(1, 5):
        if pdf.exists(): pdf.unlink()
        prof = HERE / "print-out" / f"live-prof-{uuid.uuid4().hex[:8]}"
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox", f"--user-data-dir={prof}", "--no-pdf-header-footer",
                        "--virtual-time-budget=20000", f"--print-to-pdf={pdf}", url], capture_output=True, text=True, timeout=150)
        shutil.rmtree(prof, ignore_errors=True)
        if pdf.exists() and pdf.stat().st_size > 3000:
            d = fitz.open(str(pdf))
            if len("".join(p.get_text() for p in d).strip()) > 200:
                return d, pdf
            d.close()
        time.sleep(6)
    return None, pdf

summary = []
for slug, name in TOOLS:
    d, pdf = print_one(slug, name)
    if d is None:
        summary.append({"slug": slug, "ok": False, "problem": "no render"}); continue
    n = d.page_count
    m = re.search(r"Page 1 of (\d+)", d[0].get_text().replace("\n", " "))
    declared = int(m.group(1)) if m else None
    problems = []
    if declared is None: problems.append("no 'Page 1 of N' footer on page 1 (screen layout printed?)")
    if declared and n != declared: problems.append(f"{n} pages but footer declares {declared}")
    fills = []
    for i, p in enumerate(d):
        t = p.get_text().replace("\n", " ")
        if declared and f"Page {i+1} of {declared}" not in t: problems.append(f"page {i+1} footer missing (overflow)")
        if re.search(r"NaN|undefined|Infinity|\$—", t): problems.append(f"page {i+1} bad token")
        H = p.rect.height; bottom = 0
        for b in p.get_text("blocks"):
            if ("Prepared for discussion" in b[4]) or re.search(r"Page \d+ of \d+", b[4]) or ("Powered by" in b[4]) or ("Certified Public" in b[4]): continue
            bottom = max(bottom, b[3])
        fills.append(round(bottom / H * 100))
    # contact sheet: all pages side by side on one PDF page, rasterized once
    pw, ph = d[0].rect.width, d[0].rect.height
    gap = 12
    doc2 = fitz.open(); page = doc2.new_page(width=n * pw + (n - 1) * gap, height=ph)
    for i in range(n):
        page.show_pdf_page(fitz.Rect(i * (pw + gap), 0, i * (pw + gap) + pw, ph), d, i)
    page.get_pixmap(dpi=60).save(str(SHEETS / f"{slug}.png")); doc2.close()
    summary.append({"slug": slug, "ok": not problems, "pages": n, "fill": fills, "problems": problems, "pdf": str(pdf)})
    d.close()

print(json.dumps(summary, indent=1))
bad = [s for s in summary if not s["ok"]]
print(f"\n{len(summary) - len(bad)}/{len(summary)} clean; problems: {[ (s['slug'], s.get('problems') or s.get('problem')) for s in bad ]}")
