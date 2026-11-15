export interface PollProgress {
  revision: number;
  clientRevision: unknown;
  phase: string | null;
  activePlayerIsBot: boolean;
  turnSeconds: number | null;
  turnDeadline: number | null;
  turnClockReady: boolean;
  hasPendingTrades: boolean;
}

export function canSkipUnchangedPoll(progress: PollProgress, now = Date.now()) {
  if (!Number.isInteger(progress.clientRevision) || progress.clientRevision !== progress.revision) return false;
  if (progress.phase === null || progress.phase === 'GAME_OVER') return true;
  if (progress.activePlayerIsBot || progress.hasPendingTrades) return false;
  if (progress.turnSeconds === 0) return progress.turnDeadline === null;
  if (!progress.turnClockReady || progress.turnSeconds === null || progress.turnDeadline === null) return false;
  return progress.turnDeadline > now;
}
