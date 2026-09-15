// Per-tool "Request Client Information" email templates.
// Each entry mirrors the tool's input fields as numbered client questions.
// A shared builder assembles the greeting, sensitive-information reminder, and
// the Grott Luker & Co. signature so every email is consistent and professional.

export const EMAIL_REQUESTS = {
  'withholding-checkup': {
    subject: 'Quick withholding check — one pay stub needed',
    intro:
      'We would like to check whether your federal withholding is on track for the year so there are no surprises in April. Please reply with the following (a photo of your most recent pay stub covers most of it):',
    questions: [
      'Your most recent pay stub: year-to-date taxable wages and year-to-date federal withholding',
      'How often you are paid (weekly, biweekly, semimonthly, monthly) and how many paychecks you have received so far this year',
      'The same two year-to-date figures from your spouse’s pay stub, if filing jointly',
      'Any bonus, commission, or stock vesting still expected this year',
      'Other income without withholding — interest, dividends, side income, retirement distributions',
      'Whether you expect to itemize, and any credits you usually claim (children, dependent care, education)',
    ],
  },

  'mileage-log': {
    subject: 'Your mileage and expense log for this year',
    intro:
      'To make sure you capture every deductible mile and business meal, please keep this log through the year and send it to us in January. It saves on your device as you go and takes one click to submit:',
    questions: [
      'Open the link and enter your name and email once',
      'Add each trip as it happens: date, client, destination, and miles; choose Business, Charity, or Medical',
      'Add business meals with the client and matter discussed; keep receipts for anything $75 or more',
      'In January, click Send to Grott Luker & Co. and we will receive the itemized log with totals',
    ],
  },

  // ---------- CPA Decision Support Toolkit ----------
  'roth-conversion': {
    subject: 'Information needed for your Roth conversion analysis',
    intro:
      'We are evaluating whether a Roth conversion may make sense for you this year. To model the tax cost against the long-term benefit, please reply with the following:',
    questions: [
      'Current balance of your Traditional (pre-tax) IRA / 401(k) accounts',
      'The amount you are considering converting this year',
      'Your tax filing status (married filing jointly or single) and state of residence',
      'Approximate other taxable income you expect this year',
      'Your current age (and your spouse’s, if applicable)',
      'Whether you are currently enrolled in Medicare or will be within two years (relevant to IRMAA)',
    ],
  },

  'owner-comp': {
    subject: 'Information needed for your owner compensation analysis',
    intro:
      'We are reviewing how you pay yourself from your business to compare strategies and estimate the tax difference. Please reply with the following:',
    questions: [
      'Your business’s net profit for the year (before any owner salary/compensation)',
      'Entity type (S-corporation, LLC, partnership, or sole proprietorship)',
      'A reasonable salary estimate for your role and industry, if you have one in mind',
      'Your tax filing status (married filing jointly or single) and state',
      'Approximate other household taxable income (e.g., a spouse’s wages)',
    ],
  },

  'estimated-tax': {
    subject: 'Information needed for your estimated tax and safe harbor review',
    intro:
      'We are projecting your tax for the year and calculating the estimated payments needed to stay in the safe harbor and avoid an underpayment penalty. Please reply with:',
    questions: [
      'Your total expected income for this year (all sources)',
      'Your total tax from last year’s return (used for the safe-harbor test)',
      'Federal tax withholding expected this year (from wages, pensions, etc.)',
      'Estimated tax payments you have already made this year, and on what dates',
      'Your filing status (married filing jointly or single) and state of residence',
    ],
  },

  'multi-year-projection': {
    subject: 'Information needed for your multi-year tax projection',
    intro:
      'We are building a multi-year tax projection to identify planning opportunities such as low-bracket years for Roth conversions or capital gains. Please reply with the following:',
    questions: [
      'Your current age (and your spouse’s, if applicable) and filing status',
      'Expected wages or business income, and the year you plan to stop working',
      'The age(s) at which you plan to begin Social Security, and the expected benefit',
      'Current Traditional IRA / 401(k) balances (for RMD projection)',
      'Any Roth conversions you are considering, and in which years',
      'Any large expected events — a business sale, large capital gain, or major charitable gift — and the year',
    ],
  },

  'qbi-optimizer': {
    subject: 'Information needed for your QBI deduction analysis',
    intro:
      'We are estimating your Section 199A qualified business income (QBI) deduction and how planning moves might affect it. Please reply with the following:',
    questions: [
      'Your qualified business income (net business profit) for the year',
      'The type of business (and whether it is a “specified service” business such as law, accounting, consulting, health, or financial services)',
      'Total W-2 wages the business pays to employees',
      'The unadjusted basis of qualified business property the business owns (UBIA), if significant',
      'Your expected total taxable income and filing status (married filing jointly or single)',
    ],
  },

  // ---------- BlueLine Specialty Planning Tools ----------
  'retire-track': {
    subject: 'Information needed for your retirement readiness review',
    intro:
      'We are preparing a snapshot of whether you are on track to retire comfortably. Approximate figures are perfectly fine. Please reply with:',
    questions: [
      'Your current age and the age at which you would like to retire',
      'Your total current retirement and investment savings',
      'Approximately how much you add to savings each year',
      'Your expected annual Social Security benefit (and any pension)',
      'Your estimated annual spending needs in retirement (in today’s dollars)',
    ],
  },

  'cash-balance': {
    subject: 'Information needed for your Cash Balance Plan review',
    intro:
      'We are reviewing whether a Cash Balance Plan may be worth discussing for your business. To prepare illustrative contribution and deduction ranges, please reply with:',
    questions: [
      'Owner age',
      'Approximate annual income / W-2 compensation from the business',
      'Entity type (sole proprietorship, LLC, partnership, S-corporation, or C-corporation)',
      'Number of employees (excluding owners)',
      'Any existing retirement plans already in place (e.g., 401(k), profit sharing, SEP/SIMPLE)',
    ],
  },

  'rollover-401k': {
    subject: 'Information needed for your 401(k) rollover review',
    intro:
      'We are helping you weigh whether to leave your 401(k) where it is or roll it to an IRA. Please reply with the following:',
    questions: [
      'The current balance of the 401(k) in question',
      'Whether you are still employed by the company that sponsors the plan',
      'The approximate annual fees or expense ratios in the current plan, if known',
      'Whether the plan holds any employer stock (this can have special tax treatment)',
      'Your current age',
      'Whether you have an existing IRA the funds could be rolled into',
    ],
  },

  'divorce-division': {
    subject: 'Information needed for your asset division analysis',
    intro:
      'We are preparing an after-tax view of a proposed property division so that an equal split on paper can be compared with an equal split of what each party actually keeps. Please reply with the following for each significant asset:',
    questions: [
      'A description of each asset to be divided',
      'The type of each asset (e.g., home, taxable brokerage, pre-tax retirement, Roth, cash)',
      'The current value of each asset',
      'The cost basis of each asset, where applicable',
      'The proposed allocation of each asset between the two parties',
      'The names or labels you would like used for each party in the summary',
    ],
  },

  'know-your-numbers': {
    subject: 'Information needed for your financial snapshot',
    intro:
      'We are putting together a clean, one-page snapshot of where things stand today — net worth, cash flow, savings rate, and asset allocation. Approximate figures are fine. Please reply with the following:',
    questions: [
      'Assets: cash and bank accounts, investments (non-retirement), retirement accounts, real estate, business interests, and personal property/other',
      'Liabilities: mortgage, auto loans, student loans, credit card balances, and other debt',
      'Annual income by source (employment, business, investment, other)',
      'Annual expenses (housing, living expenses, debt payments, other)',
      'Approximate amount you save or invest each year',
      'Life insurance coverage amount and any disability coverage (monthly benefit)',
    ],
  },
}

const SENSITIVE_REMINDER =
  'For your security, please do NOT include highly sensitive information such as Social Security numbers, full bank or investment account numbers, or passwords in your reply. Approximate and rounded figures are perfectly acceptable for planning purposes.'

const SIGNATURE = [
  'Thank you,',
  '',
  '[Your Name]',
  'Grott Luker & Co.',
  'Certified Public Accountants',
  'Portsmouth, New Hampshire',
].join('\n')

// Assemble the full plain-text email body for a given tool spec.
export function buildEmail(spec) {
  if (!spec) return { subject: '', body: '' }
  const numbered = spec.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
  const body = [
    'Dear [Client Name],',
    '',
    spec.intro,
    '',
    numbered,
    '',
    SENSITIVE_REMINDER,
    '',
    SIGNATURE,
  ].join('\n')
  return { subject: spec.subject, body }
}
