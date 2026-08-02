FROM ghcr.io/astral-sh/uv:0.8.22 AS uv

FROM python:3.13-slim

ARG BUILD_VERSION=dev

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    BUILD_VERSION=${BUILD_VERSION}

WORKDIR /app

COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
COPY config ./config
COPY campaigns ./campaigns
COPY manage.py ./

RUN uv sync --frozen --no-dev --no-editable \
    && addgroup --system app \
    && adduser --system --ingroup app app \
    && mkdir -p /var/lib/dm-hq/documents \
    && chown -R app:app /app /var/lib/dm-hq

USER app
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/ready', timeout=2)"

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--timeout", "60", "--access-logfile", "-"]
