import { ArrowRight, Check, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { tokenLabel } from './TokenArt';
import type { PlayerToken } from '../types/game';

interface ShopItem {
  id: string;
  name: string;
  category: string;
  description: string;
  token: PlayerToken;
  color: string;
  accent: string;
}

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'orbit',
    name: 'Orbit Sprint',
    category: 'FIGUREN-SET · 01',
    description: 'Ein klarer, kosmischer Look für deinen nächsten Zug.',
    token: '🚀',
    color: '#8b5cf6',
    accent: '#c4b5fd',
  },
  {
    id: 'harbor',
    name: 'Harbor Club',
    category: 'FIGUREN-SET · 02',
    description: 'Kühle Hafenfarben treffen auf eine ruhige Silhouette.',
    token: '🚢',
    color: '#0891b2',
    accent: '#67e8f9',
  },
  {
    id: 'wild',
    name: 'Wild Route',
    category: 'FIGUREN-SET · 03',
    description: 'Ein warmer Naturton für deinen eigenen Weg durch die Stadt.',
    token: '🦊',
    color: '#ea580c',
    accent: '#fdba74',
  },
];

interface ShopPanelProps {
  currentToken: PlayerToken;
  currentColor: string;
  onEquip: (token: PlayerToken, color: string) => void;
}

export function ShopPanel({ currentToken, currentColor, onEquip }: ShopPanelProps) {
  const [notice, setNotice] = useState('');
  const [cartItemId, setCartItemId] = useState<string | null>(null);
  const selectedItem = SHOP_ITEMS.find(item => item.token === currentToken && item.color === currentColor);
  const cartItem = SHOP_ITEMS.find(item => item.id === cartItemId);

  return (
    <section className="district-shop" id="shop" aria-labelledby="shop-title">
      <header className="district-shop-heading">
        <div>
          <span className="portfolio-kicker">Ausrüstung für deinen nächsten Zug</span>
          <h2 id="shop-title">District Supply</h2>
          <p>Eigene Looks, gleiche Regeln. Kosmetik verändert nicht den Spielverlauf.</p>
        </div>
        <span className="district-shop-bag" aria-label="Demo-Shop">
          <ShoppingBag size={18} />
          <span>DEMO SHOP · {cartItem ? '1 ARTIKEL' : 'LEER'}</span>
        </span>
      </header>

      <div className="district-shop-grid">
        {SHOP_ITEMS.map((item, index) => {
          const equipped = selectedItem?.id === item.id;
          const inCart = cartItemId === item.id;
          return (
            <article className={`district-product${equipped ? ' is-equipped' : ''}`} key={item.id}>
              <div className={`district-product-art district-product-art-${index + 1}`} style={{ '--product-accent': item.accent } as React.CSSProperties}>
                <span className="district-product-index">0{index + 1}</span>
                <span className="district-product-orbit" aria-hidden="true" />
                <span className="district-product-token" style={{ backgroundColor: item.color }} aria-hidden="true">
                  {item.token}
                </span>
                <span className="district-product-caption">ARENA / PERSONAL KIT</span>
              </div>
              <div className="district-product-info">
                <div className="district-product-title">
                  <div>
                    <span>{item.category}</span>
                    <h3>{item.name}</h3>
                  </div>
                  {equipped && <Check size={18} aria-label="Ausgerüstet" />}
                </div>
                <p>{item.description}</p>
                <button
                  type="button"
                  className="district-product-button"
                  aria-pressed={inCart}
                  onClick={() => {
                    setCartItemId(inCart ? null : item.id);
                    setNotice(inCart ? 'Der Artikel wurde aus dem Warenkorb entfernt.' : `${item.name} liegt im Demo-Warenkorb.`);
                  }}
                >
                  {inCart ? 'Im Warenkorb' : equipped ? 'Look erneut wählen' : 'In den Warenkorb'}
                  {inCart ? <Check size={16} /> : <ArrowRight size={16} />}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="district-cart">
        <div>
          <span>DEIN WARENKORB</span>
          <strong>{cartItem ? cartItem.name : 'Noch kein Look ausgewählt'}</strong>
          <small>{cartItem ? 'Demo-Freischaltung · keine Zahlung' : 'Wähle ein Figuren-Set aus der Kollektion.'}</small>
        </div>
        <button
          type="button"
          disabled={!cartItem}
          onClick={() => {
            if (!cartItem) return;
            onEquip(cartItem.token, cartItem.color);
            setNotice(`${cartItem.name} ist im Demo-Shop ausgerüstet. Es wurde kein Geld abgebucht.`);
            setCartItemId(null);
          }}
        >
          Demo-Kauf abschließen
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="district-shop-footer">
        <p role="status">{notice || (selectedItem
          ? `${selectedItem.name} ist aktiv · ${tokenLabel(currentToken)}`
          : 'Wähle einen Look aus, um ihn für dein Profil zu übernehmen.')}</p>
        <span>Demo-Modus · keine echte Zahlung</span>
      </div>
    </section>
  );
}
