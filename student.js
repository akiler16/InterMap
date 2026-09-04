/**
 * ============================================================================
 * INTERMAP STUDENT / QUIZ ENGINE (student.js)
 * ============================================================================
 * Модуль для учнів:
 * - Студентське полотно (Student Canvas Engine) з зумуванням та панорамуванням
 * - Тестовий рушій (QuizEngine): перевірка відповідей, таймер, результат
 * - Синтезатор звукових ефектів (AudioEngine) для зворотної зв'язку
 * ============================================================================
 */

// ============================================================================
// 1. CANVAS ENGINE (СТУДЕНТСЬКЕ ПОЛОТНО)
// ============================================================================

const CanvasEngine = {
    initCanvasEngine() {
        const canvas = document.getElementById('studentCanvas');
        if (!canvas) return;

        IntermapState.studentCanvas.element = canvas;
        IntermapState.studentCanvas.ctx = canvas.getContext('2d');

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
        if (e.button === 1 || e.shiftKey) { 
            const c = IntermapState.studentCanvas;
            c.isPanning = true;
            c.startPanX = e.clientX - c.panX;
            c.startPanY = e.clientY - c.startPanY;
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

        const coords = this.getTransformedCoords(e);
        const test = IntermapState.activeTest;
        if (!test || !test.shapes) return;

        let foundShape = null;
        for (let shape of test.shapes) {
            if (window.Geometry && window.Geometry.isPointInShape(coords, shape)) {
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

        let clickedShape = null;
        if (test.shapes) {
            for (let shape of test.shapes) {
                if (window.Geometry && window.Geometry.isPointInShape(coords, shape)) {
                    clickedShape = shape;
                    break;
                }
            }
        }

        c.clicksHistory.push({
            x: coords.x,
            y: coords.y,
            isCorrect: clickedShape ? true : false
        });

        QuizEngine.processStudentAnswer(clickedShape, coords);
        redrawStudentCanvas();
    }
};

function redrawStudentCanvas() {
    const canvas = document.getElementById('studentCanvas');
    const c = IntermapState.studentCanvas;
    if (!canvas || !c.ctx) return;

    const ctx = c.ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(c.panX, c.panY);
    ctx.scale(c.zoom, c.zoom);

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
// 2. QUIZ ENGINE (РУШІЙ ТЕСТУВАННЯ)
// ============================================================================

const QuizEngine = {
    async startTest(testId) {
        let test = null;
        const storageKey = window.INTERMAP_CONFIG ? window.INTERMAP_CONFIG.STORAGE_KEYS.TESTS : 'intermap_tests';
        const tests = JSON.parse(localStorage.getItem(storageKey) || '[]');
        test = tests.find(t => t.id === testId);

        if (!test && window.INTERMAP_CONFIG && testId === window.INTERMAP_CONFIG.DEFAULT_MAP.id) {
            test = window.INTERMAP_CONFIG.DEFAULT_MAP;
        }

        if (!test) {
            if (window.UI) window.UI.showToast('Тест не знайдено в системі', 'error');
            return;
        }

        IntermapState.activeTest = test;
        IntermapState.currentQuestionIndex = 0;
        IntermapState.userAnswers = [];
        IntermapState.score = 0;
        IntermapState.studentCanvas.clicksHistory = [];
        IntermapState.totalTimeSpent = 0;

        if (window.UI) window.UI.showModal('quizModal');
        CanvasEngine.resizeCanvasToContainer();

        try {
            await CanvasEngine.loadMapImage(test.mapUrl);
        } catch (e) {
            if (window.UI) window.UI.showToast('Помилка завантаження картографічного фону', 'error');
        }

        this.startTimer();
        this.renderCurrentQuestion();
        AudioEngine.play('start');
    },

    startTimer() {
        this.stopTimer();
        IntermapState.timeRemaining = 300; 
        this.updateTimerDisplay();

        IntermapState.timerInterval = setInterval(() => {
            IntermapState.timeRemaining--;
            IntermapState.totalTimeSpent++;
            this.updateTimerDisplay();

            if (IntermapState.timeRemaining <= 0) {
                this.stopTimer();
                if (window.UI) window.UI.showToast('Час вичерпано! Тест автоматично завершено.', 'info');
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
            if (window.UI) window.UI.showToast('У цьому тесті немає налаштованих питань', 'error');
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
            if (window.UI) window.UI.showToast('Правильно!', 'success');
        } else {
            AudioEngine.play('wrong');
            if (window.UI) window.UI.showToast('Невірно, спробуйте ще раз або переходьте далі', 'error');
        }

        IntermapState.userAnswers.push({
            questionId: currentQuestion.id,
            selectedShapeId: clickedShape ? clickedShape.id : null,
            clickCoords: coords,
            isCorrect: isCorrect
        });

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

        const submissionsKey = window.INTERMAP_CONFIG ? window.INTERMAP_CONFIG.STORAGE_KEYS.SUBMISSIONS : 'intermap_submissions';
        const submissions = JSON.parse(localStorage.getItem(submissionsKey) || '[]');
        submissions.push(submission);
        localStorage.setItem(submissionsKey, JSON.stringify(submissions));

        AudioEngine.play('finish');
        if (window.UI) window.UI.showResultsModal(submission);
        if (window.IntermapEngine) window.IntermapEngine.updateUserInterface();
    }
};

// ============================================================================
// 3. AUDIO ENGINE (СИНТЕЗАТОР ЗВУКІВ)
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
            osc.frequency.setValueAtTime(523.25, now); 
            osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); 
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

// Експорт у глобальну область видимості
window.CanvasEngine = CanvasEngine;
window.QuizEngine = QuizEngine;
window.AudioEngine = AudioEngine;
window.redrawStudentCanvas = redrawStudentCanvas;