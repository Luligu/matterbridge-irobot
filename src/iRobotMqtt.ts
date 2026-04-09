/**
 * @description This file contains the class IRobotMqtt.
 * @file src\iRobotMqtt.ts
 * @author Luca Liguori
 * @created 2026-03-25
 * @version 1.0.0
 * @license Apache-2.0
 * @copyright 2026, 2027, 2028 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'node:events';

import { AnsiLogger } from 'matterbridge/logger';
import { isValidString } from 'matterbridge/utils';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';

export type IRobotCycle = 'none' | 'clean' | 'evac';
export type IRobotPhase = 'charge' | 'run' | 'stop' | 'hmUsrDock';

export interface IRobotMqttMessageReport {
  state: {
    reported: {
      batPct: number; // percentage 1-100
      batteryType: string;
      bin: {
        present: boolean;
        full: boolean;
        type: string;
      };
      cap: Record<string, unknown>;
      cleanMissionStatus: {
        cycle: IRobotCycle;
        phase: IRobotPhase;
        error: string;
        notReady: number;
        initiator: 'manual';
        missionId: string;
      };
      lastCommand: {
        command: 'clean';
        initiator: 'localApp';
        time: number;
        params: unknown;
      };
      name: string;
      sku: string;
      softwareVer: string;
      timezone: string;
      twoPass: boolean;
    };
  };
}

export type IRobotCommand = 'start' | 'stop' | 'dock' | 'clean' | 'pause' | 'resume';

export interface IRobotMqttConfig {
  ip?: string;
  blid?: string;
  password?: string;
  port?: number;
  /** Fail connection attempts after this many milliseconds. Defaults to 20000. */
  connectTimeoutMs?: number;
  rejectUnauthorized?: boolean;
  /** Topics to subscribe to after connecting. Defaults to `['#']`. */
  subscribeTopics?: string[];
  /** MQTT command topic. Defaults to `cmd`. */
  commandTopic?: string;
  /** Timeout for a single publish() call. Defaults to 5000. */
  publishTimeoutMs?: number;
  /** QoS for command publishes. Defaults to 0 (avoid waiting for PUBACK on some robots). */
  commandQos?: 0 | 1 | 2;
  logger: AnsiLogger;
}

export interface IRobotMqttMessage {
  /** The topic of the MQTT message. */
  topic: string;
  /** Raw payload buffer as received from mqtt.js */
  payload: Buffer;
  /** Parsed JSON if payload is valid JSON; otherwise undefined */
  json?: IRobotMqttMessageReport;
}

type ConnectFn = (url: string, options: IClientOptions) => MqttClient;

/**
 * Minimal iRobot local MQTT client.
 *
 * It connects to `mqtts://<ip>:8883` using `blid` as username/clientId and the
 * provided password. Most robots use a self-signed cert, so by default we set
 * `rejectUnauthorized: false`.
 */
export class IRobotMqtt extends EventEmitter {
  private client?: MqttClient;
  private readonly config: Pick<IRobotMqttConfig, 'logger'> & {
    ip?: string;
    blid?: string;
    password?: string;
    port: number;
    connectTimeoutMs: number;
    publishTimeoutMs: number;
    rejectUnauthorized: boolean;
    subscribeTopics: string[];
    commandTopic: string;
    commandQos: 0 | 1 | 2;
  };
  private readonly connectFn: ConnectFn;

  constructor(config: IRobotMqttConfig, connectFn: ConnectFn = connect) {
    super();

    this.config = {
      ip: config.ip,
      blid: config.blid,
      password: config.password,
      port: config.port ?? 8883,
      connectTimeoutMs: config.connectTimeoutMs ?? 20_000,
      rejectUnauthorized: config.rejectUnauthorized ?? false,
      subscribeTopics: config.subscribeTopics ?? ['#'],
      commandTopic: config.commandTopic ?? 'cmd',
      publishTimeoutMs: config.publishTimeoutMs ?? 5_000,
      commandQos: config.commandQos ?? 0,
      logger: config.logger,
    };

    this.connectFn = connectFn;
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  isConfigured(): boolean {
    return isValidString(this.config.blid, 1) && isValidString(this.config.password, 1) && isValidString(this.config.ip, 1);
  }

  async connect(): Promise<void> {
    if (!this.isConfigured()) return;
    if (this.client && (this.client.connected || this.client.reconnecting)) return;

    const url = `mqtts://${this.config.ip}:${this.config.port}`;
    const options: IClientOptions = {
      protocol: 'mqtts',
      host: this.config.ip,
      port: this.config.port,
      clientId: this.config.blid,
      username: this.config.blid,
      password: this.config.password,
      rejectUnauthorized: this.config.rejectUnauthorized,
      connectTimeout: this.config.connectTimeoutMs,
      // iRobot local broker is strict; keepalive helps NATs too.
      keepalive: 60,
      clean: true,
      reconnectPeriod: 5_000,
    };

    this.config.logger?.debug(`IRobotMqtt connecting to ${url}...`);
    this.client = this.connectFn(url, options);

    this.client.on('connect', async () => {
      this.config.logger?.info(`IRobotMqtt connected to ${this.config.ip}`);
      this.emit('connect');
      try {
        await this.subscribe(this.config.subscribeTopics);
      } catch (error) {
        this.config.logger?.warn('IRobotMqtt subscribe failed:', error);
      }
    });

    this.client.on('reconnect', () => {
      this.config.logger?.debug(`IRobotMqtt reconnecting to ${this.config.ip}...`);
      this.emit('reconnect');
    });

    this.client.on('close', () => {
      this.config.logger?.debug(`IRobotMqtt connection closed for ${this.config.ip}`);
      this.emit('close');
    });

    this.client.on('error', (error) => {
      this.config.logger?.error(`IRobotMqtt error for ${this.config.ip}:`, error);
      // In Node.js, emitting an 'error' event with no listeners crashes the process.
      // This class is often used as a best-effort integration, so only re-emit
      // when the consumer explicitly listens for it.
      if (this.listenerCount('error') > 0) this.emit('error', error);
    });

    this.client.on('message', (topic, payload) => {
      const message: IRobotMqttMessage = { topic, payload };
      const text = payload.toString('utf8');
      try {
        message.json = JSON.parse(text);
      } catch {
        // ignore
      }
      this.emit('message', message);
    });

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`IRobotMqtt connect timeout after ${this.config.connectTimeoutMs}ms`));
      }, this.config.connectTimeoutMs);

      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: unknown) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.client?.off('connect', onConnect);
        this.client?.off('error', onError);
      };
      this.client?.once('connect', onConnect);
      this.client?.once('error', onError);
    });
  }

  async subscribe(topics: string[] | string): Promise<void> {
    if (!this.client) throw new Error('IRobotMqtt: not connected');
    const topicsList = Array.isArray(topics) ? topics : [topics];
    await new Promise<void>((resolve, reject) => {
      this.client?.subscribe(topicsList, { qos: 0 }, (error) => {
        if (error) return reject(error);
        this.config.logger?.debug(`IRobotMqtt subscribed: ${topicsList.join(', ')}`);
        resolve();
      });
    });
  }

  async disconnect(force = false): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = undefined;
    await new Promise<void>((resolve) =>
      client.end(force, {}, (error?: Error) => {
        if (error) this.config.logger?.warn('IRobotMqtt disconnect error:', error);
        resolve();
      }),
    );
  }

  async start(): Promise<void> {
    await this.publishCommand('start');
  }

  /** Start a new cleaning job (some firmwares use `clean` instead of `start`). */
  async clean(): Promise<void> {
    await this.publishCommand('clean');
  }

  async pause(): Promise<void> {
    await this.publishCommand('pause');
  }

  async stop(): Promise<void> {
    await this.publishCommand('stop');
  }

  async resume(): Promise<void> {
    await this.publishCommand('resume');
  }

  /** Send the robot back to the dock ("go home"). */
  async goHome(): Promise<void> {
    await this.publishCommand('dock');
  }

  async publishCommand(command: IRobotCommand, parameters?: Record<string, unknown>): Promise<void> {
    if (!this.isConfigured()) return;
    if (!this.client) throw new Error('IRobotMqtt: not connected');
    // Many robots expect the standard cmd schema: { command, time, initiator, ... }.
    // Some firmwares will reject commands without these fields (e.g. MESSAGE_NOT_SECURE).
    const payload = JSON.stringify({ command, time: (Date.now() / 1000) | 0, initiator: 'localApp', ...(parameters ?? {}) });
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`IRobotMqtt publish timeout after ${this.config.publishTimeoutMs}ms (${command})`));
      }, this.config.publishTimeoutMs);

      this.client?.publish(this.config.commandTopic, payload, { qos: this.config.commandQos, retain: false }, (error) => {
        clearTimeout(timeoutId);
        if (error) return reject(error);
        this.config.logger?.debug(`IRobotMqtt published ${command} to ${this.config.commandTopic}`);
        resolve();
      });
    });
  }
}
