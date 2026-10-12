/* Sample financial statements for Skyline Avionics (the made-up company in the Episode 1 audio script).
   FY2026 matches the script exactly; FY2024-2025 are invented to be consistent with it. Amounts in $ thousands.
   Every total is written out (not computed) so the tests can check the arithmetic independently. */
(function (r, f) { if (typeof module === "object" && module.exports) module.exports = f(); else r.Statements = f(); })(typeof self !== "undefined" ? self : this, function () {
  var YEARS = [2024, 2025, 2026];
  // opening balance sheet (end of 2023) is needed so the 2024 cash flow statement ties; it is not displayed
  var OPEN = { cash: 25, ar: 15, inv: 15, tca: 55, ppe: 274, ta: 329, ap: 33, wages: 8, tcl: 41, loan: 194, tl: 235, paid: 80, re: 14, te: 94, tle: 329 };
  var BS = {
    title: "Balance sheet (December 31)", base: "ta", baseLabel: "% of total assets",
    rows: [
      { h: "Assets" },
      { k: "cash", label: "Cash", v: [30, 40, 50] },
      { k: "ar", label: "Accounts receivable", v: [18, 20, 30] },
      { k: "inv", label: "Inventory", v: [17, 20, 20] },
      { k: "tca", label: "Total current assets", v: [65, 80, 100], total: 1 },
      { k: "ppe", label: "Equipment & building, net of depreciation", v: [278, 285, 300] },
      { k: "ta", label: "Total assets", v: [343, 365, 400], total: 2 },
      { h: "Liabilities and owners' equity" },
      { k: "ap", label: "Accounts payable", v: [36, 40, 40] },
      { k: "wages", label: "Wages owed", v: [9, 10, 10] },
      { k: "tcl", label: "Total current liabilities", v: [45, 50, 50], total: 1 },
      { k: "loan", label: "Bank loan (long-term)", v: [188, 170, 150] },
      { k: "tl", label: "Total liabilities", v: [233, 220, 200], total: 1 },
      { k: "paid", label: "Owners' paid-in capital", v: [80, 80, 80] },
      { k: "re", label: "Retained earnings", v: [30, 65, 120] },
      { k: "te", label: "Total owners' equity", v: [110, 145, 200], total: 1 },
      { k: "tle", label: "Total liabilities & equity", v: [343, 365, 400], total: 2 }
    ]
  };
  var IS = {
    title: "Income statement (year ended December 31)", base: "rev", baseLabel: "% of revenue",
    rows: [
      { k: "rev", label: "Revenue (sales)", v: [430, 500, 600], total: 1 },
      { k: "cogs", label: "Cost of goods sold", v: [275, 310, 360], neg: 1 },
      { k: "gp", label: "Gross profit", v: [155, 190, 240], total: 1 },
      { k: "opex", label: "Operating expenses (includes depreciation)", v: [115, 128, 150], neg: 1 },
      { k: "dep", label: "  of which depreciation", v: [21, 23, 25], sub: 1 },
      { k: "ebit", label: "Operating income (EBIT)", v: [40, 62, 90], total: 1 },
      { k: "int", label: "Interest expense", v: [13, 12, 10], neg: 1 },
      { k: "ebt", label: "Income before taxes", v: [27, 50, 80], total: 1 },
      { k: "tax", label: "Income taxes", v: [7, 10, 20], neg: 1 },
      { k: "ni", label: "Net income", v: [20, 40, 60], total: 2 }
    ]
  };
  var CF = {
    title: "Cash flow statement (year ended December 31)", base: "rev", baseLabel: "% of revenue",
    rows: [
      { h: "Operating activities" },
      { k: "cf_ni", label: "Net income", v: [20, 40, 60] },
      { k: "cf_dep", label: "Add back depreciation", v: [21, 23, 25] },
      { k: "cf_ar", label: "(Increase) in accounts receivable", v: [-3, -2, -10] },
      { k: "cf_inv", label: "(Increase) in inventory", v: [-2, -3, 0] },
      { k: "cf_ap", label: "Increase in accounts payable", v: [3, 4, 0] },
      { k: "cf_wages", label: "Increase in wages owed", v: [1, 1, 0] },
      { k: "cfo", label: "Cash from operations", v: [40, 63, 75], total: 1 },
      { h: "Investing activities" },
      { k: "capex", label: "Purchase of equipment", v: [-25, -30, -40] },
      { k: "cfi", label: "Cash from investing", v: [-25, -30, -40], total: 1 },
      { h: "Financing activities" },
      { k: "cf_loan", label: "Repayment of bank loan", v: [-6, -18, -20] },
      { k: "div", label: "Paid to owners (dividends)", v: [-4, -5, -5] },
      { k: "cff", label: "Cash from financing", v: [-10, -23, -25], total: 1 },
      { k: "netcash", label: "Net change in cash", v: [5, 10, 10], total: 2 },
      { k: "cash0", label: "Cash at start of year", v: [25, 30, 40] },
      { k: "cash1", label: "Cash at end of year", v: [30, 40, 50], total: 1 }
    ]
  };
  var MARKET_EQUITY = [200, 250, 300]; // for the Altman Z-score; 2026 = the script's 300

  function val(st, k, i) { for (var j = 0; j < st.rows.length; j++) if (st.rows[j].k === k) return st.rows[j].v[i]; throw new Error("no line " + k); }
  function b(k, i) { return val(BS, k, i); } function inc(k, i) { return val(IS, k, i); } function cf(k, i) { return val(CF, k, i); }
  function commonSize(st, k, i) { var base = st === CF ? val(IS, "rev", i) : val(st, st.base, i); return base ? val(st, k, i) / base : 0; }
  function prevBS(k, i) { return i > 0 ? b(k, i - 1) : OPEN[k]; }

  // key ratios (year-end balances, as in the audio script)
  var RATIOS = [
    { k: "current", label: "Current ratio", f: "Current assets / current liabilities", fmt: "x", lines: ["tca", "tcl"], calc: function (i) { return b("tca", i) / b("tcl", i); } },
    { k: "quick", label: "Quick ratio", f: "(Cash + receivables) / current liabilities", fmt: "x", lines: ["cash", "ar", "tcl"], calc: function (i) { return (b("cash", i) + b("ar", i)) / b("tcl", i); } },
    { k: "wc", label: "Working capital ($K)", f: "Current assets - current liabilities", fmt: "$", lines: ["tca", "tcl"], calc: function (i) { return b("tca", i) - b("tcl", i); } },
    { k: "de", label: "Debt-to-equity", f: "Total liabilities / total equity", fmt: "x", lines: ["tl", "te"], calc: function (i) { return b("tl", i) / b("te", i); } },
    { k: "tie", label: "Times interest earned", f: "Operating income / interest expense", fmt: "x", lines: ["ebit", "int"], calc: function (i) { return inc("ebit", i) / inc("int", i); } },
    { k: "gm", label: "Gross margin", f: "Gross profit / revenue", fmt: "%", lines: ["gp", "rev"], calc: function (i) { return inc("gp", i) / inc("rev", i); } },
    { k: "nm", label: "Net profit margin", f: "Net income / revenue", fmt: "%", lines: ["ni", "rev"], calc: function (i) { return inc("ni", i) / inc("rev", i); } },
    { k: "roa", label: "Return on assets (ROA)", f: "Net income / total assets", fmt: "%", lines: ["ni", "ta"], calc: function (i) { return inc("ni", i) / b("ta", i); } },
    { k: "roe", label: "Return on equity (ROE)", f: "Net income / owners' equity", fmt: "%", lines: ["ni", "te"], calc: function (i) { return inc("ni", i) / b("te", i); } },
    { k: "at", label: "Asset turnover", f: "Revenue / total assets", fmt: "x", lines: ["rev", "ta"], calc: function (i) { return inc("rev", i) / b("ta", i); } },
    { k: "it", label: "Inventory turnover", f: "Cost of goods sold / inventory", fmt: "x", lines: ["cogs", "inv"], calc: function (i) { return inc("cogs", i) / b("inv", i); } },
    { k: "z", label: "Altman Z-score", f: "1.2A + 1.4B + 3.3C + 0.6D + 1.0E", fmt: "x", lines: ["tca", "tcl", "re", "ebit", "tl", "rev", "ta"], calc: function (i) { return altman(i).z; } }
  ];
  // the original Altman model: A = working capital / total assets (Skyline 2026: 50 / 400, exactly as in the script)
  function altman(i) {
    var ta = b("ta", i), A = (b("tca", i) - b("tcl", i)) / ta, B = b("re", i) / ta, C = inc("ebit", i) / ta, D = MARKET_EQUITY[i] / b("tl", i), E = inc("rev", i) / ta;
    return { A: A, B: B, C: C, D: D, E: E, z: 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E };
  }
  function ratio(k, i) { for (var j = 0; j < RATIOS.length; j++) if (RATIOS[j].k === k) return RATIOS[j].calc(i); throw new Error("no ratio " + k); }
  function growth(st, k, i) { var a = val(st, k, i - 1); return a ? (val(st, k, i) - a) / Math.abs(a) : 0; }

  // ---- which lines a lesson part is talking about (rules checked in order; all matching rules add their lines)
  // ratio rules win: when a part talks about a ratio, highlight just the lines in that ratio
  var RRULES = [
    [/current ratio/i, ["tca", "tcl"], "current"], [/quick ratio|acid.test|quick assets/i, ["cash", "ar", "tcl"], "quick"], [/working capital is|working capital\./i, ["tca", "tcl"], "wc"],
    [/debt.to.equity/i, ["tl", "te"], "de"], [/times interest earned|interest coverage/i, ["ebit", "int"], "tie"],
    [/gross margin/i, ["gp", "rev"], "gm"], [/net profit margin|net margin/i, ["ni", "rev"], "nm"], [/return on assets|R-O-A\b/i, ["ni", "ta"], "roa"],
    [/return on equity|R-O-E\b/i, ["ni", "te"], "roe"], [/asset turnover/i, ["rev", "ta"], "at"], [/inventory turnover/i, ["cogs", "inv"], "it"],
    [/^A(,| is)/, ["tca", "tcl", "ta"], "z"], [/^B(,| is)/, ["re", "ta"], "z"], [/^C(,| is)/, ["ebit", "ta"], "z"], [/^D(,| is)/, ["tl"], "z"], [/^E(,| is)/, ["rev", "ta"], "z"],
    [/altman|z-score|z score/i, ["tca", "tcl", "re", "ebit", "tl", "rev", "ta"], "z"]
  ];
  var RULES = [
    [/current assets/i, ["cash", "ar", "inv", "tca"]], [/current liabilit/i, ["ap", "wages", "tcl"]],
    [/receivable|customers owe/i, ["ar", "cf_ar"]], [/inventor/i, ["inv"]], [/accounts payable|bills it has not paid/i, ["ap"]], [/wages/i, ["wages"]],
    [/bank loan|loan|mortgage/i, ["loan"]], [/equipment|building|aircraft|long-term asset/i, ["ppe"]],
    [/total assets/i, ["ta"]], [/total liabilities|liabilities of two hundred/i, ["tl"]], [/retained earnings/i, ["re"]], [/equity/i, ["te"]],
    [/assets equal liabilities plus equity|it balances/i, ["ta", "tl", "te", "tle"]],
    [/revenue|\bsales\b/i, ["rev"]], [/cost of goods|C-O-G-S/i, ["cogs"]], [/gross profit/i, ["gp"]], [/operating expenses/i, ["opex"]],
    [/operating income|E-B-I-T/i, ["ebit"]], [/interest/i, ["int"]], [/before taxes|taxes/i, ["ebt", "tax"]], [/net income/i, ["ni"]],
    [/depreciation/i, ["dep", "cf_dep"]], [/cash from operations|operating activit|^operating\b/i, ["cfo"]], [/investing/i, ["capex", "cfi"]],
    [/financing|paid down|to the owners/i, ["cf_loan", "div", "cff"]], [/cash grew|cash only grew|net change in cash/i, ["netcash", "cash1"]],
    [/\bcash\b/i, ["cash"]]
  ];
  var WHERE = {}; [BS, IS, CF].forEach(function (st, n) { st.rows.forEach(function (r) { if (r.k) WHERE[r.k] = ["bs", "is", "cf"][n]; }); });
  var TOPIC_STMT = { equation: "bs", balance: "bs", income: "is", cashflow: "cf", accrual: "is", liquidity: "bs", leverage: "bs", profit: "is", efficiency: "is", hv: "is", altman: "bs", tenk: "bs" };
  function relevant(topicKey) { return Object.prototype.hasOwnProperty.call(TOPIC_STMT, topicKey); }
  function add(list, ks) { ks.forEach(function (k) { if (list.indexOf(k) < 0) list.push(k); }); }
  function linesFor(text, topicKey) {
    var keys = [], ratios = [];
    text = (text || "").trim();
    RRULES.forEach(function (r) { if (r[0].test(text)) { add(keys, r[1]); if (ratios.indexOf(r[2]) < 0) ratios.push(r[2]); } });
    if (!ratios.length) RULES.forEach(function (r) { if (r[0].test(text)) add(keys, r[1]); });
    var count = { bs: 0, is: 0, cf: 0 }; keys.forEach(function (k) { count[WHERE[k]]++; });
    var pref = TOPIC_STMT[topicKey] || "bs", best = pref;
    ["bs", "is", "cf"].forEach(function (s) { if (count[s] > count[best]) best = s; });
    var stmt = count[pref] > 0 || !keys.length ? pref : best;
    return { stmt: stmt, keys: keys, ratios: ratios };
  }
  return { YEARS: YEARS, OPEN: OPEN, BS: BS, IS: IS, CF: CF, STATEMENTS: { bs: BS, is: IS, cf: CF }, RATIOS: RATIOS, MARKET_EQUITY: MARKET_EQUITY, WHERE: WHERE,
    val: val, commonSize: commonSize, prevBS: prevBS, ratio: ratio, altman: altman, growth: growth, linesFor: linesFor, relevant: relevant, TOPIC_STMT: TOPIC_STMT };
});
