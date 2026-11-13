# UI delivery — 12 November 2026

Cockpit and Pulse now provide dedicated **Health assistant** and **Mission tools** navigation. The overview remains a crew overview, and the new tools have their own working screens.

The assistant includes a question composer, common review actions, an enter/review/confirm observation flow, readable responses with citations, confirmed action cards, a health snapshot, routine progress, review history and collapsible processing preferences. Twin scenarios show baseline/changed comparisons and suit-region results instead of JSON payloads. Guide, imports, tasks, journal, queue and activity use consistent cards and form controls.

Layouts adapt to narrow screens; the mobile drawer closes after navigation. Dark and light themes have explicit surface, text, input and focus styles. Closed mobile navigation is hidden from keyboard and accessibility navigation. Both clients use the same workspace presentation.

Browser verification covers dedicated navigation, mobile bounds and drawer visibility, measured text contrast in both themes, human-readable scenario results, confirmed observations, privacy preferences and the existing platform workflows. Production screens were inspected on desktop and 390-pixel mobile viewports, including both clients, with no JavaScript page errors.

The redesign also fixed a stale observation context after confirmation and a misleading assessment indicator while saving processing preferences. Model weights and API contracts are unchanged.

Open Cockpit at http://localhost:8080 or Pulse at http://localhost:8082 and refresh an already-open tab. In Cockpit choose **Health assistant** or **Mission tools** in the sidebar; Pulse provides the same destinations above its dashboard. Development servers remain at ports 5173 and 5174.

Screenshots are generated under `state/ui-review/production-*.png`. Full platform results are documented in [TEST-REPORT-2026-11-12.md](TEST-REPORT-2026-11-12.md).

The light-mode Digital Twin now receives theme changes in its Three.js controller and switches from additive glow to normal compositing with darker anatomy/status colors. Rendered-pixel browser coverage verifies dermal, skeletal and cardiovascular visibility on initial light-mode mounting and after live theme changes.
