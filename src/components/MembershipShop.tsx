import { Check, Crown, Gem, ShieldCheck, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { PLANS, type PlanId } from '../lib/plans';

interface MembershipShopProps {
  activePlan: PlanId;
  onActivateDemoPlan: (plan: PlanId) => void;
  onStartSolo: () => void;
  onCreateRoom: () => void;
}

const PLAN_ICONS = {
  free: Zap,
  plus: Gem,
  pro: Crown,
} satisfies Record<PlanId, typeof Zap>;

export function MembershipShop({ activePlan, onActivateDemoPlan, onStartSolo, onCreateRoom }: MembershipShopProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const checkoutPlan = PLANS.find(plan => plan.id === selectedPlan);

  const confirmDemoPlan = () => {
    if (!selectedPlan || selectedPlan === 'free') return;
    onActivateDemoPlan(selectedPlan);
    setSelectedPlan(null);
  };

  return (
    <section className="district-memberships" id="zugang" aria-labelledby="membership-title">
      <header className="district-memberships-heading">
        <div>
          <span>DEIN SPIEL · DEINE EDITION</span>
          <h2 id="membership-title">Ein Tisch. <em>Dein Modus.</em></h2>
          <p>Starte kostenlos allein gegen Bots oder schau dir Plus und Pro im unverbindlichen Testkauf an.</p>
        </div>
        <span className="district-membership-note"><ShieldCheck size={16} /> Keine Spielvorteile durch Käufe</span>
      </header>

      <div className="district-game-modes">
        <article className="district-game-mode district-game-mode-classic">
          <span>SPIELMODUS 01 · KOSTENLOS</span>
          <h3>Klassik-Stadtduell</h3>
          <p>Grundstücke sichern, handeln, Häuser bauen. Das klassische Brettspielgefühl – mit deinen eigenen Vierteln und Regeln.</p>
          <button type="button" onClick={onCreateRoom}>Raum mit Freunden erstellen <span>↗</span></button>
        </article>
        <article className="district-game-mode district-game-mode-solo">
          <span>SPIELMODUS 02 · KOSTENLOS</span>
          <h3>Solo gegen Bots</h3>
          <p>Keine anderen Menschen nötig: Du spielst direkt gegen drei Bots. Ideal zum Üben oder für eine schnelle Runde.</p>
          <button type="button" onClick={onStartSolo}>Allein losspielen <Zap size={15} /></button>
        </article>
      </div>

      <div className="district-membership-grid">
        {PLANS.map(plan => {
          const Icon = PLAN_ICONS[plan.id];
          const isActive = activePlan === plan.id;
          return (
            <article
              key={plan.id}
              className={`district-membership-card district-membership-${plan.id}${isActive ? ' is-active' : ''}`}
            >
              <div className="district-membership-top">
                <span className="district-membership-icon"><Icon size={19} /></span>
                <span className="district-membership-label">{plan.id === 'free' ? 'CORE EDITION' : plan.id.toUpperCase()}</span>
                {isActive && <span className="district-membership-active"><Check size={13} /> {plan.id === 'free' ? 'BASIS' : 'DEMO AKTIV'}</span>}
              </div>
              <h3>{plan.name}</h3>
              <p className="district-membership-summary">{plan.summary}</p>
              <span className="district-membership-price">
                {plan.id === 'free' ? '0 €' : 'Preis folgt'}
                {plan.id !== 'free' && <small>pro Monat · noch nicht festgelegt</small>}
              </span>
              <ul>
                {plan.features.map(feature => <li key={feature}><Check size={14} />{feature}</li>)}
              </ul>
              {plan.id === 'free' ? (
                <button type="button" className="district-membership-action" onClick={onStartSolo}>
                  Solo starten <Zap size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  className="district-membership-action"
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {isActive ? 'Demo-Tarif ansehen' : `${plan.name} ausprobieren`}
                  <span aria-hidden="true">↗</span>
                </button>
              )}
            </article>
          );
        })}
      </div>
      <p className="district-membership-disclaimer">
        Plus und Pro sind hier ein klickbarer Prototyp. Es gibt noch keinen echten Checkout, kein Abo und keine Abbuchung.
      </p>

      {checkoutPlan && checkoutPlan.id !== 'free' && (
        <div className="district-checkout-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedPlan(null);
        }}>
          <section className="district-checkout" role="dialog" aria-modal="true" aria-labelledby="district-checkout-title">
            <button type="button" className="district-checkout-close" aria-label="Fenster schließen" onClick={() => setSelectedPlan(null)}>
              <X size={19} />
            </button>
            <span className="district-checkout-kicker">TEST-CHECKOUT · KEINE ZAHLUNG</span>
            <h2 id="district-checkout-title">{checkoutPlan.name} ansehen</h2>
            <p>{checkoutPlan.summary}</p>
            <ul>{checkoutPlan.features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
            <div className="district-checkout-price">
              <span>Monatspreis</span>
              <strong>Noch offen</strong>
            </div>
            <p className="district-checkout-disclaimer">
              Mit „Demo aktivieren“ wird nur diese Vorschau auf diesem Gerät markiert. Es wird kein Konto-Abo angelegt und kein Geld abgebucht.
            </p>
            <div className="district-checkout-actions">
              <button type="button" className="district-checkout-cancel" onClick={() => setSelectedPlan(null)}>Zurück</button>
              <button type="button" className="district-checkout-confirm" onClick={confirmDemoPlan}>Demo aktivieren</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
