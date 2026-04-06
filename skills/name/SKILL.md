---
description: "Give a nickname to a Pokémon in your party. Korean: 닉네임, 이름 짓기, 이름 붙이기, 별명"
---

# Give a Pokémon a Nickname

Name a Pokémon in your party. The nickname shows in status and party views, and can be used to call it with `/tkm:call`.

## Step 1: Show current party

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" party
```

## Step 2: Ask for nickname

If the user already specified a Pokémon and nickname (e.g. "불꽃숭이한테 파이숭이라고 이름 붙여줘"), skip to Step 3.

Otherwise, use **AskUserQuestion** to ask:
1. Which Pokémon to name (from the party list)
2. What nickname to give (max 7 characters)

## Step 3: Set the nickname

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" nickname <포켓몬_ID_또는_이름> <닉네임>
```

Example: `nickname 390 파이숭이` or `nickname 불꽃숭이 파이숭이`

## Step 4: Confirm

Show the result message from the CLI. The nickname will now appear in `status` and `party` as:

> **파이숭이 (불꽃숭이)**
