"""Build the downloadable Excel templates for the three Client Shareables.

    python scripts/build-templates.py

Writes to public/templates/. Rates and categories are read from the web tool's
source (src/lib/mileage.js, expenseGuide.js, knowYourNumbers.js) so the two stay
in step; re-run after changing either. Grott Luker branding with a quiet BlueLine co-brand.
"""
import datetime
import pathlib
import re

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.page import PageMargins
from openpyxl.formatting.rule import FormulaRule
from PIL import Image as PILImage

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "templates"
BRAND = ROOT / "public" / "brand"
OUT.mkdir(parents=True, exist_ok=True)
YEAR = 2026
ROWS = 150  # input rows per log

# ---- palette (matches src/index.css)
NAVY = "0F2440"
GOLD = "C4A054"
CREAM = "F4F0E6"
LINE = "E6E0D2"
INPUT = "FFFBEA"
PICK = "EAF1FA"  # dropdown cells
DIM = "F3F1EC"   # cells that do not apply to this row
INK = "26262B"
INK_SOFT = "454650"
MUTED = "726D63"

SERIF = "Georgia"
SANS = "Arial"

f_band_title = Font(name=SERIF, size=15, color="FFFFFF")
f_band_sub = Font(name=SANS, size=8, color="C9D6E6")
f_sub = Font(name=SANS, size=10, color=INK_SOFT)
f_section = Font(name=SERIF, size=12, bold=True, color=NAVY)
f_colhead = Font(name=SANS, size=8, bold=True, color=MUTED)
f_body = Font(name=SANS, size=10, color=INK)
f_bold = Font(name=SANS, size=10, bold=True, color=INK)
f_note = Font(name=SANS, size=9, italic=True, color=MUTED)
f_flag = Font(name=SANS, size=9, color="A5533C")
f_tile_label = Font(name=SANS, size=8, bold=True, color=MUTED)
f_tile_value = Font(name=SERIF, size=18, bold=True, color=NAVY)
f_tile_note = Font(name=SANS, size=8, color=MUTED)
f_total = Font(name=SERIF, size=11, bold=True, color=NAVY)

fill_navy = PatternFill("solid", fgColor=NAVY)
fill_cream = PatternFill("solid", fgColor=CREAM)
fill_input = PatternFill("solid", fgColor=INPUT)
fill_pick = PatternFill("solid", fgColor=PICK)
fill_dim = PatternFill("solid", fgColor=DIM)
fill_flag = PatternFill("solid", fgColor="FBF1EC")

hair = Side(style="thin", color=LINE)
gold = Side(style="medium", color=GOLD)
navy_thin = Side(style="thin", color=NAVY)
b_row = Border(bottom=hair)
b_colhead = Border(bottom=navy_thin)
b_section = Border(bottom=gold)
b_total = Border(top=navy_thin)

MONEY = '$#,##0.00;($#,##0.00);"–"'
MONEY0 = '$#,##0;($#,##0);"–"'
RATE = '$0.000'
PCT = '0%'
PCT1 = '0.0%'
DATE = 'mm/dd/yyyy'
INT = '#,##0;(#,##0);"–"'

DISCLAIMER = (
    "Prepared for planning with Grott Luker & Co. This workbook organizes your records; it does not determine what is deductible. "
    "Entries are your own; review with your Grott Luker CPA before anything is used in a return or a decision."
)
ABOUT = [
    ("Grott Luker & Co.", f_section),
    ("Certified Public Accountants · Portsmouth, New Hampshire · Accounting | Tax Planning | Advisory", f_body),
    ("Questions about this workbook go to your Grott Luker CPA.", f_body),
    ("", f_body),
    ("Powered by BlueLine Advisors", f_bold),
    ("The Client Decision Support Toolkit and its templates are built and maintained for Grott Luker & Co. by BlueLine Advisors, LLC, an SEC-registered investment adviser in Exeter, NH (registration does not imply any particular level of skill). Using this workbook does not create an advisory relationship with BlueLine.", f_note),
]


# --------------------------------------------------------------------------- source data
import json
import subprocess


def guide():
    """Categories, industries, rates, gift types — exported from the JS source by scripts/export-guide.mjs."""
    out = ROOT / "scripts" / "guide.json"
    subprocess.run(["node", str(ROOT / "scripts" / "export-guide.mjs")], check=True, cwd=ROOT, shell=True)
    return json.loads(out.read_text(encoding="utf-8"))


def read_src(rel):
    return (ROOT / "src" / "lib" / rel).read_text(encoding="utf-8")


TREAT = {  # legacy, kept for the donation/KYN builders
    "ok": "Deductible", "limited": "Partly deductible", "ask": "For your CPA", "not": "Not deductible"}


# --------------------------------------------------------------------------- building blocks
def logo(height_px):
    path = BRAND / "gl-logo-white-tight.png"
    img = XLImage(str(path))
    with PILImage.open(path) as im:
        w, h = im.size
    img.height = height_px
    img.width = int(w * height_px / h)
    return img


def setup(ws, widths, landscape=True, title=""):
    """Common sheet chrome: no gridlines, column widths, print setup."""
    ws.sheet_view.showGridLines = False
    ws.sheet_view.showRowColHeaders = False
    ws.sheet_view.zoomScale = 110
    ws.sheet_properties.tabColor = NAVY
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins = PageMargins(left=0.5, right=0.5, top=0.6, bottom=0.6)
    ws.oddFooter.left.text = f"Grott Luker & Co. · {title}"
    ws.oddFooter.left.size = 8
    ws.oddFooter.right.text = "Page &P of &N"
    ws.oddFooter.right.size = 8


def band(ws, cols, title, sub):
    """Rows 1–3: navy band with the logo at left and the sheet title at right."""
    for r in (1, 2, 3):
        for c in range(1, cols + 1):
            ws.cell(row=r, column=c).fill = fill_navy
    ws.row_dimensions[1].height = 10
    ws.row_dimensions[2].height = 40
    ws.row_dimensions[3].height = 14
    img = logo(52)
    img.anchor = "A1"
    ws.add_image(img)
    t = ws.cell(row=2, column=cols, value=title)
    t.font = f_band_title
    t.alignment = Alignment(horizontal="right", vertical="center")
    # a formula sub-line (starts with "=") already carries the credit; plain text gets it appended
    s = ws.cell(row=3, column=cols, value=sub if str(sub).startswith("=") else f"{sub}   ·   Powered by BlueLine Advisors")
    s.font = f_band_sub
    s.alignment = Alignment(horizontal="right", vertical="top")
    ws.row_dimensions[4].height = 10
    ws.print_title_rows = "1:4"


def section(ws, row, cols, text, note=None, c1=1):
    """Cream section band with a gold rule, like the dashboard ribbons."""
    for c in range(c1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = fill_cream
        cell.border = b_section
    ws.cell(row=row, column=c1, value=text).font = f_section
    ws.cell(row=row, column=c1).alignment = Alignment(vertical="center", indent=1)
    if note:
        n = ws.cell(row=row, column=cols, value=note)
        n.font = f_note
        n.alignment = Alignment(horizontal="right", vertical="center")
    ws.row_dimensions[row].height = 24


def colheads(ws, row, heads, aligns=None, c1=1):
    for i, h in enumerate(heads):
        col = c1 + i
        c = ws.cell(row=row, column=col, value=h.upper() if h else None)
        c.font = f_colhead
        c.border = b_colhead
        c.alignment = Alignment(horizontal=(aligns or {}).get(col, "left"), vertical="bottom", indent=1 if col == c1 else 0)
    ws.row_dimensions[row].height = 18


def inp(cell, fmt=None, align="left"):
    cell.fill = fill_input
    cell.font = f_body
    cell.border = b_row
    cell.alignment = Alignment(horizontal=align, vertical="center", indent=1 if align == "left" else 0)
    if fmt:
        cell.number_format = fmt


def pick(cell, align="left"):
    """A dropdown cell: light blue so it reads differently from a typed cell."""
    cell.fill = fill_pick
    cell.font = f_body
    cell.border = b_row
    cell.alignment = Alignment(horizontal=align, vertical="center", indent=1 if align == "left" else 0)


def legend_line(ws, row, cols):
    """One line under a section band explaining the three kinds of cell."""
    c = ws.cell(row=row, column=1, value="Light yellow — type it in     Light blue ▾ — pick from the list     White — calculated for you")
    c.font = f_note
    c.alignment = Alignment(indent=1, vertical="center")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=cols)
    ws.row_dimensions[row].height = 16


def calc(cell, fmt=None, align="right"):
    cell.font = f_body
    cell.border = b_row
    cell.alignment = Alignment(horizontal=align, vertical="center", indent=1 if align == "left" else 0)
    if fmt:
        cell.number_format = fmt


def label(cell, text):
    cell.value = text
    cell.font = f_body
    cell.border = b_row
    cell.alignment = Alignment(indent=1, vertical="center")


def total_row(ws, row, c1, c2, label_col, text, values):
    """values: {col: (formula, fmt)}"""
    for c in range(c1, c2 + 1):
        ws.cell(row=row, column=c).border = b_total
    ws.cell(row=row, column=label_col, value=text).font = f_total
    ws.cell(row=row, column=label_col).alignment = Alignment(horizontal="right" if label_col != c1 else "left", vertical="center", indent=1 if label_col == c1 else 0)
    for c, (formula, fmt) in values.items():
        cell = ws.cell(row=row, column=c, value=formula)
        cell.font = f_total
        cell.number_format = fmt
        cell.alignment = Alignment(horizontal="right", vertical="center")
    ws.row_dimensions[row].height = 22


def tile(ws, row, c1, c2, text, formula, fmt, note):
    """One stat tile over columns c1..c2 and rows row..row+2."""
    for r in (row, row + 1, row + 2):
        for c in range(c1, c2 + 1):
            ws.cell(row=r, column=c).fill = fill_cream
        ws.merge_cells(start_row=r, start_column=c1, end_row=r, end_column=c2)
    a = ws.cell(row=row, column=c1, value=text.upper())
    a.font = f_tile_label
    a.alignment = Alignment(horizontal="center", vertical="bottom")
    v = ws.cell(row=row + 1, column=c1, value=formula)
    v.font = f_tile_value
    v.number_format = fmt
    v.alignment = Alignment(horizontal="center", vertical="center")
    n = ws.cell(row=row + 2, column=c1, value=note)
    n.font = f_tile_note
    n.alignment = Alignment(horizontal="center", vertical="top")
    ws.row_dimensions[row].height = 16
    ws.row_dimensions[row + 1].height = 30
    ws.row_dimensions[row + 2].height = 16


def note_block(ws, row, cols, title, lines):
    """A 'Reading this' note: cream box with a gold left rule. Returns the next free row."""
    def paint(r):
        for c in range(1, cols + 1):
            ws.cell(row=r, column=c).fill = fill_cream
        ws.cell(row=r, column=1).border = Border(left=gold)
    paint(row)
    ws.cell(row=row, column=1, value=title).font = f_bold
    ws.cell(row=row, column=1).alignment = Alignment(indent=1, vertical="center")
    ws.row_dimensions[row].height = 18
    r = row + 1
    for ln in lines:
        paint(r)
        cell = ws.cell(row=r, column=1, value=ln)
        cell.font = f_body
        cell.alignment = Alignment(wrap_text=True, vertical="top", indent=1)
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=cols)
        ws.row_dimensions[r].height = 15 if len(ln) < 110 else 30
        r += 1
    return r


def footer(ws, row, cols):
    c = ws.cell(row=row, column=1, value=DISCLAIMER)
    c.font = f_note
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=cols)
    ws.row_dimensions[row].height = 30


def about(ws, row, cols):
    r = row
    for t, f in ABOUT:
        c = ws.cell(row=r, column=1, value=t)
        c.font = f
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=cols)
        ws.row_dimensions[r].height = 15 if len(t) < 110 else 30
        r += 1
    return r


def readme(wb, title, sub, lines):
    ws = wb.active
    ws.title = "Start here"
    setup(ws, [118], landscape=False, title=title)
    band(ws, 1, title, sub)
    r = 5
    for t, f in lines:
        c = ws.cell(row=r, column=1, value=t)
        c.font = f
        c.alignment = Alignment(wrap_text=True, vertical="top", indent=1)
        ws.row_dimensions[r].height = 16 if len(t) < 110 else 30
        if f is f_section:
            c.border = b_section
            c.fill = fill_cream
            ws.row_dimensions[r].height = 24
        r += 1
    r += 1
    footer(ws, r, 1)
    about(ws, r + 2, 1)
    return ws


# --------------------------------------------------------------------------- Mileage & Expense Log
def build_mileage():
    G = guide()
    cats = G["CATEGORIES"]
    inds = G["INDUSTRIES"]
    rates = G["RATE_PERIODS"]
    treat_label = {k: v["label"] for k, v in G["TREATMENTS"].items()}
    treat_short = {k: v["short"] for k, v in G["TREATMENTS"].items()}
    cat_by_id = {c["id"]: c for c in cats}
    years = G["TAX_YEARS"]
    T = f"Mileage & Expense Log {YEAR}"
    wb = Workbook()

    # ------------------------------------------------------------------ Guide (data the formulas read)
    wg = wb.create_sheet("Data")
    wg.sheet_state = "hidden"
    setup(wg, [44, 18, 10, 80] + [30] * len(inds), landscape=False, title=T)
    band(wg, 4, "Data", "Categories, lines of work, and rates — read by the formulas")
    wg.cell(row=5, column=1, value="Selected line of work (from Start here)").font = f_colhead
    sel = wg.cell(row=5, column=2, value="='Start here'!$B$15")
    sel.font = f_body
    wg.cell(row=6, column=1, value="Column of that line of work in the grids below").font = f_colhead
    # industry header row for the grids
    IND_HDR = 8
    wg.cell(row=IND_HDR, column=1, value="LINES OF WORK →").font = f_colhead
    for j, ind in enumerate(inds):
        c = wg.cell(row=IND_HDR, column=5 + j, value=ind["label"])
        c.font = f_colhead
        c.alignment = Alignment(wrap_text=True, vertical="bottom")
    wg.row_dimensions[IND_HDR].height = 42
    first_ind_col = get_column_letter(5)
    last_ind_col = get_column_letter(4 + len(inds))
    idx = wg.cell(row=6, column=2, value=f"=IFERROR(MATCH('Start here'!$B$15,Data!${first_ind_col}${IND_HDR}:${last_ind_col}${IND_HDR},0),{len(inds)})")
    idx.font = f_body
    IDX = "Data!$B$6"

    # attention grid: items (rows A1..A12) and their category labels (rows C1..C12)
    MAXA = max(len(i["attention"]) for i in inds)
    MAXV = max(len(i["avoid"]) for i in inds)
    r = IND_HDR + 2
    section(wg, r, 4 + len(inds), "Pay extra attention to these — items", "one column per line of work")
    ATT_ITEM0 = r + 1
    for k in range(MAXA):
        wg.cell(row=ATT_ITEM0 + k, column=1, value=f"Item {k + 1}").font = f_note
        for j, ind in enumerate(inds):
            if k < len(ind["attention"]):
                c = wg.cell(row=ATT_ITEM0 + k, column=5 + j, value=ind["attention"][k][0])
                c.font = f_body
                c.alignment = Alignment(wrap_text=True, vertical="top")
    ATT_ITEMN = ATT_ITEM0 + MAXA - 1
    r = ATT_ITEMN + 2
    section(wg, r, 4 + len(inds), "Pay extra attention to these — category of each item")
    ATT_CAT0 = r + 1
    for k in range(MAXA):
        wg.cell(row=ATT_CAT0 + k, column=1, value=f"Item {k + 1}").font = f_note
        for j, ind in enumerate(inds):
            if k < len(ind["attention"]):
                wg.cell(row=ATT_CAT0 + k, column=5 + j, value=cat_by_id[ind["attention"][k][1]]["label"]).font = f_body
    ATT_CATN = ATT_CAT0 + MAXA - 1
    r = ATT_CATN + 2
    section(wg, r, 4 + len(inds), "Usually not deductible — category")
    AV_CAT0 = r + 1
    for k in range(MAXV):
        wg.cell(row=AV_CAT0 + k, column=1, value=f"Watch-out {k + 1}").font = f_note
        for j, ind in enumerate(inds):
            if k < len(ind["avoid"]):
                wg.cell(row=AV_CAT0 + k, column=5 + j, value=cat_by_id[ind["avoid"][k][0]]["label"]).font = f_body
    AV_CATN = AV_CAT0 + MAXV - 1
    r = AV_CATN + 2
    section(wg, r, 4 + len(inds), "Usually not deductible — why")
    AV_WHY0 = r + 1
    for k in range(MAXV):
        wg.cell(row=AV_WHY0 + k, column=1, value=f"Watch-out {k + 1}").font = f_note
        for j, ind in enumerate(inds):
            if k < len(ind["avoid"]):
                c = wg.cell(row=AV_WHY0 + k, column=5 + j, value=ind["avoid"][k][1])
                c.font = f_body
                c.alignment = Alignment(wrap_text=True, vertical="top")
        wg.row_dimensions[AV_WHY0 + k].height = 44
    AV_WHYN = AV_WHY0 + MAXV - 1
    # categories table
    r = AV_WHYN + 3
    section(wg, r, 4, "Expense categories", "how each is usually treated")
    colheads(wg, r + 1, ["Category", "Treatment", "Share", "What to know"], {3: "right"})
    CAT0 = r + 2
    for i, c in enumerate(cats):
        row = CAT0 + i
        x = wg.cell(row=row, column=1, value=c["label"]); calc(x, None, "left"); x.alignment = Alignment(indent=1, vertical="top", wrap_text=True)
        calc(wg.cell(row=row, column=2, value=treat_label[c["treatment"]]), None, "left")
        calc(wg.cell(row=row, column=3, value=c["share"] if c["treatment"] in ("ok", "limited") else 0), PCT)
        n = wg.cell(row=row, column=4, value=c["note"]); calc(n, None, "left"); n.alignment = Alignment(wrap_text=True, vertical="top")
        wg.row_dimensions[row].height = 15 if len(c["note"]) < 95 else 28
    CATN = CAT0 + len(cats) - 1
    # rates table
    r = CATN + 3
    section(wg, r, 4, "IRS standard mileage rates", "dollars per mile, by effective date")
    colheads(wg, r + 1, ["Effective from", "Business", "Charity", "Medical"], {2: "right", 3: "right", 4: "right"})
    RATE0 = r + 2
    for i, p in enumerate(rates):
        y, m, d = (int(x) for x in p["from"].split("-"))
        row = RATE0 + i
        calc(wg.cell(row=row, column=1, value=datetime.date(y, m, d)), DATE, "left")
        calc(wg.cell(row=row, column=2, value=p["business"]), RATE)
        calc(wg.cell(row=row, column=3, value=p["charity"]), RATE)
        calc(wg.cell(row=row, column=4, value=p["medical"]), RATE)
    RATEN = RATE0 + len(rates) - 1
    RATE_HDR = RATE0 - 1
    wg.cell(row=RATEN + 1, column=1, value="Source: IRS Notice 2026-10; IRB 2026-29 raised the business and medical rates from July 1, 2026. Verify each January.").font = f_note
    # industry list for the dropdown
    IND_LIST0 = RATEN + 3
    wg.cell(row=IND_LIST0 - 1, column=1, value="LINES OF WORK (dropdown source)").font = f_colhead
    for j, ind in enumerate(inds):
        wg.cell(row=IND_LIST0 + j, column=1, value=ind["label"]).font = f_body
    IND_LISTN = IND_LIST0 + len(inds) - 1
    wg.freeze_panes = "A5"

    # ranges used by the other sheets
    CAT_LABELS = f"Data!$A${CAT0}:$A${CATN}"
    CAT_TREAT = f"Data!$B${CAT0}:$B${CATN}"
    CAT_SHARE = f"Data!$C${CAT0}:$C${CATN}"
    ATT_ITEMS = f"Data!${first_ind_col}${ATT_ITEM0}:${last_ind_col}${ATT_ITEMN}"
    ATT_CATS = f"Data!${first_ind_col}${ATT_CAT0}:${last_ind_col}${ATT_CATN}"
    AV_CATS = f"Data!${first_ind_col}${AV_CAT0}:${last_ind_col}${AV_CATN}"
    AV_WHYS = f"Data!${first_ind_col}${AV_WHY0}:${last_ind_col}${AV_WHYN}"

    # ------------------------------------------------------------------ Log (settings + line-of-work guidance)
    wl = wb.active
    wl.title = "Start here"
    lcols = 6
    setup(wl, [34, 44, 14, 14, 14, 16], landscape=False, title=T)
    band(wl, lcols, "Start here", "Mileage & Expense Log")
    section(wl, 5, lcols, "How this works", "three steps")
    for k, line in enumerate([
        "1.  Pick the tax year and your line of work below. The two lists update for your work.",
        "2.  Log trips on the Travel sheet and costs on the Expenses sheet as the year goes. Rates, treatment, and totals fill in by themselves.",
        "3.  In January, open Summary and email this file to your Grott Luker CPA.",
    ]):
        c = wl.cell(row=6 + k, column=1, value=line)
        c.font = f_body
        c.alignment = Alignment(indent=1, vertical="center", wrap_text=True)
        wl.merge_cells(start_row=6 + k, start_column=1, end_row=6 + k, end_column=lcols)
        wl.row_dimensions[6 + k].height = 20
    legend_line(wl, 9, lcols)
    wl.row_dimensions[10].height = 8
    section(wl, 11, lcols, "Tax year")
    label(wl.cell(row=12, column=1), "Tax year")
    yr = wl.cell(row=12, column=2, value=YEAR)
    pick(yr)
    yr.number_format = "0"
    dvy = DataValidation(type="list", formula1='"' + ",".join(str(y) for y in years) + '"', allow_blank=False)
    wl.add_data_validation(dvy)
    dvy.add(yr)
    wl.cell(row=13, column=1, value="IRS standard rates apply automatically by each trip's date. Verify against irs.gov every January.").font = f_note
    wl.merge_cells(start_row=13, start_column=1, end_row=13, end_column=lcols)
    section(wl, 14, lcols, "Your line of work")
    label(wl.cell(row=15, column=1), "What kind of work is this log for?")
    ind_cell = wl.cell(row=15, column=2, value=inds[-1]["label"])
    pick(ind_cell)
    wl.merge_cells(start_row=15, start_column=2, end_row=15, end_column=lcols)
    dvi = DataValidation(type="list", formula1=f"=Data!$A${IND_LIST0}:$A${IND_LISTN}", allow_blank=False, errorTitle="Line of work", error="Pick a line of work from the list.")
    wl.add_data_validation(dvi)
    dvi.add(ind_cell)
    wl.cell(row=16, column=1, value="Picking your line of work changes the two lists below and marks your usual categories on the Expenses sheet. The rules are general; your CPA decides.").font = f_note
    wl.merge_cells(start_row=16, start_column=1, end_row=16, end_column=lcols)
    wl.row_dimensions[16].height = 28
    wl.cell(row=16, column=1).alignment = Alignment(wrap_text=True, vertical="top")
    # rates in use
    r = 18
    section(wl, r, lcols, "Rates in use", "dollars per mile")
    colheads(wl, r + 1, ["From", "", "Business", "Charity", "Medical"], {3: "right", 4: "right", 5: "right"})
    r += 2
    for i in range(len(rates)):
        calc(wl.cell(row=r, column=1, value=f"=Data!A{RATE0 + i}"), DATE, "left")
        calc(wl.cell(row=r, column=3, value=f"=Data!B{RATE0 + i}"), RATE)
        calc(wl.cell(row=r, column=4, value=f"=Data!C{RATE0 + i}"), RATE)
        calc(wl.cell(row=r, column=5, value=f"=Data!D{RATE0 + i}"), RATE)
        r += 1
    r += 1
    # usually not deductible
    section(wl, r, lcols, "Usually not deductible", "for your line of work")
    r += 1
    for k in range(MAXV):
        c = wl.cell(row=r, column=1, value=f'=T(INDEX({AV_CATS},{k + 1},{IDX}))')
        c.font = f_bold; c.alignment = Alignment(indent=1, vertical="top", wrap_text=True); c.border = b_row
        w = wl.cell(row=r, column=2, value=f'=T(INDEX({AV_WHYS},{k + 1},{IDX}))')
        w.font = f_body; w.alignment = Alignment(wrap_text=True, vertical="top"); w.border = b_row
        wl.merge_cells(start_row=r, start_column=2, end_row=r, end_column=lcols)
        wl.row_dimensions[r].height = 32
        r += 1
    r += 1
    # pay extra attention
    section(wl, r, lcols, "Pay extra attention to these", "people in your work tend to forget to log them")
    colheads(wl, r + 1, ["Item", "Category", "Treatment"], {})
    r += 2
    for k in range(MAXA):
        it = wl.cell(row=r, column=1, value=f'=T(INDEX({ATT_ITEMS},{k + 1},{IDX}))')
        it.font = f_body; it.alignment = Alignment(indent=1, vertical="center", wrap_text=True); it.border = b_row
        ct = wl.cell(row=r, column=2, value=f'=T(INDEX({ATT_CATS},{k + 1},{IDX}))')
        ct.font = f_body; ct.alignment = Alignment(vertical="center"); ct.border = b_row
        tr_ = wl.cell(row=r, column=3, value=f'=IF(B{r}="","",INDEX({CAT_TREAT},MATCH(B{r},{CAT_LABELS},0)))')
        tr_.font = f_note; tr_.alignment = Alignment(vertical="center"); tr_.border = b_row
        wl.merge_cells(start_row=r, start_column=3, end_row=r, end_column=lcols)
        wl.row_dimensions[r].height = 28
        r += 1
    footer(wl, r + 1, lcols)
    about(wl, r + 3, lcols)
    wl.freeze_panes = "A5"

    # ------------------------------------------------------------------ Travel
    wt = wb.create_sheet("Travel", 1)
    tcols = 7
    setup(wt, [13, 22, 40, 10, 13, 10, 14], title=T)
    band(wt, tcols, "Travel", f"=\"Tax year \"&'Start here'!$B$12&\"   ·   Powered by BlueLine Advisors\"")
    section(wt, 5, tcols, "Trips", "the rate and total fill in from the date and purpose")
    colheads(wt, 6, ["Date", "Client", "Description & destination", "Miles", "Purpose  ▾", "Rate", "Total"], {4: "right", 6: "right", 7: "right"})
    dvp = DataValidation(type="list", formula1='"Business,Charity,Medical"', allow_blank=True, error="Choose Business, Charity, or Medical.", errorTitle="Purpose")
    wt.add_data_validation(dvp)
    first, last = 7, 6 + ROWS
    for r in range(first, last + 1):
        inp(wt.cell(row=r, column=1), DATE)
        inp(wt.cell(row=r, column=2))
        inp(wt.cell(row=r, column=3))
        inp(wt.cell(row=r, column=4), INT, "right")
        pick(wt.cell(row=r, column=5))
        calc(wt.cell(row=r, column=6, value=f'=IF(OR(A{r}="",E{r}=""),"",INDEX(Data!$B${RATE0}:$D${RATEN},MATCH(A{r},Data!$A${RATE0}:$A${RATEN},1),MATCH(E{r},Data!$B${RATE_HDR}:$D${RATE_HDR},0)))'), RATE)
        calc(wt.cell(row=r, column=7, value=f'=IF(F{r}="","",D{r}*F{r})'), MONEY)
        dvp.add(wt.cell(row=r, column=5))
        wt.row_dimensions[r].height = 17
    wt.freeze_panes = "A7"
    ttr = last + 1
    total_row(wt, ttr, 1, tcols, 3, "Totals", {4: (f"=SUM(D{first}:D{last})", INT), 7: (f"=SUM(G{first}:G{last})", MONEY)})
    footer(wt, ttr + 2, tcols)

    # ------------------------------------------------------------------ Expenses
    we = wb.create_sheet("Expenses", 2)
    ecols = 9
    setup(we, [13, 22, 36, 13, 34, 18, 13, 9, 46], title=T)
    band(we, ecols, "Expenses", f"=\"Tax year \"&'Start here'!$B$12&\"   ·   Powered by BlueLine Advisors\"")
    section(we, 5, ecols, "Business expenses", "treatment, counted amount, and watch-outs fill in from the category and your line of work")
    colheads(we, 6, ["Date", "Client / vendor", "What and why", "Amount", "Category  ▾", "Treatment", "Counted", "Typical", "Watch out for your line of work"], {4: "right", 7: "right", 8: "center"})
    dvc = DataValidation(type="list", formula1=f"={CAT_LABELS}", allow_blank=True, error="Pick a category from the list.", errorTitle="Category")
    we.add_data_validation(dvc)
    for r in range(first, last + 1):
        inp(we.cell(row=r, column=1), DATE)
        inp(we.cell(row=r, column=2))
        inp(we.cell(row=r, column=3))
        inp(we.cell(row=r, column=4), MONEY, "right")
        pick(we.cell(row=r, column=5))
        calc(we.cell(row=r, column=6, value=f'=IF(E{r}="","",INDEX({CAT_TREAT},MATCH(E{r},{CAT_LABELS},0)))'), None, "left")
        calc(we.cell(row=r, column=7, value=f'=IF(OR(E{r}="",D{r}=""),"",D{r}*INDEX({CAT_SHARE},MATCH(E{r},{CAT_LABELS},0)))'), MONEY)
        ty = we.cell(row=r, column=8, value=f'=IF(E{r}="","",IF(COUNTIF(INDEX({ATT_CATS},0,{IDX}),E{r})>0,"✓",""))')
        calc(ty, None, "center")
        ty.font = Font(name=SANS, size=11, bold=True, color=NAVY)
        wo = we.cell(row=r, column=9, value=f'=IF(E{r}="","",IFERROR(INDEX(INDEX({AV_WHYS},0,{IDX}),MATCH(E{r},INDEX({AV_CATS},0,{IDX}),0)),""))')
        calc(wo, None, "left")
        wo.font = f_flag
        wo.alignment = Alignment(wrap_text=False, vertical="center")
        dvc.add(we.cell(row=r, column=5))
        we.row_dimensions[r].height = 17
    we.freeze_panes = "A7"
    etr = last + 1
    total_row(we, etr, 1, ecols, 3, "Totals", {4: (f"=SUM(D{first}:D{last})", MONEY), 7: (f"=SUM(G{first}:G{last})", MONEY)})
    footer(we, etr + 2, ecols)

    # ------------------------------------------------------------------ Summary (the report)
    wsu = wb.create_sheet("Summary", 3)
    scols = 6
    setup(wsu, [30, 14, 14, 3, 14, 14], landscape=False, title=T)
    band(wsu, scols, "Year-end summary", f"=\"Tax year \"&'Start here'!$B$12&\"   ·   Powered by BlueLine Advisors\"")
    meta = wsu.cell(row=5, column=1, value="=\"Prepared for discussion with Grott Luker & Co. · \"&'Start here'!$B$15")
    meta.font = f_sub
    wsu.merge_cells(start_row=5, start_column=1, end_row=5, end_column=scols)
    # feature tile: estimated deductions
    tile(wsu, 7, 1, 6, "Estimated deductions — mileage plus counted expenses", f"=Travel!G{ttr}+Expenses!G{etr}", MONEY0, '=Travel!D' + str(ttr) + '&" miles logged · "&TEXT(Expenses!D' + str(etr) + ',"$#,##0")&" of expenses logged"')
    wsu.row_dimensions[8].height = 38
    wsu.cell(row=8, column=1).font = Font(name=SERIF, size=24, bold=True, color=NAVY)
    r = 11
    tile(wsu, r, 1, 2, "Business miles", f'=SUMIFS(Travel!$D${first}:$D${last},Travel!$E${first}:$E${last},"Business")', INT, '=TEXT(SUMIFS(Travel!$G$' + str(first) + ':$G$' + str(last) + ',Travel!$E$' + str(first) + ':$E$' + str(last) + ',"Business"),"$#,##0.00")')
    tile(wsu, r, 3, 4, "Charity miles", f'=SUMIFS(Travel!$D${first}:$D${last},Travel!$E${first}:$E${last},"Charity")', INT, '=TEXT(SUMIFS(Travel!$G$' + str(first) + ':$G$' + str(last) + ',Travel!$E$' + str(first) + ':$E$' + str(last) + ',"Charity"),"$#,##0.00")')
    tile(wsu, r, 5, 6, "Medical miles", f'=SUMIFS(Travel!$D${first}:$D${last},Travel!$E${first}:$E${last},"Medical")', INT, '=TEXT(SUMIFS(Travel!$G$' + str(first) + ':$G$' + str(last) + ',Travel!$E$' + str(first) + ':$E$' + str(last) + ',"Medical"),"$#,##0.00")')
    r = 15
    E_AMT = f"Expenses!$D${first}:$D${last}"
    E_CNT = f"Expenses!$G${first}:$G${last}"
    E_TRT = f"Expenses!$F${first}:$F${last}"
    tile(wsu, r, 1, 2, "Counted in the estimate", f'=SUMIFS({E_CNT},{E_TRT},"Deductible")+SUMIFS({E_CNT},{E_TRT},"Partly deductible")', MONEY0, "deductible and partly deductible")
    tile(wsu, r, 3, 4, "For CPA review", f'=SUMIFS({E_AMT},{E_TRT},"For your CPA")', MONEY0, "equipment, phone, home office, inventory")
    tile(wsu, r, 5, 6, "Not deductible", f'=SUMIFS({E_AMT},{E_TRT},"Not deductible")', MONEY0, "recorded, counted at zero")
    r = 19
    section(wsu, r, scols, "Expenses by treatment")
    r += 1
    colheads(wsu, r, ["Treatment", "Logged", "Counted", "", "Entries"], {2: "right", 3: "right", 5: "right"})
    r += 1
    e0 = r
    for t in ("Deductible", "Partly deductible", "For your CPA", "Not deductible"):
        label(wsu.cell(row=r, column=1), t)
        calc(wsu.cell(row=r, column=2, value=f'=SUMIFS({E_AMT},{E_TRT},"{t}")'), MONEY)
        calc(wsu.cell(row=r, column=3, value=f'=SUMIFS({E_CNT},{E_TRT},"{t}")'), MONEY)
        calc(wsu.cell(row=r, column=5, value=f'=COUNTIFS({E_TRT},"{t}",{E_AMT},">0")'), INT)
        r += 1
    total_row(wsu, r, 1, 5, 1, "All expenses", {2: (f"=SUM(B{e0}:B{r - 1})", MONEY), 3: (f"=SUM(C{e0}:C{r - 1})", MONEY), 5: (f"=SUM(E{e0}:E{r - 1})", INT)})
    r += 2
    section(wsu, r, scols, "=\"Notes for \"&LOWER(LEFT('Start here'!$B$15,1))&MID('Start here'!$B$15,2,200)")
    r += 1
    for k in range(MAXV):
        c = wsu.cell(row=r, column=1, value=f'=T(INDEX({AV_CATS},{k + 1},{IDX}))')
        c.font = f_bold; c.alignment = Alignment(indent=1, vertical="top", wrap_text=True); c.border = b_row
        w = wsu.cell(row=r, column=2, value=f'=T(INDEX({AV_WHYS},{k + 1},{IDX}))')
        w.font = f_body; w.alignment = Alignment(wrap_text=True, vertical="top"); w.border = b_row
        wsu.merge_cells(start_row=r, start_column=2, end_row=r, end_column=scols)
        wsu.row_dimensions[r].height = 32
        r += 1
    r += 1
    r = note_block(wsu, r, scols, "Reading this", [
        "Counted amounts are estimates from the category you chose. Items marked For your CPA are logged but not counted; your CPA places them.",
        "Parking and tolls add to the mileage deduction. Vehicle costs such as gas and repairs are already inside the standard mileage rate.",
    ])
    footer(wsu, r + 1, scols)
    about(wsu, r + 3, scols)

    wb.properties.creator = "Grott Luker & Co."
    wb.properties.title = T
    wb.calculation.fullCalcOnLoad = True
    path = OUT / f"GrottLuker-Mileage-Expense-Log-{YEAR}.xlsx"
    wb.save(path)
    return path


# --------------------------------------------------------------------------- Charitable Donation Log
def build_donations():
    wb = Workbook()
    T = f"Charitable Donation Log {YEAR}"
    readme(wb, T, "How to use this workbook", [
        ("Two sheets, kept through the year", f_section),
        ("Gifts — one row per gift: date, organization, what it was, the type, and the amount or fair market value. For securities add the cost basis and whether you held them more than a year. Mark the receipt letter once you have it.", f_body),
        ("Summary — the year-end report: estimated deductible contributions, totals by type, and the documentation checklist.", f_body),
        ("", f_body),
        ("How the Gifts sheet works", f_section),
        ("Light-yellow cells are typed. Light-blue cells with ▾ are picked from a list. White cells calculate for you. Cost basis and holding period only matter for securities; for other gifts those two cells go grey.", f_body),
        ("The Documentation column tells you what each gift still needs: a receipt letter, an appraisal, or a note that a short-term security is limited to its cost basis. When a $250+ gift has its letter, it says so.", f_body),
        ("", f_body),
        ("Documentation rules", f_section),
        ("Any single gift of $250 or more needs a written acknowledgment from the charity before you file.", f_body),
        ("Non-cash gifts over $500 in total require Form 8283 with the return. Any non-cash item, or group of similar items, over $5,000 needs a qualified appraisal; publicly traded securities are the exception.", f_body),
        ("Appreciated securities held more than a year are deductible at fair market value and the gain is never taxed. Held a year or less, the deduction is limited to cost basis.", f_body),
        ("Qualified charitable distributions from an IRA (70½ and older) are excluded from income instead of deducted. Log them with a note so your CPA sees them.", f_body),
        ("", f_body),
        ("When you are done", f_section),
        ("In January, email this file to your Grott Luker CPA with your receipt letters, or enter the gifts in the online log at the link we sent you.", f_body),
    ])

    # ------------------------------------------------------------------ Gifts
    wg = wb.create_sheet("Gifts", 1)
    cols = 10
    setup(wg, [12, 26, 28, 15, 14, 14, 11, 13, 14, 44], title=T)
    band(wg, cols, "Gifts", f"Tax year {YEAR}")
    section(wg, 5, cols, "Gifts this year", "deductible amount and documentation fill in as you go")
    legend_line(wg, 6, cols)
    colheads(wg, 7, ["Date", "Organization", "Description", "Type  ▾", "Amount / FMV", "Cost basis", "Held > 1 yr  ▾", "Receipt letter  ▾", "Deductible", "Documentation"], {5: "right", 6: "right", 7: "center", 8: "center", 9: "right"})
    sub = ["", "", "", "cash · non-cash · securities", "", "securities only", "securities only", "Y once you have it", "", "what this gift still needs"]
    for i, t in enumerate(sub, start=1):
        c = wg.cell(row=8, column=i, value=t)
        c.font = Font(name=SANS, size=8, italic=True, color=MUTED)
        c.alignment = Alignment(horizontal={5: "right", 6: "right", 7: "center", 8: "center", 9: "right"}.get(i, "left"), vertical="top", indent=1 if i == 1 else 0)
    wg.row_dimensions[8].height = 14
    dvt = DataValidation(type="list", formula1='"Cash,Non-cash,Securities"', allow_blank=True, errorTitle="Type", error="Pick Cash, Non-cash, or Securities.")
    dvy = DataValidation(type="list", formula1='"Y,N"', allow_blank=True, errorTitle="Y or N", error="Pick Y or N.")
    wg.add_data_validation(dvt)
    wg.add_data_validation(dvy)
    first, last = 9, 8 + ROWS
    for r in range(first, last + 1):
        inp(wg.cell(row=r, column=1), DATE)
        inp(wg.cell(row=r, column=2))
        inp(wg.cell(row=r, column=3))
        pick(wg.cell(row=r, column=4))
        inp(wg.cell(row=r, column=5), MONEY, "right")
        inp(wg.cell(row=r, column=6), MONEY, "right")
        pick(wg.cell(row=r, column=7), "center")
        pick(wg.cell(row=r, column=8), "center")
        calc(wg.cell(row=r, column=9, value=f'=IF(OR(D{r}="",E{r}=""),"",IF(D{r}="Securities",IF(G{r}="N",MIN(E{r},IF(F{r}="",E{r},F{r})),E{r}),E{r}))'), MONEY)
        doc = wg.cell(row=r, column=10, value=(
            f'=IF(E{r}="","",IF(TRIM('
            f'IF(AND(E{r}>=250,H{r}<>"Y"),"Get written acknowledgment (≥ $250). ","")&'
            f'IF(AND(D{r}="Non-cash",E{r}>5000),"Qualified appraisal required (> $5,000 non-cash). ","")&'
            f'IF(AND(D{r}="Securities",G{r}="N"),"Held ≤ 1 year — deduction limited to cost basis. ",""))="",'
            f'IF(AND(E{r}>=250,H{r}="Y"),"Acknowledgment on file","—"),TRIM('
            f'IF(AND(E{r}>=250,H{r}<>"Y"),"Get written acknowledgment (≥ $250). ","")&'
            f'IF(AND(D{r}="Non-cash",E{r}>5000),"Qualified appraisal required (> $5,000 non-cash). ","")&'
            f'IF(AND(D{r}="Securities",G{r}="N"),"Held ≤ 1 year — deduction limited to cost basis. ",""))))'))
        calc(doc, None, "left")
        dvt.add(wg.cell(row=r, column=4))
        dvy.add(wg.cell(row=r, column=7))
        dvy.add(wg.cell(row=r, column=8))
        wg.row_dimensions[r].height = 18
    rng = f"A{first}:J{last}"
    # securities-only cells go grey when the gift is not securities
    wg.conditional_formatting.add(f"F{first}:G{last}", FormulaRule(formula=[f'AND($D{first}<>"",$D{first}<>"Securities")'], fill=fill_dim, font=Font(name=SANS, size=10, color="B9B2A3")))
    # documentation needed → rust text on a faint rust tint; on file → green
    wg.conditional_formatting.add(f"J{first}:J{last}", FormulaRule(formula=[f'AND($J{first}<>"",$J{first}<>"—",$J{first}<>"Acknowledgment on file")'], fill=fill_flag, font=Font(name=SANS, size=9, color="A5533C", bold=True)))
    wg.conditional_formatting.add(f"J{first}:J{last}", FormulaRule(formula=[f'$J{first}="Acknowledgment on file"'], font=Font(name=SANS, size=9, color="2E7D5B")))
    wg.freeze_panes = "A9"
    tr = last + 1
    total_row(wg, tr, 1, cols, 4, "Totals", {5: (f"=SUM(E{first}:E{last})", MONEY), 9: (f"=SUM(I{first}:I{last})", MONEY)})
    footer(wg, tr + 2, cols)

    # ------------------------------------------------------------------ Summary (the report)
    wsu = wb.create_sheet("Summary", 2)
    scols = 7
    setup(wsu, [12, 26, 26, 14, 14, 14, 36], landscape=False, title=T)
    band(wsu, scols, "Year-end summary", f"Tax year {YEAR}")
    meta = wsu.cell(row=5, column=1, value="Charitable Donation Log · year-to-date summary · prepared for discussion with Grott Luker & Co.")
    meta.font = f_sub
    wsu.merge_cells(start_row=5, start_column=1, end_row=5, end_column=scols)
    E = f"Gifts!$E${first}:$E${last}"
    D = f"Gifts!$D${first}:$D${last}"
    F = f"Gifts!$F${first}:$F${last}"
    Gc = f"Gifts!$G${first}:$G${last}"
    Hc = f"Gifts!$H${first}:$H${last}"
    I = f"Gifts!$I${first}:$I${last}"
    gain = f'SUMPRODUCT(({D}="Securities")*({Gc}="Y")*({E}-{F}))'
    tile(wsu, 7, 1, 7, "Estimated deductible contributions", f"=Gifts!I{tr}", MONEY0,
         f'=COUNTIF({E},">0")&IF(COUNTIF({E},">0")=1," gift · "," gifts · ")&TEXT(Gifts!E{tr},"$#,##0")&" given"&IF({gain}>0," · "&TEXT({gain},"$#,##0")&" of capital gain avoided","")')
    wsu.row_dimensions[8].height = 38
    wsu.cell(row=8, column=1).font = Font(name=SERIF, size=24, bold=True, color=NAVY)
    r = 11
    tile(wsu, r, 1, 2, "Cash / check / card", f'=SUMIFS({E},{D},"Cash")', MONEY0, f'=COUNTIFS({D},"Cash",{E},">0")&" gifts"')
    tile(wsu, r, 3, 4, "Non-cash (goods)", f'=SUMIFS({E},{D},"Non-cash")', MONEY0, f'=COUNTIFS({D},"Non-cash",{E},">0")&" gifts"')
    tile(wsu, r, 5, 7, "Appreciated securities", f'=SUMIFS({E},{D},"Securities")', MONEY0, f'=COUNTIFS({D},"Securities",{E},">0")&" gifts"')
    r = 15
    noncash = f'SUMIFS({E},{D},"<>Cash")'
    tile(wsu, r, 1, 2, "Form 8283", f'=IF({noncash}>500,"Required","Not required")', "@", f'="Non-cash total "&TEXT({noncash},"$#,##0")')
    tile(wsu, r, 3, 4, "Appraisals", f'=COUNTIFS({D},"Non-cash",{E},">5000")', INT, "non-cash items over $5,000")
    tile(wsu, r, 5, 7, "Receipts missing", f'=COUNTIFS({E},">=250",{Hc},"<>Y")', INT, "gifts of $250+ without acknowledgment")
    for c in (1, 3, 5):
        wsu.cell(row=r + 1, column=c).font = Font(name=SERIF, size=16, bold=True, color=NAVY)
    # the gift list, as on the web report
    r = 19
    section(wsu, r, scols, "Gifts")
    r += 1
    colheads(wsu, r, ["Date", "Organization", "Description", "Type", "Amount / FMV", "Deductible", "Documentation"], {5: "right", 6: "right"})
    r += 1
    l0 = r
    for k in range(ROWS):
        src = first + k
        row = l0 + k
        calc(wsu.cell(row=row, column=1, value=f'=IF(Gifts!A{src}="","",Gifts!A{src})'), DATE, "left")
        calc(wsu.cell(row=row, column=2, value=f'=IF(Gifts!B{src}="","",Gifts!B{src})'), None, "left")
        calc(wsu.cell(row=row, column=3, value=f'=IF(Gifts!C{src}="","",Gifts!C{src})'), None, "left")
        calc(wsu.cell(row=row, column=4, value=f'=IF(Gifts!D{src}="","",Gifts!D{src})'), None, "left")
        calc(wsu.cell(row=row, column=5, value=f'=IF(Gifts!E{src}="","",Gifts!E{src})'), MONEY)
        calc(wsu.cell(row=row, column=6, value=f'=IF(Gifts!I{src}="","",Gifts!I{src})'), MONEY)
        dc = wsu.cell(row=row, column=7, value=f'=IF(Gifts!J{src}="","",Gifts!J{src})')
        calc(dc, None, "left")
        dc.font = Font(name=SANS, size=9, color=INK_SOFT)
        for c in range(1, scols + 1):
            wsu.cell(row=row, column=c).border = Border()
        wsu.row_dimensions[row].height = 16
    ln = l0 + ROWS - 1
    # rows only get their hairline when a gift is there; empty rows stay invisible
    wsu.conditional_formatting.add(f"A{l0}:G{ln}", FormulaRule(formula=[f'$E{l0}<>""'], border=Border(bottom=hair)))
    wsu.conditional_formatting.add(f"G{l0}:G{ln}", FormulaRule(formula=[f'AND($G{l0}<>"",$G{l0}<>"—",$G{l0}<>"Acknowledgment on file")'], font=Font(name=SANS, size=9, color="A5533C")))
    r = ln + 1
    total_row(wsu, r, 1, scols, 4, "Totals", {5: (f"=Gifts!E{tr}", MONEY), 6: (f"=Gifts!I{tr}", MONEY)})
    r += 2
    r = note_block(wsu, r, scols, "Reading this", [
        "Thresholds: written acknowledgment for any gift of $250 or more; Form 8283 above $500 of non-cash gifts; qualified appraisal above $5,000 per item or group.",
        "Deductible amounts are before the AGI limits (60% of AGI for cash, 30% for appreciated property) and the 0.5%-of-AGI floor that applies from 2026. Your CPA applies those.",
    ])
    footer(wsu, r + 1, scols)
    about(wsu, r + 3, scols)
    wsu.print_area = f"A1:G{r + 10}"

    wb.active = 1
    wb.properties.creator = "Grott Luker & Co."
    wb.properties.title = T
    wb.calculation.fullCalcOnLoad = True
    path = OUT / f"GrottLuker-Charitable-Donation-Log-{YEAR}.xlsx"
    wb.save(path)
    return path


# --------------------------------------------------------------------------- Know Your Numbers
def build_kyn():
    src = read_src("knowYourNumbers.js")

    def cats(name):
        block = src[src.index(f"export const {name}"):]
        block = block[:block.index("]")]
        return re.findall(r"label: '([^']*)'", block)

    assets, liabs, income, expenses, extra = (cats(n) for n in ("ASSET_CATS", "LIABILITY_CATS", "INCOME_CATS", "EXPENSE_CATS", "EXTRA_CATS"))
    T = "Know Your Numbers"
    wb = Workbook()
    ws = wb.active
    ws.title = "Know Your Numbers"
    cols = 5
    setup(ws, [34, 16, 3, 34, 16], landscape=False, title=T)
    band(ws, cols, "Know Your Numbers", "A one-page financial snapshot")
    intro = ws.cell(row=5, column=1, value="Round numbers are fine. This is a conversation starter for your meeting with Grott Luker & Co., not a tax return. Light-yellow cells are yours; the snapshot calculates itself.")
    intro.font = f_sub
    intro.alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=5, start_column=1, end_row=5, end_column=cols)
    ws.row_dimensions[5].height = 30

    # Two columns of sections: left = assets, liabilities; right = income, expenses, other figures.
    def block(c1, row, title, labels, annual=False):
        c2 = c1 + 1
        section(ws, row, c2, title, "per year" if annual else None, c1=c1)
        r = row + 1
        start = r
        rows = {}
        for lab in labels:
            label(ws.cell(row=r, column=c1), lab)
            inp(ws.cell(row=r, column=c2), MONEY0, "right")
            rows[lab] = r
            ws.row_dimensions[r].height = 18
            r += 1
        col = get_column_letter(c2)
        total_row(ws, r, c1, c2, c1, f"Total {title.lower()}", {c2: (f"=SUM({col}{start}:{col}{r - 1})", MONEY0)})
        return r, rows, r + 2

    top = 12
    ta, _, nxt_l = block(1, top, "Assets", assets)
    tl, _, nxt_l = block(1, nxt_l, "Liabilities", liabs)
    ti, _, nxt_r = block(4, top, "Income", income, annual=True)
    te, exp_rows, nxt_r = block(4, nxt_r, "Expenses", expenses, annual=True)
    section(ws, nxt_r, 5, "Other figures", c1=4)
    r = nxt_r + 1
    extra_rows = {}
    for lab in extra:
        label(ws.cell(row=r, column=4), lab)
        inp(ws.cell(row=r, column=5), MONEY0, "right")
        extra_rows[lab] = r
        ws.row_dimensions[r].height = 18
        r += 1
    nxt_r = r
    savings_row = extra_rows.get("Annual savings & investing")
    debt_row = next((v for k, v in exp_rows.items() if "debt" in k.lower()), None)

    # Snapshot tiles (rows 7–9) reference the totals below; a second line carries the two ratios.
    tile(ws, 7, 1, 2, "Net worth", f"=B{ta}-B{tl}", MONEY0, "assets − liabilities")
    tile(ws, 7, 4, 5, "Annual cash flow", f"=E{ti}-E{te}", MONEY0, "income − expenses")
    ws.cell(row=10, column=1, value="SAVINGS RATE").font = f_colhead
    ws.cell(row=10, column=1).alignment = Alignment(indent=1)
    sr = ws.cell(row=10, column=2, value=f"=IF(E{ti}>0,E{savings_row}/E{ti},0)" if savings_row else "=0")
    sr.font = f_bold; sr.number_format = PCT1; sr.alignment = Alignment(horizontal="right")
    ws.cell(row=10, column=4, value="DEBT-TO-INCOME").font = f_colhead
    ws.cell(row=10, column=4).alignment = Alignment(indent=1)
    dr = ws.cell(row=10, column=5, value=f"=IF(E{ti}>0,E{debt_row}/E{ti},0)" if debt_row else "=0")
    dr.font = f_bold; dr.number_format = PCT1; dr.alignment = Alignment(horizontal="right")
    ws.row_dimensions[10].height = 16
    ws.row_dimensions[11].height = 10

    end = max(nxt_l, nxt_r) + 1
    end = note_block(ws, end, cols, "When you are done", [
        "Email this file to your Grott Luker CPA, or bring it to the meeting. If you would rather fill it in online, use the link we sent you.",
    ])
    footer(ws, end + 1, cols)
    about(ws, end + 3, cols)
    ws.freeze_panes = "A5"

    wb.properties.creator = "Grott Luker & Co."
    wb.properties.title = T
    wb.calculation.fullCalcOnLoad = True
    path = OUT / "GrottLuker-Know-Your-Numbers.xlsx"
    wb.save(path)
    return path


if __name__ == "__main__":
    for p in (build_mileage(), build_donations(), build_kyn()):
        print("wrote", p.relative_to(ROOT), p.stat().st_size, "bytes")
