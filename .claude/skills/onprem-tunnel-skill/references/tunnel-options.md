# Tunnel Options Reference

## Full Comparison Table

| | Cloudflare Tunnel | ngrok | frp | WireGuard |
|---|---|---|---|---|
| Cost | Free (TCP needs domain) | Free tier / Paid | Free, open source | Free, open source |
| TCP support | ✅ | ✅ | ✅ | ✅ |
| HTTP support | ✅ | ✅ | ✅ | ✅ |
| Inbound ports needed | ❌ None | ❌ None | ⚠️ Server needs open port | ⚠️ UDP port needed |
| On-prem install | One binary (cloudflared) | One binary | One binary (frpc) | WireGuard kernel module |
| Self-hosted broker | ❌ Cloudflare-managed | ❌ ngrok-managed | ✅ You run frps | ✅ You run the server |
| TLS / encryption | ✅ End-to-end | ✅ End-to-end | ⚠️ Manual TLS config | ✅ WireGuard protocol |
| Production ready | ✅ | ⚠️ (stability varies) | ✅ | ✅ |
| Multi-tenant | ⚠️ App-level only | ⚠️ App-level only | ⚠️ App-level only | ✅ Network isolation |
| Best for | Most production use cases | Dev/testing | Self-hosted prod | Network-level isolation |

---

## Cloudflare Tunnel

### When to use
- Production workloads
- IT teams that want minimal on-prem footprint
- No public IP, no firewall changes required
- SQL Server, PostgreSQL, Redis, or internal HTTP APIs

### On-Prem Setup (Linux)

```bash
# Install
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Authenticate (opens browser)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create my-sql-tunnel

# Create config
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml << EOF
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: db.yourdomain.com
    service: tcp://127.0.0.1:1433
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns my-sql-tunnel db.yourdomain.com

# Install and start as service
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
```

### On-Prem Setup (Windows)

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create my-sql-tunnel

# Config at C:\Users\<user>\.cloudflared\config.yml
# (same YAML structure as Linux above)

cloudflared service install
net start cloudflared
```

---

## ngrok

### When to use
- Dev or staging environments only
- Quick demos, short-lived tunnels
- Not recommended for production SQL (unstable free tier, no persistent hostnames without paid plan)

### Setup

```bash
# Install
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Authenticate
ngrok config add-authtoken <your-token>

# Expose TCP (e.g. SQL Server)
ngrok tcp 1433

# Expose HTTP
ngrok http 8080
```

**Note**: Free tier assigns a random hostname/port on each start. Use paid plan for reserved addresses.

---

## frp (Fast Reverse Proxy)

### When to use
- You want full self-hosted control
- You already run a server with a public IP
- Need custom domain + TCP without paying Cloudflare

### Architecture

```
frpc (on-prem agent) ──outbound──► frps (your VPS/server with public IP) ◄── cloud app
```

### frps (server — runs on your VPS)

```ini
# frps.ini
[common]
bind_port = 7000
token = your-secret-token
```

```bash
./frps -c frps.ini
```

### frpc (client — runs on-prem)

```ini
# frpc.ini
[common]
server_addr = your.vps.ip
server_port = 7000
token = your-secret-token

[sql-server]
type = tcp
local_ip = 127.0.0.1
local_port = 1433
remote_port = 11433
```

```bash
./frpc -c frpc.ini
```

Cloud app then connects to `your.vps.ip:11433`.

---

## WireGuard

### When to use
- You need true network-level isolation between users
- High throughput requirements
- You want a full VPN (not just a port tunnel)
- Team has Linux networking experience

### Setup overview

Server (VPS or cloud VM):
```bash
sudo apt install wireguard
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
# Configure /etc/wireguard/wg0.conf — see WireGuard docs
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

Client (on-prem):
```bash
sudo apt install wireguard
# Add peer config pointing to server
# sudo wg-quick up wg0
```

WireGuard is the most powerful option but requires the most ops knowledge. Only recommend it when network-layer isolation is genuinely needed.
