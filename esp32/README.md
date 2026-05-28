# ESP32 MicroPython

Dieser Ordner enthaelt den MicroPython-Code fuer die Raumklimastation.

## Dateien

- `boot.py`: verbindet den ESP32 mit dem WLAN.
- `main.py`: liest BME280 und SCD41, erstellt JSON und sendet es an die Flask-API.
- `config.example.py`: Vorlage fuer lokale Zugangsdaten.
- `pymakr.conf`: Pymakr-Projektkonfiguration.

## Lokale Konfiguration

Vor dem Upload auf den ESP32 `config.example.py` nach `config.py` kopieren und lokal ausfuellen:

```python
WIFI_SSID = "DEIN_WLAN_NAME"
WIFI_PASSWORD = "DEIN_WLAN_PASSWORT"

DEVICE_ID = "esp32_raumklima_01"
SERVER_URL = "http://DEINE_SERVER_IP:5001/api/measurements"
MEASUREMENT_INTERVAL_SECONDS = 60
```

`config.py` wird absichtlich nicht ins Git-Repo aufgenommen, weil dort WLAN-Daten und lokale IP-Adressen stehen.
