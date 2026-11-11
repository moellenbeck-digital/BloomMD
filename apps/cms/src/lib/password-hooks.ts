import { ValidationError } from "payload";
import type { CollectionBeforeOperationHook, CollectionBeforeValidateHook, CollectionConfig } from "payload";
import { passwordRuleError } from "./password-rule";

function reject(message: string): never {
  throw new ValidationError({ errors: [{ message, path: "password" }] });
}

/**
 * The password rule as hooks, for every auth collection:
 * - `beforeValidate` covers create and update;
 * - `beforeOperation` covers `resetPassword`, which skips `beforeValidate` (spike deviation 8).
 */
export function passwordHooks(): NonNullable<CollectionConfig["hooks"]> {
  const beforeValidate: CollectionBeforeValidateHook = ({ data }) => {
    const password = (data as { password?: unknown } | undefined)?.password;
    if (typeof password === "string") {
      const error = passwordRuleError(password);
      if (error) reject(error);
    }
    return data;
  };
  const beforeOperation: CollectionBeforeOperationHook = ({ args, operation }) => {
    if (operation === "resetPassword") {
      const password = (args as { data?: { password?: unknown } }).data?.password;
      const error = typeof password === "string" ? passwordRuleError(password) : "Das Passwort fehlt.";
      if (error) reject(error);
    }
    return args;
  };
  return { beforeOperation: [beforeOperation], beforeValidate: [beforeValidate] };
}
