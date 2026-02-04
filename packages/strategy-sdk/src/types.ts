export type StrategyId = string;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type StrategyRunState = "stopped" | "running" | "error";

export interface StrategyMetadata {
  id: StrategyId;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
}

export type ConfigFieldType = "string" | "number" | "boolean" | "select";

export interface ConfigFieldBase {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
}

export interface StringField extends ConfigFieldBase {
  type: "string";
  default?: string;
  placeholder?: string;
}

export interface NumberField extends ConfigFieldBase {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanField extends ConfigFieldBase {
  type: "boolean";
  default?: boolean;
}

export interface SelectField extends ConfigFieldBase {
  type: "select";
  default?: string;
  options: { label: string; value: string }[];
}

export type ConfigField = StringField | NumberField | BooleanField | SelectField;

export interface StrategyConfigSchema {
  fields: ConfigField[];
}

export type StrategyEventType = "log" | "signal" | "error" | "paperTrade";

export interface StrategyEventBase {
  id: string; // uuid
  ts: number; // epoch ms
  strategyId: StrategyId;
  runId: string;
  type: StrategyEventType;
}

export interface LogEvent extends StrategyEventBase {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: Json;
}

export interface SignalEvent extends StrategyEventBase {
  type: "signal";
  message: string;
  confidence?: number; // 0..1
  data?: Json;
}

export interface ErrorEvent extends StrategyEventBase {
  type: "error";
  message: string;
  stack?: string;
  data?: Json;
}

export interface PaperTradeEvent extends StrategyEventBase {
  type: "paperTrade";
  marketId: string;
  side: "buy" | "sell";
  price: number;
  size: number;
  reason?: string;
  data?: Json;
}

export type StrategyEvent = LogEvent | SignalEvent | ErrorEvent | PaperTradeEvent;

export interface StrategyContext {
  emit: (event: Omit<StrategyEvent, "id" | "ts">) => void;
  now: () => number;
}

export interface Strategy<TConfig extends Record<string, any> = Record<string, any>> {
  meta: StrategyMetadata;
  configSchema: StrategyConfigSchema;

  start: (ctx: StrategyContext, config: TConfig) => Promise<void> | void;
  stop: (ctx: StrategyContext) => Promise<void> | void;
  onTick: (ctx: StrategyContext, input: Json) => Promise<void> | void;
}
