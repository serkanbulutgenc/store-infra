import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Root of the store-infra checkout (where the compose files live). */
export const STACK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const COMPOSE_FILES = (process.env.E2E_COMPOSE_FILES ?? "compose.yaml,compose.dev.yaml").split(",");

function compose(args: string[]): string {
  const files = COMPOSE_FILES.flatMap((f) => ["-f", f]);
  return execFileSync("docker", ["compose", ...files, ...args], {
    cwd: STACK_DIR,
    encoding: "utf8",
    timeout: 30_000,
  });
}

/** Run a command inside a running service container and return its stdout. */
export function execInService(service: string, command: string[]): string {
  return compose(["exec", "-T", service, ...command]);
}

/**
 * GET a URL from inside the Compose network, using the api container's Python
 * (no curl in the image). Used for endpoints Caddy does not publish.
 * Returns the status code and body, including for 4xx/5xx responses.
 */
export function getFromApiContainer(url: string): { status: number; body: string } {
  const script = [
    "import json, urllib.request as u, urllib.error as e",
    "try:",
    "    r = u.urlopen(" + JSON.stringify(url) + ", timeout=5); out = {'status': r.status, 'body': r.read().decode()}",
    "except e.HTTPError as x:",
    "    out = {'status': x.code, 'body': x.read().decode()}",
    "print(json.dumps(out))",
  ].join("\n");
  return JSON.parse(execInService("api", ["python", "-c", script]).trim());
}
