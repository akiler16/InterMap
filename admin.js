import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
// 2. ГЛОБАЛЬНІ ФУНКЦІЇ (НАВІГАЦІЯ ТА ДІЇ)
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

// Видалення тесту з історії
window.deleteTest = async (testId) => {
    if (confirm(`Ви дійсно бажаєте безповоротно видалити тест з ID: ${testId}?`)) {
        try {
            await remove(ref(db, `tests/${testId}`));
            alert("✅ Тест успішно видалено!");
        } catch (err) {
            alert("Помилка видалення тесту: " + err.message);
        }
    }
};

// Зміна балів завдання у реальному часі
window.updateTaskPoints = async (testId, taskIndex, field, value) => {
    const numVal = parseInt(value, 10);
    if (isNaN(numVal) || numVal < 0) return;

    try {
        await update(ref(db, `tests/${testId}/tasks/${taskIndex}`), {
            [field]: numVal
        });
    } catch (err) {
        alert("Помилка оновлення балів: " + err.message);
    }
};

// ==========================================
// 3. ІНІЦІАЛІЗАЦІЯ ТА СЛУХАЧІ СТОРІНКИ
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    listenToTests();
    loadSecuritySettings();
    loadSiteSettings();

    // Форма зміни паролів
    const securityForm = document.getElementById('securityForm');
    if (securityForm) securityForm.addEventListener('submit', handlePasswordChange);

    // Слухачі тумблерів доступу
    document.getElementById('maintenanceToggle')?.addEventListener('change', (e) => toggleAccess('maintenance', e.target.checked));
    document.getElementById('blockStudentsToggle')?.addEventListener('change', (e) => toggleAccess('blockStudents', e.target.checked));
    document.getElementById('blockTeacherToggle')?.addEventListener('change', (e) => toggleAccess('blockTeacher', e.target.checked));

    // Оголошення сайту
    const announcementForm = document.getElementById('siteAnnouncementForm');
    if (announcementForm) announcementForm.addEventListener('submit', saveSiteAnnouncement);
});

// ==========================================
// 4. КЕРУВАННЯ ПАРОЛЯМИ (SECURITY)
// ==========================================

async function loadSecuritySettings() {
    try {
        const snap = await get(ref(db, 'auth'));
        if (snap.exists()) {
            const authData = snap.val();
            const teacherPassInput = document.getElementById('teacherPasswordInput');
            const adminPassInput = document.getElementById('adminPasswordInput');

            if (teacherPassInput && authData.teacherPassword) {
                teacherPassInput.value = authData.teacherPassword;
            }
            if (adminPassInput && authData.adminPassword) {
                adminPassInput.value = authData.adminPassword;
            }
        }
    } catch (e) {
        console.error("Помилка завантаження паролів:", e);
    }
}

async function handlePasswordChange(e) {
    e.preventDefault();
    const teacherPass = document.getElementById('teacherPasswordInput')?.value.trim();
    const adminPass = document.getElementById('adminPasswordInput')?.value.trim();

    if (!teacherPass || !adminPass) {
        alert("Заповніть обидва поля паролів!");
        return;
    }

    try {
        await update(ref(db, 'auth'), {
            teacherPassword: teacherPass,
            adminPassword: adminPass,
            updatedAt: new Date().toISOString()
        });
        alert("✅ Паролі входу для вчителя та адмінки успішно оновлено в БД!");
    } catch (err) {
        alert("Помилка збереження паролів: " + err.message);
    }
}

// ==========================================
// 5. КОНТРОЛЬ ТЕСТІВ ТА REALTIME-АНАЛІТИКА
// ==========================================

function listenToTests() {
    const testsContainer = document.getElementById('testsHistoryList');
    
    onValue(ref(db, 'tests'), (snapshot) => {
        let totalTests = 0;
        let totalTasks = 0;

        if (!snapshot.exists()) {
            if (testsContainer) {
                testsContainer.innerHTML = '<p class="empty-text" style="text-align:center; padding:1rem;">Історія тестів порожня.</p>';
            }
            updateStats(0, 0);
            return;
        }

        const data = snapshot.val();
        let htmlContent = '';

        Object.keys(data).reverse().forEach(testId => {
            const test = data[testId];
            totalTests++;
            
            const tasks = test.tasks || [];
            totalTasks += tasks.length;

            const dateStr = test.createdAt ? new Date(test.createdAt).toLocaleString('uk-UA') : 'Невідомо';

            htmlContent += `
                <div class="card" style="margin-bottom: 1.5rem; border-left: 4px solid #2563eb;">
                    <div class="header-flex">
                        <div>
                            <h3 style="margin:0;">${test.title || 'Без назви'}</h3>
                            <small style="color:#64748b;">ID: <code>${testId}</code> | Створено: ${dateStr}</small>
                        </div>
                        <button onclick="deleteTest('${testId}')" class="btn danger-btn">Видалити тест</button>
                    </div>

                    ${test.teacherChatId ? `<p style="font-size:0.85rem; margin-top:5px;"><b>Telegram Chat ID:</b> ${test.teacherChatId}</p>` : ''}

                    <h4 style="margin-top: 1rem; font-size: 0.95rem; color:#475569;">Завдання (${tasks.length}):</h4>
                    <div class="table-wrapper" style="margin-top: 0.5rem;">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Питання</th>
                                    <th>Тип</th>
                                    <th>Бали (+)</th>
                                    <th>Штраф (-)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tasks.map((task, idx) => `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td>${task.text || '-'}</td>
                                        <td><span class="badge-code" style="background:#e2e8f0; color:#334155; padding:2px 6px; border-radius:4px;">${task.type || 'marker'}</span></td>
                                        <td>
                                            <input type="number" value="${task.pointsPlus ?? 5}" min="1" style="width: 70px; padding: 4px;"
                                                   onchange="updateTaskPoints('${testId}', ${idx}, 'pointsPlus', this.value)">
                                        </td>
                                        <td>
                                            <input type="number" value="${task.pointsMinus ?? 2}" min="0" style="width: 70px; padding: 4px;"
                                                   onchange="updateTaskPoints('${testId}', ${idx}, 'pointsMinus', this.value)">
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        if (testsContainer) testsContainer.innerHTML = htmlContent;
        updateStats(totalTests, totalTasks);
    });
}

// ==========================================
// 6. КЕРУВАННЯ ОБМЕЖЕННЯМИ ТА НАЛАШТУВАННЯМИ
// ==========================================

async function loadSiteSettings() {
    try {
        const snap = await get(ref(db, 'settings'));
        if (snap.exists()) {
            const settings = snap.val();
            
            const maintToggle = document.getElementById('maintenanceToggle');
            const blockStudentsToggle = document.getElementById('blockStudentsToggle');
            const blockTeacherToggle = document.getElementById('blockTeacherToggle');
            
            const titleInput = document.getElementById('siteTitleInput');
            const noticeInput = document.getElementById('siteNoticeInput');

            if (maintToggle) maintToggle.checked = settings.maintenance || false;
            if (blockStudentsToggle) blockStudentsToggle.checked = settings.blockStudents || false;
            if (blockTeacherToggle) blockTeacherToggle.checked = settings.blockTeacher || false;
            
            if (titleInput) titleInput.value = settings.title || '';
            if (noticeInput) noticeInput.value = settings.notice || '';
        }
    } catch (e) { 
        console.error("Помилка завантаження налаштувань:", e); 
    }
}

async function toggleAccess(field, value) {
    try {
        await update(ref(db, 'settings'), { [field]: value });
        alert(`Зміни збережено: ${field} = ${value}`);
    } catch (err) {
        alert("Помилка оновлення прав доступу: " + err.message);
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
// 7. ОНОВЛЕННЯ СТАТИСТИКИ
// ==========================================

function updateStats(testsCount, tasksCount) {
    const testsEl = document.getElementById('statTotalTests');
    const tasksEl = document.getElementById('statTotalTasks');

    if (testsEl) testsEl.innerText = testsCount;
    if (tasksEl) tasksEl.innerText = tasksCount;
}
