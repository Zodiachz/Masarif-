# Contributing

Thanks for helping! Every app in this repository is plain HTML, CSS and JavaScript with no build step, so getting started takes a minute.

## Setup

```sh
git clone https://github.com/Zodiachz/new-project-.git
cd new-project-
npm start     # http://localhost:8080
npm test      # Node 22+
```

## Guidelines

- **No runtime dependencies.** Apps must keep working offline and when opened straight from disk.
- **Keep logic pure.** Calculations go in `js/logic.js` (no DOM), with tests in `tests/`. The UI lives in `js/app.js`.
- **Never hard-code user-facing text.** Add a key to every file in `locales/` and use `t('key')` or `data-i18n="key"`. The test suite fails if a language is missing a key or a `{placeholder}`.
- **Format with `Intl`.** Amounts, percentages and dates must go through the formatters in `app.js` so they follow the selected language.
- **Respect right-to-left.** Use logical CSS properties (`inset-inline-start`, `margin-inline-end`…) and check Arabic after layout changes.
- **Accessibility.** Every control needs a visible label or an `aria-label`; everything must work with the keyboard.
- Check phone width (≈ 360 px), light and dark themes before opening a pull request.

## Adding a language

1. Copy `expenses/locales/en.js` to `expenses/locales/<code>.js` (for example `ur.js`) and translate every value. Keep the `{placeholders}` unchanged.
2. Change the last two lines of the new file to register the new code: `.ur = dict`.
3. Add the language to `LANGUAGES` in `expenses/js/i18n.js`: `{ code: 'ur', name: 'اردو', dir: 'rtl' }` (`dir: 'rtl'` for right-to-left scripts).
4. Add a `<script src="locales/ur.js"></script>` tag in `expenses/index.html` and the file to `SHELL` in `expenses/sw.js`.
5. Add the language to the landing page dictionary in `index.html`.
6. Run `npm test`.

## Adding a new solution

Create a new folder next to `expenses/` with the same structure (`index.html`, `css/`, `js/`, `locales/`, `tests/`), add a card to the landing page and a row to the README table, and include it in the `Collect site files` step of `.github/workflows/pages.yml`.

## Commit messages

Use the imperative mood and keep the subject under 72 characters, e.g. `Add Urdu translation` or `Fix budget bar in dark theme`.
