/// <reference path="./node-shim.d.ts" />

import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const WAYFINDER_REVIEWER_AGENT = "wayfinder-reviewer";

export type Tracker = "local" | "github" | "gongfeng" | "tapd_mini";

export type RepositoryIdentity = {
  root: string;
  tracker: Tracker;
  remote?: string;
  projectPath?: string;
  workspaceId?: string;
  configurationError?: string;
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

export type TaskLane = {
  key: string;
  agent: string;
  isolated: boolean;
  index: number;
};

export type TaskInspection = {
  form: "batch" | "flat";
  lanes: TaskLane[];
  errors: string[];
};

export type GateResult =
  | { ok: true; binding: WayfinderBinding }
  | { ok: false; reason: string };

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function exactKeys(value: RecordValue, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function artifactReference(value: unknown): ArtifactReference | undefined {
  const object = record(value);
  if (!object || !exactKeys(object, ["name", "ref"])) return undefined;
  const name = nonEmptyString(object.name);
  const ref = nonEmptyString(object.ref);
  return name && ref ? { name, ref } : undefined;
}

function ticketReference(value: unknown): TicketReference | undefined {
  const object = record(value);
  if (!object || !exactKeys(object, ["key", "name", "ref"])) return undefined;
  const key = nonEmptyString(object.key);
  const artifact = artifactReference({ name: object.name, ref: object.ref });
  return key && artifact ? { key, ...artifact } : undefined;
}

export function parseWayfinderBinding(
  value: unknown,
): WayfinderBinding | undefined {
  const object = record(value);
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
  ) {
    return undefined;
  }
  if (
    object.tracker !== "local" &&
    object.tracker !== "github" &&
    object.tracker !== "gongfeng" &&
    object.tracker !== "tapd_mini"
  ) {
    return undefined;
  }
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

function lane(value: unknown, index: number): TaskLane | undefined {
  const object = record(value);
  if (!object) return undefined;
  const key = nonEmptyString(object.name);
  if (!key) return undefined;
  return {
    key,
    agent: nonEmptyString(object.agent) ?? "task",
    isolated: object.isolated === true,
    index,
  };
}

export function inspectTaskInput(input: unknown): TaskInspection {
  const object = record(input);
  if (!object) {
    return {
      form: "flat",
      lanes: [],
      errors: ["Task input must be an object."],
    };
  }

  const errors: string[] = [];
  let form: "batch" | "flat";
  let lanes: TaskLane[];
  if (Array.isArray(object.tasks)) {
    form = "batch";
    lanes = object.tasks.flatMap((item, index) => {
      const parsed = lane(item, index);
      if (!parsed) {
        errors.push(
          `Task item ${index + 1} must have an explicit non-empty name.`,
        );
        return [];
      }
      return [parsed];
    });
    if (object.tasks.length === 0) errors.push("Task batch must not be empty.");
  } else {
    form = "flat";
    const parsed = lane(object, 0);
    lanes = parsed ? [parsed] : [];
    if (!parsed) errors.push("Flat task must have an explicit non-empty name.");
  }

  const seen = new Set<string>();
  for (const item of lanes) {
    const normalized = item.key.toLowerCase();
    if (seen.has(normalized)) {
      errors.push(`Task name '${item.key}' is duplicated case-insensitively.`);
    }
    seen.add(normalized);
  }
  return { form, lanes, errors: [...new Set(errors)] };
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
    if (segments.length >= 2) {
      return {
        root: resolve(root),
        tracker: "github",
        remote,
        projectPath: segments.slice(0, 2).join("/"),
      };
    }
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

function unquoteFrontmatterValue(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function applyIssueTrackerDocument(
  identity: RepositoryIdentity,
  contents: string,
): RepositoryIdentity {
  const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) return identity;

  const values = new Map<string, string>();
  for (const line of frontmatter[1]!.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf(":");
    if (separator < 1) {
      return {
        ...identity,
        configurationError:
          "docs/agents/issue-tracker.md has invalid YAML frontmatter.",
      };
    }
    const key = trimmed.slice(0, separator).trim();
    if (values.has(key)) {
      return {
        ...identity,
        configurationError: `docs/agents/issue-tracker.md repeats '${key}'.`,
      };
    }
    values.set(key, unquoteFrontmatterValue(trimmed.slice(separator + 1)));
  }

  const tracker = values.get("tracker");
  if (!tracker) return identity;
  if (tracker !== "tapd_mini") {
    return {
      ...identity,
      configurationError: `docs/agents/issue-tracker.md cannot override the origin-derived tracker with '${tracker}'.`,
    };
  }
  const workspaceId = values.get("workspace_id");
  if (!workspaceId || !/^\d+$/.test(workspaceId)) {
    return {
      ...identity,
      configurationError:
        "tapd_mini requires a numeric workspace_id in docs/agents/issue-tracker.md frontmatter.",
    };
  }
  return { ...identity, tracker: "tapd_mini", workspaceId };
}

function pathEscapes(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path === ".." ||
    path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(path)
  );
}

function validateLocalReference(root: string, ref: string): string | undefined {
  if (isAbsolute(ref))
    return "Local Wayfinder refs must be repository-relative paths.";
  const target = resolve(root, ref);
  if (pathEscapes(root, target)) {
    return `Local Wayfinder ref '${ref}' escapes the repository root.`;
  }
  if (!existsSync(target) || !lstatSync(target).isFile()) {
    return `Local Wayfinder ref '${ref}' does not exist as a regular file.`;
  }
  if (pathEscapes(realpathSync(root), realpathSync(target))) {
    return `Local Wayfinder ref '${ref}' resolves outside the repository root.`;
  }
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
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
  } catch {
    return `Wayfinder ref '${ref}' has invalid URL path encoding.`;
  }
  if (repository.tracker === "tapd_mini") {
    const workspaceId = repository.workspaceId;
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "tapd.woa.com"
    ) {
      return `Wayfinder ref '${ref}' must use https://tapd.woa.com.`;
    }
    if (!workspaceId || pathname !== `tapd_fe/t/index/${workspaceId}`) {
      return `Wayfinder ref '${ref}' does not belong to TAPD mini workspace '${workspaceId ?? "unknown"}'.`;
    }
    const itemId = url.searchParams.get("mini_item_id");
    if (!itemId || !/^\d+$/.test(itemId)) {
      return `Wayfinder ref '${ref}' must include a numeric mini_item_id.`;
    }
    return undefined;
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
  if (!project || !pathname.startsWith(`${project}/`)) {
    return `Wayfinder ref '${ref}' does not belong to repository '${project ?? "unknown"}'.`;
  }
  const suffix = pathname.slice(project.length);
  if (!/^\/issues\/\d+$/.test(suffix)) {
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

function canonicalReference(
  repository: RepositoryIdentity,
  ref: string,
): string {
  if (repository.tracker === "local") {
    return realpathSync(resolve(repository.root, ref));
  }
  try {
    const url = new URL(ref);
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
    if (repository.tracker === "tapd_mini") {
      return `${url.hostname.toLowerCase()}/${pathname}?mini_item_id=${url.searchParams.get("mini_item_id")}`;
    }
    return `${url.hostname.toLowerCase()}/${pathname}`;
  } catch {
    return ref;
  }
}

function exemptionError(lanes: TaskLane[]): string | undefined {
  const only = lanes.length === 1 ? lanes[0] : undefined;
  return only?.agent === WAYFINDER_REVIEWER_AGENT && !only.isolated
    ? undefined
    : `one-shot-read-only exemption requires exactly one non-isolated '${WAYFINDER_REVIEWER_AGENT}' task.`;
}

function trackedBindingError(
  binding: TrackedWayfinderBinding,
  lanes: TaskLane[],
  repository: RepositoryIdentity,
): string | undefined {
  if (repository.configurationError) return repository.configurationError;
  if (binding.tracker !== repository.tracker) {
    return `Wayfinder tracker '${binding.tracker}' does not match the workflow repository tracker '${repository.tracker}'.`;
  }
  if (binding.tracker === "local" && lanes.some((item) => item.isolated)) {
    return "Local Wayfinder refs cannot provide one canonical shared pitfall log to isolated tasks. Use GitHub/Gongfeng/TAPD mini tracking or run without isolation.";
  }
  if (binding.tickets.length !== lanes.length) {
    return `Wayfinder binding has ${binding.tickets.length} tickets for ${lanes.length} task children.`;
  }
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    const ticket = binding.tickets[index];
    if (!lane || !ticket) return "Wayfinder ticket and task counts diverged.";
    if (ticket.key !== lane.key) {
      return `Wayfinder ticket ${index + 1} must use task name '${lane.key}', not '${ticket.key}'.`;
    }
  }

  const refs = [
    binding.map.ref,
    ...binding.tickets.map((ticket) => ticket.ref),
  ];
  const canonicalRefs: string[] = [];
  for (const ref of refs) {
    const error = validateReference(repository, ref);
    if (error) return error;
    canonicalRefs.push(canonicalReference(repository, ref));
  }
  return new Set(canonicalRefs).size === canonicalRefs.length
    ? undefined
    : "The map and every task ticket must resolve to distinct artifacts.";
}

export function validateWayfinderGate(input: {
  inspection: TaskInspection;
  repository: RepositoryIdentity;
  wayfinder: unknown;
}): GateResult {
  if (input.inspection.errors.length > 0) {
    return { ok: false, reason: input.inspection.errors.join(" ") };
  }
  const binding = parseWayfinderBinding(input.wayfinder);
  if (!binding) {
    return {
      ok: false,
      reason:
        "Missing or invalid task.wayfinder binding. Create or attach the Wayfinder map and child tickets first.",
    };
  }
  const reason =
    binding.mode === "exempt"
      ? exemptionError(input.inspection.lanes)
      : trackedBindingError(binding, input.inspection.lanes, input.repository);
  return reason ? { ok: false, reason } : { ok: true, binding };
}

export function childPolicyPrompt(
  binding:
    | ExemptWayfinderBinding
    | {
        mode: "tracked";
        tracker: Tracker;
        map: ArtifactReference;
        ticket: TicketReference;
      },
): string {
  if (binding.mode === "exempt") {
    return "## Wayfinder child contract\n\nThis is an approved one-shot read-only Wayfinder exemption. Do not mutate project or source files.";
  }
  const pitfallSource =
    binding.tracker === "tapd_mini"
      ? 'the map description section headed "## 可复用障碍"'
      : 'all map comments headed "WAYFINDER PITFALL"';
  return `## Wayfinder child contract\n\nWayfinder map: ${binding.map.name} (${binding.map.ref})\nYour ticket: ${binding.ticket.name} [${binding.ticket.key}] (${binding.ticket.ref})\nWork only within this ticket's question and approved boundaries.\n\nBefore running commands or diagnosing, read the map and ${pitfallSource}. Apply relevant entries. At the first unexpected failure, search those entries again by symptom and component before trying another fix; searching does not make the failure reportable. A pitfall must be a non-obvious operational obstacle from build, deploy, tooling, permissions, environment, or shared infrastructure that is likely to recur in another independent ticket and is directly reusable there without knowing this ticket's decision history. Normal ticket iteration is not a pitfall: do not report hypotheses, rejected options, requirement clarification, review feedback, prototype adjustments, changing understanding, routine trial and error, command typos, or transient failures caused by code currently being changed. Do not write the shared pitfall log directly. Send only a qualifying new reusable resolved or unresolved obstacle to the parent through hub with a message beginning "[wayfinder:pitfall_report]" and include Ticket, Scope, Symptom, Cause, Resolution, Verification, and Status; redact secrets. Wait for the parent's acknowledgement before completion. Disclose every pitfall recorded, reused, or unresolved in the final response, or state "Pitfalls: None".\n\nBefore escalating ambiguity, inspect the ticket/map context and repository evidence. If a material ambiguity still affects scope, behavior, architecture, authority, or acceptance, send the parent exactly one focused question through hub in a message beginning "[wayfinder:interview_request]" and wait for the reply. Never bundle questions or guess through an unresolved decision.`;
}

/** Strip the gate-only binding and scope one child contract per native task. */
export function prepareNativeTaskInput(
  input: RecordValue,
  inspection: TaskInspection,
  binding: WayfinderBinding,
): RecordValue {
  const { wayfinder: _wayfinder, ...nativeInput } = input;
  if (inspection.form === "batch") {
    const tasks = (input.tasks as unknown[]).map((item, index) => {
      const object = { ...(item as RecordValue) };
      const ticket =
        binding.mode === "tracked" ? binding.tickets[index] : undefined;
      if (binding.mode === "tracked" && !ticket) {
        throw new Error(`Missing Wayfinder ticket for task item ${index + 1}.`);
      }
      const childBinding =
        binding.mode === "tracked"
          ? {
              mode: "tracked" as const,
              tracker: binding.tracker,
              map: binding.map,
              ticket: ticket as TicketReference,
            }
          : binding;
      object.task = `${childPolicyPrompt(childBinding)}\n\n## Assigned task\n\n${String(object.task ?? "")}`;
      return object;
    });
    nativeInput.tasks = tasks;
  } else {
    const ticket = binding.mode === "tracked" ? binding.tickets[0] : undefined;
    if (binding.mode === "tracked" && !ticket) {
      throw new Error("Missing Wayfinder ticket for flat task.");
    }
    const childBinding =
      binding.mode === "tracked"
        ? {
            mode: "tracked" as const,
            tracker: binding.tracker,
            map: binding.map,
            ticket: ticket as TicketReference,
          }
        : binding;
    nativeInput.task = `${childPolicyPrompt(childBinding)}\n\n## Assigned task\n\n${String(input.task ?? "")}`;
  }
  return nativeInput;
}
