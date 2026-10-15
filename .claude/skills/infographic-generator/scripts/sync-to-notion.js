#!/usr/bin/env node
// Creates/updates the "Instagram content calendar" Notion database and adds a page
// for one generated carousel: properties + the slide images + caption as page content.
// Uses Notion's own REST API directly (an internal integration token) -- independent
// of Claude's own Connectors feature, so it doesn't depend on which Claude account
// is logged in anywhere.
//
// Setup (one-time, ~2 minutes, self-serve on notion.so, no one else needed):
//   1. https://www.notion.so/my-integrations -> New integration -> copy the token
//   2. In Notion, create (or pick) a page to hold the calendar -> Share -> invite
//      that integration -> copy the page's ID from its URL (the 32-char hex string)
//   3. Set env vars NOTION_TOKEN and NOTION_PARENT_PAGE_ID (e.g. in a .env file,
//      loaded by whatever runs this script)
//
// Usage: node sync-to-notion.js <path/to/output/<topic-slug>>

const fs = require('fs');
const path = require('path');

const NOTION_VERSION = '2025-09-03';
const API_BASE = 'https://api.notion.com/v1';
const CONFIG_PATH = path.join(__dirname, '..', '.notion-config.json');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    console.error('See the setup instructions at the top of sync-to-notion.js');
    process.exit(1);
  }
  return v;
}

async function notionFetch(pathname, options = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${pathname} -> ${res.status}: ${body}`);
  }
  return res.json();
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {};
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// As of Notion API version 2025-09-03, a "database" is just a container -- the
// actual property schema and the pages themselves belong to one of its "data
// sources" (multi-source databases). Page creation must target data_source_id,
// not database_id, and the property schema is set via initial_data_source on
// creation, not a top-level `properties` field (which is silently ignored).
async function ensureDatabase() {
  const cfg = loadConfig();
  if (cfg.dataSourceId) return cfg.dataSourceId;

  const parentPageId = requireEnv('NOTION_PARENT_PAGE_ID');
  console.log('No database configured yet -- creating "Instagram content calendar"...');

  const db = await notionFetch('/databases', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: 'Instagram content calendar' } }],
      initial_data_source: {
        properties: {
          Name: { title: {} },
          Status: {
            select: {
              options: [
                { name: 'Ready for Review', color: 'yellow' },
                { name: 'Approved', color: 'green' },
                { name: 'Posted', color: 'blue' },
                { name: 'Rejected', color: 'red' },
              ],
            },
          },
          'Scheduled Date': { date: {} },
          Topic: { rich_text: {} },
          'Slide Count': { number: {} },
          Caption: { rich_text: {} },
          // Notion's own hosted copies of uploaded images expire (signed URLs,
          // ~1hr) -- the posting script needs to re-read the original local
          // PNGs at post time, so it needs to know where they are.
          'Local Path': { rich_text: {} },
        },
      },
    }),
  });

  const dataSourceId = db.data_sources[0].id;
  cfg.databaseId = db.id;
  cfg.dataSourceId = dataSourceId;
  saveConfig(cfg);
  console.log(`Created database: ${db.id} (data source: ${dataSourceId})`);
  return dataSourceId;
}

// Three-step upload: create a file_upload object, PUT the bytes to its upload URL,
// then reference the file_upload id in a block.
async function uploadFile(filePath) {
  const filename = path.basename(filePath);
  const created = await notionFetch('/file_uploads', {
    method: 'POST',
    body: JSON.stringify({ filename, content_type: 'image/png' }),
  });

  // Notion's upload step wants multipart/form-data with the bytes under a "file"
  // field -- a raw binary POST (what this used to do) gets rejected with
  // "body.file should be defined".
  const bytes = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), filename);
  const uploadRes = await fetch(created.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
    },
    body: form,
  });
  if (!uploadRes.ok) {
    throw new Error(`File upload failed for ${filename}: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  return created.id;
}

async function main() {
  requireEnv('NOTION_TOKEN');
  const outDir = process.argv[2];
  if (!outDir || !fs.existsSync(outDir)) {
    console.error('Usage: node sync-to-notion.js <path/to/output/<topic-slug>>');
    process.exit(1);
  }

  const content = JSON.parse(fs.readFileSync(path.join(outDir, 'content.json'), 'utf8'));
  const caption = fs.existsSync(path.join(outDir, 'caption.txt'))
    ? fs.readFileSync(path.join(outDir, 'caption.txt'), 'utf8')
    : '';

  const slideFiles = fs
    .readdirSync(outDir)
    .filter((f) => /^slide-\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
    .map((f) => path.join(outDir, f));

  if (slideFiles.length === 0) {
    console.error(`No slide-N.png files found in ${outDir} -- run render-carousel.js first.`);
    process.exit(1);
  }

  const dataSourceId = await ensureDatabase();

  console.log(`Uploading ${slideFiles.length} slides...`);
  const fileUploadIds = [];
  for (const f of slideFiles) {
    fileUploadIds.push(await uploadFile(f));
    console.log(`  uploaded ${path.basename(f)}`);
  }

  console.log('Creating Notion page...');
  const page = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { data_source_id: dataSourceId },
      properties: {
        Name: { title: [{ text: { content: content.topic } }] },
        Status: { select: { name: 'Ready for Review' } },
        Topic: { rich_text: [{ text: { content: content.topic } }] },
        'Slide Count': { number: slideFiles.length },
        Caption: { rich_text: [{ text: { content: caption.slice(0, 2000) } }] },
        'Local Path': { rich_text: [{ text: { content: path.resolve(outDir) } }] },
      },
      children: fileUploadIds.map((id) => ({
        object: 'block',
        type: 'image',
        image: { type: 'file_upload', file_upload: { id } },
      })),
    }),
  });

  console.log(`Done: ${page.url}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
