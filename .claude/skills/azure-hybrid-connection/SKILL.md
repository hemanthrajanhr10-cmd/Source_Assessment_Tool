---
name: azure-hybrid-connection
description: >
  Use this skill whenever a user wants to connect an Azure-hosted application
  to an on-premises resource (SQL Server, database, internal API, file share)
  using Azure Hybrid Connections. Trigger on any mention of: "hybrid connection",
  "on-prem SQL from Azure", "Hybrid Connection Manager", "HCM", "replace gateway
  with hybrid connection", "VPN + Hybrid Connection", or "Azure App Service
  reaching on-prem". Also trigger when a user says their app can't reach an
  internal server and they're on Azure App Service. Covers full end-to-end setup,
  connection string configuration, and troubleshooting — especially the VPN +
  Hybrid Connection Manager laptop pattern.
---

# Azure Hybrid Connection Skill

Guides the user through the **full end-to-end process** of setting up an Azure Hybrid
Connection so that an Azure App Service can reach an on-premises SQL Server (or other
internal resource). Written for beginners — explain every portal click.

---

## Architecture Overview (explain this first)

Before starting, always draw the mental model for the user:

```
Azure App Service
      │
      │  outbound HTTPS (port 443) through Azure Relay
      ▼
Azure Relay (cloud broker, no inbound firewall holes needed)
      │
      │  persistent outbound connection
      ▼
Hybrid Connection Manager (HCM)
  installed on a laptop/server that is ON the on-prem network
  (e.g., laptop connected to VPN that reaches the SQL Server)
      │
      │  direct TCP connection
      ▼
On-Prem SQL Server (e.g., 192.168.1.50:1433)
```

Key points to emphasise:
- **No inbound firewall rules needed** on the on-prem side — HCM makes outbound connections only.
- The laptop running HCM **must stay connected to the VPN** while the app needs DB access.
- This works on Azure App Service **Standard tier and above** (not Free/Shared/Basic).

---

## Step 1 — Verify App Service Plan Tier

1. In the [Azure Portal](https://portal.azure.com), open your **App Service**.
2. In the left menu, click **"Scale up (App Service plan)"**.
3. Confirm the plan is **Standard (S1 or higher)**, Premium, or Isolated.
   - If it's Free, Shared, or Basic → upgrade first. Hybrid Connections require Standard+.

---

## Step 2 — Create the Hybrid Connection in the Portal

1. In your App Service's left menu, scroll down to **"Settings"** → click **"Networking"**.
2. Click on **"Hybrid connections"** (under "Outbound Traffic").
3. Click **"+ Add hybrid connection"** at the top.
4. Click **"Create new hybrid connection"**.
5. Fill in the form:
   - **Hybrid connection name**: anything descriptive, e.g. `onprem-sqlserver`
   - **Endpoint host**: the **hostname or IP** of your SQL Server as seen from the on-prem network, e.g. `192.168.1.50` or `sqlserver.internal`
   - **Endpoint port**: `1433` (default SQL Server port)
   - **Servicebus namespace**: click "Create new" → give it a name like `myapp-relay` → choose a region close to your App Service.
6. Click **"OK"** then **"Create"**.

After a moment, you'll see the Hybrid Connection listed with status **"Not connected"** — that's expected until we install HCM.

---

## Step 3 — Download the Hybrid Connection Manager (HCM)

1. Still in the Hybrid Connections panel, click on the connection you just created.
2. Click **"Download connection manager"** — this downloads an `.msi` installer.
3. Copy/move the `.msi` to your **laptop** (the one that will be on the VPN).

---

## Step 4 — Install and Configure HCM on the Laptop

> **Do this on the laptop that connects to the VPN.**

1. **Connect your laptop to the VPN** that gives access to the on-prem SQL Server first.
2. Run the `.msi` installer → follow the prompts → install with default settings.
3. After install, open **"Hybrid Connection Manager UI"** from the Start menu.
4. Click **"+ Add a new Hybrid Connection"**.
5. You'll be asked to sign in with your **Azure account** (the same one that owns the App Service).
6. After sign-in, your Hybrid Connection (`onprem-sqlserver`) will appear — select it and click **"Save"**.
7. HCM will establish the outbound tunnel to Azure Relay.

Back in the Azure Portal → App Service → Networking → Hybrid Connections, the status should now show **"Connected"** (may take 30–60 seconds to update).

---

## Step 5 — Update the Application's Connection String

The app must use the **Hybrid Connection endpoint host and port** (exactly as entered in Step 2) — not a public address.

### Node.js (using `mssql` or `tedious`)

```js
const sql = require('mssql');

const config = {
  server: '192.168.1.50',   // must match "Endpoint host" from Step 2
  port: 1433,               // must match "Endpoint port" from Step 2
  database: 'YourDatabase',
  user: 'your_sql_user',
  password: process.env.DB_PASSWORD,  // use environment variable, never hardcode
  options: {
    encrypt: false,          // set true only if SQL Server has TLS configured
    trustServerCertificate: true,
  },
};

const pool = await sql.connect(config);
```

### Python (using `pyodbc`)

```python
import pyodbc, os

conn_str = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=192.168.1.50,1433;"   # must match endpoint host:port from Step 2
    "DATABASE=YourDatabase;"
    "UID=your_sql_user;"
    f"PWD={os.environ['DB_PASSWORD']};"
    "TrustServerCertificate=yes;"
)
conn = pyodbc.connect(conn_str)
```

### Setting environment variables in Azure App Service

Never put passwords in code. Store them as App Settings:

1. App Service → left menu → **"Configuration"** → **"Application settings"** tab.
2. Click **"+ New application setting"**.
3. Name: `DB_PASSWORD`, Value: your SQL Server password.
4. Click **"OK"** → **"Save"** → **"Continue"**.

---

## Step 6 — Remove the Old Gateway Connection

Once the Hybrid Connection is verified working (see troubleshooting below):

1. Go to App Service → Networking → **VNet integration** (where the old Gateway connection lives).
2. Click **"Disconnect"** or remove the VNet integration.
3. Confirm the app still works — the Hybrid Connection is now the sole path to the DB.

---

## Troubleshooting Guide

Read `references/troubleshooting.md` for the full troubleshooting decision tree.

Quick reference:

| Symptom | Likely cause | Fix |
|---|---|---|
| Status stuck on "Not connected" | HCM not running / VPN not active | Check HCM UI, reconnect VPN |
| App times out connecting to DB | Wrong endpoint host/port in connection string | Must match exactly what was entered in Step 2 |
| "Login failed" SQL error | Credentials wrong | Verify SQL user/password; check SQL Server auth mode |
| Works on laptop, fails in App Service | HCM machine went to sleep | Disable sleep/hibernation on HCM machine |
| Suddenly stopped working | VPN dropped | Reconnect VPN; HCM will auto-reconnect |
| Port 443 blocked on laptop | Corporate firewall | HCM needs outbound 443 to `*.servicebus.windows.net` |

---

## Important Limitations to Tell the User

- HCM machine (laptop) **must be on and connected to VPN** whenever the app needs the DB. If the laptop sleeps or VPN drops, the app loses DB access.
- For production workloads, consider running HCM on a **dedicated always-on server** rather than a laptop.
- Hybrid Connections support **one endpoint per connection**. If you need multiple on-prem hosts, create separate Hybrid Connections for each.
- Max **25 Hybrid Connections** per App Service on Standard; 200 on Premium.

---

## Reference Files

- `references/troubleshooting.md` — Detailed troubleshooting decision tree
- `references/hcm-service-setup.md` — How to run HCM as a Windows Service (for always-on scenarios)
