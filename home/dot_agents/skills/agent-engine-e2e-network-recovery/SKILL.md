---
name: agent-engine-e2e-network-recovery
description: Diagnose and recover Agent Engine root E2E failures involving intermittent EOF, SSL connection timeout, TLS handshake timeout, TencentCloud ClientError.NetworkError, missing Customs request logs, or different behavior through iOA/SmartVPN versus a physical network interface. Use when separating application failures from local network-path failures, validating public endpoints with fresh connections, running E2E through a source-bound direct CONNECT proxy, or defining durable iOA domain-bypass rules.
---

# Agent Engine E2E Network Recovery

Treat network-path health as a prerequisite for interpreting E2E business failures. Establish where the request stopped, compare equivalent tunnel and direct paths, and only change business code when the request reached the service.

## Preserve the Evidence Boundary

Classify a failure before changing code:

- Classify `EOF`, `SSL_ERROR_SYSCALL`, `SSL connection timeout`, TLS handshake timeout, or `ClientError.NetworkError` with no server request log as a client-to-entry network failure.
- Classify an HTTP response, correlated request log, or server Span as evidence that the request reached the application. Continue normal service diagnosis from that boundary.
- Do not interpret a missing lease, capacity observation, or cleanup result as a business failure when the initiating HTTPS request failed first.
- Do not add retries to behavioral assertions. Retries hide transport instability and invalidate concurrency, capacity, and lifecycle expectations.

The Agent Engine runner performs a burst preflight before resource creation. Use its failure as the primary signal; use the commands below only to locate the unstable path or validate recovery.

## Inspect the Active Route

Resolve each hostname at inspection time because the public IPs change:

```bash
for host in \
  api.ap-chongqing.agents.tencentags.com \
  ags.ap-chongqing.tencentcloudapi.com \
  ags.ap-shanghai.tencentcloudapi.com
do
  ip=$(dscacheutil -q host -a name "$host" | awk '/ip_address:/{print $2; exit}')
  echo "$host $ip"
  route -n get "$ip" | awk '/gateway:|interface:/{print}'
done
```

On macOS, `utun*` indicates a Network Extension or VPN path; a physical Wi-Fi path is commonly `en0`, but never assume that name on another machine. Derive the physical default interface and source IP:

```bash
physical_interface=$(route -n get default | awk '/interface:/{print $2; exit}')
physical_source_ip=$(ipconfig getifaddr "$physical_interface")
```

Record hostname, resolved IP, gateway, interface, request count, concurrency, failure phase, and failure rate. Do not report a single successful curl as stability evidence.

## Run the Repository Preflight

Use the real regional config without printing credentials:

```bash
E2E_CONFIG_PATH="$PWD/../secrets/e2e/configs/config.ap-chongqing.toml" \
  task e2e -- --Runner.OnlySuite=execution_runtime_dataplane
```

The runner tests every required entry with 100 fresh HTTP connections, concurrency 10, and a five-second per-connection timeout. Any failed exchange stops before suite resource creation. Any HTTP status is sufficient because this phase tests DNS, route, proxy, TCP, TLS, and HTTP exchange—not authorization or business behavior.

## Compare a Physical Direct Path

Use the bundled CONNECT proxy when iOA global mode owns host routes and changing system routes is undesirable. It binds each upstream socket to an explicit physical source IP while leaving TLS end-to-end between the E2E client and public endpoint.

Start the proxy:

```bash
skill_dir="$HOME/.agents/skills/agent-engine-e2e-network-recovery"
physical_interface=$(route -n get default | awk '/interface:/{print $2; exit}')
physical_source_ip=$(ipconfig getifaddr "$physical_interface")
python3 "$skill_dir/scripts/direct_connect_proxy.py" \
  --source-ip "$physical_source_ip" \
  --listen 127.0.0.1:18080
```

In another shell, run the same E2E workload through the proxy:

```bash
HTTPS_PROXY=http://127.0.0.1:18080 \
https_proxy=http://127.0.0.1:18080 \
HTTP_PROXY=http://127.0.0.1:18080 \
http_proxy=http://127.0.0.1:18080 \
NO_PROXY=127.0.0.1,localhost \
no_proxy=127.0.0.1,localhost \
E2E_CONFIG_PATH="$PWD/../secrets/e2e/configs/config.ap-chongqing.toml" \
  task e2e -- --Runner.OnlySuite=execution_runtime_dataplane
```

Confirm proxy logs show the expected physical source IP for YunAPI and dynamic `*.agents.tencentags.com` hosts. Stop the proxy after the run. Do not commit machine-specific IPs, interface names, or proxy addresses.

## Decide from the A/B Result

- If the tunnel run fails and the equivalent direct run passes, attribute the failure to the local iOA/tunnel path. Configure domain-based `DIRECT` policy for the public endpoints.
- If both paths fail at the same network phase, investigate the public edge, local physical network, DNS, or source-NAT path before application code.
- If both paths reach the service and return the same wrong behavior, diagnose the application.
- If evidence differs only because workloads, fixtures, or concurrency differ, rerun with equivalent inputs before concluding.

Use domain rules rather than fixed IP routes because DNS answers change:

- `*.ap-chongqing.agents.tencentags.com`
- `ags.ap-chongqing.tencentcloudapi.com`
- `ags.ap-shanghai.tencentcloudapi.com`

The durable arrangement is: E2E remains network-agnostic, machines without iOA use their normal public route, iOA-managed machines apply `DIRECT` domain policy, and the runner fails fast when the active path is unstable. The bundled proxy is a diagnostic and local recovery tool, not a repository runtime dependency.

## Known Incident Signature

On 2026-08-23, the Chongqing Runtime entry through iOA `utun4` reproduced 9 failures in 300 fresh connections: TCP completed in milliseconds, TLS never completed, and the request timed out. The two YunAPI entries passed their probes. The Runtime suite then passed 30/31 and cleanup independently hit another EOF. Running the same 31-spec suite through the source-bound physical direct proxy produced 31/31 with successful cleanup. Use this as a recognizable signature, not as a permanent failure-rate threshold.
