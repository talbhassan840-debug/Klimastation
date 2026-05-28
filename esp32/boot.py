# boot.py -- run on boot-up
# WLAN-Verbindung fuer ESP32 Raumklimastation

import network
import time
from machine import Pin

try:
    from config import WIFI_SSID, WIFI_PASSWORD
except ImportError:
    WIFI_SSID = "DEIN_WLAN_NAME"
    WIFI_PASSWORD = "DEIN_WLAN_PASSWORT"

WIFI_TIMEOUT_SECONDS = 60
BOOT_VERSION = "2026-05-26-home-wlan-v1"

STATUS_TEXT = {
    1000: "idle",
    1001: "connecting",
    1010: "got IP",
    201: "kein Access Point gefunden",
    202: "falsches Passwort oder Authentifizierung fehlgeschlagen",
    203: "Verbindung fehlgeschlagen",
    204: "Handshake Timeout"
}


def turn_off_board_leds():
    """Schaltet typische steuerbare ESP32-Board-LEDs aus."""
    for pin_number in (2, 5):
        try:
            led = Pin(pin_number, Pin.OUT)
            led.value(0)
        except Exception:
            pass


def status_text(status):
    return STATUS_TEXT.get(status, "unbekannter Status")


def scan_wifi(wlan):
    """Zeigt sichtbare WLANs an und prueft, ob die konfigurierte SSID gefunden wird."""
    print("Scanne WLANs...")
    try:
        networks = wlan.scan()
    except OSError as e:
        print("WLAN-Scan fehlgeschlagen:", e)
        return False

    print("Gefundene WLANs:", len(networks))
    found = False
    for net in networks:
        ssid = net[0].decode("utf-8").strip()
        channel = net[2]
        rssi = net[3]
        authmode = net[4]
        print("  SSID: %s, Kanal: %d, Signal: %d dBm, Auth: %d" % (ssid, channel, rssi, authmode))
        if ssid == WIFI_SSID:
            found = True

    if not found:
        print("Hinweis: '%s' wurde beim Scan nicht gefunden." % WIFI_SSID)
        print("Pruefe am Router: 2.4 GHz aktiv, SSID sichtbar, Kanal 1-11 oder ESP country=CH.")
    return found


def connect_wifi():
    """Verbindet den ESP32 mit dem WLAN und gibt die IP-Konfiguration aus."""
    turn_off_board_leds()
    print("Boot-Version:", BOOT_VERSION)
    print("Konfigurierte SSID:", WIFI_SSID)

    wlan = network.WLAN(network.STA_IF)
    ap = network.WLAN(network.AP_IF)
    ap.active(False)

    try:
        wlan.disconnect()
    except Exception:
        pass
    wlan.active(False)
    time.sleep(2)
    wlan.active(True)
    time.sleep(2)

    # In der Schweiz nutzen Router oft Kanal 12/13. Ohne Country-Setting
    # sieht der ESP32 diese Kanaele je nach Firmware nicht.
    try:
        wlan.config(country="CH")
        print("WLAN-Land gesetzt: CH")
    except Exception as e:
        print("WLAN-Land konnte nicht gesetzt werden:", e)

    try:
        wlan.config(pm=0xa11140)
    except Exception:
        pass

    if wlan.isconnected():
        print("WLAN bereits verbunden")
        print("IP-Konfiguration:", wlan.ifconfig())
        return wlan

    found = scan_wifi(wlan)
    wlan.disconnect()
    time.sleep(2)

    if not found:
        print("Direkter Verbindungsversuch trotzdem gestartet...")

    print("Verbinde mit WLAN:", WIFI_SSID)
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)

    start_time = time.time()
    while not wlan.isconnected():
        status = wlan.status()
        if status in (203, 204):
            print("\nWLAN-Verbindung fehlgeschlagen")
            print("Status: %s (%s)" % (status, status_text(status)))
            return wlan

        if time.time() - start_time > WIFI_TIMEOUT_SECONDS:
            print()
            print("WLAN-Verbindung fehlgeschlagen")
            print("Status: %s (%s)" % (status, status_text(status)))
            return wlan
        print(".", end="")
        time.sleep(1)

    print("\nWLAN verbunden")
    print("IP-Konfiguration:", wlan.ifconfig())
    return wlan


wlan = connect_wifi()
