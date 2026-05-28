const LATEST_API_URL = "/api/measurements?limit=8";
const DATABASE_API_URL = "/api/measurements?all=1";
const DAY_MS = 24 * 60 * 60 * 1000;

const elements = {
    lastUpdated: document.getElementById("last-updated"),
    stationDot: document.getElementById("station-dot"),
    stationState: document.getElementById("station-state"),
    stationDetail: document.getElementById("station-detail"),
    temperature: document.getElementById("temperature-current"),
    humidity: document.getElementById("humidity-current"),
    pressure: document.getElementById("pressure-current"),
    co2: document.getElementById("co2-current"),
    co2Card: document.getElementById("co2-card"),
    co2StatusPill: document.getElementById("co2-status-pill"),
    co2StatusText: document.getElementById("co2-status-text"),
    table: document.getElementById("measurements-table"),
    databaseTable: document.getElementById("database-table"),
    databaseCount: document.getElementById("database-count"),
    refreshButton: document.getElementById("refresh-button"),
    chartWindowLabel: document.getElementById("chart-window-label"),
    chartSelection: document.getElementById("chart-selection"),
    chartPrevDay: document.getElementById("chart-prev-day"),
    chartToday: document.getElementById("chart-today"),
    chartNextDay: document.getElementById("chart-next-day"),
    darkmodeToggle: document.getElementById("darkmode-toggle"),
    temperatureChart: document.getElementById("temperature-chart"),
    humidityChart: document.getElementById("humidity-chart"),
    co2Chart: document.getElementById("co2-chart")
};

let chartEnd = new Date();
let chartIsLive = true;
let chartMeasurements = [];
const chartRegistry = new Map();

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
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
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

function formatShortTime(date) {
    return date.toLocaleTimeString("de-CH", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function toApiTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-") + "T" + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join(":");
}

function chartWindow() {
    if (chartIsLive) {
        chartEnd = new Date();
    }
    const end = new Date(chartEnd);
    const start = new Date(end.getTime() - DAY_MS);
    return { start, end };
}

function chartApiUrl() {
    const { start, end } = chartWindow();
    return `/api/measurements?from=${encodeURIComponent(toApiTimestamp(start))}&to=${encodeURIComponent(toApiTimestamp(end))}`;
}

function latestMeasurement(measurements) {
    return measurements.length ? measurements[0] : null;
}

function co2Level(value) {
    if (value === null || value === undefined) {
        return {
            className: "co2-good",
            label: "-",
            text: "Noch kein CO₂-Wert vorhanden"
        };
    }
    if (value >= 1200) {
        return {
            className: "co2-danger",
            label: "Rot",
            text: "Ampel: rot ab 1200 ppm"
        };
    }
    if (value >= 800) {
        return {
            className: "co2-warning",
            label: "Gelb",
            text: "Ampel: gelb ab 800 ppm"
        };
    }
    return {
        className: "co2-good",
        label: "Grün",
        text: "Ampel: grün unter 800 ppm"
    };
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

    const co2 = latest.scd41.co2_ppm;
    const level = co2Level(co2);

    elements.lastUpdated.textContent = formatTime(latest.timestamp);
    elements.temperature.textContent = formatValue(latest.bme280.temperature_c, 1);
    elements.humidity.textContent = formatValue(latest.bme280.humidity_percent, 1);
    elements.pressure.textContent = formatValue(latest.bme280.pressure_hpa, 1);
    elements.co2.textContent = co2 ?? "-";
    elements.co2Card.classList.remove("co2-good", "co2-warning", "co2-danger");
    elements.co2Card.classList.add(level.className);
    elements.co2StatusPill.textContent = level.label;
    elements.co2StatusText.textContent = level.text;
    setStationState(true, "Verbindung aktiv");
}

function measurementRow(measurement) {
    return `
        <td class="font-semibold">${formatTime(measurement.timestamp)}</td>
        <td>${formatValue(measurement.bme280.temperature_c, 1)}</td>
        <td>${formatValue(measurement.bme280.humidity_percent, 1)}</td>
        <td>${formatValue(measurement.bme280.pressure_hpa, 1)}</td>
        <td>${measurement.scd41.co2_ppm ?? "-"}</td>
    `;
}

function updateRecentTable(measurements) {
    if (!measurements.length) {
        elements.table.innerHTML = `<tr><td class="empty-cell" colspan="5">Noch keine Messwerte vorhanden</td></tr>`;
        return;
    }

    elements.table.innerHTML = measurements.slice(0, 8).map((measurement) => `
        <tr>
            ${measurementRow(measurement)}
        </tr>
    `).join("");
}

function updateDatabaseTable(measurements) {
    elements.databaseCount.textContent = measurements.length;

    if (!measurements.length) {
        elements.databaseTable.innerHTML = `<tr><td class="empty-cell" colspan="7">Noch keine Datenbankeinträge vorhanden</td></tr>`;
        return;
    }

    elements.databaseTable.innerHTML = measurements.map((measurement) => `
        <tr>
            <td class="font-semibold">${measurement.id}</td>
            <td class="font-semibold">${formatTime(measurement.timestamp)}</td>
            <td>${measurement.device}</td>
            <td>${formatValue(measurement.bme280.temperature_c, 1)}</td>
            <td>${formatValue(measurement.bme280.humidity_percent, 1)}</td>
            <td>${formatValue(measurement.bme280.pressure_hpa, 1)}</td>
            <td>${measurement.scd41.co2_ppm ?? "-"}</td>
        </tr>
    `).join("");
}

function updateChartWindowLabel() {
    const { start, end } = chartWindow();
    elements.chartWindowLabel.textContent = `${formatTime(start)} bis ${formatTime(end)}`;
    elements.chartNextDay.disabled = chartIsLive || end.getTime() >= Date.now() - 1000;
    elements.chartNextDay.style.opacity = elements.chartNextDay.disabled ? "0.45" : "1";
}

function drawChart(canvas, measurements, selector, color, label, unit, decimals = 1) {
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const isDark = document.body.classList.contains("dark-mode");
    const gridColor = isDark ? "#263445" : "#e2e8f0";
    const textColor = isDark ? "#94a3b8" : "#64748b";
    const padding = { top: 14, right: 18, bottom: 40, left: 50 };
    const { start, end } = chartWindow();
    const points = measurements
        .slice()
        .map((measurement) => ({
            measurement,
            timestamp: new Date(measurement.timestamp),
            value: selector(measurement)
        }))
        .filter((point) => !Number.isNaN(point.timestamp.getTime()))
        .filter((point) => point.timestamp >= start && point.timestamp <= end)
        .filter((point) => point.value !== null && point.value !== undefined)
        .sort((a, b) => a.timestamp - b.timestamp);

    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.lineWidth = 1;

    if (points.length < 2) {
        ctx.fillStyle = textColor;
        ctx.fillText("Noch zu wenige Messwerte in diesem 24h-Fenster", padding.left, height / 2);
        chartRegistry.set(canvas, { points: [], label, unit, decimals });
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

    const xForTime = (date) => padding.left + ((date.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * plotWidth;
    const yFor = (value) => padding.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (i / 4) * plotHeight;
        const axisLabel = yMax - (i / 4) * (yMax - yMin);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(axisLabel.toFixed(decimals), 6, y + 4);
    }

    for (let i = 0; i <= 4; i += 1) {
        const x = padding.left + (i / 4) * plotWidth;
        const date = new Date(start.getTime() + (i / 4) * (end.getTime() - start.getTime()));
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();
        ctx.fillText(formatShortTime(date), x - 16, height - 10);
    }

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, `${color}33`);
    gradient.addColorStop(1, `${color}00`);

    const plotted = points.map((point) => ({
        ...point,
        x: xForTime(point.timestamp),
        y: yFor(point.value)
    }));

    ctx.beginPath();
    plotted.forEach((point, index) => {
        if (index === 0) {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    });
    ctx.lineTo(plotted[plotted.length - 1].x, height - padding.bottom);
    ctx.lineTo(plotted[0].x, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    plotted.forEach((point, index) => {
        if (index === 0) {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = color;
    plotted.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    });

    chartRegistry.set(canvas, { points: plotted, label, unit, decimals });
}

function updateCharts(measurements) {
    updateChartWindowLabel();
    drawChart(elements.temperatureChart, measurements, (measurement) => measurement.bme280.temperature_c, "#16a34a", "Temperatur", "°C");
    drawChart(elements.humidityChart, measurements, (measurement) => measurement.bme280.humidity_percent, "#2563eb", "Luftfeuchtigkeit", "%");
    drawChart(elements.co2Chart, measurements, (measurement) => measurement.scd41.co2_ppm, "#7c3aed", "CO₂", "ppm", 0);
}

function selectChartPoint(canvas, clientX, clientY) {
    const chart = chartRegistry.get(canvas);
    if (!chart || !chart.points.length) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let nearest = null;
    let nearestDistance = Infinity;

    chart.points.forEach((point) => {
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < nearestDistance) {
            nearest = point;
            nearestDistance = distance;
        }
    });

    if (!nearest || nearestDistance > 32) {
        elements.chartSelection.textContent = "Kein Messpunkt in der Nähe. Tippe direkt auf einen Punkt im Diagramm.";
        return;
    }

    elements.chartSelection.textContent = `${chart.label}: ${formatValue(nearest.value, chart.decimals)} ${chart.unit} am ${formatTime(nearest.measurement.timestamp)}`;
}

async function loadMeasurements() {
    try {
        const [latestResponse, chartResponse, databaseResponse] = await Promise.all([
            fetch(LATEST_API_URL),
            fetch(chartApiUrl()),
            fetch(DATABASE_API_URL)
        ]);

        if (!latestResponse.ok || !chartResponse.ok || !databaseResponse.ok) {
            throw new Error("API Antwort fehlerhaft");
        }

        const latestMeasurements = await latestResponse.json();
        chartMeasurements = await chartResponse.json();
        const databaseMeasurements = await databaseResponse.json();

        updateCards(latestMeasurements);
        updateRecentTable(latestMeasurements);
        updateCharts(chartMeasurements);
        updateDatabaseTable(databaseMeasurements);
    } catch (error) {
        setStationState(false, "API nicht erreichbar");
        elements.table.innerHTML = `<tr><td class="empty-cell text-red-500" colspan="5">Fehler beim Laden: ${error.message}</td></tr>`;
        elements.databaseTable.innerHTML = `<tr><td class="empty-cell text-red-500" colspan="7">Fehler beim Laden: ${error.message}</td></tr>`;
    }
}

function shiftChartWindow(days) {
    chartIsLive = false;
    chartEnd = new Date(chartEnd.getTime() + days * DAY_MS);
    if (chartEnd.getTime() > Date.now()) {
        chartIsLive = true;
        chartEnd = new Date();
    }
    loadMeasurements();
}

function showToday() {
    chartIsLive = true;
    chartEnd = new Date();
    loadMeasurements();
}

function setDarkMode(enabled) {
    document.body.classList.toggle("dark-mode", enabled);
    elements.darkmodeToggle.checked = enabled;
    localStorage.setItem("klimastation-darkmode", enabled ? "1" : "0");
    updateCharts(chartMeasurements);
}

function activateNavigation(targetId) {
    document.querySelectorAll("[data-section-link]").forEach((link) => {
        link.classList.toggle("active", link.dataset.sectionLink === targetId);
    });
}

elements.refreshButton.addEventListener("click", loadMeasurements);
elements.chartPrevDay.addEventListener("click", () => shiftChartWindow(-1));
elements.chartNextDay.addEventListener("click", () => shiftChartWindow(1));
elements.chartToday.addEventListener("click", showToday);
elements.darkmodeToggle.addEventListener("change", (event) => setDarkMode(event.target.checked));

document.querySelectorAll("[data-chart-shift]").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        document.getElementById("charts").scrollIntoView({ behavior: "smooth" });
        shiftChartWindow(Number(link.dataset.chartShift));
    });
});

document.querySelectorAll("[data-chart-today]").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        document.getElementById("charts").scrollIntoView({ behavior: "smooth" });
        showToday();
    });
});

document.querySelectorAll("[data-section-link]").forEach((link) => {
    link.addEventListener("click", () => activateNavigation(link.dataset.sectionLink));
});

[elements.temperatureChart, elements.humidityChart, elements.co2Chart].forEach((canvas) => {
    canvas.addEventListener("click", (event) => selectChartPoint(canvas, event.clientX, event.clientY));
    canvas.addEventListener("touchstart", (event) => {
        const touch = event.touches[0];
        if (touch) {
            selectChartPoint(canvas, touch.clientX, touch.clientY);
        }
    }, { passive: true });
});

window.addEventListener("resize", () => updateCharts(chartMeasurements));

setDarkMode(localStorage.getItem("klimastation-darkmode") === "1");
loadMeasurements();
setInterval(loadMeasurements, 30000);
