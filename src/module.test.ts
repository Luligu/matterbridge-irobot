const MATTER_PORT = 6000;
const NAME = 'Platform';
const HOMEDIR = path.join('jest', NAME);
const CREATE_ONLY = true;

import path from 'node:path';

import { jest } from '@jest/globals';
import { invokeSubscribeHandler, MatterbridgeEndpoint } from 'matterbridge';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import {
  addMatterbridgePlatform,
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  flushAsync,
  log,
  loggerDebugSpy,
  loggerErrorSpy,
  loggerInfoSpy,
  loggerNoticeSpy,
  loggerWarnSpy,
  matterbridge,
  setAttributeSpy,
  setDebug,
  setupTest,
  startMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
} from 'matterbridge/jestutils';
import { LogLevel } from 'matterbridge/logger';
import { PowerSource, RvcCleanMode, RvcOperationalState, RvcRunMode, ServiceArea } from 'matterbridge/matter/clusters';

import { IRobotDiscovery, type IRobotDiscoveryInfo } from './iRobotDiscovery.js';
import { IRobotCredentials } from './iRobotGetCredentials.js';
import { IRobotMqtt } from './iRobotMqtt.js';
import initializePlugin, { iRobotPlatformConfig, Platform } from './module.js';

await setupTest(NAME, false);

describe('TestPlatform', () => {
  let platform: Platform | undefined;
  let device: MatterbridgeEndpoint | undefined;

  const config: iRobotPlatformConfig = {
    name: 'matterbridge-irobot',
    type: 'DynamicPlatform',
    version: '1.0.0',
    username: '',
    password: '',
    discovery: false,
    devices: [],
    whiteList: [],
    blackList: [],
    enableServerRvc: false,
    debug: false,
    logLevel: LogLevel.DEBUG,
    logOnFile: true,
    unregisterOnShutdown: false,
  };

  beforeAll(async () => {
    // Create Matterbridge environment
    await createMatterbridgeEnvironment(NAME, CREATE_ONLY);
    await startMatterbridgeEnvironment(MATTER_PORT, CREATE_ONLY);
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup after each test
    jest.clearAllMocks();
    // Set debug to false after each test to avoid verbose logging in tests that don't need it
    await setDebug(false);
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    await stopMatterbridgeEnvironment(CREATE_ONLY);
    await destroyMatterbridgeEnvironment(undefined, undefined, CREATE_ONLY);

    // Restore all mocks
    jest.restoreAllMocks();
  });

  it('should return an instance of TestPlatform', async () => {
    platform = initializePlugin(matterbridge, log, config);
    addMatterbridgePlatform(platform);
    expect(platform).toBeInstanceOf(Platform);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Initializing platform:', config.name);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Finished initializing platform:', config.name);
    await platform.onShutdown();
    platform = undefined;
  });

  it('should throw error in load when version is not valid', () => {
    const savedVersion = matterbridge.matterbridgeVersion;
    matterbridge.matterbridgeVersion = '1.5.0';
    expect(() => new Platform(matterbridge, log, config)).toThrow(
      'This plugin requires Matterbridge version >= "3.7.3". Please update Matterbridge to the latest version in the frontend.',
    );
    matterbridge.matterbridgeVersion = savedVersion;
  });

  it('should create platform instance', async () => {
    platform = new Platform(matterbridge, log, config);
    expect(platform).toBeDefined();
    addMatterbridgePlatform(platform);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Initializing platform:', config.name);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Finished initializing platform:', config.name);
  });

  it('should call start', async () => {
    expect(platform).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    config.devices = [{ name: 'Test Device' }];
    await platform.onStart('Test reason');
    await flushAsync();
    expect(loggerInfoSpy).toHaveBeenCalledWith('onStart called with reason:', 'Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Registering device "${config.devices[0].name}" with IP ${config.devices[0].ip}...`);
  });

  it('should call subscribe handlers', async () => {
    expect(platform).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    device = platform.getDeviceByName(config.devices[0].name);
    expect(device).toBeDefined();
    if (!device) throw new Error('Device instance is not defined');
    await invokeSubscribeHandler(device, RvcOperationalState.Complete, 'currentPhase', 2, 1);
    await invokeSubscribeHandler(
      device,
      RvcOperationalState.Complete,
      'operationalState',
      RvcOperationalState.OperationalState.SeekingCharger,
      RvcOperationalState.OperationalState.Docked,
    );
  });

  it('should invoke command handlers', async () => {
    expect(platform).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    await device?.invokeBehaviorCommand(RvcRunMode.Complete as any, 'RvcRunMode.changeToMode', { newMode: 2 });
    await device?.invokeBehaviorCommand(RvcRunMode.Complete as any, 'RvcRunMode.changeToMode', { newMode: 1 });
    await device?.invokeBehaviorCommand(RvcCleanMode.Complete as any, 'RvcRunMode.changeToMode', { newMode: 1 });
    await device?.invokeBehaviorCommand(ServiceArea.Complete as any, 'ServiceArea.selectAreas', { newAreas: [] });
    await device?.invokeBehaviorCommand(RvcOperationalState.Complete as any, 'RvcOperationalState.pause');
    await device?.invokeBehaviorCommand(RvcOperationalState.Complete as any, 'RvcOperationalState.resume');
    await device?.invokeBehaviorCommand(RvcOperationalState.Complete as any, 'RvcOperationalState.goHome');
  });

  it('should configure', async () => {
    expect(platform).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    await platform.onConfigure();
    expect(loggerInfoSpy).toHaveBeenCalledWith('onConfigure called');
  });

  it('should parse MQTT messages', async () => {
    expect(platform).toBeDefined();
    expect(device).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    if (!device) throw new Error('Device instance is not defined');

    await platform.parseMqttMessage(device as RoboticVacuumCleaner, { state: { reported: { batPct: 50 } } } as any);
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'batPercentRemaining', 100, expect.anything());

    setAttributeSpy.mockClear();
    await platform.parseMqttMessage(device as RoboticVacuumCleaner, { state: { reported: { batPct: 0 } } } as any);
    expect(setAttributeSpy).not.toHaveBeenCalled();

    const baseStatus = {
      cycle: 'none',
      phase: 'charge',
      error: 0,
      notReady: 0,
      initiator: 'app',
      missionId: 'mission-1',
    };

    setAttributeSpy.mockClear();
    await platform.parseMqttMessage(
      device as RoboticVacuumCleaner,
      {
        state: {
          reported: {
            cleanMissionStatus: baseStatus,
          },
        },
      } as any,
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'operationalState', RvcOperationalState.OperationalState.Docked, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 0, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsCharging, expect.anything());

    setAttributeSpy.mockClear();
    await platform.parseMqttMessage(
      device as RoboticVacuumCleaner,
      {
        state: {
          reported: {
            cleanMissionStatus: { ...baseStatus, phase: 'run' },
          },
        },
      } as any,
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'operationalState', RvcOperationalState.OperationalState.Stopped, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsNotCharging, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 1, expect.anything());

    setAttributeSpy.mockClear();
    await platform.parseMqttMessage(
      device as RoboticVacuumCleaner,
      {
        state: {
          reported: {
            cleanMissionStatus: { ...baseStatus, phase: 'stop' },
          },
        },
      } as any,
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsNotCharging, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 2, expect.anything());

    setAttributeSpy.mockClear();
    await platform.parseMqttMessage(
      device as RoboticVacuumCleaner,
      {
        state: {
          reported: {
            cleanMissionStatus: { ...baseStatus, phase: 'hmUsrDock' },
          },
        },
      } as any,
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsNotCharging, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 3, expect.anything());
  });

  it('should shutdown', async () => {
    expect(platform).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    await platform.onShutdown('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith('onShutdown called with reason:', 'Test reason');
    platform = undefined;
  });

  it('should discover only new devices and map discovered fields into the config', async () => {
    const discoverSpy = jest
      .spyOn(IRobotDiscovery.prototype, 'discover')
      .mockResolvedValue([
        { ip: '192.168.1.10', hostname: 'Roomba-existing', robotname: 'Existing duplicate', robotid: 'existing-blid' } as never,
        { ip: '192.168.1.20', hostname: 'Roomba-new', robotname: 'Kitchen', robotid: 'new-blid' } as never,
        { ip: '192.168.1.30', hostname: 'Roomba-no-name', robotname: undefined, robotid: undefined } as never,
      ]);

    const testConfig: iRobotPlatformConfig = {
      ...config,
      discovery: true,
      devices: [{ name: 'Existing', ip: '192.168.1.10', blid: 'existing-blid', password: 'secret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    await platform.discoverDevices(1234);

    expect(discoverSpy).toHaveBeenCalledWith(1234);
    expect(testConfig.devices).toEqual([
      { name: 'Existing', ip: '192.168.1.10', blid: 'existing-blid', password: 'secret' },
      { name: 'Kitchen', ip: '192.168.1.20', blid: 'new-blid', password: '' },
      { name: 'iRobot-192.168.1.30', ip: '192.168.1.30', blid: '', password: '' },
    ]);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Discovered 3 iRobot devices:');
    expect(loggerInfoSpy).toHaveBeenCalledWith('- device: "Kitchen" ip 192.168.1.20');
    expect(loggerInfoSpy).toHaveBeenCalledWith('- device: "iRobot-192.168.1.30" ip 192.168.1.30');

    discoverSpy.mockRestore();
    await platform.onShutdown();
    platform = undefined;
  });

  it('should still run discovery when called directly even if the config flag is disabled', async () => {
    const discoverSpy = jest
      .spyOn(IRobotDiscovery.prototype, 'discover')
      .mockResolvedValue([{ ip: '192.168.1.41', hostname: 'Roomba-config-disabled', robotname: 'Configured Later', robotid: 'later-blid' } as never]);

    const testConfig: iRobotPlatformConfig = {
      ...config,
      discovery: false,
      devices: [{ name: 'Configured', ip: '192.168.1.40', blid: 'configured-blid', password: 'secret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    platform.config.discovery = false;

    await platform.discoverDevices(999);

    expect(discoverSpy).toHaveBeenCalledWith(999);
    expect(testConfig.devices).toEqual([
      { name: 'Configured', ip: '192.168.1.40', blid: 'configured-blid', password: 'secret' },
      { name: 'Configured Later', ip: '192.168.1.41', blid: 'later-blid', password: '' },
    ]);

    discoverSpy.mockRestore();
    await platform.onShutdown();
    platform = undefined;
  });

  it('should log a discovery error and keep the config unchanged when discovery fails', async () => {
    const discoverSpy = jest.spyOn(IRobotDiscovery.prototype, 'discover').mockRejectedValue(new Error('discover failed'));

    const testConfig: iRobotPlatformConfig = {
      ...config,
      discovery: true,
      devices: [{ name: 'Existing', ip: '192.168.1.10', blid: 'existing-blid', password: 'secret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    await platform.discoverDevices(3210);

    expect(discoverSpy).toHaveBeenCalledWith(3210);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to discover iRobot devices. Error: discover failed');
    expect(testConfig.devices).toEqual([{ name: 'Existing', ip: '192.168.1.10', blid: 'existing-blid', password: 'secret' }]);

    discoverSpy.mockRestore();
    await platform.onShutdown();
    platform = undefined;
  });

  it('should register devices, connect configured MQTT, and wire handlers', async () => {
    const getRobotPublicInfoSpy = jest.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(
      async (ip, timeout): Promise<IRobotDiscoveryInfo> => ({
        ip,
        hostname: `Roomba-${ip}`,
        rinfo: { address: ip, family: 'IPv4', port: timeout ?? 5678, size: 0 },
      }),
    );
    const mqttInstances: IRobotMqtt[] = [];
    const connectSpy = jest.spyOn(IRobotMqtt.prototype, 'connect').mockImplementation(async function (this: IRobotMqtt) {
      mqttInstances.push(this);
    });
    const disconnectSpy = jest.spyOn(IRobotMqtt.prototype, 'disconnect').mockResolvedValue();
    const cleanSpy = jest.spyOn(IRobotMqtt.prototype, 'clean').mockResolvedValue();
    const stopSpy = jest.spyOn(IRobotMqtt.prototype, 'stop').mockResolvedValue();
    const resumeSpy = jest.spyOn(IRobotMqtt.prototype, 'resume').mockResolvedValue();
    const pauseSpy = jest.spyOn(IRobotMqtt.prototype, 'pause').mockResolvedValue();
    const goHomeSpy = jest.spyOn(IRobotMqtt.prototype, 'goHome').mockResolvedValue();
    const addCommandHandlerSpy = jest.spyOn(RoboticVacuumCleaner.prototype, 'addCommandHandler');
    const subscribeAttributeSpy = jest.spyOn(RoboticVacuumCleaner.prototype, 'subscribeAttribute').mockResolvedValue(true);
    const getAttributeSpy = jest.spyOn(RoboticVacuumCleaner.prototype, 'getAttribute').mockImplementation((_cluster, attribute) => {
      if (attribute === 'supportedModes') {
        if ((_cluster as unknown) === RvcCleanMode.Complete) {
          return [{ label: 'Vacuum', mode: 1, modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }] }];
        }
        return [
          { label: 'Cleaning', mode: 2, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },
          { label: 'Idle', mode: 1, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
        ];
      }
      if (attribute === 'phaseList') {
        return ['charge', 'run', 'stop', 'hmUsrDock'];
      }
      return undefined;
    });

    const testConfig: iRobotPlatformConfig = {
      ...config,
      debug: true,
      devices: [{ name: 'Kitchen', ip: '192.168.1.50', blid: 'kitchen-blid', password: 'topsecret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    await platform.registerDevices(4321);

    expect(getRobotPublicInfoSpy).toHaveBeenNthCalledWith(1, '192.168.1.50', 4321);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Registering device "Kitchen" with IP 192.168.1.50...');
    expect(loggerInfoSpy).toHaveBeenCalledWith('Getting public info for device "Kitchen" with IP 192.168.1.50...');
    expect(loggerInfoSpy).toHaveBeenCalledWith('Public info for device "Kitchen" with IP 192.168.1.50:\n', {
      ip: '192.168.1.50',
      hostname: 'Roomba-192.168.1.50',
      rinfo: { address: '192.168.1.50', family: 'IPv4', port: 4321, size: 0 },
    });
    expect(connectSpy).toHaveBeenCalledTimes(1);

    const registeredCommands = addCommandHandlerSpy.mock.calls.map(([command]) => command).sort();
    expect(registeredCommands).toEqual([
      'RvcCleanMode.changeToMode',
      'RvcOperationalState.goHome',
      'RvcOperationalState.pause',
      'RvcOperationalState.resume',
      'RvcRunMode.changeToMode',
      'ServiceArea.selectAreas',
    ]);

    const commandHandlers = new Map(addCommandHandlerSpy.mock.calls.map(([command, handler]) => [command as string, handler as () => Promise<void>]));
    const runModeHandler = commandHandlers.get('RvcRunMode.changeToMode') as ((args: { request: { newMode: number } }) => Promise<void>) | undefined;
    const cleanModeHandler = commandHandlers.get('RvcCleanMode.changeToMode') as ((args: { request: { newMode: number } }) => Promise<void>) | undefined;
    const selectAreasHandler = commandHandlers.get('ServiceArea.selectAreas') as ((args: { request: { newAreas: number[] } }) => Promise<void>) | undefined;
    const currentPhaseHandler = [...subscribeAttributeSpy.mock.calls].reverse().find(([, attribute]) => attribute === 'currentPhase')?.[2] as
      | ((newPhase: number | undefined) => Promise<void>)
      | undefined;
    const operationalStateHandler = [...subscribeAttributeSpy.mock.calls].reverse().find(([, attribute]) => attribute === 'operationalState')?.[2] as
      | ((newState: number) => Promise<void>)
      | undefined;

    await currentPhaseHandler?.(undefined);
    await currentPhaseHandler?.(1);
    await operationalStateHandler?.(64);
    await runModeHandler?.({ request: { newMode: 2 } });
    await runModeHandler?.({ request: { newMode: 1 } });
    await cleanModeHandler?.({ request: { newMode: 1 } });
    await selectAreasHandler?.({ request: { newAreas: [1, 7] } });
    await commandHandlers.get('RvcOperationalState.resume')?.();
    await commandHandlers.get('RvcOperationalState.pause')?.();
    await commandHandlers.get('RvcOperationalState.goHome')?.();

    expect(cleanSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(goHomeSpy).toHaveBeenCalledTimes(1);
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Complete, 'supportedModes');
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcCleanMode.Complete, 'supportedModes');
    expect(getAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'phaseList');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Current Phase changed to 1 >>> run');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Operational State changed to 64');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Clean Mode changed to Vacuum');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Received selectAreas: [1, 7]');

    mqttInstances[0]?.emit('message', { topic: 'state/json', payload: Buffer.from('{"phase":"run"}'), json: { phase: 'run' } });
    mqttInstances[0]?.emit('message', { topic: 'state/text', payload: Buffer.from('idle'), json: undefined });

    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('[mqtt] state/json:'));
    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('[mqtt] state/text:'));

    await platform.onShutdown('registerDevices success cleanup');

    expect(disconnectSpy).toHaveBeenCalledWith(true);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Disconnected MQTT client for device with IP 192.168.1.50');

    getRobotPublicInfoSpy.mockRestore();
    connectSpy.mockRestore();
    disconnectSpy.mockRestore();
    cleanSpy.mockRestore();
    stopSpy.mockRestore();
    resumeSpy.mockRestore();
    pauseSpy.mockRestore();
    goHomeSpy.mockRestore();
    addCommandHandlerSpy.mockRestore();
    subscribeAttributeSpy.mockRestore();
    getAttributeSpy.mockRestore();
    platform = undefined;
  });

  it('should wire subscriptions and command handlers without connecting when credentials are missing', async () => {
    const getRobotPublicInfoSpy = jest.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(
      async (ip, timeout): Promise<IRobotDiscoveryInfo> => ({
        ip,
        hostname: `Roomba-${ip}`,
        rinfo: { address: ip, family: 'IPv4', port: timeout ?? 5678, size: 0 },
      }),
    );
    const connectSpy = jest.spyOn(IRobotMqtt.prototype, 'connect').mockResolvedValue();
    const disconnectSpy = jest.spyOn(IRobotMqtt.prototype, 'disconnect').mockResolvedValue();
    const cleanSpy = jest.spyOn(IRobotMqtt.prototype, 'clean').mockResolvedValue();
    const stopSpy = jest.spyOn(IRobotMqtt.prototype, 'stop').mockResolvedValue();
    const resumeSpy = jest.spyOn(IRobotMqtt.prototype, 'resume').mockResolvedValue();
    const pauseSpy = jest.spyOn(IRobotMqtt.prototype, 'pause').mockResolvedValue();
    const goHomeSpy = jest.spyOn(IRobotMqtt.prototype, 'goHome').mockResolvedValue();
    const addCommandHandlerSpy = jest.spyOn(RoboticVacuumCleaner.prototype, 'addCommandHandler');
    const subscribeAttributeSpy = jest.spyOn(RoboticVacuumCleaner.prototype, 'subscribeAttribute').mockResolvedValue(true);
    const getAttributeSpy = jest.spyOn(RoboticVacuumCleaner.prototype, 'getAttribute').mockImplementation((_cluster, attribute) => {
      if (attribute === 'supportedModes') {
        if ((_cluster as unknown) === RvcCleanMode.Complete) {
          return [{ label: 'Vacuum', mode: 1, modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }] }];
        }
        return [
          { label: 'Cleaning', mode: 2, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },
          { label: 'Idle', mode: 1, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
        ];
      }
      if (attribute === 'phaseList') {
        return ['charge', 'run', 'stop', 'hmUsrDock'];
      }
      return undefined;
    });

    const testConfig: iRobotPlatformConfig = {
      ...config,
      devices: [{ name: 'Hallway', ip: '192.168.1.51', blid: '', password: '' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    await platform.registerDevices(4321);

    expect(connectSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith('Device "Hallway" (192.168.1.51) has no local MQTT credentials (blid/password); commands will be read-only.');
    expect(addCommandHandlerSpy.mock.calls.map(([command]) => command).sort()).toEqual([
      'RvcCleanMode.changeToMode',
      'RvcOperationalState.goHome',
      'RvcOperationalState.pause',
      'RvcOperationalState.resume',
      'RvcRunMode.changeToMode',
      'ServiceArea.selectAreas',
    ]);

    const commandHandlers = new Map(addCommandHandlerSpy.mock.calls.map(([command, handler]) => [command as string, handler as () => Promise<void>]));
    const runModeHandler = commandHandlers.get('RvcRunMode.changeToMode') as ((args: { request: { newMode: number } }) => Promise<void>) | undefined;
    const cleanModeHandler = commandHandlers.get('RvcCleanMode.changeToMode') as ((args: { request: { newMode: number } }) => Promise<void>) | undefined;
    const selectAreasHandler = commandHandlers.get('ServiceArea.selectAreas') as ((args: { request: { newAreas: number[] } }) => Promise<void>) | undefined;
    const currentPhaseHandler = [...subscribeAttributeSpy.mock.calls].reverse().find(([, attribute]) => attribute === 'currentPhase')?.[2] as
      | ((newPhase: number | undefined) => Promise<void>)
      | undefined;
    const operationalStateHandler = [...subscribeAttributeSpy.mock.calls].reverse().find(([, attribute]) => attribute === 'operationalState')?.[2] as
      | ((newState: number) => Promise<void>)
      | undefined;

    await currentPhaseHandler?.(undefined);
    await currentPhaseHandler?.(1);
    await operationalStateHandler?.(64);
    await runModeHandler?.({ request: { newMode: 2 } });
    await runModeHandler?.({ request: { newMode: 1 } });
    await cleanModeHandler?.({ request: { newMode: 1 } });
    await selectAreasHandler?.({ request: { newAreas: [1, 7] } });
    await commandHandlers.get('RvcOperationalState.resume')?.();
    await commandHandlers.get('RvcOperationalState.pause')?.();
    await commandHandlers.get('RvcOperationalState.goHome')?.();

    expect(cleanSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(goHomeSpy).toHaveBeenCalledTimes(1);
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Complete, 'supportedModes');
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcCleanMode.Complete, 'supportedModes');
    expect(getAttributeSpy).toHaveBeenCalledWith(expect.anything(), 'phaseList');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Current Phase changed to 1 >>> run');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Operational State changed to 64');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Clean Mode changed to Vacuum');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Received selectAreas: [1, 7]');

    await platform.onShutdown('registerDevices no credentials cleanup');

    expect(disconnectSpy).not.toHaveBeenCalled();

    getRobotPublicInfoSpy.mockRestore();
    connectSpy.mockRestore();
    disconnectSpy.mockRestore();
    cleanSpy.mockRestore();
    stopSpy.mockRestore();
    resumeSpy.mockRestore();
    pauseSpy.mockRestore();
    goHomeSpy.mockRestore();
    addCommandHandlerSpy.mockRestore();
    subscribeAttributeSpy.mockRestore();
    getAttributeSpy.mockRestore();
    platform = undefined;
  });

  it('should log public info and MQTT connection failures while continuing registration', async () => {
    const getRobotPublicInfoSpy = jest.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(async (ip): Promise<IRobotDiscoveryInfo> => {
      if (ip === '192.168.1.60') throw new Error('public info failed');
      return {
        ip,
        hostname: `Roomba-${ip}`,
        rinfo: { address: ip, family: 'IPv4', port: 5678, size: 0 },
      };
    });
    const connectSpy = jest.spyOn(IRobotMqtt.prototype, 'connect').mockRejectedValue(new Error('mqtt connect failed'));
    const disconnectSpy = jest.spyOn(IRobotMqtt.prototype, 'disconnect').mockResolvedValue();

    const testConfig: iRobotPlatformConfig = {
      ...config,
      devices: [
        { name: 'Office', ip: '192.168.1.60', blid: 'office-blid', password: 'secret' },
        { name: 'Guest', ip: '192.168.1.61', blid: '', password: '' },
      ],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    await platform.registerDevices(2468);

    expect(getRobotPublicInfoSpy).toHaveBeenNthCalledWith(1, '192.168.1.60', 2468);
    expect(getRobotPublicInfoSpy).toHaveBeenNthCalledWith(2, '192.168.1.61', 2468);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to get public info for device "Office" with IP 192.168.1.60. Error: public info failed');
    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to connect MQTT for device "Office" (192.168.1.60):', expect.any(Error));
    expect(loggerWarnSpy).toHaveBeenCalledWith('Device "Guest" (192.168.1.61) has no local MQTT credentials (blid/password); commands will be read-only.');

    await platform.onShutdown('registerDevices failure cleanup');

    expect(disconnectSpy).toHaveBeenCalledWith(true);

    getRobotPublicInfoSpy.mockRestore();
    connectSpy.mockRestore();
    disconnectSpy.mockRestore();
    platform = undefined;
  });

  it('should log a debug message when MQTT disconnect fails during shutdown', async () => {
    const getRobotPublicInfoSpy = jest.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(
      async (ip): Promise<IRobotDiscoveryInfo> => ({
        ip,
        hostname: `Roomba-${ip}`,
        rinfo: { address: ip, family: 'IPv4', port: 5678, size: 0 },
      }),
    );
    const connectSpy = jest.spyOn(IRobotMqtt.prototype, 'connect').mockResolvedValue();
    const disconnectSpy = jest.spyOn(IRobotMqtt.prototype, 'disconnect').mockRejectedValue(new Error('disconnect failed'));

    const testConfig: iRobotPlatformConfig = {
      ...config,
      devices: [{ name: 'Bedroom', ip: '192.168.1.70', blid: 'bedroom-blid', password: 'secret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    await platform.registerDevices();
    await platform.onShutdown('disconnect failure cleanup');

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledWith(true);
    expect(loggerDebugSpy).toHaveBeenCalledWith('Failed to disconnect MQTT client for device with IP 192.168.1.70. Error: disconnect failed');

    getRobotPublicInfoSpy.mockRestore();
    connectSpy.mockRestore();
    disconnectSpy.mockRestore();
    platform = undefined;
  });

  it('should retrieve credentials, update existing devices, add new devices, and save the config on onAction', async () => {
    const credentialsSpy = jest.spyOn(IRobotCredentials.prototype, 'getCredentials').mockResolvedValue([
      {
        blid: 'existing-blid-updated',
        password: 'existing-password-updated',
        name: 'Existing Robot',
        sku: 'R98----',
        softwareVer: 'v1.0.0',
      },
      {
        blid: 'new-blid',
        password: 'new-password',
        name: 'New Robot',
        sku: 'J7-----',
        softwareVer: 'v2.0.0',
      },
    ]);

    const testConfig: iRobotPlatformConfig = {
      ...config,
      username: 'config-user@example.com',
      password: 'config-password',
      devices: [
        {
          name: 'Existing Robot',
          ip: '192.168.1.80',
          blid: 'old-blid',
          password: 'old-password',
        },
      ],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    const saveConfigSpy = jest.spyOn(platform, 'saveConfig').mockImplementation(() => undefined as never);
    const snackbarSpy = jest.spyOn(platform, 'wssSendSnackbarMessage').mockImplementation(() => undefined as never);

    await platform.onAction('retrieve', undefined, 'matterbridge-irobot.schema.json', {
      ...testConfig,
      username: 'form-user@example.com',
      password: 'form-password',
    });

    expect(credentialsSpy).toHaveBeenCalledTimes(1);
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Received action retrieve for schema matterbridge-irobot.schema.json'));
    expect(loggerInfoSpy).toHaveBeenCalledWith('Retrieving credentials from iRobot cloud...');
    expect(loggerInfoSpy).toHaveBeenCalledWith('Retrieved 2 iRobots. Adding them to the config...');
    expect(loggerInfoSpy).toHaveBeenCalledWith('Adding username and password for device with name Existing Robot to config.');
    expect(loggerInfoSpy).toHaveBeenCalledWith('Adding device with name New Robot to config.');

    expect(snackbarSpy).toHaveBeenNthCalledWith(1, 'Retrieving credentials from iRobot cloud...', 5, 'info');
    expect(snackbarSpy).toHaveBeenNthCalledWith(2, 'Successfully retrieved 2 iRobots from iRobot cloud. Adding devices to the config...', 30, 'info');

    expect(testConfig.devices).toEqual([
      {
        name: 'Existing Robot',
        ip: '192.168.1.80',
        blid: 'existing-blid-updated',
        password: 'existing-password-updated',
      },
      {
        name: 'New Robot',
        blid: 'new-blid',
        password: 'new-password',
      },
    ]);
    expect(saveConfigSpy).toHaveBeenCalledTimes(2);
    expect(saveConfigSpy).toHaveBeenNthCalledWith(1, testConfig);
    expect(saveConfigSpy).toHaveBeenNthCalledWith(2, testConfig);

    credentialsSpy.mockRestore();
    saveConfigSpy.mockRestore();
    snackbarSpy.mockRestore();
    await platform.onShutdown();
    platform = undefined;
  });

  it('should warn and avoid saving config when onAction retrieve gets zero credentials', async () => {
    const credentialsSpy = jest.spyOn(IRobotCredentials.prototype, 'getCredentials').mockResolvedValue([]);

    const testConfig: iRobotPlatformConfig = {
      ...config,
      username: 'config-user@example.com',
      password: 'config-password',
      devices: [
        {
          name: 'Existing Robot',
          ip: '192.168.1.81',
          blid: 'old-blid',
          password: 'old-password',
        },
      ],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridgePlatform(platform);

    const saveConfigSpy = jest.spyOn(platform, 'saveConfig').mockImplementation(() => undefined as never);
    const snackbarSpy = jest.spyOn(platform, 'wssSendSnackbarMessage').mockImplementation(() => undefined as never);

    await platform.onAction('retrieve', undefined, 'matterbridge-irobot.schema.json', {
      ...testConfig,
      username: 'form-user@example.com',
      password: 'form-password',
    });

    expect(credentialsSpy).toHaveBeenCalledTimes(1);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Retrieving credentials from iRobot cloud...');
    expect(loggerWarnSpy).toHaveBeenCalledWith('No iRobots retrieved. Please check your username and password and try again.');

    expect(snackbarSpy).toHaveBeenNthCalledWith(1, 'Retrieving credentials from iRobot cloud...', 5, 'info');
    expect(snackbarSpy).toHaveBeenNthCalledWith(2, 'No iRobots retrieved from iRobot cloud. Please check your username and password and try again.', 30, 'warning');

    expect(testConfig.devices).toEqual([
      {
        name: 'Existing Robot',
        ip: '192.168.1.81',
        blid: 'old-blid',
        password: 'old-password',
      },
    ]);
    expect(saveConfigSpy).not.toHaveBeenCalled();

    credentialsSpy.mockRestore();
    saveConfigSpy.mockRestore();
    snackbarSpy.mockRestore();
    await platform.onShutdown();
    platform = undefined;
  });
});
