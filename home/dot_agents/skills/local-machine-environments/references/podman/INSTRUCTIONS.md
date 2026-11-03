---
name: podman
description: Use this Mac's shared Podman machine for local container builds, runs, Compose, Docker-compatible SDKs, and Testcontainers; diagnose its connection or disk-space failures. Read before creating or selecting a local container runtime. Excludes remote container hosts and cloud deployments.
---

# Local Podman

## Machine contract

This Mac uses exactly one Podman machine: `podman-machine-default`, with
8 CPUs, 16 GiB RAM, and a 256 GiB virtual disk. Use its rootless connection,
also named `podman-machine-default`. The companion `-root` connection is a
second endpoint for the same VM, not a second machine.

Reuse this shared machine across repositories and agents. Isolate work with
container names, networks, volumes, and Compose project names. Creating another
machine, resetting/recreating this one, or changing its resources/rootful mode
requires a user request covering that change. A previous rebuild does not grant
standing permission to discard later workloads.

## Connect and verify

1. Inspect `podman machine list` and `podman system connection list`. Start the
   expected machine if stopped, using the agent-session procedure below. If it
   is missing or additional machines exist, report the mismatch before changing
   machine inventory. Preserve concurrently running workloads.
2. Use `podman --connection podman-machine-default` for CLI operations. Check
   `podman --connection podman-machine-default info` before diagnosing a build
   or container failure as a runtime outage.
3. Discover the host Unix socket from the machine and verify its API:

   ```sh
   podman_socket=$(podman machine inspect podman-machine-default \
     --format '{{.ConnectionInfo.PodmanSocket.Path}}')
   test -S "$podman_socket"
   curl --fail --silent --show-error --max-time 5 \
     --unix-socket "$podman_socket" http://localhost/_ping
   ```

   The request must succeed with `OK`. A socket file or running VM alone does
   not prove that the API is usable.

### Starting from an agent command session

Short-lived command sessions can terminate descendant processes when the command
finishes. Launch Podman in a separate process session so its `vfkit` and `gvproxy`
processes survive that cleanup:

```sh
uv run python - <<'PY'
import subprocess

subprocess.run(
    ["/opt/homebrew/bin/podman", "machine", "start", "podman-machine-default"],
    stdin=subprocess.DEVNULL,
    start_new_session=True,
    check=True,
)
PY
```

Then run `podman info` and the socket probe in a **separate tool invocation**.
The startup command's success alone does not establish that the VM stayed alive.
An ordinary persistent terminal can use `podman machine start` directly.

### Stable host socket

The stable host alias is
`$HOME/.local/share/containers/podman/machine/podman.sock`.
It points to the socket reported by `machine inspect`. Recheck after a machine
restart or macOS reboot. If the alias is absent or points elsewhere, refresh
only this alias, after verifying the discovered socket:

```sh
podman_socket_alias="$HOME/.local/share/containers/podman/machine/podman.sock"
ln -sfn "$podman_socket" "$podman_socket_alias"
curl --fail --silent --show-error --max-time 5 \
  --unix-socket "$podman_socket_alias" http://localhost/_ping
```

If this path is a real file, directory, or socket rather than a symlink, inspect
its owner instead of replacing it. Discover the temporary socket path and SSH
port at runtime; never copy their current values into project configuration.

## Docker-compatible clients

Set `DOCKER_HOST` in the environment of the command or application that needs
the Docker-compatible API:

```sh
export DOCKER_HOST="unix://$HOME/.local/share/containers/podman/machine/podman.sock"
```

Use the same shell/process for the dependent command. Prefer command-scoped
settings over editing global shell configuration. The `docker` CLI and a Compose
provider are separate tools; verify the required executable before using it.
The local workflow does not depend on `/var/run/docker.sock` or Docker Desktop.

For a client running inside a container, the host alias is not the VM socket
mount source. Discover the rootless VM path with:

```sh
podman machine ssh podman-machine-default \
  'printf "/run/user/%s/podman/podman.sock\n" "$(id -u)"'
```

Use that VM path when a container needs a socket bind mount. Check the project's
Testcontainers or Compose configuration before setting framework-specific socket
overrides or disabling cleanup helpers; host API access and in-container socket
access are different paths.

## Disk full

The user authorizes ordinary Podman pruning without another confirmation when
this machine's container storage is full. Check the storage filesystem and
reclaimable usage:

```sh
podman machine ssh podman-machine-default 'df -h /var/home/core /var'
podman --connection podman-machine-default system df
```

When the failure is caused by full Podman storage, run:

```sh
podman --connection podman-machine-default system prune --force
```

This removes stopped containers and other unused objects under the command's
normal semantics. The standing authorization covers this ordinary prune only;
omit `--all`, `--volumes`, `--build`, and `--external` unless separately requested.
Do not stop active containers to make them eligible. Recheck free space, then
retry the failed operation once if that operation is safe to retry. Report an
unresolved shortage instead of repeatedly pruning or recreating the machine.

If the macOS filesystem is full instead, inspect host free space separately;
space freed inside the sparse VM disk does not establish that host space was
reclaimed. The 256 GiB figure is the virtual disk capacity, not reserved host
storage.

## Connection failures

Check machine state, the selected connection, `CONTAINER_HOST`,
`CONTAINER_CONNECTION`, and `DOCKER_HOST`, then repeat the socket API probe.
Correct stale endpoint settings before considering a restart. Restarting the
shared machine interrupts every agent's containers, so inspect active workloads
and use existing user authorization before doing so. Verify recovery by rerunning
the actual failed operation, not only `podman info`.
