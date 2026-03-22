import { inspect } from 'node:util';

import { MatterbridgeDynamicPlatform, PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import { AnsiLogger } from 'matterbridge/logger';

import { Discovery } from './discovery.js';
import { IRobotMqtt } from './irobot-mqtt.js';

export interface DeviceConfig {
  name: string;
  ip: string;
  blid: string;
  password: string;
}

export type iRobotPlatformConfig = PlatformConfig & {
  username: string;
  password: string;
  discovery: boolean;
  whiteList: string[];
  blackList: string[];
  devices: DeviceConfig[];
};

/**
 * This is the standard interface for Matterbridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param {PlatformMatterbridge} matterbridge - An instance of MatterBridge. This is the main interface for interacting with the MatterBridge system.
 * @param {AnsiLogger} log - An instance of AnsiLogger. This is used for logging messages in a format that can be displayed with ANSI color codes.
 * @param {iRobotPlatformConfig} config - The platform configuration.
 * @returns {Platform} - An instance of the iRobotPlatform. This is the main interface for interacting with the iRobot system.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: iRobotPlatformConfig): Platform {
  return new Platform(matterbridge, log, config);
}

export class Platform extends MatterbridgeDynamicPlatform {
  private readonly mqttClients = new Map<string, IRobotMqtt>();

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: iRobotPlatformConfig,
  ) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.7.0')) {
      throw new Error(`This plugin requires Matterbridge version >= "3.7.0". Please update Matterbridge to the latest version in the frontend.`);
    }

    this.log.info('Initializing platform:', this.config.name);

    this.config.discovery = this.config.discovery ?? true;
    this.config.devices = this.config.devices ?? [];
    this.config.debug = this.config.debug ?? false;
    this.config.unregisterOnShutdown = this.config.unregisterOnShutdown ?? false;

    this.log.info('Finished initializing platform:', this.config.name);
  }

  override async onStart(reason?: string): Promise<void> {
    this.log.info('onStart called with reason:', reason ?? 'none');

    if (this.config.discovery) {
      const iRobot = new Discovery();
      const discoveredDevices = await iRobot.discover();
      this.log.info(`Discovered ${discoveredDevices.length} iRobot devices:`);
      for (const device of discoveredDevices) {
        if (!this.config.devices.some((d) => d.ip === device.ip)) {
          this.log.info(`- device: "${device.robotname ?? `iRobot-${device.ip}`}" ip ${device.ip}`);
          this.config.devices.push({
            name: device.robotname ?? `iRobot-${device.ip}`,
            ip: device.ip,
            blid: device.robotid ?? '',
            password: '',
          });
        }
      }
    }

    for (const device of this.config.devices) {
      this.log.info(`Registering device "${device.name}" with IP ${device.ip}...`);
      try {
        this.log.info(`Getting public info for device "${device.name}" with IP ${device.ip}...`);
        const discovery = new Discovery();
        const robotInfo = await discovery.getRobotPublicInfo(device.ip);
        this.log.info(`Public info for device "${device.name}" with IP ${device.ip}:\n`, robotInfo);
      } catch (error) {
        this.log.error(`Failed to get public info for device "${device.name}" with IP ${device.ip}:`, error);
      }
      const rvc = new RoboticVacuumCleaner(device.name, device.ip);

      // If the user provided local MQTT credentials, connect and wire Matter commands.
      if (device.blid && device.password) {
        const robotMqtt = new IRobotMqtt({
          ip: device.ip,
          blid: device.blid,
          password: device.password,
          logger: rvc.log,
          subscribeTopics: ['#'],
        });
        this.mqttClients.set(device.ip, robotMqtt);

        try {
          await robotMqtt.connect();
          // Optional: log state messages when debug is enabled.
          if (this.config.debug) {
            robotMqtt.on('message', (msg) => {
              if (msg.json !== undefined) {
                rvc.log.debug(
                  `[mqtt] ${msg.topic}: ${inspect(msg.json, {
                    depth: null,
                    colors: false,
                    compact: false,
                    breakLength: 160,
                    maxArrayLength: null,
                    maxStringLength: null,
                  })}`,
                );
              } else {
                rvc.log.debug(`[mqtt] ${msg.topic}: ${msg.payload.toString('utf8')}`);
              }
            });
          }
        } catch (error) {
          rvc.log.error(`Failed to connect MQTT for device "${device.name}" (${device.ip}):`, error);
        }

        // Map Matter's Robotic Vacuum commands to iRobot local MQTT commands.
        rvc.addCommandHandler('RvcOperationalState.resume', async () => robotMqtt.start());
        rvc.addCommandHandler('RvcOperationalState.pause', async () => robotMqtt.stop());
        rvc.addCommandHandler('RvcOperationalState.goHome', async () => robotMqtt.goHome());
      } else {
        this.log.warn(`Device "${device.name}" (${device.ip}) has no local MQTT credentials (blid/password); commands will be read-only.`);
      }

      await this.registerDevice(rvc);
    }
  }

  override async onConfigure(): Promise<void> {
    await super.onConfigure();
    this.log.info('onConfigure called');
  }

  override async onShutdown(reason?: string): Promise<void> {
    await super.onShutdown(reason);
    this.log.info('onShutdown called with reason:', reason ?? 'none');

    // Disconnect MQTT clients
    await Promise.all(
      [...this.mqttClients.values()].map(async (client) => {
        try {
          await client.disconnect(true);
        } catch {
          // ignore
        }
      }),
    );
    this.mqttClients.clear();

    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }
}
