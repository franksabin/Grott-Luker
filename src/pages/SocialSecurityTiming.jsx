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
import { BarCompare, LineChart, TONE } from '../components/charts.jsx'
import { PrintDoc, PrintPage, PrintBand, PrintPageHead, PrintSection, PrintFeature, PrintTiles, PrintRows, PrintTable, PrintProse, PrintNote, PrintInputs, PrintAssumptions, PrintFooter, PrintCols } from '../components/PrintReport.jsx'
import { money, toNumber, number, percent } from '../lib/format.js'

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

// Survivor benefit (paid at the survivor's own FRA) when the worker claimed at `claimMonths`:
// the worker's benefit, floored at 82.5% of PIA if the worker claimed before FRA (the RIB-LIM rule).
const SURVIVOR_FLOOR = 0.825
function survivorBenefit(monthly, claimMonths, fra, pia) {
  return claimMonths < fra ? Math.max(monthly, SURVIVOR_FLOOR * pia) : monthly
}

function person(birthYear, pia, lifeExp, discount) {
  const fra = fraMonths(birthYear)
  const fraY = Math.floor(fra / 12), fraM = fra % 12
  const claims = [
    { id: '62', label: 'Age 62', long: 'age 62', months: 62 * 12 },
    { id: 'fra', label: `FRA (${fraY}${fraM ? `+${fraM}m` : ''})`, long: `full retirement age (${fraY}${fraM ? ` and ${fraM} months` : ''})`, months: fra },
    { id: '70', label: 'Age 70', long: 'age 70', months: 70 * 12 },
  ].map((c) => {
    const f = factor(c.months, fra)
    const monthly = pia * f
    const survivor = survivorBenefit(monthly, c.months, fra, pia)
    // cumulative to life expectancy, optionally discounted annually;
    // `curve` records the running total at each birthday from 62 to lifeExp (for the print chart)
    let cum = 0
    const r = discount / 100
    const curve = [0]
    for (let m = 62 * 12; m < lifeExp * 12; m++) {
      if (m >= c.months) {
        const yrs = (m - 62 * 12) / 12
        cum += monthly / Math.pow(1 + r, yrs)
      }
      if ((m + 1) % 12 === 0) curve.push(cum)
    }
    return { ...c, factor: f, monthly, survivor, cumulative: cum, curve }
  })
  // break-even ages (always undiscounted); undefined until a PIA is entered
  const be = (a, b) => {
    if (!(a.monthly > 0) || !(b.monthly > 0)) return null
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
      ...(r.married && r.p2 ? [{ label: 'Survivor benefit', formula: `higher earner (${r.higher}) monthly benefit at their claiming age carries to the survivor; if claimed before FRA, floored at 82.5% × PIA (${money(SURVIVOR_FLOOR * r.higherP.claims[1].monthly, 2)})`, result: `${money(r.higherP.claims[0].survivor, 2)} at 62 · ${money(r.higherP.claims[2].survivor, 2)} at 70` }] : []),
    ]
  }, [r, form.birthYear])

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const gain6270 = number(((r.p1.claims[2].factor / r.p1.claims[0].factor) - 1) * 100)
  const L = r.lifeExp
  const hasPia = r.p1.claims[1].monthly > 0
  // break-even ages are always undiscounted; flag any that fall past the plan-to age
  const past = (a) => a != null && a > L
  const fmtBE = (a) => (a == null ? '—' : past(a) ? `${fmtAge(a)} · past ${L}` : fmtAge(a))
  const beProse = (a) => `${fmtAge(a)}${past(a) ? ` (past ${L})` : ''}`
  const anyBeyond = [r.p1.be62fra, r.p1.beFra70, r.p1.be6270].some(past)
  const allBeyond = [r.p1.be62fra, r.p1.beFra70, r.p1.be6270].every(past)
  const beLabel = (s) => `Break-even: ${s}${r.discount ? ' (undiscounted)' : ''}`
  // one narrative, used on screen and in print so the two always agree
  const narrative = `Claiming at 62 pays ${money(r.p1.claims[0].monthly)} a month; waiting to full retirement age pays ${money(r.p1.claims[1].monthly)}; waiting to 70 pays ${money(r.p1.claims[2].monthly)} — ${gain6270}% more than claiming at 62, for life.`
    + (hasPia
      ? ` ${r.discount ? 'In undiscounted dollars, waiting' : 'Waiting'} from 62 to FRA breaks even around age ${beProse(r.p1.be62fra)}; FRA to 70 around ${beProse(r.p1.beFra70)}.`
      : ' Enter the monthly benefit at full retirement age (PIA) from the Social Security statement to see the dollar amounts and break-even ages.')
    + (r.married
      ? ` For a couple, the higher earner's benefit (${r.higher}) becomes the survivor benefit for whoever lives longer — which is why the higher earner delaying is usually the priority, even if the lower earner claims early.`
      : '')
  const floorBinds = r.married && r.p2 ? r.higherP.claims[0].survivor > r.higherP.claims[0].monthly : false
  const lineNote = r.discount
    ? 'break-even ages on page 1 are in undiscounted dollars'
    : allBeyond
      ? `the lines do not cross before age ${L} — every break-even falls past the horizon`
      : anyBeyond
        ? `where the lines cross is the break-even age; crossings past age ${L} are off the chart`
        : 'where the lines cross is the break-even age'
  // section notes: say so when lifetime values are discounted (break-even ages are always nominal)
  const toAgeNote = `benefits counted to age ${L}${r.discount ? `, discounted at ${r.discount}%` : ''}`
  const pctFmt = (v) => `${Math.round(v)}%`
  const noPiaProse = 'Enter the monthly benefit at full retirement age (PIA) from the Social Security statement — the “at full retirement age” figure on ssa.gov/myaccount — to see monthly benefits, lifetime values, break-even ages, and the charts.'
  const assumptions = [
    'Early-claiming reduction of 5/9% per month for the first 36 months before FRA and 5/12% per month beyond; delayed credits of 2/3% per month (8%/year) to age 70.',
    'PIA is taken as entered in today’s dollars; cost-of-living adjustments are assumed to affect all choices equally and are not modeled.',
    'Spousal benefits (up to 50% of the higher earner’s PIA) are not modeled — only each person’s own benefit and the survivor effect.',
    'Survivor benefit: the higher earner’s benefit at their claiming age, paid at the survivor’s FRA; if claimed before FRA, the survivor gets at least 82.5% of the higher earner’s PIA (the RIB-LIM floor).',
    'The earnings test for claiming before FRA while still working, and taxation of benefits, are not modeled.',
    'Break-even ages compare cumulative undiscounted benefits from age 62 onward.',
  ]
  const inputs = [
    ['Marital status', r.married ? 'Married' : 'Single'],
    ['Birth year', form.birthYear || '—'],
    ['Monthly benefit at full retirement age (PIA)', money(toNumber(form.pia))],
    ...(r.married ? [
      ['Spouse birth year', form.spouseBirthYear || '—'],
      ['Spouse PIA', money(toNumber(form.spousePia))],
    ] : []),
    ['Plan to age', `${L}`],
    ['Discount rate (real)', `${r.discount}%`],
  ]
  const printReport = (
    <PrintDoc>
      <PrintPage compact>
        <PrintBand
          title="Social Security Claiming Comparison"
          subtitle="Claim at 62, full retirement age, or 70 — monthly benefit, lifetime value, and break-even ages."
          meta={`${r.married ? 'Married couple' : 'Single'} · lifetime value to age ${L} · ${r.discount ? `${r.discount}% real discount` : 'undiscounted dollars'}`}
          metaRight={today}
        />
        {hasPia ? (
          <PrintFeature
            label={`Highest lifetime value${r.married ? ' (primary)' : ''} on these assumptions: claiming at ${r.best1.long}`}
            value={money(r.best1.cumulative)}
            note={`${money(r.best1.monthly)} a month for life · counted through age ${L}${r.discount ? `, discounted at ${r.discount}%` : ''}`}
          />
        ) : (
          <PrintFeature
            label="Waiting from 62 to 70 raises the monthly benefit by"
            value={`+${gain6270}%`}
            note="for life · enter the PIA from the Social Security statement to see dollar amounts, lifetime values, and break-even ages"
          />
        )}
        <PrintTiles
          items={[
            ...r.p1.claims.map((c) => ({ label: c.label, value: `${money(c.monthly)}/mo`, note: `${Math.round(c.factor * 100)}% of PIA · ${money(c.cumulative)} ${r.discount ? 'discounted' : 'lifetime'}`, best: c.id === r.best1.id })),
            { label: 'Waiting from 62 to 70', value: `+${gain6270}%`, note: 'monthly, for life' },
          ]}
        />
        <PrintSection title={`Lifetime value by claiming age${r.married ? ' — primary' : ''}`} note={toAgeNote}>
          <PrintRows
            rows={[
              ...r.p1.claims.map((c) => ({ label: `${c.label} · ${Math.round(c.factor * 100)}% of PIA · ${money(c.monthly)}/mo`, value: money(c.cumulative), total: c.id === r.best1.id })),
              { label: beLabel('62 vs. FRA'), value: fmtBE(r.p1.be62fra), sub: true },
              { label: beLabel('FRA vs. 70'), value: fmtBE(r.p1.beFra70), sub: true },
              { label: beLabel('62 vs. 70'), value: fmtBE(r.p1.be6270), sub: true },
            ]}
          />
        </PrintSection>
        <PrintSection title="What this means">
          <PrintProse>{narrative}</PrintProse>
        </PrintSection>
        <PrintSection
          title={`${hasPia ? 'Monthly benefit' : 'Share of PIA'} by claiming age${r.married ? ' — primary' : ''}`}
          note={hasPia ? undefined : 'enter the PIA to see dollar amounts'}
          className="pr-chart"
        >
          {hasPia
            ? <BarCompare height={230} legend={false} groups={r.p1.claims.map((c, i) => ({ label: c.label, bars: [{ label: 'Monthly', value: c.monthly, color: [TONE.debt, TONE.navy, TONE.accent][i] }] }))} />
            : <BarCompare height={230} legend={false} format={pctFmt} groups={r.p1.claims.map((c, i) => ({ label: c.label, bars: [{ label: 'Share of PIA', value: c.factor * 100, color: [TONE.debt, TONE.navy, TONE.accent][i] }] }))} />}
        </PrintSection>
        <PrintFooter page={1} pages={2} />
      </PrintPage>
      <PrintPage last compact>
        <PrintPageHead title="Social Security Claiming Comparison" right={today} />
        {hasPia ? (
          <PrintSection
            title={`Cumulative benefits by age${r.discount ? ` (discounted at ${r.discount}%)` : ''}${r.married ? ' — primary' : ''}`}
            note={lineNote}
            className="pr-chart"
          >
            <LineChart
              xStart="Age 62"
              xEnd={`Age ${L}`}
              series={r.p1.claims.map((c, i) => ({ label: c.label, color: [TONE.debt, TONE.navy, TONE.accent][i], points: c.curve }))}
            />
          </PrintSection>
        ) : (
          <PrintSection title="Share of PIA by claiming age" note={`full retirement age ${Math.floor(r.p1.fra / 12)}${r.p1.fra % 12 ? `+${r.p1.fra % 12}m` : ''}`}>
            <PrintProse>{noPiaProse} The reduction and credit schedule below depends only on the birth year and applies to whatever PIA the statement shows.</PrintProse>
            <PrintTable
              head={['Claim at', 'Months from FRA', 'Share of PIA', 'Change vs. FRA']}
              widths={['25%', '25%', '25%', '25%']}
              align={['left', 'right', 'right', 'right']}
              rows={[62, 63, 64, 65, 66, 67, 68, 69, 70].map((age) => {
                const f = factor(age * 12, r.p1.fra)
                const d = age * 12 - r.p1.fra
                return [`Age ${age}${age * 12 === r.p1.fra ? ' (FRA)' : ''}`, d === 0 ? '—' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`, `${number(f * 100, 1)}%`, d === 0 ? '—' : `${f >= 1 ? '+' : '−'}${number(Math.abs(f - 1) * 100, 1)}%`]
              })}
              rowClass={(row, i) => ([62, 63, 64, 65, 66, 67, 68, 69, 70][i] * 12 === r.p1.fra ? 'is-strong' : '')}
            />
          </PrintSection>
        )}
        <PrintSection title={`Claiming detail${r.married ? ' — primary' : ''}`} note={toAgeNote}>
          <PrintTable
            head={['Claim at', 'Share of PIA', 'Monthly benefit', `Lifetime to ${L}`, 'Months paid']}
            widths={['24%', '19%', '19%', '20%', '18%']}
            rows={r.p1.claims.map((c) => [c.label, `${Math.round(c.factor * 100)}%`, money(c.monthly), money(c.cumulative), number(Math.max(0, L * 12 - c.months))])}
          />
        </PrintSection>
        {r.married && r.p2 ? (
          <PrintCols>
            <PrintSection title="Spouse" note={toAgeNote}>
              <PrintRows
                rows={r.p2.claims.map((c) => ({ label: `${c.label} · ${money(c.monthly)}/mo`, value: money(c.cumulative) }))}
              />
            </PrintSection>
            <PrintSection title="Survivor benefit" note={`higher earner: ${r.higher} · paid at the survivor’s FRA`}>
              <PrintRows
                rows={[
                  { label: 'If the higher earner claims at 70', value: `${money(r.higherP.claims[2].survivor)}/mo` },
                  { label: 'If the higher earner claims at FRA', value: `${money(r.higherP.claims[1].survivor)}/mo` },
                  { label: `If the higher earner claims at 62${floorBinds ? ' (82.5% floor)' : ''}`, value: `${money(r.higherP.claims[0].survivor)}/mo` },
                ]}
              />
            </PrintSection>
          </PrintCols>
        ) : null}
        <PrintNote title="Reading the result">
          Health, family longevity, whether the client is still working (the earnings test before FRA), taxation of benefits alongside other income, and the need for cash flow before 70 all matter as much as the break-even math. This tool frames the trade-off; it doesn't decide it.
        </PrintNote>
        <PrintCols>
          <PrintSection title="Inputs used in this estimate">
            <PrintInputs items={inputs} />
          </PrintSection>
          <PrintSection title="Assumptions">
            <PrintAssumptions items={assumptions} />
          </PrintSection>
        </PrintCols>
        <PrintFooter page={2} pages={2} />
      </PrintPage>
    </PrintDoc>
  )

  return (
    <ToolShell
      title="Social Security Timing"
      subtitle="Claim at 62, full retirement age, or 70 — monthly benefit, lifetime value to an assumed age, break-even points, and the survivor consideration for a couple."
      onReset={() => setForm(BLANK)}
      onSample={() => setForm(SAMPLE)}
      steps={steps}
      printReport={printReport}
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
                { label: 'Break-even 62 vs. FRA', value: fmtBE(r.p1.be62fra), note: r.discount ? 'undiscounted' : undefined },
                { label: 'Break-even FRA vs. 70', value: fmtBE(r.p1.beFra70), note: r.discount ? 'undiscounted' : undefined },
              ]}
            />

            <div className="result-list">
              {r.p1.claims.map((c) => (
                <ResultRow key={c.id} label={`${c.label} · ${Math.round(c.factor * 100)}% of PIA · lifetime to ${r.lifeExp}${r.discount ? ', discounted' : ''}`} value={c.cumulative} total={c.id === r.best1.id} />
              ))}
              <ResultRow label={beLabel('62 vs. FRA')} raw={fmtBE(r.p1.be62fra)} sub />
              <ResultRow label={beLabel('FRA vs. 70')} raw={fmtBE(r.p1.beFra70)} sub />
              <ResultRow label={beLabel('62 vs. 70')} raw={fmtBE(r.p1.be6270)} sub />
            </div>

            {r.married && r.p2 ? (
              <>
                <div className="panel-title" style={{ border: 'none', marginTop: 18, paddingBottom: 6 }}>Spouse</div>
                <div className="result-list">
                  {r.p2.claims.map((c) => (
                    <ResultRow key={c.id} label={`${c.label} · ${money(c.monthly)}/mo`} value={c.cumulative} />
                  ))}
                  <ResultRow label={`Survivor benefit if higher earner (${r.higher}) claims at 70`} value={r.higherP.claims[2].survivor} raw={`${money(r.higherP.claims[2].survivor)}/mo`} sub />
                  <ResultRow label={`Survivor benefit if higher earner claims at FRA`} raw={`${money(r.higherP.claims[1].survivor)}/mo`} sub />
                  <ResultRow label={`Survivor benefit if higher earner claims at 62${floorBinds ? ' (82.5% floor)' : ''}`} raw={`${money(r.higherP.claims[0].survivor)}/mo`} sub />
                </div>
              </>
            ) : null}

            <Narrative>{narrative}</Narrative>

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
              {hasPia
                ? <BarCompare height={160} groups={r.p1.claims.map((c, i) => ({ label: c.label, bars: [{ label: 'Monthly', value: c.monthly, color: [TONE.debt, TONE.navy, TONE.accent][i] }] }))} />
                : <BarCompare height={160} format={pctFmt} groups={r.p1.claims.map((c, i) => ({ label: c.label, bars: [{ label: 'Share of PIA', value: c.factor * 100, color: [TONE.debt, TONE.navy, TONE.accent][i] }] }))} />}
            </div>
            <div className="report-footer">Prepared for discussion with Grott Luker &amp; Co.</div>
          </section>
        </div>
      </div>

      <Note title="What the numbers don't capture">
        Health, family longevity, whether the client is still working (the earnings test before FRA), taxation of benefits alongside other income, and the need for cash flow before 70 all matter as much as the break-even math. This tool frames the trade-off; it doesn't decide it.
      </Note>

      <Assumptions items={assumptions} />
    </ToolShell>
  )
}
