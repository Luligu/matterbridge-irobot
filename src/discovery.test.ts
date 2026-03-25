const MATTER_PORT = 0;
const NAME = 'IRobotDiscovery';
const HOMEDIR = path.join('jest', NAME);
const CREATE_ONLY = true;

import type { RemoteInfo } from 'node:dgram';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import path from 'node:path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { setupTest } from 'matterbridge/jestutils';

import { Discovery } from './discovery.js';

await setupTest(NAME, false);

class FakeSocket extends EventEmitter {
  public broadcast = false;
  public boundPort: number | undefined;
  public closed = false;
  public sendCalls: unknown[][] = [];

  setBroadcast(flag: boolean): void {
    this.broadcast = flag;
  }

  bind(port: number, callback?: () => void): void {
    this.boundPort = port;
    callback?.();
  }

  send(...args: unknown[]): void {
    this.sendCalls.push(args);
  }

  close(): void {
    this.closed = true;
  }
}

function makeRinfo(address: string): RemoteInfo {
  return {
    address,
    family: 'IPv4',
    port: 5678,
    size: 0,
  };
}

afterEach(() => {
  try {
    jest.clearAllTimers();
  } catch {
    // ignore (e.g. if fake timers were not enabled)
  }
  jest.useRealTimers();
});

describe('Discovery', () => {
  it('discover uses the default timeout when omitted', async () => {
    jest.useFakeTimers();

    let socket: FakeSocket | undefined;
    jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      socket = new FakeSocket();
      return socket as unknown as dgram.Socket;
    });

    const discovery = new Discovery();
    const promise = discovery.discover();

    await jest.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toEqual([]);
    expect(socket?.closed).toBe(true);
  });

  it('discover collects iRobot/Roomba responses and ignores invalid ones', async () => {
    jest.useFakeTimers();

    let socket: FakeSocket | undefined;
    jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      socket = new FakeSocket();
      return socket as unknown as dgram.Socket;
    });

    const discovery = new Discovery();
    const promise = discovery.discover(100);

    expect(socket?.boundPort).toBe(5678);
    expect(socket?.broadcast).toBe(true);
    expect(socket?.sendCalls).toHaveLength(10);

    // Invalid JSON should hit the parse error path.
    socket?.emit('message', Buffer.from('not json'), makeRinfo('10.0.0.1'));

    // Wrong prefix should be ignored.
    socket?.emit('message', Buffer.from(JSON.stringify({ hostname: 'Other-123', ip: '10.0.0.10' })), makeRinfo('10.0.0.10'));

    // Missing hostname should be ignored (covers optional chaining branch).
    socket?.emit('message', Buffer.from(JSON.stringify({ ip: '10.0.0.12' })), makeRinfo('10.0.0.12'));

    // Missing/empty IP should be ignored.
    socket?.emit('message', Buffer.from(JSON.stringify({ hostname: 'iRobot-XYZ', ip: '' })), makeRinfo('10.0.0.11'));

    // Valid device should be collected.
    socket?.emit('message', Buffer.from(JSON.stringify({ hostname: 'Roomba-ABC', ip: '10.0.0.2' })), makeRinfo('10.0.0.2'));

    await jest.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toHaveLength(1);
    expect(result[0].ip).toBe('10.0.0.2');
    expect(result[0].hostname).toBe('Roomba-ABC');
    expect(result[0].rinfo.address).toBe('10.0.0.2');
    expect(socket?.closed).toBe(true);
  });

  it('discover rejects on socket error', async () => {
    jest.useFakeTimers();

    let socket: FakeSocket | undefined;
    jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      socket = new FakeSocket();
      return socket as unknown as dgram.Socket;
    });

    const discovery = new Discovery();
    const promise = discovery.discover(1000);

    socket?.emit('error', new Error('boom'));

    await expect(promise).rejects.toThrow('boom');
    expect(socket?.closed).toBe(true);

    // Flush the pending timeout callback inside discover().
    await jest.runOnlyPendingTimersAsync();
  });

  it('getRobotPublicInfo resolves and extracts robotid', async () => {
    jest.useFakeTimers();

    let socket: FakeSocket | undefined;
    jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      socket = new FakeSocket();
      return socket as unknown as dgram.Socket;
    });

    const discovery = new Discovery();
    const promise = discovery.getRobotPublicInfo('10.0.0.2', 5000);

    expect(socket?.boundPort).toBe(5678);
    expect(socket?.sendCalls).toHaveLength(10);

    // These should be ignored (covers boolean short-circuit branches).
    socket?.emit('message', Buffer.from(JSON.stringify({ ip: '10.0.0.2' })));
    socket?.emit('message', Buffer.from(JSON.stringify({ hostname: 'iRobot-12345' })));

    socket?.emit('message', Buffer.from(JSON.stringify({ hostname: 'iRobot-12345', ip: '10.0.0.2' })));

    const info = await promise;

    expect(info.ip).toBe('10.0.0.2');
    expect(info.hostname).toBe('iRobot-12345');
    expect(info.robotid).toBe('12345');
    expect(socket?.closed).toBe(true);

    await jest.runOnlyPendingTimersAsync();
  });

  it('getRobotPublicInfo ignores invalid responses and times out', async () => {
    jest.useFakeTimers();

    let socket: FakeSocket | undefined;
    jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      socket = new FakeSocket();
      return socket as unknown as dgram.Socket;
    });

    const discovery = new Discovery();
    const promise = discovery.getRobotPublicInfo('10.0.0.9', 50);

    // Invalid JSON should be ignored.
    socket?.emit('message', Buffer.from('not json'));

    // Wrong prefix should be ignored.
    socket?.emit('message', Buffer.from(JSON.stringify({ hostname: 'Other-1', ip: '10.0.0.9' })));

    await Promise.all([expect(promise).rejects.toThrow('Timeout getting robot info from 10.0.0.9'), jest.advanceTimersByTimeAsync(50)]);
    expect(socket?.closed).toBe(true);
  });

  it('getRobotPublicInfo rejects on socket error', async () => {
    jest.useFakeTimers();

    let socket: FakeSocket | undefined;
    jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      socket = new FakeSocket();
      return socket as unknown as dgram.Socket;
    });

    const discovery = new Discovery();
    const promise = discovery.getRobotPublicInfo('10.0.0.9', 1000);

    socket?.emit('error', new Error('fail'));

    await expect(promise).rejects.toThrow('fail');
    expect(socket?.closed).toBe(true);

    await jest.runOnlyPendingTimersAsync();
  });

  it('getRobotPublicInfo uses the default timeout when omitted', async () => {
    jest.useFakeTimers();

    let socket: FakeSocket | undefined;
    jest.spyOn(dgram, 'createSocket').mockImplementation(() => {
      socket = new FakeSocket();
      return socket as unknown as dgram.Socket;
    });

    const discovery = new Discovery();
    const promise = discovery.getRobotPublicInfo('10.0.0.9');

    await Promise.all([expect(promise).rejects.toThrow('Timeout getting robot info from 10.0.0.9'), jest.advanceTimersByTimeAsync(5000)]);
    expect(socket?.closed).toBe(true);
  });
});
