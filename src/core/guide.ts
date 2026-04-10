import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPokemonDB, getAchievementsDB, getRegionsDB, getAchievementName, getAchievementDescription, getAchievementRarityLabel, getRegionName, getRegionDescription } from './pokemon-data.js';
import { getCompletion } from './pokedex.js';
import { getCurrentRegion, getRegionList } from './regions.js';
import { getNextGym, loadGymData } from './gym.js';
import { getActiveGeneration } from './paths.js';
import { t } from '../i18n/index.js';
import type { State, Config } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIPS_PATH = join(__dirname, '../../data/tips.json');

// ANSI color helpers
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';

interface TipTemplate {
  id: string;
  category: string;
  template: string;
  template_key: string;
  dynamic: boolean;
  resolver?: string;
}

function loadTips(): TipTemplate[] {
  if (!existsSync(TIPS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(TIPS_PATH, 'utf-8')) as TipTemplate[];
  } catch {
    return [];
  }
}

// === Dynamic Resolvers ===

function resolveNextRegionUnlock(state: State, _config: Config): Record<string, string> | null {
  const regions = getRegionList(state);
  const locked = regions.find(r => !r.unlocked);
  if (!locked) return null;

  const cond = locked.region.unlock_condition;
  if (!cond) return null;

  const completion = getCompletion(state);
  const current = cond.type === 'pokedex_caught' ? completion.caught : completion.seen;
  const remaining = Math.max(0, cond.value - current);
  if (remaining === 0) return null;

  return { remaining: String(remaining), nextRegion: getRegionName(locked.region.id) };
}

function resolveCurrentRegionLevel(_state: State, config: Config): Record<string, string> | null {
  const region = getCurrentRegion(config);
  return {
    minLv: String(region.level_range[0]),
    maxLv: String(region.level_range[1]),
  };
}

function resolveNearestAchievement(state: State, _config: Config): Record<string, string> | null {
  const achDB = getAchievementsDB();
  let best: { name: string; desc: string; progress: number; target: number; ratio: number } | null = null;

  for (const ach of achDB.achievements) {
    if (state.achievements[ach.id]) continue;

    let progress = 0;
    switch (ach.trigger_type) {
      case 'session_count': progress = state.session_count; break;
      case 'error_count': progress = state.error_count; break;
      case 'evolution_count': progress = state.evolution_count; break;
      case 'total_tokens': progress = state.total_tokens_consumed; break;
      case 'permission_count': progress = state.permission_count; break;
      case 'battle_wins': progress = state.battle_wins; break;
      case 'battle_count': progress = state.battle_count; break;
      case 'catch_count': progress = state.catch_count; break;
    }

    const ratio = progress / ach.trigger_value;
    if (!best || ratio > best.ratio) {
      best = { name: getAchievementName(ach.id), desc: getAchievementDescription(ach.id), progress, target: ach.trigger_value, ratio };
    }
  }

  if (!best) return null;
  return {
    achName: best.name,
    achDesc: best.desc,
    progress: String(best.progress),
    target: String(best.target),
  };
}

function resolveWeakestPartyMember(state: State, config: Config): Record<string, string> | null {
  if (config.party.length < 2) return null;

  let weakest = { name: '', level: Infinity };
  for (const name of config.party) {
    const level = state.pokemon[name]?.level ?? 1;
    if (level < weakest.level) {
      weakest = { name, level };
    }
  }

  if (weakest.level === Infinity) return null;
  return { pokemon: weakest.name, level: String(weakest.level) };
}

function resolvePokeBallCount(state: State, _config: Config): Record<string, string> | null {
  const count = state.items?.pokeball ?? 0;
  return { count: String(count) };
}

function resolveNextGymInfo(state: State, _config: Config): Record<string, string> | null {
  const generation = getActiveGeneration();
  const gym = getNextGym(generation, state);
  if (!gym) return null;
  return { leaderName: gym.leaderKo || gym.leader, type: gym.type };
}

function resolveGymBadgeProgress(state: State, _config: Config): Record<string, string> | null {
  const generation = getActiveGeneration();
  const gyms = loadGymData(generation);
  if (gyms.length === 0) return null;
  const badgeCount = state.gym_badges?.length ?? 0;
  const total = gyms.length;
  const remaining = total - badgeCount;
  if (remaining <= 0) return null;
  return { badgeCount: String(badgeCount), remaining: String(remaining) };
}

const RESOLVERS: Record<string, (state: State, config: Config) => Record<string, string> | null> = {
  nextRegionUnlock: resolveNextRegionUnlock,
  currentRegionLevel: resolveCurrentRegionLevel,
  nearestAchievement: resolveNearestAchievement,
  weakestPartyMember: resolveWeakestPartyMember,
  pokeBallCount: resolvePokeBallCount,
  nextGymInfo: resolveNextGymInfo,
  gymBadgeProgress: resolveGymBadgeProgress,
};

// === Tip Selection ===

function resolveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function getRandomTip(state: State, config: Config): { id: string; text: string } | null {
  // 30% probability
  if (Math.random() >= 0.3) return null;

  const tips = loadTips();
  if (tips.length === 0) return null;

  // Shuffle categories and try each
  const categories = [...new Set(tips.map(tip => tip.category))];
  shuffle(categories);

  for (const cat of categories) {
    const catTips = tips.filter(tip => tip.category === cat);
    shuffle(catTips);

    for (const tip of catTips) {
      // Duplicate prevention
      if (state.last_tip?.id === tip.id) continue;

      if (!tip.dynamic) {
        return { id: tip.id, text: t(tip.template_key) };
      }

      // Dynamic tip: resolve variables
      const resolver = tip.resolver ? RESOLVERS[tip.resolver] : null;
      if (!resolver) continue;

      const vars = resolver(state, config);
      if (!vars) continue;

      return { id: tip.id, text: t(tip.template_key, vars) };
    }
  }

  return null;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// === CLI Guide Rendering ===

const GUIDE_TOPICS = ['battle', 'region', 'achievement', 'xp', 'item'] as const;
type GuideTopic = typeof GUIDE_TOPICS[number];

export function renderGuideIndex(): void {
  console.log(`${BOLD}${t('guide.index.title')}${RESET}`);
  console.log('');
  console.log(`${CYAN}${t('guide.index.usage')}${RESET}`);
  console.log('');
  console.log(`${BOLD}${t('guide.index.topics')}${RESET}`);
  console.log(t('guide.index.topic_battle'));
  console.log(t('guide.index.topic_region'));
  console.log(t('guide.index.topic_achievement'));
  console.log(t('guide.index.topic_xp'));
  console.log(t('guide.index.topic_item'));
}

export function renderGuide(topic: string): void {
  if (!GUIDE_TOPICS.includes(topic as GuideTopic)) {
    console.log(`${YELLOW}${t('guide.unknown_topic', { topic })}${RESET}`);
    console.log('');
    renderGuideIndex();
    return;
  }

  switch (topic as GuideTopic) {
    case 'battle': renderBattleGuide(); break;
    case 'region': renderRegionGuide(); break;
    case 'achievement': renderAchievementGuide(); break;
    case 'xp': renderXpGuide(); break;
    case 'item': renderItemGuide(); break;
  }
}

function renderBattleGuide(): void {
  console.log(`${BOLD}${t('guide.battle.title')}${RESET}`);
  console.log('');

  console.log(`${BOLD}${t('guide.battle.encounter_header')}${RESET}`);
  console.log(t('guide.battle.encounter_desc1'));
  console.log(t('guide.battle.encounter_desc2'));
  console.log('');

  console.log(`${BOLD}${t('guide.battle.winrate_header')}${RESET}`);
  console.log(t('guide.battle.winrate_formula'));
  console.log('');
  console.log(t('guide.battle.winrate_type', { label: CYAN, reset: RESET }));
  console.log(t('guide.battle.winrate_type_note'));
  console.log(t('guide.battle.winrate_level', { label: CYAN, reset: RESET }));
  console.log(t('guide.battle.winrate_level_note'));
  console.log(t('guide.battle.winrate_stat', { label: CYAN, reset: RESET }));
  console.log(t('guide.battle.winrate_stat_note'));
  console.log(t('guide.battle.winrate_clamp', { gray: GRAY, reset: RESET }));
  console.log('');

  console.log(`${BOLD}${t('guide.battle.type_header')}${RESET}`);
  console.log(t('guide.battle.type_grass'));
  console.log(t('guide.battle.type_fire'));
  console.log(t('guide.battle.type_water'));
  console.log(t('guide.battle.type_electric'));
  console.log(t('guide.battle.type_hint', { gray: GRAY, reset: RESET }));
  console.log('');

  console.log(`${BOLD}${t('guide.battle.party_header')}${RESET}`);
  console.log(t('guide.battle.party_desc1'));
  console.log(t('guide.battle.party_desc2'));
  console.log(t('guide.battle.party_desc3'));
  console.log(t('guide.battle.party_1', { label: CYAN, reset: RESET }));
  console.log(t('guide.battle.party_6', { label: CYAN, reset: RESET }));
  console.log(t('guide.battle.party_formula', { gray: GRAY, reset: RESET }));
  console.log('');

  console.log(`${BOLD}${t('guide.battle.reward_header')}${RESET}`);
  console.log(t('guide.battle.reward_win'));
  console.log(t('guide.battle.reward_lose'));
  console.log(t('guide.battle.reward_catch'));
  console.log(t('guide.battle.reward_rarity', { gray: GRAY, reset: RESET }));
}

function renderRegionGuide(): void {
  console.log(`${BOLD}${t('guide.region.title')}${RESET}`);
  console.log('');

  console.log(`${BOLD}${t('guide.region.move_header')}${RESET}`);
  console.log(t('guide.region.move_list'));
  console.log(t('guide.region.move_cmd'));
  console.log('');

  console.log(`${BOLD}${t('guide.region.list_header')}${RESET}`);
  const db = getRegionsDB();
  const regions = Object.values(db.regions).sort((a, b) => a.id - b.id);

  for (const r of regions) {
    const cond = r.unlock_condition;
    let unlockStr: string;
    if (cond) {
      const label = cond.type === 'pokedex_caught' ? t('guide.region.unlock_caught') : t('guide.region.unlock_seen');
      unlockStr = `${YELLOW}${t('guide.region.unlock_cond', { count: cond.value, label })}${RESET}`;
    } else {
      unlockStr = `${GREEN}${t('guide.region.unlock_free')}${RESET}`;
    }
    console.log(`  ${BOLD}${getRegionName(r.id)}${RESET} (Lv.${r.level_range[0]}~${r.level_range[1]}) — ${getRegionDescription(r.id)}`);
    console.log(`    ${t('guide.region.entry_unlock', { unlock: unlockStr, count: r.pokemon_pool.length })}`);
  }

  console.log('');
  console.log(`${BOLD}${t('guide.region.tips_header')}${RESET}`);
  console.log(t('guide.region.tip1'));
  console.log(t('guide.region.tip2'));
  console.log(t('guide.region.tip3'));
}

function renderAchievementGuide(): void {
  console.log(`${BOLD}${t('guide.achievement.title')}${RESET}`);
  console.log('');

  console.log(`${BOLD}${t('guide.achievement.check_header')}${RESET}`);
  console.log(t('guide.achievement.check_cmd'));
  console.log('');

  const achDB = getAchievementsDB();

  // Group by rarity
  const byRarity: Record<string, typeof achDB.achievements> = {};
  for (const ach of achDB.achievements) {
    const key = getAchievementRarityLabel(ach.id);
    (byRarity[key] ??= []).push(ach);
  }

  for (const [rarity, achs] of Object.entries(byRarity)) {
    console.log(`${BOLD}[ ${rarity} ]${RESET}`);
    for (const ach of achs) {
      const reward = ach.reward_pokemon
        ? t('guide.achievement.reward_pokemon', { name: ach.reward_pokemon })
        : t('guide.achievement.reward_none');
      console.log(t('guide.achievement.entry', { name: getAchievementName(ach.id), desc: getAchievementDescription(ach.id) }));
      console.log(t('guide.achievement.entry_meta', { gray: GRAY, trigger: ach.trigger_type, value: ach.trigger_value, reward, reset: RESET }));
    }
    console.log('');
  }

  console.log(`${BOLD}${t('guide.achievement.rewards_header')}${RESET}`);
  console.log(t('guide.achievement.reward_unlock'));
  console.log(t('guide.achievement.reward_xp'));
  console.log(t('guide.achievement.reward_ball'));
  console.log(t('guide.achievement.reward_slot'));
}

function renderXpGuide(): void {
  console.log(`${BOLD}${t('guide.xp.title')}${RESET}`);
  console.log('');

  console.log(`${BOLD}${t('guide.xp.gain_header')}${RESET}`);
  console.log(t('guide.xp.gain_desc'));
  console.log(t('guide.xp.gain_formula_label'));
  console.log(t('guide.xp.gain_formula', { cyan: CYAN, reset: RESET }));
  console.log('');

  console.log(`${BOLD}${t('guide.xp.multiplier_header')}${RESET}`);
  console.log(t('guide.xp.multiplier_base'));
  console.log(t('guide.xp.multiplier_achievement'));
  console.log(t('guide.xp.multiplier_dispatch'));
  console.log(t('guide.xp.multiplier_hint', { gray: GRAY, reset: RESET }));
  console.log('');

  console.log(`${BOLD}${t('guide.xp.party_header')}${RESET}`);
  console.log(t('guide.xp.party_desc1'));
  console.log(t('guide.xp.party_desc2'));
  console.log(t('guide.xp.party_tip', { yellow: YELLOW, reset: RESET }));
  console.log('');

  console.log(`${BOLD}${t('guide.xp.dispatch_header')}${RESET}`);
  console.log(t('guide.xp.dispatch_cmd'));
  console.log(t('guide.xp.dispatch_desc'));
  console.log(t('guide.xp.dispatch_tip', { yellow: YELLOW, reset: RESET }));
  console.log('');

  console.log(`${BOLD}${t('guide.xp.expgroup_header')}${RESET}`);
  console.log(t('guide.xp.expgroup_desc1'));
  console.log(t('guide.xp.expgroup_desc2'));
  console.log(t('guide.xp.expgroup_hint', { gray: GRAY, reset: RESET }));
}

function renderItemGuide(): void {
  console.log(`${BOLD}${t('guide.item.title')}${RESET}`);
  console.log('');

  console.log(`${BOLD}${t('guide.item.check_header')}${RESET}`);
  console.log(t('guide.item.check_cmd'));
  console.log('');

  console.log(`${BOLD}${t('guide.item.pokeball_header')}${RESET}`);
  console.log(t('guide.item.pokeball_desc'));
  console.log('');
  console.log(t('guide.item.obtain_header'));
  console.log(t('guide.item.obtain_win', { green: GREEN, reset: RESET }));
  console.log(t('guide.item.obtain_lose', { yellow: YELLOW, reset: RESET }));
  console.log(t('guide.item.obtain_achievement'));
  console.log('');

  console.log(`${BOLD}${t('guide.item.catch_header')}${RESET}`);
  console.log(t('guide.item.catch_desc1'));
  console.log(t('guide.item.catch_desc2'));
  console.log(t('guide.item.catch_desc3'));
  console.log(t('guide.item.catch_tip', { yellow: YELLOW, reset: RESET }));
}
