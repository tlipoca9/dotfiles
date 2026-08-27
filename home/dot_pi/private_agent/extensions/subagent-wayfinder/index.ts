import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  WAYFINDER_BINDING_NAMESPACE,
  WAYFINDER_EXTENSION_ACK_ID,
  applyIssueTrackerDocument,
  childPolicyPrompt,
  injectChildBindings,
  inspectWorkflowScript,
  parseChildBinding,
  parseWayfinderBinding,
  repositoryIdentity,
  validateWayfinderGate,
  type RepositoryIdentity,
} from "./policy.ts";

const REMOTE_EVIDENCE_TTL_MS = 5 * 60 * 1000;

const PARENT_POLICY_PROMPT = `## Subagent Wayfinder gate

Before an initial subagent execution, classify the workflow. A single one-shot reviewer/oracle read-only child may use the explicit one-shot-read-only exemption. Any writer, scout/researcher artifact producer, multi-child, multi-stage, worktree, custom/unknown agent, or explicitly long-running workflow must first create or attach one Wayfinder map and one ticket per literal child key.

Select the tracker from the actual workflow repository. A docs/agents/issue-tracker.md frontmatter declaration of tracker: tapd_mini plus workspace_id overrides origin detection; otherwise github.com uses GitHub, git.woa.com uses Gongfeng, and every other/no remote uses local markdown. Read the wayfinder skill and tracker document, create and claim the map/tickets before launch, then verify them through the configured tracker. The gate verifies GitHub refs with gh. For Gongfeng or TAPD mini, use the configured MCP because command-line HTTP clients do not share its authentication. Before a Gongfeng launch, use separate mcp calls to read the Map and every Ticket with gongfeng_get_issue_detail, passing the repository path as project_id and the issue number as issue_iid; the gate consumes those successful results for five minutes. Before a TAPD mini launch, similarly read the Map and every Ticket with mini_items_get; the gate requires the Map parent_id to be 0 and every Ticket parent_id to equal the Map item id. Refer to every issue by name. Split cross-repository work into separate workflows.

Every execution must use workflowScript and top-level extensionBindings['${WAYFINDER_BINDING_NAMESPACE}']. Tracked bindings have { mode: "tracked", tracker, map: { name, ref }, tickets: [{ key, name, ref }] } in exact child order. The only exemption is { mode: "exempt", reason: "one-shot-read-only" }. The gate blocks missing, mismatched, dynamic, unsupported, or invalid bindings.

An execution-bearing Wayfinder map has exactly one retained map-supervisor workflow for its whole active execution. Before launch, verify that no other map supervisor is active, record this workflow as the map supervisor, and launch every concurrent execution agent beneath it; later work resumes this workflow instead of launching a second one. Read the latest tracker-specific pitfall log and make every existing entry available to tracked children. GitHub and Gongfeng use WAYFINDER PITFALL map comments; TAPD mini uses append-only entries in the map description's ## Pitfall log section because mini-item comments are unavailable through MCP. When a child sends contact_supervisor reason "interview_request", answer from settled map/ticket decisions and repository evidence when possible. If human judgment is still required, read the grilling skill, ask the user exactly one question, then reply through subagent_supervisor. Do not bundle questions. The map supervisor is the only pitfall-log writer for that map's active execution. For every "pitfall_report", re-read the latest log and compare the normalized Scope + Symptom + Cause key immediately before writing. If it matches an existing entry, reply with that entry's reference; otherwise append exactly one complete WAYFINDER PITFALL entry and reply with its reference. Never accept a child as complete before acknowledging its report. At workflow handoff, re-read the log and disclose every pitfall recorded, reused, or unresolved across the children, or explicitly report "Pitfalls: None". For tracked runs, treat a missing runtime acknowledgement '${WAYFINDER_EXTENSION_ACK_ID}' as policy failure rather than claiming compliant completion.`;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type TapdMiniEvidence = {
  workspaceId: string;
  itemId: string;
  parentId: string;
  observedAt: number;
};

type GongfengIssueEvidence = {
  projectPath: string;
  issueIid: string;
  observedAt: number;
};

function stringIdentifier(value: unknown): string | undefined {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return undefined;
}

function parseMcpArgs(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return record(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  return record(value);
}

function isTapdMiniGet(input: Record<string, unknown>): boolean {
  const tool = input.tool;
  const server = input.server;
  return (
    (tool === "mini_items_get" && server === "tapd_mcp_http") ||
    tool === "tapd_mcp_http_mini_items_get"
  );
}

function parseJsonText(text: string): JsonValue | undefined {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const starts = [trimmed.indexOf("{"), trimmed.indexOf("[")].filter(
    (index) => index >= 0,
  );
  const start = starts.length > 0 ? Math.min(...starts) : -1;
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  for (const candidate of [
    trimmed,
    start >= 0 && end >= start ? trimmed.slice(start, end + 1) : "",
  ]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as JsonValue;
    } catch {
      continue;
    }
  }
  return undefined;
}

function findTapdMiniItem(
  value: unknown,
  workspaceId: string,
  itemId: string,
): TapdMiniEvidence | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findTapdMiniItem(entry, workspaceId, itemId);
      if (found) return found;
    }
    return undefined;
  }
  const object = record(value);
  if (!object) return undefined;
  const miniItem = record(object.MiniItem) ?? object;
  if (
    stringIdentifier(miniItem.id) === itemId &&
    stringIdentifier(miniItem.workspace_id) === workspaceId
  ) {
    const parentId = stringIdentifier(miniItem.parent_id);
    if (parentId !== undefined) {
      return { workspaceId, itemId, parentId, observedAt: Date.now() };
    }
  }
  for (const nested of Object.values(object)) {
    const found = findTapdMiniItem(nested, workspaceId, itemId);
    if (found) return found;
  }
  return undefined;
}

function tapdMiniEvidenceFromResult(event: {
  input: unknown;
  content: unknown;
  isError?: boolean;
}): TapdMiniEvidence | undefined {
  if (event.isError) return undefined;
  const input = record(event.input);
  if (!input || !isTapdMiniGet(input)) return undefined;
  const args = parseMcpArgs(input.args);
  const workspaceId = stringIdentifier(args?.workspace_id);
  const itemId = stringIdentifier(args?.id);
  if (!workspaceId || !itemId || !Array.isArray(event.content))
    return undefined;
  for (const part of event.content) {
    const text = record(part)?.text;
    if (typeof text !== "string") continue;
    const evidence = findTapdMiniItem(parseJsonText(text), workspaceId, itemId);
    if (evidence) return evidence;
  }
  return undefined;
}

function tapdMiniItemId(ref: string): string | undefined {
  try {
    return stringIdentifier(new URL(ref).searchParams.get("mini_item_id"));
  } catch {
    return undefined;
  }
}

function verifyTapdMiniEvidence(
  repository: RepositoryIdentity,
  mapRef: string,
  ticketRefs: string[],
  evidence: Map<string, TapdMiniEvidence>,
): string | undefined {
  const workspaceId = repository.workspaceId;
  const mapId = tapdMiniItemId(mapRef);
  if (!workspaceId || !mapId) return "TAPD mini Map identity is invalid.";
  const now = Date.now();
  const current = (itemId: string) => {
    const item = evidence.get(`${workspaceId}:${itemId}`);
    return item && now - item.observedAt <= REMOTE_EVIDENCE_TTL_MS
      ? item
      : undefined;
  };
  const map = current(mapId);
  if (!map || map.parentId !== "0") {
    return `TAPD mini Map '${mapRef}' must be freshly read through MCP and have parent_id 0.`;
  }
  for (const ref of ticketRefs) {
    const itemId = tapdMiniItemId(ref);
    const ticket = itemId ? current(itemId) : undefined;
    if (!ticket || ticket.parentId !== mapId) {
      return `TAPD mini Ticket '${ref}' must be freshly read through MCP and have parent_id ${mapId}.`;
    }
  }
  return undefined;
}

function isGongfengIssueGet(input: Record<string, unknown>): boolean {
  const tool = input.tool;
  const server = input.server;
  return (
    (tool === "get_issue_detail" && server === "gongfeng") ||
    (tool === "gongfeng_get_issue_detail" &&
      (server === undefined || server === "gongfeng"))
  );
}

function findGongfengIssue(value: unknown, issueIid: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => findGongfengIssue(entry, issueIid));
  }
  const object = record(value);
  if (!object) return false;
  const returnedIid = stringIdentifier(object.iid ?? object.issue_iid);
  const looksLikeIssue =
    object.id !== undefined ||
    typeof object.title === "string" ||
    typeof object.web_url === "string";
  if (returnedIid === issueIid && looksLikeIssue && object.error === undefined) {
    return true;
  }
  return Object.values(object).some((nested) =>
    findGongfengIssue(nested, issueIid),
  );
}

function gongfengEvidenceFromResult(event: {
  input: unknown;
  content: unknown;
  isError?: boolean;
}): GongfengIssueEvidence | undefined {
  if (event.isError) return undefined;
  const input = record(event.input);
  if (!input || !isGongfengIssueGet(input)) return undefined;
  const args = parseMcpArgs(input.args);
  const projectPath =
    typeof args?.project_id === "string" ? args.project_id.trim() : "";
  const issueIid = stringIdentifier(args?.issue_iid);
  if (!projectPath || !issueIid || !Array.isArray(event.content)) {
    return undefined;
  }
  for (const part of event.content) {
    const text = record(part)?.text;
    if (
      typeof text === "string" &&
      findGongfengIssue(parseJsonText(text), issueIid)
    ) {
      return { projectPath, issueIid, observedAt: Date.now() };
    }
  }
  return undefined;
}

function gongfengReferenceIdentity(
  ref: string,
): { projectPath: string; issueIid: string } | undefined {
  try {
    const url = new URL(ref);
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      url.hostname !== "git.woa.com" ||
      segments.length < 3 ||
      segments.at(-2) !== "issues"
    ) {
      return undefined;
    }
    const issueIid = stringIdentifier(segments.at(-1));
    const projectPath = segments.slice(0, -2).join("/");
    return issueIid && projectPath ? { projectPath, issueIid } : undefined;
  } catch {
    return undefined;
  }
}

function verifyGongfengEvidence(
  repository: RepositoryIdentity,
  refs: string[],
  evidence: Map<string, GongfengIssueEvidence>,
): string | undefined {
  const now = Date.now();
  for (const ref of refs) {
    const identity = gongfengReferenceIdentity(ref);
    if (!identity || identity.projectPath !== repository.projectPath) {
      return `Gongfeng Wayfinder ref '${ref}' has an invalid repository identity.`;
    }
    const item = evidence.get(`${identity.projectPath}:${identity.issueIid}`);
    if (!item || now - item.observedAt > REMOTE_EVIDENCE_TTL_MS) {
      return `Gongfeng Wayfinder ref '${ref}' must be freshly read through MCP with gongfeng_get_issue_detail.`;
    }
  }
  return undefined;
}

async function configuredRepositoryIdentity(
  identity: RepositoryIdentity,
): Promise<RepositoryIdentity> {
  const path = resolve(identity.root, "docs/agents/issue-tracker.md");
  try {
    return applyIssueTrackerDocument(identity, readFileSync(path, "utf8"));
  } catch (error) {
    if (record(error)?.code === "ENOENT") return identity;
    return {
      ...identity,
      configurationError: `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function inspectRepository(
  pi: ExtensionAPI,
  cwd: string,
  signal?: AbortSignal,
): Promise<RepositoryIdentity> {
  const absoluteCwd = resolve(cwd);
  const rootResult = await pi.exec(
    "git",
    ["-C", absoluteCwd, "rev-parse", "--show-toplevel"],
    { signal, timeout: 3000 },
  );
  if (rootResult.code !== 0 || !rootResult.stdout.trim()) {
    return configuredRepositoryIdentity(repositoryIdentity(absoluteCwd));
  }
  const root = resolve(rootResult.stdout.trim());
  const remoteResult = await pi.exec(
    "git",
    ["-C", root, "remote", "get-url", "origin"],
    { signal, timeout: 3000 },
  );
  return configuredRepositoryIdentity(
    repositoryIdentity(
      root,
      remoteResult.code === 0 ? remoteResult.stdout.trim() : undefined,
    ),
  );
}

function normalizedIssueUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return undefined;
  }
}

async function verifyGitHubReferences(
  pi: ExtensionAPI,
  refs: string[],
  signal?: AbortSignal,
): Promise<string | undefined> {
  for (const ref of refs) {
    const result = await pi.exec(
      "gh",
      ["issue", "view", ref, "--json", "url", "--jq", ".url"],
      { signal, timeout: 10000 },
    );
    if (
      result.code !== 0 ||
      normalizedIssueUrl(result.stdout.trim()) !== normalizedIssueUrl(ref)
    ) {
      return `GitHub Wayfinder ref '${ref}' is missing or unreadable.`;
    }
  }
  return undefined;
}

export default function subagentWayfinder(pi: ExtensionAPI) {
  const gongfengEvidence = new Map<string, GongfengIssueEvidence>();
  const tapdMiniEvidence = new Map<string, TapdMiniEvidence>();
  const childBinding = parseChildBinding(
    process.env.PI_SUBAGENT_EXTENSION_BINDINGS,
  );

  pi.on("session_start", () => {
    if (childBinding) {
      pi.events.emit("subagent:acknowledge-extension", {
        id: WAYFINDER_EXTENSION_ACK_ID,
      });
    }
  });

  pi.on("tool_result", (event) => {
    if (event.toolName !== "mcp") return undefined;
    const gongfeng = gongfengEvidenceFromResult(event);
    if (gongfeng) {
      gongfengEvidence.set(
        `${gongfeng.projectPath}:${gongfeng.issueIid}`,
        gongfeng,
      );
    }
    const tapdMini = tapdMiniEvidenceFromResult(event);
    if (tapdMini) {
      tapdMiniEvidence.set(
        `${tapdMini.workspaceId}:${tapdMini.itemId}`,
        tapdMini,
      );
    }
    return undefined;
  });

  pi.on("before_agent_start", (event) => {
    const additions: string[] = [];
    if (childBinding) additions.push(childPolicyPrompt(childBinding));
    if (event.systemPromptOptions.selectedTools?.includes("subagent")) {
      additions.push(PARENT_POLICY_PROMPT);
    }
    return additions.length > 0
      ? { systemPrompt: `${event.systemPrompt}\n\n${additions.join("\n\n")}` }
      : undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "subagent") return undefined;
    const input = record(event.input);
    if (!input)
      return { block: true, reason: "Subagent input must be an object." };

    // Management, control, and retained top-level resume calls preserve their
    // original launch contract and are outside the initial execution gate.
    if (typeof input.action === "string" && input.action.trim())
      return undefined;

    if (typeof input.workflowScriptPath === "string") {
      return {
        block: true,
        reason:
          "Wayfinder-gated subagents require inline workflowScript so child keys and ticket bindings can be verified.",
      };
    }
    if (
      typeof input.workflowScript !== "string" ||
      !input.workflowScript.trim()
    ) {
      return {
        block: true,
        reason:
          "Initial subagent execution must use workflowScript; direct { agent, task } execution cannot carry verified child tickets.",
      };
    }

    const inspection = inspectWorkflowScript(input.workflowScript);
    const workflowCwd = resolve(
      ctx.cwd,
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : ".",
    );
    const repositoryCache = new Map<string, Promise<RepositoryIdentity>>();
    const repositories = await Promise.all(
      inspection.lanes.map((lane) => {
        const childCwd = resolve(workflowCwd, lane.cwd ?? ".");
        const cached = repositoryCache.get(childCwd);
        if (cached) return cached;
        const pending = inspectRepository(pi, childCwd, ctx.signal);
        repositoryCache.set(childCwd, pending);
        return pending;
      }),
    );

    const parsedBinding = parseWayfinderBinding(input.extensionBindings);
    let verifiedRemoteRefs: string[] = [];
    if (
      parsedBinding?.mode === "tracked" &&
      parsedBinding.tracker !== "local" &&
      inspection.errors.length === 0 &&
      repositories.length === inspection.lanes.length &&
      repositories.length > 0 &&
      repositories.every(
        (repository) =>
          repository.root === repositories[0]!.root &&
          repository.tracker === parsedBinding.tracker,
      )
    ) {
      const refs = [
        parsedBinding.map.ref,
        ...parsedBinding.tickets.map((ticket) => ticket.ref),
      ];
      let verificationError: string | undefined;
      if (parsedBinding.tracker === "github") {
        verificationError = await verifyGitHubReferences(pi, refs, ctx.signal);
      } else if (parsedBinding.tracker === "gongfeng") {
        verificationError = verifyGongfengEvidence(
          repositories[0]!,
          refs,
          gongfengEvidence,
        );
      } else if (parsedBinding.tracker === "tapd_mini") {
        verificationError = verifyTapdMiniEvidence(
          repositories[0]!,
          parsedBinding.map.ref,
          parsedBinding.tickets.map((ticket) => ticket.ref),
          tapdMiniEvidence,
        );
      }
      if (verificationError) {
        if (ctx.hasUI)
          ctx.ui.notify(`Subagent blocked: ${verificationError}`, "warning");
        return { block: true, reason: verificationError };
      }
      verifiedRemoteRefs = refs;
    }

    const result = validateWayfinderGate({
      inspection,
      repositories,
      extensionBindings: input.extensionBindings,
      topLevelTimeoutMs: numberValue(input.timeoutMs),
      topLevelMaxRuntimeMs: numberValue(input.maxRuntimeMs),
      topLevelWorktree: input.worktree === true,
      verifiedRemoteRefs,
    });
    if (!result.ok) {
      if (ctx.hasUI)
        ctx.ui.notify(`Subagent blocked: ${result.reason}`, "warning");
      return { block: true, reason: result.reason };
    }

    input.workflowScript = injectChildBindings(
      input.workflowScript,
      inspection,
      result.binding,
    );
    return undefined;
  });
}
