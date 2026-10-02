import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import ViewSwitch from '../components/ViewSwitch.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
  SegmentedField,
  SelectField,
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
import { BarCompare, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { TAX_YEAR, SENIOR_DEDUCTION, ADDITIONAL_STANDARD, NIIT, irmaaSurcharge } from '../lib/tax.js'
import { STATES, getState } from '../lib/states.js'
import { computeOneYear, LADDER_STEP } from '../lib/oneYear.js'
import { taxYear } from '../lib/multiYear.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const TARGETS = [
  { value: 'b12', label: 'Top of 12%' },
  { value: 'b22', label: 'Top of 22%' },
  { value: 'b24', label: 'Top of 24%' },
  { value: 'irmaa', label: 'IRMAA line' },
  { value: 'amount', label: 'Set amount' },
]
const TARGET_PCT = { b12: 12, b22: 22, b24: 24 }

const BLANK = {
  filing: 'married',
  age: '',
  spouseAge: '',
  wages: '',
  pension: '',
  otherOrdinary: '',
  ss: '',
  ltcg: '',
  taxExempt: '',
  nii: '',
  itemized: '',
  state: 'NH',
  stateRate: '',
  cap: '',
  target: 'b22',
  amount: '',
}

const SAMPLE = {
  filing: 'married',
  age: '66',
  spouseAge: '64',
  wages: '0',
  pension: '30000',
  otherOrdinary: '24000',
  ss: '48000',
  ltcg: '15000',
  taxExempt: '',
  nii: '',
  itemized: '',
  state: 'NH',
  cap: '600000',
  target: 'amount',
  amount: '75000',
}

// The form survives a switch to the other view (the wrapper clears it when the tool is left).
let formCache = null
export function clearOneYearCache() {
  formCache = null
}

// ?sample=1 wins; in dev, ?state=<base64 JSON> merges over BLANK (a test hook, dead code in a production build);
// otherwise the form the user left behind, otherwise blank.
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
    // fall through to the cache or blank
  }
  return formCache || BLANK
}

const pct0 = (x) => percent(x * 100, 0)
const pct1 = (x) => percent(x * 100, 1)
const bracketName = (b) => (b == null ? null : `${Math.round(b * 100)}%`)
const signed = (v) => (v >= 0.5 ? `+${money(v)}` : v <= -0.5 ? `−${money(-v)}` : '$0')
const NL = String.fromCharCode(10)
const entered = (v) => v != null && String(v).trim() !== ''
const listJoin = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

// Strings shared by the screen and the printed report.
const IRMAA_YEAR = TAX_YEAR + 2
const SUBTITLE = 'What converting before December 31 would cost, priced against the client’s projected income: Social Security taxation, the senior deduction, gains, state tax and IRMAA are included, and the limits of the model are listed at the bottom.'
const PRINT_SUBTITLE = 'What converting before December 31 would cost, priced against the client’s projected income.'
const ACA_TEXT = 'Marketplace premium subsidies are not modeled. If the client buys marketplace coverage, check the subsidy effect before converting.'
const BASIS_NOTE = 'After-tax basis (Form 8606) is not modeled; with basis, part of every conversion is tax-free.'
const ZERO_CAP_NOTE = 'Nothing can be converted: the pre-tax IRA balance entered is $0.'
const INCOME_KEYS = ['wages', 'pension', 'otherOrdinary', 'ss', 'ltcg', 'taxExempt']

export default function OneYearConversion({ onView }) {
  const [form, setFormState] = useState(initialForm)
  const setForm = (next) => {
    formCache = next
    setFormState(next)
  }
  const set = (k) => (v) => setForm({ ...form, [k]: v })

  const st = getState(form.state)
  const filingLabel = form.filing === 'single' ? 'Single' : 'Married filing jointly'
  const married = form.filing !== 'single'
  const nz = (v) => Math.max(0, toNumber(v))
  const age = Math.max(0, Math.round(toNumber(form.age)))
  // A form with only an age is not a client with no income: the age and at least one income field (a typed 0 counts) are required.
  const hasIncome = INCOME_KEYS.some((k) => entered(form[k]))
  const ready = age > 0 && hasIncome
  const capEntered = entered(form.cap)
  const prompt = age <= 0 ? 'Enter the client’s age and this year’s income' : 'Enter this year’s income (type 0 for a field with none)'

  const f = useMemo(() => ({
    filing: form.filing,
    age,
    spouseAge: married ? Math.max(0, Math.round(toNumber(form.spouseAge))) : 0,
    wages: nz(form.wages),
    pension: nz(form.pension),
    otherOrdinary: nz(form.otherOrdinary),
    ss: nz(form.ss),
    ltcg: nz(form.ltcg),
    taxExempt: nz(form.taxExempt),
    nii: nz(form.nii),
    itemized: nz(form.itemized),
    stateRate: entered(form.stateRate) ? Math.min(25, Math.max(0, toNumber(form.stateRate))) / 100 : st.wage / 100,
    // Blank is no limit; an entered 0 is a real limit (nothing can be converted).
    cap: capEntered ? nz(form.cap) : null,
    // Until the client's age and income are in, nothing is priced: a blank form is not a client with no income.
    target: ready ? form.target : 'amount',
    amount: ready ? nz(form.amount) : 0,
  }), [form, st, age, married, ready, capEntered])
  const r = useMemo(() => computeOneYear(f), [f])

  const { base, chosen: ch, current, irmaaLine, ladder, spots } = r
  const y = ch.y
  const c = ch.conversion
  const converting = c >= 0.5
  const spouseAssumed = r.married && f.spouseAge <= 0
  const seniorsText = r.seniors > 0 ? `${r.seniors} ${r.seniors === 1 ? 'person' : 'people'} 65 or older` : 'nobody 65 or older'
  const agesText = r.married ? `${r.ages[0]} and ${r.ages[1]}${spouseAssumed ? ' (spouse assumed the same)' : ''}` : `${r.ages[0]}`
  const itemizedUsed = f.itemized > r.std
  // Built from the amounts actually used: the senior deduction is named only while it is above $0 before or after converting.
  const seniorUsed = Math.max(base.senior, y.senior) > 0.5
  const dedLabel = `${itemizedUsed ? 'itemized' : 'standard'}${!itemizedUsed && r.aged > 0 ? ' + 65+' : ''}${seniorUsed ? ' + senior' : ''}`
  const baseSSPct = f.ss > 0 ? base.taxableSS / f.ss : 0
  const nextY = useMemo(() => taxYear(r.ctx, c + LADDER_STEP), [r, c])
  // What makes the next dollars cost what they do, named only where it is live at the margin.
  const nextBracketPct = nextY.ordinaryTaxable > 0.5 ? Math.round(nextY.marginal * 100) : null
  const thisBracketPct = ch.bracket != null ? Math.round(ch.bracket * 100) : 0
  const nextDrivers = [
    nextBracketPct != null && nextBracketPct > thisBracketPct ? `the next dollars fall in the ${nextBracketPct}% bracket` : '',
    nextY.taxableSS > y.taxableSS + 0.5 ? 'more Social Security becomes taxable' : '',
    nextY.senior < y.senior - 0.5 ? 'the senior deduction phases out further' : '',
    nextY.fedGains > y.fedGains + 0.5 ? 'more of the gains move into a higher rate' : '',
    nextY.niit > y.niit + 0.5 ? 'the 3.8% net investment income tax applies' : '',
  ].filter(Boolean)
  const stateNote = f.stateRate > 0
  const magiOf = (yy) => yy.agi + r.taxExempt
  const niitShown = base.niit > 0.5 || y.niit > 0.5
  // MAGI over the NIIT line before or after converting, with no net investment income entered, while other ordinary income exists.
  const niitLine = NIIT.threshold[r.filing]
  const niitWarn = ready && (base.agi > niitLine || y.agi > niitLine) && !entered(form.nii) && f.otherOrdinary > 0
    ? 'If any of the other ordinary income is interest, dividends or rents, enter it in Net investment income; otherwise it is left out of the 3.8% tax.'
    : ''
  const metaLine = ready ? `${TAX_YEAR} tax year · ${filingLabel} · age${r.married ? 's' : ''} ${agesText} · ${st.name}` : prompt

  // Ages are ages on December 31. Under 60: tax withheld from a conversion is a distribution that carries the 10% additional tax before 59½.
  const under60 = r.ages.some((a) => a <= 59)
  const under60All = r.ages.every((a) => a <= 59)
  const owner59 = under60All ? 'Before 59½' : 'If the IRA owner is under 59½'
  const under65 = r.ages.some((a) => a < 65)
  // Anyone who turns 65 during IRMAA_YEAR is on Medicare for only part of that year.
  const partialMedicare = r.ages.filter((a) => a + 2 === 65).length
  const irmaaPeriod = (() => {
    if (partialMedicare === 0) return r.medicare >= 2 ? 'a year, household' : r.married ? 'a year, one person' : 'a year'
    if (r.medicare === 1) return `a year once on Medicare (turns 65 during ${IRMAA_YEAR}); the first year is partial`
    if (partialMedicare === r.medicare) return `a year, household, once on Medicare (both turn 65 during ${IRMAA_YEAR}); the first year is partial`
    return `a year, household; one spouse turns 65 during ${IRMAA_YEAR}, so that spouse’s first year is partial`
  })()

  const capZero = r.cap === 0
  // The line is the highest MAGI that stays in the tier; at a boundary where the surcharge starts AT the threshold say 'under'.
  const irmaaLimitText = irmaaLine.exclusive ? `MAGI under ${money(irmaaLine.threshold)}` : `MAGI ${money(irmaaLine.limit)}`
  // Why the chosen target cannot be priced (the client is already past it), or null.
  const bracketIssue = !!(ready && TARGET_PCT[form.target] && !r.chosenSpot)
  const targetIssue = (() => {
    if (!ready || form.target === 'amount' || r.chosenSpot) return null
    if (form.target === 'irmaa') {
      if (r.medicare === 0) return `IRMAA does not apply: no one is on Medicare by ${IRMAA_YEAR}, so this year’s income cannot set a surcharge. Nothing is priced for this target; pick a bracket or a set amount.`
      if (irmaaLine.atTop) return 'The client is already in the top IRMAA tier, so there is no line left to stay under. Nothing is priced for this target; pick a bracket or a set amount.'
      return 'The client is already at the IRMAA line, so there is no room to convert and stay under it. Nothing is priced for this target; pick a bracket or a set amount.'
    }
    const p = TARGET_PCT[form.target]
    const mp = Math.round(base.marginal * 100)
    return `Income before converting already puts the client in the ${mp}% bracket, above the top of ${p}%, so nothing is priced for this target. ${mp <= 24 ? `Pick the ${mp}% bracket or a set amount.` : 'Pick a set amount.'}`
  })()
  // The engine sets capBinds whenever the IRA balance limits the chosen amount (a set amount or a capped bracket / IRMAA target).
  const capHint = r.capBinds ? (capZero ? ZERO_CAP_NOTE : `Limited by the ${money(r.cap)} of pre-tax IRA available${r.chosenSpot ? `; reaching the target would take ${money(r.chosenSpot.full)}` : ''}.`) : null

  // The conversion stops at the IRA balance, so there is no "next $10,000" to talk about.
  const atCap = r.capBinds && r.cap != null && c >= r.cap - 0.5
  const reached = ch.bracket == null ? 'no ordinary income tax' : `ends in the ${bracketName(ch.bracket)} bracket`

  // Spot row matching a ladder row (to separate bracket sweet spots from the IRMAA line).
  const spotOf = (row) => spots.find((s) => Math.abs(s.conversion - row.conversion) < 1)

  // ---- Room before the next step (uncapped: the room figures use .full, not the cap-limited conversion) ----
  const roomTax = (amt) => taxYear(r.ctx, amt).tax - base.tax
  const irmaaAtAmount = (amt) => (r.medicare === 0 ? 0 : Math.max(0, irmaaSurcharge(magiOf(taxYear(r.ctx, amt)), r.filing).annualPerPerson * r.medicare - r.baseIrmaa))
  const bracketTax = ready && current ? roomTax(current.full) : null
  const bracketIrmaa = ready && current ? irmaaAtAmount(current.full) : 0
  const bracketPastIrmaa = !!(ready && current && r.medicare > 0 && !irmaaLine.atTop && current.full > irmaaLine.room + 0.5 && bracketIrmaa > 0.5)
  const irmaaRoomTax = ready && r.medicare > 0 && !irmaaLine.atTop && irmaaLine.room >= 1 ? roomTax(irmaaLine.room) : null
  const capLimitsRoom = !!(ready && r.cap != null && ((current && current.full > r.cap + 0.5) || (irmaaLine.room != null && irmaaLine.room > r.cap + 0.5)))
  const capRoomNote = capLimitsRoom ? (capZero ? ZERO_CAP_NOTE : `Your ${money(r.cap)} IRA balance limits what can be converted.`) : ''

  // One line naming what makes a bracket cost more than its rate, when it does (state tax is not counted as a driver).
  const driverLine = (amount, pctRate, subject) => {
    if (!ready || !(amount >= 0.5) || pctRate == null) return null
    const yy = taxYear(r.ctx, amount)
    const eff = (yy.tax - base.tax) / amount
    if (!(eff > pctRate / 100 + f.stateRate + 0.02)) return null
    const parts = []
    const gainsD = yy.fedGains - base.fedGains
    if (gainsD > 0.5) parts.push(`${money(gainsD)} more tax on gains`)
    const seniorD = base.senior - yy.senior
    if (seniorD > 0.5) parts.push(`a ${money(seniorD)} smaller senior deduction`)
    const ssD = yy.taxableSS - base.taxableSS
    if (ssD > 0.5) parts.push(`${money(ssD)} more taxable Social Security`)
    const niitD = yy.niit - base.niit
    if (niitD > 0.5) parts.push(`${money(niitD)} of net investment income tax`)
    if (!parts.length) return null
    return `${subject} costs ${pct1(eff)} on the conversion, above the ${pctRate}% bracket rate${stateNote ? ' plus state tax' : ''}, because it also causes ${listJoin(parts)}.`
  }
  const chosenDriver = converting && ch.bracket != null ? driverLine(c, Math.round(ch.bracket * 100), `Converting ${money(c)}`) : null
  const currentDriver = current ? driverLine(current.full, current.pct, `Filling the ${current.pct}% bracket`) : null
  const driverText = chosenDriver || currentDriver || ''
  const roomExtra = [capRoomNote, driverText].filter(Boolean).join(' ')

  // The largest conversion that still leaves ordinary taxable income at zero (deductions that exceed income before converting
  // absorb the first dollars). A conversion also pulls Social Security into tax and can shrink the senior deduction, so the
  // gap is found by bisection on the real tax function rather than as deductions minus income.
  const zeroTaxableX = (() => {
    if (!ready || base.ordinaryTaxable > 0.005) return 0
    let lo = 0
    let hi = base.deduction + base.senior + 1
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2
      if (taxYear(r.ctx, mid).ordinaryTaxable <= 0.005) lo = mid
      else hi = mid
    }
    return lo
  })()
  const gapSentence = zeroTaxableX > 0.5 ? `The first ${money(Math.floor(zeroTaxableX))} of any conversion adds no ordinary taxable income: unused deductions absorb it${f.ss > 0 ? ', including the Social Security it makes taxable' : ''}.` : ''

  const withheldText = under60 && converting && ch.addedTax > 0.5
    ? `Tax withheld from the conversion is itself a distribution; ${owner59.toLowerCase().replace('if the ira owner', 'if the IRA owner')} it adds a 10% additional tax (about ${money(ch.addedTax * 0.1)}). Paying the tax from outside funds avoids it.`
    : ''

  // ---- Shared copy: headline, tiles, callouts, narrative, note, assumptions ----
  const featureLabel = converting ? `Tax on converting ${money(c)} this year` : ready ? 'Tax on a conversion this year' : prompt
  const featureValue = converting ? money(ch.addedTax) : 'Not priced'
  const featureNote = converting
    ? `${pct1(ch.effectiveRate)} on the conversion · ${reached}${atCap ? '' : ` · the next ${money(LADDER_STEP)} costs ${pct0(ch.nextRate)}`}`
    : capZero && ready
      ? 'Nothing can be converted: the pre-tax IRA balance entered is $0'
      : targetIssue
        ? bracketIssue
          ? 'This target is below the client’s current bracket; choose a higher target or an amount.'
          : 'This target is not available for this client; choose another target or an amount.'
        : ready
          ? 'Choose a target or enter an amount to price a conversion'
          : 'The estimate prices a conversion against the income you enter'

  const netNote = converting ? `if the tax is withheld · the full ${money(c)} if paid from outside funds` : 'nothing converted'
  const irmaaTile = ready
    ? r.medicare === 0
      ? { label: `IRMAA in ${IRMAA_YEAR}`, value: 'None', note: `no one on Medicare by ${IRMAA_YEAR}` }
      : ch.irmaaAdded > 0
        ? { label: `IRMAA in ${IRMAA_YEAR}`, value: `+${money(ch.irmaaAdded)}`, tone: 'bad', note: `${irmaaPeriod} · MAGI ${money(magiOf(y))}` }
        : { label: `IRMAA in ${IRMAA_YEAR}`, value: 'None added', tone: 'good', note: irmaaLine.atTop ? 'already in the top tier' : r.baseIrmaa > 0 ? `${money(r.baseIrmaa)} a year already; no step up` : `stays under the IRMAA line, ${irmaaLimitText}` }
    : { label: `IRMAA in ${IRMAA_YEAR}`, value: 'n/a', note: age <= 0 ? 'enter the client’s age' : 'enter this year’s income' }
  const tilesBase = ready
    ? [
        { label: 'Converting', value: money(c), note: r.capBinds ? (capZero ? 'the IRA balance entered is $0' : 'limited by the IRA balance available') : r.chosenSpot ? r.chosenSpot.short.toLowerCase() : targetIssue ? 'target not available' : converting ? 'set amount' : 'no amount entered' },
        { label: 'Tax added', value: money(ch.addedTax), note: `${money(ch.addedFed)} federal${ch.addedNiit > 0.5 ? ` (incl. ${money(ch.addedNiit)} NIIT)` : ''}${stateNote ? ` + ${money(ch.addedState)} ${st.code}` : ' · no state tax'}` },
        { label: 'Net into the Roth', value: money(ch.netIfWithheld), note: netNote },
        irmaaTile,
      ]
    : [
        { label: 'Converting', value: 'n/a', note: 'no client details entered' },
        { label: 'Tax added', value: 'n/a', note: 'no client details entered' },
        { label: 'Net into the Roth', value: 'n/a', note: 'nothing converted' },
        irmaaTile,
      ]
  // The tile flags the 10% additional tax in a few words; the full sentence sits under the tiles on screen and in the printed summary.
  const tiles = tilesBase.map((t) => (t.label === 'Net into the Roth' && withheldText ? { ...t, note: `${t.note} · ${under60All ? 'before 59½' : 'if the IRA owner is under 59½'} the withheld tax adds a 10% additional tax (about ${money(ch.addedTax * 0.1)})` } : t))

  // Sentences of the summary. `rank` > 0 marks optional detail: the printed page 1 has a fixed text budget shared by all of its
  // prose (see p1 below) and drops the highest rank first, moving what it drops to page 2 ("Also worth knowing"), so page 1 always
  // keeps its footer and nothing is lost from the printout. The screen shows every sentence.
  const narrativeParts = (() => {
    const one = (text) => [{ text, rank: 0 }]
    if (!ready) return one('Enter the client’s age and this year’s projected income. The estimate prices a conversion against that income, with Social Security taxation, the senior deduction, gains, state tax and IRMAA included, and shows what each amount costs before December 31.')
    const baseSentence = `Before converting, this year’s income leaves taxable income at ${money(base.taxable)} and total tax at ${money(base.tax)}${base.ordinaryTaxable > 0.5 ? `, with the top dollar in the ${bracketName(base.marginal)} bracket` : ''}.`
    const room = current
      ? `There is ${money(current.full)} of room left in the ${current.pct}% bracket.`
      : `The client is already in the top bracket, so every converted dollar is taxed at ${bracketName(base.marginal)} federal.`
    const capRoomSentence = capLimitsRoom && !r.capBinds ? capRoomNote : ''
    if (!converting) {
      return [
        { text: baseSentence, rank: 0 },
        { text: capZero ? ZERO_CAP_NOTE : targetIssue || (form.target === 'amount' ? 'No amount has been entered, so nothing is priced yet.' : 'No conversion is priced at this target.'), rank: 0 },
        ...(current || !targetIssue ? [{ text: room, rank: 0 }] : []),
        { text: gapSentence, rank: 4 },
        { text: capRoomSentence, rank: 2 },
        ...(r.medicare > 0 && irmaaLine.room != null && irmaaLine.room >= 1 && !irmaaLine.atTop ? [{ text: `Premiums in ${IRMAA_YEAR} stay at the current IRMAA tier up to ${money(irmaaLine.room)} of conversion.`, rank: 3, dup: true }] : []),
      ].filter((x) => x.text)
    }
    const ssSentence = f.ss > 0 && y.taxableSS > base.taxableSS + 0.5
      ? `It also pulls more Social Security into tax: ${money(base.taxableSS)} (${pct0(baseSSPct)} of the benefits) becomes ${money(y.taxableSS)} (${pct0(ch.taxableSSPct)}).`
      : ''
    const seniorSentence = y.senior < base.senior - 0.5 ? `The senior deduction shrinks from ${money(base.senior)} to ${money(y.senior)}.` : ''
    const gainsExtra = y.fedGains - base.fedGains
    const gainsSentence = f.ltcg > 0 && gainsExtra > 0.5 ? `Conversion income stacks beneath the gains, so ${money(gainsExtra)} of the added federal tax falls on the gains themselves.` : ''
    const niitSentence = ch.addedNiit > 0.5 ? `${money(ch.addedNiit)} of the added tax is the 3.8% net investment income tax.` : ''
    const why = listJoin(nextDrivers)
    const nextSentence = atCap ? '' : `The next ${money(LADDER_STEP)} would cost ${pct0(ch.nextRate)}${why ? `, because ${why}` : ''}. That is the rate at the margin, against ${pct1(ch.effectiveRate)} on average.`
    const irmaaSentence = r.medicare === 0
      ? `No one is on Medicare by ${IRMAA_YEAR}, so IRMAA is not a factor.`
      : ch.irmaaAdded > 0
        ? `Because the conversion lifts MAGI to ${money(magiOf(y))}, Medicare premiums in ${IRMAA_YEAR} rise by about ${money(ch.irmaaAdded)} a year${partialMedicare === 0 ? '' : partialMedicare === r.medicare ? ' once on Medicare (the first year is partial)' : ' (one spouse’s first year is partial)'}.`
        : irmaaLine.atTop
          ? 'MAGI is already in the top IRMAA tier, so converting adds no further surcharge.'
          : `The conversion stays under the IRMAA line (${irmaaLimitText}), so, on the ${TAX_YEAR} schedule, ${IRMAA_YEAR} premiums would not step up.`
    const capSentence = r.capBinds ? `The ${money(r.cap)} of pre-tax IRA available is the limit${r.chosenSpot ? `; reaching the target would take ${money(r.chosenSpot.full)}` : ''}.` : capRoomSentence
    return [
      { text: `Converting ${money(c)} before December 31 adds ${money(ch.addedTax)} of ${stateNote ? `tax (${money(ch.addedFed)} federal and ${money(ch.addedState)} ${st.name})` : 'federal tax'}, an effective ${pct1(ch.effectiveRate)} on the converted dollars.`, rank: 0 },
      { text: gapSentence, rank: 4 },
      { text: `It lifts taxable income from ${money(base.taxable)} to ${money(y.taxable)}${ch.bracket != null ? ` and ${reached}` : ''}.`, rank: 7, dup: true },
      { text: ssSentence, rank: 5, dup: true },
      { text: seniorSentence, rank: 6, dup: true },
      { text: gainsSentence, rank: 4 },
      { text: niitSentence, rank: 5, dup: true },
      // The printed page keeps the short core of these two and ranks the explanation as optional detail.
      { text: nextSentence, rank: 0, print: atCap ? null : [{ text: `The next ${money(LADDER_STEP)} would cost ${pct0(ch.nextRate)} at the margin, against ${pct1(ch.effectiveRate)} on average.`, rank: 0 }, { text: why ? `That is because ${why}.` : '', bullet: `The next ${money(LADDER_STEP)} costs ${pct0(ch.nextRate)} at the margin because ${why}.`, rank: 2 }] },
      { text: irmaaSentence, rank: 0, print: ch.irmaaAdded > 0 ? [{ text: `Because the conversion lifts MAGI to ${money(magiOf(y))}, Medicare premiums in ${IRMAA_YEAR} rise by about ${money(ch.irmaaAdded)} a year.`, rank: 0 }, { text: partialMedicare > 0 ? `Anyone who turns 65 during ${IRMAA_YEAR} pays for only part of that year, so the first year is partial.` : '', rank: 3 }] : null },
      { text: capSentence, rank: 1 },
    ].filter((x) => x.text)
  })()
  const narrative = narrativeParts.map((x) => x.text).join(' ')

  const noteText = `The rate on the conversion is the average; the next-${money(LADDER_STEP)} column is what the last dollars cost, and it runs above the bracket rate wherever conversion income makes more Social Security taxable, shrinks the senior deduction, moves gains into a higher rate or starts the net investment income tax. A conversion cannot be recharacterized (since 2018), so the tax is owed once it is done. Paying the tax from outside funds keeps the whole conversion in the Roth; tax withheld from the conversion is itself a distribution (10% additional tax before 59½). The added tax also moves the estimated-payment and withholding position.`

  const assumptions = [
    `${TAX_YEAR} federal brackets, standard deduction and gain breakpoints. Income is the whole-year projection, taxed in ${TAX_YEAR}; ages are at December 31.`,
    `Senior deduction: $${SENIOR_DEDUCTION.amount.toLocaleString('en-US')} per person 65 or older, reduced ${Math.round(SENIOR_DEDUCTION.phaseRate * 100)}% of MAGI over $${SENIOR_DEDUCTION.phaseStart.single.toLocaleString('en-US')} single / $${SENIOR_DEDUCTION.phaseStart.married.toLocaleString('en-US')} joint, through ${SENIOR_DEDUCTION.lastYear}. The phase-out is per person, so a joint couple of two seniors loses it at $250,000 of MAGI.`,
    `Additional standard deduction for each person 65 or older: ${money(ADDITIONAL_STANDARD.married)} each married filing jointly, ${money(ADDITIONAL_STANDARD.single)} single. Itemized deductions replace the whole standard deduction when larger (no SALT cap or other limits). State tax applies the state’s top marginal rate (or the rate entered) flat to federal taxable income, including taxable Social Security, which most states exempt. It ignores state brackets and retirement-income exclusions, so it is a ceiling for most retirees.`,
    'Social Security is taxed by the provisional-income test (up to 85%), and gains stack on ordinary income at 0%, 15% and 20%; both are recomputed at every conversion amount. The 3.8% net investment income tax is modeled above $200,000 single / $250,000 joint of MAGI, on the gains line or the amount entered. Tax-exempt interest counts toward Social Security taxation and IRMAA, not AGI.',
    `IRMAA uses the 2026 Part B and D schedule at the CMS tier boundaries (the top tier starts at $500,000 single / $750,000 joint), with MAGI as AGI plus tax-exempt interest. Premiums in ${IRMAA_YEAR} are set by this year’s income and ${IRMAA_YEAR + 1} premiums use ${TAX_YEAR + 1} income; the ${IRMAA_YEAR} thresholds will be indexed, so the lines shown are conservative, and premium dollars in ${IRMAA_YEAR} will likely be higher than the 2026 schedule shown. People who turn 65 during ${IRMAA_YEAR} pay for part of that year, so the figure is an upper bound for them; nobody under 63 is counted.`,
    'Not modeled: alternative minimum tax, the QBI deduction, marketplace premium subsidies, Medicare effects beyond IRMAA, state-specific rules and after-tax basis (Form 8606). The converted amount is treated as fully taxable; with basis, part of every conversion is tax-free.',
    'Planning estimate to be confirmed in the preparer’s tax software before any conversion. Baseline model. Not reviewed by Grott Luker & Co.',
  ]

  // "Where the income sits": one set of rows for the screen list and the printed table.
  const ssText = (v, pct) => (f.ss > 0 ? `${money(v)} (${pct0(pct)})` : 'None')
  const NIIT_LABEL = 'Includes net investment income tax'
  const sitRowsLive = [
    ['Ordinary income', money(base.ordinary), money(y.ordinary), signed(y.ordinary - base.ordinary)],
    ...(f.ss > 0 ? [['Taxable Social Security', ssText(base.taxableSS, baseSSPct), ssText(y.taxableSS, ch.taxableSSPct), signed(y.taxableSS - base.taxableSS)]] : []),
    ['Adjusted gross income', money(base.agi), money(y.agi), signed(y.agi - base.agi)],
    [`Deductions used (${dedLabel})`, money(base.deduction + base.senior), money(y.deduction + y.senior), signed(y.deduction + y.senior - base.deduction - base.senior)],
    ['Taxable income', money(base.taxable), money(y.taxable), signed(y.taxable - base.taxable)],
    ...(stateNote ? [['Federal tax', money(base.fedTax), money(y.fedTax), signed(ch.addedFed)]] : []),
    ...(niitShown ? [[NIIT_LABEL, money(base.niit), money(y.niit), signed(y.niit - base.niit)]] : []),
    ...(stateNote ? [[`${st.name} tax`, money(base.stateTax), money(y.stateTax), signed(ch.addedState)]] : []),
    ['Total tax', money(base.tax), money(y.tax), signed(ch.addedTax)],
  ]
  // Until the client's age and income are in there is nothing to show: every cell reads n/a, not a $0 row or a default deduction.
  const sitRows = ready ? sitRowsLive : sitRowsLive.map((row) => [row[0].startsWith('Deductions used') ? 'Deductions used' : row[0], 'n/a', 'n/a', 'n/a'])
  const totalRowIndex = sitRows.length - 1
  const subRowLabels = new Set(['Federal tax', NIIT_LABEL, `${st.name} tax`])

  // Ladder cells, shared by the screen table and the printed table.
  const ladderHead = ['Convert', 'Tax added', 'Rate on the conversion', 'Bracket reached', `Cost of the next ${money(LADDER_STEP)}`, 'IRMAA added']
  // When the IRA balance caps several targets at the same amount, say so once instead of listing each target.
  const cappedNames = new Set(spots.filter((x) => x.capped).map((x) => x.short))
  const chosenTag = r.target === 'amount' ? 'Your amount' : 'Selected'
  const ladderTag = (row) => {
    const hitCap = row.labels.some((l) => cappedNames.has(l))
    const names = [...row.labels.filter((l) => l !== 'Your amount' && !cappedNames.has(l)), ...(hitCap ? ['IRA balance limit'] : [])]
    const parts = []
    if (names.length) parts.push(names.join(' · '))
    if (row.isChosen) parts.push(names.length ? chosenTag.toLowerCase() : chosenTag)
    return parts.join(' · ')
  }
  const ladderCells = (row) => [
    row.conversion,
    money(row.addedTax),
    pct1(row.effectiveRate),
    row.bracket == null ? 'None' : bracketName(row.bracket),
    r.cap != null && row.conversion >= r.cap - 0.5 ? 'n/a' : pct0(row.nextRate),
    r.medicare === 0 ? 'n/a' : row.irmaaAdded > 0 ? `+${money(row.irmaaAdded)}/yr` : 'None',
  ]
  const illus = (t) => (ready ? t : `Illustration only: ${t.charAt(0).toLowerCase()}${t.slice(1)}`)
  const ladderTitle = illus('What each amount costs')
  const ladderNote = ready ? `rate is on the whole conversion; next ${money(LADDER_STEP)} is the cost at the margin · chosen amount shaded` : 'illustration only, no client details entered'

  // Chart: tax added at the sweet spots (up to the 24% bracket and the IRMAA line) and at the chosen amount.
  // With fewer than three of those (the client is past most brackets, or the IRA balance caps them) it charts a
  // sample of the ladder amounts instead, so the picture is never one lonely bar. When the chosen bar dwarfs the rest
  // (more than 5x the next largest), it charts the rate on the conversion instead of dollars; when every rate shown is
  // within a point of the others it says so in one sentence instead of drawing flat bars.
  const sweetRows = ladder.filter((row) => {
    if (row.isChosen) return converting
    const s = row.isSpot ? spotOf(row) : null
    return s && (s.pct == null || s.pct <= 24)
  })
  const sweetChart = sweetRows.length >= 3
  const sampleStep = Math.max(1, Math.ceil(ladder.length / 5))
  const chartRows = sweetChart ? sweetRows : ladder.filter((row, i) => i % sampleStep === 0 || row.isChosen)
  const taxBar = (row) => Math.max(0, row.addedTax)
  const chosenChartRow = chartRows.find((row) => row.isChosen)
  const dominated = !!(converting && chosenChartRow && chartRows.length >= 2 && taxBar(chosenChartRow) > 5 * Math.max(0, ...chartRows.filter((row) => !row.isChosen).map(taxBar)))
  // Every label is exactly two lines (a tag of at most 11 characters, possibly empty, then the amount) so the bars share one baseline.
  const chartTag = (row) => {
    if (row.isChosen) return chosenTag
    if (row.labels.some((l) => cappedNames.has(l))) return 'IRA limit'
    const l = row.labels.find((x) => x !== 'Your amount')
    return l ? l.replace('Up to the IRMAA line', 'IRMAA line') : ''
  }
  const barOf = (row) => ({
    label: `${chartTag(row)}${NL}${money(row.conversion)}`,
    bars: [dominated
      ? { label: 'Rate on the conversion', value: row.effectiveRate * 100, color: row.isChosen ? TONE.navy : TONE.accent }
      : { label: 'Tax added', value: taxBar(row), color: row.isChosen ? TONE.navy : TONE.accent }],
  })
  const chartGroups = chartRows.map((row) => barOf(row))
  const oneBar = chartGroups.length === 1
  const chartMetric = dominated ? 'Rate on the conversion' : 'Tax added'
  const chartTitle = illus(oneBar ? 'The one amount that can be priced' : sweetChart ? `${chartMetric} at each bracket top and the IRMAA line` : `${chartMetric} at each amount`)
  const chartFormat = dominated ? (v) => percent(v, 1) : undefined
  const chartNote = !ready ? 'illustration only, no client details entered' : oneBar ? 'a single priced amount' : sweetChart ? (converting ? 'the chosen amount is the dark bar' : 'bracket tops and the IRMAA line') : converting ? 'a sample of the ladder; the chosen amount is the dark bar' : 'a sample of the ladder amounts'
  const oneBarText = oneBar ? `Only one amount can be priced for this client: converting ${money(chartRows[0].conversion)} adds ${money(chartRows[0].addedTax)} of tax, ${pct1(chartRows[0].effectiveRate)} on the conversion, so there is nothing to compare in a chart.` : ''
  const noChartText = capZero ? ZERO_CAP_NOTE : 'Nothing to chart: no amounts could be priced for this client.'


  // Callouts: the room before the next step (screen callouts and printed rows share these).
  const bracketRoom = ready
    ? current
      ? {
          label: `Conversion that fills the ${current.pct}% bracket`,
          value: money(current.full),
          rightLabel: 'Tax at that amount',
          tax: money(bracketTax),
          rate: current.full > 0 ? pct1(bracketTax / current.full) : '',
          irmaaAdds: bracketPastIrmaa ? `adds ${money(bracketIrmaa)} a year of IRMAA in ${IRMAA_YEAR}` : null,
          tone: bracketPastIrmaa ? 'warn' : 'info',
        }
      : { label: 'No bracket room left: the client is already in the top bracket, so each converted dollar is taxed at the top rate', value: 'None', tone: 'warn' }
    : null
  const irmaaRoom = (() => {
    if (!ready) return null
    if (r.medicare === 0) return { label: `IRMAA line: no one is on Medicare by ${IRMAA_YEAR}, so this year’s income cannot set a surcharge`, value: 'Not a factor', tone: 'info' }
    if (irmaaLine.atTop) return { label: `IRMAA line: already in the top tier, so converting adds no surcharge (${money(irmaaLine.baseAnnual)} a year already)`, value: 'At the top', tone: 'warn' }
    if (irmaaLine.room < 1) return { label: `IRMAA line: MAGI already sits at the line (${irmaaLimitText}), so any conversion steps premiums up by ${money(irmaaLine.stepUp)} a year in ${IRMAA_YEAR}`, value: '$0', tone: 'warn' }
    return {
      label: `Conversion that stays under the IRMAA line (${irmaaLimitText})`,
      sub: `Above it, premiums rise ${money(irmaaLine.stepUp)} a year in ${IRMAA_YEAR}`,
      value: money(irmaaLine.room),
      rightLabel: 'Tax at that amount',
      tax: money(irmaaRoomTax),
      tone: 'info',
    }
  })()
  const acaOn = ready && under65

  // ---- Steps (Show the math) ----
  // An effect is listed only where it is live: the conversion really moves it (priced amount) or the next $10,000 really moves it (margin).
  const effectsList = [
    f.ss > 0 && y.taxableSS > base.taxableSS + 0.5 ? 'the extra Social Security that becomes taxable' : '',
    y.senior < base.senior - 0.5 ? 'the senior-deduction phase-out' : '',
    y.fedGains > base.fedGains + 0.5 ? 'the added tax on gains' : '',
    y.niit > base.niit + 0.5 ? 'the net investment income tax' : '',
  ].filter(Boolean)
  const marginEffects = [
    nextY.taxableSS > y.taxableSS + 0.5 ? 'Social Security taxation' : '',
    nextY.senior < y.senior - 0.5 ? 'the senior phase-out' : '',
    nextY.fedGains > y.fedGains + 0.5 ? 'tax on gains' : '',
    nextY.niit > y.niit + 0.5 ? 'the net investment income tax' : '',
  ].filter(Boolean)
  const steps = [
    { label: 'The client', formula: `${r.married ? 'married filing jointly' : 'single'}, age${r.married ? 's' : ''} ${agesText} on December 31, ${TAX_YEAR}; ${seniorsText} (senior deduction); ${r.medicare} on Medicare by ${IRMAA_YEAR}`, result: r.married ? 'MFJ' : 'Single' },
    { label: 'Ordinary income before converting', formula: `wages ${money(f.wages, 2)} + pension ${money(f.pension, 2)} + other ordinary ${money(f.otherOrdinary, 2)}`, result: money(f.wages + f.pension + f.otherOrdinary, 2) },
    { label: 'Taxable Social Security before converting', formula: f.ss > 0 ? `provisional income test on ${money(f.ss, 2)} of benefits and ${money(f.wages + f.pension + f.otherOrdinary + f.ltcg, 2)} of other income${r.taxExempt > 0 ? ` plus ${money(r.taxExempt, 2)} of tax-exempt interest` : ''}` : 'no Social Security entered', result: money(base.taxableSS, 2) },
    { label: 'AGI before converting', formula: `ordinary ${money(base.ordinary, 2)} + taxable SS ${money(base.taxableSS, 2)} + gains ${money(f.ltcg, 2)}${r.taxExempt > 0 ? ' (tax-exempt interest is not in AGI)' : ''}`, result: money(base.agi, 2) },
    { label: 'Deductions', formula: `${itemizedUsed ? `itemized ${money(f.itemized, 2)}` : `standard ${money(r.stdBase, 2)}${r.aged > 0 ? ` + ${r.aged} × ${money(ADDITIONAL_STANDARD[r.filing], 2)} for age 65 or older` : ''}`}${r.seniors > 0 ? ` + senior deduction ${money(base.senior, 2)} (before converting)` : ''}`, result: money(base.deduction + base.senior, 2) },
    ...(zeroTaxableX > 0.5 ? [{ label: 'Conversion covered by unused deductions', formula: `largest conversion that still leaves ordinary taxable income at $0, counting the Social Security that becomes taxable${r.seniors > 0 ? ' and any senior-deduction phase-out' : ''} as the conversion grows (deductions ${money(base.deduction + base.senior, 2)} against ${money(base.ordinary + base.taxableSS, 2)} of ordinary income and taxable Social Security before converting)`, result: money(zeroTaxableX, 2) }] : []),
    { label: 'Tax before converting', formula: `ordinary taxable ${money(base.ordinaryTaxable, 2)} → federal ${money(base.fedOrdinary, 2)}${f.ltcg > 0 ? ` + gains tax ${money(base.fedGains, 2)}` : ''}${base.niit > 0.5 ? ` + net investment income tax ${money(base.niit, 2)}` : ''}${stateNote ? ` + ${st.name} ${money(base.stateTax, 2)} (${pct1(f.stateRate)} of taxable ${money(base.taxable, 2)})` : ''}`, result: money(base.tax, 2) },
    {
      label: 'Conversion priced',
      formula: r.chosenSpot
        ? `${r.chosenSpot.label}: solved exactly so ${r.chosenSpot.id === 'irmaa' ? `AGI reaches ${money(r.chosenSpot.top, 2)}` : `ordinary taxable income reaches ${money(r.chosenSpot.top, 2)}`}${effectsList.length ? `, counting ${listJoin(effectsList)} the conversion causes` : ''}${r.capBinds ? `; limited to the ${money(r.cap, 2)} available` : ''}`
        : form.target === 'amount' || !ready ? `amount entered${r.capBinds ? `, limited to the ${money(r.cap, 2)} available` : ''}` : 'target not available for this client, so nothing is converted',
      result: money(c, 2),
    },
    { label: 'Income after converting', formula: `ordinary ${money(y.ordinary, 2)} + taxable SS ${money(y.taxableSS, 2)} + gains ${money(f.ltcg, 2)} = AGI ${money(y.agi, 2)}; − deductions ${money(y.deduction + y.senior, 2)}`, result: `taxable ${money(y.taxable, 2)}` },
    { label: 'Tax after converting', formula: `federal ${money(y.fedTax, 2)}${y.niit > 0.5 ? ` (includes net investment income tax ${money(y.niit, 2)})` : ''}${stateNote ? ` + ${st.name} ${money(y.stateTax, 2)}` : ''}`, result: money(y.tax, 2) },
    { label: 'Tax added by the conversion', formula: `${money(y.tax, 2)} − ${money(base.tax, 2)} (federal ${money(ch.addedFed, 2)}${stateNote ? ` + state ${money(ch.addedState, 2)}` : ''})`, result: money(ch.addedTax, 2) },
    { label: 'Rate on the conversion', formula: converting ? `${money(ch.addedTax, 2)} ÷ ${money(c, 2)}` : 'nothing converted', result: converting ? pct1(ch.effectiveRate) : 'n/a' },
    { label: `Cost of the next ${money(LADDER_STEP)}`, formula: atCap ? 'nothing more can be converted: the IRA balance limit is reached' : `(tax at ${money(c + LADDER_STEP)} − tax at ${money(c)}) ÷ ${money(LADDER_STEP)}${marginEffects.length ? `, with ${listJoin(marginEffects)} recomputed` : ''}`, result: atCap ? 'n/a' : pct1(ch.nextRate) },
    { label: 'Net into the Roth', formula: `${money(c, 2)} − tax withheld from the conversion ${money(ch.addedTax, 2)}`, result: money(ch.netIfWithheld, 2), note: `If the tax is paid from outside funds the full conversion reaches the Roth.${withheldText ? ` ${withheldText}` : ''}` },
    { label: `IRMAA in ${IRMAA_YEAR}`, formula: r.medicare === 0 ? `no one on Medicare by ${IRMAA_YEAR}` : `surcharge at MAGI ${money(magiOf(y), 2)} (${money(ch.irmaaAnnual, 2)} a year) − surcharge at ${money(magiOf(base), 2)} (${money(r.baseIrmaa, 2)} a year), ${r.medicare} on Medicare${r.taxExempt > 0 ? '; MAGI is AGI plus tax-exempt interest' : ''}`, result: r.medicare === 0 ? 'None' : money(ch.irmaaAdded, 2), ...(partialMedicare > 0 ? { note: `A person who turns 65 during ${IRMAA_YEAR} pays for part of that year, so this is an upper bound for them.` } : {}) },
    { label: 'Conversion that fills the current bracket', formula: current ? `conversion that takes ordinary taxable income from ${money(base.ordinaryTaxable, 2)} to the top of the ${current.pct}% bracket (${money(current.top, 2)}), before any IRA balance limit` : 'the client is already in the top bracket', result: current ? money(current.full, 2) : 'none' },
    ...(current ? [{ label: 'Tax on that bracket room', formula: `tax at a ${money(current.full, 2)} conversion − tax before converting ${money(base.tax, 2)}`, result: money(roomTax(current.full), 2) }] : []),
    ...(r.medicare > 0 && !irmaaLine.atTop ? [{ label: 'Conversion that stays under the IRMAA line', formula: `conversion that takes MAGI from ${money(magiOf(base), 2)} to ${money(irmaaLine.limit, 2)}, before any IRA balance limit`, result: money(irmaaLine.room, 2) }] : []),
  ]

  // ---- Print report ----
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const targetLabel = form.target === 'amount' ? 'Set amount' : (TARGETS.find((t) => t.value === form.target) || {}).label
  const inMoney = (k) => (entered(form[k]) ? money(nz(form[k])) : ready ? money(0) : 'Not entered')
  const inputs = [
    ['Filing status', filingLabel],
    ['Age at Dec 31', age > 0 ? String(age) : 'Not entered'],
    ...(married ? [['Spouse age at Dec 31', f.spouseAge > 0 ? String(f.spouseAge) : age > 0 ? `${age} (same)` : 'Not entered']] : []),
    ['Wages', inMoney('wages')],
    ['Pension', inMoney('pension')],
    ['Other ordinary', inMoney('otherOrdinary')],
    ['Social Security', inMoney('ss')],
    ['LT gains, dividends', inMoney('ltcg')],
    ['Tax-exempt interest', inMoney('taxExempt')],
    ['NII (Form 8960)', f.nii > 0 ? money(f.nii) : ready ? 'Gains line' : 'Not entered'],
    ['Deductions', (() => { const v = itemizedUsed ? money(f.itemized) : money(r.std); return v.length > 10 ? v : `${itemizedUsed ? 'Itemized' : 'Standard'} ${v}` })()],
    ['State', `${st.code}, ${pct1(f.stateRate)} ${entered(form.stateRate) ? 'entered' : 'top rate'}`],
    ['Pre-tax IRA', f.cap != null ? money(f.cap) : 'No limit entered'],
    ['Target', ready ? targetLabel : 'Not entered'],
    ...(!ready || form.target === 'amount' ? [['Amount', ready ? money(nz(form.amount)) : 'Not entered']] : []),
  ]
  // Print forms of the room rows: one line each (the long wording stays on screen).
  const roomRows = ready
    ? [
        ...(current
          ? [
              { label: `Conversion that fills the ${current.pct}% bracket (tax on it ${bracketRoom.tax}, ${bracketRoom.rate})`, value: bracketRoom.value },
              ...(bracketRoom.irmaaAdds ? [{ label: `Past the IRMAA line: ${bracketRoom.irmaaAdds}`, value: '', sub: true }] : []),
            ]
          : [{ label: 'No bracket room left: already in the top bracket, taxed at the top rate', value: 'None' }]),
        r.medicare === 0
          ? { label: `IRMAA line: not a factor, no one is on Medicare by ${IRMAA_YEAR}`, value: 'Not a factor' }
          : irmaaLine.atTop
            ? { label: 'IRMAA line: already in the top tier, so converting adds no surcharge', value: 'At the top' }
            : irmaaLine.room < 1
              ? { label: `IRMAA line: MAGI already at ${money(irmaaLine.limit)}; any conversion adds ${money(irmaaLine.stepUp)} a year`, value: '$0' }
              : { label: `Conversion that stays under the IRMAA line (${irmaaLimitText}); tax ${irmaaRoom.tax}`, value: irmaaRoom.value },
      ]
    : [{ label: `${prompt}; the room before the next bracket and the IRMAA line appears once it is in.`, value: '' }]

  // Print tiles: every note at most two lines (the IRMAA note has its own short form).
  const spotWords = (sp) => (sp.id === 'irmaa' ? 'up to the IRMAA line' : sp.short.toLowerCase())
  const irmaaPrintNote = (() => {
    if (r.medicare === 0) return `no one on Medicare by ${IRMAA_YEAR}`
    if (ch.irmaaAdded > 0) return `a year${partialMedicare > 0 ? ', first year partial' : ''} · MAGI ${money(magiOf(y))}`
    if (irmaaLine.atTop) return 'already in the top tier'
    return r.baseIrmaa > 0 ? `${money(r.baseIrmaa)} a year already; no step up` : `under the IRMAA line, ${irmaaLimitText}`
  })()
  const printTiles = ready
    ? [
        { label: 'Converting', value: money(c), note: r.capBinds ? (capZero ? 'IRA balance entered is $0' : 'limited by the IRA balance') : r.chosenSpot ? spotWords(r.chosenSpot) : targetIssue ? 'target not available' : converting ? 'set amount' : 'no amount entered' },
        { label: 'Tax added', value: money(ch.addedTax), note: `${money(ch.addedFed)} federal${ch.addedNiit > 0.5 ? ' incl. NIIT' : ''}${stateNote ? ` + ${money(ch.addedState)} ${st.code}` : ' · no state tax'}` },
        { label: 'Net into the Roth', value: money(ch.netIfWithheld), note: converting ? `tax withheld; ${money(c)} if paid outside` : 'nothing converted' },
        { label: irmaaTile.label, value: irmaaTile.value, note: irmaaPrintNote },
      ]
    : tilesBase.map((t) => ({ label: t.label, value: t.value, note: t.note }))

  // Page 1 has a fixed text budget shared by ALL of its optional prose (narrative sentences, the 10% additional-tax sentence,
  // the driver sentence, the ACA text, the gap sentence, the cap sentence): at most P1_LINES printed lines (about 108 characters
  // each, a conservative width). The highest-ranked (least important) block is dropped until it fits and goes to page 2 under
  // "Reading the result" ("Also worth knowing"). A block flagged `dup` repeats figures that the page-2 table already shows
  // (taxable income, Social Security, deductions, NIIT), so it is simply not repeated.
  const P1_LINES = 5
  const p1 = (() => {
    let keep = [
      ...narrativeParts.flatMap((x) => (x.print || [{ text: x.text, rank: x.rank, dup: x.dup }]).map((p) => ({ ...p, slot: 'sum' }))).filter((x) => x.text),
      ...(withheldText ? [{ text: withheldText, rank: 1, slot: 'sum' }] : []),
      ...(driverText ? [{ text: driverText, rank: 2, slot: 'room' }] : []),
      ...(acaOn ? [{ text: ACA_TEXT, rank: 3, slot: 'room' }] : []),
    ].map((x, i) => ({ ...x, i }))
    const dropped = []
    const lines = () => ['sum', 'room'].reduce((n, slot) => {
      const len = keep.filter((x) => x.slot === slot).reduce((m, x) => m + x.text.length + 1, 0)
      return n + (len ? Math.ceil(len / 108) : 0)
    }, 0)
    while (lines() > P1_LINES && keep.some((x) => x.rank > 0)) {
      const worst = Math.max(...keep.map((x) => x.rank))
      let k = -1
      keep.forEach((x, j) => { if (x.rank === worst) k = j })
      dropped.push(keep[k])
      keep = keep.filter((_, j) => j !== k)
    }
    return {
      sum: keep.filter((x) => x.slot === 'sum').map((x) => x.text).join(' '),
      room: keep.filter((x) => x.slot === 'room').map((x) => x.text).join(' '),
      also: dropped.filter((x) => !x.dup).sort((a, b) => a.i - b.i).map((x) => x.bullet || x.text),
    }
  })()
  const printAssumptions = assumptions
  // Page 2 gives up ladder rows (plain round amounts first), then tightens its tables, to make room for what page 1 dropped.
  const alsoLines = p1.also.reduce((n, t) => n + Math.ceil(t.length / 115), 0) + (p1.also.length ? 1 : 0)
  const ladderMax = Math.max(5, 8 - alsoLines)
  const tight = alsoLines > 2 ? ' oy-tight' : ''
  // The printed ladder keeps every sweet spot and the chosen amount, and thins the plain round amounts so page 2 keeps its footer.
  const printLadder = (() => {
    const list = [...ladder]
    while (list.length > ladderMax) {
      let drop = -1
      let best = Infinity
      list.forEach((row, k) => {
        if (row.isChosen || row.isSpot) return
        const gap = Math.min(k > 0 ? row.conversion - list[k - 1].conversion : Infinity, k < list.length - 1 ? list[k + 1].conversion - row.conversion : Infinity)
        if (gap < best) { best = gap; drop = k }
      })
      if (drop < 0) {
        // Only the sweet spots and the chosen amount are left: the 32% and 35% bracket tops go first (they stay on screen).
        list.forEach((row, k) => {
          const sp = row.isSpot && !row.isChosen ? spotOf(row) : null
          if (sp && sp.pct != null && sp.pct >= 32) drop = k
        })
        if (drop < 0) break
      }
      list.splice(drop, 1)
    }
    return list
  })()

  const printReport = (
    <PrintDoc>
      <PrintPage>
        <PrintBand
          title="One-Year Roth Conversion Estimate"
          subtitle={PRINT_SUBTITLE}
          meta={metaLine}
          metaRight={today}
        />
        <PrintFeature label={featureLabel} value={featureValue} note={featureNote} />
        <PrintTiles items={printTiles} />
        {p1.sum ? (
          <PrintSection title="What this means">
            <PrintProse>{p1.sum}</PrintProse>
          </PrintSection>
        ) : null}
        <PrintSection title="Room before the next step" note="amounts that stay within each limit">
          <PrintRows rows={roomRows} />
          {p1.room ? <PrintProse>{p1.room}</PrintProse> : null}
        </PrintSection>
        <PrintSection title={chartTitle} note={chartNote} className="pr-chart oy-chart">
          {oneBar ? (
            <PrintProse>{oneBarText}</PrintProse>
          ) : chartGroups.length > 0 ? (
            <BarCompare height={220} legend={false} groups={chartGroups} format={chartFormat} />
          ) : (
            <PrintProse>{noChartText}</PrintProse>
          )}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="One-Year Roth Conversion Estimate" right={today} />
        <PrintSection className={tight.trim()} title="Where the income sits" note={ready ? 'before and after converting' : 'no client details entered'}>
          <PrintTable
            head={['', 'Before converting', 'After converting', 'Change']}
            widths={['34%', '22%', '22%', '22%']}
            align={['left', 'right', 'right', 'right']}
            rows={sitRows}
            rowClass={(row, i) => (i === totalRowIndex ? 'is-strong' : '')}
          />
        </PrintSection>
        <PrintSection className={tight.trim()} title={ladderTitle} note={ladderNote}>
          {ladder.length > 0 ? (
            <PrintTable
              head={['Convert', 'Tax added', 'Rate', 'Bracket', `Next ${money(LADDER_STEP)}`, 'IRMAA added']}
              widths={['34%', '12%', '9%', '10%', '17%', '18%']}
              align={['left', 'right', 'right', 'right', 'right', 'right']}
              rows={printLadder.map((row) => {
                const cells = ladderCells(row)
                const tag = ladderTag(row)
                return [<>{money(row.conversion)}{tag ? <span style={{ fontWeight: 400, color: '#726d63' }}> · {tag}</span> : null}</>, ...cells.slice(1)]
              })}
              rowClass={(row, i) => (printLadder[i].isChosen ? 'is-tint' : '')}
            />
          ) : (
            <PrintProse>{capZero ? ZERO_CAP_NOTE : 'No amount can be priced for this client.'}</PrintProse>
          )}
        </PrintSection>
        <PrintNote title="Reading the result">
          {noteText}
          {p1.also.length ? (
            <div className="oy-also">
              <div className="pr-note-title">Also worth knowing</div>
              <ul>{p1.also.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          ) : null}
        </PrintNote>
        <PrintSection title="Inputs used in this estimate" className="oy-inputs">
          <PrintInputs items={inputs} />
        </PrintSection>
        <PrintSection title="Assumptions">
          <PrintAssumptions items={printAssumptions} />
        </PrintSection>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  const bracketRight = bracketRoom && bracketRoom.rightLabel
    ? (bracketRoom.irmaaAdds ? <>{bracketRoom.tax}<span className="oy-sub">{bracketRoom.irmaaAdds}</span></> : bracketRoom.tax)
    : undefined
  const irmaaLabel = irmaaRoom && irmaaRoom.sub ? <>{irmaaRoom.label}<span className="oy-sub">{irmaaRoom.sub}</span></> : irmaaRoom ? irmaaRoom.label : null

  return (
    <ToolShell
      title="One-Year Roth Conversion Estimate"
      subtitle={SUBTITLE}
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
      requestKey="multi-year-projection-year"
    >
      <div className="tool-grid oy-grid">
        <div>
          <ViewSwitch view="year" onChange={onView} />
          <Panel title="The client">
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <div className="field-row">
              <NumberField label={`Age on December 31, ${TAX_YEAR}`} value={form.age} onChange={set('age')} suffix="yrs" hint={`Sets the senior deduction, the additional standard deduction and who is on Medicare by ${IRMAA_YEAR}. Born January 1? Enter one more than the age you turn in ${TAX_YEAR}: the IRS treats a January 1 birthday as the day before.`} />
              {married ? <NumberField label={`Spouse age on December 31, ${TAX_YEAR}`} value={form.spouseAge} onChange={set('spouseAge')} suffix="yrs" hint="Blank means the same age." /> : null}
            </div>
          </Panel>
          <Panel title="This year’s income before converting">
            <p className="oy-hint">Take these from the client’s return projection for the year, net of above-the-line adjustments, before any conversion. Type 0 for a line with none; at least one income line is needed to price a conversion.</p>
            <div className="field-row">
              <MoneyField label="Wages" value={form.wages} onChange={set('wages')} hint="Including self-employment, net." />
              <MoneyField label="Pension" value={form.pension} onChange={set('pension')} hint="Taxable amount." />
            </div>
            <div className="field-row">
              <MoneyField label="Other ordinary income" value={form.otherOrdinary} onChange={set('otherOrdinary')} hint="Interest, ordinary dividends, short-term gains, rental, IRA distributions (net of QCDs) and this year’s RMD." />
              <MoneyField label="Social Security benefits" value={form.ss} onChange={set('ss')} hint="Gross annual benefits." />
            </div>
            <div className="field-row">
              <MoneyField label="Long-term gains and qualified dividends" value={form.ltcg} onChange={set('ltcg')} hint="Taxed at 0/15/20% on top of ordinary income." />
              <MoneyField label="Tax-exempt interest" value={form.taxExempt} onChange={set('taxExempt')} hint="Counts toward Social Security taxation and IRMAA, not AGI." />
            </div>
          </Panel>
          <RefinePanel summary="deductions, state, investment income">
            <MoneyField label="Itemized deductions" value={form.itemized} onChange={set('itemized')} hint={`Leave blank for the standard deduction (${money(r.std)}${r.aged > 0 ? `, including the 65+ add-on` : ''}); the senior deduction is applied automatically. Itemizing replaces the whole standard deduction.`} />
            <SelectField label="State" value={form.state} onChange={set('state')} options={STATES.map((s) => ({ value: s.code, label: s.name }))} hint="Defaults to the state's top marginal rate, applied flat to federal taxable income. Enter the client's actual rate below if it is lower." />
            <NumberField label="State tax rate override (%)" value={form.stateRate} onChange={set('stateRate')} suffix="%" hint="Optional. Many states exempt Social Security and retirement income; type 0 for none." />
            <MoneyField label="Net investment income" value={form.nii} onChange={set('nii')} hint="From Form 8960 line 12; blank or 0 uses the gains line." />
          </RefinePanel>
          <Panel title="What to convert">
            <PillField label="Conversion target" value={form.target} onChange={set('target')} options={TARGETS} hint={targetIssue || (form.target !== 'amount' ? capHint : null) || undefined} />
            {form.target === 'amount' ? (
              <MoneyField label="Amount to convert" value={form.amount} onChange={set('amount')} hint={capHint || undefined} />
            ) : null}
            <MoneyField label="Pre-tax IRA available to convert" value={form.cap} onChange={set('cap')} hint={`Optional limit, after this year’s RMD. Blank means no limit; 0 means nothing can be converted. ${BASIS_NOTE}`} />
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader
              sectionTitle="One-Year Roth Conversion Estimate"
              meta={metaLine}
              metaRight={today}
            />
            <FeatureBlock label={featureLabel} value={featureValue} note={featureNote} />
            <StatTiles items={tiles} />
            {withheldText ? <p className="oy-why" style={{ marginTop: 12 }}>{withheldText}</p> : null}

            {bracketRoom ? (
              <Callout label={bracketRoom.label} value={bracketRoom.value} rightLabel={bracketRoom.rightLabel} rightValue={bracketRight} tone={bracketRoom.tone} />
            ) : null}
            {irmaaRoom ? (
              <Callout label={irmaaLabel} value={irmaaRoom.value} rightLabel={irmaaRoom.rightLabel} rightValue={irmaaRoom.tax} tone={irmaaRoom.tone} />
            ) : null}
            {roomExtra ? <p className="oy-why">{roomExtra}</p> : null}
            {acaOn ? <Callout label={ACA_TEXT} value="" tone="info" /> : null}

            <div className="chart-title" style={{ marginTop: 18 }}>Where the income sits, before → after converting{ready ? '' : ' (illustration only)'}</div>
            <div className="result-list oy-sit">
              {sitRows.map((row) => (
                <ResultRow key={row[0]} label={row[0]} raw={ready ? `${row[1]} → ${row[2]}` : 'n/a'} sub={subRowLabels.has(row[0])} />
              ))}
              {ready ? <ResultRow label="Tax added by converting" value={ch.addedTax} total negative={ch.addedTax > 0.5} /> : <ResultRow label="Tax added by converting" raw="n/a" total />}
              {niitWarn ? <p className="oy-muted">{niitWarn}</p> : null}
            </div>

            <Narrative>{narrative}</Narrative>

            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Panel title={ladderTitle} style={{ marginTop: 18 }}>
        <p className="oy-hint">{ready ? 'The rate on the conversion is the average on the whole amount; the next-$10,000 column is what the last dollars cost. The chosen amount is highlighted, and the bracket tops and the IRMAA line are labeled.' : 'Illustration only: enter the client’s age and this year’s income above to price this client.'}</p>
        {ladder.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table oy-ladder">
              <thead>
                <tr>{ladderHead.map((h, i) => <th key={h} className={i > 0 ? 'num' : undefined}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {ladder.map((row) => {
                  const cells = ladderCells(row)
                  const tag = ladderTag(row)
                  return (
                    <tr key={Math.round(row.conversion)} className={row.isChosen ? 'is-chosen' : row.isSpot ? 'is-conv' : undefined}>
                      <td>{money(row.conversion)}{tag ? <span className="oy-tag">{tag}</span> : null}</td>
                      {cells.slice(1).map((v, i) => <td key={i} className="num">{v}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">{capZero ? ZERO_CAP_NOTE : 'No amount can be priced for this client.'}</p>
        )}
      </Panel>

      <Panel title={chartTitle}>
        <div className="oy-chart">
          {oneBar ? (
            <p className="hint">{oneBarText}</p>
          ) : chartGroups.length > 0 ? (
            <BarCompare height={190} legend={false} groups={chartGroups} format={chartFormat} />
          ) : (
            <p className="hint">{noChartText}</p>
          )}
        </div>
      </Panel>

      <Note title="Reading the result">{noteText}</Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
