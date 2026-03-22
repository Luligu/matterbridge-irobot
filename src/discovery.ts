import dgram from 'node:dgram';

import { AnsiLogger, LogLevel, TimestampFormat } from 'node-ansi-logger';

export interface DiscoveryInfo {
  ip: string;
  ver?: string;
  hostname?: string; // Hostname of the device, e.g., 'Roomba-<robotid>' or 'iRobot-<robotid>'
  robotname?: string; // User friendly name of the robot
  robotid?: string; // Username for mqtt
  mac?: string;
  sw?: string; // Software version, e.g., 'v2.0.0-34'
  sku?: string; // Stock Keeping Unit, robot model identifier, e.g., 'R98----'
  nc?: number; // Network configuration status
  proto?: string; // Protocol used for communication, typically 'mqtt'
  /**
   * Robot capabilities - indicates which features the robot supports.
   * Values have specific meanings:
   * - 0 = Feature not supported/disabled
   * - 1 = Basic support/enabled
   * - 2+ = Advanced support with version/capability level
   * - null = Feature status unknown/not applicable
   *
   * Based on dorita980, roombapy, homebridge-roomba, and rest980 libraries,
   * plus actual robot discovery data from modern iRobot devices.
   */
  cap?: {
    // Core navigation and positioning capabilities
    /** Robot reports position/navigation data (x, y, theta coordinates). 1=basic, 2=advanced positioning */
    'pose'?: number;
    /** Robot navigation system. 1=basic navigation */
    'rNav'?: number;
    /** Navigation system. 1=basic navigation system */
    'ns'?: number;

    // Mapping capabilities
    /** Mapping and smart navigation support. 1=basic, 3=advanced mapping with room detection */
    'maps'?: number;
    /** Persistent maps. 10=advanced persistent mapping with multiple floor plans */
    'pmaps'?: number;
    /** Semantic mapping to user-meaningful format. 2=advanced semantic mapping */
    'sem2umf'?: number;
    /** Floor type detection (carpet vs hard floor). 2=advanced floor type detection */
    'floorTypeDetect'?: number;
    /** Keep out zones support. 1=basic virtual barriers, 2=advanced zone management */
    'keepOutZones'?: number;

    // Cleaning capabilities
    /** Multiple cleaning passes support. 1=basic, 2=configurable multi-pass */
    'multiPass'?: number;
    /** Automatic carpet boost feature (increased suction on carpets). 1=enabled */
    'carpetBoost'?: number;
    /** Edge cleaning mode support. 1=enabled, null=not applicable to this model */
    'edge'?: number | null;
    /** Eco cleaning mode support. 1=basic eco mode */
    'eco'?: number;
    /** Area/room specific cleaning. 1=basic area cleaning */
    'area'?: number;
    /** Room-specific cleaning with individual room selection. 1=basic, 2=advanced room management */
    'regions'?: number;
    /** Cleaning passes configuration. 1=single pass, 2=double pass, 3=auto passes */
    'cleaningPasses'?: number;
    /** Always finish cleaning even on low battery. 1=enabled */
    'alwaysFinish'?: number;

    // Hardware and sensors
    /** Bin full detection capability. 1=basic, 2=advanced bin monitoring */
    'binFullDetect'?: number;
    /** Add-on hardware support (like clean base). 1=basic add-on support */
    'addOnHw'?: number;
    /** Dock communication capabilities. 1=basic dock communication */
    'dockComm'?: number;
    /** Threshold line detection. 2=advanced threshold detection */
    'tLine'?: number;
    /** Water tank support for mopping models. 1=basic tank, 2=advanced tank monitoring */
    'tank'?: number;
    /** Self-emptying capability (i7+/s9+ models). 1=basic evacuation, 2=advanced auto-empty */
    'evac'?: number;

    // Advanced AI and obstacle avoidance
    /** Over-door obstacle avoidance. 7=advanced AI-powered obstacle avoidance */
    'odoa'?: number;
    /** Obstacle detection and avoidance system. 1=basic, 2=advanced with object recognition */
    'obstacleAvoidance'?: number;

    // Software and connectivity
    /** Over-the-air update capability. 1=basic, 2=full OTA support */
    'ota'?: number;
    /** Language over-the-air updates. 0=not supported, 1=supported */
    'langOta'?: number;
    /** Language support. 2=advanced language support */
    'lang'?: number;
    /** 5GHz WiFi support. 1=5GHz capable */
    '5ghz'?: number;
    /** Bluetooth connectivity. 1=basic BLE, 2=advanced Bluetooth features */
    'ble'?: number;

    // Configuration and management
    /** Persistent preferences support. 0=not supported, 1=supported */
    'pp'?: number;
    /** Power/password management. 0=not supported */
    'pw'?: number;
    /** Operation mode capabilities. 10=advanced operation modes */
    'oMode'?: number;
    /** Provisioning capabilities. 3=advanced provisioning */
    'prov'?: number;
    /** Scheduling capabilities. 2=advanced scheduling */
    'sched'?: number;
    /** Service configuration support. 1=basic service config */
    'svcConf'?: number;
    /** Mission control capabilities. 2=advanced mission control */
    'mc'?: number;
    /** Expecting user configuration. 2=advanced user config support */
    'expectingUserConf'?: number;

    // Multi-robot and advanced features
    /** Team/multi-robot support. 1=basic team support */
    'team'?: number;
    /** Home mapping capabilities. 0=not supported */
    'hm'?: number;
    /** Idle state management. 1=basic idle management */
    'idl'?: number;

    // Status and state reporting
    /** Mission status reporting. 1=basic status, 2=detailed mission tracking */
    'missionStatus'?: number;
    /** Battery status reporting. 1=basic percentage, 2=detailed battery analytics */
    'batteryStatus'?: number;
    /** Charging state detection. 1=basic charging detection */
    'chargingState'?: number;
    /** Docking state detection. 1=basic dock detection, 2=advanced dock positioning */
    'dockingState'?: number;
    /** Running state detection. 1=basic activity detection */
    'runningState'?: number;
    /** Paused state detection. 1=basic pause detection */
    'pausedState'?: number;

    // Maintenance and diagnostics
    /** Logging capability. 2=advanced logging */
    'log'?: number;
    /** Bluetooth logging. 1=BLE logging supported */
    'bleLog'?: number;
    /** Filter maintenance tracking. 1=basic filter monitoring */
    'filterMaintenance'?: number;
    /** Error reporting and diagnostics. 1=basic errors, 2=detailed diagnostics */
    'errorReporting'?: number;

    // Cloud and connectivity features
    /** Cloud connectivity. 1=basic cloud features, 2=full cloud integration */
    'cloud'?: number;
    /** Remote control capabilities. 1=basic remote control */
    'remoteControl'?: number;
    /** Firmware update notifications. 1=update notifications available */
    'fwUpdateNotify'?: number;
  } & Record<string, number | null>;
  freq?: number; // Frequency information
  cloudConnState?: number; // Cloud connection state
  rinfo: dgram.RemoteInfo;
}

export class Discovery {
  private readonly port = 5678;
  private readonly message = Buffer.from('irobotmcs');
  private readonly devices = new Map<string, DiscoveryInfo>();
  private readonly log = new AnsiLogger({ logName: 'Discovery', logLevel: LogLevel.DEBUG, logTimestampFormat: TimestampFormat.TIME_MILLIS });

  /**
   * iRobot Discovery Protocol is udp4 based.
   * It uses a broadcast udp message to port 5678 to discover iRobot devices on the local network.
   * The iRobot app sends a packet with data: 69726f626f746d6373="irobotmcs".
   * The devices respond with a JSON object DiscoveryInfo containing various fields.
   *
   * @param {number} timeout - Discovery timeout in milliseconds. Default is 3000ms.
   *
   * @returns {Promise<DiscoveryInfo[]>} Promise that resolves to an array of discovered devices with their information.
   * @throws {Error} If there is an error during discovery, such as a socket error or timeout.
   */
  async discover(timeout: number = 5000): Promise<DiscoveryInfo[]> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');

      socket.on('error', (err) => {
        socket.close();
        reject(err);
      });

      socket.on('message', (msg, rinfo) => {
        try {
          const parsed = JSON.parse(msg.toString()) as DiscoveryInfo;
          const prefix = parsed.hostname?.split('-')[0];
          if ((prefix === 'Roomba' || prefix === 'iRobot') && parsed.ip) {
            parsed.rinfo = rinfo;
            this.devices.set(parsed.ip, parsed);
          }
        } catch {
          this.log.error('Error parsing discovery response from', rinfo.address, 'message:', msg.toString());
        }
      });

      socket.bind(this.port, () => {
        socket.setBroadcast(true);
        for (let i = 0; i < 10; i++) {
          // Send multiple times to increase discovery reliability
          socket.send(this.message, 0, this.message.length, this.port, '255.255.255.255'); // Broadcast to all udp4 devices
        }
      });

      setTimeout(() => {
        socket.close();
        resolve(Array.from(this.devices.values()));
      }, timeout);
    });
  }

  /**
   * Get robot public information using UDP discovery protocol.
   * This extracts the BLID from the hostname and other robot details.
   *
   * @param {string} robotIP - IP address of the robot
   * @param {number} timeout - Timeout for the discovery in milliseconds. Default is 5000ms.
   * @returns {Promise<DiscoveryInfo>} Promise that resolves to robot discovery information
   *
   * @throws {Error} If there is an error during the information retrieval, such as a socket error or timeout.
   */
  async getRobotPublicInfo(robotIP: string, timeout: number = 5000): Promise<DiscoveryInfo> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');

      const timeoutId = setTimeout(() => {
        socket.close();
        reject(new Error(`Timeout getting robot info from ${robotIP}`));
      }, timeout);

      socket.on('error', (err) => {
        clearTimeout(timeoutId);
        socket.close();
        reject(err);
      });

      socket.on('message', (msg) => {
        try {
          const parsedMsg = JSON.parse(msg.toString()) as DiscoveryInfo;
          // console.log(`Received discovery response from ${robotIP}:`, parsedMsg);
          if (parsedMsg.hostname && parsedMsg.ip && (parsedMsg.hostname.split('-')[0] === 'Roomba' || parsedMsg.hostname.split('-')[0] === 'iRobot')) {
            clearTimeout(timeoutId);
            socket.close();
            // Add extracted BLID to the response
            const blid = parsedMsg.hostname.split('-')[1];
            resolve({ ...parsedMsg, robotid: blid });
          }
        } catch {
          // Ignore invalid JSON
        }
      });

      socket.bind(5678, () => {
        for (let i = 0; i < 10; i++) {
          // Send multiple times to increase discovery reliability
          socket.send(this.message, 0, this.message.length, this.port, '255.255.255.255'); // Broadcast to all udp4 devices
        }
      });
    });
  }
}
