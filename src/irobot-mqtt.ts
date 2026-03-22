import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';

import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { getIntParameter, getParameter, getStringArrayParameter, hasParameter } from 'matterbridge/utils';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';

export type IRobotCommand = 'start' | 'stop' | 'dock' | 'clean' | 'pause' | 'resume';

export interface IRobotMqttConfig {
  ip: string;
  blid: string;
  password: string;
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
  logger?: AnsiLogger;
}

export interface IRobotMqttMessage {
  topic: string;
  /** Raw payload buffer as received from mqtt.js */
  payload: Buffer;
  /** Parsed JSON if payload is valid JSON; otherwise undefined */
  json?: unknown;
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
  private readonly config: Required<Pick<IRobotMqttConfig, 'ip' | 'blid' | 'password'>> &
    Pick<IRobotMqttConfig, 'logger'> & {
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
    if (!config.ip) throw new Error('IRobotMqtt: ip is required');
    if (!config.blid) throw new Error('IRobotMqtt: blid is required');
    if (!config.password) throw new Error('IRobotMqtt: password is required');

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

  async connect(): Promise<void> {
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

/**
 * Format a value for logging, using util.inspect with consistent options.
 *
 * @param {value} value The value to format.
 * @returns {string} The formatted string.
 */
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

/**
 * Parse a string as a regular expression, supporting both plain patterns and /pattern/flags syntax. Returns undefined for empty or whitespace-only strings.
 *
 * @param {string | undefined} value The string to parse as a regular expression.
 * @returns {RegExp | undefined} The parsed regular expression or undefined if the input is empty or invalid.
 */
function parseOptionalRegex(value: string | undefined): RegExp | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Support `/pattern/flags` (common CLI style) as well as plain `pattern`.
  if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
    const lastSlash = trimmed.lastIndexOf('/');
    const pattern = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1);
    return new RegExp(pattern, flags);
  }
  return new RegExp(trimmed);
}

// Test-only exports (not part of the plugin runtime API).
// Exported to allow deterministic unit testing and 100% branch coverage.
export const __testUtils = {
  formatLogValue,
  parseOptionalRegex,
};

/*
export IROBOT_PASSWORD=":1:1651500147:GXTGqQYntUvv73fk"
export IROBOT_BLID="87FC9A91DAD9415798C00D5325559439"
export IROBOT_IP="192.168.69.44"
*/
/**
 * Manual CLI test helper.
 *
 * Usage:
 * - Connect + subscribe and print messages:
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --ip 192.168.69.44 --blid 87FC9A91DAD9415798C00D5325559439 --password ":1:1651500147:GXTGqQYntUvv73fk"`
 *
 * - Send a command after connect:
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --ip 192.168.69.44 --blid 87FC9A91DAD9415798C00D5325559439 --password ":1:1651500147:GXTGqQYntUvv73fk" --command start`
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --ip 192.168.69.44 --blid 87FC9A91DAD9415798C00D5325559439 --password ":1:1651500147:GXTGqQYntUvv73fk" --command clean`
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --ip 192.168.69.44 --blid 87FC9A91DAD9415798C00D5325559439 --password ":1:1651500147:GXTGqQYntUvv73fk" --command resume`
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --ip 192.168.69.44 --blid 87FC9A91DAD9415798C00D5325559439 --password ":1:1651500147:GXTGqQYntUvv73fk" --command pause`
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --ip 192.168.69.44 --blid 87FC9A91DAD9415798C00D5325559439 --password ":1:1651500147:GXTGqQYntUvv73fk" --command stop`
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --ip 192.168.69.44 --blid 87FC9A91DAD9415798C00D5325559439 --password ":1:1651500147:GXTGqQYntUvv73fk" --command dock`
 *
 * Notes:
 * - You can also provide env vars: IROBOT_IP, IROBOT_BLID, IROBOT_PASSWORD
 * - Default command topic is `cmd` and default subscription is `#`.
 * - To reduce noise, filter printed messages by topic:
 *   `node dist/irobot-mqtt.js --irobot-mqtt-test --topicRegex "shadow/update|rejected/report" ...`
 *
 */
// istanbul ignore next -- manual runtime helper
if (process.argv.includes('--irobot-mqtt-test')) {
  /* eslint-disable no-console */

  const ip = getParameter('ip') ?? process.env.IROBOT_IP;
  const blid = getParameter('blid') ?? process.env.IROBOT_BLID;
  // Prefer env var for password so it doesn't end up in shell history.
  const password = process.env.IROBOT_PASSWORD ?? getParameter('password');
  const command = (getParameter('command') ?? '').trim().toLowerCase() as IRobotCommand | '';
  const timeoutMs = getIntParameter('timeoutMs') ?? 20_000;
  const connectTimeoutMs = getIntParameter('connectTimeoutMs') ?? (process.env.IROBOT_CONNECT_TIMEOUT_MS ? Number(process.env.IROBOT_CONNECT_TIMEOUT_MS) : undefined) ?? 20_000;
  const publishTimeoutMs = getIntParameter('publishTimeoutMs') ?? (process.env.IROBOT_PUBLISH_TIMEOUT_MS ? Number(process.env.IROBOT_PUBLISH_TIMEOUT_MS) : undefined) ?? 5_000;
  const commandQosRaw = getIntParameter('commandQos') ?? (process.env.IROBOT_COMMAND_QOS ? Number(process.env.IROBOT_COMMAND_QOS) : undefined);
  const commandQos: 0 | 1 | 2 = commandQosRaw === 0 || commandQosRaw === 1 || commandQosRaw === 2 ? commandQosRaw : 0;
  const commandTopic = getParameter('commandTopic') ?? process.env.IROBOT_COMMAND_TOPIC;
  const topicRegexRaw = getParameter('topicRegex') ?? process.env.IROBOT_TOPIC_REGEX;
  const topicRegex = (() => {
    try {
      return parseOptionalRegex(topicRegexRaw);
    } catch (error) {
      console.error(`Invalid --topicRegex / IROBOT_TOPIC_REGEX: ${JSON.stringify(topicRegexRaw)}`, error);
      process.exitCode = 1;
      return undefined;
    }
  })();

  const cliSubscribeTopics = getStringArrayParameter('subscribeTopics');
  const envSubscribeTopics = process.env.IROBOT_SUBSCRIBE_TOPICS
    ? process.env.IROBOT_SUBSCRIBE_TOPICS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const subscribeTopicsRaw = cliSubscribeTopics ?? envSubscribeTopics;
  const subscribeTopics = subscribeTopicsRaw
    ? subscribeTopicsRaw
        .flatMap((value) => value.split(','))
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const rejectUnauthorizedRaw = (getParameter('rejectUnauthorized') ?? process.env.IROBOT_REJECT_UNAUTHORIZED ?? '').trim().toLowerCase();
  const rejectUnauthorizedBool =
    rejectUnauthorizedRaw === 'true' || rejectUnauthorizedRaw === '1' || rejectUnauthorizedRaw === 'yes' || (rejectUnauthorizedRaw === '' && hasParameter('rejectUnauthorized'));

  if (!ip || !blid || !password) {
    console.error('Missing required parameters. Provide --ip --blid --password (or env IROBOT_IP/IROBOT_BLID/IROBOT_PASSWORD).');
    process.exitCode = 1;
  } else {
    (async () => {
      const testLogger = AnsiLogger.create({
        logName: 'IRobotMqttTest',
        logLevel: LogLevel.DEBUG,
      });

      const client = new IRobotMqtt({
        ip,
        blid,
        password,
        logger: testLogger,
        subscribeTopics: subscribeTopics ?? ['#'],
        commandTopic: commandTopic ?? 'cmd',
        connectTimeoutMs,
        publishTimeoutMs,
        commandQos,
        rejectUnauthorized: rejectUnauthorizedBool,
      });
      client.on('message', (msg: IRobotMqttMessage) => {
        if (topicRegex && !topicRegex.test(msg.topic)) return;
        if (msg.json !== undefined) testLogger.info(`[mqtt] ${msg.topic}: ${formatLogValue(msg.json)}`);
        else testLogger.info(`[mqtt] ${msg.topic}: ${msg.payload.toString('utf8')}`);
      });

      await client.connect();
      testLogger.info(`Connected to ${ip} as ${blid}.`);

      if (topicRegex) {
        testLogger.info(`Topic filter active: ${String(topicRegex)}`);
      }

      if (process.env.IROBOT_PASSWORD === undefined && getParameter('password') !== undefined) {
        testLogger.warn('Warning: password was provided via --password and may be stored in shell history. Prefer env var IROBOT_PASSWORD.');
      }

      if (command === 'start') await client.start();
      else if (command === 'clean') await client.clean();
      else if (command === 'pause') await client.pause();
      else if (command === 'resume') await client.resume();
      else if (command === 'stop') await client.stop();
      else if (command === 'dock') await client.goHome();
      else if (command) testLogger.warn(`Unknown --command ${JSON.stringify(command)} (expected start|clean|pause|resume|stop|dock)`);

      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
      }
      await client.disconnect(true);
      testLogger.info('Disconnected.');
    })().catch((error) => {
      console.error('MQTT test failed:', error);
      process.exitCode = 1;
    });
  }
}
