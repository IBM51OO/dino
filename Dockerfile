FROM python:3.13-slim

ENV HOST=0.0.0.0
ENV PORT=8000
ENV DB_PATH=/data/leaderboard.sqlite3
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY . .

RUN mkdir -p /data

EXPOSE 8000

CMD ["python", "server.py"]
