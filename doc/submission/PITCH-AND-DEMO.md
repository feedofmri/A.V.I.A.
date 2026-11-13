# Pitch and demonstration

## Spoken pitch

When an astronaut's readings change, a dashboard can show the numbers. The harder question is what those numbers mean, how reliable they are, and what should happen next.

A.V.I.A. connects those steps. Our prototype accepts software-entered health indicators, compares them with personal baselines, and runs the supplied cardiac, stress, sleep and fusion models. A separate suit model powers labeled scenarios. The display identifies current evidence, filled inputs and experimental projections.

An optional Meta Muse assistant explains that evidence using a curated NASA and medical reference library. It can ask for missing information, prepare a briefing and propose follow-up tasks. It cannot change the severity established by local rules, invent measurements or silently perform a proposed action. The user confirms the action before it is saved.

Connectivity is part of the demonstration. Local inference and alerts continue when cloud AI is unavailable. Browser submissions survive a reload and replay after reconnecting. Private journals have separate sharing and cloud-processing controls.

We test the software behavior and report performance on supplied reference rows without calling it independent medical accuracy. A.V.I.A. is a demonstrable step toward understandable, inspectable crew health support, with clinical validation still ahead.

## Reproducible recording

Run the isolated platform suite with `node scripts/platform-test.mjs --keep`, then `node scripts/record-demo.mjs`. It creates a captioned, silent recording at `state/demo/avia-walkthrough.webm` and a closing screenshot. The script uses the disposable seeded stack and does not publish anything. The video is a real screen capture of the application, with captions added for the recording; it is not evidence of medical effectiveness. Add the spoken pitch if a narrated submission is desired and permitted by the revised guide.

## Live walkthrough

1. Show the crew dashboard and explain that crew identities and data are fictional.
2. Open **Health assistant** from the navigation. Show local evidence, freshness and source labels.
3. Show processing preferences. Explain that cloud use is optional and journal permission is separate.
4. Select action, ask for a review and inspect citations and proposed tasks. Confirm one task and show its saved acknowledgment.
5. Enter a model-supported demonstration reading in the intake form, review it and explicitly confirm. Show the resulting assessment and Critical consistency for a low-oxygen scenario.
6. Compare a twin scenario. Keep the simulation label and assumptions visible.
7. Show a daily briefing and download the review. Demonstrate crew task completion in a separate browser context.
8. Demonstrate offline symptom replay using browser network controls. Show that local guidance remains available when Meta is disabled.
9. End with the test report and model evaluation limitations.

## Questions to prepare for

- How do you distinguish manual inputs, filled features, NASA reference context and predictions?
- What fails when Meta is unavailable, and what still works?
- What is the difference between passing tests and validating medical advice?
- Which artifacts and code existed before this event?
- What new evidence is required before real clinical use?

Answers should reference the implementation and reports, not promise unmeasured outcomes.
