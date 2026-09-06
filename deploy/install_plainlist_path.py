#!/usr/bin/env python3
"""Insert /wepaper/ reverse-proxy into the existing plainlist.space 443 vhost."""

from __future__ import annotations

from pathlib import Path

CONF = Path("/www/server/panel/vhost/nginx/plainlist.space.conf")
SNIPPET = """    location = /wepaper {
        return 301 /wepaper/$is_args$args;
    }
    location ^~ /wepaper/ {
        proxy_pass http://127.0.0.1:8788/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_hide_header Authorization;
        proxy_force_ranges on;
        gzip off;
        client_max_body_size 80m;
    }

"""


def main() -> None:
    text = CONF.read_text()
    if "location ^~ /wepaper/" in text:
        print("already present")
        return
    idx = text.rfind("    location / {")
    if idx < 0:
        raise SystemExit("could not find 443 location / anchor")
    CONF.write_text(text[:idx] + SNIPPET + text[idx:])
    print("inserted /wepaper/ location")


if __name__ == "__main__":
    main()
