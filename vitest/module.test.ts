/**
 * @file vitest/module.test.ts
 * @description This file contains the tests for the Platform class.
 * @author Luca Liguori
 */

/* oxlint-disable unicorn/no-useless-undefined */

const MATTER_PORT = 6000;
const NAME = 'Platform';
const CREATE_ONLY = true;

import { invokeSubscribeHandler, MatterbridgeEndpoint, type PlatformMatterbridge } from 'matterbridge';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import { LogLevel } from 'matterbridge/logger';
import { PowerSource, RvcCleanMode, RvcOperationalState, RvcRunMode, ServiceArea } from 'matterbridge/matter/clusters';
import { flushAsync, log, loggerDebugSpy, loggerErrorSpy, loggerInfoSpy, loggerNoticeSpy, loggerWarnSpy, setDebug, setupTest } from 'matterbridge/vitest-utils';
import {
  addMatterbridge,
  createServerNode,
  createTestEnvironment,
  destroyTestEnvironment,
  flushServerNode,
  getMatterbridge,
  startServerNode,
  stopServerNode,
} from 'matterbridge/vitest-utils/matter';

import { IRobotDiscovery, type IRobotDiscoveryInfo } from '../src/iRobotDiscovery.js';
import { IRobotCredentials } from '../src/iRobotGetCredentials.js';
import { IRobotMqtt } from '../src/iRobotMqtt.js';
import initializePlugin, { type iRobotPlatformConfig, Platform } from '../src/module.js';

await setupTest(NAME);

const setAttributeMatterbridgeEndpointSpy = vi.spyOn(MatterbridgeEndpoint.prototype, 'setAttribute');

describe('TestPlatform', () => {
  let matterbridge: PlatformMatterbridge;
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
    await createTestEnvironment();
    await createServerNode(MATTER_PORT);
    if (!CREATE_ONLY) await startServerNode();
    matterbridge = getMatterbridge();
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup after each test
    vi.clearAllMocks();
    // Set debug to false after each test to avoid verbose logging in tests that don't need it
    await setDebug(false);
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    if (CREATE_ONLY) await flushServerNode();
    else await stopServerNode();
    await destroyTestEnvironment();

    // Restore all mocks
    vi.restoreAllMocks();
  });

  it('should return an instance of TestPlatform', async () => {
    platform = initializePlugin(matterbridge, log, config);
    addMatterbridge(platform);
    expect(platform).toBeInstanceOf(Platform);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Initializing platform:', config.name);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Finished initializing platform:', config.name);
    await platform.onShutdown();
    platform = undefined;
  });

  it('should throw error in load when version is not valid', () => {
    expect(() => new Platform({ ...matterbridge, matterbridgeVersion: '1.5.0' }, log, config)).toThrow(
      'This plugin requires Matterbridge version >= "3.10.0". Please update Matterbridge to the latest version in the frontend.',
    );
  });

  it('should create platform instance', async () => {
    platform = new Platform(matterbridge, log, config);
    expect(platform).toBeDefined();
    addMatterbridge(platform);
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
    await invokeSubscribeHandler(device, RvcOperationalState, 'currentPhase', 2, 1);
    await invokeSubscribeHandler(device, RvcOperationalState, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger, RvcOperationalState.OperationalState.Docked);
  });

  it('should invoke command handlers', async () => {
    expect(platform).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    await device?.invokeBehaviorCommand(RvcRunMode as any, 'RvcRunMode.changeToMode', { newMode: 2 });
    await device?.invokeBehaviorCommand(RvcRunMode as any, 'RvcRunMode.changeToMode', { newMode: 1 });
    await device?.invokeBehaviorCommand(RvcCleanMode as any, 'RvcRunMode.changeToMode', { newMode: 1 });
    await device?.invokeBehaviorCommand(ServiceArea as any, 'ServiceArea.selectAreas', { newAreas: [] });
    await device?.invokeBehaviorCommand(RvcOperationalState as any, 'RvcOperationalState.pause');
    await device?.invokeBehaviorCommand(RvcOperationalState as any, 'RvcOperationalState.resume');
    await device?.invokeBehaviorCommand(RvcOperationalState as any, 'RvcOperationalState.goHome');
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
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'batPercentRemaining', 100, expect.anything());

    setAttributeMatterbridgeEndpointSpy.mockClear();
    await platform.parseMqttMessage(device as RoboticVacuumCleaner, { state: { reported: { batPct: 0 } } } as any);
    expect(setAttributeMatterbridgeEndpointSpy).not.toHaveBeenCalled();

    const baseStatus = {
      cycle: 'none',
      phase: 'charge',
      error: 0,
      notReady: 0,
      initiator: 'app',
      missionId: 'mission-1',
    };

    setAttributeMatterbridgeEndpointSpy.mockClear();
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
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'operationalState', RvcOperationalState.OperationalState.Docked, expect.anything());
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 0, expect.anything());
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsCharging, expect.anything());

    setAttributeMatterbridgeEndpointSpy.mockClear();
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
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'operationalState', RvcOperationalState.OperationalState.Stopped, expect.anything());
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsNotCharging, expect.anything());
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 1, expect.anything());

    setAttributeMatterbridgeEndpointSpy.mockClear();
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
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsNotCharging, expect.anything());
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 2, expect.anything());

    setAttributeMatterbridgeEndpointSpy.mockClear();
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
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'batChargeState', PowerSource.BatChargeState.IsNotCharging, expect.anything());
    expect(setAttributeMatterbridgeEndpointSpy).toHaveBeenCalledWith(expect.anything(), 'currentPhase', 3, expect.anything());
  });

  it('should shutdown', async () => {
    expect(platform).toBeDefined();
    if (!platform) throw new Error('Platform instance is not defined');
    await platform.onShutdown('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith('onShutdown called with reason:', 'Test reason');
    platform = undefined;
  });

  it('should discover only new devices and map discovered fields into the config', async () => {
    const discoverSpy = vi
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
    addMatterbridge(platform);

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
    const discoverSpy = vi
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
    const discoverSpy = vi.spyOn(IRobotDiscovery.prototype, 'discover').mockRejectedValue(new Error('discover failed'));

    const testConfig: iRobotPlatformConfig = {
      ...config,
      discovery: true,
      devices: [{ name: 'Existing', ip: '192.168.1.10', blid: 'existing-blid', password: 'secret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridge(platform);

    await platform.discoverDevices(3210);

    expect(discoverSpy).toHaveBeenCalledWith(3210);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to discover iRobot devices: discover failed');
    expect(testConfig.devices).toEqual([{ name: 'Existing', ip: '192.168.1.10', blid: 'existing-blid', password: 'secret' }]);

    discoverSpy.mockRestore();
    await platform.onShutdown();
    platform = undefined;
  });

  it('should register devices, connect configured MQTT, and wire handlers', async () => {
    const getRobotPublicInfoSpy = vi.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(async (ip, timeout): Promise<IRobotDiscoveryInfo> => ({
      ip,
      hostname: `Roomba-${ip}`,
      rinfo: { address: ip, family: 'IPv4', port: timeout ?? 5678, size: 0 },
    }));
    const mqttInstances: IRobotMqtt[] = [];
    const connectSpy = vi.spyOn(IRobotMqtt.prototype, 'connect').mockImplementation(async function (this: IRobotMqtt) {
      mqttInstances.push(this);
    });
    const disconnectSpy = vi.spyOn(IRobotMqtt.prototype, 'disconnect').mockResolvedValue();
    const cleanSpy = vi.spyOn(IRobotMqtt.prototype, 'clean').mockResolvedValue();
    const stopSpy = vi.spyOn(IRobotMqtt.prototype, 'stop').mockResolvedValue();
    const resumeSpy = vi.spyOn(IRobotMqtt.prototype, 'resume').mockResolvedValue();
    const pauseSpy = vi.spyOn(IRobotMqtt.prototype, 'pause').mockResolvedValue();
    const goHomeSpy = vi.spyOn(IRobotMqtt.prototype, 'goHome').mockResolvedValue();
    const addCommandHandlerSpy = vi.spyOn(RoboticVacuumCleaner.prototype, 'addCommandHandler');
    const subscribeAttributeSpy = vi.spyOn(RoboticVacuumCleaner.prototype, 'subscribeAttribute');
    const getAttributeSpy = vi.spyOn(RoboticVacuumCleaner.prototype, 'getAttribute').mockImplementation((_cluster, attribute) => {
      if (attribute === 'supportedModes') {
        if ((_cluster as unknown) === RvcCleanMode) {
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
      // oxlint-disable-next-line unicorn/no-useless-undefined -- explicit undefined keeps a consistent return type for the mock
      return undefined;
    });

    const testConfig: iRobotPlatformConfig = {
      ...config,
      debug: true,
      devices: [{ name: 'Kitchen', ip: '192.168.1.50', blid: 'kitchen-blid', password: 'topsecret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridge(platform);

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

    const registeredCommands = addCommandHandlerSpy.mock.calls.map(([command]) => command).toSorted();
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
    const currentPhaseHandler = [...subscribeAttributeSpy.mock.calls].toReversed().find(([, attribute]) => attribute === 'currentPhase')?.[2] as
      | ((newPhase: number | undefined) => Promise<void>)
      | undefined;
    const operationalStateHandler = [...subscribeAttributeSpy.mock.calls].toReversed().find(([, attribute]) => attribute === 'operationalState')?.[2] as
      | ((newState: number) => Promise<void>)
      | undefined;

    // oxlint-disable-next-line unicorn/no-useless-undefined -- exercises the undefined-phase branch of the subscribe handler
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
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'supportedModes');
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcCleanMode, 'supportedModes');
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
    const getRobotPublicInfoSpy = vi.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(async (ip, timeout): Promise<IRobotDiscoveryInfo> => ({
      ip,
      hostname: `Roomba-${ip}`,
      rinfo: { address: ip, family: 'IPv4', port: timeout ?? 5678, size: 0 },
    }));
    const connectSpy = vi.spyOn(IRobotMqtt.prototype, 'connect').mockResolvedValue();
    const disconnectSpy = vi.spyOn(IRobotMqtt.prototype, 'disconnect').mockResolvedValue();
    const cleanSpy = vi.spyOn(IRobotMqtt.prototype, 'clean').mockResolvedValue();
    const stopSpy = vi.spyOn(IRobotMqtt.prototype, 'stop').mockResolvedValue();
    const resumeSpy = vi.spyOn(IRobotMqtt.prototype, 'resume').mockResolvedValue();
    const pauseSpy = vi.spyOn(IRobotMqtt.prototype, 'pause').mockResolvedValue();
    const goHomeSpy = vi.spyOn(IRobotMqtt.prototype, 'goHome').mockResolvedValue();
    const addCommandHandlerSpy = vi.spyOn(RoboticVacuumCleaner.prototype, 'addCommandHandler');
    const subscribeAttributeSpy = vi.spyOn(RoboticVacuumCleaner.prototype, 'subscribeAttribute');
    const getAttributeSpy = vi.spyOn(RoboticVacuumCleaner.prototype, 'getAttribute').mockImplementation((_cluster, attribute) => {
      if (attribute === 'supportedModes') {
        if ((_cluster as unknown) === RvcCleanMode) {
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
      // oxlint-disable-next-line unicorn/no-useless-undefined -- explicit undefined keeps a consistent return type for the mock
      return undefined;
    });

    const testConfig: iRobotPlatformConfig = {
      ...config,
      devices: [{ name: 'Hallway', ip: '192.168.1.51', blid: '', password: '' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridge(platform);

    await platform.registerDevices(4321);

    expect(connectSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith('Device "Hallway" (192.168.1.51) has no local MQTT credentials (blid/password); commands will be read-only.');
    expect(addCommandHandlerSpy.mock.calls.map(([command]) => command).toSorted()).toEqual([
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
    const currentPhaseHandler = [...subscribeAttributeSpy.mock.calls].toReversed().find(([, attribute]) => attribute === 'currentPhase')?.[2] as
      | ((newPhase: number | undefined) => Promise<void>)
      | undefined;
    const operationalStateHandler = [...subscribeAttributeSpy.mock.calls].toReversed().find(([, attribute]) => attribute === 'operationalState')?.[2] as
      | ((newState: number) => Promise<void>)
      | undefined;

    // oxlint-disable-next-line unicorn/no-useless-undefined -- exercises the undefined-phase branch of the subscribe handler
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
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcRunMode, 'supportedModes');
    expect(getAttributeSpy).toHaveBeenCalledWith(RvcCleanMode, 'supportedModes');
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
    const getRobotPublicInfoSpy = vi.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(async (ip): Promise<IRobotDiscoveryInfo> => {
      if (ip === '192.168.1.60') throw new Error('public info failed');
      return {
        ip,
        hostname: `Roomba-${ip}`,
        rinfo: { address: ip, family: 'IPv4', port: 5678, size: 0 },
      };
    });
    const connectSpy = vi.spyOn(IRobotMqtt.prototype, 'connect').mockRejectedValue(new Error('mqtt connect failed'));
    const disconnectSpy = vi.spyOn(IRobotMqtt.prototype, 'disconnect').mockResolvedValue();

    const testConfig: iRobotPlatformConfig = {
      ...config,
      devices: [
        { name: 'Office', ip: '192.168.1.60', blid: 'office-blid', password: 'secret' },
        { name: 'Guest', ip: '192.168.1.61', blid: '', password: '' },
      ],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridge(platform);

    await platform.registerDevices(2468);

    expect(getRobotPublicInfoSpy).toHaveBeenNthCalledWith(1, '192.168.1.60', 2468);
    expect(getRobotPublicInfoSpy).toHaveBeenNthCalledWith(2, '192.168.1.61', 2468);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to get public info for device "Office" with IP 192.168.1.60: public info failed');
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
    const getRobotPublicInfoSpy = vi.spyOn(IRobotDiscovery.prototype, 'getRobotPublicInfo').mockImplementation(async (ip): Promise<IRobotDiscoveryInfo> => ({
      ip,
      hostname: `Roomba-${ip}`,
      rinfo: { address: ip, family: 'IPv4', port: 5678, size: 0 },
    }));
    const connectSpy = vi.spyOn(IRobotMqtt.prototype, 'connect').mockResolvedValue();
    const disconnectSpy = vi.spyOn(IRobotMqtt.prototype, 'disconnect').mockRejectedValue(new Error('disconnect failed'));

    const testConfig: iRobotPlatformConfig = {
      ...config,
      devices: [{ name: 'Bedroom', ip: '192.168.1.70', blid: 'bedroom-blid', password: 'secret' }],
    };

    platform = new Platform(matterbridge, log, testConfig);
    addMatterbridge(platform);

    await platform.registerDevices();
    await platform.onShutdown('disconnect failure cleanup');

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledWith(true);
    expect(loggerDebugSpy).toHaveBeenCalledWith('Failed to disconnect MQTT client for device with IP 192.168.1.70: disconnect failed');

    getRobotPublicInfoSpy.mockRestore();
    connectSpy.mockRestore();
    disconnectSpy.mockRestore();
    platform = undefined;
  });

  it('should retrieve credentials, update existing devices, add new devices, and save the config on onAction', async () => {
    const credentialsSpy = vi.spyOn(IRobotCredentials.prototype, 'getCredentials').mockResolvedValue([
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
    addMatterbridge(platform);

    const saveConfigSpy = vi.spyOn(platform, 'saveConfig').mockImplementation(() => undefined);
    const snackbarSpy = vi.spyOn(platform, 'wssSendSnackbarMessage').mockImplementation(() => undefined);

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
    const credentialsSpy = vi.spyOn(IRobotCredentials.prototype, 'getCredentials').mockResolvedValue([]);

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
    addMatterbridge(platform);

    const saveConfigSpy = vi.spyOn(platform, 'saveConfig').mockImplementation(() => undefined);
    const snackbarSpy = vi.spyOn(platform, 'wssSendSnackbarMessage').mockImplementation(() => undefined);

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
