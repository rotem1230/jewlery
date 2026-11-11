# Handoff לסשן הבא — Malinvosky (צילה תכשיטים)

נכתב: 2026-10-15, עודכן 2026-10-17 (QA חי מקצה לקצה ותיקונים לפרודקשן), 2026-10-19/20 (מסלולים, סליקת Cardcom, החזרים, ניהול ודוחות), 2026-11-11 (באגים פתוחים, CI, ניקוי המסמך). המסמך הזה הוא נקודת הפתיחה לסשן הבא. ההיסטוריה המלאה של סבבי ההקשחה (1–5) נמצאת ב-`docs/HANDOFF.md`, ומעקב הפערים מול ה-PRD ב-`docs/prd-gap-audit.md`.

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
5. **`backend/.env.render-new.local`** — כתובת ה-**External** של מסד הייצור (חשבון הלקוחה, כולל סיסמה). ב-gitignore (`.env.*.local`), **לא להדפיס ולא לדחוף**. משמש להרצת מיגרציות מהמחשב, **אחרי גיבוי** ל-`E:/claude-work/malinvosky/backups/` (`pg_dump --format=custom --no-owner --no-privileges` מ-`C:/Program Files/PostgreSQL/18/bin`):
   ```bash
   cd backend; set -a; . ./.env.render-new.local; set +a
   node node_modules/prisma/build/index.js migrate deploy
   ```
   (`backend/.env.render.local` = המסד הישן, שיימחק ב-13.11 — לא להשתמש.)
6. **EAS בלי git:** בכל פקודת `eas` צריך `EAS_NO_VCS=1` (ב-PowerShell: `$env:EAS_NO_VCS = '1'`). מה שלא נשלח לענן מוגדר ב-`app/.easignore`.
7. **bug-finder (MCP)** לא עובד בפרויקט הזה: תיקיית ה-git חיצונית, והוא מחזיר "אין שינויים". הסקירה נעשית בסוכן נפרד עם הקשר נקי, על ה-diff (`git diff`).
8. **הטרמינל של Bash** לפעמים נופל על `tail`/fork (cygheap) — לכתוב פלט לקובץ ולקרוא אותו.

---

## 3. שרת בפרודקשן — Render

| פריט | ערך |
|---|---|
| כתובת | **https://api.malinovskyjewelry.com** (CNAME `api` → `jewlery-djia.onrender.com` ב-cPanel של LiveDNS) — API ב-`/api/v1`, בריאות ב-`/api/v1/health` |
| חשבון (של הלקוחה, מ-18.10) | Web Service `srv-dbagi1rrjlhs73a6hadg` (**Starter**, פרנקפורט), Postgres `dpg-dbafqs67bikc73eflbgg` (בתשלום, פרנקפורט, עם גיבויים). כתובת חיצונית מקומית ב-`backend/.env.render-new.local` (gitignored, לא להדפיס) |
| בנייה ופריסה | Docker, Root Directory `backend`, Dockerfile Path `./Dockerfile`. **push ל-`main` = פריסה.** מיגרציות לא רצות בעלייה: גיבוי (`pg_dump`) ← `migrate deploy` מהמחשב ← ורק אז push |
| חשבון ישן (Free, אורגון) | שירות `jewlery` (`srv-db7nduo473hc73e0gir0`, `jewlery.onrender.com`) + מסד `jewelry-db` — **לא בשימוש מ-18.10**, הנתונים בו קפואים. **המסד החינמי נמחק אוטומטית ב-13.11.2026.** בניות אפליקציה מלפני 18.10 פונות לכתובת הישנה ויפסיקו לעבוד אחרי המחיקה. לכבות את השירות כשכל הבודקים על בנייה חדשה |
| מיגרציות | כולן הוחלו על המסד בחשבון החדש, האחרונה `20261025120000_client_catalog` (25.10) |
| מסלולים (19.10) | seed הורץ ב-production אחרי הפריסה של `133f817`: 9 המסלולים של טבלת התמחור. גיבוי לפני: `E:/claude-work/malinvosky/backups/prod-before-pricing-20261019-1628.dump` |
| `lead_definition.enforceQuota` | **true** מ-19.10 — צורף בלי לידים פנויים לא מקבל בקשות עד הרבעון הבא |
| seed | הורץ ב-production (בלי חשבונות דמו): קטלוג, מסלולים, מידות טבעת PRD, תבניות הודעה בעברית |
| דגל `phase3_oauth` | **דלוק** (שונה ידנית במסד, `enabled=true`, `rolloutPct=100`) |
| דגל `phase2_visualization` | **דלוק** מ-17.10 (הדמיה על תמונה אישית, למסלול Designer Pro) |
| תכני המסלולים | בעברית (עם אנגלית לצד) — עודכנו במסד ב-17.10 רק היכן שהיה עדיין הטקסט האנגלי המקורי |

### משתני סביבה ב-Render (שמות בלבד)
`NODE_ENV=production`, `DATABASE_URL` (Internal), `JWT_SECRET`, `TRIAL_HASH_SECRET`, `UPLOAD_URL_SECRET`, `API_PUBLIC_URL`, `CORS_ORIGINS`, `TRUST_PROXY=1`, `JOBS_ENABLED=true`, `SMTP_URL` (Resend, `smtp.resend.com:2465`), `MAIL_FROM` (`no-reply@malinovskyjewelry.com`), `APPLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GEMINI_API_KEY`. ב-18.10 הועתקו מהשירות הישן כמו שהם (כדי שאף אחד לא יצטרך להתחבר מחדש), ו-`GEMINI_API_KEY` נוסף; יצירת AI חיה נבדקה באותו יום.

**חסר:** פרטי Cardcom (סעיף 7). בלעדיהם תשלומים אמיתיים כבויים.

### קבצים
נשמרים במסד הנתונים (`STORAGE_DRIVER=database`, ברירת המחדל בפרודקשן) ושורדים פריסות. הם נספרים בנפח המסד: לעקוב, ובהמשך לשקול אחסון אובייקטים (R2/S3).

### מיילים
- הדומיין `malinovskyjewelry.com` מאומת ב-Resend (17.10, רשומות DNS ב-cPanel). שליחה לכל כתובת.
- הלוגים שמראים שליחה: `Mail sent to=...` (הצלחה) / `Verification mail for user ... failed: ...` (כישלון).
- כלי עזר: Resend API (`GET https://api.resend.com/emails`) מראה סטטוס מסירה (delivered/bounced).

### מנהלים (ADMIN)
- 19.10: `litvak_tzilla@hotmail.com` ו-`rotem122510@gmail.com`; 11.11: `antselrotem@gmail.com` (לבקשת המשתמש). כל אחד בטרנזקציה עם רישום `user.admin_granted` ב-audit, אחרי גיבוי (`backups/prod-before-admin-antselrotem-20261111-2229.dump`).

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
| iOS #11 (20.10) — + מסך "מנויים ולידים" | הועלה ל-App Store Connect / TestFlight (build `e62ce5fb`) |
| Android APK (20.10, מנויים ולידים) | https://expo.dev/artifacts/eas/jWP3JT6LAs2ZyWldnmABoRMVcfHVqrTgnayF0NlR7o0.apk (build `4756db5d`) |
| **iOS #12 (20.10)** — + תקנון, הסכמות בהרשמה, הודעת סעיף 5.4 | הועלה ל-App Store Connect / TestFlight (build `8849776e`) |
| **Android APK (20.10, תקנון)** — אותו קוד | https://expo.dev/artifacts/eas/1kONPWRt6IqU2GZPWYo0dlgmo3YJut9cz6vZK8jW5xI.apk (build `312549e0`) |
| **iOS #13 (26.10)** — קטלוג הלקוחה: אבנים, צבעים, חיתוכים, שיבוץ, אלמנטים, הזזה על הדגם | הועלה ל-App Store Connect / TestFlight (build `955afcac`) |
| **Android APK (26.10, קטלוג הלקוחה)** — אותו קוד | https://expo.dev/artifacts/eas/qYZFF6MbSEegKzqESyOoon6x6YwwxHCJVLRzoyw5FUs.apk (build `e8a744f9`) |
| **iOS #14 (11.11)** — סל לאבן ליד שיבוץ בטבעת, "סיימתי" שומר הכול, שאלה ביציאה, כפתור "מעבר לעיצוב", וי בתמונה/הקלטה | הועלה ל-App Store Connect / TestFlight (build `d72fac05`, submission `83b67a2d` FINISHED) |
| **Android APK (11.11)** — אותו קוד | https://expo.dev/artifacts/eas/Wmfp-VHYSXUbsthu9szYfGhSTv3PUykiCptgnhl2ViU.apk (build `4c3fde67`) |

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

7. **11.11 — תוקנו באגים שנשארו פתוחים** (כל אחד עם טסט שנכשל קודם):
   - **אבן ליד שיבוץ אבנים קטנות:** בטבעת עם שיבוץ בטבעת (פאווה וכו') בלי בית שנבחר, האבן שנוספה בלשונית "אבן" נשארה בלי בית, שקועה בצד הטבעת (0°), כמעט בלתי נראית. עכשיו היא עומדת בסל למעלה (כמו בטבעת בלי שיבוץ), והשורה של האבנים הקטנות על שתי הכתפיים. "ללא" נשאר שקוע במכוון; עיצוב פאווה ישן (השיבוץ עצמו היה הפס) לא השתנה. `geometry.ts` + `hasCentreHead` באפליקציה, והמפרט לצורף מציין "סל (Basket)".
   - **"סיימתי" שומר הכול:** קודם נשמרה רק הלשונית הפתוחה — שיבוץ שנבחר בלשונית "בית אבן" ואחריו אבנים בלשונית "אבן" ו"סיימתי" שם: נשמרו רק האבנים, והשיבוץ אבד ביציאה. עכשיו נשמר כל מה שהדגם מראה (`saveDrafts`) — ורק מה שהשתנה: לשונית שרק נפתחה לא חוסמת ולא נכתבת מחדש. "סיימתי" בלשונית המידה בלי שינוי מציע לנעול את המידה בלי לשמור.
   - **יציאה עם שינויים שלא נשמרו** (חזרה, Android back, החלקה ב-iOS): שאלה "לשמור את השינויים?" — ביטול / יציאה בלי לשמור / שמירה (`usePreventRemove`). לשונית שרק נפתחה אינה שינוי (`changedDrafts`). חזרה בזמן שמירה לא שואלת (ממתינה לסוף השמירה).
   - **בלשונית "אבן"** כשיש שיבוץ בטבעת: שורה שמסבירה שהאבנים הקטנות נבחרות ב"בית אבן" + כפתור מעבר.
   - **כפתור "מעבר לעיצוב" נראה מושבת** אחרי בחירת מידה (QA 17.10): השקיפות הייתה class של NativeWind שנשאר; עכשיו style רגיל (`Button`, `IconButton`).
   - **וי "נשלחה/נקראה"** גם על תמונה והקלטה ששולחים בצ'אט (`DeliveryTick`).
   - **CI:** סקריפט ה-smoke (`scripts/e2e-local.cjs`) מצפה עכשיו לסירוב AI כשאין מפתח (503 `AI_NOT_CONFIGURED`) ומעלה תמונת PNG אמיתית להדמיה.
   - **טסטים באפליקציה:** `testTimeout` 60 שניות (שלושה קבצים נכשלו ב-5 שניות כשהמכונה עמוסה).

### מצב טסטים אחרון
- **11.11 (קומיט `c5a32c5`):** אפליקציה 71 קבצים, **407/407**, tsc 0, lint 0 שגיאות. **CI ב-GitHub ירוק** (לראשונה מ-17.10): שרת 75 קבצים **837/837**, smoke **33/33**, אפליקציה 407/407, בניית images. במחשב המקומי רצו רק טסטי היחידה של השרת (244/244): Postgres המקומי קרס (Windows: קובץ הדפדוף קטן מדי, 0xC0000142) ופורט 54390 היה תפוס — `tmp/round5/pg-dev.cjs` ו-`run-e2e.sh` מקבלים עכשיו `PG_DEV_PORT`.
- **אפליקציה (25.10, קטלוג הלקוחה):** 68 קבצים, **388/388**, tsc 0, lint 0 שגיאות.
- **שרת (25.10):** 75 קבצים, 836 טסטים בריצה מלאה. נכשל רק הכלל `lock_timeout` במיגרציה החדשה; תוקן, והקבצים של המיגרציות, הגאומטריה, הייצוא והקטלוג רצו שוב ירוקים (כולל השינויים האחרונים בגאומטריה).
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

### קטלוג הלקוחה ומיקום חופשי (25.10)
המשתמש ביקש שהאפליקציה תתאים "אחד לאחד" לתיקיית הלקוחה ב-Google Drive (`1uFCfb3weNi2rPZ6h9X7Bd5IYWbZYkmWA`): כל האבנים, השיבוצים, החיתוכים והקראט. בנוסף, שכל מה שמוסיפים לתכשיט אפשר למקם איפה שרוצים. החלטות: **כל צבע מטבלת הצבעים לכל אבן** (הצבעים לפי אבן בגיליון נשמרים כמידע). **לברדורייט — "הצבע המקובל"** (`BLACK_DIAMOND`).

- **מקור אמת אחד:** `backend/src/jewelry/catalog.ts` (בלי imports), שמשמש את השרת, את הגאומטריה ואת האפליקציה. הסקריפט `app/scripts/sync-jewelry-geometry.cjs` מעתיק אותו ל-`app/src/lib/jewelryCatalog.generated.ts`, ובאותה ריצה מייצר את הגאומטריה. טסט באפליקציה בודק ששני הקבצים זהים למקור. התוכן:
  - **אבנים:** 24 אבנים מ"אבנים.xlsx". החיתוכים המותרים לכל אבן: אופל, לאפיס לזולי וטורקיז רק כקבושון. לכל אבן: קשיות, צבעי שוק, זמינות חיתוך עגול ומשקל סגולי.
  - **צבעים:** טבלת הצבעים, 62 צבעים ו-34 אפקטים, עם hex שנדגם מהתמונה.
  - **גודל:** אבן מ-2 מ״מ עד 1.5 קראט (`stoneMaxMm`), עם הערכת קראט.
  - **שיבוצים:** 11 בתים לאבן המרכזית ו-11 סגנונות שיבוץ בטבעת, לפי תמונות ה-zip.
  - **טבלת הפאווה:** עובי המתכת לפי גודל האבן, ורוחב הטבעת הנדרש למספר השורות.
  - **אלמנטים:** 23 אלמנטים מהגיליון, בטווחי הגודל ובעובי הדופן המינימלי שלו. אותיות בעברית ובאנגלית ומספרים, עד 8 תווים, כחלק אחד יצוק.
- **גאומטריה** (`geometry.ts`, `motifs.ts`):
  - כל בית וכל סגנון שיבוץ נבנה בנפרד. אבנים אטומות נצבעות בלי שקיפות.
  - האלמנטים נבנים מצורות דו-ממדיות. במסלול ההוא נמצא ותוקן באג בעומק הצורות.
  - **מיקום:** `placement: { angleDeg, offsetMm, rotationDeg }` לכל אבן ואלמנט. שמירה ישנה (`x/y/z`) נשארת "אוטומטית".
  - **שורת אבנים בטבעת מפנה מקום:** לראש של האבן המרכזית ולכל מה שהמשתמש שם עליה. כך פאווה יושבת על שתי הכתפיים של האבן המרכזית.
  - **אבן שנייה בעגיל צמוד:** יוצרת הילה סביב האבן המרכזית עד שמזיזים אותה.
- **שרת:**
  - **בדיקה בכל שמירה:** `src/jewelry/parameters-check.ts` מחובר ל-`WizardEngineService`. נבדקים חיתוך, צבע, גודל, טקסט, סגנון, בית ושיבוץ בטבעת, ושהטבעת רחבה מספיק לשורות האבנים. רוחב המינימום של הבית נקרא מ-`headCode`, ובעיצובים ישנים מ-`settingCode`. עיצובים ישנים עוברים.
  - **תיאור ל-AI:** כולל עכשיו חיתוך, צבע, בית, שיבוץ בטבעת וטקסט.
  - **seed:** נבנה מהקטלוג.
- **מיגרציה `20261025120000_client_catalog` (נתונים בלבד):**
  - **שיבוצים:** 22 שיבוצים. הבתים מקושרים לכל סוג תכשיט, וסגנונות השיבוץ בטבעת לטבעות בלבד.
  - **אבנים:** 24 אבנים, עם חיתוכים כאפשרויות SHAPE.
  - **אלמנטים:** 23 אלמנטים.
  - **קודים ישנים:** 4/6 צבתות ו-`INITIAL` הופכים ללא פעילים. עיצובים ישנים ממשיכים להיבנות.
  - **בחירות של מנהל:** אבן או אלמנט שמנהל כיבה נשארים כבויים.
  - **תמונות תצוגה:** כל התמונות של העיצובים מסומנות לציור מחדש (`PREVIEW_RENDER_VERSION=2`).
  - **סדר פריסה:** את המיגרציה מריצים **לפני** עדכון האפליקציה. בלעדיה הסטודיו מציג רק את מה שיש במסד הישן.
- **אפליקציה:**
  - **פרמטרים:** `studioParams.ts` כולל מודל חדש לאבן, לאלמנט ולשיבוץ.
  - **מסכים:**
    - **אבן** (`StudioStonePanel`): סוג, חיתוך, טבלת צבעים, גודל עם ≈קראט, מידע על האבן ומיקום.
    - **אלמנטים** (`StudioElementPanel`): קטגוריות, טקסט, סגנון, גודל, מיקום והעלאת אלמנט אישי.
    - **שיבוץ** (`StudioSettingPanel`): בית או "ללא". בטבעת גם שיבוץ אבנים: אבן, צבע, גודל מטבלת הפאווה, שורות, כמות ומיקום השורה.
  - **"הזזה על הדגם":** גרירה על התלת-ממד ממקמת את הפריט, דרך `placementFromPoint` של הגאומטריה.
  - **מפרט לצורף** (`designSpecs.ts`): כולל חיתוך, צבע, גודל, קראט, מיקום, שיבוץ בטבעת וטקסט.
- **נבדק חי:** דף הצפייה של הסטודיו נבנה מהקוד ונפתח בדפדפן.
  - **ציור:** טבעת עם ספיר אובלי בצבע Light Rose בחצי משבצת, טורקיז קבושון אטום, פאווה בשתי שורות והשם DANA.
  - **גרירה:** גרירה העבירה את הטורקיז בדיוק לנקודה שבה העכבר שוחרר.
  - **עוד לא נבדק:** על מכשיר אמיתי.
- **בפרודקשן (25.10):** גיבוי `E:/claude-work/malinvosky/backups/prod-before-client-catalog-20261025-1711.dump`, ואחריו המיגרציה. ה-API החי מחזיר 24 אבנים, 22 שיבוצים ו-23 אלמנטים. הקוד ב-`29e6e86` נדחף ל-main, ו-Render פרס אותו.

---

## 7. מה פתוח — לפי סדר עדיפות (עודכן 11.11)

**13.11 — המסד החינמי בחשבון הישן נמחק אוטומטית.** הייצור לא תלוי בו. נבדק ב-11.11 (קריאה בלבד): **אין בו שום פעילות מאז 18.10** — 0 התחברויות, 0 שינויי עיצובים, 0 הודעות, 0 משתמשים חדשים — כלומר אף בודק לא על בנייה ישנה. נשאר רק לכבות את השירות הישן ב-Render (המשתמש).

**מחכה למשתמש / ללקוחה:**
1. **פרטי Cardcom ב-Render:** `PAYMENTS_PROVIDER=cardcom`, `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` (להחזרים), `CARDCOM_DOCUMENTS=false` אם אין מודול מסמכים, `JEWELRY_COMMISSION_PERCENT`. אחר כך בדיקה אמיתית בסכום קטן: מסלול ← חידוש ← החלפת כרטיס ← החזר; תשלום הצעת תכשיט ← סימון העברה לצורף. הדגל `phase3_jewelry_pay` — להדליק כשרוצים תשלומי תכשיטים.
2. **החלטות שהתקבלו ב-11.11:** `antselrotem@gmail.com` אדמין (בוצע); 14 ימי הניסיון במסלולים בתשלום **נשארים**; טבלת המנויים — **זו של 19.10** (לא זו שבדרייב מיולי).
3. **סודות שנחשפו בצ'אט — להחליף:** סיסמאות המסד (ישן וחדש), מפתח Resend, סיסמת אפליקציה של Gmail (לבטל), סיסמת cPanel, מפתח Gemini.
4. **בדיקה על מכשיר אמיתי:** הסטודיו (גרירה על הדגם, מקלדת עברית בטקסט של אלמנט, גלילת המסכים הארוכים, השאלה ביציאה עם שינויים), הייצוא וההדמיה מול הפרודקשן.
5. **פרסום בחנויות:** App Store (הגשה ל-review מ-App Store Connect) ו-Google Play (AAB + חשבון Play Console). חשבונות Apple ו-Expo על שם המשתמש — לשקול להעביר ללקוחה.
6. **החלטות מוצר** D1–D8 ושאלות 🟡 ב-`docs/prd-gap-audit.md`. Push (Firebase/APNs) ו-Sentry (DSN) — תלויים בחשבונות.
7. **Google sign-in** (אם רוצים): מזהי OAuth (Web, Android עם SHA-1 מ-EAS, iOS), `GOOGLE_WEB_CLIENT_ID` ב-`eas.json`, `GOOGLE_CLIENT_ID` ב-Render.
8. **לפנות מקום ב-C:** (המשתמש).

**GitHub:**
- **CI על `main` ירוק מ-11.11** (`c5a32c5`). מ-17.10 עד אז נכשל בשתי בדיקות smoke שלא עודכנו (AI בלי מפתח, הדמיה על "תמונה" ריקה).
- **Dependabot:** #19 (8 עדכונים קטנים לשרת: throttler 6.7.1 עם הגבלת קצב לפי רשת IPv6 /64, class-validator 0.15.1, nodemailer 10.4.0, socket.io, pg ועוד) **מוזג ב-11.11** (`ce6ba1d`) אחרי CI ירוק (837/837, smoke 33/33). **במחשב המקומי:** `backend/node_modules` ישן מול ה-lockfile החדש — להריץ `npm ci` ב-`backend` (עם `npm_config_cache` ב-E:) לפני טסטים מקומיים. #18 (27 עדכונים לאפליקציה) נשבר ב-`npm ci`: `@react-native/new-app-screen` 0.88 ליד `react-native` 0.86 — ב-11.11 נוספה התעלמות מעדכוני minor של `@react-native/*` ו-`@react-native-community/cli*` (כמו `react-native` עצמו); הם משודרגים ידנית, יחד, עם בנייה למכשיר. השאר — קפיצות גרסה ראשית (NestJS 12, TypeScript 7, ESLint 10, Babel 8, Jest, actions v7): לא למזג בלי לעבור עליהם, מיזוג ל-`main` = פריסה.

**נשאר בקוד (לא דחוף):**
- תיאור העיצוב ל-AI (`backend/src/ai/design-choices.ts`) לא מזכיר את הסל שאבן מרכזית בטבעת מקבלת כשלא נבחר בית (גם בלי שיבוץ בטבעת). צריך את סוג התכשיט בפונקציה.
- הסיבה שהכפתור נשאר חיוור (NativeWind) לא שוחזרה על מכשיר; התיקון (style רגיל) נבדק ב-jest בלבד.
- קונפיג סוגי פריטים לא באמת data-driven (🔧 ב-`docs/prd-gap-audit.md`).
- משתמשים קיימים לא התבקשו לאשר את התקנון מחדש (מותר לפי סעיף 1.2 בחלק ג'); אם רוצים — מסך למי שגרסת ה-TERMS שלו ישנה.


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
| כתובת המסד (External) | Render (חשבון הלקוחה) → Postgres → Connect; מקומית ב-`backend/.env.render-new.local` (gitignored). `backend/.env.render.local` = המסד הישן, שיימחק ב-13.11 |
| JWT / TRIAL / UPLOAD secrets | Render Environment (נוצרו ב-Generate) |
| SMTP (Resend API key) | Render Environment (`SMTP_URL`) |
| Gemini (גוגל) | Render Environment (`GEMINI_API_KEY`) |
| חתימת Android | EAS (expo.dev → Credentials) |
| תעודת הפצה / provisioning iOS | EAS; מפתח ASC API `HDV3Q2YWV4` ב-EAS |
| Apple ID | של המשתמש (`antselrotem@gmail.com`) — רק הוא מקליד סיסמה/קוד |

**נחשפו בצ'אט ויש להחליף:** סיסמאות המסד (ישן וחדש), מפתח Resend, סיסמת אפליקציה של Gmail (`rotem122510`), סיסמת cPanel, מפתח Gemini.
