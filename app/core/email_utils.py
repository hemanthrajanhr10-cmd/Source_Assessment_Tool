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
    Links to GET /admin/set-retention?user_id=... which opens a browser form
    (Outlook desktop/web blocks in-email form submissions).
    """
    display = full_name or email
    backend = settings.backend_url.rstrip("/")
    action_url = f"{backend}/api/v1/auth/admin/set-retention?user_id={user_id}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <title>New User Registration</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:#09090b;min-width:100%;">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">

      <!-- Container -->
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;width:100%;">

        <!-- ── Logo bar ── -->
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#1c1a14;border:1px solid #3a3010;
                           border-radius:10px;padding:10px 14px;vertical-align:middle;">
                  <!-- Database icon (SVG, amber) -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:10px;">
                        <img src="https://img.icons8.com/ios-filled/28/f59e0b/database.png"
                             width="28" height="28" alt="SAT"
                             style="display:block;border:0;outline:none;"/>
                      </td>
                      <td style="vertical-align:middle;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:17px;
                                     font-weight:700;color:#f4f4f5;letter-spacing:-0.02em;">
                          Source Assessment Tool
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Main card ── -->
        <tr>
          <td style="background-color:#18181b;border:1px solid #3f3f46;border-radius:12px;
                     padding:0;overflow:hidden;">

            <!-- Amber top accent line -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#f59e0b;height:3px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- Card content -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:36px 40px 12px;">

                  <!-- Event badge -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                         style="margin-bottom:20px;">
                    <tr>
                      <td style="background-color:#1c1a14;border:1px solid #3a3010;
                                 border-radius:9999px;padding:4px 12px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                                     font-weight:700;color:#f59e0b;letter-spacing:0.08em;
                                     text-transform:uppercase;">
                          &#x25CF;&nbsp; New Registration
                        </span>
                      </td>
                    </tr>
                  </table>

                  <!-- Headline -->
                  <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
                             font-size:22px;font-weight:700;color:#f4f4f5;line-height:1.2;
                             letter-spacing:-0.02em;">
                    Action Required
                  </p>
                  <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;
                             font-size:14px;color:#a1a1aa;line-height:1.6;">
                    A new user has registered on SAT and is awaiting activation.
                    Set their retention period to grant access.
                  </p>

                </td>
              </tr>

              <!-- ── User detail block ── -->
              <tr>
                <td style="padding:0 40px 28px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                         style="background-color:#09090b;border:1px solid #3f3f46;border-radius:8px;">

                    <!-- Block header -->
                    <tr>
                      <td style="padding:12px 20px;border-bottom:1px solid #27272a;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                     font-weight:700;color:#71717a;letter-spacing:0.1em;
                                     text-transform:uppercase;">
                          User Details
                        </span>
                      </td>
                    </tr>

                    <!-- Name row -->
                    <tr>
                      <td style="padding:14px 20px 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="80" style="vertical-align:top;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                           font-weight:700;color:#71717a;letter-spacing:0.1em;
                                           text-transform:uppercase;">Name</span>
                            </td>
                            <td style="vertical-align:top;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                                           font-weight:600;color:#f4f4f5;">{display}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Email row -->
                    <tr>
                      <td style="padding:10px 20px 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="80" style="vertical-align:top;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                           font-weight:700;color:#71717a;letter-spacing:0.1em;
                                           text-transform:uppercase;">Email</span>
                            </td>
                            <td style="vertical-align:top;">
                              <span style="font-family:'Courier New',Courier,monospace;font-size:13px;
                                           color:#a1a1aa;">{email}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- User ID row -->
                    <tr>
                      <td style="padding:10px 20px 16px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="80" style="vertical-align:top;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                           font-weight:700;color:#71717a;letter-spacing:0.1em;
                                           text-transform:uppercase;">User ID</span>
                            </td>
                            <td style="vertical-align:top;">
                              <span style="font-family:'Courier New',Courier,monospace;font-size:12px;
                                           color:#71717a;word-break:break-all;">{user_id}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>

              <!-- ── Info note ── -->
              <tr>
                <td style="padding:0 40px 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                         style="background-color:#1c1a14;border:1px solid #3a3010;border-radius:8px;">
                    <tr>
                      <td style="padding:14px 18px;">
                        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                                   color:#a1a1aa;line-height:1.6;">
                          <span style="color:#f59e0b;font-weight:700;">&#9432;&nbsp;</span>
                          The account is inactive until a retention period is set.
                          Once activated, it will be automatically deactivated after the specified number of days.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- ── CTA button ── -->
              <tr>
                <td align="center" style="padding:0 40px 36px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#f59e0b;border-radius:8px;">
                        <a href="{action_url}"
                           style="display:inline-block;padding:14px 36px;
                                  font-family:Arial,Helvetica,sans-serif;font-size:14px;
                                  font-weight:700;color:#09090b;text-decoration:none;
                                  letter-spacing:0.01em;border-radius:8px;">
                          Set Retention &amp; Activate Account &#8594;
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;
                             font-size:11px;color:#71717a;text-align:center;line-height:1.5;">
                    Opens in your browser. You will be prompted to enter the number of days.
                  </p>
                </td>
              </tr>

            </table>
            <!-- end card content -->

          </td>
        </tr>
        <!-- end main card -->

        <!-- ── Footer ── -->
        <tr>
          <td style="padding:28px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid #27272a;padding-top:24px;" align="center">
                  <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                             color:#71717a;letter-spacing:0.05em;">
                    <span style="color:#f59e0b;">&#9632;</span>&nbsp;
                    <strong style="color:#a1a1aa;">SAT</strong>
                    &nbsp;&mdash;&nbsp;Source Assessment Tool
                  </p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                             color:#52525b;">
                    UBTI &bull; hemanth.rajan@ubtiinc.com
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- end container -->

    </td>
  </tr>
</table>
<!-- end outer wrapper -->

</body>
</html>"""

    send_async(
        subject=f"[SAT] New User Registration: {display}",
        html_body=html,
        to=settings.admin_email,
    )
