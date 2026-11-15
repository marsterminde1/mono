import { useEffect, useRef, useState } from 'react';

interface TcfConsentData {
  eventStatus?: string;
  listenerId?: number;
  gdprApplies?: boolean;
  purpose?: { consents?: Record<number, boolean> };
  vendor?: { consents?: Record<number, boolean> };
}

interface TcfApi {
  (command: 'addEventListener', version: 2, callback: (data: TcfConsentData, success: boolean) => void): void;
  (command: 'removeEventListener', version: 2, callback: (data: { listenerId?: number }, success: boolean) => void, listenerId: number): void;
}

declare global {
  interface Window {
    __tcfapi?: TcfApi;
    adsbygoogle?: Array<Record<string, never>>;
  }
}

interface AdSlotProps {
  isBetweenGames: boolean;
  adultEligible: boolean;
  isPlus: boolean;
}

const GOOGLE_TCF_VENDOR_ID = 755;

export function AdSlot({ isBetweenGames, adultEligible, isPlus }: AdSlotProps) {
  const [consentGranted, setConsentGranted] = useState(false);
  const adRef = useRef<HTMLModElement>(null);
  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID;
  const slotId = import.meta.env.VITE_ADSENSE_SLOT_ID;
  const eligible = isBetweenGames && adultEligible && !isPlus && Boolean(clientId && slotId);

  useEffect(() => {
    if (!eligible) {
      setConsentGranted(false);
      return;
    }

    let active = true;
    let listenerId: number | undefined;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setInterval> | undefined;
    const callback = (data: TcfConsentData, success: boolean) => {
      if (!active || !success) return;
      if (typeof data.listenerId === 'number') listenerId = data.listenerId;
      if (!['tcloaded', 'useractioncomplete'].includes(data.eventStatus || '')) return;
      const allowed = data.gdprApplies === false
        || (data.purpose?.consents?.[1] === true && data.vendor?.consents?.[GOOGLE_TCF_VENDOR_ID] === true);
      setConsentGranted(allowed);
    };
    const register = () => {
      if (!active || !window.__tcfapi) return false;
      window.__tcfapi('addEventListener', 2, callback);
      return true;
    };
    if (!register()) {
      retryTimer = setInterval(() => {
        attempts += 1;
        if (register() || attempts >= 20) clearInterval(retryTimer);
      }, 500);
    }
    return () => {
      active = false;
      if (retryTimer) clearInterval(retryTimer);
      if (listenerId !== undefined && window.__tcfapi) {
        window.__tcfapi('removeEventListener', 2, () => {}, listenerId);
      }
    };
  }, [eligible]);

  useEffect(() => {
    if (!eligible || !consentGranted || !clientId) return;
    const scriptId = 'arena-adsense-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      document.head.append(script);
    }
    const ad = adRef.current;
    if (!ad || ad.dataset.requested === 'true') return;
    ad.dataset.requested = 'true';
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push({});
  }, [clientId, consentGranted, eligible]);

  if (!eligible || !consentGranted) return null;
  return (
    <aside className="game-intermission-ad" aria-label="Werbung">
      <span>Werbung</span>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 90 }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
