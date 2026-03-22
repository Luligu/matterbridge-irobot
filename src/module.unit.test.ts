import { EventEmitter } from 'node:events';

import { describe, expect, it, jest } from '@jest/globals';

// These are controlled by our mocked MatterbridgeDynamicPlatform.
declare global {
  var __mbVerifyMode: 'true' | 'false' | 'missing' | undefined;
}

type Log = {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

function makeLog(): Log {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe('Platform (unit)', () => {
  it('constructor sets defaults and logs', async () => {
    jest.resetModules();
    globalThis.__mbVerifyMode = 'true';

    // --- mocks
    await jest.unstable_mockModule('matterbridge', () => {
      class MatterbridgeDynamicPlatform {
        public log: any;
        public config: any;
        public verifyMatterbridgeVersion: any;
        public registerDevice = jest.fn(async () => undefined);
        public unregisterAllDevices = jest.fn(async () => undefined);

        async onConfigure(): Promise<void> {
          // no-op
        }

        async onShutdown(_reason?: string): Promise<void> {
          // no-op
        }

        constructor(_mb: any, log: any, config: any) {
          this.log = log;
          this.config = config;
          if (globalThis.__mbVerifyMode === 'missing') {
            this.verifyMatterbridgeVersion = undefined;
          } else {
            this.verifyMatterbridgeVersion = () => globalThis.__mbVerifyMode !== 'false';
          }
        }
      }

      return {
        MatterbridgeDynamicPlatform,
      };
    });

    await jest.unstable_mockModule('matterbridge/devices', () => {
      class RoboticVacuumCleaner {
        public log = { debug: jest.fn(), error: jest.fn() };
        public handlers = new Map<string, () => Promise<void>>();
        public addCommandHandler = jest.fn((command: string, handler: () => Promise<void>) => {
          this.handlers.set(command, handler);
        });

        constructor(
          public name: string,
          public ip: string,
        ) {}
      }

      return { RoboticVacuumCleaner };
    });

    await jest.unstable_mockModule('matterbridge/logger', () => ({
      AnsiLogger: class {
        public readonly __mock = 'AnsiLogger';
        public noop(): void {
          // no-op
        }
      },
    }));

    await jest.unstable_mockModule('./discovery.js', () => ({
      Discovery: class {
        async discover(): Promise<any[]> {
          return [];
        }
        async getRobotPublicInfo(): Promise<any> {
          return {};
        }
      },
    }));

    await jest.unstable_mockModule('./irobot-mqtt.js', () => ({
      IRobotMqtt: class extends EventEmitter {
        public readonly __mock = 'IRobotMqtt';
      },
    }));

    const mod = await import('./module.js');
    const { Platform } = mod as any;

    const log = makeLog();
    const config: any = {
      name: 'matterbridge-irobot',
      type: 'DynamicPlatform',
      version: '1.0.0',
      username: '',
      password: '',
      // omit discovery/devices/debug/unregisterOnShutdown on purpose
    };

    const platform = new Platform({}, log, config);

    expect(log.info).toHaveBeenCalledWith('Initializing platform:', config.name);
    expect(config.discovery).toBe(true);
    expect(config.devices).toEqual([]);
    expect(config.debug).toBe(false);
    expect(config.unregisterOnShutdown).toBe(false);
    expect(log.info).toHaveBeenCalledWith('Finished initializing platform:', config.name);

    // sanity: instance exists
    expect(platform).toBeDefined();
  });

  it('constructor throws when verifyMatterbridgeVersion is missing/false', async () => {
    jest.resetModules();

    const makeMatterbridgeMock = async () => {
      await jest.unstable_mockModule('matterbridge', () => {
        class MatterbridgeDynamicPlatform {
          public log: any;
          public config: any;
          public verifyMatterbridgeVersion: any;
          constructor(_mb: any, log: any, config: any) {
            this.log = log;
            this.config = config;
            if (globalThis.__mbVerifyMode === 'missing') this.verifyMatterbridgeVersion = undefined;
            else this.verifyMatterbridgeVersion = () => globalThis.__mbVerifyMode !== 'false';
          }

          async onConfigure(): Promise<void> {
            // no-op
          }

          async onShutdown(_reason?: string): Promise<void> {
            // no-op
          }
        }
        return { MatterbridgeDynamicPlatform };
      });
      await jest.unstable_mockModule('matterbridge/devices', () => ({
        RoboticVacuumCleaner: class {
          public readonly __mock = 'RoboticVacuumCleaner';
          public noop(): void {
            // no-op
          }
        },
      }));
      await jest.unstable_mockModule('matterbridge/logger', () => ({
        AnsiLogger: class {
          public readonly __mock = 'AnsiLogger';
          public noop(): void {
            // no-op
          }
        },
      }));
      await jest.unstable_mockModule('./discovery.js', () => ({
        Discovery: class {
          public readonly __mock = 'Discovery';
          public noop(): void {
            // no-op
          }
        },
      }));
      await jest.unstable_mockModule('./irobot-mqtt.js', () => ({
        IRobotMqtt: class extends EventEmitter {
          public readonly __mock = 'IRobotMqtt';
          public noop(): void {
            // no-op
          }
        },
      }));
    };

    const log = makeLog();
    const config: any = {
      name: 'matterbridge-irobot',
      type: 'DynamicPlatform',
      version: '1.0.0',
      username: '',
      password: '',
      discovery: false,
      devices: [],
      whiteList: [],
      blackList: [],
      debug: false,
      unregisterOnShutdown: false,
    };

    globalThis.__mbVerifyMode = 'missing';
    await makeMatterbridgeMock();
    {
      const { Platform } = (await import('./module.js')) as any;
      expect(() => new Platform({}, log, { ...config })).toThrow('This plugin requires Matterbridge version');
    }

    jest.resetModules();
    globalThis.__mbVerifyMode = 'false';
    await makeMatterbridgeMock();
    {
      const { Platform } = (await import('./module.js')) as any;
      expect(() => new Platform({}, log, { ...config })).toThrow('This plugin requires Matterbridge version');
    }
  });

  it('onStart covers discovery, MQTT branches, debug message handler, and error paths', async () => {
    jest.resetModules();
    globalThis.__mbVerifyMode = 'true';

    const discoveryDiscover = jest.fn<() => Promise<any[]>>();
    const discoveryPublicInfo = jest.fn<(ip: string) => Promise<any>>();

    const mqttConnectOutcomes: Array<'resolve' | 'reject'> = ['resolve', 'reject'];
    const mqttDisconnectOutcomes: Array<'resolve' | 'reject'> = ['resolve', 'reject'];
    const mqttInstances: any[] = [];
    const rvcInstances: any[] = [];

    await jest.unstable_mockModule('matterbridge', () => {
      class MatterbridgeDynamicPlatform {
        public log: any;
        public config: any;
        public verifyMatterbridgeVersion: any;
        public registerDevice = jest.fn(async () => undefined);
        public unregisterAllDevices = jest.fn(async () => undefined);

        async onConfigure(): Promise<void> {
          // no-op
        }

        async onShutdown(_reason?: string): Promise<void> {
          // no-op
        }

        constructor(_mb: any, log: any, config: any) {
          this.log = log;
          this.config = config;
          this.verifyMatterbridgeVersion = () => true;
        }
      }
      return { MatterbridgeDynamicPlatform };
    });

    await jest.unstable_mockModule('matterbridge/devices', () => {
      class RoboticVacuumCleaner {
        public log = { debug: jest.fn(), error: jest.fn() };
        public handlers = new Map<string, () => Promise<void>>();
        public addCommandHandler = jest.fn((command: string, handler: () => Promise<void>) => {
          this.handlers.set(command, handler);
        });

        constructor(
          public name: string,
          public ip: string,
        ) {
          rvcInstances.push(this);
        }
      }
      return { RoboticVacuumCleaner };
    });

    await jest.unstable_mockModule('matterbridge/logger', () => ({
      AnsiLogger: class {
        public readonly __mock = 'AnsiLogger';
        public noop(): void {
          // no-op
        }
      },
    }));

    await jest.unstable_mockModule('./discovery.js', () => ({
      Discovery: class {
        async discover(): Promise<any[]> {
          return discoveryDiscover();
        }
        async getRobotPublicInfo(ip: string): Promise<any> {
          return discoveryPublicInfo(ip);
        }
      },
    }));

    await jest.unstable_mockModule('./irobot-mqtt.js', () => {
      class IRobotMqtt extends EventEmitter {
        public connect = jest.fn(async () => {
          const outcome = mqttConnectOutcomes.shift() ?? 'resolve';
          if (outcome === 'reject') throw new Error('connect fail');
        });
        public disconnect = jest.fn(async () => {
          const outcome = mqttDisconnectOutcomes.shift() ?? 'resolve';
          if (outcome === 'reject') throw new Error('disconnect fail');
        });
        public start = jest.fn(async () => undefined);
        public stop = jest.fn(async () => undefined);
        public goHome = jest.fn(async () => undefined);

        constructor(public cfg: any) {
          super();
          mqttInstances.push(this);
        }
      }
      return { IRobotMqtt };
    });

    const { Platform } = (await import('./module.js')) as any;

    const log = makeLog();
    const config: any = {
      name: 'matterbridge-irobot',
      type: 'DynamicPlatform',
      version: '1.0.0',
      username: '',
      password: '',
      discovery: true,
      devices: [
        { name: 'Ok', ip: '10.0.0.1', blid: 'B1', password: 'P1' },
        { name: 'Fail', ip: '10.0.0.3', blid: 'B3', password: 'P3' },
      ],
      whiteList: [],
      blackList: [],
      debug: true,
      unregisterOnShutdown: false,
    };

    // discovery adds one new device and one duplicate
    discoveryDiscover.mockResolvedValue([
      { ip: '10.0.0.1', hostname: 'Roomba-B1', robotname: 'Dup', robotid: 'B1' },
      { ip: '10.0.0.2', hostname: 'iRobot-RID2', robotname: undefined, robotid: 'RID2' },
      { ip: '10.0.0.4', hostname: 'iRobot-NO-ID', robotname: 'HasNoId', robotid: undefined },
    ]);

    discoveryPublicInfo.mockImplementation(async (ip: string) => {
      if (ip === '10.0.0.3') throw new Error('public info fail');
      return { ip, hostname: 'Roomba-X' };
    });

    const platform = new Platform({}, log, config);

    // Run without reason to hit reason ?? 'none'
    await platform.onStart();

    // New discovered device should be appended with fallback name and robotid->blid mapping.
    expect(config.devices.some((d: any) => d.ip === '10.0.0.2' && d.name === 'iRobot-10.0.0.2' && d.blid === 'RID2')).toBe(true);

    // Discovered device without a robotid should map to empty blid.
    expect(config.devices.some((d: any) => d.ip === '10.0.0.4' && d.name === 'HasNoId' && d.blid === '')).toBe(true);

    // public info failure should log error
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to get public info for device "Fail"'), expect.any(Error));

    // One device has no password (discovered), so warn path should trigger.
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('has no local MQTT credentials'));

    // MQTT connect: first resolves, second rejects and triggers rvc.log.error
    const rvcOk = rvcInstances.find((r) => r.ip === '10.0.0.1');
    const rvcFail = rvcInstances.find((r) => r.ip === '10.0.0.3');
    expect(rvcOk).toBeDefined();
    expect(rvcFail).toBeDefined();
    expect(rvcFail.log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to connect MQTT'), expect.any(Error));

    // Debug message handler branches (json vs text)
    const mqttOk = mqttInstances[0];
    mqttOk.emit('message', { topic: 't/json', payload: Buffer.from('{"x":1}'), json: { x: 1 } });
    mqttOk.emit('message', { topic: 't/text', payload: Buffer.from('hello'), json: undefined });
    expect(rvcOk.log.debug).toHaveBeenCalled();

    // Command handlers mapped
    expect(rvcOk.handlers.has('RvcOperationalState.resume')).toBe(true);
    expect(rvcOk.handlers.has('RvcOperationalState.pause')).toBe(true);
    expect(rvcOk.handlers.has('RvcOperationalState.goHome')).toBe(true);

    await rvcOk.handlers.get('RvcOperationalState.resume')?.();
    await rvcOk.handlers.get('RvcOperationalState.pause')?.();
    await rvcOk.handlers.get('RvcOperationalState.goHome')?.();

    expect(mqttOk.start).toHaveBeenCalledTimes(1);
    expect(mqttOk.stop).toHaveBeenCalledTimes(1);
    expect(mqttOk.goHome).toHaveBeenCalledTimes(1);

    // registerDevice called for all devices (4 total)
    expect(platform.registerDevice).toHaveBeenCalledTimes(4);

    // onShutdown default reason branch
    await platform.onShutdown();
    // One disconnect rejects but is ignored; clients cleared. Unregister not called.
    expect(platform.unregisterAllDevices).not.toHaveBeenCalled();
  });

  it('onConfigure and onShutdown unregister branch', async () => {
    jest.resetModules();
    globalThis.__mbVerifyMode = 'true';

    const mqttInstances: any[] = [];

    await jest.unstable_mockModule('matterbridge', () => {
      class MatterbridgeDynamicPlatform {
        public log: any;
        public config: any;
        public verifyMatterbridgeVersion: any;
        public registerDevice = jest.fn(async () => undefined);
        public unregisterAllDevices = jest.fn(async () => undefined);

        async onConfigure(): Promise<void> {
          // no-op
        }

        async onShutdown(_reason?: string): Promise<void> {
          // no-op
        }

        constructor(_mb: any, log: any, config: any) {
          this.log = log;
          this.config = config;
          this.verifyMatterbridgeVersion = () => true;
        }
      }
      return { MatterbridgeDynamicPlatform };
    });

    await jest.unstable_mockModule('matterbridge/devices', () => ({
      RoboticVacuumCleaner: class {
        public log = { debug: jest.fn(), error: jest.fn() };
        public addCommandHandler = jest.fn();
        constructor(
          public name: string,
          public ip: string,
        ) {}
      },
    }));

    await jest.unstable_mockModule('matterbridge/logger', () => ({
      AnsiLogger: class {
        public readonly __mock = 'AnsiLogger';
        public noop(): void {
          // no-op
        }
      },
    }));

    await jest.unstable_mockModule('./discovery.js', () => ({
      Discovery: class {
        async discover(): Promise<any[]> {
          return [];
        }
        async getRobotPublicInfo(): Promise<any> {
          return {};
        }
      },
    }));

    await jest.unstable_mockModule('./irobot-mqtt.js', () => {
      class IRobotMqtt extends EventEmitter {
        public connect = jest.fn(async () => undefined);
        public disconnect = jest.fn(async () => undefined);
        constructor() {
          super();
          mqttInstances.push(this);
        }
      }
      return { IRobotMqtt };
    });

    const { Platform } = (await import('./module.js')) as any;
    const log = makeLog();
    const config: any = {
      name: 'matterbridge-irobot',
      type: 'DynamicPlatform',
      version: '1.0.0',
      username: '',
      password: '',
      discovery: false,
      devices: [{ name: 'Ok', ip: '10.0.0.1', blid: 'B1', password: 'P1' }],
      whiteList: [],
      blackList: [],
      debug: false,
      unregisterOnShutdown: true,
    };

    const platform = new Platform({}, log, config);

    await platform.onConfigure();
    expect(log.info).toHaveBeenCalledWith('onConfigure called');

    await platform.onStart('reason');
    await platform.onShutdown('reason');
    expect(platform.unregisterAllDevices).toHaveBeenCalledTimes(1);
    expect(mqttInstances[0].disconnect).toHaveBeenCalledWith(true);
  });
});
