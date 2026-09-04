/**
 * ============================================================================
 * INTERMAP TEACHER / ADMIN PANEL ENGINE (teacher.js)
 * ============================================================================
 * Модуль для вчителів та адміністраторів:
 * - Створення та редагування карт/тестів
 * - Інструменти малювання на полотні редактора (полігони, точки, редагування)
 * - Управління списком фігур та питаннями
 * - Збереження та видалення тестів
 * ============================================================================
 */

const TeacherEngine = {
    // Стан редактора карт
    editorState: {
        activeTestId: null,
        shapes: [],
        questions: [],
        currentMode: 'select', // 'select', 'polygon', 'point'
        currentPoints: [],     // Тимчасові точки при побудові полігону
        selectedShapeId: null,
        hoveredShapeId: null,
        canvas: null,
        ctx: null,
        image: null,
        isLoaded: false,
        zoom: 1,
        panX: 0,
        panY: 0,
        isPanning: false,
        startPanX: 0,
        startPanY: 0
    },

    init() {
        this.initEditorCanvas();
        this.initUIEvents();
    },

    // ------------------------------------------------------------------------
    // 1. ІНІЦІАЛІЗАЦІЯ CANVAS ТА ПОДІЙ РЕДАКТОРА
    // ------------------------------------------------------------------------
    initEditorCanvas() {
        const canvas = document.getElementById('teacherCanvas');
        if (!canvas) return;

        this.editorState.canvas = canvas;
        this.editorState.ctx = canvas.getContext('2d');

        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('mouseup', () => this.handleMouseUp());
        canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        canvas.addEventListener('dblclick', (e) => this.handleCanvasDblClick(e));

        window.addEventListener('resize', () => this.resizeCanvasToContainer());
    },

    initUIEvents() {
        // Інструменти режиму
        document.getElementById('toolSelectBtn')?.addEventListener('click', () => this.setMode('select'));
        document.getElementById('toolPolygonBtn')?.addEventListener('click', () => this.setMode('polygon'));
        document.getElementById('toolPointBtn')?.addEventListener('click', () => this.setMode('point'));

        // Кнопка створення/збереження
        document.getElementById('saveTestBtn')?.addEventListener('click', () => this.saveCurrentTest());
        document.getElementById('addQuestionBtn')?.addEventListener('click', () => this.addQuestionPrompt());
    },

    resizeCanvasToContainer() {
        const c = this.editorState;
        if (!c.canvas || !c.canvas.parentElement) return;

        const rect = c.canvas.parentElement.getBoundingClientRect();
        c.canvas.width = rect.width || 800;
        c.canvas.height = rect.height || 500;

        this.redraw();
    },

    loadMapImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = url;
            img.onload = () => {
                this.editorState.image = img;
                this.editorState.isLoaded = true;
                this.resetView();
                resolve(img);
            };
            img.onerror = (err) => {
                this.editorState.isLoaded = false;
                reject(err);
            };
        });
    },

    resetView() {
        const c = this.editorState;
        c.zoom = 1;
        c.panX = 0;
        c.panY = 0;
        this.redraw();
    },

    setMode(mode) {
        this.editorState.currentMode = mode;
        this.editorState.currentPoints = [];
        
        // Оновлення активного стану кнопок інструментів у UI
        document.querySelectorAll('.editor-tool-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`tool${mode.charAt(0).toUpperCase() + mode.slice(1)}Btn`);
        if (activeBtn) activeBtn.classList.add('active');

        this.redraw();
    },

    // ------------------------------------------------------------------------
    // 2. ОБРОБКА ПОДІЙ МИШІ В РЕДАКТОРІ
    // ------------------------------------------------------------------------
    getTransformedCoords(e) {
        const c = this.editorState;
        const rect = c.canvas.getBoundingClientRect();
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;

        return {
            x: (rawX - c.panX) / c.zoom,
            y: (rawY - c.panY) / c.zoom
        };
    },

    handleMouseDown(e) {
        if (e.button === 1 || e.shiftKey) { 
            const c = this.editorState;
            c.isPanning = true;
            c.startPanX = e.clientX - c.panX;
            c.startPanY = e.clientY - c.startPanY;
        }
    },

    handleMouseMove(e) {
        const c = this.editorState;
        if (c.isPanning) {
            c.panX = e.clientX - c.startPanX;
            c.panY = e.clientY - c.startPanY;
            this.redraw();
            return;
        }

        const coords = this.getTransformedCoords(e);

        if (c.currentMode === 'select') {
            let found = null;
            for (let shape of c.shapes) {
                if (window.Geometry && window.Geometry.isPointInShape(coords, shape)) {
                    found = shape.id;
                    break;
                }
            }
            if (c.hoveredShapeId !== found) {
                c.hoveredShapeId = found;
                c.canvas.style.cursor = found ? 'pointer' : 'default';
                this.redraw();
            }
        }
    },

    handleMouseUp() {
        this.editorState.isPanning = false;
    },

    handleWheel(e) {
        e.preventDefault();
        const c = this.editorState;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = c.zoom * factor;

        if (newZoom >= 0.5 && newZoom <= 5.0) {
            c.zoom = newZoom;
            this.redraw();
        }
    },

    handleCanvasClick(e) {
        const c = this.editorState;
        if (c.isPanning) return;

        const coords = this.getTransformedCoords(e);

        if (c.currentMode === 'polygon') {
            c.currentPoints.push(coords);
            this.redraw();
        } else if (c.currentMode === 'point') {
            const newShape = {
                id: Date.now(),
                label: `Точка ${c.shapes.length + 1}`,
                type: 'point',
                color: '#ef4444',
                points: [coords]
            };
            c.shapes.push(newShape);
            this.renderShapesList();
            this.redraw();
        } else if (c.currentMode === 'select') {
            let selected = null;
            for (let shape of c.shapes) {
                if (window.Geometry && window.Geometry.isPointInShape(coords, shape)) {
                    selected = shape.id;
                    break;
                }
            }
            c.selectedShapeId = selected;
            this.renderShapesList();
            this.redraw();
        }
    },

    handleCanvasDblClick(e) {
        const c = this.editorState;
        // Замикання полігону при подвійному кліку
        if (c.currentMode === 'polygon' && c.currentPoints.length >= 3) {
            const newShape = {
                id: Date.now(),
                label: `Область ${c.shapes.length + 1}`,
                type: 'polygon',
                color: '#3b82f6',
                points: [...c.currentPoints]
            };
            c.shapes.push(newShape);
            c.currentPoints = [];
            this.renderShapesList();
            this.redraw();
        }
    },

    // ------------------------------------------------------------------------
    // 3. ВІДМАЛЬОВКА CANVAS РЕДАКТОРА
    // ------------------------------------------------------------------------
    redraw() {
        const c = this.editorState;
        if (!c.canvas || !c.ctx) return;

        const ctx = c.ctx;
        ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);

        ctx.save();
        ctx.translate(c.panX, c.panY);
        ctx.scale(c.zoom, c.zoom);

        // Фонові зображення
        if (c.image && c.isLoaded) {
            ctx.drawImage(c.image, 0, 0, c.canvas.width, c.canvas.height);
        } else {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, c.canvas.width, c.canvas.height);
            ctx.fillStyle = '#64748b';
            ctx.font = '14px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('Завантажте карту для початку малювання', c.canvas.width / 2, c.canvas.height / 2);
        }

        // Відмальовка збережених фігур
        c.shapes.forEach(shape => {
            const isSelected = c.selectedShapeId === shape.id;
            const isHovered = c.hoveredShapeId === shape.id;

            ctx.beginPath();
            ctx.lineWidth = (isSelected || isHovered ? 3 : 1.5) / c.zoom;
            ctx.strokeStyle = isSelected ? '#10b981' : (isHovered ? '#6366f1' : (shape.color || '#3b82f6'));
            ctx.fillStyle = isSelected 
                ? 'rgba(16, 185, 129, 0.35)' 
                : (isHovered ? 'rgba(99, 102, 241, 0.3)' : 'rgba(59, 130, 246, 0.2)');

            if (shape.type === 'point' && shape.points[0]) {
                const pt = shape.points[0];
                ctx.arc(pt.x, pt.y, (isSelected ? 9 : 6) / c.zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (shape.type === 'polygon' && shape.points) {
                shape.points.forEach((pt, idx) => {
                    if (idx === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        });

        // Відмальовка поточного створення полігону
        if (c.currentPoints.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2 / c.zoom;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';

            c.currentPoints.forEach((pt, idx) => {
                if (idx === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);

                // Малювання точок вершин
                ctx.fillRect(pt.x - 3 / c.zoom, pt.y - 3 / c.zoom, 6 / c.zoom, 6 / c.zoom);
            });

            ctx.stroke();
        }

        ctx.restore();
    },

    // ------------------------------------------------------------------------
    // 4. УПРАВЛІННЯ СПИСКОМ ФІГУР ТА ПИТАНЬ UІ
    // ------------------------------------------------------------------------
    renderShapesList() {
        const container = document.getElementById('shapesListContainer');
        if (!container) return;

        if (this.editorState.shapes.length === 0) {
            container.innerHTML = '<p class="empty-msg" style="color: var(--text-sub); font-size: 0.85rem;">Фігури ще не створені</p>';
            return;
        }

        container.innerHTML = this.editorState.shapes.map((s, idx) => `
            <div class="shape-item ${this.editorState.selectedShapeId === s.id ? 'active' : ''}" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; margin-bottom: 4px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                <span onclick="TeacherEngine.selectShape(${s.id})" style="cursor: pointer;">
                    <i class="fa-solid ${s.type === 'point' ? 'fa-location-dot' : 'fa-draw-polygon'}"></i>
                    ${window.Utils ? window.Utils.escapeHtml(s.label) : s.label}
                </span>
                <button onclick="TeacherEngine.deleteShape(${s.id})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');

        this.updateQuestionTargetOptions();
    },

    selectShape(id) {
        this.editorState.selectedShapeId = id;
        this.renderShapesList();
        this.redraw();
    },

    deleteShape(id) {
        this.editorState.shapes = this.editorState.shapes.filter(s => s.id !== id);
        if (this.editorState.selectedShapeId === id) {
            this.editorState.selectedShapeId = null;
        }
        this.renderShapesList();
        this.redraw();
    },

    updateQuestionTargetOptions() {
        const select = document.getElementById('questionTargetShapeSelect');
        if (!select) return;

        select.innerHTML = this.editorState.shapes.map(s => `
            <option value="${s.id}">${s.label} (${s.type})</option>
        `).join('');
    },

    addQuestionPrompt() {
        const textInput = document.getElementById('questionTextInput');
        const targetSelect = document.getElementById('questionTargetShapeSelect');

        if (!textInput || !textInput.value.trim()) {
            if (window.UI) window.UI.showToast('Введіть текст питання', 'error');
            return;
        }

        const newQuestion = {
            id: Date.now(),
            text: textInput.value.trim(),
            targetShapeId: parseInt(targetSelect.value)
        };

        this.editorState.questions.push(newQuestion);
        textInput.value = '';
        this.renderQuestionsList();
    },

    renderQuestionsList() {
        const container = document.getElementById('questionsListContainer');
        if (!container) return;

        container.innerHTML = this.editorState.questions.map((q, idx) => `
            <div class="question-item" style="padding: 8px; margin-bottom: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; display: flex; justify-content: space-between;">
                <div>
                    <strong>#${idx + 1}</strong> ${window.Utils ? window.Utils.escapeHtml(q.text) : q.text}
                </div>
                <button onclick="TeacherEngine.deleteQuestion(${q.id})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        `).join('');
    },

    deleteQuestion(id) {
        this.editorState.questions = this.editorState.questions.filter(q => q.id !== id);
        this.renderQuestionsList();
    },

    // ------------------------------------------------------------------------
    // 5. ЗБЕРЕЖЕННЯ ТЕСТУ
    // ------------------------------------------------------------------------
    saveCurrentTest() {
        const titleInput = document.getElementById('testTitleInput');
        const urlInput = document.getElementById('testMapUrlInput');
        const categoryInput = document.getElementById('testCategorySelect');

        if (!titleInput?.value.trim() || !urlInput?.value.trim()) {
            if (window.UI) window.UI.showToast('Заповніть назву та URL карти', 'error');
            return;
        }

        const newTest = {
            id: this.editorState.activeTestId || (window.Utils ? window.Utils.generateUniqueId() : 'test_' + Date.now()),
            title: titleInput.value.trim(),
            category: categoryInput ? categoryInput.value : 'geography',
            mapUrl: urlInput.value.trim(),
            shapes: this.editorState.shapes,
            questions: this.editorState.questions
        };

        if (window.FirebaseDB) {
            window.FirebaseDB.saveTest(newTest);
        } else {
            const storageKey = window.INTERMAP_CONFIG ? window.INTERMAP_CONFIG.STORAGE_KEYS.TESTS : 'intermap_tests';
            const tests = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const existingIndex = tests.findIndex(t => t.id === newTest.id);

            if (existingIndex >= 0) {
                tests[existingIndex] = newTest;
            } else {
                tests.push(newTest);
            }

            localStorage.setItem(storageKey, JSON.stringify(tests));
        }

        if (window.UI) window.UI.showToast('Тест успішно збережено!', 'success');
        if (window.IntermapEngine) window.IntermapEngine.loadCatalog();
    }
};

// Автоматична ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    TeacherEngine.init();
});

// Експорт у глобальну область видимості
window.TeacherEngine = TeacherEngine;