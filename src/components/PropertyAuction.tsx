import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Banknote, X } from 'lucide-react';
import type { BoardTile, Player, PropertyAuction as PropertyAuctionState } from '../types/game';
import { PropertyModel } from './PropertyModel';
import { TurnCountdown } from './TurnCountdown';
import { PROPERTY_COLORS } from '../utils/propertyModel';

interface Props {
  auction: PropertyAuctionState;
  tile: BoardTile;
  currentPlayer: Player;
  players: Player[];
  onClose: () => void;
  onBid: (amount: number) => Promise<boolean>;
}

export function PropertyAuction({ auction, tile, currentPlayer, players, onClose, onBid }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState(auction.currentBid > 0 ? auction.currentBid + auction.increment : auction.minimumBid);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const nextBid = auction.currentBid > 0 ? auction.currentBid + auction.increment : auction.minimumBid;
  const leader = players.find(player => player.id === auction.highestBidderId);
  const canBid = !currentPlayer.bankrupt && currentPlayer.money >= nextBid;

  useEffect(() => {
    setAmount(nextBid);
  }, [nextBid]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  const submitBid = async () => {
    if (pending || !canBid || !Number.isSafeInteger(amount) || amount < nextBid || amount > currentPlayer.money) return;
    setPending(true);
    setError('');
    try {
      if (!await onBid(amount)) setError('Das Gebot konnte nicht abgegeben werden. Bitte prüfe den aktuellen Stand.');
    } catch {
      setError('Das Gebot konnte nicht abgegeben werden. Bitte versuche es erneut.');
    } finally {
      setPending(false);
    }
  };

  return <div className="purchase-overlay" onKeyDown={event => {
    if (event.key === 'Escape' && !pending) { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div ref={dialogRef} className="purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="auction-title" tabIndex={-1} style={{ '--property-color': PROPERTY_COLORS[tile.color || 'utility'] } as CSSProperties}>
      <header className="purchase-heading">
        <div><span className="purchase-eyebrow">Live-Auktion · Spielgeld</span><h2 id="auction-title">{tile.name}</h2></div>
        <button aria-label="Auktion schließen" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="purchase-countdown"><TurnCountdown deadline={auction.endsAt} phase="AUCTION" total={10} /></div>
      <PropertyModel tile={tile} />
      <div className="purchase-details">
        <p>Alle Mitspieler können mitbieten. Das höchste gültige Gebot gewinnt; bei gleichem Betrag zählt das zuerst angenommene Gebot.</p>
        <dl className="purchase-facts">
          <div><dt>Aktuelles Gebot</dt><dd>{auction.currentBid ? `$${auction.currentBid.toLocaleString()}` : 'Noch kein Gebot'}</dd></div>
          <div><dt>Höchstbietende Person</dt><dd>{leader?.name || 'Noch niemand'}</dd></div>
          <div><dt>Dein Bargeld</dt><dd>${currentPlayer.money.toLocaleString()}</dd></div>
        </dl>
        <label className="block text-xs font-semibold text-slate-400">
          Dein Gebot · mindestens ${nextBid.toLocaleString()}
          <input
            type="number"
            aria-label={`Dein Gebot für ${tile.name}`}
            min={nextBid}
            max={currentPlayer.money}
            step={auction.increment}
            value={amount}
            disabled={!canBid || pending}
            onChange={event => setAmount(Number(event.target.value))}
            className="w-full mt-1 bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 text-base"
          />
        </label>
        {leader?.id === currentPlayer.id && <p role="status" className="purchase-rent">Du führst gerade. Du kannst dein Gebot erhöhen oder die Auktion beobachten.</p>}
        {!canBid && <p className="purchase-error">Für das nächste Mindestgebot reicht dein Bargeld nicht aus.</p>}
        {error && <p role="alert" className="purchase-error">{error}</p>}
      </div>
      <footer className="purchase-actions">
        <button disabled={pending} onClick={onClose}>Nicht mitbieten</button>
        <button className="purchase-buy" disabled={pending || !canBid || !Number.isSafeInteger(amount) || amount < nextBid || amount > currentPlayer.money} onClick={submitBid}>
          <Banknote size={17} />{pending ? 'Wird verarbeitet …' : `Bieten · $${amount.toLocaleString()}`}
        </button>
      </footer>
    </div>
  </div>;
}
