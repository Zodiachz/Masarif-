/*
 * Pure business logic: no DOM access, so every function here runs (and is
 * tested) in Node as well as in the browser.
 *
 * Amounts are plain numbers in the user's currency. Categories are stored as
 * stable ids ("food", "salary", ...) and translated only at display time.
 */
(function (root) {
  'use strict';

  const CATEGORIES = {
    expense: ['food', 'housing', 'transport', 'shopping', 'health', 'education', 'entertainment', 'subscriptions', 'other'],
    income: ['salary', 'freelance', 'gift', 'other'],
  };

  const CURRENCIES = [
    'USD', 'EUR', 'GBP', 'DZD', 'MAD', 'TND', 'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD',
    'OMR', 'JOD', 'IQD', 'TRY', 'INR', 'PKR', 'CAD', 'AUD', 'MXN', 'BRL', 'CHF', 'JPY',
  ];

  const THEMES = ['system', 'light', 'dark'];

  // Version 1 of the app stored Arabic category names; map them to ids on load.
  const LEGACY_CATEGORY = {
    'أكل ومطاعم': 'food',
    'سكن وفواتير': 'housing',
    'مواصلات': 'transport',
    'تسوق': 'shopping',
    'صحة': 'health',
    'تعليم': 'education',
    'ترفيه': 'entertainment',
    'اشتراكات': 'subscriptions',
    'أخرى': 'other',
    'راتب': 'salary',
    'عمل حر': 'freelance',
    'هدية': 'gift',
  };

  // ---------- dates ----------

  function monthKey(dateStr) {
    return String(dateStr).slice(0, 7);
  }

  function shiftMonth(key, delta) {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  }

  function daysInMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function isDate(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  }

  function isMonth(s) {
    return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
  }

  // ---------- entries ----------

  // A subscription counts as an expense every month from the month it was
  // added, on its billing day (clamped to the month's last day).
  function subscriptionEntries(subscriptions, month) {
    return subscriptions
      .filter((s) => s.startMonth <= month)
      .map((s) => ({
        id: 'sub-' + s.id + '-' + month,
        subscriptionId: s.id,
        type: 'expense',
        amount: s.amount,
        category: 'subscriptions',
        date: month + '-' + String(Math.min(s.day, daysInMonth(month))).padStart(2, '0'),
        note: s.name,
        recurring: true,
      }));
  }

  function byDateDesc(a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  }

  function monthEntries(state, month) {
    return state.transactions
      .filter((t) => monthKey(t.date) === month)
      .concat(subscriptionEntries(state.subscriptions, month))
      .sort(byDateDesc);
  }

  // filter: { query, type: 'all'|'income'|'expense', category: 'all'|id }
  // nameOf(categoryId) lets the search match translated category names.
  function filterEntries(entries, filter, nameOf) {
    const q = (filter.query || '').trim().toLocaleLowerCase();
    return entries.filter((e) => {
      if (filter.type && filter.type !== 'all' && e.type !== filter.type) return false;
      if (filter.category && filter.category !== 'all' && e.category !== filter.category) return false;
      if (!q) return true;
      const hay = [(e.note || ''), nameOf ? nameOf(e.category) : e.category, String(e.amount)].join(' ').toLocaleLowerCase();
      return hay.includes(q);
    });
  }

  // ---------- reports ----------

  function summarize(entries) {
    let income = 0;
    let expense = 0;
    let recurring = 0;
    const totals = {};
    for (const e of entries) {
      if (e.type === 'income') {
        income += e.amount;
      } else {
        expense += e.amount;
        if (e.recurring) recurring += e.amount;
        totals[e.category] = (totals[e.category] || 0) + e.amount;
      }
    }
    const byCategory = Object.keys(totals)
      .map((category) => ({ category, amount: totals[category], share: expense ? totals[category] / expense : 0 }))
      .sort((a, b) => b.amount - a.amount);
    const balance = income - expense;
    return { income, expense, recurring, balance, savingsRate: income ? balance / income : null, byCategory };
  }

  // Totals for `count` months ending at `endMonth`, oldest first.
  function monthlySeries(state, endMonth, count) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const month = shiftMonth(endMonth, -i);
      const s = summarize(monthEntries(state, month));
      out.push({ month, income: s.income, expense: s.expense });
    }
    return out;
  }

  // Advice derived from this month's numbers compared with last month's.
  // Returns { level, key, vars } so the UI can translate and format it.
  // pct values are fractions (0.25 = 25%).
  function tips(current, previous, budget) {
    const out = [];
    if (current.expense === 0 && current.income === 0) return out;

    if (budget > 0) {
      const used = current.expense / budget;
      if (used >= 1) out.push({ level: 'bad', key: 'overBudget', vars: { amount: current.expense - budget } });
      else if (used >= 0.8) out.push({ level: 'warn', key: 'nearBudget', vars: { pct: used, amount: budget - current.expense } });
    }

    if (current.savingsRate !== null) {
      if (current.savingsRate < 0) out.push({ level: 'bad', key: 'deficit', vars: { amount: -current.balance } });
      else if (current.savingsRate < 0.1) out.push({ level: 'warn', key: 'lowSavings', vars: { pct: current.savingsRate } });
      else out.push({ level: 'good', key: 'goodSavings', vars: { pct: current.savingsRate } });
    }

    const top = current.byCategory[0];
    if (top && top.share >= 0.35 && current.byCategory.length > 1) {
      out.push({ level: 'warn', key: 'topCategory', vars: { category: top.category, pct: top.share, amount: top.amount * 0.1 } });
    }

    if (previous) {
      const prev = {};
      for (const c of previous.byCategory) prev[c.category] = c.amount;
      for (const c of current.byCategory) {
        const before = prev[c.category];
        if (before > 0 && c.amount > before * 1.2 && c.amount - before >= current.expense * 0.05) {
          out.push({ level: 'warn', key: 'categoryUp', vars: { category: c.category, pct: c.amount / before - 1 } });
        }
      }
    }

    if (current.expense > 0 && current.recurring / current.expense >= 0.25) {
      out.push({ level: 'warn', key: 'subscriptionsHeavy', vars: { pct: current.recurring / current.expense } });
    }
    return out;
  }

  // ---------- import / export ----------

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // labels: { headers: [date, type, category, amount, note], income, expense, category(id) }
  function toCSV(entries, labels) {
    const rows = [labels.headers];
    for (const e of entries) {
      rows.push([e.date, e.type === 'income' ? labels.income : labels.expense, labels.category(e.category), e.amount, e.note || '']);
    }
    // BOM so spreadsheet apps detect UTF-8 (needed for non-Latin scripts).
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  }

  function normalizeCategory(type, raw) {
    const id = LEGACY_CATEGORY[raw] || raw;
    return CATEGORIES[type].includes(id) ? id : 'other';
  }

  function defaultSettings() {
    return { currency: 'USD', budget: 0, language: null, theme: 'system' };
  }

  // Validates a backup (or stored state) and returns a clean copy.
  // Throws an Error whose `code` is a translation key and `index` a 1-based row.
  function parseImport(text) {
    const fail = (code, index) => {
      const err = new Error(code);
      err.code = code;
      err.index = index;
      throw err;
    };
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      fail('import.notJson');
    }
    if (!data || !Array.isArray(data.transactions)) fail('import.noTransactions');

    const transactions = data.transactions.map((t, i) => {
      const amount = Number(t && t.amount);
      if (!t || !(t.type === 'income' || t.type === 'expense') || !(amount > 0) || !isDate(t.date)) fail('import.badTransaction', i + 1);
      return {
        id: String(t.id || 'imp-' + i),
        type: t.type,
        amount,
        category: normalizeCategory(t.type, t.category),
        date: t.date,
        note: String(t.note || '').slice(0, 120),
      };
    });

    const subscriptions = (Array.isArray(data.subscriptions) ? data.subscriptions : []).map((s, i) => {
      const amount = Number(s && s.amount);
      const day = Number(s && s.day);
      if (!s || !(amount > 0) || !(Number.isInteger(day) && day >= 1 && day <= 31) || !isMonth(s.startMonth)) fail('import.badSubscription', i + 1);
      return { id: String(s.id || 'imp-sub-' + i), name: String(s.name || '').slice(0, 60) || '—', amount, day, startMonth: s.startMonth };
    });

    const raw = data.settings || {};
    const settings = defaultSettings();
    if (typeof raw.currency === 'string' && /^[A-Z]{3}$/.test(raw.currency)) settings.currency = raw.currency;
    if (Number(raw.budget) > 0) settings.budget = Number(raw.budget);
    if (typeof raw.language === 'string') settings.language = raw.language;
    if (THEMES.includes(raw.theme)) settings.theme = raw.theme;

    return { transactions, subscriptions, settings };
  }

  // ---------- demo data ----------

  // Deterministic sample data covering six months up to `endMonth`.
  // names: { internet, streaming, gym } — translated subscription names.
  function sampleData(endMonth, names) {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const round = (n) => Math.round(n / 5) * 5;
    const transactions = [];
    let n = 0;
    const add = (type, amount, category, month, day) => {
      transactions.push({
        id: 'demo-' + n++,
        type,
        amount: round(amount),
        category,
        date: month + '-' + String(Math.min(day, daysInMonth(month))).padStart(2, '0'),
        note: '',
      });
    };
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonth(endMonth, -i);
      add('income', 2400, 'salary', m, 1);
      if (i % 2 === 0) add('income', 300 + rand() * 400, 'freelance', m, 18);
      add('expense', 750, 'housing', m, 2);
      add('expense', 90 + rand() * 40, 'housing', m, 20);
      for (let w = 0; w < 4; w++) add('expense', 70 + rand() * 60 + (i === 0 ? 45 : 0), 'food', m, 4 + w * 7);
      add('expense', 60 + rand() * 50, 'transport', m, 9);
      add('expense', 80 + rand() * 180, 'shopping', m, 14);
      add('expense', 40 + rand() * 80, 'entertainment', m, 22);
      if (i % 3 === 1) add('expense', 50 + rand() * 90, 'health', m, 11);
    }
    const start = shiftMonth(endMonth, -5);
    const subscriptions = [
      { id: 'demo-sub-1', name: names.internet, amount: 35, day: 5, startMonth: start },
      { id: 'demo-sub-2', name: names.streaming, amount: 15, day: 12, startMonth: start },
      { id: 'demo-sub-3', name: names.gym, amount: 30, day: 3, startMonth: start },
    ];
    return { transactions, subscriptions };
  }

  const api = {
    CATEGORIES, CURRENCIES, THEMES,
    monthKey, shiftMonth, daysInMonth, isDate,
    subscriptionEntries, monthEntries, filterEntries,
    summarize, monthlySeries, tips,
    toCSV, parseImport, defaultSettings, sampleData,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
