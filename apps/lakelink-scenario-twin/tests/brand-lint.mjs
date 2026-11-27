// Brand lint (ARCHITECTURE s6, brand_guide s1): fail if client/ or server/ contain a non-Lakelink carrier name
// or forbidden low-contrast text usage. Run: npm run lint:brand
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Deny-list of real carrier names, base64-encoded so this repo never spells them out (CEO branding rule).
const FORBIDDEN = Buffer.from('bHVtZW4sY2VudHVyeWxpbmssbGV2ZWwgMyx2ZXJpem9uLGF0JnQsY29tY2FzdCx6YXlvLGZyb250aWVyLHdpbmRzdHJlYW0sY2hhcnRlcixjb2dlbnQsY3Jvd24gY2FzdGxl', 'base64').toString('utf8').split(',');
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css|html)$/.test(p) && files.push(p); } };
['client', 'server'].forEach(walk);
files.push('index.html');
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8').toLowerCase();
  for (const name of FORBIDDEN) {
    const re = new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}([^a-z]|$)`);
    if (re.test(src)) { console.error(`brand-lint: forbidden company name "${name}" in ${f}`); bad++; }
  }
  // brand_guide s2.4: #00A972 never as text color
  if (/(^|[;{\s])color:\s*(#00a972|var\(--lf-green\))/.test(src)) { console.error(`brand-lint: #00A972 used as text color in ${f}`); bad++; }
  if (f.endsWith('.css')) {
    // brand_guide s2.4.2: #FF3621 as text only in large-text selectors (>=24px or 18.66px bold).
    const LARGE_OK = new Set(['.headline']);
    for (const m of src.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = m[1].trim().split('\n').pop().trim(); const body = m[2];
      if (/(^|[;\s])color:\s*(#ff3621|var\(--lf-primary\))\s*[;}]?/.test(body) && !LARGE_OK.has(sel)) { console.error(`brand-lint: #FF3621 text color outside large-text selector "${sel}" in ${f}`); bad++; }
      // s2.4.3: white text on #FF3621 fill fails 4.5:1; buttons must use --lf-primary-strong.
      if (/background(-color)?:\s*(#ff3621|var\(--lf-primary\))\s*[;}]?/.test(body) && /(^|[;\s])color:\s*(#fff(fff)?|white|var\(--lf-white\))/.test(body)) { console.error(`brand-lint: white text on #FF3621 in "${sel}" in ${f}`); bad++; }
      // s4.2: salmon never as a thin line / text.
      if (/(^|[;\s])(color|stroke):\s*#ff8c69/.test(body)) { console.error(`brand-lint: #FF8C69 used as text/stroke in "${sel}" in ${f}`); bad++; }
    }
  }
  if (/\.tsx$/.test(f) && /stroke:\s*(tokens\.salmon|'#ff8c69')/.test(src)) { console.error(`brand-lint: #FF8C69 used as chart stroke in ${f}`); bad++; }
}
// s8.10: page titles go through pageTitle() -> '<View> | Lakelink Fiber Scenario Twin'.
if (!/document\.title\s*=\s*pagetitle\(/i.test(readFileSync('client/main.tsx', 'utf8'))) { console.error('brand-lint: document.title must use pageTitle()'); bad++; }
if (!readFileSync('client/theme.tsx', 'utf8').includes('`${view} | ${APP_NAME}`')) { console.error('brand-lint: pageTitle format drifted'); bad++; }
if (!readFileSync('index.html', 'utf8').includes('Lakelink Fiber Scenario Twin')) { console.error('brand-lint: page title missing app name'); bad++; }
// P5-APP-A11Y-SHELL (brand_guide s6-s8): static shell guards so P5-UX-REVIEW does not regress.
const mainSrc = readFileSync('client/main.tsx', 'utf8'); const css = readFileSync('client/styles.css', 'utf8');
const A11Y = [
  ['skip link', /className="skip-link" href="#main"/.test(mainSrc)],
  ['header/nav/main/aside landmarks', ['<header', '<nav', '<main id="main"', '<aside'].every((t) => mainSrc.includes(t))],
  ['assistant toggle aria-label + aria-expanded', /ref=\{toggleRef\}[^>]*aria-label=[^>]*aria-expanded/.test(mainSrc)],
  ['icon tooltips (data-tip) on rail + toggle', (mainSrc.match(/data-tip=/g) || []).length >= 2 && /\.tip:focus-visible::after/.test(css)],
  ['Esc closes overlay + returns focus', /e\.key === 'Escape'[^\n]*opener\.current\?\.focus\(\)/.test(mainSrc)],
  ['focus trap on Tab at overlay widths', /e\.key !== 'Tab'/.test(mainSrc) && /max-width: 1023px/.test(mainSrc)],
  ['assistant output aria-live=polite', /assistant-log" aria-live="polite"/.test(mainSrc)],
  ['focus-visible 2px primary + 2px offset', /:focus-visible \{ outline: 2px solid var\(--lf-primary\); outline-offset: 2px; \}/.test(css)],
  ['white focus on navy topbar', /\.topbar :focus-visible \{ outline-color: var\(--lf-white\)/.test(css)],
  ['breakpoints 1279/1023/767', ['max-width: 1279px', 'max-width: 1023px', 'max-width: 767px'].every((b) => css.includes(b))],
  ['40px primary targets', /\.icon-btn \{[^}]*min-height: 40px/.test(css) && /\.sidenav a \{[^}]*min-height: 40px/.test(css)],
  ['reduced motion disables shimmer', /prefers-reduced-motion: reduce\) \{ \.skeleton \{ animation: none/.test(css)],
  ['twin-as-of chip keeps text (no hidden ts)', !/\.chip \.ts \{ display: none/.test(css) && mainSrc.includes('Twin as of')],
];
for (const [name, ok] of A11Y) if (!ok) { console.error(`a11y-lint: missing ${name}`); bad++; }
// D-013 / CEO naming directive: the retired assistant word never appears in app source, UI copy or config (spelled indirectly here).
const RETIRED = ['co', 'pilot'].join('');
for (const f of [...files, 'app.yaml']) if (readFileSync(f, 'utf8').toLowerCase().includes(RETIRED)) { console.error(`naming-lint: retired assistant name in ${f} (use Lakelink Fiber Splice)`); bad++; }
if (bad) process.exit(1);
console.log(`brand-lint: OK (${files.length} files); a11y-lint: OK (${A11Y.length} checks)`);
