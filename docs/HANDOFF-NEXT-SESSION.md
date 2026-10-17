# Handoff לסשן הבא — Malinvosky (צילה תכשיטים)

נכתב: 2026-10-15, עודכן 2026-10-17 (QA חי מקצה לקצה ותיקונים לפרודקשן). המסמך הזה הוא נקודת הפתיחה לסשן הבא. ההיסטוריה המלאה של סבבי ההקשחה (1–5) נמצאת ב-`docs/HANDOFF.md`, ומעקב הפערים מול ה-PRD ב-`docs/prd-gap-audit.md`.

> **אין במסמך הזה סיסמאות או מפתחות.** איפה כל סוד יושב — בסעיף 9.

---

## 0. המצב בשורה אחת

- **שרת (NestJS):** רץ ב-Render על `https://jewlery.onrender.com`, עם PostgreSQL של Render. כל המיגרציות וה-seed רצו.
- **אפליקציה (React Native, בלי Expo):** נבנית בענן של Expo (EAS). APK ל-Android, ו-iOS ב-TestFlight.
- **קוד:** סבב 5 (התאמה מלאה ל-PRD) הושלם ונדחף ל-GitHub. אחריו נוספו: אייקונים, סרגל ניווט RTL, תיקון כפתורים, והתחברות עם Apple.
- **17.10:** ייצוא STL/OBJ/HD, תמונות התצוגה של העיצובים וההדמיה על תמונה אישית נבנים מהגיאומטריה של העיצוב עצמו — אין יותר תחליפים או מודלי דמה. השרת בפרודקשן עודכן. **האפליקציה צריכה בנייה חדשה ב-EAS כדי שהמשתמשים יקבלו את השינויים** (סעיף 7).
- **מה פתוח עכשיו (לפי סדר):** סעיף 7.

---

## 1. איפה הכול נמצא

| מה | איפה |
|---|---|
| קוד | `E:\deploy\צילה תכשיטים\Malinvosky-main\Malinvosky-main` (`backend/`, `app/`, `docs/`) |
| Git (repo נפרד!) | `E:/claude-work/malinvosky/repo.git` — תיקיית הפרויקט עצמה **אינה** repo |
| GitHub | https://github.com/rotem1230/jewlery (פרטי). remote בשם `origin`, ענף `main` |
| כלים וקבצים זמניים | `E:/claude-work/malinvosky/tmp/` (סקריפטים של סבב 5 ב-`tmp/round5/`) |
| PostgreSQL מקומי לטסטים | `E:/claude-work/malinvosky/pgtool` + `tmp/round5/pg-dev.cjs` (כרגע **כבוי**) |
| רשימת ממצאים | `E:/claude-work/malinvosky/findings.md` (עותק: `docs/hardening-findings-tracker.md`) |
| מסמך פריסה למפעיל | `docs/production-readiness.md` |
| מעקב PRD | `docs/prd-gap-audit.md` (כולל החלטות D1–D8 לאישור בעלת המוצר) |

### עבודה עם git — חובה בכל פקודה
```bash
export GIT_DIR=E:/claude-work/malinvosky/repo.git GIT_WORK_TREE="E:/deploy/צילה תכשיטים/Malinvosky-main/Malinvosky-main"
git log --oneline -5
```

| Commit | תוכן | ב-GitHub? |
|---|---|---|
| `17d90a7` | סבב 5: התאמה ל-PRD, review אחד, מסמכים | ✅ |
| `dcb97bd` | בניות ראשונות ב-EAS, אייקונים, ניווט RTL, כפתורים שלא נחתכים | ✅ |
| `3745b38` | התחברות עם Apple (iOS), חבילת Google, hook משותף | ✅ |
| `1eacdb4` | מסמך handoff | ✅ |
| 17.10 "Real exports, previews and try-on…" | גיאומטריה פרמטרית, ייצוא, תצוגות, הדמיה, אחסון במסד, keep-alive | ✅ |

---

## 2. כללי סביבה (חשוב)

1. **דיסק C: ו-D: מלאים לגמרי (0 בייט).** כל קובץ זמני ו-cache — על E:.
   - טסטים של האפליקציה:
     ```bash
     TEMP="E:/claude-work/malinvosky/tmp" TMP="E:/claude-work/malinvosky/tmp" node node_modules/jest/bin/jest.js --ci --cacheDirectory E:/claude-work/malinvosky/jest-cache
     ```
     בלי זה jest נכשל ב-`ENOSPC` למרות שכל הטסטים עוברים.
   - שרת: `export npm_config_cache="E:/claude-work/malinvosky/npm-cache" TEMP="E:/claude-work/malinvosky/tmp" TMP="E:/claude-work/malinvosky/tmp" EMBEDDED_PG_MODULE_DIR="E:/claude-work/malinvosky/pgtool"`
   - **לא מחקתי שום קובץ ב-C:** — המשתמש צריך לפנות מקום בעצמו (רוב התפוסה לא מהפרויקט הזה).
2. **לא לגעת בפרויקטים אחרים על המכונה** (kuku, RAI על פורט 3100, bot-torim, teachup...). תהליכי postgres — רק לפי הנתיב `E:/claude-work/malinvosky/pgtool`.
3. **לא להשתמש ב-npx.** מריצים `node node_modules/...`.
4. **`backend/.env`** — ערכי פיתוח של בעל הפרויקט, כולל `TRIPO_API_KEY` אמיתי (ב-gitignore). לא לדלוף.
5. **`backend/.env.render.local`** — כתובת ה-**External** של מסד הנתונים ב-Render (כולל סיסמה). ב-gitignore (`.env.*.local`). משמש להרצת מיגרציות/שאילתות מהמחשב:
   ```bash
   cd backend; set -a; . ./.env.render.local; set +a
   node node_modules/prisma/build/index.js migrate deploy
   ```
6. **EAS בלי git:** בכל פקודת `eas` צריך `EAS_NO_VCS=1` (ב-PowerShell: `$env:EAS_NO_VCS = '1'`). מה שלא נשלח לענן מוגדר ב-`app/.easignore`.
7. **bug-finder (MCP)** עובד (סוקר שינויים לפי נתיבים) — להריץ `review_changes` אחרי כל שינוי.
8. **הטרמינל של Bash** לפעמים נופל על `tail`/fork (cygheap) — לכתוב פלט לקובץ ולקרוא אותו.

---

## 3. שרת בפרודקשן — Render

| פריט | ערך |
|---|---|
| Web Service | `jewlery` (srv-db7nduo473hc73e0gir0), **Free**, Region **Oregon** |
| כתובת | https://jewlery.onrender.com — API ב-`/api/v1`, בריאות ב-`/api/v1/health` |
| בנייה | Docker, Root Directory `backend`, Dockerfile Path `./Dockerfile` |
| מסד נתונים | `jewelry-db` (dpg-db7nc2bncjis73eu48eg-a), PostgreSQL 18, **Free**, Oregon |
| מיגרציות | כולן הוחלו, כולל `20261017130000_design_preview_key` (17.10) |
| seed | הורץ ב-production (בלי חשבונות דמו): קטלוג, מסלולים, מידות טבעת PRD, תבניות הודעה בעברית |
| דגל `phase3_oauth` | **דלוק** (שונה ידנית במסד, `enabled=true`, `rolloutPct=100`) |
| דגל `phase2_visualization` | **דלוק** מ-17.10 (הדמיה על תמונה אישית, למסלול Designer Pro) |
| תכני המסלולים | בעברית (עם אנגלית לצד) — עודכנו במסד ב-17.10 רק היכן שהיה עדיין הטקסט האנגלי המקורי |

### משתני סביבה שהוגדרו ב-Render (שמות בלבד)
`NODE_ENV=production`, `DATABASE_URL` (Internal), `JWT_SECRET`, `TRIAL_HASH_SECRET`, `UPLOAD_URL_SECRET`, `API_PUBLIC_URL`, `CORS_ORIGINS`, `TRUST_PROXY=1`, `JOBS_ENABLED=true`, `SMTP_URL` (Resend, `smtp.resend.com:2465`), `MAIL_FROM=onboarding@resend.dev`.

**חסר / לבדוק:**
- `APPLE_CLIENT_ID=com.malinvoskyapp` — **ביקשתי מהמשתמש להוסיף. בלי זה התחברות Apple מחזירה 503 `OAUTH_NOT_CONFIGURED`.**
- `GOOGLE_CLIENT_ID` — רק כשיוגדרו מזהי Google (סעיף 7).
- `TRIPO_API_KEY` — **לא מוגדר**. בלעדיו "השראת AI" מחזירה 503 `AI_NOT_CONFIGURED` (אין מודלי דמה). המשתמש מוסיף ב-Render → Environment.

### מגבלות ידועות של המסלול החינמי
- **השרת נרדם** אחרי חוסר פעילות — בקשה ראשונה עד כדקה.
- **Render חוסם SMTP בפורטים 25/465/587** במסלול Free (לכן Gmail נכשל ב-`Connection timeout`, ועברנו ל-Resend בפורט 2465).
- **אין דיסק קבוע:** לכן קבצים נשמרים במסד הנתונים (`STORAGE_DRIVER=database`, ברירת המחדל בפרודקשן) — הם שורדים פריסות. הם נספרים בנפח המסד החינמי (1GB): לעקוב, ובהמשך לעבור לאחסון אובייקטים (R2/S3).
- **המסד החינמי יימחק ב-13 בנובמבר 2026** — לשדרג לפני כן. אין גיבויים.

### מיילים
- Resend במצב בדיקה: שולח **רק ל-`rotem122510@gmail.com`**. לכל כתובת אחרת: שגיאה 550 בלוג.
- **המשתמש יביא מחר דומיין מאומת.** הצעדים: ב-Resend → Domains → Add Domain → להוסיף את רשומות ה-DNS (TXT/MX/DKIM) אצל מנהל הדומיין → אחרי אימות, ב-Render לשנות `MAIL_FROM` ל-`no-reply@<הדומיין>`. `SMTP_URL` נשאר.
- הלוגים שמראים שליחה: `Mail sent to=...` (הצלחה) / `Verification mail for user ... failed: ...` (כישלון).
- כלי עזר: Resend API (`GET https://api.resend.com/emails`) מראה סטטוס מסירה (delivered/bounced).

### מצב המשתמשים במסד
- 15.10: נמחקו כל חשבונות הבדיקה (3) לבקשת המשתמש. אחר כך נרשם שוב `rotem122510@gmail.com`; נשלח לו קישור אימות ישיר (המייל "delivered" אבל לא נמצא אצלו). **לבדוק בסשן הבא אם החשבון אומת.**

---

## 4. אפליקציה — בניות (EAS / TestFlight)

| פריט | ערך |
|---|---|
| חשבון Expo | `rotem001` (מחובר ב-CLI במחשב) |
| פרויקט EAS | `@rotem001/malinvoskyapp`, ID `b41aea9c-d809-42c6-ba73-f508d6169066` |
| הגדרות | `app/eas.json`: `preview` = APK ל-Android, `production` = iOS לחנות + `ascAppId` |
| כתובת שרת בבנייה | `API_BASE_URL=https://jewlery.onrender.com/api/v1` (ב-`eas.json`) |
| Android | `com.malinvoskyapp`, מפתח חתימה מנוהל ב-EAS (נוצר 14.10) |
| iOS | Bundle `com.malinvoskyapp`, ASC App ID `6822741753`, Team `F9KUCUL58Y` (Rotem Antsel, Individual), Apple ID `antselrotem@gmail.com` |
| העלאה ל-TestFlight | מפתח ASC API `HDV3Q2YWV4` שמור ב-EAS; קבוצת בודקים פנימית "Team (Expo)" |

### פקודות
```bash
cd app
EAS_NO_VCS=1 eas build -p android --profile preview --non-interactive --no-wait
EAS_NO_VCS=1 eas build -p ios --profile production --non-interactive --no-wait --auto-submit
EAS_NO_VCS=1 eas build:view <build-id> --json
```
**כשמוסיפים יכולת (capability) חדשה ל-iOS** — הבנייה חייבת לרוץ **אינטראקטיבית** (בלשונית טרמינל), כדי שהמשתמש יתחבר ל-Apple ו-EAS יעדכן את ה-App ID וה-provisioning profile.

### בניות
| בנייה | מצב |
|---|---|
| iOS build 3 | ב-TestFlight (אייקון) |
| iOS build 4 | ב-TestFlight (ניווט RTL + כפתורים) |
| **iOS build 5** | **רץ בלשונית הטרמינל "iOS build (Apple sign-in)" — מחכה שהמשתמש יתחבר ל-Apple. אחרי זה עולה אוטומטית ל-TestFlight.** |
| Android APK אחרון שהושלם | https://expo.dev/artifacts/eas/tdGK_3eYxK7fIPfrOevwJfRNqnQbnDq_FyP5mVg2EDU.apk |
| **Android APK חדש (Apple/Google)** | build `9c877401-4ca1-455f-8bc9-301fad984141` — **לבדוק סטטוס** |
| **בנייה חדשה ל-17.10 (Android + iOS)** | **לא הופעלה.** נדרשת כדי שהסטודיו, ההדמיה והייצוא החדשים יגיעו למשתמשים. הקרדיטים החינמיים של EAS נוצלו — כל בנייה עולה כסף, רק באישור המשתמש. |

### דברים שתוקנו בדרך לבניות (לא לשבור)
- **ספריית הקלטה** `react-native-audio-recorder-player` לא מתקמפלת על RN 0.86 → `app/scripts/patch-native-modules.cjs` רץ ב-`postinstall` (גם בשרתי EAS), עם טסט. נכשל בקול אם הספרייה משתנה.
- **אייקונים:** `app/scripts/build-app-icons.py` (Python + PIL) מייצר את כל גדלי iOS ו-Android מהלוגו (`assets/images/malinovsky-logo.svg`).
- **Info.plist:** `CFBundleIconName=AppIcon`, תיאור הרשאת מיקום, `ITSAppUsesNonExemptEncryption=false` (לא נעצר על Export Compliance).
- **entitlements:** `app/ios/MalinvoskyApp/MalinvoskyApp.entitlements` עם `com.apple.developer.applesignin`.

---

## 5. מה נעשה בקוד מאז סבב 5

1. **סרגל ניווט תחתון RTL** — `src/lib/rtl.ts` (`navRowDirection`), `TabBar.tsx`. האפליקציה מכבה RTL אוטומטי (`I18nManager.allowRTL(false)`) ופורסת ידנית; לכן הפיכה נעשית ידנית לכל שורה שתלויה בסדר קריאה. **אם המשתמש ישלח צילומים של מסכים "הפוכים" נוספים — לתקן באותה שיטה.**
2. **כפתורים לא נחתכים** — `BrandButton`: `numberOfLines={2}` + `adjustsFontSizeToFit` + `minimumFontScale={0.8}`.
3. **התחברות עם Apple** (iOS בלבד) — `src/lib/socialSignIn.ts`, `src/hooks/useSocialSignIn.ts`, `src/components/auth/AppleAuthButton.tsx`, במסכי Login/Signup. בהרשמה: דורש אישור תנאים; אם נבחר "צורף" — מוסיף את התפקיד ועובר אליו.
4. **Google** — החבילה `@react-native-google-signin/google-signin@16.1.5` מותקנת; הכפתור **מוסתר** עד שיש `GOOGLE_WEB_CLIENT_ID` בבנייה.
5. חבילת Apple: `@invertase/react-native-apple-authentication@2.5.1`.
6. **17.10 — QA חי ותיקונים לפרודקשן:**
   - `backend/src/jewelry`: גיאומטריה פרמטרית (טבעת לפי טבלת המידות, פס, ראש שיניים/משבצת/פאווה, אבנים, אלמנטים, שרשראות, עגילים) — אותו קוד רץ בסטודיו של האפליקציה (`app/scripts/sync-jewelry-geometry.cjs` מייצר `jewelryGeometry.generated.ts`; טסט משווה sha256).
   - ייצוא STL/OBJ/PNG_HD אמיתי (STEP נדחה ב-400), תמונות תצוגה לעיצובים (ברקע, לפי מפתח תוכן), הדמיה שמרכיבה את התכשיט על התמונה במקום שהמעצב בחר.
   - קבצים נשמרים ב-PostgreSQL (`upload_blobs`) — שורדים פריסות ב-Render.
   - AI: רק Tripo (נמחק ה-dummy), image-to-model מתמונת ההשראה.
   - **תוקן באמולטור:** שכבת התכשיט בהדמיה לא הוצגה (תמונה ב-Android לא שולחת headers — נטענת עכשיו עם ה-session), והעלאת התמונה הראשונה אחרי הפסקה נכשלה (Node סוגר חיבורים אחרי 5 שניות — עכשיו 65).

### מצב טסטים אחרון
- **אפליקציה (17.10):** 55 קבצים, **293/293**, tsc 0, lint 0 שגיאות (84 אזהרות).
- **שרת (17.10):** 63 קבצים, **653/653** בריצה מלאה (כולל `test/migrations`).

---

## 6. החלטות שהתקבלו בסשן הזה

- **Clerk — נדחה.** המשתמש שקל להחליף את ההתחברות ב-Clerk; הוסבר שה-SDK שלהם דורש Expo (האפליקציה RN נקי, RN 0.86), שזה שינוי ארכיטקטוני גדול, ושבעיית המיילים נפתרת באימות דומיין. **החלטה: נשארים עם ההתחברות הקיימת.**
- **לא Vercel** — השרת צריך תהליך רץ (WebSocket, jobs, דיסק). נבחר Render עם Docker.
- **Supabase — לא בשימוש.** המסד הוא PostgreSQL של Render.
- כפתור Apple רק במכשירי Apple; Google מוסתר עד הגדרה.
- הוסר מחשבון App Store Connect המשתמש `mabdullah2942@gmail.com` (Admin) לבקשת המשתמש. נשארו 6 הזמנות שפג תוקפן (Developer) — המשתמש לא ביקש לנקות.

---

## 7. מה פתוח — לפי סדר עדיפות

**קודם כול (17.10):**
- **לשחרר את האפליקציה:** בנייה חדשה ל-Android (APK) ול-iOS (TestFlight) — עולה כסף ב-EAS, רק באישור המשתמש. אחר כך לעבור על הסטודיו, הייצוא וההדמיה על מכשיר אמיתי מול השרת בפרודקשן.
- **`TRIPO_API_KEY` ב-Render** — כדי שהשראת AI תעבוד (לא נבדק חי מול Tripo).

**ואחר כך:**

1. **iOS build 5** — לוודא שהמשתמש התחבר ל-Apple בלשונית הטרמינל, שהבנייה הסתיימה ועלתה ל-TestFlight.
2. **`APPLE_CLIENT_ID=com.malinvoskyapp` ב-Render** — לוודא שהמשתמש הוסיף, ואז לבדוק התחברות Apple על אייפון אמיתי.
3. **דחיפה ל-GitHub** של `3745b38` — אחרי אישור המשתמש.
4. **דומיין ל-Resend** (המשתמש מביא מחר) → `MAIL_FROM` חדש → לבדוק הרשמה עם כתובת חיצונית.
5. **Google sign-in** (אם המשתמש רוצה):
   - Google Cloud Console: מזהי OAuth מסוג Web, Android (עם SHA-1 של מפתח החתימה מ-EAS — ב-expo.dev → Credentials), ו-iOS (`com.malinvoskyapp`).
   - באפליקציה: `GOOGLE_WEB_CLIENT_ID` ב-`eas.json` (ולהוסיף `GOOGLE_IOS_CLIENT_ID` + URL scheme הפוך ב-Info.plist), ו-`iosClientId` ב-`googleSignIn.ts`.
   - בשרת: `GOOGLE_CLIENT_ID` ב-Render עם שלושת המזהים.
   - **כלל App Store:** אם יש Google — חובה גם Apple (כבר קיים).
6. **שדרוג Render:** Web Service ל-Starter (בלי הירדמות; רינדור מהיר יותר), ו-Postgres למסלול בתשלום לפני 13.11.2026 (גם בגלל נפח הקבצים שנשמרים במסד).
7. **סודות שנחשפו בצ'אט — להחליף:** סיסמת מסד הנתונים ב-Render, מפתח Resend, סיסמת אפליקציה של Gmail (לבטל — כבר לא בשימוש), ומפתח Tripo אם נדרש.
8. **לפנות מקום ב-C:** (המשתמש).
9. **החלטות מוצר** D1–D8 ושאלות 🟡 ב-`docs/prd-gap-audit.md`.
10. **לא נבדק על מכשיר** — רוב מסכי סבב 5 נבדקו רק ב-jest/tsc/lint. עכשיו כשיש TestFlight ו-APK, לעבור על זרימות מלאות על מכשיר.

---

## 8. איך מריצים טסטים

### אפליקציה
```bash
cd app
TEMP="E:/claude-work/malinvosky/tmp" TMP="E:/claude-work/malinvosky/tmp" node node_modules/jest/bin/jest.js --ci --cacheDirectory E:/claude-work/malinvosky/jest-cache
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
```

### שרת (Postgres מקומי, DB חדש לכל ריצה)
```bash
bash E:/claude-work/malinvosky/tmp/round5/run-e2e.sh E:/claude-work/malinvosky/tmp/round5/<log>.log [jest args]
# בסוף העבודה:
node E:/claude-work/malinvosky/tmp/round5/pg-dev.cjs stop
```
- `test/migrations` רגיש לעומס (timeouts של 60 שניות) — להריץ לבד כשהמכונה שקטה.
- typecheck: `node node_modules/typescript/bin/tsc -p tsconfig.test.json --noEmit`; drift: `node scripts/check-migrations.cjs`.
- smoke: `SMOKE_API_PORT=3112 SMOKE_PG_PORT=55434 node scripts/e2e-local.cjs` (אחרי `nest build`).

---

## 9. סודות — איפה הם (בלי ערכים)

| סוד | איפה |
|---|---|
| כתובת המסד (Internal) | Render → jewlery → Environment (`DATABASE_URL`) |
| כתובת המסד (External) | Render → jewelry-db → Connect; מקומית ב-`backend/.env.render.local` (gitignored) |
| JWT / TRIAL / UPLOAD secrets | Render Environment (נוצרו ב-Generate) |
| SMTP (Resend API key) | Render Environment (`SMTP_URL`) |
| Tripo | `backend/.env` מקומי (gitignored); **עדיין לא ב-Render** — להוסיף כדי שהשראת AI תעבוד |
| חתימת Android | EAS (expo.dev → Credentials) |
| תעודת הפצה / provisioning iOS | EAS; מפתח ASC API `HDV3Q2YWV4` ב-EAS |
| Apple ID | של המשתמש (`antselrotem@gmail.com`) — רק הוא מקליד סיסמה/קוד |

**נחשפו בצ'אט ויש להחליף:** סיסמת המסד, מפתח Resend, סיסמת אפליקציה של Gmail (`rotem122510`).
