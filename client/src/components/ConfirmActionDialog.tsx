import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { type ReactNode, useId, useState } from "react";

export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel = "确认",
  pending = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={onConfirm}
            className="bg-rose-600 text-white hover:bg-rose-500"
          >
            {pending ? "处理中…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReasonActionDialog({
  trigger,
  title,
  description,
  defaultReason = "",
  minLength = 0,
  confirmLabel = "确认删除",
  pending = false,
  actionTone = "danger",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  defaultReason?: string;
  minLength?: number;
  confirmLabel?: string;
  pending?: boolean;
  actionTone?: "danger" | "positive";
  onConfirm: (reason: string | undefined) => void;
}) {
  const [reason, setReason] = useState(defaultReason);
  const reasonId = useId();
  const trimmed = reason.trim();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <label htmlFor={reasonId} className="text-sm font-medium">
            处置原因{minLength > 0 ? `（至少 ${minLength} 个字）` : "（可选）"}
          </label>
          <Input
            id={reasonId}
            value={reason}
            onChange={event => setReason(event.target.value)}
            maxLength={240}
            placeholder="说明执行此操作的原因"
          />
          <p className="text-right text-xs text-slate-400">
            {trimmed.length}/240
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || trimmed.length < minLength}
            onClick={() => onConfirm(trimmed || undefined)}
            className={
              actionTone === "positive"
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-rose-600 text-white hover:bg-rose-500"
            }
          >
            {pending ? "处理中…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
