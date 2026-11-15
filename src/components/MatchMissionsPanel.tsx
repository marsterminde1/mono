import { MATCH_MISSIONS } from '../data/matchMissions';
import type { GameState, Player } from '../types/game';

export function MatchMissionsPanel({ gameState, currentPlayer }: { gameState: GameState; currentPlayer: Player }) {
  const completed = new Set(gameState.matchMissions?.[currentPlayer.id]?.completed ?? []);
  const completedCount = MATCH_MISSIONS.filter(mission => completed.has(mission.id)).length;

  return (
    <section className="mb-3 rounded-xl border border-amber-200/15 bg-slate-950/60 p-3" aria-label="Missionen dieser Partie">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-black uppercase tracking-wider text-amber-200">Missionen dieser Partie</h2>
          <p className="text-[10px] text-slate-500">Automatische Spielgeld-Boni, ohne Kauf oder Konto.</p>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300">
          {completedCount}/{MATCH_MISSIONS.length}
        </span>
      </header>
      <ul className="space-y-1.5">
        {MATCH_MISSIONS.map(mission => {
          const isCompleted = completed.has(mission.id);
          return (
            <li key={mission.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
              <div className="min-w-0">
                <p className={`truncate text-[11px] font-bold ${isCompleted ? 'text-emerald-300' : 'text-slate-200'}`}>
                  {mission.title}
                </p>
                <p className="text-[10px] leading-snug text-slate-500">{mission.description}</p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold ${isCompleted ? 'text-emerald-300' : 'text-amber-200'}`}>
                {isCompleted ? 'Erledigt' : `+$${mission.reward}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
