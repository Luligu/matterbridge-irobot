# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge iRobot plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-irobot.svg)](https://www.npmjs.com/package/matterbridge-irobot)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-irobot.svg)](https://www.npmjs.com/package/matterbridge-irobot)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge/latest?label=docker%20version)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Luligu/b21088ab9c9f2b119b42c33f0fef218d/raw/docker.json)](https://hub.docker.com/r/luligu/matterbridge)
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

The plugin requires matterbridge v.3.11.0.

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

## Development guide

Refer to the Matterbridge [Development guide](https://matterbridge.io/README-DEV.html) for other guidelines.

## Repository toolchain

See [TOOLCHAIN.md](./TOOLCHAIN.md) for compilers, linting, formatting, testing, and editor support.

## Shared agent instructions

See [SHARED-AGENTS.md](./SHARED-AGENTS.md) for shared guidance, rules, skills, and configuration for coding agents.

See [.agents/README.md](./.agents/README.md) for the shared instructions layout and versioning.

## Shared dev container support

See [.devcontainer/README.md](./.devcontainer/README.md) for the shared development container setup and usage.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## Style guide

See [STYLEGUIDE.md](./STYLEGUIDE.md) for code style, naming, documentation, and testing conventions.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history and notable changes.

## Issues and feature requests

Report bugs and suggest improvements on [GitHub Issues](https://github.com/Luligu/matterbridge-irobot/issues).

## License

Licensed under the [Apache License 2.0](./LICENSE).

## Support the project

If you find this project useful, please consider giving it a star on [GitHub](https://github.com/Luligu/matterbridge-irobot) and sponsoring it. Your support helps maintain and improve the project.

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png)](https://www.buymeacoffee.com/luligugithub)
