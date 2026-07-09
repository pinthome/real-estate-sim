/* UI配線 */
(() => {
  const $ = id => document.getElementById(id);
  const fmt = v => Math.round(v).toLocaleString('ja-JP');
  const pct = (v, d = 2) => v == null ? '—' : (v * 100).toFixed(d) + '%';
  const man = Charts.fmtManFull;

  /* ---------- 初期値（サンプル物件） ---------- */
  const DEFAULTS = {
    taxMode: 'personal',
    price: 30000000, buildingPrice: 15000000, age: 10, structure: 47,
    loanAmount: 27000000, loanYears: 35, loanRate: 2.0,
    costsAcq: 1056000, costsExp: 1500000,
    rentMonthly: 150000, keyMoney: 150000, renewalFee: 150000,
    tenancyMonths: 48, vacancyMonths: 2, rentDeclineRate: 1.0,
    fixedCostTax: 150000, fixedCostMgmt: 15000, turnoverCost: 300000, repairAnnual: 50000,
    salary: 8000000, deductions: '',
    corpEqualization: 70000,
    salePrice: 27000000, salePriceDeclineRate: 1.0,
  };
  const NUM_FIELDS = ['price','buildingPrice','age','loanAmount','loanYears','loanRate','costsAcq','costsExp',
    'rentMonthly','keyMoney','renewalFee','tenancyMonths','vacancyMonths','rentDeclineRate',
    'fixedCostTax','fixedCostMgmt','turnoverCost','repairAnnual','salary','corpEqualization',
    'salePrice','salePriceDeclineRate'];

  let taxMode = 'personal';
  let lastResult = null;

  /* ---------- 入力の読み書き ---------- */
  function parseNum(id) {
    const raw = ($(id).value || '').replace(/[,，\s]/g, '');
    if (raw === '') return null;
    const v = Number(raw);
    return isNaN(v) ? null : v;
  }
  function setVal(id, v) { $(id).value = v === '' || v == null ? '' : (typeof v === 'number' ? v.toLocaleString('ja-JP') : v); }

  function loadDefaults(src) {
    for (const k of NUM_FIELDS) if (k in src) setVal(k, src[k]);
    $('structure').value = String(src.structure || 47);
    setTaxMode(src.taxMode || 'personal');
    setVal('deductions', src.deductions ?? '');
  }
  function currentInput(overrides = {}) {
    const inp = {
      taxMode,
      price: parseNum('price') || 0,
      buildingPrice: parseNum('buildingPrice') || 0,
      age: parseNum('age') || 0,
      legalLife: Number($('structure').value),
      loanAmount: parseNum('loanAmount') || 0,
      loanYears: parseNum('loanYears') || 0,
      loanRate: (parseNum('loanRate') || 0) / 100,
      costsAcq: parseNum('costsAcq') || 0,
      costsExp: parseNum('costsExp') || 0,
      rentMonthly: parseNum('rentMonthly') || 0,
      keyMoney: parseNum('keyMoney') || 0,
      renewalFee: parseNum('renewalFee') || 0,
      tenancyMonths: parseNum('tenancyMonths') || 0,
      vacancyMonths: parseNum('vacancyMonths') || 0,
      rentDeclineRate: (parseNum('rentDeclineRate') || 0) / 100,
      fixedCostTax: parseNum('fixedCostTax') || 0,
      fixedCostMgmt: parseNum('fixedCostMgmt') || 0,
      turnoverCost: parseNum('turnoverCost') || 0,
      repairAnnual: parseNum('repairAnnual') || 0,
      salary: parseNum('salary') || 0,
      deductions: parseNum('deductions'),
      corpEqualization: parseNum('corpEqualization') ?? 70000,
      salePrice: parseNum('salePrice') || 0,
      salePriceDeclineRate: (parseNum('salePriceDeclineRate') || 0) / 100,
      years: 35,
    };
    if (inp.deductions == null) delete inp.deductions;
    return Object.assign(inp, overrides);
  }

  function saveState() {
    const s = {};
    for (const k of NUM_FIELDS) s[k] = $(k).value;
    s.structure = $('structure').value;
    s.deductions = $('deductions').value;
    s.taxMode = taxMode;
    localStorage.setItem('reSim', JSON.stringify(s));
  }
  function restoreState() {
    try {
      const s = JSON.parse(localStorage.getItem('reSim'));
      if (!s) return false;
      for (const k of NUM_FIELDS) if (s[k] != null) $(k).value = s[k];
      $('structure').value = s.structure || '47';
      $('deductions').value = s.deductions || '';
      setTaxMode(s.taxMode || 'personal');
      return true;
    } catch (e) { return false; }
  }

  /* ---------- タブ ---------- */
  document.querySelectorAll('#tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      $('panel-' + b.dataset.tab).classList.add('active');
      if (b.dataset.tab !== 'input' && b.dataset.tab !== 'costs') run();
    });
  });

  function setTaxMode(mode) {
    taxMode = mode;
    document.querySelectorAll('#taxModeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('personalCard').style.display = mode === 'personal' ? '' : 'none';
    $('corporateCard').style.display = mode === 'corporate' ? '' : 'none';
  }
  document.querySelectorAll('#taxModeSeg button').forEach(b =>
    b.addEventListener('click', () => { setTaxMode(b.dataset.mode); }));

  /* ---------- 諸費用自動概算 ---------- */
  $('estimateCostsBtn').addEventListener('click', () => {
    const price = parseNum('price') || 0;
    const bldg = parseNum('buildingPrice') || 0;
    const land = Math.max(0, price - bldg);
    const c = Engine.acquisitionCosts({
      price,
      landValue: Math.round(land * 0.7),
      buildingValue: Math.round(bldg * 0.55),
      loanAmount: parseNum('loanAmount') || 0,
      residential: true,
    });
    const judicial = 110000; // 司法書士報酬・概算
    setVal('costsAcq', c.brokerage);
    setVal('costsExp', c.totalTaxes + judicial);
    alert(`概算を入力しました。\n仲介手数料: ${fmt(c.brokerage)}円 → 取得価額算入\n税金類＋司法書士(11万): ${fmt(c.totalTaxes + judicial)}円 → 初年度費用\n※評価額は土地7割・建物55%で仮置きしています。諸費用計算タブで詳細を確認できます。`);
  });

  /* ---------- 実行 ---------- */
  function run() {
    lastResult = Engine.simulate(currentInput());
    saveState();
    renderResult(lastResult);
    renderExit(lastResult);
    renderSens();
    return lastResult;
  }
  $('runBtn').addEventListener('click', () => {
    run();
    document.querySelector('#tabs button[data-tab=result]').click();
  });
  $('resetBtn').addEventListener('click', () => { loadDefaults(DEFAULTS); });

  /* ---------- 試算結果 ---------- */
  function kpiTile(label, value, note, cls = '') {
    return `<div class="kpi"><div class="k-label">${label}</div><div class="k-value ${cls}">${value}</div>${note ? `<div class="k-note">${note}</div>` : ''}</div>`;
  }
  function renderResult(r) {
    const m = r.metrics;
    const y1 = r.rows[0];
    $('kpiBox').innerHTML =
      kpiTile('自己資金', man(r.equity), `総投資額 ${man(r.totalInvest)}`) +
      kpiTile('表面利回り', pct(m.grossYield), '満室家賃÷物件価格') +
      kpiTile('実質利回り(NOI)', pct(m.noiYield), 'NOI÷総投資額') +
      kpiTile('CCR', m.ccr == null ? '—' : pct(m.ccr), '初年度税引後CF÷自己資金', m.ccr != null && m.ccr < 0 ? 'neg' : '') +
      kpiTile('DSCR', m.dscr == null ? '—' : m.dscr.toFixed(2), 'NOI÷年間返済額', m.dscr != null && m.dscr < 1 ? 'neg' : '') +
      kpiTile('自己資金回収', m.payback ? m.payback + '年' : (r.equity <= 0 ? '—' : '35年超'), r.equity <= 0 ? '自己資金の投下なし' : '累積税引後CFで回収') +
      kpiTile('デッドクロス', m.deadCross ? m.deadCross + '年目' : 'なし', '償却<元金返済') +
      kpiTile('償却期間', r.usefulLife + '年', `償却率 ${r.depRate}`);

    const years = r.rows.map(x => x.year);
    Charts.timeChart($('cfChart'), {
      years,
      bars: { label: '単年 税引後CF', values: r.rows.map(x => x.atcf) },
      lines: [{ label: '累積CF（自己資金控除後）', values: r.rows.map(x => x.cumCF), color: 'var(--s-aqua)' }],
      markers: m.deadCross ? [{ year: m.deadCross, label: 'デッドクロス', color: 'var(--s-violet)' }] : [],
    });

    Charts.timeChart($('plChart'), {
      years,
      bars: { label: '単年損益（不動産所得）', values: r.rows.map(x => x.pl) },
      lines: [
        { label: '減価償却費', values: r.rows.map(x => x.depreciation), color: 'var(--s-aqua)' },
        { label: '元金返済', values: r.rows.map(x => x.principal), color: 'var(--s-violet)' },
      ],
    });

    // 年次テーブル
    const head = ['年', '収入', '運営費', '返済(元利)', 'うち利息', '減価償却', '損益', '税額', '税引後CF', '累積CF', '残債'];
    let html = '<table class="data"><thead><tr>' + head.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
    for (const x of r.rows) {
      const cells = [x.year + '年', x.income, x.opex, x.debtService, x.interest, x.depreciation, x.pl, x.tax, x.atcf, x.cumCF, x.loanBalance];
      html += '<tr>' + cells.map((c, i) => i === 0 ? `<td>${c}</td>` : `<td class="${c < 0 ? 'neg' : ''}">${fmt(c)}</td>`).join('') + '</tr>';
    }
    $('cfTable').innerHTML = html + '</tbody></table>';

    // 前提の注記
    const notes = [
      `中古耐用年数: ${r.usefulLife}年（簡便法・最終年は備忘価額1円まで償却）`,
      taxMode === 'personal'
        ? `給与の課税所得 ${fmt(r.taxableSalaryOnly)}円・基準税額 ${fmt(r.baseTax)}円/年。不動産損益との通算差分を税額として計上（土地取得利息 ${pct(r.landLoanRatio, 1)} 分は赤字時の通算対象外）`
        : `法人実効税率（〜400万 21.37% / 〜800万 23.17% / 800万超 33.58%）＋均等割。欠損金は10年繰越`,
      `礼金・更新料・入替コストは入退去サイクル（${fmt(r.input.tenancyMonths)}＋${fmt(r.input.vacancyMonths)}ヵ月）で月割り平準化、想定空室率 ${pct(r.vacancyRate, 1)}`,
      '年初取得・年単位の近似計算。消費税・青色申告特別控除・純損失の繰越控除（青色3年）・繰上返済は未考慮',
      '売却価格の下落は売却年数×下落率で計算（家賃下落は2年目起算）。フルローン時はIRR・回収年を表示しません',
    ];
    $('assumptionNotes').innerHTML = '<b>計算の前提</b><ul>' + notes.map(n => `<li>${n}</li>`).join('') + '</ul>';
  }

  /* ---------- 出口戦略 ---------- */
  function renderExit(r) {
    const m = r.metrics;
    const best = r.exits.find(e => e.year === m.bestExitYear);
    $('exitKpiBox').innerHTML =
      kpiTile('最有利の売却年', m.bestExitYear ? m.bestExitYear + '年目' : '—', best && best.longTerm != null ? (best.longTerm ? '長期譲渡 20.315%' : '短期譲渡 39.63%') : '') +
      kpiTile('その時のトータル利益', m.bestExitProfit == null ? '—' : man(m.bestExitProfit), '累積CF＋売却手取り−自己資金', m.bestExitProfit < 0 ? 'neg' : 'pos') +
      kpiTile('その時のIRR', m.bestExitIRR == null ? '—' : pct(m.bestExitIRR), '自己資金ベース') +
      (taxMode === 'personal' ? kpiTile('長期譲渡の切替', '7年目〜', '譲渡年1/1時点で所有5年超') : '') +
      (m.deadCross ? kpiTile('デッドクロス', m.deadCross + '年目', '') : '');

    const years = r.exits.map(e => e.year);
    const markers = [];
    if (taxMode === 'personal') markers.push({ year: 7, label: '長期譲渡', color: 'var(--s-aqua)' });
    if (m.deadCross) markers.push({ year: m.deadCross, label: 'デッドクロス', color: 'var(--s-violet)' });
    Charts.timeChart($('exitChart'), {
      years,
      bars: { label: 'トータル利益', values: r.exits.map(e => e.totalProfit) },
      markers,
      highlightYear: m.bestExitYear,
      tipExtra: i => {
        const e = r.exits[i];
        return [
          ['売却価格', man(e.salePrice)],
          ['譲渡税', man(e.saleTax)],
          ['売却手取り', man(e.saleCF)],
          ['IRR', e.irr == null ? '—' : pct(e.irr)],
        ];
      },
    });

    // IRRチャート（単位が違うため別チャート・1軸原則）
    renderIrrChart(r);

    const head = ['売却年', '売却価格', '譲渡費用', '売却益', '譲渡税', '売却手取り', '累積CF', 'トータル利益', 'IRR'];
    let html = '<table class="data"><thead><tr>' + head.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
    for (const e of r.exits) {
      const row = r.rows[e.year - 1];
      const cls = e.year === m.bestExitYear ? ' class="best"' : '';
      html += `<tr${cls}><td>${e.year}年目${e.longTerm === false ? '（短期）' : ''}</td>` +
        [e.salePrice, e.saleCost, e.gain, e.saleTax, e.saleCF, row.cumCF, e.totalProfit].map(v => `<td class="${v < 0 ? 'neg' : ''}">${fmt(v)}</td>`).join('') +
        `<td>${e.irr == null ? '—' : pct(e.irr)}</td></tr>`;
    }
    $('exitTable').innerHTML = html + '</tbody></table>';
  }

  function renderIrrChart(r) {
    // IRRは%単位なので専用チャート（線1本）
    const box = $('irrChart');
    const years = r.exits.map(e => e.year);
    const vals = r.exits.map(e => e.irr);
    box.innerHTML = '';
    const W = box.clientWidth || 720, H = 220;
    const pad = { top: 14, right: 16, bottom: 30, left: 58 };
    const iw = W - pad.left - pad.right, ih = H - pad.top - pad.bottom;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%'); svg.setAttribute('height', H);
    box.appendChild(svg);
    const present = vals.filter(v => v != null);
    if (!present.length) { box.innerHTML = '<p class="notes">IRRを計算できません（キャッシュフローが全て同符号）</p>'; return; }
    let lo = Math.min(0, ...present), hi = Math.max(0, ...present);
    lo = Math.max(lo, -0.5); hi = Math.min(hi, 0.6);
    const ticks = [];
    const step = (hi - lo) / 4;
    for (let v = lo; v <= hi + step * 0.01; v += step) ticks.push(v);
    const y = v => pad.top + ih - (v - lo) / (hi - lo) * ih;
    const x = i => pad.left + iw / years.length * i + iw / years.length / 2;
    const mk = (t, a, p) => { const e = document.createElementNS('http://www.w3.org/2000/svg', t); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
    for (const t of ticks) {
      mk('line', { x1: pad.left, x2: W - pad.right, y1: y(t), y2: y(t), stroke: 'var(--grid)' }, svg);
      const tx = mk('text', { x: pad.left - 8, y: y(t) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, svg);
      tx.textContent = (t * 100).toFixed(0) + '%';
    }
    mk('line', { x1: pad.left, x2: W - pad.right, y1: y(0), y2: y(0), stroke: 'var(--baseline)', 'stroke-width': 1.5 }, svg);
    years.forEach((yr, i) => {
      if (yr === 1 || yr % 5 === 0) {
        const tx = mk('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, svg);
        tx.textContent = yr + '年';
      }
    });
    const pts = vals.map((v, i) => v == null ? null : `${x(i)},${y(Math.max(lo, Math.min(hi, v)))}`).filter(Boolean);
    mk('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--s-blue)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    const bi = r.metrics.bestExitYear ? years.indexOf(r.metrics.bestExitYear) : -1;
    if (bi >= 0 && vals[bi] != null) {
      mk('circle', { cx: x(bi), cy: y(vals[bi]), r: 5, fill: 'var(--s-blue)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      const tx = mk('text', { x: x(bi), y: y(vals[bi]) - 10, 'text-anchor': 'middle', fill: 'var(--s-blue)', 'font-size': 11, 'font-weight': 600 }, svg);
      tx.textContent = `${r.metrics.bestExitYear}年目 ${(vals[bi] * 100).toFixed(1)}%`;
    }
  }

  /* ---------- 感度分析 ---------- */
  const sensInputs = ['sensRate', 'sensVac', 'sensRent', 'sensSale'];
  sensInputs.forEach(id => $(id).addEventListener('input', renderSens));

  function renderSens() {
    if (!lastResult) return;
    const dRate = Number($('sensRate').value);
    const dVac = Number($('sensVac').value);
    const dRent = Number($('sensRent').value);
    const dSale = Number($('sensSale').value);
    $('sensRateVal').textContent = `+${dRate.toFixed(1)}%`;
    $('sensVacVal').textContent = `+${dVac}ヵ月`;
    $('sensRentVal').textContent = `+${dRent.toFixed(1)}%`;
    $('sensSaleVal').textContent = `${dSale >= 0 ? '+' : ''}${dSale}%`;

    const base = lastResult;
    const inp = currentInput();
    const adjusted = Engine.simulate(Object.assign({}, inp, {
      loanRate: inp.loanRate + dRate / 100,
      vacancyMonths: inp.vacancyMonths + dVac,
      rentDeclineRate: inp.rentDeclineRate + dRent / 100,
      salePrice: inp.salePrice * (1 + dSale / 100),
    }));

    const bm = base.metrics, am = adjusted.metrics;
    const diff = (a, b) => a == null || b == null ? '—' : man(a - b);
    $('sensKpiBox').innerHTML =
      kpiTile('最有利売却年', `${bm.bestExitYear || '—'} → ${am.bestExitYear || '—'}年目`, '基準 → 変動後') +
      kpiTile('トータル利益', am.bestExitProfit == null ? '—' : man(am.bestExitProfit), `基準比 ${diff(am.bestExitProfit, bm.bestExitProfit)}`, am.bestExitProfit < 0 ? 'neg' : '') +
      kpiTile('IRR', am.bestExitIRR == null ? '—' : pct(am.bestExitIRR), `基準 ${bm.bestExitIRR == null ? '—' : pct(bm.bestExitIRR)}`) +
      kpiTile('CCR', am.ccr == null ? '—' : pct(am.ccr), `基準 ${bm.ccr == null ? '—' : pct(bm.ccr)}`, am.ccr != null && am.ccr < 0 ? 'neg' : '') +
      kpiTile('自己資金回収', am.payback ? am.payback + '年' : '35年超', `基準 ${bm.payback ? bm.payback + '年' : '35年超'}`);

    Charts.timeChart($('sensChart'), {
      years: base.exits.map(e => e.year),
      lines: [
        { label: '基準シナリオ', values: base.exits.map(e => e.totalProfit), color: 'var(--s-blue)' },
        { label: '変動後シナリオ', values: adjusted.exits.map(e => e.totalProfit), color: 'var(--s-red)' },
      ],
      height: 280,
    });
  }

  /* ---------- 諸費用クイック計算 ---------- */
  $('qcBtn').addEventListener('click', () => {
    const price = num('qcPrice'), landV = num('qcLand'), bldgV = num('qcBldg'), loan = num('qcLoan');
    function num(id) { return Number(($(id).value || '0').replace(/[,，\s]/g, '')) || 0; }
    const c = Engine.acquisitionCosts({
      price, landValue: landV, buildingValue: bldgV, loanAmount: loan,
      residential: $('qcResidential').value === 'true',
      landRegRate: Number($('qcLandReg').value),
    });
    const rows = [
      ['仲介手数料（税込）', c.brokerage, '取得価額に算入'],
      ['印紙税（売買・軽減）', c.stampSale, '初年度費用'],
      ['印紙税（金銭消費貸借）', c.stampLoan, '初年度費用'],
      ['登録免許税（土地・所有権移転）', c.regLand, '初年度費用'],
      ['登録免許税（建物・所有権移転）', c.regBuilding, '初年度費用'],
      ['登録免許税（抵当権設定）', c.regMortgage, '初年度費用'],
      ['不動産取得税（土地）', c.acqTaxLand, '初年度費用・後日納付'],
      ['不動産取得税（建物）', c.acqTaxBuilding, '初年度費用・後日納付'],
    ];
    let html = '<table class="data"><thead><tr><th>項目</th><th>金額（円）</th><th>区分</th></tr></thead><tbody>';
    for (const [label, v, note] of rows) html += `<tr><td>${label}</td><td>${fmt(v)}</td><td style="text-align:left;color:var(--muted)">${note}</td></tr>`;
    html += `<tr><td><b>合計</b></td><td><b>${fmt(c.total)}</b></td><td style="text-align:left;color:var(--muted)">物件価格の約${price > 0 ? (c.total / price * 100).toFixed(1) : '—'}%</td></tr>`;
    $('qcResult').innerHTML = html + '</tbody></table>';
  });

  /* ---------- 初期化 ---------- */
  if (!restoreState()) loadDefaults(DEFAULTS);
  // 諸費用タブの初期値を入力タブから引き継ぎ
  const price0 = parseNum('price') || 0, bldg0 = parseNum('buildingPrice') || 0;
  setVal('qcPrice', price0);
  setVal('qcLand', Math.round((price0 - bldg0) * 0.7));
  setVal('qcBldg', Math.round(bldg0 * 0.55));
  setVal('qcLoan', parseNum('loanAmount') || 0);
  run();
})();
