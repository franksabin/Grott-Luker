import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  SelectField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber } from '../lib/format.js'
import { SS_WAGE_BASE, TAX_YEAR } from '../lib/tax.js'
import { STATES } from '../lib/states.js'
import { compute } from '../lib/ownerComp.js'
import { NH_PAY_METHODS, NH_SOLE_FED_OPTIONS, NH, nhThresholds } from '../lib/stateBusinessTax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]

const STATE_OPTIONS = STATES.map((s) => ({ value: s.code, label: s.name }))
const BIZ_STATE_OPTIONS = [{ value: '', label: 'Same as the owner’s state' }, ...STATE_OPTIONS]
const YES_NO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

// Refine-panel inputs carry a non-empty default so the tool computes without opening it.
const BLANK = {
  netProfit: '',
  salary: '',
  otherIncome: '0',
  filing: 'married',
  state: 'NH',
  bizState: '', // '' = the business operates in the owner's state
  receipts: '', // gross business receipts; blank = assumed to exceed the BPT threshold
  nhBptRate: '7.5',
  nhPayMethod: 'salary',
  nhPayCustom: '',
  nhSoleFed: 'expense',
  homeCredit: 'no',
}

const SAMPLE = {
  netProfit: '300000',
  salary: '120000',
  otherIncome: '0',
  filing: 'married',
  state: 'NH',
  bizState: '',
  receipts: '',
  nhBptRate: '7.5',
  nhPayMethod: 'salary',
  nhPayCustom: '',
  nhSoleFed: 'expense',
  homeCredit: 'no',
}

// ?sample=1 wins (ToolShell also applies it); in dev, ?state=<base64 JSON> merges over BLANK
// (a test hook, dead code in a production build).
function initialForm() {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('sample')) return SAMPLE
    if (import.meta.env.DEV) {
      const s = q.get('state')
      if (s) {
        const o = JSON.parse(atob(s.replace(/ /g, '+')))
        const merged = { ...BLANK }
        Object.keys(o).forEach((k) => { merged[k] = typeof o[k] === 'number' ? String(o[k]) : o[k] })
        return merged
      }
    }
  } catch (e) {
    // fall through to blank
  }
  return BLANK
}

const signed = (v) => (v < 0 ? `−${money(-v)}` : money(v))
const pct = (x) => `${+(x * 100).toFixed(3)}%`

// Entity-level tax lines shown in the side-by-side table: every line that is non-zero for either
// structure, labelled with the business state. A modeled state with nothing due still shows one $0 row.
function entityRowsFor(r) {
  if (r.bizInfo.status !== 'modeled') return []
  const ids = []
  ;[r.soleEntity, r.scorpEntity].forEach((e) => e.lines.forEach((l) => { if (l.amount !== 0 && !ids.includes(l.id)) ids.push(l.id) }))
  if (!ids.length) return [{ id: 'none', label: `Business taxes (${r.bizName})`, sole: 0, scorp: 0 }]
  return ids.map((id) => {
    const a = r.soleEntity.lines.find((l) => l.id === id)
    const b = r.scorpEntity.lines.find((l) => l.id === id)
    const base = (a || b).label
    const label = id === 'credit' || base.includes(r.bizName) ? base : `${base} (${r.bizName})`
    return { id, label, sole: a ? a.amount : 0, scorp: b ? b.amount : 0 }
  })
}

// Names of the entity-level taxes that are actually non-zero, for the feature note and narrative.
function entityNamesFor(r) {
  const names = []
  ;[r.soleEntity, r.scorpEntity].forEach((e) => e.lines.forEach((l) => { if (l.id !== 'credit' && l.amount !== 0 && !names.includes(l.label)) names.push(l.label) }))
  const joined = names.join(' and ')
  return joined.includes(r.bizName) ? joined : `${r.bizName} ${joined}`
}

function payMethodText(form, e) {
  const m = form.nhPayMethod || 'salary'
  if (m === 'safe') return 'the $75,000 record-keeping safe harbor'
  if (m === 'earned') return 'the owner’s full earned income'
  if (m === 'custom') return `a set amount of ${money(toNumber(form.nhPayCustom))}, limited to earned income`
  return `the same salary used for the S corporation (${money(e.ownerPay)} here), limited to earned income`
}

// Show-the-math steps for the New Hampshire BET and BPT of one structure.
function nhSteps(r, form, e, who, isSole) {
  const th = e.thresholds
  const rate = pct(e.bptRate)
  const methodLabel = (NH_PAY_METHODS.find((m) => m.value === (form.nhPayMethod || 'salary')) || NH_PAY_METHODS[0]).label.toLowerCase()
  const steps = []
  steps.push({
    label: `${who} · New Hampshire Business Enterprise Tax`,
    formula: !e.betFile
      ? `below the return threshold (${money(th.bet)} of gross receipts or base), so no BET`
      : isSole
        ? `base ${money(r.netProfit)} net profit × 92.35% = ${money(e.betBase)}; × ${NH.betRate}%`
        : `base ${money(r.salary)} salary + ${money(e.betBase - r.salary)} paid out of the profit left after salary and employer payroll tax = ${money(e.betBase)}; × ${NH.betRate}%`,
    result: money(e.bet),
  })
  steps.push({
    label: `${who} · Business Profits Tax base`,
    formula: isSole
      ? `${money(r.netProfit)} − BET ${money(e.bet)} = ${money(r.netProfit - e.bet)}, less the owner-pay deduction of ${money(e.ownerPay)} (${methodLabel}; limited to earned income of ${money(e.ownerPayCap)})`
      : `${money(r.netProfit)} − salary ${money(r.salary)} − employer payroll tax ${money(r.employerFica)} − BET ${money(e.bet)} (an S corporation gets no owner-pay deduction)`,
    result: money(e.bptBase),
  })
  steps.push({
    label: `${who} · Business Profits Tax`,
    formula: e.bptFile ? `${money(e.bptBase)} × ${rate}` : `below the return threshold (${money(th.bpt)} of gross business income), so no BPT`,
    result: money(e.bpt),
  })
  steps.push({
    label: `${who} · BET credited against the BPT`,
    formula: `lesser of the BET ${money(e.bet)} and the BPT ${money(e.bpt)}`,
    result: money(e.credit),
    note: e.unusedCredit > 0 ? `${money(e.unusedCredit)} of BET credit is unused this year. It carries forward but is not counted as a benefit here.` : undefined,
  })
  steps.push({
    label: `${who} · New Hampshire business taxes`,
    formula: `BPT after credit ${money(e.bptAfterCredit)} + BET ${money(e.bet)}`,
    result: money(e.total),
  })
  steps.push({
    label: `${who} · business taxes deducted federally`,
    formula: isSole
      ? e.bptDeductible
        ? `BET ${money(e.bet)} + BPT after credit ${money(e.bptAfterCredit)} (BPT treated as a business expense, as set on this page)`
        : `BET ${money(e.bet)} only; the BPT is treated as a personal state income tax and is not deducted here`
      : `BET ${money(e.bet)} + BPT after credit ${money(e.bptAfterCredit)} (an S corporation deducts all of its entity-level taxes)`,
    result: money(e.federalDeduction),
  })
  return steps
}

// Show-the-math steps for the flat-percentage and minimum-tax states (S corporations only).
function otherEntitySteps(r) {
  const sc = r.scorpEntity
  const line = sc.lines[0]
  const formulas = {
    CA: `greater of $800 and 1.5% × ${money(sc.base)} (profit after salary and employer payroll tax)`,
    IL: `1.5% × ${money(sc.base)} (profit after salary and employer payroll tax)`,
    MA: 'the $456 minimum',
  }
  return [
    { label: `Sole prop · ${r.bizName} entity-level tax`, formula: 'not assumed to apply to a sole proprietor', result: money(r.soleEntityTax) },
    { label: `S-corp · ${line ? line.label : `${r.bizName} entity-level tax`}`, formula: formulas[r.bizCode] || 'see the assumptions', result: money(r.scorpEntityTax) },
    { label: 'S-corp · business taxes deducted federally', formula: 'an S corporation deducts all of its entity-level taxes', result: money(sc.federalDeduction) },
  ]
}

export default function OwnerComp() {
  const [form, setForm] = useState(initialForm)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])

  const modeled = r.bizInfo.status === 'modeled'
  const isNH = r.bizCode === 'NH'
  // Every modeled state adds a business-tax block, entity rows and extra assumptions to page 2 (New Hampshire the most), and 9-digit figures wrap, so page 2 prints leaner.
  const lean = modeled
  const entityOn = modeled && (r.soleEntityTax !== 0 || r.scorpEntityTax !== 0)
  const entityRows = useMemo(() => entityRowsFor(r), [r])
  const entityNames = entityOn ? entityNamesFor(r) : ''
  const th = nhThresholds()

  const steps = useMemo(() => {
    const ent = r.bizInfo.status !== 'modeled'
      ? [{ label: `${r.bizName} entity-level taxes`, formula: 'not modeled; only the owner’s personal income tax is included', result: 'not included' }]
      : r.bizCode === 'NH'
        ? [...nhSteps(r, form, r.soleEntity, 'Sole prop', true), ...nhSteps(r, form, r.scorpEntity, 'S-corp', false)]
        : otherEntitySteps(r)
    const soleEnt = ent.filter((s) => s.label.startsWith('Sole prop') || r.bizInfo.status !== 'modeled')
    const scorpEnt = ent.filter((s) => !s.label.startsWith('Sole prop') && r.bizInfo.status === 'modeled')
    const credit = r.homeCredit
    const bizTail = r.bizInfo.status === 'modeled' ? ' + business-state taxes' : ''
    return [
      { label: 'Sole prop · self-employment tax', formula: `Schedule C profit ${money(r.soleProfit)} (net profit ${money(r.netProfit)} after deductible entity-level state taxes) × 92.35% × 15.3% (12.4% capped at the ${money(SS_WAGE_BASE)} wage base)`, result: money(r.se) },
      { label: 'Sole prop · QBI deduction', formula: 'lesser of 20% × (Schedule C profit − ½ SE tax) and 20% × taxable income', result: money(r.soleQbi) },
      { label: 'Sole prop · federal income tax', formula: `${TAX_YEAR} brackets on Schedule C profit − ½ SE tax + other income − standard deduction − QBI`, result: money(r.soleIncomeTax) },
      { label: 'Sole prop · state income tax', formula: `income × ${r.stateName} rate${credit && r.soleHomeCredit > 0 ? `, less a ${money(r.soleHomeCredit)} credit for ${r.bizName} business taxes (set on this page)` : ''}`, result: money(r.soleState) },
      ...soleEnt,
      { label: 'Sole prop · total tax', formula: `SE + federal + state income tax${bizTail}`, result: money(r.soleTotal) },
      { label: 'S-corp · payroll tax on salary', formula: `${money(r.salary)} × 15.3% (employer + employee)`, result: money(r.fica) },
      { label: 'S-corp · distribution', formula: `${money(r.netProfit)} − salary − employer half of payroll tax${r.scorpEntity.federalDeduction > 0 ? ` − ${money(r.scorpEntity.federalDeduction)} of entity-level state taxes the S corporation deducts` : ''}`, result: money(r.distribution) },
      { label: 'S-corp · QBI deduction', formula: 'lesser of 20% × distribution and 20% × taxable income', result: money(r.scorpQbi) },
      { label: 'S-corp · federal income tax', formula: `${TAX_YEAR} brackets on salary + distribution + other income − standard deduction − QBI`, result: money(r.scorpIncomeTax) },
      { label: 'S-corp · state income tax', formula: `income × ${r.stateName} rate${credit && r.scorpHomeCredit > 0 ? `, less a ${money(r.scorpHomeCredit)} credit for ${r.bizName} business taxes (set on this page)` : ''}`, result: money(r.scorpState) },
      ...scorpEnt,
      { label: 'S-corp · total tax', formula: `payroll + federal + state income tax${bizTail}`, result: money(r.scorpTotal) },
      { label: 'Savings from S-corp election', formula: `${money(r.soleTotal)} − ${money(r.scorpTotal)}`, result: money(r.savings), note: 'Before payroll-service and tax-return costs of running an S-corp.' },
    ]
  }, [r, form])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const filingLabel = form.filing === 'single' ? 'Single' : 'Married filing jointly'
  const enteredSalary = Math.round(toNumber(form.salary))
  const salaryCapped = enteredSalary > r.salary
  // Bridge figures. compute() works in whole dollars, so every one of these foots exactly to the
  // headline and to the side-by-side table: savings = payrollSaved - incomeTaxChange - entityChange.
  const payrollSaved = r.se - r.fica // payroll / SE tax avoided; negative = S-corp pays more
  const deductionChange = r.employerFica - r.seHalf // business-side deduction: employer FICA (S-corp) vs ½ SE tax (sole prop); negative = S-corp deducts less
  const qbiChange = r.scorpQbi - r.soleQbi // negative = S-corp gets less QBI
  const taxableChange = r.scorpTaxable - r.soleTaxable // positive = more federal taxable income under the S-corp
  const fedChange = r.scorpIncomeTax - r.soleIncomeTax
  const stateChange = r.scorpState - r.soleState
  const incomeTaxChange = fedChange + stateChange // income taxes only; entity-level state taxes are the separate entityChange row
  const entityChange = r.entityChange // positive = the S-corp owes more entity-level tax
  const hasState = r.stateRate > 0
  const incomeTaxLabel = incomeTaxChange >= 0
    ? `Additional ${hasState ? 'federal + state' : 'federal'} income tax under the S-corp`
    : `${hasState ? 'Federal + state' : 'Federal'} income tax saved under the S-corp`
  const entityLabel = entityChange >= 0 ? `Additional ${r.bizName} business taxes under the S-corp` : 'Business taxes saved under the S-corp'
  const bizPerson = r.bizDiffers ? `${r.stateCode} resident, ${r.bizCode} business` : r.stateName

  // Plain-language notes about the business-state result (screen: long form; print: short form).
  const bizNotes = []
  if (!modeled) bizNotes.push({ long: r.bizInfo.notice, short: '' })
  if (modeled && isNH && r.netProfit > 0) {
    const se = r.soleEntity
    const sc = r.scorpEntity
    const blank = !r.receiptsEntered
    const blankLong = ' Gross receipts were not entered, so they are assumed to exceed the BPT threshold; enter them to test the thresholds.'
    if (!se.bptFile && !se.betFile) {
      bizNotes.push({
        long: `No New Hampshire business tax return is required at ${money(se.grossReceipts)} of gross receipts (the Business Profits Tax return starts above ${money(th.bpt)} and the Business Enterprise Tax return above ${money(th.bet)}), so no business tax is included.${blank ? blankLong : ''}`,
        short: `No New Hampshire return is required at ${money(se.grossReceipts)} of gross receipts (thresholds ${money(th.bpt)} BPT, ${money(th.bet)} BET), so no business tax is included.`,
      })
    } else if (!se.betFile) {
      bizNotes.push({
        long: blank
          ? `Gross receipts were not entered, so they are assumed to exceed the ${money(th.bpt)} BPT threshold but not the ${money(th.bet)} BET threshold, so no Business Enterprise Tax is included. Enter them to test the thresholds.`
          : `Gross receipts of ${money(se.grossReceipts)} are at or below the ${money(th.bet)} Business Enterprise Tax threshold, so no Business Enterprise Tax is included.`,
        short: `At or below the ${money(th.bet)} BET threshold, so no BET is included.`,
      })
    }
    if (se.unusedCredit > 0 || sc.unusedCredit > 0) {
      const parts = []
      if (se.unusedCredit > 0) parts.push(`${money(se.unusedCredit)} for the sole proprietor`)
      if (sc.unusedCredit > 0) parts.push(`${money(sc.unusedCredit)} for the S-corporation`)
      bizNotes.push({
        long: `The Business Enterprise Tax credit is larger than the Business Profits Tax, so ${parts.join(' and ')} of credit is unused this year. It can be carried forward, but it is not counted as a benefit here.`,
        short: `BET credit larger than the BPT: ${parts.join(' and ')} unused. It carries forward and is not counted here.`,
      })
    }
  }
  if (modeled && !isNH) {
    r.scorpEntity.notes.forEach((n) => bizNotes.push({ long: n, short: n }))
  }

  // Narrative text shared by the screen and the printed report.
  const entitySentence = !modeled
    ? ` Entity-level taxes for ${r.bizName} are not included.`
    : entityOn
      ? ` These totals include ${entityNames}: ${money(r.soleEntityTax)} for the sole proprietor and ${money(r.scorpEntityTax)} for the S-corporation.`
      : isNH && r.netProfit > 0 && !r.soleEntity.bptFile && !r.soleEntity.betFile
        ? ' No New Hampshire business tax return is required at this size, so no business tax is included.'
        : isNH && r.netProfit > 0
          ? ' No New Hampshire business tax is due on these figures.'
          : ''
  const savingsClause = r.savings >= 0
    ? `a savings of about ${money(r.savings)}, driven largely by payroll tax avoided on the distribution${entityChange > 0 ? ' and reduced by added business taxes' : ''}.`
    : `about ${money(Math.abs(r.savings))} more, once QBI${entityOn ? ', business taxes' : ''} and other effects are considered.`
  const narrative = `On ${money(r.netProfit)} of net profit, taking it all as self-employment income results in an estimated ${money(r.soleTotal)} of total tax. Paying a ${money(r.salary)} salary through an S-corporation and taking ${money(r.distribution)} as a distribution results in an estimated ${money(r.scorpTotal)}, ${savingsClause}${entitySentence}`
  const featureNote = `On ${money(r.netProfit)} of net profit · ${money(r.salary)} salary${entityOn ? ` · includes ${entityNames}` : ''}`
  const soleTileNote = entityOn && r.soleEntityTax !== 0 ? `includes ${money(r.soleEntityTax)} of ${r.bizCode} business taxes` : undefined
  const scorpTileNote = entityOn && r.scorpEntityTax !== 0 ? `includes ${money(r.scorpEntityTax)} of ${r.bizCode} business taxes` : undefined

  // Chart bars: a third bar for entity-level taxes only when there are any.
  const chartGroups = [
    { label: 'Sole prop / LLC', income: r.soleIncomeTax + r.soleState, pay: r.se, entity: r.soleEntityTax },
    { label: 'S-corporation', income: r.scorpIncomeTax + r.scorpState, pay: r.fica, entity: r.scorpEntityTax },
  ].map((g) => ({
    label: g.label,
    bars: [
      { label: 'Payroll / SE tax', value: g.pay, color: TONE.tax },
      { label: 'Income + state tax', value: g.income, color: TONE.debt },
      ...(entityOn ? [{ label: `${r.bizName} business taxes`, value: g.entity, color: TONE.state }] : []),
    ],
  }))

  // Salary sensitivity for the print report: the same compute() the screen uses, at a few nearby salaries.
  const sensitivityBase = r.salary > 0 ? r.salary : r.netProfit * 0.4
  const sensitivity = (isNH ? [0.8, 1, 1.2] : [0.6, 0.8, 1, 1.2, 1.4])
    .map((f) => {
      const s = f === 1 ? r.salary : Math.round((sensitivityBase * f) / 1000) * 1000 // compute() caps it at the fundable salary
      return { salary: s, current: f === 1, ...compute({ ...form, salary: String(s) }) }
    })
    .filter((row, i, all) => all.findIndex((x) => x.salary === row.salary) === i)
    .sort((a, b) => a.salary - b.salary)

  const inputs = [
    ['Business net profit', money(r.netProfit)],
    ['S-corp salary', salaryCapped ? `${money(r.salary)} (capped)` : money(enteredSalary)],
    ['Filing status', filingLabel],
    ['Other income', money(toNumber(form.otherIncome))],
    ['Owner’s state', r.stateName],
    ['Business state', r.bizName],
    ['Gross receipts', r.receiptsEntered ? money(toNumber(form.receipts)) : 'Not entered'],
    ...(isNH
      ? [
          ['NH BPT rate', pct(r.soleEntity.bptRate)],
          ['NH owner pay', form.nhPayMethod === 'custom' ? `Set ${money(toNumber(form.nhPayCustom))}` : form.nhPayMethod === 'safe' ? 'Safe harbor $75,000' : form.nhPayMethod === 'earned' ? 'Full earned income' : 'S-corp salary'],
          ['NH BPT federal', r.soleEntity.bptDeductible ? 'Business expense' : 'Not deducted'],
        ]
      : []),
    ...(r.bizDiffers && modeled ? [['Home state credit', r.homeCredit ? 'Yes' : 'No']] : []),
  ]

  // Assumptions (screen and print share this array). Items about the business state appear only when they apply.
  const assumptions = [
    'Uses 2026 federal brackets, standard deduction, the Social Security wage base, and combined employer + employee FICA / self-employment tax rates. All figures are carried in whole dollars, as on a return.',
    'The S-corp distribution is net profit less the salary, the employer share of payroll tax and the entity-level state taxes the S-corp deducts; distributions are not subject to payroll tax. A salary the profit cannot fund is capped at the fundable amount. The sole proprietor deducts one-half of self-employment tax; the S-corp deducts the employer share of payroll tax.',
    'QBI is estimated as 20% of qualified income, limited to 20% of taxable income. W-2 wage and property limitations and the SSTB phase-out are not modeled here (see the QBI Deduction Optimizer).',
    `Personal state tax uses ${r.stateName}’s representative rate, where the owner lives, on the income shown before the QBI deduction (QBI is a federal-only deduction).`,
    ...(modeled
      ? [`${r.bizName} business taxes: ${r.bizInfo.summary} The S-corp deducts its entity-level state taxes on its federal return, which lowers the distribution and the owner’s federal taxable income.`, ...r.bizInfo.limits]
      : [r.bizInfo.notice]),
    ...(isNH
      ? [
          `Assumed unless changed on this page: the sole proprietor’s New Hampshire owner-pay deduction (RSA 77-A:4 III) is ${payMethodText(form, r.soleEntity)}, and an S-corp gets none. ${
            r.soleEntity.bptDeductible
              ? 'The sole proprietor’s Business Profits Tax is deducted on Schedule C, the default under Rev. Rul. 81-288; an S-corp’s entity taxes are always deducted.'
              : 'The sole proprietor’s Business Profits Tax is treated as a personal state income tax and is not deducted here (the standard deduction is used), as set on this page; an S-corp’s entity taxes are always deducted.'
          }`,
          `Assumed unless changed on this page: Business Profits Tax rate of ${pct(r.soleEntity.bptRate)} (7.5% as the statute currently reads)${
            r.receiptsEntered
              ? `, and gross receipts of ${money(toNumber(form.receipts))}, as entered, to test the return thresholds.`
              : `, and gross receipts above the ${money(th.bpt)} BPT threshold, because none were entered.`
          }`,
          `New Hampshire return thresholds change after 2026 (the BET threshold becomes ${money(nhThresholds(2027).bet)} in 2027); 2026 figures are used here (${money(th.bpt)} BPT, ${money(th.bet)} BET).`,
        ]
      : []),
    ...(r.bizDiffers && modeled
      ? [`Assumed unless changed on this page: ${r.stateName} ${r.homeCredit ? 'credits' : 'does not credit'} the ${r.bizName} entity-level tax on the owner’s return (often not creditable; confirm first).`]
      : []),
    'The additional 0.9% Medicare surtax, state credits and rules other than those listed here, and retirement-plan contributions are not modeled.',
    'A “reasonable” salary is a facts-and-circumstances determination; this tool does not opine on what salary is defensible.',
  ]
  const noteText = (
    <>
      An S-corporation can save payroll tax because only the salary is subject to FICA; the distribution is not. But too low a salary invites IRS scrutiny and shrinks retirement-plan contribution room, and once taxable income is above the QBI threshold the deduction is limited by W-2 wages paid, so a very low salary can also cost QBI (that limitation is not modeled here). This report shows the headline tax trade-off; the right salary is a judgment call, and the savings shown are before the payroll-service and separate tax-return costs of running an S-corp.
    </>
  )

  // State business taxes block for page 2 (modeled states only).
  const sE = r.soleEntity
  const cE = r.scorpEntity
  const bizBlockRows = isNH
    ? [
        [`BET base (${NH.betRate}%)`, money(sE.betBase), money(cE.betBase)],
        ['Owner-pay deduction', money(sE.ownerPay), 'none'],
        [`BPT base (${pct(sE.bptRate)})`, money(sE.bptBase), money(cE.bptBase)],
        ['BET credit used', money(sE.credit), money(cE.credit)],
        ['Deducted federally', money(sE.federalDeduction), money(cE.federalDeduction)],
      ]
    : [
        ...(cE.base != null ? [['S-corp net income taxed', 'not applicable', money(cE.base)]] : []),
        ['Entity-level tax', money(r.soleEntityTax), money(r.scorpEntityTax)],
        ['Deducted federally', money(sE.federalDeduction), money(cE.federalDeduction)],
      ]
  const bizSection = (
    <PrintSection title="State business taxes" note={r.bizName}>
      <PrintTable
        head={['', 'Sole prop', 'S-corp']}
        widths={['42%', '29%', '29%']}
        align={['left', 'right', 'right']}
        rows={bizBlockRows}
      />
      {bizNotes.length ? (
        <div className="oc-pr-note">{bizNotes.map((n, i) => <p key={i}>{n.short}</p>)}</div>
      ) : null}
    </PrintSection>
  )
  const splitSection = (
    <PrintSection title="How the S-corp profit is split">
      <PrintRows
        rows={[
          { label: 'Business net profit', value: money(r.netProfit) },
          { label: 'Less: reasonable W-2 salary', value: money(r.salary) },
          { label: 'Less: employer half of payroll tax', value: money(r.employerFica), sub: true },
          { label: 'Distribution to the owner', value: money(r.distribution), total: true },
        ]}
      />
    </PrintSection>
  )

  const entityBridge = modeled && (r.soleEntityTax !== 0 || r.scorpEntityTax !== 0)
  // Page 1 budget: the bridge row, tile notes and a longer narrative cost room, so the chart gives some back (never below 150).
  const chartHeight = entityBridge ? 150 : entitySentence ? 190 : 230
  const tight = hasState || modeled

  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="Owner Compensation Comparison"
          subtitle="Self-employment income versus an S-corp salary plus distributions: same business, different tax bill."
          meta={`${money(r.netProfit)} net profit · ${money(r.salary)} S-corp salary · ${filingLabel} · ${bizPerson}`}
          metaRight={today}
        />
        <PrintFeature
          label={r.savings >= 0 ? 'Estimated tax savings with S-corp strategy' : 'S-corp strategy costs more by'}
          value={money(Math.abs(r.savings))}
          note={`${featureNote} · before the cost of running an S-corp`}
        />
        <PrintTiles
          items={[
            { label: 'Sole prop / LLC total tax', value: money(r.soleTotal), note: soleTileNote, best: r.savings < 0 },
            { label: 'S-corporation total tax', value: money(r.scorpTotal), note: scorpTileNote, best: r.savings >= 0 },
            { label: 'S-corp distribution · no payroll tax', value: money(r.distribution) },
          ]}
        />
        <PrintSection title="Where the difference comes from" note="estimated, this tax year">
          <PrintRows
            rows={[
              { label: 'Self-employment tax as a sole proprietor', value: money(r.se) },
              { label: `Payroll tax on a ${money(r.salary)} S-corp salary (employer + employee)`, value: money(r.fica) },
              { label: payrollSaved >= 0 ? 'Payroll tax avoided on the distribution' : 'Additional payroll tax under the S-corp', value: money(Math.abs(payrollSaved)) },
              { label: incomeTaxLabel, value: money(Math.abs(incomeTaxChange)) },
              ...(entityBridge ? [{ label: entityLabel, value: money(Math.abs(entityChange)) }] : []),
              { label: r.savings >= 0 ? 'Net savings from the S-corp election' : 'Net cost of the S-corp election', value: money(Math.abs(r.savings)), total: true },
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        <PrintSection title="Total tax by strategy" className="pr-chart" note="estimated, this tax year">
          <BarCompare height={chartHeight} groups={chartGroups} />
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact={tight}>
        <PrintPageHead title="Owner Compensation Comparison" right={today} />
        <PrintSection title="Side-by-side detail" note="estimated total tax under each strategy">
          <PrintTable
            head={['', 'Sole prop / LLC', 'S-corporation']}
            widths={['46%', '27%', '27%']}
            align={['left', 'right', 'right']}
            rowClass={(row) => (row[0] === 'Estimated total tax' ? 'is-strong' : '')}
            rows={[
              ...(lean ? [] : [['Owner W-2 salary', 'none', money(r.salary)]]),
              ['Profit taxed as SE income / taken as distribution', money(r.soleProfit), money(r.distribution)],
              ['Payroll / self-employment tax', money(r.se), money(r.fica)],
              ...(lean ? [] : [['Deductible share (½ SE tax / employer half of payroll tax)', money(r.seHalf), money(r.employerFica)]]),
              ['QBI deduction', money(r.soleQbi), money(r.scorpQbi)],
              ...(lean ? [] : [['Federal taxable income', money(r.soleTaxable), money(r.scorpTaxable)]]),
              ['Federal income tax', money(r.soleIncomeTax), money(r.scorpIncomeTax)],
              [`State income tax (${r.stateName})`, money(r.soleState), money(r.scorpState)],
              ...entityRows.map((x) => [x.label, signed(x.sole), signed(x.scorp)]),
              ['Estimated total tax', money(r.soleTotal), money(r.scorpTotal)],
            ]}
          />
        </PrintSection>
        <PrintCols>
          {modeled ? bizSection : splitSection}
          <PrintSection title="Why income tax moves" note="deductions differ, not just payroll tax">
            <PrintRows
              rows={[
                { label: deductionChange <= 0 ? 'Smaller deductible share of payroll / SE tax' : 'Larger deductible share of payroll / SE tax', value: money(Math.abs(deductionChange)) },
                { label: qbiChange <= 0 ? 'QBI deduction given up (salary is not QBI)' : 'Additional QBI deduction with the S-corp', value: money(Math.abs(qbiChange)) },
                ...(lean ? [] : [{ label: taxableChange >= 0 ? 'More federal taxable income under the S-corp' : 'Less federal taxable income under the S-corp', value: money(Math.abs(taxableChange)), sub: true }]),
                { label: hasState ? (fedChange >= 0 ? 'Additional federal income tax' : 'Federal income tax saved') : incomeTaxLabel, value: money(Math.abs(fedChange)), total: !hasState },
                ...(hasState
                  ? [
                      { label: stateChange >= 0 ? `Additional state tax (${r.stateName})` : `State tax saved (${r.stateName})`, value: money(Math.abs(stateChange)) },
                      { label: incomeTaxChange >= 0 ? 'Additional income tax, federal + state' : 'Income tax saved, federal + state', value: money(Math.abs(incomeTaxChange)), total: true },
                    ]
                  : []),
              ]}
            />
          </PrintSection>
        </PrintCols>
        <PrintSection title="What a different salary would do" note="same profit and household; only the S-corp salary changes">
          <PrintTable
            head={['S-corp salary', 'Payroll tax', 'QBI deduction', 'Federal tax', ...(modeled ? ['Business taxes'] : []), 'S-corp total', 'Savings vs. sole prop']}
            widths={modeled ? ['24%', '10%', '12%', '12%', '13%', '12%', '17%'] : ['19%', '12%', '14%', '19%', '16%', '20%']}
            align={modeled ? ['left', 'right', 'right', 'right', 'right', 'right', 'right'] : ['left', 'right', 'right', 'right', 'right', 'right']}
            rowClass={(row, i) => (sensitivity[i].current ? 'is-tint' : '')}
            rows={sensitivity.map((s) => [
              s.current ? `${money(s.salary)} (${salaryCapped ? 'capped' : 'entered'})` : money(s.salary),
              money(s.fica),
              money(s.scorpQbi),
              money(s.scorpIncomeTax),
              ...(modeled ? [money(s.scorpEntityTax)] : []),
              money(s.scorpTotal),
              signed(s.savings),
            ])}
          />
        </PrintSection>
        {isNH ? null : <PrintNote title="Reading the result">{noteText}</PrintNote>}
        <PrintSection title="Inputs used in this estimate" className="oy-inputs">
          <PrintInputs items={inputs} />
        </PrintSection>
        <PrintSection title="Assumptions" className="oc-assump">
          <PrintAssumptions items={assumptions} />
        </PrintSection>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  // Scenario-card rows: entity-level lines appear for each structure when there are any.
  const cardRows = (who) => {
    const isSole = who === 'sole'
    return [
      { label: isSole ? 'Self-employment tax' : 'Payroll tax', value: money(isSole ? r.se : r.fica) },
      { label: 'Federal income tax', value: money(isSole ? r.soleIncomeTax : r.scorpIncomeTax) },
      ...(hasState ? [{ label: 'State income tax', value: money(isSole ? r.soleState : r.scorpState) }] : []),
      ...(entityOn ? [{ label: `${r.bizName} business taxes`, value: money(isSole ? r.soleEntityTax : r.scorpEntityTax) }] : []),
      { label: 'QBI deduction', value: money(isSole ? r.soleQbi : r.scorpQbi) },
    ]
  }

  const bizNotice = !modeled ? (
    <div className="note oc-notice">{r.bizInfo.notice}</div>
  ) : (
    <div className="hint oc-summary">{r.bizInfo.summary}</div>
  )

  return (
    <ToolShell
      title="Owner Compensation Optimizer"
      subtitle="Compare paying yourself as a sole proprietor / LLC versus taking a reasonable salary plus distributions through an S-corporation, including payroll and self-employment tax, the QBI deduction, state business taxes, and total tax by strategy."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="Business & Owner Profile">
            <MoneyField
              label="Business net profit"
              value={form.netProfit}
              onChange={set('netProfit')}
              info="Net profit of the business before any owner salary or compensation."
            />
            <MoneyField
              label="Reasonable salary (S-corp)"
              value={form.salary}
              onChange={set('salary')}
              info="A reasonable W-2 salary for your role — required for an S-corp. Only the salary is subject to payroll tax; the remaining profit is taken as a distribution."
            />
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
          </Panel>
          <RefinePanel summary="business state, receipts, state tax assumptions">
            <MoneyField
              label="Other household taxable income"
              value={form.otherIncome}
              onChange={set('otherIncome')}
              info="Other taxable income, such as a spouse's wages. Affects the tax bracket the business income falls into."
            />
            <SelectField
              label="State where the owner lives"
              value={form.state}
              onChange={set('state')}
              options={STATE_OPTIONS}
              hint="Personal income tax uses this state."
            />
            <SelectField
              label="State where the business operates"
              value={form.bizState}
              onChange={set('bizState')}
              options={BIZ_STATE_OPTIONS}
              hint="Entity-level taxes follow this state."
            />
            {bizNotice}
            <MoneyField
              label="Gross business receipts"
              value={form.receipts}
              onChange={set('receipts')}
              placeholder="Optional"
              hint={`Needed to test the New Hampshire return thresholds. Blank assumes receipts above the ${money(nhThresholds().bpt)} BPT threshold.`}
            />
            {r.bizDiffers && modeled ? (
              <SelectField
                label="Home state credits the business-state tax"
                value={form.homeCredit}
                onChange={set('homeCredit')}
                options={YES_NO}
                hint="Entity-level taxes are often not creditable on a resident return. Confirm before turning this on."
              />
            ) : null}
            {isNH ? (
              <div className="oc-group">
                <div className="oc-group-title">New Hampshire business taxes</div>
                <NumberField
                  label="Business Profits Tax rate (%)"
                  value={form.nhBptRate}
                  onChange={set('nhBptRate')}
                  suffix="%"
                  hint="7.5% as the statute currently reads."
                />
                <SelectField
                  label="Owner-pay deduction for a sole proprietor"
                  value={form.nhPayMethod}
                  onChange={set('nhPayMethod')}
                  options={NH_PAY_METHODS}
                  hint="RSA 77-A:4 III deducts reasonable pay for the owner’s own services, limited to earned income. Proprietorships and partnerships get it; S corporations do not."
                />
                {form.nhPayMethod === 'custom' ? (
                  <MoneyField
                    label="Owner-pay deduction amount"
                    value={form.nhPayCustom}
                    onChange={set('nhPayCustom')}
                    hint="Limited to the owner’s earned income."
                  />
                ) : null}
                <SelectField
                  label="Federal treatment of the BPT for a sole proprietor"
                  value={form.nhSoleFed}
                  onChange={set('nhSoleFed')}
                  options={NH_SOLE_FED_OPTIONS}
                  hint="Rev. Rul. 81-288 lets a sole proprietor deduct the BPT in computing adjusted gross income, so by default it is a business expense. Choose the other option to leave it undeducted. An S corporation’s entity taxes are always deducted."
                />
              </div>
            ) : null}
          </RefinePanel>
          <Note title="What drives the difference">{noteText}</Note>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="Compensation Strategy Comparison"
              meta="Sole prop / LLC vs. S-corporation"
              metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <FeatureBlock
              label={r.savings >= 0 ? 'Estimated tax savings with S-corp strategy' : 'S-corp strategy costs more by'}
              value={money(Math.abs(r.savings))}
              note={featureNote}
            />
            <StatTiles
              items={[
                { label: 'Sole prop / LLC total tax', value: money(r.soleTotal), note: soleTileNote },
                { label: 'S-corporation total tax', value: money(r.scorpTotal), note: scorpTileNote },
                { label: 'S-corp distribution', value: money(r.distribution), note: 'not subject to payroll tax' },
              ]}
            />
            <Narrative>{narrative}</Narrative>
            {bizNotes.length ? (
              <div className="note oc-notes">
                {bizNotes.map((n, i) => <p key={i}>{n.long}</p>)}
              </div>
            ) : null}

            <ScenarioCards
              sub="estimated total tax"
              scenarios={[
                { label: 'Sole prop / LLC', value: money(r.soleTotal), best: r.savings < 0, rows: cardRows('sole') },
                { label: 'S-corporation', value: money(r.scorpTotal), best: r.savings >= 0, rows: cardRows('scorp') },
              ]}
            />

            <div className="chart-block oc-chart" style={{ marginTop: 20 }}>
              <BarCompare groups={chartGroups} />
            </div>

            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th className="num">Sole prop / LLC</th>
                    <th className="num">S-corporation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Payroll / self-employment tax</td>
                    <td className="num">{money(r.se)}</td>
                    <td className="num">{money(r.fica)}</td>
                  </tr>
                  <tr>
                    <td>QBI deduction</td>
                    <td className="num">{money(r.soleQbi)}</td>
                    <td className="num">{money(r.scorpQbi)}</td>
                  </tr>
                  <tr>
                    <td>Federal income tax</td>
                    <td className="num">{money(r.soleIncomeTax)}</td>
                    <td className="num">{money(r.scorpIncomeTax)}</td>
                  </tr>
                  <tr>
                    <td>State income tax ({r.stateName}{r.homeCredit ? ', after business-state credit' : ''})</td>
                    <td className="num">{money(r.soleState)}</td>
                    <td className="num">{money(r.scorpState)}</td>
                  </tr>
                  {entityRows.map((x) => (
                    <tr key={x.id}>
                      <td>{x.label}</td>
                      <td className="num">{signed(x.sole)}</td>
                      <td className="num">{signed(x.scorp)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Estimated total tax</td>
                    <td className="num">{money(r.soleTotal)}</td>
                    <td className="num">{money(r.scorpTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
