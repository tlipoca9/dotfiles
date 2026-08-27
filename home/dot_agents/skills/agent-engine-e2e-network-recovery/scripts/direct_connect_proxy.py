#!/usr/bin/env python3
"""Run an HTTP CONNECT proxy whose upstream sockets bind to one source IP."""

from __future__ import annotations

import argparse
import ipaddress
import select
import socket
import socketserver
import sys
from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class ProxyConfig:
    source_ip: str
    connect_timeout: float


class ConnectHandler(socketserver.StreamRequestHandler):
    config: ProxyConfig

    def handle(self) -> None:
        upstream: Optional[socket.socket] = None
        try:
            method, authority, _ = self._request_line()
            self._discard_headers()
            if method != "CONNECT":
                self.wfile.write(
                    b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n"
                )
                return

            host, port = split_authority(authority)
            upstream = self._connect(host, port)
            print(
                "CONNECT"
                f" host={host}:{port}"
                f" source={upstream.getsockname()[0]}"
                f" remote={upstream.getpeername()[0]}",
                flush=True,
            )
            self.wfile.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            tunnel(self.connection, upstream)
        except (OSError, ValueError) as exc:
            print(f"PROXY_ERROR {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
            try:
                self.wfile.write(
                    b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"
                )
            except OSError:
                pass
        finally:
            if upstream is not None:
                upstream.close()

    def _request_line(self) -> Tuple[str, str, str]:
        raw_line = self.rfile.readline(65536)
        parts = raw_line.decode("latin1").strip().split()
        if len(parts) != 3:
            raise ValueError("invalid proxy request line")
        return parts[0].upper(), parts[1], parts[2]

    def _discard_headers(self) -> None:
        while True:
            line = self.rfile.readline(65536)
            if line in (b"\r\n", b"\n", b""):
                return

    def _connect(self, host: str, port: int) -> socket.socket:
        source = ipaddress.ip_address(self.config.source_ip)
        family = socket.AF_INET6 if source.version == 6 else socket.AF_INET
        last_error: Optional[OSError] = None
        for address in socket.getaddrinfo(host, port, family, socket.SOCK_STREAM):
            candidate = socket.socket(address[0], address[1], address[2])
            try:
                candidate.settimeout(self.config.connect_timeout)
                candidate.bind((self.config.source_ip, 0))
                candidate.connect(address[4])
                candidate.settimeout(None)
                return candidate
            except OSError as exc:
                last_error = exc
                candidate.close()
        raise last_error or OSError("no compatible upstream address")


class ThreadingProxy(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def split_authority(authority: str) -> Tuple[str, int]:
    host, separator, port = authority.rpartition(":")
    if not separator or not host or not port:
        raise ValueError(f"invalid CONNECT authority: {authority!r}")
    return host.strip("[]"), int(port)


def tunnel(client: socket.socket, upstream: socket.socket) -> None:
    peers = (client, upstream)
    while True:
        readable, _, exceptional = select.select(peers, (), peers)
        if exceptional:
            return
        for current in readable:
            data = current.recv(65536)
            if not data:
                return
            destination = upstream if current is client else client
            destination.sendall(data)


def parse_listen(value: str) -> Tuple[str, int]:
    host, separator, port = value.rpartition(":")
    if not separator or not host or not port:
        raise argparse.ArgumentTypeError("listen must have HOST:PORT form")
    return host, int(port)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-ip", required=True, help="physical source IP")
    parser.add_argument(
        "--listen",
        type=parse_listen,
        default=("127.0.0.1", 18080),
        help="proxy listen address (default: 127.0.0.1:18080)",
    )
    parser.add_argument(
        "--connect-timeout",
        type=float,
        default=10.0,
        help="upstream TCP timeout in seconds (default: 10)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ConnectHandler.config = ProxyConfig(args.source_ip, args.connect_timeout)
    with ThreadingProxy(args.listen, ConnectHandler) as server:
        print(
            f"READY listen={args.listen[0]}:{args.listen[1]} source={args.source_ip}",
            flush=True,
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("STOPPED", flush=True)


if __name__ == "__main__":
    main()
