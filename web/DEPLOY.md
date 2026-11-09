
# Galactic Command on Cloudflare Pages

The browser interface uses the V2 Galactic Command module inside the existing Railway bot process. Cloudflare Pages serves the interface and forwards its same-origin API requests to Railway. The proxy has no game save, session database, or independent economy.

## Before deployment

1. Confirm the Railway service starts `node server.js` from this repository and uses exactly one replica. The in-process transaction queue is shared by Discord and the web API.
2. Verify the existing persistent volume. If `TARC_DATA_DIR` is set, it must point to that volume. Otherwise the game uses `RAILWAY_VOLUME_MOUNT_PATH`. Back up the existing `tarc-galactic-v2.json` file before deployment. Preserve the path and file. The optional web receipts and trade history can be read alongside existing V2 data without rewriting old card IDs or balances.
3. Run `npm ci` and `npm test` from the repository root. Use a staging service with its own Discord application and separate volume to validate real OAuth and deployments before connecting production players. A staging test must use test profiles and must never share the production save path.

To run the isolated browser smoke test, install root dependencies, then run `npm ci`, `npx playwright install chromium --only-shell`, and `npm test` from `web/qa`. The test substitutes Discord's OAuth responses and uses a temporary V2 save. Set `GALACTIC_QA_SCREENSHOTS` to an existing directory to save desktop and mobile captures.

## Create the Pages project

In **Cloudflare → Workers & Pages → Create → Pages → Connect to Git**, select `pawpval/tarc-profile-bot`. Choose a project name and note the assigned HTTPS `pages.dev` origin. Set the production branch to the Railway release branch after review. For a separate staging Pages project, select the feature branch and use its own Railway origin and Discord OAuth application.

| Build setting | Value |
| --- | --- |
| Framework preset | None |
| Root directory | `web` |
| Build command | Leave blank |
| Build output directory | `public` |

The checked-in `public/_worker.js` is the Pages advanced-mode function. Only `/api/galactic` requests invoke it. Set these bindings in **Pages → project → Settings → Variables and Secrets** in the deployment environment being used, then deploy again.

| Cloudflare binding | Value |
| --- | --- |
| `GALACTIC_WEB_ORIGIN` | The exact Pages HTTPS origin, such as `https://your-project.pages.dev`, without a trailing slash |
| `GALACTIC_RAILWAY_ORIGIN` | The existing Railway service's public HTTPS origin, without a trailing slash |
| `GALACTIC_WEB_PROXY_KEY` | An encrypted secret shared only with the Railway service |

Generate the proxy key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Enter it directly into the two service dashboards. Leave preview API bindings empty unless that exact preview origin is explicitly paired with its own test Railway service and OAuth redirect.

## Configure Discord OAuth2 and Railway

In the Discord Developer Portal, open the application, then **OAuth2 → Redirects**. Add the exact URL `https://your-project.pages.dev/api/galactic/auth/callback`. Copy the OAuth2 client ID and client secret into Railway Variables. The bot token and existing deployment variables stay in Railway. The site requests the Discord `identify` scope.

| Railway variable | Value |
| --- | --- |
| `GALACTIC_WEB_ORIGIN` | The same exact HTTPS Pages origin |
| `GALACTIC_WEB_PROXY_KEY` | The same encrypted Pages proxy secret |
| `GALACTIC_DISCORD_CLIENT_ID` | Discord OAuth2 application client ID |
| `GALACTIC_DISCORD_CLIENT_SECRET` | Discord OAuth2 application client secret |

Deploy the reviewed branch to the existing Railway service after the backup. The web API is disabled until these values are configured. Pages forwards the OAuth redirect and secure first-party cookies. Browser requests use the Pages origin. Railway accepts API requests only through the authenticated proxy. The Discord user ID comes from Discord's server-side identity response. Sessions expire after 12 hours and are cleared when the process restarts. Web command retries can recover their original saved result for 15 minutes.

## Release verification

- Confirm `/health` on Railway returns success and the Discord bot responds to `/game`.
- Open the Pages URL, sign in with a Discord test account, and verify that the collection and balances match Discord.
- Roll on Discord, then use **Sync** in the browser. Upgrade a card in the browser and inspect the same card in Discord.
- Exercise a crate, mission, raid restrictions, trade and duel with consenting test accounts. Verify cooldowns, insufficient Credits, logout and reconnect after a reload.
- Confirm a direct Railway API call without proxy credentials returns 403. Verify a sign-in attempt on a different Pages origin fails closed.
- Check the original and new portrait URLs in the release environment. Community drops are claimed in the configured Discord channel. Website offers are visible in the browser inbox, including eligible offers created from Discord. Website offers do not send Discord pings.

## Artwork and audio

The browser uses the existing catalogue's external image URLs and shows a portrait-unavailable state when a host fails. Older catalogue entries may use a representative unit image. Confirm character accuracy and applicable permissions for each asset before public release. The site bundles only original interface insignia, orbital graphics and synthesized Web Audio cues. New catalogue entries link to the official Databank portraits for [Admiral Coburn](https://www.starwars.com/databank/admiral-coburn), [Mar Tuuk](https://www.starwars.com/databank/mar-tuuk), and [Sugi](https://www.starwars.com/databank/sugi).

The updated Databank links cover [Waxer](https://www.starwars.com/databank/waxer), [Purge Troopers](https://www.starwars.com/databank/purge-troopers), [Hyena Bomber Droid](https://www.starwars.com/databank/hyena-bomber-droid), [Jedi Temple Guard](https://www.starwars.com/databank/jedi-temple-guard), [Droideka](https://www.starwars.com/databank/droideka), and [Commando Droid](https://www.starwars.com/databank/commando-droid). The TARC 552nd uses the [Databank still of Doom's unit at Ringo Vinda](https://www.starwars.com/databank/clone-troopers) to represent its parent unit. The [91st](https://www.nexusmods.com/starwarsbattlefront22017/mods/10370?tab=images) and [104th](https://www.moddb.com/mods/battlefront-the-clone-wars/images/104th-battalion-the-wolfpack3) links are mod screenshots. [Delta Boss](https://galacticfigures.com/figureDetails.aspx?id=841) uses a photo of the character's figure, and the [Droid Tri-fighter](https://twitter.com/TheSpaceshipper/status/1641581695861178370) uses an externally hosted film still.

## Platform documentation

[Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) · [Pages Functions](https://developers.cloudflare.com/pages/functions/get-started/) · [Railway volumes](https://docs.railway.com/volumes) · [Discord OAuth2](https://discord.com/developers/docs/topics/oauth2)
