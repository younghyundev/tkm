import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPokemonDB, getAchievementsDB, getRegionsDB } from './pokemon-data.js';
import { getCompletion } from './pokedex.js';
import { getCurrentRegion, getRegionList } from './regions.js';
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

  return { remaining: String(remaining), nextRegion: locked.region.name };
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
      best = { name: ach.name, desc: ach.description, progress, target: ach.trigger_value, ratio };
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

function resolveRetryTokenCount(state: State, _config: Config): Record<string, string> | null {
  const count = state.items?.retry_token ?? 0;
  return { count: String(count) };
}

const RESOLVERS: Record<string, (state: State, config: Config) => Record<string, string> | null> = {
  nextRegionUnlock: resolveNextRegionUnlock,
  currentRegionLevel: resolveCurrentRegionLevel,
  nearestAchievement: resolveNearestAchievement,
  weakestPartyMember: resolveWeakestPartyMember,
  retryTokenCount: resolveRetryTokenCount,
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
  const categories = [...new Set(tips.map(t => t.category))];
  shuffle(categories);

  for (const cat of categories) {
    const catTips = tips.filter(t => t.category === cat);
    shuffle(catTips);

    for (const tip of catTips) {
      // Duplicate prevention
      if (state.last_tip?.id === tip.id) continue;

      if (!tip.dynamic) {
        return { id: tip.id, text: tip.template };
      }

      // Dynamic tip: resolve variables
      const resolver = tip.resolver ? RESOLVERS[tip.resolver] : null;
      if (!resolver) continue;

      const vars = resolver(state, config);
      if (!vars) continue;

      return { id: tip.id, text: resolveTemplate(tip.template, vars) };
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
  console.log(`${BOLD}=== 토큰몬 가이드 ===${RESET}`);
  console.log('');
  console.log(`${CYAN}사용법: tokenmon guide <주제>${RESET}`);
  console.log('');
  console.log(`${BOLD}주제:${RESET}`);
  console.log('  battle        전투 시스템 (승률, 타입 상성, XP 보상)');
  console.log('  region        지역 시스템 (해금 조건, 레벨 범위, 포켓몬 풀)');
  console.log('  achievement   업적 시스템 (트리거, 보상)');
  console.log('  xp            XP / 레벨링 (계산식, 파티 분배, 파견 보너스)');
  console.log('  item          아이템 (재도전권, 드랍률, 자동 재도전)');
}

export function renderGuide(topic: string): void {
  if (!GUIDE_TOPICS.includes(topic as GuideTopic)) {
    console.log(`${YELLOW}알 수 없는 주제: ${topic}${RESET}`);
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
  console.log(`${BOLD}=== 전투 가이드 ===${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 전투 발생 ]${RESET}`);
  console.log('  세션 시작 시 15% 확률로 야생 포켓몬과 조우합니다.');
  console.log('  파티에서 타입 상성이 가장 좋은 포켓몬이 자동으로 전투에 나갑니다.');
  console.log('');

  console.log(`${BOLD}[ 승률 계산 ]${RESET}`);
  console.log('  승률 = 타입 상성 × 레벨 팩터 × 스탯 팩터');
  console.log('');
  console.log(`  ${CYAN}타입 상성${RESET}: 효과적 → 약 1.4배 / 별로 → 약 0.7배`);
  console.log('            (원시 배율에 40% 감쇠 적용)');
  console.log(`  ${CYAN}레벨 팩터${RESET}: sigmoid(레벨차 / (2 + 평균Lv×0.1))`);
  console.log('            저레벨에서 급격, 고레벨에서 완만 (Lv.51 vs 55 ≈ 37%)');
  console.log(`  ${CYAN}스탯 팩터${RESET}: (공격+스피드) / (상대 방어+스피드)`);
  console.log('            0.5 ~ 1.5 범위로 클램프');
  console.log(`  ${GRAY}최종 승률은 3% ~ 95% 범위로 제한됩니다${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 타입 상성 ]${RESET}`);
  console.log('  풀 → 물, 땅, 바위 에 강함');
  console.log('  불꽃 → 풀, 얼음, 벌레, 강철 에 강함');
  console.log('  물 → 불꽃, 땅, 바위 에 강함');
  console.log('  전기 → 물, 비행 에 강함');
  console.log(`  ${GRAY}상세 상성표: tokenmon pokedex <이름> 으로 각 포켓몬 타입 확인${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 파티 전투력 보정 ]${RESET}`);
  console.log('  전투는 1:1이지만, 파티 전체의 전투력이 승률에 보정을 줍니다.');
  console.log('  각 포켓몬의 상대 전투력(야생 대비)을 계산 → 가장 강한 포켓몬이 전투');
  console.log('  나머지 멤버는 등비수열 가중치(r≈0.337)로 승률에 보너스 기여');
  console.log(`  ${CYAN}1마리${RESET}: 보정 없음 (1.0x)`);
  console.log(`  ${CYAN}6마리 풀파티${RESET}: 최대 1.5x (동일 전투력 시)`);
  console.log(`  ${GRAY}공식: multiplier = 1 + Σ r^i × (score_i / best_score), r ≈ 0.337${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 전투 보상 ]${RESET}`);
  console.log('  승리 시 XP = (기본 50 + 야생Lv×3 + 희귀도 보너스) × 배율');
  console.log('  패배 시 XP = 0');
  console.log('  승리 시 포획 확률 = 포켓몬별 포획률에 따라 결정');
  console.log(`  ${GRAY}희귀도 보너스: common=0, uncommon=30, rare=80, legendary=200, mythical=500${RESET}`);
}

function renderRegionGuide(): void {
  console.log(`${BOLD}=== 지역 가이드 ===${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 지역 이동 ]${RESET}`);
  console.log('  tokenmon region list    전체 지역 목록');
  console.log('  tokenmon region move <이름>   지역 이동');
  console.log('');

  console.log(`${BOLD}[ 지역 목록 ]${RESET}`);
  const db = getRegionsDB();
  const regions = Object.values(db.regions).sort((a, b) => a.id - b.id);

  for (const r of regions) {
    const cond = r.unlock_condition;
    let unlockStr = `${GREEN}처음부터 개방${RESET}`;
    if (cond) {
      const label = cond.type === 'pokedex_caught' ? '포획' : '발견';
      unlockStr = `${YELLOW}${cond.value}종 ${label}${RESET}`;
    }
    console.log(`  ${BOLD}${r.name}${RESET} (Lv.${r.level_range[0]}~${r.level_range[1]}) — ${r.description}`);
    console.log(`    해금: ${unlockStr} | 포켓몬: ${r.pokemon_pool.length}종`);
  }

  console.log('');
  console.log(`${BOLD}[ 팁 ]${RESET}`);
  console.log('  높은 레벨 지역 = 더 강한 야생 포켓몬 = 더 많은 XP');
  console.log('  각 지역의 고유 포켓몬 풀이 다르므로 도감 완성엔 지역 이동 필수');
  console.log('  챔피언 로드는 50종 포획 필요 — 전설 포켓몬이 출현합니다');
}

function renderAchievementGuide(): void {
  console.log(`${BOLD}=== 업적 가이드 ===${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 업적 확인 ]${RESET}`);
  console.log('  tokenmon achievements   전체 업적 목록 및 달성 여부');
  console.log('');

  const achDB = getAchievementsDB();

  // Group by rarity
  const byRarity: Record<string, typeof achDB.achievements> = {};
  for (const ach of achDB.achievements) {
    const key = ach.rarity_label;
    (byRarity[key] ??= []).push(ach);
  }

  for (const [rarity, achs] of Object.entries(byRarity)) {
    console.log(`${BOLD}[ ${rarity} ]${RESET}`);
    for (const ach of achs) {
      const reward = ach.reward_pokemon
        ? `포켓몬: ${ach.reward_pokemon}`
        : (ach.reward_message ?? '없음');
      console.log(`  ${ach.name} — ${ach.description}`);
      console.log(`    ${GRAY}트리거: ${ach.trigger_type} ≥ ${ach.trigger_value} | 보상: ${reward}${RESET}`);
    }
    console.log('');
  }

  console.log(`${BOLD}[ 보상 종류 ]${RESET}`);
  console.log('  포켓몬 해금: 특정 업적 달성 시 새 포켓몬 획득');
  console.log('  XP 보너스: 영구적 XP 배율 증가 (중첩 가능)');
  console.log('  재도전권: 전투 재시도에 사용');
  console.log('  파티 슬롯: 최대 파티 크기 증가');
}

function renderXpGuide(): void {
  console.log(`${BOLD}=== XP / 레벨링 가이드 ===${RESET}`);
  console.log('');

  console.log(`${BOLD}[ XP 획득 ]${RESET}`);
  console.log('  전투 승리 시 XP 획득 (패배 시 0)');
  console.log('  기본 공식:');
  console.log(`    ${CYAN}XP = (50 + 야생Lv×3 + 타입불리보너스 + 희귀도보너스) × 배율${RESET}`);
  console.log('');

  console.log(`${BOLD}[ XP 배율 ]${RESET}`);
  console.log('  기본: 1.0x');
  console.log('  업적 보너스: +10%~20% (영구, 중첩 가능)');
  console.log('  파견 보너스: 1.5x (서브에이전트에 파견된 포켓몬)');
  console.log(`  ${GRAY}현재 배율: tokenmon status 에서 확인${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 파티 XP ]${RESET}`);
  console.log('  XP는 파티 전원이 동일하게 받습니다 (분배가 아닌 전원 동일 수령).');
  console.log('  파티 6마리여도 각각 전체 XP를 받습니다.');
  console.log(`  ${YELLOW}팁: 파티가 클수록 더 많은 포켓몬을 동시에 육성할 수 있습니다${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 파견 시스템 ]${RESET}`);
  console.log('  tokenmon party dispatch <이름>  으로 파견 포켓몬 설정');
  console.log('  서브에이전트 실행 시 파견 포켓몬에 1.5배 XP 적용');
  console.log(`  ${YELLOW}팁: 레벨이 낮은 포켓몬을 파견하면 빠르게 성장!${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 경험치 그룹 ]${RESET}`);
  console.log('  포켓몬마다 경험치 그룹이 다릅니다 (fast, medium_fast, medium_slow, slow 등)');
  console.log('  같은 레벨이라도 필요 XP가 다를 수 있습니다');
  console.log(`  ${GRAY}각 포켓몬의 그룹: tokenmon pokedex <이름>${RESET}`);
}

function renderItemGuide(): void {
  console.log(`${BOLD}=== 아이템 가이드 ===${RESET}`);
  console.log('');

  console.log(`${BOLD}[ 아이템 확인 ]${RESET}`);
  console.log('  tokenmon items   현재 보유 아이템');
  console.log('');

  console.log(`${BOLD}[ 재도전권 🎫 ]${RESET}`);
  console.log('  전투에서 사용하는 유일한 소비 아이템입니다.');
  console.log('');
  console.log('  획득 방법:');
  console.log(`    전투 승리 시 ${GREEN}20%${RESET} 확률로 드랍`);
  console.log(`    전투 패배 시 ${YELLOW}5%${RESET} 확률로 드랍`);
  console.log('    업적 보상 (첫 승리: 3개, 도감 연구원: 5개, 연승의 달인: 10개 등)');
  console.log('');

  console.log(`${BOLD}[ 자동 재도전 ]${RESET}`);
  console.log('  전투 패배 시 자동으로 재도전권을 사용하여 재시도합니다.');
  console.log('  조건: 자동 재도전 활성화 + 재도전권 보유 + 승률 ≥ 임계값');
  console.log('');
  console.log('  설정:');
  console.log('    tokenmon config set auto_retry_enabled true/false');
  console.log(`    tokenmon config set auto_retry_threshold 0.6  ${GRAY}(기본: 60%)${RESET}`);
  console.log(`  ${YELLOW}팁: 임계값을 낮추면 더 자주 재도전하지만 토큰 소모가 빠릅니다${RESET}`);
}
