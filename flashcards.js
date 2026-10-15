/* v4.2 Flash Cards: hand-written deck for BUS 5601 (accounting & business basics) and
   BUS 5421 (Managerial Economics, Froeb), plus programmatically generated Statement Analysis cards.
   Standard textbook definitions and formulas. Pure logic only (no DOM) so it can be unit tested. */
(function (r, f) { if (typeof module === "object" && module.exports) module.exports = f(); else r.Flash = f(); })(typeof self !== "undefined" ? self : this, function () {
  var COURSES = { acct: "BUS 5601 Accounting & Business Basics", econ: "BUS 5421 Managerial Economics", sa: "Statement Analysis" };
  var TOPICS = [
    ["equation", "acct", "Accounting equation & basics"], ["balance", "acct", "Balance sheet"], ["income", "acct", "Income statement"],
    ["cashflow", "acct", "Cash flow statement"], ["accrual", "acct", "Accrual, depreciation & inventory"], ["liquidity", "acct", "Liquidity ratios"],
    ["leverage", "acct", "Leverage ratios"], ["profit", "acct", "Profitability & DuPont"], ["efficiency", "acct", "Efficiency ratios"],
    ["hv", "acct", "Horizontal & vertical analysis"], ["altman", "acct", "Altman Z-score"], ["tenk", "acct", "Reading a 10-K"],
    ["cvp", "acct", "Cost-volume-profit & budgeting"], ["tvm", "acct", "Time value of money & investment"],
    ["found", "econ", "Foundations: rational actor, problem solving"], ["oppcost", "econ", "Opportunity cost & economic profit"],
    ["marginal", "econ", "Marginal (extent) decisions"], ["sunk", "econ", "Sunk costs & decision errors"], ["costs", "econ", "Costs, scale & scope"],
    ["sd", "econ", "Demand & supply"], ["elasticity", "econ", "Elasticity"], ["structures", "econ", "Market structures & strategy"],
    ["pricing", "econ", "Pricing & price discrimination"], ["game", "econ", "Game theory & bargaining"], ["uncert", "econ", "Uncertainty & auctions"],
    ["asymmetric", "econ", "Asymmetric information"], ["incentives", "econ", "Incentives, agency & organization"], ["failure", "econ", "Market failure & policy"],
    ["sa", "sa", "Statement Analysis"]
  ].map(function (a) { return { key: a[0], course: a[1], name: a[2] }; });
  var CARDS = [], cnt = {};
  function C(t, f, b, kind) { cnt[t] = (cnt[t] || 0) + 1; CARDS.push({ id: t + "-" + cnt[t], topic: t, course: topicCourse(t), kind: kind || "term", f: f, b: b }); }
  function F(t, f, b) { C(t, f, b, "formula"); }
  function P(t, f, b) { C(t, f, b, "problem"); }
  function topicCourse(t) { for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].key === t) return TOPICS[i].course; throw new Error("bad topic " + t); }

  /* ---------- BUS 5601: accounting & business basics ---------- */
  F("equation", "The accounting equation", "Assets = Liabilities + Equity. Every asset was paid for by lenders (liabilities) or owners (equity).");
  C("equation", "Asset", "Something the company owns or controls that will bring future economic benefit: cash, receivables, inventory, equipment.");
  C("equation", "Liability", "An obligation to pay or deliver something to others in the future: accounts payable, wages payable, loans.");
  C("equation", "Equity (owners' equity)", "The owners' residual claim: assets minus liabilities. Made up of contributed capital plus retained earnings.");
  C("equation", "Double-entry bookkeeping", "Every transaction affects at least two accounts so the equation always stays in balance; total debits = total credits.");
  C("equation", "Debit and credit (normal balances)", "Debits increase assets and expenses; credits increase liabilities, equity and revenue.");
  P("equation", "Assets $500k, liabilities $320k. Equity?", "$180k. Equity = assets - liabilities = 500 - 320.");
  P("equation", "A company borrows $50k cash from a bank. Effect on the equation?", "Assets (cash) +$50k and liabilities (notes payable) +$50k. Equity unchanged.");
  P("equation", "Owners invest $100k cash in the business. Effect?", "Assets (cash) +$100k, equity (contributed capital) +$100k.");
  P("equation", "The company pays $8k of accounts payable. Effect?", "Cash -$8k and accounts payable -$8k. Both sides shrink equally; equity unchanged.");
  C("equation", "GAAP vs IFRS", "GAAP: US generally accepted accounting principles (set by FASB). IFRS: international standards (IASB). Public US firms report under GAAP.");
  C("equation", "Historical cost principle", "Most assets are recorded at what was paid for them, not today's market value.");
  C("equation", "Going-concern assumption", "Statements assume the business will keep operating for the foreseeable future, so assets are not valued at fire-sale prices.");
  C("equation", "Four main financial statements", "Balance sheet, income statement, statement of cash flows, statement of stockholders' (owners') equity.");
  C("equation", "How the statements connect", "Net income (income statement) flows into retained earnings (balance sheet); the cash flow statement explains the change in the balance sheet's cash.");

  C("balance", "Balance sheet", "A snapshot of assets, liabilities and equity on one date, e.g. December 31.");
  C("balance", "Current vs long-term", "Current = turns into cash or comes due within one year (or the operating cycle). Long-term = beyond one year.");
  C("balance", "Typical current assets (in liquidity order)", "Cash and equivalents, marketable securities, accounts receivable, inventory, prepaid expenses.");
  C("balance", "Accounts receivable", "Money customers owe for goods or services already delivered on credit.");
  C("balance", "Accounts payable", "Money the company owes suppliers for goods or services already received.");
  C("balance", "Prepaid expense", "An asset: cash paid in advance for a future benefit, e.g. 12 months of insurance. Expensed as it is used up.");
  C("balance", "Unearned (deferred) revenue", "A liability: cash received before the goods or service are delivered.");
  C("balance", "Property, plant & equipment (PP&E)", "Long-lived tangible assets. Shown at cost less accumulated depreciation = net book value.");
  C("balance", "Accumulated depreciation", "A contra-asset: total depreciation charged on an asset since purchase. Reduces PP&E to its net book value.");
  C("balance", "Intangible assets and goodwill", "Non-physical assets: patents, trademarks, software. Goodwill = price paid for an acquisition above the fair value of its net identifiable assets.");
  C("balance", "Retained earnings", "Cumulative net income kept in the business. Ending RE = beginning RE + net income - dividends.");
  C("balance", "Current portion of long-term debt", "Principal due within the next 12 months; shown as a current liability.");
  C("balance", "Book value of equity vs market value", "Book = assets - liabilities on the balance sheet. Market = share price x shares outstanding. They usually differ.");
  P("balance", "Beginning retained earnings $400k, net income $90k, dividends $30k. Ending RE?", "$460k. 400 + 90 - 30.");
  P("balance", "Equipment cost $120k, accumulated depreciation $45k. Net book value?", "$75k. 120 - 45.");
  C("balance", "Treasury stock", "Company shares bought back from investors. Shown as a reduction of equity (contra-equity).");

  C("income", "Income statement", "Shows revenue, expenses and profit over a period (quarter or year). Also called the P&L.");
  F("income", "Gross profit", "Revenue - cost of goods sold (COGS).");
  F("income", "Operating income (EBIT)", "Gross profit - operating expenses (SG&A, R&D, depreciation). Earnings before interest and taxes.");
  F("income", "Net income", "EBIT - interest expense - income tax expense. The 'bottom line'.");
  C("income", "Cost of goods sold (COGS)", "The direct cost of the products sold in the period: materials, direct labor, factory overhead.");
  C("income", "SG&A", "Selling, general and administrative expenses: salaries, rent, marketing, office costs.");
  F("income", "EBITDA", "EBIT + depreciation + amortization. A rough proxy for operating cash earnings.");
  F("income", "Earnings per share (EPS)", "(Net income - preferred dividends) / weighted average common shares outstanding.");
  P("income", "Revenue $1,000k, COGS $600k, operating expenses $250k. Operating income?", "$150k. Gross profit 400 - opex 250.");
  P("income", "EBIT $150k, interest $30k, tax rate 25%. Net income?", "$90k. Pre-tax 120; tax 30; net income 90.");
  P("income", "Net income $2.4M, 1.2M shares, no preferred. EPS?", "$2.00 per share.");
  C("income", "Revenue recognition principle", "Record revenue when it is earned (goods or services delivered to the customer), not when cash arrives.");
  C("income", "Non-operating items", "Gains, losses, interest income and expense that are not part of the core business; reported below operating income.");
  C("income", "Effective tax rate", "Income tax expense / pre-tax income.");

  C("cashflow", "Statement of cash flows", "Explains the change in cash over a period in three sections: operating, investing, financing.");
  C("cashflow", "Operating activities", "Cash from running the business: collections from customers, payments to suppliers and employees, interest and taxes (US GAAP).");
  C("cashflow", "Investing activities", "Buying or selling long-term assets and investments: capex (outflow), sale of equipment, acquisitions.");
  C("cashflow", "Financing activities", "Cash from or to owners and lenders: issuing or repaying debt, issuing stock, buybacks, dividends paid.");
  C("cashflow", "Indirect method", "Starts with net income, adds back non-cash expenses (depreciation), then adjusts for changes in working capital.");
  C("cashflow", "Working-capital adjustments (indirect method)", "Increase in a current asset (AR, inventory) subtracts cash; increase in a current liability (AP) adds cash. Decreases do the opposite.");
  F("cashflow", "Free cash flow", "Cash from operations - capital expenditures. Cash left over for debt repayment, dividends or growth.");
  P("cashflow", "Net income $80k, depreciation $20k, AR up $15k, AP up $5k. Cash from operations?", "$90k. 80 + 20 - 15 + 5.");
  P("cashflow", "CFO $90k, capex $35k. Free cash flow?", "$55k.");
  P("cashflow", "Company pays $10k dividends and repays $40k of loans. Which section, and net amount?", "Financing: -$50k.");
  C("cashflow", "Why profit and cash differ", "Accrual accounting timing (credit sales, inventory build-up), non-cash expenses like depreciation, and capex and debt flows that are not on the income statement.");
  C("cashflow", "Red flag: profit up, operating cash down", "Earnings may be low quality: receivables or inventory piling up, or aggressive revenue recognition.");
  C("cashflow", "Typical healthy pattern of signs", "CFO positive, CFI negative (investing in the business), CFF either sign.");
  P("cashflow", "Beginning cash $40k; CFO +$90k, CFI -$60k, CFF -$20k. Ending cash?", "$50k. 40 + 90 - 60 - 20.");

  C("accrual", "Accrual accounting", "Records revenue when earned and expenses when incurred, regardless of when cash moves.");
  C("accrual", "Cash-basis accounting", "Records revenue and expenses only when cash is received or paid. Simpler, but not GAAP for most companies.");
  C("accrual", "Matching principle", "Expenses are recorded in the same period as the revenue they help produce.");
  C("accrual", "Depreciation", "Allocating the cost of a long-lived tangible asset over its useful life. A non-cash expense.");
  F("accrual", "Straight-line depreciation", "(Cost - salvage value) / useful life in years.");
  P("accrual", "Machine cost $50k, salvage $5k, life 5 years. Annual straight-line depreciation?", "$9k a year. (50 - 5) / 5.");
  C("accrual", "Double-declining balance", "Accelerated method: rate = 2 / useful life, applied to the beginning book value each year. Never depreciate below salvage.");
  P("accrual", "Asset $40k, 5-year life, double-declining. Year 1 depreciation?", "$16k. Rate 2/5 = 40% x 40k.");
  C("accrual", "Amortization", "Spreading the cost of an intangible asset (patent, software license) over its useful life.");
  C("accrual", "Accrued expense", "An expense incurred but not yet paid, e.g. wages earned by staff in the last week of December. Recorded as a liability.");
  C("accrual", "Adjusting entries", "End-of-period entries so revenue and expenses land in the right period: accruals, deferrals, depreciation.");
  C("accrual", "FIFO", "First-in, first-out: oldest inventory costs go to COGS first. When prices rise: lower COGS, higher profit, higher ending inventory.");
  C("accrual", "LIFO", "Last-in, first-out: newest costs go to COGS first. When prices rise: higher COGS, lower taxable income. Allowed under US GAAP, banned under IFRS.");
  P("accrual", "Bought 10 units at $5, then 10 at $7. Sold 12. COGS under FIFO?", "$64. 10 x 5 + 2 x 7.");
  P("accrual", "Same purchases (10 at $5, then 10 at $7), sold 12. COGS under LIFO?", "$80. 10 x 7 + 2 x 5.");
  C("accrual", "Allowance for doubtful accounts", "A contra-asset estimating receivables that won't be collected. Net AR = gross AR - allowance.");
  C("accrual", "Conservatism principle", "When uncertain, choose the option that does not overstate assets or income, e.g. lower of cost or market for inventory.");

  F("liquidity", "Current ratio", "Current assets / current liabilities. Around 1.5-2 is comfortable; under 1 is a warning.");
  F("liquidity", "Quick (acid-test) ratio", "(Cash + marketable securities + receivables) / current liabilities. Often approximated as (current assets - inventory) / current liabilities.");
  F("liquidity", "Cash ratio", "(Cash + marketable securities) / current liabilities. The strictest liquidity test.");
  F("liquidity", "Working capital", "Current assets - current liabilities, in dollars.");
  C("liquidity", "Why the quick ratio excludes inventory", "Inventory may be slow to sell or sell at a discount, so it is the least liquid current asset.");
  P("liquidity", "Current assets $300k, current liabilities $200k. Current ratio and working capital?", "1.5x; working capital $100k.");
  P("liquidity", "CA $300k including inventory $120k; CL $200k. Quick ratio?", "0.9x. (300 - 120) / 200.");
  C("liquidity", "Can a current ratio be too high?", "Yes. It may mean idle cash, bloated inventory or slow collections: assets not working hard.");
  C("liquidity", "Liquidity vs solvency", "Liquidity = paying bills due in the next year. Solvency = meeting all obligations long term (leverage ratios).");
  P("liquidity", "Current ratio is 1.2. The company pays $10k of AP with cash (CA $120k, CL $100k). New current ratio?", "1.22x. 110 / 90. Paying down CL with cash raises a ratio that is above 1.");
  C("liquidity", "Operating cycle", "Days inventory outstanding + days sales outstanding: time from buying inventory to collecting cash.");
  F("liquidity", "Cash conversion cycle", "DIO + DSO - DPO. Days cash is tied up in operations; lower is better.");

  F("leverage", "Debt-to-equity ratio", "Total liabilities / total equity (some analysts use only interest-bearing debt). Higher = more financial risk.");
  F("leverage", "Debt ratio", "Total liabilities / total assets. The share of assets financed by creditors.");
  F("leverage", "Interest coverage (times interest earned)", "EBIT / interest expense. Under about 1.5x is a red flag.");
  F("leverage", "Equity multiplier", "Total assets / total equity = 1 + D/E (with D = total liabilities).");
  P("leverage", "Liabilities $600k, equity $400k. D/E and debt ratio?", "D/E 1.5x; debt ratio 0.60 (600 / 1,000).");
  P("leverage", "EBIT $240k, interest $60k. Interest coverage?", "4.0x.");
  C("leverage", "Financial leverage: upside and downside", "Debt magnifies ROE when returns exceed the interest cost, and magnifies losses when they don't. Raises bankruptcy risk.");
  C("leverage", "Debt covenants", "Loan conditions, e.g. a minimum interest coverage or maximum D/E. Breaking one can let the lender demand repayment.");
  P("leverage", "Debt ratio 0.5. What is D/E?", "1.0x. Liabilities equal equity.");
  C("leverage", "Operating leverage", "High fixed costs relative to variable costs: profits swing more than sales do.");

  F("profit", "Gross margin", "Gross profit / revenue.");
  F("profit", "Operating margin", "Operating income (EBIT) / revenue.");
  F("profit", "Net profit margin", "Net income / revenue.");
  F("profit", "Return on assets (ROA)", "Net income / total assets (average assets is better when available).");
  F("profit", "Return on equity (ROE)", "Net income / shareholders' equity.");
  F("profit", "DuPont identity", "ROE = net margin x asset turnover x equity multiplier = (NI/Sales) x (Sales/Assets) x (Assets/Equity).");
  P("profit", "Net margin 5%, asset turnover 2.0, equity multiplier 1.5. ROE?", "15%. 0.05 x 2.0 x 1.5.");
  P("profit", "Revenue $800k, net income $40k, assets $500k, equity $200k. Net margin, ROA, ROE?", "Margin 5%, ROA 8%, ROE 20%.");
  C("profit", "Why ROE can mislead", "High ROE can come from heavy debt (a small equity base) rather than good operations. Check D/E alongside it.");
  P("profit", "Revenue $2M, gross profit $700k. Gross margin?", "35%.");
  C("profit", "Gross margin falling while revenue rises", "Pricing pressure or rising input costs; growth may be bought with discounts.");
  F("profit", "Return on invested capital (ROIC)", "NOPAT / (debt + equity), where NOPAT = EBIT x (1 - tax rate). Compare it with the cost of capital.");

  F("efficiency", "Asset turnover", "Revenue / total assets. Sales generated per dollar of assets.");
  F("efficiency", "Inventory turnover", "COGS / average inventory.");
  F("efficiency", "Days inventory outstanding (DIO)", "365 / inventory turnover, or average inventory / COGS x 365.");
  F("efficiency", "Receivables turnover", "Revenue (credit sales) / average accounts receivable.");
  F("efficiency", "Days sales outstanding (DSO)", "Average AR / revenue x 365. Average days to collect from customers.");
  F("efficiency", "Days payables outstanding (DPO)", "Average AP / COGS x 365. Average days taken to pay suppliers.");
  P("efficiency", "COGS $360k, average inventory $60k. Turnover and days?", "6x; about 61 days (365 / 6).");
  P("efficiency", "Revenue $730k, AR $100k. DSO?", "50 days. 100 / 730 x 365.");
  P("efficiency", "DIO 60, DSO 45, DPO 30. Cash conversion cycle?", "75 days.");
  C("efficiency", "Rising DSO", "Customers are paying more slowly: looser credit terms or collection trouble. Cash gets tied up.");
  C("efficiency", "Asset turnover differs by industry", "Grocers turn assets fast at low margins; utilities and airlines turn slowly at higher margins. Compare within an industry.");

  C("hv", "Horizontal analysis", "Compares the same line item across periods, in dollars and %. Trend analysis.");
  C("hv", "Vertical (common-size) analysis", "Expresses each line as a % of a base within one period: revenue for the income statement, total assets for the balance sheet.");
  F("hv", "Percent change", "(Current - prior) / prior x 100.");
  P("hv", "Revenue grew from $500k to $600k. Percent change?", "+20%.");
  P("hv", "Revenue $2M, SG&A $500k. SG&A as common-size %?", "25% of revenue.");
  C("hv", "Why use common-size statements", "They remove size differences so you can compare companies of different scale, or one company across years.");
  F("hv", "Compound annual growth rate (CAGR)", "(Ending / beginning)^(1/years) - 1.");
  P("hv", "Sales went from $100 to $121 over 2 years. CAGR?", "10%. sqrt(1.21) - 1.");
  C("hv", "Benchmarking", "Comparing a company's ratios with competitors or industry averages to judge whether they are good or bad.");

  F("altman", "Altman Z-score (public manufacturers)", "Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E.");
  C("altman", "Altman components A-E", "A = working capital / TA; B = retained earnings / TA; C = EBIT / TA; D = market value of equity / total liabilities; E = sales / TA.");
  C("altman", "Altman zones (original model)", "Z > 2.99 safe; 1.81-2.99 grey zone; Z < 1.81 distress.");
  C("altman", "Which Altman ratio has the biggest weight?", "EBIT / total assets (x3.3): operating productivity of the assets.");
  P("altman", "A 0.10, B 0.20, C 0.10, D 1.00, E 1.50. Z?", "2.83 (grey zone). 0.12 + 0.28 + 0.33 + 0.60 + 1.50.");
  C("altman", "Limits of the Z-score", "Built on 1960s US manufacturers; less reliable for banks, service and private firms (Z' and Z'' variants exist). A screen, not a verdict.");
  C("altman", "Why retained earnings in Z", "It captures cumulative profitability and the firm's age: young firms with little RE score lower.");

  C("tenk", "Form 10-K", "Annual report public US companies file with the SEC; free on EDGAR. 10-Q = quarterly report, 8-K = major-event report.");
  C("tenk", "10-K Item 1", "Business: what the company does, its segments, customers and competition.");
  C("tenk", "10-K Item 1A", "Risk factors.");
  C("tenk", "10-K Item 7", "MD&A: management's discussion and analysis of results, liquidity and outlook.");
  C("tenk", "10-K Item 8", "Financial statements and notes, with the auditor's report.");
  C("tenk", "Notes to the financial statements", "Accounting policies, debt terms, leases, segments, contingencies. Often where the real story is.");
  C("tenk", "Auditor's opinion types", "Unqualified (clean), qualified, adverse, disclaimer. Watch for a 'going concern' paragraph: serious doubt about survival.");
  C("tenk", "Proxy statement (DEF 14A)", "Filed before the annual meeting: executive pay, board elections, shareholder proposals.");
  C("tenk", "Sarbanes-Oxley (SOX)", "2002 law: CEO/CFO certify the financials; internal-control requirements; tighter auditor independence.");

  F("cvp", "Contribution margin per unit", "Price - variable cost per unit.");
  F("cvp", "Contribution margin ratio", "Contribution margin / price (or total CM / sales).");
  F("cvp", "Break-even units", "Fixed costs / contribution margin per unit.");
  F("cvp", "Break-even sales dollars", "Fixed costs / contribution margin ratio.");
  F("cvp", "Units for a target profit", "(Fixed costs + target profit) / contribution margin per unit.");
  P("cvp", "Price $50, variable cost $30, fixed costs $40k. Break-even units?", "2,000 units. 40,000 / 20.");
  P("cvp", "Same product: price $50, VC $30, FC $40k. Units to earn $20k profit?", "3,000 units. (40,000 + 20,000) / 20.");
  F("cvp", "Margin of safety", "(Actual or budgeted sales - break-even sales) / actual sales.");
  P("cvp", "Fixed costs $120k, CM ratio 40%. Break-even sales?", "$300k.");
  C("cvp", "Fixed vs variable cost", "Fixed: same total regardless of volume in the short run (rent). Variable: total rises with volume (materials).");
  C("cvp", "Master budget", "Sales budget -> production -> purchases and expenses -> budgeted income statement, cash budget, balance sheet.");
  C("cvp", "Variance (budget vs actual)", "Favorable if actual profit beats budget (revenue higher or cost lower); unfavorable otherwise.");

  F("tvm", "Future value", "FV = PV x (1 + r)^n.");
  F("tvm", "Present value", "PV = FV / (1 + r)^n.");
  P("tvm", "$1,000 invested at 10% for 2 years. FV?", "$1,210.");
  P("tvm", "PV of $1,210 received in 2 years at 10%?", "$1,000.");
  C("tvm", "Net present value (NPV)", "PV of future cash flows - initial investment. Accept if NPV > 0: it earns more than the cost of capital.");
  C("tvm", "Internal rate of return (IRR)", "The discount rate that makes NPV = 0. Accept if IRR > cost of capital (watch out for unusual cash-flow patterns).");
  C("tvm", "Payback period", "Years to recover the initial investment. Simple, but ignores the time value of money and cash after payback.");
  F("tvm", "PV of a perpetuity", "Annual cash flow / r. With growth: CF next year / (r - g).");
  P("tvm", "Perpetuity paying $500 a year, r = 5%. PV?", "$10,000.");
  C("tvm", "Cost of capital (WACC)", "The weighted average return required by lenders and owners; the hurdle rate for investments.");
  P("tvm", "Invest $100 today, get $115 in one year; cost of capital 10%. NPV?", "+$4.55. 115 / 1.10 - 100. Accept.");
  C("tvm", "Rule of 72", "Years to double ≈ 72 / interest rate in %. At 8%, about 9 years.");

  /* ---------- BUS 5421: Managerial Economics (Froeb) ---------- */
  C("found", "Rational-actor paradigm (Froeb)", "Assume people act rationally, optimally and self-interestedly. To change behavior, change incentives.");
  C("found", "Froeb's problem-solving method", "Find the bad decision; ask who made it, did they have enough information, and the incentive to decide well? Fix information or incentives.");
  C("found", "Three ways to fix a bad decision (Froeb)", "Change (1) decision rights, (2) the information people have, or (3) incentives (evaluation and compensation).");
  C("found", "Organizational design trio", "Decision rights + evaluation (performance measurement) + rewards. They should be aligned.");
  C("found", "Positive vs normative economics", "Positive: what is (testable). Normative: what ought to be (value judgment).");
  C("found", "Efficiency in economics", "Resources go to their highest-valued use; all mutually beneficial trades happen.");
  C("found", "Voluntary trade creates wealth", "Assets move to people who value them more; both sides gain (buyer value > price > seller value).");
  C("found", "Consumer surplus", "Value to the buyer - price paid.");
  C("found", "Producer (seller) surplus", "Price received - seller's cost (or value).");
  C("found", "Ceteris paribus", "'Other things equal': change one variable and hold the rest constant.");

  C("oppcost", "Opportunity cost", "The value of the best alternative given up when you make a choice.");
  C("oppcost", "Explicit vs implicit cost", "Explicit: out-of-pocket payments. Implicit: forgone alternatives, like the owner's time or the return on capital.");
  F("oppcost", "Economic profit", "Revenue - explicit costs - implicit costs (including the opportunity cost of capital).");
  F("oppcost", "Economic value added (EVA)", "NOPAT - (cost of capital x invested capital). Profit after charging for all capital used.");
  P("oppcost", "Accounting profit $100k; owner could earn $80k elsewhere; capital could earn $30k elsewhere. Economic profit?", "-$10k. 100 - 80 - 30. Accounting profit hides a loss.");
  C("oppcost", "Hidden-cost fallacy (Froeb)", "Ignoring the opportunity cost of assets you already own, e.g. treating owned capital as free.");
  C("oppcost", "Zero economic profit means...", "The firm earns exactly its opportunity cost: a normal return. Not 'no money'.");
  P("oppcost", "You give up a $60k job to run a shop that earns $50k accounting profit. Good idea, purely financially?", "No. Economic profit is -$10k.");
  C("oppcost", "Comparative advantage", "Doing what you give up least to do (lowest opportunity cost). Basis for specialization and trade.");

  C("marginal", "Marginal analysis", "Compare the extra benefit with the extra cost of one more unit. Do more while MB > MC.");
  C("marginal", "Extent decisions (Froeb)", "'How much' decisions: produce, advertise or hire until marginal benefit = marginal cost.");
  F("marginal", "Profit-maximizing rule", "Produce where marginal revenue (MR) = marginal cost (MC).");
  F("marginal", "Marginal cost", "Change in total cost / change in quantity.");
  F("marginal", "Marginal revenue", "Change in total revenue / change in quantity.");
  C("marginal", "Average vs marginal", "Decisions should use marginal, not average, cost and benefit. Averages include fixed and sunk costs.");
  P("marginal", "The next unit adds $40 of revenue and $35 of cost. Produce it?", "Yes. It adds $5 of profit.");
  P("marginal", "TC(10) = $500, TC(11) = $560. MC of the 11th unit?", "$60.");
  C("marginal", "Diminishing marginal returns", "Adding more of one input to fixed others eventually adds less and less output.");
  C("marginal", "All-or-nothing bonus problem", "Agents respond to marginal incentives: a bonus paid only above a threshold gives no incentive once the threshold is safely met or out of reach.");
  C("marginal", "Shutdown rule (short run)", "Keep operating if price ≥ average variable cost (revenue covers variable costs); fixed costs are paid either way.");

  C("sunk", "Sunk cost", "A cost already incurred that can't be recovered. Irrelevant to forward-looking decisions.");
  C("sunk", "Sunk-cost fallacy", "Continuing a project because of what you've already spent, rather than on future costs and benefits.");
  P("sunk", "$2M already spent; finishing costs $1M more and brings $1.5M. Finish?", "Yes. Future benefit 1.5 > future cost 1.0. The $2M is sunk.");
  P("sunk", "$5M spent; finishing costs $3M; project returns $2M. Finish?", "No. 2 < 3, regardless of the $5M.");
  C("sunk", "Fixed vs sunk", "Fixed costs don't vary with output but may be avoidable (e.g. by shutting down). Sunk costs can't be avoided at all.");
  C("sunk", "Overhead allocation error", "Allocated fixed overhead does not change with the decision; including it can make profitable products look unprofitable.");
  C("sunk", "Relevant costs", "Costs that differ between the alternatives: future, avoidable costs, including opportunity costs.");
  C("sunk", "Three costly decision errors", "Ignoring hidden (opportunity) costs, letting sunk costs drive decisions, and using average instead of marginal analysis.");
  C("sunk", "Break-even price for an investment", "The price at which the project's NPV = 0, i.e. covers its avoidable cost per unit. Compare it with the expected price.");

  C("costs", "Fixed cost", "Doesn't change with output in the short run (rent, insurance).");
  C("costs", "Variable cost", "Rises with output (materials, hourly labor).");
  F("costs", "Average total cost", "Total cost / quantity = AFC + AVC.");
  C("costs", "Economies of scale", "Average cost falls as output rises (spreading fixed costs, specialization).");
  C("costs", "Diseconomies of scale", "Average cost rises at large output (coordination and bureaucracy costs).");
  C("costs", "Economies of scope", "Producing two products together is cheaper than producing them separately (shared assets, brand, distribution).");
  C("costs", "Learning curve", "Average cost falls with cumulative output as workers and firms learn.");
  C("costs", "Minimum efficient scale", "The smallest output at which average cost is lowest. High MES relative to the market means few firms.");
  C("costs", "Short run vs long run", "Short run: at least one input fixed. Long run: all inputs variable, including plant size and entry or exit.");
  P("costs", "Fixed $10k, variable $5 a unit, 1,000 units. Average total cost?", "$15. (10,000 + 5,000) / 1,000.");
  C("costs", "Make vs buy (vertical integration)", "Make when outsourcing would expose you to hold-up on specific investments; buy when the market is competitive and contracts are easy.");

  C("sd", "Law of demand", "Price up -> quantity demanded down, other things equal.");
  C("sd", "Law of supply", "Price up -> quantity supplied up.");
  C("sd", "Demand shifters", "Income, prices of substitutes and complements, tastes, expectations, number of buyers.");
  C("sd", "Supply shifters", "Input costs, technology, number of sellers, prices of other goods sellers could make, expectations.");
  C("sd", "Change in demand vs quantity demanded", "Change in demand: the whole curve shifts (a shifter changed). Change in quantity demanded: a move along the curve due to price.");
  C("sd", "Equilibrium", "Price where quantity demanded = quantity supplied.");
  C("sd", "Surplus and shortage", "Price above equilibrium -> surplus (excess supply); below -> shortage (excess demand).");
  C("sd", "Substitutes vs complements", "Substitutes: the price of one up -> demand for the other up (coffee and tea). Complements: price up -> demand for the other down (printers and ink).");
  C("sd", "Normal vs inferior good", "Normal: demand rises with income. Inferior: demand falls as income rises.");
  P("sd", "Demand Qd = 100 - 2P, supply Qs = 20 + 2P. Equilibrium price and quantity?", "P = 20, Q = 60.");
  C("sd", "Demand rises, supply unchanged", "Price up, quantity up.");
  C("sd", "Supply rises (cost falls), demand unchanged", "Price down, quantity up.");
  C("sd", "Price ceiling below equilibrium", "Shortage, queues, black markets (e.g. rent control).");
  C("sd", "Price floor above equilibrium", "Surplus (e.g. minimum wage -> fewer jobs than workers seeking them, per the standard model).");
  C("sd", "Deadweight loss", "Total surplus lost when output differs from the efficient quantity (from taxes, price controls, market power).");

  F("elasticity", "Price elasticity of demand", "% change in quantity demanded / % change in price.");
  C("elasticity", "Elastic vs inelastic", "|e| > 1 elastic (buyers sensitive); |e| < 1 inelastic; |e| = 1 unit elastic.");
  C("elasticity", "Elasticity and total revenue", "Elastic: raising price lowers revenue. Inelastic: raising price raises revenue. Revenue is maximized at unit elasticity.");
  C("elasticity", "Determinants of elasticity", "More substitutes, a bigger budget share, a longer time horizon, and narrowly defined goods -> more elastic.");
  P("elasticity", "Price up 10%, quantity down 25%. Elasticity, and what happens to revenue?", "|e| = 2.5, elastic; revenue falls.");
  F("elasticity", "Arc (midpoint) elasticity", "[(Q2 - Q1) / ((Q1 + Q2)/2)] / [(P2 - P1) / ((P1 + P2)/2)].");
  P("elasticity", "Price $10 -> $12, quantity 100 -> 80. Midpoint elasticity?", "About -1.22. (-20/90) / (2/11) = -0.222 / 0.182.");
  F("elasticity", "Income elasticity", "% change in quantity / % change in income. Positive = normal good; negative = inferior; > 1 = luxury.");
  F("elasticity", "Cross-price elasticity", "% change in quantity of A / % change in price of B. Positive = substitutes; negative = complements.");
  F("elasticity", "Optimal markup rule", "(P - MC) / P = 1 / |e|. Less elastic demand -> higher markup.");
  P("elasticity", "MC $60, demand elasticity -3. Profit-maximizing price?", "$90. (P - 60)/P = 1/3, so P = 90.");
  C("elasticity", "Firm vs industry elasticity", "A single brand's demand is more elastic than the industry's, because other brands are close substitutes.");
  F("elasticity", "Quick % change in quantity", "% change in Q ≈ elasticity x % change in P. E.g. e = -2, price +5% -> quantity -10%.");

  C("structures", "Perfect competition", "Many firms, identical products, free entry: price takers; long-run economic profit = 0; P = MC.");
  C("structures", "Monopolistic competition", "Many firms, differentiated products, free entry: some pricing power, but long-run economic profit tends to zero.");
  C("structures", "Oligopoly", "A few interdependent firms; strategic behavior (game theory); barriers to entry.");
  C("structures", "Monopoly", "A single seller with high entry barriers; sets MR = MC; price > MC; deadweight loss.");
  C("structures", "Barriers to entry", "Economies of scale, patents, licenses, control of key inputs, network effects, switching costs, brand.");
  C("structures", "Long-run entry and exit", "Profits attract entry and push price toward average cost; losses cause exit. Above-normal profit erodes without a sustainable advantage.");
  C("structures", "Sustainable competitive advantage", "Earning above-average profit long term requires something rivals can't easily copy: cost advantage, differentiation, or barriers.");
  C("structures", "Porter's Five Forces", "Rivalry, threat of entry, threat of substitutes, buyer power, supplier power.");
  C("structures", "Herfindahl-Hirschman Index (HHI)", "Sum of squared market shares (%). Under the 2023 US merger guidelines, over 1,800 = highly concentrated (the 2010 guidelines used 2,500).");
  P("structures", "Four firms with shares 40, 30, 20, 10%. HHI?", "3,000. 1600 + 900 + 400 + 100.");
  C("structures", "Indifference principle (Froeb)", "If assets or workers are mobile, in equilibrium all uses must be equally attractive: differences get bid away (compensating wage differentials, house prices).");
  C("structures", "Natural monopoly", "One firm can supply the market at lower cost than several, because of huge fixed costs (utilities). Often regulated.");

  C("pricing", "Monopoly pricing", "Pick the quantity where MR = MC, then charge the highest price demand allows for that quantity.");
  C("pricing", "Problem with cost-plus pricing", "It ignores demand (elasticity) and often uses average rather than marginal cost.");
  C("pricing", "Price discrimination", "Charging different prices to different customers for the same good, based on willingness to pay rather than cost.");
  C("pricing", "First-degree price discrimination", "Each customer pays their own maximum willingness to pay (perfect discrimination).");
  C("pricing", "Second-degree price discrimination", "Indirect: customers self-select via menus such as volume discounts, versions or quality tiers.");
  C("pricing", "Third-degree price discrimination", "Direct: different prices for identifiable groups (students, seniors, regions). Charge more to the less elastic group.");
  C("pricing", "Conditions for price discrimination", "Market power, ability to identify or sort customers, and preventing resale (arbitrage).");
  C("pricing", "Bundling", "Selling goods together; profitable when customers' valuations are negatively correlated.");
  P("pricing", "A values Word $100, Excel $40; B values Word $40, Excel $100. Zero marginal cost. Best separate prices vs a bundle?", "Separate: $100 each sells one of each = $200 (beats $40 each = $160). Bundle at $140 sells to both = $280.");
  C("pricing", "Two-part tariff", "An entry fee plus a per-unit price (gym membership plus fees, Costco). Set the unit price near MC and capture surplus with the fee.");
  C("pricing", "Versioning", "Offering a 'damaged' or premium version so customers sort themselves by willingness to pay.");
  C("pricing", "Peak-load pricing", "Charging more when demand is high and capacity is tight (airlines, electricity, ride-share surge).");
  P("pricing", "Adults: elasticity -2; students: -4. MC $10. Prices with the markup rule?", "Adults $20 ((P-10)/P = 1/2); students $13.33 ((P-10)/P = 1/4).");
  C("pricing", "Penetration vs skimming", "Penetration: a low entry price to win share and scale. Skimming: start high for eager buyers, then cut the price.");

  C("game", "Game theory", "Analysis of strategic decisions where your payoff depends on others' choices.");
  C("game", "Dominant strategy", "Best for you whatever the other player does.");
  C("game", "Nash equilibrium", "A set of strategies where no player can gain by changing strategy alone.");
  C("game", "Prisoner's dilemma", "Each player's dominant strategy (defect) leads to an outcome worse for both than cooperating. E.g. price wars, ad wars.");
  C("game", "Escaping the prisoner's dilemma", "Repeated play (tit-for-tat), contracts, mergers, meet-the-competition clauses (with legal limits on collusion).");
  C("game", "Sequential game", "Players move in turn; solve by backward induction from the last move.");
  C("game", "Credible commitment", "A threat or promise that is believable because carrying it out is in your interest, or because you have tied your hands.");
  C("game", "First-mover advantage", "Moving first can lock in an outcome (capacity, standards), if the commitment is credible and irreversible.");
  C("game", "Bargaining power", "Set by each side's alternative to agreement (BATNA). Improve your alternative or worsen theirs to win a bigger share.");
  C("game", "BATNA", "Best alternative to a negotiated agreement. Never accept a deal worse than it.");
  C("game", "Bargaining range (ZOPA)", "Between the seller's minimum (reservation price) and the buyer's maximum. A deal is possible only if buyer max > seller min.");
  P("game", "Payoffs (You, Rival): both High (10,10); you High/they Low (2,14); you Low/they High (14,2); both Low (5,5). Equilibrium?", "Both Low (5,5). Low is dominant for each (14 > 10, 5 > 2): a prisoner's dilemma.");
  C("game", "Mixed strategy", "Randomizing between choices so opponents can't predict you (penalty kicks, audits).");
  C("game", "Hold-up problem", "After one party makes a relationship-specific investment, the other can renegotiate to grab its value. Solved by contracts or integration.");

  F("uncert", "Expected value", "Sum of (probability x payoff) over the outcomes.");
  P("uncert", "60% chance of +$100k, 40% chance of -$50k. Expected value?", "+$40k. 60 - 20.");
  C("uncert", "Risk aversion", "Preferring a sure amount to a gamble with the same expected value; willing to pay to reduce risk (insurance).");
  C("uncert", "Value of information", "Expected value with the information - expected value without it. Never pay more than this.");
  C("uncert", "Oral (English) auction", "Ascending bids; the winner pays about the second-highest value. Bidding up to your value is optimal.");
  C("uncert", "Sealed-bid first-price auction", "Highest bid wins and pays its own bid, so bidders shade bids below their value.");
  C("uncert", "Second-price (Vickrey) auction", "Highest bid wins and pays the second-highest bid. Bidding your true value is a dominant strategy.");
  C("uncert", "Winner's curse", "In common-value auctions the winner is likely the one who overestimated the value most. Bid below your estimate.");
  C("uncert", "Revenue equivalence", "Under standard assumptions (risk-neutral, independent private values), the common auction formats yield the same expected revenue.");
  C("uncert", "Decision tree", "Map choices and chance events, attach probabilities and payoffs, then work backward picking the best expected value.");

  C("asymmetric", "Asymmetric information", "One party to a deal knows more than the other.");
  C("asymmetric", "Adverse selection", "Hidden information BEFORE the deal: the worst types are most eager to participate (lemons, high-risk insurance buyers).");
  C("asymmetric", "Moral hazard", "Hidden action AFTER the deal: behavior changes because someone else bears the cost (insured drivers take less care).");
  C("asymmetric", "Market for lemons (Akerlof)", "Buyers can't tell quality, so they pay average prices; good cars exit; the market can unravel.");
  C("asymmetric", "Signaling", "The informed party credibly reveals its type with a costly action that low types can't afford to copy (warranties, degrees).");
  C("asymmetric", "Screening", "The uninformed party designs choices so types sort themselves (deductible menus, probation periods).");
  C("asymmetric", "Fixes for adverse selection", "Screening, signaling, warranties, reputation, third-party certification, mandatory pooling (e.g. insurance mandates).");
  C("asymmetric", "Fixes for moral hazard", "Monitoring, deductibles and co-pays, performance-based pay, bonding, reputation.");
  C("asymmetric", "Example: deductible", "Reduces moral hazard (the insured bears part of the loss) and screens for risk (low-risk people pick high deductibles).");
  C("asymmetric", "Example: warranty", "A signal of quality: a maker of a bad product can't afford to offer a long warranty.");
  C("asymmetric", "Adverse selection or moral hazard? A bank's riskiest applicants most want loans", "Adverse selection (hidden type before the deal).");
  C("asymmetric", "Adverse selection or moral hazard? A borrower takes bigger risks after getting the loan", "Moral hazard (hidden action after the deal).");

  C("incentives", "Principal-agent problem", "An agent (employee, manager) acting for a principal (owner) has different goals and better information.");
  C("incentives", "Incentive-pay trade-off", "Stronger performance pay improves effort but loads risk on the agent, who must be paid more to bear it.");
  C("incentives", "Pay on revenue vs profit", "Revenue pay pushes sales staff to cut price and chase volume; profit or margin pay aligns with owners.");
  C("incentives", "Fixed salary vs commission", "Salary: low risk, weak effort incentive (needs monitoring). Commission: strong incentive, more risk, can encourage gaming.");
  C("incentives", "Gaming performance metrics", "People optimize the measure, not the goal (Goodhart's law). Use multiple, hard-to-manipulate measures.");
  C("incentives", "Relative performance evaluation", "Pay based on performance relative to peers, filtering out common shocks (tournaments, rankings).");
  C("incentives", "Stock options for CEOs", "Align managers with shareholders, but can encourage short-termism or excessive risk-taking.");
  C("incentives", "Centralization vs decentralization", "Centralize when coordination matters and information is easy to send up; decentralize when local knowledge matters.");
  C("incentives", "Transfer pricing", "The price one division charges another. Setting it at marginal or opportunity cost avoids distorting internal decisions.");
  C("incentives", "Profit center vs cost center", "Profit center: judged on profit. Cost center: judged on meeting output at minimum cost. The metric drives behavior.");
  C("incentives", "Efficiency wage", "Paying above market to boost effort and loyalty and cut turnover: the job becomes costly to lose.");
  C("incentives", "Multitask problem", "Rewarding only measurable tasks causes neglect of unmeasured ones (quality, teamwork).");

  C("failure", "Externality", "A cost or benefit falling on third parties outside the transaction.");
  C("failure", "Negative externality result", "The market overproduces (pollution). Fixes: Pigouvian tax, cap-and-trade, regulation.");
  C("failure", "Positive externality result", "The market underproduces (vaccines, R&D). Fixes: subsidies, patents.");
  C("failure", "Public good", "Non-rival and non-excludable (national defense). Free riders lead to underprovision.");
  C("failure", "Free-rider problem", "People benefit without paying, so voluntary provision falls short.");
  C("failure", "Coase theorem", "With clear property rights and low transaction costs, private bargaining reaches the efficient outcome regardless of who holds the rights.");
  C("failure", "Tragedy of the commons", "Shared resources with open access get overused (overfishing).");
  C("failure", "Antitrust (Sherman Act)", "Bans price-fixing and monopolization; mergers are reviewed (Clayton Act) for reducing competition.");
  C("failure", "Exchange rates and trade", "A stronger dollar makes imports cheaper and US exports less competitive.");

  /* ---------- Statement Analysis (generated) ---------- */
  var COS = [
    // name, industry, health, cash, ar, inv, otherCA, ppe, ap, std, otherCL, ltd, rev, cogs, opex, int, taxRate  ($k)
    ["Harbor Fresh Grocers", "grocery", "healthy", 60, 20, 180, 10, 430, 150, 30, 40, 200, 2400, 1800, 480, 12, 0.25],
    ["Cobalt Software", "software", "healthy", 420, 160, 0, 40, 180, 40, 0, 90, 100, 900, 180, 450, 6, 0.25],
    ["Redline Trucking", "transport", "distressed", 15, 70, 10, 5, 700, 90, 120, 50, 420, 800, 560, 190, 48, 0.25],
    ["Pinecrest Furniture", "manufacturing", "healthy", 50, 110, 160, 20, 360, 80, 40, 30, 180, 1100, 715, 250, 14, 0.25],
    ["Lumen Retail Co.", "retail", "distressed", 10, 30, 260, 10, 380, 210, 90, 60, 230, 1300, 1000, 290, 36, 0.25],
    ["Bluewater Marine Supply", "wholesale", "healthy", 80, 140, 220, 10, 150, 120, 50, 30, 100, 1500, 1125, 270, 9, 0.25],
    ["Summit Dental Group", "healthcare", "healthy", 90, 120, 15, 15, 260, 30, 20, 50, 150, 700, 280, 320, 10, 0.25],
    ["Atlas Steel Works", "heavy industry", "distressed", 20, 90, 140, 10, 940, 160, 140, 80, 700, 1200, 1020, 160, 70, 0.25],
    ["Greenleaf Solar", "energy", "growing", 140, 100, 60, 20, 880, 70, 30, 40, 500, 600, 390, 120, 35, 0.25],
    ["Orbit Coffee Roasters", "food & beverage", "healthy", 45, 35, 70, 10, 240, 40, 15, 25, 110, 650, 390, 205, 7, 0.25],
    ["Keystone Construction", "construction", "distressed", 25, 210, 30, 15, 320, 190, 110, 60, 140, 1000, 860, 145, 22, 0.25],
    ["Nimbus Airlines", "airline", "distressed", 160, 40, 20, 30, 1750, 180, 210, 300, 1180, 2000, 1500, 450, 95, 0.25]
  ];
  function r2(x) { return Math.round(x * 100) / 100; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function k(x) { return (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US") + "k"; }
  function company(a) {
    var c = { name: a[0], industry: a[1], health: a[2], cash: a[3], ar: a[4], inv: a[5], oca: a[6], ppe: a[7], ap: a[8], std: a[9], ocl: a[10], ltd: a[11],
      rev: a[12], cogs: a[13], opex: a[14], int: a[15], tax: a[16] };
    c.ca = c.cash + c.ar + c.inv + c.oca; c.ta = c.ca + c.ppe; c.cl = c.ap + c.std + c.ocl; c.tl = c.cl + c.ltd; c.eq = c.ta - c.tl;
    c.gp = c.rev - c.cogs; c.ebit = c.gp - c.opex; c.ebt = c.ebit - c.int; c.taxes = c.ebt > 0 ? Math.round(c.ebt * c.tax) : 0; c.ni = c.ebt - c.taxes;
    return c;
  }
  var COMPANIES = COS.map(company);
  function bsTable(c) {
    return { title: c.name + " (" + c.industry + ") balance sheet, $k", rows: [
      ["Cash", c.cash], ["Receivables", c.ar], ["Inventory", c.inv], ["Other current", c.oca], ["Total current assets", c.ca, "t"], ["PP&E, net", c.ppe], ["Total assets", c.ta, "tt"],
      ["Accounts payable", c.ap], ["Short-term debt", c.std], ["Other current liab.", c.ocl], ["Total current liab.", c.cl, "t"], ["Long-term debt", c.ltd], ["Total liabilities", c.tl, "t"], ["Equity", c.eq], ["Total liab. + equity", c.tl + c.eq, "tt"]] };
  }
  function isTable(c) {
    return { title: "Income statement, $k", rows: [["Revenue", c.rev], ["COGS", -c.cogs], ["Gross profit", c.gp, "t"], ["Operating expenses", -c.opex], ["EBIT", c.ebit, "t"], ["Interest", -c.int], ["Taxes", -c.taxes], ["Net income", c.ni, "tt"]] };
  }
  function band(v, lo, hi, a, b, d) { return v < lo ? a : v < hi ? b : d; }
  var SAQ = {
    current: function (c) { var v = c.ca / c.cl; return { q: "Current ratio?", val: v, a: r2(v).toFixed(2) + "x", w: "Current assets / current liabilities = " + c.ca + " / " + c.cl + " = " + r2(v).toFixed(2) + ".",
      i: band(v, 1, 1.5, "Below 1: current liabilities exceed current assets. A liquidity warning; it may struggle to pay bills due this year.", "Thin cushion: it can cover this year's bills, with little room for surprises.", "Comfortable: about $" + r2(v).toFixed(2) + " of current assets for every $1 due within a year.") + (c.industry === "grocery" ? " Grocers often run low ratios because inventory sells fast and suppliers are paid later." : "") }; },
    quick: function (c) { var q = c.cash + c.ar, v = q / c.cl; return { q: "Quick ratio, (cash + receivables) / current liabilities?", val: v, a: r2(v).toFixed(2) + "x", w: "(" + c.cash + " + " + c.ar + ") / " + c.cl + " = " + q + " / " + c.cl + " = " + r2(v).toFixed(2) + ".",
      i: band(v, 0.5, 1, "Very low: without selling inventory it covers well under half its near-term bills.", "Below 1: it relies on selling inventory to pay current liabilities.", "1 or more: it can pay near-term bills without selling any inventory.") + (c.inv > c.ca * 0.5 ? " Inventory is over half of current assets, so the quick ratio is far below the current ratio." : "") }; },
    wc: function (c) { var v = c.ca - c.cl; return { q: "Working capital?", val: v, a: k(v), w: "Current assets - current liabilities = " + c.ca + " - " + c.cl + " = " + v + ".",
      i: v < 0 ? "Negative: short-term obligations exceed short-term assets. It needs operating cash, new borrowing or asset sales to stay current." : "Positive: a " + k(v) + " cushion of short-term assets over short-term obligations." }; },
    de: function (c) { var v = c.tl / c.eq; return { q: "Debt-to-equity (total liabilities / equity)?", val: v, a: r2(v).toFixed(2) + "x", w: "Total liabilities / equity = " + c.tl + " / " + c.eq + " = " + r2(v).toFixed(2) + ".",
      i: band(v, 1, 2, "Conservative: owners fund more of the assets than creditors do.", "Moderate: creditors fund more than owners. Normal in many industries, but watch interest coverage.", "Highly leveraged: $" + r2(v).toFixed(2) + " of liabilities per $1 of equity. Little cushion if profits fall.") }; },
    roa: function (c) { var v = c.ni / c.ta * 100; return { q: "Return on assets (net income / total assets)?", val: v, a: r1(v).toFixed(1) + "%", w: "Net income / total assets = " + c.ni + " / " + c.ta + " = " + r1(v).toFixed(1) + "%.",
      i: v < 0 ? "Negative: the assets are losing money." : band(v, 3, 8, "Low: the asset base earns little.", "Moderate return on the asset base.", "Strong: the assets earn a high return.") }; },
    roe: function (c) { var v = c.ni / c.eq * 100; return { q: "Return on equity (net income / equity)?", val: v, a: r1(v).toFixed(1) + "%", w: "Net income / equity = " + c.ni + " / " + c.eq + " = " + r1(v).toFixed(1) + "%.",
      i: v < 0 ? "Negative: the owners' stake shrank this year." : (c.tl / c.eq > 2 ? "Flattered by leverage: equity is small (D/E " + r2(c.tl / c.eq).toFixed(2) + "), so debt, not just operations, lifts ROE." : band(v, 8, 15, "Below a typical cost of equity (~10%): weak for the owners.", "Reasonable return for the owners.", "Strong return for the owners.")) }; },
    gm: function (c) { var v = c.gp / c.rev * 100; return { q: "Gross margin?", val: v, a: r1(v).toFixed(1) + "%", w: "Gross profit / revenue = " + c.gp + " / " + c.rev + " = " + r1(v).toFixed(1) + "%.",
      i: "Keeps " + Math.round(v) + " cents of each sales dollar after product costs. " + (v > 60 ? "Very high: typical of software or services with low direct costs." : v < 26 ? "Thin: typical of grocery, wholesale or commodity businesses; volume matters." : "Mid-range; compare with industry peers.") }; },
    nm: function (c) { var v = c.ni / c.rev * 100; return { q: "Net profit margin?", val: v, a: r1(v).toFixed(1) + "%", w: "Net income / revenue = " + c.ni + " / " + c.rev + " = " + r1(v).toFixed(1) + "%.",
      i: v < 0 ? "Losing money: costs and interest exceed revenue." : band(v, 3, 10, "Thin: little room for cost increases.", "Healthy for most industries.", "High: strong pricing power or low costs.") }; },
    tie: function (c) { var v = c.ebit / c.int; return { q: "Interest coverage (EBIT / interest)?", val: v, a: r1(v).toFixed(1) + "x", w: "EBIT / interest = " + c.ebit + " / " + c.int + " = " + r1(v).toFixed(1) + ".",
      i: v < 1.5 ? "Danger: operating profit barely covers, or doesn't cover, interest. High default risk." : v < 4 ? "Adequate, but not much margin if profits dip." : "Comfortable: interest is easily covered." }; }
  };
  var PLAN = [
    ["current", "quick", "de", "roe"], ["current", "wc", "gm", "nm"], ["current", "wc", "de", "tie"], ["quick", "roa", "roe", "gm"],
    ["current", "quick", "wc", "nm"], ["current", "de", "roa", "gm"], ["quick", "de", "nm", "roe"], ["wc", "de", "tie", "roa"],
    ["current", "de", "roe", "tie"], ["current", "quick", "gm", "roa"], ["current", "wc", "nm", "de"], ["wc", "quick", "de", "tie"]
  ];
  var NEEDS_IS = { roa: 1, roe: 1, gm: 1, nm: 1, tie: 1 };
  var SA = [];
  COMPANIES.forEach(function (c, ci) {
    PLAN[ci].forEach(function (m) {
      var r = SAQ[m](c);
      SA.push({ id: "sa-" + (ci + 1) + "-" + m, topic: "sa", course: "sa", kind: "statement", metric: m, company: c.name, health: c.health, value: r.val,
        f: c.name + ": " + r.q, q: r.q, tables: NEEDS_IS[m] ? [bsTable(c), isTable(c)] : [bsTable(c)], answer: r.a, work: r.w, interp: r.i, b: r.a + ". " + r.w + " " + r.i });
    });
  });
  var ALL = CARDS.concat(SA);
  var BASE = ALL.slice(); // the built-in deck exactly as shipped

  /* ---------- v4.9: My cards (custom AI cards) and improved-card overrides, stored by the app on the device ---------- */
  var MINE = "mine", MINE_NAME = "My cards";
  function validTopic(t) { for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].key === t && TOPICS[i].course !== "sa") return true; return false; }
  function clean(v, n) { return typeof v === "string" ? v.trim().slice(0, n) : ""; }
  // user = { cards: [{id, topic, f, b, ai, orig?}], over: { <baseId>: {f, b} } }. Rebuilds ALL in place (same array object) so stats, filters and queues just work.
  function setUser(user) {
    user = user || {}; var over = user.over || {}, out = [], seen = {};
    BASE.forEach(function (c) {
      var o = over[c.id]; seen[c.id] = 1;
      if (!o || c.kind === "statement" || !clean(o.f, 600) || !clean(o.b, 1500)) { out.push(c); return; }
      var n = {}; for (var k in c) n[k] = c[k]; n.f = clean(o.f, 600); n.b = clean(o.b, 1500); n.improved = true; out.push(n);
    });
    (user.cards || []).forEach(function (c) {
      if (!c || typeof c.id !== "string" || seen[c.id] || !clean(c.f, 600) || !clean(c.b, 1500)) return; seen[c.id] = 1;
      var t = validTopic(c.topic) ? c.topic : MINE;
      out.push({ id: c.id, topic: t, course: t === MINE ? MINE : topicCourse(t), kind: "term", f: clean(c.f, 600), b: clean(c.b, 1500), custom: true, ai: c.ai !== false, improved: !!c.orig });
    });
    ALL.length = 0; out.forEach(function (c) { ALL.push(c); });
    return ALL;
  }
  function baseCard(id) { for (var i = 0; i < BASE.length; i++) if (BASE[i].id === id) return BASE[i]; return null; }

  /* ---------- deck logic (pure) ---------- */
  function topicName(key) { if (key === MINE) return MINE_NAME; for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].key === key) return TOPICS[i].name; return key; }
  // filter: "all" | "course:acct" | "course:econ" | "topic:<key>" | "sa" | "restudy" | "unseen"
  function filterCards(filter, st) {
    st = st || { cards: {} };
    return ALL.filter(function (c) {
      var s = st.cards[c.id] || {};
      if (!filter || filter === "all") return true;
      if (filter === "sa") return c.course === "sa";
      if (filter === "mine") return !!c.custom;
      if (filter === "restudy") return !!s.restudy;
      if (filter === "unseen") return !s.seen;
      if (filter.indexOf("course:") === 0) return c.course === filter.slice(7);
      if (filter.indexOf("topic:") === 0) return c.topic === filter.slice(6);
      return true;
    });
  }
  function rng(seed) { var x = (seed >>> 0) || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
  function shuffle(arr, rand) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // session order: shuffled (optional), with Restudy cards and cards missed more than got placed first
  function buildQueue(cards, st, seed, doShuffle) {
    st = st || { cards: {} };
    var ids = cards.map(function (c) { return c.id; });
    if (doShuffle !== false) ids = shuffle(ids, rng(seed || Date.now()));
    var weak = [], rest = [];
    ids.forEach(function (id) { var s = st.cards[id] || {}; ((s.restudy || (s.miss || 0) > (s.got || 0)) ? weak : rest).push(id); });
    return weak.concat(rest);
  }
  var REQUEUE_GAP = 3;
  function newState() { return { cards: {}, life: { got: 0, miss: 0 }, sessions: 0 }; }
  // record an answer; returns the new queue. A missed card comes back REQUEUE_GAP cards later.
  function answer(st, queue, id, got, now) {
    var s = st.cards[id] || (st.cards[id] = { seen: 0, got: 0, miss: 0 });
    s.seen++; s.last = now || Date.now();
    if (got) { s.got++; st.life.got++; } else { s.miss++; st.life.miss++; s.restudy = true; }
    var q = queue.slice(), pos = q.indexOf(id); if (pos >= 0) q.splice(pos, 1);
    if (!got) q.splice(Math.min(REQUEUE_GAP, q.length), 0, id);
    return q;
  }
  function setRestudy(st, id, on) { var s = st.cards[id] || (st.cards[id] = { seen: 0, got: 0, miss: 0 }); s.restudy = !!on; }
  function stats(st) {
    st = st || newState();
    var seen = 0, mastered = 0, restudy = 0, byCourse = {};
    ALL.forEach(function (c) {
      var s = st.cards[c.id], b = byCourse[c.course] || (byCourse[c.course] = { total: 0, seen: 0, got: 0, miss: 0 }); b.total++;
      if (s && s.seen) { seen++; b.seen++; b.got += s.got; b.miss += s.miss; if (s.got > s.miss && !s.restudy) mastered++; }
      if (s && s.restudy) restudy++;
    });
    var n = st.life.got + st.life.miss;
    return { total: ALL.length, seen: seen, unseen: ALL.length - seen, mastered: mastered, restudy: restudy, got: st.life.got, miss: st.life.miss, acc: n ? st.life.got / n : 0, byCourse: byCourse, sessions: st.sessions || 0 };
  }
  return { MINE: MINE, MINE_NAME: MINE_NAME, setUser: setUser, baseCard: baseCard, validTopic: validTopic, BASE: BASE, COURSES: COURSES, TOPICS: TOPICS, CARDS: CARDS, SA: SA, ALL: ALL, COMPANIES: COMPANIES, SAQ: SAQ, topicName: topicName, filterCards: filterCards,
    buildQueue: buildQueue, answer: answer, setRestudy: setRestudy, stats: stats, newState: newState, REQUEUE_GAP: REQUEUE_GAP, shuffle: shuffle, rng: rng };
});
