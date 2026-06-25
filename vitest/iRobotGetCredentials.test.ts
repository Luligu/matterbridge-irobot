const NAME = 'IRobotCredentials';

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setupTest } from 'matterbridge/jestutils';

import { IRobotCredentials, type IRobotCredentialsConfig, type IRobotEndpoints } from './iRobotGetCredentials.js';

await setupTest(NAME, false);

type TestableIRobotCredentials = {
  config: IRobotCredentialsConfig & {
    appId: string;
    countryCode: string;
    discoveryUrl: string;
  };
  getEndpoints(): Promise<IRobotEndpoints>;
  loginToGigya(endpoints: IRobotEndpoints): Promise<unknown>;
  loginToIRobot(
    endpoints: IRobotEndpoints,
    gigyaLogin: {
      UID?: string;
      UIDSignature?: string;
      signatureTimestamp?: string;
    },
  ): Promise<unknown>;
  pickHttpBase(deployments?: Record<string, { httpBase?: string }>): string | null;
};

type TestFetchResponse = Awaited<ReturnType<typeof fetch>>;

const originalEnv = { ...process.env };

function asTestable(credentials: IRobotCredentials): TestableIRobotCredentials {
  return credentials as unknown as TestableIRobotCredentials;
}

function createJsonResponse(status: number, body: unknown): TestFetchResponse {
  return {
    status,
    json: async () => body,
  } as TestFetchResponse;
}

function createFetchMock(...responses: Array<{ status: number; body: unknown }>): jest.MockedFunction<typeof fetch> {
  const fetchMock = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(createJsonResponse(response.status, response.body));
  }
  return fetchMock;
}

describe('IRobotCredentials', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses env and default constructor values when overrides are omitted', () => {
    process.env.GIGYA_API_KEY = 'env-api-key';
    process.env.GIGYA_BASE = 'https://gigya.env';
    process.env.IROBOT_HTTP_BASE = 'https://irobot.env';
    process.env.IROBOT_COUNTRY_CODE = 'IT';
    delete process.env.IROBOT_DISCOVERY_URL;

    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, createFetchMock()));

    expect(credentials.config.apiKey).toBe('env-api-key');
    expect(credentials.config.gigyaBase).toBe('https://gigya.env');
    expect(credentials.config.httpBase).toBe('https://irobot.env');
    expect(credentials.config.countryCode).toBe('IT');
    expect(credentials.config.appId).toBe('ANDROID-C7FB240E-DF34-42D7-AE4E-A8C17079A294');
    expect(credentials.config.discoveryUrl).toBe('https://disc-prod.iot.irobotapi.com/v1/discover/endpoints?country_code=IT');
  });

  it('prefers explicit constructor overrides over environment values', () => {
    process.env.GIGYA_API_KEY = 'env-api-key';
    process.env.GIGYA_BASE = 'https://gigya.env';
    process.env.IROBOT_HTTP_BASE = 'https://irobot.env';
    process.env.IROBOT_COUNTRY_CODE = 'IT';
    process.env.IROBOT_DISCOVERY_URL = 'https://discovery.env';

    const credentials = asTestable(
      new IRobotCredentials({
        username: 'user@example.com',
        password: 'secret',
        apiKey: 'config-api-key',
        gigyaBase: 'https://gigya.config',
        httpBase: 'https://irobot.config',
        countryCode: 'US',
        discoveryUrl: 'https://discovery.config',
        appId: 'CUSTOM-APP-ID',
      }),
    );

    expect(credentials.config.apiKey).toBe('config-api-key');
    expect(credentials.config.gigyaBase).toBe('https://gigya.config');
    expect(credentials.config.httpBase).toBe('https://irobot.config');
    expect(credentials.config.countryCode).toBe('US');
    expect(credentials.config.discoveryUrl).toBe('https://discovery.config');
    expect(credentials.config.appId).toBe('CUSTOM-APP-ID');
  });

  it('returns endpoint overrides without calling discovery', async () => {
    const fetchMock = createFetchMock();
    const credentials = asTestable(
      new IRobotCredentials(
        {
          username: 'user@example.com',
          password: 'secret',
          apiKey: 'direct-api-key',
          gigyaBase: 'https://gigya.direct',
          httpBase: 'https://irobot.direct',
        },
        fetchMock,
      ),
    );

    await expect(credentials.getEndpoints()).resolves.toEqual({
      apiKey: 'direct-api-key',
      gigyaBase: 'https://gigya.direct',
      httpBase: 'https://irobot.direct',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discovers endpoints and prefers the latest deployment http base', async () => {
    const fetchMock = createFetchMock({
      status: 200,
      body: {
        gigya: {
          api_key: 'discovered-api-key',
          datacenter_domain: 'eu1.gigya.com',
        },
        deployments: {
          a: { httpBase: 'https://irobot-a.example' },
          z: { httpBase: 'https://irobot-z.example' },
        },
      },
    });
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, fetchMock));

    await expect(credentials.getEndpoints()).resolves.toEqual({
      apiKey: 'discovered-api-key',
      gigyaBase: 'https://accounts.eu1.gigya.com',
      httpBase: 'https://irobot-z.example',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://disc-prod.iot.irobotapi.com/v1/discover/endpoints?country_code=US', expect.objectContaining({ method: 'GET' }));
  });

  it('falls back to the default iRobot http base when discovery has no deployments', async () => {
    const fetchMock = createFetchMock({
      status: 200,
      body: {
        gigya: {
          api_key: 'discovered-api-key',
        },
      },
    });
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, fetchMock));

    await expect(credentials.getEndpoints()).resolves.toEqual({
      apiKey: 'discovered-api-key',
      gigyaBase: 'https://accounts.us1.gigya.com',
      httpBase: 'https://unauth2.prod.iot.irobotapi.com',
    });
  });

  it('throws when endpoint discovery returns an HTTP error', async () => {
    const fetchMock = createFetchMock({ status: 500, body: { message: 'broken' } });
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, fetchMock));

    await expect(credentials.getEndpoints()).rejects.toThrow('Fatal error discovering iRobot endpoints. HTTP 500.');
  });

  it('throws when endpoint discovery does not include a Gigya api key', async () => {
    const fetchMock = createFetchMock({
      status: 200,
      body: {
        gigya: {
          datacenter_domain: 'us1.gigya.com',
        },
        httpBase: 'https://irobot.example',
      },
    });
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, fetchMock));

    await expect(credentials.getEndpoints()).rejects.toThrow('Fatal error discovering iRobot endpoints. No Gigya API key in discovery response.');
  });

  it.each([
    [401, 'Authentication error. Check your credentials.'],
    [403, 'Authentication error. Check your credentials.'],
    [400, 'Error login into Gigya API.'],
    [500, 'Unexpected Gigya response status 500.'],
  ])('throws for Gigya HTTP status %s', async (status, message) => {
    const fetchMock = createFetchMock({ status, body: {} });
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, fetchMock));

    await expect(
      credentials.loginToGigya({
        apiKey: 'api-key',
        gigyaBase: 'https://gigya.example',
        httpBase: 'https://irobot.example',
      }),
    ).rejects.toThrow(message);
  });

  it.each([
    [{ statusCode: 403 }, 'Authentication error. Please check your credentials.'],
    [{ statusCode: 400 }, 'Error login into Gigya API.'],
    [{ statusCode: 200, errorCode: 0, UID: 'uid-only' }, 'Error login into iRobot account. Missing fields in login response.'],
  ])('throws for Gigya payload %j', async (body, message) => {
    const fetchMock = createFetchMock({ status: 200, body });
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, fetchMock));

    await expect(
      credentials.loginToGigya({
        apiKey: 'api-key',
        gigyaBase: 'https://gigya.example',
        httpBase: 'https://irobot.example',
      }),
    ).rejects.toThrow(message);
  });

  it('requests Gigya and iRobot credentials and filters robots without passwords', async () => {
    const fetchMock = createFetchMock(
      {
        status: 200,
        body: {
          statusCode: 200,
          errorCode: 0,
          UID: 'uid-123',
          UIDSignature: 'signature-123',
          signatureTimestamp: '1700000000',
          sessionInfo: {
            sessionToken: 'token-123',
          },
        },
      },
      {
        status: 200,
        body: {
          robots: {
            abc123: {
              name: 'Kitchen',
              sku: 'R98----',
              softwareVer: 'v2.4.16-126',
              password: ':1:abcdef',
            },
            def456: {
              name: 'Bedroom',
              sku: 'J7-----',
              softwareVer: 'v3.0.0',
            },
            ghi789: {
              name: 'Hallway',
              password: '',
            },
          },
        },
      },
    );

    const credentials = new IRobotCredentials(
      {
        username: 'user@example.com',
        password: 'secret',
        apiKey: 'api-key',
        gigyaBase: 'https://gigya.example',
        httpBase: 'https://irobot.example',
      },
      fetchMock,
    );

    await expect(credentials.getCredentials()).resolves.toEqual([
      {
        blid: 'abc123',
        password: ':1:abcdef',
        name: 'Kitchen',
        sku: 'R98----',
        softwareVer: 'v2.4.16-126',
      },
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://gigya.example/accounts.login',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Connection': 'close',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );

    const firstCallBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(firstCallBody).toBeInstanceOf(URLSearchParams);
    expect((firstCallBody as URLSearchParams).get('apiKey')).toBe('api-key');
    expect((firstCallBody as URLSearchParams).get('loginID')).toBe('user@example.com');
    expect((firstCallBody as URLSearchParams).get('password')).toBe('secret');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://irobot.example/v2/login',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Connection': 'close',
          'Content-Type': 'application/json',
        },
      }),
    );

    const secondCallBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondCallBody).toEqual({
      app_id: 'ANDROID-C7FB240E-DF34-42D7-AE4E-A8C17079A294',
      assume_robot_ownership: 0,
      gigya: {
        signature: 'signature-123',
        timestamp: '1700000000',
        uid: 'uid-123',
      },
    });
  });

  it('throws when the iRobot login response does not include robots', async () => {
    const fetchMock = createFetchMock(
      {
        status: 200,
        body: {
          statusCode: 200,
          errorCode: 0,
          UID: 'uid-123',
          UIDSignature: 'signature-123',
          signatureTimestamp: '1700000000',
          sessionInfo: {
            sessionToken: 'token-123',
          },
        },
      },
      {
        status: 200,
        body: {},
      },
    );
    const credentials = new IRobotCredentials(
      {
        username: 'user@example.com',
        password: 'secret',
        apiKey: 'api-key',
        gigyaBase: 'https://gigya.example',
        httpBase: 'https://irobot.example',
      },
      fetchMock,
    );

    await expect(credentials.getCredentials()).rejects.toThrow('Fatal error login into iRobot account. Missing robots in login response.');
  });

  it('throws when the iRobot login request returns an HTTP error', async () => {
    const fetchMock = createFetchMock({ status: 500, body: { message: 'broken' } });
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, fetchMock));

    await expect(
      credentials.loginToIRobot(
        {
          apiKey: 'api-key',
          gigyaBase: 'https://gigya.example',
          httpBase: 'https://irobot.example',
        },
        {
          UID: 'uid-123',
          UIDSignature: 'signature-123',
          signatureTimestamp: '1700000000',
        },
      ),
    ).rejects.toThrow('Fatal error login into iRobot account. Please check your credentials or API key.');
  });

  it('returns null when deployments do not include an http base', () => {
    const credentials = asTestable(new IRobotCredentials({ username: 'user@example.com', password: 'secret' }, createFetchMock()));

    expect(credentials.pickHttpBase({ a: {}, b: {} })).toBeNull();
    expect(credentials.pickHttpBase()).toBeNull();
  });
});
