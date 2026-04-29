# Running HCM as a Windows Service (Always-On)

By default, Hybrid Connection Manager only runs while a user is logged in and the UI is open.
For more reliable operation — especially if the laptop restarts — configure HCM to run as a
**Windows Service** that starts automatically.

## Check if the service is already installed

1. Press `Win + R` → type `services.msc` → Enter.
2. Look for **"Azure Hybrid Connection Manager Service"** or **"HybridConnectionManager"**.
3. If found: right-click → Properties → set Startup type to **"Automatic"** → click **"Start"**.

## If the service is not listed

The HCM installer sometimes installs the service automatically. If it didn't:

1. Open **Command Prompt as Administrator**.
2. Navigate to the HCM install folder (usually):
   ```
   cd "C:\Program Files\Microsoft\HybridConnectionManager"
   ```
3. Register the service:
   ```
   HybridConnectionManagerCmd.exe -install
   ```
4. Start it:
   ```
   net start HybridConnectionManager
   ```

## Configure the service to survive VPN reconnects

The HCM service will automatically attempt to reconnect to Azure Relay after a disruption.
However, if your VPN client disconnects and reconnects, you may need to:

- Set the VPN client to **auto-reconnect**.
- Or configure a Windows Task Scheduler task to restart HCM if VPN drops.

## Verify the service is working

1. In `services.msc`, confirm **Status = Running**.
2. In Azure Portal → App Service → Networking → Hybrid Connections → status should be **"Connected"**.
3. You can now close the HCM UI window — the service runs in the background.

## Laptop-specific tips for reliability

| Setting | Where to change | Recommended value |
|---|---|---|
| Sleep / Hibernate | Power Options (Control Panel) | Never (while plugged in) |
| VPN auto-reconnect | VPN client settings | Enable |
| Windows Update restarts | Group Policy / Settings | Outside business hours |
| HCM service recovery | services.msc → service → Recovery tab | Restart on failure |

To set recovery actions:
1. In `services.msc`, right-click HCM service → **Properties** → **Recovery** tab.
2. Set First/Second/Subsequent failures all to **"Restart the Service"**.
3. Set restart delay to `0` seconds.
