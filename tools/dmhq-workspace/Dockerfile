FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /opt/dmhq-workspace
COPY . /opt/dmhq-workspace
RUN python -m pip install --no-cache-dir .

ENTRYPOINT ["dmhq"]
