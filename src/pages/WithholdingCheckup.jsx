import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  PillField,
  RefinePanel,
  StatTiles,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
  Callout,
} from '../components/ui.jsx'
import { StackedBar, BarCompare, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { ordinaryTax, marginalOrdinaryRate, STANDARD_DEDUCTION, TAX_YEAR } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const FREQ = [
  { value: '52', label: 'Weekly (52)' },
  { value: '26', label: 'Biweekly (26)' },
  { value: '24', label: 'Semimonthly (24)' },
  { value: '12', label: 'Monthly (12)' },
]

const DEDUCTION = [
  { value: 'standard', label: 'Standard deduction' },
  { value: 'itemized', label: 'Itemized' },
]

const BLANK = {
  filing: 'married',
  frequency: '26',
  periodsPaid: '',
  ytdWages: '',
  ytdWithholding: '',
  spouseYtdWages: '',
  spouseYtdWithholding: '',
  bonus: '0',
  otherIncome: '0',
  deductionType: 'standard',
  itemized: '0',
  credits: '0',
  estimatedPayments: '0',
}

const SAMPLE = {
  filing: 'married',
  frequency: '26',
  periodsPaid: '18',
  ytdWages: '112500',
  ytdWithholding: '13400',
  spouseYtdWages: '58200',
  spouseYtdWithholding: '4900',
  bonus: '15000',
  otherIncome: '6500',
  deductionType: 'standard',
  itemized: '',
  credits: '4000',
  estimatedPayments: '0',
}

function compute(form) {
  const filing = form.filing === 'single' ? 'single' : 'married'
  const periodsTotal = Math.max(1, Math.round(toNumber(form.frequency) || 26))
  const periodsPaid = Math.min(periodsTotal, Math.max(0, Math.round(toNumber(form.periodsPaid))))
  const remaining = Math.max(0, periodsTotal - periodsPaid)

  const ytdWages = toNumber(form.ytdWages)
  const ytdWH = toNumber(form.ytdWithholding)
  const spWages = filing === 'married' ? toNumber(form.spouseYtdWages) : 0
  const spWH = filing === 'married' ? toNumber(form.spouseYtdWithholding) : 0
  const bonus = toNumber(form.bonus)
  const other = toNumber(form.otherIncome)
  const credits = toNumber(form.credits)
  const estPayments = toNumber(form.estimatedPayments)

  const pace = (ytd) => (periodsPaid > 0 ? ytd / periodsPaid : 0)
  const perWages = pace(ytdWages)
  const perWH = pace(ytdWH)
  const spPerWages = pace(spWages)
  const spPerWH = pace(spWH)

  const projWages = ytdWages + perWages * remaining + bonus
  const projSpouseWages = spWages + spPerWages * remaining
  const projIncome = projWages + projSpouseWages + other

  const stdDed = STANDARD_DEDUCTION[filing]
  const itemized = toNumber(form.itemized)
  const deduction = form.deductionType === 'itemized' ? Math.max(itemized, 0) : stdDed
  const usingStandardAnyway = form.deductionType === 'itemized' && itemized < stdDed
  const effectiveDeduction = Math.max(deduction, form.deductionType === 'itemized' ? 0 : stdDed)

  const taxable = Math.max(0, projIncome - effectiveDeduction)
  const grossTax = ordinaryTax(taxable, filing)
  const projTax = Math.max(0, grossTax - credits)
  const marginal = marginalOrdinaryRate(taxable, filing)

  const projWithholding = ytdWH + perWH * remaining + spWH + spPerWH * remaining
  const projPaid = projWithholding + estPayments
  const gap = projTax - projPaid // + = balance due, - = refund

  // One number for the W-4: total federal withholding per remaining primary
  // paycheck that lands the return at $0, given everything else on pace.
  // neededFromPrimary = gap + perWH × remaining, so target = current ± change.
  // Per-paycheck figures are whole dollars (W-4 entries are whole dollars):
  // an extra rounds up so the gap is closed, a reduction rounds down so the
  // refund is not overshot, and the three rows foot exactly.
  const neededFromPrimary = Math.max(0, projTax - estPayments - ytdWH - spWH - spPerWH * remaining)
  const perWHRounded = Math.round(perWH)
  const extraPerCheck = remaining > 0 && gap > 0 ? Math.ceil(gap / remaining) : 0
  // A reduction cannot exceed what is actually being withheld from each
  // paycheck; whatever is left of the refund is locked in whatever the W-4 says.
  const reduceUncapped = remaining > 0 && gap < 0 ? Math.abs(gap) / remaining : 0
  const reduceCapped = reduceUncapped > perWHRounded
  const reducePerCheck = reduceCapped ? perWHRounded : Math.floor(reduceUncapped)
  const refundLocked = gap < 0 ? Math.max(0, Math.abs(gap) - reducePerCheck * remaining) : 0
  const targetPerCheck = remaining > 0 ? (gap > 0 ? perWHRounded + extraPerCheck : Math.max(0, perWHRounded - reducePerCheck)) : 0

  // Penalty exposure under the 90% current-year test (prior-year test lives in
  // the Estimated Tax tool). §6654(e)(1): no underpayment penalty at all when
  // the tax after withholding is under $1,000 — estimated payments do not count
  // toward that $1,000 test (Form 2210, Part I).
  const ninety = 0.9 * projTax
  const penaltyDeMinimis = projTax - projWithholding < 1000
  const penaltyShortfall = penaltyDeMinimis ? 0 : Math.max(0, ninety - projPaid)
  const extraToSafeHarbor = remaining > 0 ? Math.ceil(penaltyShortfall / remaining) : 0

  const coverage = projTax > 0 ? projPaid / projTax : 1

  return {
    filing, periodsTotal, periodsPaid, remaining,
    ytdWages, ytdWH, spWages, spWH, bonus, other, credits, estPayments,
    perWages, perWH, perWHRounded, projWages, projSpouseWages, projIncome,
    deduction: effectiveDeduction, usingStandardAnyway, stdDed,
    taxable, grossTax, projTax, marginal,
    projWithholding, projPaid, gap, extraPerCheck, reducePerCheck, reduceCapped, refundLocked, targetPerCheck, neededFromPrimary,
    ninety, penaltyDeMinimis, penaltyShortfall, extraToSafeHarbor, coverage,
  }
}

export default function WithholdingCheckup() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: 'Pay periods', formula: `${r.periodsTotal} per year − ${r.periodsPaid} paid`, result: `${r.remaining} remaining` },
    { label: 'Per-period pace', formula: `wages ${money(r.ytdWages, 2)} ÷ ${r.periodsPaid} · withholding ${money(r.ytdWH, 2)} ÷ ${r.periodsPaid}`, result: `${money(r.perWages, 2)} · ${money(r.perWH, 2)}` },
    { label: 'Projected wages (primary)', formula: `${money(r.ytdWages, 2)} + ${r.remaining} × ${money(r.perWages, 2)} + bonus ${money(r.bonus, 2)}`, result: money(r.projWages, 2) },
    ...(r.spWages > 0 ? [{ label: 'Projected wages (spouse)', formula: `${money(r.spWages, 2)} + ${r.remaining} × ${money(r.spWages / Math.max(1, r.periodsPaid), 2)}`, result: money(r.projSpouseWages, 2) }] : []),
    { label: 'Total income', formula: `${money(r.projWages, 2)}${r.spWages > 0 ? ` + ${money(r.projSpouseWages, 2)}` : ''} + other ${money(r.other, 2)}`, result: money(r.projIncome, 2) },
    { label: 'Taxable income', formula: `${money(r.projIncome, 2)} − deduction ${money(r.deduction, 2)}`, result: money(r.taxable, 2), note: r.usingStandardAnyway ? 'Itemized total was below the standard deduction, so the standard deduction is used.' : undefined },
    { label: 'Federal tax by bracket', formula: `${TAX_YEAR} ${r.filing === 'single' ? 'single' : 'MFJ'} brackets applied to ${money(r.taxable, 2)} (marginal ${percent(r.marginal * 100, 0)})`, result: money(r.grossTax, 2) },
    { label: 'Less credits', formula: `${money(r.grossTax, 2)} − ${money(r.credits, 2)}`, result: money(r.projTax, 2) },
    { label: 'Projected withholding', formula: `${money(r.ytdWH + r.spWH, 2)} to date + ${r.remaining} × ${money(r.perWH + r.spWH / Math.max(1, r.periodsPaid), 2)}${r.estPayments > 0 ? ` + estimated payments ${money(r.estPayments, 2)}` : ''}`, result: money(r.projPaid, 2) },
    { label: r.gap > 0 ? 'Shortfall' : 'Overpayment', formula: `${money(r.projTax, 2)} − ${money(r.projPaid, 2)}`, result: money(Math.abs(r.gap), 2) },
    ...(r.remaining > 0 ? [{ label: 'Withholding per paycheck to land at $0', formula: `(${money(r.projTax, 2)} − estimates ${money(r.estPayments, 2)} − withheld so far ${money(r.ytdWH + r.spWH, 2)}${r.spWages > 0 ? ` − spouse on pace ${money(r.spWH / Math.max(1, r.periodsPaid) * r.remaining, 2)}` : ''}) ÷ ${r.remaining} = ${money(r.neededFromPrimary / r.remaining, 2)}`, result: money(r.targetPerCheck), note: `Whole dollars: current ${money(r.perWH, 2)} per paycheck ${r.gap > 0 ? `+ ${money(r.extraPerCheck)} extra` : `− ${money(r.reducePerCheck)} reduction${r.reduceCapped ? ' (capped at current withholding)' : ''}`}.` }] : []),
    ...(r.remaining > 0 && r.gap > 0 ? [
      { label: 'Extra per paycheck to close the gap', formula: `${money(r.gap, 2)} ÷ ${r.remaining}, rounded up to the next dollar`, result: money(r.extraPerCheck) },
      { label: 'Minimum for the 90% test', formula: r.penaltyDeMinimis ? `tax after withholding ${money(r.projTax - r.projWithholding, 2)} < $1,000 → no penalty` : `max(0, 90% × ${money(r.projTax, 2)} − ${money(r.projPaid, 2)}) ÷ ${r.remaining}, rounded up`, result: money(r.extraToSafeHarbor) },
    ] : []),
    ...(r.remaining > 0 && r.gap < 0 ? [
      { label: 'Reduction per paycheck', formula: `${money(Math.abs(r.gap), 2)} ÷ ${r.remaining} = ${money(Math.abs(r.gap) / r.remaining, 2)}, rounded down${r.reduceCapped ? `, capped at the ${money(r.perWHRounded)} being withheld` : ''}`, result: money(r.reducePerCheck), note: r.reduceCapped ? `${money(r.refundLocked, 2)} of the refund is locked in even at $0 withholding.` : undefined },
    ] : []),
  ], [r])
  const married = form.filing === 'married'
  const owes = r.gap > 0

  // Refund with nothing withheld on this paycheck: the money came from the spouse's withholding or
  // from estimated payments, so no W-4 change on this paycheck can shrink it.
  const refundNoPrimary = !owes && r.gap < 0 && r.remaining > 0 && r.reducePerCheck === 0
  const refundSource = r.spWH > 0 && r.estPayments > 0 ? 'spouse withholding and estimated payments' : r.spWH > 0 ? 'spouse withholding' : 'estimated payments'
  // The third tile is the action figure: what changes on the W-4, or what an estimated payment must cover.
  const actionTile = owes
    ? r.remaining > 0
      ? { label: 'Extra per paycheck', value: money(r.extraPerCheck), note: `W-4 Step 4(c) · ${r.remaining} paychecks left` }
      : { label: 'Estimated payment needed', value: money(r.gap), tone: 'bad', note: 'no paychecks remain' }
    : r.remaining > 0 && r.reducePerCheck > 0
      ? {
          label: 'Could reduce per paycheck',
          value: money(r.reducePerCheck),
          tone: 'good',
          note: r.reduceCapped ? `all of current withholding · ${money(r.refundLocked)} refund locked in` : `${r.remaining} paychecks left`,
        }
      : r.remaining === 0
        ? { label: r.gap < 0 ? 'Refund expected at filing' : 'Nothing due at filing', value: money(Math.abs(r.gap)), tone: r.gap < 0 ? 'good' : undefined, note: 'no paychecks remain' }
        : refundNoPrimary
          ? { label: 'Change per paycheck', value: '$0', tone: 'good', note: `nothing withheld here · refund comes from ${refundSource}` }
          : { label: 'Change per paycheck', value: '$0', note: 'withholding is on target' }

  // Shared copy — the screen Narrative / Note and the print prose / note render the same JSX.
  const narrative = (
    <>
      On the current pace, {married ? 'the household' : 'the client'} ends the year with about{' '}
      {money(r.projIncome)} of income and {money(r.projTax)} of federal tax
      {r.credits > 0 ? ` after ${money(r.credits)} in credits` : ''}. Withholding is running at{' '}
      {money(r.projWithholding)} for the year
      {r.estPayments > 0 ? ` plus ${money(r.estPayments)} in estimated payments` : ''}, which{' '}
      {owes ? `leaves a shortfall of ${money(r.gap)}` : r.gap < 0 ? `produces a refund of ${money(Math.abs(r.gap))}` : 'lands the return at $0'}.
      {owes && r.remaining > 0
        ? ` Adding ${money(r.extraPerCheck)} of extra withholding on each of the remaining ${r.remaining} paychecks closes the gap${
            r.penaltyShortfall > 0
              ? `; ${money(r.extraToSafeHarbor)} per paycheck is the minimum to reach the 90% safe harbor and avoid an underpayment penalty.`
              : r.penaltyDeMinimis
                ? '; because the tax after withholding is under $1,000, no underpayment penalty applies either way.'
                : '; the 90% safe harbor is already met, so the extra avoids the April bill rather than a penalty.'
          }`
        : ''}
      {owes && r.remaining === 0 ? ' No paychecks remain — the balance should be covered with an estimated payment.' : ''}
      {!owes && r.remaining > 0 && r.reducePerCheck > 0
        ? ` Withholding could come down by ${money(r.reducePerCheck)} on each of the remaining ${r.remaining} paychecks${
            r.reduceCapped ? ` — that is all of the current withholding, so ${money(r.refundLocked)} of the refund is locked in whatever the W-4 says` : ''
          }.`
        : ''}
      {refundNoPrimary ? ` The refund comes from ${refundSource}, not from this paycheck — nothing is being withheld here to reduce.` : ''}
    </>
  )
  const howToNote = owes && r.remaining > 0
    ? (
        <>
          On a new Form W-4, enter the extra per-paycheck amount on <strong>Step 4(c)</strong>. It takes effect with the next payroll cycle, so if there are only a few paychecks left, an estimated payment may be the surer route — see the Estimated Tax &amp; Safe Harbor Planner for the prior-year safe harbor.
        </>
      )
    : !owes && r.remaining > 0 && r.reducePerCheck > 0
      ? (
          <>
            Step 4(c) only adds withholding. To take less out, file a new Form W-4 with an amount in <strong>Step 3</strong> — payroll spreads a Step 3 entry across the year’s {r.periodsTotal} pay periods, so about {money(r.reducePerCheck * r.periodsTotal)} there trims roughly {money(r.reducePerCheck)} from each paycheck — or raise the Step 4(b) deductions entry. It takes effect with the next payroll cycle{r.reduceCapped ? `; ${money(r.refundLocked)} of the refund is already locked in and arrives at filing` : ''}. File a fresh W-4 in January so the reduction does not carry into next year.
          </>
        )
      : r.remaining === 0
        ? (
            <>
              No paychecks remain, so a W-4 change cannot help this tax year.{' '}
              {owes
                ? `Cover the ${money(r.gap)} with an estimated payment (Form 1040-ES) by January 15, and file a new W-4 for next year so the shortfall does not repeat — see the Estimated Tax & Safe Harbor Planner for the prior-year safe harbor.`
                : `The ${money(Math.abs(r.gap))} refund arrives when the return is filed; file a new W-4 in January if the over-withholding should not repeat next year.`}
            </>
          )
        : refundNoPrimary
          ? (
              <>
                This paycheck already has no federal withholding, so a W-4 change here cannot shrink the refund.{' '}
                {r.spWH > 0 ? <>To take less out during the year, adjust the spouse’s Form W-4 (<strong>Step 3</strong> or Step 4(b)){r.estPayments > 0 ? ' or trim the remaining estimated payments' : ''}</> : 'To take less out during the year, reduce the remaining estimated payments'}, or let the {money(Math.abs(r.gap))} arrive as a refund at filing.
              </>
            )
          : (
              <>
                Withholding is on target — no W-4 change is needed. Re-run this check after a raise, a bonus, or any change in other income.
              </>
            )

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const filingLabel = married ? 'Married filing jointly' : 'Single'
  const freqLabel = (FREQ.find((f) => f.value === form.frequency) || FREQ[1]).label
  const inputs = [
    ['Filing status', filingLabel],
    ['Pay frequency', freqLabel],
    ['Pay periods paid so far', `${r.periodsPaid} of ${r.periodsTotal}`],
    ['YTD taxable wages', money(r.ytdWages)],
    ['YTD federal withholding', money(r.ytdWH)],
    ...(married
      ? [
          ['Spouse YTD taxable wages', money(r.spWages)],
          ['Spouse YTD federal withholding', money(r.spWH)],
        ]
      : []),
    ['Bonus or other wages still expected', money(r.bonus)],
    ['Other income (not from wages)', money(r.other)],
    [
      'Deductions',
      form.deductionType === 'itemized'
        ? `Itemized · ${money(toNumber(form.itemized))}${r.usingStandardAnyway ? ' (standard used)' : ''}`
        : `Standard · ${money(r.stdDed)}`,
    ],
    ['Tax credits expected', money(r.credits)],
    ['Estimated payments made', money(r.estPayments)],
  ]
  const assumptions = [
    `Uses ${TAX_YEAR} federal ordinary brackets and the standard deduction. Capital gains, QBI, AMT, the additional Medicare tax, and phaseouts are not modeled.`,
    'The 2026 senior deduction ($6,000 per person 65+, phased out above $75,000 / $150,000) is not applied because age is not collected. An itemized total is used exactly as entered; the SALT cap and other itemized limits are not applied to it.',
    'Remaining wages and withholding are projected at the year-to-date pace per pay period; a bonus is added on top with no assumed withholding — enter any bonus withholding as part of YTD once it is paid.',
    'Per-paycheck figures are whole dollars (an extra rounds up, a reduction rounds down); a reduction is capped at the withholding actually coming out of each paycheck.',
    'The 90% safe-harbor test uses this year’s projected tax; no penalty applies when tax after withholding (estimated payments excluded) is under $1,000. The 100%/110% prior-year test is in the Estimated Tax tool.',
    'State withholding is not modeled. New Hampshire has no wage tax; for MA/ME clients a separate state check applies.',
    'This is a planning estimate from a single pay stub, not a substitute for a completed Form W-4 worksheet.',
  ]

  // Page-1 action rows mirror the on-screen Callouts, branch for branch.
  const adjustRows = r.remaining > 0
    ? [
        {
          label: married
            ? `Primary earner’s federal withholding per paycheck to land at $0 (${r.remaining} left, spouse on pace)`
            : `Federal withholding per paycheck to land at $0 (${r.remaining} paychecks left)`,
          value: r.targetPerCheck > 0 ? money(r.targetPerCheck) : '$0 — already covered',
        },
        { label: `Current federal withholding per paycheck${married ? ' (primary)' : ''}`, value: money(r.perWHRounded), sub: true },
        ...(owes
          ? [
              { label: 'Extra withholding per paycheck — Form W-4, Step 4(c)', value: money(r.extraPerCheck), total: true },
              { label: 'Minimum extra per paycheck to avoid an underpayment penalty (90% test)', value: r.penaltyDeMinimis ? 'None — under $1,000' : money(r.extraToSafeHarbor), sub: true },
            ]
          : r.reducePerCheck > 0
            ? [
                { label: r.reduceCapped ? 'Over-withheld — could reduce per paycheck by (all of current withholding)' : 'Over-withheld — could reduce per paycheck by', value: money(r.reducePerCheck), total: true },
                ...(r.reduceCapped ? [{ label: 'Refund locked in even at $0 withholding on the remaining paychecks', value: money(r.refundLocked), sub: true }] : []),
                { label: 'Projected refund if nothing changes', value: money(Math.abs(r.gap)), sub: true },
              ]
            : refundNoPrimary
              ? [
                  { label: `Projected refund — comes from ${refundSource}; nothing withheld on this paycheck to reduce`, value: money(Math.abs(r.gap)), total: true },
                ]
              : []),
      ]
    : [
        { label: owes ? 'Estimated payment needed — no paychecks remain' : 'No paychecks remain — refund expected at filing', value: money(Math.abs(r.gap)), total: true },
        ...(owes ? [{ label: 'Shortfall against the 90% safe harbor', value: money(r.penaltyShortfall), sub: true }] : []),
      ]
  const compareGroups = [
    { label: 'Projected tax', bars: [{ label: 'Projected tax', value: r.projTax, color: TONE.navy }] },
    { label: 'Withholding on pace', bars: [{ label: 'Withholding', value: r.projWithholding, color: TONE.accent }] },
    ...(r.estPayments > 0 ? [{ label: 'Estimated payments', bars: [{ label: 'Estimated payments', value: r.estPayments, color: TONE.debt }] }] : []),
    { label: owes ? 'Balance due' : 'Refund', bars: [{ label: owes ? 'Balance due' : 'Refund', value: Math.abs(r.gap), color: owes ? TONE.tax : TONE.net }] },
  ]
  const coverageData = [
    { label: 'Withheld to date', value: r.ytdWH + r.spWH, color: TONE.navy },
    { label: 'Remaining paychecks (current pace)', value: r.projWithholding - r.ytdWH - r.spWH, color: TONE.accent },
    ...(r.estPayments > 0 ? [{ label: 'Estimated payments', value: r.estPayments, color: TONE.debt }] : []),
    ...(owes ? [{ label: 'Shortfall', value: r.gap, color: TONE.tax }] : []),
  ]
  const coverageTotal = coverageData.reduce((s, d) => s + Math.max(0, d.value), 0)

  const printReport = (
    <PrintDoc>
      {/* Page 1 is always compact: the longest branch (capped refund = 5 action rows, or owes with
          credits + estimated payments = 4–5 prose lines) otherwise runs the footer to the page edge. */}
      <PrintPage compact>
        <PrintBand
          title="Withholding Checkup"
          subtitle="Full-year federal tax projected from a recent pay stub, compared with withholding on the current pace, and the W-4 change that closes the gap."
          meta={`Tax year ${TAX_YEAR} projection · ${filingLabel} · ${r.remaining} of ${r.periodsTotal} paychecks remaining`}
          metaRight={today}
        />
        <PrintFeature
          label={owes ? 'Projected balance due at filing' : 'Projected refund at filing'}
          value={money(Math.abs(r.gap))}
          note={`${money(r.projTax)} projected tax · ${money(r.projPaid)} projected withholding & payments · ${percent(r.coverage * 100, 0)} covered`}
        />
        <PrintTiles
          items={[
            { label: 'Projected tax', value: money(r.projTax), note: `marginal ${percent(r.marginal * 100, 0)}` },
            { label: 'Withholding & payments on pace', value: money(r.projPaid), note: `${percent(r.coverage * 100, 0)} of tax covered` },
            { label: actionTile.label, value: actionTile.value, note: actionTile.note, best: !owes && r.reducePerCheck > 0 },
          ]}
        />
        <PrintSection title={r.remaining > 0 ? 'The W-4 adjustment' : 'No paychecks remain'} note={r.remaining > 0 ? 'per remaining paycheck' : undefined}>
          <PrintRows rows={adjustRows} />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        <PrintSection title="Projected tax vs. what is being paid" className="pr-chart">
          {r.projTax > 0 || r.projPaid > 0 ? (
            <BarCompare height={230} legend={false} groups={compareGroups} />
          ) : (
            <PrintProse>Enter the pay-stub figures — pay periods paid, year-to-date wages and withholding — to compare the projected tax with what is being paid.</PrintProse>
          )}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      {/* Page 2: the coverage bar full width, then the income→balance ladder beside the two short row
          lists. The ladder's worst case (married, bonus, other income, credits, estimated payments) is
          13 rows, which the side-by-side layout absorbs without compact. */}
      <PrintPage last>
        <PrintPageHead title="Withholding Checkup" right={today} />
        <PrintSection title="Covering the projected tax" note={owes ? `${money(r.projTax)} of tax · ${percent(r.coverage * 100, 0)} covered on pace` : `${money(r.projPaid)} paid against ${money(r.projTax)} of tax`} className="pr-chart">
          {/* The legend is the "Where the money comes from" rows below (they add $ and % share). */}
          {coverageTotal > 0 ? (
            <StackedBar height={36} data={coverageData} legend={false} />
          ) : (
            <PrintProse>Enter year-to-date wages and withholding from the pay stub to see how the projected tax is being covered.</PrintProse>
          )}
        </PrintSection>
        <PrintCols>
          <PrintSection title="From income to the balance" note="full-year projection">
            <PrintRows
              rows={[
                { label: r.bonus > 0 ? 'Projected wages at the current pace (primary)' : 'Projected wages (primary)', value: money(r.projWages - r.bonus) },
                ...(r.bonus > 0 ? [{ label: 'Bonus or other wages still expected', value: money(r.bonus) }] : []),
                ...(married && r.projSpouseWages > 0 ? [{ label: 'Projected wages (spouse)', value: money(r.projSpouseWages) }] : []),
                ...(r.other > 0 ? [{ label: 'Other income', value: money(r.other) }] : []),
                { label: 'Deduction', value: `−${money(r.deduction)}`, sub: true },
                { label: 'Taxable income', value: money(r.taxable) },
                { label: `Federal tax (marginal ${percent(r.marginal * 100, 0)})`, value: money(r.grossTax) },
                ...(r.credits > 0 ? [{ label: 'Credits', value: `−${money(r.credits)}`, sub: true }] : []),
                { label: 'Projected tax', value: money(r.projTax), total: true },
                { label: 'Projected withholding (current pace)', value: money(r.projWithholding) },
                ...(r.estPayments > 0 ? [{ label: 'Estimated payments', value: money(r.estPayments), sub: true }] : []),
                { label: owes ? 'Balance due' : 'Refund', value: money(Math.abs(r.gap)), total: true },
              ]}
            />
          </PrintSection>
          <div>
            <PrintSection title="Where the money comes from" note={owes ? 'share of projected tax' : 'share of total paid'}>
              {coverageTotal > 0 ? null : <PrintProse>Nothing to show yet — no wages, withholding, or payments entered.</PrintProse>}
              <PrintRows
                rows={coverageData.filter((d) => d.value > 0).map((d) => ({
                  label: (
                    <>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: d.color, marginRight: 6, verticalAlign: 'baseline', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                      {d.label}
                    </>
                  ),
                  value: `${money(d.value)} · ${percent((d.value / Math.max(1, coverageTotal)) * 100, 0)}`,
                  sub: d.label === 'Shortfall',
                }))}
              />
            </PrintSection>
            <PrintSection title="Pace and safe harbor" note={`${r.periodsPaid} of ${r.periodsTotal} paychecks in`}>
              <PrintRows
                rows={[
                  { label: 'Wages per paycheck (primary)', value: money(r.perWages) },
                  { label: 'Federal withholding per paycheck (primary)', value: money(r.perWHRounded) },
                  ...(married && r.spWH > 0 ? [{ label: 'Federal withholding per paycheck (spouse)', value: money(r.spWH / Math.max(1, r.periodsPaid)) }] : []),
                  { label: '90% of projected tax (safe-harbor floor)', value: money(r.ninety) },
                  { label: 'Tax after withholding ($1,000 penalty threshold)', value: money(Math.max(0, r.projTax - r.projWithholding)), sub: true },
                  { label: 'Shortfall against the 90% test', value: owes && r.penaltyDeMinimis ? 'None — under $1,000' : money(r.penaltyShortfall), sub: true },
                ]}
              />
            </PrintSection>
          </div>
        </PrintCols>
        <PrintNote title="Reading the result">{howToNote}</PrintNote>
        <PrintSection title="Inputs used in this estimate">
          <PrintInputs items={inputs} />
        </PrintSection>
        <PrintSection title="Assumptions">
          <PrintAssumptions items={assumptions} />
        </PrintSection>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="Withholding Checkup (W-4)"
      subtitle="Will this client owe in April? Project full-year tax from a recent pay stub, compare it to withholding on the current pace, and get the W-4 adjustment that closes the gap over the remaining paychecks."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="From the most recent pay stub">
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <PillField label="Pay frequency" value={form.frequency} onChange={set('frequency')} options={FREQ} />
            <NumberField
              label="Pay periods paid so far this year"
              value={form.periodsPaid}
              onChange={set('periodsPaid')}
              info="Count the paychecks received to date. The tool assumes the same pay and withholding continue for the remaining periods."
              hint={r.periodsPaid > 0 ? `${r.remaining} paychecks remain of ${r.periodsTotal}` : undefined}
            />
            <div className="field-row">
              <MoneyField label="YTD taxable wages" value={form.ytdWages} onChange={set('ytdWages')} info="Federal taxable wages year-to-date (after pre-tax 401(k), health premiums, etc.)." />
              <MoneyField label="YTD federal withholding" value={form.ytdWithholding} onChange={set('ytdWithholding')} />
            </div>
            {married ? (
              <div className="field-row">
                <MoneyField label="Spouse YTD taxable wages" value={form.spouseYtdWages} onChange={set('spouseYtdWages')} hint="Leave blank if none." />
                <MoneyField label="Spouse YTD federal withholding" value={form.spouseYtdWithholding} onChange={set('spouseYtdWithholding')} />
              </div>
            ) : null}
          </Panel>

          <RefinePanel summary="bonus, other income, deductions, credits, estimated payments">
            <div className="field-row">
              <MoneyField label="Bonus or other wages still expected" value={form.bonus} onChange={set('bonus')} info="Wages beyond the regular pace — a year-end bonus, RSU vest, commission." />
              <MoneyField label="Other income (not from wages)" value={form.otherIncome} onChange={set('otherIncome')} info="Interest, dividends, side income, retirement distributions — anything with little or no withholding." />
            </div>
            <div className="field-row">
              <SegmentedField label="Deductions" value={form.deductionType} onChange={set('deductionType')} options={DEDUCTION} />
              {form.deductionType === 'itemized' ? (
                <MoneyField label="Itemized total" value={form.itemized} onChange={set('itemized')} hint={r.usingStandardAnyway ? `Below the ${money(r.stdDed)} standard deduction — standard used.` : undefined} />
              ) : (
                <div />
              )}
            </div>
            <div className="field-row">
              <MoneyField label="Tax credits expected" value={form.credits} onChange={set('credits')} info="Child tax credit, dependent care, education credits — reduce tax dollar for dollar." />
              <MoneyField label="Estimated payments made" value={form.estimatedPayments} onChange={set('estimatedPayments')} />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Withholding Checkup"
              meta={`Tax year ${TAX_YEAR} projection · ${r.remaining} paychecks remaining`}
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={owes ? 'Projected balance due at filing' : 'Projected refund at filing'}
              value={money(Math.abs(r.gap))}
              note={`${money(r.projTax)} projected tax · ${money(r.projPaid)} projected withholding & payments · ${percent(r.coverage * 100, 0)} covered`}
            />
            <StatTiles
              items={[
                { label: 'Projected tax', value: money(r.projTax), note: `marginal ${percent(r.marginal * 100, 0)}` },
                { label: 'Withholding & payments on pace', value: money(r.projPaid), note: `${percent(r.coverage * 100, 0)} of tax covered` },
                actionTile,
              ]}
            />

            {r.remaining > 0 ? (
              <Callout
                label={married
                  ? `Set the primary earner’s federal withholding to this per paycheck (${r.remaining} left, spouse on pace) to land at $0`
                  : `Set federal withholding to this per paycheck (${r.remaining} left) to land at $0`}
                value={money(r.targetPerCheck)}
                rightLabel={married ? 'Current per paycheck (primary)' : 'Current per paycheck'}
                rightValue={money(r.perWHRounded)}
                tone={r.targetPerCheck > r.perWHRounded ? 'warn' : 'good'}
              />
            ) : null}
            {r.remaining > 0 && owes ? (
              <Callout
                label="W-4 adjustment — Step 4(c), extra withholding per paycheck"
                value={money(r.extraPerCheck)}
                rightLabel="Minimum to avoid an underpayment penalty (90% test)"
                rightValue={r.penaltyDeMinimis ? 'None — under $1,000' : money(r.extraToSafeHarbor)}
                tone={r.penaltyShortfall > 0 ? 'warn' : 'good'}
              />
            ) : null}
            {r.remaining > 0 && !owes && r.reducePerCheck > 0 ? (
              <Callout
                label={r.reduceCapped ? 'Over-withheld — could reduce per paycheck by (all of current withholding)' : 'Over-withheld — could reduce per paycheck by'}
                value={money(r.reducePerCheck)}
                rightLabel={r.reduceCapped ? 'Refund locked in regardless' : 'Projected refund'}
                rightValue={money(r.reduceCapped ? r.refundLocked : Math.abs(r.gap))}
                tone="good"
              />
            ) : null}

            <div className="result-list">
              <ResultRow label={r.bonus > 0 ? 'Projected wages at the current pace (primary)' : 'Projected wages (primary)'} value={r.projWages - r.bonus} />
              {r.bonus > 0 ? <ResultRow label="Bonus or other wages still expected" value={r.bonus} /> : null}
              {married && r.projSpouseWages > 0 ? <ResultRow label="Projected wages (spouse)" value={r.projSpouseWages} /> : null}
              {r.other > 0 ? <ResultRow label="Other income" value={r.other} /> : null}
              <ResultRow label="Deduction" value={-r.deduction} sub />
              <ResultRow label="Taxable income" value={r.taxable} />
              <ResultRow label={`Federal tax (marginal ${percent(r.marginal * 100, 0)})`} value={r.grossTax} />
              {r.credits > 0 ? <ResultRow label="Credits" value={-r.credits} sub /> : null}
              <ResultRow label="Projected tax" value={r.projTax} total />
              <ResultRow label="Projected withholding (current pace)" value={r.projWithholding} />
              {r.estPayments > 0 ? <ResultRow label="Estimated payments" value={r.estPayments} sub /> : null}
              <ResultRow label={owes ? 'Balance due' : 'Refund'} value={Math.abs(r.gap)} total negative={owes} positive={!owes} />
            </div>

            <Narrative>{narrative}</Narrative>

            <div className="chart-block" style={{ marginTop: 22 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>
                Covering the projected tax
              </div>
              <StackedBar
                data={[
                  { label: 'Withheld to date', value: r.ytdWH + r.spWH, color: TONE.navy },
                  { label: 'Remaining paychecks (current pace)', value: r.projWithholding - r.ytdWH - r.spWH, color: TONE.accent },
                  ...(r.estPayments > 0 ? [{ label: 'Estimated payments', value: r.estPayments, color: TONE.debt }] : []),
                  ...(owes ? [{ label: 'Shortfall', value: r.gap, color: TONE.tax }] : []),
                ]}
              />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="How to apply the adjustment">{howToNote}</Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
