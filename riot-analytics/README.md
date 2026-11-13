# Riot Analytics Extractor

A local-first Node.js CLI for exporting the Riot Games API data available for a personal League of Legends account. This project lives in its own folder and branch so it does not change Metricly's application code.

## Requirements
- Node.js 20+
- A Riot Developer Portal API key: https://developer.riotgames.com/
- Exact Riot ID: Game Name and Tagline

## Setup
1. Copy `.env.example` to `.env`.
2. Set `RIOT_API_KEY`, `RIOT_GAME_NAME`, and `RIOT_TAGLINE`.
3. Run `npm install`, then `npm start`.

For the configured account use:
- Game name: `J2GNinja`
- Tagline: `J2G`
- Platform routing: `euw1`
- Regional routing: `europe`

## Output
Timestamped exports are written to `data/exports/<timestamp>_<game-name>/`:
- account, summoner, ranked, champion mastery, and challenges JSON
- paginated Match-V5 match ID list
- raw match payload for each returned match ID
- optional raw timeline payload for each match
- a derived analysis summary and endpoint error log

## Scope and limitations
"All matches" means all match IDs returned by Riot's Match-V5 history endpoint as pagination is followed. It is not a guarantee of every match ever played. Match history availability and retention are controlled by Riot. The API does not expose every internal matchmaking signal, unrestricted historical rank snapshots, or every item of information shown in the client. Live-game data is not part of this historical export.

Some endpoints can be unavailable or return errors for particular accounts or API access levels. Non-fatal endpoint failures are written to `errors.json`.

## Security
- Never commit `.env`, API keys, or exported personal data.
- The included `.gitignore` excludes secrets and generated data.
- Do not paste your Riot API key into ChatGPT, source files, client-side code, screenshots, or GitHub.
- Riot Development API keys expire and must be refreshed in the Developer Portal.
- Keep request rates conservative and respect Riot's response headers and current developer policies.

## Scripts
- `npm start` — run the export
- `npm run check` — syntax-check the source files
