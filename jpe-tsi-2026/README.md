# JPE TSI 2026 landing page

Landing page for the Journée du Premier Emploi (Master TSI, ULCO Calais, 20 November 2026), opened by scanning a QR code. Visitors read the programme, see the photos, read reviews and leave their own: one rating out of 5 stars and a comment (name and profile are optional). Reviews are stored on Netlify and only appear after someone on the team approves them. The page works from the QR code and from its normal address, and shows its own QR code in the "Partagez la page" block.

- Site: Astro (static), plain CSS, TypeScript. No tracking, no cookies.
- Reviews: two Netlify Functions + Netlify Blobs. No external database or account.

## Try it on your PC

```bash
npm install
npm run local        # builds, then serves http://localhost:8888
```

`npm run local` runs the whole site, including the review form and the admin page, with reviews kept in memory (they vanish when you stop it). Local admin password: `test`.

Useful test addresses:

| Address | What it shows |
| --- | --- |
| `/?src=qr` | The welcome animation people get after scanning (once per browser session) |
| `/?now=2026-11-20T14:00` | The page during the event: live programme, form open |
| `/?now=2026-11-21T10:00` | The page after the event |
| `/?demo=1` | Example reviews, to check the layout before you have real ones |
| `/admin/` | Review approval |

Before 20 November 9h00 (Paris time) the form is closed, so use `?now=` to test it.

`npm run dev` gives live reload while you edit, but without the reviews API.

## Deploy on Netlify

1. Push this folder to a GitHub repository.
2. On Netlify: **Add new site → Import an existing project**, pick the repo. Build settings come from `netlify.toml`, nothing to fill in.
3. **Site configuration → Environment variables**: add `ADMIN_TOKEN` with a long password of your choice. This is the password for `/admin/`. Share it only with the people who approve reviews.
4. Trigger a deploy (the variable is read at deploy time).
5. Generate the QR code for your real address:

```bash
npm run qr -- https://your-site.netlify.app
```

It writes `qr-jpe-tsi-2026.png` and `.svg`, pointing to `https://your-site.netlify.app/?src=qr`.

## Approving reviews

Open `https://your-site.netlify.app/admin/`, enter the `ADMIN_TOKEN` password. New reviews are under "À valider". "Publier" puts a review on the page, "Refuser" hides it, "Supprimer" erases it. The public page picks up the change within about 30 seconds.

## Changing the content

| What | Where |
| --- | --- |
| Texts, programme, team, date, contact email | `src/data/event.json` |
| Cover photo behind the title | Drop one image into `src/assets/hero/`. Without one, the hero shows the animated signal. |
| Gallery photos | Drop `.jpg`/`.png`/`.webp` files into `src/assets/galerie/`. They are resized and converted automatically, sorted by file name. |
| Photo descriptions (for screen readers) | `src/data/galerie.json`, as `"file-name.jpg": "description"` |
| Colours, fonts, spacing | The variables at the top of `src/styles/global.css` |
| Calendar file | `public/jpe-tsi-2026.ics` |

Commit and push: Netlify rebuilds on its own.

## How the reviews work

```
form  ──POST /api/reviews──▶  stored as "pending"
admin ──POST /api/admin/reviews {approve}──▶  status "approved", public list rebuilt
page  ──GET  /api/reviews──▶  approved reviews + average ratings
```

- Code: `netlify/lib/reviews-core.mjs` (logic), `netlify/functions/` (the two HTTP endpoints).
- Protection: server-side validation, a hidden trap field for bots, 5 submissions per device per day, 1000 reviews maximum, all visitor text rendered as plain text.
- Data kept per review: rating, comment, date, and the name and profile if the visitor gave them. The IP address is only used for the daily limit and is stored hashed.

## Tests

```bash
npm test
```

13 tests: the review logic, and the two real Netlify functions running against a local Netlify Blobs server.

## Things to know

- **"QR code only" is not real access control.** The page is hidden from search engines (`noindex`, `robots.txt`) but anyone who has the link can open it.
- The team roles for Melissa Sadallah and Amirouche Meziani are listed as "Organisation générale" because their exact mission was not known. Fix it in `event.json`.
- The page shows the contact address `jpe.tsi.2026@gmail.com` in the footer. Remove `contactEmail` usage in `src/pages/index.astro` if you would rather not display it.
- Coral buttons use navy text, because white on `#FF6B4A` is too low-contrast to read comfortably.
