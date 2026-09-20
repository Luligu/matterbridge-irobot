# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge iRobot plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-irobot.svg)](https://www.npmjs.com/package/matterbridge-irobot)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-irobot.svg)](https://www.npmjs.com/package/matterbridge-irobot)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge/latest?label=docker%20version)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge?label=docker%20pulls)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-irobot/actions/workflows/build.yml/badge.svg)
![CodeQL](https://github.com/Luligu/matterbridge-irobot/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/Luligu/matterbridge-irobot/branch/main/graph/badge.svg)](https://codecov.io/gh/Luligu/matterbridge-irobot)
[![tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18.svg?logo=vitest&logoColor=white)](https://vitest.dev)
[![styled with Oxc](https://img.shields.io/badge/styled_with-Oxc-9BE4E0.svg?logo=oxc&logoColor=white)](https://oxc.rs/docs/guide/usage/formatter.html)
[![linted with Oxc](https://img.shields.io/badge/linted_with-Oxc-9BE4E0.svg?logo=oxc&logoColor=white)](https://oxc.rs/docs/guide/usage/linter.html)
[![TypeScript Native](https://img.shields.io/badge/TypeScript_Native-3178C6?logo=typescript&logoColor=white)](https://github.com/microsoft/typescript-go)
[![ESM](https://img.shields.io/badge/ESM-Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![matterbridge.io](https://img.shields.io/badge/matterbridge.io-online-brightgreen)](https://matterbridge.io)
![under development](https://img.shields.io/badge/status-under%20development-orange)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

<a href="https://github.com/Luligu/matterbridge-irobot">
  <img src="https://matterbridge.io/assets/irobot.svg" alt="iRobot logo" width="100" />
</a>

This plugin allows you to expose iRobot devices to Matter.

Features:

- device retrieval from the iRobot cloud
- automatic discovery of iRobot devices on the local network

The plugin requires matterbridge v.3.10.0.

## Tested devices

| Model   | Supported commands             | Supported phases          | Tested by |
| ------- | ------------------------------ | ------------------------- | --------- |
| j715840 | start stop pause resume goHome | charge run stop hmUsrDock | Luligu    |

Please let me know which iRobot devices have also been tested.

## How to get your username/blid and password using the plugin config

Put your iRobot account credentials (username and password) in the config editor and click Retrieve.

If it doesn't work, use any of the methods in [dorita980](https://github.com/koalazak/dorita980).

> Given the financial issues iRobot is facing, **save your credentials** somewhere safe. If the iRobot platform shuts down, you will not be able to retrieve them anymore.

## Apple Home issues with RVC

As of version 18.4.x, the Home app supports Robot Vacuum Cleaners only as single, non-bridged devices or when the robot is the only device in the bridge. Furthermore, the device cannot be a composed device. The only supported device type is the RVC.

If a robot is present alongside other devices in the bridge, the entire bridge becomes unstable in the Home app.

> If you pair with Apple Home, always set **Enable Server RVC** in the config. With "Enable Server RVC," you will have a separate QR code for pairing each iRobot device you have.

## Credits

This plugin credits [dorita980](https://github.com/koalazak/dorita980) for the prior work around iRobot account credential retrieval and local robot integration.

The dorita980 project has been a useful reference for understanding the iRobot login flow and for helping users retrieve their BLID and password.

## Style guide

See also the [Style Guide](./STYLEGUIDE.md) for JSDoc, naming, and logging conventions used in this repository.

## Repository toolchain

> **Note:** This repository uses a new toolchain. It replaces the traditional TypeScript / ESLint / Prettier / Jest stack with a faster and lighter setup.

- **No `typescript 6.x` package** — replaced by [TypeScript Native 7.x](https://github.com/microsoft/typescript-go).
- **No ESLint, no Prettier** — replaced by the [oxc](https://oxc.rs) stack: [oxlint](https://oxc.rs/docs/guide/usage/linter.html) for linting and [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) for formatting.
- **No Jest** — replaced by [Vitest](https://vitest.dev), which is much faster and natively supports ESM without extra configuration.
- **Far fewer development dependencies** — the number of installed packages drops from **~600** to **~75**. A clean install is much faster.
- **Much faster linting and formatting** — oxlint and oxfmt run in a fraction of the time required by the ESLint / Prettier pipeline.
- **Much faster builds** — tsgo compiles the project in a fraction of the time required by the standard `tsc` build.
- **Editor support** — use the VS Code extensions for tsgo and oxc to get the same experience in the editor.

## Shared agent instructions

All coding agents read the same guidance. [AGENTS.md](./AGENTS.md) and [.agents/](./.agents/) are the **single source of truth**; everything under `.github/`, `.claude/`, `.codex/` and `.antigravity/` are pointers and mirrors. Edit `.agents/` (or `AGENTS.md`), never the copies. See [.agents/README.md](./.agents/README.md) for the full layout.

| File                                            | Notes                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                     | Main project instructions — shared by every agent                                                            |
| `.agents/README.md`                             | Layout and versioning of the shared instructions                                                             |
| `.agents/rules/testing.instructions.md`         | Testing standards for unit tests                                                                             |
| `.agents/rules/matterbridge.instructions.md`    | Creating endpoints and using the single-class devices                                                        |
| `.agents/rules/plugin-frontend.instructions.md` | Serving a plugin's own frontend SPA and REST API                                                             |
| `.agents/rules/chip-tests.instructions.md`      | The CHIP conformance test harness                                                                            |
| `.agents/skills/verify-agent-context/SKILL.md`  | Verify the agent loaded this context — `$verify-agent-context` (Codex), `/verify-agent-context` (all others) |

Content lives only in `.agents/`. The per-agent folders exist because each tool discovers rules and skills from its own hardcoded location, so they hold stubs that point back here — except where the tool reads `.agents/` natively.

| Tool                               | Instructions                                    | Rules                                                 | Skills                                              |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Codex                              | `AGENTS.md` — read natively                     | `.agents/rules/` — linked from `AGENTS.md`, on demand | `.agents/skills/` — native, `$verify-agent-context` |
| Copilot (VS Code and coding agent) | `.github/copilot-instructions.md` → `AGENTS.md` | stubs in `.github/instructions/` — `applyTo` globs    | stub in `.github/skills/` — `/verify-agent-context` |
| Claude Code                        | `CLAUDE.md` imports `AGENTS.md`                 | stubs in `.claude/rules/` — `paths` globs             | stub in `.claude/skills/` — `/verify-agent-context` |
| Gemini / Antigravity               | `GEMINI.md` imports `AGENTS.md`                 | `.agents/rules/` — on demand                          | `.agents/skills/` — native, `/verify-agent-context` |

### Copilot instructions

| File                                                                   | Notes                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `.github/copilot-instructions.md`                                      | Pointer to AGENTS.md — always loaded                                               |
| `.github/instructions/chip-tests/chip-tests.instructions.md`           | CHIP conformance test harness — scoped to CHIP test files                          |
| `.github/instructions/matterbridge/matterbridge.instructions.md`       | Matterbridge endpoint guide — dedicated Copilot instruction file                   |
| `.github/instructions/plugin-frontend/plugin-frontend.instructions.md` | Plugin frontend SPA and custom REST API guide — scoped to frontend and plugin code |
| `.github/instructions/testing/testing.instructions.md`                 | Testing standards — scoped to `**/*.test.ts`                                       |
| `.github/skills/verify-agent-context/SKILL.md`                         | Skill invocable as `/verify-agent-context`                                         |

### Claude instructions

| File                                                            | Notes                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                     | Pointer to AGENTS.md — always loaded                                               |
| `.claude/settings.json`                                         | Claude permissions: allow, ask and deny rules                                      |
| `.claude/rules/chip-tests/chip-tests.instructions.md`           | CHIP conformance test harness — scoped to CHIP test files                          |
| `.claude/rules/matterbridge/matterbridge.instructions.md`       | Matterbridge endpoint guide — loaded for all contexts                              |
| `.claude/rules/plugin-frontend/plugin-frontend.instructions.md` | Plugin frontend SPA and custom REST API guide — scoped to frontend and plugin code |
| `.claude/rules/testing/testing.instructions.md`                 | Testing standards — scoped to `**/*.test.ts`                                       |
| `.claude/skills/verify-agent-context/SKILL.md`                  | Skill invocable as `/verify-agent-context`                                         |

### Codex instructions

| File                         | Notes                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| `AGENTS.md`                  | Main project instructions — read directly, no pointer file needed |
| `.codex/config.toml`         | Codex project permissions, approvals, and profile                 |
| `.codex/rules/default.rules` | Codex command allow, prompt, and deny rules                       |

Codex reads the shared rules and skills from `.agents/` directly; the skill is invoked as `$verify-agent-context`.

### Gemini / Antigravity instructions

| File                         | Notes                                                 |
| ---------------------------- | ----------------------------------------------------- |
| `GEMINI.md`                  | Pointer to AGENTS.md — always loaded                  |
| `.antigravity/settings.json` | Sandboxing and permissions: allow, ask and deny rules |

The shared rules under `.agents/rules/` apply on demand for the relevant tasks, and `.agents/skills/` is discovered automatically as `/verify-agent-context`.

## Development guide

Refer to the Matterbridge [Development guide](https://matterbridge.io/README-DEV.html) for other guidelines.

---
