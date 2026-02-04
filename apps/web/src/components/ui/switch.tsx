import * as React from "react";
import { cn } from "../../lib/utils";

export function Switch(props: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onCheckedChange(!props.checked)}
      className={cn(
        "relative inline-flex h-6 w-10 items-center rounded-full border border-border transition-colors",
        props.checked ? "bg-primary" : "bg-muted",
        props.disabled && "opacity-50 cursor-not-allowed"
      )}
      aria-pressed={props.checked}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
          props.checked ? "translate-x-4" : "translate-x-1"
        )}
      />
    </button>
  );
}
