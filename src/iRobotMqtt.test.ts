const MATTER_PORT = 0;
const NAME = 'IRobotMqtt';
const HOMEDIR = path.join('jest', NAME);
const CREATE_ONLY = true;

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { inspect } from 'node:util';

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { setupTest } from 'matterbridge/jestutils';
import type { IClientOptions } from 'mqtt';

import { IRobotMqtt } from './iRobotMqtt.js';

await setupTest(NAME, false);

function formatLogValue(value: unknown): string {
  return inspect(value, {
    depth: null,
    colors: false,
    compact: false,
    breakLength: 160,
    maxArrayLength: null,
    maxStringLength: null,
  });
}

function parseOptionalRegex(value: string | undefined): RegExp | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
    const lastSlash = trimmed.lastIndexOf('/');
    const pattern = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1);
    return new RegExp(pattern, flags);
  }

  return new RegExp(trimmed);
}

const __testUtils = {
  formatLogValue,
  parseOptionalRegex,
};

class FakeMqttClient extends EventEmitter {
  connected = false;
  reconnecting = false;

  subscribeImpl: (topics: string[] | string, options: unknown, callback: (error?: Error | null) => void) => void = (_topics, _options, callback) => callback(null);
  publishImpl: (topic: string, payload: string, options: unknown, callback: (error?: Error | null) => void) => void = (_topic, _payload, _options, callback) => callback(null);
  endImpl: (force: boolean, opts: unknown, callback: (error?: Error) => void) => void = (_force, _opts, callback) => callback();

  subscribe = jest.fn((topics: string[] | string, options: unknown, callback: (error?: Error | null) => void) => {
    this.subscribeImpl(topics, options, callback);
  });

  publish = jest.fn((topic: string, payload: string, options: unknown, callback: (error?: Error | null) => void) => {
    this.publishImpl(topic, payload, options, callback);
  });

  end = jest.fn((force: boolean, opts: unknown, callback: (error?: Error) => void) => {
    this.connected = false;
    this.endImpl(force, opts, callback);
  });
}

const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('IRobotMqtt', () => {
  it('constructor uses default connect() function when connectFn is omitted', () => {
    // We don't call connect() here, so no real network is used.
    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any });
    expect(client.isConnected()).toBe(false);
    expect(client.isConfigured()).toBe(true);
  });

  it('constructor treats missing fields as unconfigured', () => {
    const connectFn = jest.fn();

    const missingIp = new IRobotMqtt({ ip: '', blid: 'B', password: 'P', logger: logger as any }, connectFn as any);
    const missingBlid = new IRobotMqtt({ ip: '1.2.3.4', blid: '', password: 'P', logger: logger as any }, connectFn as any);
    const missingPassword = new IRobotMqtt({ ip: '1.2.3.4', blid: 'B', password: '', logger: logger as any }, connectFn as any);

    expect(missingIp.isConfigured()).toBe(false);
    expect(missingBlid.isConfigured()).toBe(false);
    expect(missingPassword.isConfigured()).toBe(false);
  });

  it('connect() returns early when credentials are missing', async () => {
    const connectFn = jest.fn();
    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: '', password: '', logger: logger as any }, connectFn as any);

    await expect(client.connect()).resolves.toBeUndefined();

    expect(connectFn).not.toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });

  it('connect() subscribes and resolves on connect event', async () => {
    const fake = new FakeMqttClient();

    const connectFn = jest.fn<(_url: string, _options: IClientOptions) => FakeMqttClient>((_url: string, _options: IClientOptions) => {
      // Simulate async connection establishment.
      queueMicrotask(() => {
        fake.connected = true;
        fake.emit('connect');
      });
      return fake;
    });

    const client = new IRobotMqtt(
      {
        ip: '192.168.1.2',
        blid: 'BLID',
        password: 'PASSWORD',
        logger: logger as any,
      },
      connectFn as unknown as (url: string, options: IClientOptions) => any,
    );

    await expect(client.connect()).resolves.toBeUndefined();
    expect(client.isConnected()).toBe(true);
    expect(connectFn).toHaveBeenCalledTimes(1);
    expect(fake.subscribe).toHaveBeenCalledTimes(1);
    expect(fake.subscribe.mock.calls[0]?.[0]).toEqual(['#']);
  });

  it('connect() returns early when already connected / reconnecting', async () => {
    const fake = new FakeMqttClient();
    fake.connected = true;

    const connectFn = jest.fn((_url: string, _options: IClientOptions) => fake as any);
    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any }, connectFn as any);

    // @ts-expect-error - internal test setup
    client.client = fake;
    await expect(client.connect()).resolves.toBeUndefined();
    expect(connectFn).not.toHaveBeenCalled();

    fake.connected = false;
    fake.reconnecting = true;
    await expect(client.connect()).resolves.toBeUndefined();
    expect(connectFn).not.toHaveBeenCalled();
  });

  it('connect() logs subscribe failure but still resolves', async () => {
    const fake = new FakeMqttClient();
    fake.subscribeImpl = (_topics, _options, callback) => callback(new Error('sub fail'));

    const connectFn = jest.fn((_url: string, _options: IClientOptions) => {
      queueMicrotask(() => {
        fake.connected = true;
        fake.emit('connect');
      });
      return fake as any;
    });

    const client = new IRobotMqtt(
      {
        ip: '192.168.1.2',
        blid: 'BLID',
        password: 'PASSWORD',
        logger: logger as any,
      },
      connectFn as any,
    );

    await expect(client.connect()).resolves.toBeUndefined();
    // allow connect handler async subscription attempt
    await Promise.resolve();
    expect(logger.warn).toHaveBeenCalledWith('IRobotMqtt subscribe failed:', expect.any(Error));
  });

  it('connect() rejects on mqtt error without requiring an error listener', async () => {
    const fake = new FakeMqttClient();
    const authError = new Error('Bad username or password');

    const connectFn = jest.fn<(_url: string, _options: IClientOptions) => FakeMqttClient>((_url: string, _options: IClientOptions) => {
      queueMicrotask(() => {
        fake.emit('error', authError);
      });
      return fake;
    });

    const client = new IRobotMqtt(
      {
        ip: '192.168.1.2',
        blid: 'BLID',
        password: 'PASSWORD',
        logger: logger as any,
      },
      connectFn as unknown as (url: string, options: IClientOptions) => any,
    );

    await expect(client.connect()).rejects.toBe(authError);
  });

  it('connect() re-emits error only when consumer listens', async () => {
    const fake = new FakeMqttClient();
    const err = new Error('boom');

    const connectFn = jest.fn((_url: string, _options: IClientOptions) => {
      queueMicrotask(() => {
        fake.emit('error', err);
      });
      return fake as any;
    });

    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any }, connectFn as any);
    const onError = jest.fn();
    client.on('error', onError);

    await expect(client.connect()).rejects.toBe(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('connect() emits reconnect/close and parses messages', async () => {
    const fake = new FakeMqttClient();

    const connectFn = jest.fn<(_url: string, _options: IClientOptions) => FakeMqttClient>((_url: string, _options: IClientOptions) => {
      queueMicrotask(() => {
        fake.connected = true;
        fake.emit('connect');
      });
      return fake;
    });

    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any }, connectFn as any);

    const reconnectSpy = jest.fn();
    const closeSpy = jest.fn();
    type MessageEvent = { topic: string; payload: Buffer; json?: unknown };
    const messageSpy = jest.fn<(message: MessageEvent) => void>();
    client.on('reconnect', reconnectSpy);
    client.on('close', closeSpy);
    client.on('message', messageSpy);

    await client.connect();

    fake.emit('reconnect');
    expect(reconnectSpy).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith('IRobotMqtt reconnecting to 192.168.1.2...');

    fake.emit('close');
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith('IRobotMqtt connection closed for 192.168.1.2');

    fake.emit('message', 't/json', Buffer.from('{"a":1}', 'utf8'));
    fake.emit('message', 't/text', Buffer.from('not json', 'utf8'));

    expect(messageSpy).toHaveBeenCalledTimes(2);
    expect(messageSpy.mock.calls[0]?.[0]).toMatchObject({ topic: 't/json' });
    expect(messageSpy.mock.calls[0]?.[0].json).toEqual({ a: 1 });
    expect(messageSpy.mock.calls[1]?.[0]).toMatchObject({ topic: 't/text' });
    expect(messageSpy.mock.calls[1]?.[0].json).toBeUndefined();
  });

  it('connect() rejects on connect timeout', async () => {
    jest.useFakeTimers();
    const fake = new FakeMqttClient();
    const connectFn = jest.fn((_url: string, _options: IClientOptions) => fake as any);

    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', connectTimeoutMs: 25, logger: logger as any }, connectFn as any);

    const promise = client.connect();
    await Promise.all([expect(promise).rejects.toThrow('IRobotMqtt connect timeout after 25ms'), jest.advanceTimersByTimeAsync(25)]);
  });

  it('subscribe() throws when not connected, and propagates subscribe errors', async () => {
    const fake = new FakeMqttClient();
    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any }, (() => fake) as any);

    await expect(client.subscribe('#')).rejects.toThrow('IRobotMqtt: not connected');

    fake.subscribeImpl = (_topics, _options, callback) => callback(new Error('sub error'));
    // @ts-expect-error - internal test setup
    client.client = fake;
    await expect(client.subscribe('topic')).rejects.toThrow('sub error');
  });

  it('disconnect() calls end() and clears connection', async () => {
    const fake = new FakeMqttClient();
    fake.connected = true;

    const connectFn = jest.fn((_url: string, _options: IClientOptions) => fake as unknown as any);
    const client = new IRobotMqtt(
      {
        ip: '192.168.1.2',
        blid: 'BLID',
        password: 'PASSWORD',
        logger: logger as any,
      },
      connectFn as unknown as (url: string, options: IClientOptions) => any,
    );

    // @ts-expect-error - set internal client for testing disconnect without needing to run connect()
    client.client = fake;

    await expect(client.disconnect(true)).resolves.toBeUndefined();
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect() defaults force=false when omitted', async () => {
    const fake = new FakeMqttClient();
    fake.connected = true;
    const connectFn = jest.fn((_url: string, _options: IClientOptions) => fake as unknown as any);
    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any }, connectFn as any);

    // @ts-expect-error - set internal client for testing disconnect without needing to run connect()
    client.client = fake;

    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(fake.end).toHaveBeenCalledWith(false, {}, expect.any(Function));
  });

  it('disconnect() returns when not connected and logs end() errors', async () => {
    const fake = new FakeMqttClient();
    fake.endImpl = (_force, _opts, callback) => callback(new Error('end fail'));

    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any }, (() => fake) as any);

    await expect(client.disconnect(true)).resolves.toBeUndefined();

    // @ts-expect-error - internal test setup
    client.client = fake;
    await expect(client.disconnect(true)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('IRobotMqtt disconnect error:', expect.any(Error));
  });

  it('publishCommand() validates connection and handles publish success/error/timeout', async () => {
    jest.useFakeTimers();

    const fake = new FakeMqttClient();
    const client = new IRobotMqtt(
      {
        ip: '192.168.1.2',
        blid: 'BLID',
        password: 'PASSWORD',
        publishTimeoutMs: 20,
        commandTopic: 'cmd',
        commandQos: 1,
        logger: logger as any,
      },
      (() => fake) as any,
    );

    await expect(client.publishCommand('start')).rejects.toThrow('IRobotMqtt: not connected');

    // @ts-expect-error - internal test setup
    client.client = fake;

    // success + parameters
    await expect(client.publishCommand('start', { foo: 'bar' })).resolves.toBeUndefined();
    expect(fake.publish).toHaveBeenCalled();
    const [topic, payload] = fake.publish.mock.calls[0] as unknown as [string, string];
    expect(topic).toBe('cmd');
    const parsed = JSON.parse(payload);
    expect(parsed.command).toBe('start');
    expect(parsed.initiator).toBe('localApp');
    expect(parsed.foo).toBe('bar');
    expect(logger.debug).toHaveBeenCalledWith('IRobotMqtt published start to cmd');

    // error
    fake.publishImpl = (_topic, _payload, _options, callback) => callback(new Error('pub fail'));
    await expect(client.publishCommand('stop')).rejects.toThrow('pub fail');

    // timeout
    fake.publishImpl = () => {
      // never calls callback
    };
    const timeoutPromise = client.publishCommand('dock');
    await Promise.all([expect(timeoutPromise).rejects.toThrow('IRobotMqtt publish timeout after 20ms (dock)'), jest.advanceTimersByTimeAsync(20)]);
  });

  it('publishCommand() returns early when credentials are missing', async () => {
    const fake = new FakeMqttClient();
    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: '', password: '', logger: logger as any }, (() => fake) as any);

    await expect(client.publishCommand('start')).resolves.toBeUndefined();
    expect(fake.publish).not.toHaveBeenCalled();
  });

  it('command helpers call publishCommand', async () => {
    const fake = new FakeMqttClient();
    const client = new IRobotMqtt({ ip: '192.168.1.2', blid: 'BLID', password: 'PASSWORD', logger: logger as any }, (() => fake) as any);
    const spy = jest.spyOn(client, 'publishCommand').mockResolvedValue();

    await client.start();
    await client.clean();
    await client.pause();
    await client.resume();
    await client.stop();
    await client.goHome();

    expect(spy.mock.calls.map((c) => c[0])).toEqual(['start', 'clean', 'pause', 'resume', 'stop', 'dock']);
  });
});

describe('IRobotMqtt internal helpers', () => {
  it('parseOptionalRegex handles empty, plain, and /pattern/flags forms', () => {
    expect(__testUtils.parseOptionalRegex(undefined)).toBeUndefined();
    expect(__testUtils.parseOptionalRegex('   ')).toBeUndefined();

    expect(__testUtils.parseOptionalRegex('shadow/update')?.test('shadow/update')).toBe(true);
    expect(__testUtils.parseOptionalRegex('/shadow\\/update/i')?.test('SHADOW/UPDATE')).toBe(true);
  });

  it('formatLogValue returns a stable inspected string', () => {
    const out = __testUtils.formatLogValue({ a: 1, b: { c: true } });
    expect(out).toContain('a: 1');
    expect(out).toContain('c: true');
  });
});
