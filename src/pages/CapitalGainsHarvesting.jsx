import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  SegmentedField,
  RefinePanel,
  StatTiles,
  ScenarioCards,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
  Callout,
} from '../components/ui.jsx'
import { StackedBar, BarCompare, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { capitalGainsTax, niitTax, marginalOrdinaryRate, LTCG_BREAKS, NIIT, TAX_YEAR } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const ORDINARY_LOSS_LIMIT = 3000

// Currency with a true minus sign for negatives (money() would print a hyphen).
const fmt = (v) => (v < 0 ? `−${money(-v)}` : money(v || 0))

const BLANK = { filing: 'married', ordinaryTaxable: '', plannedGains: '', shortTermGains: '', unrealizedLosses: '', carryforward: '0', otherInvestmentIncome: '0' }
const SAMPLE = { filing: 'married', ordinaryTaxable: '78000', plannedGains: '60000', shortTermGains: '0', unrealizedLosses: '22000', carryforward: '4000', otherInvestmentIncome: '9000' }

function compute(form) {
  const filing = form.filing === 'single' ? 'single' : 'married'
  const ord = Math.max(0, toNumber(form.ordinaryTaxable))
  const gains = Math.max(0, toNumber(form.plannedGains))
  const stGains = Math.max(0, toNumber(form.shortTermGains))
  const losses = Math.max(0, toNumber(form.unrealizedLosses))
  const carry = Math.max(0, toNumber(form.carryforward))
  const otherInv = Math.max(0, toNumber(form.otherInvestmentIncome))
  const breaks = LTCG_BREAKS[filing]

  // Bracket headroom before any gains: how much LTCG fits at 0% and 15%.
  const zeroRoom = Math.max(0, breaks.zeroTo - ord)
  const fifteenRoom = Math.max(0, breaks.fifteenTo - Math.max(ord, breaks.zeroTo))

  // Approximate MAGI for NIIT = ordinary taxable + investment income (simplified).
  const magi = (ltcg, st) => ord + ltcg + st + otherInv

  const scenario = (ltcgRealized, stRealized, lossesUsed) => {
    // Losses first offset the same character; here short-term gains are taxed as ordinary
    // so we apply losses to ST gains first (highest rate), then LT gains, then $3k ordinary.
    let remainingLoss = lossesUsed + carry
    const stNet = Math.max(0, stRealized - remainingLoss); remainingLoss = Math.max(0, remainingLoss - stRealized)
    const ltNet = Math.max(0, ltcgRealized - remainingLoss); remainingLoss = Math.max(0, remainingLoss - ltcgRealized)
    const ordinaryOffset = Math.min(ORDINARY_LOSS_LIMIT, remainingLoss)
    const newCarry = Math.max(0, remainingLoss - ordinaryOffset)
    const ordAfter = Math.max(0, ord + stNet - ordinaryOffset)
    const ltTax = capitalGainsTax(ltNet, ordAfter, filing)
    const stTax = (ordAfter - ord > 0 ? marginalOrdinaryRate(ordAfter, filing) * (ordAfter - ord) : 0)
    const ordSaving = ordinaryOffset > 0 ? marginalOrdinaryRate(ord, filing) * ordinaryOffset : 0
    const niit = niitTax(ltNet + stNet + otherInv, magi(ltNet, stNet), filing)
    const total = ltTax + stTax + niit - ordSaving
    // Where the long-term gain lands, stacked on top of ordinary income (short-term gain
    // after losses is ordinary income, so it uses up 0%/15% room before the long-term gain).
    const zeroRoomAfter = Math.max(0, breaks.zeroTo - ordAfter)
    const fifteenRoomAfter = Math.max(0, breaks.fifteenTo - Math.max(ordAfter, breaks.zeroTo))
    const inZero = Math.min(ltNet, zeroRoomAfter)
    const inFifteen = Math.max(0, Math.min(ltNet - zeroRoomAfter, fifteenRoomAfter))
    const inTwenty = Math.max(0, ltNet - inZero - inFifteen)
    return { ltNet, stNet, ordinaryOffset, newCarry, ordAfter, ltTax, stTax, niit, ordSaving, total, zeroRoomAfter, fifteenRoomAfter, inZero, inFifteen, inTwenty }
  }

  const noHarvest = scenario(gains, stGains, 0)
  const harvest = scenario(gains, stGains, losses)
  const saved = noHarvest.total - harvest.total
  const fillZero = zeroRoom // gains that can be realized at 0% (gain harvesting)
  // Marginal rate on the last dollar of long-term gain in the harvested plan.
  const marginalLtcg = capitalGainsTax(1000, harvest.ordAfter + harvest.ltNet, filing) / 1000
  const niitApplies = magi(gains, stGains) > NIIT.threshold[filing]

  return { filing, ord, gains, stGains, losses, carry, otherInv, breaks, zeroRoom, fifteenRoom, noHarvest, harvest, saved, fillZero, marginalLtcg, niitApplies }
}

export default function CapitalGainsHarvesting() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const steps = useMemo(() => [
    { label: '0% bracket headroom', formula: `${money(r.breaks.zeroTo)} − ordinary taxable ${money(r.ord, 2)}`, result: money(r.zeroRoom, 2) },
    { label: '15% bracket headroom', formula: `${money(r.breaks.fifteenTo)} − max(ordinary, ${money(r.breaks.zeroTo)})`, result: money(r.fifteenRoom, 2) },
    { label: 'Losses available', formula: `harvested ${money(r.losses, 2)} + carryforward ${money(r.carry, 2)}`, result: money(r.losses + r.carry, 2) },
    { label: 'Long-term gain after losses', formula: `${money(r.gains, 2)} − losses applied${r.stGains > 0 ? ' (short-term offset first)' : ''}`, result: money(r.harvest.ltNet, 2) },
    ...(r.harvest.stNet > 0 ? [{ label: 'Short-term gain after losses', formula: `${money(r.stGains, 2)} − losses applied; stacks as ordinary income, so 0% room becomes ${money(r.harvest.zeroRoomAfter, 2)}`, result: money(r.harvest.stNet, 2) }] : []),
    { label: 'Long-term capital gains tax', formula: `0% on first ${money(r.harvest.inZero, 2)}, 15% on next ${money(r.harvest.inFifteen, 2)}, 20% on ${money(r.harvest.inTwenty, 2)} above`, result: money(r.harvest.ltTax, 2) },
    ...(r.harvest.stTax > 0 ? [{ label: 'Short-term gain tax', formula: `${money(r.harvest.stNet, 2)} at ordinary marginal rate`, result: money(r.harvest.stTax, 2) }] : []),
    ...(r.harvest.niit > 0 ? [{ label: 'Net investment income tax', formula: `3.8% × lesser of (net investment income, MAGI − ${money(NIIT.threshold[r.filing])})`, result: money(r.harvest.niit, 2) }] : []),
    ...(r.harvest.ordSaving > 0 ? [{ label: 'Ordinary income offset', formula: `${money(r.harvest.ordinaryOffset, 2)} of excess loss × marginal rate`, result: `−${money(r.harvest.ordSaving, 2)}` }] : []),
    { label: 'Federal tax with harvesting', formula: `sum of the above${r.harvest.total < 0 ? ' (negative = net reduction in this year’s federal tax)' : ''}`, result: r.harvest.total < 0 ? `−${money(-r.harvest.total, 2)}` : money(r.harvest.total, 2) },
    { label: 'Federal tax without harvesting', formula: `same steps with ${money(r.gains, 2)} of gain and only the ${money(r.carry, 2)} carryforward`, result: r.noHarvest.total < 0 ? `−${money(-r.noHarvest.total, 2)}` : money(r.noHarvest.total, 2) },
    { label: 'Saved by harvesting', formula: `${r.noHarvest.total < 0 ? `−${money(-r.noHarvest.total, 2)}` : money(r.noHarvest.total, 2)} − ${r.harvest.total < 0 ? `(−${money(-r.harvest.total, 2)})` : money(r.harvest.total, 2)}`, result: money(r.saved, 2) },
    { label: 'Carryforward to next year', formula: 'losses not used against gains or the $3,000 ordinary limit', result: money(r.harvest.newCarry, 2) },
  ], [r])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const filingLabel = r.filing === 'single' ? 'Single' : 'Married filing jointly'
  // Unclamped: a negative total means the excess-loss offset against ordinary income
  // outweighs the tax on the realization, i.e. a net reduction in this year's federal tax.
  const taxWith = r.harvest.total
  const taxWithout = r.noHarvest.total
  const lossToSt = Math.max(0, r.stGains - r.harvest.stNet)
  const lossToLt = Math.max(0, r.gains - r.harvest.ltNet)
  // What the NEW losses (beyond the carryforward) removed from each long-term bracket.
  const harvestCutLt = Math.max(0, r.noHarvest.ltNet - r.harvest.ltNet)
  const cutParts = [
    [Math.max(0, r.noHarvest.inTwenty - r.harvest.inTwenty), '20%'],
    [Math.max(0, r.noHarvest.inFifteen - r.harvest.inFifteen), '15%'],
    [Math.max(0, r.noHarvest.inZero - r.harvest.inZero), '0%'],
  ].filter(([v]) => v > 0).map(([v, b]) => `${money(v)} from the ${b} bracket${b === '0%' ? ` (where it saved ${r.harvest.niit < r.noHarvest.niit ? 'only the 3.8% net investment income tax' : 'no federal tax'})` : ''}`)
  const landing = [
    { label: '0% bracket', value: r.harvest.inZero, color: TONE.accent },
    { label: '15% bracket', value: r.harvest.inFifteen, color: TONE.navy },
    { label: '20% bracket', value: r.harvest.inTwenty, color: TONE.tax },
  ]
  // 0% room left after this year's plan — only worth pointing out when no loss is being
  // wasted on it (no excess loss offsetting ordinary income or carrying forward).
  const roomLeft = Math.max(0, r.harvest.zeroRoomAfter - r.harvest.ltNet)
  const gainHarvestTip = roomLeft > 0 && r.harvest.ordinaryOffset === 0 && r.harvest.newCarry === 0

  // One narrative, used on screen and in print.
  const bracketSentence = r.zeroRoom > 0
    ? `With ${money(r.ord)} of ordinary taxable income, the first ${money(r.zeroRoom)} of long-term gain is taxed at 0% and the next ${money(r.fifteenRoom)} at 15%${r.stGains > 0 ? ' — short-term gains stack as ordinary income first and use up that room' : ''}.`
    : r.fifteenRoom > 0
      ? `With ${money(r.ord)} of ordinary taxable income the 0% bracket is already used up; the next ${money(r.fifteenRoom)} of long-term gain is taxed at 15% and anything above at 20%.`
      : `With ${money(r.ord)} of ordinary taxable income, every dollar of long-term gain is taxed at 20%.`
  const costSentence = `Realizing ${money(r.gains)} of long-term gain${r.stGains > 0 ? ` and ${money(r.stGains)} short-term` : ''} costs about ${fmt(taxWithout)} in federal tax${r.niitApplies ? ' including the 3.8% net investment income tax' : ''}${r.carry > 0 ? ` after the ${money(r.carry)} carryforward` : ''}.`
  const offsetClause = r.harvest.ordinaryOffset > 0 ? `, and ${money(r.harvest.ordinaryOffset)} of excess loss offsets ordinary income` : ''
  const carryClause = r.harvest.newCarry > 0 ? `, with ${money(r.harvest.newCarry)} carried forward` : ''
  const harvestSentence = r.losses <= 0
    ? `No new losses are harvested in this plan, so the tax stays at ${fmt(taxWith)}${offsetClause}${carryClause}.`
    : taxWith < 0
      ? `Harvesting ${money(r.losses)} of losses eliminates that tax, and the ${money(r.harvest.ordinaryOffset)} of excess loss applied to ordinary income turns the plan into a net ${money(-taxWith)} reduction in this year's federal tax${carryClause}.`
      : `Harvesting ${money(r.losses)} of losses${r.carry > 0 ? ' on top of the carryforward' : ''} cuts that to ${fmt(taxWith)}${offsetClause}${carryClause}.`
  const tipSentence = gainHarvestTip
    ? ` There is still ${money(roomLeft)} of 0% room — realizing that much more long-term gain and repurchasing resets basis ${r.niitApplies ? 'for only the 3.8% net investment income tax' : `at no federal cost (the 3.8% net investment income tax starts above ${money(NIIT.threshold[r.filing])} of MAGI)`}.`
    : ''
  const narrative = `${bracketSentence} ${costSentence} ${harvestSentence}${tipSentence}`

  const inputs = [
    ['Filing status', filingLabel],
    ['Ordinary taxable income (before gains)', money(r.ord)],
    ['Long-term gains planned to realize', money(r.gains)],
    ['Short-term gains planned to realize', money(r.stGains)],
    ['Unrealized losses available to harvest', money(r.losses)],
    ['Loss carryforward from prior years', money(r.carry)],
    ['Other investment income', money(r.otherInv)],
  ]
  const assumptions = [
    `${TAX_YEAR} long-term capital gains breakpoints (0% to ${money(r.breaks.zeroTo)}, 15% to ${money(r.breaks.fifteenTo)} of taxable income for this filing status) and ordinary brackets; state tax not modeled.`,
    'Losses offset short-term gains first, then long-term gains, then up to $3,000 of ordinary income; the remainder carries forward.',
    ...(r.stGains > 0 ? ['Short-term gain left after losses is taxed as ordinary income and stacks beneath the long-term gain, so it uses up 0% and 15% bracket room first.'] : []),
    'Net investment income tax is applied to net gains plus other investment income when a simplified MAGI (ordinary taxable income plus investment income) exceeds the threshold.',
    ...(taxWith < 0 || taxWithout < 0 ? ['A negative "federal tax with harvesting" means the excess-loss offset against ordinary income is worth more than the tax on the realization — a net reduction in this year’s federal tax.'] : []),
    'Qualified dividends, collectibles rates, Section 1250 gain, and AMT are not modeled.',
  ]
  const keyRows = [
    { label: 'Long-term gain after losses', value: money(r.harvest.ltNet) },
    { label: `Long-term capital gains tax (marginal ${percent(r.marginalLtcg * 100, 0)})`, value: money(r.harvest.ltTax) },
    ...(r.harvest.stTax > 0 ? [{ label: `Tax on short-term gain after losses (${money(r.harvest.stNet)} at ordinary rates)`, value: money(r.harvest.stTax) }] : []),
    ...(r.harvest.niit > 0 ? [{ label: 'Net investment income tax (3.8%)', value: money(r.harvest.niit) }] : []),
    ...(r.harvest.ordSaving > 0 ? [{ label: `Ordinary income offset (${money(r.harvest.ordinaryOffset)} of loss)`, value: `−${money(r.harvest.ordSaving)}`, sub: true }] : []),
    { label: taxWith < 0 ? 'Federal tax with harvesting (net reduction)' : 'Federal tax with harvesting', value: fmt(taxWith), total: true },
    { label: 'Federal tax without harvesting', value: fmt(taxWithout), sub: true },
  ]
  // Page-1 chart: the with/without comparison only means something when there is tax to cut.
  // When the plan is already at $0 (gain inside the 0% bracket), chart the gain against the room instead.
  const chartMode = taxWithout > 0 ? 'tax' : (r.zeroRoom > 0 || r.gains > 0 || r.losses > 0) ? 'room' : 'none'
  // Compact page 1 when the key rows run long (ST+NIIT, NIIT+offset) or when the room chart's
  // explanatory paragraph joins an offset row (both can run three lines).
  const compactP1 = keyRows.length >= 6 || (chartMode === 'room' && keyRows.length >= 5)
  const printReport = (
    <PrintDoc>
      <PrintPage compact={compactP1}>
        <PrintBand
          title="Gains & Loss Harvesting Plan"
          subtitle="Federal tax on the planned realization, and what harvesting available losses against it saves."
          meta={`Tax year ${TAX_YEAR} · federal · ${filingLabel}`}
          metaRight={today}
        />
        <PrintFeature
          label={taxWith < 0 ? 'Net federal tax effect of the planned realization — with losses harvested' : 'Tax on the planned realization — with losses harvested'}
          value={fmt(taxWith)}
          note={`${fmt(taxWithout)} without harvesting · saves ${fmt(r.saved)}${taxWith < 0 ? ' · the excess loss offsets ordinary income' : ''}`}
        />
        <PrintTiles
          items={[
            { label: 'Saved by harvesting', value: fmt(r.saved), note: 'federal tax this year', best: r.saved > 0 },
            { label: 'Tax without harvesting', value: fmt(taxWithout), note: 'planned gains alone' },
            { label: 'Room in the 0% bracket', value: money(r.zeroRoom), note: `next ${money(r.fifteenRoom)} at 15%` },
            { label: 'Loss carried forward', value: money(r.harvest.newCarry), note: 'to next year' },
          ]}
        />
        <PrintSection title="Tax on the planned realization" note="with losses harvested">
          <PrintRows rows={keyRows} />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        {chartMode === 'tax' ? (
          <PrintSection title="Federal tax on this year's realization" className="pr-chart">
            <BarCompare
              height={compactP1 ? 215 : 230}
              legend={false}
              groups={[
                { label: 'Without harvesting', bars: [{ label: 'Federal tax', value: taxWithout, color: TONE.tax }] },
                { label: taxWith < 0 ? `With losses harvested (net ${fmt(taxWith)})` : 'With losses harvested', bars: [{ label: 'Federal tax', value: Math.max(0, taxWith), color: TONE.net }] },
              ]}
            />
          </PrintSection>
        ) : chartMode === 'room' ? (
          <PrintSection title="Long-term gain against the 0% bracket" className="pr-chart">
            <PrintProse>
              {`Both scenarios come to ${fmt(taxWithout)} of federal tax on the realization: the long-term gain fits inside the 0% bracket.`}
              {lossToLt > 0 ? ` The ${money(lossToLt)} of losses applied to it saves nothing this year${r.harvest.ordSaving > 0 ? ` (the only saving is the ${money(r.harvest.ordinaryOffset)} offset against ordinary income, ${money(r.harvest.ordSaving)})` : ''}; those losses are worth 15% or more in a year when gains reach past the 0% bracket.` : ''}
            </PrintProse>
            <div style={{ height: 6 }} />
            <BarCompare
              height={compactP1 ? 160 : 190}
              legend={false}
              groups={[
                { label: 'Room in the 0% bracket', bars: [{ label: 'Amount', value: r.zeroRoom, color: TONE.accent }] },
                { label: 'Long-term gain planned', bars: [{ label: 'Amount', value: r.gains, color: TONE.navy }] },
                { label: 'Gain left after losses', bars: [{ label: 'Amount', value: r.harvest.ltNet, color: TONE.net }] },
              ]}
            />
          </PrintSection>
        ) : (
          <PrintSection title="Federal tax on this year's realization">
            <PrintProse>No gain or loss has been entered, so there is nothing to compare yet. Enter the planned long-term gain and the losses available to harvest to see the tax with and without harvesting.</PrintProse>
          </PrintSection>
        )}
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact={r.stGains > 0}>
        <PrintPageHead title="Gains & Loss Harvesting Plan" right={today} />
        <PrintSection title="Where the long-term gain lands" className="pr-chart" note={`${money(r.harvest.ltNet)} after losses`}>
          {r.harvest.ltNet > 0 ? (
            <>
              <StackedBar height={40} data={landing} />
              <div style={{ height: 6 }} />
            </>
          ) : null}
          <PrintProse>
            {r.harvest.ltNet > 0
              ? `Of the ${money(r.harvest.ltNet)} of long-term gain left after losses, ${money(landing[0].value)} is taxed at 0%, ${money(landing[1].value)} at 15%, and ${money(landing[2].value)} at 20%${r.harvest.stNet > 0 ? ` — stacked on top of ${money(r.ord)} of ordinary income plus the ${money(r.harvest.stNet)} of short-term gain that remains after losses` : ''}.`
              : r.gains > 0
                ? `The losses absorb the entire ${money(r.gains)} long-term gain, so none of it is taxed this year.${r.harvest.ordinaryOffset > 0 ? ` ${money(r.harvest.ordinaryOffset)} of the excess offsets ordinary income` : ''}${r.harvest.newCarry > 0 ? `${r.harvest.ordinaryOffset > 0 ? ' and' : ''} ${money(r.harvest.newCarry)} carries forward to next year` : ''}${r.harvest.ordinaryOffset > 0 || r.harvest.newCarry > 0 ? '.' : ''}`
                : 'No long-term gain is planned, so there is nothing to place in the brackets this year.'}
            {lossToSt > 0
              ? ` The losses went against the ${money(r.stGains)} of short-term gain first, where they save ordinary rates${lossToLt > 0 ? `; ${money(lossToLt)} reached the long-term gain` : ', so none of the long-term stack was reduced'}.`
              : harvestCutLt > 0 && r.harvest.ltNet > 0 && cutParts.length > 0
                ? ` Harvesting the new losses took ${money(harvestCutLt)} off the top of this stack${cutParts.length === 1 ? `, all ${cutParts[0].replace(/^\S+ /, '')}` : `: ${cutParts.join(', ')}`}.`
                : ''}
          </PrintProse>
        </PrintSection>
        <PrintCols>
          <PrintSection title="Bracket headroom this year">
            <PrintRows
              rows={[
                { label: 'Ordinary taxable income (before gains)', value: money(r.ord) },
                ...(r.harvest.stNet > 0 ? [{ label: 'Short-term gain after losses (ordinary income)', value: money(r.harvest.stNet), sub: true }] : []),
                { label: r.harvest.stNet > 0 ? 'Long-term gain taxed at 0% after short-term, up to' : 'Long-term gain taxed at 0%, up to', value: money(r.harvest.stNet > 0 ? r.harvest.zeroRoomAfter : r.zeroRoom) },
                { label: 'Then at 15%, the next', value: money(r.harvest.stNet > 0 ? r.harvest.fifteenRoomAfter : r.fifteenRoom) },
                { label: 'Long-term gain planned', value: money(r.gains) },
                { label: 'Marginal rate on the last dollar of gain', value: percent(r.marginalLtcg * 100, 0), sub: true },
              ]}
            />
          </PrintSection>
          <PrintSection title="How the losses are applied">
            <PrintRows
              rows={[
                { label: 'Losses harvested this year', value: money(r.losses) },
                { label: 'Carryforward from prior years', value: money(r.carry) },
                ...(r.stGains > 0 ? [{ label: 'Applied to short-term gains', value: money(lossToSt), sub: true }] : []),
                { label: 'Applied to long-term gains', value: money(lossToLt), sub: true },
                { label: 'Applied to ordinary income (max $3,000)', value: money(r.harvest.ordinaryOffset), sub: true },
                { label: 'Carried forward to next year', value: money(r.harvest.newCarry), total: true },
              ]}
            />
          </PrintSection>
        </PrintCols>
        <PrintSection title="Without harvesting vs. with losses harvested" note="federal tax this year">
          <PrintTable
            head={['', 'Without harvesting', 'With losses harvested']}
            widths={['44%', '28%', '28%']}
            align={['left', 'right', 'right']}
            rowClass={(row) => (row[0] === 'Federal tax this year' ? 'is-strong' : '')}
            rows={[
              ['Long-term gain taxed', money(r.noHarvest.ltNet), money(r.harvest.ltNet)],
              ...(r.stGains > 0 ? [['Short-term gain taxed (ordinary rates)', money(r.noHarvest.stNet), money(r.harvest.stNet)]] : []),
              ['Long-term capital gains tax', money(r.noHarvest.ltTax), money(r.harvest.ltTax)],
              ...(r.stGains > 0 ? [['Tax on short-term gain', money(r.noHarvest.stTax), money(r.harvest.stTax)]] : []),
              ['Net investment income tax (3.8%)', money(r.noHarvest.niit), money(r.harvest.niit)],
              ['Ordinary income offset from excess loss', fmt(-r.noHarvest.ordSaving), fmt(-r.harvest.ordSaving)],
              ['Federal tax this year', fmt(taxWithout), fmt(taxWith)],
              ['Loss carryforward to next year', money(r.noHarvest.newCarry), money(r.harvest.newCarry)],
            ]}
          />
        </PrintSection>
        <PrintNote title="Reading the result">
          “Saved by harvesting” is the federal tax difference between realizing the planned gains on their own and realizing them alongside the available losses. Wash-sale rule: a harvested loss is disallowed if the same or a substantially identical security is bought within 30 days before or after the sale (including in an IRA or by a spouse). Swap into a similar-but-different fund for 31 days, or accept the wait.
        </PrintNote>
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
      title="Capital Gains & Loss Harvesting Planner"
      subtitle="How much gain fits in the 0% and 15% brackets this year, what a planned realization costs, and what harvesting available losses against it saves — with the $3,000 ordinary-income offset and carryforward tracked."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
    >
      <div className="tool-grid">
        <div>
          <Panel title="This year">
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <MoneyField label="Ordinary taxable income (before gains)" value={form.ordinaryTaxable} onChange={set('ordinaryTaxable')} info="Wages, pensions, IRA distributions, interest — after the standard or itemized deduction, before any capital gains." />
          </Panel>
          <Panel title="Positions">
            <div className="field-row">
              <MoneyField label="Long-term gains planned to realize" value={form.plannedGains} onChange={set('plannedGains')} />
              <MoneyField label="Short-term gains planned to realize" value={form.shortTermGains} onChange={set('shortTermGains')} info="Taxed as ordinary income." />
            </div>
            <MoneyField label="Unrealized losses available to harvest" value={form.unrealizedLosses} onChange={set('unrealizedLosses')} />
          </Panel>
          <RefinePanel summary="loss carryforward, other investment income">
            <div className="field-row">
              <MoneyField label="Loss carryforward from prior years" value={form.carryforward} onChange={set('carryforward')} />
              <MoneyField label="Other investment income" value={form.otherInvestmentIncome} onChange={set('otherInvestmentIncome')} info="Dividends, interest, rents — used for the 3.8% net investment income tax test." />
            </div>
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Gains & Losses Plan" meta={`Tax year ${TAX_YEAR} · federal`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={taxWith < 0 ? 'Net federal tax effect of the planned realization — with losses harvested' : 'Tax on the planned realization — with losses harvested'}
              value={fmt(taxWith)}
              note={`${fmt(taxWithout)} without harvesting · saves ${fmt(r.saved)}${taxWith < 0 ? ' · the excess loss offsets ordinary income' : ''}`}
            />
            <StatTiles
              items={[
                { label: 'Saved by harvesting', value: fmt(r.saved), tone: 'good', note: 'federal tax' },
                { label: 'Tax without harvesting', value: fmt(taxWithout) },
                { label: 'Carryforward to next year', value: money(r.harvest.newCarry) },
              ]}
            />
            <Callout
              label="Long-term gains that fit in the 0% bracket this year"
              value={money(r.zeroRoom)}
              rightLabel="Then at 15%, the next"
              rightValue={money(r.fifteenRoom)}
              tone="good"
            />

            <div className="result-list">
              <ResultRow label="Long-term gain after losses" value={r.harvest.ltNet} />
              {r.stGains > 0 ? <ResultRow label="Short-term gain after losses" value={r.harvest.stNet} /> : null}
              <ResultRow label={`Long-term capital gains tax (marginal ${percent(r.marginalLtcg * 100, 0)})`} value={r.harvest.ltTax} />
              {r.harvest.stTax > 0 ? <ResultRow label="Tax on short-term gain (ordinary)" value={r.harvest.stTax} /> : null}
              {r.harvest.niit > 0 ? <ResultRow label="Net investment income tax (3.8%)" value={r.harvest.niit} /> : null}
              {r.harvest.ordSaving > 0 ? <ResultRow label={`Ordinary income offset (${money(r.harvest.ordinaryOffset)} of loss)`} raw={`−${money(r.harvest.ordSaving)}`} sub /> : null}
              <ResultRow label={taxWith < 0 ? 'Federal tax with harvesting (net reduction)' : 'Federal tax with harvesting'} raw={fmt(taxWith)} total />
              <ResultRow label="Federal tax without harvesting" raw={fmt(taxWithout)} sub />
              <ResultRow label="Loss carryforward to next year" value={r.harvest.newCarry} sub />
            </div>

            <Narrative>{narrative}</Narrative>

            <ScenarioCards
              sub="federal tax this year"
              scenarios={[
                {
                  label: 'Without harvesting',
                  value: fmt(taxWithout),
                  rows: [
                    { label: 'Long-term gain taxed', value: money(r.noHarvest.ltNet) },
                    { label: 'Capital gains tax', value: money(r.noHarvest.ltTax) },
                    { label: 'Net investment income tax', value: money(r.noHarvest.niit) },
                    { label: 'Carryforward', value: money(r.noHarvest.newCarry) },
                  ],
                },
                {
                  label: 'With losses harvested',
                  value: fmt(taxWith),
                  best: r.saved > 0,
                  rows: [
                    { label: 'Long-term gain taxed', value: money(r.harvest.ltNet) },
                    { label: 'Capital gains tax', value: money(r.harvest.ltTax) },
                    { label: 'Net investment income tax', value: money(r.harvest.niit) },
                    { label: 'Carryforward', value: money(r.harvest.newCarry) },
                  ],
                },
              ]}
            />

            <div className="chart-block" style={{ marginTop: 20 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Where the long-term gain lands</div>
              <StackedBar data={landing} />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Wash-sale rule">
        A harvested loss is disallowed if the same or a substantially identical security is bought within 30 days before or after the sale (including in an IRA or by a spouse). Swap into a similar-but-different fund for 31 days, or accept the wait.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
