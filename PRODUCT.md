# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

**Primary: the working professional actor on an audition deadline.** They have
sides in hand, a tape due — often overnight — no reader available, and no crew.
They are alone in a room with a phone, working fast, repeating the same scene
many times, and the output has to be good enough to send to casting.

**Secondary: the student or early-career actor building technique.** Drama
school and conservatory students, and actors early enough in their careers to
be practising rather than submitting. They want feedback, measurable progress,
and a way to work on craft between jobs.

Both are served. When their needs conflict, the professional under deadline
wins: speed, repetition, and tape quality outrank pedagogy.

## Product Purpose

Reherza lets an actor rehearse a scene and produce the audition tape without a
second person in the room. Import a script, and the app parses it into
characters and lines, reads every role but yours aloud in real voices, listens
while you deliver your lines, scores the take, and records the self-tape you
actually submit.

Success is a tape sent on time that the actor is willing to put their name on,
produced in one sitting, alone.

## Positioning

Four mechanisms together, none of which a neighbouring rehearsal app can
truthfully claim as a set:

1. **AI scene partner.** Any uploaded script is parsed into speakers and lines,
   and every role but the user's is spoken aloud in assigned voices — so a scene
   can be rehearsed alone, at any hour, without a reader.
2. **Delivery analysis.** The app listens to the take and returns accuracy
   against the script plus coaching: summary, strengths, improvements, and a
   practice plan.
3. **Self-tape studio.** The audition tape is recorded in-app — front camera,
   3-2-1 countdown, live teleprompter — then reviewed, and uploaded. Rehearsal
   and deliverable share one surface.
4. **One script, the whole workflow.** Import → parse → rehearse → tape →
   submit lives in a single product. The script is never re-entered, re-typed,
   or re-formatted between steps.

Competitors do line-learning, or a teleprompter, or a tape recorder. Reherza's
claim is the unbroken line from a PDF of sides to a submitted tape.

## Operating Context

- **The room.** A bedroom, a hotel, a green room, a car. Often at night, often
  the night before. Handheld, one-handed where possible, frequently with
  headphones in so the AI partner's voice does not bleed into the recording.
- **Repetition is the work.** An actor runs the same scene many times in a
  session. Anything that costs a tap or a wait is paid many times over.
- **Mid-take, hands are busy.** During a rehearsal or a recording the user is
  performing. They cannot read fine print, hunt for a control, or recover from
  an ambiguous state.
- **Two lighting worlds.** Light for browsing, script work, and admin; a dark
  **Stage** surface for rehearsing in a dark room and for the immersive screens
  (Parsing, Studio), which are always dark.
- **The artifacts.** Sides and full scripts as PDF or text; parsed line lists;
  recorded takes as video files; session results; voice credits and plan limits.

## Capabilities and Constraints

**Shipped surfaces (16 screens):**
- Auth: Sign In, Create Account, Verify Email, Reset Password, Legal reader
- Tabs: Home, Playhouse, Rehearse, Profile & Settings
- Script flow: New Script, Parsing, Script Detail, Script Editor
- Immersive: Rehearsal Room, Studio (self-tape), Take Review, Session Results
- Account: Billing

**Confirmed capabilities:** script import by text or file (with server-declared
page/word limits) and AI parsing; character selection; per-speaker voice
assignment and TTS with baseline/enhanced profiles; live rehearsal sessions with
transcription and delivery analysis; Playhouse demo scenes; self-tape record,
review, upload, download and delete; usage/credit tracking; plan and credit status with cancel (purchases are web-only:
no in-app checkout, prices or upgrade links, per App Store 3.1.1 / Play payments
policy); recording history; product feedback; support contact; waitlist when
signups are closed; account deletion.

**Technical constraints:**
- Expo SDK 51 / React Native 0.74, TypeScript. iOS and Android from one
  codebase; tablets are not supported (`supportsTablet: false`), portrait only.
- Every screen depends on a live backend at `EXPO_PUBLIC_API_URL`. Production
  builds must be HTTPS — ATS and Android cleartext policy are not to be
  weakened.
- Auth is AWS Cognito (email/password, Google, Apple) synced to an app JWT.
- Camera and microphone are required for the core loop; their permission
  strings are store-facing text.
- **Terminology is fixed:** Playhouse (demo scenes), Rehearse, Studio (self-tape
  recording), Take (a recording), Stage (the dark theme), Sides/Script, voice
  credits. These are product nouns, not labels to reword for variety.

**Explicitly undecided:** nothing in the product record is pending a decision at
the time of writing.

## Brand Commitments

- **Name:** Reherza. Bundle `co.reherza.app`, scheme `reherza://`, site
  `reherza.com`.
- **The design system is shared with the web product.** `src/theme.ts` mirrors
  `frontend/src/styles/theme.css` so both clients re-skin together. Its binding
  rules: brand blue `#2563EB` is the only colour that means "interactive";
  exactly one gradient (blue→cyan) reserved for hero moments; status colours sit
  outside the brand ramp with separate readable-text and fill steps; the "rec"
  dot is red and is a recording light, never an error; scores use the
  monotonic, blue-free ramp in `lib/scoreColors.ts`; line ownership
  (`tpYou`/`tpPartner`) is a role, consistent across teleprompter, editor and
  rehearsal room.
- **Type:** Manrope is the single typeface. Weight carries hierarchy; there is
  deliberately no second display face.
- **Icons:** Feather via `@expo/vector-icons`. The only hand-drawn SVG is
  `GoogleMark`, which must keep Google's own brand colours.
- **Platform tension, resolved deliberately:** the product is `adaptive` — the
  design *language* should follow each OS's patterns (navigation, controls,
  sheets, motion, system affordances) — while the *token layer* above stays
  shared with the web and identical across both platforms. Colour, type, the
  gradient rule and the semantic colour roles do not fork. Where a platform
  convention and a web-inherited pattern collide, the platform convention wins
  for interaction and the token wins for appearance. The current code does not
  yet adapt per OS; closing that gap is future work, not an existing state.

## Evidence on Hand

- Real, working product code: 16 screens, a typed API client covering every
  documented backend route, and a mock server at `dev/mock-server.js` with a
  sample video for offline demo.
- The live web product and its design system (`theme.css`) — the source the
  mobile palette was ported from.
- Four versioned legal documents (EULA 1.1, Privacy 1.2, Community Guidelines
  1.0, Refund & Credit Policy 1.1), served from the website and read in-app.
  Their versions are mirrored in three repos and enforced by the server at
  signup; they are compliance artifacts, not copy to edit.
- Plans, prices, limits and credit counts come from `/billing/plans` and
  `/usage/me`. **Never hard-code or invent a price, tier, or limit in a design.**

**Absent — must not be fabricated:** there are no testimonials, named customers,
case studies, press mentions, user counts, ratings, awards, or benchmark
results. No design may invent social proof of any kind.

## Product Principles

1. **The deadline is the design constraint.** Every surface is judged by whether
   it gets a usable tape out faster. Steps the actor repeats each run are where
   the effort goes.
2. **Never break the take.** During rehearsal and recording the interface
   recedes: nothing may steal focus, obscure the line, or leave the user unsure
   whether they are being recorded.
3. **A tool that must feel native on both.** Platform conventions govern how it
   behaves; the shared token system governs how it looks. Neither is negotiable
   in the other's territory.
4. **Colour carries meaning, not decoration.** Blue means tappable, the gradient
   marks the hero moment, status lives outside the brand ramp, and a score
   colour can never disagree with its label.
5. **Say only what is true.** No invented proof, no invented pricing. Server
   truth or nothing.

## Accessibility & Inclusion

- The shared palette is built around measured contrast: each status colour ships
  a readable TEXT step distinct from its brighter FILL step, and those are not
  interchangeable. Fill values are documented as failing text contrast on
  purpose (amber-500 as text is 2.15:1) and must not be used for text.
- Cyan has a dedicated bright variant for text over video, where the background
  cannot be controlled.
- Both light and Stage themes are first-class and must be checked together; the
  immersive screens are dark-only.
- Interactive elements carry explicit `accessibilityRole` and
  `accessibilityLabel` (the pattern is established in the shipped screens);
  new work maintains it.
- No formal conformance standard has been set by the user. Store review
  requirements (permission strings, legal acceptance) are the only external
  compliance bar currently established.
