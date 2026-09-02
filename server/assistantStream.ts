import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { streamLLM } from "./_core/llm";
import { assertAssistantQuota, assistantInput, buildAssistantMessages, persistAssistantAnswer } from "./assistantService";

const sendJson = (res: Response, status: number, message: string) => res.status(status).json({ error: message });

export function registerAssistantStreamRoute(app: Express) {
  app.post("/api/assistant/stream", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      sendJson(res, 401, "请先登录后使用 AI 助手");
      return;
    }

    const parsed = assistantInput.safeParse(req.body);
    if (!parsed.success) {
      sendJson(res, 400, "助手请求参数无效，请刷新页面后重试");
      return;
    }

    let db;
    try {
      db = await assertAssistantQuota(user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 助手暂时不可用";
      const status = message.includes("每天最多") ? 429 : 503;
      sendJson(res, status, message);
      return;
    }

    const controller = new AbortController();
    let disconnected = false;
    const abortStream = () => {
      disconnected = true;
      controller.abort();
    };
    req.on("aborted", abortStream);
    res.on("close", () => {
      if (!res.writableEnded) abortStream();
    });

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const emit = (event: string, data: unknown) => {
      if (!disconnected && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let answer = "";
      let modelId: string | undefined;
      for await (const chunk of streamLLM({ maxTokens: 2_000, messages: buildAssistantMessages(parsed.data) }, controller.signal)) {
        if (disconnected) return;
        answer += chunk.delta;
        modelId = chunk.model ?? modelId;
        emit("delta", { text: chunk.delta });
      }
      if (!answer.trim()) throw new Error("AI 助手未返回可阅读的答复");
      await persistAssistantAnswer(db, user.id, parsed.data, answer);
      emit("done", { modelId: modelId ?? null });
      res.end();
    } catch (error) {
      if (disconnected || controller.signal.aborted) return;
      emit("error", { message: error instanceof Error ? error.message : "AI 助手暂时不可用，请稍后重试" });
      res.end();
    }
  });
}
