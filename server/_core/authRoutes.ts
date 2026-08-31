import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { hashPassword, sdk, verifyPassword } from "./sdk";

type Credentials = { username?: unknown; password?: unknown; name?: unknown };

function readCredentials(body: unknown): { username: string; password: string; name?: string } | null {
  const { username, password, name } = (body ?? {}) as Credentials;
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (!username.trim() || !password) return null;
  const safeName = typeof name === "string" && name.trim() ? name.trim() : undefined;
  return { username: username.trim(), password, name: safeName };
}

/**
 * Ensure the bootstrap local admin exists. Idempotent: only creates the
 * account when the users table has no admin yet, so restarts are safe.
 * 数据库暂不可用时静默跳过（登录路由会在每次登录时重试调用）。
 */
export async function ensureLocalAdmin(): Promise<void> {
  try {
    const dbi = await db.getDb();
    if (!dbi) return;
    const [existing] = await dbi.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    if (existing) return;
    await db.upsertUser({
      openId: "local_admin",
      username: ENV.localAdminUsername,
      passwordHash: hashPassword(ENV.localAdminPassword),
      name: ENV.localAdminName,
      loginMethod: "local",
      role: "admin",
      lastSignedIn: new Date(),
    });
    console.log(`[Auth] 已创建本地管理员账号：${ENV.localAdminUsername}`);
  } catch (error) {
    console.warn("[Auth] 初始化本地管理员失败（数据库可能尚未就绪）:", error instanceof Error ? error.message : error);
  }
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const credentials = readCredentials(req.body);
    if (!credentials) {
      res.status(400).json({ error: "请输入用户名和密码" });
      return;
    }

    const dbi = await db.getDb();
    if (!dbi) {
      res.status(503).json({ error: "数据库暂不可用，请稍后再试" });
      return;
    }

    try {
      await ensureLocalAdmin();

      const [user] = await dbi.select().from(users).where(eq(users.username, credentials.username)).limit(1);
      if (!user || !verifyPassword(credentials.password, user.passwordHash)) {
        res.status(401).json({ error: "用户名或密码不正确" });
        return;
      }

      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.username || user.openId,
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ ok: true, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
    } catch (error) {
      console.error("[Auth] 登录处理失败:", error);
      res.status(503).json({ error: "登录服务暂不可用，请稍后再试" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const credentials = readCredentials(req.body);
    if (!credentials) {
      res.status(400).json({ error: "请输入用户名和密码" });
      return;
    }
    if (credentials.password.length < 6) {
      res.status(400).json({ error: "密码长度至少 6 位" });
      return;
    }

    const dbi = await db.getDb();
    if (!dbi) {
      res.status(503).json({ error: "数据库暂不可用，请稍后再试" });
      return;
    }

    try {
      const [existing] = await dbi.select({ id: users.id }).from(users).where(eq(users.username, credentials.username)).limit(1);
      if (existing) {
        res.status(409).json({ error: "该用户名已被注册" });
        return;
      }

      await db.upsertUser({
        openId: `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        username: credentials.username,
        passwordHash: hashPassword(credentials.password),
        name: credentials.name ?? credentials.username,
        loginMethod: "local",
        role: "user",
        lastSignedIn: new Date(),
      });

      const [created] = await dbi.select().from(users).where(eq(users.username, credentials.username)).limit(1);

      const sessionToken = await sdk.createSessionToken(created.openId, {
        name: created.name || created.username || created.openId,
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.status(201).json({ ok: true, user: { id: created.id, name: created.name, username: created.username, role: created.role } });
    } catch (error) {
      console.error("[Auth] 注册处理失败:", error);
      res.status(503).json({ error: "注册服务暂不可用，请稍后再试" });
    }
  });
}
