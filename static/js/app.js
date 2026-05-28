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
const charts = {};
let chartPluginsRegistered = false;

function registerChartPlugins() {
    if (chartPluginsRegistered || typeof Chart === "undefined") {
        return;
    }

    Chart.register({
        id: "thresholdLines",
        beforeDatasetsDraw(chart, args, options) {
            const lines = options.lines || [];
            if (!lines.length || !chart.chartArea || !chart.scales.y) {
                return;
            }

            const { ctx, chartArea, scales } = chart;
            ctx.save();
            ctx.font = "11px Inter, system-ui, sans-serif";
            ctx.setLineDash([6, 5]);
            lines.forEach((line) => {
                const y = scales.y.getPixelForValue(line.value);
                if (y < chartArea.top || y > chartArea.bottom) {
                    return;
                }
                ctx.strokeStyle = line.color;
                ctx.fillStyle = line.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(chartArea.left, y);
                ctx.lineTo(chartArea.right, y);
                ctx.stroke();
                ctx.fillText(line.label, chartArea.left + 8, y - 6);
            });
            ctx.restore();
        }
    });
    chartPluginsRegistered = true;
}

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

function chartColors() {
    const isDark = document.body.classList.contains("dark-mode");
    return {
        grid: isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(148, 163, 184, 0.22)",
        text: isDark ? "#94a3b8" : "#64748b",
        tooltipBg: isDark ? "#e2e8f0" : "#0f172a",
        tooltipText: isDark ? "#0f172a" : "#ffffff",
        pointBorder: isDark ? "#111c2e" : "#ffffff"
    };
}

function chartPoints(measurements, selector) {
    const { start, end } = chartWindow();
    return measurements
        .slice()
        .map((measurement) => ({
            x: new Date(measurement.timestamp).getTime(),
            y: selector(measurement),
            measurement
        }))
        .filter((point) => !Number.isNaN(point.x))
        .filter((point) => point.x >= start.getTime() && point.x <= end.getTime())
        .filter((point) => point.y !== null && point.y !== undefined)
        .sort((a, b) => a.x - b.x);
}

function chartOptions(label, unit, decimals, thresholdLines = []) {
    const colors = chartColors();
    const { start, end } = chartWindow();

    return {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: {
            intersect: false,
            mode: "nearest"
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: true,
                backgroundColor: colors.tooltipBg,
                titleColor: colors.tooltipText,
                bodyColor: colors.tooltipText,
                displayColors: false,
                callbacks: {
                    title: (items) => items.length ? formatTime(items[0].raw.measurement.timestamp) : "",
                    label: (item) => `${label}: ${formatValue(item.raw.y, decimals)} ${unit}`
                }
            },
            thresholdLines: {
                lines: thresholdLines
            }
        },
        scales: {
            x: {
                type: "linear",
                min: start.getTime(),
                max: end.getTime(),
                border: {
                    color: colors.grid
                },
                grid: {
                    color: colors.grid,
                    drawTicks: false
                },
                ticks: {
                    color: colors.text,
                    maxTicksLimit: 5,
                    padding: 10,
                    callback: (value) => formatShortTime(new Date(Number(value)))
                }
            },
            y: {
                beginAtZero: false,
                border: {
                    color: colors.grid
                },
                grid: {
                    color: colors.grid,
                    drawTicks: false
                },
                ticks: {
                    color: colors.text,
                    padding: 10,
                    callback: (value) => Number(value).toFixed(decimals)
                }
            }
        },
        onClick: (event, activeElements, chart) => {
            if (!activeElements.length) {
                elements.chartSelection.textContent = "Kein Messpunkt ausgewählt. Klicke direkt auf einen Punkt im Diagramm.";
                elements.chartSelection.dataset.userSelected = "";
                return;
            }
            const point = chart.data.datasets[0].data[activeElements[0].index];
            elements.chartSelection.textContent = `${label}: ${formatValue(point.y, decimals)} ${unit} am ${formatTime(point.measurement.timestamp)}`;
            elements.chartSelection.dataset.userSelected = "1";
        },
        onHover: (event, activeElements) => {
            event.native.target.style.cursor = activeElements.length ? "pointer" : "crosshair";
        }
    };
}

function renderChart(key, canvas, measurements, selector, color, label, unit, decimals = 1, thresholdLines = []) {
    const points = chartPoints(measurements, selector);
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
    const colors = chartColors();
    gradient.addColorStop(0, `${color}20`);
    gradient.addColorStop(1, `${color}00`);
    const dataset = {
        label,
        data: points,
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 2.2,
        pointHoverRadius: 5.5,
        pointHitRadius: 16,
        pointBackgroundColor: color,
        pointBorderColor: colors.pointBorder,
        pointBorderWidth: 0,
        pointHoverBorderColor: colors.pointBorder,
        pointHoverBorderWidth: 2
    };

    if (!charts[key]) {
        charts[key] = new Chart(canvas, {
            type: "line",
            data: {
                datasets: [dataset]
            },
            options: chartOptions(label, unit, decimals, thresholdLines)
        });
        return;
    }

    charts[key].data.datasets = [dataset];
    charts[key].options = chartOptions(label, unit, decimals, thresholdLines);
    charts[key].update();
}

function updateCharts(measurements) {
    updateChartWindowLabel();
    if (typeof Chart === "undefined") {
        elements.chartSelection.textContent = "Chart.js konnte nicht geladen werden. Prüfe die Internetverbindung des Browsers.";
        return;
    }
    registerChartPlugins();
    if (measurements.length < 2) {
        elements.chartSelection.textContent = "Noch zu wenige Messwerte in diesem 24h-Fenster.";
    } else if (!elements.chartSelection.dataset.userSelected) {
        elements.chartSelection.textContent = "Bewege die Maus über einen Punkt oder tippe einen Punkt an, um Details zu sehen.";
    }
    renderChart("temperature", elements.temperatureChart, measurements, (measurement) => measurement.bme280.temperature_c, "#16a34a", "Temperatur", "°C");
    renderChart("humidity", elements.humidityChart, measurements, (measurement) => measurement.bme280.humidity_percent, "#2563eb", "Luftfeuchtigkeit", "%");
    renderChart("co2", elements.co2Chart, measurements, (measurement) => measurement.scd41.co2_ppm, "#7c3aed", "CO₂", "ppm", 0, [
        { value: 800, color: "#f59e0b", label: "800 ppm" },
        { value: 1200, color: "#dc2626", label: "1200 ppm" }
    ]);
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
    elements.chartSelection.dataset.userSelected = "";
    if (chartEnd.getTime() > Date.now()) {
        chartIsLive = true;
        chartEnd = new Date();
    }
    loadMeasurements();
}

function showToday() {
    chartIsLive = true;
    chartEnd = new Date();
    elements.chartSelection.dataset.userSelected = "";
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

window.addEventListener("resize", () => updateCharts(chartMeasurements));

setDarkMode(localStorage.getItem("klimastation-darkmode") === "1");
loadMeasurements();
setInterval(loadMeasurements, 30000);
