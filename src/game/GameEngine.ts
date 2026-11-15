import { boardRules, getBoardTiles, propertyGroup } from '../data/boardVariants';
import { CHANCE_CARDS, COMMUNITY_CARDS } from '../data/monopolyBoard';
import {
  ActiveCityEvent,
  BoardTile,
  BotDifficulty,
  Card,
  CityEventId,
  GameLogEntry,
  GamePhase,
  GameState,
  Player,
  PropertyAuction,
  PropertyUpgradeMode,
  PropertyState,
  TradeOffer,
} from '../types/game';

import { playerReferences } from '../utils/playerReferences';
import type { PropertyBuildMode } from '../types/game';
import { CITY_EVENTS } from '../data/cityEvents';

export const MAX_GAME_LOGS = 200;

export function trimGameLogs(logs: GameLogEntry[]): GameLogEntry[] {
  return logs.length > MAX_GAME_LOGS ? logs.slice(-MAX_GAME_LOGS) : logs;
}

export class GameEngine {
  private state: GameState;
  private chanceDeck: Card[];
  private communityDeck: Card[];

  constructor(roomId: string, players: Player[], options: { turnSeconds?: number; boardSize?: number; propertyBuildMode?: PropertyBuildMode; propertyUpgradeMode?: PropertyUpgradeMode } = {}) {
    const rules = boardRules(options.boardSize);
    const propertyBuildMode = options.propertyBuildMode ?? 'classic';
    const propertyUpgradeMode = options.propertyUpgradeMode ?? 'standard';
    // Initialize properties state
    const properties: Record<number, PropertyState> = {};
    getBoardTiles(rules.boardSize).forEach((tile) => {
      if (tile.type === 'street' || tile.type === 'railroad' || tile.type === 'utility') {
        properties[tile.id] = {
          tileId: tile.id,
          ownerId: null,
          houses: 0,
          mortgaged: false,
        };
      }
    });

    this.chanceDeck = this.shuffle([...CHANCE_CARDS]);
    this.communityDeck = this.shuffle([...COMMUNITY_CARDS]);

    this.state = {
      roomId,
      boardSize: rules.boardSize,
      propertyBuildMode,
      propertyUpgradeMode,
      rollsTaken: 0,
      phase: 'ROLL',
      players: players.map((p) => ({
        ...p,
        money: rules.startingCash,
        position: 0,
        inJail: false,
        jailTurns: 0,
        getOutOfJailCards: 0,
        bankrupt: false,
        connected: true,
      })),
      activePlayerIndex: 0,
      dice: [1, 1],
      doublesCount: 0,
      hasRolled: false,
      properties,
      pendingCard: null,
      activeTrade: null,
      logs: [],
      auction: null,
      roundNumber: 1,
      roundStartPlayerId: players[0]?.id ?? null,
      cityEventVote: null,
      activeCityEvent: null,
      cityEventBuildDiscounts: {},
      freeParkingPot: 100,
      turnSeconds: options.turnSeconds ?? 25,
    };

    this.state.cityEventVote = this.createCityEventVote(2);
    this.syncTurnClock();
    this.addLog(`Spiel gestartet: ${rules.boardSize} Felder, $${rules.startingCash} Startgeld, ${rules.rollsPerTurn} Würfe pro Zug.`, 'system');
  }

  private get tiles() { return getBoardTiles(this.state.boardSize); }
  private get rules() { return boardRules(this.state.boardSize); }

  public snapshot() {
    const state = { ...this.state, logs: trimGameLogs(this.state.logs) };
    return { state, chanceDeck: this.chanceDeck, communityDeck: this.communityDeck };
  }

  public static restore(snapshot: ReturnType<GameEngine['snapshot']>): GameEngine {
    const engine = new GameEngine(snapshot.state.roomId, []);
    engine.state = {
      ...snapshot.state,
      logs: trimGameLogs(snapshot.state.logs),
      roundNumber: snapshot.state.roundNumber ?? 1,
      propertyUpgradeMode: snapshot.state.propertyUpgradeMode ?? 'standard',
      roundStartPlayerId: snapshot.state.roundStartPlayerId ?? snapshot.state.players[snapshot.state.activePlayerIndex]?.id ?? null,
      cityEventVote: snapshot.state.cityEventVote ?? null,
      activeCityEvent: snapshot.state.activeCityEvent ?? null,
      cityEventBuildDiscounts: snapshot.state.cityEventBuildDiscounts ?? {},
    };
    if (!engine.state.cityEventVote && engine.state.phase !== 'GAME_OVER') {
      engine.state.cityEventVote = engine.createCityEventVote((engine.state.roundNumber ?? 1) + 1);
    }
    engine.chanceDeck = snapshot.chanceDeck;
    engine.communityDeck = snapshot.communityDeck;
    return engine;
  }

  public getState(): GameState {
    return this.state;
  }

  public getActivePlayer(): Player | undefined {
    return this.state.players[this.state.activePlayerIndex];
  }

  private createCityEventVote(forRound: number) {
    const votes: Record<string, CityEventId> = {};
    for (const player of this.state.players) {
      if (!player.isBot || player.bankrupt) continue;
      const canBuild = this.tiles.some(tile => tile.type === 'street' && tile.color
        && this.canBuildOnGroup(player.id, tile.color, tile.id)
        && (this.state.properties[tile.id]?.houses ?? 0) < 5
        && player.money >= (tile.houseCost || 100));
      votes[player.id] = canBuild ? 'building_discount' : 'city_dividend';
    }
    return { forRound, votes };
  }

  public voteForCityEvent(playerId: string, eventId: CityEventId): { success: boolean; message?: string } {
    const vote = this.state.cityEventVote;
    const player = this.state.players.find(candidate => candidate.id === playerId);
    if (this.state.phase === 'GAME_OVER' || !vote) return { success: false, message: 'There is no city event vote open' };
    if (!player || player.bankrupt) return { success: false, message: 'Player cannot vote' };
    if (!CITY_EVENTS.some(event => event.id === eventId)) return { success: false, message: 'Unknown city event' };
    vote.votes[playerId] = eventId;
    return { success: true };
  }

  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  public addLog(
    message: string,
    type: GameLogEntry['type'] = 'system',
    player?: Player,
    details: Partial<Pick<GameLogEntry, 'participantIds' | 'tradeId' | 'tradeStatus'>> = {}
  ): void {
    const entry: GameLogEntry = {
      id: globalThis.crypto.randomUUID(),
      playerId: player?.id,
      participantIds: [...new Set([...(player ? [player.id] : []), ...playerReferences(message, this.state.players, type === 'chat').map(ref => ref.playerId)])],
      mentionIds: type === 'chat' ? [...new Set(playerReferences(message, this.state.players, true).map(ref => ref.playerId))] : [],
      ...details,
      timestamp: Date.now(),
      message,
      type,
      playerName: player?.name,
      playerColor: player?.color,
    };
    this.state.logs.push(entry);
    this.state.logs = trimGameLogs(this.state.logs);
  }

  // Rolling the dice
  public rollDice(playerId: string): { success: boolean; message?: string } {
    const activePlayer = this.getActivePlayer();
    if (!activePlayer || activePlayer.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }
    if (this.state.phase !== 'ROLL') {
      return { success: false, message: 'Cannot roll in this phase' };
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const isDouble = d1 === d2;
    const totalRoll = d1 + d2;
    this.state.dice = [d1, d2];
    this.state.hasRolled = true;
    if (!this.state.bonusRoll) this.state.rollsTaken = (this.state.rollsTaken ?? 0) + 1;
    this.state.bonusRoll = false;

    this.addLog(
      `${activePlayer.name} rolled ${d1} and ${d2} (${totalRoll})${isDouble ? ' - Doubles!' : ''}`,
      'roll',
      activePlayer
    );

    // Player in jail handling
    if (activePlayer.inJail) {
      this.state.rollsTaken = this.rules.rollsPerTurn;
      if (isDouble) {
        activePlayer.inJail = false;
        activePlayer.jailTurns = 0;
        this.state.doublesCount = 0;
        this.addLog(`${activePlayer.name} rolled doubles and broke out of Jail!`, 'jail', activePlayer);
        this.movePlayer(activePlayer, totalRoll);
      } else {
        activePlayer.jailTurns++;
        if (activePlayer.jailTurns >= 3) {
          this.addLog(
            `${activePlayer.name} has spent 3 turns in Jail and pays $50 fine.`,
            'jail',
            activePlayer
          );
          this.deductMoney(activePlayer, 50);
          this.state.freeParkingPot += 50;
          activePlayer.inJail = false;
          activePlayer.jailTurns = 0;
          this.movePlayer(activePlayer, totalRoll);
        } else {
          this.addLog(
            `${activePlayer.name} failed to roll doubles and remains in Jail (Turn ${activePlayer.jailTurns}/3).`,
            'jail',
            activePlayer
          );
          this.state.phase = 'END_TURN';
        }
      }
      return { success: true };
    }

    // Normal turn (not in jail)
    if (isDouble) {
      this.state.doublesCount++;
      if (this.state.doublesCount >= 3) {
        this.addLog(
          `${activePlayer.name} rolled 3 doubles in a row and is sent directly to Jail!`,
          'jail',
          activePlayer
        );
        this.sendToJail(activePlayer);
        this.state.phase = 'END_TURN';
        return { success: true };
      }
    } else {
      this.state.doublesCount = 0;
    }

    this.movePlayer(activePlayer, totalRoll);
    return { success: true };
  }

  // Move player by spaces
  private movePlayer(player: Player, spaces: number): void {
    const oldPos = player.position;
    const newPos = (oldPos + spaces) % this.rules.boardSize;

    // Passed GO
    if (newPos < oldPos && spaces > 0) {
      player.money += this.rules.salary;
      this.addLog(`${player.name} passed GO and collected $${this.rules.salary}!`, 'system', player);
    }

    player.position = newPos;
    this.handleTileLanding(player, newPos);
  }

  // Direct move without passing GO bonus unless specified
  private moveTo(player: Player, destination: number, collectGo: boolean = true): void {
    if (collectGo && destination < player.position) {
      player.money += this.rules.salary;
      this.addLog(`${player.name} passed GO and collected $${this.rules.salary}!`, 'system', player);
    }
    player.position = destination;
    this.handleTileLanding(player, destination);
  }

  public sendToJail(player: Player): void {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    this.state.doublesCount = 0;
  }

  private handleTileLanding(player: Player, tileId: number): void {
    const tile = this.tiles[tileId];
    if (!tile) return;

    this.addLog(`${player.name} landed on ${tile.name}`, 'system', player);

    switch (tile.type) {
      case 'go':
        this.state.phase = 'END_TURN';
        break;

      case 'freeparking':
        if (this.state.freeParkingPot > 0) {
          const pot = this.state.freeParkingPot;
          player.money += pot;
          this.state.freeParkingPot = 50; // reset with seed
          this.addLog(
            `${player.name} landed on Free Parking and won the jackpot pot of $${pot}!`,
            'system',
            player
          );
        }
        this.state.phase = 'END_TURN';
        break;

      case 'gotojail':
        this.addLog(`${player.name} landed on Go to Jail!`, 'jail', player);
        this.sendToJail(player);
        this.state.phase = 'END_TURN';
        break;

      case 'jail':
        this.state.phase = 'END_TURN';
        break;

      case 'tax':
        const tax = tile.taxAmount || 100;
        this.deductMoney(player, tax);
        this.state.freeParkingPot += tax;
        this.addLog(`${player.name} paid $${tax} in ${tile.name}`, 'rent', player);
        this.state.phase = 'END_TURN';
        break;

      case 'chance':
        this.drawCard(player, 'chance');
        break;

      case 'community':
        this.drawCard(player, 'community');
        break;

      case 'street':
      case 'railroad':
      case 'utility':
        this.handlePropertyLanding(player, tile);
        break;

      default:
        this.state.phase = 'END_TURN';
        break;
    }
  }

  private handlePropertyLanding(player: Player, tile: BoardTile): void {
    const propState = this.state.properties[tile.id];
    if (!propState) {
      this.state.phase = 'END_TURN';
      return;
    }

    // Unowned property
    if (!propState.ownerId) {
      this.state.phase = 'ACTION';
      this.state.lastActionPrompt = `Would you like to buy ${tile.name} for $${tile.price}?`;
      return;
    }

    // Owned by self
    if (propState.ownerId === player.id) {
      this.addLog(`${player.name} owns this property. No rent due.`, 'system', player);
      this.state.phase = 'END_TURN';
      return;
    }

    // Owned by someone else
    const owner = this.state.players.find((p) => p.id === propState.ownerId);
    if (!owner || owner.bankrupt) {
      this.state.phase = 'END_TURN';
      return;
    }

    if (propState.mortgaged) {
      this.addLog(`${tile.name} is mortgaged. No rent collected.`, 'system', player);
      this.state.phase = 'END_TURN';
      return;
    }

    // Calculate rent
    const rent = this.calculateRent(tile, propState, owner);
    this.addLog(`${player.name} paid $${rent} rent to ${owner.name}`, 'rent', player, { participantIds: [player.id, owner.id] });
    this.transferMoney(player, owner, rent);
    this.state.phase = 'END_TURN';
  }

  public calculateRent(tile: BoardTile, propState: PropertyState, owner: Player): number {
    if (tile.type === 'street') {
      const houses = propState.houses;
      if (propState.landmark && houses === 5 && tile.rent?.[5] !== undefined) {
        return Math.round(tile.rent[5] * 1.5);
      }
      if (houses > 0 && tile.rent && tile.rent[houses]) {
        return tile.rent[houses];
      }
      const baseRent = tile.rent ? tile.rent[0] : 10;
      // If color monopoly owned and 0 houses, rent is double
      if (tile.color && this.hasMonopoly(owner.id, tile.color, tile.id)) {
        return baseRent * 2;
      }
      return baseRent;
    }

    if (tile.type === 'railroad') {
      const rrGroup = propertyGroup('railroad', tile.id);
      const ownedCount = rrGroup.filter(
        (id) => this.state.properties[id]?.ownerId === owner.id
      ).length;
      const scale = [25, 50, 100, 200];
      return scale[Math.min(ownedCount - 1, 3)] || 25;
    }

    if (tile.type === 'utility') {
      const utilGroup = propertyGroup('utility', tile.id);
      const ownedCount = utilGroup.filter(
        (id) => this.state.properties[id]?.ownerId === owner.id
      ).length;
      const rollSum = this.state.dice[0] + this.state.dice[1];
      const multiplier = ownedCount === 2 ? 10 : 4;
      return rollSum * multiplier;
    }

    return 0;
  }

  public hasMonopoly(playerId: string, color: string, tileId = 0): boolean {
    const group = propertyGroup(color, tileId);
    if (!group.length) return false;
    return group.every((tileId) => this.state.properties[tileId]?.ownerId === playerId);
  }

  private getBuildThreshold(color: string, tileId = 0): number {
    const group = propertyGroup(color, tileId);
    if (!group.length) return 0;
    const mode = this.state.propertyBuildMode ?? 'classic';
    return mode === 'quick' ? Math.min(2, group.length) : group.length;
  }

  private canBuildOnGroup(playerId: string, color: string, tileId = 0): boolean {
    const group = propertyGroup(color, tileId);
    if (!group.length) return false;
    const mode = this.state.propertyBuildMode ?? 'classic';
    const ownedCount = group.filter((id) => this.state.properties[id]?.ownerId === playerId).length;
    return mode === 'quick' ? ownedCount >= Math.min(2, group.length) : ownedCount >= group.length;
  }

  private drawCard(player: Player, type: 'chance' | 'community'): void {
    const deck = type === 'chance' ? this.chanceDeck : this.communityDeck;
    if (deck.length === 0) {
      if (type === 'chance') this.chanceDeck = this.shuffle([...CHANCE_CARDS]);
      else this.communityDeck = this.shuffle([...COMMUNITY_CARDS]);
    }
    const card = (type === 'chance' ? this.chanceDeck : this.communityDeck).shift()!;
    this.state.pendingCard = this.rules.boardSize === 40 || !card.description.includes('GO') ? card : { ...card, description: card.description.replaceAll('$200', `$${this.rules.salary}`) };
    this.state.phase = 'RESOLVING_CARD';
    this.addLog(`${player.name} drew a ${type === 'chance' ? 'Chance' : 'Community Chest'} card: "${card.title}"`, 'card', player);
  }

  public resolveCard(playerId: string): { success: boolean; message?: string } {
    const player = this.getActivePlayer();
    if (!player || player.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }
    const card = this.state.pendingCard;
    if (!card) {
      this.state.phase = 'END_TURN';
      return { success: true };
    }

    this.state.pendingCard = null;

    switch (card.action) {
      case 'advance_go':
        this.moveTo(player, 0, true);
        break;
      case 'advance_illinois':
        this.moveTo(player, 24, true);
        break;
      case 'advance_st_charles':
        this.moveTo(player, 11, true);
        break;
      case 'advance_nearest_railroad': {
        const rr = this.tiles.filter(t => t.type === 'railroad').map(t => t.id);
        const nextRR = rr.find((r) => r > player.position) ?? rr[0];
        this.moveTo(player, nextRR, true);
        break;
      }
      case 'advance_nearest_utility': {
        const utils = this.tiles.filter(t => t.type === 'utility').map(t => t.id);
        const nextUtil = utils.find((u) => u > player.position) ?? utils[0];
        this.moveTo(player, nextUtil, true);
        break;
      }
      case 'boardwalk':
        this.moveTo(player, 39, true);
        break;
      case 'reading_railroad':
        this.moveTo(player, 5, true);
        break;
      case 'go_back_3':
        const newPos = (player.position - 3 + this.rules.boardSize) % this.rules.boardSize;
        player.position = newPos;
        this.handleTileLanding(player, newPos);
        break;
      case 'go_to_jail':
        this.sendToJail(player);
        this.state.phase = 'END_TURN';
        break;
      case 'get_out_of_jail':
        player.getOutOfJailCards++;
        this.addLog(`${player.name} received a Get Out of Jail Free card!`, 'card', player);
        this.state.phase = 'END_TURN';
        break;
      case 'bank_dividend':
      case 'building_loan':
      case 'holiday_fund':
      case 'income_tax_refund':
      case 'life_insurance':
      case 'inherit_money':
      case 'beauty_contest':
      case 'stock_sale':
      case 'bank_error':
        player.money += card.amount || 50;
        this.addLog(`${player.name} collected $${card.amount || 50}`, 'card', player);
        this.state.phase = 'END_TURN';
        break;
      case 'doctor_fee':
      case 'hospital_fees':
      case 'school_fees':
      case 'poor_tax':
        this.deductMoney(player, card.amount || 50);
        this.state.freeParkingPot += card.amount || 50;
        this.addLog(`${player.name} paid $${card.amount || 50}`, 'card', player);
        this.state.phase = 'END_TURN';
        break;
      case 'chairman_board': {
        const amt = card.amount || 50;
        this.state.players.forEach((other) => {
          if (other.id !== player.id && !other.bankrupt) {
            this.transferMoney(player, other, amt);
            this.addLog(`${player.name} paid $${amt} to ${other.name}`, 'card', player, { participantIds: [player.id, other.id] });
          }
        });
        this.state.phase = 'END_TURN';
        break;
      }
      case 'general_repairs':
      case 'street_repairs': {
        let totalCost = 0;
        Object.entries(this.state.properties).forEach(([_, prop]) => {
          if (prop.ownerId === player.id) {
            if (prop.houses === 5) totalCost += 100;
            else totalCost += prop.houses * 25;
          }
        });
        if (totalCost > 0) {
          this.deductMoney(player, totalCost);
          this.state.freeParkingPot += totalCost;
          this.addLog(`${player.name} paid $${totalCost} for property repairs`, 'card', player);
        }
        this.state.phase = 'END_TURN';
        break;
      }
      default:
        this.state.phase = 'END_TURN';
        break;
    }

    return { success: true };
  }

  public buyProperty(playerId: string, tileId: number): { success: boolean; message?: string } {
    if (this.state.phase !== 'ACTION') return { success: false, message: 'Cannot do this in the current phase' };
    const player = this.getActivePlayer();
    if (!player || player.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }
    const tile = this.tiles[tileId];
    const propState = this.state.properties[tileId];

    if (!tile || !propState) {
      return { success: false, message: 'Invalid property' };
    }
    if (propState.ownerId) {
      return { success: false, message: 'Property already owned' };
    }
    if (player.position !== tileId) {
      return { success: false, message: 'Player not currently on this property' };
    }
    const cost = tile.price || 0;
    if (player.money < cost) {
      return { success: false, message: 'Insufficient funds' };
    }

    player.money -= cost;
    propState.ownerId = player.id;
    this.addLog(`${player.name} bought ${tile.name} for $${cost}!`, 'purchase', player);
    this.state.phase = 'END_TURN';
    return { success: true };
  }

  private botAuctionMaximum(bot: Player, tile: BoardTile) {
    const difficulty = this.botDifficulty(bot);
    const reserve = difficulty === 'easy' ? 0 : difficulty === 'strategic' ? 300 : 100;
    const basePrice = tile.price || 0;
    const group = tile.type === 'street' && tile.color ? propertyGroup(tile.color, tile.id) : [];
    const required = tile.color ? this.getBuildThreshold(tile.color, tile.id) : 0;
    const owned = group.filter(id => this.state.properties[id]?.ownerId === bot.id).length;
    const completesGroup = group.length > 0 && owned < required && owned + 1 >= required;
    const multiplier = difficulty === 'easy' ? 1.25 : difficulty === 'strategic' ? (completesGroup ? 1.75 : 1.15) : 1;
    const strategicRentValue = difficulty === 'strategic' ? (tile.rent?.[0] || 0) * 2 : 0;
    return Math.max(0, Math.min(bot.money - reserve, Math.floor(basePrice * multiplier + strategicRentValue)));
  }

  private reservedAuctionBid(playerId: string) {
    const auction = this.state.phase === 'AUCTION' ? this.state.auction : null;
    return auction?.highestBidderId === playerId ? auction.currentBid : 0;
  }

  private availableCash(player: Player) {
    return player.money - this.reservedAuctionBid(player.id);
  }

  public bidOnAuction(playerId: string, bid: number): { success: boolean; message?: string } {
    const auction = this.state.auction;
    if (this.state.phase !== 'AUCTION' || !auction) return { success: false, message: 'No auction is active' };
    if (Date.now() >= auction.endsAt) return { success: false, message: 'The auction has ended' };
    const bidder = this.state.players.find(player => player.id === playerId);
    if (!bidder || bidder.bankrupt) return { success: false, message: 'Player cannot bid' };
    if (!Number.isSafeInteger(bid)) return { success: false, message: 'Invalid bid' };
    const minimum = auction.currentBid === 0 ? auction.minimumBid : auction.currentBid + auction.increment;
    if (bid < minimum) return { success: false, message: `The next bid must be at least $${minimum}` };
    if (bid > bidder.money) return { success: false, message: 'Insufficient funds for this bid' };

    auction.currentBid = bid;
    auction.highestBidderId = bidder.id;
    const eligibleBots = this.state.players.some(player => player.isBot && !player.bankrupt
      && player.id !== bidder.id && !auction.passedBotIds.includes(player.id));
    auction.nextBotActionAt = eligibleBots ? Date.now() + 750 : null;
    const tile = this.tiles[auction.tileId];
    this.addLog(`${bidder.name} bietet $${bid} für ${tile?.name || 'das Grundstück'}.`, 'system', bidder);
    return { success: true };
  }

  private finishAuction(now: number) {
    const auction = this.state.auction!;
    const tile = this.tiles[auction.tileId];
    const winner = auction.highestBidderId
      ? this.state.players.find(player => player.id === auction.highestBidderId && !player.bankrupt)
      : undefined;
    if (tile && winner && this.state.properties[tile.id]?.ownerId === null && winner.money >= auction.currentBid) {
      winner.money -= auction.currentBid;
      this.state.properties[tile.id].ownerId = winner.id;
      this.addLog(`${winner.name} gewinnt ${tile.name} für $${auction.currentBid}.`, 'purchase', winner);
    } else {
      this.addLog(`${tile?.name || 'Das Grundstück'} wurde nicht versteigert.`, 'system');
    }
    this.state.auction = null;
    this.state.phase = 'END_TURN';
    const activePlayer = this.getActivePlayer();
    if (activePlayer?.bankrupt) this.endTurn(activePlayer.id);
    this.syncTurnClock(now);
  }

  public auctionStep(now = Date.now()) {
    const auction = this.state.auction;
    if (this.state.phase !== 'AUCTION' || !auction) return false;
    if (now >= auction.endsAt) {
      this.finishAuction(now);
      return true;
    }
    if (auction.nextBotActionAt === null || now < auction.nextBotActionAt) return false;

    const nextBid = auction.currentBid === 0 ? auction.minimumBid : auction.currentBid + auction.increment;
    const tile = this.tiles[auction.tileId];
    if (!tile) {
      this.finishAuction(now);
      return true;
    }
    const bots = this.state.players.filter(player => player.isBot && !player.bankrupt
      && player.id !== auction.highestBidderId && !auction.passedBotIds.includes(player.id));
    const willingBots = bots.filter(bot => this.botAuctionMaximum(bot, tile) >= nextBid);
    for (const bot of bots) {
      if (!willingBots.includes(bot)) auction.passedBotIds.push(bot.id);
    }
    const bot = willingBots[0];
    if (!bot) {
      auction.nextBotActionAt = null;
      return true;
    }

    auction.currentBid = nextBid;
    auction.highestBidderId = bot.id;
    this.addLog(`${bot.name} bietet $${nextBid} für ${tile.name}.`, 'system', bot);
    const anotherBotCanRespond = this.state.players.some(player => player.isBot && !player.bankrupt
      && player.id !== bot.id && !auction.passedBotIds.includes(player.id));
    auction.nextBotActionAt = anotherBotCanRespond ? now + 750 : null;
    return true;
  }

  public declineProperty(playerId: string): { success: boolean; message?: string } {
    if (this.state.phase !== 'ACTION') return { success: false, message: 'Cannot do this in the current phase' };
    const player = this.getActivePlayer();
    if (!player || player.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }
    const tile = this.tiles[player.position];
    if (!tile || !this.state.properties[tile.id] || this.state.properties[tile.id].ownerId !== null) {
      return { success: false, message: 'This property cannot be auctioned' };
    }
    const now = Date.now();
    const hasBots = this.state.players.some(candidate => candidate.isBot && !candidate.bankrupt);
    const auction: PropertyAuction = {
      tileId: tile.id,
      minimumBid: 10,
      increment: 10,
      currentBid: 0,
      highestBidderId: null,
      endsAt: now + 10_000,
      nextBotActionAt: hasBots ? now + 1_000 : null,
      passedBotIds: [],
    };
    this.state.auction = auction;
    this.state.phase = 'AUCTION';
    this.addLog(`${player.name} verzichtet auf ${tile.name}. Die Auktion startet bei $${auction.minimumBid} und endet in 10 Sekunden.`, 'system', player);
    return { success: true };
  }

  public payJailFine(playerId: string): { success: boolean; message?: string } {
    const player = this.getActivePlayer();
    if (!player || player.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }
    if (!player.inJail) {
      return { success: false, message: 'Not in jail' };
    }
    if (player.money < 50) {
      return { success: false, message: 'Insufficient funds for bail ($50)' };
    }

    player.money -= 50;
    this.state.freeParkingPot += 50;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} paid $50 fine and is released from Jail!`, 'jail', player);
    return { success: true };
  }

  public useJailCard(playerId: string): { success: boolean; message?: string } {
    const player = this.getActivePlayer();
    if (!player || player.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }
    if (!player.inJail) {
      return { success: false, message: 'Not in jail' };
    }
    if (player.getOutOfJailCards <= 0) {
      return { success: false, message: 'No Get Out of Jail Free cards' };
    }

    player.getOutOfJailCards--;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} used a Get Out of Jail Free card and was released!`, 'jail', player);
    return { success: true };
  }

  // Building houses/hotels
  public buildHouse(playerId: string, tileId: number): { success: boolean; message?: string } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    const tile = this.tiles[tileId];
    const prop = this.state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId || tile.type !== 'street' || !tile.color) {
      return { success: false, message: 'Cannot build on this property' };
    }

    const required = this.getBuildThreshold(tile.color, tile.id);
    const ownedCount = propertyGroup(tile.color, tile.id).filter((id) => this.state.properties[id]?.ownerId === playerId).length;
    if (!this.canBuildOnGroup(playerId, tile.color, tile.id)) {
      return {
        success: false,
        message: this.state.propertyBuildMode === 'quick'
          ? `You need ${required} properties in this color group before building (currently ${ownedCount}).`
          : 'You must own all properties of this color group to build',
      };
    }

    const group = propertyGroup(tile.color, tile.id);
    const hasMortgage = group.some((id) => this.state.properties[id]?.mortgaged);
    if (hasMortgage) {
      return { success: false, message: 'Cannot build while any property in the group is mortgaged' };
    }

    if (prop.houses >= 5) {
      return { success: false, message: 'Maximum improvements already reached (Hotel)' };
    }

    // Even build rule: cannot build if this property already has more houses than another in group
    const minHousesInGroup = Math.min(...group.map((id) => this.state.properties[id]?.houses ?? 0));
    if (prop.houses > minHousesInGroup) {
      return { success: false, message: 'You must build evenly across the color group' };
    }

    const hasEventDiscount = (this.state.cityEventBuildDiscounts?.[playerId] ?? 0) > 0;
    const cost = Math.max(0, (tile.houseCost || 100) - (hasEventDiscount ? 25 : 0));
    if (this.availableCash(player) < cost) {
      return { success: false, message: 'Insufficient funds' };
    }

    player.money -= cost;
    if (hasEventDiscount) this.state.cityEventBuildDiscounts![playerId]--;
    prop.houses++;
    const typeLabel = prop.houses === 5 ? 'a Hotel' : `House #${prop.houses}`;
    this.addLog(`${player.name} built ${typeLabel} on ${tile.name} for $${cost}!`, 'purchase', player);
    return { success: true };
  }

  public buildLandmark(playerId: string, tileId: number): { success: boolean; message?: string } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };
    if (this.state.propertyUpgradeMode !== 'landmark') {
      return { success: false, message: 'Landmark upgrades are disabled for this game' };
    }

    const tile = this.tiles[tileId];
    const prop = this.state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId || tile.type !== 'street' || !tile.color) {
      return { success: false, message: 'Cannot build a landmark on this property' };
    }
    if (prop.houses !== 5 || prop.landmark) {
      return { success: false, message: 'A landmark requires an unupgraded hotel' };
    }

    const group = propertyGroup(tile.color, tile.id);
    if (group.some(id => this.state.properties[id]?.ownerId !== playerId)) {
      return { success: false, message: 'A landmark requires the complete color group' };
    }
    if (group.some(id => this.state.properties[id]?.mortgaged)) {
      return { success: false, message: 'Cannot build while any property in the group is mortgaged' };
    }

    const cost = (tile.houseCost || 100) * 3;
    if (this.availableCash(player) < cost) {
      return { success: false, message: 'Insufficient funds' };
    }

    player.money -= cost;
    prop.landmark = true;
    this.addLog(`${player.name} upgraded the hotel on ${tile.name} to a landmark for $${cost}!`, 'purchase', player);
    return { success: true };
  }

  // Selling houses/hotels
  public sellHouse(playerId: string, tileId: number): { success: boolean; message?: string } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    const tile = this.tiles[tileId];
    const prop = this.state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId || tile.type !== 'street' || !tile.color) {
      return { success: false, message: 'Cannot sell on this property' };
    }

    if (prop.landmark) {
      const refund = Math.floor((tile.houseCost || 100) * 3 / 2);
      player.money += refund;
      prop.landmark = false;
      this.addLog(`${player.name} sold the landmark on ${tile.name} for $${refund}!`, 'system', player);
      return { success: true };
    }

    if (prop.houses <= 0) {
      return { success: false, message: 'No houses on this property to sell' };
    }

    const group = propertyGroup(tile.color, tile.id);
    const maxHousesInGroup = Math.max(...group.map((id) => this.state.properties[id]?.houses ?? 0));
    if (prop.houses < maxHousesInGroup) {
      return { success: false, message: 'You must sell evenly across the color group' };
    }

    const refund = Math.floor((tile.houseCost || 100) / 2);
    player.money += refund;
    prop.houses--;
    this.addLog(`${player.name} sold a house on ${tile.name} for $${refund}!`, 'system', player);
    return { success: true };
  }

  // Mortgaging
  public mortgageProperty(playerId: string, tileId: number): { success: boolean; message?: string } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    const tile = this.tiles[tileId];
    const prop = this.state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId) {
      return { success: false, message: 'Cannot mortgage this property' };
    }
    if (prop.mortgaged) {
      return { success: false, message: 'Property is already mortgaged' };
    }

    // Check if any property in color group has houses
    if (tile.color) {
      const group = propertyGroup(tile.color, tile.id);
      const hasHouses = group.some((id) => (this.state.properties[id]?.houses ?? 0) > 0 || this.state.properties[id]?.landmark);
      if (hasHouses) {
        return { success: false, message: 'Sell all buildings on this color group before mortgaging' };
      }
    }

    const mortgageValue = Math.floor((tile.price || 100) / 2);
    prop.mortgaged = true;
    player.money += mortgageValue;
    this.addLog(`${player.name} mortgaged ${tile.name} for $${mortgageValue}!`, 'system', player);
    return { success: true };
  }

  // Unmortgaging
  public unmortgageProperty(playerId: string, tileId: number): { success: boolean; message?: string } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    const tile = this.tiles[tileId];
    const prop = this.state.properties[tileId];
    if (!tile || !prop || prop.ownerId !== playerId) {
      return { success: false, message: 'Cannot unmortgage this property' };
    }
    if (!prop.mortgaged) {
      return { success: false, message: 'Property is not mortgaged' };
    }

    const cost = Math.floor(((tile.price || 100) / 2) * 1.1); // 10% interest
    if (this.availableCash(player) < cost) {
      return { success: false, message: 'Insufficient funds to unmortgage' };
    }

    player.money -= cost;
    prop.mortgaged = false;
    this.addLog(`${player.name} unmortgaged ${tile.name} for $${cost}!`, 'system', player);
    return { success: true };
  }

  // The legacy activeTrade field remains an alias for older snapshots/clients.
  public pendingTrades(): TradeOffer[] {
    return this.state.pendingTrades ?? (this.state.activeTrade ? [this.state.activeTrade] : []);
  }

  private storeTrades(trades: TradeOffer[]) {
    this.state.pendingTrades = trades;
    this.state.activeTrade = trades[0] || null;
  }

  private finishTrade(trade: TradeOffer, status: TradeOffer['status'], message: string, player?: Player) {
    trade.status = status;
    this.storeTrades(this.pendingTrades().filter(t => t.id !== trade.id));
    this.addLog(message, 'trade', player, { tradeId: trade.id, tradeStatus: status, participantIds: [trade.fromPlayerId, trade.toPlayerId] });
  }

  // Trading
  public proposeTrade(offer: Omit<TradeOffer, 'id' | 'status'>): { success: boolean; message?: string } {
    const fromPlayer = this.state.players.find((p) => p.id === offer.fromPlayerId);
    const toPlayer = this.state.players.find((p) => p.id === offer.toPlayerId);

    if (!fromPlayer || !toPlayer) return { success: false, message: 'Invalid players in trade' };
    if (this.availableCash(fromPlayer) < offer.offeredMoney) return { success: false, message: 'Insufficient cash offered' };

    if (this.state.phase === 'GAME_OVER' || this.pendingTrades().some(t => t.fromPlayerId === offer.fromPlayerId && t.toPlayerId === offer.toPlayerId) || fromPlayer.bankrupt || toPlayer.bankrupt || fromPlayer.id === toPlayer.id ||
        ![offer.offeredMoney, offer.requestedMoney].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        ![offer.offeredProperties, offer.requestedProperties].every((ids) => Array.isArray(ids) && new Set(ids).size === ids.length) ||
        [...offer.offeredProperties, ...offer.requestedProperties].some((id) => this.state.properties[id]?.houses > 0 || this.state.properties[id]?.landmark)) {
      return { success: false, message: 'Invalid trade offer' };
    }

    // Verify properties owned
    const allOfferedOwned = offer.offeredProperties.every(
      (id) => this.state.properties[id]?.ownerId === fromPlayer.id
    );
    const allRequestedOwned = offer.requestedProperties.every(
      (id) => this.state.properties[id]?.ownerId === toPlayer.id
    );

    if (!allOfferedOwned || !allRequestedOwned) {
      return { success: false, message: 'Properties must be owned by respective traders' };
    }

    const trade: TradeOffer = {
      ...offer,
      id: globalThis.crypto.randomUUID(),
      status: 'PENDING',
    };

    this.storeTrades([...this.pendingTrades(), trade]);
    this.addLog(`${fromPlayer.name} proposed a trade with ${toPlayer.name}`, 'trade', fromPlayer, { tradeId: trade.id, tradeStatus: 'PENDING', participantIds: [fromPlayer.id, toPlayer.id] });
    return { success: true };
  }

  public respondTrade(tradeId: string, playerId: string, accept: boolean): { success: boolean; message?: string } {
    const trade = this.pendingTrades().find(t => t.id === tradeId);
    if (!trade) {
      return { success: false, message: 'Trade no longer active' };
    }
    if (trade.toPlayerId !== playerId) {
      return { success: false, message: 'You are not the recipient of this trade' };
    }

    const fromPlayer = this.state.players.find((p) => p.id === trade.fromPlayerId);
    const toPlayer = this.state.players.find((p) => p.id === trade.toPlayerId);

    if (!fromPlayer || !toPlayer) {
      this.finishTrade(trade, 'CANCELLED', 'Trade cancelled: players unavailable.');
      return { success: false, message: 'Players not found' };
    }

    if (!accept) {
      this.finishTrade(trade, 'REJECTED', `${toPlayer.name} rejected the trade offer from ${fromPlayer.name}.`, toPlayer);
      return { success: true };
    }

    if (fromPlayer.bankrupt || toPlayer.bankrupt ||
        !trade.offeredProperties.every((id) => this.state.properties[id]?.ownerId === fromPlayer.id && !this.state.properties[id].houses && !this.state.properties[id].landmark) ||
        !trade.requestedProperties.every((id) => this.state.properties[id]?.ownerId === toPlayer.id && !this.state.properties[id].houses && !this.state.properties[id].landmark)) {
      this.finishTrade(trade, 'CANCELLED', 'Trade cancelled: ownership or buildings have changed.');
      return { success: false, message: 'Trade assets have changed' };
    }

    const fromBalanceAfterTrade = fromPlayer.money - trade.offeredMoney + trade.requestedMoney;
    const toBalanceAfterTrade = toPlayer.money + trade.offeredMoney - trade.requestedMoney;
    if (fromPlayer.money < trade.offeredMoney || toPlayer.money < trade.requestedMoney
      || fromBalanceAfterTrade < this.reservedAuctionBid(fromPlayer.id)
      || toBalanceAfterTrade < this.reservedAuctionBid(toPlayer.id)) {
      this.finishTrade(trade, 'CANCELLED', 'Trade cancelled: insufficient funds to complete trade.');
      return { success: false, message: 'Insufficient funds to complete trade' };
    }

    // Execute trade
    fromPlayer.money -= trade.offeredMoney;
    toPlayer.money += trade.offeredMoney;

    toPlayer.money -= trade.requestedMoney;
    fromPlayer.money += trade.requestedMoney;

    trade.offeredProperties.forEach((id) => {
      if (this.state.properties[id]) {
        this.state.properties[id].ownerId = toPlayer.id;
      }
    });

    trade.requestedProperties.forEach((id) => {
      if (this.state.properties[id]) {
        this.state.properties[id].ownerId = fromPlayer.id;
      }
    });

    this.finishTrade(trade, 'ACCEPTED', `Trade accepted between ${fromPlayer.name} and ${toPlayer.name}!`, toPlayer);
    return { success: true };
  }

  public cancelTrade(playerId: string, tradeId?: string): { success: boolean; message?: string } {
    const trade = this.pendingTrades().find(t => (!tradeId || t.id === tradeId) && (t.fromPlayerId === playerId || t.toPlayerId === playerId));
    if (!trade) return { success: false, message: 'Trade no longer active' };
    this.finishTrade(trade, 'CANCELLED', 'Trade offer cancelled');
    return { success: true };
  }

  // Money handling helpers
  private deductMoney(player: Player, amount: number): void {
    player.money -= amount;
    if (player.money < 0) {
      this.addLog(`${player.name} is in debt! Balance: $${player.money}`, 'rent', player);
    }
  }

  private transferMoney(from: Player, to: Player, amount: number): void {
    from.money -= amount;
    to.money += amount;
    if (from.money < 0) {
      this.addLog(`${from.name} owes $${Math.abs(from.money)}! Sell assets or declare bankruptcy.`, 'rent', from);
    }
  }

  // End turn
  public endTurn(playerId: string): { success: boolean; message?: string } {
    if (this.state.phase !== 'END_TURN') return { success: false, message: 'Cannot do this in the current phase' };
    const activePlayer = this.getActivePlayer();
    if (!activePlayer || activePlayer.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }

    if (activePlayer.money < 0) return { success: false, message: 'You must settle your debt or declare bankruptcy' };

    // If active player rolled doubles and is not in jail and doublesCount < 3, roll again!
    if (
      this.state.dice[0] === this.state.dice[1] &&
      !activePlayer.inJail &&
      this.state.doublesCount > 0 &&
      this.state.doublesCount < 3
    ) {
      this.state.phase = 'ROLL';
      this.state.hasRolled = false;
      this.state.bonusRoll = true;
      this.addLog(`${activePlayer.name} rolled doubles and gets an extra turn!`, 'roll', activePlayer);
      return { success: true };
    }

    if (this.rules.rollsPerTurn > 1 && !activePlayer.inJail && !activePlayer.bankrupt && (this.state.rollsTaken ?? 0) < this.rules.rollsPerTurn) {
      this.state.phase = 'ROLL';
      this.state.hasRolled = false;
      this.addLog(`${activePlayer.name}: weiterer Wurf (${(this.state.rollsTaken ?? 0) + 1}/${this.rules.rollsPerTurn}).`, 'system', activePlayer);
      return { success: true };
    }
    this.state.rollsTaken = 0;

    // Shift to next active player
    this.state.doublesCount = 0;
    this.state.hasRolled = false;
    this.advanceToNextPlayer();
    this.state.phase = 'ROLL';
    return { success: true };
  }

  private advanceToNextPlayer(): void {
    this.state.rollsTaken = 0;
    this.state.bonusRoll = false;
    const nonBankrupt = this.state.players.filter((p) => !p.bankrupt);
    if (nonBankrupt.length <= 1) {
      this.state.phase = 'GAME_OVER';
      this.state.winnerId = nonBankrupt[0]?.id;
      this.addLog(`🏆 ${nonBankrupt[0]?.name || 'Player'} has won the game!`, 'system');
      return;
    }

    let nextIdx = (this.state.activePlayerIndex + 1) % this.state.players.length;
    while (this.state.players[nextIdx].bankrupt) {
      nextIdx = (nextIdx + 1) % this.state.players.length;
    }

    this.state.activePlayerIndex = nextIdx;
    const nextPlayer = this.state.players[nextIdx];
    this.addLog(`It is now ${nextPlayer.name}'s turn.`, 'system', nextPlayer);
    const roundStartPlayer = this.state.players.find(player => player.id === this.state.roundStartPlayerId);
    if (!roundStartPlayer || roundStartPlayer.bankrupt) {
      this.state.roundStartPlayerId = nextPlayer.id;
    } else if (nextPlayer.id === roundStartPlayer.id) {
      this.resolveCityEventRound(nextPlayer);
    }
  }

  private resolveCityEventRound(nextPlayer: Player) {
    const nextRound = (this.state.roundNumber ?? 1) + 1;
    const counts = new Map<CityEventId, number>(CITY_EVENTS.map(event => [event.id, 0]));
    for (const [playerId, eventId] of Object.entries(this.state.cityEventVote?.votes ?? {})) {
      const voter = this.state.players.find(player => player.id === playerId);
      const event = CITY_EVENTS.find(candidate => candidate.id === eventId);
      if (voter && !voter.bankrupt && event) counts.set(event.id, (counts.get(event.id) ?? 0) + 1);
    }

    let selectedEvent = CITY_EVENTS[0];
    let highestVotes = -1;
    for (const event of CITY_EVENTS) {
      const votes = counts.get(event.id) ?? 0;
      if (votes > highestVotes) {
        selectedEvent = event;
        highestVotes = votes;
      }
    }

    const activeEvent: ActiveCityEvent = { id: selectedEvent.id, round: nextRound };
    this.state.roundNumber = nextRound;
    this.state.roundStartPlayerId = nextPlayer.id;
    this.state.activeCityEvent = activeEvent;
    this.state.cityEventBuildDiscounts = {};
    if (activeEvent.id === 'city_dividend') {
      for (const player of this.state.players) {
        if (!player.bankrupt) player.money += 25;
      }
    } else {
      for (const player of this.state.players) {
        if (!player.bankrupt) this.state.cityEventBuildDiscounts[player.id] = 1;
      }
    }
    this.addLog(`${selectedEvent.title} gilt in Runde ${nextRound}: ${selectedEvent.description}`, 'system');
    this.state.cityEventVote = this.createCityEventVote(nextRound + 1);
  }

  // Bankruptcy
  public declareBankruptcy(playerId: string): { success: boolean; message?: string } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    player.bankrupt = true;
    if (this.state.auction?.highestBidderId === playerId) {
      this.state.auction.currentBid = 0;
      this.state.auction.highestBidderId = null;
      this.state.auction.passedBotIds = this.state.auction.passedBotIds.filter(id => id !== playerId);
      this.state.auction.nextBotActionAt = this.state.players.some(candidate => candidate.isBot && !candidate.bankrupt)
        ? Date.now() + 750
        : null;
      this.addLog(`${player.name} scheidet aus; die Auktion startet wieder beim Mindestgebot.`, 'system', player);
    }
    for (const trade of [...this.pendingTrades()]) {
      if ([trade.fromPlayerId, trade.toPlayerId].includes(playerId)) this.finishTrade(trade, 'CANCELLED', 'Trade cancelled: player eliminated.');
    }
    this.addLog(`💀 ${player.name} has declared bankruptcy and is eliminated!`, 'bankrupt', player);

    // Release properties to bank
    Object.values(this.state.properties).forEach((prop) => {
      if (prop.ownerId === playerId) {
        prop.ownerId = null;
        prop.houses = 0;
        prop.landmark = false;
        prop.mortgaged = false;
      }
    });

    const nonBankrupt = this.state.players.filter((p) => !p.bankrupt);
    if (nonBankrupt.length <= 1) {
      this.state.phase = 'GAME_OVER';
      this.state.winnerId = nonBankrupt[0]?.id;
      this.state.auction = null;
      this.addLog(`🎉 ${nonBankrupt[0]?.name} is the last tycoon standing and wins!`, 'system');
    } else if (this.state.players[this.state.activePlayerIndex]?.id === playerId && this.state.phase !== 'AUCTION') {
      this.state.doublesCount = 0;
      this.state.hasRolled = false;
      this.state.pendingCard = null;
      this.advanceToNextPlayer();
      this.state.phase = 'ROLL';
    }

    return { success: true };
  }

  /** Persisted deadlines are checked under the room's database lock. */
  public syncTurnClock(now = Date.now()): boolean {
    const player = this.getActivePlayer();
    if (!player || player.isBot || this.state.phase === 'AUCTION' || this.state.phase === 'GAME_OVER' || this.state.turnSeconds === 0) {
      const changed = this.state.turnDeadline !== undefined;
      delete this.state.turnDeadline;
      delete this.state.turnClockKey;
      return changed;
    }
    const key = `${player.id}:${this.state.phase}:${this.state.doublesCount}:${this.state.hasRolled}:${this.state.rollsTaken ?? 0}:${this.state.bonusRoll ?? false}`;
    if (this.state.turnClockKey === key && this.state.turnDeadline !== undefined) return false;
    this.state.turnClockKey = key;
    this.state.turnDeadline = now + (this.state.turnSeconds ?? 25) * 1000;
    return true;
  }

  public timeoutStep(now = Date.now()): boolean {
    const reset = this.syncTurnClock(now);
    if (!this.state.turnDeadline || now < this.state.turnDeadline) return reset;
    const player = this.getActivePlayer()!;
    this.addLog(`${player.name}: Zeitlimit erreicht – die Aktion wird automatisch ausgeführt.`, 'system', player);
    // Settle debt using the same legal actions available to players, then eliminate
    // only when no remaining asset can cover it. Never purchase on their behalf.
    for (let step = 0; player.money < 0 && step < 180; step++) {
      const owned = Object.values(this.state.properties).filter(p => p.ownerId === player.id);
      const built = owned.filter(p => p.houses > 0).sort((a, b) => b.houses - a.houses);
      if (built.some(p => this.sellHouse(player.id, p.tileId).success)) continue;
      if (owned.some(p => !p.mortgaged && this.mortgageProperty(player.id, p.tileId).success)) continue;
      this.declareBankruptcy(player.id);
      this.syncTurnClock(now);
      return true;
    }
    if (this.state.phase === 'ROLL') this.rollDice(player.id);
    else if (this.state.phase === 'ACTION') {
      if (!this.declineProperty(player.id).success) this.endTurn(player.id);
    } else if (this.state.phase === 'RESOLVING_CARD') {
      this.resolveCard(player.id);
      if (this.getState().phase === 'END_TURN') this.endTurn(player.id);
    } else if (this.state.phase === 'END_TURN') this.endTurn(player.id);
    this.syncTurnClock(now);
    return true;
  }

  private botDifficulty(player: Player): BotDifficulty {
    return player.botDifficulty ?? 'balanced';
  }

  private botPortfolioValue(playerId: string, ownershipOverrides = new Map<number, string | null>()) {
    const owns = (tileId: number) => ownershipOverrides.has(tileId)
      ? ownershipOverrides.get(tileId) === playerId
      : this.state.properties[tileId]?.ownerId === playerId;
    let value = this.tiles.reduce((sum, tile) => {
      if (!owns(tile.id) || !this.state.properties[tile.id]) return sum;
      const property = this.state.properties[tile.id];
      const base = (tile.price || 0) + (tile.rent?.[0] || 0) * 2;
      return sum + base * (property.mortgaged ? 0.65 : 1);
    }, 0);

    for (const tile of this.tiles) {
      if (!tile.color || !['street', 'railroad', 'utility'].includes(tile.type)) continue;
      const group = propertyGroup(tile.color, tile.id);
      if (group[0] !== tile.id) continue;
      const required = tile.type === 'street' ? this.getBuildThreshold(tile.color, tile.id) : group.length;
      if (group.filter(owns).length >= required) {
        value += group.reduce((sum, id) => sum + (this.tiles[id]?.price || 0), 0) * 0.3;
      }
    }
    return value;
  }

  public botTradeStep(tradeId: string): boolean {
    const trade = this.pendingTrades().find(candidate => candidate.id === tradeId);
    const bot = trade && this.state.players.find(player => player.id === trade.toPlayerId);
    if (!trade || !bot?.isBot || bot.bankrupt) return false;

    const beforeValue = bot.money + this.botPortfolioValue(bot.id);
    const ownershipAfter = new Map<number, string | null>();
    for (const id of trade.offeredProperties) ownershipAfter.set(id, bot.id);
    for (const id of trade.requestedProperties) ownershipAfter.set(id, trade.fromPlayerId);
    const afterValue = bot.money + trade.offeredMoney - trade.requestedMoney
      + this.botPortfolioValue(bot.id, ownershipAfter);
    const netValue = afterValue - beforeValue;
    const difficulty = this.botDifficulty(bot);
    const tolerance = difficulty === 'easy' ? boardRules(this.state.boardSize).startingCash * 0.1 : 0;
    const minimumGain = difficulty === 'strategic' ? boardRules(this.state.boardSize).startingCash * 0.02 : 0;
    const accept = netValue >= minimumGain - tolerance;
    const result = this.respondTrade(trade.id, bot.id, accept);
    const completed = result.success || !this.pendingTrades().some(candidate => candidate.id === trade.id);
    if (result.success) {
      const description = netValue >= 0 ? `Vorteil ca. $${Math.round(netValue)}` : `Nachteil ca. $${Math.round(Math.abs(netValue))}`;
      this.addLog(`${bot.name} ${accept ? 'nimmt an' : 'lehnt ab'} (${description}).`, 'system', bot);
    }
    return completed;
  }

  // Bot AI decision maker
  public botStep(): boolean {
    const activePlayer = this.getActivePlayer();
    if (!activePlayer || !activePlayer.isBot || activePlayer.bankrupt) {
      return false;
    }

    if (activePlayer.money < 0) {
      const owned = Object.values(this.state.properties).filter((p) => p.ownerId === activePlayer.id);
      const built = owned.filter((p) => p.houses > 0).sort((a, b) => b.houses - a.houses);
      for (const prop of built) if (this.sellHouse(activePlayer.id, prop.tileId).success) return true;
      const mortgageCandidates = owned.filter(prop => !prop.mortgaged).sort((a, b) => {
        const penalty = (property: PropertyState) => {
          const tile = this.tiles[property.tileId];
          if (!tile?.color) return 0;
          const group = propertyGroup(tile.color, tile.id);
          const required = tile.type === 'street' ? this.getBuildThreshold(tile.color, tile.id) : group.length;
          return group.filter(id => this.state.properties[id]?.ownerId === activePlayer.id).length >= required ? 1 : 0;
        };
        return penalty(a) - penalty(b) || (this.tiles[a.tileId]?.price || 0) - (this.tiles[b.tileId]?.price || 0);
      });
      for (const prop of mortgageCandidates) if (this.mortgageProperty(activePlayer.id, prop.tileId).success) return true;
      this.declareBankruptcy(activePlayer.id);
      return true;
    }

    if (this.state.phase === 'ROLL') {
      if (activePlayer.inJail) {
        if (activePlayer.getOutOfJailCards > 0) {
          this.useJailCard(activePlayer.id);
        } else if (activePlayer.money >= 300) {
          this.payJailFine(activePlayer.id);
        }
      }
      this.rollDice(activePlayer.id);
      return true;
    }

    if (this.state.phase === 'ACTION') {
      const tile = this.tiles[activePlayer.position];
      const cost = tile?.price || 0;
      const difficulty = this.botDifficulty(activePlayer);
      const reserve = difficulty === 'easy' ? 0 : difficulty === 'strategic' ? 300 : 100;
      const group = tile?.color && tile.type === 'street' ? propertyGroup(tile.color, tile.id) : [];
      const threshold = tile?.color ? this.getBuildThreshold(tile.color, tile.id) : 0;
      const ownedInGroup = group.filter(id => this.state.properties[id]?.ownerId === activePlayer.id).length;
      const unlocksBuilding = group.length > 0 && ownedInGroup < threshold && ownedInGroup + 1 >= threshold;
      const purchaseReserve = difficulty === 'strategic' && unlocksBuilding ? 100 : reserve;
      if (activePlayer.money >= cost + purchaseReserve) {
        if (difficulty === 'strategic' && unlocksBuilding) {
          this.addLog(`${activePlayer.name} kauft ${tile?.name}, um den Hausbau in der Farbgruppe freizuschalten.`, 'system', activePlayer);
        }
        this.buyProperty(activePlayer.id, activePlayer.position);
      } else {
        if (difficulty !== 'easy') this.addLog(`${activePlayer.name} verzichtet auf ${tile?.name} und hält $${purchaseReserve} Reserve.`, 'system', activePlayer);
        this.declineProperty(activePlayer.id);
      }
      return true;
    }

    if (this.state.phase === 'RESOLVING_CARD') {
      this.resolveCard(activePlayer.id);
      return true;
    }

    if (this.state.phase === 'END_TURN') {
      const difficulty = this.botDifficulty(activePlayer);
      const reserve = difficulty === 'easy' ? 0 : difficulty === 'strategic' ? 400 : 200;
      const options = this.tiles
        .filter(tile => tile.type === 'street' && tile.color && this.canBuildOnGroup(activePlayer.id, tile.color, tile.id))
        .map(tile => {
          const property = this.state.properties[tile.id];
          const group = propertyGroup(tile.color!, tile.id);
          const lowestLevel = Math.min(...group.map(id => this.state.properties[id]?.houses ?? 0));
          const rentGain = (tile.rent?.[(property?.houses || 0) + 1] || 0) - (tile.rent?.[property?.houses || 0] || 0);
          return { tile, property, group, lowestLevel, rentGain, cost: tile.houseCost || 100 };
        })
        .filter(option => option.property
          && option.property.ownerId === activePlayer.id
          && option.property.houses === option.lowestLevel
          && option.property.houses < 5
          && option.rentGain > 0
          && !option.group.some(id => this.state.properties[id]?.mortgaged)
          && activePlayer.money >= option.cost + reserve);
      let botBuilt = false;
      if (difficulty === 'strategic') {
        options.sort((a, b) => b.rentGain / b.cost - a.rentGain / a.cost);
      }
      for (const option of options) {
        if (!this.buildHouse(activePlayer.id, option.tile.id).success) continue;
        botBuilt = true;
        if (difficulty === 'strategic') {
          this.addLog(`${activePlayer.name} baut auf ${option.tile.name}: möglicher Mehrertrag $${option.rentGain} für $${option.cost}.`, 'system', activePlayer);
          break;
        }
      }

      if (!botBuilt && this.state.propertyUpgradeMode === 'landmark') {
        const landmarkOptions = this.tiles
          .filter(tile => tile.type === 'street' && tile.color)
          .map(tile => {
            const property = this.state.properties[tile.id];
            const group = propertyGroup(tile.color!, tile.id);
            const hotelRent = tile.rent?.[5] ?? 0;
            return {
              tile,
              property,
              group,
              cost: (tile.houseCost || 100) * 3,
              rentGain: Math.round(hotelRent * 1.5) - hotelRent,
            };
          })
          .filter(option => option.property?.ownerId === activePlayer.id
            && option.property.houses === 5
            && !option.property.landmark
            && option.group.every(id => this.state.properties[id]?.ownerId === activePlayer.id)
            && !option.group.some(id => this.state.properties[id]?.mortgaged)
            && option.rentGain > 0
            && activePlayer.money >= option.cost + reserve);
        if (difficulty === 'strategic') {
          landmarkOptions.sort((a, b) => b.rentGain / b.cost - a.rentGain / a.cost);
        }
        for (const option of landmarkOptions) {
          if (!this.buildLandmark(activePlayer.id, option.tile.id).success) continue;
          if (difficulty === 'strategic') {
            this.addLog(`${activePlayer.name} errichtet auf ${option.tile.name} ein Wahrzeichen: möglicher Mehrertrag $${option.rentGain} für $${option.cost}.`, 'system', activePlayer);
          }
          break;
        }
      }

      this.endTurn(activePlayer.id);
      return true;
    }

    return false;
  }
}
