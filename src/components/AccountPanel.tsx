import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, LogIn, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { PLANS, type PlanId } from '../lib/plans';

export interface AccountProfile {
  email: string;
  displayName: string;
  ageStatus: 'unknown' | 'minor' | 'adult';
  plan: PlanId;
}

interface AccountPanelProps {
  guestReady: boolean;
  onAccountChange: (account: AccountProfile | null) => void;
  onOpenShop: () => void;
}

type AccountResponse = { authenticated: boolean; account?: AccountProfile; error?: string };

export function AccountPanel({ guestReady, onAccountChange, onOpenShop }: AccountPanelProps) {
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const response = await fetch('/.netlify/functions/auth?flow=profile');
    if (!response.ok) throw new Error('Das Profil konnte nicht geladen werden.');
    const result = await response.json() as AccountResponse;
    const nextAccount = result.authenticated ? result.account || null : null;
    setAccount(nextAccount);
    onAccountChange(nextAccount);
  }, [onAccountChange]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('account') === 'connected') {
      url.searchParams.delete('account');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      setNotice('Dein Google-Konto ist verbunden.');
    }
    refresh().catch(() => setError('Kontodaten sind momentan nicht erreichbar.')).finally(() => setLoading(false));
  }, [refresh]);

  const post = async (action: string, values: Record<string, string> = {}) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...values }),
      });
      const result = await response.json() as { success: boolean; error?: string; note?: string };
      if (!response.ok || !result.success) throw new Error(result.error || 'Die Anfrage ist fehlgeschlagen.');
      if (action === 'logout' || action === 'delete-account') {
        setAccount(null);
        onAccountChange(null);
        setNotice(result.note || (action === 'logout' ? 'Du wurdest abgemeldet.' : 'Das Konto wurde gelöscht.'));
      } else {
        await refresh();
        setNotice('Deine Angabe wurde gespeichert.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Die Anfrage ist fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const downloadExport = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/.netlify/functions/auth?flow=export');
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'Der Datenexport ist fehlgeschlagen.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'arena-districts-datenexport.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice('Dein Datenexport wurde heruntergeladen.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Der Datenexport ist fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-panel" aria-labelledby="account-panel-title">
      <div className="account-panel-heading">
        <div>
          <span className="portfolio-kicker">Konto & Mitgliedschaft</span>
          <h3 id="account-panel-title">{account ? `Hallo, ${account.displayName}` : 'Dein Fortschritt bleibt bei dir'}</h3>
        </div>
        {account && <span className="account-plan-badge">{account.plan.toUpperCase()}</span>}
      </div>

      {loading ? <p className="account-muted">Konto wird geprüft …</p> : account ? (
        <>
          <p className="account-muted">{account.email}</p>
          <div className="account-controls">
            <label>
              <span>Altersangabe für mögliche Werbung (Selbstauskunft)</span>
              <select
                value={account.ageStatus}
                disabled={busy}
                onChange={event => void post('age-status', { ageStatus: event.target.value })}
              >
                <option value="unknown">Keine Angabe</option>
                <option value="minor">Unter 18</option>
                <option value="adult">18 oder älter</option>
              </select>
            </label>
            <p className="account-privacy-note">
              Werbung wird nur nach bestätigter Einwilligung über ein zertifiziertes CMP und bei einer 18+-Selbstauskunft geladen. Eine Altersprüfung ersetzt diese Angabe nicht.
            </p>
            <div className="account-button-row">
              <button type="button" onClick={() => void downloadExport()} disabled={busy}><ArrowDownToLine size={15} /> Daten exportieren</button>
              <button type="button" onClick={() => void post('logout')} disabled={busy}><LogOut size={15} /> Abmelden</button>
              <button
                type="button"
                className="account-danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Konto und Ranglistenwert löschen? Spielraum-Daten laufen bis zur regulären Bereinigung aus.')) {
                    void post('delete-account');
                  }
                }}
              >
                <Trash2 size={15} /> Konto löschen
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="account-login-row">
          <p className="account-muted">Als Gast kannst du sofort spielen. Bei der ersten Google-Verknüpfung bleibt deine aktuelle Spieler-ID erhalten.</p>
          <button
            type="button"
            className="account-google-button"
            disabled={!guestReady || busy}
            onClick={() => { window.location.href = '/.netlify/functions/auth?flow=google-start'; }}
          >
            <LogIn size={16} /> Mit Google verbinden
          </button>
          {!guestReady && <small className="account-muted">Gast-Sitzung wird vorbereitet …</small>}
        </div>
      )}

      <details className="account-plans">
        <summary><ShieldCheck size={16} /> Mitgliedschaften ansehen</summary>
        <p className="account-privacy-note">Plus und Pro kannst du im Shop als unverbindlichen Demo-Tarif ansehen. Echte Preise und Zahlungen sind noch nicht eingerichtet.</p>
        <div className="account-plan-grid">
          {PLANS.map(plan => (
            <article key={plan.id} className={account?.plan === plan.id ? 'account-plan-card is-current' : 'account-plan-card'}>
              <div><h4>{plan.name}</h4><span>{account?.plan === plan.id ? 'Konto-Tarif' : plan.id === 'free' ? 'Immer kostenlos' : 'Demo im Shop'}</span></div>
              <p>{plan.summary}</p>
              <ul>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
              <button type="button" disabled={plan.id === 'free'} onClick={onOpenShop}>
                {plan.id === 'free' ? 'Kostenlos' : 'Im Shop ansehen'}
              </button>
            </article>
          ))}
        </div>
      </details>

      {notice && <p className="account-notice" role="status">{notice}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
    </section>
  );
}
