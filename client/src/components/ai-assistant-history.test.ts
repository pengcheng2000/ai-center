import { describe, expect, it } from "vitest";
import { assistantHistoryMessages } from "@/lib/assistantHistory";

describe("AI 助手历史恢复", () => {
  it("把服务端倒序问答恢复为前端时间顺序消息", () => {
    expect(
      assistantHistoryMessages([
        { question: "第二问", answer: "第二答" },
        { question: "第一问", answer: "第一答" },
      ])
    ).toEqual([
      { role: "user", content: "第一问" },
      { role: "assistant", content: "第一答" },
      { role: "user", content: "第二问" },
      { role: "assistant", content: "第二答" },
    ]);
  });
});
