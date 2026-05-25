# Raspberry Pi 5 Raumklima Server

Kleiner Flask-Server fuer die ESP32-Raumklimastation.

## Starten

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Der Server laeuft danach auf:

```text
http://0.0.0.0:5001
```

Das Webfrontend ist unter der Startseite erreichbar:

```text
http://<SERVER-IP>:5001/
```

Vom ESP32 aus wird spaeter die IP-Adresse des Raspberry Pi oder Laptops verwendet:

```text
http://<SERVER-IP>:5001/api/measurements
```

Aktuelle Laptop-IP im Heim-WLAN:

```text
http://192.168.1.156:5001/api/measurements
```

## Test POST

```bash
curl -X POST http://127.0.0.1:5001/api/measurements \
  -H "Content-Type: application/json" \
  -d '{"device":"esp32_raumklima_01","timestamp":null,"bme280":{"temperature_c":23.5,"humidity_percent":45.2,"pressure_hpa":982.4},"scd41":{"co2_ppm":612,"temperature_c":23.8,"humidity_percent":44.9}}'
```

## Test GET

```bash
curl http://127.0.0.1:5001/api/measurements
```
