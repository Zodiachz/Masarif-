#!/usr/bin/env node
/*
 * Renders the PWA PNG icons and the README screenshots.
 *
 *   npm install          # installs Playwright (dev dependency)
 *   npm run images
 *
 * Screenshots use the app's built-in sample data, so they are reproducible.
 */
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'expenses');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const L = require(path.join(APP, 'js', 'logic.js'));

function locale(code) {
  return require(path.join(APP, 'locales', code + '.js'));
}

function sampleState(lang, theme) {
  const d = new Date();
  const month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const t = locale(lang);
  const data = L.sampleData(month, { internet: t['sample.internet'], streaming: t['sample.streaming'], gym: t['sample.gym'] });
  const currency = { en: 'USD', ar: 'SAR', es: 'EUR', fr: 'EUR', de: 'EUR', it: 'EUR', pt: 'BRL', tr: 'TRY' }[lang];
  return Object.assign(data, { settings: { currency, budget: 2000, language: lang, theme } });
}

const SHOTS = [
  { name: 'desktop-en', lang: 'en', theme: 'light', width: 1280, height: 860 },
  { name: 'desktop-ar-dark', lang: 'ar', theme: 'dark', width: 1280, height: 860 },
  { name: 'desktop-fr-insights', lang: 'fr', theme: 'light', width: 1280, height: 760, scrollTo: '#breakdown' },
  { name: 'mobile-es', lang: 'es', theme: 'light', width: 390, height: 844, mobile: true },
  { name: 'mobile-de-dark', lang: 'de', theme: 'dark', width: 390, height: 844, mobile: true, scrollTo: '#trend' },
  { name: 'mobile-tr', lang: 'tr', theme: 'light', width: 390, height: 844, mobile: true, scrollTo: '#tips' },
];

(async () => {
  const browser = await chromium.launch();

  // Icons
  const iconPage = await browser.newPage();
  for (const [src, size, out] of [
    ['icon.svg', 192, 'icon-192.png'],
    ['icon.svg', 512, 'icon-512.png'],
    ['maskable.svg', 512, 'maskable-512.png'],
  ]) {
    await iconPage.setViewportSize({ width: size, height: size });
    await iconPage.goto(pathToFileURL(path.join(APP, 'icons', src)).href);
    await iconPage.screenshot({ path: path.join(APP, 'icons', out), omitBackground: true });
    console.log('icon', out);
  }
  await iconPage.close();

  // Screenshots
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: shot.mobile ? 2 : 1,
      isMobile: !!shot.mobile,
      hasTouch: !!shot.mobile,
      colorScheme: shot.theme,
    });
    const state = sampleState(shot.lang, shot.theme);
    await context.addInitScript((s) => localStorage.setItem('masarif.v2', s), JSON.stringify(state));
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(APP, 'index.html')).href);
    if (shot.scrollTo) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel).closest('.card');
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16);
      }, shot.scrollTo);
    }
    await page.screenshot({ path: path.join(OUT, shot.name + '.png') });
    console.log('screenshot', shot.name);
    await context.close();
  }

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
