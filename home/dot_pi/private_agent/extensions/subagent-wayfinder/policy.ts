import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const WAYFINDER_BINDING_NAMESPACE = "tlipoca9.wayfinder/1";
export const WAYFINDER_EXTENSION_ACK_ID = "tlipoca9.subagent-wayfinder";
export const LONG_RUNNING_THRESHOLD_MS = 10 * 60 * 1000;

export type Tracker = "local" | "github" | "gongfeng";

type Primitive = string | number | boolean | null;

type Token = {
  kind: "identifier" | "string" | "number" | "punct";
  value: string | number;
  start: number;
  end: number;
  dynamic?: boolean;
};

type ParsedObject = {
  start: number;
  end: number;
  endToken: number;
  properties: Map<string, Primitive | undefined>;
  errors: string[];
};

export type WorkflowLane = {
  key: string;
  agent?: string;
  cwd?: string;
  timeoutMs?: number;
  maxRuntimeMs?: number;
  worktree?: boolean;
  resume: boolean;
  hasExtensionBindings: boolean;
  objectStart: number;
  objectEnd: number;
};

export type WorkflowInspection = {
  lanes: WorkflowLane[];
  errors: string[];
};

export type RepositoryIdentity = {
  root: string;
  tracker: Tracker;
  remote?: string;
  projectPath?: string;
};

export type ArtifactReference = {
  name: string;
  ref: string;
};

export type TicketReference = ArtifactReference & {
  key: string;
};

export type TrackedWayfinderBinding = {
  mode: "tracked";
  tracker: Tracker;
  map: ArtifactReference;
  tickets: TicketReference[];
};

export type ExemptWayfinderBinding = {
  mode: "exempt";
  reason: "one-shot-read-only";
};

export type WayfinderBinding = TrackedWayfinderBinding | ExemptWayfinderBinding;

export type ChildTrackedWayfinderBinding = {
  mode: "tracked";
  tracker: Tracker;
  map: ArtifactReference;
  ticket: TicketReference;
};

export type GateInput = {
  inspection: WorkflowInspection;
  repositories: RepositoryIdentity[];
  extensionBindings: unknown;
  topLevelTimeoutMs?: number;
  topLevelMaxRuntimeMs?: number;
  topLevelWorktree?: boolean;
  verifiedRemoteRefs?: string[];
};

export type GateResult =
  | { ok: true; binding: WayfinderBinding }
  | { ok: false; reason: string };

const SUPPORTED_AGENTS = new Set([
  "worker",
  "developer",
  "coder",
  "implementer",
  "develop",
  "reviewer",
  "scout",
  "researcher",
  "delegate",
  "oracle",
  "advisor",
]);
const EXEMPT_AGENTS = new Set(["reviewer", "oracle", "advisor"]);

function identifierEscape(
  script: string,
  index: number,
): { value: string; end: number } | undefined {
  if (script[index] !== "\\" || script[index + 1] !== "u") return undefined;
  if (script[index + 2] === "{") {
    const close = script.indexOf("}", index + 3);
    if (close === -1) return undefined;
    const hex = script.slice(index + 3, close);
    if (!/^[0-9A-Fa-f]{1,6}$/.test(hex)) return undefined;
    const codePoint = Number.parseInt(hex, 16);
    if (codePoint > 0x10ffff) return undefined;
    return { value: String.fromCodePoint(codePoint), end: close + 1 };
  }
  const hex = script.slice(index + 2, index + 6);
  return /^[0-9A-Fa-f]{4}$/.test(hex)
    ? { value: String.fromCodePoint(Number.parseInt(hex, 16)), end: index + 6 }
    : undefined;
}

function tokenize(script: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < script.length) {
    const char = script[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (script.startsWith("//", index)) {
      const end = script.indexOf("\n", index + 2);
      index = end === -1 ? script.length : end + 1;
      continue;
    }
    if (script.startsWith("/*", index)) {
      const end = script.indexOf("*/", index + 2);
      index = end === -1 ? script.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      const start = index;
      const quote = char;
      let value = "";
      let dynamic = false;
      index += 1;
      while (index < script.length) {
        const current = script[index]!;
        if (current === "\\") {
          const escaped = script[index + 1];
          if (escaped === undefined) {
            index += 1;
            break;
          }
          const escapes: Record<string, string> = {
            n: "\n",
            r: "\r",
            t: "\t",
            b: "\b",
            f: "\f",
            v: "\v",
            "0": "\0",
          };
          value += escapes[escaped] ?? escaped;
          index += 2;
          continue;
        }
        if (quote === "`" && script.startsWith("${", index)) dynamic = true;
        if (current === quote) {
          index += 1;
          break;
        }
        value += current;
        index += 1;
      }
      tokens.push({ kind: "string", value, start, end: index, dynamic });
      continue;
    }
    if (/[A-Za-z_$]/.test(char) || identifierEscape(script, index)) {
      const start = index;
      let value = "";
      while (index < script.length) {
        const escaped = identifierEscape(script, index);
        if (escaped) {
          value += escaped.value;
          index = escaped.end;
          continue;
        }
        const current = script[index]!;
        if (!/[A-Za-z0-9_$]/.test(current)) break;
        value += current;
        index += 1;
      }
      tokens.push({ kind: "identifier", value, start, end: index });
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      index += 1;
      while (index < script.length && /[0-9.]/.test(script[index]!)) index += 1;
      tokens.push({
        kind: "number",
        value: Number(script.slice(start, index)),
        start,
        end: index,
      });
      continue;
    }
    tokens.push({ kind: "punct", value: char, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
}

function tokenIs(token: Token | undefined, value: string): boolean {
  return token?.value === value;
}

function primitiveValue(token: Token | undefined): Primitive | undefined {
  if (!token || token.dynamic) return undefined;
  if (token.kind === "string" || token.kind === "number") return token.value;
  if (token.kind === "identifier") {
    if (token.value === "true") return true;
    if (token.value === "false") return false;
    if (token.value === "null") return null;
  }
  return undefined;
}

function matchingToken(
  tokens: Token[],
  start: number,
  open: string,
  close: string,
): number | undefined {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokenIs(tokens[index], open)) depth += 1;
    else if (tokenIs(tokens[index], close)) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function parseObject(tokens: Token[], start: number): ParsedObject | undefined {
  if (!tokenIs(tokens[start], "{")) return undefined;
  const endToken = matchingToken(tokens, start, "{", "}");
  if (endToken === undefined) return undefined;
  const properties = new Map<string, Primitive | undefined>();
  const errors: string[] = [];
  let index = start + 1;
  while (index < endToken) {
    if (tokenIs(tokens[index], ",")) {
      index += 1;
      continue;
    }
    if (
      tokenIs(tokens[index], ".") &&
      tokenIs(tokens[index + 1], ".") &&
      tokenIs(tokens[index + 2], ".")
    ) {
      errors.push("Object spread properties are forbidden.");
      index += 3;
      continue;
    }
    const keyToken = tokens[index];
    if (
      !keyToken ||
      (keyToken.kind !== "identifier" && keyToken.kind !== "string")
    ) {
      errors.push("Computed and non-literal object properties are forbidden.");
      index += 1;
      continue;
    }
    const key = String(keyToken.value);
    if (!tokenIs(tokens[index + 1], ":")) {
      errors.push(`Object property '${key}' must use explicit key: value syntax.`);
      index += 1;
      continue;
    }
    if (properties.has(key)) errors.push(`Object property '${key}' is duplicated.`);
    const valueStart = index + 2;
    const value = primitiveValue(tokens[valueStart]);
    const next = tokens[valueStart + 1];
    properties.set(
      key,
      value !== undefined && (tokenIs(next, ",") || tokenIs(next, "}"))
        ? value
        : undefined,
    );
    index = valueStart;
    let round = 0;
    let square = 0;
    let curly = 0;
    while (index < endToken) {
      const token = tokens[index];
      if (tokenIs(token, "(")) round += 1;
      else if (tokenIs(token, ")")) round -= 1;
      else if (tokenIs(token, "[")) square += 1;
      else if (tokenIs(token, "]")) square -= 1;
      else if (tokenIs(token, "{")) curly += 1;
      else if (tokenIs(token, "}")) {
        if (curly === 0 && round === 0 && square === 0) break;
        curly -= 1;
      } else if (
        tokenIs(token, ",") &&
        round === 0 &&
        square === 0 &&
        curly === 0
      ) {
        break;
      }
      index += 1;
    }
    if (tokenIs(tokens[index], ",")) index += 1;
  }
  return {
    start: tokens[start]!.start,
    end: tokens[endToken]!.end,
    endToken,
    properties,
    errors,
  };
}

function stringProperty(
  object: ParsedObject,
  name: string,
): string | undefined {
  const value = object.properties.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberProperty(
  object: ParsedObject,
  name: string,
): number | undefined {
  const value = object.properties.get(name);
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanProperty(
  object: ParsedObject,
  name: string,
): boolean | undefined {
  const value = object.properties.get(name);
  return typeof value === "boolean" ? value : undefined;
}

function laneFromObject(
  object: ParsedObject,
  keyOverride?: string,
): WorkflowLane | undefined {
  const key = keyOverride ?? stringProperty(object, "key");
  if (!key) return undefined;
  return {
    key,
    agent: stringProperty(object, "agent"),
    cwd: stringProperty(object, "cwd"),
    timeoutMs: numberProperty(object, "timeoutMs"),
    maxRuntimeMs: numberProperty(object, "maxRuntimeMs"),
    worktree: booleanProperty(object, "worktree"),
    resume: object.properties.has("resume"),
    hasExtensionBindings: object.properties.has("extensionBindings"),
    objectStart: object.start,
    objectEnd: object.end - 1,
  };
}

function laneLiteralErrors(object: ParsedObject, key: string): string[] {
  const errors = object.errors.map((error) => `Workflow child '${key}': ${error}`);
  const expected: Array<[string, Primitive | undefined]> = [
    ["agent", stringProperty(object, "agent")],
    ["cwd", stringProperty(object, "cwd")],
    ["timeoutMs", numberProperty(object, "timeoutMs")],
    ["maxRuntimeMs", numberProperty(object, "maxRuntimeMs")],
    ["worktree", booleanProperty(object, "worktree")],
  ];
  for (const [field, value] of expected) {
    if (object.properties.has(field) && value === undefined) {
      errors.push(`Workflow child '${key}' must use a literal ${field} value.`);
    }
  }
  return errors;
}

export function inspectWorkflowScript(script: string): WorkflowInspection {
  const tokens = tokenize(script);
  const lanes: WorkflowLane[] = [];
  const errors: string[] = [];
  const nonLaunchMethods = new Set(["steer", "status", "ref"]);
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokenIs(tokens[index], "eval")) {
      errors.push(
        "workflowScript must not use eval because it can hide unbound child launches.",
      );
      continue;
    }
    if (!tokenIs(tokens[index], "runs")) continue;
    if (
      !tokenIs(tokens[index + 1], ".") ||
      tokens[index + 2]?.kind !== "identifier" ||
      !tokenIs(tokens[index + 3], "(")
    ) {
      errors.push(
        "Every runs access must be a direct supported method call; aliases, bracket access, and dynamic dispatch are forbidden.",
      );
      continue;
    }
    const method = tokens[index + 2]!.value;
    if (nonLaunchMethods.has(String(method))) continue;
    if (method === "run") {
      const keyToken = tokens[index + 4];
      const key =
        keyToken?.kind === "string" && !keyToken.dynamic
          ? String(keyToken.value)
          : undefined;
      if (!key || !tokenIs(tokens[index + 5], ",")) {
        errors.push(
          "Every runs.run call must use a literal stable key and an inline object.",
        );
        continue;
      }
      const object = parseObject(tokens, index + 6);
      const lane = object ? laneFromObject(object, key) : undefined;
      if (lane && object) {
        lanes.push(lane);
        errors.push(...laneLiteralErrors(object, key));
      } else errors.push(`Workflow child '${key}' must use an inline object.`);
    } else if (method === "all") {
      if (!tokenIs(tokens[index + 4], "[")) {
        errors.push(
          "runs.all must use an inline array of child objects with literal stable keys.",
        );
        continue;
      }
      const arrayEnd = matchingToken(tokens, index + 4, "[", "]");
      if (arrayEnd === undefined) {
        errors.push("runs.all has an unterminated child array.");
        continue;
      }
      let childIndex = index + 5;
      while (childIndex < arrayEnd) {
        if (tokenIs(tokens[childIndex], ",")) {
          childIndex += 1;
          continue;
        }
        const object = parseObject(tokens, childIndex);
        const lane = object ? laneFromObject(object) : undefined;
        if (!object || !lane) {
          errors.push(
            "Every runs.all child must be an inline object with a literal key.",
          );
          break;
        }
        lanes.push(lane);
        errors.push(...laneLiteralErrors(object, lane.key));
        childIndex = object.endToken + 1;
      }
    } else {
      errors.push(`Unsupported runs method '${String(method)}'.`);
    }
  }
  if (lanes.length === 0 && errors.length === 0) {
    errors.push(
      "workflowScript must contain at least one literal runs.run or runs.all child.",
    );
  }
  const seen = new Set<string>();
  for (const lane of lanes) {
    if (seen.has(lane.key))
      errors.push(`Workflow child key '${lane.key}' is duplicated.`);
    seen.add(lane.key);
    if (!lane.agent && !lane.resume)
      errors.push(
        `Workflow child '${lane.key}' must name a literal builtin agent.`,
      );
    if (lane.resume)
      errors.push(
        `Workflow child '${lane.key}' is a retained resume; use top-level action='resume' outside the initial gate.`,
      );
    if (lane.hasExtensionBindings)
      errors.push(
        `Workflow child '${lane.key}' must not declare extensionBindings; the Wayfinder gate injects it.`,
      );
  }
  return { lanes, errors: [...new Set(errors)] };
}

function parseRemote(remote: string): { host?: string; projectPath?: string } {
  const trimmed = remote.trim();
  const scp = trimmed.match(/^[^@\s]+@([^:\s]+):(.+)$/);
  if (scp) {
    return {
      host: scp[1]!.toLowerCase(),
      projectPath: normalizeProjectPath(scp[2]!),
    };
  }
  try {
    const url = new URL(trimmed);
    return {
      host: url.hostname.toLowerCase(),
      projectPath: normalizeProjectPath(url.pathname),
    };
  } catch {
    return {};
  }
}

function normalizeProjectPath(value: string): string {
  return value.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
}

export function repositoryIdentity(
  root: string,
  remote?: string,
): RepositoryIdentity {
  if (!remote?.trim()) return { root: resolve(root), tracker: "local" };
  const parsed = parseRemote(remote);
  if (parsed.host === "github.com" && parsed.projectPath) {
    const segments = parsed.projectPath.split("/").filter(Boolean);
    const projectPath = segments.slice(0, 2).join("/");
    if (segments.length >= 2)
      return { root: resolve(root), tracker: "github", remote, projectPath };
  }
  if (parsed.host === "git.woa.com" && parsed.projectPath) {
    return {
      root: resolve(root),
      tracker: "gongfeng",
      remote,
      projectPath: parsed.projectPath,
    };
  }
  return { root: resolve(root), tracker: "local", remote };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function artifactReference(value: unknown): ArtifactReference | undefined {
  const object = record(value);
  if (!object || !exactKeys(object, ["name", "ref"])) return undefined;
  const name = typeof object.name === "string" ? object.name.trim() : "";
  const ref = typeof object.ref === "string" ? object.ref.trim() : "";
  return name && ref ? { name, ref } : undefined;
}

function ticketReference(value: unknown): TicketReference | undefined {
  const object = record(value);
  if (!object || !exactKeys(object, ["key", "name", "ref"])) return undefined;
  const artifact = artifactReference({ name: object.name, ref: object.ref });
  const key = typeof object.key === "string" ? object.key.trim() : "";
  return artifact && key ? { key, ...artifact } : undefined;
}

export function parseWayfinderBinding(
  extensionBindings: unknown,
): WayfinderBinding | undefined {
  const bindings = record(extensionBindings);
  const object = bindings
    ? record(bindings[WAYFINDER_BINDING_NAMESPACE])
    : undefined;
  if (!object) return undefined;
  if (object.mode === "exempt") {
    return exactKeys(object, ["mode", "reason"]) &&
      object.reason === "one-shot-read-only"
      ? { mode: "exempt", reason: "one-shot-read-only" }
      : undefined;
  }
  if (
    object.mode !== "tracked" ||
    !exactKeys(object, ["mode", "tracker", "map", "tickets"])
  )
    return undefined;
  if (
    object.tracker !== "local" &&
    object.tracker !== "github" &&
    object.tracker !== "gongfeng"
  )
    return undefined;
  const map = artifactReference(object.map);
  if (!map || !Array.isArray(object.tickets)) return undefined;
  const tickets = object.tickets.map(ticketReference);
  if (tickets.some((ticket) => ticket === undefined)) return undefined;
  return {
    mode: "tracked",
    tracker: object.tracker,
    map,
    tickets: tickets as TicketReference[],
  };
}

function explicitLongRunning(input: GateInput): boolean {
  const values = [
    input.topLevelTimeoutMs,
    input.topLevelMaxRuntimeMs,
    ...input.inspection.lanes.flatMap((lane) => [
      lane.timeoutMs,
      lane.maxRuntimeMs,
    ]),
  ];
  return values.some(
    (value) => typeof value === "number" && value >= LONG_RUNNING_THRESHOLD_MS,
  );
}

function pathEscapes(root: string, target: string): boolean {
  const rel = relative(root, target);
  return (
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  );
}

function validateLocalReference(root: string, ref: string): string | undefined {
  if (isAbsolute(ref))
    return "Local Wayfinder refs must be repository-relative paths.";
  const target = resolve(root, ref);
  if (pathEscapes(root, target))
    return `Local Wayfinder ref '${ref}' escapes the repository root.`;
  if (!existsSync(target) || !lstatSync(target).isFile())
    return `Local Wayfinder ref '${ref}' does not exist as a regular file.`;
  if (pathEscapes(realpathSync(root), realpathSync(target)))
    return `Local Wayfinder ref '${ref}' resolves outside the repository root.`;
  return undefined;
}

function validateRemoteReference(
  repository: RepositoryIdentity,
  ref: string,
): string | undefined {
  let url: URL;
  try {
    url = new URL(ref);
  } catch {
    return `Wayfinder ref '${ref}' must be an absolute issue URL.`;
  }
  const expectedHost =
    repository.tracker === "github" ? "github.com" : "git.woa.com";
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== expectedHost
  ) {
    return `Wayfinder ref '${ref}' must use https://${expectedHost}.`;
  }
  const project = repository.projectPath;
  const pathname = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
  if (!project || !pathname.startsWith(`${project}/`)) {
    return `Wayfinder ref '${ref}' does not belong to repository '${project ?? "unknown"}'.`;
  }
  const suffix = pathname.slice(project.length);
  if (!/(?:^|\/)issues\/\d+(?:$|\/)/.test(suffix)) {
    return `Wayfinder ref '${ref}' is not an issue URL.`;
  }
  return undefined;
}

function validateReference(
  repository: RepositoryIdentity,
  ref: string,
): string | undefined {
  return repository.tracker === "local"
    ? validateLocalReference(repository.root, ref)
    : validateRemoteReference(repository, ref);
}

function canonicalReference(repository: RepositoryIdentity, ref: string): string {
  if (repository.tracker === "local") {
    return realpathSync(resolve(repository.root, ref));
  }
  try {
    const url = new URL(ref);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return ref;
  }
}

export function validateWayfinderGate(input: GateInput): GateResult {
  if (input.inspection.errors.length > 0)
    return { ok: false, reason: input.inspection.errors.join(" ") };
  const { lanes } = input.inspection;
  if (input.repositories.length !== lanes.length) {
    return {
      ok: false,
      reason:
        "The Wayfinder gate could not resolve one repository per workflow child.",
    };
  }
  for (const lane of lanes) {
    if (!lane.agent || !SUPPORTED_AGENTS.has(lane.agent)) {
      return {
        ok: false,
        reason: `Workflow child '${lane.key}' uses unsupported agent '${lane.agent ?? "dynamic"}'. Use a supported builtin so the clarification extension is guaranteed to load.`,
      };
    }
  }
  const binding = parseWayfinderBinding(input.extensionBindings);
  if (!binding) {
    return {
      ok: false,
      reason: `Missing or invalid extensionBindings['${WAYFINDER_BINDING_NAMESPACE}']. Create or attach the Wayfinder map and child tickets first.`,
    };
  }
  const mustTrack =
    lanes.length > 1 ||
    lanes.some((lane) => !lane.agent || !EXEMPT_AGENTS.has(lane.agent)) ||
    input.topLevelWorktree === true ||
    lanes.some((lane) => lane.worktree === true) ||
    explicitLongRunning(input);
  if (binding.mode === "exempt") {
    if (mustTrack) {
      return {
        ok: false,
        reason:
          "one-shot-read-only exemption is limited to one reviewer/oracle child without worktree or an explicit runtime of 10 minutes or more.",
      };
    }
    return { ok: true, binding };
  }
  const roots = new Set(
    input.repositories.map((repository) => repository.root),
  );
  if (roots.size !== 1)
    return {
      ok: false,
      reason:
        "A tracked workflow cannot span repositories; split it into one Wayfinder map per repository.",
    };
  const trackers = new Set(
    input.repositories.map((repository) => repository.tracker),
  );
  if (trackers.size !== 1 || !trackers.has(binding.tracker)) {
    const actual = [...trackers].join(", ") || "unknown";
    return {
      ok: false,
      reason: `Wayfinder tracker '${binding.tracker}' does not match the workflow repository tracker '${actual}'.`,
    };
  }
  const usesWorktree =
    input.topLevelWorktree === true ||
    lanes.some((lane) => lane.worktree === true);
  if (binding.tracker === "local" && usesWorktree) {
    return {
      ok: false,
      reason:
        "Local Wayfinder refs are worktree-local and cannot provide one canonical shared pitfall log. Use GitHub/Gongfeng tracking or run without worktree isolation.",
    };
  }
  if (binding.tickets.length !== lanes.length) {
    return {
      ok: false,
      reason: `Wayfinder binding has ${binding.tickets.length} tickets for ${lanes.length} workflow children.`,
    };
  }
  for (let index = 0; index < lanes.length; index += 1) {
    if (binding.tickets[index]!.key !== lanes[index]!.key) {
      return {
        ok: false,
        reason: `Wayfinder ticket ${index + 1} must use child key '${lanes[index]!.key}', not '${binding.tickets[index]!.key}'.`,
      };
    }
  }
  const refs = [
    binding.map.ref,
    ...binding.tickets.map((ticket) => ticket.ref),
  ];
  const repository = input.repositories[0]!;
  const verifiedRemoteRefs = new Set(input.verifiedRemoteRefs ?? []);
  const canonicalRefs: string[] = [];
  for (const ref of refs) {
    const error = validateReference(repository, ref);
    if (error) return { ok: false, reason: error };
    if (repository.tracker !== "local" && !verifiedRemoteRefs.has(ref)) {
      return {
        ok: false,
        reason: `Remote Wayfinder ref '${ref}' was not read successfully through the '${repository.tracker}' tracker.`,
      };
    }
    canonicalRefs.push(canonicalReference(repository, ref));
  }
  if (new Set(canonicalRefs).size !== canonicalRefs.length) {
    return {
      ok: false,
      reason:
        "The map and every child ticket must resolve to distinct artifacts.",
    };
  }
  return { ok: true, binding };
}

export function injectChildBindings(
  script: string,
  inspection: WorkflowInspection,
  binding: WayfinderBinding,
): string {
  const insertions = inspection.lanes
    .map((lane, index) => {
      const childBinding:
        | ExemptWayfinderBinding
        | ChildTrackedWayfinderBinding =
        binding.mode === "tracked"
          ? {
              mode: "tracked",
              tracker: binding.tracker,
              map: binding.map,
              ticket: binding.tickets[index]!,
            }
          : binding;
      const payload = JSON.stringify({
        [WAYFINDER_BINDING_NAMESPACE]: childBinding,
      });
      const body = script.slice(lane.objectStart + 1, lane.objectEnd).trimEnd();
      const separator = !body || body.endsWith(",") ? " " : ", ";
      return {
        position: lane.objectEnd,
        text: `${separator}extensionBindings: ${payload}`,
      };
    })
    .sort((left, right) => right.position - left.position);
  let output = script;
  for (const insertion of insertions) {
    output = `${output.slice(0, insertion.position)}${insertion.text}${output.slice(insertion.position)}`;
  }
  return output;
}

export function parseChildBinding(
  raw: string | undefined,
): ExemptWayfinderBinding | ChildTrackedWayfinderBinding | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const bindings = record(JSON.parse(raw));
    const object = bindings
      ? record(bindings[WAYFINDER_BINDING_NAMESPACE])
      : undefined;
    if (!object) return undefined;
    if (object.mode === "exempt" && object.reason === "one-shot-read-only") {
      return { mode: "exempt", reason: "one-shot-read-only" };
    }
    if (
      object.mode !== "tracked" ||
      (object.tracker !== "local" &&
        object.tracker !== "github" &&
        object.tracker !== "gongfeng")
    )
      return undefined;
    const map = artifactReference(object.map);
    const ticket = ticketReference(object.ticket);
    return map && ticket
      ? { mode: "tracked", tracker: object.tracker, map, ticket }
      : undefined;
  } catch {
    return undefined;
  }
}

export function childPolicyPrompt(
  binding: ExemptWayfinderBinding | ChildTrackedWayfinderBinding,
): string {
  if (binding.mode === "exempt") {
    return "## Wayfinder child contract\n\nThis is an approved one-shot read-only Wayfinder exemption. Do not mutate project or source files.";
  }
  const scope = `Wayfinder map: ${binding.map.name} (${binding.map.ref})\nYour ticket: ${binding.ticket.name} [${binding.ticket.key}] (${binding.ticket.ref})\nWork only within this ticket's question and approved boundaries.`;
  return `## Wayfinder child contract\n\n${scope}\n\nBefore running commands or diagnosing, read the map and all map comments headed "WAYFINDER PITFALL". Apply relevant entries. At the first unexpected failure, search those entries again by symptom and component before trying another fix. Do not write the shared pitfall log directly. Send every new reusable resolved or unresolved obstacle to contact_supervisor with reason "pitfall_report" and a complete Ticket, Scope, Symptom, Cause, Resolution, Verification, and Status entry; redact secrets. The supervisor rechecks the latest log, deduplicates by normalized Scope + Symptom + Cause, writes at most one entry, and replies with the new or reused entry reference. Wait for that acknowledgement before completion. Disclose every pitfall recorded, reused, or unresolved in the ticket resolution and final response, or state "Pitfalls: None".\n\nBefore escalating ambiguity, inspect the ticket/map context and relevant repository evidence. If a material ambiguity still affects scope, behavior, architecture, authority, or acceptance, call contact_supervisor with reason "interview_request". Ask exactly one focused question in that request and wait for the reply. After the reply, continue this ticket; if a separate ambiguity appears later, send a new one-question request. Never bundle questions or guess through an unresolved decision.`;
}
