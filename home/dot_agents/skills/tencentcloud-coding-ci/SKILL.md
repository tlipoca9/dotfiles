---
name: tencentcloud-coding-ci
description: Author, review, and troubleshoot Tencent Cloud internal Zhiyan Coding-CI (QCI) pipelines and .coding-ci.yml files. Use for CIfile YAML, triggers, workers, runtime variables, artifacts, caches, and failed builds. Not for public CODING Jenkinsfiles, BlueKing pipelines, or Zhiyan application tracing.
---

# Tencent Cloud Coding CI

Use the internal Zhiyan Coding-CI / QCI CIfile dialect documented in the
[Coding pipeline manual](https://iwiki.woa.com/p/4007716346).
The bundled references were checked on 2026-10-28. They capture useful contracts,
not a complete platform schema.

## Establish the effective configuration

Inspect the repository's existing CIfile, build commands, and relevant instructions.
The conventional filename is `.coding-ci.yml`, but the pipeline can select another
path. Determine whether configuration comes from repository YAML, an imported file,
or UI-managed configuration, and which revision the build actually loaded.

For a new pipeline, infer commands from the repository. Resolve only missing inputs
that affect the result: desired events/branches, OS/architecture/network, an available
worker/image, required credentials, and intended outputs or deployment target.
Prefer an existing working pipeline export for project-specific plugin and worker
settings. Keep unresolved inputs explicit rather than inventing resource identifiers.

Read only the references needed for the task:

- **Write or review YAML:** [CIfile structure](references/cifile.md).
- **Events, filters, MR checks, or missing triggers:** [Triggers](references/triggers.md).
- **Workers, images, variables, cross-stage data, or caching:** [Execution and data](references/execution.md).
- **A failed, stalled, or inconsistent build:** [Troubleshooting](references/troubleshooting.md), then the relevant contract above.

## Author or change a CIfile

1. Map the requested work into sequential stages, parallel tasks within each stage,
   and sequential commands within each task. Put a consumer in a later stage when
   it needs another task's files or runtime variables.
2. Select the actual worker and a compatible image. Preserve a working export's
   plugin identifiers and parameter shapes; the platform's `plugin: cmds` wrapper
   and plain command strings are both documented forms.
3. Make data flow explicit with `temps`, `cache`, `artifacts`, or `QCI_ENV_FILE` as
   appropriate. Configure credentials through encrypted platform variables or
   existing secret references; `env.NAME.secret` contains platform ciphertext.
4. For event changes, enumerate the intended matching and nonmatching cases. Check
   UI enablement and YAML precedence as well as YAML filters.
5. Validate the edited YAML and relevant scripts. Report separately what was
   checked locally and what the platform actually accepted or executed.

Keep the user's existing output and failure contracts. `ignore: true`, skipped
tests, and a UI “continue after failure” operation change those contracts; they are
not evidence that a failed build was repaired. Keep publishing, deployment,
notification delivery, and live build execution within the requested scope.

## Verification

- Parse the complete YAML with a parser that rejects duplicate mapping keys. Quote
  commands containing YAML-significant punctuation, or use block scalars. Verify
  that command entries parse as strings or documented plugin objects.
- Check field placement, spelling, types, and timing against the relevant reference:
  worker overrides, stage dependencies, variable availability, timeout units,
  trigger coverage, and artifact/cache paths.
- Run the repository's relevant command or script checks when feasible. A local
  successful command does not verify a remote worker's image, network, permissions,
  or platform parsing.
- When platform verification is in scope, inspect its import/editor validation and
  resulting configuration. For a build, confirm the new YAML/code revision, actual
  event, worker, exit status, and intended outputs. A restart can reuse the old
  revision; consult the troubleshooting reference before choosing a rerun action.
- Without platform access, deliver the concrete change and name the remaining
  inputs or checks. Do not label a syntax check as a successful CI run.

## Consult live documentation when needed

Read the linked primary sources with the iWiki MCP tools: `getDocument` with
`docid` for content, `getSpacePageTree` with `parentid` for a folder's children,
and `metadata` for type and update time. A blank folder body is not the whole manual; inspect
its children. Without access, use the bundled facts and state the limit.

For unsupported fields, plugin parameters, current image requirements, quotas, or
conflicting examples, inspect the current source and a platform export before
choosing syntax. Do not import another CI product's `jobs`, `steps`, `uses`, `needs`,
or Jenkins syntax into CIfile without QCI-specific evidence. Known documentation
conflicts are recorded next to the affected concept in the references.

For programmatic inspection of configuration, build results, or task logs, read the
[pipeline OpenAPI](https://iwiki.woa.com/p/4012305521) and its linked authentication
documentation before calling it. Some endpoints require `X-Project-Id`; use the
documented environment and credentials. OpenAPI request bodies and CIfile are
different schemas. Historical records older than 30 days have a
[separate interface](https://iwiki.woa.com/p/4012305635).
