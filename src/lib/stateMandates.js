// State "auto-IRA" mandates for private employers. No state requires an employer to sponsor a 401(k) or to contribute:
// every mandate is "offer a qualified plan (401(k), SEP, SIMPLE, etc.) OR enroll employees in the state-run payroll-deduction
// IRA", and the state IRAs take no employer contribution. Researched and independently verified 2026-10-28 against
// statutes, rules and each program's own site. Thresholds are counted differently in every state, so the page says
// "confirm" and gives only the headline test. Re-verify each January: thresholds were lowered in 2025–26 (CA, NJ, VA, VT).
export const MANDATES_AS_OF = 'October 2026'

// min: the smallest employee count at which the mandate can apply (approximate; counting rules differ).
// live: false means enacted but not yet open to employers.
export const STATE_MANDATES = {
  CA: { name: 'California', program: 'CalSavers', min: 1, live: true, rule: '1 or more employees, no minimum time in business; penalties of $250 and then $500 per employee' },
  CO: { name: 'Colorado', program: 'Colorado SecureSavings', min: 5, live: true, rule: '5 or more employees at any time in the prior year and 2 or more years in business' },
  CT: { name: 'Connecticut', program: 'MyCTSavings', min: 5, live: true, rule: '5 or more employees on October 1 of the prior year, 5 of them paid $5,000 or more' },
  DE: { name: 'Delaware', program: 'Delaware EARNS', min: 5, live: true, rule: '5 or more employees and 6 or more months in business' },
  HI: { name: 'Hawaii', program: 'HISavers', min: 1, live: false, rule: '1 or more employees once the program opens (no date set yet)' },
  IL: { name: 'Illinois', program: 'My Illinois Savings', min: 5, live: true, rule: '5 or more employees in every quarter of the prior year and 2 or more years in business; $250 then $500 per employee' },
  MD: { name: 'Maryland', program: 'MarylandSaves', min: 1, live: true, rule: 'any employer that pays through a payroll system; the only consequence is losing a waiver of the annual report fee' },
  ME: { name: 'Maine', program: 'Maine Retirement Savings (MERIT)', min: 5, live: true, rule: '5 or more employees and 2 or more years in business; penalties begin in 2026' },
  MN: { name: 'Minnesota', program: 'Minnesota Secure Choice', min: 5, live: true, rule: '5 or more employees; registration deadlines run by size through June 30, 2028' },
  NJ: { name: 'New Jersey', program: 'RetireReady NJ', min: 10, live: true, rule: '10 or more employees all of the prior year (lowered from 25 in 2026); 20–24 employees register by Dec 1, 2026, 10–19 by Feb 17, 2027' },
  NV: { name: 'Nevada', program: 'Nevada Employee Savings Trust', min: 6, live: true, rule: 'more than 5 employees and 3 or more years in business' },
  NY: { name: 'New York', program: 'NY Secure Choice', min: 10, live: true, rule: '10 or more employees all of the prior year and 2 or more years in business; newly eligible employers register by Nov 18, 2026' },
  OR: { name: 'Oregon', program: 'OregonSaves', min: 1, live: true, rule: 'every employer with an employee, no size minimum; up to $100 per employee' },
  RI: { name: 'Rhode Island', program: 'RISavers', min: 5, live: true, rule: '5 or more employees; deadlines by size: over 100 on Oct 15, 2026, 50–99 in Oct 2027, 5–49 in Oct 2028' },
  VA: { name: 'Virginia', program: 'RetirePath Virginia', min: 5, live: true, rule: '5 or more eligible employees since July 1, 2026 (it was 25)' },
  VT: { name: 'Vermont', program: 'Vermont Saves', min: 2, live: true, rule: '2 or more employees at any time in a year' },
  WA: { name: 'Washington', program: 'Washington Saves', min: 5, live: false, rule: 'about 5 full-time workers (10,400 hours) and 2 or more years in business, once it opens (by July 2027)' },
}

// The flag for one state and headcount, or null when no state program applies. `headcount` is every employee entered
// (covered or not), because the state counts employees, not plan participants.
export function mandateFor(stateCode, headcount) {
  const m = STATE_MANDATES[stateCode]
  if (!m || !(headcount >= m.min) || headcount < 1) return null
  const tail = 'A SEP, SIMPLE or 401(k) meets it, and the state IRA takes no employer contribution. Counting rules and dates differ, so confirm.'
  const text = m.live
    ? `${m.name} (${m.program}) requires employers with ${m.rule} that do not offer a retirement plan to enroll employees in the state IRA. ${tail}`
    : `${m.name} has enacted ${m.program}, which is not open yet: it will cover employers with ${m.rule} that do not offer a plan. ${tail}`
  const short = `${m.name}'s ${m.program} ${m.live ? 'requires' : 'will require'} employers with ${m.min === 1 ? 'any employee' : `${m.min} or more employees`} that offer no plan to enroll staff in the state IRA; a SEP, SIMPLE or 401(k) meets it.`
  return { code: stateCode, ...m, text, short }
}
