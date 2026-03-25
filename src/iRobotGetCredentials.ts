/**
 * @description This file contains the class IRobotCredentials.
 * @file src\iRobotGetCredentials.ts
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

import { AnsiLogger, LogLevel, TimestampFormat } from 'matterbridge/logger';

export interface IRobotCredentialsConfig {
  username: string;
  password: string;
  apiKey?: string;
  countryCode?: string;
  discoveryUrl?: string;
  gigyaBase?: string;
  httpBase?: string;
  appId?: string;
}

export interface IRobotEndpoints {
  apiKey: string;
  gigyaBase: string;
  httpBase: string;
}

export interface IRobotCredentialInfo {
  blid: string;
  password: string;
  name?: string;
  sku?: string;
  softwareVer?: string;
}

interface GigyaDiscoveryResponse {
  gigya?: {
    api_key?: string;
    datacenter_domain?: string;
  };
  deployments?: Record<string, { httpBase?: string }>;
  httpBase?: string;
}

interface GigyaLoginResponse {
  statusCode?: number;
  errorCode?: number;
  UID?: string;
  UIDSignature?: string;
  signatureTimestamp?: string;
  sessionInfo?: {
    sessionToken?: string;
  };
}

interface IRobotAccountLoginResponse {
  robots?: Record<
    string,
    {
      name?: string;
      sku?: string;
      softwareVer?: string;
      password?: string;
    }
  >;
}

type FetchLike = typeof fetch;

type ResolvedIRobotCredentialsConfig = Omit<IRobotCredentialsConfig, 'appId' | 'countryCode' | 'discoveryUrl'> & {
  appId: string;
  countryCode: string;
  discoveryUrl: string;
};

export class IRobotCredentials {
  private readonly config: ResolvedIRobotCredentialsConfig;
  private readonly fetchFn: FetchLike;
  private readonly log = new AnsiLogger({ logName: 'IRobotCredentials', logLevel: LogLevel.DEBUG, logTimestampFormat: TimestampFormat.TIME_MILLIS });

  constructor(config: IRobotCredentialsConfig, fetchFn: FetchLike = fetch) {
    this.config = {
      ...config,
      appId: config.appId ?? 'ANDROID-C7FB240E-DF34-42D7-AE4E-A8C17079A294',
      countryCode: config.countryCode ?? process.env.IROBOT_COUNTRY_CODE ?? 'US',
      apiKey: config.apiKey ?? process.env.GIGYA_API_KEY,
      gigyaBase: config.gigyaBase ?? process.env.GIGYA_BASE,
      httpBase: config.httpBase ?? process.env.IROBOT_HTTP_BASE,
      discoveryUrl:
        config.discoveryUrl ??
        process.env.IROBOT_DISCOVERY_URL ??
        `https://disc-prod.iot.irobotapi.com/v1/discover/endpoints?country_code=${config.countryCode ?? process.env.IROBOT_COUNTRY_CODE ?? 'US'}`,
    };
    this.fetchFn = fetchFn;
  }

  async getCredentials(): Promise<IRobotCredentialInfo[]> {
    const endpoints = await this.getEndpoints();
    const gigyaLogin = await this.loginToGigya(endpoints);
    const iRobotLogin = await this.loginToIRobot(endpoints, gigyaLogin);

    if (!iRobotLogin.robots) {
      throw new Error('Fatal error login into iRobot account. Missing robots in login response.');
    }

    return Object.entries(iRobotLogin.robots).flatMap(([blid, robot]) => {
      if (!robot.password) return [];
      return [
        {
          blid,
          password: robot.password,
          name: robot.name,
          sku: robot.sku,
          softwareVer: robot.softwareVer,
        },
      ];
    });
  }

  private async getEndpoints(): Promise<IRobotEndpoints> {
    if (this.config.apiKey && this.config.gigyaBase && this.config.httpBase) {
      return {
        apiKey: this.config.apiKey,
        gigyaBase: this.config.gigyaBase,
        httpBase: this.config.httpBase,
      };
    }

    const { status, body } = await this.fetchJson<GigyaDiscoveryResponse>(this.config.discoveryUrl, {
      method: 'GET',
    });

    if (status >= 400) {
      throw new Error(`Fatal error discovering iRobot endpoints. HTTP ${status}.`);
    }

    const apiKey = this.config.apiKey ?? body.gigya?.api_key;
    const datacenter = body.gigya?.datacenter_domain;
    const gigyaBase = this.config.gigyaBase ?? (datacenter ? `https://accounts.${datacenter}` : 'https://accounts.us1.gigya.com');
    const httpBase = this.config.httpBase ?? this.pickHttpBase(body.deployments) ?? body.httpBase ?? 'https://unauth2.prod.iot.irobotapi.com';

    if (!apiKey) {
      throw new Error('Fatal error discovering iRobot endpoints. No Gigya API key in discovery response.');
    }

    return { apiKey, gigyaBase, httpBase };
  }

  private async loginToGigya(endpoints: IRobotEndpoints): Promise<GigyaLoginResponse> {
    const body = new URLSearchParams({
      apiKey: endpoints.apiKey,
      targetenv: 'mobile',
      loginID: this.config.username,
      password: this.config.password,
      format: 'json',
      targetEnv: 'mobile',
    });

    const { status, body: responseBody } = await this.fetchJson<GigyaLoginResponse>(`${endpoints.gigyaBase}/accounts.login`, {
      method: 'POST',
      headers: {
        'Connection': 'close',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (status === 401 || status === 403) {
      throw new Error('Authentication error. Check your credentials.');
    }
    if (status === 400) {
      throw new Error('Error login into Gigya API.');
    }
    if (status !== 200) {
      throw new Error(`Unexpected Gigya response status ${status}.`);
    }

    if (responseBody.statusCode === 403) {
      throw new Error('Authentication error. Please check your credentials.');
    }
    if (responseBody.statusCode === 400) {
      throw new Error('Error login into Gigya API.');
    }
    if (
      responseBody.statusCode !== 200 ||
      responseBody.errorCode !== 0 ||
      !responseBody.UID ||
      !responseBody.UIDSignature ||
      !responseBody.signatureTimestamp ||
      !responseBody.sessionInfo?.sessionToken
    ) {
      throw new Error('Error login into iRobot account. Missing fields in login response.');
    }

    return responseBody;
  }

  private async loginToIRobot(endpoints: IRobotEndpoints, gigyaLogin: GigyaLoginResponse): Promise<IRobotAccountLoginResponse> {
    const { status, body } = await this.fetchJson<IRobotAccountLoginResponse>(`${endpoints.httpBase}/v2/login`, {
      method: 'POST',
      headers: {
        'Connection': 'close',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: this.config.appId,
        assume_robot_ownership: 0,
        gigya: {
          signature: gigyaLogin.UIDSignature,
          timestamp: gigyaLogin.signatureTimestamp,
          uid: gigyaLogin.UID,
        },
      }),
    });

    if (status >= 400) {
      throw new Error('Fatal error login into iRobot account. Please check your credentials or API key.');
    }

    return body;
  }

  private async fetchJson<T>(input: string, init: RequestInit): Promise<{ status: number; body: T }> {
    const response = await this.fetchFn(input, init);
    const body = (await response.json()) as T;
    return { status: response.status, body };
  }

  private pickHttpBase(deployments?: Record<string, { httpBase?: string }>): string | null {
    const keys = Object.keys(deployments ?? {})
      .sort()
      .reverse();

    for (const key of keys) {
      const deployment = deployments?.[key];
      if (deployment?.httpBase) return deployment.httpBase;
    }

    return null;
  }
}
