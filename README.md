# Friends of Figma Adelaide: event ideas microsite

A four-question form that sits on top of the video's stickers, running live. Stickers fall in, then react to the mouse and can be tapped and thrown. Answers go to a Google Sheet.

It's a static site with no build step, so it can go on any host.

## Run it

```bash
python3 -m http.server 4174
```

Run that from this folder, then open http://localhost:4174. It's connected to the real Sheet, so anything you submit lands there, even from your own machine. To try it without saving, empty `sheetEndpoint` in `config.js`, and a note at the bottom will say answers aren't being saved.

## Change the wording

Every question, option and message is in `config.js`.

- **Options** show as chips that wrap. Add `layout: 'list'` to a question to stack them instead, which suits a scale or options with hints.
- **The Something else field** on the last question uses `rows: 4`, which sets the textarea's HTML `rows` attribute.
- **`sendErrors`** has one message each for being offline, a timeout, and any other failed save.
- **`motion`** holds the labels for the Pause and Play animation button.

Renaming an option doesn't need the Apps Script redeployed. It only changes what later rows say, so earlier rows keep the old wording.

## Change how the stickers feel

The settings are in `P` at the top of `scene.js`. They started from the video's Sensible preset, but they're heavier and softer on purpose, so the site and the video no longer match.

| Setting | What it does |
|---|---|
| `stickerScale`, `sizeVariance` | How big stickers are, as a share of the size set in `layout()`, and how much they vary |
| `gravity`, `heft` | How fast stickers fall, and how much they resist spinning |
| `bounce`, `holdDown` | How high a rebound goes, and how long a sticker stays down before it rebounds |
| `squish`, `bulge` | How far the hardest landing compresses a sticker, and how much more the middle swells than the ends |
| `wobbleHz`, `wobbleDamping` | How slow and how long the wobble is. Lower numbers are softer |
| `contactDrag`, `contactSpinDrag` | How quickly touching stickers calm down |
| `cursorPush` | How much speed a sticker picks up from the mouse |
| `grabSpeed`, `grabMax`, `throwKeep` | How a dragged sticker follows, and how much speed it keeps when let go |

The base size is set in `layout()`, and the number of stickers in `startingCount()`. The stickers that fall at the start are all there are: pressing buttons doesn't add more.

## Connect the Google Sheet

This is done. The site posts to the Apps Script project **FoF Adelaide event ideas**, which is attached to the **Friends of Figma Adelaide: event ideas** Sheet. These steps are here in case you ever need to connect a new Sheet.

The site can't write to a Sheet directly, so a small script in the Sheet receives the answers. It has to be set up from the Google account that owns the Sheet.

1. Open the Sheet and choose **Extensions → Apps Script**.
2. Delete what's in the editor, paste in everything from `sheets/Code.gs`, and save.
3. Choose **Deploy → New deployment**, click the gear icon and pick **Web app**.
4. Set **Execute as** to **Me** and **Who has access** to **Anyone**, then click **Deploy**.
5. Approve the permissions Google asks for, then copy the **Web app URL**. It ends in `/exec`.
6. Paste it into `sheetEndpoint` at the top of `config.js`.

Send a test answer and check that a row appears. If you change `Code.gs` later, use **Deploy → Manage deployments**, edit the deployment and choose **New version**, or the old code keeps running.

"Anyone" means anyone with the URL can send a row, which is what lets a public form work. The script can only reach this one Sheet (`@OnlyCurrentDoc`), and all it does with it is add rows. Nothing in it sends the Sheet's contents back to the web. It stores answers as plain text so they can't run as formulas, trims long answers, and ignores bots that fill in a hidden field.

A new Sheet defaults to US time, so set **File → Settings → Time zone** to Adelaide, or the timestamps will be wrong.

## Put it online

The site is on GitHub Pages, in the public repo `fof-adelaide/fof-adelaide.github.io`, at https://fof-adelaide.github.io/. Pages serves the default branch, so pushing updates the site. Every path is relative, and `.nojekyll` tells Pages to serve the files as they are.

**Only this folder goes in the repo.** The rest of the project holds font files, brand-guide material and photos of real people.

The Apps Script web app accepts requests from any site, so the Sheet connection works from Pages. Its URL has to be in `config.js` for the form to work, so it's public. See [Connect the Google Sheet](#connect-the-google-sheet) for what that allows.

## Fonts

The site uses Funnel Sans, self-hosted, under the SIL Open Font License in `fonts/OFL.txt`. It's the Regular weight of the full font from google/fonts, with its ascent lowered slightly so text sits centred in pills and tags. It has no arrow glyph, so the arrow on the buttons is an SVG. It also has no Vietnamese, so those letters in a name fall back to a system font.

Figma Sans isn't in this repo. The Adelaide label in the lockup is Figma Sans outlined into `assets/chapter-label.svg`, the same way the logotype is outlined art, so it's an image with `Adelaide` as its text alternative.

## How it fits together

| File | What it does |
|---|---|
| `config.js` | The Sheets URL and all the wording |
| `form.js` | The steps, validation, sending and thanks message |
| `scene.js` | The live physics, the soft sticker drawing and the confetti |
| `site.css` | Tokens that mirror the Figma file, then the layout |
| `sheets/Code.gs` | The script that saves answers to the Sheet |
| `data/`, `assets/`, `vendor/` | Generated from the same sources as the video, including the sunburst on the thanks card and the chapter badge favicon |
| `fonts/` | Funnel Sans and its licence |

The generators are in `tools/` in the project folder, which stays private: `build-microsite-assets.mjs`, `build-public-font.py` and `outline-chapter-label.py`. Run the first after changing the source art. It leaves out the heart sticker (`Shapes/55`) on purpose, and it never copies a font here.

## Motion and accessibility

The Pause animation button stops the stickers and remembers the choice for next time. People who ask their device to reduce motion get a still pile of stickers, no confetti and no button, because nothing moves. If the stickers fail to load, the form still works.

See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the WCAG 2.2 audit results and known limits.
