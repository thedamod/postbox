import type { EmailStorage } from "../storage";
import { evaluate, type Condition } from "./evaluator";

export type TagRule = {
  id: number;
  accountId: number;
  name: string;
  condition: Condition;
  tagId: number;
  enabled: boolean;
  createdAt: string;
};

export type TagRuleService = {
  readonly storage: EmailStorage;

  list(accountId: number): TagRule[];
  get(id: number): TagRule;
  create(input: {
    accountId: number;
    name: string;
    condition: Condition;
    tagId: number;
    enabled?: boolean;
  }): TagRule;
  update(
    id: number,
    patch: {
      name?: string;
      condition?: Condition;
      tagId?: number;
      enabled?: boolean;
    },
  ): TagRule;
  remove(id: number): void;
  /** Evaluate a rule against a stored message. */
  test(ruleId: number, messageId: number): boolean;
};

export function createTagRuleService(storage: EmailStorage): TagRuleService {
  function get(id: number): TagRule {
    const rule = storage.getTagRule(id);
    if (!rule) throw new Error(`Tag rule "${id}" does not exist.`);
    return rule;
  }

  return {
    storage,
    list: (accountId) => storage.listTagRules(accountId),
    get,
    create: (input) => storage.createTagRule(input),
    update: (id, patch) => storage.updateTagRule(id, patch),
    remove: (id) => storage.removeTagRule(id),
    test: (ruleId, messageId) => {
      const rule = get(ruleId);
      const message = storage.getMessage(messageId);
      if (!message) throw new Error(`Message "${messageId}" does not exist.`);
      return evaluate(rule.condition, message);
    },
  };
}