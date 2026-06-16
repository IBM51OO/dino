#!/usr/bin/env python3
import json
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


DB_PATH = Path(__file__).with_name("leaderboard.sqlite3")
RACE_DISTANCE_KM = 42.0
LEADERBOARD_LIMIT = 10
DEFAULT_PLAYER_NAME = "PLAYER"


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL DEFAULT 'PLAYER',
            km REAL NOT NULL,
            finished_at INTEGER NOT NULL
        )
        """
    )
    try:
        connection.execute("ALTER TABLE leaderboard ADD COLUMN player_name TEXT NOT NULL DEFAULT 'PLAYER'")
    except sqlite3.OperationalError:
      pass
    connection.commit()
    return connection


def leaderboard_rows(connection):
    rows = connection.execute(
        """
        WITH player_best AS (
            SELECT
                player_name,
                MAX(km) AS km,
                MAX(finished_at) AS finished_at
            FROM leaderboard
            GROUP BY player_name
        )
        SELECT
            player_name,
            km,
            finished_at,
            ROW_NUMBER() OVER (ORDER BY km DESC, finished_at DESC) AS rank
        FROM player_best
        ORDER BY km DESC, finished_at DESC
        LIMIT ?
        """,
        (LEADERBOARD_LIMIT,),
    ).fetchall()
    return [
        {
            "rank": row["rank"],
            "playerName": row["player_name"],
            "km": row["km"],
            "finishedAt": row["finished_at"],
        }
        for row in rows
    ]


def player_rank(connection, player_name):
    best = connection.execute(
        """
        SELECT MAX(km) AS km
        FROM leaderboard
        WHERE player_name = ?
        """,
        (player_name,),
    ).fetchone()
    if not best or best["km"] is None:
        return None

    row = connection.execute(
        """
        WITH player_best AS (
            SELECT player_name, MAX(km) AS km
            FROM leaderboard
            GROUP BY player_name
        )
        SELECT 1 + COUNT(*) AS rank
        FROM player_best
        WHERE km > ?
        """,
        (best["km"],),
    ).fetchone()
    return row["rank"]


def clean_player_name(value):
    name = " ".join(str(value or "").strip().split())[:16]
    return name or DEFAULT_PLAYER_NAME


class GameRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.api_path == "/api/leaderboard":
            player_name = clean_player_name(parse_qs(urlparse(self.path).query).get("player", [DEFAULT_PLAYER_NAME])[0])
            with connect_db() as connection:
                self.write_json(
                    {
                        "leaderboard": leaderboard_rows(connection),
                        "playerRank": player_rank(connection, player_name),
                    }
                )
            return
        super().do_GET()

    def do_POST(self):
        if self.api_path != "/api/leaderboard":
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            km = max(0.0, min(RACE_DISTANCE_KM, float(payload.get("km", 0))))
            player_name = clean_player_name(payload.get("playerName"))
        except (TypeError, ValueError, json.JSONDecodeError):
            self.send_error(400, "Invalid leaderboard payload")
            return

        if km <= 0:
            self.send_error(400, "Distance must be greater than zero")
            return

        with connect_db() as connection:
            connection.execute(
                "INSERT INTO leaderboard (player_name, km, finished_at) VALUES (?, ?, ?)",
                (player_name, km, int(time.time() * 1000)),
            )
            connection.commit()
            self.write_json(
                {
                    "leaderboard": leaderboard_rows(connection),
                    "playerRank": player_rank(connection, player_name),
                },
                status=201,
            )

    @property
    def api_path(self):
        return urlparse(self.path).path

    def write_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main():
    connect_db().close()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), GameRequestHandler)
    print("Serving Dino Pace Run with SQLite leaderboard at http://localhost:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
