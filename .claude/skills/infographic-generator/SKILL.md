---
name: infographic-generator
description: Generates a branded Instagram carousel (3-7 slides) as PNG images plus a ready-to-post caption, for a given topic. Renders slides from HTML/CSS (free, no image-gen API cost) via a headless browser.
---

# Infographic Generator

Given a topic, produce a finished Instagram carousel: 3 to 7 square (1080x1080) slide
images plus a caption file, saved to `output/<topic-slug>/`.

## Steps

1. **Pick the slide count and content.** Read the topic the user gave you. Break it into
   3-7 punchy slides (never more than 7 — if the topic has more points than that, pick
   the strongest ones rather than cramming). Slide 1 is always a hook/title slide. Each
   following slide is one idea: a short `heading` (max ~6 words) and a `body` (1-2 short
   sentences or a few bullet-style lines, max ~220 characters). The last slide should be
   a call-to-action (e.g. "Swipe up" / "DM us" / "Link in bio" — adapt to the topic).

2. **Write the content file.** Create `output/<topic-slug>/content.json` (slugify the
   topic: lowercase, spaces to hyphens) with this exact shape:
   ```json
   {
     "topic": "<original topic text>",
     "accent": "#F97362",
     "slides": [
       { "kind": "title", "heading": "...", "subheading": "..." },
       { "kind": "point", "number": "01", "heading": "...", "body": "..." },
       { "kind": "cta", "heading": "...", "body": "..." }
     ]
   }
   ```
   - First slide: `"kind": "title"` (uses `heading` + `subheading`, no number).
   - Middle slides: `"kind": "point"` with a 2-digit `number` string ("01", "02", ...).
   - Last slide: `"kind": "cta"`.
   - `accent` is a hex color for this carousel's highlight color — vary it between runs
     (e.g. alternate between a warm orange `#F97362`, blue `#4F6DF5`, green `#2FB380`)
     so a feed of multiple posts doesn't look identical.

3. **Render the slides.** Run:
   ```
   node .claude/skills/infographic-generator/scripts/render-carousel.js output/<topic-slug>/content.json
   ```
   This reads the content file and writes `slide-1.png` ... `slide-N.png` into the same
   `output/<topic-slug>/` folder, using `resources/template.html` as the layout and
   `resources/logo.png` as the logo (if present — it's fine if missing, the template
   just skips it).

4. **Write the caption.** Create `output/<topic-slug>/caption.txt`: a scroll-stopping
   first line, 2-4 short sentences expanding on the topic, then a blank line and 8-15
   relevant hashtags (mix of broad travel tags and specific/niche ones). Keep the whole
   thing under ~1500 characters (Instagram's limit is 2200, leave headroom).

5. **Report back** the output folder path and list the generated files. Do not claim the
   images look good without the user confirming — tell them where to look.

## Iterating on the template/design

If the user says slides look wrong (text too small, overflow, bad contrast, etc.), fix
`resources/template.html` directly (it's plain HTML/CSS, inline styles, no build step)
rather than just regenerating — the fix should stick for future runs, not just this one.

## Requirements

`node_modules/puppeteer` must be installed in this project root (`npm install` was run
when this skill was set up). If rendering fails with a Puppeteer/Chromium error, run
`npm install` in the project root first.
