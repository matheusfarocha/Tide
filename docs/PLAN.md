# TIDE — Cal Hacks 13.0 Build Plan

Oct 24, 2026 · @param

## The idea

We are building TIDE, a meditation coach that sees when your mind wanders and trains you to notice it yourself. The text below is our original idea, with three updates from planning: Feel Checks are answered by voice, the coach runs on CREAO agents, and accuracy is checked without any phone on the body.

**One-line pitch:** "Muse tells you when your mind wanders. TIDE teaches you to notice it yourself, then gets out of the way."

### TIDE: A Meditation Coach That Can See When Your Mind Wanders

Meditation is a skill with no scoreboard. TIDE gives it one, and then teaches you to feel it yourself.

### The Problem

The hardest part of meditation is invisible. Your mind drifts off, and you don't notice for minutes. Beginners can't tell whether they're focused, distracted or half-asleep. No one gives them feedback, so they never improve and they quit. Meditation apps make it worse because they play the same script to everyone, without knowing anything about the person listening.

**Named community:** first-year college students dealing with exam stress who tried a meditation app and gave up. We test it on ourselves all weekend.

### Proposed Solution

You prop your phone on a stand about an arm's length away, close your eyes and meditate. TIDE watches quietly. It reads the signals your body gives off as your attention changes:

- **Breathing:** rate, depth and regularity, from small movements of the chest and shoulders.
- **Stillness:** fidgeting and restless micro-movements tend to show up when the mind wanders.
- **Posture:** a slumping spine or dropping head signals drowsiness.
- **Face:** tension in the jaw and brow, and eyelid flutter.

From these signals, TIDE builds a **Calm Map**: a timeline of your session showing when you settled in, when you drifted, and when you came back.

### How it trains you (the core innovation)

1. **Feel Checks: training self-awareness.** A few times per session, a soft voice asks, "Focused or drifting?" You answer out loud, eyes still closed, and TIDE compares your answer with what the sensors saw. At first your answers won't match the data well. With practice, they match more and more, which means you are learning to feel your own state. Meditation is fundamentally about building that awareness, and TIDE is the first coach that can measure it. (Show the "self-awareness score" rising over sessions.)
2. **Pattern tracking across sessions.** The TIDE coach (our CREAO agents) reads your Calm Maps over days and finds your patterns. For example: "You usually drift around minute 4." "Mornings go better than nights." "Your posture collapses after 8 minutes."
3. **A personalized training plan with fading support.** The next session targets your weak point. For example, it gives a gentle cue at minute 3:30, just before you usually drift. As you improve, TIDE gradually removes those cues so you build the skill yourself and don't come to depend on the app.
4. **A breath-counting focus test.** Mindfulness research uses breath counting as a measure of attention: you silently count breaths and tap at a set number. Because TIDE can see your real breaths, it can check whether your count matches, giving you an objective focus score that improves over time. Cite: Levinson et al., "A mind you can count on: validating breath counting as a behavioral measure of mindfulness," Frontiers in Psychology, 2014 ([paper](https://www.frontiersin.org/articles/10.3389/fpsyg.2014.01202/text)).

### Privacy

Video is processed on the phone and never stored or uploaded. Only the metrics leave the device. We say this in the pitch, because a camera watching you meditate needs this answer.

### Validating that it works

- **Paced-breathing check (live, for the demo):** a circle on screen expands and shrinks at exactly 6 breaths per minute. The judge breathes along with it for 30 seconds, and TIDE's reading should land near 6. Because the true rate is known, this proves accuracy right in front of the judge.
- **Tap-labelled recordings (for our numbers):** on Saturday, record about 20 short sessions of teammates. A second teammate watches each one and taps a button on every inhale. Compare TIDE's breath count with the taps, and put the average error on the Devpost page.
- **If we have time:** show that the regular camera and the depth camera agree with each other.

### Demo Moment

A judge sits down, puts on noise-cancelling headphones, closes their eyes and meditates for 90 seconds. On a second screen, the team and other judges watch their breathing wave, stillness and focus timeline live. Midway, TIDE asks, "Focused or drifting?" The judge answers out loud, and their answer appears next to what the sensors saw. Afterwards, the judge gets their own Calm Map, and the CREAO coach starts designing their next session. Then we switch to a teammate's history from the weekend, showing patterns found and their self-awareness score improving across sessions.

## What already exists and why TIDE is different

The basic concept is not unique, but one part of it is genuinely new, and we build the pitch around that part.

### What already exists

A phone or device watching you meditate and telling you when your attention drifts has been done several times:

- [Muse headband](https://choosemuse.com/muse-S/): a brain-sensing (EEG) headband that gives real-time neurofeedback for meditation. A calm mind sounds like peaceful weather, and a wandering mind triggers storm sounds. It costs about $249, and the app tracks progress over time with points and milestones.
- [A phone-camera meditation app from a university research team (ITMO)](https://news.itmo.ru/en/news/10416/): it uses a phone camera to detect body movements and breathing rate, and gives points for staying relaxed and takes them away for sudden changes.
- [A US patent](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12133730) for an AI system that judges whether someone is being mindful from video of them.
- [Dhyana Metrics](https://appgoblin.info/apps/6752203465): an iOS app that claims to detect mind-wandering and guide you back, using finger pressure.

If we pitch TIDE as "the camera tracks your breathing and tells you when you drift," a judge who knows Muse will think "so, Muse without the headband." That's an improvement, but not something new.

### What is genuinely new

1. **TIDE trains you to notice drifting yourself.** Every product above tells you *when* your mind wandered, so you depend on the device to know. TIDE's Feel Checks build your own ability to catch it. A University of Wisconsin team validated breath counting as a measure of mindfulness: breath-counting skill was associated with more meta-awareness, less mind wandering and better mood, and 4 weeks of breath-counting training improved mindfulness and reduced mind wandering compared with control groups ([Levinson et al., 2014](https://www.frontiersin.org/articles/10.3389/fpsyg.2014.01202/text)).
2. **The key stat for the pitch:** when people lose count, they don't realize it about two-thirds of the time ([source](https://yogauonline.com/?p=14175)). That blind spot is exactly what TIDE trains.
3. **Upgrading a research test with a camera.** In the original study, participants pressed one key on each breath and a different key on every ninth breath. That test only measures what people *report* about their breathing. TIDE's camera sees the actual breaths, so it can check whether each report matches reality. As far as we know, nobody has combined the validated test with contactless breath sensing.
4. **Built to make itself unnecessary.** TIDE removes its cues as you improve, unlike apps designed to keep you hooked. That directly answers Anthropic's "where could it go wrong" criterion and Microsoft's "responsible design" criterion.
5. **No hardware.** You need just a phone, not a headband.

We mention Muse ourselves in the pitch. Judges trust a team that knows the competition, and naming it makes the difference obvious.

### What makes it impressive at the judging table

- Real computer vision running live on the judge's own body, with no contact.
- Proof of accuracy: the paced-breathing check and our tap-labelled error numbers.
- A measurable training result: the gap between what you feel and what the sensors see shrinks across sessions.
- Research behind it, with a published, validated study to cite.

### Honest risks

- **We can't show weeks of improvement in 36 hours.** Record many short sessions from each teammate over the weekend and show those trends, labelled honestly as weekend data.
- **Camera-based "drift" detection is noisy.** Lean on the Feel Checks and the breath-counting test as the real measurements, and present the sensor model as getting better with each label.
- **The cash ceiling is lower than a finance idea would have.** The realistic targets are listed in the sponsor track playbook below.

## System architecture

TIDE runs two loops joined by Convex: a body loop that reacts in milliseconds during the session, and a CREAO coach loop that runs for minutes after it and designs the next session.

&#91;embedded content: TIDE architecture · body loop and coach loop, joined by Convex\]

Everything time-critical stays in the top band; CREAO only ever runs between sessions, which is why its minutes-long runs never slow the meditation down.

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Phone app | Web app (React + Vite) opened in the phone browser | Fastest to build; no app store; installs to the home screen |
| Vision | MediaPipe Tasks Vision: Pose Landmarker + Face Landmarker (with blendshapes) | Runs on the phone, so video never leaves it |
| Backend | Convex | Database, real-time queries, actions, HTTP endpoints, scheduled functions, vector search |
| Coach | CREAO agents on agent.creao.ai, started by Convex through the API Trigger | Async runs; the plan comes back by webhook |
| Research data | Our own Apify Actor (Europe PMC + PubMed) and an Apify Store review scraper | The cited research library behind the coach; evidence for the pitch |
| Voice | Cartesia Sonic 3.5 (speech) + Ink 2 (speech-to-text) | Called through the server; keys never in the browser |
| Real-time reasoning | Claude, called from Convex actions | Interprets spoken answers and phrases cues |
| Coach view | A second route of the same web app, opened on the laptop | A live Convex query |
| Hosting | Any static host for the web app (for example Vercel); Convex cloud for the backend | Judges open one link |

### Session flow

1. **Framing guide:** the phone shows where to sit so shoulders and face are in frame.
2. **Paced-breathing check (30 s):** the circle at 6 breaths per minute; TIDE's reading is saved as a calibration.
3. **Baseline (first 60 s):** TIDE learns this person's normal breathing, stillness and posture for this session.
4. **Meditation, run from the coach's plan:** breath-timed voice cues and spoken Feel Checks at the planned times.
5. **Calm Map:** shown as soon as the session ends.
6. **Coach run:** CREAO analyzes the session and designs the next one; the app shows progress until the plan arrives.

### Breath signal pipeline (Person 1)

Starting values below are guesses to tune on our own recordings.

1. Each frame: shoulder and upper-body landmarks from Pose, blendshapes (brow, jaw, blink) from Face.
2. Breath signal: vertical motion of the shoulders and upper chest, with slow drift removed.
3. Band-pass filter to the breathing range (start around 6–40 breaths per minute).
4. Each inhale = a peak; breathing rate from the last \~30 seconds; regularity = how much breath-to-breath intervals vary.
5. Stillness = body motion outside the breathing range; drowsiness = head drop and shoulders slumping; tension = brow and jaw blendshapes.
6. States (settling, focused, drifting, restless) = simple rules against the session baseline, refined by each Feel Check label.

### Data model (Convex tables)

| Table | One row per | Key fields |
| --- | --- | --- |
| users | Person | name, CREAO threadId, current self-awareness score |
| sessions | Session | user, plan used, start, end, status, Analyst summary |
| samples | Reading during a session | session, time, breath phase, rate, stillness, posture, face, state |
| feelChecks | Feel Check | session, time, spoken text, answer, sensor state, match |
| plans | Coach-designed session | user, cue times, Feel Check times, fading level, technique, length, reasons, citations |
| coachRuns | CREAO run | session, run ID, share link, status |
| calibrations | Paced-breathing or tap-label check | session, true rate or tap count, measured value, error |
| breathCountTests | Breath-counting focus test | session, reported count, observed count |
| techniques | Research finding from the Apify Actor | technique, population, outcome, short summary, citation link, embedding |

## How the CREAO coach works

CREAO agents are TIDE's coach: after every session they analyze it and design the next one, so the app cannot train anyone without them. CREAO runs take minutes and don't stream, so CREAO never sits in the real-time loop; it only runs between sessions.

**Track:** Best AI-First Disruptor ($2,500 + CREAO Launchpad). The test is "remove the agent, and the product stops working." We do not enter One-Person Company (it wants an org chart of business agents) or Team Empowerment (it wants agents connecting a team).

### CREAO's one requirement

- At least one CREAO agent does the core work of the project, built on agent.creao.ai.
- The Devpost README includes a share link to one of the agent's runs and the agent ID (shown on its page).
- The agent is shown running in the demo.

### The two agents

| Agent | Input | What it does | Output |
| --- | --- | --- | --- |
| Session Analyst | The finished session timeline: breath, stillness, posture, detected state, each spoken Feel Check answer next to the sensor reading | Runs Python in its sandbox to compute when drifting started, the self-awareness gap (how often the answer disagreed with the sensors) and breath-count accuracy | Session summary for the Calm Map |
| Coach & Plan Designer | Session summary + the user's full history, fetched through our Convex HTTP endpoints given to it as tools | Finds patterns, each claim citing the sessions behind it; designs the next session | Next-session plan as JSON: cue times, Feel Check times, fading level, technique, length |

- Install numpy and scipy in the Analyst's sandbox, then save the agent with **Create Agent**. Packages installed in chat only last for that conversation.
- Use one **threadId per user**, so the coach keeps memory across that person's sessions. The coach also searches the Apify research library, so every technique in a plan carries a citation.
- **Upgrade:** connect Google Calendar so the coach books the next session at the user's best time ("Mornings go better for you, so tomorrow 8:10 AM is scheduled"). Set the agent's write permission to automatic.

### The flow

1. The session ends, and Convex saves it.
2. A Convex action, running server-side with the `capi_` key stored in Convex environment variables, starts the CREAO pipeline asynchronously.
3. The app immediately shows "Your coach is reviewing your session…" as a progress card. Never hold a request open waiting for the run.
4. The agents finish and send the plan to a Convex HTTP webhook.
5. Convex's real-time queries push it to the app: new insights on the Calm Map, plus "Your next session, designed for you."
6. The next session runs entirely from that plan.

### Making "remove the agent and it dies" literally true

- Every training session is created by the coach agent. The only fixed session is the first one, a baseline assessment like a fitness test.
- The demo has a **"Coach off" switch**. With it off there is no next session, no insights and no fading plan, just a breathing graph. Say their line out loud: "Remove the agent, and this product dies." Then turn it back on.

### CREAO judging rubric, mapped to TIDE

| Criterion | Weight | How TIDE scores |
| --- | --- | --- |
| AI as foundation | 30% | Agent-designed sessions; the "Coach off" switch proves it |
| Depth on CREAO | 25% | 2 agents, our Convex API as tools, Python analysis, per-user threadId, webhooks, Calendar connector |
| Originality and ambition | 20% | Training self-awareness of drifting, not a chatbot wrapper |
| Track fit | 15% | The app runs on the agent's output from end to end |
| Demo and storytelling | 10% | The pitch says exactly what CREAO does: "CREAO is TIDE's coach" |

### CREAO limits to respect

- **Runs take minutes:** design for async, show progress, no live token streaming on the API Trigger.
- **Credits:** one pipeline run per session, and no agent may start itself. Top-ups at the CREAO booth or their Discord.
- **Keys stay on the server:** the `capi_` key never goes in browser code, phone code or the public repo.
- **First step tonight:** sign up with the hackathon link, build the coach by chatting, save it with Create Agent, and make the first API call within the hour to learn how long runs really take.
- **Ask at the booth:** can CREAO agents run on Claude? If yes, the coach counts toward the Anthropic track too.

## Sponsor track playbook

We enter 8 tracks with one project: Convex, Mana, CREAO, Apify, Anthropic, Microsoft, Cartesia and the Cal Hacks prizes. If Devpost limits how many sponsor tracks we can enter, use the priority order in the table.

| Priority | Track | Prize | Our one-line angle |
| --- | --- | --- | --- |
| 1 | Convex | $5,000 | Convex is TIDE's nervous system: live stream, coach view, scheduled analysis |
| 2 | Mana.space | $5,000 | Planned and built with Mana from day one, chats public |
| 3 | CREAO: Best AI-First Disruptor | $2,500 + Launchpad | CREAO agents are the coach; remove them and TIDE dies |
| 4 | Apify | $5,000 across 5 places ($2,000 / $1,000 / $800 / $400 / $400) + $400 Best Actor | Our own Actor builds the research library behind every coaching decision |
| 5 | Anthropic | $5,000 Claude credits + 1 year Claude Max 20x + office hours | Named community we belong to; Claude reads spoken Feel Checks in real time |
| 6 | Microsoft Grand Prize + Customer Impact Award | Surface laptop per member + FDE tech talk + mentorship | Production-minded wellness agent with measurable results |
| 7 | Cartesia | Meta glasses (TBD) | Two-way voice is the only way to use Feel Checks |
| — | Cal Hacks: Overall, Most Technically Complex, People-First, Most Creative, Hacker's Choice | MacBook Air, keyboard, Apple Watch, Instax, mouse | Judged automatically; a strong live demo wins these |

### Convex ($5,000)

Make Convex the backbone, not a database we call once.

- **Live metrics stream:** the phone writes breath, stillness and state readings a few times per second.
- **Live coach view:** the second screen at the table updates instantly through reactive queries. This is our most visible Convex moment.
- **Scheduled functions:** when a session ends, Convex automatically starts the CREAO pipeline.
- **Actions:** call Claude, Cartesia and CREAO from the server, with all keys in Convex environment variables.
- **HTTP endpoints:** the CREAO agents' tools (fetch history) and the webhook that receives the plan.
- **Vector search:** "find my past sessions that looked like this one."
- **Pitch line:** "Convex is the nervous system of TIDE," while the coach view updates live.

### Mana.space ($5,000)

Judged on how we built it: meaningful use of Mana 30%, usefulness 25%, originality 25%, execution 20%, plus up to +10 if the project lives inside Mana as an app or agent a judge can open.

- Plan the architecture, state model and UI in Mana chats starting tonight, and keep every chat public.
- On Devpost, link 1–2 Mana pages or chats where Mana planned, wrote or debugged code.
- In the demo, show one moment where Mana changed what we built or how fast.
- **Ask the Mana booth:** can the coach dashboard live inside Mana? That is the +10 bonus.

### CREAO ($2,500 + Launchpad)

Full plan in "How the CREAO coach works" above. Required: agent built on agent.creao.ai, agent ID and a run share link in the README, the agent shown running in the demo.

### Apify ($5,000 across 5 places + $400 Best Actor)

The Apify team confirmed that using Apify to gather our data counts. They judge meaningful use of Apify plus overall project quality, and a separate $400 Best Actor award goes to an Actor built for this event.

**1. The TIDE Research Actor (core, built this weekend).** Our own Actor collects open-access research on breath-focused meditation, mind wandering and breath counting through the public Europe PMC and PubMed APIs. For each paper it extracts the technique, who was studied, the outcome and the citation link, and stores a short summary plus the link, never the full text.

- Results go into a Convex `techniques` table with vector search.
- The CREAO coach searches this library when it designs a plan, so every technique in a plan carries a citation, shown in the app as "Why this session".
- It strengthens our Anthropic answer to "where could it go wrong": the coach can't invent a technique, it can only pick from cited research.
- We enter it for the $400 Best Actor award.

**2. Why beginners quit (evidence, about 1 hour).** Run an existing Apify Store app-review scraper on the top meditation apps, then have Claude group the reasons people say they stopped. Put the counts on Devpost as a chart. This is our customer-understanding evidence for Microsoft and Anthropic. Report totals; don't quote long reviews.

**3. Exam-aware coaching (stretch).** An Actor reads a university's public academic calendar for final-exam dates, and the coach gives shorter, more frequent sessions during exam weeks. This ties straight to our named community.

**How it connects:** the Apify API token lives in Convex environment variables; a Convex action starts the Actor run and saves the dataset items. Refresh the library on a schedule, not once per session.

**Required for us:** a README section explaining which Actors we use and where, with a link to our Research Actor; the demo shows "Why this session" citations that came from the Actor.

**Ask the Apify booth:** does the Best Actor have to be published in the Apify Store?

### Anthropic

| Their criterion | How TIDE shows it |
| --- | --- |
| A named community | First-year college students with exam stress who quit meditation apps |
| A real problem | Interview about 10 hackers this weekend and quote 2–3 on Devpost |
| It works: one thing done well, usable on Monday | A deployed link judges can open on their own phone |
| Thoughtful use of Claude | Claude interprets spoken Feel Check answers ("uh… kind of floaty?" → drifting) and phrases cues in real time. Failure modes we name: misreading calm as drifting, over-reading noisy data. Every claim cites its sessions, and Claude never gives medical or mental-health advice |

### Microsoft Grand Prize + Customer Impact Award

One project competes for both; they share criteria. Frame TIDE as a production-minded AI agent.

| Their criterion | How TIDE shows it |
| --- | --- |
| Customer understanding | Interview quotes and the reasons people quit meditation apps |
| Measurable usefulness | Breath-count accuracy, and the self-awareness gap shrinking across sessions |
| Path from prototype to production | Installable web app, video processed on the phone, per-user cost estimate, next step is a larger validation study |
| Responsible design | No video stored, wellness only (no medical claims), support fades so users don't depend on the app |
| End-to-end functionality | Session → Calm Map → coach plan → next session, working live |

### Cartesia (Meta glasses, TBD)

Voice must be core, not a feature added for the demo. TIDE uses it in both directions.

- **Speaking:** a Sonic 3.5 voice guide with cues timed to the user's breath.
- **Listening:** users keep their eyes closed, so they *say* "focused," "drifting" or "sleepy" through Ink 2 speech-to-text. Ink 2 has built-in turn detection and is built for noisy rooms.
- **Edge cases we handle:** no answer is logged as a possible sign of drowsiness or deep focus; unclear answers go to Claude; room noise is handled by Ink.
- **Responsibility:** it works fully eyes-closed, so it's accessible to blind and low-vision users; audio is used only for the answer and is never stored.
- **Required:** 2-minute demo-first presentation, README with Cartesia features used and known limitations, source access for judges, no API keys or secrets in the repo.

### Cal Hacks prizes

- Let people at neighbouring tables try it during judging, which helps Hacker's Choice.
- For Most Technically Complex, lead with the stack: real-time computer vision → breath signal → state model → two-way voice loop → agent-designed sessions.

### Optional, only if it costs almost nothing

- **Notability:** keep our process notes, sketches and brainstorm audio there. Small prize.
- **Moss:** its "Social Post: best engagement" prize is free to try with a post about TIDE.
- **Figma:** if their track only asks us to design in Figma, design the UI there. Ask at their booth.

### Tracks we skip, and why

| Track | Why we skip it |
| --- | --- |
| Factory Droid SDK | CREAO already is the core coach agent; two core agents would conflict |
| Meta | Judged on strengthening human connection; TIDE is solo practice |
| SpacetimeDB | Convex fills the same role and pays more |
| Fetch.ai | The whole workflow must run inside an ASI:One chat; a camera app can't |
| Hyphenate, CRS, Capital One Nessie, Coinbase x402, Visa | Finance and shopping only |
| SpaceXAI | Requires space data, Cursor and the Grok API |
| Armadin, Bitdeer, Elastic, Atlassian, Bright Data | Off-topic, criteria unpublished, or would compete with Claude |

## Team roles and task split (3 people)

Three people, three lanes (signal, app and backend), one owner each.

Each person also owns the evidence and sponsor items closest to their own code, so nobody waits on anyone after Saturday 9 AM. Write each person's name in the table.

| Person | Lane | Owns | Sponsor tracks they carry | Booths to visit |
| --- | --- | --- | --- | --- |
| 1 (name) | Signal & evidence | Vision, breath signal and state model; accuracy numbers; interviews; the Devpost write-up | Cal Hacks Most Technically Complex, Microsoft, Anthropic (community and quotes), Mana | Mana, Figma |
| 2 (name) | App, voice & demo | Every screen, the plan-driven session runner, voice playback and mic in the app, replay mode, demo video, pitch | Convex (live coach view), Cartesia, Cal Hacks prizes | — |
| 3 (name) | Backend, agents & submission | Convex, CREAO agents, Claude and Cartesia server calls, README, the final Devpost submission | Convex, CREAO, Anthropic (Claude use) | CREAO |

### How the three lanes stay unblocked

- **Agree the Convex schema by 3 AM.** The data model table above is the contract between all three lanes.
- **Person 2 builds against fake data** (a fake breath stream and a fake plan) until Person 1's signal and Person 3's coach are ready.
- **Everyone plans and debugs in Mana** with public chats; Person 1 collects the links for Devpost.
- **Staggered sleep tonight** so someone is always building: Person 3 sleeps 3–7 AM, Person 1 4–8 AM, Person 2 5–9 AM.

### Person 1: Signal & evidence

- [ ] MediaPipe Pose Landmarker + Face Landmarker running in the phone browser
- [ ] Breath waveform from shoulder and upper-chest motion, filtered to the breathing range
- [ ] Inhale detection, breathing rate and regularity score
- [ ] Stillness, posture and head-drop, and face tension (brow, jaw, eyelid) scores
- [ ] Session baseline from the first 60 seconds; state rules (settling, focused, drifting, restless)
- [ ] A simple signal module Person 2 can call: one reading per second with every score and the state
- [ ] Paced-breathing check reads about 6 per minute
- [ ] Breath-counting focus test logic: compare the user's taps with detected breaths
- [ ] Record \~20 tap-labelled sessions and compute the average error
- [ ] Interview \~10 hackers while recording them; collect 2–3 quotes
- [ ] Devpost story: problem, community, accuracy numbers, quotes, Levinson et al. 2014 citation
- [ ] Collect the Mana links; visit the Mana and Figma booths Saturday morning
- [ ] Stretch: depth-camera mode

### Person 2: App, voice & demo

- [ ] Web app the phone opens by link (install to home screen)
- [ ] Framing guide and the paced-breathing circle
- [ ] Session runner that follows the coach's plan: cue times, Feel Check times, length
- [ ] Sonic voice cues played on the user's breath; mic capture for spoken Feel Check answers
- [ ] Two big on-screen buttons as the Feel Check fallback
- [ ] Calm Map after each session
- [ ] Live coach view on the laptop
- [ ] "Your coach is reviewing your session…" progress card
- [ ] History screen: self-awareness score and breath-count accuracy over sessions
- [ ] "Coach off" switch and the breath-counting focus test screen
- [ ] Replay mode that plays back a recorded session if Wi-Fi drops
- [ ] Demo video; lead the pitch rehearsals

### Person 3: Backend, agents & submission

- [ ] Convex project, schema and deployed backend
- [ ] Live metrics write path and reactive queries for the coach view
- [ ] Scheduled function that starts the CREAO pipeline when a session ends
- [ ] HTTP endpoints: history tools for the agents, webhook for the plan
- [ ] CREAO Session Analyst agent (Python, numpy and scipy saved with Create Agent)
- [ ] CREAO Coach & Plan Designer agent with a per-user threadId
- [ ] Server-side Cartesia calls: Sonic speech and Ink 2 speech-to-text (keys never in the browser)
- [ ] Claude action that interprets spoken Feel Check answers
- [ ] Vector search over past sessions
- [ ] Visit the CREAO booth: run times, credits, and whether agents can run on Claude
- [ ] README: setup, architecture, known limitations, CREAO agent IDs and run link, Cartesia and Convex features used; no keys in the repo
- [ ] Final Devpost submission by 8:30 AM Sunday
- [ ] Stretch: Google Calendar connector on the coach

### Apify tasks

Owner: (name), whoever hits their first milestone first. About 3 hours in total.

- [ ] Apify account; API token stored in Convex environment variables
- [ ] Build the TIDE Research Actor: Europe PMC + PubMed APIs → technique, population, outcome, citation link, short summary
- [ ] Convex action that runs the Actor and saves results to `techniques` with embeddings
- [ ] Coach tool that searches the research library; every plan technique carries a citation
- [ ] "Why this session" citation card in the app (with Person 2)
- [ ] Run an Apify Store review scraper on the top meditation apps; Claude groups the quit reasons; chart for Devpost
- [ ] Visit the Apify booth: Best Actor requirements
- [ ] Stretch: exam-calendar Actor

## Timeline to the deadline

The full loop must work by 6 PM Saturday, so the rest of the time goes to data, accuracy numbers, polish and rehearsal. Devpost closes at 9:00 AM Sunday; we submit by 8:30.

&#91;embedded content: Build timeline · Saturday 1 AM to Sunday judging\]

If a gate slips, cut from the bottom of the build order (depth mode first, then the focus test), never the demo moment.

### Done-when for each gate

**All keys work (Sat 9 AM)**

- [ ] Repo created; Convex project deployed
- [ ] CREAO account made with the hackathon link; coach agent saved; first API call returned
- [ ] Cartesia and Claude keys stored in Convex environment variables
- [ ] MediaPipe Pose running in a phone browser
- [ ] Mana chats started and public
- [ ] Sleep in two shifts so someone is always building

**M1: breath wave live (Sat 1 PM)**

- [ ] Breath waveform visible on the phone
- [ ] Metrics streaming into Convex
- [ ] Coach view on the laptop updating live
- [ ] One Sonic voice cue plays
- [ ] Visit the Mana, CREAO and Figma booths; start interviews

**M2: full loop works (Sat 6 PM)**

- [ ] Stillness, posture and state model running
- [ ] Spoken Feel Checks through Ink, interpreted by Claude
- [ ] Calm Map after each session
- [ ] Session end starts the CREAO pipeline; plan returns by webhook
- [ ] The next session runs from the plan; "Coach off" switch works

**Devpost draft in (Sat 10 PM)**

- [ ] \~20 tap-labelled recordings and the average error
- [ ] Several sessions per teammate for real history
- [ ] Paced-breathing check reads about 6 per minute
- [ ] Draft submitted on Devpost

**Feature freeze (Sun 5 AM)**

- [ ] Replay mode and button fallback for Feel Checks
- [ ] README sections for CREAO, Cartesia and Convex done
- [ ] Deployed link works on a fresh phone

**Submitted by 8:30 AM (Sun)**

- [ ] Demo video uploaded
- [ ] Pitch rehearsed at least 3 times, under 2 minutes
- [ ] Final Devpost edits and every link checked

## Demo script and pitch lines

The pitch is 2 minutes and demo-first: the judge meditates before we explain anything. Setup at the table: phone on a stand, laptop showing the live coach view, noise-cancelling headphones with a mic, agent.creao.ai open in a tab.

| Time | What happens | Who talks |
| --- | --- | --- |
| 0:00–0:10 | "Meditation has no scoreboard. Want to try it?" Judge sits, puts on headphones | Person 2 |
| 0:10–0:30 | Paced-breathing circle at 6 per minute; TIDE reads about 6. "That's the camera, no contact." | Person 1 |
| 0:30–1:00 | Judge closes their eyes. The coach view shows their breath wave and stillness live. Voice asks "Focused or drifting?"; the judge answers out loud; the answer appears next to the sensor reading | Person 2 |
| 1:00–1:15 | Session ends. Calm Map appears. "Your coach is reviewing your session…" starts the CREAO run | Person 3 |
| 1:15–1:40 | Switch to a teammate's weekend history: patterns found, self-awareness score rising, an agent-designed plan. Flip "Coach off": just a breathing graph. "Remove the agent, and this product dies." | Person 3 |
| 1:40–2:00 | "Muse tells you when your mind wanders. TIDE teaches you to notice it yourself, then gets out of the way." Judge's own plan arrives, or show a finished run by its share link | Person 1 |

### One line per sponsor judge

Add the matching line when a sponsor judge visits.

- **Convex:** "Convex is the nervous system: every breath streams through it, and this coach view is a live query."
- **Mana:** "Here's the Mana chat where we designed the state model; it changed how we detect drifting."
- **CREAO:** "CREAO is TIDE's coach. Every session after the first was designed by these two agents. Here's the run."
- **Anthropic:** "Built for first-year students who quit meditation apps. Claude reads what you say with your eyes closed, and here's where it could get it wrong."
- **Microsoft:** "Here's the number: breath-count error of X, and the self-awareness gap shrinking from Y to Z."
- **Cartesia:** "Your eyes are closed, so voice is the only interface. Sonic speaks on your breath; Ink hears your answer in this noisy hall."
- **Apify:** "Every session the coach designs is grounded in research our Actor collected. Here's the citation behind this one."

### Questions to be ready for

- **"How accurate is it?"** The paced-breathing check plus our average error from \~20 tap-labelled recordings.
- **"Isn't this just Muse?"** Muse tells you when you drift; TIDE trains you to notice it yourself, and needs no $249 headband.
- **"Is it a medical device?"** No. It's a wellness and training tool; no diagnosis, no treatment claims.
- **"What about privacy with a camera?"** Video never leaves the phone; only numbers do.
- **"How do you know the self-awareness score means anything?"** It builds on a validated breath-counting measure of mindfulness (Levinson et al., 2014).

## Submission checklist and fallbacks

Submit on Devpost by 8:30 AM Sunday for a 30-minute buffer; the hard deadline is 9:00 AM, and we must be at our table by 10:30 AM with the whole team present.

### Devpost and README

- [ ] Check whether Devpost limits the number of sponsor tracks; if so, follow the priority order
- [ ] Draft submitted Saturday night, edited until the deadline
- [ ] All teammates added on Devpost
- [ ] Deployed link judges can open on their phones
- [ ] Public GitHub repo with no API keys or secrets (Cartesia and CREAO both require this)
- [ ] README: setup steps, architecture, known limitations
- [ ] README, CREAO: agent ID(s) and a share link to a run
- [ ] README, Cartesia: Sonic and Ink features used
- [ ] README, Convex: which Convex features we use and where
- [ ] README, Apify: which Actors we use and where, with a link to our Research Actor
- [ ] Devpost, Mana: 1–2 public links to Mana chats or pages
- [ ] Devpost: accuracy numbers, interview quotes, the Levinson et al. 2014 citation
- [ ] Demo video (about 2 minutes, demo-first)
- [ ] Rehearsed 2-minute pitch, plus the one-line add-ons per sponsor judge

### Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Venue Wi-Fi drops during judging (personal hotspots are banned) | A replay mode that plays back a recorded session through the same screens |
| CREAO run is slow during the pitch | Show a finished run by its share link; the judge's plan arrives later |
| Speech recognition misses an answer in the noisy hall | Headset mic close to the mouth; two big on-screen buttons as backup |
| Bad lighting or baggy clothes weaken the breath signal | Framing guide on screen; read shoulder motion, not only the chest |
| Drift detection is noisy | Lead with Feel Checks and the breath-counting test as the real measures |
| Sponsor API credits run out | Top up at the CREAO booth; one coach run per session; no self-starting agents |
| Running out of time | Follow the build order; stop wherever time runs out and the demo still works |

### Build order (stop wherever time runs out and we'll still have a demo)

1. A camera breath waveform that works reliably, checked with the paced-breathing circle and tap labels.
2. Stillness and posture tracking, then the live Calm Map.
3. Feel Checks with the voice.
4. A Convex backend with a live coach view.
5. The CREAO coach analyzing patterns across sessions and designing the next one. Record our own sessions on Saturday so we have real history to show.
6. The breath-counting focus test.
7. Depth-camera mode.

Practical tip: build steps 1–3 as a web app using MediaPipe in the phone's browser unless someone is already fast in Swift. It's much quicker than native iOS, and depth can come later.
