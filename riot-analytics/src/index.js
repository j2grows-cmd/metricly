import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RiotClient } from "./riot-client.js";
import { analyseMatches } from "./analyse.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const env = process.env;

function required(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in your .env file.`);
  return value;
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function capture(label, fn, errors) {
  try {
    const result = await fn();
    console.log(`✓ ${label}`);
    return result;
  } catch (error) {
    console.warn(`! ${label}: ${error.message}`);
    errors.push({ endpoint: label, status: error.status ?? null, message: error.message });
    return null;
  }
}

const apiKey = required("RIOT_API_KEY");
const gameName = required("RIOT_GAME_NAME");
const tagline = required("RIOT_TAGLINE");
if (gameName.includes("#") || tagline.includes("#")) {
  throw new Error("Enter Game Name and Tagline separately. Riot ID format is GameName#Tagline; EUW is a routing choice.");
}

const platform = env.RIOT_PLATFORM || "euw1";
const region = env.RIOT_REGION || "europe";
const limitText = (env.MATCH_LIMIT || "all").toLowerCase();
const matchLimit = limitText === "all" ? Infinity : Number(limitText);
if (!(matchLimit === Infinity || (Number.isInteger(matchLimit) && matchLimit > 0))) {
  throw new Error("MATCH_LIMIT must be 'all' or a positive integer.");
}

const includeTimelines = (env.INCLUDE_TIMELINES || "true").toLowerCase() === "true";
const requestsPerSecond = Number(env.REQUESTS_PER_SECOND || 0.8);
if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
  throw new Error("REQUESTS_PER_SECOND must be a positive number.");
}

const client = new RiotClient({ apiKey, platform, region, requestsPerSecond });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const exportDir = path.join(projectRoot, "data", "exports", `${timestamp}_${safeName(gameName)}`);
const errors = [];
const startedAt = new Date().toISOString();

await fs.mkdir(path.join(exportDir, "matches"), { recursive: true });
if (includeTimelines) await fs.mkdir(path.join(exportDir, "timelines"), { recursive: true });

console.log(`\nRiot export for ${gameName}#${tagline} (${platform}/${region})`);
console.log(`Output: ${path.relative(projectRoot, exportDir)}\n`);

const account = await client.accountByRiotId(gameName, tagline);
await writeJson(path.join(exportDir, "account.json"), account);
console.log("✓ Account");
const puuid = account.puuid;

const summoner = await capture("Summoner", () => client.summonerByPuuid(puuid), errors);
if (summoner) await writeJson(path.join(exportDir, "summoner.json"), summoner);

const ranked = await capture("Ranked entries", () => client.rankedByPuuid(puuid), errors);
if (ranked) await writeJson(path.join(exportDir, "ranked.json"), ranked);

const challenges = await capture("Challenges", () => client.challengesByPuuid(puuid), errors);
if (challenges) await writeJson(path.join(exportDir, "challenges.json"), challenges);

const mastery = [];
for (let start = 0; ; start += 100) {
  const page = await capture(`Champion mastery page ${Math.floor(start / 100) + 1}`,
    () => client.masteryByPuuid(puuid, start, 100), errors);
  if (!page?.length) break;
  mastery.push(...page);
  if (page.length < 100) break;
}
await writeJson(path.join(exportDir, "mastery.json"), mastery);

const matchIds = [];
for (let start = 0; matchIds.length < matchLimit; start += 100) {
  const count = Number.isFinite(matchLimit) ? Math.min(100, matchLimit - matchIds.length) : 100;
  const page = await capture(`Match ID page from ${start}`,
    () => client.matchIdsByPuuid(puuid, start, count), errors);
  if (!page?.length) break;
  matchIds.push(...page);
  if (page.length < count) break;
}
await writeJson(path.join(exportDir, "match-ids.json"), matchIds);
console.log(`\nRetrieved ${matchIds.length} match IDs. Fetching match payloads...\n`);

const matchPayloads = [];
let timelineCount = 0;
for (let index = 0; index < matchIds.length; index += 1) {
  const matchId = matchIds[index];
  const match = await capture(`Match ${index + 1}/${matchIds.length}: ${matchId}`,
    () => client.match(matchId), errors);
  if (match) {
    matchPayloads.push(match);
    await writeJson(path.join(exportDir, "matches", `${safeName(matchId)}.json`), match);
  }

  if (includeTimelines) {
    const timeline = await capture(`Timeline ${index + 1}/${matchIds.length}: ${matchId}`,
      () => client.timeline(matchId), errors);
    if (timeline) {
      timelineCount += 1;
      await writeJson(path.join(exportDir, "timelines", `${safeName(matchId)}.json`), timeline);
    }
  }
}

const analysis = analyseMatches(matchPayloads, puuid);
await writeJson(path.join(exportDir, "analysis.json"), analysis);

const summary = {
  startedAt,
  completedAt: new Date().toISOString(),
  riotId: `${gameName}#${tagline}`,
  platform,
  regionalRouting: region,
  matchLimit: limitText,
  includeTimelines,
  counts: {
    matchIds: matchIds.length,
    matchesSaved: matchPayloads.length,
    timelinesSaved: timelineCount,
    championMasteryRecords: mastery.length,
    rankedQueues: ranked?.length ?? null,
    gamesAnalysed: analysis.gamesAnalysed,
    errors: errors.length
  },
  limitations: [
    "All means all match IDs returned by Riot's Match-V5 history endpoint, not necessarily every match ever played.",
    "Only information exposed by the official Riot API is included.",
    "Historical rank snapshots and internal matchmaking signals are not guaranteed to be available."
  ]
};

await writeJson(path.join(exportDir, "summary.json"), summary);
await writeJson(path.join(exportDir, "errors.json"), errors);

console.log("\nExport complete:");
console.log(JSON.stringify(summary.counts, null, 2));
console.log(`Saved to ${path.relative(projectRoot, exportDir)}`);
