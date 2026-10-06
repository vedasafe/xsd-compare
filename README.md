# XSD File Compare

A Python desktop window for comparing two `.xsd` files. No pip packages required.

A browser version is also included in `web/`, ready for GitHub Pages. It processes selected files locally, without uploading their contents or using third-party services.

## Browser version

From the project folder, run `python -m http.server 8000 --directory web`, then open `http://localhost:8000`. Use a local HTTP server rather than opening the HTML file directly, because the application uses JavaScript modules.

The browser version shares the desktop comparison rules below. It supports UTF-8, UTF-16, and encodings supported by the browser's TextDecoder. Browser XML parsing can differ from Python for uncommon encodings or DTD constructs. The browser displays the first 500 differences and reports the full count; the desktop app displays all differences. Large files remain subject to available device memory.

### GitHub Pages

The app is deployed at **[vedasafe.github.io/xsd-compare](https://vedasafe.github.io/xsd-compare/)**. Source is available at **[vedasafe/xsd-compare](https://github.com/vedasafe/xsd-compare)**.

The repository contains `.github/workflows/pages.yml`, which publishes **only `web/`** when app, test, or workflow files change on `main`, or when the workflow is run manually. A second job runs browser tests against the published URL, including verifying that file comparison makes no network requests. In forks, select **GitHub Actions** in Settings → Pages as the publishing source. This follows [GitHub's custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### Browser regression tests

With Node.js installed, run `npm install`, `npx playwright install chromium`, then `npm test`. If using an existing Chrome installation, set `XSD_BROWSER_CHANNEL=chrome` instead of downloading Chromium. Tests start and close their own local server and browser. They cover comparison rules, file decoding, selection and reset, invalid XML, safe result rendering, and desktop/mobile layout.

## Run on Windows

Double-click **run.bat**. It uses Python from your system or the available Codex bundled runtime. Alternatively, run `python app.py` with Python 3.10+ and Tkinter installed.

1. Click **Select first XSD** and choose the first file.
2. Click **Select second XSD** and choose the second file.
3. Click **Compare**. The results show **Same** or each difference with an XML path and both values. Results can be selected and copied.

Try `examples/first.xsd` against `examples/same_formatting_changed.xsd` for a match, or against `examples/different.xsd` for a changed type.

## Comparison rules

- Ignores indentation, blank lines, whitespace-only text between tags, comments, processing instructions, and attribute order.
- Preserves spaces within nonempty text and attribute values, subject to standard XML parser normalization.
- Compares element names, attributes, meaningful text, and child order.
- Namespace prefixes on element and attribute names are resolved to namespace URIs. Values such as `type="xs:string"` remain literal.
- Paths use `{namespace URI}name` for namespaced nodes and one-based sibling indexes. Missing values are labeled `(missing)`; quoted values distinguish empty strings and whitespace.

This is structural document comparison, not full XSD semantic equivalence or XSD validation. Imports/includes are not expanded. Reordered or inserted children can produce multiple differences. Files and results are held in memory; very large schemas may take time to display.

## Tests

Run `python -m unittest discover -s tests -v`. The GUI test needs a desktop session and Tkinter; it creates a hidden window and checks file selection, matching/differing files, error reporting, and reset behavior.
