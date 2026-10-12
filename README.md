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

### Instagram posting

The script (`scripts/post-scheduled.js`) is built, but **untested** — I don't have
live Meta/Notion credentials to run it against. It needs these one-time setup steps,
all self-serve, no one else's account involved:

1. Make sure your Facebook Page is linked to an Instagram **Business** account
   (Page Settings → Instagram)
2. At business.facebook.com: create a Business Portfolio, add your Page and
   Instagram account to it (Business Settings → Accounts)
3. At developers.facebook.com/apps: create an app → use case "Manage messaging and
   content on Instagram" → link it to that Business Portfolio
4. Add permissions: `pages_show_list`, `business_management`, `instagram_basic`,
   `instagram_content_publish`, `pages_read_engagement`
5. In the Graph API Explorer (developers.facebook.com/tools/explorer): select the
   app + those permissions → Generate Access Token (as **User Token**)
6. Get IDs: call `/me/accounts` for your Page ID, then
   `/<page-id>?fields=connected_instagram_account` for the IG Business Account ID
7. **Extend the token**: developers.facebook.com/tools/debug/accesstoken → paste
   token → "Extend Access Token" → gives you a ~60-day token instead of ~1hr.
   Repeat every ~2 months, or whenever posting starts failing with an auth error.
8. Also get a free `IMAGE_HOST_API_KEY` at api.imgbb.com (needed because the Graph
   API fetches images from a URL you give it, not a direct upload)
9. Fill all of these into `.env`

### Scheduling

Not using Claude's own "Routines" feature for this — it ties the automation to
whichever Claude account is logged in, which caused real friction while setting this
up. Instead: Windows Task Scheduler runs
`node --env-file=.env .claude/skills/infographic-generator/scripts/post-scheduled.js`
once daily. It's a no-op (logs "nothing due today" and exits) unless a Notion entry
is both Approved and due, so it's safe to leave running even before everything above
is configured. Ask Claude to set up the scheduled task once you're ready to turn it
on — it's one `schtasks` command but worth confirming the time/cadence first.
