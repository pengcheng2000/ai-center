export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

type HistoryRow = { question: string; answer: string };

export function assistantHistoryMessages(
  rows: HistoryRow[]
): AssistantMessage[] {
  return [...rows].reverse().flatMap(row => [
    { role: "user" as const, content: row.question },
    { role: "assistant" as const, content: row.answer },
  ]);
}
