"""Build the downloadable Excel templates for the three Client Shareable tools.

    python scripts/build-templates.py

Writes to public/templates/. Rates and categories are copied from the web
tool's source (src/lib/mileage.js, expenseGuide.js, donations.js) so the two
stay in step; re-run after changing either.
"""
import re
import pathlib
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment
from openpyxl.drawing.image import Image as XLImage
from PIL import Image as PILImage

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "templates"
OUT.mkdir(parents=True, exist_ok=True)
YEAR = 2026

NAVY = "0F2440"
GOLD = "C4A054"
CREAM = "F4F0E6"
INPUT = "FFF7D6"  # cells the client fills in
FONT = "Arial"

f_title = Font(name=FONT, size=16, bold=True, color=NAVY)
f_sub = Font(name=FONT, size=10, color="5B6472")
f_head = Font(name=FONT, size=10, bold=True, color="FFFFFF")
f_body = Font(name=FONT, size=10)
f_bold = Font(name=FONT, size=10, bold=True)
f_note = Font(name=FONT, size=9, italic=True, color="726D63")
fill_head = PatternFill("solid", fgColor=NAVY)
fill_gold = PatternFill("solid", fgColor=GOLD)
fill_input = PatternFill("solid", fgColor=INPUT)
fill_cream = PatternFill("solid", fgColor=CREAM)
thin = Side(style="thin", color="DDD7C8")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
MONEY = '$#,##0.00;($#,##0.00);"-"'
MONEY0 = '$#,##0;($#,##0);"-"'
PCT = '0%'
DATE = 'mm/dd/yyyy'
ROWS = 200  # input rows per log


def read_src(rel):
    return (ROOT / "src" / "lib" / rel).read_text(encoding="utf-8")


def rate_periods():
    src = read_src("mileage.js")
    out = []
    for m in re.finditer(r"\{ from: '(\d{4}-\d{2}-\d{2})', business: ([\d.]+), charity: ([\d.]+), medical: ([\d.]+) \}", src):
        out.append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4))))
    assert out, "no rate periods parsed"
    return out


def categories():
    src = read_src("expenseGuide.js")
    out = []
    for m in re.finditer(r"\{ id: '([a-z]+)', label: '([^']*)', treatment: '(\w+)', share: ([\d.]+), note: '((?:[^'\\]|\\.)*)' \}", src):
        out.append((m.group(2), m.group(3), float(m.group(4)), m.group(5).replace("\\'", "'")))
    assert len(out) > 20, f"only {len(out)} categories parsed"
    return out


TREAT = {"ok": "Deductible", "limited": "Partly deductible", "ask": "For your CPA", "not": "Not deductible"}


BRAND = ROOT / "public" / "brand"
DISCLAIMER = (
    "Prepared with the Grott Luker & Co. Client Decision Support Toolkit, powered by BlueLine Advisors. "
    "This workbook is an educational planning record, not tax, legal, accounting, or investment advice. "
    "Figures are the client\u2019s own entries and should be reviewed by Grott Luker & Co. before use in any return or decision."
)
ABOUT = [
    ("About Grott Luker & Co.", f_bold),
    ("Certified Public Accountants \u00b7 Portsmouth, New Hampshire \u00b7 Accounting | Tax Planning | Advisory. Questions about this log go to your Grott Luker CPA.", f_body),
    ("", f_body),
    ("Powered by BlueLine Advisors", f_bold),
    ("The Client Decision Support Toolkit and its templates are built and maintained by BlueLine Advisors, LLC, an SEC-registered investment adviser based in Exeter, NH (registration does not imply any particular level of skill). Using this workbook does not create an advisory relationship with BlueLine. blueline-advisors.com", f_body),
    ("", f_body),
    (DISCLAIMER, f_note),
]


def _logo(path, height_px):
    img = XLImage(str(path))
    with PILImage.open(path) as im:
        w, h = im.size
    img.height = height_px
    img.width = int(w * height_px / h)
    return img


def brand_band(ws, width_cols):
    """Row 1: navy band with the Grott Luker logo at left and 'Powered by BlueLine Advisors' at right."""
    for c in range(1, width_cols + 1):
        ws.cell(row=1, column=c).fill = fill_head
    ws.row_dimensions[1].height = 42
    gl = _logo(BRAND / "gl-logo-white-tight.png", 50)
    gl.anchor = "A1"
    ws.add_image(gl)
    tag = ws.cell(row=1, column=width_cols, value="POWERED BY  BLUELINE ADVISORS")
    tag.font = Font(name=FONT, size=8, bold=True, color="FFFFFF")
    tag.alignment = Alignment(horizontal="right", vertical="center")


def title_block(ws, title, sub, width_cols):
    brand_band(ws, width_cols)
    ws["A2"] = title
    ws["A2"].font = f_title
    ws["A3"] = sub
    ws["A3"].font = f_sub
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=width_cols)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=width_cols)
    ws.row_dimensions[2].height = 26


def footer_note(ws, row, width_cols):
    c = ws.cell(row=row, column=1, value=DISCLAIMER)
    c.font = f_note
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=width_cols)
    ws.row_dimensions[row].height = 42


def readme_sheet(ws, lines):
    """Read me: brand band, the how-to lines, then the About / Powered-by block."""
    ws.column_dimensions["A"].width = 112
    brand_band(ws, 1)
    r = 2
    for t, f in lines + [("", f_body)] + ABOUT:
        c = ws.cell(row=r, column=1, value=t)
        c.font = f
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 18 if len(t) < 105 else (32 if len(t) < 220 else 48)
        r += 1
    ws.row_dimensions[2].height = 28


def header_row(ws, row, headers, widths):
    for i, (h, w) in enumerate(zip(headers, widths), start=1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = f_head
        c.fill = fill_head
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[row].height = 30


def style_input(c, fmt=None):
    c.fill = fill_input
    c.font = f_body
    c.border = border
    if fmt:
        c.number_format = fmt


def style_calc(c, fmt=None):
    c.font = f_body
    c.border = border
    if fmt:
        c.number_format = fmt


def legend(ws, row, col=1):
    c = ws.cell(row=row, column=col, value="Yellow cells are yours to fill in. White cells calculate themselves — leave them alone.")
    c.font = f_note
    ws.cell(row=row, column=col).fill = fill_input


# --------------------------------------------------------------------------- Mileage & Expense Log
def build_mileage():
    wb = Workbook()
    rates = rate_periods()
    cats = categories()

    # ---- Read me
    ws = wb.active
    ws.title = "Read me"
    readme_sheet(ws, [
        (f"Mileage & Expense Log \u2014 {YEAR}", f_title),
        ("How to use this workbook", f_bold),
        ("1. Log every trip on the Mileage sheet: date, purpose (Business, Charity, or Medical), where you went, why, and the miles. The IRS rate for that date fills in by itself and the deduction is calculated.", f_body),
        ("2. Log business costs on the Expenses sheet: date, category, client or matter, description, amount. The sheet shows whether the category is usually deductible, partly deductible, something for your CPA, or not deductible.", f_body),
        ("3. The Summary sheet totals everything. In January, send the whole file to Grott Luker & Co., or type the figures into the online log at the link your CPA sent.", f_body),
        ("", f_body),
        ("Rules of thumb", f_bold),
        ("\u2022 Keep the log as you go. A reconstructed log is the first thing an auditor challenges.", f_body),
        ("\u2022 Commuting from home to your regular workplace is not deductible, whatever you carry or discuss on the way.", f_body),
        ("\u2022 Parking and tolls are deductible on top of the mileage rate; gas, repairs, and car insurance are not \u2014 they are already inside the rate.", f_body),
        ("\u2022 Business meals are 50% deductible when business is discussed and you are present. Note who and what. Entertainment is not deductible.", f_body),
        ("\u2022 Equipment under $2,500 per item can usually be expensed; note the cost per item for anything larger.", f_body),
        ("", f_body),
        ("Yellow cells are yours to fill in. White cells calculate themselves \u2014 leave them alone. Rates are on the Rates sheet; verify each January.", f_note),
    ])

    # ---- Rates
    wr = wb.create_sheet("Rates")
    title_block(wr, "IRS standard mileage rates", "Dollars per mile by effective date. The Mileage sheet picks the rate in force on each trip's date.", 4)
    header_row(wr, 5, ["Effective from", "Business", "Charity", "Medical"], [16, 12, 12, 12])
    for i, (frm, b, ch, med) in enumerate(rates, start=6):
        y, m, d = (int(x) for x in frm.split("-"))
        import datetime
        wr.cell(row=i, column=1, value=datetime.date(y, m, d)).number_format = DATE
        wr.cell(row=i, column=2, value=b).number_format = '$0.000'
        wr.cell(row=i, column=3, value=ch).number_format = '$0.000'
        wr.cell(row=i, column=4, value=med).number_format = '$0.000'
        for col in range(1, 5):
            wr.cell(row=i, column=col).font = f_body
            wr.cell(row=i, column=col).border = border
    rate_last = 5 + len(rates)
    wr.cell(row=rate_last + 2, column=1, value="Source: IRS Notice 2026-10 and IRB 2026-29 (mid-year increase effective July 1, 2026). Verify each January at irs.gov/tax-professionals/standard-mileage-rates.").font = f_note

    # Expense categories table
    cat_top = rate_last + 5
    wr.cell(row=cat_top - 1, column=1, value="Expense categories").font = f_bold
    header_row(wr, cat_top, ["Category", "Treatment", "Deductible share", "Note"], [40, 18, 14, 90])
    for i, (label, treat, share, note) in enumerate(cats, start=cat_top + 1):
        wr.cell(row=i, column=1, value=label)
        wr.cell(row=i, column=2, value=TREAT[treat])
        wr.cell(row=i, column=3, value=share if treat in ("ok", "limited") else 0).number_format = PCT
        wr.cell(row=i, column=4, value=note)
        for col in range(1, 5):
            wr.cell(row=i, column=col).font = f_body
            wr.cell(row=i, column=col).border = border
            wr.cell(row=i, column=col).alignment = Alignment(wrap_text=True, vertical="top")
    cat_last = cat_top + len(cats)
    wr.column_dimensions["A"].width = 40
    wr.freeze_panes = "A6"

    # ---- Mileage
    wm = wb.create_sheet("Mileage", 1)
    title_block(wm, f"Mileage log — {YEAR}", "One row per trip. The rate and deduction fill in from the date and purpose.", 7)
    legend(wm, 4)
    header_row(wm, 5, ["Date", "Purpose", "Client / where", "Description", "Miles", "Rate", "Deduction"], [13, 14, 24, 36, 10, 10, 13])
    dv = DataValidation(type="list", formula1='"Business,Charity,Medical"', allow_blank=True)
    dv.error = "Choose Business, Charity, or Medical."
    wm.add_data_validation(dv)
    first, last = 6, 5 + ROWS
    for r in range(first, last + 1):
        style_input(wm.cell(row=r, column=1), DATE)
        style_input(wm.cell(row=r, column=2))
        style_input(wm.cell(row=r, column=3))
        style_input(wm.cell(row=r, column=4))
        style_input(wm.cell(row=r, column=5), '#,##0')
        rate = wm.cell(row=r, column=6, value=f'=IF(OR(A{r}="",B{r}=""),"",INDEX(Rates!$B$6:$D${rate_last},MATCH(A{r},Rates!$A$6:$A${rate_last},1),MATCH(B{r},Rates!$B$5:$D$5,0)))')
        style_calc(rate, '$0.000')
        ded = wm.cell(row=r, column=7, value=f'=IF(F{r}="","",E{r}*F{r})')
        style_calc(ded, MONEY)
        dv.add(wm.cell(row=r, column=2))
    wm.freeze_panes = "A6"
    tr = last + 2
    wm.cell(row=tr, column=4, value="Totals").font = f_bold
    wm.cell(row=tr, column=5, value=f"=SUM(E{first}:E{last})").number_format = '#,##0'
    wm.cell(row=tr, column=7, value=f"=SUM(G{first}:G{last})").number_format = MONEY
    wm.cell(row=tr, column=5).font = f_bold
    wm.cell(row=tr, column=7).font = f_bold
    wm["A3"].comment = Comment("Dates before the first rate period use that period's rate.", "Grott Luker toolkit")
    footer_note(wm, tr + 2, 7)

    # ---- Expenses
    we = wb.create_sheet("Expenses", 2)
    title_block(we, f"Expense log — {YEAR}", "One row per expense. Treatment and the deductible amount fill in from the category.", 8)
    legend(we, 4)
    header_row(we, 5, ["Date", "Category", "Client / matter", "Description", "Amount", "Treatment", "Share", "Deductible"], [13, 34, 22, 34, 12, 18, 8, 13])
    cat_range = f"Rates!$A${cat_top + 1}:$A${cat_last}"
    dvc = DataValidation(type="list", formula1=f"={cat_range}", allow_blank=True)
    dvc.error = "Pick a category from the list (see the Rates sheet)."
    we.add_data_validation(dvc)
    for r in range(first, last + 1):
        style_input(we.cell(row=r, column=1), DATE)
        style_input(we.cell(row=r, column=2))
        style_input(we.cell(row=r, column=3))
        style_input(we.cell(row=r, column=4))
        style_input(we.cell(row=r, column=5), MONEY)
        t = we.cell(row=r, column=6, value=f'=IF(B{r}="","",INDEX(Rates!$B${cat_top + 1}:$B${cat_last},MATCH(B{r},{cat_range},0)))')
        style_calc(t)
        sh = we.cell(row=r, column=7, value=f'=IF(B{r}="","",INDEX(Rates!$C${cat_top + 1}:$C${cat_last},MATCH(B{r},{cat_range},0)))')
        style_calc(sh, PCT)
        d = we.cell(row=r, column=8, value=f'=IF(OR(B{r}="",E{r}=""),"",E{r}*G{r})')
        style_calc(d, MONEY)
        dvc.add(we.cell(row=r, column=2))
    we.freeze_panes = "A6"
    we.cell(row=tr, column=4, value="Totals").font = f_bold
    we.cell(row=tr, column=5, value=f"=SUM(E{first}:E{last})").number_format = MONEY
    we.cell(row=tr, column=8, value=f"=SUM(H{first}:H{last})").number_format = MONEY
    we.cell(row=tr, column=5).font = f_bold
    we.cell(row=tr, column=8).font = f_bold
    footer_note(we, tr + 2, 8)

    # ---- Summary
    wsu = wb.create_sheet("Summary", 3)
    title_block(wsu, f"Summary — {YEAR}", "Totals from the Mileage and Expenses sheets. Send this workbook to Grott Luker & Co. in January.", 4)
    header_row(wsu, 5, ["Mileage", "Miles", "Deduction", ""], [34, 12, 14, 4])
    r = 6
    for p in ("Business", "Charity", "Medical"):
        wsu.cell(row=r, column=1, value=p).font = f_body
        wsu.cell(row=r, column=2, value=f'=SUMIFS(Mileage!$E${first}:$E${last},Mileage!$B${first}:$B${last},"{p}")').number_format = '#,##0'
        wsu.cell(row=r, column=3, value=f'=SUMIFS(Mileage!$G${first}:$G${last},Mileage!$B${first}:$B${last},"{p}")').number_format = MONEY
        for col in (1, 2, 3):
            wsu.cell(row=r, column=col).border = border
        r += 1
    wsu.cell(row=r, column=1, value="All trips").font = f_bold
    wsu.cell(row=r, column=2, value=f"=SUM(B6:B{r - 1})").number_format = '#,##0'
    wsu.cell(row=r, column=3, value=f"=SUM(C6:C{r - 1})").number_format = MONEY
    wsu.cell(row=r, column=2).font = f_bold
    wsu.cell(row=r, column=3).font = f_bold
    r += 2
    header_row(wsu, r, ["Expenses", "Logged", "Deductible", ""], [34, 12, 14, 4])
    r += 1
    for t in ("Deductible", "Partly deductible", "For your CPA", "Not deductible"):
        wsu.cell(row=r, column=1, value=t).font = f_body
        wsu.cell(row=r, column=2, value=f'=SUMIFS(Expenses!$E${first}:$E${last},Expenses!$F${first}:$F${last},"{t}")').number_format = MONEY
        wsu.cell(row=r, column=3, value=f'=SUMIFS(Expenses!$H${first}:$H${last},Expenses!$F${first}:$F${last},"{t}")').number_format = MONEY
        for col in (1, 2, 3):
            wsu.cell(row=r, column=col).border = border
        r += 1
    wsu.cell(row=r, column=1, value="All expenses").font = f_bold
    wsu.cell(row=r, column=2, value=f"=SUM(B{r - 4}:B{r - 1})").number_format = MONEY
    wsu.cell(row=r, column=3, value=f"=SUM(C{r - 4}:C{r - 1})").number_format = MONEY
    wsu.cell(row=r, column=2).font = f_bold
    wsu.cell(row=r, column=3).font = f_bold
    r += 2
    wsu.cell(row=r, column=1, value="Estimated deductions, mileage + expenses").font = f_bold
    wsu.cell(row=r, column=3, value=f"=C{9}+C{r - 2}").number_format = MONEY
    wsu.cell(row=r, column=3).font = Font(name=FONT, size=12, bold=True, color=NAVY)
    wsu.cell(row=r + 2, column=1, value='"For your CPA" items are logged but not counted as deductible here; your CPA decides.').font = f_note
    footer_note(wsu, r + 4, 4)

    wb.properties.creator = "Grott Luker & Co. \u00b7 BlueLine Advisors"
    wb.properties.title = f"Mileage & Expense Log {YEAR}"
    wb.calculation.fullCalcOnLoad = True
    path = OUT / f"GrottLuker-Mileage-Expense-Log-{YEAR}.xlsx"
    wb.save(path)
    return path


# --------------------------------------------------------------------------- Charitable Donation Log
def build_donations():
    wb = Workbook()
    ws = wb.active
    ws.title = "Read me"
    readme_sheet(ws, [
        (f"Charitable Donation Log \u2014 {YEAR}", f_title),
        ("How to use this workbook", f_bold),
        ("1. Log each gift on the Gifts sheet: date, organization, what it was, the type (Cash, Non-cash, or Securities), and the amount or fair market value. For securities add the cost basis and whether you held them more than a year.", f_body),
        ("2. The sheet calculates the deductible amount and flags what documentation each gift needs.", f_body),
        ("3. The Summary sheet totals by type and lists the flags. Send the workbook to Grott Luker & Co. in January with your receipt letters.", f_body),
        ("", f_body),
        ("Documentation rules", f_bold),
        ("\u2022 Any single gift of $250 or more needs a contemporaneous written acknowledgment from the charity before you file. Mark the Receipt column Y once you have it.", f_body),
        ("\u2022 Non-cash gifts over $500 in total require Form 8283 with the return.", f_body),
        ("\u2022 Any non-cash item or group of similar items over $5,000 needs a qualified appraisal (publicly traded securities excepted).", f_body),
        ("\u2022 Appreciated securities held more than a year are deductible at fair market value and the capital gain is never taxed. Held a year or less, the deduction is limited to cost basis.", f_body),
        ("\u2022 Qualified charitable distributions from an IRA (70\u00bd+) are excluded from income instead of deducted; log them with a note so your CPA sees them.", f_body),
        ("", f_body),
        ("Yellow cells are yours to fill in. White cells calculate themselves.", f_note),
    ])

    wg = wb.create_sheet("Gifts", 1)
    title_block(wg, f"Gifts — {YEAR}", "One row per gift. Deductible amount and flags calculate from the type, amount, basis, and holding period.", 10)
    legend(wg, 4)
    header_row(wg, 5, ["Date", "Organization", "Description", "Type", "Amount / FMV", "Cost basis (securities)", "Held > 1 yr (Y/N)", "Receipt letter (Y/N)", "Deductible", "Flags"], [13, 28, 30, 14, 14, 16, 12, 12, 14, 40])
    dvt = DataValidation(type="list", formula1='"Cash,Non-cash,Securities"', allow_blank=True)
    dvy = DataValidation(type="list", formula1='"Y,N"', allow_blank=True)
    wg.add_data_validation(dvt)
    wg.add_data_validation(dvy)
    first, last = 6, 5 + ROWS
    for r in range(first, last + 1):
        style_input(wg.cell(row=r, column=1), DATE)
        style_input(wg.cell(row=r, column=2))
        style_input(wg.cell(row=r, column=3))
        style_input(wg.cell(row=r, column=4))
        style_input(wg.cell(row=r, column=5), MONEY)
        style_input(wg.cell(row=r, column=6), MONEY)
        style_input(wg.cell(row=r, column=7))
        style_input(wg.cell(row=r, column=8))
        ded = wg.cell(row=r, column=9, value=f'=IF(OR(D{r}="",E{r}=""),"",IF(D{r}="Securities",IF(G{r}="N",MIN(E{r},IF(F{r}="",E{r},F{r})),E{r}),E{r}))')
        style_calc(ded, MONEY)
        flags = wg.cell(row=r, column=10, value=(
            f'=IF(E{r}="","",TRIM('
            f'IF(AND(E{r}>=250,H{r}<>"Y"),"Receipt letter needed. ","")&'
            f'IF(AND(D{r}<>"Cash",E{r}>5000),"Appraisal likely (>$5,000 non-cash). ","")&'
            f'IF(AND(D{r}="Securities",G{r}="N"),"Short-term: limited to basis. ","")))'))
        style_calc(flags)
        flags.alignment = Alignment(wrap_text=True, vertical="top")
        dvt.add(wg.cell(row=r, column=4))
        dvy.add(wg.cell(row=r, column=7))
        dvy.add(wg.cell(row=r, column=8))
    wg.freeze_panes = "A6"
    tr = last + 2
    wg.cell(row=tr, column=4, value="Totals").font = f_bold
    wg.cell(row=tr, column=5, value=f"=SUM(E{first}:E{last})").number_format = MONEY
    wg.cell(row=tr, column=9, value=f"=SUM(I{first}:I{last})").number_format = MONEY
    wg.cell(row=tr, column=5).font = f_bold
    wg.cell(row=tr, column=9).font = f_bold
    footer_note(wg, tr + 2, 10)

    wsu = wb.create_sheet("Summary", 2)
    title_block(wsu, f"Summary — {YEAR}", "Totals by gift type and the documentation checklist.", 4)
    header_row(wsu, 5, ["Gift type", "Gifts", "Deductible", "Count"], [30, 14, 14, 10])
    r = 6
    for t in ("Cash", "Non-cash", "Securities"):
        wsu.cell(row=r, column=1, value=t).font = f_body
        wsu.cell(row=r, column=2, value=f'=SUMIFS(Gifts!$E${first}:$E${last},Gifts!$D${first}:$D${last},"{t}")').number_format = MONEY
        wsu.cell(row=r, column=3, value=f'=SUMIFS(Gifts!$I${first}:$I${last},Gifts!$D${first}:$D${last},"{t}")').number_format = MONEY
        wsu.cell(row=r, column=4, value=f'=COUNTIFS(Gifts!$D${first}:$D${last},"{t}",Gifts!$E${first}:$E${last},">0")')
        for col in range(1, 5):
            wsu.cell(row=r, column=col).border = border
        r += 1
    wsu.cell(row=r, column=1, value="All gifts").font = f_bold
    for col, L in ((2, "B"), (3, "C"), (4, "D")):
        wsu.cell(row=r, column=col, value=f"=SUM({L}6:{L}{r - 1})").font = f_bold
    wsu.cell(row=r, column=2).number_format = MONEY
    wsu.cell(row=r, column=3).number_format = MONEY
    r += 2
    header_row(wsu, r, ["Documentation checklist", "", "Result", ""], [30, 14, 14, 10])
    r += 1
    items = [
        ("Gifts of $250+ still missing a receipt letter", f'=COUNTIFS(Gifts!$E${first}:$E${last},">=250",Gifts!$H${first}:$H${last},"<>Y",Gifts!$E${first}:$E${last},">0")'),
        ("Non-cash total (Form 8283 required over $500)", f'=SUMIFS(Gifts!$E${first}:$E${last},Gifts!$D${first}:$D${last},"<>Cash")'),
        ("Form 8283 needed?", f'=IF(C{r + 1}>500,"Yes","No")'),
        ("Non-cash items over $5,000 (appraisal)", f'=COUNTIFS(Gifts!$D${first}:$D${last},"<>Cash",Gifts!$E${first}:$E${last},">5000")'),
        ("Capital gain avoided on long-term securities", f'=SUMPRODUCT((Gifts!$D${first}:$D${last}="Securities")*(Gifts!$G${first}:$G${last}="Y")*(Gifts!$E${first}:$E${last}-Gifts!$F${first}:$F${last}))'),
    ]
    for label, formula in items:
        wsu.cell(row=r, column=1, value=label).font = f_body
        c = wsu.cell(row=r, column=3, value=formula)
        c.font = f_bold
        if "SUM" in formula:
            c.number_format = MONEY
        for col in (1, 2, 3):
            wsu.cell(row=r, column=col).border = border
        r += 1
    wsu.cell(row=r + 1, column=1, value="Thresholds: IRC §170(f)(8) acknowledgment at $250; Form 8283 above $500 of non-cash gifts; qualified appraisal above $5,000 per item or group.").font = f_note
    footer_note(wsu, r + 3, 4)

    wb.properties.creator = "Grott Luker & Co. \u00b7 BlueLine Advisors"
    wb.properties.title = f"Charitable Donation Log {YEAR}"
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

    wb = Workbook()
    ws = wb.active
    ws.title = "Know Your Numbers"
    title_block(ws, "Know Your Numbers", "A one-page financial snapshot. Round numbers are fine — this is a conversation starter, not a tax return.", 3)
    legend(ws, 4)
    ws.column_dimensions["A"].width = 42
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 50

    r = 6
    def section(title, labels, annual=False):
        nonlocal r
        header_row(ws, r, [title, "Amount" + (" (per year)" if annual else ""), "Notes"], [42, 18, 50])
        r += 1
        start = r
        for lab in labels:
            ws.cell(row=r, column=1, value=lab).font = f_body
            ws.cell(row=r, column=1).border = border
            style_input(ws.cell(row=r, column=2), MONEY0)
            style_input(ws.cell(row=r, column=3))
            r += 1
        end = r - 1
        ws.cell(row=r, column=1, value=f"Total {title.lower()}").font = f_bold
        t = ws.cell(row=r, column=2, value=f"=SUM(B{start}:B{end})")
        t.font = f_bold
        t.number_format = MONEY0
        t.fill = fill_cream
        total_row = r
        r += 2
        return total_row, {lab: start + i for i, lab in enumerate(labels)}

    ta, _ = section("Assets", assets)
    tl, _ = section("Liabilities", liabs)
    ti, _ = section("Income", income, annual=True)
    te, exp_rows = section("Expenses", expenses, annual=True)
    header_row(ws, r, ["Other figures", "Amount", "Notes"], [42, 18, 50])
    r += 1
    extra_rows = {}
    for lab in extra:
        ws.cell(row=r, column=1, value=lab).font = f_body
        ws.cell(row=r, column=1).border = border
        style_input(ws.cell(row=r, column=2), MONEY0)
        style_input(ws.cell(row=r, column=3))
        extra_rows[lab] = r
        r += 1
    r += 1
    header_row(ws, r, ["Your snapshot", "", ""], [42, 18, 50])
    r += 1
    savings_row = extra_rows.get("Annual savings & investing")
    debt_row = next((v for k, v in exp_rows.items() if "debt" in k.lower()), None)
    out = [
        ("Net worth", f"=B{ta}-B{tl}", MONEY0, "assets − liabilities"),
        ("Annual cash flow", f"=B{ti}-B{te}", MONEY0, "income − expenses"),
        ("Savings rate", f"=IF(B{ti}>0,B{savings_row}/B{ti},0)" if savings_row else "=0", PCT, "annual savings ÷ income"),
    ]
    if debt_row:
        out.append(("Debt-to-income", f"=IF(B{ti}>0,B{debt_row}/B{ti},0)", PCT, "annual debt payments ÷ income"))
    for lab, formula, fmt, note in out:
        ws.cell(row=r, column=1, value=lab).font = f_bold
        c = ws.cell(row=r, column=2, value=formula)
        c.font = Font(name=FONT, size=11, bold=True, color=NAVY)
        c.number_format = fmt
        c.fill = fill_cream
        ws.cell(row=r, column=3, value=note).font = f_note
        r += 1
    r += 1
    ws.cell(row=r, column=1, value="When you are done, send this file to Grott Luker & Co. or type the figures into the online form at the link your CPA sent.").font = f_note
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
    r += 2
    for t, f in ABOUT:
        c = ws.cell(row=r, column=1, value=t)
        c.font = f
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
        ws.row_dimensions[r].height = 16 if len(t) < 100 else (34 if len(t) < 220 else 50)
        r += 1
    ws.freeze_panes = "A6"

    wb.properties.creator = "Grott Luker & Co. \u00b7 BlueLine Advisors"
    wb.properties.title = "Know Your Numbers"
    wb.calculation.fullCalcOnLoad = True
    path = OUT / "GrottLuker-Know-Your-Numbers.xlsx"
    wb.save(path)
    return path


if __name__ == "__main__":
    for p in (build_mileage(), build_donations(), build_kyn()):
        print("wrote", p.relative_to(ROOT), p.stat().st_size, "bytes")
