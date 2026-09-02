/**
 * ============================================================================
 * INTERMAP CORE CLIENT ENGINE (script.js)
 * ============================================================================
 * Інтерактивна навчальна платформа географічних та історичних карт.
 * Повний клієнтський функціонал:
 * - Потрійна авторизація (Google, Telegram, Admin Secret)
 * - Canvas Engine для відтворення карт, зумування, панорамування
 * - Ray-Casting Algorithm (Point-in-Polygon) для перевірки точного влучання
 * - Система тестування та інтерактивних завдань у реальному часі
 * - Web Audio API синтезатор звукових ефектів (без зовнішніх файлів)
 * - Локальне сховище (LocalStorage DB), таблиця лідерів, історія та аналітика
 * ==========================================
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
    userAnswers: [], // { questionId, selectedShapeId, clickCoords, isCorrect, timeSpent }
    score: 0,
    timerInterval: null,
    timeRemaining: 0,
    totalTimeSpent: 0,
    
    // Стан інтерактивного Canvas для учня
    studentCanvas: {
        element: null,
        ctx: null,
        image: null,
        isLoaded: false,
        zoom: 1,
        panX: 0,
        panY: 0,
        isPanning: false,
        startPanX: 0,
        startPanY: 0,
        hoveredShape: null,
        selectedShape: null,
        clicksHistory: []
    },

    // Налаштування теми та аудіо
    soundEnabled: true,
    darkTheme: true
};

// ============================================================================
// 2. ІНІЦІАЛІЗАЦІЯ ДОДАТКУ ТА ПОДІЙ (FIREBASE INTEGRATED)
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    IntermapEngine.init();
});

const IntermapEngine = {
    init() {
        this.initUIControls();
        this.initAudioSynthesizer();
        this.loadCatalog();
        this.updateUserInterface();
    },

    initUIControls() {
        // --- 1. Модальні вікна та Навігація ---
        const loginBtn = document.getElementById('loginModalBtn');
        if (loginBtn) loginBtn.addEventListener('click', () => UI.showModal('authModal'));

        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => UI.closeAllModals());
        });

        // --- 2. Авторизація через Firebase ---
        
        // Кнопка Входу (Email + Пароль)
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

        // Кнопка Реєстрації
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

        // Кнопка Потрійної Авторизації (Для Адміна)
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

        // --- 3. Контролери та Фільтри ---
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

        if (zoomInBtn) zoomInBtn.addEventListener('click', () => CanvasEngine.adjustZoom(1.2));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => CanvasEngine.adjustZoom(0.8));
        if (resetViewBtn) resetViewBtn.addEventListener('click', () => CanvasEngine.resetView());
    },

    initAudioSynthesizer() {
        if (window.AudioEngine) AudioEngine.init();
    },

    // Отримання тесту з Firebase Realtime Database
    loadCatalog(category = 'all') {
        const catalogContainer = document.getElementById('testsCatalogGrid');
        if (!catalogContainer) return;

        // Зчитуємо дані з бази у реальному часі
        if (window.FirebaseDB) {
            window.FirebaseDB.listenToTests((tests) => {
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
            });
        }
    },

    updateUserInterface() {
        const userNavInfo = document.getElementById('userNavInfo');
        const adminPanelBtn = document.getElementById('adminPanelNavBtn');
        const currentUser = window.IntermapState?.currentUser;

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
// 3. АВТОРИЗАЦІЯ (ПЕРЕНЕРАХОВАНО НА FIREBASE)
// ============================================================================

const AuthModule = {
    async logout() {
        if (window.FirebaseAuthModule) {
            await window.FirebaseAuthModule.logout();
        }
    }
};
// ============================================================================
// 4. CANVAS ENGINE (ВІДМАЛЬОВКА, HIT-TESTING, RAY-CASTING)
// ============================================================================

const CanvasEngine = {
    initCanvasEngine() {
        const canvas = document.getElementById('studentCanvas');
        if (!canvas) return;

        IntermapState.studentCanvas.element = canvas;
        IntermapState.studentCanvas.ctx = canvas.getContext('2d');

        // Додавання обробників подій миші та тач-скріна
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('mouseup', () => this.handleMouseUp());
        canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        window.addEventListener('resize', () => this.resizeCanvasToContainer());
    },

    resizeCanvasToContainer() {
        const canvas = IntermapState.studentCanvas.element;
        if (!canvas || !canvas.parentElement) return;

        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width || 800;
        canvas.height = rect.height || 500;

        redrawStudentCanvas();
    },

    loadMapImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = url;
            img.onload = () => {
                IntermapState.studentCanvas.image = img;
                IntermapState.studentCanvas.isLoaded = true;
                this.resetView();
                resolve(img);
            };
            img.onerror = (err) => {
                IntermapState.studentCanvas.isLoaded = false;
                reject(err);
            };
        });
    },

    resetView() {
        const c = IntermapState.studentCanvas;
        c.zoom = 1;
        c.panX = 0;
        c.panY = 0;
        redrawStudentCanvas();
    },

    adjustZoom(factor) {
        const c = IntermapState.studentCanvas;
        const newZoom = c.zoom * factor;
        if (newZoom >= 0.6 && newZoom <= 4.0) {
            c.zoom = newZoom;
            redrawStudentCanvas();
        }
    },

    getTransformedCoords(e) {
        const canvas = IntermapState.studentCanvas.element;
        const rect = canvas.getBoundingClientRect();
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;

        const c = IntermapState.studentCanvas;
        return {
            x: (rawX - c.panX) / c.zoom,
            y: (rawY - c.panY) / c.zoom
        };
    },

    handleMouseDown(e) {
        if (e.button === 1 || e.shiftKey) { // Середня кнопка миші або Shift+ЛКМ для панорамування
            const c = IntermapState.studentCanvas;
            c.isPanning = true;
            c.startPanX = e.clientX - c.panX;
            c.startPanY = e.clientY - c.panY;
        }
    },

    handleMouseMove(e) {
        const c = IntermapState.studentCanvas;
        if (c.isPanning) {
            c.panX = e.clientX - c.startPanX;
            c.panY = e.clientY - c.startPanY;
            redrawStudentCanvas();
            return;
        }

        // Перевірка наведення курсора на області (Hover hit-testing)
        const coords = this.getTransformedCoords(e);
        const test = IntermapState.activeTest;
        if (!test || !test.shapes) return;

        let foundShape = null;
        for (let shape of test.shapes) {
            if (Geometry.isPointInShape(coords, shape)) {
                foundShape = shape;
                break;
            }
        }

        if (c.hoveredShape !== foundShape) {
            c.hoveredShape = foundShape;
            c.element.style.cursor = foundShape ? 'pointer' : 'crosshair';
            redrawStudentCanvas();
        }
    },

    handleMouseUp() {
        IntermapState.studentCanvas.isPanning = false;
    },

    handleWheel(e) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        this.adjustZoom(factor);
    },

    handleCanvasClick(e) {
        const c = IntermapState.studentCanvas;
        if (c.isPanning) return;

        const coords = this.getTransformedCoords(e);
        const test = IntermapState.activeTest;
        if (!test) return;

        // Визначаємо, в яку фігуру влучив користувач
        let clickedShape = null;
        if (test.shapes) {
            for (let shape of test.shapes) {
                if (Geometry.isPointInShape(coords, shape)) {
                    clickedShape = shape;
                    break;
                }
            }
        }

        // Зберігаємо візуальну точку кліку
        c.clicksHistory.push({
            x: coords.x,
            y: coords.y,
            isCorrect: clickedShape ? true : false
        });

        // Передаємо відповідь у QuizEngine
        QuizEngine.processStudentAnswer(clickedShape, coords);
        redrawStudentCanvas();
    }
};

/**
 * Головна функція перемалювання Canvas (Завершено та відновлено)
 */
function redrawStudentCanvas() {
    const canvas = document.getElementById('studentCanvas');
    const c = IntermapState.studentCanvas;
    if (!canvas || !c.ctx) return;

    const ctx = c.ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(c.panX, c.panY);
    ctx.scale(c.zoom, c.zoom);

    // 1. Відмальовка фонової карти
    if (c.image && c.isLoaded) {
        ctx.drawImage(c.image, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('Завантаження інтерактивної карти...', canvas.width / 2, canvas.height / 2);
    }

    // 2. Відмальовка інтерактивних областей (Shapes)
    const test = IntermapState.activeTest;
    if (test && test.shapes) {
        test.shapes.forEach(shape => {
            const isHovered = c.hoveredShape && c.hoveredShape.id === shape.id;
            const isSelected = c.selectedShape && c.selectedShape.id === shape.id;

            ctx.beginPath();
            ctx.lineWidth = (isHovered || isSelected ? 3 : 1.5) / c.zoom;
            ctx.strokeStyle = isSelected ? '#10b981' : (isHovered ? '#3b82f6' : (shape.color || '#64748b'));
            ctx.fillStyle = isSelected 
                ? 'rgba(16, 185, 129, 0.4)' 
                : (isHovered ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.1)');

            if (shape.type === 'point' && shape.points[0]) {
                const pt = shape.points[0];
                const radius = (isHovered ? 10 : 7) / c.zoom;
                ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (shape.type === 'polygon' && shape.points && shape.points.length > 0) {
                shape.points.forEach((pt, idx) => {
                    if (idx === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        });
    }

    // 3. Відмальовка точок кліків учня
    c.clicksHistory.forEach(click => {
        ctx.beginPath();
        ctx.arc(click.x, click.y, 5 / c.zoom, 0, Math.PI * 2);
        ctx.fillStyle = click.isCorrect ? '#10b981' : '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / c.zoom;
        ctx.stroke();
    });

    ctx.restore();
}

// ============================================================================
// 5. ГЕОМЕТРИЧНИЙ РУШІЙ (RAY-CASTING POINT-IN-POLYGON)
// ============================================================================

const Geometry = {
    isPointInShape(point, shape) {
        if (!shape || !shape.points) return false;

        if (shape.type === 'point') {
            const target = shape.points[0];
            if (!target) return false;
            const dist = Math.hypot(point.x - target.x, point.y - target.y);
            return dist <= 15; // Радіус кліку для точки
        }

        if (shape.type === 'polygon') {
            return this.rayCastIntersect(point, shape.points);
        }

        return false;
    },

    /**
     * Алгоритм Ray-Casting для виявлення точок всередині довільного багатокутника
     */
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
// 6. КУРС ТА ТЕСТОВИЙ РУШІЙ (QUIZ ENGINE)
// ============================================================================

const QuizEngine = {
    async startTest(testId) {
        const tests = JSON.parse(localStorage.getItem(INTERMAP_CONFIG.STORAGE_KEYS.TESTS) || '[]');
        const test = tests.find(t => t.id === testId);

        if (!test) {
            UI.showToast('Тест не знайдено в системі', 'error');
            return;
        }

        IntermapState.activeTest = test;
        IntermapState.currentQuestionIndex = 0;
        IntermapState.userAnswers = [];
        IntermapState.score = 0;
        IntermapState.studentCanvas.clicksHistory = [];
        IntermapState.totalTimeSpent = 0;

        UI.showModal('quizModal');
        CanvasEngine.resizeCanvasToContainer();

        try {
            await CanvasEngine.loadMapImage(test.mapUrl);
        } catch (e) {
            UI.showToast('Помилка завантаження картографічного фону', 'error');
        }

        this.startTimer();
        this.renderCurrentQuestion();
        AudioEngine.play('start');
    },

    startTimer() {
        this.stopTimer();
        IntermapState.timeRemaining = 300; // 5 хвилин на тест
        this.updateTimerDisplay();

        IntermapState.timerInterval = setInterval(() => {
            IntermapState.timeRemaining--;
            IntermapState.totalTimeSpent++;
            this.updateTimerDisplay();

            if (IntermapState.timeRemaining <= 0) {
                this.stopTimer();
                UI.showToast('Час вичерпано! Тест автоматично завершено.', 'info');
                this.finishTest();
            }
        }, 1000);
    },

    stopTimer() {
        if (IntermapState.timerInterval) {
            clearInterval(IntermapState.timerInterval);
            IntermapState.timerInterval = null;
        }
    },

    updateTimerDisplay() {
        const timerEl = document.getElementById('quizTimerDisplay');
        if (!timerEl) return;

        const minutes = Math.floor(IntermapState.timeRemaining / 60);
        const seconds = IntermapState.timeRemaining % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (IntermapState.timeRemaining < 30) {
            timerEl.style.color = '#ef4444';
        } else {
            timerEl.style.color = '#3b82f6';
        }
    },

    renderCurrentQuestion() {
        const test = IntermapState.activeTest;
        if (!test || !test.questions || test.questions.length === 0) {
            UI.showToast('У цьому тесті немає налаштованих питань', 'error');
            return;
        }

        const question = test.questions[IntermapState.currentQuestionIndex];
        const questionTextEl = document.getElementById('currentQuestionText');
        const questionCounterEl = document.getElementById('questionCounterDisplay');
        const progressBar = document.getElementById('quizProgressBar');

        if (questionTextEl) questionTextEl.textContent = question.text;
        if (questionCounterEl) {
            questionCounterEl.textContent = `Питання ${IntermapState.currentQuestionIndex + 1} з ${test.questions.length}`;
        }

        if (progressBar) {
            const percent = ((IntermapState.currentQuestionIndex) / test.questions.length) * 100;
            progressBar.style.width = `${percent}%`;
        }
    },

    processStudentAnswer(clickedShape, coords) {
        const test = IntermapState.activeTest;
        if (!test) return;

        const currentQuestion = test.questions[IntermapState.currentQuestionIndex];
        const isCorrect = clickedShape && clickedShape.id === currentQuestion.targetShapeId;

        if (isCorrect) {
            IntermapState.score++;
            AudioEngine.play('correct');
            UI.showToast('Правильно!', 'success');
        } else {
            AudioEngine.play('wrong');
            UI.showToast('Невірно, спробуйте ще раз або переходьте далі', 'error');
        }

        IntermapState.userAnswers.push({
            questionId: currentQuestion.id,
            selectedShapeId: clickedShape ? clickedShape.id : null,
            clickCoords: coords,
            isCorrect: isCorrect
        });

        // Перехід до наступного питання або завершення
        if (IntermapState.currentQuestionIndex + 1 < test.questions.length) {
            IntermapState.currentQuestionIndex++;
            setTimeout(() => this.renderCurrentQuestion(), 600);
        } else {
            setTimeout(() => this.finishTest(), 800);
        }
    },

    finishTest() {
        this.stopTimer();
        const test = IntermapState.activeTest;
        const totalQuestions = test.questions ? test.questions.length : 1;
        const finalScorePercentage = Math.round((IntermapState.score / totalQuestions) * 100);

        // Збереження результату в локальну БД
        const submission = {
            id: Date.now(),
            userEmail: IntermapState.currentUser ? IntermapState.currentUser.email : 'Гість (Анонім)',
            testId: test.id,
            testTitle: test.title,
            score: finalScorePercentage,
            correctCount: IntermapState.score,
            totalCount: totalQuestions,
            durationSpent: IntermapState.totalTimeSpent,
            date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()
        };

        const submissions = JSON.parse(localStorage.getItem(INTERMAP_CONFIG.STORAGE_KEYS.SUBMISSIONS) || '[]');
        submissions.push(submission);
        localStorage.setItem(INTERMAP_CONFIG.STORAGE_KEYS.SUBMISSIONS, JSON.stringify(submissions));

        AudioEngine.play('finish');
        UI.showResultsModal(submission);
        IntermapEngine.updateUserInterface();
    }
};

// ============================================================================
// 7. СИНТЕЗАТОР ЗВУКОВИХ ЕФЕКТІВ (WEB AUDIO API)
// ============================================================================

const AudioEngine = {
    ctx: null,

    init() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        } catch (e) {
            console.warn('Web Audio API не підтримується у цьому браузері');
        }
    },

    play(type) {
        if (!IntermapState.soundEnabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'correct') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'wrong') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.setValueAtTime(110, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'start') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(330, now);
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.2);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'finish') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.4);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
    }
};

// ============================================================================
// 8. ІНТЕРФЕЙС, МОДАЛЬНІ ВІКНА ТА СПОВІЩЕННЯ
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

        // Сортування за найвищим балом
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
// 9. ДОПОМІЖНІ УТИЛІТИ (UTILS)
// ============================================================================

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
