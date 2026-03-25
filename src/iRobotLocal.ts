import { inspect } from 'node:util';

import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { getIntParameter, getParameter, getStringArrayParameter, hasParameter } from 'matterbridge/utils';

import { IRobotCommand, IRobotMqtt, IRobotMqttMessage } from './iRobot.js';

/**
 * Format a value for logging, using util.inspect with consistent options.
 *
 * @param {value} value The value to format.
 * @returns {string} The formatted string.
 */
// istanbul ignore next -- manual runtime helper
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
// istanbul ignore next -- manual runtime helper
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
