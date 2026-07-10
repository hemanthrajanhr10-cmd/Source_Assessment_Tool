"""
Email helpers using Azure Communication Services (ACS).
No SMTP credentials needed — uses the ACS connection string from Azure Portal.
"""

import threading

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _send(subject: str, html_body: str, to: str) -> None:
    """Send a single email via ACS. Called in a background thread."""
    conn_str = settings.acs_email_connection_string.get_secret_value()
    sender = settings.acs_email_sender
    if not conn_str or not sender:
        logger.warning(
            "ACS email not configured (ACS_EMAIL_CONNECTION_STRING / ACS_EMAIL_SENDER unset) "
            "— skipping email to %s", to
        )
        return

    try:
        from azure.communication.email import EmailClient

        client = EmailClient.from_connection_string(conn_str)
        message = {
            "senderAddress": sender,
            "recipients": {"to": [{"address": to}]},
            "content": {
                "subject": subject,
                "html": html_body,
            },
        }
        poller = client.begin_send(message)
        result = poller.result()
        logger.info("ACS email sent to %s — status: %s", to, result.get("status"))
    except Exception as exc:
        logger.error("ACS email to %s failed: %s", to, exc)


def send_async(subject: str, html_body: str, to: str) -> None:
    """Fire-and-forget — does not block the caller."""
    threading.Thread(target=_send, args=(subject, html_body, to), daemon=True).start()


def send_new_user_notification(email: str, full_name: str | None, user_id: str) -> None:
    """
    Sends an admin notification email when a new user registers.
    The email contains user details and an HTML form to set the retention period.
    Submitting the form calls POST /api/v1/auth/admin/set-retention on the backend.
    """
    display = full_name or email
    backend = settings.backend_url.rstrip("/")

    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body {{font-family: Arial, sans-serif; background:#f4f6f9; padding:32px;}}
    .card {{background:#fff; border-radius:10px; padding:32px; max-width:520px; margin:auto;
            box-shadow:0 2px 12px rgba(0,0,0,.10);}}
    h2 {{color:#1a73e8; margin-top:0;}}
    p {{color:#444; line-height:1.6;}}
    .info {{background:#f0f7ff; border-left:4px solid #1a73e8; padding:12px 16px;
            border-radius:4px; margin:16px 0; font-size:14px;}}
    label {{display:block; font-size:13px; font-weight:bold; color:#333; margin-top:16px;}}
    input[type=number] {{width:100%; padding:10px; border:1px solid #ccc;
                          border-radius:6px; font-size:15px; margin-top:6px; box-sizing:border-box;}}
    button {{margin-top:20px; background:#1a73e8; color:#fff; border:none; padding:12px 28px;
             border-radius:6px; font-size:15px; cursor:pointer; width:100%;}}
    button:hover {{background:#1557b0;}}
    .footer {{text-align:center; margin-top:20px; font-size:12px; color:#999;}}
  </style>
</head>
<body>
  <div class="card">
    <h2>New User Registration — SAT</h2>
    <p>A new user has registered on the <strong>Source Assessment Tool</strong>.</p>
    <div class="info">
      <strong>Name:</strong> {display}<br/>
      <strong>Email:</strong> {email}<br/>
      <strong>User ID:</strong> {user_id}
    </div>
    <p>Please set the <strong>retention period</strong> (in days) for this account.
       The account will be automatically deactivated after this many days.</p>
    <p style="text-align:center; margin:24px 0;">
      <a href="{backend}/api/v1/auth/admin/set-retention?user_id={user_id}"
         style="display:inline-block; background:#1a73e8; color:#fff; text-decoration:none;
                padding:14px 32px; border-radius:6px; font-size:15px; font-weight:bold;">
        Set Retention &amp; Activate Account
      </a>
    </p>
    <p style="font-size:12px; color:#888; text-align:center;">
      Clicking the button will open a page in your browser where you can enter the number of days.
    </p>
    <div class="footer">SAT — Source Assessment Tool &bull; hemanth.rajan@ubtiinc.com</div>
  </div>
</body>
</html>
"""
    send_async(
        subject=f"[SAT] New User Registration: {display}",
        html_body=html,
        to=settings.admin_email,
    )
