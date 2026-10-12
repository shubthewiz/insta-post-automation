#!/usr/bin/env node
// Renders a carousel of slides from content.json using resources/template.html,
// screenshotting each one via headless Chromium (Puppeteer). No paid image-gen API.
//
// Usage: node render-carousel.js <path/to/content.json>

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');

const SWIPE_HINTS = { title: 'Swipe →', point: 'Swipe →', cta: '' };

async function main() {
  const contentPath = process.argv[2];
  if (!contentPath) {
    console.error('Usage: node render-carousel.js <path/to/content.json>');
    process.exit(1);
  }

  const outDir = path.dirname(path.resolve(contentPath));
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  const skillDir = path.join(__dirname, '..');
  const templateSrc = fs.readFileSync(path.join(skillDir, 'resources', 'template.html'), 'utf8');
  const template = Handlebars.compile(templateSrc);

  const logoPath = path.join(skillDir, 'resources', 'logo.png');
  const logoDataUri = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : null;

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });

  const slides = content.slides || [];
  if (slides.length < 1 || slides.length > 7) {
    console.warn(`Warning: ${slides.length} slides given, expected 1-7.`);
  }

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const kindClass = slide.kind || 'point';
    const html = template({
      kindClass,
      accent: content.accent || '#F97362',
      kicker: content.topic && slide.kind === 'title' ? content.topic : null,
      number: slide.number || null,
      heading: slide.heading || '',
      body: slide.body || null,
      subheading: slide.subheading || null,
      logo: logoDataUri,
      swipeHint: i < slides.length - 1 ? (SWIPE_HINTS[kindClass] || 'Swipe →') : '',
    });

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const outFile = path.join(outDir, `slide-${i + 1}.png`);
    await page.screenshot({ path: outFile });
    console.log(`Wrote ${outFile}`);
  }

  await browser.close();
  console.log(`Done: ${slides.length} slides in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
