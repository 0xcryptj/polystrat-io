import { PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

export function Modal(
  props: PropsWithChildren<{
    open: boolean;
    title: string;
    onClose: () => void;
    className?: string;
  }>
) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={props.onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={cn("w-full max-w-xl rounded-xl border border-border bg-card shadow-lg", props.className)}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">{props.title}</div>
            <button
              className="rounded-md border border-border px-2 py-1 text-xs text-mutedForeground hover:bg-muted"
              onClick={props.onClose}
            >
              Close
            </button>
          </div>
          <div className="p-4">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
