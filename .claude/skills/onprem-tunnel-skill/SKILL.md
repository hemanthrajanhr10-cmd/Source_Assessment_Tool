---
name: onprem-tunnel-connectivity
description: >
  Expert guidance for securely connecting cloud-hosted applications to on-premises resources
  (databases, APIs, file servers, services) over encrypted tunnels — without opening inbound
  firewall ports, setting up VPNs, or requiring public IPs. Use this skill whenever the user
  mentions: connecting a cloud app to on-prem data, "self-hosted tunnel", "reverse proxy",
  Cloudflare Tunnel, ngrok, frp, WireGuard, or anything involving remote access to private
  infrastructure from a cloud service. Also trigger when users ask how to expose SQL Server,
  PostgreSQL, MongoDB, Redis, internal APIs, or file shares to a cloud app securely.
  Covers architecture design, tool selection, security hardening, user isolation patterns,
  and full Python backend scaffolding.
---

# On-Prem to Cloud Secure Connectivity Skill

## What This Skill Covers

- Choosing the right tunneling technology for the use case
- Designing secure, production-ready architectures
- User isolation patterns (credential-level vs. tunnel-level)
- Scaffolding Python backends that manage connections at runtime
- Security hardening checklist (encryption, secrets, least-privilege)

---

## Step 1 — Understand the Use Case

Before recommending a solution, gather:

| Question | Why it matters |
|---|---|
| What resource is being exposed? (SQL, API, filesystem…) | Determines TCP vs. HTTP tunnel needs |
| What cloud platform? (Azure, AWS, GCP, self-hosted) | Affects where the client-side agent runs |
| Is it multi-user? Do users bring their own credentials? | Determines isolation strategy |
| IT constraints — can they install software on-prem? | Rules in/out certain agents |
| Is this dev/staging or production? | Affects reliability/HA requirements |

If the user's message already answers most of these, skip to Step 2.

---

## Step 2 — Select the Right Tunneling Technology

See `references/tunnel-options.md` for the full comparison table and setup commands per tool.

**Quick decision guide:**

```
User needs TCP (SQL, Redis, raw sockets)?
  └─ No inbound ports / no public IP?
       ├─ Production, managed, low-ops → Cloudflare Tunnel (best default)
       ├─ Dev/testing, short-lived     → ngrok (acceptable for non-prod)
       └─ Full control, self-hosted    → frp or WireGuard
  └─ Inbound port is OK / has public IP?
       └─ WireGuard VPN (most performant, most complex)

User needs HTTP only?
  └─ Cloudflare Tunnel (free, TLS handled, Zero Trust optional)
```

**Default recommendation for most production use cases: Cloudflare Tunnel.**
- Free for outbound TCP
- Single lightweight agent on-prem (~80MB, runs as a service)
- No inbound firewall rules, no router config, no public IP needed
- TLS encrypted end-to-end

---

## Step 3 — Design the Architecture

Draw or describe the architecture before writing code. Standard pattern:

```
Cloud App (Azure / AWS / GCP)
        │
        │  connects to tunnel endpoint (e.g. db.yourdomain.com:1433)
        ▼
Tunnel Broker (Cloudflare / ngrok cloud / frp server)
        │
        │  persistent outbound connection (port 443)
        ▼
Tunnel Agent (cloudflared / ngrok agent / frpc) — runs on-prem as a service
        │
        │  direct TCP/localhost
        ▼
On-Prem Resource (SQL Server, Postgres, Redis, internal API…)
```

For **multi-user** apps (users each have their own on-prem credentials):
- One tunnel, app-level credential isolation (standard, simpler)
- One tunnel per user (stronger isolation, more ops overhead — rare need)

---

## Step 4 — Scaffold Python Backend

Use the templates in `references/python-templates.md` for:

- `connection_store.py` — SQLAlchemy model to store per-user encrypted connection configs
- `crypto.py` — AES-256-GCM encryption/decryption for secrets at rest (uses `cryptography` lib)
- `connection_manager.py` — Runtime connect/disconnect to tunneled resources
- `api_routes.py` — FastAPI routes: save connection, test connection, execute query, list connections
- `cloudflared_manager.py` — Optional: programmatic Cloudflare Tunnel provisioning via API

Always adapt templates to the user's actual resource type (database driver, API client, etc.).

---

## Step 5 — Security Checklist

Always include this when delivering a solution:

- [ ] **Secrets at rest**: Encrypt all credentials with AES-256-GCM; store encryption key in a secrets manager (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, or `.env` for dev only)
- [ ] **Secrets in transit**: Tunnel provides TLS; also use SSL/TLS on the resource itself where possible
- [ ] **User isolation**: Every DB/API query scoped to `WHERE user_id = current_user` — never share credentials across users
- [ ] **Least privilege**: On-prem SQL user should have only the minimum grants needed
- [ ] **Audit logging**: Log all connection events and query executions (user, timestamp, resource, success/fail)
- [ ] **Tunnel agent hardened**: Agent runs as a non-root service account; no inbound ports open
- [ ] **Rotation plan**: Encryption key and credentials should be rotatable without downtime

---

## Output Format

When responding to a tunneling request, structure your answer as:

1. **Architecture diagram** (ASCII or description)
2. **Tool recommendation + why**
3. **On-prem setup steps** (what IT needs to do once)
4. **Python scaffolding** (connection store, crypto, runtime manager, API routes)
5. **Security summary table**

Keep code complete and runnable. Use `asyncio` + `asyncpg` / `aiomysql` / `aiohttp` where appropriate for non-blocking I/O. Use `FastAPI` as the default web framework unless the user specifies otherwise.

---

## Reference Files

- `references/tunnel-options.md` — Full comparison of Cloudflare Tunnel, ngrok, frp, WireGuard with setup commands
- `references/python-templates.md` — Full Python code templates for all components
