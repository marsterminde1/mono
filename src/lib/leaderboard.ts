export const LEADERBOARD_ACHIEVEMENTS = [
  { id: 'first-game', title: 'Erste Partie', description: 'Beende eine gewertete Partie.', gamesPlayed: 1, wins: 0 },
  { id: 'first-win', title: 'Erster Sieg', description: 'Gewinne eine gewertete Partie.', gamesPlayed: 0, wins: 1 },
  { id: 'five-games', title: 'Regelmäßig dabei', description: 'Beende fünf gewertete Partien.', gamesPlayed: 5, wins: 0 },
  { id: 'three-wins', title: 'Dreifach-Sieg', description: 'Gewinne drei gewertete Partien.', gamesPlayed: 0, wins: 3 },
  { id: 'ten-games', title: 'Viel gespielt', description: 'Beende zehn gewertete Partien.', gamesPlayed: 10, wins: 0 },
] as const;

export type LeaderboardAchievementId = typeof LEADERBOARD_ACHIEVEMENTS[number]['id'];

export interface LeaderboardRecord {
  id: string;
  username: string;
  wins: number;
  gamesPlayed: number;
  updatedAt: string;
  achievements: LeaderboardAchievementId[];
}

export interface LeaderboardResponse {
  entries: LeaderboardRecord[];
  player: LeaderboardRecord | null;
}

type LeaderboardRecordSource = Pick<LeaderboardRecord, 'id' | 'wins' | 'gamesPlayed'> & {
  username?: string;
  updatedAt: string | Date;
};

type RankedLeaderboardRecordSource = {
  id: string;
  updatedAt: string | Date;
  rankedWins: number;
  rankedGamesPlayed: number;
};

export function isRankedGame(
  players: readonly { id: string; isBot?: boolean }[],
  winnerId: string | null | undefined,
) {
  return players.length >= 2
    && players.every(player => !player.isBot)
    && players.some(player => player.id === winnerId);
}

export function publicPlayerName(playerId: string) {
  return `Spieler-${playerId.slice(-6).toUpperCase()}`;
}

export function toPublicLeaderboardRecord(record: LeaderboardRecordSource): LeaderboardRecord {
  const wins = Math.max(0, Math.trunc(record.wins));
  const gamesPlayed = Math.max(0, Math.trunc(record.gamesPlayed));
  const achievements = LEADERBOARD_ACHIEVEMENTS
    .filter(achievement => wins >= achievement.wins && gamesPlayed >= achievement.gamesPlayed)
    .map(achievement => achievement.id);
  return {
    id: record.id,
    username: publicPlayerName(record.id),
    wins,
    gamesPlayed,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
    achievements,
  };
}

export function toPublicRankedLeaderboardRecord(
  record: RankedLeaderboardRecordSource,
): LeaderboardRecord {
  return toPublicLeaderboardRecord({
    id: record.id,
    wins: record.rankedWins,
    gamesPlayed: record.rankedGamesPlayed,
    updatedAt: record.updatedAt,
  });
}

export async function fetchGlobalLeaderboard(): Promise<LeaderboardResponse> {
  const response = await fetch('/.netlify/functions/game', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Rangliste konnte nicht geladen werden.');
  return response.json();
}
