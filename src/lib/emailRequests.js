// Per-tool "Request Client Information" email templates.
// Each entry mirrors the tool's input fields as numbered client questions.
// A shared builder assembles the greeting, sensitive-information reminder, and
// the Grott Luker & Co. signature so every email is consistent and professional.

export const EMAIL_REQUESTS = {
  'charitable-donation-log': {
    templateIntro: 'To make sure every charitable gift you make this year is counted and properly documented, we have put together a simple Excel log for you.',
    templateSteps: [
      'Log each gift on the Gifts sheet: date, organization, type (cash, goods, or securities), and the amount or value.',
      'For stock or fund shares, add the cost basis and whether you held them more than a year. The sheet calculates the deductible amount.',
      'Watch the Flags column: it tells you when a gift of $250 or more needs a receipt letter from the charity, and when an appraisal may be required.',
    ],
    templateClose: 'In January, email the file back to us along with your receipt letters.',
    subject: 'Your charitable donation log for this year',
    intro:
      'To make sure every gift is documented the way the IRS requires, please keep this log through the year and send it to us in January. It flags when a receipt letter or appraisal is needed as you enter each gift.',
    questions: [
      'Cash gifts: date, organization, and amount',
      'Donated goods: date, organization, what was given, and a fair-market-value estimate',
      'Appreciated stock or fund shares given: date, organization, shares, value on the gift date, and what you paid',
      'Whether you received a written acknowledgment for each gift of $250 or more',
    ],
  },

  'capital-gains-harvesting': {
    subject: 'Information needed for year-end gain and loss planning',
    intro:
      'Before year-end we would like to see whether realizing some gains at a low rate, or harvesting losses, makes sense in your taxable accounts. Please reply with the following (a recent brokerage statement with unrealized gains/losses covers most of it):',
    questions: [
      'Unrealized gains and losses by position in taxable (non-retirement) accounts, noting which were held more than one year',
      'Any sales already made this year and the gain or loss on each',
      'Any positions you would want to keep regardless of tax result',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Approximate other income for the year (wages, pensions, IRA distributions, interest, dividends); last year’s return is a good guide',
      'Loss carryforward from last year’s return, if any (we can look this up)',
    ],
  },
  'retirement-plan-comparison': {
    subject: 'Information needed to compare retirement plan options for your business',
    intro:
      'We are comparing a SEP IRA, a Solo 401(k), a SIMPLE IRA, and a 401(k) with employees to see which lets you put away the most once the cost of covering staff is counted. Please reply with the following:',
    questions: [
      'How the business pays you — Schedule C profit, or W-2 wages from an S-corporation — and roughly how much this year',
      'For each employee other than you and your spouse: annual wages, age, and hours worked (or just the number of employees with their average wage and average age)',
      'Whether any employees are under 21, work part-time (under 1,000 hours a year), or are covered by a union agreement',
      'Whether the business has had any retirement plan in the last three years (a SEP, SIMPLE, or 401(k)), and if so which one',
      'Roughly how much you would like to contribute this year',
      'Whether Roth contributions or the ability to borrow from the plan matter to you',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your age',
      'Your federal tax bracket and the state where you live',
      'If you are paid through an S-corporation: your W-2 wages from it for last year',
    ],
  },

  'charitable-giving-optimizer': {
    subject: 'Information needed to plan your charitable giving',
    intro:
      'We are comparing a few ways to structure your charitable giving so the same gifts produce the best tax result. Please reply with the following:',
    questions: [
      'Approximate charitable giving per year, and whether it varies much year to year',
      'Whether you are taking required IRA distributions, and the annual amount if so',
      'Whether you hold appreciated stock or funds you would consider gifting instead of cash',
      'Any charities you give to regularly (a donor-advised fund may be worth discussing)',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your age (and your spouse’s)',
      'State and local taxes paid, mortgage interest, and any other itemized deductions (last year’s Schedule A is a good guide)',
    ],
  },
  'social-security-timing': {
    subject: 'Information needed for your Social Security timing analysis',
    intro:
      'We are looking at when it makes the most sense to start Social Security. Please reply with the following (your statement at ssa.gov/myaccount has the first item):',
    questions: [
      'Your estimated monthly benefit at full retirement age from your Social Security statement (and your spouse’s)',
      'Whether either of you plans to keep working past 62, and roughly what you would earn',
      'Any health or family-longevity considerations you want reflected',
      'Other retirement income sources and when they begin (pension, annuity, retirement account withdrawals)',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Birth year for you and your spouse',
    ],
  },

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
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Whether you expect to itemize, and any credits you usually claim (children, dependent care, education)',
    ],
  },

  'mileage-log': {
    templateIntro: 'To make the mileage and business-expense records easy for both of us this year, we have put together a simple Excel log for you.',
    templateSteps: [
      'Log each trip on the Mileage sheet: date, purpose, where you went, and the miles. The IRS rate for that date fills in by itself.',
      'Log business costs on the Expenses sheet: date, category, and amount. The sheet shows which costs are usually deductible, partly deductible, or ones we should talk about.',
      'Keep it up through the year. A log kept as you go is far stronger than one rebuilt from memory.',
    ],
    templateClose: 'In January, just email the file back to us. We will take it from there.',
    subject: 'Your mileage and expense log for this year',
    intro:
      'To make sure you capture every deductible mile and business expense, please keep this log through the year and send it to us in January. Pick your line of work at the top and the log will tell you which expenses are usually deductible, which are limited, and which to leave for us. It saves on your device as you go and takes one click to submit.',
    questions: [
      'Open the link and enter your name and email once',
      'Add each trip as it happens: date, client, destination, and miles; choose Business, Charity, or Medical',
      'Add expenses as they come up: meals with the client and matter discussed, supplies, dues, software, and anything you are unsure about; keep receipts for anything $75 or more',
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
      'The business’s gross receipts (total sales before expenses) for the year, if you have them',
      'A reasonable salary estimate for your role and industry, if you have one in mind',
      'If the business is in New Hampshire: what you are paid, or would pay yourself, for your own work (this sets the owner-pay deduction on the Business Profits Tax)',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Entity type (S-corporation, LLC, partnership, or sole proprietorship)',
      'Your tax filing status (married filing jointly or single) and the state where you live',
      'The state where the business operates, if it is different from the state where you live',
      'Whether a New Hampshire Business Profits Tax or Business Enterprise Tax return was filed last year',
      'Approximate other household taxable income (e.g., a spouse’s wages)',
    ],
  },

  'estimated-tax': {
    subject: 'Information needed for your estimated tax and safe harbor review',
    intro:
      'We are projecting your tax for the year and calculating the estimated payments needed to stay in the safe harbor and avoid an underpayment penalty. Please reply with:',
    questions: [
      'Your total expected income for this year (all sources)',
      'Federal tax withholding expected this year (from wages, pensions, etc.)',
      'Estimated tax payments you have already made this year, and on what dates',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your total tax from last year’s return (used for the safe-harbor test)',
      'Your filing status (married filing jointly or single) and state of residence',
    ],
  },

  'multi-year-projection': {
    subject: 'Information needed for your multi-year tax projection',
    intro:
      'We are building a multi-year tax projection to identify planning opportunities such as low-bracket years for Roth conversions or capital gains. Please reply with the following:',
    questions: [
      'Current balances: pre-tax IRA / 401(k), Roth, and taxable savings',
      'Expected wages or business income, and the year you plan to stop working',
      'The age(s) at which you plan to begin Social Security, and the expected benefit',
      'Any Roth conversions you are considering, and in which years',
      'Who inherits the retirement accounts, and roughly what tax bracket they are in',
      'Any large expected events — a business sale, large capital gain, or major charitable gift — and the year',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your year of birth (and your spouse’s, if applicable) and filing status',
    ],
  },

  // The one-year (Q4) view of the Roth Conversion & RMD Planner; ToolShell selects this with requestKey.
  'multi-year-projection-year': {
    subject: 'Information needed to price a Roth conversion this year',
    intro:
      'We are estimating what a Roth conversion would cost you before December 31, against your income for the whole year. Please reply with the following:',
    questions: [
      'Wages or net self-employment income expected for the year',
      'Pension income (the taxable amount)',
      'Other ordinary income for the year, including interest, rental income, and any IRA distributions such as this year’s required minimum distribution',
      'Social Security benefits for the year (gross)',
      'Long-term capital gains and qualified dividends for the year',
      'Tax-exempt interest for the year (for example, municipal bond interest)',
      'Net investment income for the year (interest, dividends, gains, rents), if different from the gains and dividends above',
      'Itemized deductions, if you expect to itemize instead of taking the standard deduction',
      'The pre-tax IRA balance available to convert, after this year’s required minimum distribution',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your age and your spouse’s (if married), as of December 31 of this year, and your filing status',
      'Your state of residence',
    ],
  },

  'qbi-optimizer': {
    subject: 'Information needed for your QBI deduction analysis',
    intro:
      'We are estimating your Section 199A qualified business income (QBI) deduction and how planning moves might affect it. Please reply with the following:',
    questions: [
      'Your qualified business income (net business profit) for the year',
      'Total W-2 wages the business pays to employees',
      'The unadjusted basis of qualified business property the business owns (UBIA), if significant',
      'Your expected total taxable income for the year',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'The type of business (and whether it is a “specified service” business such as law, accounting, consulting, health, or financial services)',
      'Your filing status (married filing jointly or single)',
    ],
  },

  // ---------- BlueLine Specialty Planning Tools ----------
  'exchange-1031': {
    subject: 'Information needed for your 1031 exchange review',
    intro:
      'We are reviewing the like-kind exchange so we can estimate the tax deferred, any boot, and the basis in what you buy. For each asset involved, please send:',
    questions: [
      'What is being sold: each property (and any equipment, vehicles, or other items included in the sale) with its expected sale price and any mortgage being paid off',
      'What is being bought: each replacement property or item with its price and any new loan',
      'Whether you plan to take any cash out at closing, or bring cash in',
      'Expected closing date of the first sale',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'For each asset sold: original cost plus improvements, and total depreciation taken (your depreciation schedules have this)',
      'Approximate other taxable income for the year and your state of residence',
    ],
  },

  'arm-vs-fixed': {
    subject: 'Information needed to compare an ARM with a fixed-rate mortgage',
    intro:
      'We are comparing an adjustable-rate mortgage against a fixed-rate loan over the years you expect to keep it. Please reply with:',
    questions: [
      'Loan amount and term (15 or 30 years)',
      'The fixed rate you have been quoted',
      'The ARM quote: initial rate, fixed period (5, 7, or 10 years), periodic and lifetime caps',
      'How many years you realistically expect to keep this loan before selling or refinancing',
    ],
  },

  'solar-panels': {
    subject: 'Information needed for your solar panel review',
    intro:
      'We are reviewing whether a solar installation makes financial sense over the time you expect to stay in your home. Please send:',
    questions: [
      'The installer quote: gross system cost and any state or utility rebates',
      'The installer\u2019s estimated first-year electricity savings (or annual production and your utility rate)',
      'Whether you would pay cash or finance, and the loan rate and term if financing',
      'How many years you expect to stay in the home',
      'Any maintenance or inverter-replacement costs quoted',
    ],
  },

  'retire-track': {
    subject: 'Information needed for your retirement readiness review',
    intro:
      'We are preparing a snapshot of whether you are on track to retire comfortably. Approximate figures are perfectly fine. Please reply with:',
    questions: [
      'The age at which you would like to retire',
      'Your total current retirement and investment savings',
      'Approximately how much you add to savings each year',
      'Your expected annual Social Security benefit (and any pension)',
      'Your estimated annual spending needs in retirement (in today’s dollars)',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your current age',
    ],
  },

  'cash-balance': {
    subject: 'Information needed for your Cash Balance Plan review',
    intro:
      'We are reviewing whether a Cash Balance Plan may be worth discussing for your business. To prepare illustrative contribution and deduction ranges, please reply with:',
    questions: [
      'Approximate annual income / W-2 compensation from the business',
      'Number of employees (excluding owners)',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Owner age',
      'Entity type (sole proprietorship, LLC, partnership, S-corporation, or C-corporation)',
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
      'Whether you have an existing IRA the funds could be rolled into',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your current age',
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
    templateIntro: 'Before we meet, it helps to have a simple one-page picture of where things stand. We have put together a short Excel worksheet for that.',
    templateSteps: [
      'Fill in the yellow cells: what you own, what you owe, what comes in, and what goes out. Round numbers are fine.',
      'Net worth, cash flow, savings rate, and debt-to-income calculate at the bottom.',
      'It should take about fifteen minutes.',
    ],
    templateClose: 'Email the file back to us when it is done, or bring it to our meeting.',
    subject: 'Your financial snapshot — a short form to fill in',
    intro:
      'We are putting together a clean, one-page snapshot of where things stand today — net worth, cash flow, savings rate, and asset allocation. Approximate figures are fine.',
    questions: [
      'Assets: cash and bank accounts, investments (non-retirement), retirement accounts, real estate, business interests, and personal property/other',
      'Liabilities: mortgage, auto loans, student loans, credit card balances, and other debt',
      'Annual income by source (employment, business, investment, other)',
      'Annual expenses (housing, living expenses, debt payments, other)',
      'Approximate amount you save or invest each year',
      'Life insurance coverage amount and any disability coverage (monthly benefit)',
    ],
  },

  // ---------- Added so every calculator has a client information request ----------
  'retirement-tax-map': {
    subject: 'Information needed for your retirement income tax review',
    intro:
      'We are mapping where your retirement income will come from and how each source is taxed, including how much of your Social Security becomes taxable and whether Medicare premiums are affected. Approximate annual figures are fine. Please reply with the following:',
    questions: [
      'Annual Social Security benefits, for you and your spouse if applicable',
      'Annual pension or annuity income',
      'Annual withdrawals from Traditional IRA and 401(k) accounts, including the required minimum distribution if you are taking one',
      'Annual withdrawals from Roth accounts',
      'Annual income from taxable investment accounts, such as dividends and long-term gains',
      'Net annual rental, business, or partnership (K-1) income',
      'A second mix of withdrawals you would like compared, if any',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your filing status and state of residence',
    ],
  },

  'paying-your-kids': {
    subject: 'Information needed to review paying your children through the business',
    intro:
      'We are estimating the tax effect of putting your children on the payroll for real work in the business, including the payroll-tax rules for your type of business and whether a Roth IRA or 401(k) contribution is possible. Please reply with the following for each child:',
    questions: [
      'Each child’s age and the work they do or would do for the business',
      'The hours they work, or expect to work, and the hourly rate you would pay (or the total wages for the year)',
      'Whether the work is documented, for example with timesheets and a written job description',
      'Whether the business’s 401(k) plan, if there is one, allows employees under 21 to participate',
      'Whether each child already has a Roth IRA or a custodial account, and roughly what is in it',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Your business’s entity type (sole proprietorship or spouses’ partnership, single-member LLC, S-corporation, or C-corporation)',
      'Your federal tax bracket and state of residence',
      'If you are a sole proprietor: your net self-employment earnings, and whether they are above the Social Security wage base ($184,500)',
      'Whether you expect the full 20% QBI deduction (taxable income under about $200,000 single or $400,000 joint, and not a specified service business)',
    ],
  },

  'business-sale': {
    subject: 'Information needed to estimate what you would keep from a business sale',
    intro:
      'We are estimating what you would keep after tax, transaction costs, and debt payoff if the business is sold. Approximate figures are fine. Please reply with the following:',
    questions: [
      'The expected sale price',
      'Your cost basis in the business or assets being sold',
      'The selling costs you expect, such as broker, legal, and advisory fees',
      'Debt that will be paid off at closing',
      'Whether the buyer is asking for an asset sale or a sale of the ownership interest, and whether you would take part of the price in payments over time',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'The entity type (sole proprietorship, LLC, partnership, S-corporation, or C-corporation)',
      'Your filing status and state of residence',
      'Other household taxable income expected for the year',
    ],
  },

  'concentrated-wealth': {
    subject: 'Information needed to measure how concentrated your wealth is',
    intro:
      'We are measuring how much of your net worth and income depends on a single asset or source, and what a sharp drop in the largest one would do. Approximate values are fine. Please reply with the following:',
    questions: [
      'The approximate value of each major asset: business interests, real estate, individual stocks, employer stock, deferred compensation, cryptocurrency, and anything else significant',
      'Whether any of these assets has restrictions on selling, such as lock-ups, vesting schedules, or a buy-sell agreement',
    ],
    // Things the CPA most likely already has (last year's return and standing facts). They print last so they can be deleted before sending.
    onFile: [
      'Annual income by source: employment, business, investments, and other (last year’s return is a good guide)',
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

// Email that sends the client the downloadable Excel template for a Client
// Shareable. `templateLink` is the absolute URL of the .xlsx; `link` is the
// online form, offered as the alternative.
export function buildTemplateEmail(spec, toolTitle, templateLink, link) {
  if (!spec || !templateLink) return { subject: '', body: '' }
  const steps = (spec.templateSteps || []).map((q, i) => `${i + 1}. ${q}`).join('\n')
  const body = [
    'Dear [Client Name],',
    '',
    spec.templateIntro || `We have put together a simple Excel workbook for the ${toolTitle}.`,
    '',
    'Download it here (opens in Excel; the formulas calculate on their own):',
    templateLink,
    '',
    'How it works:',
    steps,
    '',
    spec.templateClose || 'Email the file back to us when it is done.',
    '',
    ...(link ? ['If you would rather work online, the same log is available as a web form that saves as you go and sends to us with one click:', link, ''] : []),
    SENSITIVE_REMINDER,
    '',
    SIGNATURE,
  ].join('\n')
  return { subject: `${toolTitle} \u2014 a simple Excel log from Grott Luker & Co.`, body }
}

// Assemble the full plain-text email body for a given tool spec.
// `link` is the client-facing form URL for Shareable tools. When present the
// email sends the client to the form instead of asking them to reply with
// figures, and the numbered list becomes "what you'll be asked for".
export function buildEmail(spec, link, templateLink) {
  if (!spec) return { subject: '', body: '' }
  // The items the CPA most likely already has are listed last, so they can be deleted before sending.
  const numbered = [...spec.questions, ...(spec.onFile || [])].map((q, i) => `${i + 1}. ${q}`).join('\n')
  const body = link
    ? [
        'Dear [Client Name],',
        '',
        spec.intro,
        '',
        'Please use this secure form — it takes a few minutes and saves as you go:',
        link,
        '',
        'It will ask for:',
        numbered,
        '',
        'When you click Send at the bottom, it comes straight to us. No login or account is needed.',
        '',
        ...(templateLink ? ['Prefer a spreadsheet? The same log is available as an Excel workbook you can keep on your computer and email back to us:', templateLink, ''] : []),
        SENSITIVE_REMINDER,
        '',
        SIGNATURE,
      ].join('\n')
    : [
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
