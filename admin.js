/**
 * ============================================================================
 * INTERMAP - ГОЛОВНИЙ СКРИПТ АДМІН-ПАНЕЛІ
 * ============================================================================
 * Версія: 2.5 (Розширена Enterprise версія)
 * Опис: Модульна архітектура керування тестами, результатами, безпекою та логами.
 * Використовує Firebase Realtime Database (v10 Modular API).
 * ============================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getDatabase, ref, get, set, update, remove, onValue, push, query, orderByChild, limitToLast 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ==========================================
// 1. КОНФІГУРАЦІЯ FIREBASE
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

// Глобальний стан додатку (Кеш)
const AppState = {
    tests: {},
    results: {},
    logs: {},
    settings: {},
    auth: {},
    banned: {
        students: {},
        teachers: {}
    },
    journalSortBy: 'date', // date, score, name
    journalSortDesc: true
};

// ==========================================
// 2. УТИЛІТИ ТА СИСТЕМА СПОВІЩЕНЬ (TOASTS)
// ==========================================

const Utils = {
    /**
     * Форматує дату у зручний український формат
     * @param {string|number} dateString - ISO рядок або timestamp
     * @returns {string} Відформатована дата
     */
    formatDate(dateString) {
        if (!dateString) return 'Невідомо';
        try {
            const options = { 
                year: 'numeric', month: 'short', day: 'numeric', 
                hour: '2-digit', minute: '2-digit', second: '2-digit' 
            };
            return new Date(dateString).toLocaleDateString('uk-UA', options);
        } catch (e) {
            return String(dateString);
        }
    },

    /**
     * Генерує унікальний ID для клонування або нових записів
     * @param {string} prefix - Префікс для ID
     * @returns {string} Унікальний рядок
     */
    generateId(prefix = 'ID') {
        return `${prefix}-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    },

    /**
     * Екранує HTML для запобігання XSS
     * @param {string} str - Рядок для екранування
     * @returns {string} Безпечний рядок
     */
    escapeHTML(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

/**
 * Вбудована система красивих сповіщень замість alert()
 */
const NotificationManager = {
    container: null,

    init() {
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 9999;
            display: flex; flex-direction: column; gap: 10px; pointer-events: none;
        `;
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 4000) {
        if (!this.container) this.init();

        const toast = document.createElement('div');
        const colors = {
            success: { bg: '#10b981', icon: '✅' },
            error: { bg: '#ef4444', icon: '🚨' },
            warning: { bg: '#f59e0b', icon: '⚠️' },
            info: { bg: '#3b82f6', icon: 'ℹ️' }
        };

        const theme = colors[type] || colors.info;

        toast.style.cssText = `
            background-color: ${theme.bg}; color: white; padding: 12px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: sans-serif; font-size: 0.95rem; font-weight: 500;
            display: flex; align-items: center; gap: 10px;
            transform: translateX(120%); opacity: 0; transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        `;

        toast.innerHTML = `<span>${theme.icon}</span> <span>${Utils.escapeHTML(message)}</span>`;
        this.container.appendChild(toast);

        // Анімація появи
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        // Видалення
        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

// ==========================================
// 3. СЕРВІС ЛОГУВАННЯ (AUDIT LOGGER)
// ==========================================

const Logger = {
    /**
     * Записує дію адміністратора у базу даних
     * @param {string} actionText - Текст дії
     * @param {string} level - Рівень важливості (info, warning, danger)
     */
    async log(actionText, level = 'info') {
        try {
            const newLogRef = push(ref(db, 'logs'));
            await set(newLogRef, {
                action: actionText,
                level: level,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            });
            console.log(`[AUDIT LOG]: ${actionText}`);
        } catch (e) {
            console.error("Критична помилка логування:", e);
        }
    },

    async clearAll() {
        if (!confirm("🚨 Ви впевнені, що хочете видалити всі системні логи?")) return;
        try {
            await remove(ref(db, 'logs'));
            NotificationManager.show("Системні логи успішно очищено.", "success");
            this.log("Адміністратор примусово очистив системні логи", "warning");
        } catch (err) {
            NotificationManager.show("Помилка очищення логів: " + err.message, "error");
        }
    },

    listen() {
        // Завантажуємо останні 100 логів для економії пам'яті
        const logsQuery = query(ref(db, 'logs'), limitToLast(100));
        onValue(logsQuery, (snapshot) => {
            const container = document.getElementById('auditLogsContainer');
            if (!container) return;

            if (!snapshot.exists()) {
                AppState.logs = {};
                container.innerHTML = '<p style="color:#64748b; padding: 10px;">Журнал подій порожній.</p>';
                return;
            }

            AppState.logs = snapshot.val();
            this.render();
        });
    },

    render() {
        const container = document.getElementById('auditLogsContainer');
        if (!container) return;

        const logs = AppState.logs;
        const keys = Object.keys(logs).reverse(); // Від новіших до старіших

        let html = '<ul style="list-style:none; padding:0; margin:0; font-size:0.85rem;">';
        keys.forEach(k => {
            const log = logs[k];
            const time = log.timestamp ? Utils.formatDate(log.timestamp) : 'Невідомо';
            
            // Кольори для різних рівнів логів
            let color = '#64748b'; // default info
            if (log.level === 'danger') color = '#ef4444';
            if (log.level === 'warning') color = '#f59e0b';

            html += `
                <li style="padding:10px; border-bottom:1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#94a3b8; font-size: 0.75rem;">[${time}]</span>
                        ${log.level !== 'info' ? `<span style="background:${color}; color:white; padding: 2px 6px; border-radius: 4px; font-size:0.7rem; text-transform:uppercase;">${log.level}</span>` : ''}
                    </div>
                    <span style="color: #334155; font-weight: 500;">${Utils.escapeHTML(log.action)}</span>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
    }
};

// ==========================================
// 4. СЕРВІС КЕРУВАННЯ ТЕСТАМИ
// ==========================================

const TestManager = {
    listen() {
        onValue(ref(db, 'tests'), (snapshot) => {
            const container = document.getElementById('testsHistoryList');
            
            if (!snapshot.exists()) {
                AppState.tests = {};
                if(container) container.innerHTML = '<div class="empty-state">Історія тестів порожня. Вчителі ще не створили жодного тесту.</div>';
                UIManager.updateStats();
                return;
            }

            AppState.tests = snapshot.val();
            this.render();
            UIManager.updateStats();
        });
    },

    render() {
        const container = document.getElementById('testsHistoryList');
        if (!container) return;

        const data = AppState.tests;
        let html = '';

        Object.keys(data).reverse().forEach(testId => {
            const test = data[testId];
            const tasks = test.tasks || [];
            const dateStr = test.createdAt ? Utils.formatDate(test.createdAt) : 'Невідомо';

            html += `
                <div class="card test-card" style="margin-bottom: 2rem; border-left: 5px solid #3b82f6; transition: all 0.2s;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap: wrap; gap: 15px;">
                        <div style="flex: 1; min-width: 250px;">
                            <h3 style="margin:0; font-size: 1.25rem; color: #1e293b;">${Utils.escapeHTML(test.title || 'Тест без назви')}</h3>
                            <div style="margin-top: 8px; font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; display: inline-block;">
                                ID: <b style="color: #2563eb;">${testId}</b>
                            </div>
                            <div style="color:#64748b; font-size: 0.85rem; margin-top: 5px;">📅 Створено: ${dateStr}</div>
                            ${test.teacherChatId ? `<div style="color:#64748b; font-size: 0.85rem; margin-top: 2px;">💬 TG Chat: ${Utils.escapeHTML(test.teacherChatId)}</div>` : ''}
                        </div>
                        <div style="display:flex; gap: 8px;">
                            <button onclick="window.TestManager.cloneTest('${testId}')" class="btn primary-btn" style="background-color: #8b5cf6;">📋 Клонувати</button>
                            <button onclick="window.TestManager.deleteTest('${testId}')" class="btn danger-btn">🗑️ Видалити</button>
                        </div>
                    </div>

                    <div style="margin-top: 1.5rem;">
                        <h4 style="margin-bottom: 10px; font-size: 1rem; color:#475569; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">
                            Завдання (${tasks.length} шт.) - <small>Редагування балів у реальному часі</small>
                        </h4>
                        
                        ${tasks.length === 0 ? '<p style="color:#94a3b8; font-style:italic;">У цьому тесті немає завдань.</p>' : `
                        <div class="table-wrapper" style="overflow-x: auto; background: white; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                                <thead style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                    <tr>
                                        <th style="padding: 10px 15px;">#</th>
                                        <th style="padding: 10px 15px;">Текст завдання</th>
                                        <th style="padding: 10px 15px;">Тип</th>
                                        <th style="padding: 10px 15px; text-align: center;">Правильно (+)</th>
                                        <th style="padding: 10px 15px; text-align: center;">Помилка (-)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tasks.map((t, idx) => `
                                        <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
                                            <td style="padding: 10px 15px; font-weight: bold; color: #64748b;">${idx + 1}</td>
                                            <td style="padding: 10px 15px;">${Utils.escapeHTML(t.text || '-')}</td>
                                            <td style="padding: 10px 15px;">
                                                <span style="background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:600; text-transform: uppercase;">
                                                    ${t.type || 'unknown'}
                                                </span>
                                            </td>
                                            <td style="padding: 10px 15px; text-align: center;">
                                                <input type="number" value="${t.pointsPlus ?? 2}" min="1" max="100" 
                                                       style="width: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; font-weight: bold; color: #10b981;"
                                                       onchange="window.TestManager.updatePoints('${testId}', ${idx}, 'pointsPlus', this.value)">
                                            </td>
                                            <td style="padding: 10px 15px; text-align: center;">
                                                <input type="number" value="${t.pointsMinus ?? 0}" min="0" max="100" 
                                                       style="width: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; font-weight: bold; color: #ef4444;"
                                                       onchange="window.TestManager.updatePoints('${testId}', ${idx}, 'pointsMinus', this.value)">
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        `}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    async deleteTest(testId) {
        if (!confirm(`🚨 Ви дійсно бажаєте безповоротно видалити тест ${testId}?\nУсі учні втратять доступ до нього.`)) return;
        
        try {
            await remove(ref(db, `tests/${testId}`));
            Logger.log(`Видалено тест ID: ${testId}`, "danger");
            NotificationManager.show("Тест успішно видалено", "success");
        } catch (err) {
            NotificationManager.show("Помилка видалення тесту: " + err.message, "error");
        }
    },

    async cloneTest(testId) {
        try {
            const originalTest = AppState.tests[testId];
            if (!originalTest) throw new Error("Тест не знайдено в кеші");

            const newCode = Utils.generateId('COPY');
            const clonedTest = JSON.parse(JSON.stringify(originalTest)); // Глибоке копіювання
            
            clonedTest.title = `${clonedTest.title || 'Тест'} (Копія)`;
            clonedTest.createdAt = new Date().toISOString();

            await set(ref(db, `tests/${newCode}`), clonedTest);
            Logger.log(`Клоновано тест ${testId} у новий ID: ${newCode}`);
            NotificationManager.show(`Тест клоновано! Новий код: ${newCode}`, "success");
        } catch (err) {
            NotificationManager.show("Помилка клонування: " + err.message, "error");
        }
    },

    async updatePoints(testId, taskIndex, field, value) {
        const numVal = parseInt(value, 10);
        if (isNaN(numVal) || numVal < 0) {
            NotificationManager.show("Некоректне значення балів!", "warning");
            return;
        }

        try {
            await update(ref(db, `tests/${testId}/tasks/${taskIndex}`), { [field]: numVal });
            Logger.log(`Змінено ${field === 'pointsPlus' ? 'плюсовий' : 'мінусовий'} бал для тесту ${testId} (Завдання #${taskIndex + 1}) на ${numVal}`);
            NotificationManager.show("Бали миттєво оновлено!", "success", 2000);
        } catch (err) {
            NotificationManager.show("Помилка оновлення балів: " + err.message, "error");
        }
    }
};

// ==========================================
// 5. СЕРВІС ЖУРНАЛУ ТА РЕЗУЛЬТАТІВ УЧНІВ
// ==========================================

const JournalManager = {
    listen() {
        onValue(ref(db, 'results'), (snapshot) => {
            const container = document.getElementById('studentJournalContainer');
            
            if (!snapshot.exists()) {
                AppState.results = {};
                if(container) container.innerHTML = '<div class="empty-state">Журнал порожній. Ще немає жодних результатів.</div>';
                UIManager.updateStats();
                return;
            }

            AppState.results = snapshot.val();
            this.render();
            UIManager.updateStats();
        });
    },

    render() {
        const container = document.getElementById('studentJournalContainer');
        if (!container) return;

        const searchQuery = (document.getElementById('journalSearchInput')?.value || '').toLowerCase().trim();
        let resultKeys = Object.keys(AppState.results);

        // Фільтрація (Пошук)
        if (searchQuery) {
            resultKeys = resultKeys.filter(id => {
                const item = AppState.results[id];
                const name = (item.studentName || '').toLowerCase();
                const cls = (item.studentClass || '').toLowerCase();
                const code = (item.testCode || '').toLowerCase();
                return name.includes(searchQuery) || cls.includes(searchQuery) || code.includes(searchQuery);
            });
        }

        // Сортування
        resultKeys.sort((a, b) => {
            const itemA = AppState.results[a];
            const itemB = AppState.results[b];
            let valA, valB;

            switch (AppState.journalSortBy) {
                case 'score':
                    valA = itemA.score || 0;
                    valB = itemB.score || 0;
                    break;
                case 'name':
                    valA = (itemA.studentName || '').toLowerCase();
                    valB = (itemB.studentName || '').toLowerCase();
                    break;
                case 'date':
                default:
                    valA = new Date(itemA.date || 0).getTime();
                    valB = new Date(itemB.date || 0).getTime();
                    break;
            }

            if (valA < valB) return AppState.journalSortDesc ? 1 : -1;
            if (valA > valB) return AppState.journalSortDesc ? -1 : 1;
            return 0;
        });

        if (resultKeys.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: #64748b;">Нічого не знайдено за вашим запитом.</div>';
            return;
        }

        let html = `
            <div class="table-wrapper" style="overflow-x: auto; background: white; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <tr>
                            <th style="padding: 12px 15px; cursor: pointer;" onclick="window.JournalManager.toggleSort('date')">
                                Дата та Час ${AppState.journalSortBy === 'date' ? (AppState.journalSortDesc ? '↓' : '↑') : ''}
                            </th>
                            <th style="padding: 12px 15px; cursor: pointer;" onclick="window.JournalManager.toggleSort('name')">
                                Учень ${AppState.journalSortBy === 'name' ? (AppState.journalSortDesc ? '↓' : '↑') : ''}
                            </th>
                            <th style="padding: 12px 15px;">Клас</th>
                            <th style="padding: 12px 15px;">Код тесту</th>
                            <th style="padding: 12px 15px; cursor: pointer;" onclick="window.JournalManager.toggleSort('score')">
                                Бал (Редагувати) ${AppState.journalSortBy === 'score' ? (AppState.journalSortDesc ? '↓' : '↑') : ''}
                            </th>
                            <th style="padding: 12px 15px; text-align: right;">Дії</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        resultKeys.forEach(id => {
            const item = AppState.results[id];
            const dateStr = item.date ? Utils.formatDate(item.date) : '-';
            const percentage = item.maxScore ? Math.round((item.score / item.maxScore) * 100) : 0;
            
            // Візуалізація успішності кольором
            let scoreColor = '#10b981'; // Green
            if (percentage < 40) scoreColor = '#ef4444'; // Red
            else if (percentage < 70) scoreColor = '#f59e0b'; // Yellow

            html += `
                <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
                    <td style="padding: 12px 15px; font-size: 0.85rem; color: #64748b;">${dateStr}</td>
                    <td style="padding: 12px 15px; font-weight: bold; color: #1e293b;">👤 ${Utils.escapeHTML(item.studentName || 'Анонім')}</td>
                    <td style="padding: 12px 15px; color: #475569;">${Utils.escapeHTML(item.studentClass || '-')}</td>
                    <td style="padding: 12px 15px;">
                        <span style="font-family: monospace; background: #e2e8f0; padding: 3px 6px; border-radius: 4px; color: #334155;">
                            ${Utils.escapeHTML(item.testCode || '-')}
                        </span>
                    </td>
                    <td style="padding: 12px 15px;">
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <input type="number" value="${item.score ?? 0}" 
                                   style="width: 70px; padding: 6px; border: 2px solid ${scoreColor}; border-radius: 6px; font-weight: bold; text-align: center; color: ${scoreColor};" 
                                   onchange="window.JournalManager.editScore('${id}', this.value, ${item.maxScore})">
                            <span style="color: #64748b; font-weight: 500;">/ ${item.maxScore ?? 0}</span>
                        </div>
                    </td>
                    <td style="padding: 12px 15px; text-align: right;">
                        <button onclick="window.JournalManager.deleteRecord('${id}')" class="btn danger-btn" style="padding: 6px 12px; font-size: 0.8rem;">🗑️</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    },

    toggleSort(field) {
        if (AppState.journalSortBy === field) {
            AppState.journalSortDesc = !AppState.journalSortDesc;
        } else {
            AppState.journalSortBy = field;
            AppState.journalSortDesc = true; // За замовчуванням за спаданням
        }
        this.render();
    },

    async editScore(resultId, newValue, maxScore) {
        const newScore = parseInt(newValue, 10);
        if (isNaN(newScore)) return NotificationManager.show("Введіть коректне число", "warning");
        if (newScore > maxScore) return NotificationManager.show("Бал не може перевищувати максимальний!", "warning");

        try {
            await update(ref(db, `results/${resultId}`), { score: newScore });
            Logger.log(`Адмін примусово змінив бал результату ${resultId} на ${newScore}`);
            NotificationManager.show("Бал учня успішно змінено!", "success");
        } catch (err) {
            NotificationManager.show("Помилка збереження балу: " + err.message, "error");
        }
    },

    async deleteRecord(resultId) {
        if (!confirm("Видалити цей результат назавжди?")) return;
        try {
            await remove(ref(db, `results/${resultId}`));
            Logger.log(`Видалено результат учня ID: ${resultId}`);
            NotificationManager.show("Результат видалено", "success");
        } catch (err) {
            NotificationManager.show("Помилка видалення: " + err.message, "error");
        }
    },

    async clearAll() {
        if (!confirm("🚨 КРИТИЧНА ДІЯ!\nВи впевнені, що хочете видалити ВСІ результати ВСІХ учнів з бази?\nЦя дія незворотна!")) return;
        const confirmWord = prompt("Щоб підтвердити, введіть слово 'ОЧИСТИТИ' великими літерами:");
        
        if (confirmWord !== "ОЧИСТИТИ") {
            return NotificationManager.show("Дію скасовано. Невірне слово підтвердження.", "info");
        }

        try {
            await remove(ref(db, 'results'));
            Logger.log("Адміністратор повністю ОЧИСТИВ журнал результатів", "danger");
            NotificationManager.show("ВЕСЬ ЖУРНАЛ УСПІШНО ОЧИЩЕНО.", "success");
        } catch (err) {
            NotificationManager.show("Помилка очищення журналу: " + err.message, "error");
        }
    },

    exportCSV() {
        if (Object.keys(AppState.results).length === 0) {
            return NotificationManager.show("Журнал порожній, немає даних для експорту.", "warning");
        }
        
        try {
            // Додаємо BOM для коректного відображення кирилиці в Excel
            const BOM = "\uFEFF";
            let csvContent = BOM + "Дата,Час,Ім'я Учня,Клас,Код Тесту,Отриманий Бал,Макс.Бал,Відсоток Успішності\n";
            
            // Експортуємо з урахуванням поточного пошуку/сортування для зручності
            const searchQuery = (document.getElementById('journalSearchInput')?.value || '').toLowerCase().trim();
            const keys = Object.keys(AppState.results).filter(id => {
                if (!searchQuery) return true;
                const i = AppState.results[id];
                return (i.studentName||'').toLowerCase().includes(searchQuery) || 
                       (i.studentClass||'').toLowerCase().includes(searchQuery) || 
                       (i.testCode||'').toLowerCase().includes(searchQuery);
            });

            keys.forEach(resId => {
                const item = AppState.results[resId];
                
                const d = new Date(item.date);
                const dateStr = d.toLocaleDateString('uk-UA');
                const timeStr = d.toLocaleTimeString('uk-UA');
                
                // Очищаємо коми, щоб не зламати CSV структуру
                const name = (item.studentName || 'Анонім').replace(/,/g, ''); 
                const cls = (item.studentClass || '-').replace(/,/g, '');
                const code = (item.testCode || '-').replace(/,/g, '');
                const score = item.score ?? 0;
                const maxScore = item.maxScore ?? 0;
                const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) + '%' : '0%';
                
                csvContent += `${dateStr},${timeStr},"${name}",${cls},${code},${score},${maxScore},${percent}\n`;
            });
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            
            const fileNameDate = new Date().toISOString().split('T')[0];
            link.setAttribute("href", url);
            link.setAttribute("download", `Intermap_Journal_${fileNameDate}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            Logger.log("Адміністратор експортував журнал результатів у CSV");
            NotificationManager.show("Файл CSV успішно завантажено!", "success");

        } catch (error) {
            console.error(error);
            NotificationManager.show("Помилка генерації CSV", "error");
        }
    }
};

// ==========================================
// 6. СЕРВІС БЕЗПЕКИ ТА ГЛОБАЛЬНИХ НАЛАШТУВАНЬ
// ==========================================

const SecurityManager = {
    listen() {
        // Слухаємо паролі (auth)
        onValue(ref(db, 'auth'), (snapshot) => {
            if (snapshot.exists()) {
                AppState.auth = snapshot.val();
                if (document.getElementById('teacherPasswordInput')) {
                    document.getElementById('teacherPasswordInput').value = AppState.auth.teacherPassword || '';
                }
                if (document.getElementById('adminPasswordInput')) {
                    document.getElementById('adminPasswordInput').value = AppState.auth.adminPassword || '';
                }
            }
        });

        // Слухаємо глобальні налаштування сайту
        onValue(ref(db, 'settings'), (snapshot) => {
            if (snapshot.exists()) {
                AppState.settings = snapshot.val();
                this.updateUI();
            }
        });
    },

    updateUI() {
        const s = AppState.settings;
        
        // Оновлюємо тумблери
        if (document.getElementById('maintenanceToggle')) document.getElementById('maintenanceToggle').checked = s.maintenance || false;
        if (document.getElementById('blockStudentsToggle')) document.getElementById('blockStudentsToggle').checked = s.blockStudents || false;
        if (document.getElementById('blockTeacherToggle')) document.getElementById('blockTeacherToggle').checked = s.blockTeacher || false;
        
        // Оновлюємо текстові поля анонсів
        if (document.getElementById('siteTitleInput')) document.getElementById('siteTitleInput').value = s.title || '';
        if (document.getElementById('siteNoticeInput')) document.getElementById('siteNoticeInput').value = s.notice || '';
    },

    async savePasswords(e) {
        e.preventDefault();
        const teacherPass = document.getElementById('teacherPasswordInput').value.trim();
        const adminPass = document.getElementById('adminPasswordInput').value.trim();
        
        if (teacherPass.length < 4 || adminPass.length < 4) {
            return NotificationManager.show("Пароль має бути не коротше 4 символів!", "warning");
        }

        try {
            await update(ref(db, 'auth'), { 
                teacherPassword: teacherPass, 
                adminPassword: adminPass, 
                updatedAt: new Date().toISOString() 
            });
            Logger.log("Оновлено паролі доступу для вчителів та адміністраторів", "warning");
            NotificationManager.show("Паролі успішно оновлено!", "success");
        } catch (err) { 
            NotificationManager.show("Помилка збереження паролів: " + err.message, "error"); 
        }
    },

    async toggleAccess(field, isChecked) {
        try {
            await update(ref(db, 'settings'), { [field]: isChecked });
            
            const actionTranslate = {
                'maintenance': 'Режим технічного обслуговування (повний блок)',
                'blockStudents': 'Глобальне блокування проходження тестів (Учні)',
                'blockTeacher': 'Глобальне блокування створення тестів (Вчителі)'
            };

            const statusStr = isChecked ? 'УВІМКНЕНО (Заблоковано)' : 'ВИМКНЕНО (Розблоковано)';
            Logger.log(`Змінено налаштування: ${actionTranslate[field]} -> ${statusStr}`, isChecked ? "danger" : "info");
            
            NotificationManager.show(`Налаштування оновлено: ${statusStr}`, isChecked ? "warning" : "success");
        } catch (err) { 
            NotificationManager.show("Помилка: " + err.message, "error"); 
            // Повертаємо тумблер назад у разі помилки
            document.getElementById(`${field}Toggle`).checked = !isChecked;
        }
    },

    async saveAnnouncement(e) {
        e.preventDefault();
        try {
            await update(ref(db, 'settings'), {
                title: document.getElementById('siteTitleInput').value.trim(),
                notice: document.getElementById('siteNoticeInput').value.trim()
            });
            Logger.log("Оновлено глобальне оголошення/заголовок сайту");
            NotificationManager.show("Налаштування сайту збережено!", "success");
        } catch (err) { 
            NotificationManager.show("Помилка збереження: " + err.message, "error"); 
        }
    }
};

// ==========================================
// 7. СЕРВІС ПЕРСОНАЛЬНИХ БЛОКУВАНЬ (BANS)
// ==========================================

const BanManager = {
    listen() {
        onValue(ref(db, 'banned'), (snapshot) => {
            const listStudents = document.getElementById('bannedStudentsList');
            const listTeachers = document.getElementById('bannedTeachersList');
            
            if (!listStudents || !listTeachers) return;

            if (!snapshot.exists()) {
                AppState.banned = { students: {}, teachers: {} };
                listStudents.innerHTML = '<li style="color:#64748b; padding:10px 0;">Список порожній.</li>';
                listTeachers.innerHTML = '<li style="color:#64748b; padding:10px 0;">Список порожній.</li>';
                return;
            }

            AppState.banned = snapshot.val() || { students: {}, teachers: {} };
            this.render();
        });
    },

    render() {
        const renderList = (dataObj, containerId, icon) => {
            const container = document.getElementById(containerId);
            if (!dataObj || Object.keys(dataObj).length === 0) {
                container.innerHTML = '<li style="color:#64748b; padding:10px 0;">Список порожній.</li>';
                return;
            }

            let html = '';
            Object.keys(dataObj).forEach(key => {
                const value = dataObj[key];
                const type = containerId.includes('Student') ? 'student' : 'teacher';
                html += `
                    <li style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:#fef2f2; padding:10px 15px; border-radius:8px; border: 1px solid #fecaca; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div>
                            <span style="font-size: 1.1rem; margin-right: 8px;">${icon}</span>
                            <strong style="color: #991b1b; font-size: 0.95rem;">${Utils.escapeHTML(value)}</strong>
                        </div>
                        <button onclick="window.BanManager.unban('${type}', '${key}')" 
                                style="color:#dc2626; border:none; background:none; cursor:pointer; font-weight:bold; font-size:1.2rem; padding: 0 5px; transition: transform 0.2s;" 
                                onmouseover="this.style.transform='scale(1.2)'" 
                                onmouseout="this.style.transform='scale(1)'"
                                title="Зняти блокування">✖</button>
                    </li>
                `;
            });
            container.innerHTML = html;
        };

        renderList(AppState.banned.students, 'bannedStudentsList', '👤');
        renderList(AppState.banned.teachers, 'bannedTeachersList', '📧');
    },

    async ban(type) {
        const inputId = type === 'student' ? 'banStudentInput' : 'banTeacherInput';
        const inputEl = document.getElementById(inputId);
        const valueToBan = inputEl.value.trim();

        if (!valueToBan) {
            return NotificationManager.show("Поле не може бути порожнім!", "warning");
        }

        // Перевірка на дублікати
        const existingData = AppState.banned[type + 's'] || {};
        const isAlreadyBanned = Object.values(existingData).some(v => v.toLowerCase() === valueToBan.toLowerCase());
        
        if (isAlreadyBanned) {
            return NotificationManager.show("Цей користувач вже знаходиться у бан-листі!", "warning");
        }

        try {
            await push(ref(db, `banned/${type}s`), valueToBan);
            Logger.log(`Адміністратор заблокував ${type === 'student' ? 'учня' : 'вчителя'}: ${valueToBan}`, "danger");
            
            inputEl.value = '';
            NotificationManager.show(`✅ ${type === 'student' ? 'Учня' : 'Вчителя'} успішно заблоковано!`, "success");
        } catch (err) {
            NotificationManager.show("Помилка блокування: " + err.message, "error");
        }
    },

    async unban(type, recordKey) {
        if (!confirm("Дійсно зняти блокування з цього користувача?")) return;
        try {
            await remove(ref(db, `banned/${type}s/${recordKey}`));
            Logger.log(`Адміністратор зняв блокування з ${type === 'student' ? 'учня' : 'вчителя'}`);
            NotificationManager.show("Блокування знято", "success");
        } catch (err) {
            NotificationManager.show("Помилка розблокування: " + err.message, "error");
        }
    }
};

// ==========================================
// 8. КОНТРОЛЕР ІНТЕРФЕЙСУ (UI MANAGER)
// ==========================================

const UIManager = {
    init() {
        // Налаштування навігації по вкладках
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.currentTarget.getAttribute('data-target');
                this.switchTab(tabId, e.currentTarget);
            });
        });

        // Біндинг форм та подій
        document.getElementById('securityForm')?.addEventListener('submit', (e) => SecurityManager.savePasswords(e));
        document.getElementById('siteAnnouncementForm')?.addEventListener('submit', (e) => SecurityManager.saveAnnouncement(e));
        
        // Біндинг тумблерів
        document.getElementById('maintenanceToggle')?.addEventListener('change', (e) => SecurityManager.toggleAccess('maintenance', e.target.checked));
        document.getElementById('blockStudentsToggle')?.addEventListener('change', (e) => SecurityManager.toggleAccess('blockStudents', e.target.checked));
        document.getElementById('blockTeacherToggle')?.addEventListener('change', (e) => SecurityManager.toggleAccess('blockTeacher', e.target.checked));
        
        // Пошук у журналі (з debounce для оптимізації)
        let searchTimeout;
        document.getElementById('journalSearchInput')?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => JournalManager.render(), 300);
        });

        // Експорт глобальних функцій для виклику з HTML (через onclick)
        window.TestManager = TestManager;
        window.JournalManager = JournalManager;
        window.BanManager = BanManager;
        window.Logger = Logger;
    },

    switchTab(tabName, clickedBtn) {
        if (!tabName) return;
        
        // Сховати всі вкладки
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });
        
        // Зняти активний клас з усіх кнопок
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        
        // Показати цільову вкладку
        const targetTab = document.getElementById(`tab-${tabName}`);
        if (targetTab) {
            targetTab.classList.add('active');
            targetTab.style.display = 'block';
            
            // Анімація появи
            targetTab.style.opacity = 0;
            setTimeout(() => targetTab.style.opacity = 1, 50);
        }
        
        if (clickedBtn) clickedBtn.classList.add('active');
    },

    updateStats() {
        // Статистика тестів та завдань
        const tests = AppState.tests || {};
        const testsCount = Object.keys(tests).length;
        
        let tasksCount = 0;
        Object.values(tests).forEach(t => {
            if (t.tasks && Array.isArray(t.tasks)) {
                tasksCount += t.tasks.length;
            }
        });

        // Статистика результатів
        const results = AppState.results || {};
        const resultsCount = Object.keys(results).length;

        // Оновлення DOM
        const animateValue = (id, end) => {
            const obj = document.getElementById(id);
            if (!obj) return;
            // Проста анімація числа
            const current = parseInt(obj.innerText) || 0;
            if (current !== end) {
                obj.innerText = end;
                obj.style.transform = 'scale(1.2)';
                obj.style.color = '#3b82f6';
                setTimeout(() => {
                    obj.style.transform = 'scale(1)';
                    obj.style.color = 'inherit';
                }, 200);
            }
        };

        animateValue('statTotalTests', testsCount);
        animateValue('statTotalTasks', tasksCount);
        animateValue('statTotalResults', resultsCount);
    }
};

// ==========================================
// 9. ІНІЦІАЛІЗАЦІЯ ДОДАТКУ (BOOTSTRAP)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("🚀 Ініціалізація Адмін-панелі Intermap...");
        
        // 1. Ініціалізуємо систему сповіщень
        NotificationManager.init();
        
        // 2. Ініціалізуємо UI події
        UIManager.init();
        
        // 3. Запускаємо прослуховування бази даних Firebase
        TestManager.listen();
        JournalManager.listen();
        Logger.listen();
        SecurityManager.listen();
        BanManager.listen();

        // 4. Логуємо вхід
        Logger.log("Адміністратор успішно увійшов у панель керування");
        NotificationManager.show("З'єднання з базою даних встановлено!", "success");

    } catch (error) {
        console.error("Помилка ініціалізації:", error);
        alert("Сталася критична помилка під час завантаження панелі. Перевірте консоль.");
    }
});
