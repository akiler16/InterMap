import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ==========================================
// 1. КОНФІГУРАЦІЯ ТА ІНІЦІАЛІЗАЦІЯ FIREBASE
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyBZ28ZGCSTtb659rpmp0mgf_hcv1AVscFQ",
    authDomain: "intermap-app.firebaseapp.com",
    databaseURL: "https://intermap-app-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "intermap-app",
    storageBucket: "intermap-app.firebasestorage.app",
    messagingSenderId: "869707502446",
    appId: "1:869707502446:web:9cd7b1cab1c74f5e79e77f",
    measurementId: "G-QB0SF133NB"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 2. ГЛОБАЛЬНІ ФУНКЦІЇ (ПЕРЕМИКАННЯ ВКЛАДОК ТА ДІЇ з HTML)
// ==========================================

window.switchTab = (tabName, event) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');
    
    if (event && event.target) {
        event.target.classList.add('active');
    }
};

window.toggleActive = async (key, newState) => {
    try {
        await update(ref(db, `licenses/${key}`), { active: newState });
        loadLicenses();
    } catch (err) {
        alert("Помилка зміни стану: " + err.message);
    }
};

window.resetHwid = async (key) => {
    if (confirm(`Скинути прив'язку пристрою (HWID) для ключа ${key}?`)) {
        try {
            await update(ref(db, `licenses/${key}`), { boundDeviceId: null });
            loadLicenses();
        } catch (err) {
            alert("Помилка скидання HWID: " + err.message);
        }
    }
};

window.deleteKey = async (key) => {
    if (confirm(`Ви дійсно бажаєте безповоротно видалити ключ "${key}"?`)) {
        try {
            await remove(ref(db, `licenses/${key}`));
            loadLicenses();
        } catch (err) {
            alert("Помилка видалення ключа: " + err.message);
        }
    }
};

window.generateLicenseKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'MAP-';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const keyInput = document.getElementById('licKey');
    if (keyInput) keyInput.value = result;
};

// ==========================================
// 3. СЛУХАЧІ ПОДІЙ СТОРІНКИ
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    loadLicenses();
    loadSiteSettings();
    
    const createForm = document.getElementById('createLicenseForm');
    if (createForm) createForm.addEventListener('submit', handleCreateLicense);

    const refreshBtn = document.getElementById('refreshKeysBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadLicenses);

    const maintenanceToggle = document.getElementById('maintenanceToggle');
    if (maintenanceToggle) maintenanceToggle.addEventListener('change', toggleMaintenance);

    const announcementForm = document.getElementById('siteAnnouncementForm');
    if (announcementForm) announcementForm.addEventListener('submit', saveSiteAnnouncement);
});

// ==========================================
// 4. УПРАВЛІННЯ ЛІЦЕНЗІЯМИ (DRM)
// ==========================================

async function loadLicenses() {
    const tbody = document.getElementById('licensesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading" style="text-align:center;">Завантаження даних з БД...</td></tr>';

    try {
        const snapshot = await get(ref(db, 'licenses'));
        if (!snapshot.exists()) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Ключів немає. Створіть перший вище!</td></tr>';
            updateStats(0, 0, 0);
            return;
        }

        const data = snapshot.val();
        let total = 0, active = 0, bound = 0;

        tbody.innerHTML = Object.keys(data).map(key => {
            const item = data[key];
            total++;
            if (item.active) active++;
            if (item.boundDeviceId) bound++;

            return `
                <tr>
                    <td><b>${key}</b></td>
                    <td>${item.owner || '-'}</td>
                    <td><code>${item.password || '-'}</code></td>
                    <td><small>${item.validFrom || '-'} — ${item.validTo || '-'}</small></td>
                    <td>${item.active ? '<span style="color:green;font-weight:bold;">Активний</span>' : '<span style="color:red;font-weight:bold;">Заблоковано</span>'}</td>
                    <td>${item.boundDeviceId ? `<span style="color:blue;font-size:0.75rem;">${item.boundDeviceId}</span>` : '<i>Вільний</i>'}</td>
                    <td style="display:flex; gap:4px; justify-content:center;">
                        <button onclick="toggleActive('${key}', ${!item.active})" class="btn warning-btn">${item.active ? 'Блок' : 'Розблок'}</button>
                        ${item.boundDeviceId ? `<button onclick="resetHwid('${key}')" class="btn secondary-btn" style="font-size:0.75rem;">Скинути HWID</button>` : ''}
                        <button onclick="deleteKey('${key}')" class="btn danger-btn">Видалити</button>
                    </td>
                </tr>
            `;
        }).join('');

        updateStats(total, active, bound);
    } catch (e) {
        console.error("Firebase Read Error:", e);
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Помилка доступу до БД. Перевірте Rules у Firebase Console.</td></tr>`;
    }
}

async function handleCreateLicense(e) {
    e.preventDefault();
    const keyInput = document.getElementById('licKey');
    const passInput = document.getElementById('licPass');
    const ownerInput = document.getElementById('licOwner');
    const validFromInput = document.getElementById('licValidFrom');
    const validToInput = document.getElementById('licValidTo');

    if (!keyInput || !passInput) return;

    const key = keyInput.value.trim().toUpperCase();
    if (!key) {
        alert("Введіть або згенеруйте ключ!");
        return;
    }
    
    try {
        await set(ref(db, `licenses/${key}`), {
            password: passInput.value.trim(),
            owner: ownerInput ? ownerInput.value.trim() : '',
            validFrom: validFromInput ? validFromInput.value : '',
            validTo: validToInput ? validToInput.value : '',
            active: true,
            boundDeviceId: null,
            createdAt: new Date().toISOString()
        });
        
        alert(`✅ Ключ ${key} успішно додано в базу!`);
        document.getElementById('createLicenseForm').reset();
        loadLicenses();
    } catch (err) {
        alert("Помилка запису в базу: " + err.message);
    }
}

// ==========================================
// 5. НАЛАШТУВАННЯ САЙТУ
// ==========================================

async function loadSiteSettings() {
    try {
        const snap = await get(ref(db, 'settings'));
        if (snap.exists()) {
            const settings = snap.val();
            const maintToggle = document.getElementById('maintenanceToggle');
            const titleInput = document.getElementById('siteTitleInput');
            const noticeInput = document.getElementById('siteNoticeInput');

            if (maintToggle) maintToggle.checked = settings.maintenance || false;
            if (titleInput) titleInput.value = settings.title || '';
            if (noticeInput) noticeInput.value = settings.notice || '';
        }
    } catch (e) { 
        console.error("Error loading settings:", e); 
    }
}

async function toggleMaintenance(e) {
    try {
        await update(ref(db, 'settings'), { maintenance: e.target.checked });
        alert(e.target.checked ? "🚨 Режим обслуговування УВІМКНЕНО!" : "✅ Режим обслуговування ВИМКНЕНО!");
    } catch (err) {
        alert("Помилка оновлення стану обслуговування: " + err.message);
    }
}

async function saveSiteAnnouncement(e) {
    e.preventDefault();
    const titleInput = document.getElementById('siteTitleInput');
    const noticeInput = document.getElementById('siteNoticeInput');

    try {
        await update(ref(db, 'settings'), {
            title: titleInput ? titleInput.value : '',
            notice: noticeInput ? noticeInput.value : ''
        });
        alert("✅ Налаштування сайту збережено!");
    } catch (err) {
        alert("Помилка збереження оголошення: " + err.message);
    }
}

// ==========================================
// 6. СТАТИСТИКА
// ==========================================

function updateStats(total, active, bound) {
    const totalEl = document.getElementById('statTotalKeys');
    const activeEl = document.getElementById('statActiveKeys');
    const boundEl = document.getElementById('statBoundDevices');

    if (totalEl) totalEl.innerText = total;
    if (activeEl) activeEl.innerText = active;
    if (boundEl) boundEl.innerText = bound;
}
