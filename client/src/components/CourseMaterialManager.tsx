import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  Link2,
  Loader2,
  PlaySquare,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { ChangeEvent, useState } from "react";
import { toast } from "sonner";

type Course = { id: number; title: string; pathId: number };
type Material = {
  id: number;
  courseId: number;
  materialType: "document" | "video" | "practice";
  sourceType: "url" | "file" | "inline";
  title: string;
  description: string | null;
  sourceUrl: string | null;
  storageKey: string | null;
  mimeType: string | null;
  content: string | null;
  contentHtml: string | null;
  contentFormat: "html" | "markdown" | "plain";
  provider?: string | null;
  canonicalUrl?: string | null;
  config: Record<string, unknown>;
  orderIndex: number;
};
type Draft = Omit<
  Material,
  | "id"
  | "description"
  | "sourceUrl"
  | "storageKey"
  | "mimeType"
  | "content"
  | "contentHtml"
  | "provider"
  | "canonicalUrl"
> & {
  id?: number;
  courseId: number;
  description: string;
  sourceUrl: string;
  storageKey: string;
  mimeType: string;
  content: string;
  contentHtml: string;
  contentFormat: "html" | "markdown" | "plain";
  provider: string;
  canonicalUrl: string;
  configText: string;
};
type UploadResult = {
  storageKey: string;
  url: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  contentHtml?: string | null;
  contentFormat?: "html" | "markdown" | "plain";
  provider?: string | null;
  canonicalUrl?: string | null;
};
const blank = (courseId: number): Draft => ({
  courseId,
  materialType: "document",
  sourceType: "url",
  title: "",
  description: "",
  sourceUrl: "",
  storageKey: "",
  mimeType: "",
  content: "",
  contentHtml: "",
  contentFormat: "markdown",
  provider: "",
  canonicalUrl: "",
  config: {},
  configText: "",
  orderIndex: 10,
});
const Icon = ({ type }: { type: Material["materialType"] }) =>
  type === "video" ? (
    <PlaySquare className="h-4 w-4" />
  ) : type === "practice" ? (
    <Sparkles className="h-4 w-4" />
  ) : (
    <FileText className="h-4 w-4" />
  );
const materialTypeLabel: Record<Material["materialType"], string> = {
  document: "文档",
  video: "视频",
  practice: "实操",
};
const sourceTypeLabel: Record<Material["sourceType"], string> = {
  file: "上传文件",
  inline: "内联内容",
  url: "外部链接",
};
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1GB，与流式上传路由一致
const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
    : bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
      : `${Math.round(bytes / 1024)}KB`;

// 流式直传：文件体不经 base64，XHR 提供上传进度回调。
function uploadCourseFile(
  file: File,
  onProgress: (percent: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload/course-material");
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-file-type", file.type);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText) as UploadResult);
        return;
      }
      let message = "上传失败，请重试";
      try {
        message =
          (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        /* 保留默认提示 */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("网络错误，上传中断"));
    xhr.send(file);
  });
}

export function CourseMaterialManager({
  courses,
  materials,
  refresh,
}: {
  courses: Course[];
  materials: Material[];
  refresh: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Material | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const capture = trpc.platform.operations.captureDocumentUrl.useMutation({
    onError: error => toast.error(error.message),
  });
  const add = trpc.platform.operations.addCourseMaterial.useMutation({
    onSuccess: () => {
      toast.success("课程资源已保存");
      setDraft(null);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.platform.operations.updateCourseMaterial.useMutation({
    onSuccess: () => {
      toast.success("课程资源已更新");
      setDraft(null);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.platform.operations.deleteCourseMaterial.useMutation({
    onSuccess: () => {
      toast.success("资源已删除");
      setPendingDelete(null);
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  const captureUrl = async () => {
    if (!draft?.sourceUrl) return toast.error("请先输入公开文档 URL");
    const result = await capture.mutateAsync({ url: draft.sourceUrl });
    setDraft({
      ...draft,
      sourceType: "url",
      title: draft.title || result.title,
      description: draft.description || result.summary,
      content: result.content,
      contentHtml: result.contentHtml || "",
      contentFormat:
        result.contentFormat || (result.contentHtml ? "html" : "markdown"),
      provider: result.provider || "",
      canonicalUrl: result.canonicalUrl || "",
      mimeType: result.mimeType,
      sourceUrl: result.sourceUrl,
    });
    toast.success(
      result.contentHtml
        ? "已采集标题、摘要和排版正文，请确认后保存"
        : "已采集标题、摘要和正文，请确认后保存"
    );
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !draft) return;
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/markdown",
      "text/plain",
      "text/html",
      "image/png",
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/webm",
    ];
    if (!allowed.includes(file.type))
      return toast.error(
        "仅支持 PDF、Word、Markdown、文本、HTML、图片、MP4 或 WebM"
      );
    if (file.size > MAX_UPLOAD_BYTES)
      return toast.error(
        `单个资源文件不能超过 ${formatSize(MAX_UPLOAD_BYTES)}`
      );
    setUploadPercent(0);
    try {
      const result = await uploadCourseFile(file, setUploadPercent);
      const isVideo = result.mimeType.startsWith("video/");
      const contentFormat =
        result.contentFormat ||
        (result.contentHtml
          ? "html"
          : result.mimeType === "text/plain"
            ? "plain"
            : "markdown");
      setDraft({
        ...draft,
        materialType: isVideo ? "video" : draft.materialType,
        sourceType: "file",
        title: draft.title || result.fileName,
        storageKey: result.storageKey,
        mimeType: result.mimeType,
        sourceUrl: "",
        contentHtml: result.contentHtml || "",
        contentFormat,
        provider: result.provider || "",
        canonicalUrl: result.canonicalUrl || "",
      });
      toast.success(
        `${result.fileName}（${formatSize(result.sizeBytes)}）上传完成${isVideo ? "，类型已切换为视频型" : ""}，请保存资源`
      );
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error ? uploadError.message : "上传失败，请重试"
      );
    } finally {
      setUploadPercent(null);
    }
  };

  const save = () => {
    if (!draft) return;
    let config: Record<string, unknown> = {};
    try {
      config = draft.configText.trim() ? JSON.parse(draft.configText) : {};
    } catch {
      return toast.error("实操配置必须是合法 JSON");
    }
    const payload = {
      ...draft,
      description: draft.description || null,
      sourceUrl: draft.sourceUrl || null,
      storageKey: draft.storageKey || null,
      mimeType: draft.mimeType || null,
      content: draft.content || null,
      contentHtml: draft.contentHtml || null,
      provider: draft.provider || null,
      canonicalUrl: draft.canonicalUrl || null,
      config,
    };
    if (draft.id) update.mutate({ ...payload, id: draft.id });
    else add.mutate(payload);
  };

  return (
    <section className="mt-7 rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="section-kicker">
            LEARNING ASSETS / DOCUMENT · VIDEO · PRACTICE
          </p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">
            课程资源管理
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            文档可采集公开 URL 或上传 PDF/Word/Markdown；视频支持
            MP4/WebM（单个不超过
            1GB）；实操资源仅运行受控模型任务。删除资源会同时清除其评论、标注与学习进度。
          </p>
        </div>
        <Button
          onClick={() => setDraft(blank(courses[0]?.id ?? 0))}
          disabled={!courses.length}
        >
          <Plus className="mr-2 h-4 w-4" />
          添加资源
        </Button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {materials.map(item => (
          <article key={item.id} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-violet-700">
                    <Icon type={item.materialType} />
                  </span>
                  <h3 className="font-semibold">{item.title}</h3>
                  <Badge variant="secondary">
                    {materialTypeLabel[item.materialType]}
                  </Badge>
                  <Badge variant="outline">
                    {sourceTypeLabel[item.sourceType]}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  课程：
                  {courses.find(course => course.id === item.courseId)?.title ||
                    `#${item.courseId}`}{" "}
                  · 排序 {item.orderIndex}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                  {item.description ||
                    item.sourceUrl ||
                    item.mimeType ||
                    "待补充说明"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      ...item,
                      description: item.description || "",
                      sourceUrl: item.sourceUrl || "",
                      storageKey: item.storageKey || "",
                      mimeType: item.mimeType || "",
                      content: item.content || "",
                      contentHtml:
                        item.contentHtml ||
                        (typeof item.config.contentHtml === "string"
                          ? item.config.contentHtml
                          : ""),
                      contentFormat:
                        item.contentFormat ||
                        (typeof item.config.contentFormat === "string"
                          ? (item.config
                              .contentFormat as Draft["contentFormat"])
                          : "markdown"),
                      provider:
                        item.provider ||
                        (typeof item.config.provider === "string"
                          ? item.config.provider
                          : ""),
                      canonicalUrl:
                        item.canonicalUrl ||
                        (typeof item.config.canonicalUrl === "string"
                          ? item.config.canonicalUrl
                          : ""),
                      configText: Object.keys(item.config).length
                        ? JSON.stringify(item.config, null, 2)
                        : "",
                    })
                  }
                >
                  维护
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => setPendingDelete(item)}
                  aria-label={`删除 ${item.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </div>
          </article>
        ))}
        {!materials.length && (
          <p className="rounded-2xl border border-dashed p-6 text-sm text-slate-500 md:col-span-2">
            尚未挂载多资源。现有课程链接仍可用；建议从每条核心课程的“学习说明 +
            视频 + 实操任务”开始沉淀。
          </p>
        )}
      </div>

      {/* 删除确认：说明级联影响，避免误删 */}
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={open => !open && setPendingDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除课程资源</DialogTitle>
            <DialogDescription>
              删除会同时清理该资源关联的学习进度与互动记录，且不可撤销。
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <div className="text-sm text-slate-600">
              <p>
                确定删除「
                <span className="font-semibold text-slate-900">
                  {pendingDelete.title}
                </span>
                」？
              </p>
              <ul className="mt-3 space-y-1.5 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700">
                <li>· 该资源的员工评论与弹幕将一并删除</li>
                <li>· PDF 标注与阅读进度记录将一并删除</li>
                <li>· 实操运行历史将一并删除</li>
                <li>· 操作不可恢复</li>
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              disabled={remove.isPending}
              onClick={() =>
                pendingDelete && remove.mutate({ id: pendingDelete.id })
              }
              className="bg-rose-600 hover:bg-rose-500"
            >
              {remove.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(draft)}
        onOpenChange={open => !open && setDraft(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "维护课程资源" : "添加课程资源"}
            </DialogTitle>
            <DialogDescription>
              配置资源类型、来源与内容；员工端将按这里的顺序展示。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-3">
              <select
                value={draft.courseId}
                onChange={event =>
                  setDraft({ ...draft, courseId: Number(event.target.value) })
                }
                className="h-10 rounded-md border px-3 text-sm"
              >
                <option value={0}>选择课程</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={draft.materialType}
                  onChange={event =>
                    setDraft({
                      ...draft,
                      materialType: event.target.value as Draft["materialType"],
                      sourceType:
                        event.target.value === "practice"
                          ? "inline"
                          : draft.sourceType,
                    })
                  }
                  className="h-10 rounded-md border px-3 text-sm"
                >
                  <option value="document">文档型</option>
                  <option value="video">视频型</option>
                  <option value="practice">实操型</option>
                </select>
                <Input
                  type="number"
                  value={draft.orderIndex}
                  onChange={event =>
                    setDraft({
                      ...draft,
                      orderIndex: Number(event.target.value),
                    })
                  }
                  placeholder="排序"
                />
              </div>
              <Input
                value={draft.title}
                onChange={event =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="资源标题"
              />
              <Textarea
                value={draft.description}
                onChange={event =>
                  setDraft({ ...draft, description: event.target.value })
                }
                placeholder="面向员工的学习说明"
              />
              {draft.materialType !== "practice" && (
                <>
                  <Input
                    value={draft.sourceUrl}
                    onChange={event =>
                      setDraft({ ...draft, sourceUrl: event.target.value })
                    }
                    placeholder={
                      draft.materialType === "document"
                        ? "公开文档 URL（可采集）或外部资源链接"
                        : "MP4/WebM 视频 URL"
                    }
                  />
                  {draft.materialType === "document" && (
                    <Button
                      variant="outline"
                      disabled={!draft.sourceUrl || capture.isPending}
                      onClick={captureUrl}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      {capture.isPending ? "正在采集" : "采集并保留排版"}
                    </Button>
                  )}
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-slate-600">
                    <Upload className="h-4 w-4" />
                    {uploadPercent !== null
                      ? `正在上传… ${uploadPercent}%`
                      : "上传 PDF / Word / HTML / Markdown / 图片 / 视频（HTML 不超过 20MB，其它文件不超过 1GB）"}
                    <input
                      className="hidden"
                      type="file"
                      accept=".pdf,.docx,.html,.htm,.md,.txt,.png,.jpg,.jpeg,.webp,.mp4,.webm"
                      onChange={onFile}
                    />
                  </label>
                  {uploadPercent !== null && (
                    <Progress value={uploadPercent} className="h-2" />
                  )}
                </>
              )}
              {draft.materialType === "practice" && (
                <>
                  <Textarea
                    value={draft.content}
                    onChange={event =>
                      setDraft({ ...draft, content: event.target.value })
                    }
                    placeholder="员工实操说明、背景材料或示例"
                  />
                  <Textarea
                    value={draft.configText}
                    onChange={event =>
                      setDraft({ ...draft, configText: event.target.value })
                    }
                    placeholder={
                      '实操配置 JSON，例如 {"instruction":"根据输入生成一版客户回复"}'
                    }
                  />
                </>
              )}
              <p className="text-xs text-slate-400">
                文档正文支持
                Markdown，图片可作为上传资源附加；视频评论会按时间戳显示，实操运行受每日次数限制。
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button
              disabled={
                !draft?.courseId ||
                !draft?.title ||
                add.isPending ||
                update.isPending
              }
              onClick={save}
            >
              {add.isPending || update.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              保存资源
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
