# ml/

Model training and export (Python).

- LSTM models for cardiovascular and bone density risk from time-series telemetry
- NLP transformer for sentiment on local journal entries
- Quantization to TensorFlow Lite / ONNX for the Pulse edge device

Training data: NASA OSDR, NASA LSDA, WESAD, PhysioNet, MIMIC.

Suggested layout:

```
ml/
├── data/        # raw + processed datasets (git-ignored)
├── notebooks/   # exploration
├── models/      # exported .tflite / .onnx (git-ignored)
└── src/         # training + export scripts
```
