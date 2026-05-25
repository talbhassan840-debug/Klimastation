const API_URL = "/api/measurements?limit=48";

const elements = {
    lastUpdated: document.getElementById("last-updated"),
    stationDot: document.getElementById("station-dot"),
    stationState: document.getElementById("station-state"),
    stationDetail: document.getElementById("station-detail"),
    temperature: document.getElementById("temperature-current"),
    humidity: document.getElementById("humidity-current"),
    pressure: document.getElementById("pressure-current"),
    co2: document.getElementById("co2-current"),
    table: document.getElementById("measurements-table"),
    refreshButton: document.getElementById("refresh-button"),
    temperatureChart: document.getElementById("temperature-chart"),
    humidityChart: document.getElementById("humidity-chart")
};

function formatValue(value, digits = 1) {
    if (value === null || value === undefined) {
        return "-";
    }
    return Number(value).toFixed(digits);
}

function formatTime(timestamp) {
    if (!timestamp) {
        return "-";
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return timestamp;
    }
    return date.toLocaleString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function latestMeasurement(measurements) {
    return measurements.length ? measurements[0] : null;
}

function setStationState(isOnline, detail) {
    elements.stationDot.className = `h-2.5 w-2.5 rounded-full ${isOnline ? "bg-brand-500" : "bg-slate-300"}`;
    elements.stationState.textContent = isOnline ? "Station online" : "Keine Live-Daten";
    elements.stationDetail.textContent = detail;
}

function updateCards(measurements) {
    const latest = latestMeasurement(measurements);

    if (!latest) {
        elements.lastUpdated.textContent = "-";
        elements.temperature.textContent = "-";
        elements.humidity.textContent = "-";
        elements.pressure.textContent = "-";
        elements.co2.textContent = "-";
        setStationState(false, "Noch keine Messwerte gespeichert");
        return;
    }

    elements.lastUpdated.textContent = formatTime(latest.timestamp);
    elements.temperature.textContent = formatValue(latest.bme280.temperature_c, 1);
    elements.humidity.textContent = formatValue(latest.bme280.humidity_percent, 0);
    elements.pressure.textContent = formatValue(latest.bme280.pressure_hpa, 0);
    elements.co2.textContent = latest.scd41.co2_ppm ?? "-";
    setStationState(true, "Verbindung aktiv");
}

function updateTable(measurements) {
    if (!measurements.length) {
        elements.table.innerHTML = `<tr><td class="py-6 text-slate-400" colspan="5">Noch keine Messwerte vorhanden</td></tr>`;
        return;
    }

    elements.table.innerHTML = measurements.slice(0, 8).map((measurement) => `
        <tr class="hover:bg-slate-50">
            <td class="py-3 pr-4 font-semibold text-slate-700">${formatTime(measurement.timestamp)}</td>
            <td class="px-4 py-3">${formatValue(measurement.bme280.temperature_c, 1)}</td>
            <td class="px-4 py-3">${formatValue(measurement.bme280.humidity_percent, 0)}</td>
            <td class="px-4 py-3">${formatValue(measurement.bme280.pressure_hpa, 0)}</td>
            <td class="py-3 pl-4">${measurement.scd41.co2_ppm ?? "-"}</td>
        </tr>
    `).join("");
}

function drawChart(canvas, measurements, selector, color) {
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 12, right: 14, bottom: 32, left: 42 };
    const points = measurements
        .slice()
        .reverse()
        .map((measurement) => ({
            timestamp: measurement.timestamp,
            value: selector(measurement)
        }))
        .filter((point) => point.value !== null && point.value !== undefined);

    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.lineWidth = 1;

    if (points.length < 2) {
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("Noch zu wenige Messwerte", padding.left, height / 2);
        return;
    }

    const values = points.map((point) => Number(point.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const yMin = min - range * 0.2;
    const yMax = max + range * 0.2;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const xFor = (index) => padding.left + (points.length === 1 ? 0 : (index / (points.length - 1)) * plotWidth);
    const yFor = (value) => padding.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";
    for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (i / 4) * plotHeight;
        const label = yMax - (i / 4) * (yMax - yMin);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(label.toFixed(0), 6, y + 4);
    }

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, `${color}30`);
    gradient.addColorStop(1, `${color}00`);

    ctx.beginPath();
    points.forEach((point, index) => {
        const x = xFor(index);
        const y = yFor(point.value);
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.lineTo(xFor(points.length - 1), height - padding.bottom);
    ctx.lineTo(xFor(0), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => {
        const x = xFor(index);
        const y = yFor(point.value);
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = color;
    points.forEach((point, index) => {
        const x = xFor(index);
        const y = yFor(point.value);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    const first = points[0];
    const last = points[points.length - 1];
    ctx.fillStyle = "#64748b";
    ctx.fillText(formatTime(first.timestamp).slice(12, 17), padding.left, height - 8);
    ctx.fillText(formatTime(last.timestamp).slice(12, 17), width - padding.right - 34, height - 8);
}

function updateCharts(measurements) {
    drawChart(elements.temperatureChart, measurements, (measurement) => measurement.bme280.temperature_c, "#16a34a");
    drawChart(elements.humidityChart, measurements, (measurement) => measurement.bme280.humidity_percent, "#2563eb");
}

async function loadMeasurements() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const measurements = await response.json();
        updateCards(measurements);
        updateTable(measurements);
        updateCharts(measurements);
    } catch (error) {
        setStationState(false, "API nicht erreichbar");
        elements.table.innerHTML = `<tr><td class="py-6 text-red-500" colspan="5">Fehler beim Laden: ${error.message}</td></tr>`;
    }
}

elements.refreshButton.addEventListener("click", loadMeasurements);
window.addEventListener("resize", loadMeasurements);

loadMeasurements();
setInterval(loadMeasurements, 30000);
