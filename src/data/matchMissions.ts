import type { MatchMissionId } from '../types/game';

export const MATCH_MISSIONS: readonly {
  id: MatchMissionId;
  title: string;
  description: string;
  reward: number;
}[] = [
  {
    id: 'buy_property',
    title: 'Grundstück sichern',
    description: 'Kaufe oder ersteigere ein Grundstück.',
    reward: 50,
  },
  {
    id: 'build_house',
    title: 'Baumeister',
    description: 'Baue ein Haus oder Hotel.',
    reward: 50,
  },
  {
    id: 'pass_go',
    title: 'Runde drehen',
    description: 'Hole einmal den LOS-Bonus ab.',
    reward: 50,
  },
];
