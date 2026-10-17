const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

test('shiftMonth crosses year boundaries', () => {
  assert.equal(L.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(L.shiftMonth('2026-12', 1), '2027-01');
});

test('subscriptions start in their month and clamp the billing day', () => {
  const subs = [{ id: 'a', name: 'Gym', amount: 30, day: 31, startMonth: '2026-02' }];
  assert.equal(L.subscriptionEntries(subs, '2026-01').length, 0);
  const feb = L.subscriptionEntries(subs, '2026-02');
  assert.equal(feb.length, 1);
  assert.equal(feb[0].date, '2026-02-28');
  assert.equal(feb[0].category, 'subscriptions');
  assert.equal(L.subscriptionEntries(subs, '2026-03')[0].date, '2026-03-31');
});

const state = {
  transactions: [
    { id: '1', type: 'income', amount: 1000, category: 'salary', date: '2026-03-01', note: '' },
    { id: '2', type: 'expense', amount: 200, category: 'food', date: '2026-03-05', note: 'Pizza night' },
    { id: '3', type: 'expense', amount: 300, category: 'housing', date: '2026-03-06', note: '' },
    { id: '4', type: 'expense', amount: 999, category: 'shopping', date: '2026-04-01', note: '' },
  ],
  subscriptions: [{ id: 's', name: 'Internet', amount: 50, day: 10, startMonth: '2026-01' }],
};

test('summarize totals income, expenses and ranks categories', () => {
  const s = L.summarize(L.monthEntries(state, '2026-03'));
  assert.equal(s.income, 1000);
  assert.equal(s.expense, 550);
  assert.equal(s.recurring, 50);
  assert.equal(s.balance, 450);
  assert.equal(s.savingsRate, 0.45);
  assert.deepEqual(s.byCategory.map((c) => c.category), ['housing', 'food', 'subscriptions']);
});

test('savingsRate is null without income', () => {
  assert.equal(L.summarize([{ type: 'expense', amount: 5, category: 'other' }]).savingsRate, null);
});

test('monthlySeries returns oldest-first totals including subscriptions', () => {
  const series = L.monthlySeries(state, '2026-04', 3);
  assert.deepEqual(series.map((s) => s.month), ['2026-02', '2026-03', '2026-04']);
  assert.deepEqual(series.map((s) => s.expense), [50, 550, 1049]);
  assert.deepEqual(series.map((s) => s.income), [0, 1000, 0]);
});

test('filterEntries matches type, category and translated text', () => {
  const entries = L.monthEntries(state, '2026-03');
  const names = { food: 'Comida', housing: 'Vivienda', salary: 'Salario', subscriptions: 'Suscripciones' };
  const nameOf = (id) => names[id] || id;
  assert.equal(L.filterEntries(entries, { type: 'income' }, nameOf).length, 1);
  assert.equal(L.filterEntries(entries, { category: 'food' }, nameOf).length, 1);
  assert.equal(L.filterEntries(entries, { query: 'vivi' }, nameOf)[0].category, 'housing');
  assert.equal(L.filterEntries(entries, { query: 'PIZZA' }, nameOf).length, 1);
  assert.equal(L.filterEntries(entries, { query: 'internet' }, nameOf).length, 1);
  assert.equal(L.filterEntries(entries, { query: 'nothing' }, nameOf).length, 0);
});

test('tips flag over-budget, deficit, a dominant and a rising category', () => {
  const prev = L.summarize([
    { type: 'income', amount: 1000, category: 'salary' },
    { type: 'expense', amount: 100, category: 'food' },
    { type: 'expense', amount: 100, category: 'transport' },
  ]);
  const cur = L.summarize([
    { type: 'income', amount: 1000, category: 'salary' },
    { type: 'expense', amount: 900, category: 'food' },
    { type: 'expense', amount: 200, category: 'transport' },
  ]);
  const tips = L.tips(cur, prev, 1000);
  const keys = tips.map((x) => x.key);
  assert.deepEqual(keys, ['overBudget', 'deficit', 'topCategory', 'categoryUp', 'categoryUp']);
  assert.equal(tips[0].vars.amount, 100);
  assert.equal(tips[2].vars.category, 'food');
  assert.equal(tips[3].vars.pct, 8);
});

test('tips praise a good savings rate and stay quiet on empty months', () => {
  const ok = L.summarize([{ type: 'income', amount: 1000, category: 'salary' }, { type: 'expense', amount: 500, category: 'food' }]);
  assert.deepEqual(L.tips(ok, null, 0).map((x) => x.key), ['goodSavings']);
  assert.deepEqual(L.tips(L.summarize([]), null, 0), []);
});

test('toCSV uses the given labels and escapes cells', () => {
  const csv = L.toCSV(
    [{ date: '2026-03-01', type: 'expense', category: 'food', amount: 5, note: 'Coffee, "large"' }],
    { headers: ['D', 'T', 'C', 'A', 'N'], income: 'In', expense: 'Out', category: (id) => id.toUpperCase() }
  );
  assert.ok(csv.startsWith('﻿D,T,C,A,N\n'));
  assert.match(csv, /2026-03-01,Out,FOOD,5,"Coffee, ""large"""/);
});

test('parseImport accepts a valid backup and migrates legacy Arabic categories', () => {
  const ok = L.parseImport(JSON.stringify({
    transactions: [
      { id: 'x', type: 'expense', amount: '12.5', category: 'أكل ومطاعم', date: '2026-03-01' },
      { id: 'y', type: 'income', amount: 10, category: 'unknown', date: '2026-03-02' },
    ],
    subscriptions: [{ id: 's', name: 'Gym', amount: 30, day: 3, startMonth: '2026-01', category: 'اشتراكات' }],
    settings: { currency: 'DZD', budget: '500', theme: 'dark', language: 'fr' },
  }));
  assert.equal(ok.transactions[0].amount, 12.5);
  assert.equal(ok.transactions[0].category, 'food');
  assert.equal(ok.transactions[1].category, 'other');
  assert.equal(ok.subscriptions[0].day, 3);
  assert.deepEqual(ok.settings, { currency: 'DZD', budget: 500, language: 'fr', theme: 'dark' });
});

test('parseImport rejects broken data with a translatable code', () => {
  const code = (fn) => { try { fn(); } catch (e) { return [e.code, e.index]; } };
  assert.deepEqual(code(() => L.parseImport('not json')), ['import.notJson', undefined]);
  assert.deepEqual(code(() => L.parseImport('{}')), ['import.noTransactions', undefined]);
  assert.deepEqual(
    code(() => L.parseImport(JSON.stringify({ transactions: [{ type: 'expense', amount: 1, date: '2026-02-30x' }] }))),
    ['import.badTransaction', 1]
  );
  assert.deepEqual(
    code(() => L.parseImport(JSON.stringify({ transactions: [], subscriptions: [{ amount: 5, day: 40, startMonth: '2026-01' }] }))),
    ['import.badSubscription', 1]
  );
});

test('sampleData produces six months of valid, importable data', () => {
  const s = L.sampleData('2026-10', { internet: 'I', streaming: 'S', gym: 'G' });
  const months = new Set(s.transactions.map((t) => L.monthKey(t.date)));
  assert.equal(months.size, 6);
  assert.equal(s.subscriptions[0].startMonth, '2026-05');
  const round = L.parseImport(JSON.stringify(s));
  assert.equal(round.transactions.length, s.transactions.length);
  assert.deepEqual(L.sampleData('2026-10', { internet: 'I', streaming: 'S', gym: 'G' }), s, 'deterministic');
});
