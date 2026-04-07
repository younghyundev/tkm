import https from 'node:https';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DATA_DIR } from './paths.js';

// ── Types ──

export type WeatherCondition = 'clear' | 'rain' | 'thunderstorm' | 'snow' | 'fog' | 'sandstorm' | 'cloudy';

export interface WeatherCache {
  condition: WeatherCondition;
  temp_c: number;
  location: string;
  fetched_at: number;
}

// ── Constants ──

const WEATHER_CACHE_PATH = join(DATA_DIR, 'weather-cache.json');
const SOFT_TTL = 30 * 60 * 1000;  // 30 min — refresh if older
const HARD_TTL = 60 * 60 * 1000;  // 60 min — ignore if older
const FETCH_TIMEOUT = 3000;

export const WEATHER_TYPE_BOOSTS: Record<WeatherCondition, Record<string, number>> = {
  clear:        { fire: 1.5, grass: 1.3 },
  rain:         { water: 1.5, electric: 1.3 },
  thunderstorm: { electric: 2.0, dragon: 1.5 },
  snow:         { ice: 1.5, steel: 1.3 },
  fog:          { ghost: 1.5, dark: 1.3 },
  sandstorm:    { rock: 1.5, ground: 1.3 },
  cloudy:       { normal: 1.2, flying: 1.2 },
};

export const WEATHER_LABELS: Record<WeatherCondition, { en: string; ko: string; emoji: string }> = {
  clear:        { en: 'Clear — Fire & Grass up',            ko: '맑음 — 불꽃 & 풀 타입 ↑',       emoji: '☀️' },
  rain:         { en: 'Rain — Water & Electric up',          ko: '비 — 물 & 전기 타입 ↑',         emoji: '🌧️' },
  thunderstorm: { en: 'Thunderstorm — Electric & Dragon up', ko: '뇌우 — 전기 & 드래곤 타입 ↑',   emoji: '⛈️' },
  snow:         { en: 'Snow — Ice & Steel up',               ko: '눈 — 얼음 & 강철 타입 ↑',       emoji: '❄️' },
  fog:          { en: 'Fog — Ghost & Dark up',               ko: '안개 — 고스트 & 악 타입 ↑',     emoji: '🌫️' },
  sandstorm:    { en: 'Sandstorm — Rock & Ground up',        ko: '모래폭풍 — 바위 & 땅 타입 ↑',   emoji: '🏜️' },
  cloudy:       { en: 'Cloudy — Normal & Flying up',         ko: '흐림 — 노멀 & 비행 타입 ↑',     emoji: '☁️' },
};

// ── wttr.in weather code → WeatherCondition mapping ──

export function mapWttrCondition(weatherCode: number): WeatherCondition {
  // https://www.worldweatheronline.com/weather-api/api/docs/weather-icons.aspx
  if (weatherCode === 113) return 'clear';
  if (weatherCode === 116 || weatherCode === 119 || weatherCode === 122) return 'cloudy';
  if (weatherCode === 143 || weatherCode === 248 || weatherCode === 260) return 'fog';
  if (weatherCode === 200 || weatherCode === 386 || weatherCode === 389 || weatherCode === 392 || weatherCode === 395) return 'thunderstorm';
  if (weatherCode === 227 || weatherCode === 230 || weatherCode === 323 || weatherCode === 326 ||
      weatherCode === 329 || weatherCode === 332 || weatherCode === 335 || weatherCode === 338 ||
      weatherCode === 368 || weatherCode === 371 || weatherCode === 374 || weatherCode === 377) return 'snow';
  // Rain codes (various intensity)
  if (weatherCode === 176 || weatherCode === 263 || weatherCode === 266 ||
      weatherCode === 293 || weatherCode === 296 || weatherCode === 299 || weatherCode === 302 ||
      weatherCode === 305 || weatherCode === 308 || weatherCode === 311 || weatherCode === 314 ||
      weatherCode === 317 || weatherCode === 320 ||
      weatherCode === 353 || weatherCode === 356 || weatherCode === 359 ||
      weatherCode === 362 || weatherCode === 365) return 'rain';
  return 'cloudy'; // fallback
}

// ── Cache I/O ──

export function readWeatherCache(): WeatherCache | null {
  try {
    if (!existsSync(WEATHER_CACHE_PATH)) return null;
    const raw = readFileSync(WEATHER_CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as WeatherCache;
  } catch {
    return null;
  }
}

export function writeWeatherCache(cache: WeatherCache): void {
  const dir = dirname(WEATHER_CACHE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = WEATHER_CACHE_PATH + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(cache, null, 2), 'utf-8');
  renameSync(tmpPath, WEATHER_CACHE_PATH);
}

// ── Fetch from wttr.in ──

export function fetchWeather(location: string): Promise<WeatherCache | null> {
  return new Promise((resolve) => {
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const req = https.get(url, { headers: { 'User-Agent': 'tokenmon' } }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const current = json.current_condition?.[0];
          if (!current) { resolve(null); return; }
          const weatherCode = parseInt(current.weatherCode, 10);
          const temp_c = parseInt(current.temp_C, 10);
          resolve({
            condition: mapWttrCondition(weatherCode),
            temp_c: isNaN(temp_c) ? 0 : temp_c,
            location,
            fetched_at: Date.now(),
          });
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(FETCH_TIMEOUT, () => { req.destroy(); resolve(null); });
  });
}

// ── Refresh if stale ──

export async function refreshWeatherIfStale(location: string): Promise<void> {
  const cache = readWeatherCache();
  if (cache && Date.now() - cache.fetched_at < SOFT_TTL) return;
  const fresh = await fetchWeather(location);
  if (fresh) writeWeatherCache(fresh);
}

// ── Get active weather event (for encounter system) ──

export function getWeatherEvent(locale: 'ko' | 'en'): { type_boost: Record<string, number>; label: string; emoji: string } | null {
  const cache = readWeatherCache();
  if (!cache || Date.now() - cache.fetched_at > HARD_TTL) return null;
  const boost = WEATHER_TYPE_BOOSTS[cache.condition];
  const labels = WEATHER_LABELS[cache.condition];
  if (!boost || !labels) return null;
  return {
    type_boost: boost,
    label: labels[locale] ?? labels.en,
    emoji: labels.emoji,
  };
}
