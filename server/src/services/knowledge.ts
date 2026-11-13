// Curated educational summaries, not extracted quotations or reviewed treatment protocols.
export const KNOWLEDGE_VERSION = "avia-education-2026-11-12";
export const sources = [
  {
    id: "hazards",
    title: "NASA: Five hazards of human spaceflight",
    url: "https://www.nasa.gov/hrp/hazards/",
    topics:
      "space radiation gravity bone isolation confinement environment mission",
    text: "Spaceflight hazards include radiation, isolation and confinement, distance from Earth, gravity changes and hostile closed environments. Explain the relevant hazard without claiming that this software measures radiation dose, immune function or bone density.",
  },
  {
    id: "risks",
    title: "NASA: Human Research Program risks",
    url: "https://www.nasa.gov/hrp/risks/",
    topics:
      "sleep stress wellbeing mood mental fatigue nutrition exercise prevention",
    text: "Human Research Program resources describe risks to crew health and performance. Use the mission-approved routine and report changes for review. Physiological stress outputs do not establish a mental-health diagnosis; sleep duration does not directly measure sleep stage.",
  },
  {
    id: "vitals",
    title: "MedlinePlus: Vital signs",
    url: "https://medlineplus.gov/vitalsigns.html",
    topics:
      "heart pulse respiration blood pressure temperature glucose measurement units reading baseline",
    text: "Vital signs provide information about basic body functions. Record the value, unit, time and measurement context. Distinguish skin temperature from body temperature. A change from a personal baseline is evidence for review, not a diagnosis.",
  },
  {
    id: "oxygen",
    title: "FDA: Pulse oximeters",
    url: "https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters",
    topics: "oxygen spo2 saturation oximeter accuracy low hypoxia symptoms",
    text: "Pulse-oximeter readings have accuracy limitations. Consider symptoms and observation quality along with the reading. Do not use a single number to rule out a problem or delay qualified assessment.",
  },
  {
    id: "scope",
    title: "A.V.I.A. model scope and limitations",
    url: "/model-card",
    topics:
      "model accuracy confidence forecast prediction twin suit bone simulation baseline",
    text: "The supplied cardiac, stress, sleep, suit and fusion weights are retained. Fusion architecture was reconstructed. NASA context is reference data. Skeletal projections use a heuristic and future vital values are experimental extrapolation. There is no independently established accuracy, calibrated confidence or clinical validation.",
  },
] as const;
export function retrieve(query: string) {
  const tokens = query.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  return sources
    .map((s, index) => ({
      s,
      index,
      score: tokens.reduce(
        (n, t) =>
          n +
          (s.topics.includes(t) || s.text.toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((x) => x.s);
}
export const protocols = {
  review: {
    label: "Review this health change with the crew medical officer",
    text: "Review the displayed observations and symptoms using mission-approved procedures. This prototype cannot diagnose or select a treatment.",
  },
  recheck: {
    label: "Record a follow-up observation with its UTC time",
    text: "Check the entry, unit, timestamp and context; record an available follow-up according to the mission measurement procedure.",
  },
  sleep: {
    label: "Complete the mission sleep and wellbeing check-in",
    text: "Record sleep duration and perceived wellbeing. Follow the approved mission sleep routine and report persistent changes.",
  },
  routine: {
    label: "Review the mission-approved health maintenance routine",
    text: "Review scheduled activity, food and hydration tasks against the approved mission plan. No medication, fluid target or exercise dose is generated.",
  },
} as const;
