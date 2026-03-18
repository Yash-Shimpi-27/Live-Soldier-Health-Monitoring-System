document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginForm = document.getElementById('login-form');
    const loginScreen = document.getElementById('login-screen');
    const dashScreen = document.getElementById('dashboard-screen');
    const logoutBtn = document.getElementById('logout-btn');
    const errorMsg = document.getElementById('login-error');

    // Data Elements
    const valHr = document.getElementById('val-hr');
    const valSpo2 = document.getElementById('val-spo2');
    const valTemp = document.getElementById('val-temp');
    const spo2Ring = document.getElementById('spo2-ring');
    const tempFill = document.getElementById('temp-fill');
    const valLat = document.getElementById('val-lat');
    const valLng = document.getElementById('val-lng');
    const valMovement = document.getElementById('val-movement');

    // Canvas ECG
    const canvas = document.getElementById('ecgChart');
    const ctx = canvas.getContext('2d');
    let ecgData = [];
    let ecgPos = 0;
    
    // Resize Canvas
    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        ctx.strokeStyle = '#ff003c';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    window.addEventListener('resize', resizeCanvas);
    
    // Init state
    let baseHr = 78;
    let baseSpo2 = 98;
    let baseTemp = 36.5;
    let lat = 34.0522;
    let lng = -118.2437;
    
    let simInterval = null;
    let ecgInterval = null;

    // Login Logic
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;

        // Mock Auth
        if(user && pass) {
            loginScreen.classList.remove('active');
            dashScreen.classList.add('active');
            resizeCanvas();
            startSimulation();
        } else {
            errorMsg.textContent = "INVALID CREDENTIALS";
        }
    });

    logoutBtn.addEventListener('click', () => {
        dashScreen.classList.remove('active');
        loginScreen.classList.add('active');
        stopSimulation();
        loginForm.reset();
        errorMsg.textContent = "";
    });

    // Ring circumference
    const circle = spo2Ring;
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    function setProgress(percent) {
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }

    function drawECG() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        
        // Generate line
        let x = 0;
        const step = canvas.width / 50;
        
        for(let i=0; i<50; i++) {
            let y = canvas.height / 2;
            
            // Add heartbeat spikes
            if (i % 15 === (ecgPos % 15)) {
                y -= 30; // Peak up
            } else if (i % 15 === ((ecgPos + 1) % 15)) {
                y += 20; // Dip down
            } else {
                // small noise
                y += (Math.random() * 6 - 3);
            }
            
            if(i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            x += step;
        }
        ctx.stroke();
        ecgPos++;
    }

    function simulateData() {
        // Heart Rate fluctuation
        let hrVar = Math.floor(Math.random() * 5) - 2;
        let pHR = baseHr + hrVar;
        valHr.textContent = pHR;
        if(pHR > 120 || pHR < 50) valHr.style.color = '#ff003c';
        else valHr.style.color = '#e2e8f0';

        // SpO2 fluctuation
        let sVar = Math.random() > 0.8 ? -1 : 0;
        if(baseSpo2 < 95 && Math.random() > 0.5) sVar = 1;
        baseSpo2 += sVar;
        if(baseSpo2 > 100) baseSpo2 = 100;
        if(baseSpo2 < 90) baseSpo2 = 90;
        valSpo2.textContent = baseSpo2;
        setProgress(baseSpo2);
        
        let spo2Color = '#00f3ff';
        if(baseSpo2 < 95) spo2Color = '#ffaa00';
        if(baseSpo2 < 92) spo2Color = '#ff003c';
        circle.style.stroke = spo2Color;

        // Temp
        let tVar = (Math.random() * 0.2 - 0.1).toFixed(1);
        baseTemp = Math.max(35.0, Math.min(39.0, baseTemp + parseFloat(tVar)));
        valTemp.textContent = baseTemp.toFixed(1);
        // calc percentage 35 to 40
        let tPercent = ((baseTemp - 35) / 5) * 100;
        tempFill.style.width = tPercent + '%';

        // Location
        lat += (Math.random() * 0.0002 - 0.0001);
        lng += (Math.random() * 0.0002 - 0.0001);
        valLat.textContent = `LAT: ${Math.abs(lat).toFixed(4)} ${lat >= 0 ? 'N' : 'S'}`;
        valLng.textContent = `LNG: ${Math.abs(lng).toFixed(4)} ${lng >= 0 ? 'W' : 'E'}`;

        // Movement
        if(Math.random() > 0.95) {
            const states = [
                { text: 'PATROL', class: 'moving' },
                { text: 'STATIONARY', class: 'stationary' },
                { text: 'COMBAT/EVASION', class: 'combat' }
            ];
            const ts = states[Math.floor(Math.random() * states.length)];
            valMovement.textContent = ts.text;
            valMovement.className = `status-badge ${ts.class}`;
        }
    }

    function startSimulation() {
        setProgress(baseSpo2);
        simInterval = setInterval(simulateData, 1000);
        ecgInterval = setInterval(drawECG, 100);
    }

    function stopSimulation() {
        clearInterval(simInterval);
        clearInterval(ecgInterval);
    }
});
