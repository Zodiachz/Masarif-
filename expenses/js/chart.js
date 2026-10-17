/*
 * Grouped bar chart (income vs. expenses per month), drawn as inline SVG.
 * Time runs in reading direction: left-to-right, or right-to-left for RTL.
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const W = 560;
  const H = 270;
  const PAD = { top: 12, bottom: 28, axis: 60, edge: 8 };

  function svg(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
    return 10 * mag;
  }

  // Bar with 4px rounded top corners, anchored to the baseline.
  function barPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  // opts: { title, rtl, current, fmt, fmtAxis, monthLabel, monthLong, labels: {income, expense, month}, onSelect }
  function render(container, series, opts) {
    container.replaceChildren();

    const legend = document.createElement('div');
    legend.className = 'legend';
    for (const [key, cls] of [['income', 'var(--series-income)'], ['expense', 'var(--series-expense)']]) {
      const item = document.createElement('span');
      const sw = document.createElement('i');
      sw.style.background = cls;
      item.append(sw, opts.labels[key]);
      legend.appendChild(item);
    }
    container.appendChild(legend);

    const max = niceMax(Math.max(...series.map((s) => Math.max(s.income, s.expense))));
    const plotH = H - PAD.top - PAD.bottom;
    const plotW = W - PAD.axis - PAD.edge;
    const plotX0 = opts.rtl ? PAD.edge : PAD.axis;
    const y = (v) => PAD.top + plotH - (v / max) * plotH;
    const slot = plotW / series.length;
    const barW = Math.min(22, slot * 0.3);
    const gap = 2;

    // direction=ltr keeps text-anchor and x coordinates absolute; RTL is handled by mirroring positions.
    const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, direction: 'ltr', role: 'group', 'aria-label': opts.title });

    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v);
      chart.appendChild(svg('line', { class: 'gridline', x1: plotX0, x2: plotX0 + plotW, y1: yy, y2: yy }));
      const label = svg('text', {
        class: 'axis',
        'aria-hidden': 'true',
        x: opts.rtl ? plotX0 + plotW + 8 : plotX0 - 8,
        y: yy + 4,
        'text-anchor': opts.rtl ? 'start' : 'end',
      });
      label.textContent = opts.fmtAxis(v);
      chart.appendChild(label);
    }

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;

    series.forEach((s, i) => {
      const idx = opts.rtl ? series.length - 1 - i : i;
      const cx = plotX0 + slot * idx + slot / 2;
      const left = cx - barW - gap / 2;
      const right = cx + gap / 2;
      const first = opts.rtl ? right : left;
      const second = opts.rtl ? left : right;

      if (s.income > 0) chart.appendChild(svg('path', { class: 'bar-income', d: barPath(first, y(s.income), barW, y(0) - y(s.income)) }));
      if (s.expense > 0) chart.appendChild(svg('path', { class: 'bar-expense', d: barPath(second, y(s.expense), barW, y(0) - y(s.expense)) }));

      const label = svg('text', { class: 'axis' + (s.month === opts.current ? ' current' : ''), 'aria-hidden': 'true', x: cx, y: H - 8, 'text-anchor': 'middle' });
      label.textContent = opts.monthLabel(s.month);
      chart.appendChild(label);

      // Hit target spans the whole slot, larger than the bars themselves.
      const hit = svg('rect', { class: 'hit', x: plotX0 + slot * idx, y: PAD.top, width: slot, height: plotH, rx: 6, tabindex: 0, role: 'button',
        'aria-label': `${opts.monthLong(s.month)}: ${opts.labels.income} ${opts.fmt(s.income)}, ${opts.labels.expense} ${opts.fmt(s.expense)}`,
      });
      const show = () => {
        tip.replaceChildren();
        const b = document.createElement('b');
        b.textContent = opts.monthLong(s.month);
        tip.append(b, opts.labels.income + ': ' + opts.fmt(s.income));
        tip.appendChild(document.createElement('br'));
        tip.append(opts.labels.expense + ': ' + opts.fmt(s.expense));
        const box = chart.getBoundingClientRect();
        const offset = box.top - container.getBoundingClientRect().top;
        const scale = box.width / W;
        tip.style.left = cx * scale + 'px';
        tip.style.top = offset + y(Math.max(s.income, s.expense)) * scale - 6 + 'px';
        tip.hidden = false;
      };
      const hide = () => { tip.hidden = true; };
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', hide);
      hit.addEventListener('blur', hide);
      hit.addEventListener('click', () => opts.onSelect(s.month));
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          opts.onSelect(s.month);
        }
      });
      chart.appendChild(hit);
    });

    container.append(chart, tip);

    // Same data as a table for screen readers.
    const table = document.createElement('table');
    table.className = 'sr-only';
    const head = table.insertRow();
    for (const h of [opts.labels.month, opts.labels.income, opts.labels.expense]) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    for (const s of series) {
      const row = table.insertRow();
      row.insertCell().textContent = opts.monthLong(s.month);
      row.insertCell().textContent = opts.fmt(s.income);
      row.insertCell().textContent = opts.fmt(s.expense);
    }
    container.appendChild(table);
  }

  root.TrendChart = { render };
})(window);
