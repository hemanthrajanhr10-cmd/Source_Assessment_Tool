"""
SMTP email helpers for SAT admin notifications.
"""

import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _send(subject: str, html_body: str, to: str) -> None:
    """Send a single email. Runs in a background thread so it never blocks a request."""
    smtp_user = settings.smtp_username
    smtp_pass = settings.smtp_password.get_secret_value()
    if not smtp_user or not smtp_pass:
        logger.warning("SMTP not configured — skipping email to %s", to)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{smtp_user}>"
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to], msg.as_string())
        logger.info("Email sent to %s — %s", to, subject)
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)


def send_async(subject: str, html_body: str, to: str) -> None:
    """Fire-and-forget email — does not block the caller."""
    threading.Thread(target=_send, args=(subject, html_body, to), daemon=True).start()


def send_new_user_notification(email: str, full_name: str | None, user_id: str) -> None:
    """
    Email sent to the admin when a new user registers.
    Contains a small HTML form the admin submits to set the retention period.
    The form POSTs to the backend /api/v1/auth/admin/set-retention endpoint.
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
    <form method="POST" action="{backend}/api/v1/auth/admin/set-retention">
      <input type="hidden" name="user_id" value="{user_id}"/>
      <label for="days">Retention Period (days)</label>
      <input type="number" id="days" name="days" min="1" max="3650"
             placeholder="e.g. 30" required/>
      <button type="submit">Set Retention &amp; Activate Account</button>
    </form>
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
