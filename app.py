from datetime import datetime
import sqlite3

from flask import Flask, jsonify, render_template, request


DB_PATH = "raumklima.db"
SERVER_PORT = 5001

app = Flask(__name__)


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS measurements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                bme280_temperature_c REAL,
                bme280_humidity_percent REAL,
                bme280_pressure_hpa REAL,
                scd41_co2_ppm INTEGER,
                scd41_temperature_c REAL,
                scd41_humidity_percent REAL
            )
            """
        )


def insert_measurement(payload):
    timestamp = datetime.now().isoformat(timespec="seconds")
    bme280 = payload.get("bme280") or {}
    scd41 = payload.get("scd41") or {}

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO measurements (
                device,
                timestamp,
                bme280_temperature_c,
                bme280_humidity_percent,
                bme280_pressure_hpa,
                scd41_co2_ppm,
                scd41_temperature_c,
                scd41_humidity_percent
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.get("device", "unknown"),
                timestamp,
                bme280.get("temperature_c"),
                bme280.get("humidity_percent"),
                bme280.get("pressure_hpa"),
                scd41.get("co2_ppm"),
                scd41.get("temperature_c"),
                scd41.get("humidity_percent"),
            ),
        )
        return cursor.lastrowid, timestamp


def row_to_dict(row):
    return {
        "id": row["id"],
        "device": row["device"],
        "timestamp": row["timestamp"],
        "bme280": {
            "temperature_c": row["bme280_temperature_c"],
            "humidity_percent": row["bme280_humidity_percent"],
            "pressure_hpa": row["bme280_pressure_hpa"],
        },
        "scd41": {
            "co2_ppm": row["scd41_co2_ppm"],
            "temperature_c": row["scd41_temperature_c"],
            "humidity_percent": row["scd41_humidity_percent"],
        },
    }


@app.route("/", methods=["GET"])
def dashboard():
    return render_template("index.html")


@app.route("/api/measurements", methods=["POST"])
def create_measurement():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "JSON body fehlt oder ist ungueltig"}), 400

    measurement_id, timestamp = insert_measurement(payload)
    return jsonify({"status": "ok", "id": measurement_id, "timestamp": timestamp}), 201


@app.route("/api/measurements", methods=["GET"])
def list_measurements():
    limit = request.args.get("limit", default=50, type=int)
    limit = max(1, min(limit, 500))

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM measurements
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return jsonify([row_to_dict(row) for row in rows])


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=SERVER_PORT, debug=False)
