import { ArrowDown, ArrowLeft, ArrowUpRight, MoveUpRight } from 'lucide-react';
import type { PlayerToken } from '../types/game';
import { ShopPanel } from './ShopPanel';
import { StoreBoardModel } from './StoreBoardModel';
import { MembershipShop } from './MembershipShop';
import type { PlanId } from '../lib/plans';

interface ShopPageProps {
  currentToken: PlayerToken;
  currentColor: string;
  onEquip: (token: PlayerToken, color: string) => void;
  onBack: () => void;
  onStartGame: () => void;
  onCreateRoom: () => void;
  activePlan: PlanId;
  onActivateDemoPlan: (plan: PlanId) => void;
}

export function ShopPage({ currentToken, currentColor, onEquip, onBack, onStartGame, onCreateRoom, activePlan, onActivateDemoPlan }: ShopPageProps) {
  const browseCollection = () => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main className="district-store">
      <header className="district-store-header">
        <button type="button" className="district-store-brand" onClick={onBack} aria-label="Zurück zur Startseite">
          <span className="district-store-mark" aria-hidden="true">A</span>
          <span>ARENA <b>DISTRICTS</b></span>
        </button>
        <nav className="district-store-nav" aria-label="Shop-Navigation">
          <a href="#zugang">Editionen</a>
          <a href="#shop">Kollektion</a>
          <a href="#store-edition">Edition</a>
          <button type="button" onClick={onBack}><ArrowLeft size={15} /> Zurück zum Spiel</button>
        </nav>
      </header>

      <section className="district-store-hero" aria-labelledby="district-store-title">
        <div className="district-store-copy">
          <span className="district-store-eyebrow"><span /> STRATEGIE-SPIEL / CITY EDITION</span>
          <h1 id="district-store-title">PLAY<br /><em>YOUR</em><br />CITY.</h1>
          <p>Ein Spieltisch. Viele Wege nach oben. Sammle Viertel, mach Deals und lass deine Stadt wachsen — direkt im Browser.</p>
          <div className="district-store-actions">
            <button type="button" className="district-store-primary" onClick={browseCollection}>
              Kollektion ansehen <ArrowUpRight size={17} />
            </button>
            <button type="button" className="district-store-secondary" onClick={onStartGame}>
              Solo spielen · 3 Bots <MoveUpRight size={16} />
            </button>
          </div>
          <div className="district-store-edition" id="store-edition">
            <span>CORE EDITION</span>
            <strong>Kostenlos im Browser</strong>
            <small>Solo: 0 weitere Menschen · 3 Bots</small>
          </div>
        </div>

        <div className="district-store-art">
          <span className="district-store-art-index">01 / THE CITY TABLE</span>
          <StoreBoardModel />
          <div className="district-store-board-spec">
            <span>40 / 80 / 120</span>
            <small>FELDER · EIN SPIEL</small>
          </div>
          <span className="district-store-scroll"><ArrowDown size={14} /> SCROLL TO EXPLORE</span>
        </div>
      </section>

      <section className="district-store-story" aria-label="Spielmerkmale">
        <span>01 — DEIN ZUG</span>
        <p>Spiele kostenlos allein gegen Bots oder triff Freunde. <b>Plus und Pro sind optionale Extras.</b></p>
        <span>KEIN PAY-TO-WIN</span>
      </section>

      <MembershipShop
        activePlan={activePlan}
        onActivateDemoPlan={onActivateDemoPlan}
        onStartSolo={onStartGame}
        onCreateRoom={onCreateRoom}
      />

      <ShopPanel currentToken={currentToken} currentColor={currentColor} onEquip={onEquip} />

      <footer className="district-store-footer">
        <button type="button" onClick={onBack}><ArrowLeft size={15} /> ARENA DISTRICTS</button>
        <span>Eine eigenständige Brettspielwelt — für große Pläne.</span>
        <a href="#district-store-title">Zurück nach oben <ArrowUpRight size={14} /></a>
      </footer>
    </main>
  );
}
