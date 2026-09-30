// Builds src/assets/help/flip-platform-console-user-guide.pdf from the Help section's own content
// (src/app/features/help/help-content.ts), so the downloadable guide always says what the Help
// page says. Run it after changing the guides or their screenshots:
//
//   npm run help:pdf
//
// Needs Google Chrome or Chromium (version 131 or later for page numbers). Set CHROME_PATH if it is
// not in a standard location. HELP_PDF_HTML=<file> also saves the HTML that was printed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const contentFile = path.join(src, 'app', 'features', 'help', 'help-content.ts');
const output = path.join(src, 'assets', 'help', 'flip-platform-console-user-guide.pdf');
const logo = path.join(src, 'assets', 'logos', 'flip-product-logo.svg');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'flip-help-pdf-'));

try {
  const { HELP_STAGES, HELP_GUIDES, HELP_FAQ } = await loadContent();
  const htmlFile = path.join(work, 'guide.html');
  fs.writeFileSync(htmlFile, renderGuide(HELP_STAGES, HELP_GUIDES, HELP_FAQ), 'utf8');
  // HELP_PDF_HTML=<file> also keeps the page that was printed, for checking the layout in a browser.
  if (process.env.HELP_PDF_HTML) fs.copyFileSync(htmlFile, process.env.HELP_PDF_HTML);
  printToPdf(htmlFile, output);
  const size = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${path.relative(root, output)} (${size} MB): ${HELP_GUIDES.length} guides, ${HELP_FAQ.length} FAQ entries.`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

// --- content -------------------------------------------------------------------------------------

async function loadContent() {
  const source = fs.readFileSync(contentFile, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
  });
  const moduleFile = path.join(work, 'help-content.mjs');
  fs.writeFileSync(moduleFile, outputText, 'utf8');
  return import(pathToFileURL(moduleFile).href);
}

// --- rendering -----------------------------------------------------------------------------------

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Screenshots are embedded as data URLs so the page script below can re-encode them as JPEG:
// Chrome keeps JPEG data compressed in the PDF but stores other formats as raw bitmaps.
function assetUrl(relative) {
  const file = path.join(src, relative);
  const type = path.extname(file) === '.webp' ? 'image/webp' : path.extname(file) === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

function renderGuide(stages, guides, faq) {
  const stageNumber = (id) => stages.findIndex((s) => s.id === id) + 1;
  const stageLabel = (id) => stages.find((s) => s.id === id)?.label ?? '';
  const guideTitle = (id) => guides.find((g) => g.id === id)?.title ?? '';
  const generated = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const cover = `
    <section class="cover">
      <img class="cover-logo" src="${pathToFileURL(logo).href}" alt="FLIP" />
      <p class="eyebrow">User guide</p>
      <h1>FLIP Platform Console</h1>
      <p class="cover-sub">Every console flow, step by step — from onboarding an organization to offboarding it — with screenshots and answers to common questions.</p>
      <ol class="cover-stages">
        ${stages.map((s, i) => `<li><span>${i + 1}</span>${esc(s.label)}</li>`).join('')}
      </ol>
      <p class="cover-meta">Worked example: Kanerika Software Pvt Ltd on the plan Kanerika Enterprise Suite<br />Generated ${esc(generated)}</p>
    </section>`;

  const contents = `
    <section class="contents">
      <h2>Contents</h2>
      ${stages
        .map((stage) => {
          const items = guides.filter((g) => g.stage === stage.id);
          if (!items.length) return '';
          return `<div class="toc-stage"><p>${stageNumber(stage.id)} · ${esc(stage.label)}</p><ul>${items
            .map((g) => `<li><a href="#${g.id}">${esc(g.title)}</a><span>${esc(g.audience)}</span></li>`)
            .join('')}</ul></div>`;
        })
        .join('')}
      <div class="toc-stage"><p>Questions</p><ul><li><a href="#faq">Frequently asked questions</a><span>${faq.length} answers</span></li></ul></div>
    </section>`;

  const body = guides
    .map(
      (g) => `
    <section class="guide" id="${g.id}">
      <header class="guide-head">
        <p class="eyebrow">Stage ${stageNumber(g.stage)} · ${esc(stageLabel(g.stage))}</p>
        <h2>${esc(g.title)}</h2>
        <p class="summary">${esc(g.summary)}</p>
        <p class="meta"><span>Where: ${esc(g.where.label)}</span><span>Who: ${esc(g.audience)}</span><span>${g.steps.length} step${g.steps.length === 1 ? '' : 's'}</span></p>
      </header>
      ${g.steps.map((s, i) => renderStep(s, i + 1)).join('')}
      ${
        g.notes?.length
          ? `<div class="notes">${g.notes.map((n) => `<p class="note ${n.tone}"><strong>${n.tone === 'warning' ? 'Important' : n.tone === 'tip' ? 'Tip' : 'Note'}:</strong> ${esc(n.text)}</p>`).join('')}</div>`
          : ''
      }
    </section>`
    )
    .join('');

  const groups = [...new Set(faq.map((f) => f.group))];
  const faqSection = `
    <section class="faq" id="faq">
      <p class="eyebrow">Questions</p>
      <h2>Frequently asked questions</h2>
      ${groups
        .map(
          (group) => `
        <h3>${esc(group)}</h3>
        ${faq
          .filter((f) => f.group === group)
          .map(
            (f) => `
          <div class="qa">
            <p class="q">${esc(f.q)}</p>
            <p class="a">${esc(f.a)}</p>
            ${f.guide ? `<p class="see">See: <a href="#${f.guide}">${esc(guideTitle(f.guide))}</a></p>` : ''}
          </div>`
          )
          .join('')}`
        )
        .join('')}
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>FLIP Platform Console — User guide</title>
<style>${styles()}</style>
</head>
<body>${cover}${contents}${body}${faqSection}
<script>
  // Runs once every screenshot has loaded; drawImage decodes synchronously, so no promises are
  // left pending when Chrome prints.
  window.addEventListener('load', () => {
    let converted = 0;
    for (const img of document.querySelectorAll('figure img')) {
      // 1280 px across the printed width is about 180 dpi on A4 — sharp in print, small on disk.
      const scale = Math.min(1, 1280 / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = canvas.toDataURL('image/jpeg', 0.82);
      converted++;
    }
    document.body.dataset.converted = String(converted);
  });
</script>
</body>
</html>`;
}

function renderStep(step, number) {
  return `
    <div class="step">
      <h3><span class="num">${number}</span>${esc(step.title)}</h3>
      <p class="text">${esc(step.text)}</p>
      ${
        step.actions?.length
          ? `<p class="label">Do this</p><ol class="actions">${step.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`
          : ''
      }
      ${
        step.fields?.length
          ? `<p class="label">What to fill in</p><table class="fields">${step.fields
              .map((f) => `<tr><th>${esc(f.name)}</th><td>${esc(f.hint)}</td></tr>`)
              .join('')}</table>`
          : ''
      }
      ${step.result ? `<p class="result"><strong>What you'll see:</strong> ${esc(step.result)}</p>` : ''}
      ${
        step.image
          ? `<figure><img src="${assetUrl(step.image)}" alt="${esc(step.caption || step.title)}" />${step.caption ? `<figcaption>${esc(step.caption)}</figcaption>` : ''}</figure>`
          : ''
      }
    </div>`;
}

function styles() {
  return `
  @page {
    size: A4;
    margin: 18mm 15mm 18mm 15mm;
    @top-left { content: "FLIP Platform Console · User guide"; font: 600 8pt 'Segoe UI', Roboto, Arial, sans-serif; color: #7850a5; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt 'Segoe UI', Roboto, Arial, sans-serif; color: #70798c; }
  }
  @page :first { margin: 0; @top-left { content: none; } @bottom-right { content: none; } }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10pt/1.55 'Segoe UI', Roboto, Arial, sans-serif; color: #272b34; }
  a { color: #6a3a8c; text-decoration: none; }
  .eyebrow { margin: 0 0 4px; font-size: 8pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #7850a5; }

  .cover { height: 297mm; padding: 42mm 24mm 24mm; color: #fff; background: linear-gradient(135deg, #5b3796, #7c46a3 55%, #aa5078); break-after: page; display: flex; flex-direction: column; }
  .cover-logo { width: 46mm; padding: 5mm 7mm; border-radius: 4mm; background: #fff; }
  .cover .eyebrow { margin-top: 26mm; color: #e2d2f6; }
  .cover h1 { margin: 0; font-size: 32pt; line-height: 1.1; letter-spacing: -.02em; }
  .cover-sub { max-width: 140mm; margin: 6mm 0 0; font-size: 12.5pt; color: #f1e9f8; }
  .cover-stages { display: flex; flex-wrap: wrap; gap: 3mm; margin: 16mm 0 0; padding: 0; list-style: none; }
  .cover-stages li { padding: 2mm 4mm; border: 1px solid rgba(255,255,255,.4); border-radius: 20mm; background: rgba(255,255,255,.12); font-size: 9.5pt; font-weight: 600; }
  .cover-stages span { margin-right: 2mm; opacity: .75; }
  .cover-meta { margin-top: auto; font-size: 9pt; color: #e2d2f6; }

  .contents { break-after: page; }
  .contents h2, .faq h2 { margin: 0 0 4mm; font-size: 20pt; }
  .toc-stage { margin-bottom: 2.5mm; break-inside: avoid; }
  .toc-stage p { margin: 0 0 .5mm; font-size: 8pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #70798c; }
  .toc-stage ul { margin: 0; padding: 0; list-style: none; }
  .toc-stage li { display: flex; justify-content: space-between; padding: 1.1mm 0; border-bottom: 1px dotted #c4cad4; font-size: 10pt; }
  .toc-stage li span { color: #70798c; font-size: 8.5pt; }

  .guide { break-before: page; }
  .guide-head { padding: 6mm 7mm; margin-bottom: 5mm; border-radius: 3mm; color: #fff; background: linear-gradient(115deg, #7040a5, #8a49a0 58%, #aa5078); }
  .guide-head .eyebrow { color: #e2d2f6; }
  .guide-head h2 { margin: 0; font-size: 17pt; line-height: 1.2; }
  .summary { margin: 2.5mm 0 0; color: #f1e9f8; }
  .meta { display: flex; flex-wrap: wrap; gap: 2mm; margin: 3mm 0 0; }
  .meta span { padding: .8mm 3mm; border-radius: 10mm; background: rgba(255,255,255,.16); font-size: 8pt; font-weight: 600; }

  .step { padding: 4mm 0 2mm; border-top: 1px dashed #e6e9ee; }
  .step:first-of-type { border-top: 0; }
  .step h3 { display: flex; align-items: center; margin: 0 0 1.5mm; font-size: 12pt; break-after: avoid; }
  .num { display: inline-flex; align-items: center; justify-content: center; width: 6.5mm; height: 6.5mm; margin-right: 3mm; border-radius: 50%; background: #7c46a3; color: #fff; font-size: 9pt; font-weight: 700; }
  .text { margin: 0 0 2mm; color: #4a5264; }
  .label { margin: 3mm 0 1mm; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #7850a5; break-after: avoid; }
  .actions { margin: 0; padding-left: 6mm; color: #4a5264; }
  .actions li { margin: .6mm 0; break-inside: avoid; }
  .actions li::marker { color: #7c46a3; font-weight: 700; }
  .fields { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .fields tr { break-inside: avoid; }
  .fields th { width: 34%; padding: 2mm 3mm; border: 1px solid #e6e9ee; background: #f4f5f6; text-align: left; vertical-align: top; font-weight: 600; }
  .fields td { padding: 2mm 3mm; border: 1px solid #e6e9ee; color: #4a5264; }
  .result { margin: 3mm 0 0; padding: 2.5mm 3.5mm; border-radius: 2mm; background: #daf2e8; color: #1f6a3a; break-inside: avoid; }
  figure { margin: 4mm 0 2mm; break-inside: avoid; }
  figure img { display: block; width: auto; max-width: 100%; max-height: 105mm; margin: 0 auto; border: 1px solid #e6e9ee; border-radius: 2mm; }
  figcaption { margin-top: 1.5mm; font-size: 8.5pt; color: #70798c; text-align: center; }

  .notes { margin-top: 4mm; }
  .note { margin: 0 0 2mm; padding: 2.5mm 3.5mm; border-radius: 2mm; break-inside: avoid; }
  .note.tip { background: #daf2e8; color: #1f6a3a; }
  .note.warning { background: #fdf6d8; color: #7a5a06; }
  .note.info { background: #f8fbff; border: 1px solid #daefff; color: #073d73; }

  .faq { break-before: page; }
  .faq h3 { margin: 6mm 0 2mm; font-size: 9pt; letter-spacing: .06em; text-transform: uppercase; color: #70798c; break-after: avoid; }
  .qa { padding: 2.5mm 0; border-bottom: 1px solid #e6e9ee; break-inside: avoid; }
  .q { margin: 0 0 1mm; font-weight: 700; }
  .a { margin: 0; color: #4a5264; }
  .see { margin: 1mm 0 0; font-size: 8.5pt; }
  `;
}

// --- Chrome --------------------------------------------------------------------------------------

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Google Chrome or Chromium was not found. Set CHROME_PATH to its executable.');
  }
  return found;
}

function printToPdf(htmlFile, pdfFile) {
  // A separate profile keeps the headless run from joining a Chrome window that is already open.
  const profile = path.join(work, 'chrome-profile');
  execFileSync(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      `--user-data-dir=${profile}`,
      '--no-pdf-header-footer',
      '--virtual-time-budget=120000',
      `--print-to-pdf=${pdfFile}`,
      pathToFileURL(htmlFile).href
    ],
    { stdio: 'pipe' }
  );
  if (!fs.existsSync(pdfFile)) {
    throw new Error('Chrome did not produce the PDF.');
  }
}
