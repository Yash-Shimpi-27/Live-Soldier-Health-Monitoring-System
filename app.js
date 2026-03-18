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
    const generateMockData = () => {
        const units = [];
        const statuses = ['normal', 'normal', 'normal', 'warning', 'critical'];
        const movements = ['Active', 'Stationary', 'Running', 'Fall Detected', 'No Movement'];
        
        for(let i=1; i<=24; i++) {
            const id = `UN-${i.toString().padStart(3, '0')}`;
            // Randomly assign a status to mock reality
            const statusIdx = Math.floor(Math.random() * statuses.length);
            
            // Generate values based on assigned status
            let status = statuses[statusIdx];
            let hr = Math.floor(Math.random() * (100 - 60) + 60);
            let spo2 = Math.floor(Math.random() * (100 - 95) + 95);
            let temp = (Math.random() * (37.5 - 36.5) + 36.5).toFixed(1);
            let gas = 'Safe';
            let movement = movements[Math.floor(Math.random() * 3)]; // Active, Stationary, Running

            if(status === 'critical') {
                const criticalType = Math.floor(Math.random() * 4);
                if(criticalType === 0) hr = Math.floor(Math.random() * 40 + 30); // Low HR
                if(criticalType === 1) spo2 = Math.floor(Math.random() * 10 + 80); // Low SpO2
                if(criticalType === 2) movement = 'Fall Detected';
                if(criticalType === 3) gas = 'Hazardous';
            } else if (status === 'warning') {
                hr = Math.floor(Math.random() * 20 + 100); // Elevated HR
                temp = (Math.random() * (39.0 - 37.6) + 37.6).toFixed(1); // Fever
            }

            units.push({
                id: id,
                name: `Active Unit ${i.toString().padStart(2, '0')}`,
                status: status, // normal, warning, critical
                lastUpdated: new Date().toLocaleTimeString(),
                vitals: {
                    hr: hr,
                    spo2: spo2,
                    temp: temp,
                    gas: gas,
                    movement: movement
                },
                location: {
                    lat: (Math.random() * 180 - 90).toFixed(6),
                    lng: (Math.random() * 360 - 180).toFixed(6)
                }
            });
        }
        return units;
    };

    state.units = generateMockData();

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
        calculateAlerts();
        renderDashboard();
    }

    // --- Authentication ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        
        // Dummy Check
        if(user && pass) {
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
            if(!targetId) return;

            // Update Nav UI
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Switch View
            switchView(targetId);
        });
    });

    backBtn.addEventListener('click', () => {
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
        
        filteredUnits.forEach(unit => {
            const card = document.createElement('div');
            card.className = `unit-card status-${unit.status}`;
            card.onclick = () => openUnitDetail(unit);
            
            card.innerHTML = `
                <div class="card-header">
                    <div>
                        <h3>${unit.name}</h3>
                        <span class="card-id">${unit.id}</span>
                    </div>
                    <div class="card-status-badge">${unit.status}</div>
                </div>
                <div class="card-body">
                    <div class="mini-vital pointer">
                        <i class="fa-solid fa-heart-pulse"></i>
                        <span class="${getHrColorClass(unit.vitals.hr)}">${unit.vitals.hr} <small class="unit">bpm</small></span>
                    </div>
                    <div class="mini-vital">
                        <i class="fa-solid fa-temperature-half"></i>
                        <span class="${getTempColorClass(unit.vitals.temp)}">${unit.vitals.temp} <small class="unit">°C</small></span>
                    </div>
                </div>
                <div class="card-time">
                    <i class="fa-regular fa-clock"></i> Updated: ${unit.lastUpdated}
                </div>
            `;
            unitsContainer.appendChild(card);
        });

        updateStats();
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
        
        // Populate Data
        document.getElementById('detail-unit-name').innerText = `${unit.name} (${unit.id})`;
        document.getElementById('detail-status-badge').innerText = unit.status;
        document.getElementById('detail-status-badge').className = 'status-badge ' + getBadgeClass(unit.status);

        // Vitals
        document.getElementById('detail-hr').innerText = unit.vitals.hr;
        document.getElementById('detail-hr').className = getHrColorClass(unit.vitals.hr);
        
        document.getElementById('detail-spo2').innerText = unit.vitals.spo2;
        document.getElementById('detail-spo2').className = getSpO2ColorClass(unit.vitals.spo2);
        document.getElementById('fill-spo2').style.width = `${unit.vitals.spo2}%`;
        document.getElementById('fill-spo2').style.backgroundColor = getColorByStatusClass(getSpO2ColorClass(unit.vitals.spo2));

        document.getElementById('detail-temp').innerText = unit.vitals.temp;
        document.getElementById('detail-temp').className = getTempColorClass(unit.vitals.temp);
        // map 35-42C to 0-100%
        let tempPct = Math.max(0, Math.min(100, ((parseFloat(unit.vitals.temp) - 35) / 7) * 100));
        document.getElementById('fill-temp').style.width = `${tempPct}%`;
        document.getElementById('fill-temp').style.backgroundColor = getColorByStatusClass(getTempColorClass(unit.vitals.temp));

        // Environment
        document.getElementById('detail-movement').innerText = unit.vitals.movement;
        if(unit.vitals.movement === 'Fall Detected' || unit.vitals.movement === 'No Movement') {
            document.getElementById('detail-movement').className = 'vital-value-text red';
        } else {
            document.getElementById('detail-movement').className = 'vital-value-text';
        }

        document.getElementById('detail-gas').innerText = unit.vitals.gas;
        if(unit.vitals.gas !== 'Safe') {
            document.getElementById('detail-gas').className = 'vital-value-text red';
            document.getElementById('fill-gas').style.width = '100%';
            document.getElementById('fill-gas').style.backgroundColor = 'var(--status-red)';
        } else {
            document.getElementById('detail-gas').className = 'vital-value-text';
            document.getElementById('fill-gas').style.width = '10%';
            document.getElementById('fill-gas').style.backgroundColor = 'var(--status-green)';
        }

        // GPS Tracker
        document.getElementById('detail-coords').innerText = `LAT: ${unit.location.lat}, LNG: ${unit.location.lng}`;
        document.getElementById('detail-map-link').href = `https://www.google.com/maps/search/?api=1&query=${unit.location.lat},${unit.location.lng}`;

        // Switch to detail view
        navItems.forEach(nav => nav.classList.remove('active')); // Deselect sidebar
        switchView('unit-detail-view');
        
        checkForItemLevelAlerts(unit);
    }

    function checkForItemLevelAlerts(unit) {
        // Highlighting entire cards if critical
        document.querySelectorAll('.vital-card').forEach(c => c.classList.remove('alert'));
        
        if (unit.status === 'critical') {
            if(unit.vitals.hr < 50 || unit.vitals.hr > 120) document.getElementById('card-heart-rate').classList.add('alert');
            if(unit.vitals.spo2 < 90) document.getElementById('card-spo2').classList.add('alert');
            if(unit.vitals.movement === 'Fall Detected') document.getElementById('card-movement').classList.add('alert');
            if(unit.vitals.gas !== 'Safe') document.getElementById('card-gas').classList.add('alert');
        }
    }

    // --- Helpers ---
    function getHrColorClass(hr) {
        if(hr < 50 || hr > 130) return 'red';
        if(hr < 60 || hr > 100) return 'yellow';
        return 'green';
    }
    function getSpO2ColorClass(spo2) {
        if(spo2 < 90) return 'red';
        if(spo2 < 95) return 'yellow';
        return 'green';
    }
    function getTempColorClass(temp) {
        if(temp < 36.0 || temp > 39.0) return 'red';
        if(temp > 37.5) return 'yellow';
        return 'green';
    }
    function getBadgeClass(status) {
        if(status === 'normal') return 'bg-green';
        if(status === 'warning') return 'bg-yellow';
        return 'bg-red';
    }
    function getColorByStatusClass(str) {
        if(str === 'red') return 'var(--status-red)';
        if(str === 'yellow') return 'var(--status-yellow)';
        return 'var(--status-green)';
    }

    // --- Alerts System ---
    function calculateAlerts() {
        state.units.forEach(unit => {
            if(unit.status === 'critical') {
                if(unit.vitals.hr < 50) showNotification(`${unit.name}: Low Heart Rate Detected`, 'critical');
                if(unit.vitals.movement === 'Fall Detected') showNotification(`${unit.name}: Fall Detected!`, 'critical');
                if(unit.vitals.gas !== 'Safe') showNotification(`${unit.name}: Harmful Gas Detected!`, 'critical');
                if(unit.vitals.spo2 < 90) showNotification(`${unit.name}: Low Oxygen Levels!`, 'critical');
            }
        });
    }

    function showNotification(msg, type = 'info') {
        const container = document.getElementById('notification-container');
        const alertBox = document.createElement('div');
        alertBox.className = 'notification';
        
        let icon = 'fa-info-circle';
        if(type === 'critical') icon = 'fa-triangle-exclamation';
        if(type === 'success') icon = 'fa-check-circle';
        
        alertBox.innerHTML = `
            <i class="fa-solid ${icon} fa-lg"></i>
            <div>${msg}</div>
        `;
        container.appendChild(alertBox);

        // Remove after 5 seconds
        setTimeout(() => {
            alertBox.style.opacity = '0';
            setTimeout(() => {
                if(container.contains(alertBox)) container.removeChild(alertBox);
            }, 300);
        }, 5000);
    }

    // --- Realtime Simulation ---
    function startClock() {
        setInterval(() => {
            const now = new Date();
            liveDatetime.innerText = now.toLocaleString();
        }, 1000);

        // Simulate data updates every 10 seconds
        setInterval(() => {
            if(state.isAuthenticated) {
                // slightly tweak hr values for realism
                state.units.forEach(u => {
                    const diff = Math.floor(Math.random() * 5) - 2; // -2 to +2
                    u.vitals.hr = Math.max(30, Math.min(200, u.vitals.hr + diff));
                    u.lastUpdated = new Date().toLocaleTimeString();
                });
                
                // If viewing dashboard, re-render safely (avoid jumping if user is reading)
                if(state.activeView === 'dashboard-view') {
                    // update just the values inside DOM to avoid tearing down cards completely
                    updateDashboardLiveValues();
                } else if(state.activeView === 'unit-detail-view' && state.selectedUnitId) {
                    const activeU = state.units.find(u => u.id === state.selectedUnitId);
                    if(activeU) openUnitDetail(activeU); // re-render detail
                }
            }
        }, 10000);
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

    function setupEventListeners() {}

});
