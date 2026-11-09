# Galactic Command — TARC Discord card game (V2)

This update replaces the old `/game` quiz hub with **Galactic Command**, a persistent Star Wars card collection and outpost simulator. It deliberately starts every player fresh. It does **not** erase or import the former quiz/game database, and all assistant, moderation, blacklist and Roblox HTTP services remain separate.

## First-time experience

1. `/game` → choose **Republic**, **CIS** or **Independent**. Each player is an independent commander and receives 5 starter cards, a combat squad and working production units. They can collect cards from *any* faction later.
2. Press **Roll Card** (300 Credits) or `/roll`, open crates under **Crates & Shop**, or claim the **Daily Pack**. There are 357 catalogued units with six rarity tiers and an image or faction-art portrait on the card embed.
3. Open **My Cards** to equip cards to your squad or assign them to production. Unassigned cards stay in reserve for trading, fusing or later use.
4. **Claim Income**, run **Missions**, fight the weekly boss, upgrade your base and research, raid other outposts and trade with consenting players.
5. Complete daily/weekly/monthly quests and compete for the weekly Command Points ranking. See `/rankings`.

`/game` shows just the three primary actions (Base, Cards, Roll), daily actions and a dropdown for everything else. Extended gameplay is through `/roll`, `/cards`, `/catalog`, `/raid @player`, `/boss`, `/duel @player [ranked]`, `/trade`, `/rankings` and `/guild`.

`/quiz` and `/quizleaderboard` remain as **optional** trivia games. Quiz correctness contributes small daily-capped Galactic Command rewards; the quiz is no longer the main progression loop.

## Economy and competitive rules

- Every roll draws a card; it is *not* a claim-or-lose roll. Credits are deducted first. Crates contain 3 cards with different rarity weights; the daily shop has a discount, and the first daily login grants a free pack.
- Rarities: Common (grey), Uncommon (green), Rare (blue), Epic (purple), Legendary (gold) and Mythical (pink/cyan).
- Card attacks, defences, passive income and abilities scale with upgrades. Outposts can be raised to level 30, and Luck/Assault/Fortify/Logistics research to level 10.
- Raids have a one-hour attacker cooldown, six-hour target cooldown and 24-hour protection for new players. Defenders never lose cards or Credits for being attacked. Duel invitations and trades require the recipient to accept; ranked rematches are limited per pair per day.
- Dynamic events rotate every four hours, active for one hour. Saturdays and Sundays UTC award double XP. There is a fresh co-operative boss each Monday.
- Daily, weekly and monthly quests rotate and give Credits, XP, Scrap and Command Points. Passively produced income is claimable for up to 12 hours accumulated time.
- Automatically announced random card drops run roughly every 40–85 minutes in the configured channel. People enter with a button; up to three randomized winners receive the card.
- Weekly leaderboard resets are Monday 00:00 UTC. Top three players with at least 25 CP automatically receive in-game Credits, XP and 1–3 elite card draws. The previous week's results appear in the configured drops channel. **Nitro, Robux or other physical/external prizes are NOT automatically purchased or delivered; ownership distributes them and records fulfilment manually.**
- Repetitive ranked opponents, daily quiz farming and same-target raid repeats have safeguards; these are not a substitute for moderator judgement when valuable external prizes are at stake.

## Ownership controls

`/gameadmin` is guild-only and verified against the configured Discord owner ID, the Discord server owner or the existing TARC Roblox rank-255 owner check.

| Command | Effect |
| --- | --- |
| `/gameadmin drops #channel` | Set the guild's auto card-drop and event channel; first drop after ~3 minutes. |
| `/gameadmin dropnow` | Trigger an extra card drop immediately, provided one is not already active. |
| `/gameadmin grantcard @player card_id [amount]` | Grant one to 20 cards listed by `/catalog search`. |
| `/gameadmin set @player stat value` | Set Credits, XP, Scrap, weekly CP or base level. Marks the player ineligible for this week's competitive prizes. |
| `/gameadmin reset @player RESET` | Reset **one player's V2 profile** to a fresh recruit; does not affect the old game save. |
| `/gameadmin fulfill @player` | Mark an automatically recorded external prize as delivered. |

Owner actions are audit-logged in the V2 save. Avoid changing competitive players' rankings mid-week if an external prize is on offer.

## Deployment / persistence

### Required: Railway volume

This game writes JSON transactionally to:

`$TARC_DATA_DIR/tarc-galactic-v2.json` (new card game)

`$TARC_DATA_DIR/tarc-quiz-v2.json` (separate new quiz progress)

The old save `tarc-game-state.json` is **never overwritten** by Galactic Command. To make progression survive Railway redeployments, mount a **persistent Railway Volume** and set `TARC_DATA_DIR` to its *absolute* mount path (example `/data`). If Railway still uses its ephemeral container filesystem, do **not** announce the game as persistent or give out real-world prizes until the volume is confirmed.

### Images and drop scheduling

- Bundled original faction illustrations are served at `/game-art/*.png` from the Express service. Named-character portrait URLs are attempted where provided; faction art remains available for the rest of the catalogue.
- Railway normally provides `RAILWAY_PUBLIC_DOMAIN` if a public domain exists. If not, set `GALACTIC_ART_BASE_URL=https://your-actual-railway-domain` (include `https://`) so Discord can load the fallback art.
- Optional `GALACTIC_DROP_CHANNEL_ID` seeds a default channel ID on the first run. The normal configuration is `/gameadmin drops #channel`; the saved channel persists in the volume.
- `GAME_OWNER_DISCORD_IDS` accepts comma-separated authorized Discord IDs; the existing group-owner verification continues to work.
- Railway must use just **one bot instance** with this JSON backend. Multiple instances would not share transaction locks. Back up the V2 file before migrations or changing the deployment.

`npm test` validates the catalog, core economy, anti-abuse limits, transactions, Discord command schemas and persistence. `npm run art` regenerates the seven bundled original PNG illustrations when developer dependencies are installed.

## Release guardrail

Keep major game changes on a feature branch until tests pass and the Railway volume configuration is verified. Pushing to the main Railway-connected branch may auto-deploy immediately. Test the bot's permissions (Embed Links, Send Messages, Read Message History) and the drop channel before announcing the new game.
