# Troubleshooting Azure Hybrid Connections

## Decision Tree

### Problem: Status shows "Not connected" in Azure Portal

1. **Is HCM running on the laptop?**
   - Open Task Manager → look for `HybridConnectionManager` process.
   - Or open "Hybrid Connection Manager UI" from Start menu — it should show "Connected".
   - If not running: open the HCM UI and re-add the connection.

2. **Is the laptop connected to the VPN?**
   - The VPN must be active _before_ HCM can reach the on-prem SQL Server.
   - Reconnect VPN → wait 60 seconds → check portal status again.

3. **Can HCM reach Azure Relay (port 443)?**
   - HCM needs outbound HTTPS (port 443) to `*.servicebus.windows.net`.
   - If on a corporate network, ask IT to whitelist that domain.
   - Test: open a browser on the laptop and visit `https://servicebus.windows.net` — should return a 200/404 (not a timeout).

4. **Is the Azure Relay namespace in a healthy region?**
   - Check [Azure Status](https://status.azure.com) for Service Bus / Relay outages.

---

### Problem: App connects to Azure but times out reaching SQL Server

1. **Does the endpoint host/port in the Hybrid Connection match exactly what the app uses in its connection string?**
   - Example: if you entered `192.168.1.50` and port `1433` in Step 2, your connection string must use `192.168.1.50` and `1433`.
   - Common mistake: using `localhost`, a DNS name, or a different IP in the connection string.

2. **Can the HCM laptop actually reach the SQL Server?**
   - On the laptop, open a command prompt and run:
     ```
     telnet 192.168.1.50 1433
     ```
     (Enable Telnet: Control Panel → Programs → Turn Windows features on/off → Telnet Client)
   - If telnet fails: the laptop can't reach SQL Server — VPN issue or firewall on SQL Server machine.

3. **Is SQL Server's TCP/IP protocol enabled?**
   - On the SQL Server machine: open **SQL Server Configuration Manager**.
   - SQL Server Network Configuration → Protocols for [instance] → TCP/IP → must be **Enabled**.
   - After enabling, restart the SQL Server service.

4. **Is port 1433 open on the SQL Server machine's Windows Firewall?**
   - On SQL Server machine: Windows Defender Firewall → Inbound Rules → look for SQL Server rule on port 1433.
   - If missing: add a new inbound rule for TCP port 1433.

---

### Problem: "Login failed for user" error

1. **Is SQL Server Authentication enabled?** (not just Windows Authentication)
   - SQL Server Management Studio → right-click server → Properties → Security → set to **"SQL Server and Windows Authentication mode"**.
   - Restart SQL Server service after changing.

2. **Is the username/password correct?**
   - Test by connecting with SSMS from the laptop using the same credentials.

3. **Does the SQL user have access to the database?**
   - In SSMS: Security → Logins → find the user → Properties → User Mapping → confirm database is checked.

---

### Problem: Worked before, suddenly stopped

| What changed | Fix |
|---|---|
| Laptop went to sleep | Wake it up; HCM will auto-reconnect within ~60 seconds |
| VPN disconnected | Reconnect VPN |
| Laptop restarted | Re-open HCM UI and check connection is active (or set HCM to run as a service — see `hcm-service-setup.md`) |
| Azure Relay namespace deleted | Recreate the Hybrid Connection from scratch (Step 2 in main skill) |
| App Service plan downgraded | Upgrade back to Standard or higher |

---

### Problem: Works in development, fails only in Azure App Service

- Confirm the Hybrid Connection is associated with the **correct App Service** (not a different slot or different app).
- Check App Service → Networking → Hybrid Connections — the connection should be listed and show "Connected".
- Confirm the App Service's connection string / environment variable uses the same host/port as the Hybrid Connection endpoint (not a public address or localhost).
- Check if the App Service has outbound restrictions (e.g., VNet integration with route-all enabled) that could block Azure Relay traffic on port 443.

---

### Logging and Diagnostics

**HCM logs (on the laptop):**
```
C:\ProgramData\Microsoft\HybridConnectionManager\Logs\
```
Look for connection errors or authentication failures.

**App Service logs:**
- App Service → Monitoring → **Log stream** — watch for connection errors in real time.
- App Service → Diagnose and solve problems → "Connection issues" detector.

**Azure Relay metrics:**
- Azure Portal → your Service Bus / Relay namespace → Metrics.
- Watch `Listener Connections` — should be > 0 when HCM is connected.
- Watch `Sender Connections` — spikes when app sends a query through the relay.
