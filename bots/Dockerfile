FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY bots/requirements.txt bots/requirements.txt
RUN pip install -r bots/requirements.txt

COPY bots/ bots/

CMD ["python", "-m", "bots.run"]
