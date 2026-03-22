const MATTER_PORT = 6000;
const NAME = 'Platform';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path';

import { jest } from '@jest/globals';
import { PlatformConfig } from 'matterbridge';
import {
  addMatterbridgePlatform,
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  log,
  loggerInfoSpy,
  matterbridge,
  setupTest,
  startMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
} from 'matterbridge/jestutils';

import initializePlugin, { iRobotPlatformConfig, Platform } from './module.js';

setupTest('Platform');

describe('TestPlatform', () => {
  let platform: Platform | undefined;

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
    debug: false,
    unregisterOnShutdown: false,
  };

  beforeAll(async () => {
    // Create Matterbridge environment
    await createMatterbridgeEnvironment(NAME);
    await startMatterbridgeEnvironment(MATTER_PORT);
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup after each test
    if (platform) {
      try {
        await platform.onShutdown('test cleanup');
      } catch {
        // ignore cleanup errors
      } finally {
        platform = undefined;
      }
    }
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    await stopMatterbridgeEnvironment();
    await destroyMatterbridgeEnvironment();

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
      'This plugin requires Matterbridge version >= "3.7.0". Please update Matterbridge to the latest version in the frontend.',
    );
    matterbridge.matterbridgeVersion = savedVersion;
  });

  it('should call lifecycle methods in order', async () => {
    platform = new Platform(matterbridge, log, config);
    addMatterbridgePlatform(platform);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Initializing platform:', config.name);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Finished initializing platform:', config.name);

    await platform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith('onStart called with reason:', 'Test reason');

    await platform.onConfigure();
    expect(loggerInfoSpy).toHaveBeenCalledWith('onConfigure called');

    await platform.onShutdown('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith('onShutdown called with reason:', 'Test reason');

    platform = undefined;
  });
});
