# Insta Post Automation

Claude-driven Instagram carousel generation + posting pipeline for eeztour.

## How it works

1. **Generate** — `/infographic-generator <topic>` (a Claude Code skill) produces a
   3-7 slide carousel as PNGs + a caption, rendered from HTML/CSS via headless Chrome
   (free, no image-gen API). See `.claude/skills/infographic-generator/`.
2. **Review** — if Notion is configured, each generated post lands in a Notion database
   with Status = "Ready for Review" so nothing posts without a human approving it.
3. **Post** — (not built yet) a scheduled job publishes approved, due posts to
   Instagram via the Graph API.

## Setup

### Content generation (works right now, no setup needed)
Just run `/infographic-generator <topic>` inside Claude Code in this folder.

### Notion review calendar (optional, ~2 minutes, self-serve)
1. Go to https://www.notion.so/my-integrations -> New integration -> copy the token
2. In Notion, create (or pick) a page to hold the calendar -> Share -> invite that
   integration -> copy the page's ID from its URL (the 32-char hex string after the
   last `-` in the URL)
3. Copy `.env.example` to `.env` and fill in `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID`

### Instagram posting (not built yet)
Needs a Meta Developer app + Business verification (`IG_BUSINESS_ACCOUNT_ID` /
`IG_ACCESS_TOKEN` in `.env` — see `.env.example`), then a scheduled job that checks
Notion for Status = Approved + due posts and publishes them via the Graph API.
