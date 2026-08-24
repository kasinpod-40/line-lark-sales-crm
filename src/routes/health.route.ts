import type { Env } from "../config/env";
import { validateDeploymentConfig } from "../config/validation";
import { jsonResponse } from "../utils/response";

export function handleHealth(env: Env): Response {
  const readiness = validateDeploymentConfig(env);
  return jsonResponse({
    ok: readiness.ready,
    service: "line-lark-sales-crm",
    version: "0.3.0",
    readiness: readiness.checks,
    configuration: {
      ready: readiness.ready,
      errors: readiness.errors.map(({ code, key, message }) => ({ code, key, message })),
      warnings: readiness.warnings.map(({ code, key, message }) => ({ code, key, message })),
    },
    timestamp: new Date().toISOString(),
  }, readiness.ready ? 200 : 503);
}
