import { inspect } from 'node:util';

import { MatterbridgeDynamicPlatform, PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import { AnsiLogger, rs } from 'matterbridge/logger';
import { PowerSource, RvcCleanMode, RvcOperationalState, RvcRunMode, ServiceArea } from 'matterbridge/matter/clusters';

import { Discovery, DiscoveryInfo } from './discovery.js';
import { IRobotMqtt } from './iRobot.js';

export interface DeviceConfig {
  name: string;
  ip?: string;
  blid?: string;
  password?: string;
}

export type iRobotPlatformConfig = PlatformConfig & {
  username: string;
  password: string;
  discovery: boolean;
  whiteList: string[];
  blackList: string[];
  enableServerRvc: boolean;
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
  /** A map of MQTT clients keyed by device IP. */
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

    // Set default values for configuration properties for old setups that might not have these properties.
    this.config.discovery = this.config.discovery ?? true;
    this.config.whiteList = this.config.whiteList ?? [];
    this.config.blackList = this.config.blackList ?? [];
    this.config.devices = this.config.devices ?? [];
    this.config.enableServerRvc = this.config.enableServerRvc ?? true;
    this.config.debug = this.config.debug ?? false;
    this.config.unregisterOnShutdown = this.config.unregisterOnShutdown ?? false;

    this.log.info('Finished initializing platform:', this.config.name);
  }

  override async onStart(reason?: string): Promise<void> {
    this.log.info('onStart called with reason:', reason ?? 'none');

    // Ensure the platform is ready for the select.
    await this.ready;

    // Discover new devices on the local network and add them to the config.
    if (this.config.discovery) await this.discoverDevices();

    // Register the devices from the config.
    await this.registerDevices();
  }

  override async onConfigure(): Promise<void> {
    await super.onConfigure();
    this.log.info('onConfigure called');
  }

  override async onShutdown(reason?: string): Promise<void> {
    await super.onShutdown(reason);
    this.log.info('onShutdown called with reason:', reason ?? 'none');

    // Disconnect MQTT clients
    for (const [ip, client] of this.mqttClients.entries()) {
      try {
        await client.disconnect(true);
        this.log.info(`Disconnected MQTT client for device with IP ${ip}`);
      } catch (error) {
        this.log.debug(`Failed to disconnect MQTT client for device with IP ${ip}. ${error}`);
      }
    }
    this.mqttClients.clear();

    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }

  /**
   *  Discover iRobot devices on the local network and add them to the config if not already present.
   *
   * @param {number} timeout - The timeout for discovery in milliseconds. Default is 3000ms.
   * @returns {Promise<void>} - A promise that resolves when discovery is complete.
   */
  async discoverDevices(timeout: number = 3000): Promise<void> {
    const discovery = new Discovery();
    let discoveredDevices: DiscoveryInfo[] = [];
    try {
      discoveredDevices = await discovery.discover(timeout);
    } catch (error) {
      this.log.error(`Failed to discover iRobot devices. ${error}`);
    }
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

  /**
   *  Register devices from the config. For each device, attempt to get public info and log it. If local MQTT credentials are provided, connect and wire Matter commands.
   *
   * @param {number} timeout - The timeout for getting public info in milliseconds. Default is 3000ms.
   * @returns {Promise<void>} - A promise that resolves when all devices have been registered.
   */
  async registerDevices(timeout: number = 3000): Promise<void> {
    // Register devices from the config.
    for (const device of this.config.devices) {
      this.log.info(`Registering device "${device.name}" with IP ${device.ip}...`);
      if (device.ip) {
        try {
          this.log.info(`Getting public info for device "${device.name}" with IP ${device.ip}...`);
          const discovery = new Discovery();
          const robotInfo = await discovery.getRobotPublicInfo(device.ip, timeout);
          this.log.info(`Public info for device "${device.name}" with IP ${device.ip}:\n`, robotInfo);
        } catch (error) {
          this.log.error(`Failed to get public info for device "${device.name}" with IP ${device.ip}. ${error}`);
        }
      }
      const runMode = 1; // Idle
      const runModes = [
        { label: 'Idle', mode: 1, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
        { label: 'Cleaning', mode: 2, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },
      ];
      const cleanMode = 1; // Vacuum
      const cleanModes = [{ label: 'Vacuum', mode: 1, modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }] }];
      const phase = 0; // Charge
      const phases = ['charge', 'run', 'stop', 'hmUsrDock'];
      const supportedAreas: ServiceArea.Area[] = [];
      const selectedAreas: number[] = [];
      const currentArea: number | null = null;
      const supportedMaps: ServiceArea.Map[] = [];
      const rvc = new RoboticVacuumCleaner(
        device.name,
        device.ip ?? device.name.toLocaleLowerCase().replaceAll(' ', '-') + '-unknown-ip',
        this.config.enableServerRvc ? 'server' : undefined, // Apple Home fix
        runMode,
        runModes,
        cleanMode,
        cleanModes,
        phase,
        phases,
        RvcOperationalState.OperationalState.Docked,
        undefined, // Use default values for operationalStateList: Stopped, Running, Paused, Error, SeekingCharger, Charging, Docked
        supportedAreas,
        selectedAreas,
        currentArea,
        supportedMaps,
      );
      await this.registerDevice(rvc);
      // We assume the robot is docked and the battery is user replaceble and fully charged until we can get battery info.
      await rvc.setAttribute(PowerSource.Cluster.with(PowerSource.Feature.Battery), 'batChargeLevel', PowerSource.BatChargeLevel.Ok); // Set to Ok since we don't have battery info yet.
      await rvc.setAttribute(PowerSource.Cluster.with(PowerSource.Feature.Battery, PowerSource.Feature.Rechargeable), 'batChargeState', PowerSource.BatChargeState.IsAtFullCharge); // Set to IsAtFullCharge since we don't have battery info yet.
      await rvc.setAttribute(PowerSource.Cluster.with(PowerSource.Feature.Battery), 'batReplaceability', PowerSource.BatReplaceability.UserReplaceable); // Set to UserReplaceable since we don't have battery info yet.
      await rvc.setAttribute(PowerSource.Cluster.with(PowerSource.Feature.Battery), 'batPercentRemaining', 200); // Set to 200 since we don't have battery info yet.
      await rvc.setAttribute(PowerSource.Cluster.with(PowerSource.Feature.Battery), 'batVoltage', null); // Set to null since we don't have battery info yet.

      const robotMqtt = new IRobotMqtt({
        ip: device.ip,
        blid: device.blid,
        password: device.password,
        logger: rvc.log,
        subscribeTopics: ['#'],
      });

      // Subscribe to changes in the RvcOperationalState.
      rvc.subscribeAttribute(RvcOperationalState.Complete, 'currentPhase', async (newPhase) => {
        const phaseList = rvc.getAttribute(RvcOperationalState.Complete, 'phaseList');
        if (!newPhase || !phaseList) return;
        rvc.log.notice(`Current Phase changed to ${newPhase}.${phaseList[newPhase]}`);
      });

      rvc.subscribeAttribute(RvcOperationalState.Complete, 'operationalState', async (newState) => {
        rvc.log.notice(`Operational State changed to ${newState}`);
      });

      // Map Matter's Robotic Vacuum commands to iRobot local MQTT commands.
      rvc.addCommandHandler('RvcRunMode.changeToMode', async ({ request }) => {
        const selectedMode = rvc.getAttribute(RvcRunMode.Complete, 'supportedModes')?.find((s) => s.mode === request.newMode);
        if (selectedMode?.modeTags?.some((tag) => tag.value === RvcRunMode.ModeTag.Cleaning)) {
          rvc.log.notice(`Run Mode changed to ${selectedMode.label}: starting cleaning cycle`);
          await robotMqtt.clean();
        } else if (selectedMode?.modeTags?.some((tag) => tag.value === RvcRunMode.ModeTag.Idle)) {
          rvc.log.notice(`Run Mode changed to ${selectedMode.label}: stopping cleaning cycle`);
          await robotMqtt.stop();
        }
      });

      rvc.addCommandHandler('RvcCleanMode.changeToMode', async ({ request }) => {
        const selectedMode = rvc.getAttribute(RvcCleanMode.Complete, 'supportedModes')?.find((s) => s.mode === request.newMode);
        rvc.log.notice(`Clean Mode changed to ${selectedMode?.label ?? 'unknown'}`);
      });

      rvc.addCommandHandler('ServiceArea.selectAreas', async ({ request }) => {
        rvc.log.notice(`Received selectAreas: [${request.newAreas.join(', ')}]`);
        await robotMqtt.resume();
      });

      rvc.addCommandHandler('RvcOperationalState.resume', async () => {
        rvc.log.notice('Received resume command');
        await robotMqtt.resume();
      });
      rvc.addCommandHandler('RvcOperationalState.pause', async () => {
        rvc.log.notice('Received pause command');
        await robotMqtt.pause();
      });
      rvc.addCommandHandler('RvcOperationalState.goHome', async () => {
        rvc.log.notice('Received goHome command');
        await robotMqtt.goHome();
      });

      if (!robotMqtt.isConfigured()) {
        this.log.warn(`Device "${device.name}" (${device.ip}) has no local MQTT credentials (blid/password); commands will be read-only.`);
      } else {
        this.mqttClients.set(device.ip ?? device.name + '-unknown-ip', robotMqtt);

        try {
          await robotMqtt.connect();
          // Optional: log state messages when debug is enabled.
          if (this.config.debug) {
            robotMqtt.on('message', (msg) => {
              if (msg.json !== undefined) {
                rvc.log.debug(
                  `${rs}[mqtt] ${msg.topic}:\n${inspect(msg.json, {
                    depth: null,
                    colors: true,
                    compact: false,
                    breakLength: 160,
                    maxArrayLength: null,
                    maxStringLength: null,
                  })}`,
                );
              } else {
                rvc.log.debug(`${rs}[mqtt] ${msg.topic}:\n${msg.payload.toString('utf8')}`);
              }
            });
          }
        } catch (error) {
          rvc.log.error(`Failed to connect MQTT for device "${device.name}" (${device.ip}):`, error);
        }
      }
    }
  }
}
