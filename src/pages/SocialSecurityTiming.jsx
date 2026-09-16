import { useState, useMemo } from 'react'
import ToolShell from '../components/ToolShell.jsx'
import {
  Panel,
  MoneyField,
  NumberField,
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
  SliderField,
} from '../components/ui.jsx'
import { BarCompare, TONE } from '../components/charts.jsx'
import { money, toNumber, number } from '../lib/format.js'

const MARITAL = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
]

const BLANK = { marital: 'married', birthYear: '', pia: '', spouseBirthYear: '', spousePia: '', lifeExpectancy: '87', discount: '0' }
const SAMPLE = { marital: 'married', birthYear: '1962', pia: '3100', spouseBirthYear: '1964', spousePia: '1750', lifeExpectancy: '87', discount: '0' }

// Full retirement age in months from birth.
function fraMonths(birthYear) {
  if (!birthYear) return 67 * 12
  if (birthYear >= 1960) return 67 * 12
  if (birthYear <= 1954) return 66 * 12
  return 66 * 12 + (birthYear - 1954) * 2
}

// Benefit as a fraction of PIA when claimed at `claimMonths` (age in months).
function factor(claimMonths, fra) {
  const diff = claimMonths - fra
  if (diff === 0) return 1
  if (diff < 0) {
    const early = -diff
    const first36 = Math.min(36, early)
    const beyond = Math.max(0, early - 36)
    return 1 - first36 * (5 / 9) / 100 - beyond * (5 / 12) / 100
  }
  const delayed = Math.min(diff, 70 * 12 - fra)
  return 1 + delayed * (2 / 3) / 100
}

function person(birthYear, pia, lifeExp, discount) {
  const fra = fraMonths(birthYear)
  const claims = [
    { id: '62', label: 'Age 62', months: 62 * 12 },
    { id: 'fra', label: `FRA (${Math.floor(fra / 12)}${fra % 12 ? `+${fra % 12}m` : ''})`, months: fra },
    { id: '70', label: 'Age 70', months: 70 * 12 },
  ].map((c) => {
    const f = factor(c.months, fra)
    const monthly = pia * f
    // cumulative to life expectancy, optionally discounted annually
    let cum = 0
    const r = discount / 100
    for (let m = c.months; m < lifeExp * 12; m++) {
      const yrs = (m - 62 * 12) / 12
      cum += monthly / Math.pow(1 + r, yrs)
    }
    return { ...c, factor: f, monthly, cumulative: cum }
  })
  // break-even ages
  const be = (a, b) => {
    // age (years) where cumulative of later claim b overtakes earlier claim a
    let ca = 0, cb = 0
    for (let m = 62 * 12; m <= 100 * 12; m++) {
      if (m >= a.months) ca += a.monthly
      if (m >= b.months) cb += b.monthly
      if (m > b.months && cb >= ca) return m / 12
    }
    return null
  }
  return { fra, claims, be62fra: be(claims[0], claims[1]), beFra70: be(claims[1], claims[2]), be6270: be(claims[0], claims[2]) }
}

function compute(form) {
  const married = form.marital === 'married'
  const lifeExp = Math.max(70, Math.min(100, toNumber(form.lifeExpectancy) || 87))
  const discount = Math.max(0, Math.min(8, toNumber(form.discount)))
  const p1 = person(toNumber(form.birthYear), toNumber(form.pia), lifeExp, discount)
  const p2 = married ? person(toNumber(form.spouseBirthYear), toNumber(form.spousePia), lifeExp, discount) : null
  const best1 = p1.claims.reduce((a, b) => (b.cumulative > a.cumulative ? b : a), p1.claims[0])
  const higher = p2 && toNumber(form.spousePia) > toNumber(form.pia) ? 'spouse' : 'primary'
  const higherP = higher === 'spouse' ? p2 : p1
  return { married, lifeExp, discount, p1, p2, best1, higher, higherP }
}

export default function SocialSecurityTiming() {
  const [form, setForm] = useState(BLANK)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const r = useMemo(() => compute(form), [form])
  const fmtAge = (a) => (a ? `${Math.floor(a)}y ${Math.round((a % 1) * 12)}m` : '—')
  const steps = useMemo(() => {
    const p = r.p1
    const fraY = Math.floor(p.fra / 12), fraM = p.fra % 12
    const early = p.fra - 62 * 12
    const delayed = 70 * 12 - p.fra
    return [
      { label: 'Full retirement age', formula: `birth year ${form.birthYear || '—'} → ${fraY}${fraM ? ` + ${fraM} months` : ''}`, result: `${fraY}${fraM ? `y ${fraM}m` : ''}` },
      { label: 'Claim at 62 — reduction', formula: `${Math.min(36, early)} months × 5/9% + ${Math.max(0, early - 36)} months × 5/12%`, result: `${Math.round(p.claims[0].factor * 100)}% of PIA` },
      { label: 'Claim at 62 — monthly', formula: `PIA × ${p.claims[0].factor.toFixed(4)}`, result: money(p.claims[0].monthly, 2) },
      { label: 'Claim at FRA — monthly', formula: 'PIA × 1.00', result: money(p.claims[1].monthly, 2) },
      { label: 'Claim at 70 — delayed credits', formula: `${delayed} months × 2/3%`, result: `${Math.round(p.claims[2].factor * 100)}% of PIA` },
      { label: 'Claim at 70 — monthly', formula: `PIA × ${p.claims[2].factor.toFixed(4)}`, result: money(p.claims[2].monthly, 2) },
      ...p.claims.map((c) => ({ label: `Lifetime to ${r.lifeExp} — ${c.label}`, formula: `${money(c.monthly, 2)} × ${Math.max(0, r.lifeExp * 12 - c.months)} months${r.discount ? ` discounted at ${r.discount}%/yr` : ''}`, result: money(c.cumulative, 2) })),
      { label: 'Break-even 62 vs. FRA', formula: 'first month where cumulative FRA benefits ≥ cumulative age-62 benefits', result: fmtAge(p.be62fra) },
      { label: 'Break-even FRA vs. 70', formula: 'first month where cumulative age-70 benefits ≥ cumulative FRA benefits', result: fmtAge(p.beFra70) },
      ...(r.married && r.p2 ? [{ label: 'Survivor benefit', formula: `higher earner (${r.higher}) monthly benefit at their claiming age carries to the survivor`, result: `${money(r.higherP.claims[0].monthly, 2)} at 62 · ${money(r.higherP.claims[2].monthly, 2)} at 70` }] : []),
    ]
  }, [r, form.birthYear])

  return (
    <ToolShell
      title="Social Security Timing"
      subtitle="Claim at 62, full retirement age, or 70 — monthly benefit, lifetime value to an assumed age, break-even points, and the survivor consideration for a couple."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
    >
      <div className="tool-grid">
        <div>
          <Panel title="From the Social Security statement">
            <SegmentedField label="Marital status" value={form.marital} onChange={set('marital')} options={MARITAL} />
            <div className="field-row">
              <NumberField label="Birth year" value={form.birthYear} onChange={set('birthYear')} />
              <MoneyField label="Monthly benefit at full retirement age (PIA)" value={form.pia} onChange={set('pia')} info="The 'at full retirement age' figure on the SSA statement, in today's dollars." />
            </div>
            {r.married ? (
              <div className="field-row">
                <NumberField label="Spouse birth year" value={form.spouseBirthYear} onChange={set('spouseBirthYear')} />
                <MoneyField label="Spouse PIA" value={form.spousePia} onChange={set('spousePia')} />
              </div>
            ) : null}
          </Panel>
          <RefinePanel summary="plan-to age, discount rate">
            <SliderField label="Plan to age" value={form.lifeExpectancy} onChange={set('lifeExpectancy')} min={75} max={100} step={1} readout={`${form.lifeExpectancy}`} info="Lifetime totals are counted to this age. A couple should plan to the longer-lived spouse." />
            <SliderField label="Discount rate (real)" value={form.discount} onChange={set('discount')} min={0} max={6} step={0.5} readout={`${form.discount}%`} info="0% compares raw dollars. A positive rate values earlier dollars more, which favors claiming earlier." />
          </RefinePanel>
        </div>

        <div>
          <section className="report">
            <ReportHeader sectionTitle="Claiming Comparison" meta={`Lifetime value to age ${r.lifeExp}${r.discount ? ` · ${r.discount}% discount` : ''}`} metaRight={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <FeatureBlock
              label={`Highest lifetime value${r.married ? ' (primary)' : ''} on these assumptions`}
              value={r.best1.label}
              note={`${money(r.best1.monthly)}/mo · ${money(r.best1.cumulative)} through age ${r.lifeExp}`}
            />
            <StatTiles
              items={[
                { label: 'Waiting from 62 to 70', value: `+${number(((r.p1.claims[2].factor / r.p1.claims[0].factor) - 1) * 100)}%`, tone: 'good', note: 'monthly, for life' },
                { label: 'Break-even 62 vs. FRA', value: fmtAge(r.p1.be62fra) },
                { label: 'Break-even FRA vs. 70', value: fmtAge(r.p1.beFra70) },
              ]}
            />

            <div className="result-list">
              {r.p1.claims.map((c) => (
                <ResultRow key={c.id} label={`${c.label} · ${Math.round(c.factor * 100)}% of PIA · lifetime to ${r.lifeExp}`} value={c.cumulative} total={c.id === r.best1.id} />
              ))}
              <ResultRow label="Break-even: 62 vs. FRA" raw={fmtAge(r.p1.be62fra)} sub />
              <ResultRow label="Break-even: FRA vs. 70" raw={fmtAge(r.p1.beFra70)} sub />
              <ResultRow label="Break-even: 62 vs. 70" raw={fmtAge(r.p1.be6270)} sub />
            </div>

            {r.married && r.p2 ? (
              <>
                <div className="panel-title" style={{ border: 'none', marginTop: 18, paddingBottom: 6 }}>Spouse</div>
                <div className="result-list">
                  {r.p2.claims.map((c) => (
                    <ResultRow key={c.id} label={`${c.label} · ${money(c.monthly)}/mo`} value={c.cumulative} />
                  ))}
                  <ResultRow label={`Survivor benefit if higher earner (${r.higher}) claims at 70`} value={r.higherP.claims[2].monthly} raw={`${money(r.higherP.claims[2].monthly)}/mo`} sub />
                  <ResultRow label={`Survivor benefit if higher earner claims at 62`} raw={`${money(r.higherP.claims[0].monthly)}/mo`} sub />
                </div>
              </>
            ) : null}

            <Narrative>
              Claiming at 62 pays {money(r.p1.claims[0].monthly)} a month; waiting to full retirement age pays {money(r.p1.claims[1].monthly)}; waiting to 70 pays {money(r.p1.claims[2].monthly)} — {number(((r.p1.claims[2].factor / r.p1.claims[0].factor) - 1) * 100)}% more than claiming at 62, for life.
              Waiting from 62 to FRA breaks even around age {fmtAge(r.p1.be62fra)}; FRA to 70 around {fmtAge(r.p1.beFra70)}.
              {r.married
                ? ` For a couple, the higher earner's benefit (${r.higher}) becomes the survivor benefit for whoever lives longer — which is why the higher earner delaying is usually the priority, even if the lower earner claims early.`
                : ''}
            </Narrative>

            <ScenarioCards
              sub={`lifetime to age ${r.lifeExp}`}
              scenarios={r.p1.claims.map((c) => ({
                label: c.label,
                value: money(c.cumulative),
                best: c.id === r.best1.id,
                rows: [
                  { label: 'Monthly benefit', value: money(c.monthly) },
                  { label: 'Share of PIA', value: `${Math.round(c.factor * 100)}%` },
                ],
              }))}
            />

            <div className="chart-block">
              <div className="panel-title" style={{ border: 'none', paddingBottom: 6, marginBottom: 12 }}>Monthly benefit by claiming age{r.married ? ' — primary' : ''}</div>
              <BarCompare height={160} groups={r.p1.claims.map((c, i) => ({ label: c.label, bars: [{ label: 'Monthly', value: c.monthly, color: [TONE.debt, TONE.navy, TONE.accent][i] }] }))} />
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="What the numbers don't capture">
        Health, family longevity, whether the client is still working (the earnings test before FRA), taxation of benefits alongside other income, and the need for cash flow before 70 all matter as much as the break-even math. This tool frames the trade-off; it doesn't decide it.
      </Note>

      <Assumptions
        items={[
          'Early-claiming reduction of 5/9% per month for the first 36 months before FRA and 5/12% per month beyond; delayed credits of 2/3% per month (8%/year) to age 70.',
          'PIA is taken as entered in today’s dollars; cost-of-living adjustments are assumed to affect all choices equally and are not modeled.',
          'Spousal benefits (up to 50% of the higher earner’s PIA) are not modeled — only each person’s own benefit and the survivor effect.',
          'The earnings test for claiming before FRA while still working, and taxation of benefits, are not modeled.',
          'Break-even ages compare cumulative nominal benefits from age 62 onward.',
        ]}
      />
    </ToolShell>
  )
}
