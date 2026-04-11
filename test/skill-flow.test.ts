import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

type SkillFlowAction = 'switch' | 'surrender' | 'unknown';

function classifySkillFlowInput(input: string): SkillFlowAction {
  const normalized = input.trim();
  if (/^(교체|switch|change|s)$/i.test(normalized)) return 'switch';
  if (/^(항복|surrender|quit|giveup|gg)$/i.test(normalized)) return 'surrender';
  return 'unknown';
}

describe('gym skill keyword matcher', () => {
  it('classifies switch keywords as switch', () => {
    for (const value of ['교체', 'switch', 'Change', ' S ', 'SWITCH']) {
      assert.equal(classifySkillFlowInput(value), 'switch');
    }
  });

  it('classifies surrender keywords as surrender', () => {
    for (const value of ['항복', 'surrender', 'gg', 'quit', 'giveup']) {
      assert.equal(classifySkillFlowInput(value), 'surrender');
    }
  });

  it('classifies unmatched inputs as unknown', () => {
    for (const value of ['???', '5', 'attack', '공격']) {
      assert.equal(classifySkillFlowInput(value), 'unknown');
    }
  });

  it('classifies the empty string as unknown', () => {
    assert.equal(classifySkillFlowInput(''), 'unknown');
  });
});
