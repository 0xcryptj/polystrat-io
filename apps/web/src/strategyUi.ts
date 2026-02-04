type ConfigField =
  | { key: string; label: string; description?: string; type: "string"; default?: string; placeholder?: string }
  | { key: string; label: string; description?: string; type: "number"; default?: number; min?: number; max?: number; step?: number }
  | { key: string; label: string; description?: string; type: "boolean"; default?: boolean }
  | { key: string; label: string; description?: string; type: "select"; default?: string; options: { label: string; value: string }[] };

export function buildConfigForm(params: {
  el: any;
  fields: ConfigField[];
  initial?: Record<string, any>;
}) {
  const { el, fields } = params;
  const values: Record<string, any> = { ...(params.initial ?? {}) };

  const rows = fields.map((f) => {
    const label = el("div", { className: "fieldLabel" }, el("span", {}, f.label), el("span", { className: "muted" }, f.description ?? ""));

    if (f.type === "string") {
      const input = el("input", { value: values[f.key] ?? f.default ?? "", placeholder: f.placeholder ?? "" });
      input.addEventListener("input", () => (values[f.key] = input.value));
      values[f.key] = input.value;
      return el("div", { className: "field" }, label, input);
    }

    if (f.type === "number") {
      const input = el("input", { type: "number", value: String(values[f.key] ?? f.default ?? 0), min: f.min, max: f.max, step: f.step ?? 1 });
      input.addEventListener("input", () => (values[f.key] = Number(input.value)));
      values[f.key] = Number(input.value);
      return el("div", { className: "field" }, label, input);
    }

    if (f.type === "boolean") {
      const input = el("input", { type: "checkbox", checked: Boolean(values[f.key] ?? f.default ?? false) });
      input.addEventListener("change", () => (values[f.key] = Boolean(input.checked)));
      values[f.key] = Boolean(input.checked);
      return el("div", { className: "field" }, label, input);
    }

    if (f.type === "select") {
      const sel = el(
        "select",
        {},
        ...f.options.map((o) => el("option", { value: o.value }, o.label))
      );
      sel.value = String(values[f.key] ?? f.default ?? f.options?.[0]?.value ?? "");
      sel.addEventListener("change", () => (values[f.key] = sel.value));
      values[f.key] = sel.value;
      return el("div", { className: "field" }, label, sel);
    }

    return el("div", { className: "field" }, label, el("div", { className: "muted" }, "Unsupported field"));
  });

  return {
    node: el("div", { className: "grid" }, ...rows),
    getValues: () => ({ ...values })
  };
}
