# 🎮 TARC Game System

The Discord bot now contains a separate game layer designed to be simple on first use and deep over time.

## Player entry points

- `/game` 🎮 opens the full game hub.
- `/quiz` 🧠 opens quiz play. Add an opponent to start a Face Off.
- `/quizleaderboard` 🏆 opens competitive rankings.
- `/gameadmin` 🛠️ is restricted by a live Roblox main-group rank 255 check.

Most gameplay is intentionally handled with buttons and dropdowns instead of extra slash commands.

## Systems

The game profile tracks Credits, XP, level, Elo, accuracy, streaks, quiz history, ranked results, patrols, achievements, quest progress, collection items, daily streak and season XP.

Quiz modes include Classic, Quickfire, Survival, Extreme Run, TARC Specialist and Galactic Specialist. Face Off lets two Discord users answer the same ten questions and awards competitive Elo.

The question bank contains 500 curated/generated-from-curated Star Wars questions plus a separate TARC bank. TARC questions are player-facing game knowledge only. Do not add internal script names, IDs, developer-only configuration or security information as trivia.

The hub also includes Patrol, Daily Reward, Shop, Achievements, Missions & Quests, Collection, Season and several leaderboard views.

## Economy rules

Credits and normal XP can be earned through quizzes, quests, patrols, dailies and Face Off rewards. Shop items are cosmetic. Credits must never directly purchase Elo. Competitive Elo should only move through ranked performance.

## Persistence

Game state is stored in `${TARC_DATA_DIR || "./data"}/tarc-game-state.json`.

For Railway production, mount a persistent Railway Volume and set `TARC_DATA_DIR` to the mounted directory. Without persistent storage, filesystem data may be lost when the deployment/container is replaced.

## Safety and operations

Do not merge major game changes directly into production without checking the feature branch first. Existing TARC assistant, Roblox management, HTTP endpoints and moderation functionality should remain independent of the game layer.

Discord component sessions are intentionally temporary. Persistent profile/economy data is stored separately from temporary active quiz sessions.
