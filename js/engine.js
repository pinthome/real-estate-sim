/* =========================================================
 * 不動産投資収益シミュレーション 計算エンジン
 * Excel版（雛形/法人税版/簡易版）の検証で判明した不具合を
 * すべて修正したロジック。ブラウザ/Node両対応・純粋関数のみ。
 *
 * 修正済みの論点:
 *  - 頭金（自己資金）を年0のキャッシュアウトとして計上
 *  - 中古耐用年数: 全部経過時は法定×20%、下限2年
 *  - 長期譲渡は7年目以降（譲渡年1/1時点で所有5年超・年初取得前提）
 *  - 給与所得控除は令和7年度改正（最低65万円）
 *  - 法人税は下限0＋欠損金繰越（10年）＋住民税均等割
 *  - 土地取得借入利息の損益通算制限（措法41条の4）
 *  - 減価償却は最終年調整・備忘価額1円
 *  - 借入は月次償還で端数月も正確に集計
 *  - 印紙税（売買）は軽減税率
 * ========================================================= */

const Engine = (() => {

  /* ---------- 借入（元利均等・月次） ---------- */
  // 年ごとの {payment, principal, interest, balance(期末残債)} を返す
  function amortize(loanAmount, annualRate, months, maxYears) {
    const years = [];
    for (let y = 0; y < maxYears; y++) years.push({ payment: 0, principal: 0, interest: 0, balance: 0 });
    if (loanAmount <= 0 || months <= 0) return years;
    const r = annualRate / 12;
    const pay = r > 0
      ? loanAmount * r / (1 - Math.pow(1 + r, -months))
      : loanAmount / months;
    let bal = loanAmount;
    const lastMonth = Math.min(months, maxYears * 12);
    for (let m = 1; m <= lastMonth; m++) {
      const yi = Math.ceil(m / 12) - 1;
      const interest = bal * r;
      let principal = pay - interest;
      if (principal > bal || m === months) principal = bal; // 最終回は残債精算
      bal -= principal;
      if (bal < 1e-6) bal = 0;
      years[yi].payment += principal + interest;
      years[yi].principal += principal;
      years[yi].interest += interest;
      years[yi].balance = bal;
      if (bal === 0) break;
    }
    // 支払いのない年の期末残債を引き継ぐ（期間途中で完済した後は0、期間超は直前残債）
    for (let y = 0; y < maxYears; y++) {
      if (years[y].payment === 0) years[y].balance = y === 0 ? loanAmount : years[y - 1].balance;
      if (years[y].payment === 0 && (y > 0 && years[y - 1].balance === 0)) years[y].balance = 0;
    }
    return years;
  }

  /* ---------- 減価償却（定額法・中古簡便法） ---------- */
  function usefulLife(legalLife, age) {
    let n;
    if (age >= legalLife) n = Math.floor(legalLife * 0.2);
    else n = Math.floor(legalLife - age + age * 0.2);
    return Math.max(2, n);
  }
  // 定額法償却率（小数第3位切上げ = 国税庁の償却率表と一致）
  function straightLineRate(n) {
    return Math.ceil(1000 / n) / 1000;
  }
  // 年ごとの償却費と期末簿価（備忘価額1円）
  function depreciationSchedule(base, life, maxYears) {
    const rate = straightLineRate(life);
    const dep = [], book = [];
    let b = base;
    for (let y = 0; y < maxYears; y++) {
      let d = 0;
      if (b > 1) d = Math.min(Math.floor(base * rate), b - 1); // 最終年は残存簿価-1円
      b -= d;
      dep.push(d); book.push(b);
    }
    return { dep, book, rate };
  }

  /* ---------- 個人: 給与所得控除（令和7年度改正） ---------- */
  function salaryDeduction(salary) {
    if (salary <= 0) return 0;
    if (salary <= 1900000) return Math.min(salary, 650000);
    if (salary <= 3600000) return salary * 0.30 + 80000;
    if (salary <= 6600000) return salary * 0.20 + 440000;
    if (salary <= 8500000) return salary * 0.10 + 1100000;
    return 1950000;
  }

  /* ---------- 個人: 所得税(復興税込)＋住民税10% 速算 ---------- */
  const INCOME_TAX_BRACKETS = [
    { upTo: 1950000,  rate: 0.05, deduct: 0 },
    { upTo: 3300000,  rate: 0.10, deduct: 97500 },
    { upTo: 6950000,  rate: 0.20, deduct: 427500 },
    { upTo: 9000000,  rate: 0.23, deduct: 636000 },
    { upTo: 18000000, rate: 0.33, deduct: 1536000 },
    { upTo: 40000000, rate: 0.40, deduct: 2796000 },
    { upTo: Infinity, rate: 0.45, deduct: 4796000 },
  ];
  function personalTax(taxable) {
    if (taxable <= 0) return 0;
    const b = INCOME_TAX_BRACKETS.find(x => taxable < x.upTo) || INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
    const national = (taxable * b.rate - b.deduct) * 1.021; // 復興特別所得税
    const resident = taxable * 0.10;                        // 住民税(所得割のみの単純化)
    return Math.max(0, national + resident);
  }

  /* ---------- 法人: 実効税率近似（中小法人・標準税率） ---------- */
  function corporateTax(taxable) {
    if (taxable <= 0) return 0;
    if (taxable <= 4000000) return taxable * 0.2137;
    if (taxable <= 8000000) return taxable * 0.2317 - 72000;
    return taxable * 0.3358 - 904800;
  }

  /* ---------- 譲渡税率（個人・年初取得前提） ---------- */
  // 譲渡年の1/1時点で所有期間5年超 → 長期。年初取得なら7年目以降が長期。
  function transferTaxRate(saleYear) {
    return saleYear >= 7 ? 0.20315 : 0.3963;
  }

  /* ---------- 諸費用クイック計算 ---------- */
  function brokerageFee(price) {
    if (price <= 0) return 0;
    const base = price <= 8000000 ? Math.min(300000, price * 0.05) // 低廉物件の特例上限(概算)
                                  : price * 0.03 + 60000;          // 速算式(400万超)
    return Math.round(base * 1.1);
  }
  // 印紙税(不動産売買・軽減税率 2027/3/31まで)
  function stampDutySale(price) {
    if (price <= 0) return 0;
    const t = [[100000,200],[500000,200],[1000000,500],[5000000,1000],[10000000,5000],
               [50000000,10000],[100000000,30000],[500000000,60000],[1000000000,160000]];
    for (const [upTo, tax] of t) if (price <= upTo) return tax;
    return 480000;
  }
  // 印紙税(金銭消費貸借・本則)
  function stampDutyLoan(amount) {
    if (amount <= 0) return 0;
    const t = [[100000,200],[500000,400],[1000000,1000],[5000000,2000],[10000000,10000],
               [50000000,20000],[100000000,60000],[500000000,100000],[1000000000,200000]];
    for (const [upTo, tax] of t) if (amount <= upTo) return tax;
    return 400000;
  }
  function acquisitionCosts(p) {
    // p: {price, landValue, buildingValue, loanAmount, residential, landRegRate}
    const landRegRate = p.landRegRate != null ? p.landRegRate : 0.015; // 軽減(延長状況は要確認)。本則2%
    const regLand = Math.round((p.landValue || 0) * landRegRate);
    const regBuilding = Math.round((p.buildingValue || 0) * 0.02);
    const regMortgage = Math.round((p.loanAmount || 0) * 0.004);
    const acqTaxLand = Math.round((p.landValue || 0) * 0.5 * 0.03);
    const acqTaxBuilding = Math.round((p.buildingValue || 0) * (p.residential === false ? 0.04 : 0.03));
    const stampSale = stampDutySale(p.price || 0);
    const stampLoan = stampDutyLoan(p.loanAmount || 0);
    const brokerage = brokerageFee(p.price || 0);
    return {
      brokerage, stampSale, stampLoan, regLand, regBuilding, regMortgage,
      acqTaxLand, acqTaxBuilding,
      totalTaxes: stampSale + stampLoan + regLand + regBuilding + regMortgage + acqTaxLand + acqTaxBuilding,
      total: brokerage + stampSale + stampLoan + regLand + regBuilding + regMortgage + acqTaxLand + acqTaxBuilding,
    };
  }

  /* ---------- メインシミュレーション ---------- */
  const DEFAULT_YEARS = 35;

  function simulate(inp) {
    const Y = inp.years || DEFAULT_YEARS;
    const price = inp.price || 0;
    const bldg = Math.min(inp.buildingPrice || 0, price);
    const land = price - bldg;

    // 取得諸費用: 取得価額算入分は建物/土地に価格比で按分
    const costsAcq = inp.costsAcq || 0;   // 仲介手数料・固都税精算金など
    const costsExp = inp.costsExp || 0;   // 税金類・司法書士・融資手数料など(初年度費用)
    const bldgRatio = price > 0 ? bldg / price : 0;
    const bldgBase = bldg + costsAcq * bldgRatio;   // 償却基礎
    const landBase = land + costsAcq * (1 - bldgRatio);

    // 自己資金 = 総投資額 − 借入
    const loan = inp.loanAmount || 0;
    const totalInvest = price + costsAcq + costsExp;
    const equity = totalInvest - loan;

    // 借入（端数月対応）
    const months = Math.round((inp.loanYears || 0) * 12);
    const loanSch = amortize(loan, inp.loanRate || 0, months, Y);

    // 減価償却
    const life = usefulLife(inp.legalLife || 22, inp.age || 0);
    const depSch = depreciationSchedule(bldgBase, life, Y);

    // 収入パラメータ
    const fullRent = (inp.rentMonthly || 0) * 12;
    const cycle = (inp.tenancyMonths || 0) + (inp.vacancyMonths || 0);
    const vacancyRate = cycle > 0 ? (inp.vacancyMonths || 0) / cycle : 0;
    const renewCount = Math.min(10, Math.floor(Math.max(0, (inp.tenancyMonths || 0) - 1) / 24));
    const keyMoneyAnnual = cycle > 0 ? (inp.keyMoney || 0) / cycle * 12 : 0;
    const renewalAnnual = cycle > 0 ? (inp.renewalFee || 0) * renewCount / cycle * 12 : 0;

    // 支出パラメータ
    const opexFixed = (inp.fixedCostTax || 0) + (inp.fixedCostMgmt || 0) * 12;
    const turnoverAnnual = cycle > 0 ? (inp.turnoverCost || 0) / cycle * 12 : 0;
    const repairAnnual = inp.repairAnnual || 0;
    const opex = opexFixed + turnoverAnnual + repairAnnual;

    // 土地取得に充当された借入割合（建物先充当・納税者有利、上限は土地取得価額まで）
    const landLoanRatio = loan > 0 ? Math.min(Math.max(0, loan - bldgBase), landBase) / loan : 0;

    // 個人税: 給与のみのベース税額
    // salaryNetはクランプしない: 給与で使い切れない所得控除の残りは不動産所得から控除できる
    const salary = inp.salary || 0;
    const otherDeductions = inp.deductions != null
      ? inp.deductions
      : Math.min(salary * 0.15, 2000000) + 580000; // 社保概算+基礎控除(令和7年度改正)
    const salaryNet = (salary - salaryDeduction(salary)) - otherDeductions;
    const taxableSalaryOnly = Math.max(0, salaryNet);
    const baseTax = personalTax(taxableSalaryOnly);

    const equalization = inp.taxMode === 'corporate' ? (inp.corpEqualization != null ? inp.corpEqualization : 70000) : 0;

    // ---- 年次ループ（賃貸運営） ----
    const rows = [];
    let lossPool = [];           // 法人: 欠損金 {year, amount} 10年繰越
    let cumCF = -equity;         // 年0に自己資金投下
    let cumPL = 0;

    for (let t = 1; t <= Y; t++) {
      const declineFactor = Math.max(0, 1 - (inp.rentDeclineRate || 0) * (t - 1)); // 2年目から下落
      const effRent = fullRent * declineFactor;
      const income = effRent * (1 - vacancyRate) + (keyMoneyAnnual + renewalAnnual) * declineFactor; // 礼金・更新料も家賃に連動

      const ls = loanSch[t - 1];
      const dep = depSch.dep[t - 1];
      const expFirstYear = t === 1 ? costsExp : 0;

      const cfBeforeTax = income - opex - ls.payment; // 諸費用・頭金は年0の自己資金に計上済み
      const pl = income - opex - ls.interest - dep - expFirstYear; // 不動産所得(法人は課税所得ベース)

      // 欠損金の期限切れ(10年)を先に処理し、期首の繰越残高を記録
      lossPool = lossPool.filter(l => t - l.year <= 10);
      const lossPoolBefore = lossPool.reduce((s, l) => s + l.amount, 0);

      let tax = 0, plAdjusted = pl, lossCarryUsed = 0;
      if (inp.taxMode === 'corporate') {
        if (pl < 0) {
          lossPool.push({ year: t, amount: -pl });
          tax = equalization;
        } else {
          let remain = pl;
          for (const l of lossPool) {
            const use = Math.min(l.amount, remain);
            l.amount -= use; remain -= use; lossCarryUsed += use;
            if (remain <= 0) break;
          }
          lossPool = lossPool.filter(l => l.amount > 0);
          tax = corporateTax(remain) + equalization;
        }
      } else {
        // 個人: 損益通算（土地利息の通算制限つき）
        if (pl < 0) {
          const disallowed = Math.min(-pl, ls.interest * landLoanRatio); // 措法41の4
          plAdjusted = pl + disallowed;
        }
        const combined = Math.max(0, salaryNet + plAdjusted);
        tax = personalTax(combined) - baseTax; // 不動産投資による増減分(マイナス=節税)
      }

      const atcf = cfBeforeTax - tax;
      cumCF += atcf;
      cumPL += pl;

      rows.push({
        year: t, income, opex, debtService: ls.payment, principal: ls.principal,
        interest: ls.interest, loanBalance: ls.balance, depreciation: dep,
        bookValue: depSch.book[t - 1] + landBase,
        buildingBook: depSch.book[t - 1],
        expFirstYear, cfBeforeTax, pl, plAdjusted, tax, atcf, cumCF, cumPL,
        lossPoolBefore, lossCarryUsed,
      });
    }

    // ---- 売却シナリオ（各年末に売却した場合） ----
    const saleBase = inp.salePrice || 0;
    const saleDecline = inp.salePriceDeclineRate || 0;
    const exits = rows.map(r => {
      const t = r.year;
      const salePrice = Math.max(0, saleBase * (1 - saleDecline * t));
      const saleCost = inp.saleCostManual != null ? inp.saleCostManual : brokerageFee(salePrice);
      const gain = salePrice - r.bookValue - saleCost;
      let saleTax;
      if (inp.taxMode === 'corporate') {
        // 売却年は賃貸損益+売却損益を合算し、期首の繰越欠損金を控除して再計算。
        // 賃貸のみで計算済みの税額との差分を売却分の税負担とする（マイナス=売却損による節税）。
        const combined = r.pl + gain;
        const taxable = Math.max(0, combined - r.lossPoolBefore);
        const taxCombined = corporateTax(taxable) + equalization;
        saleTax = taxCombined - r.tax;
      } else {
        saleTax = gain > 0 ? gain * transferTaxRate(t) : 0; // 譲渡損は他所得と通算不可(分離課税)
      }
      const saleCF = salePrice - saleCost - r.loanBalance - saleTax;
      const totalProfit = r.cumCF + saleCF; // cumCFは-equity起点 = 投下自己資金控除後
      // フル/オーバーローン(自己資金≦0)ではIRRの符号解釈が反転するため算出しない
      let irr = null;
      if (equity > 0) {
        const flows = [-equity];
        for (let i = 0; i < t; i++) flows.push(rows[i].atcf + (i === t - 1 ? saleCF : 0));
        irr = computeIRR(flows);
      }
      return { year: t, salePrice, saleCost, gain, saleTax, saleCF, totalProfit, irr,
               longTerm: inp.taxMode === 'corporate' ? null : t >= 7 };
    });

    // ---- 指標 ----
    const y1 = rows[0];
    const noi1 = y1.income - y1.opex;
    const grossYield = price > 0 ? fullRent / price : 0;
    const noiYield = totalInvest > 0 ? noi1 / totalInvest : 0;
    const ccr = equity > 0 ? y1.atcf / equity : null;
    const dscr = y1.debtService > 0 ? noi1 / y1.debtService : null;
    let payback = null;
    if (equity > 0) for (const r of rows) if (r.cumCF >= 0) { payback = r.year; break; }
    let deadCross = null;
    for (const r of rows) if (r.principal > 0 && r.depreciation < r.principal) { deadCross = r.year; break; }
    const bestExit = exits.reduce((a, b) => (b.totalProfit > a.totalProfit ? b : a), exits[0]);

    return {
      input: inp,
      equity, totalInvest, loan, land, bldg, bldgBase, landBase,
      usefulLife: life, depRate: depSch.rate, landLoanRatio,
      vacancyRate, fullRent, renewCount,
      taxableSalaryOnly, baseTax,
      rows, exits,
      metrics: { grossYield, noiYield, ccr, dscr, payback, deadCross, noi1,
                 bestExitYear: bestExit ? bestExit.year : null,
                 bestExitProfit: bestExit ? bestExit.totalProfit : null,
                 bestExitIRR: bestExit ? bestExit.irr : null },
    };
  }

  /* ---------- IRR（二分法） ---------- */
  function computeIRR(flows) {
    const npv = r => flows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0);
    let lo = -0.9999, hi = 10;
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  return {
    simulate, amortize, usefulLife, straightLineRate, depreciationSchedule,
    salaryDeduction, personalTax, corporateTax, transferTaxRate,
    brokerageFee, stampDutySale, stampDutyLoan, acquisitionCosts, computeIRR,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
if (typeof window !== 'undefined') window.Engine = Engine;
