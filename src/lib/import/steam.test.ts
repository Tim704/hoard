import { describe, expect, it } from 'vitest';

import owned from './__fixtures__/steam-owned-games.json';
import {
  formatPlaytime,
  mapSteamOwnedGames,
  ownedGames,
  parseSteamInput,
  playtimeByApp,
  STEAM_NO_GAMES_MESSAGE,
  STEAM_PRIVATE_MESSAGE,
  steamGamesProblem,
  steamIdFromVanity,
} from './sources/steam';

const ID = '76561197960287930';

describe('parseSteamInput', () => {
  it('reads SteamID64s, profile links and vanity names', () => {
    expect(parseSteamInput(ID)).toEqual({ kind: 'id', steamId: ID });
    expect(parseSteamInput(` https://steamcommunity.com/profiles/${ID}/ `)).toEqual({ kind: 'id', steamId: ID });
    expect(parseSteamInput(`steamcommunity.com/profiles/${ID}`)).toEqual({ kind: 'id', steamId: ID });
    expect(parseSteamInput('https://steamcommunity.com/id/gabelogannewell/')).toEqual({ kind: 'vanity', vanity: 'gabelogannewell' });
    expect(parseSteamInput('http://www.steamcommunity.com/id/Some_Name-1?l=german')).toEqual({ kind: 'vanity', vanity: 'Some_Name-1' });
    expect(parseSteamInput('gabelogannewell')).toEqual({ kind: 'vanity', vanity: 'gabelogannewell' });
  });

  it('rejects other links and junk', () => {
    expect(parseSteamInput('')).toBeNull();
    expect(parseSteamInput('https://steamcommunity.com/profiles/123')).toBeNull();
    expect(parseSteamInput('https://store.steampowered.com/app/620/Portal_2/')).toBeNull();
    expect(parseSteamInput('https://evil.example/id/x')).toBeNull();
    expect(parseSteamInput('has space')).toBeNull();
    expect(parseSteamInput('a')).toBeNull();
    expect(parseSteamInput('https://steamcommunity.com/id/bad name')).toBeNull();
  });

  it('treats a 17-digit number outside the individual range as a vanity name only if it fits', () => {
    // Not an individual SteamID64, but digits are a valid vanity.
    expect(parseSteamInput('12345678901234567')).toEqual({ kind: 'vanity', vanity: '12345678901234567' });
  });
});

describe('Steam API JSON', () => {
  it('resolves a vanity only on success', () => {
    expect(steamIdFromVanity({ response: { success: 1, steamid: ID } })).toBe(ID);
    expect(steamIdFromVanity({ response: { success: 42, message: 'No match' } })).toBeNull();
    expect(steamIdFromVanity({})).toBeNull();
  });

  it('sees a private profile as no games', () => {
    expect(ownedGames({ response: {} })).toBeNull();
    expect(ownedGames({ response: { game_count: 0, games: [] } })).toBeNull();
    expect(mapSteamOwnedGames({ response: {} }).rows).toEqual([]);
  });

  it('tells a private profile from one without games', () => {
    expect(steamGamesProblem({ response: {} })).toBe(STEAM_PRIVATE_MESSAGE);
    expect(steamGamesProblem({})).toBe(STEAM_PRIVATE_MESSAGE);
    expect(steamGamesProblem({ response: { game_count: 0 } })).toBe(STEAM_NO_GAMES_MESSAGE);
    expect(steamGamesProblem(owned)).toBeNull();
  });

  it('maps owned games: unplayed → Planned, played → Ongoing, never Completed', () => {
    const res = mapSteamOwnedGames(owned);
    expect(res.skipped).toBe(2);
    expect(res.rows).toEqual([
      { source: 'steam', category: 'games', title: 'Portal 2', ids: { steam: '620' }, status: 'CONSUMING', playtimeMinutes: 2412 },
      { source: 'steam', category: 'games', title: 'Hades', ids: { steam: '1145360' }, status: 'CONSUMING', playtimeMinutes: 45 },
      { source: 'steam', category: 'games', title: 'Portal', ids: { steam: '400' }, status: 'PLANNED', playtimeMinutes: 0 },
    ]);
    expect(res.rows.some((r) => r.status === 'COMPLETED')).toBe(false);
  });

  it('reads playtime by app id for the nightly refresh', () => {
    const m = playtimeByApp(owned);
    expect(m.get(620)).toBe(2412);
    expect(m.get(400)).toBe(0);
    expect(m.has(0)).toBe(false);
  });

  it('formats playtime', () => {
    expect(formatPlaytime(2400)).toBe('40 h on Steam');
    expect(formatPlaytime(90)).toBe('1.5 h on Steam');
    expect(formatPlaytime(45)).toBe('45 min on Steam');
    expect(formatPlaytime(0)).toBeNull();
    expect(formatPlaytime(null)).toBeNull();
  });
});
