import { Trophy } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  fetchGlobalLeaderboard,
  LEADERBOARD_ACHIEVEMENTS,
  type LeaderboardResponse,
} from '../lib/leaderboard';
import { playSound } from '../utils/sound';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onError?: (message: string) => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ isOpen, onClose, onError }) => {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchGlobalLeaderboard()
      .then(result => {
        if (active) setData(result);
      })
      .catch(() => {
        const message = 'Rangliste konnte nicht geladen werden. Bitte versuche es erneut.';
        if (active) {
          setError(message);
          onError?.(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isOpen, onError]);

  if (!isOpen) return null;

  const achievements = new Set(data?.player?.achievements ?? []);

  return (
    <div className="game-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-title"
        className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
      >
        <header className="bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 border-b border-amber-500/30 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy size={28} aria-hidden="true" />
            <div>
              <h2 id="leaderboard-title" className="text-xl font-black text-amber-300 tracking-wide uppercase">
                Rangliste &amp; Erfolge
              </h2>
              <p className="text-xs text-slate-300">Nur Partien ohne Bots zählen. Spielernamen bleiben anonym.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Rangliste schließen"
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="cursor-pointer text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors text-lg"
          >
            ✕
          </button>
        </header>

        <div className="p-5 max-h-[72vh] overflow-y-auto space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-300">Ergebnisse werden geladen …</span>
            </div>
          ) : error ? (
            <p role="alert" className="text-sm text-red-300">{error}</p>
          ) : data ? (
            <>
              <section aria-labelledby="leaderboard-achievements-title" className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="leaderboard-achievements-title" className="font-bold text-white">Deine Erfolge</h3>
                  <span className="text-xs text-slate-300">{achievements.size} von {LEADERBOARD_ACHIEVEMENTS.length}</span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {LEADERBOARD_ACHIEVEMENTS.map(achievement => {
                    const unlocked = achievements.has(achievement.id);
                    return (
                      <li
                        key={achievement.id}
                        className={`flex gap-2 rounded-lg border p-3 ${unlocked ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/50'}`}
                      >
                        <span aria-hidden="true" className={unlocked ? 'text-emerald-300' : 'text-slate-500'}>
                          {unlocked ? '✓' : '○'}
                        </span>
                        <div>
                          <strong className={unlocked ? 'text-emerald-100' : 'text-slate-300'}>{achievement.title}</strong>
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">{achievement.description}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="leaderboard-entries-title">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 id="leaderboard-entries-title" className="font-bold text-white">Die besten Spieler</h3>
                  <span className="text-xs text-slate-400">Sortiert nach Siegen, dann Partien</span>
                </div>
                {data.entries.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center">
                    <p className="font-bold text-slate-200">Noch keine gewerteten Partien</p>
                    <p className="mt-1 text-sm text-slate-400">Beende eine Partie ohne Bots, um hier zu erscheinen.</p>
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {data.entries.map((entry, index) => (
                      <li
                        key={entry.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${index === 0 ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-800 bg-slate-900/60'}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-800 text-sm font-black text-amber-300">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate font-bold text-white">{entry.username}</span>
                            <span className="text-xs text-slate-400">{entry.gamesPlayed} {entry.gamesPlayed === 1 ? 'Partie' : 'Partien'}</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-right font-bold text-emerald-300">
                          {entry.wins} {entry.wins === 1 ? 'Sieg' : 'Siege'}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-800/80 bg-slate-950/80 p-4 text-xs text-slate-300">
          <span>Gewertet werden ausschließlich Partien ohne Bots.</span>
          <button
            type="button"
            onClick={() => {
              playSound('click');
              onClose();
            }}
            className="cursor-pointer rounded-lg bg-amber-400 px-4 py-2 font-bold uppercase text-slate-950 transition-colors hover:bg-amber-300"
          >
            Schließen
          </button>
        </footer>
      </section>
    </div>
  );
};
