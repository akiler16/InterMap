/**
 * ============================================================================
 * INTERMAP CORE CLIENT ENGINE (script.js)
 * ============================================================================
 * Базове ядро системи Intermap:
 * - Глобальна конфігурація та стан платформи
 * - Авторизація та управління сесіями
 * - Каталог тестів та фільтрація
 * - UI модальні вікна, таблиці лідерів та нотифікації
 * - Математичний рушій точного влучання (Ray-Casting Algorithm)
 * ============================================================================
 */

// ============================================================================
// 1. КОНФІГУРАЦІЯ ТА ГЛОБАЛЬНИЙ СТАН СИСТЕМИ
// ============================================================================

const INTERMAP_CONFIG = {
    STORAGE_KEYS: {
        TESTS: 'intermap_tests',
        USERS: 'intermap_users',
        SUBMISSIONS: 'intermap_submissions',
        SETTINGS: 'intermap_settings',
        AUTH_TOKEN: 'intermap_auth'
    },
    OWNER_EMAILS: [
        "vanyary16@gmail.com",
        "vanyarybalka13@gmail.com"
    ],
    TRIPLE_AUTH_SECRETS: {
        TELEGRAM_USERNAME: "@IvanIntermap",
        GOOGLE_KEY: "G-161013"
    },
    DEFAULT_MAP: {
        id: 'ukraine_default',
        title: 'Адміністративна карта України',
        category: 'geography',
        mapUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Administrative_map_of_Ukraine_2020.svg/1200px-Administrative_map_of_Ukraine_2020.svg.png',
        shapes: [
            {
                id: 101,
                label: 'Київська область',
                type: 'polygon',
                color: '#3b82f6',
                points: [{ x: 450, y: 180 }, { x: 520, y: 170 }, { x: 530, y: 240 }, { x: 460, y: 250 }]
            },
            {
                id: 102,
                label: 'Львівська область',
                type: 'polygon',
                color: '#10b981',
                points: [{ x: 120, y: 220 }, { x: 190, y: 210 }, { x: 180, y: 280 }, { x: 110, y: 270 }]
            },
            {
                id: 103,
                label: 'Одеська область',
                type: 'polygon',
                color: '#f59e0b',
                points: [{ x: 380, y: 380 }, { x: 450, y: 370 }, { x: 440, y: 460 }, { x: 360, y: 450 }]
            },
            {
                id: 104,
                label: 'Київ (Столиця)',
                type: 'point',
                color: '#ef4444',
                points: [{ x: 485, y: 205 }]
            }
        ],
        questions: [
            { id: 1, text: 'Знайдіть та виберіть Київську область', targetShapeId: 101 },
            { id: 2, text: 'Знайдіть та виберіть Львівську область', targetShapeId: 102 },
            { id: 3, text: 'Укажіть розташування Одеської області', targetShapeId: 103 },
            { id: 4, text: 'Клацніть на точку, де розташована столиця України — Київ', targetShapeId: 104 }
        ]
    }
};

const IntermapState = {
    currentUser: null,
    activeTest: null,
    currentQuestionIndex: 0,
    userAnswers: [], 
    score: 0,
    timerInterval: null,
    timeRemaining: 0,
    totalTimeSpent: 0,
    soundEnabled: true,
    darkTheme: true
};

// ============================================================================
// 2. ІНІЦІАЛІЗАЦІЯ ДОДАТКУ ТА ПОДІЙ
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    IntermapEngine.init();
});

const IntermapEngine = {
    init() {
        this.initUIControls();
        this.loadCatalog();
        this.updateUserInterface();
    },

    initUIControls() {
        const loginBtn = document.getElementById('loginModalBtn');
        if (loginBtn) loginBtn.addEventListener('click', () => UI.showModal('authModal'));

        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => UI.closeAllModals());
        });
        
        const loginSubmitBtn = document.getElementById('loginSubmitBtn');
        if (loginSubmitBtn) {
            loginSubmitBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = document.getElementById('authEmailInput')?.value.trim();
                const password = document.getElementById('authPasswordInput')?.value.trim();
                
                if (window.FirebaseAuthModule) {
                    await window.FirebaseAuthModule.login(email, password);
                }
            });
        }

        const registerSubmitBtn = document.getElementById('registerSubmitBtn');
        if (registerSubmitBtn) {
            registerSubmitBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = document.getElementById('authEmailInput')?.value.trim();
                const password = document.getElementById('authPasswordInput')?.value.trim();

                if (window.FirebaseAuthModule) {
                    await window.FirebaseAuthModule.register(email, password);
                }
            });
        }

        const tripleAuthBtn = document.getElementById('tripleAuthSubmitBtn');
        if (tripleAuthBtn) {
            tripleAuthBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = document.getElementById('authEmailInput')?.value.trim();
                const password = document.getElementById('authPasswordInput')?.value.trim();
                const tg = document.getElementById('authTgInput')?.value.trim();
                const secret = document.getElementById('authSecretInput')?.value.trim();

                if (window.FirebaseAuthModule) {
                    await window.FirebaseAuthModule.handleTripleAuth(email, password, tg, secret);
                }
            });
        }

        const catalogFilterBtns = document.querySelectorAll('.catalog-filter-btn');
        catalogFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                catalogFilterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadCatalog(btn.getAttribute('data-category'));
            });
        });

        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const resetViewBtn = document.getElementById('resetViewBtn');

        if (zoomInBtn) zoomInBtn.addEventListener('click', () => window.CanvasEngine && window.CanvasEngine.adjustZoom(1.2));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => window.CanvasEngine && window.CanvasEngine.adjustZoom(0.8));
        if (resetViewBtn) resetViewBtn.addEventListener('click', () => window.CanvasEngine && window.CanvasEngine.resetView());
    },

    loadCatalog(category = 'all') {
        const catalogContainer = document.getElementById('testsCatalogGrid');
        if (!catalogContainer) return;

        const renderTests = (tests) => {
            const filtered = category === 'all' 
                ? tests 
                : tests.filter(t => t.category === category);

            if (filtered.length === 0) {
                catalogContainer.innerHTML = `
                    <div class="empty-catalog-msg" style="grid-column: 1/-1; text-align: center; color: var(--text-sub); padding: 40px;">
                        <i class="fa-solid fa-map-location-dot" style="font-size: 3rem; margin-bottom: 10px;"></i>
                        <p>У цій категорії поки немає доступних тестів.</p>
                    </div>`;
                return;
            }

            catalogContainer.innerHTML = filtered.map(test => `
                <div class="test-card">
                    <div class="test-card-banner" style="background-image: url('${test.mapUrl}'); background-size: cover; height: 140px; border-radius: 8px 8px 0 0; position: relative;">
                        <span class="test-badge">${test.category || 'Географія'}</span>
                    </div>
                    <div class="test-card-body" style="padding: 15px;">
                        <h3 style="margin: 0 0 8px 0;">${Utils.escapeHtml(test.title)}</h3>
                        <p style="color: var(--text-sub); font-size: 0.85rem; margin-bottom: 15px;">
                            Кількість питань: ${test.questions ? test.questions.length : 0} | Областей: ${test.shapes ? test.shapes.length : 0}
                        </p>
                        <button onclick="QuizEngine.startTest('${test.id}')" class="btn-primary" style="width: 100%;">
                            <i class="fa-solid fa-play"></i> Розпочати тест
                        </button>
                    </div>
                </div>
            `).join('');
        };

        if (window.FirebaseDB) {
            window.FirebaseDB.listenToTests(renderTests);
        } else {
            const localTests = JSON.parse(localStorage.getItem(INTERMAP_CONFIG.STORAGE_KEYS.TESTS) || '[]');
            if (localTests.length === 0) {
                localTests.push(INTERMAP_CONFIG.DEFAULT_MAP);
                localStorage.setItem(INTERMAP_CONFIG.STORAGE_KEYS.TESTS, JSON.stringify(localTests));
            }
            renderTests(localTests);
        }
    },

    updateUserInterface() {
        const userNavInfo = document.getElementById('userNavInfo');
        const adminPanelBtn = document.getElementById('adminPanelNavBtn');
        const currentUser = IntermapState.currentUser;

        if (currentUser) {
            if (userNavInfo) {
                userNavInfo.innerHTML = `
                    <span class="user-email-tag"><i class="fa-solid fa-user-circle"></i> ${Utils.escapeHtml(currentUser.email)}</span>
                    <button id="userLogoutBtn" class="btn-secondary-sm"><i class="fa-solid fa-right-from-bracket"></i></button>
                `;
                document.getElementById('userLogoutBtn')?.addEventListener('click', () => AuthModule.logout());
            }

            if (adminPanelBtn) {
                if (currentUser.role === 'admin' || INTERMAP_CONFIG.OWNER_EMAILS.includes(currentUser.email)) {
                    adminPanelBtn.style.display = 'inline-flex';
                } else {
                    adminPanelBtn.style.display = 'none';
                }
            }
        } else {
            if (userNavInfo) {
                userNavInfo.innerHTML = `
                    <button id="loginModalBtn" class="btn-primary-sm">
                        <i class="fa-solid fa-lock"></i> Вхід / Реєстрація
                    </button>
                `;
                document.getElementById('loginModalBtn')?.addEventListener('click', () => UI.showModal('authModal'));
            }
            if (adminPanelBtn) adminPanelBtn.style.display = 'none';
        }

        if (window.UI?.renderLeaderboard) UI.renderLeaderboard();
        if (window.UI?.renderUserHistory) UI.renderUserHistory();
    }
};

// ============================================================================
// 3. АВТОРИЗАЦІЯ
// ============================================================================

const AuthModule = {
    async logout() {
        if (window.FirebaseAuthModule) {
            await window.FirebaseAuthModule.logout();
        } else {
            localStorage.removeItem('isOwnerAuthorized');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('authUser');
            IntermapState.currentUser = null;
            IntermapEngine.updateUserInterface();
            window.location.reload();
        }
    }
};

// ============================================================================
// 4. ГЕОМЕТРИЧНИЙ РУШІЙ
// ============================================================================

const Geometry = {
    isPointInShape(point, shape) {
        if (!shape || !shape.points) return false;

        if (shape.type === 'point') {
            const target = shape.points[0];
            if (!target) return false;
            const dist = Math.hypot(point.x - target.x, point.y - target.y);
            return dist <= 15; 
        }

        if (shape.type === 'polygon') {
            return this.rayCastIntersect(point, shape.points);
        }

        return false;
    },

    rayCastIntersect(point, vs) {
        const x = point.x, y = point.y;
        let inside = false;

        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].x, yi = vs[i].y;
            const xj = vs[j].x, yj = vs[j].y;

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    }
};

// ============================================================================
// 5. ІНТЕРФЕЙС ТА МОДАЛЬНІ ВІКНА
// ============================================================================

const UI = {
    showModal(modalId) {
        this.closeAllModals();
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        }
    },

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.style.display = 'none';
            m.classList.remove('active');
        });
    },

    showResultsModal(sub) {
        this.showModal('resultsModal');
        const scoreEl = document.getElementById('resultScorePercent');
        const textEl = document.getElementById('resultSummaryText');

        if (scoreEl) scoreEl.textContent = `${sub.score}%`;
        if (textEl) {
            textEl.innerHTML = `
                Ви успішно відповіли на <strong>${sub.correctCount}</strong> з <strong>${sub.totalCount}</strong> питань.<br>
                Витрачений час: <strong>${sub.durationSpent} сек</strong>.
            `;
        }
    },

    renderLeaderboard() {
        const tbody = document.getElementById('leaderboardTableBody');
        if (!tbody) return;

        const subs = JSON.parse(localStorage.getItem(INTERMAP_CONFIG.STORAGE_KEYS.SUBMISSIONS) || '[]');
        if (subs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-sub);">Записи відсутні</td></tr>`;
            return;
        }

        const sorted = [...subs].sort((a, b) => b.score - a.score).slice(0, 10);
        tbody.innerHTML = sorted.map((item, idx) => `
            <tr>
                <td><strong>#${idx + 1}</strong></td>
                <td>${Utils.escapeHtml(item.userEmail)}</td>
                <td>${Utils.escapeHtml(item.testTitle)}</td>
                <td><span class="score-badge" style="color:var(--success-color); font-weight:bold;">${item.score}%</span></td>
            </tr>
        `).join('');
    },

    renderUserHistory() {
        const tbody = document.getElementById('userHistoryTableBody');
        if (!tbody || !IntermapState.currentUser) return;

        const subs = JSON.parse(localStorage.getItem(INTERMAP_CONFIG.STORAGE_KEYS.SUBMISSIONS) || '[]');
        const userSubs = subs.filter(s => s.userEmail === IntermapState.currentUser.email);

        if (userSubs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-sub);">Ви ще не проходили тести</td></tr>`;
            return;
        }

        tbody.innerHTML = userSubs.reverse().map(item => `
            <tr>
                <td>${Utils.escapeHtml(item.testTitle)}</td>
                <td><strong>${item.score}%</strong></td>
                <td>${item.date}</td>
            </tr>
        `).join('');
    },

    showToast(msg, type = 'info') {
        const container = document.getElementById('toastContainer') || this.createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            padding: 12px 20px;
            margin-top: 8px;
            border-radius: 8px;
            color: #fff;
            font-weight: 600;
            background: ${type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#3b82f6')};
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            transition: all 0.3s ease;
        `;
        toast.textContent = msg;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 10000;';
        document.body.appendChild(container);
        return container;
    }
};

// ============================================================================
// 6. ДОПОМІЖНІ УТИЛІТИ ТА ОБРОБНИКИ ВИХОДУ
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');

    function checkAuthStatus() {
        const isAuthorized = localStorage.getItem('isOwnerAuthorized') || 
                             localStorage.getItem('userRole') || 
                             localStorage.getItem('userEmail');

        if (logoutBtn) {
            if (isAuthorized) {
                logoutBtn.style.display = 'inline-flex';
            } else {
                logoutBtn.style.display = 'none';
            }
        }
    }

    checkAuthStatus();

    logoutBtn?.addEventListener('click', async () => {
        if (confirm('Ви дійсно бажаєте вийти з акаунта?')) {
            try {
                if (window.FirebaseAuthModule && typeof window.FirebaseAuthModule.logout === 'function') {
                    await window.FirebaseAuthModule.logout();
                }
            } catch (error) {
                console.error('Помилка при виході з Firebase:', error);
            } finally {
                localStorage.removeItem('isOwnerAuthorized');
                localStorage.removeItem('userRole');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('authUser');
                window.location.reload();
            }
        }
    });
});

const Utils = {
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    generateUniqueId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
};

// Експорт ядра у глобальну область видимості
window.INTERMAP_CONFIG = INTERMAP_CONFIG;
window.IntermapState = IntermapState;
window.IntermapEngine = IntermapEngine;
window.AuthModule = AuthModule;
window.Geometry = Geometry;
window.UI = UI;
window.Utils = Utils;