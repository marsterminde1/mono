import type { CityEventId } from '../types/game';

export const CITY_EVENTS: readonly {
  id: CityEventId;
  title: string;
  description: string;
  activeDescription: string;
}[] = [
  {
    id: 'city_dividend',
    title: 'Stadtfonds',
    description: 'Jede noch mitspielende Person erhält zu Rundenbeginn $25.',
    activeDescription: 'Alle noch mitspielenden Personen erhielten zu Rundenbeginn $25.',
  },
  {
    id: 'building_discount',
    title: 'Bauförderung',
    description: 'Das erste Haus, das du in der nächsten Runde baust, kostet $25 weniger.',
    activeDescription: 'Dein erstes Haus in dieser Runde kostet $25 weniger.',
  },
];
