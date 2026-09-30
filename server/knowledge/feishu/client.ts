const FEISHU_ORIGIN = "https://open.feishu.cn";

export class FeishuError extends Error {
  constructor(
    public readonly stage: string,
    public readonly httpStatus?: number,
    public readonly apiCode?: number
  ) {
    super(`飞书 ${stage} 读取失败`);
    this.name = "FeishuError";
  }
}

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};

export class FeishuClient {
  private token = "";
  private tokenExpiresAt = 0;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    if (!/^cli_[A-Za-z0-9]+$/.test(appId) || !appSecret)
      throw new FeishuError("config");
  }

  static fromEnvironment() {
    return new FeishuClient(
      process.env.FEISHU_KNOWLEDGE_APP_ID ?? "",
      process.env.FEISHU_KNOWLEDGE_APP_SECRET ?? ""
    );
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    let response: Response;
    let body: Json;
    try {
      response = await this.fetchImpl(
        `${FEISHU_ORIGIN}/open-apis/auth/v3/tenant_access_token/internal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: this.appId,
            app_secret: this.appSecret,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        }
      );
      body = asObject(await response.json());
    } catch {
      throw new FeishuError("auth");
    }
    if (
      !response.ok ||
      body.code !== 0 ||
      typeof body.tenant_access_token !== "string"
    )
      throw new FeishuError(
        "auth",
        response.status,
        typeof body.code === "number" ? body.code : undefined
      );
    this.token = body.tenant_access_token;
    this.tokenExpiresAt =
      Date.now() + Math.max(60, Number(body.expire ?? 7200) - 60) * 1000;
    return this.token;
  }

  private async get(
    path: string,
    stage: string,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    if (!path.startsWith("/open-apis/")) throw new FeishuError("path");
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${FEISHU_ORIGIN}${path}`, {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${await this.accessToken()}`,
            ...headers,
          },
        });
      } catch (error) {
        if (error instanceof FeishuError) throw error;
        throw new FeishuError(stage);
      }
      if (response.status === 401 && attempt === 0) {
        this.token = "";
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
        continue;
      }
      return response;
    }
    throw new FeishuError(stage);
  }

  async json(path: string, stage: string): Promise<Json> {
    let response: Response;
    let body: Json;
    try {
      response = await this.get(path, stage);
      body = asObject(await response.json());
    } catch (error) {
      if (error instanceof FeishuError) throw error;
      throw new FeishuError(stage);
    }
    if (!response.ok || body.code !== 0)
      throw new FeishuError(
        stage,
        response.status,
        typeof body.code === "number" ? body.code : undefined
      );
    return asObject(body.data);
  }

  async binary(path: string, stage: string): Promise<Response> {
    const response = await this.get(path, stage);
    if (
      (response.headers.get("content-type") ?? "").includes("application/json")
    ) {
      const body = asObject(await response.json().catch(() => ({})));
      throw new FeishuError(
        stage,
        response.status,
        typeof body.code === "number" ? body.code : undefined
      );
    }
    if (!response.ok) throw new FeishuError(stage, response.status);
    return response;
  }
}

export function feishuObject(value: unknown): Json {
  return asObject(value);
}
