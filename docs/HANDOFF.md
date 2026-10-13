# Handoff: הקשחת Malinvosky לפרודקשן

נכתב ב-2026-10-13, בהחלפת משתמש ב-Claude Code. המסמך מסביר מה נעשה, איפה הכול נמצא, איך עובדים בסביבה הזאת, ומה נשאר לעשות.

---

## 0. בשורה אחת

השרת (NestJS + Prisma + PostgreSQL) והאפליקציה (React Native) הוקשחו בכמה סבבים. בכל סבב נכתב קודם טסט שנכשל (TDD), ואחר כך התיקון. לכל סבב נעשתה סקירת קוד בלתי תלויה בקונטקסט נקי, וכל תיקון קיבל טסט רגרסיה.

**עדכון 2026-10-13, סבב 4:** WP10, הסקירה הבלתי תלויה הסופית והתיקונים שלה, ריצה מלאה ודוח הושלמו. פירוט בסעיף 3א. מה שנשאר דורש מכשיר, תשתית או החלטת מוצר (סעיפים 6 ו-8), ולא עבודת קוד פתוחה.

**עדכון 2026-10-13, סבב 5 — התאמה ל-PRD:** בדיקה מלאה של כל סעיפי ה-PRD מול הקוד, וסגירת כל הפערים שאינם החלטת מוצר או חשבון חיצוני. מעקב מלא, עם החלטות המימוש D1–D8 לאישור: `docs/prd-gap-audit.md`. פירוט בסעיף 3ב.

<details><summary>המצב לפני סבב 4 (לתיעוד)</summary>

ההתקדמות הוערכה אז בכ-80%, והעבודה הייתה שמורה ב-commit `08bc79b`. מה שנשאר:
- עדכוני תלויות בשרת (WP10).
- ריצה מלאה אחרונה של כל הבדיקות.
- סקירה בלתי תלויה סופית.
- דוח מסכם בעברית.

</details>

---

## 1. איפה הכול נמצא

| מה | איפה |
|---|---|
| קוד הפרויקט | `E:\deploy\צילה תכשיטים\Malinvosky-main\Malinvosky-main` (`backend/`, `app/`, `docs/`) |
| **Git (מעקב השינויים)** | תיקיית הפרויקט עצמה **אינה** repo. ה-repo נפרד, ב-`E:/claude-work/malinvosky/repo.git` |
| רשימת הממצאים (מקור האמת) | `E:/claude-work/malinvosky/findings.md` (`[x]` = בוצע, `[ ]` = פתוח, `[~]` = חלקי) |
| סקריפטים ולוגים זמניים | `E:/claude-work/malinvosky/tmp/` (כולל `mutate.cjs` לבדיקות מוטציה) |
| PostgreSQL מוטמע לטסטים | `E:/claude-work/malinvosky/pgtool` (בנתיב ASCII; `initdb` נכשל בנתיב בעברית) |
| npm cache | `E:/claude-work/malinvosky/npm-cache` |
| מסמך פריסה למפעיל | `docs/production-readiness.md` (מעודכן) |
| CI | `.github/workflows/ci.yml`, `.github/dependabot.yml` |

### עבודה עם ה-git (חובה להגדיר בכל פקודה)

```bash
export GIT_DIR=E:/claude-work/malinvosky/repo.git GIT_WORK_TREE="E:/deploy/צילה תכשיטים/Malinvosky-main/Malinvosky-main"
git log --oneline
git diff a67a5db HEAD --stat   # a67a5db = baseline: הקוד המקורי לפני ההקשחה
```

| Commit | תוכן |
|---|---|
| `a67a5db` | baseline: הקוד המקורי |
| `6ce3b5c` | תשתית טסטים: jest, unit + e2e על Postgres אמיתי, `configureApp` משותף |
| `3c3e37e` | אימות ומרקטפלייס: אימות מייל, נעילות, טוקנים חד-פעמיים, JWT iss/aud, OAuth, אישור הצעה תחת נעילה |
| `cfaa574` | חיוב: בלי מנוי בתשלום בחינם, trial אחד, webhooks חתומים, מדידת לידים, payment intents |
| `8124da3` | WP5–8: מדיה, פרטיות, ביקורות, משימות יקרות, אמינות (outbox) |
| `d7067eb` → `b73e536` | תיקוני סקירות #1 ו-WP5–8 |
| `b7d7470` | נכונות החיוב (סקירת חיוב ראשונה) |
| `a68752c` | seed בטוח, מגבלות קלט, smoke run |
| `b9b846b` | Dockerfile, כלי מפעיל, מסמכי פרודקשן |
| `0e47790` | האפליקציה: התאמה ל-API המוקשח, keychain, release config |
| `bf3431b` | חיוב סבב 2 (מחיר מוסכם, תשלומים לא אובדים, נעילות FOR NO KEY UPDATE) |
| `08bc79b` | סבב 3: סיום סשנים מיידי, deadlock מחיקה/אישור, חיוב סבב 3, CI, מסמכים |

---

## 2. כללי סביבה (חשוב: נלמד בדרך הקשה)

1. **אסור לגעת בפרויקט "kuku"** שרץ על אותה מכונה: Expo על 8081, Postgres מוטמע על 54322, ה-jest שלו. אם מנקים תהליכי postgres, לסנן רק לפי נתיב `E:/claude-work/malinvosky/pgtool`. רצים כאן גם פרויקטים אחרים: RAI (`next dev` על **פורט 3100**, Postgres 18 של RAI) ו-`E:/claude-work/a72c0552` (Firebase emulators ו-Vite). גם בהם לא נוגעים.
2. **דיסקים:** D: מלא, ב-C: נשארו פחות מ-1GB. כל דבר כבד נשמר על E:.
2א. **`backend/.env` קיים** (נוצר מערכי בעל הפרויקט, ב-gitignore). הוא כולל **`TRIPO_API_KEY` אמיתי**, ולכן שרת שרץ במצב development קורא אותו וקורא ל-Tripo בתשלום. הטסטים (`NODE_ENV=test`) מתעלמים מ-`.env`. ה-smoke מאפס את `TRIPO_API_KEY` ואת `SMTP_URL`. לסקריפט חי חדש: לאפס את שניהם, ואת `REDIS_URL`.
2ב. **פורט 3100 תפוס** (RAI). את ה-smoke מריצים עם `SMOKE_API_PORT=3112` (ואם צריך גם `SMOKE_PG_PORT`).
3. **לא להשתמש ב-npx.** מריצים `node node_modules/...` ישירות.
4. **משתני סביבה לכל הרצה של השרת:**
   ```bash
   export npm_config_cache="E:/claude-work/malinvosky/npm-cache" TEMP="E:/claude-work/malinvosky/tmp" TMP="E:/claude-work/malinvosky/tmp" EMBEDDED_PG_MODULE_DIR="E:/claude-work/malinvosky/pgtool"
   ```
5. **הרצת טסטים בשרת** (מתוך `backend/`):
   ```bash
   node node_modules/jest/bin/jest.js --runInBand --forceExit                 # הכול (unit + e2e): כ-3 דקות על מכונה שקטה, ועוד עד 10 דקות של initdb בעומס
   node node_modules/jest/bin/jest.js --selectProjects unit                   # unit בלבד, מהיר
   node node_modules/jest/bin/jest.js --runInBand --forceExit test/billing    # תיקייה אחת
   node node_modules/typescript/bin/tsc -p tsconfig.test.json --noEmit       # typecheck
   node scripts/check-migrations.cjs                                          # התאמה בין migrations ל-schema (drift)
   npm run test:e2e:local                                                     # smoke: בונה את ה-API ומריץ זרימות מול seed דמו
   ```
   אפשר גם `TEST_DATABASE_URL` במקום ה-Postgres המוטמע (כך עובד ה-CI).
6. **באפליקציה** (מתוך `app/`): `node node_modules/jest/bin/jest.js --ci`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`. הבסיס הוא 0 שגיאות ו-82 אזהרות lint ישנות.
7. **עומס במכונה גורם ל-flakiness**, לא לבאגים:
   - "Can't reach database server".
   - timeout של 60 שניות בטסטי ה-migrations.
   - `initdb` איטי, ו-`npm ci` של האפליקציה שלוקח יותר מ-20 דקות.
   - **לא להריץ טסטי שרת במקביל ל-npm install.** אם נכשל משהו כזה, מריצים שוב כשהמכונה שקטה.
8. **פקודות bash ארוכות עם heredoc נחתכות** בכלי ה-Bash. סקריפטי עריכה כותבים עם כלי ה-Write לקובץ `.cjs` ומריצים עם node. ב-`String.replace` משתמשים בפונקציה (`() => b`) ולא במחרוזת, כי `$$` נבלע.
9. **אסור להריץ `npm audit fix` גורף:**
   - בשרת הוא **מוריד** את Prisma CLI ל-6.12.0 (לא תואם ל-`@prisma/client` 6.19.3) ואת js-yaml ל-3.x.
   - באפליקציה הוא מעלה את nativewind ל-4.2.7, שמביא **עותק מקונן של react-native 0.85**. זה מסוכן ושוחזר.
   - עדכונים עושים רק ממוקדים, עם `npm update <pkg>`.
10. **npm 11 לא מריץ install scripts** שלא אושרו (`allowScripts`), וזה תקין כאן: bcrypt 6 טוען prebuild, ו-Prisma client כבר מחולל. אחרי שינוי ב-`schema.prisma` מריצים בעצמך `node node_modules/prisma/build/index.js generate`.
11. **Prisma ו-`$queryRaw`:** פונקציה שמחזירה `void` (למשל `pg_advisory_xact_lock`) לא ניתנת לקריאה. בוחרים `SELECT 1 FROM fn(...)`.

---

## 3. מה נעשה, לפי תחומים

### אימות וסשנים
- אימות מייל חובה; ההרשמה לא פותחת סשן.
- נעילת חשבון אטומית: הניסיון נספר לפני bcrypt. אותה תשובה גם לכתובת לא קיימת.
- ניסיון כושל בשינוי סיסמה נספר לנעילה. סיסמה נכונה מאפסת את המונה גם לפני אימות. אימות מייל מסיר נעילה.
- טוקנים חד-פעמיים אטומיים. איפוס סיסמה מבטל את כל הקישורים האחרים.
- refresh: רוטציה עם זיהוי שימוש חוזר. רק 401 מנתק את המשתמש.
- **סיום סשנים מיידי** (`users.sessionVersion`): "התנתק מכל המכשירים", שינוי ואיפוס סיסמה ומחיקה מבטלים מיד כל access token. זה חל על HTTP, sockets ו-media bearer, דרך בדיקה משותפת אחת `isCurrentSession()`, ו-static test מוודא שאף מקום לא שוכח אותה. refresh שרץ במקביל לביטול לא משאיר סשן חי.
- JWT: alg, iss ו-aud קשיחים.
- OAuth: fail-closed, אימות JWKS מקומי, בדיקת azp. צריך להגדיר את מזהי ה-web, ה-Android וה-iOS ב-`GOOGLE_CLIENT_ID`.
- trust proxy מפורש, כדי ש-rate limits יראו את ה-IP האמיתי.
- מיילים יוצאים ברקע (בלי timing oracle), עם מכסה לכל חשבון. כיבוי מסודר מחכה לכל המיילים. כתובות נמענים מוסתרות בלוג.

### מרקטפלייס
- רק בעל העיצוב מחליט על הצעת מחיר. האישור הוא CAS על מחיר, מטבע ותוקף, תחת נעילת design. הלקוח חייב לשלוח `expectedTotalPrice` ו-`expectedCurrency`. אירועי `quote:updated` נשלחים בזמן אמת.
- התראות דחייה אוטומטית ונסיגה עוברות דרך ה-outbox, באותה טרנזקציה.
- מחיקת חשבון נועלת ומושכת הצעות פתוחות **לפני** שינוי שורת המשתמש. ה-deadlock מול אישור מקביל שוחזר בטסט ותוקן.
- ג'וולר שקיבל בקשה לא רואה מתחרים ולא את המחירים שלהם. מי שעזב שיחה לא רואה הצעות (חוץ מהבעלים והמחבר).
- בקשות עיצוב:
  - מכסה יומית לכל מבקש.
  - ליד נגבה פעם אחת לכל עיצוב וג'וולר. אחרי שבקשה נסגרת, אפשר לשלוח שוב בלי ליד, אבל עם enforcement צריך מנוי פעיל.
  - broadcast חוזר מגיע לג'וולרים חדשים (`ATELIER_BROADCAST_FANOUT`).
  - נעילות בסדר קבוע.
- עיצוב שהושלם לא ניתן לעריכה ולא לפרסום מחדש.

### חיוב ומנויים (3 סבבי סקירה)
- אין מנוי בתשלום בחינם. trial אחד לכל תיבת דואר ותפקיד, דרך hash עם `TRIAL_HASH_SECRET` שחובה בפרודקשן. trial לא חוזר אחרי מחיקה ורישום מחדש.
- רכישה רק דרך checkout בצד השרת. ההפעלה רק דרך webhook חתום (HMAC על הבייטים הגולמיים).
- **מחיר מוסכם** נשמר על כל מנוי, וחידוש נבדק מולו ולא מול הקטלוג.
- כל אירוע תשלום נשמר עם תוצאה: APPLIED, IGNORED, NEEDS_REVIEW או LEGACY. כסף שאי אפשר להחיל בבטחה נשמר תמיד ל-review ואף פעם לא נזרק. גוף חתום שאי אפשר לקרוא, וחריגה בזמן ההחלה, נשמרים ומחזירים 2xx. שגיאת DB חולפת מחזירה 503 כדי שהספק ינסה שוב.
- `checkout.completed` חייב את `invoiceId` של החיוב הראשון.
- ביטול מנוי, וגם מחיקת חשבון, נרשם למפעיל ב-`event_logs subscription.provider_cancellation_required`, כי עדיין אין אינטגרציה לספק.
- הנעילות הן FOR NO KEY UPDATE (`lockUser` / `lockSubscription`), ו-static test אוסר FOR UPDATE גולמי על users.
- תקרת overage מחושבת על חלון מתגלגל.

### מדיה והעלאות
- תוכן מוגש בקישור חתום (HMAC שקשור ל-id), ב-bearer מורשה, או כנכס ציבורי. ציבורי פירושו לוגו או תיק עבודות של פרופיל מפורסם, או thumbnail של עיצוב מפורסם.
- רק READY מוגש. הנתיב מוגבל לתיקיית האחסון. קיימים nosniff, Content-Disposition ו-CORP.
- בדיקת חתימת קובץ (magic bytes), מכסה יומית תחת נעילה, קובץ אחד לבקשה.
- avatar, תיק עבודות, לוגו ו-thumbnail חייבים להיות תמונה של המשתמש עצמו. הודעת IMAGE או AUDIO חייבת להתאים לסוג הקובץ.
- try-on: מכסה יומית (`VISUALIZATION_JOBS_PER_DAY`), ומחיקה לפי הפניות.
- Tripo: timeouts, בלי redirects, ותקרת גודל (`TRIPO_MAX_MODEL_BYTES`).
- למדיה יש rate limit נפרד לכל IP.

### פרטיות
- פרופילים ציבוריים בנויים ב-allow-list.
- מיקום מעוגל לכ-1 ק"מ.
- מחיקת חשבון מנקה PII, מסירה מהשוק, מבטלת מנויים ו-checkouts, וסוגרת sockets.

### אמינות ופלטפורמה
- outbox עם lease, fencing ו-dead-letter.
- `nextAttemptAt` שהוא NULL פירושו "עכשיו". זה בגלל הפרש שעונים בין ה-engine ל-Node ב-Windows.
- מיפוי שגיאות Prisma:
  - P2002 → 409.
  - P2025 ו-P2023 → 404 (P2025 נרשם בלוג כשגיאה).
  - P2028 → 503, P2034 → 409.
  - 4xx שמגיע מ-body-parser נשמר, למשל 413 במקום 500.
- env validation קשיח בפרודקשן.
- seed: נתוני ייחוס בלבד כברירת מחדל. נתוני דמו נחסמים בפרודקשן.
- migrations:
  - בכל migration מוגדר `SET LOCAL lock_timeout`. זה אומת מול PG18: לא דולף לסשן, ו-rollback מלא כשנכשל.
  - כל migration שמשנה נתונים נבדק על DB זמני (scratch).
- Dockerfile רב-שלבי: משתמש לא-root, healthcheck, ו-target `release` שמריץ migrate ו-seed.

### אפליקציה
- כתובת ה-API נקבעת ב-build-time; ב-release חייבים https.
- סשן נשמר ב-OS keychain, עם מיגרציה מ-AsyncStorage.
- מדיה נטענת רק דרך הקישורים החתומים.
- זרימת הרשמה ואימות מייל, טיפול ב-QUOTE_CHANGED, ו-polling של משימות AI.
- חתימת release ב-Android: לעולם לא במפתח ה-debug.
- ביקורות הבעלים נטענות מ-`/reviews/mine`.
- ב-react-navigation עודכן core ל-7.23.0 (תיקון DoS ב-query-string).

---

## 3א. סבב 4 (2026-10-13): WP10, סקירה סופית ותיקונים

**תלויות (WP10):** חלק ה-`npm update` (Nest 11.2.7, proxy-addr, multer, engine.io, qs, fast-uri) כבר היה ב-`08bc79b`. בסבב הזה:
- bcrypt 6. אין בו node-pre-gyp, ולכן tar (critical) יצא מהעץ. hash-ים של bcrypt 5 נבדקו ועובדים, גם דרך ה-API.
- nodemailer 10.1.0 עם types משלו (`@types/nodemailer` הוסר), ו-`@types/bcrypt` 6.
- override ל-js-yaml של `@nestjs/swagger` (5.4.3), ו-js-yaml מקונן 4.3.2.
- `npm audit`: לפני 41 (1 critical), אחרי 37 (0 critical). בפרודקשן (`--omit=dev`) נשארו 3, כולם Prisma CLI (deepmerge-ts), וה-API לא טוען אותו.

**ממצאי סקירה שתוקנו, כל אחד בטסט אדום ואז ירוק:**
- שרת:
  - שינוי סיסמה שדורס איפוס.
  - כניסה עם סיסמה שהוחלפה בינתיים.
  - switch-role אחרי "התנתק מכל המכשירים". **הוכח שהטוקנים עבדו.**
  - deadlock כששתי הצעות של אותו ג'וולר על אותו עיצוב.
  - הצעה שנוצרת בזמן מחיקת החשבון, ואישור הצעה של חשבון שנמחק. הבדיקה שתועדה כ-W-M6 **לא הייתה בקוד**, ועכשיו היא קיימת.
  - חיוב שני על checkout שהושלם.
  - `invoice.paid` של החיוב הראשון בכל סדר הגעה, באמצעות advisory lock לפי invoice.
- אפליקציה:
  - עותק keychain ישן.
  - "זכור אותי".
  - refresh בלי timeout, ו-refresh של סשן שהוחלף.
  - מודל AI שהלך לאיבוד.
  - קישורי מדיה שפגו.
  - בדיקת `API_BASE_URL` כבר בזמן ה-build.
- מסמכים ו-CI:
  - 7 טענות שגויות תוקנו ב-`production-readiness.md`.
  - ב-Dependabot: התעלמות מ-nativewind 4.2.7 ומעדכוני minor של react-native.
- כלים:
  - ב-smoke: `SMOKE_API_PORT` / `SMOKE_PG_PORT`, ואיפוס מפתחות ה-`.env`.
- באג קודם שנמצא בסקירה: פרסום פרופיל הוסיף שוב את כל תמונות תיק העבודות. התיקון בשני הצדדים: ב-API ההוספה אידמפוטנטית לכל זוג פרופיל ותמונה, וב-אפליקציה מוסיפים רק תמונות שעוד לא נשמרו. כפילויות שכבר קיימות ב-DB לא נוקו.

## 3ב. סבב 5 (2026-10-13): התאמה ל-PRD

**איך:** חמישה בודקים בלתי תלויים עברו על ה-PRD (Google Doc, v1.0) דרישה-דרישה מול השרת והאפליקציה. כל פער קיבל טסט שנכשל, ואז תיקון. בסוף: סבב code review אחד (שלושה סוקרים במקביל), בלי לולאות.

**שרת — עיקרי השינויים** (טסטים: `test/prd/prd-gaps`, `test/prd/prd-journey` — מסע מלא מקצה לקצה, `test/marketplace/order-board`, `test/migrations/{seed,data-migrations}`):
- סטטוס הזמנה לכל צורף (`DesignRequestTarget.status`, migration `20261013120000_jeweler_order_status` עם backfill וטסט מיגרציה); מונים, טאבים ו-`tabCounts`; דחיית בקשה ע"י צורף תחת נעילת החשבון.
- הצעה שתומחרה על עיצוב שהשתנה לא מאושרת (`DESIGN_CHANGED_SINCE_QUOTE`); תוקף עיצוב נאכף; הצעות שפג תוקפן הופכות ל-EXPIRED (job כל 10 דק').
- `GET /designs/:id/quotes`, `GET /atelier/designs/:id`, `GET /conversations/:id`, `POST /auth/roles`, `DELETE /uploads/:id`, `POST /admin/designs/:id/unlock`.
- הודעות מערכת בעברית בניסוח ה-PRD + קישור WhatsApp; ה-seed מחליף רק את הנוסח האנגלי הישן. טבלת מידות טבעת לפי ה-PRD.
- התראות "הודעה חדשה" לבית; באנרים בלי budget; E.164; אימות פרמטרים ביצירה/פרסום; `hd_export`; מחיקת קבצים במחיקת חשבון; תמונות השראה נגישות לצורפים כשהעיצוב מפורסם.
- כניסה מוצלחת לא אוכלת את מכסת הניסיונות; אות עברית בסיסמה; הגדרת `lockout` מתה הוסרה.

**אפליקציה:** שלושה זרמי עבודה במקביל (צורף/אטלייה, מעצב, משותף/צ'אט), כל אחד TDD על לוגיקה טהורה ב-`app/src/lib`. בין השאר: לוח הזמנות לפי סטטוס אישי, פרטי עיצוב מלאים, משיכת הצעה, שעות פעילות, בית בלי עדכונים מזויפים, עימוד, הצעות קודמות, עיצוב שהושלם לקריאה בלבד, אזור בפרסום, מידות IL/US, מחירים מה-API, try-on שבודק הרשאה לפני בחירת תמונה ומוחק אותה בסירוב, הוספת תפקיד, חיפוש בשרת בשיחות, וי קריאה אמיתי, טיוטה שלא נמחקת, כפתור WhatsApp, הודעות שגיאה בעברית לפי קוד.

**ממצאי ה-review (סבב אחד) — תוקנו, כל אחד עם טסט אדום→ירוק:**
- `useAsyncData`: תשובה ישנה ואיטית דרסה חדשה (החלפת סינון / רענון).
- מחיקת חשבון לא מחקה תמונות של העיצובים (שנמחקו איתו).
- עיצוב בלי שם הוצג כ"טבעת אירוסין יהלום".
- נדחה (לא באג): fallback ל-`/uploads/:id/content` במדיה של צ'אט — השרת לא מגיש מדיה פרטית בלי חתימה או טוקן של משתתף.

## 4. מצב הבדיקות האחרון (סבב 5, 2026-10-13)

- **שרת:** typecheck נקי; drift: "Migrations match schema.prisma (no drift)".
  - ריצה מלאה: 51 קבצים, **541/542**. הכישלון היחיד: timeout של 60 שניות בטסט הראשון של `test/migrations/data-migrations` (בונה DB זמני מאפס). ריצה חוזרת של `test/migrations` לבד: **21/21**.
  - בדיקת מוטציה על 12 ההתנהגויות החדשות (כל תיקון הוחזר, הטסט שלו הורץ): **12/12 נתפסו**.
  - smoke (`SMOKE_API_PORT=3112 SMOKE_PG_PORT=55434`): **33/33**.
- **אפליקציה:** jest **33 קבצים, 214/214**; tsc 0; lint 0 שגיאות ו-78 אזהרות (בסיס: 82).
- **ריצות קודמות בסבב הזה** נכשלו על timeouts בזמן שהמכונה הייתה עמוסה (כמה ריצות במקביל) ועל ניתוק חיבורים רגעי של Windows ל-Postgres; אף כישלון לא היה של הקוד.

### מצב הבדיקות בסבב 4 (לתיעוד)

- **שרת:**
  - typecheck נקי.
  - ריצה מלאה: 46 קבצים. 481 מתוך 485 טסטים עברו. 4 נכשלו ב-timeout של 60 שניות ב-`test/migrations`, תחת עומס של פרויקטים אחרים (CPU 79%). בריצה חוזרת של `test/migrations` לבד: **17/17**.
  - drift: "No difference detected".
  - baseline לפני השינויים: 471/471.
- **בדיקות מוטציה** על הטסטים החדשים של uploads ו-password: **6/6** נתפסו.
- **אפליקציה:** jest **38/38**, tsc 0, lint 0 שגיאות ו-82 אזהרות (כמו הבסיס).

### מצב הבדיקות לפני סבב 4 (לתיעוד)

- **שרת:**
  - typecheck נקי.
  - unit: 121 עוברים.
  - e2e: ריצה על התיקיות המושפעות (billing, marketplace, uploads, reliability, migrations, privacy, auth ו-src) עברה 426 טסטים. 6 כישלונות היו עומס: timeout ב-migrations בזמן `npm ci` במקביל, ובטסט שתוקן (ניקוז outbox). בריצה חוזרת על מכונה שקטה: migrations ו-subscriptions עברו 41/41.
  - ריצה מלאה קודמת עברה 443/443, אחרי ניקוי תהליכי PG18 יתומים.
- **בדיקות מוטציה:** 13 מתוך 13 נתפסו בסבב 3, אחרי הידוק טסט אחד. בסבבים קודמים נעשו בדיקות נוספות.
- **drift check:** נקי ("No difference detected").
- **אפליקציה:** jest 21/21, tsc 0, lint 0 שגיאות ו-82 אזהרות (הבסיס).
- **סקירות קוד בלתי תלויות:** ראו פירוט ב-`findings.md`. כל ממצאי הסקירות האחרונות טופלו.
  - auth ומרקטפלייס.
  - WP5–8.
  - חיוב ×3.
  - סבב 2 שלא-חיוב.

---

## 5. מה נשאר, לפי סדר

> **סבב 4:** סעיפים 5.1–5.5 בוצעו (ראו 3א ו-4). הטקסט שלהם נשאר לתיעוד. מה שבאמת נשאר נמצא בסעיפים 6 ו-8.

### 5.1 עדכוני תלויות בשרת (WP10). בוצע בסבב 4.
יש פגיעויות ידועות: proxy-addr (**critical**, זיוף IP דרך trust-proxy), multer (DoS), engine.io (DoS), qs, fast-uri, js-yaml (דרך `@nestjs/swagger`), ו-nodemailer (SMTP injection; השימוש שלנו לא חשוף, אבל צריך לשדרג).

```bash
cd backend
cp package.json package-lock.json E:/claude-work/malinvosky/tmp/   # גיבוי
npm update --no-audit --no-fund @nestjs/core @nestjs/common @nestjs/platform-express @nestjs/platform-socket.io \
  @nestjs/websockets @nestjs/testing @nestjs/swagger proxy-addr qs fast-uri engine.io brace-expansion swagger-ui-dist tar @mapbox/node-pre-gyp
# צפוי: @nestjs/* 11.2.7 (multer 2.4.0), proxy-addr 2.0.8, engine.io 6.6.11, qs 6.16.0, fast-uri 3.1.8
# לבדוק ש-prisma ו-@prisma/client נשארו 6.19.3. אם לא, לשחזר מהגיבוי.
npm install nodemailer@^10.1.0
# src/mail/mail.service.spec.ts שולח דרך nodemailer אמיתי לשרת SMTP פנימי. הוא חייב להישאר ירוק.
# אם nodemailer 10 כולל types משלו, אפשר להסיר את @types/nodemailer. לוודא ב-tsc.
npm audit   # מה שנשאר אמור להיות dev בלבד (שרשרת jest 29, deepmerge-ts ב-Prisma CLI)
```
אחר כך: typecheck, unit, ריצת e2e מלאה, smoke, drift. ואז commit.

### 5.2 ריצה מלאה אחרונה, על מכונה שקטה
```bash
node node_modules/jest/bin/jest.js --runInBand --forceExit   # כל השרת
node scripts/check-migrations.cjs
npm run test:e2e:local                                         # smoke מול API בנוי (בפעם הקודמת 33/33)
```
וגם האפליקציה: jest, tsc, lint.

### 5.3 סקירה בלתי תלויה סופית, בקונטקסט נקי
להפעיל 2 סוקרים (Agent, general-purpose), **read-only**, בלי להריץ טסטים:
- (א) שרת: `git diff bf3431b 08bc79b -- backend` (וכל מה שיתווסף אחריו). דגש על סיום סשנים, מחיקה ונעילות, webhook ו-checkout, migrations ו-media.
- (ב) אפליקציה, מסמכים ו-CI: `git diff a67a5db HEAD -- app docs .github`. דגש על keychain, refresh, חוזי API, חתימה, ונכונות `docs/production-readiness.md` מול הקוד.

לטפל בממצאים ב-TDD (טסט שנכשל ואז תיקון), להוסיף אותם ל-`findings.md`, ולעשות commit.

### 5.4 דוח מסכם בעברית (Gate 5)
- שורת מסקנה (צפוי: READY WITH CAVEATS).
- מה נעשה.
- ראיות: מספרים מהריצה המלאה, מוטציות, drift, smoke, סקירות.
- **מה לא נעשה ולא אומת** (סעיף 6).

### 5.5 פריטים קטנים פתוחים ב-`findings.md`
- נשארו רק WP10 (5.1). הפריטים המסומנים `[~]` הם רשימות טסטים שכיסוין הושלם ברובו.

---

## 6. מה **לא** נעשה או לא אומת (חייב להופיע בדוח)

- **Docker build לא הורץ מקומית**, כי ה-daemon כבוי והוחלט לא להפעיל. ה-CI בונה את שתי התמונות.
- **האפליקציה לא נבנתה ולא נבדקה על מכשיר** (Android/iOS). צריך לבדוק על מכשיר:
  - כניסה, כולל Google.
  - מדיה.
  - try-on ב-WebView.
  - keychain.
  - אמינות three.js ו-WebView. מומלץ לארח את three.js מקומית.
- **אין ספק תשלומים אמיתי.** הוא נכשל סגור (503), וביטול מנוי אצל הספק הוא ידני.
- **חסרים רכיבי תשתית:**
  - אין S3: האחסון מקומי, ו-presign מחזיר 501.
  - אין Socket.IO Redis adapter: ניתוק sockets הוא רק ב-instance המטפל, ובשאר יש חסימת join בלבד.
- **אין שער גרסת מינימום לאפליקציה.** בשחרור הזה צריך force update בחנות.
- **תלויות toolchain באפליקציה:** כלי build דרך react-native (RN CLI, Metro, Jest, Tailwind). התיקון דורש RN 0.87, Jest 30 ו-Tailwind 4, ולא בוצע בלי בדיקה על מכשיר.
- **תלויות dev בשרת:** jest 29 (תיקון ב-30), ו-deepmerge-ts ב-Prisma CLI (תיקון ב-Prisma 7; ה-API לא טוען אותו).
- **מגבלות מוכרות:** limiters לכל instance בלי Redis. ה-throttle הגלובלי לכל instance גם עם Redis. ה-backfill של המחיר המוסכם משתמש במחיר הקטלוג ביום ה-migration. overage מחושב לפי מחיר הקטלוג הנוכחי.
- **סבב 4, אומת בטסטים ובהרצה מקומית בלבד:**
  - תיקוני האפליקציה (keychain, remember-me, refresh, מודל AI, קישורי מדיה) נבדקו ב-jest, tsc ו-lint. **לא נבדקו על מכשיר.**
  - החיבור של ה-hook ושל המסך (רענון קישורים בצ'אט, צירוף מודל AI) לא מכוסה בטסט, כי אין react-native testing library.
- **בדיקות שדורשות מכשיר** (מהסקירה):
  - שהספרייה react-native-keychain באמת מקושרת. ב-`Podfile.lock` אין לה רשומה.
  - שב-iOS ה-keychain שורד הסרה והתקנה מחדש של האפליקציה.
  - ש-"התנתק" במצב offline לא מחזיר את הסשן.
- **מדיה בעמודים ישנים בצ'אט** (נטענו דרך "earlier messages") מתרעננת רק כשפותחים את השיחה מחדש.
- **סבב 5:** המסכים החדשים/המעודכנים לא הורצו על מכשיר — הבדיקה היא jest על הלוגיקה (ב-`app/src/lib`), tsc ו-lint. "קרוב אליי" מחפש סביב נקודה קבועה בתל אביב (אין ספריית מיקום). Sentry לא חובר (צריך DSN ואישור לתלות). ETL מ-Excel / קונפיג סוגי פריטים מונחה-נתונים — לא טופל.
- **השעיית חשבון:** אין endpoint של אדמין. השעיה ישירה ב-DB לא מעלה את sessionVersion ולא סוגרת sockets, אבל בקשות HTTP כן נחסמות לפי הסטטוס.
- **אינדקס:** אין אינדקס על `subscription_invoices.providerInvoiceId` לבדו. החיפוש לפיו קורה רק במסלול הנדיר של `invoice.paid` בלי מנוי ידוע. כדאי להוסיף אותו כשמחברים ספק.

---

## 7. החלטות שהתקבלו (כדי לא לפתוח אותן מחדש)

- **מנוי חי אחד למשתמש**, בכל התפקידים: רכישה מחליפה trial או free גם של תפקיד אחר. זה הכלל המקורי, ויש partial unique index.
- **מחיר מוסכם (grandfathering):** מנוי חינמי ממשיך להתחדש בחינם גם אם הקטלוג התחיל לגבות. מנוי בתשלום לא הופך לחינמי.
- **הבקשה של `MEDIA_THROTTLE_LIMIT` להוריד את הברירת מחדל לא בוצעה.** הוא נשאר 600 לכל IP בגלל CGNAT, ובמסמך מומלץ CDN.
- **session version ולא חותמת זמן:** כך אין דיוק של שנייה שגוזר טוקן חדש או משאיר טוקן ישן.
- **NEEDS_REVIEW על checkout הוא סופי:** שום תשלום נוסף לא יוחל אוטומטית.
- **הגדרת migrations:** כל ה-migrations מ-20261012 לא נפרסו מעולם, ולכן מותר היה לערוך אותם. **אחרי הפריסה הראשונה הם קפואים.**
- **שחרור stop-and-start, לא rolling:** ב-`subscriptions` יש עמודות NOT NULL חדשות, וחוזי ה-API השתנו. השרת והאפליקציה משתחררים יחד.

---

## 8. שאלות פתוחות לבעל המוצר

1. האם להמשיך עם grandfathering מלא של מחירים, או להעביר מנויים ישנים למחיר חדש ב-migration?
2. האם המכסה של overage למנוי שנתי צריכה להיות חודשית? כרגע החלון הוא מחזור החיוב, כלומר 365 יום.
3. איזה ספק תשלומים ייבחר? צריך לכתוב לו adapter לפי חוזה ה-webhook שב-`docs/production-readiness.md` סעיף 4.
4. האם להוסיף שער גרסת מינימום לאפליקציה לפני השחרור?
5. **grace window ל-refresh token** (מסבב 4): אם התשובה של refresh הולכת לאיבוד, למשל כשהאפליקציה עוברת לרקע, השימוש הבא בטוקן הישן נחשב גניבה, והמשתמש מנותק. אפשר לאפשר את הטוקן הקודם לכמה שניות. זה מחליש מעט את זיהוי הגניבה. החלטה של מוצר ואבטחה.
6. **אפליקציה:** להוסיף listener ל-`quote:updated` ו-flow של checkout לתוכניות בתשלום? כרגע הן לא קיימות, והשרת כבר תומך בשתיהן.
7. **סבב 5 — החלטות מימוש לאישור (D1–D8)** ושאלות המוצר הפתוחות (🟡) מה-PRD: ראו `docs/prd-gap-audit.md`. בעיקר: טלפון הלקוח לפני אישור הצעה, מה נחשב "במשא ומתן", אורכי השרשרת לכל סגנון, אישור אדמין לפני פרסום פרופיל, רשימת השיבוצים/המתכות/האבנים הסופית.
