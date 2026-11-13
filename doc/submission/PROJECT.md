# A.V.I.A. — understand, review, act

## Project summary

A.V.I.A. is a software health-monitoring prototype for astronauts who need to understand changing health indicators and act when immediate ground support is unavailable. It combines personal baselines, five supplied trained checkpoints, timestamped visual evidence, and an optional Meta Muse assistant. Astronauts enter or import readings, review their status and limitations, explore cited explanations, and confirm follow-up tasks. A separate crew interface supports check-ins, private journals and task completion.

The application keeps local inference, critical alerts, approved educational guidance and durable input independent of cloud AI. Muse Spark explains authorized evidence and proposes structured information; server rules control permissions, severity and writes. Ten logical roles share one orchestration service. There is no claim that ten roles are ten newly trained models.

## Problem and intended impact

Long missions expose crews to radiation, isolation, distance from Earth, gravity changes and closed environments. Raw charts alone can leave a non-specialist uncertain about what a change means or what to do next. A.V.I.A. connects measurements, explanations and confirmed follow-up in an inspectable workflow. Its potential impact is reducing confusion and making health review easier; reduced medical events or clinical workload have not been measured.

## Distinctive contribution

The contribution is the integration: personal baseline comparisons, existing multimodal inference, evidence-linked assistance, explicit uncertainty, privacy controls and operation through cloud outages. It is not a claim that AI astronaut monitoring or medical decision support is a new field. A separate cockpit and crew interface make the action loop demonstrable.

## NASA and data use

NASA Human Research Program hazard and risk resources inform the educational library. Supplied OSD-569 CBC and OSD-919 reference tables provide biological context and a disclosed skeletal heuristic. They are not live blood tests or measured astronaut bone density. Cardiac, stress and sleep encoders use supplied BIDMC, WESAD and Sleep-EDF-derived features; a suit encoder supports software scenarios. No hardware or additional training is required.

Sources: https://www.nasa.gov/hrp/hazards/ ; https://www.nasa.gov/hrp/risks/ ; https://medlineplus.gov/vitalsigns.html ; https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters . See the model card and evaluation reports for exact limits.

## Technical implementation

React/TypeScript clients → authenticated Fastify BFF → Fastify/PostgreSQL core with row-level crew scoping → FastAPI/PyTorch inference. Redis supports caching. The core calls Meta's official Responses API using `muse-spark-1.3` in Standard mode when enabled and consented. Model outputs remain authoritative structured evidence; language output is schema-validated and screened. Local templates replace cloud explanations on failure. Journals and assessment history are encrypted at rest. Browser outboxes preserve submissions across connectivity interruptions.

## Validation and limitations

The automated suites cover APIs, model contracts, authorization, consent, concurrency, offline replay, inference recovery, output guards and browser workflows. Separate live Meta checks use fictional scenarios. Supplied-row model evaluation is reported transparently with possible training/calibration overlap. No independent clinical evaluation, calibrated confidence or temporal-fusion accuracy is established. Bone projections are heuristic; vital forecasts are experimental extrapolation. This is an educational prototype requiring qualified review before medical use.

## Existing work and attribution

The five trained checkpoints, encoder adapters and reference data were supplied before this implementation. Fusion runtime architecture was reconstructed from checkpoint shapes and handoff documentation. The provider adapter incorporates pre-existing team integration work. Software implementation used AI coding assistance. Preserve the actual development chronology and identify team contributions accurately; do not describe supplied artifacts or earlier work as created during an event window.

The team must confirm dataset/model redistribution rights and the licenses of bundled materials before public publication. NASA endorsement and acceptance into judging are not claimed.
