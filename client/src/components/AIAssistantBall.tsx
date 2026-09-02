// 平台 AI 助手悬浮球（全局）：读取当前页面上下文（路由/标题/正文摘录/划词），
// 支持多轮对话、按页面类型变化的快捷指令；后端注入平台功能知识库作答。
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { collectPageContext, quickPromptsFor, resolvePageKind } from "@/lib/pageContext";
import { cn } from "@/lib/utils";
import { BookOpenText, Loader2, MapPin, MessageCircleQuestion, Send, Sparkles, TextSelect, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Streamdown } from "streamdown";

type ChatMessage = { role: "user" | "assistant"; content: string };
type StreamEvent = { text?: string; message?: string; modelId?: string | null };

export default function AIAssistantBall() {
  const [location] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const kind = useMemo(() => resolvePageKind(location).kind, [location]);
  const prompts = useMemo(() => quickPromptsFor(kind), [kind]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const updateSelection = () => setSelection(window.getSelection()?.toString().trim().slice(0, 4_000) ?? "");
    updateSelection();
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, [open, location]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target) || target.closest("[data-assistant-trigger]")) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const updateAssistantMessage = (index: number, content: string) => {
    setMessages(prev => prev.map((message, messageIndex) => messageIndex === index ? { ...message, content } : message));
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || isStreaming) return;
    const context = collectPageContext(location, utils);
    const history = messages.slice(-16);
    const assistantIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setDraft("");
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/assistant/stream", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ question, pageContext: context, history }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `请求失败（${response.status}）`);
      }
      if (!response.body) throw new Error("浏览器不支持流式响应");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let completed = false;
      const consume = (rawEvent: string) => {
        const data = rawEvent.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
        if (!data) return;
        const event = JSON.parse(data) as StreamEvent;
        if (event.text) {
          answer += event.text;
          updateAssistantMessage(assistantIndex, answer);
        }
        if (event.message) throw new Error(event.message);
        if (event.modelId !== undefined) completed = true;
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) consume(event);
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!completed) throw new Error("流式回答未正常结束，请重试");
    } catch (error) {
      if (controller.signal.aborted) return;
      updateAssistantMessage(assistantIndex, `出错了：${error instanceof Error ? error.message : "AI 助手暂时不可用"}`);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsStreaming(false);
    }
  };

  if (authLoading || !isAuthenticated || location === "/login") return null;

  const pageLabel: Record<string, string> = {
    home: "工作台", learn: "学习中心", learningPath: "学习路径", course: "课程学习页",
    newsList: "AI 资讯", newsArticle: "资讯文章", communityList: "实践社区", postDetail: "帖子详情",
    skillsHub: "Skills 广场", skillDetail: "Skills 详情", profile: "个人空间", operations: "运营管理", apps: "应用中心", other: "当前页面",
  };

  return <div ref={panelRef} className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[55] flex flex-col items-end gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6">
    {open && <div className="flex h-[min(70dvh,640px)] max-h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-violet-900/15 sm:w-[min(92vw,440px)]">
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-violet-700 to-indigo-700 px-4 py-3 text-white">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/15"><Sparkles className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">AI 助手小智</p><p className="flex items-center gap-1 truncate text-[11px] text-violet-200"><MapPin className="h-3 w-3 shrink-0" />正在阅读：{pageLabel[kind] ?? "当前页面"}</p></div>
        {messages.length > 0 && <button onClick={() => setMessages([])} aria-label="清空对话" className="grid h-7 w-7 place-items-center rounded-lg transition hover:bg-white/15"><Trash2 className="h-3.5 w-3.5" /></button>}
        <button onClick={() => setOpen(false)} aria-label="收起" className="grid h-7 w-7 place-items-center rounded-lg transition hover:bg-white/15"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-3.5">
        {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100"><MessageCircleQuestion className="h-6 w-6 text-violet-600" /></span><div><p className="text-sm font-semibold text-slate-700">我能读懂你正在看的页面</p><p className="mt-1.5 text-xs leading-5 text-slate-500">指导平台使用、总结文章内容、解释选中文字、解答 AI 问题都可以找我。</p></div>{selection && <p className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-left text-[11px] leading-4 text-amber-800"><TextSelect className="mr-1 inline h-3 w-3" />检测到你选中了文字，可以直接让我解释它。</p>}<div className="flex flex-wrap justify-center gap-1.5">{prompts.map(prompt => <button key={prompt} onClick={() => void send(prompt)} disabled={isStreaming} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-50">{prompt}</button>)}</div></div>}
        {messages.map((message, index) => <div key={index} className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}>{message.role === "assistant" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white"><Sparkles className="h-3.5 w-3.5" /></span>}<div className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-6", message.role === "user" ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-800 shadow-sm")}>{message.role === "assistant" ? (message.content ? <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-headings:mt-2 prose-headings:mb-1"><Streamdown>{message.content}</Streamdown></div> : <div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />正在生成回答…</div>) : <p className="whitespace-pre-wrap">{message.content}</p>}</div>{message.role === "user" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">我</span>}</div>)}
      </div>
      {selection && messages.length > 0 && <p className="mx-3.5 mb-1.5 truncate rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800"><TextSelect className="mr-1 inline h-3 w-3" />已捕获选中文字（{selection.length} 字），提问会带上它</p>}
      <div className="border-t border-slate-100 p-3"><div className="flex items-end gap-2"><Textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} placeholder="问我任何问题，或让我总结当前页面…" className="max-h-28 min-h-10 flex-1 resize-none text-sm" /><Button disabled={!draft.trim() || isStreaming} onClick={() => void send(draft)} className="h-10 shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500">{isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div><p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400"><BookOpenText className="h-3 w-3" />助手能看到当前页面标题与正文摘录 · 回答由企业模型网关生成</p></div>
    </div>}
    <button data-assistant-trigger onClick={() => setOpen(value => !value)} aria-label="AI 助手" className={cn("grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-xl shadow-violet-900/30 transition hover:scale-105", isStreaming && open && "animate-none")}>
      {isStreaming ? <Loader2 className="h-6 w-6 animate-spin" /> : open ? <X className="h-6 w-6" /> : <MessageCircleQuestion className="h-6 w-6" />}
    </button>
  </div>;
}
