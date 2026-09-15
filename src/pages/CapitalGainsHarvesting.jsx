import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  SegmentedField,
  ResultRow,
  Assumptions,
  Note,
  ReportHeader,
  FeatureBlock,
  Narrative,
  Callout,
} from '../components/ui.jsx'
import { StackedBar, TONE } from '../components/charts.jsx'
import { money, toNumber, percent } from '../lib/format.js'
import { capitalGainsTax, niitTax, marginalOrdinaryRate, LTCG_BREAKS, NIIT, TAX_YEAR } from '../lib/tax.js'

const FILING = [
  { value: 'married', label: 'Married filing jointly' },
  { value: 'single', label: 'Single' },
]
const ORDINARY_LOSS_LIMIT = 3000

const BLANK = { filing: 'married', ordinaryTaxable: '', plannedGains: '', shortTermGains: '', unrealizedLosses: '', carryforward: '', otherInvestmentIncome: '' }
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
    return { ltNet, stNet, ordinaryOffset, newCarry, ltTax, stTax, niit, ordSaving, total }
  }

  const noHarvest = scenario(gains, stGains, 0)
  const harvest = scenario(gains, stGains, losses)
  const saved = noHarvest.total - harvest.total
  const fillZero = zeroRoom // gains that can be realized at 0% (gain harvesting)
  const marginalLtcg = capitalGainsTax(1000, ord + gains, filing) / 1000
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
    { label: 'Long-term capital gains tax', formula: `0% on first ${money(Math.min(r.harvest.ltNet, r.zeroRoom), 2)}, 15% on next ${money(Math.max(0, Math.min(r.harvest.ltNet - r.zeroRoom, r.fifteenRoom)), 2)}, 20% above`, result: money(r.harvest.ltTax, 2) },
    ...(r.harvest.stTax > 0 ? [{ label: 'Short-term gain tax', formula: `${money(r.harvest.stNet, 2)} at ordinary marginal rate`, result: money(r.harvest.stTax, 2) }] : []),
    ...(r.harvest.niit > 0 ? [{ label: 'Net investment income tax', formula: `3.8% × lesser of (net investment income, MAGI − ${money(NIIT.threshold[r.filing])})`, result: money(r.harvest.niit, 2) }] : []),
    ...(r.harvest.ordSaving > 0 ? [{ label: 'Ordinary income offset', formula: `${money(r.harvest.ordinaryOffset, 2)} of excess loss × marginal rate`, result: `−${money(r.harvest.ordSaving, 2)}` }] : []),
    { label: 'Federal tax with harvesting', formula: 'sum of the above', result: money(Math.max(0, r.harvest.total), 2) },
    { label: 'Federal tax without harvesting', formula: `same steps with ${money(r.gains, 2)} of gain and only the ${money(r.carry, 2)} carryforward`, result: money(Math.max(0, r.noHarvest.total), 2) },
    { label: 'Saved by harvesting', formula: `${money(Math.max(0, r.noHarvest.total), 2)} − ${money(Math.max(0, r.harvest.total), 2)}`, result: money(r.saved, 2) },
    { label: 'Carryforward to next year', formula: 'losses not used against gains or the $3,000 ordinary limit', result: money(r.harvest.newCarry, 2) },
  ], [r])

  return (
    <ToolShell
      title="Capital Gains & Loss Harvesting Planner"
      subtitle="How much gain fits in the 0% and 15% brackets this year, what a planned realization costs, and what harvesting available losses against it saves — with the $3,000 ordinary-income offset and carryforward tracked."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="This year">
            <SegmentedField label="Filing status" value={form.filing} onChange={set('filing')} options={FILING} />
            <MoneyField label="Ordinary taxable income (before gains)" value={form.ordinaryTaxable} onChange={set('ordinaryTaxable')} info="Wages, pensions, IRA distributions, interest — after the standard or itemized deduction, before any capital gains." />
            <MoneyField label="Other investment income" value={form.otherInvestmentIncome} onChange={set('otherInvestmentIncome')} info="Dividends, interest, rents — used for the 3.8% net investment income tax test." />
          </Panel>
          <Panel title="Positions">
            <div className="field-row">
              <MoneyField label="Long-term gains planned to realize" value={form.plannedGains} onChange={set('plannedGains')} />
              <MoneyField label="Short-term gains planned to realize" value={form.shortTermGains} onChange={set('shortTermGains')} info="Taxed as ordinary income." />
            </div>
            <div className="field-row">
              <MoneyField label="Unrealized losses available to harvest" value={form.unrealizedLosses} onChange={set('unrealizedLosses')} />
              <MoneyField label="Loss carryforward from prior years" value={form.carryforward} onChange={set('carryforward')} />
            </div>
          </Panel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Gains & Losses Plan" meta={`Tax year ${TAX_YEAR} · federal`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label="Tax on the planned realization — with losses harvested"
              value={money(Math.max(0, r.harvest.total))}
              note={`${money(Math.max(0, r.noHarvest.total))} without harvesting · saves ${money(r.saved)}`}
            />
            <Callout
              label="Long-term gains that fit in the 0% bracket this year"
              value={money(r.zeroRoom)}
              rightLabel="Then at 15% up to"
              rightValue={money(r.fifteenRoom)}
              tone="good"
            />
            <Narrative>
              With {money(r.ord)} of ordinary taxable income, the first {money(r.zeroRoom)} of long-term gain is taxed at 0% and the next {money(r.fifteenRoom)} at 15%.
              Realizing {money(r.gains)} of long-term gain{r.stGains > 0 ? ` and ${money(r.stGains)} short-term` : ''} costs about {money(Math.max(0, r.noHarvest.total))} in federal tax{r.niitApplies ? ' including the 3.8% net investment income tax' : ''}.
              Harvesting {money(r.losses)} of losses{r.carry > 0 ? ` on top of the ${money(r.carry)} carryforward` : ''} cuts that to {money(Math.max(0, r.harvest.total))}
              {r.harvest.ordinaryOffset > 0 ? `, and ${money(r.harvest.ordinaryOffset)} of excess loss offsets ordinary income` : ''}
              {r.harvest.newCarry > 0 ? `, with ${money(r.harvest.newCarry)} carried forward` : ''}.
              {r.zeroRoom > 0 && r.gains < r.zeroRoom ? ` There is still ${money(r.zeroRoom - r.gains)} of 0% room — realizing gains up to that amount and repurchasing resets basis at no federal cost.` : ''}
            </Narrative>

            <div className="result-list">
              <ResultRow label="Long-term gain after losses" value={r.harvest.ltNet} />
              {r.stGains > 0 ? <ResultRow label="Short-term gain after losses" value={r.harvest.stNet} /> : null}
              <ResultRow label={`Long-term capital gains tax (marginal ${percent(r.marginalLtcg * 100, 0)})`} value={r.harvest.ltTax} />
              {r.harvest.stTax > 0 ? <ResultRow label="Tax on short-term gain (ordinary)" value={r.harvest.stTax} /> : null}
              {r.harvest.niit > 0 ? <ResultRow label="Net investment income tax (3.8%)" value={r.harvest.niit} /> : null}
              {r.harvest.ordSaving > 0 ? <ResultRow label={`Ordinary income offset (${money(r.harvest.ordinaryOffset)} of loss)`} value={-r.harvest.ordSaving} sub /> : null}
              <ResultRow label="Federal tax with harvesting" value={Math.max(0, r.harvest.total)} total />
              <ResultRow label="Federal tax without harvesting" value={Math.max(0, r.noHarvest.total)} sub />
              <ResultRow label="Loss carryforward to next year" value={r.harvest.newCarry} sub />
            </div>

            <div className="chart-block" style={{ marginTop: 20 }}>
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Where the long-term gain lands</div>
              <StackedBar data={[
                { label: '0% bracket', value: Math.min(r.harvest.ltNet, r.zeroRoom), color: TONE.accent },
                { label: '15% bracket', value: Math.max(0, Math.min(r.harvest.ltNet - r.zeroRoom, r.fifteenRoom)), color: TONE.navy },
                { label: '20% bracket', value: Math.max(0, r.harvest.ltNet - r.zeroRoom - r.fifteenRoom), color: TONE.tax },
              ]} />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="Wash-sale rule">
        A harvested loss is disallowed if the same or a substantially identical security is bought within 30 days before or after the sale (including in an IRA or by a spouse). Swap into a similar-but-different fund for 31 days, or accept the wait.
      </Note>

      <Assumptions
        items={[
          `${TAX_YEAR} long-term capital gains breakpoints (0% to ${money(r.breaks.zeroTo)}, 15% to ${money(r.breaks.fifteenTo)} of taxable income for this filing status) and ordinary brackets; state tax not modeled.`,
          'Losses offset short-term gains first, then long-term gains, then up to $3,000 of ordinary income; the remainder carries forward.',
          'Net investment income tax is applied to net gains plus other investment income when a simplified MAGI (ordinary taxable income plus investment income) exceeds the threshold.',
          'Qualified dividends, collectibles rates, Section 1250 gain, and AMT are not modeled.',
        ]}
      />
    </ToolShell>
  )
}
