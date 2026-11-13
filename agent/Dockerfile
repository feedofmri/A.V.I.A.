FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY src ./src
COPY artifacts ./artifacts
COPY evaluate.py ./evaluate.py
# Model weights, encoder .py files and calibration CSVs are mounted read-only at /models (see docker-compose.yml).
ENV AVIA_MODEL_DIR=/models
RUN useradd --create-home --uid 10001 avia
USER avia
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=5 \
  CMD python -c "import json,sys,urllib.request; sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health'))['models_loaded'] else 1)"
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS test
USER root
COPY requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
COPY tests ./tests
USER avia
CMD ["python","-m","pytest","-q","-p","no:cacheprovider","tests"]
