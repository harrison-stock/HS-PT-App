# Privacy: what the app does, and what you still have to decide

**Read this first.** I am not a lawyer and this is not legal advice. What
follows is two things: an accurate description of what the app actually does
with client data — which you can hand to whoever writes your privacy notice, and
which is the part that is usually missing — and a skeleton with the decisions
only you can make left as blanks.

Do not publish the skeleton as-is. It asserts nothing on your behalf precisely
because a privacy notice that states the wrong lawful basis is worse than none:
it is a documented promise you are not keeping.

---

## Part 1 — what the app does (factual, ready to hand over)

### What is collected

| Category | Examples | Where it comes from |
|---|---|---|
| Identity | Name, email, date of birth | Sign-up, or the coach entering a client |
| Health — **special category** | Injuries and injury notes, medical notes, body measurements, body fat, waist, weight | Coach entry and client entry |
| Health — **special category** | Progress photographs | Client upload |
| Health — **special category** | Steps, resting heart rate, from a connected wearable | Terra, if the client connects one |
| Training | Programmes, scheduled workouts, logged sets, session times, RPE | App use |
| Check-ins | Form answers, including free text about sleep, stress, pain | Client submission |
| Documents | Whatever is uploaded to the client vault — commonly PAR-Q and consent forms | Coach or client upload |
| Billing | Stripe customer id, subscription status, renewal date, amount. **No card details** | Stripe webhook |
| Technical | Push notification endpoints, browser user-agent, theme preference | Device |

The health categories are **special category data** under Article 9. That is the
part that raises the bar, and most of this app is that.

### Who processes it

| Processor | What they hold | Where |
|---|---|---|
| Supabase | The database, file storage, authentication | Check your project's region — Settings → General |
| Vercel | Hosting; the API routes see data in transit | Functions run in `iad1` (Washington DC) unless changed |
| Stripe | Payment and subscription data | EU/US |
| Resend | Invitation and password-reset emails | EU/US |
| Terra | Wearable data, for clients who connect one | US |
| Push services | Apple, Google, Mozilla — notification titles and bodies pass through | Global |

Two of these need attention. **Vercel's functions default to a US region**, and
notification bodies carry real wording ("Weigh in and send Harrison your
photos") through **push services you have no contract with**. Neither is
automatically a problem; both need to be named in a notice rather than
discovered.

### How long it is kept

Records are kept for **seven years** from the date a client is archived, then
erased automatically by a weekly job. Archiving is what happens when someone
stops training with you: they are removed from your roster and can no longer
sign in, but nothing is deleted and it can be undone.

Seven years is the window in which a claim about an injury can realistically
surface. That is the reason to keep health records after someone has left, and
when the reason expires so does the retention.

### What a client can do, in the app

- **Take a copy.** Settings → Your Data → Everything (JSON) or Training Log
  (CSV). No request needed, no wait.
- **Ask to be erased.** Settings → Your Data → Ask for my data to be deleted.
  This raises a dated request the coach sees and answers. It does not delete
  anything by itself.

### What erasure actually removes

Every row keyed to that client across fourteen tables, the workout copies they
owned and everything beneath them, their photo and document **files** as well as
the rows naming them, their push subscriptions, notifications and invites, and
the profile row itself. The function reports what it removed.

**One gap you must close by hand:** for a client with a login, the Supabase
**auth user** is not removed by the coach-side button — only by the automatic
retention sweep, which runs with higher privileges. The result says
`auth_user_remains: true` when this applies. Until you delete that user in
Supabase, a login exists for someone whose records are gone.

---

## Part 2 — the decisions only you can make

### 1. Your lawful basis (Article 6)

You need one for ordinary personal data. For a paid coaching relationship the
usual answer is **contract** — you cannot deliver the programme without holding
the training data. Consent is the common wrong answer: consent must be freely
given and withdrawable, and a client cannot withdraw consent to you holding
their programme while still expecting to be coached.

> **Decide:** ▢ Contract ▢ Legitimate interests ▢ Consent ▢ Other

### 2. Your Article 9 condition — the one that matters

Health data needs a **second** basis on top of Article 6. This is the single
most commonly missed step, and most of what this app stores is health data.

The realistic candidates for a personal trainer:

- **Explicit consent** (Art. 9(2)(a)) — the usual route. Must be specific,
  separately given, recorded, and genuinely withdrawable. A tick inside general
  T&Cs is not explicit consent.
- **Legal claims** (Art. 9(2)(f)) — supports keeping records after someone
  leaves, which is what the seven-year retention rests on. It does not cover
  collecting the data in the first place.

Most PTs land on explicit consent to collect, with legal claims supporting
retention afterwards.

> **Decide:** ▢ Explicit consent ▢ Legal claims ▢ Both, for different purposes
>
> **Then:** how is that consent captured and recorded? At the moment the app has
> no consent step. If you go this route, it needs one — tell me and I'll build
> it.

### 3. Retention

Seven years is now built and enforced. If your insurer or accountant says a
different number, tell me and I will change it — it is one interval in one view.

> **Confirm:** ▢ Seven years is right ▢ Change to ▢▢ years

### 4. Processors

Supabase, Vercel, Stripe, Resend and Terra are all processors acting on your
instructions. Each needs a **data processing agreement**. All five publish a
standard DPA you accept rather than negotiate; you need to have actually
accepted them, and to know where each stores data.

> **Check:** ▢ Supabase DPA ▢ Vercel DPA ▢ Stripe DPA ▢ Resend DPA ▢ Terra DPA
>
> **Check:** which region is your Supabase project in?

### 5. ICO registration

Most UK personal trainers processing client health data need to register with
the ICO and pay the data protection fee. It is £40–£60 a year for a small
organisation. Not registering when you should is itself an offence.

> **Check:** ▢ Registered ▢ Checked and not required

### 6. Breaches

You have **72 hours** from becoming aware of a personal data breach to report a
reportable one to the ICO. Worth knowing before you need it.

> **Decide:** who do you call, and where is that written down?

---

## Part 3 — skeleton notice

Fill the blanks. Take it to someone qualified. Do not publish it as it stands.

> ### Privacy notice — ▢▢ *(trading name)*
>
> **Who we are.** ▢▢ is the data controller for the information described here.
> Contact: ▢▢ *(email)*. ICO registration: ▢▢.
>
> **What we collect.** Your name, email and date of birth; your training
> programmes and everything you log against them; body measurements and progress
> photographs where you provide them; injuries and health notes relevant to
> coaching you safely; your answers to check-in forms; documents you or we
> upload, including health questionnaires; and, if you connect a wearable, your
> daily steps and resting heart rate.
>
> Information about your health is *special category data* and we treat it with
> the additional care that requires.
>
> **Why we collect it, and our lawful basis.** We process your ordinary personal
> data on the basis of ▢▢ *(see §1)*, because ▢▢. We process your health data on
> the basis of ▢▢ *(see §2)*, because ▢▢.
>
> **Who else sees it.** Our software providers process it on our instructions
> and cannot use it for their own purposes: Supabase (database and file storage,
> ▢▢ region), Vercel (hosting, ▢▢ region), Stripe (payments — we never see or
> store your card details), Resend (email), and Terra (only if you connect a
> wearable). Notification text passes through Apple, Google or Mozilla to reach
> your device.
>
> We do not sell your data and we do not use it for advertising.
>
> **How long we keep it.** While you train with us, and for seven years after
> you stop. We keep it that long because a question about an injury can take
> years to surface and we may need to show what was prescribed and when. After
> seven years it is deleted automatically.
>
> **Your rights.** You can get a copy of everything we hold at any time, from
> Settings → Your Data in the app. You can also ask us to delete it from the
> same screen; we will respond within one month and explain if we cannot action
> it in full. You can correct anything inaccurate, object to how we use it, and
> — where we rely on consent — withdraw that consent at any time, though we may
> then be unable to continue coaching you safely.
>
> You can complain to the Information Commissioner's Office at ico.org.uk or
> 0303 123 1113.
>
> **Changes.** Last updated ▢▢.

---

## Where this is wired in

Nothing above appears in the app yet, because there is nothing to link to until
you have a real notice. When you do, tell me the URL and I will add it to the
sign-up screen and to Settings. The sign-up screen is the one that matters: a
notice nobody is shown before handing over their injury history is not doing its
job.

### Useful references

- [ICO — special category data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-rules-on-special-category-data/)
- [ICO — storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
- [ICO — right to erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/)
- [ICO — do I need to pay the fee?](https://ico.org.uk/for-organisations/data-protection-fee/self-assessment/)
