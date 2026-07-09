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
    s.propertyName = $('propertyName').value;
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
      $('propertyName').value = s.propertyName || '';
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

  /* ---------- PDF提案書 ---------- */
  const STRUCTURE_NAMES = { 47: 'RC造', 34: '重量鉄骨造', 27: '軽量鉄骨造(4mm以下)', 19: '軽量鉄骨造(3mm以下)', 22: '木造' };

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function reportDate() {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function kvTable(rows) {
    return '<table class="rp-table"><tbody>' +
      rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('') +
      '</tbody></table>';
  }

  function rpHeader(title, name) {
    return `<div class="rp-header"><span class="rp-title">${esc(title)}</span>` +
      `<span class="rp-meta">${esc(name)}<br>作成日: ${reportDate()}</span></div>`;
  }

  function cloneChart(sourceId) {
    const src = $(sourceId);
    if (!src || !src.querySelector('svg')) return '<p class="rp-notes">（チャートなし）</p>';
    const wrap = document.createElement('div');
    wrap.innerHTML = src.innerHTML;
    wrap.querySelectorAll('.chart-tip').forEach(t => t.remove());
    return `<div class="rp-chart">${wrap.innerHTML}</div>`;
  }

  function buildReport(r) {
    const inp = r.input;
    const m = r.metrics;
    const name = ($('propertyName').value || '物件名未設定').trim();
    const modeLabel = taxMode === 'personal' ? '個人（所得税・住民税）' : '法人（法人税）';
    const yen = v => fmt(v) + '円';

    // --- 1枚目: 概要・前提・KPI ---
    const p1 = `<section class="rp-page">
      ${rpHeader('不動産投資 収益シミュレーション', name)}
      <div class="rp-cover-name">${esc(name)}</div>
      <div class="rp-kv">
        <div><div class="rp-h2">物件概要</div>${kvTable([
          ['物件価格（税込）', yen(inp.price)],
          ['うち建物 / 土地', `${yen(r.bldg)} / ${yen(r.land)}`],
          ['構造・築年数', `${STRUCTURE_NAMES[inp.legalLife] || ''}（法定${inp.legalLife}年）・築${fmt(inp.age)}年`],
          ['償却期間（簡便法）', `${r.usefulLife}年（償却率 ${r.depRate}）`],
        ])}
        <div class="rp-h2">資金計画</div>${kvTable([
          ['総投資額（諸費用込）', yen(r.totalInvest)],
          ['借入金額', `${yen(r.loan)}（${fmt(inp.loanYears)}年・金利${(inp.loanRate * 100).toFixed(2)}%・元利均等）`],
          ['自己資金', yen(r.equity)],
          ['取得諸費用', `${yen(inp.costsAcq)}（取得価額算入）＋ ${yen(inp.costsExp)}（初年度費用）`],
        ])}</div>
        <div><div class="rp-h2">収支の前提</div>${kvTable([
          ['月額家賃', `${yen(inp.rentMonthly)}（満室時 ${yen(r.fullRent)}/年）`],
          ['礼金・更新料', `${yen(inp.keyMoney)} / ${yen(inp.renewalFee)}`],
          ['入退去サイクル', `入居${fmt(inp.tenancyMonths)}ヵ月＋空室${fmt(inp.vacancyMonths)}ヵ月（空室率 ${pct(r.vacancyRate, 1)}）`],
          ['家賃下落率', `${(inp.rentDeclineRate * 100).toFixed(1)}%/年（2年目から）`],
          ['運営費（年）', `固定 ${yen((inp.fixedCostTax || 0) + (inp.fixedCostMgmt || 0) * 12)}＋入替・修繕ほか`],
          ['課税区分', modeLabel],
          ['想定売却価格', `${yen(inp.salePrice)}（下落 ${(inp.salePriceDeclineRate * 100).toFixed(1)}%/年）`],
        ])}</div>
      </div>
      <div class="rp-h2">投資指標サマリー</div>
      <div class="rp-kpis">
        ${[['表面利回り', pct(m.grossYield)], ['実質利回り(NOI)', pct(m.noiYield)],
           ['CCR', m.ccr == null ? '—' : pct(m.ccr)], ['DSCR', m.dscr == null ? '—' : m.dscr.toFixed(2)],
           ['自己資金回収', m.payback ? m.payback + '年' : (r.equity <= 0 ? '—' : '35年超')],
           ['デッドクロス', m.deadCross ? m.deadCross + '年目' : 'なし'],
           ['最有利売却年', m.bestExitYear ? m.bestExitYear + '年目' : '—'],
           ['その時のIRR', m.bestExitIRR == null ? '—' : pct(m.bestExitIRR)]]
          .map(([l, v]) => `<div class="rp-kpi"><div class="k-label">${l}</div><div class="k-value">${v}</div></div>`).join('')}
      </div>
      <p class="rp-notes">本資料は概算シミュレーションであり、将来の収益を保証するものではありません。前提条件・免責事項は最終ページをご確認ください。</p>
      <div class="rp-footer">1</div>
    </section>`;

    // --- 2枚目: CF・損益チャート ---
    const comments = [];
    comments.push(`初年度の税引後キャッシュフローは <b>${yen(Math.round(r.rows[0].atcf))}</b>（CCR ${m.ccr == null ? '—' : pct(m.ccr)}）。`);
    comments.push(m.payback
      ? `投下自己資金 ${yen(r.equity)} は賃貸運営のみで <b>${m.payback}年目</b> に回収できる試算です。`
      : (r.equity <= 0 ? 'フルローンのため自己資金の投下はありません。' : `賃貸運営のみでは35年以内に自己資金を回収できない試算です（売却を含めた回収は次ページ）。`));
    if (m.deadCross) comments.push(`<b>${m.deadCross}年目</b> に減価償却費が元金返済を下回る「デッドクロス」が発生します。帳簿上の黒字に対して手残りが細るため、納税資金の確保が必要です。`);
    const p2 = `<section class="rp-page">
      ${rpHeader('年次キャッシュフロー・損益', name)}
      <div class="rp-h2">税引後キャッシュフロー（棒＝単年 / 線＝累積・自己資金投下後）</div>
      ${cloneChart('cfChart')}
      <div class="rp-h2">損益（不動産所得）と減価償却・元金返済</div>
      ${cloneChart('plChart')}
      <ul class="rp-comment">${comments.map(c => `<li>${c}</li>`).join('')}</ul>
      <div class="rp-footer">2</div>
    </section>`;

    // --- 3枚目: 出口戦略 ---
    const best = r.exits.find(e => e.year === m.bestExitYear);
    const exitComments = [];
    if (best) {
      exitComments.push(`試算上の最有利売却は <b>${best.year}年目</b>（トータル利益 <b>${yen(Math.round(best.totalProfit))}</b> / IRR ${best.irr == null ? '—' : pct(best.irr)}）。`);
      if (taxMode === 'personal') exitComments.push(`個人の譲渡所得税は6年目までの売却で短期39.63%、<b>7年目以降は長期20.315%</b> に下がります（年初取得前提）。`);
    }
    const exitPick = r.exits.filter(e => e.year % 5 === 0 || e.year === 1 || e.year === m.bestExitYear || e.year === 7);
    const exitRows = exitPick.map(e => {
      const row = r.rows[e.year - 1];
      return `<tr${e.year === m.bestExitYear ? ' class="rp-best"' : ''}><td class="l">${e.year}年目${e.longTerm === false ? '（短期）' : ''}</td>` +
        [e.salePrice, e.gain, e.saleTax, e.saleCF, row.cumCF, e.totalProfit].map(v => `<td class="${v < 0 ? 'neg' : ''}">${fmt(v)}</td>`).join('') +
        `<td>${e.irr == null ? '—' : pct(e.irr, 1)}</td></tr>`;
    }).join('');
    const p3 = `<section class="rp-page">
      ${rpHeader('出口戦略（売却年別の総合収支）', name)}
      <div class="rp-h2">売却年別トータル利益（累積税引後CF＋売却手取り−自己資金）</div>
      ${cloneChart('exitChart')}
      <div class="rp-h2">売却年別IRR</div>
      ${cloneChart('irrChart')}
      <ul class="rp-comment">${exitComments.map(c => `<li>${c}</li>`).join('')}</ul>
      <div class="rp-h2">主要年の売却試算（円）</div>
      <table class="rp-table"><thead><tr><th>売却年</th><th>売却価格</th><th>売却益</th><th>税額</th><th>売却手取り</th><th>累積CF</th><th>トータル利益</th><th>IRR</th></tr></thead>
      <tbody>${exitRows}</tbody></table>
      <div class="rp-footer">3</div>
    </section>`;

    // --- 4枚目: 年次明細 ---
    const detailRows = r.rows.map(x =>
      `<tr><td class="l">${x.year}年</td>` +
      [x.income, x.opex, x.debtService, x.interest, x.depreciation, x.pl, x.tax, x.atcf, x.cumCF, x.loanBalance]
        .map(v => `<td class="${v < 0 ? 'neg' : ''}">${fmt(v)}</td>`).join('') + '</tr>').join('');
    const p4 = `<section class="rp-page">
      ${rpHeader('年次明細（35年・円）', name)}
      <table class="rp-table" style="font-size:7.5pt">
        <thead><tr><th>年</th><th>収入</th><th>運営費</th><th>返済(元利)</th><th>うち利息</th><th>減価償却</th><th>損益</th><th>税額</th><th>税引後CF</th><th>累積CF</th><th>残債</th></tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
      <div class="rp-footer">4</div>
    </section>`;

    // --- 5枚目: 前提・免責 ---
    const p5 = `<section class="rp-page">
      ${rpHeader('計算の前提・免責事項', name)}
      <div class="rp-h2">計算の前提</div>
      <ul class="rp-comment">
        <li>年初取得・年単位の近似計算です（月割り計算は行っていません）。</li>
        <li>減価償却は定額法・中古資産の簡便法（最終年は備忘価額1円まで償却）。建物への諸費用按分は価格比です。</li>
        <li>借入は元利均等・月次償還を年次集計しています。繰上返済・金利変動は考慮していません。</li>
        ${taxMode === 'personal'
          ? `<li>所得税（復興特別所得税込）＋住民税所得割10%。給与所得控除は令和7年度改正、所得控除は${inp.deductions != null ? '入力値' : '社会保険料15%概算＋基礎控除58万円'}で計算。</li>
             <li>不動産所得の赤字は給与所得と損益通算（土地取得借入利息分は措法41条の4により通算対象外）。純損失の繰越控除（青色3年）は未考慮。</li>
             <li>譲渡所得税は分離課税（短期39.63%／長期20.315%、譲渡年1月1日時点の所有5年超で長期）。譲渡損失は他所得と通算していません。</li>`
          : `<li>法人税は中小法人・標準税率の実効税率近似（所得400万以下21.37%／800万以下23.17%／800万超33.58%）＋住民税均等割${yen(inp.corpEqualization != null ? inp.corpEqualization : 70000)}。</li>
             <li>欠損金は10年間繰越して翌期以降の所得から控除。売却益は賃貸損益と合算して課税しています。</li>`}
        <li>消費税、火災・地震保険の改定、大規模修繕（資本的支出）、賃料の市況変動は考慮していません。</li>
        <li>税制は2026年時点の一般的な取扱いに基づきます。</li>
      </ul>
      <div class="rp-h2">免責事項</div>
      <p class="rp-comment">本資料は物件のご検討のための概算シミュレーションであり、将来の収益・税額を保証するものではありません。記載の税務上の取扱いは一般的な例によるものであり、個別の税務判断については税理士等の専門家にご確認ください。実際の売買にあたっては、重要事項説明書・売買契約書等の内容を必ずご確認ください。</p>
      <div class="rp-footer">5</div>
    </section>`;

    return p1 + p2 + p3 + p4 + p5;
  }

  $('pdfBtn').addEventListener('click', () => {
    const r = run();
    $('printReport').innerHTML = buildReport(r);
    document.body.classList.add('printing');
    const cleanup = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
  });

  /* ---------- Excel出力（SheetJSを初回のみ読込） ---------- */
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('SheetJSの読み込みに失敗しました'));
      document.head.appendChild(s);
    });
  }

  $('xlsxBtn').addEventListener('click', async () => {
    const r = run();
    try { await loadSheetJS(); } catch (e) { alert(e.message + '\nネットワーク接続をご確認ください。'); return; }
    const inp = r.input;
    const name = ($('propertyName').value || '物件').trim();

    // シート1: 入力条件
    const cond = [
      ['不動産投資 収益シミュレーション', ''],
      ['物件名称', name], ['作成日', reportDate()], ['課税区分', taxMode === 'personal' ? '個人' : '法人'],
      [],
      ['物件価格（税込）', inp.price], ['うち建物価格', r.bldg], ['うち土地価格', r.land],
      ['築年数', inp.age], ['法定耐用年数', inp.legalLife], ['償却期間（簡便法）', r.usefulLife], ['償却率', r.depRate],
      [],
      ['借入金額', r.loan], ['借入期間（年）', inp.loanYears], ['借入金利', inp.loanRate],
      ['取得諸費用（取得価額算入）', inp.costsAcq], ['取得諸費用（初年度費用）', inp.costsExp],
      ['総投資額', r.totalInvest], ['自己資金', r.equity],
      [],
      ['月額家賃', inp.rentMonthly], ['礼金', inp.keyMoney], ['更新料', inp.renewalFee],
      ['想定入居期間（ヵ月）', inp.tenancyMonths], ['想定空室期間（ヵ月）', inp.vacancyMonths],
      ['想定空室率', r.vacancyRate], ['家賃下落率（年）', inp.rentDeclineRate],
      ['固定運営費（税・保険/年）', inp.fixedCostTax], ['固定運営費（管理等/月）', inp.fixedCostMgmt],
      ['入替コスト（円/回）', inp.turnoverCost], ['修繕費（円/年）', inp.repairAnnual],
      [],
      ['想定売却価格', inp.salePrice], ['売却価格下落率（年）', inp.salePriceDeclineRate],
      [],
      ['表面利回り', r.metrics.grossYield], ['実質利回り(NOI)', r.metrics.noiYield],
      ['CCR', r.metrics.ccr], ['DSCR', r.metrics.dscr],
      ['自己資金回収年', r.metrics.payback], ['デッドクロス年', r.metrics.deadCross],
      ['最有利売却年', r.metrics.bestExitYear], ['最有利売却時IRR', r.metrics.bestExitIRR],
    ];

    // シート2: 年次明細
    const annual = [['年', '収入', '運営費', '返済（元利）', 'うち元金', 'うち利息', '減価償却', '損益（不動産所得）', '税額', '税引後CF', '累積CF（自己資金控除後）', '期末残債', '期末簿価']];
    for (const x of r.rows) {
      annual.push([x.year, Math.round(x.income), Math.round(x.opex), Math.round(x.debtService),
        Math.round(x.principal), Math.round(x.interest), x.depreciation, Math.round(x.pl),
        Math.round(x.tax), Math.round(x.atcf), Math.round(x.cumCF), Math.round(x.loanBalance), Math.round(x.bookValue)]);
    }

    // シート3: 出口戦略
    const exit = [['売却年', '短期/長期', '売却価格', '譲渡費用', '売却益', '税額', '売却手取り', '累積CF', 'トータル利益', 'IRR']];
    for (const e of r.exits) {
      exit.push([e.year, e.longTerm == null ? '' : (e.longTerm ? '長期' : '短期'),
        Math.round(e.salePrice), Math.round(e.saleCost), Math.round(e.gain), Math.round(e.saleTax),
        Math.round(e.saleCF), Math.round(r.rows[e.year - 1].cumCF), Math.round(e.totalProfit), e.irr]);
    }

    const wb = XLSX.utils.book_new();
    const wsCond = XLSX.utils.aoa_to_sheet(cond);
    wsCond['!cols'] = [{ wch: 26 }, { wch: 18 }];
    const wsAnnual = XLSX.utils.aoa_to_sheet(annual);
    wsAnnual['!cols'] = annual[0].map(() => ({ wch: 14 }));
    const wsExit = XLSX.utils.aoa_to_sheet(exit);
    wsExit['!cols'] = exit[0].map(() => ({ wch: 13 }));
    XLSX.utils.book_append_sheet(wb, wsCond, '入力条件・指標');
    XLSX.utils.book_append_sheet(wb, wsAnnual, '年次明細');
    XLSX.utils.book_append_sheet(wb, wsExit, '出口戦略');
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `収益シミュレーション_${name}_${ymd}.xlsx`);
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
