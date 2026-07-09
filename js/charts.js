/* 軽量SVGチャート（依存なし）
 * - 単位が同じ系列のみ同一チャートに描く（1軸原則）
 * - 棒: 正=青 / 負=赤（極性）、線: 系列色固定
 * - ホバーでツールチップ、凡例つき
 */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function fmtMan(v) { // 円 → 万円表記
    const man = v / 10000;
    if (Math.abs(man) >= 10000) return (man / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '億';
    return Math.round(man).toLocaleString('ja-JP') + '万';
  }
  function fmtManFull(v) {
    const sign = v < 0 ? '-' : '';
    return sign + fmtMan(Math.abs(v)) + '円';
  }

  function niceTicks(min, max, n = 5) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(v);
    return { ticks, lo, hi };
  }

  // 汎用: 年次の棒+線チャート
  // opts: {years:[], bars:{label,values,posColor,negColor}, lines:[{label,values,color}],
  //        markers:[{year,label,color}], highlightYear, valueFmt, height}
  function timeChart(container, opts) {
    container.innerHTML = '';
    const W = container.clientWidth || 720;
    const H = opts.height || 300;
    const pad = { top: 18, right: 16, bottom: 30, left: 58 };
    const iw = W - pad.left - pad.right, ih = H - pad.top - pad.bottom;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, container);
    svg.style.display = 'block';

    const years = opts.years;
    const allVals = [];
    if (opts.bars) allVals.push(...opts.bars.values);
    (opts.lines || []).forEach(l => allVals.push(...l.values.filter(v => v != null)));
    let vMin = Math.min(0, ...allVals), vMax = Math.max(0, ...allVals);
    const { ticks, lo, hi } = niceTicks(vMin, vMax);
    const yScale = v => pad.top + ih - (v - lo) / (hi - lo) * ih;
    const xBand = iw / years.length;
    const xCenter = i => pad.left + xBand * i + xBand / 2;

    // グリッド・軸
    for (const t of ticks) {
      const y = yScale(t);
      el('line', { x1: pad.left, x2: W - pad.right, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
      const tx = el('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, svg);
      tx.textContent = fmtMan(t);
    }
    const zeroY = yScale(0);
    el('line', { x1: pad.left, x2: W - pad.right, y1: zeroY, y2: zeroY, stroke: 'var(--baseline)', 'stroke-width': 1.5 }, svg);

    // X軸ラベル（5年刻み）
    years.forEach((yr, i) => {
      if (yr === 1 || yr % 5 === 0) {
        const tx = el('text', { x: xCenter(i), y: H - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, svg);
        tx.textContent = yr + '年';
      }
    });

    // マーカー（縦線）
    (opts.markers || []).forEach(m => {
      const i = years.indexOf(m.year);
      if (i < 0) return;
      const x = xCenter(i);
      el('line', { x1: x, x2: x, y1: pad.top, y2: pad.top + ih, stroke: m.color, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
      const tx = el('text', { x: x + 4, y: pad.top + 10, fill: m.color, 'font-size': 10.5 }, svg);
      tx.textContent = m.label;
    });

    // 棒
    const barRects = [];
    if (opts.bars) {
      const bw = Math.max(3, xBand * 0.62);
      opts.bars.values.forEach((v, i) => {
        const x = xCenter(i) - bw / 2;
        const y0 = yScale(Math.max(0, v)), y1 = yScale(Math.min(0, v));
        const h = Math.max(Math.abs(y1 - y0), v === 0 ? 0 : 1.5);
        const color = v >= 0 ? (opts.bars.posColor || 'var(--s-blue)') : (opts.bars.negColor || 'var(--s-red)');
        const r = el('rect', {
          x, y: v >= 0 ? y0 : zeroY, width: bw, height: h, fill: color, rx: 2,
          stroke: 'var(--surface)', 'stroke-width': 1,
        }, svg);
        if (opts.highlightYear === years[i]) {
          el('rect', { x: x - 2.5, y: (v >= 0 ? y0 : zeroY) - 2.5, width: bw + 5, height: h + 5, fill: 'none', stroke: color, 'stroke-width': 1.5, rx: 4 }, svg);
        }
        barRects.push(r);
      });
    }

    // 線
    (opts.lines || []).forEach(line => {
      const pts = line.values.map((v, i) => v == null ? null : `${xCenter(i)},${yScale(v)}`).filter(Boolean);
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: line.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    });

    // ホバー層
    const hover = el('g', { style: 'pointer-events:none' }, svg);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    container.style.position = 'relative';
    container.appendChild(tip);

    const overlay = el('rect', { x: pad.left, y: pad.top, width: iw, height: ih, fill: 'transparent' }, svg);
    overlay.addEventListener('mousemove', ev => {
      const rect = svg.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * (W / rect.width);
      const i = Math.max(0, Math.min(years.length - 1, Math.floor((mx - pad.left) / xBand)));
      hover.innerHTML = '';
      const x = xCenter(i);
      el('line', { x1: x, x2: x, y1: pad.top, y2: pad.top + ih, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '2 2' }, hover);
      (opts.lines || []).forEach(line => {
        if (line.values[i] == null) return;
        el('circle', { cx: x, cy: yScale(line.values[i]), r: 4, fill: line.color, stroke: 'var(--surface)', 'stroke-width': 2 }, hover);
      });
      let html = `<div class="tip-title">${years[i]}年目</div>`;
      if (opts.bars) html += rowHtml(opts.bars.label, opts.bars.values[i], opts.bars.values[i] >= 0 ? (opts.bars.posColor || 'var(--s-blue)') : (opts.bars.negColor || 'var(--s-red)'));
      (opts.lines || []).forEach(l => { if (l.values[i] != null) html += rowHtml(l.label, l.values[i], l.color); });
      (opts.tipExtra ? opts.tipExtra(i) : []).forEach(e => { html += `<div class="tip-row"><span class="tip-label">${e[0]}</span><span>${e[1]}</span></div>`; });
      tip.innerHTML = html;
      tip.style.display = 'block';
      const px = ev.clientX - rect.left;
      tip.style.left = Math.min(px + 14, rect.width - tip.offsetWidth - 4) + 'px';
      tip.style.top = '10px';
    });
    overlay.addEventListener('mouseleave', () => { hover.innerHTML = ''; tip.style.display = 'none'; });

    function rowHtml(label, v, color) {
      return `<div class="tip-row"><span class="tip-swatch" style="background:${color}"></span><span class="tip-label">${label}</span><span>${fmtManFull(v)}</span></div>`;
    }

    // 凡例（2系列以上のとき）
    const seriesCount = (opts.bars ? 1 : 0) + (opts.lines || []).length;
    if (seriesCount >= 2) {
      const legend = document.createElement('div');
      legend.className = 'chart-legend';
      if (opts.bars) legend.appendChild(legendItem(opts.bars.label, opts.bars.posColor || 'var(--s-blue)'));
      (opts.lines || []).forEach(l => legend.appendChild(legendItem(l.label, l.color, true)));
      container.appendChild(legend);
    }
    function legendItem(label, color, isLine) {
      const d = document.createElement('span');
      d.className = 'legend-item';
      d.innerHTML = `<span class="legend-swatch${isLine ? ' line' : ''}" style="background:${color}"></span>${label}`;
      return d;
    }
  }

  return { timeChart, fmtMan, fmtManFull };
})();
if (typeof window !== 'undefined') window.Charts = Charts;
