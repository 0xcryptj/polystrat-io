import type { ConfigField, StrategyConfigSchema } from "@polystrat/strategy-sdk";

export type ConfigValidationIssue = {
  key: string;
  message: string;
};

export type ValidateConfigResult = {
  ok: boolean;
  config: Record<string, any>; // sanitized config
  errors: ConfigValidationIssue[];
  warnings: ConfigValidationIssue[];
  unknownKeys: string[];
};

// HARD RULE: runner must not trust client config. This enforces the strategy's configSchema.
export function validateConfig(schema: StrategyConfigSchema | undefined, input: any): ValidateConfigResult {
  const raw = input && typeof input === "object" ? input : {};

  // No schema? allow empty object, but still strip unknown keys by returning {}.
  if (!schema || !Array.isArray((schema as any).fields)) {
    return {
      ok: true,
      config: {},
      errors: [],
      warnings: [],
      unknownKeys: Object.keys(raw ?? {})
    };
  }

  const fields = schema.fields as ConfigField[];
  const allowed = new Set(fields.map((f) => f.key));
  const unknownKeys = Object.keys(raw).filter((k) => !allowed.has(k));

  const errors: ConfigValidationIssue[] = [];
  const warnings: ConfigValidationIssue[] = [];
  const out: Record<string, any> = {};

  for (const f of fields) {
    const has = Object.prototype.hasOwnProperty.call(raw, f.key);
    const v = has ? raw[f.key] : undefined;

    if (!has || v == null || v === "") {
      const d = (f as any).default;
      if (d !== undefined) out[f.key] = d;
      else if (f.required) errors.push({ key: f.key, message: "required" });
      continue;
    }

    if (f.type === "string") {
      out[f.key] = String(v);
      continue;
    }

    if (f.type === "boolean") {
      out[f.key] = typeof v === "boolean" ? v : String(v).toLowerCase() === "true";
      continue;
    }

    if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) {
        errors.push({ key: f.key, message: "must be a number" });
        continue;
      }
      let nn = n;
      if ((f as any).min != null && nn < (f as any).min) {
        warnings.push({ key: f.key, message: `clamped to min ${(f as any).min}` });
        nn = (f as any).min;
      }
      if ((f as any).max != null && nn > (f as any).max) {
        warnings.push({ key: f.key, message: `clamped to max ${(f as any).max}` });
        nn = (f as any).max;
      }
      out[f.key] = nn;
      continue;
    }

    if (f.type === "select") {
      const s = String(v);
      const opts = Array.isArray((f as any).options) ? (f as any).options : [];
      const allowedVals = new Set(opts.map((o: any) => String(o.value)));
      if (!allowedVals.has(s)) {
        const d = (f as any).default;
        if (d != null && allowedVals.has(String(d))) {
          warnings.push({ key: f.key, message: `invalid option; defaulted to ${String(d)}` });
          out[f.key] = d;
        } else {
          errors.push({ key: f.key, message: "invalid option" });
        }
      } else {
        out[f.key] = s;
      }
      continue;
    }

    warnings.push({ key: f.key, message: `unknown field type ${(f as any).type}; dropping` });
  }

  // Unknown keys are dropped by design.
  const ok = errors.length === 0;
  return { ok, config: out, errors, warnings, unknownKeys };
}
