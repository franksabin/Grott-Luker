// Entity-level state business taxes for the owner-compensation comparison.
//
// The comparison used to apply one flat personal-income rate to both structures in every state.
// Several states also tax the BUSINESS, and they treat a sole proprietor and an S corporation
// differently. This module holds one profile per state and a small set of rules. A state with no
// reviewed profile is reported as "not modeled" and never as a clean zero.
//
// Everything is in whole dollars. The tax year is TAX_YEAR (2026); thresholds are keyed by year.
//
// Sources, verified against the statute text on gc.nh.gov and DRA's published 2026 figures:
//   RSA 77-A:2 III   BPT 7.5% for periods ending on or after 12/31/2023
//   RSA 77-A:4 III   owner-compensation deduction (proprietorships and partnerships only), capped
//                    at earned income, record-keeping safe harbor up to $75,000
//   RSA 77-A:4 VII   BPT and other net-income taxes are added back in computing the BPT base
//                    (the BET is not, so it is deductible)
//   RSA 77-A:5 X     BET paid is a credit against the BPT, carried forward 10 periods
//   RSA 77-A:6       BPT return required above a gross business income threshold ($109,000 for 2025-2026)
//   RSA 77-E:1       BET base = compensation + interest + dividends paid
//   RSA 77-E:2 II    BET 0.55%
//   RSA 77-E:5       BET return required above $298,000 of gross receipts or base for 2025-2026,
//                    $400,000 from January 1, 2027
import { selfEmploymentTax, TAX_YEAR } from './tax.js'

const R = Math.round

export const NH = {
  bptRate: 7.5, // percent; editable on the page (a 2025 bill proposed 8.5%, not confirmed enacted)
  betRate: 0.55, // percent
  safeHarbor: 75000,
}

// Return-filing thresholds by tax year. The BPT figure is adjusted again for 2027; use the latest known.
export function nhThresholds(year = TAX_YEAR) {
  return { bpt: 109000, bet: year >= 2027 ? 400000 : 298000 }
}

// How a sole proprietor's owner-pay deduction (RSA 77-A:4 III) is set.
export const NH_PAY_METHODS = [
  { value: 'salary', label: 'Same as the S-corp salary' },
  { value: 'safe', label: '$75,000 safe harbor' },
  { value: 'earned', label: 'Full earned income' },
  { value: 'custom', label: 'A set amount' },
]

// Federal treatment of the NH BPT paid by a sole proprietor. Rev. Rul. 81-288 holds that a sole proprietor
// deducts the BPT in computing adjusted gross income (IRC 62(1)), because the tax falls on the business
// and not on income in general. That is the default. The alternative treats it as a personal state tax
// that is not deducted here (the comparison uses the standard deduction). An S corporation's entity-level
// tax is always a business deduction.
export const NH_SOLE_FED_OPTIONS = [
  { value: 'expense', label: 'Business expense (Rev. Rul. 81-288)' },
  { value: 'itemized', label: 'Personal state tax, not deducted here' },
]

// States with a reviewed entity-level profile. `sole` and `scorp` say what this tool models.
export const MODELED_STATES = {
  NH: {
    label: 'The New Hampshire Business Profits Tax and Business Enterprise Tax',
    summary: 'Business Profits Tax 7.5% and Business Enterprise Tax 0.55%, with the BET credited against the BPT.',
    limits: [
      'New Hampshire: the BET base uses net self-employment earnings for a sole proprietor and salary plus distributions for an S corporation. The deduction for compensation retained in the business (RSA 77-E:3 I), apportionment, net operating losses and credits are not modeled.',
      'New Hampshire: the BET is treated as deductible in computing the BPT base and the BPT as added back, as the statute provides. A BET credit larger than the BPT is carried forward and shown, but not counted as a benefit this year.',
    ],
  },
  CA: {
    label: 'The California S corporation franchise tax',
    summary: 'S corporation franchise tax of 1.5% of net income, $800 minimum.',
    limits: ['California: a disregarded LLC would owe the $800 minimum and a gross-receipts fee, which are not modeled; a sole proprietor without an LLC owes neither. The S corporation tax is modeled; the first-year minimum waiver is not.'],
  },
  IL: {
    label: 'The Illinois replacement tax',
    summary: 'Personal property replacement tax of 1.5% of an S corporation\'s net income.',
    limits: ['Illinois: a sole proprietor is not assumed to owe the replacement tax. The optional pass-through entity tax election is not modeled.'],
  },
  MA: {
    label: 'The Massachusetts corporate excise',
    summary: 'S corporation excise: the $456 minimum. The income measure starts at $6 million of receipts.',
    limits: ['Massachusetts: only the $456 minimum is modeled; the property or net-worth measure ($2.60 per $1,000) and the income measure at $6 million of receipts or more are not. A sole proprietor is not assumed to owe the excise.'],
  },
}

// States known to have business or gross-receipts taxes this tool does not model yet.
const KNOWN_NOT_MODELED = {
  TN: 'Tennessee levies an excise tax on S corporations and LLCs.',
  TX: 'Texas levies a franchise (margin) tax on LLCs and corporations above a revenue threshold.',
  WA: 'Washington levies a business and occupation tax on gross receipts.',
  OH: 'Ohio levies a commercial activity tax on gross receipts above a threshold.',
  NY: 'New York City taxes unincorporated businesses and corporations separately.',
}

export function businessStateInfo(code, stateName) {
  const modeled = MODELED_STATES[code]
  if (modeled) return { code, name: stateName, status: 'modeled', summary: modeled.summary, limits: modeled.limits, notice: '' }
  const known = KNOWN_NOT_MODELED[code]
  return {
    code,
    name: stateName,
    status: 'unreviewed',
    summary: '',
    limits: [],
    notice: `Entity-level business taxes for ${stateName} are not modeled. ${known ? `${known} ` : ''}The comparison uses only the owner's personal income tax. This tool models entity-level taxes for ${Object.keys(MODELED_STATES).join(', ')}.`,
  }
}

// f: { netProfit, salary, employerFica, grossReceipts (null → assumed above the BPT threshold), taxYear, nhBptRatePct,
//      nhPayMethod, nhPayCustom, nhSoleFed ('expense' default | 'itemized') }
// Returns the entity-level tax for one structure ('sole' or 'scorp') in the business state.
export function entityTax(code, structure, f) {
  const year = f.taxYear || TAX_YEAR
  const netProfit = Math.max(0, R(f.netProfit || 0))
  const salary = Math.max(0, R(f.salary || 0))
  const employerFica = Math.max(0, R(f.employerFica || 0))
  const empty = { code, structure, applies: false, lines: [], total: 0, federalDeduction: 0, bet: 0, bpt: 0, credit: 0, unusedCredit: 0, notes: [] }

  // ---------- New Hampshire ----------
  if (code === 'NH') {
    const th = nhThresholds(year)
    // Gross receipts blank: assume they exceed the BPT threshold, so a return is required and the tax shows. A
    // business with little profit can still have receipts over $109,000; entering them replaces the assumption.
    const grossAssumed = f.grossReceipts == null
    const gross = Math.max(netProfit, R(grossAssumed ? Math.max(netProfit, th.bpt + 1) : f.grossReceipts))
    const bptRate = (Number.isFinite(f.nhBptRatePct) ? f.nhBptRatePct : NH.bptRate) / 100
    const betRate = NH.betRate / 100
    let betBase
    let ownerPay = 0
    let ownerPayCap = null
    if (structure === 'scorp') {
      // Compensation (W-2 salary) plus dividends (the distribution of what is left); no interest assumed.
      betBase = salary + Math.max(0, netProfit - salary - employerFica)
    } else {
      // Net earnings from self-employment subject to tax under IRC 1401 (RSA 77-E:1 V).
      betBase = R(netProfit * 0.9235)
    }
    const bptFile = gross > th.bpt
    const betFile = gross > th.bet || betBase > th.bet
    const bet = betFile ? R(betBase * betRate) : 0

    let bptBase
    const bptDeductible = structure === 'scorp' || f.nhSoleFed !== 'itemized'
    if (structure === 'scorp') {
      bptBase = Math.max(0, netProfit - salary - employerFica - bet)
    } else {
      // Sole proprietor or disregarded LLC. Earned income for RSA 77-A:4 III(a) is net earnings from
      // self-employment under IRC 1402, 92.35% of Schedule C profit (N.H. Code Admin. Rules Rev 301.13), and the
      // deduction is allowed only when that is at least $400. When the BPT is deducted on Schedule C it lowers
      // Schedule C profit, and so earned income, and the BPT is added back for NH; solve that loop.
      const x = netProfit - bet // Schedule C profit after the BET, before any BPT
      const method = f.nhPayMethod || 'salary'
      let guess = 0
      for (let k = 0; k < 40; k++) {
        const schedC = x - (bptDeductible ? guess : 0)
        const earned = schedC * 0.9235 >= 400 ? R(schedC * 0.9235) : 0
        const wanted = method === 'safe' ? NH.safeHarbor : method === 'earned' ? earned : method === 'custom' ? Math.max(0, R(f.nhPayCustom || 0)) : salary
        ownerPayCap = earned
        ownerPay = Math.min(wanted, earned, Math.max(0, x))
        bptBase = Math.max(0, x - ownerPay)
        const after = bptFile ? R(bptBase * bptRate) - Math.min(bet, R(bptBase * bptRate)) : 0
        if (after === guess || !bptDeductible) break
        guess = after
      }
    }
    const bpt = bptFile ? R(bptBase * bptRate) : 0
    const credit = Math.min(bet, bpt)
    const bptAfterCredit = bpt - credit
    const total = bptAfterCredit + bet
    const unusedCredit = bet - credit
    // Federal deduction: an S corporation's own taxes are all deductible. A sole proprietor deducts the BET
    // (a business tax) and, by default, the BPT too (Rev. Rul. 81-288); the alternative leaves it undeducted.
    const federalDeduction = bet + (bptDeductible ? bptAfterCredit : 0)
    const notes = []
    if (!bptFile && !betFile) notes.push(`Below both New Hampshire return thresholds ($${th.bpt.toLocaleString('en-US')} of gross business income for the BPT, $${th.bet.toLocaleString('en-US')} of gross receipts or base for the BET), so no business tax is shown.`)
    if (bptFile && !betFile) notes.push(`Gross receipts are at or below the BET threshold of $${th.bet.toLocaleString('en-US')}, so no BET is shown.`)
    if (grossAssumed) notes.push(`Gross receipts were not entered, so they are assumed to exceed the $${th.bpt.toLocaleString('en-US')} BPT threshold. Enter them to test the thresholds.`)
    return {
      ...empty,
      applies: true,
      bptFile,
      betFile,
      thresholds: th,
      grossReceipts: gross,
      grossAssumed,
      betBase,
      bptBase,
      bptRate,
      ownerPay,
      ownerPayCap,
      bet,
      bpt,
      credit,
      bptAfterCredit,
      unusedCredit,
      total,
      federalDeduction,
      bptDeductible,
      lines: [
        { id: 'bpt', label: 'Business Profits Tax', amount: bpt },
        { id: 'bet', label: 'Business Enterprise Tax', amount: bet },
        { id: 'credit', label: 'BET credited against the BPT', amount: -credit },
      ],
      notes,
    }
  }

  // ---------- Flat-percentage and minimum-tax states (S corporations only) ----------
  const profile = MODELED_STATES[code]
  if (profile) {
    if (structure !== 'scorp') return { ...empty, notes: [`${profile.label} applies to an S corporation; a sole proprietor is not assumed to owe it.`] }
    const base = Math.max(0, netProfit - salary - employerFica) // S corporation net income before this tax
    let tax = 0
    let label = ''
    const notes = []
    if (code === 'CA') {
      tax = Math.max(800, R(base * 0.015))
      label = 'California S corporation franchise tax'
    } else if (code === 'IL') {
      tax = R(base * 0.015)
      label = 'Illinois replacement tax'
    } else if (code === 'MA') {
      tax = 456
      label = 'Massachusetts corporate excise, minimum'
      if (Math.max(netProfit, f.grossReceipts || 0) >= 6000000) notes.push('Receipts of $6 million or more owe the income measure of the excise, which is not modeled.')
    }
    return { ...empty, applies: true, total: tax, federalDeduction: tax, base, lines: [{ id: code.toLowerCase(), label, amount: tax }], notes }
  }

  return empty
}
