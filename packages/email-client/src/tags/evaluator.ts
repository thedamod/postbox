import type { StoredMessage } from "../types";

export type Condition = AndCondition | OrCondition | NotCondition | FieldCondition;

export type AndCondition = { op: "and"; rules: Condition[] };
export type OrCondition = { op: "or"; rules: Condition[] };
export type NotCondition = { op: "not"; rule: Condition };

export type FieldName =
  | "from"
  | "to"
  | "cc"
  | "subject"
  | "body";

export type FieldOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "regex";

export type FieldCondition = {
  field: FieldName;
  op: FieldOperator;
  value: string;
};

function addressesOf(message: StoredMessage, field: FieldName): string[] {
  switch (field) {
    case "from":
      return message.from.map((a) => `${a.name ?? ""} ${a.address}`.trim());
    case "to":
      return message.to.map((a) => `${a.name ?? ""} ${a.address}`.trim());
    case "cc":
      return message.cc.map((a) => `${a.name ?? ""} ${a.address}`.trim());
    default:
      return [];
  }
}

function textOf(message: StoredMessage, field: FieldName): string {
  switch (field) {
    case "subject":
      return message.subject ?? "";
    case "body":
      return message.text ?? message.html ?? "";
    default:
      return "";
  }
}

function testField(message: StoredMessage, condition: FieldCondition): boolean {
  const haystackField = condition.field;

  const haystacks: string[] =
    haystackField === "from" ||
    haystackField === "to" ||
    haystackField === "cc"
      ? addressesOf(message, haystackField)
      : [textOf(message, haystackField)];

  if (haystacks.length === 0) {
    return false;
  }

  const needle = condition.value.toLowerCase();
  const op = condition.op;

  return haystacks.some((haystack) => {
    const source = haystack.toLowerCase();

    switch (op) {
      case "contains":
        return source.includes(needle);
      case "not_contains":
        return !source.includes(needle);
      case "equals":
        return source === needle;
      case "not_equals":
        return source !== needle;
      case "starts_with":
        return source.startsWith(needle);
      case "ends_with":
        return source.endsWith(needle);
      case "regex":
        try {
          return new RegExp(condition.value).test(haystack);
        } catch {
          return false;
        }
      default:
        return false;
    }
  });
}

export function evaluate(condition: Condition, message: StoredMessage): boolean {
  switch (condition.op) {
    case "and":
      return condition.rules.every((rule) => evaluate(rule, message));
    case "or":
      return condition.rules.some((rule) => evaluate(rule, message));
    case "not":
      return !evaluate(condition.rule, message);
    default:
      return testField(message, condition as FieldCondition);
  }
}

export function parseCondition(json: string): Condition {
  const parsed: unknown = JSON.parse(json);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Rule condition must be a JSON object.");
  }

  return parsed as Condition;
}

export function stringifyCondition(condition: Condition): string {
  return JSON.stringify(condition);
}