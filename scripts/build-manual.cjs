// Renders the user manual (docs/manual/manual.html) to
// docs/manual/DidiFlow-Manual-<version>.pdf with Electron's print engine.
//
//   npm run manual
//
// The screenshots in docs/manual/img are real captures of the app; see the
// comment at the top of manual.html.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const source = path.join(root, 'docs', 'manual', 'manual.html');
const output = path.join(root, 'docs', 'manual', `DidiFlow-Manual-${version}.pdf`);

const footer = `
  <div style="width:100%;padding:0 16mm;font:8px 'Segoe UI',sans-serif;color:#64748b;
              display:flex;justify-content:space-between">
    <span>DidiFlow ${version} — Manual do usuário</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 1600 });
  try {
    await win.loadFile(source);
    // Wait for the web font and every screenshot before printing.
    await win.webContents
      .executeJavaScript(
        `
      Promise.all([
        document.fonts.ready,
        ...[...document.images].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })),
      ]).then(() => [...document.images].filter((img) => !img.naturalWidth).map((img) => img.src))
    `,
      )
      .then((broken) => {
        if (broken.length) throw new Error(`missing images: ${broken.join(', ')}`);
      });
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footer,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
    });
    fs.writeFileSync(output, pdf);
    console.log(
      `manual: ${path.relative(root, output)} (${(pdf.length / 1024 / 1024).toFixed(1)} MB)`,
    );
  } catch (error) {
    console.error('manual:', error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
