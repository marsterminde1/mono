import type { LobbyRoom } from '../../../src/types/game.js';

export function reconcileLobbyHost(lobby: LobbyRoom) {
  let host = lobby.players.find(player => player.id === lobby.hostId && !player.isBot);
  if (!host) {
    host = lobby.players.find(player => !player.isBot);
    if (host) {
      lobby.hostId = host.id;
      host.isReady = true;
    }
  }
  for (const player of lobby.players) player.isHost = player.id === host?.id;
}
