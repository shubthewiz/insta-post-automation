#!/usr/bin/env node
// Checks the Notion content calendar for one due, approved post and publishes it to
// Instagram as a carousel via the Meta Graph API. Meant to run on a schedule (see
// README.md "Scheduling" section) -- one post per run, by design, same as the
// reference workflow this is based on.
//
// Flow: find due+approved Notion page -> re-read its local slide PNGs (Notion's own
// hosted copies expire) -> upload each to a public image host (Graph API requires a
// fetchable URL, not direct binary upload) -> create carousel media containers ->
// publish -> mark the Notion page "Posted".
//
// Required env vars (see .env.example): NOTION_TOKEN, IMAGE_HOST_API_KEY (imgbb.com,
// free, self-serve), IG_BUSINESS_ACCOUNT_ID, IG_ACCESS_TOKEN.
//
// Usage: node --env-file=.env post-scheduled.js

const fs = require('fs');
const path = require('path');

const NOTION_VERSION = '2025-09-03';
const NOTION_API = 'https://api.notion.com/v1';
// Bump this to whatever's current at developers.facebook.com when you set up the app.
const GRAPH_VERSION = 'v21.0';
const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function loadConfig() {
  const p = path.join(__dirname, '..', '.notion-config.json');
  if (!fs.existsSync(p)) {
    console.error('No .notion-config.json found -- run sync-to-notion.js for at least one post first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function notionFetch(pathname, options = {}) {
  const res = await fetch(`${NOTION_API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Notion API ${pathname} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function graphFetch(pathname, params) {
  const url = new URL(`${GRAPH_API}${pathname}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Graph API ${pathname} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function richText(prop) {
  return (prop?.rich_text || []).map((t) => t.plain_text || t.text?.content || '').join('');
}

async function findDuePost(dataSourceId) {
  const today = new Date().toISOString().slice(0, 10);
  // Multi-source databases (API version 2025-09-03+): pages are queried via the
  // data source, not the database itself -- see sync-to-notion.js for the same.
  const result = await notionFetch(`/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Status', select: { equals: 'Approved' } },
          { property: 'Scheduled Date', date: { on_or_before: today } },
        ],
      },
      sorts: [{ property: 'Scheduled Date', direction: 'ascending' }],
      page_size: 1,
    }),
  });
  return result.results[0] || null;
}

async function uploadToImageHost(filePath) {
  const apiKey = requireEnv('IMAGE_HOST_API_KEY');
  const base64 = fs.readFileSync(filePath).toString('base64');
  const body = new URLSearchParams({ key: apiKey, image: base64 });
  const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body });
  const json = await res.json();
  if (!json.success) throw new Error(`imgbb upload failed for ${filePath}: ${JSON.stringify(json)}`);
  return json.data.url;
}

async function publishCarousel(imageUrls, caption) {
  const igId = requireEnv('IG_BUSINESS_ACCOUNT_ID');
  const accessToken = requireEnv('IG_ACCESS_TOKEN');

  const itemIds = [];
  for (const imageUrl of imageUrls) {
    const item = await graphFetch(`/${igId}/media`, {
      image_url: imageUrl,
      is_carousel_item: true,
      access_token: accessToken,
    });
    itemIds.push(item.id);
  }

  const container = await graphFetch(`/${igId}/media`, {
    media_type: 'CAROUSEL',
    children: itemIds,
    caption,
    access_token: accessToken,
  });

  const published = await graphFetch(`/${igId}/media_publish`, {
    creation_id: container.id,
    access_token: accessToken,
  });

  return published.id;
}

async function main() {
  requireEnv('NOTION_TOKEN');
  const { dataSourceId } = loadConfig();

  console.log('Checking for a due, approved post...');
  const post = await findDuePost(dataSourceId);
  if (!post) {
    console.log('Nothing due today. Exiting.');
    return;
  }

  const topic = post.properties.Topic?.rich_text?.[0]?.plain_text || '(untitled)';
  const localPath = richText(post.properties['Local Path']);
  const caption = richText(post.properties.Caption);

  console.log(`Found due post: "${topic}" (${post.id})`);
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error(`Local Path "${localPath}" for this post doesn't exist on this machine -- can't post it.`);
  }

  const slideFiles = fs
    .readdirSync(localPath)
    .filter((f) => /^slide-\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
    .map((f) => path.join(localPath, f));

  if (slideFiles.length === 0) throw new Error(`No slide-N.png files found in ${localPath}.`);

  console.log(`Uploading ${slideFiles.length} slides to image host...`);
  const imageUrls = [];
  for (const f of slideFiles) {
    imageUrls.push(await uploadToImageHost(f));
    console.log(`  hosted ${path.basename(f)}`);
  }

  console.log('Publishing carousel to Instagram...');
  const mediaId = await publishCarousel(imageUrls, caption);
  console.log(`Published: media id ${mediaId}`);

  await notionFetch(`/pages/${post.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { Status: { select: { name: 'Posted' } } } }),
  });
  console.log('Marked Notion page as Posted.');
}

main().catch((err) => {
  console.error('FAILED:', err.message || err);
  process.exit(1);
});
