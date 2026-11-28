import { setTimeout as sleep } from "node:timers/promises";
import { compose } from "./stack";

/**
 * Index everything now instead of waiting for the minute job. The job and the command share a
 * lock, so while the job is writing the command refuses; only that refusal is retried.
 */
export async function rebuildSuggestions(): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      compose(["exec", "-T", "api", "python", "manage.py", "rebuild_suggestions"], 120_000);
      return;
    } catch (error) {
      const stderr = String((error as { stderr?: unknown }).stderr ?? "");
      if (!stderr.includes("already running") || Date.now() > deadline) {
        throw new Error(
          "rebuild_suggestions failed. These specs need Elasticsearch: put " +
            "COMPOSE_PROFILES=search in .env and ELASTICSEARCH_URL in env/django.env " +
            `(docs/runbook.md, "Search suggestions").\n${stderr || String(error)}`,
        );
      }
      await sleep(2_000);
    }
  }
}

export function stopElasticsearch(): void {
  compose(["stop", "elasticsearch"], 60_000);
}

/** Start it again and wait until it is healthy. Does nothing to a healthy one. */
export function startElasticsearch(): void {
  compose(["up", "-d", "--no-deps", "--wait", "--wait-timeout", "180", "elasticsearch"], 200_000);
}
