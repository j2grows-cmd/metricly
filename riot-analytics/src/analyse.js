function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function analyseMatches(matchPayloads, puuid) {
  const games = [];
  const champions = new Map();
  const roles = new Map();

  for (const payload of matchPayloads) {
    const info = payload?.info;
    const participant = info?.participants?.find((p) => p.puuid === puuid);
    if (!info || !participant) continue;

    const durationSeconds = Number(info.gameDuration || 0);
    const durationMinutes = durationSeconds / 60;
    const win = Boolean(participant.win);
    const champion = participant.championName || "Unknown";
    const role = participant.teamPosition || participant.individualPosition || "Unknown";

    const row = {
      matchId: payload.metadata?.matchId ?? null,
      gameCreation: info.gameCreation ?? null,
      gameMode: info.gameMode ?? null,
      queueId: info.queueId ?? null,
      gameDuration: durationSeconds,
      champion,
      role,
      win,
      kills: participant.kills ?? 0,
      deaths: participant.deaths ?? 0,
      assists: participant.assists ?? 0,
      kda: (participant.kills + participant.assists) / Math.max(1, participant.deaths),
      cs: (participant.totalMinionsKilled ?? 0) + (participant.neutralMinionsKilled ?? 0),
      csPerMinute: durationMinutes > 0
        ? ((participant.totalMinionsKilled ?? 0) + (participant.neutralMinionsKilled ?? 0)) / durationMinutes
        : 0,
      goldEarned: participant.goldEarned ?? 0,
      goldPerMinute: durationMinutes > 0 ? (participant.goldEarned ?? 0) / durationMinutes : 0,
      totalDamageDealtToChampions: participant.totalDamageDealtToChampions ?? 0,
      damagePerMinute: durationMinutes > 0
        ? (participant.totalDamageDealtToChampions ?? 0) / durationMinutes
        : 0,
      visionScore: participant.visionScore ?? 0
    };
    games.push(row);

    const championStats = champions.get(champion) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    championStats.games += 1;
    championStats.wins += win ? 1 : 0;
    championStats.kills += row.kills;
    championStats.deaths += row.deaths;
    championStats.assists += row.assists;
    champions.set(champion, championStats);

    const roleStats = roles.get(role) ?? { games: 0, wins: 0 };
    roleStats.games += 1;
    roleStats.wins += win ? 1 : 0;
    roles.set(role, roleStats);
  }

  const wins = games.filter((game) => game.win).length;
  const championRows = [...champions.entries()].map(([champion, stats]) => ({
    champion,
    ...stats,
    winRate: stats.games ? stats.wins / stats.games : 0,
    averageKda: (stats.kills + stats.assists) / Math.max(1, stats.deaths)
  })).sort((a, b) => b.games - a.games);

  const roleRows = [...roles.entries()].map(([role, stats]) => ({
    role,
    ...stats,
    winRate: stats.games ? stats.wins / stats.games : 0
  })).sort((a, b) => b.games - a.games);

  return {
    generatedAt: new Date().toISOString(),
    gamesAnalysed: games.length,
    overall: {
      wins,
      losses: games.length - wins,
      winRate: games.length ? wins / games.length : 0,
      averageKda: average(games.map((g) => g.kda)),
      averageCsPerMinute: average(games.map((g) => g.csPerMinute)),
      averageGoldPerMinute: average(games.map((g) => g.goldPerMinute)),
      averageDamagePerMinute: average(games.map((g) => g.damagePerMinute)),
      averageVisionScore: average(games.map((g) => g.visionScore))
    },
    champions: championRows,
    roles: roleRows,
    games
  };
}
