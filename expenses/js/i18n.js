/*
 * Tiny i18n layer. Locale files register themselves on `MASARIF_LOCALES`
 * (plain scripts, so the app also works when opened straight from disk).
 *
 * Markup hooks:
 *   data-i18n="key"              -> textContent
 *   data-i18n-placeholder="key"  -> placeholder
 *   data-i18n-aria-label="key"   -> aria-label
 *   data-i18n-title="key"        -> title
 */
(function (root) {
  'use strict';

  const LANGUAGES = [
    { code: 'en', name: 'English', dir: 'ltr' },
    { code: 'ar', name: 'العربية', dir: 'rtl', intl: 'ar-u-nu-latn' },
    { code: 'es', name: 'Español', dir: 'ltr' },
    { code: 'fr', name: 'Français', dir: 'ltr' },
    { code: 'de', name: 'Deutsch', dir: 'ltr' },
    { code: 'it', name: 'Italiano', dir: 'ltr' },
    { code: 'pt', name: 'Português', dir: 'ltr' },
    { code: 'tr', name: 'Türkçe', dir: 'ltr' },
  ];
  const FALLBACK = 'en';

  let current = FALLBACK;

  function locales() {
    return root.MASARIF_LOCALES || {};
  }

  function info(code) {
    return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
  }

  // Best match for the browser's preferred languages, e.g. "pt-BR" -> "pt".
  function detect(preferred) {
    for (const tag of preferred || []) {
      const base = String(tag).toLowerCase().split('-')[0];
      if (LANGUAGES.some((l) => l.code === base)) return base;
    }
    return FALLBACK;
  }

  function t(key, vars) {
    const dict = locales()[current] || {};
    let s = key in dict ? dict[key] : (locales()[FALLBACK] || {})[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
    return s;
  }

  function setLanguage(code) {
    current = LANGUAGES.some((l) => l.code === code) ? code : FALLBACK;
    return current;
  }

  function apply(scope) {
    const doc = scope.ownerDocument || scope;
    const html = doc.documentElement;
    html.lang = current;
    html.dir = info(current).dir;
    for (const el of scope.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of scope.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of scope.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    for (const el of scope.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  }

  const api = {
    LANGUAGES,
    FALLBACK,
    detect,
    t,
    apply,
    setLanguage,
    get language() { return current; },
    get dir() { return info(current).dir; },
    get intlLocale() { return info(current).intl || current; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.I18n = api;
})(typeof window !== 'undefined' ? window : globalThis);
