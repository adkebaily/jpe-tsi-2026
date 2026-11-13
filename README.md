# JPE TSI 2026 landing page

Landing page for the Journée du Premier Emploi (Master TSI, ULCO Calais, 20 November 2026), opened by scanning a QR code. Visitors read the programme, see the photos, read reviews and leave their own: one rating out of 5 stars and a comment (name and profile are optional). Reviews are stored on Netlify and only appear after someone on the team approves them. The page works from the QR code and from its normal address, and shows its own QR code in the "Partagez la page" block.

- Site: Astro (static), plain CSS, TypeScript. No tracking, no cookies.
- Reviews and visit counter: three Netlify Functions + Netlify Blobs. No external database, account or API key.

## Try it on your PC

```bash
npm install
npm run local        # builds, then serves http://localhost:8888
```

`npm run local` runs the whole site, including the review form and the admin page, with reviews kept in memory (they vanish when you stop it). Local admin password: `jpe-local-test`.

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

1. On Netlify: **Add new project → Import an existing project**, pick this repo. Build settings come from `netlify.toml`, nothing to fill in. Leave "Base directory" empty: the project is at the root of the repo.
2. **Project configuration → Environment variables**: add `ADMIN_TOKEN`, the password for `/admin/`. It must be at least 12 characters, otherwise the admin page refuses to open. Generate one with `openssl rand -base64 24`. Never put it in the code or in this repo, which is public.
3. Trigger a deploy (the variable is read at deploy time).
4. Rename the site to something readable (**Project configuration → Change project name**), for example `jpe-tsi-2026`.
5. Generate the QR code for your real address:

```bash
npm run qr -- https://your-site.netlify.app
```

It writes `qr-jpe-tsi-2026.png` and `.svg`, pointing to `https://your-site.netlify.app/?src=qr`.

## Sharing and measuring

The page is public and can be found by search engines. `/admin/` and `/api/` stay hidden from them.

Add `?src=` to the link you share so the visit counter knows where people come from:

| Where you share | Link |
| --- | --- |
| Printed QR code | `https://your-site.netlify.app/?src=qr` (also plays the welcome animation) |
| LinkedIn | `https://your-site.netlify.app/?src=linkedin` |
| E-mail | `https://your-site.netlify.app/?src=email` |
| WhatsApp / Discord | `https://your-site.netlify.app/?src=whatsapp` |
| Posters, slides | `https://your-site.netlify.app/?src=affiche` |

Visits per channel and per day are at the bottom of `/admin/`. One visit is one opening of the page per browser session. There are no cookies and nothing is stored about visitors.

Links shared on LinkedIn, WhatsApp or by e-mail show a preview image, `public/og.png`. Replace that file (1200 × 630 px) to change it. LinkedIn caches previews: after a change, refresh it with LinkedIn's Post Inspector.

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
- Data kept per review: rating, comment, date, and the name and profile if the visitor gave them. The IP address is only used for the daily limit and is stored hashed.

## Security

- **No secrets in the repo.** The only secret is `ADMIN_TOKEN`, set in Netlify. The site calls no third-party API and needs no API key.
- **Admin access.** Password sent as a header on each request, compared in constant time, 12 characters minimum. After 20 wrong attempts in an hour from one network, that network is blocked for the rest of the hour. If that happens to you on the campus Wi-Fi, switch to mobile data.
- **Reviews.** Validated on the server, length-limited, held until approved, and always rendered as plain text, so HTML or scripts typed into a review are never executed. A hidden trap field catches basic bots. Only JSON is accepted, which blocks forms posted from other sites.
- **Limits.** 150 reviews per network per day and 1000 in total. The per-network limits are deliberately wide because everyone in the room shares the campus Wi-Fi address.
- **Browser protections** (`netlify.toml`): a Content-Security-Policy that only allows scripts, fonts and requests from the site itself, no framing by other sites, HTTPS enforced.
- **Privacy.** IP addresses are never stored. Rate limits use a fingerprint that changes every day.

What this does not protect against: someone determined, using many networks, can still flood the review queue or inflate the visit counter. Reviews never appear without approval, so the worst case is extra work in `/admin/`.

## Tests

```bash
npm test
```

19 tests: the review logic, and the two real Netlify functions running against a local Netlify Blobs server.

## Things to know

- The team roles for Melissa Sadallah and Amirouche Meziani are listed as "Organisation générale" because their exact mission was not known. Fix it in `event.json`.
- The page shows the contact address `jpe.tsi.2026@gmail.com` in the footer. Remove `contactEmail` usage in `src/pages/index.astro` if you would rather not display it.
- Coral buttons use navy text, because white on `#FF6B4A` is too low-contrast to read comfortably.
