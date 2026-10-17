/*
 * UI controller: loads state from localStorage, renders the page, and saves
 * every change. All money/date formatting goes through Intl so it follows
 * the selected language.
 */
(function () {
  'use strict';

  const L = window.Logic;
  const I = window.I18n;
  const t = I.t;
  const STORAGE_KEY = 'masarif.v2';
  const LEGACY_KEY = 'masarif.v1';
  const $ = (id) => document.getElementById(id);

  // ---------- state ----------

  function emptyState() {
    return { transactions: [], subscriptions: [], settings: L.defaultSettings() };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return L.parseImport(raw);
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        // The first version of the app was Arabic-only.
        const migrated = L.parseImport(legacy);
        migrated.settings.language = migrated.settings.language || 'ar';
        return migrated;
      }
    } catch (e) {
      /* corrupted storage: start fresh rather than crash */
    }
    return emptyState();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast(t('data.saveFailed'));
    }
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let state = load();
  let month = today().slice(0, 7);
  let editingId = null;
  const filter = { query: '', type: 'all', category: 'all' };

  // ---------- formatting ----------

  let F = {};

  // Bidi isolation keeps amounts intact inside sentences of either direction:
  // LRI…PDI for the digits and sign, FSI…PDI for the currency symbol (so
  // "US$" stays left-to-right and "ر.س." right-to-left), FSI around the whole.
  const BIDI_MARKS = /[‎‏؜]/g;
  const NUMERIC = new Set(['minusSign', 'plusSign', 'integer', 'group', 'decimal', 'fraction', 'nan', 'infinity']);
  const iso = (s) => '⁦' + s.replace(BIDI_MARKS, '') + '⁩';

  function isolateParts(parts) {
    let out = '';
    let num = '';
    const flush = () => {
      if (num) out += '⁦' + num + '⁩';
      num = '';
    };
    for (const p of parts) {
      const value = p.value.replace(BIDI_MARKS, '');
      if (NUMERIC.has(p.type)) {
        num += value;
        continue;
      }
      flush();
      out += p.type === 'currency' ? '⁨' + value + '⁩' : value;
    }
    flush();
    return '⁨' + out.trim() + '⁩';
  }

  function buildFormatters() {
    const loc = I.intlLocale;
    const money = {};
    for (const signDisplay of ['auto', 'always']) {
      try {
        money[signDisplay] = new Intl.NumberFormat(loc, { style: 'currency', currency: state.settings.currency, maximumFractionDigits: 2, signDisplay });
      } catch (e) {
        money[signDisplay] = new Intl.NumberFormat(loc, { maximumFractionDigits: 2, signDisplay });
      }
    }
    let currencyNames = null;
    try {
      currencyNames = new Intl.DisplayNames([loc], { type: 'currency' });
    } catch (e) {
      /* older browsers: fall back to codes */
    }
    F = {
      // sign: undefined (plain), '+' or '−' (forced, for income/expense rows)
      money: (n, sign) => isolateParts(sign ? money.always.formatToParts(sign === '−' ? -n : n) : money.auto.formatToParts(n)),
      pct: (n) => iso(new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 0 }).format(n)),
      axis: (n) => new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 }).format(n),
      monthLong: (key) => new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(key + '-01')),
      monthShort: (key) => new Intl.DateTimeFormat(loc, { month: 'short', timeZone: 'UTC' }).format(utc(key + '-01')),
      day: (date) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(date)),
      currencyName: (code) => (currencyNames && currencyNames.of(code)) || code,
    };
  }

  function utc(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const catName = (id) => t('cat.' + id);

  // ---------- small DOM helpers ----------

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function iconButton(icon, label, onClick) {
    const b = el('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'icon');
    s.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + icon);
    s.appendChild(use);
    b.appendChild(s);
    b.addEventListener('click', onClick);
    return b;
  }

  function options(select, items, value) {
    select.replaceChildren(...items.map(([v, label]) => {
      const o = el('option', null, label);
      o.value = v;
      return o;
    }));
    if (value != null) select.value = value;
  }

  let toastTimer;
  function toast(msg, action) {
    $('toast-text').textContent = msg;
    const btn = $('toast-action');
    btn.hidden = !action;
    btn.onclick = null;
    if (action) {
      btn.textContent = action.label;
      btn.onclick = () => {
        action.run();
        $('toast').classList.remove('show');
      };
    }
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), action ? 6000 : 2800);
  }

  // ---------- language & theme ----------

  function applyLanguage() {
    I.setLanguage(state.settings.language || I.detect(navigator.languages || [navigator.language]));
    buildFormatters();
    I.apply(document);
    document.title = t('app.name') + ' — ' + t('app.tagline');

    const langs = I.LANGUAGES.map((l) => [l.code, l.name]);
    options($('lang-quick'), langs, I.language);
    options($('settings-form').language, langs, I.language);
    options($('settings-form').currency, L.CURRENCIES.map((c) => [c, F.currencyName(c) + ' (' + c + ')']), state.settings.currency);

    const cats = L.CATEGORIES.expense.concat(L.CATEGORIES.income.filter((c) => !L.CATEGORIES.expense.includes(c)));
    options($('f-category'), [['all', t('list.allCategories')]].concat(cats.map((c) => [c, catName(c)])), filter.category);
    fillTxCategories();
  }

  function applyTheme() {
    const theme = state.settings.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  function fillTxCategories(selected) {
    const form = $('tx-form');
    const type = form.querySelector('input[name=type]:checked').value;
    const current = selected || form.category.value;
    options(form.category, L.CATEGORIES[type].map((c) => [c, catName(c)]));
    if (L.CATEGORIES[type].includes(current)) form.category.value = current;
  }

  // ---------- render ----------

  function render() {
    const entries = L.monthEntries(state, month);
    const current = L.summarize(entries);
    const previous = L.summarize(L.monthEntries(state, L.shiftMonth(month, -1)));

    $('month-label').textContent = F.monthLong(month);
    $('this-month').hidden = month === today().slice(0, 7);
    $('welcome').hidden = state.transactions.length > 0 || state.subscriptions.length > 0;

    // stats
    $('stat-income').textContent = F.money(current.income);
    $('stat-expense').textContent = F.money(current.expense);
    const bal = $('stat-balance');
    bal.textContent = F.money(current.balance);
    bal.className = current.balance < 0 ? 'neg' : current.balance > 0 ? 'pos' : '';
    $('stat-rate').textContent = current.savingsRate === null ? '—' : F.pct(current.savingsRate);

    // budget
    const budget = state.settings.budget;
    $('budget-bar').hidden = !(budget > 0);
    if (budget > 0) {
      const used = current.expense / budget;
      $('budget-text').textContent = t('budget.of', { spent: F.money(current.expense), budget: F.money(budget) });
      const fill = $('budget-fill');
      fill.style.width = Math.min(100, used * 100) + '%';
      fill.className = 'fill' + (used >= 1 ? ' bad' : used >= 0.8 ? ' warn' : '');
    }

    // trend
    TrendChart.render($('trend'), L.monthlySeries(state, month, 6), {
      title: t('trend.title'),
      rtl: I.dir === 'rtl',
      current: month,
      fmt: (n) => F.money(n),
      fmtAxis: F.axis,
      monthLabel: F.monthShort,
      monthLong: F.monthLong,
      labels: { income: t('stats.income'), expense: t('stats.expense'), month: t('trend.month') },
      onSelect: (m) => { month = m; render(); },
    });

    // breakdown
    $('breakdown').replaceChildren(...current.byCategory.map((c) => {
      const li = el('li');
      const row = el('div', 'row');
      row.append(el('span', null, catName(c.category)), el('span', 'val', F.money(c.amount) + ' · ' + F.pct(c.share)));
      const track = el('div', 'track');
      const fill = el('div', 'fill');
      fill.style.width = Math.max(1, c.share * 100) + '%';
      track.appendChild(fill);
      li.append(row, track);
      return li;
    }));
    $('breakdown-empty').hidden = current.byCategory.length > 0;

    // tips
    const tipList = L.tips(current, previous.expense || previous.income ? previous : null, budget);
    $('tips').replaceChildren(...tipList.map((tip) => {
      const v = tip.vars;
      const li = el('li', tip.level);
      li.append(el('span', 'dot'), el('span', null, t('tip.' + tip.key, {
        amount: v.amount != null ? F.money(v.amount) : '',
        pct: v.pct != null ? F.pct(v.pct) : '',
        category: v.category ? catName(v.category) : '',
      })));
      return li;
    }));
    $('tips-empty').hidden = tipList.length > 0;

    // transactions
    const shown = L.filterEntries(entries, filter, catName);
    $('tx-list').replaceChildren(...shown.map(renderEntry));
    $('tx-empty').hidden = shown.length > 0;
    $('tx-empty').textContent = entries.length ? t('list.noMatch') : t('list.empty');
    $('list-count').textContent = shown.length === entries.length ? String(entries.length) : shown.length + ' / ' + entries.length;

    // subscriptions
    $('sub-list').replaceChildren(...state.subscriptions.map((s) => {
      const li = el('li');
      const main = el('div', 'tx-main');
      main.append(el('div', 'cat', s.name), el('div', 'meta', t('subs.everyMonth', { day: s.day })));
      const tools = el('div', 'tx-tools');
      tools.appendChild(iconButton('trash', t('subs.cancel') + ' — ' + s.name, () => {
        if (!confirm(t('subs.cancelConfirm', { name: s.name }))) return;
        state.subscriptions = state.subscriptions.filter((x) => x.id !== s.id);
        save();
        render();
      }));
      li.append(main, el('span', 'tx-amount neg', F.money(s.amount)), tools);
      return li;
    }));
    const subsTotal = state.subscriptions.reduce((sum, s) => sum + s.amount, 0);
    $('sub-total').textContent = state.subscriptions.length
      ? t('subs.total', { month: F.money(subsTotal), year: F.money(subsTotal * 12) })
      : t('subs.empty');

    // settings
    const sf = $('settings-form');
    sf.currency.value = state.settings.currency;
    sf.theme.value = state.settings.theme;
    if (document.activeElement !== sf.budget) sf.budget.value = budget || '';
  }

  function renderEntry(e) {
    const li = el('li');
    const main = el('div', 'tx-main');
    const cat = el('div', 'cat', catName(e.category));
    if (e.recurring) cat.appendChild(el('span', 'badge', t('tx.recurring')));
    main.append(cat, el('div', 'meta', F.day(e.date) + (e.note ? ' · ' + e.note : '')));
    const amount = el('span', 'tx-amount ' + (e.type === 'income' ? 'pos' : 'neg'), F.money(e.amount, e.type === 'income' ? '+' : '−'));
    const tools = el('div', 'tx-tools');
    if (!e.recurring) {
      const label = catName(e.category) + ' ' + F.money(e.amount);
      tools.append(
        iconButton('edit', t('tx.edit') + ' — ' + label, () => startEdit(e.id)),
        iconButton('trash', t('tx.delete') + ' — ' + label, () => remove(e.id))
      );
    }
    li.append(main, amount, tools);
    return li;
  }

  // ---------- transactions ----------

  const txForm = $('tx-form');

  function resetTxForm() {
    editingId = null;
    txForm.amount.value = '';
    txForm.note.value = '';
    txForm.date.value = month === today().slice(0, 7) ? today() : month + '-01';
    $('tx-card').classList.remove('editing');
    $('tx-title').dataset.i18n = 'tx.addTitle';
    $('tx-submit').dataset.i18n = 'tx.add';
    $('tx-title').textContent = t('tx.addTitle');
    $('tx-submit').textContent = t('tx.add');
    $('tx-cancel').hidden = true;
  }

  function startEdit(id) {
    const tx = state.transactions.find((x) => x.id === id);
    if (!tx) return;
    editingId = id;
    txForm.querySelector('input[name=type][value=' + tx.type + ']').checked = true;
    fillTxCategories(tx.category);
    txForm.amount.value = tx.amount;
    txForm.date.value = tx.date;
    txForm.note.value = tx.note;
    $('tx-card').classList.add('editing');
    $('tx-title').dataset.i18n = 'tx.editTitle';
    $('tx-submit').dataset.i18n = 'tx.save';
    $('tx-title').textContent = t('tx.editTitle');
    $('tx-submit').textContent = t('tx.save');
    $('tx-cancel').hidden = false;
    $('tx-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    txForm.amount.focus({ preventScroll: true });
  }

  function remove(id) {
    const index = state.transactions.findIndex((x) => x.id === id);
    if (index < 0) return;
    const [removed] = state.transactions.splice(index, 1);
    if (editingId === id) resetTxForm();
    save();
    render();
    toast(t('tx.deleted'), {
      label: t('tx.undo'),
      run: () => {
        state.transactions.splice(index, 0, removed);
        save();
        render();
      },
    });
  }

  txForm.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => fillTxCategories()));
  $('tx-cancel').addEventListener('click', resetTxForm);

  txForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = Number(txForm.amount.value);
    if (!(amount > 0)) {
      txForm.amount.focus();
      return;
    }
    if (!L.isDate(txForm.date.value)) {
      txForm.date.focus();
      return;
    }
    const data = {
      type: txForm.querySelector('input[name=type]:checked').value,
      amount,
      category: txForm.category.value,
      date: txForm.date.value,
      note: txForm.note.value.trim(),
    };
    if (editingId) {
      Object.assign(state.transactions.find((x) => x.id === editingId), data);
      toast(t('tx.updated'));
    } else {
      state.transactions.push(Object.assign({ id: uid() }, data));
      toast(t('tx.added'));
    }
    month = L.monthKey(data.date);
    save();
    resetTxForm();
    txForm.amount.focus();
    render();
  });

  // ---------- subscriptions ----------

  const subForm = $('sub-form');
  subForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = subForm.subname.value.trim();
    const amount = Number(subForm.amount.value);
    const day = Number(subForm.day.value);
    if (!name) return subForm.subname.focus();
    if (!(amount > 0)) return subForm.amount.focus();
    if (!(Number.isInteger(day) && day >= 1 && day <= 31)) return subForm.day.focus();
    state.subscriptions.push({ id: uid(), name, amount, day, startMonth: month });
    save();
    subForm.reset();
    render();
    toast(t('subs.added'));
  });

  // ---------- navigation & filters ----------

  function goTo(m) {
    month = m;
    if (!editingId) resetTxForm();
    render();
  }
  $('prev-month').addEventListener('click', () => goTo(L.shiftMonth(month, -1)));
  $('next-month').addEventListener('click', () => goTo(L.shiftMonth(month, 1)));
  $('this-month').addEventListener('click', () => goTo(today().slice(0, 7)));

  $('f-query').addEventListener('input', (e) => { filter.query = e.target.value; render(); });
  $('f-type').addEventListener('change', (e) => { filter.type = e.target.value; render(); });
  $('f-category').addEventListener('change', (e) => { filter.category = e.target.value; render(); });

  // ---------- settings ----------

  function setLanguage(code) {
    state.settings.language = code;
    save();
    applyLanguage();
    render();
  }
  $('lang-quick').addEventListener('change', (e) => setLanguage(e.target.value));

  const settingsForm = $('settings-form');
  settingsForm.addEventListener('submit', (ev) => ev.preventDefault());
  settingsForm.language.addEventListener('change', (e) => setLanguage(e.target.value));
  settingsForm.currency.addEventListener('change', () => {
    state.settings.currency = settingsForm.currency.value;
    buildFormatters();
    save();
    render();
  });
  settingsForm.budget.addEventListener('input', () => {
    const v = Number(settingsForm.budget.value);
    state.settings.budget = v > 0 ? v : 0;
    save();
    render();
  });
  settingsForm.theme.addEventListener('change', () => {
    state.settings.theme = settingsForm.theme.value;
    applyTheme();
    save();
  });

  // ---------- data ----------

  function download(name, content, type) {
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('export-csv').addEventListener('click', () => {
    const csv = L.toCSV(L.monthEntries(state, month), {
      headers: ['csv.date', 'csv.type', 'csv.category', 'csv.amount', 'csv.note'].map((k) => t(k)),
      income: t('tx.income'),
      expense: t('tx.expense'),
      category: catName,
    });
    download('masarif-' + month + '.csv', csv, 'text/csv;charset=utf-8');
  });

  $('export-json').addEventListener('click', () => {
    download('masarif-backup-' + today() + '.json', JSON.stringify(state, null, 2), 'application/json');
  });

  $('import-json').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const next = L.parseImport(await file.text());
      if (!confirm(t('data.restoreConfirm', { count: next.transactions.length }))) return;
      next.settings.language = next.settings.language || state.settings.language;
      state = next;
      save();
      applyTheme();
      applyLanguage();
      resetTxForm();
      render();
      toast(t('data.restored'));
    } catch (e) {
      toast(e.code ? t(e.code, { index: e.index }) : String(e.message));
    }
  });

  document.querySelectorAll('[data-action=sample]').forEach((b) => b.addEventListener('click', () => {
    const hasData = state.transactions.length || state.subscriptions.length;
    if (hasData && !confirm(t('data.sampleConfirm'))) return;
    const now = today().slice(0, 7);
    const sample = L.sampleData(now, { internet: t('sample.internet'), streaming: t('sample.streaming'), gym: t('sample.gym') });
    state.transactions = sample.transactions;
    state.subscriptions = sample.subscriptions;
    if (!state.settings.budget) state.settings.budget = 2000;
    month = now;
    save();
    resetTxForm();
    render();
    toast(t('data.sampleLoaded'));
  }));

  $('clear-all').addEventListener('click', () => {
    if (!confirm(t('data.clearConfirm'))) return;
    const settings = state.settings;
    state = emptyState();
    state.settings = Object.assign(settings, { budget: 0 });
    save();
    resetTxForm();
    render();
    toast(t('data.cleared'));
  });

  // ---------- install & offline ----------

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('install').hidden = false;
  });
  $('install').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('install').hidden = true;
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Keep tabs in sync when the app is open twice.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      state = L.parseImport(e.newValue);
      applyTheme();
      applyLanguage();
      render();
    } catch (err) {
      /* ignore malformed writes */
    }
  });

  // ---------- start ----------

  applyTheme();
  applyLanguage();
  resetTxForm();
  render();
})();
