/**
 * Minimal server-rendered pages for the links in verification / reset e-mails. No scripts, no
 * external resources; every dynamic value is HTML-escaped (tokens are also format-checked).
 */

export const AUTH_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const TOKEN_FORMAT = /^[A-Fa-f0-9]{32,256}$/;

export function isWellFormedToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_FORMAT.test(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; background: #f6f2ff; color: #2d2440; margin: 0; }
  main { max-width: 420px; margin: 48px auto; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 4px 24px rgba(60, 40, 120, .08); }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { line-height: 1.5; }
  label { display: block; margin: 14px 0 6px; font-weight: 600; }
  input[type=password] { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #c9bde6; border-radius: 10px; font-size: 16px; }
  button { margin-top: 18px; width: 100%; padding: 12px; border: 0; border-radius: 10px; background: #6b4fc8; color: #fff; font-size: 16px; cursor: pointer; }
  .error { color: #b3261e; }
  .en { color: #6d6385; font-size: 14px; direction: ltr; text-align: left; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function invalidLinkPage(): string {
  return layout(
    'קישור לא תקין',
    `<h1>הקישור אינו תקין או שפג תוקפו</h1>
<p>אפשר לבקש קישור חדש מתוך האפליקציה.</p>
<p class="en">This link is invalid or has expired. Request a new one from the app.</p>`,
  );
}

export function verifyEmailFormPage(token: string): string {
  return layout(
    'אימות כתובת מייל',
    `<h1>אימות כתובת המייל</h1>
<p>לחצו על הכפתור כדי לאשר את כתובת המייל של החשבון.</p>
<p class="en">Press the button to confirm your e-mail address.</p>
<form method="post" action="verify-email">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">אישור / Confirm</button>
</form>`,
  );
}

export function emailVerifiedPage(): string {
  return layout(
    'המייל אומת',
    `<h1>כתובת המייל אומתה</h1>
<p>אפשר לחזור לאפליקציה ולהתחבר.</p>
<p class="en">Your e-mail is verified. Return to the app and sign in.</p>`,
  );
}

export function resetPasswordFormPage(token: string, error?: string): string {
  const errorBlock = error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : '';
  return layout(
    'איפוס סיסמה',
    `<h1>בחירת סיסמה חדשה</h1>
${errorBlock}
<form method="post" action="reset-password">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label for="newPassword">סיסמה חדשה / New password</label>
<input id="newPassword" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
<label for="confirmPassword">אימות סיסמה / Confirm password</label>
<input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
<button type="submit">שמירה / Save</button>
</form>`,
  );
}

export function passwordResetDonePage(): string {
  return layout(
    'הסיסמה עודכנה',
    `<h1>הסיסמה עודכנה</h1>
<p>אפשר לחזור לאפליקציה ולהתחבר עם הסיסמה החדשה. כל החיבורים הקודמים נותקו.</p>
<p class="en">Your password was changed and all previous sessions were signed out.</p>`,
  );
}
