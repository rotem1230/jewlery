# Handoff לסשן הבא — Malinvosky (צילה תכשיטים)

נכתב: 2026-10-15, עודכן 2026-10-17 (QA חי מקצה לקצה ותיקונים לפרודקשן), 2026-10-19/20 (מסלולים, סליקת Cardcom, החזרים, ניהול ודוחות). המסמך הזה הוא נקודת הפתיחה לסשן הבא. ההיסטוריה המלאה של סבבי ההקשחה (1–5) נמצאת ב-`docs/HANDOFF.md`, ומעקב הפערים מול ה-PRD ב-`docs/prd-gap-audit.md`.

> **אין במסמך הזה סיסמאות או מפתחות.** איפה כל סוד יושב — בסעיף 9.

---

## 0. המצב בשורה אחת

- **שרת (NestJS):** מ-18.10 רץ בחשבון ה-Render **של הלקוחה** (בתשלום, פרנקפורט) על `https://api.malinovskyjewelry.com` (דומיין שלה; Render: `https://jewlery-djia.onrender.com`), עם PostgreSQL בתשלום (גיבויים). כל הנתונים הועתקו מהחשבון הישן (pg_dump/pg_restore, ספירות זהות). השירות הישן `jewlery.onrender.com` בחשבון הקודם — לכבות אחרי שהאפליקציות החדשות בחוץ.
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
4. **`backend/.env`** — ערכי פיתוח של בעל הפרויקט, כולל מפתח AI אמיתי (ב-gitignore). לא לדלוף.
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
| כתובת | **https://api.malinovskyjewelry.com** (CNAME `api` → `jewlery-djia.onrender.com` ב-cPanel של LiveDNS) — API ב-`/api/v1`, בריאות ב-`/api/v1/health` |
| חשבון חדש (הלקוחה) | Web Service `srv-dbagi1rrjlhs73a6hadg` (Starter), Postgres `dpg-dbafqs67bikc73eflbgg` (פרנקפורט, בתשלום). כתובת חיצונית מקומית ב-`backend/.env.render-new.local` (gitignored) |
| חשבון ישן (Free, אורגון) | שירות `jewlery` + מסד `jewelry-db` — **לא להשתמש; לכבות** אחרי המעבר. הנתונים בו קפואים מ-18.10 |
| בנייה | Docker, Root Directory `backend`, Dockerfile Path `./Dockerfile` |
| מסד נתונים | `jewelry-db` (dpg-db7nc2bncjis73eu48eg-a), PostgreSQL 18, **Free**, Oregon |
| מיגרציות | כולן הוחלו, כולל `20261019120000_pricing_table_plans` (19.10, על המסד בחשבון החדש) |
| מסלולים (19.10) | seed הורץ ב-production אחרי הפריסה של `133f817`: 9 המסלולים של טבלת התמחור. גיבוי לפני: `E:/claude-work/malinvosky/backups/prod-before-pricing-20261019-1628.dump` |
| `lead_definition.enforceQuota` | **true** מ-19.10 — צורף בלי לידים פנויים לא מקבל בקשות עד הרבעון הבא |
| seed | הורץ ב-production (בלי חשבונות דמו): קטלוג, מסלולים, מידות טבעת PRD, תבניות הודעה בעברית |
| דגל `phase3_oauth` | **דלוק** (שונה ידנית במסד, `enabled=true`, `rolloutPct=100`) |
| דגל `phase2_visualization` | **דלוק** מ-17.10 (הדמיה על תמונה אישית, למסלול Designer Pro) |
| תכני המסלולים | בעברית (עם אנגלית לצד) — עודכנו במסד ב-17.10 רק היכן שהיה עדיין הטקסט האנגלי המקורי |

### משתני סביבה שהוגדרו ב-Render (שמות בלבד)
`NODE_ENV=production`, `DATABASE_URL` (Internal), `JWT_SECRET`, `TRIAL_HASH_SECRET`, `UPLOAD_URL_SECRET`, `API_PUBLIC_URL`, `CORS_ORIGINS`, `TRUST_PROXY=1`, `JOBS_ENABLED=true`, `SMTP_URL` (Resend, `smtp.resend.com:2465`), `MAIL_FROM=onboarding@resend.dev`.

**חסר / לבדוק:**
- `APPLE_CLIENT_ID=com.malinvoskyapp` — **ביקשתי מהמשתמש להוסיף. בלי זה התחברות Apple מחזירה 503 `OAUTH_NOT_CONFIGURED`.**
- `GOOGLE_CLIENT_ID` — רק כשיוגדרו מזהי Google (סעיף 7).
- `GEMINI_API_KEY` — **לא מוגדר**. בלעדיו "השראת AI" מחזירה 503 `AI_NOT_CONFIGURED` (אין תמונות דמה). מפתח מ-https://aistudio.google.com/apikey על פרויקט עם חיוב (למודלי תמונה אין מסלול חינמי). המשתמש מוסיף ב-Render → Environment.

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
| כתובת שרת בבנייה | `API_BASE_URL=https://api.malinovskyjewelry.com/api/v1` (ב-`eas.json`; מ-18.10) |
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
| iOS #9 (18.10) | ב-TestFlight |
| Android APK (18.10) | https://expo.dev/artifacts/eas/BouMaU1EeRpRrwuzd56-kwX83pVcVdhRkjCBGD-ouoU.apk |
| iOS #10 (19.10) — מסלולים, Cardcom, ניהול, החלפת כרטיס, תשלום תכשיטים | הועלה ל-App Store Connect / TestFlight (build `6823db90`) |
| Android APK (19.10) | https://expo.dev/artifacts/eas/IbOJZP3jpiVFSYfMnl29VcPmDsZFOTKgAfv1VcCGnn0.apk (build `5e2280f7`) |
| **iOS #11 (20.10)** — + מסך "מנויים ולידים" | הועלה ל-App Store Connect / TestFlight (build `e62ce5fb`) |
| **Android APK (20.10)** — אותו קוד | https://expo.dev/artifacts/eas/jWP3JT6LAs2ZyWldnmABoRMVcfHVqrTgnayF0NlR7o0.apk (build `4756db5d`) |

הקרדיטים החינמיים של EAS לחודש נוצלו — כל בנייה עולה כסף, רק באישור המשתמש. iOS בלי יכולת (capability) חדשה רץ לא-אינטראקטיבית (מפתח ASC שמור ב-EAS).

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
   - AI (ענף `feature/google-ai-inspiration-image`): "צור באמצעות AI" יוצר **תמונת השראה** עם Gemini של גוגל (`gemini-3.1-flash-image`), כפי שה-PRD מגדיר (5.4 שלב 7: ספק ליצירת תמונות), מההערה ומתמונת ההשראה אם יש. התמונה נשמרת כתמונת ההשראה של העיצוב ומגיעה לצורף. נקודת חזרה: תג `before-google-ai-image` (גרסת Tripo).
   - **תוקן באמולטור:** שכבת התכשיט בהדמיה לא הוצגה (תמונה ב-Android לא שולחת headers — נטענת עכשיו עם ה-session), והעלאת התמונה הראשונה אחרי הפסקה נכשלה (Node סוגר חיבורים אחרי 5 שניות — עכשיו 65).

### מצב טסטים אחרון
- **אפליקציה (20.10):** 65 קבצים, **363/363**, tsc 0, lint 0 שגיאות.
- **שרת (20.10):** 72 קבצים, **794/794** בריצה מלאה (כולל `test/migrations`, Cardcom מול `test/utils/fake-cardcom.ts`).
- **אפליקציה (17.10):** 55 קבצים, **293/293**, tsc 0, lint 0 שגיאות (84 אזהרות).
- **שרת (17.10):** 63 קבצים, **653/653** בריצה מלאה (כולל `test/migrations`).

---

## 6. החלטות שהתקבלו בסשן הזה

- **Clerk — נדחה.** המשתמש שקל להחליף את ההתחברות ב-Clerk; הוסבר שה-SDK שלהם דורש Expo (האפליקציה RN נקי, RN 0.86), שזה שינוי ארכיטקטוני גדול, ושבעיית המיילים נפתרת באימות דומיין. **החלטה: נשארים עם ההתחברות הקיימת.**
- **לא Vercel** — השרת צריך תהליך רץ (WebSocket, jobs, דיסק). נבחר Render עם Docker.
- **Supabase — לא בשימוש.** המסד הוא PostgreSQL של Render.
- כפתור Apple רק במכשירי Apple; Google מוסתר עד הגדרה.
- הוסר מחשבון App Store Connect המשתמש `mabdullah2942@gmail.com` (Admin) לבקשת המשתמש. נשארו 6 הזמנות שפג תוקפן (Developer) — המשתמש לא ביקש לנקות.

### מסלולים לפי טבלת התמחור של הלקוחה (19.10)
המשתמש ביקש להחליף את המסלולים לטבלה של הלקוחה, ובחר: לבנות לפי הטבלה (המחירים נתונים במסד, ניתנים לשינוי), חינם = 10 יצירות AI **בחודש**, "ללא הגבלה" = שימוש הוגן **1,200 יצירות בשנה / 40 לידים ברבעון**, וכשנגמרים הלידים — **עוצרים עד הרבעון הבא** (אין חיוב על ליד נוסף).

| קוד | מחיר (₪) | מחזור | מה כלול |
|---|---|---|---|
| `DESIGNER_FREE` | 0 | חודשי | 10 יצירות AI בחודש |
| `DESIGNER_PREMIUM_QUARTERLY` | 45 | רבעוני | 150 יצירות + יכולות הפרימיום |
| `DESIGNER_PREMIUM_ANNUAL` | 149 | שנתי | 600 יצירות + פרימיום |
| `DESIGNER_PREMIUM_UNLIMITED` | 299 | שנתי | "ללא הגבלה" (1,200) + פרימיום |
| `JEWELER_TRIAL` | 0 | רבעוני | 3 לידים — **כל צורף חדש נרשם אליו אוטומטית בפרסום הפרופיל** |
| `JEWELER_BASIC_QUARTERLY` | 390 | רבעוני | 10 לידים |
| `JEWELER_PROFESSIONAL` | 525 | רבעוני | 15 לידים |
| `JEWELER_BUSINESS` | 640 | רבעוני | 20 לידים |
| `JEWELER_UNLIMITED` | 990 | רבעוני | "ללא הגבלה" (40) |

- המסלולים הישנים (`DESIGNER_PRO`, `JEWELER_BASIC`, `JEWELER_ACTIVE`) הוצאו מההצעה במיגרציה `20261019120000_pricing_table_plans`; מנויים קיימים עליהם ממשיכים עד שהם נגמרים.
- מסלולים בתשלום שומרים את 14 ימי הניסיון שהיו (לא היה בטבלה — אפשר לכבות: `trialDays=0`).
- מכסת AI: הרשאה `ai_renders` (ה-`limitValue` הוא המכסה לתקופת החיוב). בלי מסלול שקובע — מכסת `DESIGNER_FREE` על 30 הימים האחרונים. יצירה שנכשלה לא נספרת. המגבלה היומית (`ai_limits.dailyPerUser`, 10) נשארת בנוסף. קוד שגיאה `AI_PLAN_QUOTA_EXCEEDED`.
- **עלות AI אמיתית:** `gemini-3.1-flash-image` ב-1K = $0.067 לתמונה (≈0.25 ₪), פי 10 מההנחה בטבלה (0.7 סנט). בשנתי 600 יצירות ≈ 149 ₪ — כל המחיר. נמסר למשתמש.
- רבעון = 91 ימים (`billingCyclePeriodMs`).
- סעיף 3 בטבלה של הלקוחה (ניהול מסלולים, דוחות, עלויות, שימוש הוגן) — מומש, ראו "החזרים, כרטיס, מעבר מסלול, תכשיטים, ניהול ודוחות" למטה.

### סליקה — Cardcom (19.10, בקוד; מחכה לפרטי המסוף)
המשתמש התחבר ל-Cardcom וביקש סליקה בתוך האפליקציה (הוסבר לו הסיכון ב-App Store למינויים דיגיטליים; בחר בתוך האפליקציה). התיעוד נלקח מה-OpenAPI הרשמי: `https://secure.cardcom.solutions/swagger/v11/swagger.json` (עותק מקומי ב-`E:/claude-work/malinvosky/cardcom-docs/`).

- **רכישה:** `POST /subscriptions/checkout` פותח דף תשלום (`LowProfile/Create`, `Operation=ChargeAndCreateToken`, שקלים, עברית, תשלום אחד, חשבונית/קבלה במייל). `ReturnValue` = מזהה ה-checkout. כל ניסיון — דף משלו. האפליקציה פותחת אותו ב-WebView (`PaymentSheet`) ונסגרת בדף החזרה.
- **אישור:** ההתראה של Cardcom (`POST /webhooks/cardcom`) **לא חתומה** — לוקחים ממנה רק `LowProfileId` ומאמתים מול Cardcom (`LowProfile/GetLpResult`). רק עסקה שאושרה, בסכום ובמטבע של ה-checkout, ובמסוף שלנו — מפעילה את המסלול (דרך `PaymentWebhookService.record`, פעם אחת בלבד). אחרת: נשמר לבדיקה (`NEEDS_REVIEW`). גם דף החזרה (`GET /payments/cardcom/return`) ו-`GET /subscriptions/checkout/:id` מאמתים מול Cardcom — המסלול מתחיל גם אם ההתראה מתעכבת.
- **הכרטיס:** הטוקן נשמר בטבלה נפרדת `payment_methods` (לא חלק מתשובות ה-API, לא בלוגים, לא ב-payload של האירועים).
- **חידושים:** ב-sweep של מחזור החיים — 12 שעות לפני סוף התקופה, חיוב הטוקן (`Transactions/Transaction`) עם `ExternalUniqTranId=renewal:<sub>:<סוף תקופה>:<ניסיון>`; לפני כל חיוב בודקים אם ניסיון קודם כבר עבר (`GetTransactionByExternalUniqTran`) — אין חיוב כפול גם כשתשובה אבדה. סירוב → past due, ניסיון חוזר פעם ביום עד סוף תקופת החסד (7 ימים). מנוי שבוטל — לא מחויב.
- **להפעלה בפרודקשן:** (1) מיגרציה `20261019180000_cardcom_payments` למסד **לפני** פריסת הקוד (עמודות חדשות שהקוד קורא); (2) ב-Render: `PAYMENTS_PROVIDER=cardcom`, `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME` (ו-`CARDCOM_DOCUMENTS=false` אם אין מודול מסמכים); (3) בדיקה אמיתית: רכישה בסכום קטן ← הפעלה ← החזר מממשק Cardcom.

### החזרים, כרטיס, מעבר מסלול, תכשיטים, ניהול ודוחות (19–20.10)
המשתמש ביקש להשלים הכול מקצה לקצה עם TDD, ובחר: כסף התכשיטים נכנס **לחשבון הפלטפורמה** ומועבר לצורף **ידנית**; ניהול = **מסכים בתוך האפליקציה** (תפקיד `ADMIN`); מעבר בין מסלולים בתשלום — **בסוף התקופה הנוכחית**.

- **מיגרציה:** `20261020100000_payments_admin_reports` — `payment_refunds`, `payment_method_updates`, `jeweler_payouts`, `media_traffic_daily`, `usage_alerts`, ועמודות: `subscriptions.pendingPlanId`, `payment_methods.cardLast4`, `subscription_invoices.provider`, `ai_generation_jobs.costIls`, ובתשלומי תכשיטים `paymentUrl`/`transactionId`/`paidAt` + סטטוס `REFUNDED`. **להריץ על המסד לפני פריסת הקוד.**
- **החזרים** (`RefundsService`, `Transactions/RefundByTransactionId`): `POST /admin/payments/invoices/:id/refunds` (מלא או חלקי, סיבה חובה, `requestId` — לחיצה כפולה = אותו החזר; `endSubscription` מסיים את המנוי). שורת `PENDING` נשמרת תחת נעילה לפני הפנייה ל-Cardcom, כך שסכום ההחזרים לא עובר את הסכום ששולם. תשובה שאבדה = `UNKNOWN` → נבדק ידנית בממשק Cardcom ונסגר ב-`POST /admin/refunds/:id/resolve`. תור לבדיקה: `GET /admin/payments/review`. **דורש `CARDCOM_API_PASSWORD`** — בלעדיו `REFUNDS_NOT_CONFIGURED` (תשלומים וחידושים ממשיכים לעבוד).
- **החלפת כרטיס:** `POST /subscriptions/payment-method/update` פותח דף Cardcom ששומר כרטיס בלבד (`CreateTokenOnly`, J2 — בלי חיוב); `GET /subscriptions/payment-method` מחזיר 4 ספרות + תוקף (לא את הטוקן). אחרי אישור — הטוקן הישן נמחק, ומנוי שתקופתו כבר נגמרה (past due) מחויב מיד בכרטיס החדש. מחיקת חשבון מוחקת את הטוקנים.
- **מעבר מסלול:** `POST/DELETE /subscriptions/change-plan` — המסלול נרשם כ-`pendingPlan` ומתחלף **באותה טרנזקציה של חיוב החידוש** (סירוב = נשאר המסלול הישן). ביטול מנוי מבטל גם את המעבר.
- **תשלומי תכשיטים דרך Cardcom** (דגל `phase3_jewelry_pay`): המעצב משלם הצעה שאושרה בדף Cardcom בתוך האפליקציה (`ChargeOnly`); אישור כמו במסלולים (`GetLpResult`, פעם אחת). נוצר `JewelerPayout` (ברוטו, עמלה לפי `JEWELRY_COMMISSION_PERCENT`, נטו) והצורף מקבל התראה ומייל. הצעה ששולמה — `QUOTE_ALREADY_PAID`. ניהול: `GET /admin/jewelry-payments`, החזר `POST /admin/jewelry-payments/:id/refunds` (מקטין/מבטל את התשלום לצורף), `GET /admin/jewelry-payouts`, `POST /admin/jewelry-payouts/:id/mark-paid` (אחרי העברה ידנית, עם אסמכתה).
- **ניהול מסלולים:** `GET/POST /admin/plans`, `PATCH /admin/plans/:code`, `GET /admin/plans/features` — מחיר, מחזור, ניסיון, הרשאות ומכסות. מחיר חדש חל על מנויים חדשים (ועל מעבר מסלול); מנויים קיימים שומרים את המחיר שהסכימו לו. מכסות והרשאות חלות מיד.
- **דוחות:** `GET /admin/reports/usage` (לכל משתמש: יצירות AI ועלותן, אחסון, תעבורה, הכנסה, התראות) ו-`GET /admin/reports/finance` (לכל מסלול: הכנסות, החזרים, עלויות, עמלת סליקה, רווח). סכומים מחושבים באגורות. עלויות לפי `AI_IMAGE_COST_USD`, `USD_TO_ILS`, `STORAGE_COST_ILS_PER_GB_MONTH`, `TRAFFIC_COST_ILS_PER_GB`, `CARD_FEE_PERCENT` (ברירות מחדל ב-`.env.example`). תעבורה נמדדת בהורדת קבצים (`media_traffic_daily`).
- **מנויים ולידים (20.10, "לידים: ספירה, מכסות וניהול תוקף" בטבלה):** `GET /admin/subscriptions` (חיפוש לפי מייל/טלפון/שם, סינון לפי תפקיד ומצב; לכל מנוי: תוקף, ניסיון, חידוש, כרטיס, ולצורף — לידים שנוצלו/נשארו/שמורים בתקופה הנוכחית). פעולות: `POST /admin/subscriptions/:id/extend` (ימים; גם הניסיון והלידים של התקופה זזים איתו; **נחסם ב-12 השעות שלפני חידוש בכרטיס** — מזהה החיוב בנוי מסוף התקופה, והזזה אז עלולה לחייב פעמיים), `/leads` (לידים לשארית התקופה, לצורפים בלבד), `/cancel` (בסוף התקופה או מיד). כל פעולה: סיבה חובה, ביומן הביקורת באותה טרנזקציה, ופעם אחת לכל `requestId`. במסך הניהול: "מנויים ולידים".
- **שימוש הוגן:** התראות `AI_QUOTA_80`, `AI_QUOTA_REACHED`, `AI_DAILY_LIMIT` — פעם אחת לתקופה (`usage_alerts`), מוצגות בדוח השימוש.
- **אפליקציה:** בפרופיל של משתמש `ADMIN` — "ניהול": מסלולים (עריכה/הוספה), כספים, שימוש, תשלומים והחזרים, תכשיטים ותשלומים לצורפים, בדיקה ידנית. במסך המסלולים: הכרטיס השמור + "החלפת כרטיס", ומעבר למסלול אחר בחידוש הבא (וביטולו). במסך הצעת המחיר: תשלום בכרטיס בדף Cardcom, ואישור מול השרת לפני הודעת הצלחה.
- **טסטים:** `test/billing/refunds-cards-plan-change.e2e-spec.ts`, `test/billing/jewelry-cardcom.e2e-spec.ts`, `test/admin/admin-plans-reports.e2e-spec.ts` (מול `test/utils/fake-cardcom.ts`); באפליקציה `adminLib`, `adminScreens`, `pricingPayment`, `quoteDetailsScreen`, `paymentSheet`.

### תקנון ומדיניות פרטיות (20.10)
הלקוחה מסרה נוסח משפטי מלא (חלקים א–ג + סעיף 5.4 על צורפים) והנחיות למפתח. בוצע:
- **הנוסח:** `backend/prisma/content/tos-v1.he.cjs` (מקור), מתפרסם כדף ה-CMS `tos` גרסה 1 במיגרציה `20261020120000_terms_and_consents`. סעיף 5.4 אחרי 5.3, המייל בסעיף 4.3 = `litvak_tzilla@hotmail.com` (בחירת המשתמש), הערות המפתח הוסרו, תוקנה שגיאת כתיב ("באצעי"→"באמצעי"). **גרסה חדשה = שורה חדשה ב-content_pages (version 2), לא עריכה של 1.** בשפה אחרת מוצג הנוסח העברי (המחייב) — רק ל-`tos`.
- **כל האפליקציות המותקנות** מציגות את הנוסח מיד (מסך התקנון טוען מה-CMS); גרסאות ישנות מציגות אותו כטקסט רציף.
- **Click-wrap:** בהרשמה — תיבה ריקה חובה עם הנוסח המדויק וקישורים ל"תנאי השימוש" ול"מדיניות הפרטיות" (פותח את חלק ב'), ותיבה נפרדת ריקה לדיוור שיווקי.
- **תיעוד במסד:** `user_consents` — לכל חשבון חדש: TERMS (גרסה, זמן, IP, מכשיר) ו-MARKETING (כן/לא); שינוי דיוור בהעדפות נרשם גם הוא (`source=preferences`). הרשמה מגרסת אפליקציה ישנה (שחייבה את התיבה אך לא שולחת אותה) נרשמת כ-`signup_older_app`. `acceptTerms=false` → 400 `TERMS_REQUIRED`.
- **Apple/Google:** חשבון חדש נוצר רק עם `acceptTerms=true` (אחרת 403 `TERMS_REQUIRED`); ממסך הכניסה האפליקציה שולחת להרשמה. **גרסאות אפליקציה ישנות לא יכולות לפתוח חשבון חדש עם Apple/Google** (רק עם מייל) עד שיעדכנו.
- **הודעת סעיף 5.4** לפני בקשת הצעת מחיר מצורף ולפני אישור הצעה.
- **משתמשים קיימים** לא התבקשו לאשר מחדש (סעיף 1.2 בחלק ג': המשך שימוש = הסכמה). אם רוצים אישור מפורש מחדש — מסך שמופיע למי שגרסת ה-TERMS האחרונה שלו קטנה מהנוכחית.

---

## 7. מה פתוח — לפי סדר עדיפות

**קודם כול (20.10) — להפעלת הסליקה:**
- **פרטי Cardcom ב-Render** (המשתמש מביא): `PAYMENTS_PROVIDER=cardcom`, `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` (להחזרים), `CARDCOM_DOCUMENTS=false` אם אין מודול מסמכים, `JEWELRY_COMMISSION_PERCENT`. ואז בדיקה אמיתית בסכום קטן: מסלול ← חידוש ← החלפת כרטיס ← החזר מתוך האפליקציה; תשלום הצעת תכשיט ← סימון העברה לצורף.
- **משתמש ADMIN** — לשאול את המשתמש איזה מייל מקבל את התפקיד.
- **הדגל `phase3_jewelry_pay`** — להדליק כשרוצים תשלומי תכשיטים באפליקציה.
- **בנייה חדשה של האפליקציה** (מסכי הניהול, החלפת כרטיס, תשלום תכשיטים) — עולה כסף ב-EAS, רק באישור.

**קודם כול (17.10):**
- **לשחרר את האפליקציה:** בנייה חדשה ל-Android (APK) ול-iOS (TestFlight) — עולה כסף ב-EAS, רק באישור המשתמש. אחר כך לעבור על הסטודיו, הייצוא וההדמיה על מכשיר אמיתי מול השרת בפרודקשן.
- **`GEMINI_API_KEY` ב-Render** — כדי שהשראת AI תעבוד (אחרי מיזוג הענף ל-main). מפתח מ-https://aistudio.google.com/apikey, עם חיוב פעיל; מומלץ התראת תקציב. כ-7 סנט לתמונה. אחרי שהמפתח מוגדר — לבדוק יצירה אחת חיה (עוד לא נבדק מול גוגל).

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
7. **סודות שנחשפו בצ'אט — להחליף:** סיסמת מסד הנתונים ב-Render, מפתח Resend, סיסמת אפליקציה של Gmail (לבטל — כבר לא בשימוש), ומפתח Tripo (כבר לא בשימוש).
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
| Gemini (גוגל) | Render Environment (`GEMINI_API_KEY`) — **עדיין לא הוגדר** |
| חתימת Android | EAS (expo.dev → Credentials) |
| תעודת הפצה / provisioning iOS | EAS; מפתח ASC API `HDV3Q2YWV4` ב-EAS |
| Apple ID | של המשתמש (`antselrotem@gmail.com`) — רק הוא מקליד סיסמה/קוד |

**נחשפו בצ'אט ויש להחליף:** סיסמת המסד, מפתח Resend, סיסמת אפליקציה של Gmail (`rotem122510`).
