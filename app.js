// --- Ubidots Configuration (Only for Active Unit 1) ---
const ubidotsConfig = {
    token: 'BBUS-w44nJCaOTdsMA7BQ8ICbzqUJVkge0p', // User's Ubidots Token
    deviceLabel: 'esp32-monitor',              // Matches your ESP32 DEVICE_LABEL
    variables: {
        hr: 'bpm',             // Updated to match Ubidots label "BPM"
        spo2: 'spo2',          // Matches Ubidots label "SPO2"
        temp: 'temperature',   // Matches your ESP32 JSON payload
        gas: 'gas',            // Matches your ESP32 JSON payload
        movement: 'motion',    // Actual Ubidots variable label is 'motion'
        lat: 'latitude',       // GPS Latitude variable label
        lng: 'longitude',      // GPS Longitude variable label
        accel: 'acceleration'  // New Acceleration variable label
    }
};



// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {

    // --- State Management ---
    const state = {
        isAuthenticated: false,
        activeView: 'dashboard-view', // dashboard-view, units-view, alerts-view, unit-detail-view
        selectedUnitId: null,
        searchTerm: '',
        filter: 'all', // all, critical, warning, normal
        units: [],
        alerts: []
    };

    // --- Mock Data Generator ---
    const calculateUnitStatus = (vitals) => {
        let hasCritical = false;
        let hasWarning = false;

        if (vitals.hr < 50 || vitals.hr > 120) hasCritical = true;
        else if (vitals.hr < 60 || vitals.hr > 100) hasWarning = true;

        const t = parseFloat(vitals.temp);
        if (t < 36.0 || t > 38.5) hasCritical = true;
        else if (t > 37.5) hasWarning = true;

        if (vitals.movement === 'Fall Detected' || vitals.movement === 'No Movement') hasCritical = true;
        else if (vitals.movement === 'Low movement' || vitals.movement === 'Stationary' || vitals.movement === 'STILL') hasWarning = true;

        const gasVal = typeof vitals.gas === 'number' ? vitals.gas : 0;
        if (gasVal > 2000 || vitals.gas === 'Hazardous') hasCritical = true;
        else if (gasVal > 1000 || vitals.gas === 'Slightly polluted') hasWarning = true;

        if (hasCritical) return 'critical';
        if (hasWarning) return 'warning';
        return 'normal';
    };

    const generateMockData = () => {
        const units = [];
        const baseStatuses = ['normal', 'normal', 'normal', 'warning', 'critical'];
        const movements = ['Active', 'Stationary', 'Running', 'Fall Detected', 'No Movement', 'Low movement'];

        for (let i = 1; i <= 24; i++) {
            const id = `UN-${i.toString().padStart(3, '0')}`;
            
            // Ensure UN-001 starts with 0s so we know when real data arrives
            if (i === 1) {
                units.push({
                    id: id,
                    name: `Active Unit 01`,
                    status: 'normal',
                    lastUpdated: '--:--:--',
                    vitals: { hr: 0, spo2: 0, temp: '0.0', gas: 'Connecting...', movement: 'Waiting', accel: 0 },
                    location: { lat: '18.5249', lng: '73.8515' }
                });
                continue;
            }

            const targetState = baseStatuses[Math.floor(Math.random() * baseStatuses.length)];

            let hr = Math.floor(Math.random() * (100 - 60) + 60);
            let spo2 = Math.floor(Math.random() * (100 - 95) + 95);
            let temp = (Math.random() * (37.5 - 36.0) + 36.0).toFixed(1);
            let gas = 'Safe air';
            let movement = movements[Math.floor(Math.random() * 3)]; // Active, Stationary, Running

            if (targetState === 'critical') {
                const critType = Math.floor(Math.random() * 4);
                if (critType === 0) hr = Math.floor(Math.random() * 40 + 30); // <50
                if (critType === 1) temp = (Math.random() * (40.0 - 38.6) + 38.6).toFixed(1); // >38.5
                if (critType === 2) movement = 'Fall Detected';
                if (critType === 3) gas = 'Hazardous';
            } else if (targetState === 'warning') {
                const warnType = Math.floor(Math.random() * 3);
                if (warnType === 0) hr = Math.floor(Math.random() * (120 - 101) + 101); // 100-120
                if (warnType === 1) temp = (Math.random() * (38.5 - 37.6) + 37.6).toFixed(1); // 37.5-38.5
                if (warnType === 2) gas = 'Slightly polluted';
            }

            const vitals = { hr, spo2, temp, gas, movement, accel: (Math.random() * 20).toFixed(2) };
            const status = calculateUnitStatus(vitals);

            units.push({
                id: id,
                name: `Active Unit ${i.toString().padStart(2, '0')}`,
                status: status,
                lastUpdated: new Date().toLocaleTimeString(),
                vitals: vitals,
                location: {
                    lat: (18.524952 + (Math.random() * 0.05 - 0.025)).toFixed(6),
                    lng: (73.851514 + (Math.random() * 0.05 - 0.025)).toFixed(6)
                }
            });
        }
        return units;
    };

    state.units = generateMockData();

    // --- Real-Time Ubidots Integration (v2.0 API) ---
    async function fetchUnit1FromUbidots() {
        // We use v2.0 to get all variables for the device at once
        const url = `https://industrial.api.ubidots.com/api/v2.0/devices/~${ubidotsConfig.deviceLabel}/variables/?token=${ubidotsConfig.token}&_=${Date.now()}`;

        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 403) {
                    console.error("[Ubidots] 403 Forbidden: Check if your Token or Device Label is correct.");
                } else if (response.status === 404) {
                    console.error(`[Ubidots] 404 Not Found: Device "${ubidotsConfig.deviceLabel}" not found.`);
                } else {
                    console.error(`[Ubidots] Sync Failed: HTTP ${response.status}`);
                }
                return;
            }

            const data = await response.json();
            const variablesArray = data.results || [];
            
            if (variablesArray.length > 0) {
                // Log all labels once to help user verify configuration
                const labels = variablesArray.map(v => v.label).join(", ");
                console.log(`[Ubidots] Connected! Found Labels: [${labels}]`);

                const index = state.units.findIndex(u => u.id === 'UN-001');
                if (index !== -1) {
                    const unit = state.units[index];
                    
                    const getVal = (labelKey) => {
                        // Check for variable in configuration
                        const targetLabel = ubidotsConfig.variables[labelKey] || labelKey;
                        const v = variablesArray.find(v => v.label.toLowerCase() === targetLabel.toLowerCase());
                        if (v && v.lastValue && v.lastValue.value !== undefined) {
                            return v.lastValue.value;
                        }
                        return null;
                    };
                    
                    // Update Vitals
                    const hrVal = getVal('hr');
                    const spo2Val = getVal('spo2');
                    const tempVal = getVal('temp');
                    const gasVal = getVal('gas');
                    const movementVal = getVal('movement');
                    const accelVal = getVal('accel');
                    
                    if (hrVal !== null) unit.vitals.hr = Math.round(hrVal);
                    if (spo2Val !== null) unit.vitals.spo2 = Math.round(spo2Val);
                    if (tempVal !== null) unit.vitals.temp = parseFloat(tempVal).toFixed(1);
                    if (gasVal !== null) unit.vitals.gas = gasVal;
                    if (accelVal !== null) unit.vitals.accel = parseFloat(accelVal).toFixed(2);
                    
                    if (movementVal !== null) {
                        // The core request: 1 -> MOVING, 0 -> STILL
                        unit.vitals.movement = (parseFloat(movementVal) === 1) ? 'MOVING' : 'STILL';
                    }
                    
                    unit.lastUpdated = new Date().toLocaleTimeString();
                    unit.status = calculateUnitStatus(unit.vitals);

                    console.log(`[Sync Successful] Unit 01 | Movement: ${unit.vitals.movement} (Raw: ${movementVal}) | Temp: ${unit.vitals.temp}`);

                    // LIVE UI UPDATE
                    if (state.selectedUnitId === 'UN-001' && state.activeView === 'unit-detail-view') {
                        refreshUnitDetail(unit);
                    }

                    renderDashboard();
                    calculateAlerts();
                }
            } else {
                console.warn(`[Ubidots] No variables found for device: ${ubidotsConfig.deviceLabel}`);
            }
        } catch (err) {
            console.error("[Ubidots] Network Error:", err.message);
        }
    }
    
    // --- DOM Elements ---

    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const contentViews = document.querySelectorAll('.content-view');
    const logoutBtn = document.getElementById('logout-btn');
    const liveDatetime = document.getElementById('live-datetime');

    // Dashboard Components
    const unitsContainer = document.getElementById('units-container');
    const unitsTableBody = document.getElementById('units-table-body');
    const alertsContainer = document.getElementById('alerts-container');
    const searchInput = document.getElementById('search-input');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Detail View Components
    const detailView = document.getElementById('unit-detail-view');
    const backBtn = document.getElementById('back-to-dash');

    // --- Initialization ---
    initApp();

    function initApp() {
        startClock();
        setupEventListeners();
        renderDashboard();
    }

    // --- Authentication ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;

        // --- UPDATE CREDENTIALS HERE ---
        // Change 'admin' and 'admin123' to whatever username and password you want
        if (user === 'admin' && pass === '123') {
            loginError.style.display = 'none';
            state.isAuthenticated = true;

            // UI Transition
            loginPage.classList.remove('active');
            setTimeout(() => {
                loginPage.classList.add('hidden');
                appContainer.classList.remove('hidden');
                setTimeout(() => {
                    appContainer.classList.add('active'); // fade in
                }, 50);
            }, 300);

            showNotification('Authentication Successful', 'success');
            setTimeout(calculateAlerts, 500);
        } else {
            loginError.style.display = 'block';
        }
    });

    logoutBtn.addEventListener('click', () => {
        state.isAuthenticated = false;
        appContainer.classList.remove('active');
        setTimeout(() => {
            appContainer.classList.add('hidden');
            loginPage.classList.remove('hidden');
            setTimeout(() => {
                loginPage.classList.add('active');
                document.getElementById('password').value = '';
            }, 50);
        }, 300);
    });

    // --- Navigation ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            if (!targetId) return;

            // Update Nav UI
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Switch View
            state.activeView = targetId; // Track state!
            switchView(targetId);
        });
    });

    backBtn.addEventListener('click', () => {
        state.activeView = 'dashboard-view';
        switchView('dashboard-view');
    });

    function switchView(viewId) {
        contentViews.forEach(view => {
            if (view.id === viewId) {
                // Show the target view immediately
                view.classList.remove('hidden');
                setTimeout(() => {
                    view.classList.remove('hidden');
                    view.classList.add('active');
                }, 50);
            } else {
                // Hide other views
                view.classList.remove('active');
                setTimeout(() => {
                    if (!view.classList.contains('active')) {
                        view.classList.add('hidden');
                    }
                }, 300);
            }
        });
    }

    // --- Dashboard Rendering ---
    function renderDashboard() {
        // filter & search
        let filteredUnits = state.units.filter(unit => {
            const matchesSearch = unit.name.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
                unit.id.toLowerCase().includes(state.searchTerm.toLowerCase());
            const matchesFilter = state.filter === 'all' || unit.status === state.filter;
            return matchesSearch && matchesFilter;
        });

        unitsContainer.innerHTML = '';
        if (unitsTableBody) unitsTableBody.innerHTML = '';
        if (alertsContainer) alertsContainer.innerHTML = '';

        filteredUnits.forEach(unit => {
            const card = createUnitCardElement(unit);
            unitsContainer.appendChild(card);

            // Create Table Row for All Units View
            if (unitsTableBody) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="col-id">${unit.id}</td>
                    <td class="col-name">${unit.name}</td>
                    <td><span class="card-status-badge ${getBadgeClass(unit.status)}">${unit.status}</span></td>
                    <td class="col-vital ${getHrColorClass(unit.vitals.hr)}">${unit.vitals.hr}</td>
                    <td class="col-vital ${getSpO2ColorClass(unit.vitals.spo2)}">${unit.vitals.spo2}%</td>
                    <td class="col-vital ${getTempColorClass(unit.vitals.temp)}">${unit.vitals.temp}°C</td>
                    <td class="col-vital ${getGasColorClass(unit.vitals.gas)}">${unit.vitals.gas}</td>
                    <td class="${['Fall Detected', 'No Movement'].includes(unit.vitals.movement) ? 'red' : 'green'}">${unit.vitals.movement}</td>
                    <td style="font-size: 0.75rem; color: var(--text-muted);">${unit.lastUpdated}</td>
                    <td><button class="btn btn-outline btn-view action-btn">View</button></td>
                `;
                tr.querySelector('.action-btn').addEventListener('click', () => openUnitDetail(unit));
                unitsTableBody.appendChild(tr);
            }
        });

        // Update Alerts View with Critical Units
        if (alertsContainer) {
            const criticalUnits = state.units.filter(u => u.status === 'critical');
            if (criticalUnits.length === 0) {
                alertsContainer.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--status-green); border: 2px dashed rgba(16, 185, 129, 0.3); border-radius: var(--radius-lg);">
                        <i class="fa-solid fa-shield-heart fa-3x" style="margin-bottom: 1rem; opacity: 0.8;"></i><br>
                        <h2 style="margin-bottom: 0.5rem; font-size: 1.5rem;">All Systems Nominal</h2>
                        <p style="color: var(--text-secondary);">No critical alerts detected across active units.</p>
                    </div>`;
            } else {
                criticalUnits.forEach(unit => {
                    alertsContainer.appendChild(createUnitCardElement(unit));
                });
            }
        }

        updateStats();
    }

    function createUnitCardElement(unit) {
        const card = document.createElement('div');
        card.className = `unit-card status-${unit.status}`;
        card.onclick = () => openUnitDetail(unit);

        card.innerHTML = `
            <div class="card-header">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="font-size: 2.25rem; color: rgba(255,255,255,0.15);"><i class="fa-solid fa-person-military-rifle"></i></div>
                    <div>
                        <h3>${unit.name}</h3>
                        <span class="card-id">${unit.id}</span>
                    </div>
                </div>
                <div class="card-status-badge">${unit.status}</div>
            </div>
            <div class="card-body">
                <div class="mini-vital pointer">
                    <i class="fa-solid fa-heart-pulse"></i>
                    <span class="${getHrColorClass(unit.vitals.hr)}">${unit.vitals.hr} <small class="unit">bpm</small></span>
                </div>
                <div class="mini-vital">
                    <i class="fa-solid fa-lungs"></i>
                    <span class="${getSpO2ColorClass(unit.vitals.spo2)}">${unit.vitals.spo2} <small class="unit">%</small></span>
                </div>
            </div>
            <div class="card-time">
                <i class="fa-regular fa-clock"></i> Updated: ${unit.lastUpdated}
            </div>
        `;
        return card;
    }

    function updateStats() {
        const total = state.units.length;
        const normal = state.units.filter(u => u.status === 'normal').length;
        const warning = state.units.filter(u => u.status === 'warning').length;
        const critical = state.units.filter(u => u.status === 'critical').length;

        document.getElementById('stat-total').innerText = total;
        document.getElementById('stat-normal').innerText = normal;
        document.getElementById('stat-warning').innerText = warning;
        document.getElementById('stat-critical').innerText = critical;

        document.getElementById('nav-alert-count').innerText = critical;
    }

    // --- Filters & Search ---
    searchInput.addEventListener('input', (e) => {
        state.searchTerm = e.target.value;
        renderDashboard();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filter = e.target.getAttribute('data-filter');
            renderDashboard();
        });
    });

    // --- Unit Detail View ---
    function openUnitDetail(unit) {
        state.selectedUnitId = unit.id;
        state.activeView = 'unit-detail-view'; // Track state!

        document.getElementById('detail-unit-name').innerText = `${unit.name} (${unit.id})`;
        
        // Location (Update once on load to avoid flickering)
        document.getElementById('detail-lat').innerText = `LAT: ${unit.location.lat} N`;
        document.getElementById('detail-lng').innerText = `LNG: ${unit.location.lng} E`;
        document.getElementById('google-map-iframe').src = `https://maps.google.com/maps?q=${unit.location.lat},${unit.location.lng}&z=15&output=embed`;
        document.getElementById('detail-map-link').href = `https://www.google.com/maps/search/?api=1&query=${unit.location.lat},${unit.location.lng}`;

        refreshUnitDetail(unit);

        // Switch to detail view
        navItems.forEach(nav => nav.classList.remove('active')); // Deselect sidebar
        switchView('unit-detail-view');
    }

    function refreshUnitDetail(unit) {
        document.getElementById('detail-status-badge').innerText = unit.status;
        document.getElementById('detail-status-badge').className = 'status-badge ' + getBadgeClass(unit.status);

        // HR
        document.getElementById('detail-hr').innerText = unit.vitals.hr;
        document.getElementById('detail-hr').style.color = unit.vitals.hr < 50 || unit.vitals.hr > 120 ? '#ff2a55' : (unit.vitals.hr < 60 || unit.vitals.hr > 100 ? '#f59e0b' : '#fff');

        // SpO2
        document.getElementById('detail-spo2').innerText = unit.vitals.spo2;
        const totalDash = 251.2;
        const offset = totalDash - (totalDash * (unit.vitals.spo2 / 100));
        document.getElementById('circle-spo2').style.strokeDashoffset = offset;

        // Temp
        document.getElementById('detail-temp').innerText = unit.vitals.temp;
        let tempPct = Math.max(0, Math.min(100, ((parseFloat(unit.vitals.temp) - 35) / 7) * 100));
        document.getElementById('bar-temp').style.width = `${tempPct}%`;

        // Movement
        document.getElementById('detail-movement-main').innerText = unit.vitals.movement.toString().toUpperCase();
        let movementColor = '#10b981'; // Default Green (Moving/Active)
        let movementIcon = 'fa-person-walking';

        if (unit.vitals.movement === 'Fall Detected' || unit.vitals.movement === 'No Movement') {
            movementColor = '#ff2a55';
            movementIcon = 'fa-person-falling-burst';
        } else if (unit.vitals.movement === 'STILL' || unit.vitals.movement === 'Stationary' || unit.vitals.movement === 'Waiting' || unit.vitals.movement === 'Low movement') {
            movementColor = '#f59e0b'; // Amber (Still/Warning)
            movementIcon = 'fa-person';
        }

        const mIconEl = document.getElementById('movement-icon-large');
        mIconEl.className = `fa-solid ${movementIcon}`;
        mIconEl.style.color = movementColor;
        mIconEl.style.filter = `drop-shadow(0 0 10px ${movementColor})`;
        document.getElementById('detail-movement-main').style.color = movementColor;

        // Gas
        const gasVal = typeof unit.vitals.gas === 'number' ? unit.vitals.gas : 0;
        document.getElementById('detail-gas-main').innerText = unit.vitals.gas;
        let gasPct = 10;
        let gasColor = 'var(--status-green)';
        if (gasVal > 1000 || unit.vitals.gas === 'Slightly polluted') { gasPct = 50; gasColor = 'var(--status-yellow)'; }
        if (gasVal > 2000 || unit.vitals.gas === 'Hazardous') { gasPct = 100; gasColor = 'var(--status-red)'; }
        document.getElementById('detail-gas-main').style.color = gasColor;
        document.getElementById('bar-gas').style.width = `${gasPct}%`;
        document.getElementById('bar-gas').style.background = gasColor;
        document.getElementById('bar-gas').style.boxShadow = `0 0 10px ${gasColor}`;

        // Acceleration
        if (unit.vitals.accel !== undefined) {
            document.getElementById('detail-accel').innerText = unit.vitals.accel;
            let accelPct = Math.min(100, (parseFloat(unit.vitals.accel) / 20) * 100);
            document.getElementById('bar-accel').style.width = `${accelPct}%`;
        }

        checkForItemLevelAlerts(unit);
    }

    function checkForItemLevelAlerts(unit) {
        // Reset borders
        document.querySelectorAll('.vital-panel').forEach(c => c.style.borderColor = 'rgba(59, 130, 246, 0.2)');

        if (unit.status === 'critical') {
            if (unit.vitals.hr < 50 || unit.vitals.hr > 120) document.getElementById('panel-hr').style.borderColor = '#ff2a55';
            const t = parseFloat(unit.vitals.temp);
            if (t < 36.0 || t > 38.5) document.getElementById('panel-temp').style.borderColor = '#ff2a55';
            if (unit.vitals.movement === 'Fall Detected' || unit.vitals.movement === 'No Movement') document.getElementById('panel-movement').style.borderColor = '#ff2a55';
            if (unit.vitals.gas > 2000 || unit.vitals.gas === 'Hazardous') document.getElementById('panel-gas').style.borderColor = '#ff2a55';
        }
    }

    // --- Helpers ---
    function getHrColorClass(hr) {
        if (hr < 50 || hr > 120) return 'red';
        if (hr < 60 || hr > 100) return 'yellow';
        return 'green';
    }
    function getSpO2ColorClass(spo2) {
        if (spo2 < 90) return 'red';
        if (spo2 < 95) return 'yellow';
        return 'green';
    }
    function getTempColorClass(temp) {
        const t = parseFloat(temp);
        if (t < 36.0 || t > 38.5) return 'red';
        if (t > 37.5) return 'yellow';
        return 'green';
    }
    function getGasColorClass(gas) {
        if (gas === 'Safe air') return 'green';
        if (gas === 'Slightly polluted') return 'yellow';
        if (gas === 'Hazardous') return 'red';
        const gVal = typeof gas === 'number' ? gas : parseFloat(gas) || 0;
        if (gVal > 2000) return 'red';
        if (gVal > 1000) return 'yellow';
        return 'green';
    }
    function getBadgeClass(status) {
        if (status === 'normal') return 'bg-green';
        if (status === 'warning') return 'bg-yellow';
        return 'bg-red';
    }
    function getColorByStatusClass(str) {
        if (str === 'red') return 'var(--status-red)';
        if (str === 'yellow') return 'var(--status-yellow)';
        return 'var(--status-green)';
    }

    // --- Alerts System ---
    function calculateAlerts() {
        // Disabled per user request: Stop vital alerts from popping up.
        /*
        if (!state.isAuthenticated) return;
        state.units.forEach(unit => {
            if (unit.status === 'critical') {
                if (unit.vitals.hr < 50) showNotification(`${unit.name}: Low Heart Rate Detected`, 'critical');
                if (unit.vitals.movement === 'Fall Detected') showNotification(`${unit.name}: Fall Detected!`, 'critical');
                if (unit.vitals.gas > 1000 || (typeof unit.vitals.gas === 'string' && unit.vitals.gas !== 'Safe air')) showNotification(`${unit.name}: Harmful Gas Detected!`, 'critical');
                if (unit.vitals.spo2 < 90) showNotification(`${unit.name}: Low Oxygen Levels!`, 'critical');
            }
        });
        */
    }

    function showNotification(msg, type = 'info') {
        const container = document.getElementById('notification-container');
        const alertBox = document.createElement('div');
        alertBox.className = 'notification';

        let icon = 'fa-info-circle';
        if (type === 'critical') icon = 'fa-triangle-exclamation';
        if (type === 'success') icon = 'fa-check-circle';

        alertBox.innerHTML = `
            <i class="fa-solid ${icon} fa-lg"></i>
            <div>${msg}</div>
        `;
        container.appendChild(alertBox);

        // Remove after 5 seconds
        setTimeout(() => {
            alertBox.style.opacity = '0';
            setTimeout(() => {
                if (container.contains(alertBox)) container.removeChild(alertBox);
            }, 300);
        }, 5000);
    }

    // --- Realtime Simulation ---
    function startClock() {
        setInterval(() => {
            const now = new Date();
            liveDatetime.innerText = now.toLocaleString();
        }, 1000);

        // Simulate data updates every 10 seconds for all units EXCEPT UN-001
        setInterval(() => {
            if (state.isAuthenticated) {
                // slightly tweak hr values for realism for other units
                state.units.forEach(u => {
                    if (u.id !== 'UN-001') {
                        const diff = Math.floor(Math.random() * 5) - 2; // -2 to +2
                        u.vitals.hr = Math.max(30, Math.min(200, u.vitals.hr + diff));
                        u.status = calculateUnitStatus(u.vitals);
                        u.lastUpdated = new Date().toLocaleTimeString();
                    }
                });

                // If viewing dashboard or units-view or alerts-view, re-render safely
                if (state.activeView === 'dashboard-view' || state.activeView === 'units-view' || state.activeView === 'alerts-view') {
                    updateDashboardLiveValues();
                } else if (state.activeView === 'unit-detail-view' && state.selectedUnitId) {
                    const activeU = state.units.find(u => u.id === state.selectedUnitId);
                    if (activeU) refreshUnitDetail(activeU);
                }
            }
        }, 10000);

        // Fetch Unit 1 Ubidots data every 1 second for "Super Fast" performance
        setInterval(() => {
            fetchUnit1FromUbidots();
        }, 2000); // 2 second delay as requested
        
        // Initial fetch
        fetchUnit1FromUbidots();

    }

    function updateDashboardLiveValues() {
        // Quick DOM traversal to update HR without recreating elements
        // This is a minimal update to simulate real-time ticks
        state.units.forEach(unit => {
            // Find specific card
            // Due to our simple structure, it's easier to just re-render to keep colors in sync for this demo app.
        });
        renderDashboard(); // We'll just re-render for simplicity in this demo.
    }

    function setupEventListeners() { 
        const hoverSound = document.getElementById('sfx-hover');
        const clickSound = document.getElementById('sfx-click');

        if (hoverSound) hoverSound.volume = 0.1;
        if (clickSound) clickSound.volume = 0.2;

        const playHover = () => {
            if (hoverSound && state.isAuthenticated) {
                hoverSound.currentTime = 0;
                hoverSound.play().catch(e => {});
            }
        };

        const playClick = () => {
            if (clickSound) {
                clickSound.currentTime = 0;
                clickSound.play().catch(e => {});
            }
        };

        // Delegate mouseover for interactive elements
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest('.unit-card') || e.target.closest('.nav-item') || e.target.closest('.btn') || e.target.closest('.filter-btn')) {
                playHover();
            }
        });

        // Delegate click
        document.addEventListener('click', (e) => {
            if (e.target.closest('.unit-card') || e.target.closest('.nav-item') || e.target.closest('.btn') || e.target.closest('.filter-btn')) {
                playClick();
            }
        });
    }

});

