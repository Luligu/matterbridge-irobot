# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge iRobot plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-irobot.svg)](https://www.npmjs.com/package/matterbridge-irobot)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-irobot.svg)](https://www.npmjs.com/package/matterbridge-irobot)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge/latest?label=docker%20version)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge?label=docker%20pulls)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-irobot/actions/workflows/build.yml/badge.svg)
![CodeQL](https://github.com/Luligu/matterbridge-irobot/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/Luligu/matterbridge-irobot/branch/main/graph/badge.svg)](https://codecov.io/gh/Luligu/matterbridge-irobot)
[![styled with prettier](https://img.shields.io/badge/styled_with-Prettier-f8bc45.svg?logo=prettier)](https://github.com/prettier/prettier)
[![linted with eslint](https://img.shields.io/badge/linted_with-ES_Lint-4B32C3.svg?logo=eslint)](https://github.com/eslint/eslint)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ESM](https://img.shields.io/badge/ESM-Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/api/esm.html)
[![matterbridge.io](https://img.shields.io/badge/matterbridge.io-online-brightgreen)](https://matterbridge.io)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

This plugin allows you to expose iRobot devices to Matter.

Features:

- device retrieval from the iRobot cloud
- automatic discovery of iRobot devices on the local network

## Tested devices

| Model   | Supported commands             | Tested by |
| ------- | ------------------------------ | --------- |
| j715840 | start stop pause resume goHome | Luligu    |

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
