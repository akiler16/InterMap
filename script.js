// ==========================================
// 1. ГЛОБАЛЬНИЙ СТАН ТА КОНФІГУРАЦІЯ
// ==========================================

const DEFAULT_PASSWORD = 'admin';
let teacherPassword = localStorage.getItem('teacherPassword') || DEFAULT_PASSWORD;

// Поточний стан тесту вчителя
let currentTest = {
    id: null,
    title: '',
    email: '',
    imageSrc: '',
    tasks: []
};

// Стан малювання для вчителя
let currentTaskType = 'marker'; // 'marker' або 'donut'
let currentStandardPoint = null;
let donutOuterPolygon = [];
let donutInnerPolygon = [];
let currentDrawingMode = 'outer'; // 'outer' або 'inner'
let isDrawing = false;

// Стан виконання тесту учнем
let loadedTest = null;
let activeTaskIndex = null;
let studentAnswers = {}; // { taskIndex: { x, y } АБО [ {x, y}, ... ] }
let isStudentDrawing = false;
let currentStudentPolygon = []; // Тимчасовий масив точок для малювання контуру учнем

// ==========================================
// 2. ІНІЦІАЛІЗАЦІЯ ПІСЛЯ ЗАВАНТАЖЕННЯ DOM
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initTeacherAuth();
    initTeacherPanel();
    initStudentPanel();
});

// ==========================================
// 3. АВТОРИЗАЦІЯ ВЧИТЕЛЯ
// ==========================================

function initTeacherAuth() {
    const authModal = document.getElementById('authModal');
    const teacherContent = document.getElementById('teacherContent');
    const loginForm = document.getElementById('teacherLoginForm');
    const passInput = document.getElementById('teacherPasswordInput');
    const changePassBtn = document.getElementById('changePassBtn');

    if (!authModal || !teacherContent) return;

    if (sessionStorage.getItem('isTeacherAuthed') === 'true') {
        authModal.style.display = 'none';
        teacherContent.style.display = 'block';
        renderHistoryList();
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputVal = passInput.value.trim();

            if (inputVal === teacherPassword) {
                sessionStorage.setItem('isTeacherAuthed', 'true');
                authModal.style.display = 'none';
                teacherContent.style.display = 'block';
                renderHistoryList();
            } else {
                alert('Невірний пароль! Початковий пароль: admin');
                passInput.value = '';
            }
        });
    }

    if (changePassBtn) {
        changePassBtn.addEventListener('click', () => {
            const oldPass = prompt('Введіть поточний пароль:');
            if (oldPass === teacherPassword) {
                const newPass = prompt('Введіть новий пароль:');
                if (newPass && newPass.trim().length > 0) {
                    teacherPassword = newPass.trim();
                    localStorage.setItem('teacherPassword', teacherPassword);
                    alert('Пароль успішно змінено!');
                }
            } else if (oldPass !== null) {
                alert('Невірний поточний пароль!');
            }
        });
    }
}

// ==========================================
// 4. ЛОГІКА ПАНЕЛІ ВЧИТЕЛЯ
// ==========================================

function initTeacherPanel() {
    const mapImageInput = document.getElementById('mapImage');
    const mapImagePreview = document.getElementById('mapImagePreview');
    const mapWrapper = document.getElementById('teacherMapWrapper');
    const taskSection = document.getElementById('taskSection');
    const taskTypeSelect = document.getElementById('taskType');
    const addTaskBtn = document.getElementById('addTask');
    const generateBtn = document.getElementById('generateStudentLink');
    const copyLinkBtn = document.getElementById('copyLinkBtn');

    if (!mapImageInput) return;

    mapImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                mapImagePreview.src = evt.target.result;
                currentTest.imageSrc = evt.target.result;
                mapWrapper.style.display = 'block';
                taskSection.style.display = 'block';
                
                mapImagePreview.onload = () => {
                    setupTeacherCanvas();
                };
            };
            reader.readAsDataURL(file);
        }
    });

    if (taskTypeSelect) {
        taskTypeSelect.addEventListener('change', (e) => {
            currentTaskType = e.target.value;
            resetDonutDrawing();
            currentStandardPoint = null;
            redrawTeacherCanvas();
            updateTeacherInstructions();
        });
    }

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            const text = document.getElementById('taskText').value.trim();
            const plus = parseInt(document.getElementById('taskPointsPlus').value) || 5;
            const minus = parseInt(document.getElementById('taskPointsMinus').value) || 2;

            if (!text) {
                alert('Будь ласка, введіть текст завдання!');
                return;
            }

            let newTask = {
                id: Date.now(),
                type: currentTaskType,
                text: text,
                points: { plus, minus }
            };

            if (currentTaskType === 'marker') {
                if (!currentStandardPoint) {
                    alert('Будь ласка, поставте точкову мітку на карті!');
                    return;
                }
                newTask.standardPoint = currentStandardPoint;
            } else if (currentTaskType === 'donut') {
                if (donutOuterPolygon.length < 3 || donutInnerPolygon.length < 3) {
                    alert('Необхідно намалювати і зовнішній, і внутрішній контур!');
                    return;
                }
                newTask.donut = {
                    outer: [...donutOuterPolygon],
                    inner: [...donutInnerPolygon]
                };
            }

            currentTest.tasks.push(newTask);
            
            document.getElementById('taskText').value = '';
            currentStandardPoint = null;
            resetDonutDrawing();
            renderTeacherTasks();
            alert('Завдання успішно додано до тесту!');
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const title = document.getElementById('testTitle').value.trim();
            const email = document.getElementById('teacherEmail').value.trim();

            if (!title) {
                alert('Введіть назву тесту!');
                return;
            }
            if (currentTest.tasks.length === 0) {
                alert('Додайте хоча б одне завдання до тесту!');
                return;
            }

            const code = generateUniqueCode();
            currentTest.id = code;
            currentTest.title = title;
            currentTest.email = email;
            currentTest.createdAt = new Date().toLocaleString('uk-UA');

            let testsHistory = JSON.parse(localStorage.getItem('testsHistory') || '{}');
            testsHistory[code] = currentTest;
            localStorage.setItem('testsHistory', JSON.stringify(testsHistory));

            const linkInput = document.getElementById('studentLinkInput');
            const shareContainer = document.getElementById('shareLinkContainer');
            const studentUrl = `${window.location.origin}${window.location.pathname.replace('teacher.html', 'student.html')}?code=${code}`;
            
            linkInput.value = studentUrl;
            shareContainer.style.display = 'block';

            renderHistoryList();
            alert(`Тест опубліковано! Код тесту: ${code}`);
        });
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const linkInput = document.getElementById('studentLinkInput');
            linkInput.select();
            document.execCommand('copy');
            alert('Посилання скопійовано у буфер обміну!');
        });
    }
}

function updateTeacherInstructions() {
    const mapInstruction = document.getElementById('mapInstruction');
    const container = document.getElementById('teacherMapContainer');

    if (!mapInstruction || !container) return;

    if (currentTaskType === 'donut') {
        if (currentDrawingMode === 'outer') {
            mapInstruction.innerHTML = '🍩 <b>Крок 1 (Зовнішня межа):</b> Затисніть мишу/палець та обведіть <b>ЗОВНІШНІЙ</b> контур.';
            container.className = 'map-container drawing-outer';
        } else {
            mapInstruction.innerHTML = '🍩 <b>Крок 2 (Внутрішня межа):</b> Обведіть <b>ВНУТРІШНІЙ</b> контур ("дірку" пончика).';
            container.className = 'map-container drawing-inner';
        }
    } else {
        mapInstruction.innerHTML = '📍 <b>Режим "Мітка":</b> Натисніть на карту в точці, де має бути правильна відповідь.';
        container.className = 'map-container';
    }
}

// ==========================================
// 5. МАЛЮВАННЯ НА CANVAS (ВЧИТЕЛЬ)
// ==========================================

function setupTeacherCanvas() {
    const canvas = document.getElementById('teacherCanvas');
    const mapImg = document.getElementById('mapImagePreview');
    if (!canvas || !mapImg) return;

    canvas.width = mapImg.clientWidth;
    canvas.height = mapImg.clientHeight;

    canvas.addEventListener('mousedown', handleTeacherPointerDown);
    canvas.addEventListener('mousemove', handleTeacherPointerMove);
    canvas.addEventListener('mouseup', handleTeacherPointerUp);

    canvas.addEventListener('touchstart', (e) => { handleTeacherPointerDown(e.touches[0]); e.preventDefault(); });
    canvas.addEventListener('touchmove', (e) => { handleTeacherPointerMove(e.touches[0]); e.preventDefault(); });
    canvas.addEventListener('touchend', handleTeacherPointerUp);
}

function handleTeacherPointerDown(e) {
    const point = getNormalizedCoordinates(e);

    if (currentTaskType === 'marker') {
        currentStandardPoint = point;
        redrawTeacherCanvas();
    } else if (currentTaskType === 'donut') {
        isDrawing = true;
        if (currentDrawingMode === 'outer') {
            donutOuterPolygon = [point];
        } else {
            donutInnerPolygon = [point];
        }
    }
}

function handleTeacherPointerMove(e) {
    if (!isDrawing || currentTaskType !== 'donut') return;
    const point = getNormalizedCoordinates(e);

    if (currentDrawingMode === 'outer') {
        donutOuterPolygon.push(point);
    } else {
        donutInnerPolygon.push(point);
    }
    redrawTeacherCanvas();
}

function handleTeacherPointerUp() {
    if (!isDrawing || currentTaskType !== 'donut') return;
    isDrawing = false;

    if (currentDrawingMode === 'outer' && donutOuterPolygon.length > 2) {
        currentDrawingMode = 'inner';
        updateTeacherInstructions();
    } else if (currentDrawingMode === 'inner' && donutInnerPolygon.length > 2) {
        updateTeacherInstructions();
        alert('✅ Обидва контури сформовано! Тепер введіть текст завдання та натисніть "Зберегти".');
    }
}

function resetDonutDrawing() {
    donutOuterPolygon = [];
    donutInnerPolygon = [];
    currentDrawingMode = 'outer';
    isDrawing = false;
    updateTeacherInstructions();
    redrawTeacherCanvas();
}

function redrawTeacherCanvas() {
    const canvas = document.getElementById('teacherCanvas');
    const mapImg = document.getElementById('mapImagePreview');
    if (!canvas || !mapImg) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    if (currentTaskType === 'marker' && currentStandardPoint) {
        const px = (currentStandardPoint.x / 100) * w;
        const py = (currentStandardPoint.y / 100) * h;

        ctx.beginPath();
        ctx.arc(px, py, 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#e53e3e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    if (donutOuterPolygon.length > 1) {
        drawPolygonOnContext(ctx, donutOuterPolygon, w, h, '#38a169', 'rgba(56, 161, 105, 0.2)');
    }

    if (donutInnerPolygon.length > 1) {
        drawPolygonOnContext(ctx, donutInnerPolygon, w, h, '#e53e3e', 'rgba(229, 62, 62, 0.3)');
    }
}

function renderTeacherTasks() {
    const list = document.getElementById('teacherTasksList');
    if (!list) return;

    if (currentTest.tasks.length === 0) {
        list.innerHTML = '<p class="empty-text">Ще немає доданих завдань.</p>';
        return;
    }

    list.innerHTML = currentTest.tasks.map((task, index) => `
        <li class="task-item">
            <div>
                <b>${index + 1}. ${task.text}</b> 
                <span style="font-size: 0.85rem; color: #718096; margin-left: 10px;">
                    (${task.type === 'donut' ? '🍩 Пончик' : '📌 Мітка'} | +${task.points.plus} / -${task.points.minus} б.)
                </span>
            </div>
            <button onclick="removeTeacherTask(${index})" class="btn danger-btn" style="padding: 4px 10px; font-size: 0.8rem;">Видалити</button>
        </li>
    `).join('');
}

function removeTeacherTask(index) {
    currentTest.tasks.splice(index, 1);
    renderTeacherTasks();
}

function renderHistoryList() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    const testsHistory = JSON.parse(localStorage.getItem('testsHistory') || '{}');
    const keys = Object.keys(testsHistory);

    if (keys.length === 0) {
        historyList.innerHTML = '<p class="empty-text">Історія порожня.</p>';
        return;
    }

    historyList.innerHTML = keys.map(code => {
        const item = testsHistory[code];
        return `
            <li class="task-item">
                <div>
                    <span class="badge-code">${code}</span>
                    <b style="margin-left: 10px;">${item.title}</b>
                    <span style="font-size: 0.85rem; color: #718096; display: block;">Створено: ${item.createdAt || 'Невідомо'}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="copyCodeLink('${code}')" class="btn primary-btn" style="padding: 4px 10px; font-size: 0.8rem;">Копіювати посилання</button>
                    <button onclick="deleteHistoryItem('${code}')" class="btn danger-btn" style="padding: 4px 10px; font-size: 0.8rem;">Видалити</button>
                </div>
            </li>
        `;
    }).join('');
}

function copyCodeLink(code) {
    const studentUrl = `${window.location.origin}${window.location.pathname.replace('teacher.html', 'student.html')}?code=${code}`;
    navigator.clipboard.writeText(studentUrl);
    alert('Посилання скопійовано!');
}

function deleteHistoryItem(code) {
    if (confirm(`Видалити тест ${code} з історії?`)) {
        let testsHistory = JSON.parse(localStorage.getItem('testsHistory') || '{}');
        delete testsHistory[code];
        localStorage.setItem('testsHistory', JSON.stringify(testsHistory));
        renderHistoryList();
    }
}

// ==========================================
// 6. ЛОГІКА ПАНЕЛІ УЧНЯ
// ==========================================

function initStudentPanel() {
    const loadTestBtn = document.getElementById('loadTestBtn');
    const submitWorkBtn = document.getElementById('submitWorkBtn');

    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code');

    if (codeFromUrl) {
        loadTestByCode(codeFromUrl);
    }

    if (loadTestBtn) {
        loadTestBtn.addEventListener('click', () => {
            const inputCode = document.getElementById('studentCodeInput').value.trim();
            if (inputCode) {
                loadTestByCode(inputCode);
            } else {
                alert('Введіть код тесту!');
            }
        });
    }

    if (submitWorkBtn) {
        submitWorkBtn.addEventListener('click', checkStudentWork);
    }
}

function loadTestByCode(code) {
    const testsHistory = JSON.parse(localStorage.getItem('testsHistory') || '{}');
    const test = testsHistory[code];

    if (!test) {
        alert('Тест із таким кодом не знайдено!');
        return;
    }

    loadedTest = test;
    const loader = document.getElementById('codeLoaderSection');
    const area = document.getElementById('testArea');
    
    if (loader) loader.style.display = 'none';
    if (area) area.style.display = 'block';

    const titleElem = document.getElementById('displayTestTitle');
    if (titleElem) titleElem.innerText = loadedTest.title;

    const img = document.getElementById('studentMapImage');
    if (img) {
        img.src = loadedTest.imageSrc;
        img.onload = () => {
            setupStudentCanvas();
            renderStudentTasks();
        };
    }
}

function setupStudentCanvas() {
    const canvas = document.getElementById('studentCanvas');
    const mapImg = document.getElementById('studentMapImage');
    if (!canvas || !mapImg) return;

    canvas.width = mapImg.clientWidth;
    canvas.height = mapImg.clientHeight;

    // Події для точки та малювання контуру (миша)
    canvas.addEventListener('mousedown', handleStudentPointerDown);
    canvas.addEventListener('mousemove', handleStudentPointerMove);
    canvas.addEventListener('mouseup', handleStudentPointerUp);

    // Події для сенсорних екранів
    canvas.addEventListener('touchstart', (e) => { handleStudentPointerDown(e.touches[0]); e.preventDefault(); });
    canvas.addEventListener('touchmove', (e) => { handleStudentPointerMove(e.touches[0]); e.preventDefault(); });
    canvas.addEventListener('touchend', handleStudentPointerUp);
}

function handleStudentPointerDown(e) {
    if (activeTaskIndex === null) {
        alert('Спочатку оберіть завдання зі списку нижче!');
        return;
    }

    const task = loadedTest.tasks[activeTaskIndex];
    const point = getNormalizedCoordinates(e);

    if (task.type === 'marker') {
        studentAnswers[activeTaskIndex] = point;
        redrawStudentCanvas();
        renderStudentTasks();
    } else if (task.type === 'donut') {
        isStudentDrawing = true;
        currentStudentPolygon = [point];
    }
}

function handleStudentPointerMove(e) {
    if (!isStudentDrawing || activeTaskIndex === null) return;
    const task = loadedTest.tasks[activeTaskIndex];
    if (task.type !== 'donut') return;

    const point = getNormalizedCoordinates(e);
    currentStudentPolygon.push(point);
    
    redrawStudentCanvas();
    drawTempStudentPolygon();
}

function handleStudentPointerUp() {
    if (!isStudentDrawing || activeTaskIndex === null) return;
    isStudentDrawing = false;

    if (currentStudentPolygon.length > 2) {
        studentAnswers[activeTaskIndex] = [...currentStudentPolygon];
        currentStudentPolygon = [];
        redrawStudentCanvas();
        renderStudentTasks();
    } else {
        alert('Обведіть область повністю!');
        currentStudentPolygon = [];
        redrawStudentCanvas();
    }
}

function redrawStudentCanvas() {
    const canvas = document.getElementById('studentCanvas');
    const mapImg = document.getElementById('studentMapImage');
    if (!canvas || !mapImg) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    Object.keys(studentAnswers).forEach(idx => {
        const ans = studentAnswers[idx];
        const task = loadedTest.tasks[idx];

        if (task.type === 'marker') {
            const px = (ans.x / 100) * w;
            const py = (ans.y / 100) * h;

            ctx.beginPath();
            ctx.arc(px, py, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#3182ce';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(`№${parseInt(idx) + 1}`, px + 8, py + 4);
        } else if (task.type === 'donut' && Array.isArray(ans)) {
            drawPolygonOnContext(ctx, ans, w, h, '#3182ce', 'rgba(49, 130, 206, 0.3)');
        }
    });
}

function drawTempStudentPolygon() {
    const canvas = document.getElementById('studentCanvas');
    if (!canvas || currentStudentPolygon.length < 2) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    drawPolygonOnContext(ctx, currentStudentPolygon, w, h, '#3182ce', 'rgba(49, 130, 206, 0.2)');
}

function renderStudentTasks() {
    const container = document.getElementById('studentTasksContainer');
    if (!container || !loadedTest) return;

    container.innerHTML = loadedTest.tasks.map((task, index) => {
        const isDone = studentAnswers[index] !== undefined;
        const isActive = activeTaskIndex === index;

        let className = 'student-task-card';
        if (isActive) className += ' active-task';
        if (isDone) className += ' completed-task';

        return `
            <div class="${className}" onclick="selectTaskForStudent(${index})">
                <b>Завдання ${index + 1}: ${task.text}</b>
                <span style="float: right;">${isDone ? '✅ Відповідь поставлено' : '⏳ Очікує відповіді'}</span>
            </div>
        `;
    }).join('');
}

function selectTaskForStudent(index) {
    activeTaskIndex = index;
    const task = loadedTest.tasks[index];
    const studentInstruction = document.getElementById('studentInstruction');

    if (studentInstruction) {
        if (task.type === 'donut') {
            studentInstruction.innerHTML = `🍩 <b>Виконання завдання №${index + 1}:</b> ${task.text}. Затисніть мишку та обведіть область на карті.`;
        } else {
            studentInstruction.innerHTML = `📍 <b>Виконання завдання №${index + 1}:</b> ${task.text}. Натисніть на карту для позначення відповіді.`;
        }
    }
    renderStudentTasks();
}

// ==========================================
// 7. ЛОГІКА ТОЧНОЇ ПЕРЕВІРКИ ВІДПОВІДЕЙ
// ==========================================

function checkStudentWork() {
    const nameElem = document.getElementById('studentName');
    const name = nameElem ? nameElem.value.trim() : '';

    if (!name) {
        alert("Будь ласка, введіть своє Ім'я та Прізвище!");
        return;
    }

    let totalScore = 0;
    let maxScore = 0;
    let report = `Звіт для учня: ${name}\n\n`;

    loadedTest.tasks.forEach((task, index) => {
        maxScore += task.points.plus;
        const ans = studentAnswers[index];

        if (ans) {
            let isCorrect = false;

            if (task.type === 'marker') {
                // ПЕРЕВІРКА МІТКИ: похибка до 3% від розміру карти
                const dx = ans.x - task.standardPoint.x;
                const dy = ans.y - task.standardPoint.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                isCorrect = distance <= 3; 

            } else if (task.type === 'donut') {
                // ПЕРЕВІРКА ОБЛАСТІ: Розрахунок >80% влучання
                isCorrect = checkAreaCoverage(ans, task.donut);
            }

            if (isCorrect) {
                totalScore += task.points.plus;
                report += `Завдання ${index + 1} (${task.text}): Вірно (+${task.points.plus} б.)\n`;
            } else {
                totalScore -= task.points.minus;
                report += `Завдання ${index + 1} (${task.text}): Помилка (-${task.points.minus} б.)\n`;
            }
        } else {
            totalScore -= task.points.minus;
            report += `Завдання ${index + 1} (${task.text}): Не виконано (-${task.points.minus} б.)\n`;
        }
    });

    const resultsSection = document.getElementById('resultsSection');
    const scoreSummary = document.getElementById('scoreSummary');
    const detailedReport = document.getElementById('detailedReport');

    if (resultsSection && scoreSummary && detailedReport) {
        resultsSection.style.display = 'block';
        scoreSummary.innerHTML = `Набрано балів: ${totalScore} з ${maxScore} можливих`;
        detailedReport.innerText = report;
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Алгоритм підрахунку % влучання учня у цільову область (>80%)
function checkAreaCoverage(studentPoly, teacherDonut) {
    if (!studentPoly || studentPoly.length < 3) return false;

    let totalPoints = studentPoly.length;
    let validPoints = 0;

    studentPoly.forEach(pt => {
        const inOuter = isPointInPolygon(pt, teacherDonut.outer);
        const inInner = isPointInPolygon(pt, teacherDonut.inner);

        if (inOuter && !inInner) {
            validPoints++;
        }
    });

    const accuracyPercentage = (validPoints / totalPoints) * 100;
    return accuracyPercentage >= 80;
}

// Алгоритм Ray-casting (Point in Polygon)
function isPointInPolygon(point, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let x = point.x, y = point.y;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].x, yi = polygon[i].y;
        let xj = polygon[j].x, yj = polygon[j].y;

        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// ==========================================
// 8. ДОПОМІЖНІ ФУНКЦІЇ МАЛЮВАННЯ ТА КОРДИНАТ
// ==========================================

function getNormalizedCoordinates(e) {
    const mapImg = document.getElementById('mapImagePreview') || document.getElementById('studentMapImage');
    const rect = mapImg.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    };
}

function drawPolygonOnContext(ctx, polygon, w, h, strokeColor, fillColor) {
    if (!polygon || polygon.length === 0) return;
    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.moveTo((polygon[0].x / 100) * w, (polygon[0].y / 100) * h);
    for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo((polygon[i].x / 100) * w, (polygon[i].y / 100) * h);
    }
    ctx.closePath();
    ctx.stroke();
    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }
}

function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}