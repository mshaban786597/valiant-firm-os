# Page speed fix plan

Measured 2026-11-17 with Google PageSpeed (mobile lab test: simulated mid-range phone, slow 4G).
Source for every number below: `scripts/speed-diagnose.ts`, which reads Google's report and the
page's own HTML.

**Read this first**

- Lab numbers move between runs. bigbendservices.us measured LCP 3.0s, 8.9s, 9.7s and 24.6s in
  four runs on the same day. Judge a fix by several runs, not one.
- File paths are the files the browser downloads (for example `/assets/css/site.css`). The
  template that includes them lives in each site's own code, which was not inspected.
- "Est. saving" figures are Google's estimates and are only quoted where Google gave one.
- Nothing here has been applied. These are proposals.

Re-measure any site after a change:

```bash
npx tsx --env-file=.env scripts/speed-diagnose.ts https://example.com
```

The Monitoring page ("Page speed and why") shows the latest stored result for every site.

---

## The same three problems appear on every slow site

| Problem | Seen on | Size | Fix |
|---|---|---|---|
| **Cloudflare Turnstile loads on page open** (`/cdn-cgi/challenge-platform/...`, same site key on three sites) | Water Treatment Co, Big Bend Services, Valiant Firm | about 1.8 MB per widget; Big Bend Services loads two (about 3.5 MB of a 4.4 MB page) | Load Turnstile only when the visitor reaches or focuses the form: add `?render=explicit` to the script URL and call `turnstile.render()` from an `IntersectionObserver` or the first `focusin` on the form. |
| **Google tag loaded twice** | Big Bend Services (same ID `G-50XZH865JH` loaded directly and again through GTM), Valiant Firm (`GT-NM8CX83G` twice and `GTM-KCD5Z5B9` twice), Water Treatment Co (two different IDs) | 178 to 196 KB each | Keep one loader. If Google Tag Manager is installed, remove the separate `gtag.js` snippet and configure GA inside GTM. Loading the same ID twice can also double-count page views, so check the GA reports. |
| **Render-blocking CSS and Google Fonts** | all four | 300 to 1,000 ms each | Inline the small amount of CSS the top of the page needs, load the rest with `media="print" onload="this.media='all'"`, and self-host the two font files with `font-display: swap` plus a `preload`. |

Fixing Turnstile and the duplicate tag first is the cheapest large win: it removes most of the
page weight without touching design.

---

## 1. Water Treatment Co — watertreatmentco.com

Score 61 to 63 · LCP 15.1 to 15.6s · page weight 3.7 MB · PHP site on Hostinger.

**Why it is slow.** The largest element is the hero background video
(`<video class="hero-bg" autoplay muted loop preload="auto" poster="/assets/video/home-hero-steam-poster.jpg">`).
On a slow connection the page is not counted as loaded until that video paints. Its file
(`home-hero-steam-1920.mp4`, 996 KB) is requested immediately, has no cache lifetime, and competes
with 1.8 MB of Turnstile and two Google tags.

| # | Fix | Where | Effect |
|---|---|---|---|
| 1 | Make the poster image the first thing painted: put a real `<img>` of the poster in the hero with `fetchpriority="high"`, and add `<link rel="preload" as="image" href="/assets/video/home-hero-steam-poster.jpg" fetchpriority="high">` in `<head>`. | hero section of the home template | Google's check "fetchpriority=high should be applied" is currently failing |
| 2 | Stop the video competing with first paint: change `preload="auto"` to `preload="none"`, drop `autoplay` from the markup, and start it from script after the `load` event. On phones (`max-width: 768px`) show only the poster. | same `<video>` tag + a few lines of script | removes about 1 MB from the critical path on mobile |
| 3 | Lazy-load Turnstile (see table above). | form include | about 1.8 MB off page open |
| 4 | Cache the video and assets for a year: `Cache-Control: public, max-age=31536000, immutable` for `/assets/video/*` and `/assets/img/*`. | `.htaccess` or Hostinger cache rules | Google est. 1,221 KB saved on repeat visits |
| 5 | One Google tag instead of two (`G-40E8T1VNBY` and `G-VHHFJKG486`). If both properties are needed, load `gtag.js` once and call `gtag('config', …)` twice. | analytics include | 146 KB unused JavaScript |
| 6 | Resize four images that are served larger than displayed (`water-treatment-system-installation-960.webp`, `farmhouse-island-1200.webp`, `dog-water-bowl-1200.webp`, `walkin-shower-1200.webp`). | `/assets/img/global/` + `srcset` | Google est. 141 KB |
| 7 | `site.css`: 18 of 24 KB is unused on the home page and it blocks rendering (820 ms). Inline the critical part, defer the rest. | `/assets/css/site.css` | Google est. 150 ms |

---

## 2. Big Bend Services — bigbendservices.us

Score 65 to 68 · LCP 8.9 to 24.6s (very unstable) · page weight 4.4 MB · PHP site on Hostinger.

**Why it is slow.** The hero image is already set up correctly (`fetchpriority="high"`,
`loading="eager"`, found in the first HTML). The problem is everything loading next to it: two
Turnstile widgets (about 3.5 MB), Google tag loaded twice plus GTM (469 KB). On a slow connection
the hero image waits behind them, which is also why the result swings so much between runs.

| # | Fix | Where | Effect |
|---|---|---|---|
| 1 | Lazy-load Turnstile, and load it once for both forms. | form include(s) | about 3.5 MB off page open; the largest single change on any site |
| 2 | Remove the duplicate Google tag: `G-50XZH865JH` is loaded directly and again by `GTM-TXKKCD8X`. Keep GTM only. | analytics include | Google est. 269 KB, about 1.9s |
| 3 | Resize six review images served larger than shown (`gt-ai-pines-ranch-guards-768.avif`, `gd-ai-gray-door-768.avif`, `gt-ai-farmhouse-black-768.avif`, `gt-ai-copper-white-brick-768.avif`, `bd-ai-farmhouse-768.avif`, `gd-ai-farmhouse-carriage-768.avif`). | `/assets/img/review/hd/` + `srcset` | Google est. 146 KB |
| 4 | `site.css`: 10 of 13 KB unused on the home page, blocks rendering (295 ms). Inline critical CSS. | `/assets/site.css` | small |
| 5 | Raise image cache lifetime from 7 days to 1 year (files are already versioned). | cache rules | repeat visits |

---

## 3. Precious Pups — preciouspups.net

Score 72 to 77 · LCP 5.4 to 5.5s · page weight 471 KB (already light) · PHP site on Hostinger.

**Why it is slow.** The page is small and the hero image is prioritised correctly. The delay is
before the image can paint: three render-blocking files must finish first (`site.css` 497 ms,
`v2.css` 736 ms, Google Fonts 751 ms), and 71% of the hero's time is render delay.

| # | Fix | Where | Effect |
|---|---|---|---|
| 1 | Merge `site.css` and `v2.css` into one file, inline the CSS needed for the header and hero, defer the rest. | `/assets/css/` + `<head>` | Google est. 480 ms |
| 2 | Self-host Hanken Grotesk and Karla (two `.woff2` files, 67 KB) with `font-display: swap` and `preload`, instead of the blocking Google Fonts stylesheet. | `<head>` + `/assets/fonts/` | removes a 751 ms blocking request |
| 3 | Check the hero for an entrance animation or a class that starts it hidden (one reveal-style class was found in the HTML). The hero should be visible without waiting for script. | hero markup / CSS | addresses the 71% render delay |
| 4 | Load Google tag after the page is interactive (`requestIdleCallback` or after `load`). | analytics include | 73 KB unused JavaScript |
| 5 | Logo `logo-a2-v2.png` is 14 KB for a small image: export as SVG or a smaller WebP. | `/assets/brand/` | 11 KB |

---

## 4. Valiant Firm — valiantfirm.com

Score 54 to 75 · LCP 4.5 to 4.7s · page weight 3.7 MB · WordPress + Elementor + ElementsKit on Hostinger.

**Why it is slow.** The hero image starts loading late (55% of its time is "resource load
delay"). It sits behind 43 stylesheets, jQuery, several icon fonts and five tracking scripts, and
there is no `preload` for it.

| # | Fix | Where | Effect |
|---|---|---|---|
| 1 | Preload the hero image `/wp-content/uploads/2025/04/valiant-firm.jpg.webp` with `fetchpriority="high"`. | theme `<head>` (or a performance plugin's "preload critical image") | attacks the 55% load delay directly |
| 2 | Remove render-blocking files: `valiantfont-1/style.css` (1,005 ms), `jquery.min.js` (707 ms), `ekiticons.css` (472 ms), `jquery-migrate.min.js`, `nav-menu.css`, `valiantfont/style.css`. Defer jQuery, load icon CSS non-blocking. | performance plugin (delay/defer JS, optimise CSS delivery) | Google est. 2,590 ms |
| 3 | Tracking: `GT-NM8CX83G` and `GTM-KCD5Z5B9` each load twice; plus Facebook pixel (286 KB), Google sign-in (`gsi/client`, 100 KB) and Clarity. Keep one GTM container, fire the rest from it after interaction. Remove Google sign-in from pages that have no sign-in button. | header/footer scripts, GTM | Google est. 527 KB unused JavaScript |
| 4 | Lazy-load Turnstile. | form widget | about 1.8 MB |
| 5 | Icon fonts: `themify.woff` (390 ms), two copies of `valiantfont`, and the 252 KB ElementsKit icon font. Add `font-display: swap`, remove the duplicate `valiantfont` set, and disable icon packs that are not used. | Elementor > Custom Icons, ElementsKit modules | Google est. 390 ms |
| 6 | 43 stylesheets: enable Elementor's "Improved CSS Loading" and "Improved Asset Loading", and turn off unused ElementsKit widgets (`common.css` is 100% unused on the home page). | Elementor > Settings > Performance | fewer requests |

---

## Sites that passed but could be faster

Not diagnosed file by file yet. From the stored check results:

| Site | Score | LCP | Main note |
|---|---|---|---|
| bigbendgutters.com | 84 to 87 | 3.0s | Hero text block shown late (90% render delay); 73 KB unused JavaScript |
| insulationcompany.net | 82 to 83 | 3.2s | Hero text shown late (99% render delay); render-blocking request (150 ms) |
| jemwindows.com | 86 to 87 | 2.9s | 147 KB unused JavaScript, which is the size of two Google tag loads |
| newvisiongutters.com | 91 to 92 | 3.1s | Elementor; render-blocking requests (Google est. 2,310 ms); 49 KB unused CSS |

Run `speed-diagnose` on each for the file-level list. The three common fixes above are likely to
apply to the PHP sites as well, since they share the same build.

## Suggested order

1. Turnstile lazy-load on Water Treatment Co, Big Bend Services, Valiant Firm (same change three times).
2. One Google tag per site.
3. Water Treatment Co hero video (poster first, video after load).
4. Valiant Firm: hero preload + defer jQuery and icon CSS.
5. Precious Pups: merge and inline CSS, self-host fonts.
6. Cache headers and image resizing everywhere.
