const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const I18n = require('../js/i18n.js');
const L = require('../js/logic.js');

const dir = path.join(__dirname, '..', 'locales');
const locales = {};
for (const file of fs.readdirSync(dir)) locales[path.basename(file, '.js')] = require(path.join(dir, file));
const en = locales.en;
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort();

test('every language in the picker has a locale file and vice versa', () => {
  assert.deepEqual(I18n.LANGUAGES.map((l) => l.code).sort(), Object.keys(locales).sort());
});

for (const [code, dict] of Object.entries(locales)) {
  test(`locale "${code}" has exactly the English keys with the same placeholders`, () => {
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      assert.ok(String(dict[key]).trim(), `${code}: "${key}" is empty`);
      assert.deepEqual(placeholders(dict[key]), placeholders(en[key]), `${code}: placeholders differ in "${key}"`);
    }
  });
}

test('every category id and tip key has a translation', () => {
  const ids = new Set([...L.CATEGORIES.expense, ...L.CATEGORIES.income]);
  for (const id of ids) assert.ok(en['cat.' + id], 'missing cat.' + id);
  for (const key of ['overBudget', 'nearBudget', 'deficit', 'lowSavings', 'goodSavings', 'topCategory', 'categoryUp', 'subscriptionsHeavy']) {
    assert.ok(en['tip.' + key], 'missing tip.' + key);
  }
});

test('detect picks the best supported language', () => {
  assert.equal(I18n.detect(['pt-BR', 'en']), 'pt');
  assert.equal(I18n.detect(['ja-JP', 'fr-CA']), 'fr');
  assert.equal(I18n.detect(['ja']), 'en');
});

test('t interpolates and falls back to English', () => {
  globalThis.MASARIF_LOCALES = locales;
  I18n.setLanguage('fr');
  assert.equal(I18n.t('budget.of', { spent: 'A', budget: 'B' }), 'A sur B');
  assert.equal(I18n.t('no.such.key'), 'no.such.key');
  I18n.setLanguage('xx');
  assert.equal(I18n.language, 'en');
});
