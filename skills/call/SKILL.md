---
description: "Call a Pokémon by name and it reacts. Korean: 불러, 불러줘, 야, 이리와, 포켓몬 이름, 반응, 파이숭이야, 불꽃숭이야"
---

# Call Your Pokémon

The user called a Pokémon by name. Make it react with personality.

## Step 1: Identify the Pokémon

Extract the Pokémon name from the user's message (e.g. "파이숭이야~" → "파이숭이", "불꽃숭이야" → "불꽃숭이").

Check the current party:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" party
```

Show the sprite of the called Pokémon:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" pokedex <이름>
```

## Step 2: React

If the Pokémon is **in the party**, respond with a cute reaction line in this format:

> **[포켓몬 이름]**[은/는] [반응]

Pick one reaction based on the Pokémon's **primary type**. Keep it short and charming (10–20자).

| Type | Example reactions |
|------|------------------|
| 불꽃 | 불꽃을 내뿜는다!, 기분 좋게 꼬리를 흔든다, 흥분해서 콧김을 뿜는다 |
| 물 | 물보라를 튀긴다!, 꼬리로 물을 철벅인다, 반갑게 물을 뿜어낸다 |
| 풀 | 잎사귀를 살랑살랑 흔든다, 기지개를 켠다, 눈을 반짝인다 |
| 전기 | 온몸에 스파크가 튄다!, 귀를 쫑긋 세운다, 꼬리를 빳빳이 세운다 |
| 노말 | 눈을 깜빡인다, 기분 좋게 울음소리를 낸다, 살랑살랑 꼬리를 흔든다 |
| 비행 | 날갯짓을 한다, 높이 날아올랐다가 내려앉는다, 깃털을 부풀린다 |
| 격투 | 파이팅 포즈를 취한다!, 주먹을 불끈 쥔다, 신나게 달려온다 |
| 바위 | 듬직하게 고개를 끄덕인다, 무게감 있게 발을 구른다 |
| 땅 | 발을 굴러 작은 흙먼지를 일으킨다, 기분 좋게 땅을 판다 |
| 얼음 | 차가운 입김을 내뿜는다, 서리를 흩날린다, 빙그르르 돈다 |
| 독 | 으쓱거리며 다가온다, 독침을 살짝 드러낸다, 장난스럽게 윙크한다 |
| 고스트 | 반투명하게 스르르 나타난다, 몸이 잠시 사라졌다가 다시 나타난다 |
| 드래곤 | 위엄 있게 포효한다!, 날카로운 눈으로 바라본다, 꼬리를 힘차게 내리친다 |
| 에스퍼 | 눈을 빛내며 주위 물건이 살짝 떠오른다, 조용히 눈을 감았다가 뜬다 |
| 벌레 | 더듬이를 씰룩인다, 날개를 재빠르게 퍼덕인다 |
| 강철 | 묵직하게 발소리를 내며 다가온다, 몸을 빛나게 반짝인다 |
| 악 | 장난스럽게 뒤로 숨었다가 나타난다, 눈을 가늘게 뜨며 비실 웃는다 |
| 페어리 | 반짝이는 가루를 날리며 다가온다, 팔짝팔짝 뛰며 좋아한다 |

If the Pokémon is **NOT in the party**, respond:

> **[포켓몬 이름]**[은/는] 파티에 없어서 달려오지 못했다...

## Notes

- Use natural Korean particles (은/는, 이/가) based on the name ending.
- One reaction per call — keep it to a single line.
- No tool calls after Step 2; just output the reaction line.
