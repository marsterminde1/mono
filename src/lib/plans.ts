export type PlanId = 'free' | 'plus' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  summary: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Kostenlos',
    summary: 'Starte allein oder lade Freunde an den Tisch.',
    features: ['Solo: du spielst gegen 3 Bots', 'Online-Partien mit Freunden', 'Grundregeln und Standardbrett', 'Werbung nur zwischen Partien und nach Einwilligung'],
  },
  {
    id: 'plus',
    name: 'Plus',
    summary: 'Weniger Ablenkung, mehr persönliche Looks.',
    features: ['Werbefrei spielen', 'Zusätzliche Figuren, Farben und Brettstile', 'Statistiken und Spielverlauf', 'Profilabzeichen'],
  },
  {
    id: 'pro',
    name: 'Pro',
    summary: 'Für Gruppen, die ihre eigenen Runden gestalten.',
    features: ['Alle Plus-Vorteile, inklusive werbefrei', 'Turniere und Ligen', 'Erweiterte Raumregeln und Spielgeschwindigkeit', 'Eigene Raumnamen und Replays'],
  },
];

export function effectivePlan(
  subscriptions: Array<{ plan: string; status: string; currentPeriodEnd: Date | null }>,
  now = new Date(),
): PlanId {
  const active = subscriptions.filter(subscription =>
    ['active', 'trialing'].includes(subscription.status)
    && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now),
  );
  if (active.some(subscription => subscription.plan === 'pro')) return 'pro';
  if (active.some(subscription => subscription.plan === 'plus')) return 'plus';
  return 'free';
}
