import { CITY_EVENTS } from '../data/cityEvents';
import type { CityEventId, GameState, Player } from '../types/game';

interface Props {
  gameState: GameState;
  currentPlayer: Player;
  onVote: (eventId: CityEventId) => void;
}

export function CityEventPanel({ gameState, currentPlayer, onVote }: Props) {
  const vote = gameState.cityEventVote;
  const activeEvent = CITY_EVENTS.find(event => event.id === gameState.activeCityEvent?.id);
  const eligiblePlayers = gameState.players.filter(player => !player.bankrupt);
  const counts = new Map(CITY_EVENTS.map(event => [event.id, 0]));
  for (const [playerId, eventId] of Object.entries(vote?.votes ?? {})) {
    const event = CITY_EVENTS.find(candidate => candidate.id === eventId);
    if (eligiblePlayers.some(player => player.id === playerId) && event) {
      counts.set(event.id, (counts.get(event.id) ?? 0) + 1);
    }
  }
  const canVote = Boolean(vote && !currentPlayer.bankrupt && gameState.phase !== 'GAME_OVER');

  return <section className="city-event-panel rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2.5 text-slate-100" aria-label="Stadtereignis und Abstimmung">
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">
          Stadtereignis · Runde {gameState.roundNumber ?? 1}
        </p>
        <p className="text-xs font-bold">{activeEvent?.title ?? 'Noch kein Ereignis aktiv'}</p>
        <p className="text-[11px] text-slate-400">{activeEvent?.activeDescription ?? 'Stimme für das Ereignis der nächsten Runde.'}</p>
      </div>
      {vote && <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold text-slate-300">Abstimmung für Runde {vote.forRound}</p>
          <span className="text-[10px] text-slate-400">{eligiblePlayers.length} Mitspielende</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CITY_EVENTS.map(event => (
            <button
              key={event.id}
              type="button"
              aria-pressed={vote.votes[currentPlayer.id] === event.id}
              disabled={!canVote}
              onClick={() => onVote(event.id)}
              className="min-w-0 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-amber-300 aria-pressed:bg-amber-300/10"
            >
              <span className="block truncate text-[11px] font-bold">{event.title} · {counts.get(event.id) ?? 0}</span>
              <span className="block text-[10px] leading-snug text-slate-400">{event.description}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Du kannst bis zum Rundenwechsel umstimmen. Bei Gleichstand gewinnt der obere Vorschlag.</p>
      </div>}
    </div>
  </section>;
}
