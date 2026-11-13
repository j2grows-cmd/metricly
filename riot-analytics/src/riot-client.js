import { setTimeout as sleep } from "node:timers/promises";

export class RiotClient {
  constructor({ apiKey, platform = "euw1", region = "europe", requestsPerSecond = 0.8 }) {
    if (!apiKey) throw new Error("Missing RIOT_API_KEY.");
    this.apiKey = apiKey;
    this.platform = platform;
    this.region = region;
    this.minIntervalMs = Math.max(250, Math.ceil(1000 / requestsPerSecond));
    this.lastRequestAt = 0;
  }

  async request(url, { retries = 5 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const waitMs = this.minIntervalMs - (Date.now() - this.lastRequestAt);
      if (waitMs > 0) await sleep(waitMs);
      this.lastRequestAt = Date.now();

      let response;
      try {
        response = await fetch(url, {
          headers: {
            "X-Riot-Token": this.apiKey,
            Accept: "application/json"
          },
          signal: AbortSignal.timeout(30_000)
        });
      } catch (error) {
        if (attempt === retries) throw error;
        await sleep(Math.min(30_000, 1000 * (2 ** attempt)));
        continue;
      }

      if (response.ok) return response.json();

      const body = await response.text().catch(() => "");
      if (response.status === 429 && attempt < retries) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After") || 2);
        await sleep(Math.max(1000, retryAfterSeconds * 1000));
        continue;
      }
      if (response.status >= 500 && attempt < retries) {
        await sleep(Math.min(30_000, 1000 * (2 ** attempt)));
        continue;
      }

      const error = new Error(`Riot API ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
      error.status = response.status;
      throw error;
    }
    throw new Error("Riot API retry limit exceeded.");
  }

  platformUrl(path) {
    return `https://${this.platform}.api.riotgames.com${path}`;
  }

  regionalUrl(path) {
    return `https://${this.region}.api.riotgames.com${path}`;
  }

  accountByRiotId(gameName, tagLine) {
    return this.request(this.regionalUrl(
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    ));
  }

  summonerByPuuid(puuid) {
    return this.request(this.platformUrl(
      `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`
    ));
  }

  rankedByPuuid(puuid) {
    return this.request(this.platformUrl(
      `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`
    ));
  }

  masteryByPuuid(puuid, start = 0, count = 100) {
    return this.request(this.platformUrl(
      `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}?start=${start}&count=${count}`
    ));
  }

  challengesByPuuid(puuid) {
    return this.request(this.platformUrl(
      `/lol/challenges/v1/player-data/${encodeURIComponent(puuid)}`
    ));
  }

  matchIdsByPuuid(puuid, start, count) {
    return this.request(this.regionalUrl(
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${start}&count=${count}`
    ));
  }

  match(matchId) {
    return this.request(this.regionalUrl(
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}`
    ));
  }

  timeline(matchId) {
    return this.request(this.regionalUrl(
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`
    ));
  }
}
