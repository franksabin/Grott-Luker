"""Print a tool page from the running dev server to PDF and check the report fits.

Usage:  python check_print.py <route-slug> <expected-pages> <page-file-basename> [out-tag] [query-string]
  e.g.  python check_print.py estimated-tax 2 EstimatedTax

What it does
  1. Parses src/pages/<page-file-basename>.jsx with esbuild (syntax check) — refuses to print if broken.
  2. Prints http://localhost:5174/tools/<route-slug>?sample=1 with headless Chrome to a PDF
     (retries when the app rendered blank, which happens briefly while another file is mid-edit).
  3. Checks: page count == expected; every page k has the text "Page k of N" (the footer is
     clipped — and so disappears from the PDF text — whenever the content above it overflows);
     no "NaN" / "undefined" / "$—" / "Infinity" anywhere; content fill per page.
  4. Rasterizes every page to PNG (100 dpi) so you can Read them.
Prints one JSON object. "ok": true means all checks passed.
"""
import json, os, pathlib, subprocess, sys, time, uuid, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = pathlib.Path(__file__).resolve().parent / "print-out"
OUT.mkdir(exist_ok=True)

slug = sys.argv[1]
expected = int(sys.argv[2])
page_file = sys.argv[3]
tag = sys.argv[4] if len(sys.argv) > 4 else slug
result = {"slug": slug, "expected_pages": expected, "ok": False, "problems": []}

# 1. syntax check of the page file (a syntax error here breaks EVERY route in dev)
src = ROOT / "src" / "pages" / f"{page_file}.jsx"
chk = subprocess.run(["node", "-e",
    "const e=require('esbuild');const fs=require('fs');try{e.transformSync(fs.readFileSync(process.argv[1],'utf8'),{loader:'jsx'});console.log('OK')}catch(err){console.log('ERR '+err.message.split('\\n')[0])}",
    str(src)], cwd=ROOT, capture_output=True, text=True)
syntax = chk.stdout.strip()
result["syntax"] = syntax
if not syntax.startswith("OK"):
    result["problems"].append(f"SYNTAX ERROR in {src.name}: {syntax} — fix this first; it blanks every page of the app for everyone.")
    print(json.dumps(result, indent=1)); sys.exit(0)

# 2. print to PDF (retry on blank)
import fitz  # PyMuPDF
pdf = OUT / f"{tag}.pdf"
# Optional 5th argument: a raw query string, e.g. "view=year&sample=1" or "view=year&state=<base64 json>".
# Without it the page loads with ?sample=1.
query = sys.argv[5] if len(sys.argv) > 5 else "sample=1"
url = f"http://localhost:5174/tools/{slug}?{query}"
attempts = 0
doc = None
while attempts < 5:
    attempts += 1
    if pdf.exists(): pdf.unlink()
    prof = OUT / f"prof-{uuid.uuid4().hex[:8]}"
    cmd = [CHROME, "--headless", "--disable-gpu", "--no-sandbox", f"--user-data-dir={prof}",
           "--no-pdf-header-footer", "--virtual-time-budget=20000", f"--print-to-pdf={pdf}", url]
    subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    try:
        import shutil; shutil.rmtree(prof, ignore_errors=True)
    except Exception: pass
    if not pdf.exists() or pdf.stat().st_size < 3000:
        result["problems"].append(f"attempt {attempts}: PDF missing or tiny (app rendered blank?)")
        time.sleep(8); continue
    doc = fitz.open(str(pdf))
    text_all = "".join(p.get_text() for p in doc)
    if len(text_all.strip()) < 200:
        result["problems"].append(f"attempt {attempts}: PDF has almost no text (app blank — likely another page file is mid-edit; retrying)")
        doc.close(); doc = None; time.sleep(8); continue
    break

if doc is None:
    result["problems"].append("Could not get a rendered PDF after 5 attempts. Check http://localhost:5174/tools/" + slug + " in a browser; the app may be broken by a syntax error somewhere.")
    print(json.dumps(result, indent=1)); sys.exit(0)

# a successful render clears the retry notes
result["problems"] = [p for p in result["problems"] if not p.startswith("attempt")]
result["attempts"] = attempts
result["pdf"] = str(pdf)
n = doc.page_count
result["pages"] = n
if n != expected:
    result["problems"].append(f"PAGE COUNT {n} != expected {expected}. If more: content overflowed into extra pages or the screen layout is printing (printReport not wired). If fewer: a PrintPage is missing.")

pages = []
bad_tokens = re.compile(r"NaN|undefined|\$—|Infinity|\[object Object\]")
for i, page in enumerate(doc):
    txt = page.get_text()
    footer = f"Page {i+1} of {expected}" in txt.replace("\n", " ")
    blocks = page.get_text("blocks")
    H = page.rect.height
    content_bottom = 0.0
    footer_top = None
    footer_bottom = 0.0
    W = page.rect.width
    edge_hits = []
    for b in blocks:
        x0, y0, x1, y1, t = b[0], b[1], b[2], b[3], b[4]
        if x1 > W - 2 or x0 < 2:
            edge_hits.append(t.strip()[:40])
        if ("Prepared for discussion" in t) or re.search(r"Page \d+ of \d+", t) or ("Powered by" in t) or ("Certified Public Accountants" in t):
            footer_top = y0 if footer_top is None else min(footer_top, y0)
            footer_bottom = max(footer_bottom, y1)
            continue
        content_bottom = max(content_bottom, y1)
    fill = round(content_bottom / H * 100)
    if footer and footer_bottom > H - 3:
        result["problems"].append(f"page {i+1}: footer runs to the very bottom edge (y={footer_bottom:.0f} of {H:.0f}) — it is probably clipped. Content above is too tall by a few lines.")
    if footer and footer_top is not None and content_bottom > footer_top - 2:
        result["problems"].append(f"page {i+1}: content overlaps the footer (content bottom {content_bottom:.0f} vs footer top {footer_top:.0f}).")
    if edge_hits:
        result["problems"].append(f"page {i+1}: text touches the left/right page edge: {edge_hits[:3]}")
    toks = sorted(set(bad_tokens.findall(txt)))
    png = OUT / f"{tag}-p{i+1}.png"
    page.get_pixmap(dpi=100).save(str(png))
    info = {"page": i+1, "footer_present": footer, "content_fill_pct": fill, "png": str(png), "bad_tokens": toks}
    pages.append(info)
    if not footer:
        result["problems"].append(f"page {i+1}: footer 'Page {i+1} of {expected}' NOT in PDF text — content overflowed and clipped the footer (or the page is missing a <PrintFooter page={i+1} pages={expected} />). Move a section to another page, use compact, or trim.")
    if footer and fill < 55:
        result["problems"].append(f"page {i+1}: content fills only ~{fill}% of the page height — too sparse. Enlarge the chart, add detail rows, or merge pages.")
    if toks:
        result["problems"].append(f"page {i+1}: bad tokens in text: {toks}")
result["page_detail"] = pages
result["ok"] = not result["problems"]
doc.close()
print(json.dumps(result, indent=1))
