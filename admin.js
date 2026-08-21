import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Ваша конфігурація Firebase
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

// Ініціалізація
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Перемикання вкладок
window.switchTab = (tabName, event) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    if (event && event.target) {
        event.target.classList.add('active');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    loadLicenses();
    loadSiteSettings();
    
    document.getElementById('createLicenseForm').addEventListener('submit', handleCreateLicense);
    document.getElementById('refreshKeysBtn').addEventListener('click', loadLicenses);
    document.getElementById('maintenanceToggle').addEventListener('change', toggleMaintenance);
    document.getElementById('siteAnnouncementForm').addEventListener('submit', saveSiteAnnouncement);
});

// 1. Управління ключами (DRM)
async function loadLicenses() {
    const tbody = document.getElementById('licensesTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Завантаження даних з БД...</td></tr>';

    try {
        const snapshot = await get(ref(db, 'licenses'));
        if (!snapshot.exists()) {
            tbody.innerHTML = '<tr><td colspan="7">Ключів немає. Створіть перший вище!</td></tr>';
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
                    <td><code>${item.password}</code></td>
                    <td><small>${item.validFrom} — ${item.validTo}</small></td>
                    <td>${item.active ? '<span style="color:green;font-weight:bold;">Активний</span>' : '<span style="color:red;font-weight:bold;">Заблоковано</span>'}</td>
                    <td>${item.boundDeviceId ? `<span style="color:blue;font-size:0.75rem;">${item.boundDeviceId}</span>` : '<i>Вільний</i>'}</td>
                    <td style="display:flex; gap:4px;">
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
        tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Помилка доступу до БД. Перевірте Rules у Firebase Console.</td></tr>`;
    }
}

async function handleCreateLicense(e) {
    e.preventDefault();
    const key = document.getElementById('licKey').value.trim().toUpperCase();
    
    try {
        await set(ref(db, `licenses/${key}`), {
            password: document.getElementById('licPass').value.trim(),
            owner: document.getElementById('licOwner').value.trim(),
            validFrom: document.getElementById('licValidFrom').value,
            validTo: document.getElementById('licValidTo').value,
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

window.toggleActive = async (key, newState) => { await update(ref(db, `licenses/${key}`), { active: newState }); loadLicenses(); };
window.resetHwid = async (key) => { if (confirm("Скинути прив'язку пристрою?")) { await update(ref(db, `licenses/${key}`), { boundDeviceId: null }); loadLicenses(); }};
window.deleteKey = async (key) => { if (confirm("Видалити ключ з бази?")) { await remove(ref(db, `licenses/${key}`)); loadLicenses(); }};

// 2. Налаштування сайту
async function loadSiteSettings() {
    try {
        const snap = await get(ref(db, 'settings'));
        if (snap.exists()) {
            const settings = snap.val();
            document.getElementById('maintenanceToggle').checked = settings.maintenance || false;
            document.getElementById('siteTitleInput').value = settings.title || '';
            document.getElementById('siteNoticeInput').value = settings.notice || '';
        }
    } catch (e) { console.error("Error loading settings:", e); }
}

async function toggleMaintenance(e) {
    await update(ref(db, 'settings'), { maintenance: e.target.checked });
    alert(e.target.checked ? "🚨 Режим обслуговування УВІМКНЕНО!" : "✅ Режим обслуговування ВИМКНЕНО!");
}

async function saveSiteAnnouncement(e) {
    e.preventDefault();
    await update(ref(db, 'settings'), {
        title: document.getElementById('siteTitleInput').value,
        notice: document.getElementById('siteNoticeInput').value
    });
    alert("✅ Налаштування сайту збережено!");
}

// 3. Статистика
function updateStats(total, active, bound) {
    document.getElementById('statTotalKeys').innerText = total;
    document.getElementById('statActiveKeys').innerText = active;
    document.getElementById('statBoundDevices').innerText = bound;
}
