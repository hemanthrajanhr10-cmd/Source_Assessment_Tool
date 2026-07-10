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

    # Color palette mirrors the SAT application theme exactly
    # Canvas: #F0FAF9 | Base: #FFFFFF | Brand-400: #6CBDB5 | Brand-300: #93CCC6
    # Text primary: #0D1117 | Text secondary: #2D4A47 | Text tertiary: #5A7A77
    # Border: #B2DDD9 | Subtle: #E5F5F3 | Muted: #C8E9E6

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
<body style="margin:0;padding:0;background-color:#F0FAF9;
             font-family:Arial,Helvetica,sans-serif;
             -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:#F0FAF9;min-width:100%;">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">

      <!-- Container -->
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;width:100%;">

        <!-- ── Logo bar ── -->
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- Teal icon container -->
                <td style="background-color:#6CBDB5;border-radius:10px;
                           padding:9px 11px;vertical-align:middle;">
                  <!-- Database SVG icon as inline image fallback using Unicode block -->
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;
                               color:#FFFFFF;line-height:1;">&#128447;</span>
                </td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:19px;
                               font-weight:700;color:#0D1117;letter-spacing:-0.02em;">
                    Source Assessment Tool
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Main card ── -->
        <tr>
          <td style="background-color:#FFFFFF;
                     border:1px solid #B2DDD9;
                     border-radius:16px;
                     padding:0;
                     overflow:hidden;
                     box-shadow:0 4px 16px rgba(108,189,181,0.10),0 1px 4px rgba(0,0,0,0.04);">

            <!-- Teal gradient top bar -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#6CBDB5;height:4px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- Card body -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- Header section -->
              <tr>
                <td style="padding:36px 40px 24px;">

                  <!-- Event badge -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                         style="margin-bottom:18px;">
                    <tr>
                      <td style="background-color:#E5F5F3;border:1px solid #C8E9E6;
                                 border-radius:9999px;padding:4px 14px;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;
                                     font-weight:700;color:#358F87;letter-spacing:0.07em;
                                     text-transform:uppercase;">
                          &#x25CF;&nbsp; New Registration
                        </span>
                      </td>
                    </tr>
                  </table>

                  <!-- Headline -->
                  <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
                             font-size:22px;font-weight:700;color:#0D1117;
                             line-height:1.2;letter-spacing:-0.02em;">
                    Action Required
                  </p>

                  <!-- Sub-copy -->
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                             font-size:14px;color:#5A7A77;line-height:1.6;">
                    A new user has registered on SAT and is awaiting activation.
                    Set their retention period to grant access.
                  </p>

                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td style="padding:0 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#E5F5F3;height:1px;font-size:0;line-height:0;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- ── User detail block ── -->
              <tr>
                <td style="padding:28px 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                         style="background-color:#F0FAF9;border:1px solid #C8E9E6;border-radius:10px;">

                    <!-- Block header -->
                    <tr>
                      <td style="padding:12px 20px;border-bottom:1px solid #C8E9E6;">
                        <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                     font-weight:700;color:#6CBDB5;letter-spacing:0.12em;
                                     text-transform:uppercase;">
                          User Details
                        </span>
                      </td>
                    </tr>

                    <!-- Name row -->
                    <tr>
                      <td style="padding:16px 20px 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="76" style="vertical-align:top;padding-top:1px;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                           font-weight:700;color:#93CCC6;letter-spacing:0.1em;
                                           text-transform:uppercase;">Name</span>
                            </td>
                            <td style="vertical-align:top;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;
                                           font-weight:600;color:#0D1117;">{display}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Email row -->
                    <tr>
                      <td style="padding:12px 20px 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="76" style="vertical-align:top;padding-top:2px;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                           font-weight:700;color:#93CCC6;letter-spacing:0.1em;
                                           text-transform:uppercase;">Email</span>
                            </td>
                            <td style="vertical-align:top;">
                              <span style="font-family:'Courier New',Courier,monospace;font-size:13px;
                                           color:#2D4A47;">{email}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- User ID row -->
                    <tr>
                      <td style="padding:12px 20px 18px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="76" style="vertical-align:top;padding-top:2px;">
                              <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;
                                           font-weight:700;color:#93CCC6;letter-spacing:0.1em;
                                           text-transform:uppercase;">User ID</span>
                            </td>
                            <td style="vertical-align:top;">
                              <span style="font-family:'Courier New',Courier,monospace;font-size:11px;
                                           color:#5A7A77;word-break:break-all;">{user_id}</span>
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
                         style="background-color:#E5F5F3;border:1px solid #B2DDD9;border-radius:10px;">
                    <tr>
                      <td style="padding:14px 18px;">
                        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                                   color:#2D4A47;line-height:1.6;">
                          <span style="color:#4DA8A0;font-weight:700;">&#9432;&nbsp;</span>
                          This account is inactive until a retention period is set.
                          Once activated, it will be automatically deactivated after the specified number of days.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- ── CTA button ── -->
              <tr>
                <td align="center" style="padding:0 40px 40px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center"
                          style="background-color:#6CBDB5;border-radius:10px;
                                 box-shadow:0 4px 14px rgba(108,189,181,0.35);">
                        <a href="{action_url}"
                           style="display:inline-block;padding:14px 38px;
                                  font-family:Arial,Helvetica,sans-serif;
                                  font-size:14px;font-weight:700;
                                  color:#FFFFFF;text-decoration:none;
                                  letter-spacing:0.01em;border-radius:10px;">
                          Set Retention &amp; Activate Account &#8594;
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;
                             font-size:11px;color:#93CCC6;text-align:center;line-height:1.5;">
                    Opens a page in your browser where you can enter the number of days.
                  </p>
                </td>
              </tr>

            </table>
            <!-- end card body -->

          </td>
        </tr>
        <!-- end main card -->

        <!-- ── Footer ── -->
        <tr>
          <td style="padding:28px 0 0;" align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <p style="margin:0 0 5px;font-family:Arial,Helvetica,sans-serif;
                             font-size:12px;color:#5A7A77;">
                    <strong style="color:#6CBDB5;">SAT</strong>
                    &nbsp;&mdash;&nbsp;Source Assessment Tool
                  </p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                             font-size:11px;color:#93CCC6;">
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

</body>
</html>"""

    send_async(
        subject=f"[SAT] New User Registration: {display}",
        html_body=html,
        to=settings.admin_email,
    )
