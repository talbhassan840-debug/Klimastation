"""
ESP32 MicroPython - BME280 & SCD41
Humidity Berechnung mit KORREKTEN Bit-Extraktionen (Adafruit-Referenz)
"""

import machine
import time

try:
    import ujson as json
except ImportError:
    import json

try:
    import urequests as requests
except ImportError:
    requests = None

try:
    from config import DEVICE_ID, SERVER_URL, MEASUREMENT_INTERVAL_SECONDS
except ImportError:
    DEVICE_ID = "esp32_raumklima_01"
    SERVER_URL = "http://DEINE_SERVER_IP:5001/api/measurements"
    MEASUREMENT_INTERVAL_SECONDS = 60

print("=" * 50)
print("ESP32 Sensor Test - BME280 & SCD41")
print("=" * 50)

try:
    i2c = machine.I2C(id=0, scl=machine.Pin(22), sda=machine.Pin(21), freq=50000)
    print("✓ I2C Bus initialisiert")
except Exception as e:
    print(f"✗ Fehler: {e}")
    import sys
    sys.exit()

devices = i2c.scan()
if not devices:
    print("✗ Keine Geräte!")
    import sys
    sys.exit()

print("I2C Geräte:", ["0x%02X" % dev for dev in devices])
bme280_addr = 0x76 if 0x76 in devices else 0x77
scd41_found = 0x62 in devices

print(f"✓ BME280 auf 0x{bme280_addr:02X}")
if scd41_found:
    print("✓ SCD41 auf 0x62")

class BME280:
    def __init__(self, i2c, addr=0x76):
        self.i2c = i2c
        self.addr = addr
        self.calib = {}
        self.t_fine = 0
        self._check_chip_id()
        self._load_calib()

    def _read_mem(self, reg, nbytes, retries=8):
        last_error = None
        for attempt in range(retries):
            try:
                return self.i2c.readfrom_mem(self.addr, reg, nbytes)
            except OSError as e:
                last_error = e
                time.sleep_ms(80 + attempt * 20)
        self._print_scan_after_error(reg)
        raise last_error

    def _write_mem(self, reg, data, retries=8):
        last_error = None
        for attempt in range(retries):
            try:
                self.i2c.writeto_mem(self.addr, reg, data)
                return
            except OSError as e:
                last_error = e
                time.sleep_ms(80 + attempt * 20)
        self._print_scan_after_error(reg)
        raise last_error

    def _print_scan_after_error(self, reg):
        try:
            devices = ["0x%02X" % dev for dev in self.i2c.scan()]
            print("I2C Fehler bei Register 0x%02X, Scan: %s" % (reg, devices))
        except Exception as e:
            print("I2C Fehler bei Register 0x%02X, Scan fehlgeschlagen: %s" % (reg, e))

    def _check_chip_id(self):
        chip_id = self._read_mem(0xD0, 1)[0]
        print(f"BME280 Chip-ID: 0x{chip_id:02X}")
        if chip_id != 0x60:
            raise RuntimeError("Adresse antwortet, ist aber kein BME280")
    
    def _load_calib(self):
        """Lädt Kalibrierungsdaten mit KORREKTEN Bit-Extraktionen"""
        data1 = self._read_mem(0x88, 26)
        
        # T, P
        self.calib['T1'] = (data1[1] << 8) | data1[0]
        self.calib['T2'] = self._to_signed((data1[3] << 8) | data1[2], 16)
        self.calib['T3'] = self._to_signed((data1[5] << 8) | data1[4], 16)
        
        self.calib['P1'] = (data1[7] << 8) | data1[6]
        self.calib['P2'] = self._to_signed((data1[9] << 8) | data1[8], 16)
        self.calib['P3'] = self._to_signed((data1[11] << 8) | data1[10], 16)
        self.calib['P4'] = self._to_signed((data1[13] << 8) | data1[12], 16)
        self.calib['P5'] = self._to_signed((data1[15] << 8) | data1[14], 16)
        self.calib['P6'] = self._to_signed((data1[17] << 8) | data1[16], 16)
        self.calib['P7'] = self._to_signed((data1[19] << 8) | data1[18], 16)
        self.calib['P8'] = self._to_signed((data1[21] << 8) | data1[20], 16)
        self.calib['P9'] = self._to_signed((data1[23] << 8) | data1[22], 16)
        
        # H1
        self.calib['H1'] = data1[25]
        
        # H2-H6
        data2 = self._read_mem(0xE1, 7)
        
        # H2: signed 16-bit, LSB at 0xE1, MSB at 0xE2
        self.calib['H2'] = self._to_signed((data2[1] << 8) | data2[0], 16)
        
        # H3: unsigned 8-bit
        self.calib['H3'] = data2[2]
        
        # H4: MSB (0xE4[7:0]) + LSB (0xE5[3:0])
        # RICHTIG: H4 = (0xE4[7:0] << 4) | (0xE5[3:0])
        h4_msb = data2[3]
        h4_lsb = (data2[4] & 0x0F)
        H4_raw = (h4_msb << 4) | h4_lsb
        self.calib['H4'] = self._to_signed(H4_raw, 12)
        
        # H5: MSB (0xE6[7:0]) + LSB (0xE5[7:4])
        # RICHTIG: H5 = (0xE6[7:0] << 4) | (0xE5[7:4])
        h5_msb = data2[5]
        h5_lsb = ((data2[4] >> 4) & 0x0F)
        H5_raw = (h5_msb << 4) | h5_lsb
        self.calib['H5'] = self._to_signed(H5_raw, 12)
        
        # H6: 0xE7[7:0]
        self.calib['H6'] = self._to_signed(data2[6], 8)
        
        print(f"H1={self.calib['H1']}, H2={self.calib['H2']}, H3={self.calib['H3']}")
        print(f"H4={self.calib['H4']}, H5={self.calib['H5']}, H6={self.calib['H6']}")
    
    @staticmethod
    def _to_signed(val, bits):
        if val & (1 << (bits - 1)):
            return val - (1 << bits)
        return val
    
    def setup(self):
        # Kleine Oversampling-Werte halten die Messung kurz und den I2C-Bus ruhiger.
        self._write_mem(0xF2, b'\x01')
        time.sleep(0.05)
        self._write_mem(0xF5, b'\x00')
        time.sleep(0.05)
        self._write_mem(0xF4, b'\x24')
        time.sleep(0.1)

    def _trigger_forced_measurement(self):
        self._write_mem(0xF4, b'\x25')
        for _ in range(20):
            status = self._read_mem(0xF3, 1)[0]
            if not (status & 0x08):
                return
            time.sleep_ms(20)
        time.sleep_ms(100)
    
    def read(self):
        self._trigger_forced_measurement()
        data = self._read_mem(0xF7, 8)
        
        adc_T = (data[3] << 12) | (data[4] << 4) | (data[5] >> 4)
        adc_P = (data[0] << 12) | (data[1] << 4) | (data[2] >> 4)
        adc_H = (data[6] << 8) | data[7]
        
        # TEMPERATUR
        var1 = (adc_T >> 3) - (self.calib['T1'] << 1)
        var2 = (var1 * self.calib['T2']) >> 11
        var1 = ((var1 >> 1) * (var1 >> 1)) >> 12
        var1 = ((var1) * (self.calib['T3'])) >> 14
        self.t_fine = var2 + var1
        temp = (self.t_fine * 5 + 128) >> 8
        temp = temp / 100.0
        
        # DRUCK
        var1 = self.t_fine / 2.0 - 64000.0
        var2 = var1 * var1 * self.calib['P6'] / 32768.0
        var2 = var2 + var1 * self.calib['P5'] * 2.0
        var2 = var2 / 4.0 + self.calib['P4'] * 65536.0
        var1 = (self.calib['P3'] * var1 * var1 / 524288.0 + self.calib['P2'] * var1) / 524288.0
        var1 = (1.0 + var1 / 32768.0) * self.calib['P1']
        if var1 == 0:
            press = 0
        else:
            press = 1048576.0 - adc_P
            press = (press - var2 / 4096.0) * 6250.0 / var1
            var1 = self.calib['P9'] * press * press / 2147483648.0
            var2 = press * self.calib['P8'] / 32768.0
            press = press + (var1 + var2 + self.calib['P7']) / 16.0
        press = press / 100.0
        
        # LUFTFEUCHTIGKEIT (Bosch/Adafruit Integer-Kompensation)
        var_H = self.t_fine - 76800
        var_H = (
            (((adc_H << 14) - (self.calib['H4'] << 20) - (self.calib['H5'] * var_H) + 16384) >> 15)
            * (((((((var_H * self.calib['H6']) >> 10) * (((var_H * self.calib['H3']) >> 11) + 32768)) >> 10)
                 + 2097152) * self.calib['H2'] + 8192) >> 14)
        )
        var_H = var_H - (((((var_H >> 15) * (var_H >> 15)) >> 7) * self.calib['H1']) >> 4)
        var_H = max(0, min(var_H, 419430400))
        humidity = (var_H >> 12) / 1024.0
        
        if humidity > 100.0:
            humidity = 100.0
        if humidity < 0.0:
            humidity = 0.0
        
        return temp, press, humidity


class SCD41:
    def __init__(self, i2c, addr=0x62):
        self.i2c = i2c
        self.addr = addr

    @staticmethod
    def _crc(data):
        crc = 0xFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 0x80:
                    crc = ((crc << 1) ^ 0x31) & 0xFF
                else:
                    crc = (crc << 1) & 0xFF
        return crc

    def _command(self, command, delay_ms=0, retries=5):
        data = bytes([(command >> 8) & 0xFF, command & 0xFF])
        last_error = None
        for attempt in range(retries):
            try:
                self.i2c.writeto(self.addr, data)
                if delay_ms:
                    time.sleep_ms(delay_ms)
                return
            except OSError as e:
                last_error = e
                time.sleep_ms(80 + attempt * 40)
        raise last_error

    def _read_words(self, command, word_count, delay_ms=1):
        self._command(command, delay_ms)
        data = self.i2c.readfrom(self.addr, word_count * 3)
        words = []
        for index in range(word_count):
            offset = index * 3
            word_bytes = data[offset:offset + 2]
            crc = data[offset + 2]
            if self._crc(word_bytes) != crc:
                raise RuntimeError("SCD41 CRC Fehler bei Wort %d" % index)
            words.append((word_bytes[0] << 8) | word_bytes[1])
        return words

    def start_periodic_measurement(self):
        self._command(0x21B1)

    def stop_periodic_measurement(self):
        self._command(0x3F86, 500)

    def wait_until_ready(self, timeout_s=10):
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            status = self._read_words(0xE4B8, 1, 1)[0]
            if status & 0x07FF:
                return True
            time.sleep_ms(500)
        return False

    def read_measurement(self):
        co2_raw, temp_raw, hum_raw = self._read_words(0xEC05, 3, 1)
        temperature = -45.0 + 175.0 * temp_raw / 65536.0
        humidity = 100.0 * hum_raw / 65536.0
        return co2_raw, temperature, humidity


def _empty_bme280_data():
    return {
        "temperature_c": None,
        "humidity_percent": None,
        "pressure_hpa": None
    }


def _empty_scd41_data():
    return {
        "co2_ppm": None,
        "temperature_c": None,
        "humidity_percent": None
    }


def read_sensor_data(bme280, scd41_sensor=None):
    """Liest alle Sensorwerte und gibt sie als Dictionary für JSON/SQLite zurück."""
    data = {
        "device": DEVICE_ID,
        "timestamp": None,
        "bme280": _empty_bme280_data(),
        "scd41": _empty_scd41_data()
    }

    try:
        temperature, pressure, humidity = bme280.read()
        data["bme280"] = {
            "temperature_c": round(temperature, 2),
            "humidity_percent": round(humidity, 2),
            "pressure_hpa": round(pressure, 2)
        }
    except Exception as e:
        print("✗ Fehler beim Lesen des BME280:", e)

    if scd41_sensor:
        try:
            if not scd41_sensor.wait_until_ready(6):
                raise RuntimeError("kein neuer SCD41 Messwert bereit")
            co2, temperature, humidity = scd41_sensor.read_measurement()
            data["scd41"] = {
                "co2_ppm": int(co2),
                "temperature_c": round(temperature, 2),
                "humidity_percent": round(humidity, 2)
            }
        except Exception as e:
            print("✗ Fehler beim Lesen des SCD41:", e)

    return data


def create_json_payload(sensor_data):
    """Wandelt das Messdaten-Dictionary in einen JSON-String für HTTP-POST um."""
    return json.dumps(sensor_data)


def send_json_payload(json_payload):
    """Sendet den JSON-String per HTTP-POST an den Flask-Server."""
    if requests is None:
        print("✗ urequests ist nicht verfügbar, HTTP-POST übersprungen")
        return False

    response = None
    try:
        response = requests.post(
            SERVER_URL,
            data=json_payload,
            headers={"Content-Type": "application/json"}
        )
        print("HTTP Status:", response.status_code)
        print("Server Antwort:", response.text)
        return 200 <= response.status_code < 300
    except Exception as e:
        print("✗ HTTP-POST fehlgeschlagen:", e)
        return False
    finally:
        if response:
            response.close()


# ============ SENSOREN INITIALISIEREN ============
print("\n[4/5] Sensoren initialisieren:")
print("-" * 50)

sensor = BME280(i2c, bme280_addr)
sensor.setup()
print("✓ BME280 initialisiert")

scd41 = None
if scd41_found:
    scd41 = SCD41(i2c)
    try:
        scd41.stop_periodic_measurement()
    except OSError:
        pass
    scd41.start_periodic_measurement()
    print("✓ SCD41 Messung gestartet")
    print("  Warte auf ersten Messwert...")
    if not scd41.wait_until_ready():
        raise RuntimeError("SCD41 hat keinen Messwert geliefert")
else:
    print("✗ Kein SCD41 auf 0x62 gefunden")

print("\n[5/5] Dauerbetrieb:")
print("1 Messung alle %d Sekunden" % MEASUREMENT_INTERVAL_SECONDS)
print("-" * 50)

measurement_count = 1
while True:
    print("\nMessung %d" % measurement_count)

    sensor_data = read_sensor_data(sensor, scd41)
    json_payload = create_json_payload(sensor_data)
    print("JSON Payload:")
    print(json_payload)
    send_json_payload(json_payload)

    print("Warte %d Sekunden bis zur naechsten Messung..." % MEASUREMENT_INTERVAL_SECONDS)
    time.sleep(MEASUREMENT_INTERVAL_SECONDS)
    measurement_count += 1
