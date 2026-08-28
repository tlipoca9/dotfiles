# Gateway Request Id Escalation

## Overview

Use this skill to avoid speculative debugging across an opaque gateway boundary. The primary output is a concise escalation packet: RequestId, action, failing command, log path, backend evidence, and what is still unknown.

## Rule

When an external gateway returns an opaque error and the gateway internals are not directly observable, do not keep patching local code based on response-shape guesses. Extract the request identifiers and hand them to the person or system that can inspect gateway-side traces.

## Workflow

1. Identify the failing boundary:
   - External endpoint, product, region, and environment.
   - Action or API method.
   - Exact error code and message.
   - RequestId, TraceId, X-Request-Id, or equivalent correlation ID.

2. Preserve local evidence:
   - Command that produced the error.
   - Local log file path.
   - Report file path, if a test runner produced one.
   - Relevant backend pod/deployment names and image tags, if already checked.

3. Separate backend facts from gateway facts:
   - Backend fact: service logs show the request was received, completed, failed validation, enqueued work, or produced an application error.
   - Gateway fact: external SDK or gateway returned a code/message and RequestId.
   - Do not infer gateway schema, routing, or validator behavior unless gateway-side evidence is available.

4. Escalate before patching:
   - If backend logs are clean or ambiguous but the external gateway returns opaque `InternalError`, stop and give the RequestId to the user.
   - If the user or gateway owner can inspect gateway traces, ask them to verify that trace before making local changes.
   - Only resume code changes after the gateway-side result identifies a local defect or contract mismatch.

## Escalation Packet

Use this format:

```text
Action: <API action or method>
RequestId: <id>
Error: <code>: <message>
Command: <command or test entrypoint>
Local log: <path>
Report: <path, if any>
Backend evidence: <what the service logs say, or "not checked">
Need gateway-side check: <specific question>
```

## What Not To Do

- Do not delete response fields, rename public fields, downgrade contracts, or add compatibility flags only because an opaque gateway returned `InternalError`.
- Do not call a backend success log proof that the external gateway should have accepted the response.
- Do not keep iterating on local guesses after one or two gateway-opaque failures with usable RequestIds.
