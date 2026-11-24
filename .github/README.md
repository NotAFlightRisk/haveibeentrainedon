<h1 align="center">Have I Been Trained On?</h1>
<p align="center">
<i>Check whether your writing is in the open AI training sets, by searching for your own sentences</i>
<br />
<img src="https://raw.githubusercontent.com/NotAFlightRisk/haveibeentrainedon/refs/heads/main/static/favicon.svg" width="48" />
<br />
<b>🌐 <a href="https://haveibeentrainedon.peng.ly/">haveibeentrainedon.peng.ly</a></b><br />
</p>

<details>
  <summary>Contents</summary>

- [About](#about)
- [Usage](#usage)
  - [How it works](#how-it-works)
  - [Deployment](#deployment)
  - [Configuration](#configuration)
  - [Development](#development)
- [Credits](#credits)

</details>

## About

Paste the address of something you wrote (or the text itself, for pages it can't fetch), and it looks for three of its sentences in the actual text of C4, the Pile, RedPajama, Dolma 1.7 and DCLM, plus January and July 2025's Common Crawls. Each set gets a straight answer (match, no match, or too new for it), along with which models it trained and whether the copies it found are on your own site or someone else's. Put in just a domain and it checks a sample of 4 posts from the site instead.

Other checkers read Common Crawl's index and guess from there. This searches the training text itself, using [infini-gram](https://infini-gram.io/).

---

## Usage

Just head to [haveibeentrainedon.peng.ly](https://haveibeentrainedon.peng.ly/) and paste a link. A fresh check takes about 40 seconds, and anything someone's checked before loads straight away. The rest of this is for running your own.

### How it works

It's one Cloudflare Worker: a SvelteKit site plus a Durable Object, over D1.

<details>

- The page is fetched once (10 seconds, 2 MB, HTML only), refusing private addresses and checking every redirect. The picker takes the text of paragraphs and article list items, skips quotes, code, comments, bios and the like, and falls back to `<br>` breaks for pages without paragraphs.
- It keeps three sentences of 70-220 characters and 12+ words, spread through the page, cut to 130 characters, with the first word dropped (infini-gram misses a phrase that opens a paragraph). Two spares come along in case one's stock text.
- Every sentence is counted in January 2025's crawl first. Over 200 copies there means stock text, so a spare takes its place. Then each set counts sentences 1 and 2, and only asks about 3 if they disagree. Two out of three is a match.
- A page with a full `datePublished` or `article:published_time` skips any set that stopped before it.
- Pasted text goes through the same picker, in the browser and on the Worker. Only the sentences' hashes and counts are saved, and the text itself leaves the line once it's counted.
- For C4, Dolma and DCLM matches it pulls up to 10 documents per sentence and groups them by site. RedPajama gets its slice named, and the Pile has no sources to give.
- All of that is one call at a time through the `Gate` Durable Object: one call per alarm, 2 seconds apart, paused for 2 minutes and then half speed for an hour if the API ever says slow down. The line refuses new checks past 10 minutes of work, and each IP gets 5 fresh checks an hour.
- Counts are cached in D1 per index and sentence, so a re-check (pages older than 30 days get one) only counts sentences that changed. The verdict logic is one pure function (`src/lib/plan.ts`) that both the Durable Object and the result page run.
- A miss can get a second look: three more of the page's sentences, by the same two-of-three rule, or the Wayback Machine's copy from around when that set was made.
- A bare domain reads the site's sitemaps (from `robots.txt`, then `/sitemap.xml`), or its feed, and samples 4 posts spread across them. Each gets a quick look in Dolma and DCLM, through the same line as one ticket, at 2 site checks per IP a day.
- For the crawls since July 2025, where there's no text to search, a second Durable Object (`Crawls`) asks Common Crawl's own URL index one crawl at a time, on request. New crawls turn up from its `collinfo.json` by themselves.
- `/health` says when each API last answered, and an hourly cron makes one canary call if nothing else has. A weekly Action looks for new infini-gram indexes, and retries the broken OLMo 3 ones.

</details>

### Deployment

You'll want a Cloudflare account on Workers Paid, which is what it runs on here. The free plan might cope, but 10ms of CPU a request is tight for fetching and reading a page, and I haven't tried it. Then fork the repo, and run:

```bash
# 1. Setup
npm install
npx wrangler d1 create haveibeentrainedon

# 2. Configure
# Pop the database id into wrangler.jsonc, and set your own domain in `routes`
vi wrangler.jsonc

# 3. Deploy
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

Or build from source: grab the code from the [latest release](https://github.com/NotAFlightRisk/haveibeentrainedon/releases/latest) (or clone it), then follow the steps above.

### Configuration

All optional. Settings go in `vars` in `wrangler.jsonc` (or `--var` on deploy), secrets with `npx wrangler secret put <name>`:

| Name                | Kind    | What it does                                                            |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| `GATE_MS`           | setting | Gap between calls to infini-gram, `2000` by default                     |
| `TURNSTILE_SITEKEY` | setting | Your [Turnstile](https://developers.cloudflare.com/turnstile/) site key |
| `TURNSTILE_SECRET`  | secret  | Its secret. Without one, there's no person check                        |
| `SENTRY_DSN`        | secret  | Sends server errors to Sentry or Bugsink                                |

For hit counting and browser errors, set `PUBLIC_PLAUSIBLE_SCRIPT` and `PUBLIC_SENTRY_DSN` when you build. Both are empty unless you set them, so nothing phones home.

### Development

You'll need [Node](https://nodejs.org/) 22.18 or newer. It's a [SvelteKit](https://svelte.dev/docs/kit) app that runs on [Wrangler](https://developers.cloudflare.com/workers/wrangler/) locally, Durable Object and all.

```bash
git clone git@github.com:NotAFlightRisk/haveibeentrainedon.git
cd haveibeentrainedon
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

It's then on [localhost:8787](http://localhost:8787), talking to the real infini-gram APIs, so go easy. The other scripts you'll want are `npm run check` (types), `npm test` and `npm run format`.

---

## Credits

All the counting is [infini-gram](https://arxiv.org/abs/2401.17377) and [infini-gram mini](https://arxiv.org/abs/2506.12229), by Jiacheng Liu, Hao Xu and colleagues at the University of Washington and Ai2, who run the search APIs for free.

##### Contributors

[![contributors badge](https://readme-contribs.as93.net/contributors/NotAFlightRisk/haveibeentrainedon?shape=squircle)](https://github.com/NotAFlightRisk/haveibeentrainedon/graphs/contributors)

---

<!-- License + Copyright -->
<p  align="center">
  <a href="https://github.com/NotAFlightRisk"><img width="64" src="https://pixelflare.cc/iain/gif/penguin-dance.gif" /></a><br>
  <sup>
    <i>Licensed under <a href="../LICENSE">MIT</a>, © <a href="https://peng.ly">NotAFlightRisk</a> 2026</i>
  </sup>
</p>

<!--
oooh, hello there! hope you're having a nice day :)
   |\__      |\___
 (:> __)X  (:o ___(
   |/        |/
-->
