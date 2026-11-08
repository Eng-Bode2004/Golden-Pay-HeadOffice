# Golden Pay — Head Office dashboard

Arabic RTL React dashboard for Golden Pay Head Office: attendance and absences, payroll
and salaries, staff, expenses, complaints, rules, and client report templates. Data comes
from the live Golden Pay backend; nothing is mocked.

## Local development

From the repository root:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4150. Vite proxies `/api/*` to the live backend on Thalmet Cloud;
set `IDENTITY_API_URL=http://127.0.0.1:4001` to use a local backend, and `PORT` to change
the port.

## Deploying as a static website

| Install | Build command | Output folder |
|---|---|---|
| `npm ci` | `npm run build` | `dist` |

The site calls the backend at `VITE_API_URL`, set in `.env.production` to the live
backend. Pages use addresses like `/templates/…`, so the host must answer unknown paths
with `index.html`: the build includes `404.html` and a `_redirects` file for hosts that
use them; otherwise turn on the host's single-page-app fallback. Add the site's domain to
the backend's `CORS_ORIGINS`.

## Appearance and language

The palette button in the header opens the appearance panel: six themes, the
background motion switch and Arabic (RTL) or English (LTR). Preferences persist in
local storage. Language changes reload the page; save in-progress edits first.

| Theme | 3D background |
| --- | --- |
| Royal Gold (default) | Extruded brand emblem inside gold rings |
| Midnight Sapphire | Turning network of connected nodes |
| Imperial Emerald | Rolling wave field of light |
| Royal Amethyst | Drifting faceted crystals |
| Rose Gold | Polished gyroscope rings |
| Black Platinum | Metal data city over a moving grid |

Theme tokens and scene colours live in `src/themes.ts`; the scenes are in
`src/scene.ts`, a separate chunk loaded on demand. Without WebGL, or with reduced
motion, the animated CSS colour layers or a still frame are shown instead.

`src/premium.css` supplies the glass surfaces and responsive account layout. Keep
`opacity` and `filter` off ancestors of `.glass` elements: either one silently
disables their backdrop blur. `GlassNav` moves one frosted lens between nav icons.
`src/locale.ts` contains translations; `localization.cjs` translates source UI
literals at compile time, leaving names and other API data unchanged. Run
`bun run check:locales` when adding UI copy.

Invitations now require only an email. The recipient opens a three-step flow to
enter their name, create a password and choose protection. New invitations sign
the recipient in after acceptance and open the selected verification setup;
protection becomes active only after verification. Older invitations retain
their required-MFA policy.

## Pages

- Overview: real account counters, account-state breakdown, latest accounts and
  audit activity, current profile and live backend/database health.
- Investigations: every case with status tabs and search. The drawer shows the
  answers and photos, downloads the PDF, and approves or returns the report.
  Negative reports ("استعلام سلبي") are badged and show their reasons and note; the
  drawer maps the investigator's GPS trail (accept, start, photos, submit) with each
  point's distance from the case address. Open cases with nobody free show
  "بانتظار مستعلم متاح".
- New investigation: a four-step wizard. Send to one investigator, or to everyone
  in an area chosen by place names, a map circle or a drawn shape, with a live count
  of who will receive it. Then the subject, the client, and the form.
- Forms: every client's active forms with their version and layout, read-only. Forms change
  only as versions that Head Office reviews and approves.
- New investigation: forms are grouped by investigation type and show the version and
  whether the report uses the client's own layout. The case keeps that exact version.
- Investigation drawer, «التحقق قبل الاعتماد»: missing answers, statements left out for lack
  of evidence, fields printed in the report appendix, and the template version used;
  the Word version of a client-layout report can be downloaded next to the PDF.
- Pricing: the five investigation types, each with delivery time, deadline, time to
  accept (minutes or hours), client price, investigator pay and profit per case.
- Overview (finance access only): monthly revenue, investigator payouts, net profit,
  cases not yet approved, a six-month chart and revenue by client.
- Performance: leaderboard for the month — most active, most improved, fastest to
  respond and top earners — with acceptance rate and time from seeing to finishing.
- Investigation drawer: the case journey (created, seen, accepted, submitted,
  approved, with the time between steps), every offer with its level and reply, and
  the full log. Unaccepted cases can be re-sent.
- Investigators: area, case count and this month's pay per person. Each row opens a
  profile with photo, account details, work area map, earnings, on-time rate,
  average completion time, change requests, breakdowns and recent cases.
- Activation requests: every account waiting for an administrator, with the
  personal photo. The review drawer shows the photo, ID images, submitted details
  checked against the HR record, then activates the account or rejects it with a
  reason. Images are fetched with the admin token, never as public URLs.
- People: server-side search/filter/pagination, investigator creation, review of
  pending accounts, suspension/reactivation, one-time credential display.
- Activity: paginated audit log with success/failure filtering.
- Owner administration: invitations, invitation resend/revoke, and per-admin MFA
  policy changes requiring the owner's password. Existing owner authorization
  remains enforced by the backend, not just hidden controls.
- Security (opened from **إدارة حسابي** in the header avatar or team page, with a
  back button — there is no separate **الأمان** nav item): edit the signed-in
  administrator's display name, then choose one of four sign-in modes — password
  only, password + emailed code, password + authenticator app, or password +
  emailed code + authenticator app. Authenticator enrollment uses a scan-or-manual
  secret and eight one-time recovery codes; switching the email step on or off for
  an existing authenticator only asks for the current password, without re-scanning
  a QR code. Password-confirmed removal is also available.
- Login/enrollment: email/password, authenticator QR enrollment, TOTP/recovery login,
  chained email-code-then-authenticator login, and email OTP for accounts that have
  not switched to an authenticator. Recovery codes stay visible until acknowledged.

Only the presentation was redesigned; existing account and invitation data is
preserved. No owner passwords or MFA secrets are included in frontend source.
Concurrent requests share a single refresh-token operation.

## Main administrator protection

The main administrator signs in as `goldenpayservices@gmail.com`, with the password
supplied during the explicit owner update. The account starts on email OTP: a
six-digit code is emailed after the password is verified, and no session is issued
before the code is accepted.

To switch to an authenticator app, sign in, open **إدارة حسابي** (`/security`) from
the header avatar or the owner administration page, choose the authenticator mode,
scan the QR with Google Authenticator, Authy or a similar app, and confirm the
six-digit code. Activation returns eight recovery codes that must be saved; each
works once. Later sign-ins ask for the authenticator code or a recovery code instead
of emailing an OTP. Choosing the three-step mode adds the emailed code back before
the authenticator step; switching between the two authenticator modes only asks for
the current password and never invalidates the existing secret.

Email codes expire in five minutes, allow five attempts, and are single-use. Return
to login to request a new code after the one-minute cooldown. Missing/invalid SMTP
credentials never bypass verification.

Configure Gmail's **App Password**, not the dashboard login password, in the backend
service's `.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=goldenpayservices@gmail.com
SMTP_PASS=your-gmail-app-password
```

Enable Google account 2-Step Verification to create an App Password, then restart
the identity service. Keep the App Password out of source control and chat.
SMTP_PASS is configured locally; never commit or print it.

## Design and accessibility

`src/styles.css` contains the shared glass, spacing, typography, and color tokens.
`src/components/ui.tsx` contains inline vector branding/icons and primitives.
Layouts adapt at 1250, 1050, and 760px; wide tables scroll inside their panels.
Keyboard focus, skip-navigation, reduced-motion behavior, and opaque fallback
surfaces for browsers without backdrop blur are included. Remote fonts are not
required: IBM Plex Sans Arabic is bundled locally under `public/fonts/` with its
SIL Open Font License.

Office background: Unsplash photograph,
source asset `https://images.unsplash.com/photo-1497366754035-f200968a6e72`, stored
locally as `public/workspace.jpg`. The decorative scene uses no remote image request
at runtime. The brand mark and interface icons are code-drawn SVGs.

## Pages

For accounts with the `head_office` role. Pages: business
overview (revenue, salaries, expenses, net profit, six-month trend, most effective admins
and investigators), staff with a full profile per person (attendance calendar, points,
give or remove points, salary and adjustments), daily attendance, payroll, expenses,
complaints, and work hours and point rules.

Every administrator also gets, from the header buttons, **نقاطي** (their points, what each
colour means, the month's calendar and the effect on pay) and **رسائل الإدارة العليا** (write
to head office and read its replies). The bell opens a notification center with pending
activation requests, new head office replies and today's attendance. Head office reads
admins' messages under الشكاوى والرسائل → رسائل المديرين.


### Templates and reports (القوالب والتقارير)

Head Office manages every client's report template here (see the backend README for the
rules behind it):

- **Library:** active templates, drafts and versions waiting for a decision, by client;
  the **original archive** tab lists every uploaded file with the client and investigation
  type found in its content, the confidence, the revision and its warnings.
- **Upload:** drop a DOCX, DOC or PDF; the classification and its evidence appear at once,
  then it becomes a new template or a new version of an existing one.
- **Version workspace:** *visual mapping* shows the client's page with every fillable place
  highlighted (bound, from case data, statement with evidence, removed, unbound, old data)
  and an inspector to bind it to a question, a case value or the stamp, or create a question
  from it; *fields* edits sections, types, options, conditions, validation, repeating tables
  (with ready-made partner, board, branch, outlet, warehouse and source tables) and the
  evidence each statement needs; *PDF preview* renders the real layout with field names,
  sample data or a blank form; *checks* lists what blocks review and the warnings to
  confirm; *changes* compares with the active version; *history* is the audit trail.
- **Review:** another Head Office member approves (optionally activating) or returns the
  version with a note. Approved versions are locked; a new copy is made to change them.
