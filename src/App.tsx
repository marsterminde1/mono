import { TokenArt, tokenLabel } from './components/TokenArt';
import { DioramaBoard } from './components/DioramaBoard';
import { ExpandedBoard } from './components/ExpandedBoard';
import { getBoardTiles } from './data/boardVariants';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameClient } from './lib/gameClient';
import { Trophy, Copy, Check, Volume2, VolumeX, Maximize, Minimize, Crown, ArrowRight, Zap, PanelRight, MoreHorizontal, X, LogOut } from 'lucide-react';
import confetti from 'canvas-confetti';
import { hasNewRoll, movementDuration, ROLL_DURATION } from './utils/gamePresentation';
import { Board } from './components/Board';
import { ThreeBoardScene } from './components/ThreeBoardScene';
import { ASSETS } from './assets/assetMap';
import { Lobby } from './components/Lobby';
import { ArenaIntro } from './components/ArenaIntro';
import { PlayerScoreboard, ActionBar } from './components/PlayerHUD';
import { PropertyPurchase } from './components/PropertyPurchase';
import { PropertyAuction } from './components/PropertyAuction';
import { CityEventPanel } from './components/CityEventPanel';
import { PropertyModal } from './components/PropertyModal';
import { TradeModal } from './components/TradeModal';
import { CardModal } from './components/CardModal';
import { GameLog } from './components/GameLog';
import { AVAILABLE_TOKENS, PLAYER_COLORS } from './data/monopolyBoard';
import { BoardTile, CityEventId, GameState, LobbyRoom, Player, PlayerToken } from './types/game';
import { playSound, toggleSound, isSoundMuted } from './utils/sound';
import { LeaderboardModal } from './components/LeaderboardModal';

import { useNotifications } from './hooks/useNotifications';
import { Notifications } from './components/Notifications';
import { TradeRequests } from './components/TradeRequests';
import { AccountPanel, type AccountProfile } from './components/AccountPanel';
import { AdSlot } from './components/AdSlot';
import { ShopPage } from './components/ShopPage';
import type { PlanId } from './lib/plans';

function readSavedPlayerProfile(): { playerName: string; token: PlayerToken; color: string } | null {
  try {
    const stored = localStorage.getItem('arena-profile');
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const profile = parsed as Record<string, unknown>;
    return {
      playerName: typeof profile.playerName === 'string' && profile.playerName.trim()
        ? profile.playerName.slice(0, 16)
        : 'Tycoon',
      token: AVAILABLE_TOKENS.find(token => token === profile.token) ?? '🎩',
      color: PLAYER_COLORS.find(color => color === profile.color) ?? PLAYER_COLORS[0],
    };
  } catch (error) {
    console.warn('Das gespeicherte Spielerprofil konnte nicht gelesen werden.', error);
    return null;
  }
}

function readDemoPlan(): PlanId {
  try {
    const saved = localStorage.getItem('arena-demo-plan');
    return saved === 'plus' || saved === 'pro' ? saved : 'free';
  } catch (error) {
    console.warn('Der lokale Demo-Tarif konnte nicht gelesen werden.', error);
    return 'free';
  }
}

export default function App() {
  const [socket, setSocket] = useState<GameClient | null>(null);
  const [view, setView] = useState<'MENU' | 'SHOP' | 'LOBBY' | 'GAME'>(() =>
    window.location.pathname.replace(/\/+$/, '') === '/shop' ? 'SHOP' : 'MENU',
  );

  // Player identity setup in Menu
  const [savedPlayerProfile] = useState(readSavedPlayerProfile);
  const [playerName, setPlayerName] = useState<string>(savedPlayerProfile?.playerName ?? 'Tycoon');
  const [playerToken, setPlayerToken] = useState<PlayerToken>(savedPlayerProfile?.token ?? '🎩');
  const [playerColor, setPlayerColor] = useState<string>(savedPlayerProfile?.color ?? PLAYER_COLORS[0]);
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [guestReady, setGuestReady] = useState(false);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [demoPlan, setDemoPlan] = useState<PlanId>(readDemoPlan);
  const { notices, notify, dismiss } = useNotifications();
  useEffect(() => { localStorage.setItem('arena-profile', JSON.stringify({ playerName, token: playerToken, color: playerColor })); }, [playerName, playerToken, playerColor]);
  useEffect(() => {
    try {
      localStorage.setItem('arena-demo-plan', demoPlan);
    } catch (error) {
      console.warn('Der lokale Demo-Tarif konnte nicht gespeichert werden.', error);
    }
  }, [demoPlan]);
  const tradeOpenRef = useRef(false);
  const tradeActionLocks = useRef(new Set<string>());
  const [copiedLink, setCopiedLink] = useState(false);
  const [soundMuted, setSoundMutedState] = useState(isSoundMuted());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDiceSettling, setIsDiceSettling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [rollValues, setRollValues] = useState<[number, number]>([1, 1]);
  const [isRollingDice, setIsRollingDice] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<'players' | 'log'>('players');
  const [boardMode, setBoardMode] = useState<'Stadt' | '3D' | '2D'>('Stadt');
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // Active room data
  const [lobbyData, setLobbyData] = useState<LobbyRoom | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [liveGameState, setLiveGameState] = useState<GameState | null>(null);

  // Modals
  const [dismissedPurchase, setDismissedPurchase] = useState<string | null>(null);
  const [dismissedAuction, setDismissedAuction] = useState<string | null>(null);
  const [inspectedTile, setInspectedTile] = useState<BoardTile | null>(null);
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  tradeOpenRef.current = isTradeModalOpen;

  useEffect(() => {
    const syncPage = () => {
      setView(window.location.pathname.replace(/\/+$/, '') === '/shop' ? 'SHOP' : 'MENU');
    };
    window.addEventListener('popstate', syncPage);
    return () => window.removeEventListener('popstate', syncPage);
  }, []);

  const openShop = () => {
    if (window.location.pathname.replace(/\/+$/, '') !== '/shop') {
      window.history.pushState(null, '', '/shop');
    }
    setView('SHOP');
  };

  const returnToMenu = () => {
    if (window.location.pathname.replace(/\/+$/, '') === '/shop') {
      window.history.pushState(null, '', '/');
    }
    setView('MENU');
  };

  // Connect to the game API
  useEffect(() => {
    const s = new GameClient();
    let gameStarted = false;
    let victoryShown = false;
    let previousState: GameState | null = null;
    let presentation = Promise.resolve();
    let receivedRoom = '';
    const seenLogs = new Set<string>();
    let disposed = false;
    const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    s.on('error', (message: string) => { notify(message, 'error'); setIsRollingDice(false); setIsDiceSettling(false); });
    s.on('connect', () => setGuestReady(true));
    s.on('lobby:joined', () => setView('LOBBY'));

    s.on('lobby:update', (updatedLobby: LobbyRoom) => {
      setLobbyData(updatedLobby);
      const me = updatedLobby.players.find((p) => p.id === s.id);
      if (me) setCurrentPlayer(me);
    });

    s.on('game:started', () => {
      setView('GAME');
      if (!gameStarted) playSound('money');
      gameStarted = true;
    });

    s.on('game:state', (state: GameState) => {
      setLiveGameState(state);
      const initial = receivedRoom !== state.roomId;
      if (initial) { receivedRoom = state.roomId; seenLogs.clear(); }
      const cursorKey = `monopoly-notices:${s.id}:${state.roomId}`;
      const resumeIndex = initial ? state.logs.findIndex(entry => entry.id === sessionStorage.getItem(cursorKey)) : -1;
      for (const [entryIndex, entry] of state.logs.entries()) {
        if (seenLogs.has(entry.id)) continue;
        seenLogs.add(entry.id);
        if (initial && (resumeIndex < 0 || entryIndex <= resumeIndex)) continue;
        if (entry.type === 'chat' && entry.mentionIds?.includes(s.id) && entry.playerId !== s.id) {
          notify(`${entry.playerName || 'Ein Spieler'} erwähnt dich: ${entry.message}`, 'info', `${state.roomId}:${entry.id}`);
        } else if (entry.type === 'trade' && entry.participantIds?.includes(s.id)) {
          notify(entry.message, entry.tradeStatus === 'ACCEPTED' ? 'success' : entry.tradeStatus === 'CANCELLED' ? 'error' : 'info', `${state.roomId}:${entry.id}`);
        } else if ((entry.playerId === s.id && ['purchase', 'system', 'jail'].includes(entry.type)) || (entry.participantIds?.includes(s.id) && (entry.participantIds?.length || 0) > 1)) {
          notify(entry.message, entry.type === 'purchase' ? 'success' : 'info', `${state.roomId}:${entry.id}`);
        }
      }
      const latestLog = state.logs.at(-1);
      if (latestLog) sessionStorage.setItem(cursorKey, latestLog.id);
      presentation = presentation.then(async () => {
        if (disposed) return;
        if (previousState?.roomId !== state.roomId) previousState = null;
        const rolled = !tradeOpenRef.current && previousState && hasNewRoll(previousState, state);
        const moveTime = !tradeOpenRef.current && previousState ? movementDuration(previousState, state) : 0;
        if (rolled) {
          setRollValues(state.dice);
          setIsRollingDice(true);
          playSound('roll');
          await pause(ROLL_DURATION);
          if (disposed) return;
        }
        setRollValues(state.dice);
        if (rolled) {
          setIsDiceSettling(true);
          setIsRollingDice(false);
          await pause(650);
          if (disposed) return;
          setIsDiceSettling(false);
        }
        setIsRollingDice(false);
        setIsMoving(moveTime > 0);
        setGameState(state);
        const me = state.players.find(p => p.id === s.id);
        if (me) setCurrentPlayer(me);
        previousState = state;
        if (moveTime) await pause(moveTime + 100);
        if (disposed) return;
        setIsMoving(false);
        if (state.pendingCard && !tradeOpenRef.current) await pause(1800);
        if (disposed) return;
        if (state.phase !== 'GAME_OVER') victoryShown = false;
        if (state.phase === 'GAME_OVER' && !victoryShown) {
          victoryShown = true;
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
          playSound('victory');
        }
      });
    });

    s.on('lobby:kicked', () => {
      setView('MENU');
      setLobbyData(null);
      setCurrentPlayer(null);
      setGameState(null);
      setLiveGameState(null);
      notify('Du bist nicht mehr in diesem Raum.', 'error');
    });

    setSocket(s);

    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);

    return () => {
      disposed = true;
      setGuestReady(false);
      s.disconnect();
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const triggerError = useCallback((msg: string) => { notify(msg, 'error'); }, [notify]);

  const handleToggleFullscreen = () => {
    playSound('click');
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleToggleSound = () => {
    const muted = toggleSound();
    setSoundMutedState(muted);
    if (!muted) playSound('click');
  };

  // 1. Create Room
  const handleCreateRoom = () => {
    if (!socket) return;
    playSound('click');
    socket.emit(
      'lobby:create',
      {
        playerName: playerName.trim() || 'Host',
        token: playerToken,
        color: playerColor,
      },
      (res: any) => {
        if (res.success) {
          setLobbyData(res.lobby);
          setCurrentPlayer(res.player);
          setView('LOBBY');
        } else {
          triggerError(res.error || 'Der Raum konnte nicht erstellt werden.');
        }
      }
    );
  };

  // 2. Join Room
  const handleJoinRoom = () => {
    if (!socket) return;
    if (!joinRoomCode.trim()) {
      triggerError('Gib den Raumcode aus deiner Einladung ein.');
      return;
    }
    playSound('click');
    socket.emit(
      'lobby:join',
      {
        roomId: joinRoomCode.trim().toUpperCase(),
        playerName: playerName.trim() || 'Player',
        token: playerToken,
        color: playerColor,
      },
      (res: any) => {
        if (res.success) {
          setLobbyData(res.lobby);
          setCurrentPlayer(res.player);
          if (res.gameState) {
            setGameState(res.gameState);
            setView('GAME');
          } else {
            setView('LOBBY');
          }
        } else {
          triggerError(res.error || 'Der Beitritt ist fehlgeschlagen. Prüfe den Raumcode.');
        }
      }
    );
  };

  // 3. Quick Play (Create room + 3 bots + start)
  const handleQuickPlay = () => {
    if (!socket) return;
    playSound('click');
    socket.emit(
      'lobby:create',
      {
        playerName: playerName.trim() || 'Tycoon',
        token: playerToken,
        color: playerColor,
      },
      (res: any) => {
        if (res.success) {
          const roomId = res.roomId;
          setLobbyData(res.lobby);
          setCurrentPlayer(res.player);

          // Add 3 bots sequentially then start
          socket.emit('lobby:add_bot', { roomId }, (result: any) => {
            if (!result.success) return;
            socket.emit('lobby:add_bot', { roomId }, (result: any) => {
              if (!result.success) return;
              socket.emit('lobby:add_bot', { roomId }, (result: any) => {
              if (!result.success) return;
                socket.emit('game:start', { roomId });
              });
            });
          });
        } else {
          triggerError(res.error || 'Das Schnellspiel konnte nicht gestartet werden.');
        }
      }
    );
  };

  // Lobby operations
  const handleReadyToggle = (ready: boolean) => {
    if (!socket || !lobbyData) return;
    socket.emit('lobby:ready', { roomId: lobbyData.roomId, ready });
  };

  const handleUpdateProfile = (token: PlayerToken, color: string, name: string) => {
    if (!socket || !lobbyData) return Promise.resolve(false);
    return new Promise<boolean>(resolve => socket.emit('lobby:update_player', { roomId: lobbyData.roomId, token, color, name }, (result: any) => {
      if (!result.success) triggerError(result.error || 'Dein Profil konnte nicht gespeichert werden.');
      resolve(Boolean(result.success));
    }));
  };

  const handleUpdateSettings = (settings: { maxPlayers: number; turnSeconds: number; boardSize?: number; propertyBuildMode?: 'classic' | 'quick'; botDifficulty?: 'easy' | 'balanced' | 'strategic' }) => {
    if (!socket || !lobbyData) return;
    socket.emit('lobby:settings', { roomId: lobbyData.roomId, ...settings }, (res: any) => { if (!res.success) triggerError(res.error || 'Einstellung fehlgeschlagen'); });
  };

  const handleAddBot = () => {
    if (!socket || !lobbyData) return;
    socket.emit('lobby:add_bot', { roomId: lobbyData.roomId });
  };

  const handleRemovePlayer = (targetPlayerId: string) => {
    if (!socket || !lobbyData) return;
    socket.emit('lobby:remove_player', { roomId: lobbyData.roomId, targetPlayerId });
  };

  const handleStartGame = () => {
    if (!socket || !lobbyData) return;
    socket.emit('game:start', { roomId: lobbyData.roomId }, (res: any) => {
      if (res && !res.success) {
        triggerError(res.error || 'Die Runde konnte nicht gestartet werden.');
      }
    });
  };

  const handleLeaveLobby = () => {
    if (lobbyData) socket?.emit('lobby:leave', { roomId: lobbyData.roomId });
    setView('MENU');
    setLobbyData(null);
    setCurrentPlayer(null);
    setGameState(null);
    setLiveGameState(null);
    setIsTradeModalOpen(false);
  };

  // In-Game Socket Operations
  const handleRollDice = () => {
    if (!socket || !gameState || isRollingDice || isDiceSettling || isMoving) return;
    setIsRollingDice(true);
    socket.emit('game:roll', { roomId: gameState.roomId });
  };

  const handleBuyProperty = (tileId: number): Promise<boolean> => {
    if (!socket || !gameState) return Promise.resolve(false);
    return new Promise(resolve => socket.emit('game:buy', { roomId: gameState.roomId, tileId }, (result: any) => { if (!result.success) notify(result.error || 'Die Aktion ist fehlgeschlagen.', 'error'); resolve(Boolean(result.success)); }));
  };

  const handleDeclineProperty = (): Promise<boolean> => {
    if (!socket || !gameState) return Promise.resolve(false);
    return new Promise(resolve => socket.emit('game:decline', { roomId: gameState.roomId }, (result: any) => { if (!result.success) notify(result.error || 'Die Aktion ist fehlgeschlagen.', 'error'); resolve(Boolean(result.success)); }));
  };

  const handleAuctionBid = (amount: number): Promise<boolean> => {
    if (!socket || !gameState) return Promise.resolve(false);
    return new Promise(resolve => socket.emit('game:auction_bid', { roomId: gameState.roomId, bid: amount }, (result: any) => {
      if (!result.success) notify(result.error || 'Dein Gebot konnte nicht abgegeben werden.', 'error');
      resolve(Boolean(result.success));
    }));
  };

  const handleCityEventVote = (eventId: CityEventId) => {
    if (!socket || !gameState) return;
    socket.emit('game:city_event_vote', { roomId: gameState.roomId, eventId }, (result: any) => {
      if (!result?.success) notify(result?.error || 'Deine Stimme konnte nicht gespeichert werden.', 'error');
    });
  };

  const handlePayJailFine = () => {
    if (!socket || !gameState) return;
    socket.emit('game:pay_jail', { roomId: gameState.roomId });
  };

  const handleUseJailCard = () => {
    if (!socket || !gameState) return;
    socket.emit('game:use_jail_card', { roomId: gameState.roomId });
  };

  const handleResolveCard = () => {
    if (!socket || !gameState) return;
    socket.emit('game:resolve_card', { roomId: gameState.roomId });
  };

  const handleBuildHouse = (tileId: number) => {
    if (!socket || !gameState) return;
    socket.emit('game:build_house', { roomId: gameState.roomId, tileId });
  };

  const handleSellHouse = (tileId: number) => {
    if (!socket || !gameState) return;
    socket.emit('game:sell_house', { roomId: gameState.roomId, tileId });
  };

  const handleMortgage = (tileId: number) => {
    if (!socket || !gameState) return;
    socket.emit('game:mortgage', { roomId: gameState.roomId, tileId });
  };

  const handleUnmortgage = (tileId: number) => {
    if (!socket || !gameState) return;
    socket.emit('game:unmortgage', { roomId: gameState.roomId, tileId });
  };

  const tradeCommand = (event: string, data: object, key: string): Promise<boolean> => {
    if (!socket || !gameState || tradeActionLocks.current.has(key)) return Promise.resolve(false);
    tradeActionLocks.current.add(key);
    return new Promise(resolve => socket.emit(event, { roomId: gameState.roomId, ...data }, (result: any) => {
      tradeActionLocks.current.delete(key);
      if (!result?.success) notify(result?.error || 'Die Handelsaktion ist fehlgeschlagen.', 'error');
      resolve(Boolean(result?.success));
    }));
  };
  const handleProposeTrade = (tradeOffer: any) => tradeCommand('game:trade_propose', { tradeOffer }, 'propose');
  const handleRespondTrade = (tradeId: string, accept: boolean) => tradeCommand('game:trade_respond', { tradeId, accept }, tradeId);
  const handleCancelTrade = (tradeId?: string) => tradeCommand('game:trade_cancel', { tradeId }, tradeId || 'cancel');

  const handleEndTurn = () => {
    if (!socket || !gameState) return;
    socket.emit('game:end_turn', { roomId: gameState.roomId });
  };

  const handleDeclareBankruptcy = () => {
    if (!socket || !gameState) return;
    if (confirm('Are you sure you want to declare bankruptcy? You will be eliminated.')) {
      socket.emit('game:bankrupt', { roomId: gameState.roomId });
    }
  };

  const handleSendMessage = (message: string): Promise<boolean> => {
    if (!socket || !gameState) return Promise.resolve(false);
    return new Promise(resolve => socket.emit('game:chat', { roomId: gameState.roomId, message }, (result: any) => {
      if (!result?.success) notify(result?.error || 'Nachricht konnte nicht gesendet werden.', 'error');
      resolve(Boolean(result?.success));
    }));
  };

  const canRollNow = Boolean(
    !isRollingDice && !isDiceSettling && !isMoving && gameState?.phase === 'ROLL' &&
      currentPlayer &&
      gameState.players[gameState.activePlayerIndex]?.id === currentPlayer.id
  );

  const activeBuyer = gameState?.players[gameState.activePlayerIndex];
  const purchaseTile = gameState?.phase === 'ACTION' && activeBuyer && activeBuyer.id === currentPlayer?.id && !activeBuyer?.bankrupt
    && !gameState.properties[activeBuyer.position]?.ownerId ? getBoardTiles(gameState?.boardSize)[activeBuyer.position] : null;
  const purchaseKey = purchaseTile && gameState ? `${gameState.roomId}:${purchaseTile.id}:${gameState.logs.filter(log => log.type === 'roll').at(-1)?.id}` : null;
  const auction = gameState?.auction;
  const auctionTile = auction && gameState ? getBoardTiles(gameState.boardSize)[auction.tileId] : null;
  const auctionKey = auction && gameState ? `${gameState.roomId}:${auction.tileId}:${auction.endsAt}:${auction.currentBid}:${auction.highestBidderId || ''}` : null;
  const pendingTradeCount = (liveGameState?.pendingTrades ?? (liveGameState?.activeTrade ? [liveGameState.activeTrade] : [])).filter(t => t.toPlayerId === currentPlayer?.id).length;
  const showPurchase = Boolean(purchaseTile && purchaseKey !== dismissedPurchase && !isRollingDice && !isDiceSettling && !isMoving && !isPropertyModalOpen && !isTradeModalOpen && !isLeaderboardOpen);
  const showAuction = Boolean(auction && auctionTile && currentPlayer && auctionKey !== dismissedAuction && !isRollingDice && !isDiceSettling && !isMoving && !isPropertyModalOpen && !isTradeModalOpen && !isLeaderboardOpen);

  return (
    <div
      className={`arena-materials arena-editorial arena-glass arena-apple app-shell overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans select-none selection:bg-amber-500 selection:text-slate-950 relative ${view === 'MENU' || view === 'SHOP' ? 'menu-app-shell' : ''}`}
      style={{
        backgroundImage: view === 'MENU' || view === 'SHOP'
          ? 'radial-gradient(circle at 14% 12%, rgba(165, 144, 255, 0.17), transparent 34%), radial-gradient(circle at 87% 88%, rgba(85, 219, 232, 0.12), transparent 36%), linear-gradient(135deg, #070910, #10131d 52%, #080b12)'
          : `linear-gradient(to bottom, rgba(6, 9, 18, 0.88), rgba(6, 9, 18, 0.95)), url(${ASSETS.penthouseBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <Notifications notices={notices} dismiss={dismiss} />

      {/* Screen 1: MAIN MENU */}
      {view === 'MENU' && (
        <div className="portfolio-shell">
          <header className="portfolio-header">
            <span className="portfolio-brand">
              <span className="brand-gem" aria-hidden="true">
                <svg viewBox="0 0 32 32" fill="none">
                  <path d="M9 3h14l7 9-14 17L2 12l7-9Z" fill="url(#brand-gem-fill)" stroke="url(#brand-gem-stroke)" strokeWidth="1.5" />
                  <path d="m9 3 2 9h19M2 12h9l5 17 7-17-2-9M11 12l5-9" stroke="#fff" strokeOpacity=".64" strokeWidth="1" />
                  <defs>
                    <linearGradient id="brand-gem-fill" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#f4fbff" />
                      <stop offset=".35" stopColor="#8de5f4" />
                      <stop offset=".7" stopColor="#9b8cff" />
                      <stop offset="1" stopColor="#eef8ff" />
                    </linearGradient>
                    <linearGradient id="brand-gem-stroke" x1="3" y1="5" x2="29" y2="25" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#fff" />
                      <stop offset="1" stopColor="#8de5f4" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              ARENA DISTRICTS
            </span>
            <nav className="portfolio-nav" aria-label="Hauptnavigation">
              <a href="#spielidee">Spielidee</a>
              <a href="#bretter">Bretter</a>
              <button type="button" onClick={openShop}>Shop</button>
              <a href="#arena-profile">Mitspielen</a>
              <a href="#arena-profile">Profil</a>
            </nav>
          </header>

          <main className="portfolio-hero" id="spielidee">
            <div className="crystal-hero-art" aria-hidden="true">
              <svg viewBox="0 0 180 180" fill="none">
                <path d="m54 12 68 10 43 48-36 75-53 20-63-62 7-53 34-38Z" fill="url(#hero-gem-fill)" stroke="url(#hero-gem-stroke)" strokeWidth="2" />
                <path d="m54 12 17 45 61-35m-61 35 5 73m-5-73 94 6m-94-6-53 65m53-65 27 113m67-107-44 107m-44-20 44 20" stroke="#fff" strokeOpacity=".68" strokeWidth="1.4" />
                <path d="m54 12 17 45-53 65 7-53 34-57Zm17 45 61-35 33 48-94-13Zm0 0 94 13-44 107-50-120Zm0 0-5 73 5 47-63-62 63-58Z" fill="#fff" fillOpacity=".08" />
                <defs>
                  <linearGradient id="hero-gem-fill" x1="22" y1="22" x2="158" y2="155" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f7fdff" stopOpacity=".88" />
                    <stop offset=".3" stopColor="#8de5f4" stopOpacity=".72" />
                    <stop offset=".65" stopColor="#9b8cff" stopOpacity=".78" />
                    <stop offset="1" stopColor="#f5fbff" stopOpacity=".62" />
                  </linearGradient>
                  <linearGradient id="hero-gem-stroke" x1="18" y1="20" x2="160" y2="156" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff" />
                    <stop offset="1" stopColor="#8de5f4" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="crystal-glint crystal-glint-one" />
              <span className="crystal-glint crystal-glint-two" />
            </div>
            <div className="portfolio-hero-word">LOS!</div>
            <div className="portfolio-hero-copy">
              <span>Dein Zug.</span>
              <span>Deine Viertel. Deine Strategie.</span>
              <span>Mach die Stadt zu deiner.</span>
            </div>
          </main>

          <section className="portfolio-metrics" aria-label="Spiel auf einen Blick">
            <div><strong>3</strong><span>Brettgrößen: 40, 80 oder 120 Felder</span></div>
            <div><strong>20</strong><span>Spieler maximal pro Raum</span></div>
            <div><strong>2</strong><span>Bauvarianten: klassisch oder schnell</span></div>
          </section>

          <section className="portfolio-grid" id="bretter">
            <article className="portfolio-card featured">
              <span className="card-label">Viertel sichern</span>
              <h3>Kaufe Grundstücke. Baue deine Stadt.</h3>
              <p>Sammle passende Grundstücke, errichte Häuser und entwickle dein Viertel Schritt für Schritt.</p>
            </article>

            <article className="portfolio-card">
              <span className="card-label">Handel &amp; Taktik</span>
              <h3>Gute Deals verändern das Spiel.</h3>
              <p>Tausche Grundstücke, plane deine Züge und behalte dein Spielgeld im Blick.</p>
            </article>

            <article className="portfolio-card">
              <span className="card-label">Deine Regeln</span>
              <h3>Wähle Brett und Bauweise.</h3>
              <p>Spiele auf 40, 80 oder 120 Feldern. Im schnellen Modus darfst du schon mit zwei passenden Grundstücken bauen.</p>
            </article>
          </section>

          <section className="portfolio-showcase">
            <div className="showcase-header">
              <span className="portfolio-kicker">Drei Wege in die Stadt</span>
              <a href="#arena-profile">Spiel starten</a>
            </div>

            <div className="showcase-list">
              <div className="showcase-item accent">
                <span>01</span>
                <div>
                  <strong>Altstadt</strong>
                  <small>40 Felder · der kompakte Einstieg</small>
                </div>
              </div>
              <div className="showcase-item">
                <span>02</span>
                <div>
                  <strong>Hafenviertel</strong>
                  <small>80 Felder · mehr Raum für deine Strategie</small>
                </div>
              </div>
              <div className="showcase-item">
                <span>03</span>
                <div>
                  <strong>Metropole</strong>
                  <small>120 Felder · das große Stadtduell</small>
                </div>
              </div>
            </div>
          </section>

          <section className="portfolio-panel" id="arena-profile" tabIndex={-1}>
            <div className="portfolio-panel-header">
              <span className="portfolio-kicker">Dein Spielprofil</span>
              <span className="portfolio-status">Ohne Konto direkt mitspielen</span>
            </div>

            <div className="portfolio-selected-token">
              <div className="portfolio-token-badge"><TokenArt token={playerToken} /></div>
              <div>
                <small>Deine Spielfigur</small>
                <strong>{tokenLabel(playerToken)}</strong>
              </div>
            </div>

            <div className="portfolio-form-grid">
              <label className="portfolio-field">
                <span>Dein Spielername</span>
                <input
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Spielername"
                />
              </label>

              <div className="portfolio-field">
                <span>Wähle deine Figur</span>
                <div className="portfolio-token-grid">
                  {AVAILABLE_TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      aria-pressed={playerToken === token}
                      onClick={() => {
                        playSound('click');
                        setPlayerToken(token as PlayerToken);
                      }}
                    >
                      <TokenArt token={token} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="portfolio-field">
                <span>Figurfarbe</span>
                <div className="portfolio-color-grid">
                  {PLAYER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={playerColor === c}
                      onClick={() => {
                        playSound('click');
                        setPlayerColor(c);
                      }}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="portfolio-actions">
              <button onClick={handleCreateRoom} className="portfolio-primary">Raum erstellen <ArrowRight size={17} /></button>
              <div className="portfolio-join-row">
                <input
                  type="text"
                  maxLength={8}
                  aria-label="Raumcode"
                  onKeyDown={event => { if (event.key === 'Enter') handleJoinRoom(); }}
                  value={joinRoomCode}
                  onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                  placeholder="RAUMCODE"
                />
                <button onClick={handleJoinRoom} className="portfolio-secondary">Beitreten</button>
              </div>
            </div>

            <div className="portfolio-bottom-actions">
              <button onClick={handleQuickPlay} className="portfolio-ghost"><Zap size={15} /> Schnellspiel mit Bots</button>
              <button onClick={() => { playSound('click'); setIsLeaderboardOpen(true); }} className="portfolio-ghost subtle"><Trophy size={15} /> Bestenliste</button>
            </div>
            <AccountPanel guestReady={guestReady} onAccountChange={setAccountProfile} onOpenShop={openShop} />
          </section>

          <footer className="portfolio-footer">
            <div>
              <span>Würfle. Handle. Bau dein Viertel.</span>
            </div>
            <a href="#arena-profile">Jetzt mitspielen <ArrowRight size={15} /></a>
          </footer>
        </div>
      )}

      {view === 'SHOP' && (
        <ShopPage
          currentToken={playerToken}
          currentColor={playerColor}
          activePlan={accountProfile?.plan === 'pro' ? 'pro' : accountProfile?.plan === 'plus' ? 'plus' : demoPlan}
          onActivateDemoPlan={setDemoPlan}
          onEquip={(token, color) => {
            setPlayerToken(token);
            setPlayerColor(color);
          }}
          onBack={returnToMenu}
          onStartGame={handleQuickPlay}
          onCreateRoom={handleCreateRoom}
        />
      )}

      {/* Screen 2: LOBBY */}
      {view === 'LOBBY' && lobbyData && currentPlayer && (
        <div className="arena-lobby-scroll flex-1 flex items-start justify-center p-4 overflow-y-auto min-h-0">
          <Lobby
            lobby={lobbyData}
            currentPlayer={currentPlayer}
            onReadyToggle={handleReadyToggle}
            onUpdateProfile={handleUpdateProfile}
            onAddBot={handleAddBot}
            onRemovePlayer={handleRemovePlayer}
            onStartGame={handleStartGame}
            onLeaveLobby={handleLeaveLobby}
            onUpdateSettings={handleUpdateSettings}
          />
        </div>
      )}

      {/* Screen 3: IN GAME (Maximized Full-Viewport Grid) */}
      {view === 'GAME' && gameState && currentPlayer && (
        <div className="game-workspace h-full w-full flex flex-col overflow-hidden">
          {/* Top Sleek Header Bar */}
          <header className="game-header" inert={showPurchase || showAuction || isTradeModalOpen}>
            <div className="game-brand">
              <Crown size={18} className="text-amber-200 shrink-0" />
              <span className="game-brand-name">ARENA DISTRICTS</span>
              <button className="room-code" title="Einladungslink kopieren" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/?room=${gameState.roomId}`).then(() => {
                  setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000);
                }).catch(() => triggerError('Raumcode: ' + gameState.roomId));
              }}><span>#{gameState.roomId}</span>{copiedLink ? <Check size={12} /> : <Copy size={12} />}</button>
            </div>
            <div className="header-turn"><span>Am Zug</span><strong style={{ color: gameState.players[gameState.activePlayerIndex]?.color }}>{gameState.players[gameState.activePlayerIndex]?.name}</strong></div>
            <div className="game-header-controls">
              <span className="header-cash"><span>Bargeld</span><strong>${currentPlayer.money.toLocaleString()}</strong></span>
              <div className="view-switch" role="group" aria-label="Brettansicht">
                {(['Stadt', '3D', '2D'] as const).map(mode => <button key={mode} aria-pressed={boardMode === mode} disabled={isRollingDice || isDiceSettling || isMoving} onClick={() => setBoardMode(mode)}>{mode}</button>)}
              </div>
              <button className="sidebar-toggle header-icon-button" aria-label="Spieler und Chat öffnen" title="Spieler und Chat" aria-expanded={infoPanelOpen} aria-controls="game-info-panel" onClick={() => setInfoPanelOpen(open => !open)}><PanelRight size={17} />{pendingTradeCount > 0 && <span className="pending-trade-count" aria-label={`${pendingTradeCount} offene Handelsanfragen`}>{pendingTradeCount}</span>}</button>
              <details className="game-more">
                <summary className="header-icon-button" aria-label="Weitere Spieloptionen" title="Weitere Spieloptionen"><MoreHorizontal size={20} /></summary>
                <div className="game-more-menu">
                  <button onClick={event => { setIsLeaderboardOpen(true); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Trophy size={16} /> Rangliste</button>
                  <button onClick={handleToggleSound}>{soundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}{soundMuted ? 'Ton einschalten' : 'Ton ausschalten'}</button>
                  <button onClick={handleToggleFullscreen}>{isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}{isFullscreen ? 'Vollbild beenden' : 'Vollbild'}</button>
                  <button onClick={() => { if (confirm('Das aktuelle Spiel verlassen?')) handleLeaveLobby(); }}><LogOut size={16} /> Spiel verlassen</button>
                </div>
              </details>
            </div>
          </header>

          {/* Main Maximized Game View (Board Left, Sidebar Right) */}
          <main className="game-main" inert={showPurchase || showAuction || isTradeModalOpen}>
            {/* Center / Board Stage */}
            <section className="game-stage">
              <CityEventPanel gameState={gameState} currentPlayer={currentPlayer} onVote={handleCityEventVote} />
              {/* Maximized Board Container (3D or 2D) */}
              <div className="game-board-region">
                {boardMode === 'Stadt' ? <DioramaBoard gameState={gameState} onTileClick={tile => { setInspectedTile(tile); setIsPropertyModalOpen(true); }} /> : (gameState.boardSize ?? 40) > 40 ? (<ExpandedBoard gameState={gameState} perspective={boardMode === '3D'} onTileClick={tile => { setInspectedTile(tile); setIsPropertyModalOpen(true); }} />) : boardMode === '3D' ? (
                  <ThreeBoardScene
                    localPlayerId={currentPlayer.id}
                    gameState={gameState}
                    isRolling={isRollingDice}
                    diceValues={rollValues}
                    isDiceCloseup={isRollingDice || isDiceSettling}
                    onTileClick={(tile) => {
                      setInspectedTile(tile);
                      setIsPropertyModalOpen(true);
                    }}
                  />
                ) : (
                  <Board
                    localPlayerId={currentPlayer.id}
                    gameState={gameState}
                    canRoll={canRollNow}
                    diceValues={rollValues}
                    isRolling={isRollingDice}
                    onRollClick={handleRollDice}
                    onTileClick={(tile) => {
                      setInspectedTile(tile);
                      setIsPropertyModalOpen(true);
                    }}
                  />
                )}
              </div>

              {/* Tactical Action Bar */}
              <div inert={isRollingDice || isDiceSettling || isMoving} className={`game-actions-region ${isRollingDice || isDiceSettling || isMoving ? "opacity-50" : ""}`}>
                <ActionBar
                  gameState={gameState}
                  currentPlayer={currentPlayer}
                  activity={isRollingDice ? 'rolling' : isDiceSettling ? 'result' : isMoving ? 'moving' : null}
                  onRollDice={handleRollDice}
                  onBuyProperty={handleBuyProperty}
                  onPreviewProperty={() => setDismissedPurchase(null)}
                  onDeclineProperty={handleDeclineProperty}
                  onPayJailFine={handlePayJailFine}
                  onUseJailCard={handleUseJailCard}
                  onEndTurn={handleEndTurn}
                  onOpenTradeModal={() => setIsTradeModalOpen(true)}
                  onOpenPropertyModal={() => setIsPropertyModalOpen(true)}
                  onDeclareBankruptcy={handleDeclareBankruptcy}
                />
              </div>
            </section>

            {/* Right Maximized Sidebar (Scoreboard + Live Ticker) */}
            {infoPanelOpen && <button className="info-panel-scrim" aria-label="Spieler und Chat schließen" onClick={() => setInfoPanelOpen(false)} />}
            <aside id="game-info-panel" aria-label="Spieler und Spielverlauf" className={`game-sidebar ${infoPanelOpen ? 'is-open' : ''}`} data-tab={infoTab} onKeyDown={event => { if (event.key === 'Escape') setInfoPanelOpen(false); }}>
              <div className="info-panel-tabs">
                <button aria-pressed={infoTab === 'players'} onClick={() => setInfoTab('players')}>Spieler</button>
                <button aria-pressed={infoTab === 'log'} onClick={() => setInfoTab('log')}>Verlauf & Chat</button>
                <button className="info-panel-close" aria-label="Spieler und Chat schließen" onClick={() => setInfoPanelOpen(false)}><X size={18} /></button>
              </div>
              <div className="game-players-panel"><TradeRequests state={liveGameState || gameState} playerId={currentPlayer.id} respond={handleRespondTrade} cancel={handleCancelTrade} /><PlayerScoreboard gameState={liveGameState || gameState} currentPlayer={currentPlayer} /></div>
              <div className="game-log-panel"><GameLog players={(liveGameState || gameState).players} currentPlayerId={currentPlayer.id} logs={(liveGameState || gameState).logs} onSendMessage={handleSendMessage} /></div>
            </aside>
          </main>

          {showPurchase && purchaseTile && currentPlayer && <PropertyPurchase
            deadline={gameState.turnDeadline}
            key={purchaseKey}
            tile={purchaseTile}
            cash={gameState.players.find(player => player.id === currentPlayer.id)?.money ?? currentPlayer.money}
            onClose={() => setDismissedPurchase(purchaseKey)}
            onBuy={() => handleBuyProperty(purchaseTile.id)}
            onDecline={handleDeclineProperty}
          />}
          {showAuction && auction && auctionTile && currentPlayer && <PropertyAuction
            key={auctionKey}
            auction={auction}
            tile={auctionTile}
            currentPlayer={gameState?.players.find(player => player.id === currentPlayer.id) || currentPlayer}
            players={gameState?.players ?? []}
            onClose={() => setDismissedAuction(auctionKey)}
            onBid={handleAuctionBid}
          />}

          {/* Property Management Deed Modal */}
          {isPropertyModalOpen && !isRollingDice && !isDiceSettling && !isMoving && (
            <PropertyModal
              gameState={gameState}
              currentPlayer={currentPlayer}
              selectedTile={inspectedTile}
              onClose={() => {
                setIsPropertyModalOpen(false);
                setInspectedTile(null);
              }}
              onBuildHouse={handleBuildHouse}
              onSellHouse={handleSellHouse}
              onMortgage={handleMortgage}
              onUnmortgage={handleUnmortgage}
            />
          )}

          {/* Trade Agreement Modal */}
          {isTradeModalOpen && (
            <TradeModal
              gameState={liveGameState || gameState}
              currentPlayer={(liveGameState || gameState).players.find(p => p.id === currentPlayer.id) || currentPlayer}
              onClose={() => setIsTradeModalOpen(false)}
              onProposeTrade={handleProposeTrade}
              onRespondTrade={handleRespondTrade}
              onCancelTrade={handleCancelTrade}
            />
          )}

          {/* Card Draw Modal (Chance / Community Chest) */}
          {gameState.pendingCard && !isTradeModalOpen && !isRollingDice && !isDiceSettling && !isMoving && (
            <CardModal key={gameState.pendingCard.id}
              card={gameState.pendingCard}
              isMyTurn={
                gameState.players[gameState.activePlayerIndex]?.id === currentPlayer.id
              }
              onResolve={handleResolveCard}
            />
          )}

          {/* Game Over Celebration Modal */}
          {gameState.phase === 'GAME_OVER' && !isTradeModalOpen && (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="bg-slate-900 border-2 border-amber-400 rounded-3xl p-8 max-w-md max-h-[90vh] w-full overflow-y-auto text-center shadow-2xl space-y-4">
                <Trophy size={64} className="mx-auto text-amber-300" />
                <h2 className="text-3xl font-black text-white tracking-tight">GAME OVER!</h2>
                <p className="text-base text-amber-300 font-bold">
                  {gameState.winnerId
                    ? `${
                        gameState.players.find((p) => p.id === gameState.winnerId)?.name
                      } is the District Champion!`
                    : 'A city legend has claimed victory!'}
                </p>
                <AdSlot
                  isBetweenGames
                  adultEligible={accountProfile?.ageStatus === 'adult'}
                  isPlus={demoPlan !== 'free' || accountProfile?.plan === 'plus' || accountProfile?.plan === 'pro'}
                />
                <button
                  onClick={handleLeaveLobby}
                  className="cursor-pointer px-6 py-3 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black rounded-xl text-sm uppercase tracking-wider shadow-lg"
                >
                  Return to Main Menu
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Cloud Leaderboard Modal */}
      <LeaderboardModal
        onError={triggerError}
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
      />
    </div>
  );
}
