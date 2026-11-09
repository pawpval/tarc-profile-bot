# Galactic Command — TARC Discord card game (V2)

Galactic Command is a Star Wars card-collection game built around a five-card fighting deck, missions and weekly leaderboards. The V2 game originally started players fresh; this menu update preserves existing V2 cards and Credits. The old quiz/game database, assistant, moderation, blacklist and Roblox HTTP services remain separate.

## First-time experience

1. `/game` → choose **Republic**, **CIS** or **Independent**. Each player is an independent commander and receives 5 starter cards, a combat squad and working production units. They can collect cards from *any* faction later.
2. Press **Roll Card** (300 Credits) or `/roll`, or open 3-card crates in **Shop**. There are hundreds of collectible units across six rarities. Opening `/game` gives the daily reward automatically when available.
3. Open **My Cards** to see your **five-card fighting deck** at the top and a short, paginated collection underneath. Copies of the same card appear as `×N`. Select a card, then **Upgrade Card**, **Add to Deck**, **Make Worker** or **Delete Card**. Upgrades include ability improvement and merging a stored duplicate.
4. Cards assigned as workers earn Credits automatically, up to 12 hours offline. No Base or Base Training screen is needed. Your fighting deck handles missions, duels and raids; challenging a much stronger deck warns you first.
5. Missions include daily, weekly and monthly objectives. Every Monday, the weekly leaderboard resets and awards in-game prizes. More Activities contains **Leaderboards**, **Trade Cards** and **How to Play**.

`/game` opens with just four primary actions: **Roll Card**, **My Cards**, **Missions**, **Shop**. The Trade flow picks a player, one stored card of yours and one of theirs, then posts an accept/decline request in the channel. Extended commands include `/roll`, `/cards`, `/catalog`, `/raid @player`, `/duel @player [ranked]`, `/trade`, `/rankings` and `/guild`.

`/quiz` and `/quizleaderboard` remain as **optional** trivia games. Quiz correctness contributes small daily-capped Galactic Command rewards; the quiz is no longer the main progression loop.

## Economy and competitive rules

- Every roll draws a card; it is *not* a claim-or-lose roll. Credits are deducted first. Crates contain three cards with different rarity weights, and the shop previews prices before charging. There is a discounted daily deal. The daily reward grants a free card and Credits on the next `/game` visit when eligible.
- Rarities: Common (grey), Uncommon (green), Rare (blue), Epic (purple), Legendary (gold) and Mythical (pink/cyan).
- Card HP, attack, defence and special abilities affect combat. Level and ability upgrades strengthen individual cards; storage duplicates can be fused for two extra levels. Legacy Base/Research values remain in old V2 saves for compatibility but are not new gameplay requirements.
- Raids have a one-hour attacker cooldown, six-hour target cooldown and 24-hour protection for new players. Defenders never lose cards or Credits for being attacked. Duel invitations and trades require consent; ranked rematches are limited per pair per day.
- Dynamic mission bonus events rotate automatically. Saturdays and Sundays UTC award double XP. Daily, weekly and monthly objectives rotate with rewards.
- Passive worker income is credited automatically on profile access with a 12-hour offline accrual limit.
- **One daily public card drop** appears in channel `1556794160865091695` (or the owner-configured override). The first one or two eligible members to click **Claim This Card** receive a card immediately. Drops expire after six hours, and double claims are prevented transactionally.
- Weekly leaderboard resets are Monday 00:00 UTC. Top three players with at least 25 CP automatically receive in-game Credits, XP and 1–3 elite card draws. The previous week's results appear in the configured drops channel. **Nitro, Robux or other physical/external prizes are NOT automatically purchased or delivered; ownership distributes them and records fulfilment manually.**
- Repetitive ranked opponents, daily quiz farming and same-target raid repeats have safeguards; these are not a substitute for moderator judgement when valuable external prizes are at stake.

## Ownership controls

`/gameadmin` is guild-only and verified against the configured Discord owner ID, the Discord server owner or the existing TARC Roblox rank-255 owner check.

| Command | Effect |
| --- | --- |
| `/gameadmin drops #channel` | Override the default daily card-drop channel; first drop after ~3 minutes. |
| `/gameadmin dropnow` | Trigger an extra card drop immediately, provided one is not already active. |
| `/gameadmin grantcard @player card_id [amount]` | Grant one to 20 cards listed by `/catalog search`. |
| `/gameadmin set @player stat value` | Set Credits, XP, Scrap, weekly CP or base level. Marks the player ineligible for this week's competitive prizes. |
| `/gameadmin reset @player RESET` | Reset **one player's V2 profile** to a fresh recruit; does not affect the old game save. |
| `/gameadmin fulfill @player` | Mark an automatically recorded external prize as delivered. |

Owner actions are audit-logged in the V2 save. Avoid changing competitive players' rankings mid-week if an external prize is on offer.

## Deployment / persistence

See [Browser deployment](../web/DEPLOY.md) for the Cloudflare Pages build settings, Discord OAuth setup and the isolated browser test. The browser API runs inside the same Railway process and uses the existing V2 save.

### Required: Railway volume

This game writes JSON transactionally to:

`$TARC_DATA_DIR/tarc-galactic-v2.json` (new card game)

`$TARC_DATA_DIR/tarc-quiz-v2.json` (separate new quiz progress)

The old save `tarc-game-state.json` is **never overwritten** by Galactic Command. To make progression survive Railway redeployments, attach a **persistent Railway Volume**. Railway automatically exposes `RAILWAY_VOLUME_MOUNT_PATH`, which the V2 game uses unless an existing `TARC_DATA_DIR` has already been set. If `TARC_DATA_DIR` exists, it must match the volume's absolute mount path (example `/data`). Without a volume, the game can be used for testing, but progress may disappear during a restart or redeployment.

### Images and drop scheduling

- Artwork URLs in `galacticImages.js` reference external Star Wars film/series/game images; the bot no longer uses any of the generated vector illustrations. Several fictional TARC company/rank variants share an authentic image of their parent Star Wars unit. The external hosts control image availability.
- Player commands (`/game`, `/roll`, `/cards`, etc. and `/quiz`) are registered **globally only**, not duplicated in each guild. `/gameadmin` is registered only in the main server.
- `GALACTIC_DROP_CHANNEL_ID` overrides the initial dedicated daily-drop channel, if set. `/gameadmin drops #channel` can change it thereafter; the saved choice persists in the volume.
- `GAME_OWNER_DISCORD_IDS` accepts comma-separated authorized Discord IDs; the existing group-owner verification continues to work.
- Railway must use just **one bot instance** with this JSON backend. Multiple instances would not share transaction locks. Back up the V2 file before migrations or changing the deployment.

`npm test` validates the catalog, core economy, anti-abuse limits, transactions, Discord command schemas, UI and persistence.

## Release guardrail

Keep major game changes on a feature branch until tests pass and the Railway volume configuration is verified. Pushing to the main Railway-connected branch may auto-deploy immediately. Test the bot's permissions (Embed Links, Send Messages, Read Message History) and the drop channel before announcing the new game.
