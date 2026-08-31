import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, remove, push, child, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ==========================================
// 1. КОНФІГУРАЦІЯ ТА ГЛОБАЛЬНИЙ СТАН
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyBZ28ZGCSTtb659rpmp0mgf_hcv1AVscFQ",
    authDomain: "intermap-app.firebaseapp.com",
    databaseURL: "https://intermap-app-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "intermap-app",
    storageBucket: "intermap-app.firebasestorage.app",
    messagingSenderId: "869707502446",
    appId: "1:869707502446:web:9cd7b1cab1c74f5e79e77f"
};

// Ініціалізація Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Telegram Bot Token
const BOT_TOKEN = "8847524737:AAEUqbQzjtstH7uzvHSx0Dpx4B9G_HbFM2g";

// Глобальний стан конструктора Вчителя
let currentTest = {
    id: null,
    title: '',
    telegramChatId: '',
    imageSrc: '',
    tasks: []
};

// Стан малювання Вчителя
let currentTaskType = 'point'; // 'point', 'multi-point', 'line', 'polygon', 'donut'
let currentStandardPoint = null;
let multiMarkers = [];
let currentPolyline = [];
let donutOuterPolygon = [];
let donutInnerPolygon = [];
let currentDrawingMode = 'outer'; // 'outer' або 'inner'
let isTeacherDrawing = false;
let useRedZone = false;

// Стан виконання Учня
let loadedTest = null;
let loadedTestCode = null;
let activeTaskIndex = null;
let studentAnswers = {}; 
let isStudentDrawing = false;
let currentStudentPolygon = [];
let currentStudentLine = [];

// Експорт функцій у глобальну область для HTML inline обробників
window.removeTeacherTask = removeTeacherTask;
window.copyCodeLink = copyCodeLink;
window.deleteTest = deleteTest;
window.selectTaskForStudent = selectTaskForStudent;
window.fetchMyChatId = fetchMyChatId;
window.clearCurrentShape = clearCurrentShape;

// ==========================================
// 2. ІНІЦІАЛІЗАЦІЯ ДОДАТКУ
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initTeacherPanel();
    initStudentPanel();
    initAdminPanel();
    setupGlobalResizeListeners();
});

function setupGlobalResizeListeners() {
    window.addEventListener('resize', () => {
        if (document.getElementById('teacherCanvas')) redrawTeacherCanvas();
        if (document.getElementById('studentCanvas')) redrawStudentCanvas();
    });
}

// ==========================================
// 3. ТЕЛЕГРАМ ІНТЕГРАЦІЯ ТА ДОПОМІЖНІ ФУНКЦІЇ
// ==========================================

async function fetchMyChatId() {
    const input = document.getElementById('teacherChatId');
    const btn = document.getElementById('getChatIdBtn');
    if (!input || !btn) return;

    btn.innerText = "⏳ Перевірка...";

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
            const lastUpdate = data.result[data.result.length - 1];
            let chatId = null;

            if (lastUpdate.message) {
                chatId = lastUpdate.message.chat.id;
            } else if (lastUpdate.my_chat_member) {
                chatId = lastUpdate.my_chat_member.chat.id;
            }

            if (chatId) {
                input.value = chatId;
                alert(`✅ Ваш Chat ID успішно знайдено: ${chatId}`);
            } else {
                alert("💬 Будь ласка, відправте будь-яке повідомлення боту у Telegram та спробуйте знову!");
            }
        } else {
            alert("⚠️ Не вдалося знайти нових повідомлень. Перейдіть у бот, натисніть START або напишіть йому!");
        }
    } catch (error) {
        console.error("Помилка Telegram API:", error);
        alert("Не вдалося автоматично отримати ID. Введіть його вручну.");
    } finally {
        btn.innerText = "📲 Отримати свій ID";
    }
}

function sendTelegramNotification(chatId, messageText) {
    if (!chatId) return;

    const cleanChatId = chatId.toString().trim();
    const payload = {
        chat_id: cleanChatId,
        text: messageText,
        parse_mode: 'HTML'
    };

    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.ok) {
            console.log("✅ Результати надіслано в Telegram!");
        } else {
            console.error("❌ Помилка Telegram:", data.description);
        }
    })
    .catch(err => console.error("❌ Мережева помилка Telegram:", err));
}

// ==========================================
// 4. ПАНЕЛЬ ВЧИТЕЛЯ (КОНСТРУКТОР)
// ==========================================

function initTeacherPanel() {
    const mapFileInput = document.getElementById('mapFileInput');
    const mapUrlInput = document.getElementById('mapUrl');
    const loadMapBtn = document.getElementById('loadMapBtn');
    const teacherMapImage = document.getElementById('teacherMapImage');
    const editorArea = document.getElementById('editorArea');
    const taskTypeSelect = document.getElementById('taskType');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const saveTestBtn = document.getElementById('saveTestBtn');
    const clearShapeBtn = document.getElementById('clearCurrentShapeBtn');

    if (!teacherMapImage) return;

    // Обробка файлу зображення з ПК
    if (mapFileInput) {
        mapFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    loadTeacherMapImage(evt.target.result);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Обробка зображення за посиланням
    if (loadMapBtn && mapUrlInput) {
        loadMapBtn.addEventListener('click', () => {
            const url = mapUrlInput.value.trim();
            if (url) {
                loadTeacherMapImage(url);
            } else {
                alert('Введіть коректне посилання на зображення!');
            }
        });
    }

    // Зміна типу завдання
    if (taskTypeSelect) {
        taskTypeSelect.addEventListener('change', (e) => {
            currentTaskType = e.target.value;
            clearCurrentShape();
        });
    }

    // Очищення контуру
    if (clearShapeBtn) {
        clearShapeBtn.addEventListener('click', clearCurrentShape);
    }

    // Додавання завдання
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addNewTeacherTask);
    }

    // Збереження тесту
    if (saveTestBtn) {
        saveTestBtn.addEventListener('click', saveTestAndGenerateCode);
    }

    renderTeacherHistoryList();
}

function loadTeacherMapImage(src) {
    const teacherMapImage = document.getElementById('teacherMapImage');
    const editorArea = document.getElementById('editorArea');

    teacherMapImage.src = src;
    currentTest.imageSrc = src;

    teacherMapImage.onload = () => {
        if (editorArea) editorArea.style.display = 'block';
        setupTeacherCanvas();
        clearCurrentShape();
    };

    teacherMapImage.onerror = () => {
        alert('Помилка завантаження зображення! Перевірте файл або посилання.');
    };
}

function setupTeacherCanvas() {
    const canvas = document.getElementById('teacherCanvas');
    const img = document.getElementById('teacherMapImage');
    if (!canvas || !img) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    canvas.onmousedown = handleTeacherPointerDown;
    canvas.onmousemove = handleTeacherPointerMove;
    canvas.onmouseup = handleTeacherPointerUp;

    canvas.ontouchstart = (e) => { handleTeacherPointerDown(e.touches[0]); e.preventDefault(); };
    canvas.ontouchmove = (e) => { handleTeacherPointerMove(e.touches[0]); e.preventDefault(); };
    canvas.ontouchend = (e) => { handleTeacherPointerUp(e); e.preventDefault(); };
}

function clearCurrentShape() {
    currentStandardPoint = null;
    multiMarkers = [];
    currentPolyline = [];
    donutOuterPolygon = [];
    donutInnerPolygon = [];
    currentDrawingMode = 'outer';
    isTeacherDrawing = false;
    redrawTeacherCanvas();
}

function handleTeacherPointerDown(e) {
    const point = getNormalizedCoordinates(e, 'teacherMapImage');

    if (currentTaskType === 'point' || currentTaskType === 'marker') {
        currentStandardPoint = point;
        redrawTeacherCanvas();
    } else if (currentTaskType === 'multi-point' || currentTaskType === 'multi-marker') {
        multiMarkers.push(point);
        redrawTeacherCanvas();
    } else if (currentTaskType === 'line') {
        currentPolyline.push(point);
        redrawTeacherCanvas();
    } else if (currentTaskType === 'polygon' || currentTaskType === 'donut') {
        isTeacherDrawing = true;
        if (currentDrawingMode === 'outer') {
            donutOuterPolygon.push(point);
        } else {
            donutInnerPolygon.push(point);
        }
        redrawTeacherCanvas();
    }
}

function handleTeacherPointerMove(e) {
    if (!isTeacherDrawing) return;
    const point = getNormalizedCoordinates(e, 'teacherMapImage');

    if (currentTaskType === 'polygon' || currentTaskType === 'donut') {
        if (currentDrawingMode === 'outer') {
            donutOuterPolygon.push(point);
        } else {
            donutInnerPolygon.push(point);
        }
        redrawTeacherCanvas();
    }
}

function handleTeacherPointerUp() {
    if (isTeacherDrawing) {
        isTeacherDrawing = false;
    }
}

function redrawTeacherCanvas() {
    const canvas = document.getElementById('teacherCanvas');
    const img = document.getElementById('teacherMapImage');
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    if (currentStandardPoint) {
        drawPointOnContext(ctx, currentStandardPoint, w, h, '#e53e3e', 'Еталон');
    }

    if (multiMarkers.length > 0) {
        multiMarkers.forEach((pt, i) => {
            drawPointOnContext(ctx, pt, w, h, '#3182ce', (i + 1).toString());
        });
    }

    if (currentPolyline.length > 0) {
        drawPolylineOnContext(ctx, currentPolyline, w, h, '#d69e2e');
    }

    if (donutOuterPolygon.length > 1) {
        drawPolygonOnContext(ctx, donutOuterPolygon, w, h, '#38a169', 'rgba(56, 161, 105, 0.3)');
    }

    if (donutInnerPolygon.length > 1) {
        drawPolygonOnContext(ctx, donutInnerPolygon, w, h, '#e53e3e', 'rgba(229, 62, 62, 0.4)');
    }
}

function addNewTeacherTask() {
    const instructionInput = document.getElementById('taskInstruction');
    const pointsInput = document.getElementById('taskPoints');

    const instruction = instructionInput ? instructionInput.value.trim() : '';
    const points = pointsInput ? parseInt(pointsInput.value) || 2 : 2;

    if (!instruction) {
        alert('Будь ласка, введіть інструкцію/текст завдання!');
        return;
    }

    let taskData = {
        id: Date.now(),
        type: currentTaskType,
        instruction: instruction,
        points: points
    };

    if (currentTaskType === 'point' || currentTaskType === 'marker') {
        if (!currentStandardPoint) {
            alert('Позначте еталонну точку на карті!');
            return;
        }
        taskData.standardPoint = currentStandardPoint;
    } else if (currentTaskType === 'multi-point' || currentTaskType === 'multi-marker') {
        if (multiMarkers.length < 2) {
            alert('Поставить хоча б 2 мітки на карті!');
            return;
        }
        taskData.multiPoints = [...multiMarkers];
    } else if (currentTaskType === 'line') {
        if (currentPolyline.length < 2) {
            alert('Намалюйте лінію або маршрут (мінімум 2 точки)!');
            return;
        }
        taskData.polyline = [...currentPolyline];
    } else if (currentTaskType === 'polygon' || currentTaskType === 'donut') {
        if (donutOuterPolygon.length < 3) {
            alert('Намалюйте замкнену область на карті (мінімум 3 точки)!');
            return;
        }
        taskData.polygon = {
            outer: [...donutOuterPolygon],
            inner: [...donutInnerPolygon]
        };
    }

    currentTest.tasks.push(taskData);
    instructionInput.value = '';
    clearCurrentShape();
    renderTeacherTasksList();
    alert('✅ Завдання додано до списку!');
}

function renderTeacherTasksList() {
    const container = document.getElementById('tasksList');
    if (!container) return;

    if (currentTest.tasks.length === 0) {
        container.innerHTML = '<p style="color: #a0aec0; font-style: italic;">Завдань поки немає.</p>';
        return;
    }

    container.innerHTML = currentTest.tasks.map((task, idx) => `
        <div class="task-item">
            <div>
                <b>${idx + 1}. ${task.instruction}</b>
                <div style="font-size:0.8rem; color:#718096;">
                    Тип: ${getTaskTypeName(task.type)} | Макс. бал: ${task.points}
                </div>
            </div>
            <button onclick="removeTeacherTask(${idx})" class="btn danger-btn" style="padding: 4px 10px; font-size: 0.8rem;">Видалити</button>
        </div>
    `).join('');
}

function getTaskTypeName(type) {
    switch (type) {
        case 'point': case 'marker': return 'Мітка';
        case 'multi-point': case 'multi-marker': return 'Кілька міток';
        case 'line': return 'Лінія/Маршрут';
        case 'polygon': case 'donut': return 'Область/Полігон';
        default: return 'Елемент';
    }
}

function removeTeacherTask(index) {
    currentTest.tasks.splice(index, 1);
    renderTeacherTasksList();
}

async function saveTestAndGenerateCode() {
    const titleInput = document.getElementById('testTitle');
    const title = titleInput ? titleInput.value.trim() : '';

    if (!title) {
        alert('Укажіть назву тесту!');
        return;
    }

    if (currentTest.tasks.length === 0) {
        alert('Створіть хоча б одне завдання!');
        return;
    }

    const code = generateUnique10Code();
    currentTest.id = code;
    currentTest.title = title;
    currentTest.createdAt = new Date().toLocaleString('uk-UA');

    try {
        const testRef = ref(db, 'tests/' + code);
        await set(testRef, currentTest);

        const codeSec = document.getElementById('generatedCodeSection');
        const codeDisplay = document.getElementById('testCodeDisplay');

        if (codeDisplay) codeDisplay.innerText = code;
        if (codeSec) codeSec.style.display = 'block';

        let history = JSON.parse(localStorage.getItem('teacherHistory') || '{}');
        history[code] = currentTest;
        localStorage.setItem('teacherHistory', JSON.stringify(history));

        renderTeacherHistoryList();
        alert(`🎉 Тест успішно створено! Код: ${code}`);
    } catch (e) {
        console.error("Помилка збереження тесту:", e);
        alert("Не вдалося зберегти тест в БД: " + e.message);
    }
}

function renderTeacherHistoryList() {
    const historyContainer = document.getElementById('teacherHistoryList');
    if (!historyContainer) return;

    const history = JSON.parse(localStorage.getItem('teacherHistory') || '{}');
    const keys = Object.keys(history);

    if (keys.length === 0) {
        historyContainer.innerHTML = '<p style="color:#a0aec0; font-style:italic;">Створених тестів не знайдено.</p>';
        return;
    }

    historyContainer.innerHTML = keys.map(code => `
        <div class="task-item">
            <div>
                <b style="color:#3182ce;">${code}</b> — ${history[code].title}
            </div>
            <div style="display:flex; gap:6px;">
                <button onclick="copyCodeLink('${code}')" class="btn primary-btn" style="padding:4px 8px; font-size:0.8rem;">Копіювати</button>
                <button onclick="deleteTest('${code}')" class="btn danger-btn" style="padding:4px 8px; font-size:0.8rem;">Видалити</button>
            </div>
        </div>
    `).join('');
}

function copyCodeLink(code) {
    const url = `${window.location.origin}${window.location.pathname.replace('teacher.html', 'student.html')}?code=${code}`;
    navigator.clipboard.writeText(url);
    alert('Посилання на тест скопійовано у буфер обміну!');
}

async function deleteTest(code) {
    if (!confirm(`Ви впевнені, що хочете видалити тест ${code}?`)) return;

    let history = JSON.parse(localStorage.getItem('teacherHistory') || '{}');
    delete history[code];
    localStorage.setItem('teacherHistory', JSON.stringify(history));

    try {
        await remove(ref(db, 'tests/' + code));
        await remove(ref(db, 'results/' + code));
    } catch (e) {
        console.error("Помилка видалення тесту з Firebase:", e);
    }

    renderTeacherHistoryList();
    alert('Тест успішно видалено!');
}

// ==========================================
// 5. ПАНЕЛЬ УЧНЯ (ПРОХОДЖЕННЯ)
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
                alert('Введіть 10-значний код тесту!');
            }
        });
    }

    if (submitWorkBtn) {
        submitWorkBtn.addEventListener('click', checkStudentWork);
    }
}

async function loadTestByCode(code) {
    let test = await loadTestFromFirebase(code);

    if (!test) {
        const history = JSON.parse(localStorage.getItem('teacherHistory') || '{}');
        test = history[code];
    }

    if (!test) {
        alert('❌ Тест із таким кодом не знайдено!');
        return;
    }

    loadedTest = test;
    loadedTestCode = code;

    const loaderSec = document.getElementById('codeLoaderSection');
    const testArea = document.getElementById('testArea');

    if (loaderSec) loaderSec.style.display = 'none';
    if (testArea) testArea.style.display = 'block';

    const displayTitle = document.getElementById('displayTestTitle');
    if (displayTitle) displayTitle.innerText = loadedTest.title;

    const studentMapImg = document.getElementById('studentMapImage');
    if (studentMapImg) {
        studentMapImg.src = loadedTest.imageSrc;
        studentMapImg.onload = () => {
            setupStudentCanvas();
            renderStudentTasks();
        };
    }
}

function setupStudentCanvas() {
    const canvas = document.getElementById('studentCanvas');
    const img = document.getElementById('studentMapImage');
    if (!canvas || !img) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    canvas.onmousedown = handleStudentPointerDown;
    canvas.onmousemove = handleStudentPointerMove;
    canvas.onmouseup = handleStudentPointerUp;

    canvas.ontouchstart = (e) => { handleStudentPointerDown(e.touches[0]); e.preventDefault(); };
    canvas.ontouchmove = (e) => { handleStudentPointerMove(e.touches[0]); e.preventDefault(); };
    canvas.ontouchend = (e) => { handleStudentPointerUp(e); e.preventDefault(); };
}

function handleStudentPointerDown(e) {
    if (activeTaskIndex === null) {
        alert('Оберіть завдання зі списку нижче!');
        return;
    }

    const task = loadedTest.tasks[activeTaskIndex];
    const pt = getNormalizedCoordinates(e, 'studentMapImage');

    if (task.type === 'point' || task.type === 'marker') {
        studentAnswers[activeTaskIndex] = pt;
        redrawStudentCanvas();
        renderStudentTasks();
    } else if (task.type === 'multi-point' || task.type === 'multi-marker') {
        if (!Array.isArray(studentAnswers[activeTaskIndex])) {
            studentAnswers[activeTaskIndex] = [];
        }
        if (studentAnswers[activeTaskIndex].length < (task.multiPoints ? task.multiPoints.length : 5)) {
            studentAnswers[activeTaskIndex].push(pt);
            redrawStudentCanvas();
            renderStudentTasks();
        } else {
            alert('Ви вже поставили максимальну кількість міток для цього завдання!');
        }
    } else if (task.type === 'line') {
        isStudentDrawing = true;
        currentStudentLine = [pt];
    } else if (task.type === 'polygon' || task.type === 'donut') {
        isStudentDrawing = true;
        currentStudentPolygon = [pt];
    }
}

function handleStudentPointerMove(e) {
    if (!isStudentDrawing || activeTaskIndex === null) return;

    const task = loadedTest.tasks[activeTaskIndex];
    const pt = getNormalizedCoordinates(e, 'studentMapImage');

    if (task.type === 'line') {
        currentStudentLine.push(pt);
        redrawStudentCanvas();
    } else if (task.type === 'polygon' || task.type === 'donut') {
        currentStudentPolygon.push(pt);
        redrawStudentCanvas();
    }
}

function handleStudentPointerUp() {
    if (!isStudentDrawing || activeTaskIndex === null) return;
    isStudentDrawing = false;

    const task = loadedTest.tasks[activeTaskIndex];

    if (task.type === 'line') {
        if (currentStudentLine.length > 1) {
            studentAnswers[activeTaskIndex] = [...currentStudentLine];
        }
        currentStudentLine = [];
    } else if (task.type === 'polygon' || task.type === 'donut') {
        if (currentStudentPolygon.length > 2) {
            studentAnswers[activeTaskIndex] = [...currentStudentPolygon];
        }
        currentStudentPolygon = [];
    }

    redrawStudentCanvas();
    renderStudentTasks();
}

function redrawStudentCanvas() {
    const canvas = document.getElementById('studentCanvas');
    const img = document.getElementById('studentMapImage');
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    Object.keys(studentAnswers).forEach(taskIdx => {
        const ans = studentAnswers[taskIdx];
        const task = loadedTest.tasks[taskIdx];
        const label = `№${parseInt(taskIdx) + 1}`;

        if (task.type === 'point' || task.type === 'marker') {
            drawPointOnContext(ctx, ans, w, h, '#3182ce', label);
        } else if (task.type === 'multi-point' || task.type === 'multi-marker') {
            if (Array.isArray(ans)) {
                ans.forEach((pt, i) => drawPointOnContext(ctx, pt, w, h, '#3182ce', `${label}.${i+1}`));
            }
        } else if (task.type === 'line') {
            if (Array.isArray(ans)) drawPolylineOnContext(ctx, ans, w, h, '#3182ce');
        } else if (task.type === 'polygon' || task.type === 'donut') {
            if (Array.isArray(ans)) drawPolygonOnContext(ctx, ans, w, h, '#3182ce', 'rgba(49, 130, 206, 0.3)');
        }
    });

    if (isStudentDrawing) {
        if (currentStudentLine.length > 0) drawPolylineOnContext(ctx, currentStudentLine, w, h, '#3182ce');
        if (currentStudentPolygon.length > 0) drawPolygonOnContext(ctx, currentStudentPolygon, w, h, '#3182ce', 'rgba(49, 130, 206, 0.2)');
    }
}

function renderStudentTasks() {
    const container = document.getElementById('studentTasksContainer');
    if (!container || !loadedTest) return;

    container.innerHTML = loadedTest.tasks.map((task, idx) => {
        const ans = studentAnswers[idx];
        const isCompleted = ans !== undefined && ans !== null && (!Array.isArray(ans) || ans.length > 0);
        const isActive = activeTaskIndex === idx;

        let className = 'student-task-card';
        if (isActive) className += ' active-task';
        if (isCompleted) className += ' completed-task';

        return `
            <div class="${className}" onclick="selectTaskForStudent(${idx})">
                <b>Завдання ${idx + 1}: ${task.instruction}</b>
                <span style="float: right; font-weight: bold;">
                    ${isCompleted ? '✅ Виконано' : '⏳ Очікує'}
                </span>
            </div>
        `;
    }).join('');
}

function selectTaskForStudent(idx) {
    activeTaskIndex = idx;
    const task = loadedTest.tasks[idx];
    const instrBox = document.getElementById('studentInstruction');

    if (instrBox) {
        instrBox.innerHTML = `👉 <b>Завдання ${idx + 1}:</b> ${task.instruction}`;
    }

    renderStudentTasks();
}

// ==========================================
// 6. АЛГОРИТМИ ПЕРЕВІРКИ ТА ОБЧИСЛЕНЬ
// ==========================================

async function checkStudentWork() {
    const nameInput = document.getElementById('studentName');
    const classInput = document.getElementById('studentClass');

    const name = nameInput ? nameInput.value.trim() : '';
    const studentClass = classInput ? classInput.value.trim() : '';

    if (!name) {
        alert("Введіть своє Ім'я та Прізвище!");
        return;
    }

    let earnedPoints = 0;
    let maxPoints = 0;
    let reportText = `Звіт виконання тесту: "${loadedTest.title}"\nУчень: ${name} (${studentClass || 'Без класу'})\n\n`;

    loadedTest.tasks.forEach((task, idx) => {
        maxPoints += task.points;
        const ans = studentAnswers[idx];
        let isCorrect = false;

        if (ans) {
            if (task.type === 'point' || task.type === 'marker') {
                const dist = getDistance(ans, task.standardPoint);
                isCorrect = dist <= 4.0; // Допуск 4%
            } else if (task.type === 'multi-point' || task.type === 'multi-marker') {
                if (Array.isArray(ans) && ans.length === task.multiPoints.length) {
                    let matches = 0;
                    task.multiPoints.forEach(targetPt => {
                        const hasMatch = ans.some(stPt => getDistance(stPt, targetPt) <= 4.5);
                        if (hasMatch) matches++;
                    });
                    isCorrect = matches === task.multiPoints.length;
                }
            } else if (task.type === 'line') {
                isCorrect = checkLineMatch(ans, task.polyline);
            } else if (task.type === 'polygon' || task.type === 'donut') {
                isCorrect = checkPolygonMatch(ans, task.polygon);
            }
        }

        if (isCorrect) {
            earnedPoints += task.points;
            reportText += `Завдання ${idx + 1}: Правильно (+${task.points} б.)\n`;
        } else {
            reportText += `Завдання ${idx + 1}: Неправильно (0 б.)\n`;
        }
    });

    const resultsSection = document.getElementById('resultsSection');
    const scoreSummary = document.getElementById('scoreSummary');
    const detailedReport = document.getElementById('detailedReport');

    if (resultsSection) resultsSection.style.display = 'block';
    if (scoreSummary) scoreSummary.innerText = `Набрано балів: ${earnedPoints} з ${maxPoints}`;
    if (detailedReport) detailedReport.innerText = reportText;

    // Збереження у Firebase
    await sendStudentResultToFirebase(loadedTestCode, name, studentClass, earnedPoints, maxPoints, reportText);

    // Сповіщення в Telegram
    if (loadedTest.telegramChatId) {
        const msg = `📊 <b>Результат тесту!</b>\n\n` +
                    `📖 <b>Тест:</b> ${loadedTest.title}\n` +
                    `👤 <b>Учень:</b> ${name} (${studentClass})\n` +
                    `🏆 <b>Оцінка:</b> ${earnedPoints} / ${maxPoints} балів\n\n` +
                    `📝 <b>Деталі:</b>\n${reportText}`;
        sendTelegramNotification(loadedTest.telegramChatId, msg);
    }

    if (resultsSection) resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function getDistance(p1, p2) {
    if (!p1 || !p2) return 999;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function checkLineMatch(studentLine, teacherLine) {
    if (!studentLine || !teacherLine || studentLine.length < 2) return false;
    let matchedPoints = 0;

    teacherLine.forEach(tPt => {
        const close = studentLine.some(sPt => getDistance(sPt, tPt) <= 5.0);
        if (close) matchedPoints++;
    });

    return (matchedPoints / teacherLine.length) >= 0.75;
}

function checkPolygonMatch(studentPoly, teacherPoly) {
    if (!studentPoly || studentPoly.length < 3) return false;

    const outer = teacherPoly.outer || teacherPoly;
    const inner = teacherPoly.inner || [];

    let insideValidArea = 0;

    studentPoly.forEach(pt => {
        const inOuter = isPointInPolygon(pt, outer);
        const inInner = inner.length > 2 ? isPointInPolygon(pt, inner) : false;

        if (inOuter && !inInner) {
            insideValidArea++;
        }
    });

    return (insideValidArea / studentPoly.length) >= 0.75;
}

function isPointInPolygon(pt, polygon) {
    let x = pt.x, y = pt.y;
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
// 7. РЕНДЕРУВАННЯ ГРАФІКИ (CANVAS)
// ==========================================

function drawPointOnContext(ctx, point, w, h, color, label = '') {
    if (!point) return;
    const px = (point.x / 100) * w;
    const py = (point.y / 100) * h;

    ctx.beginPath();
    ctx.arc(px, py, 7, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (label) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(label, px + 10, py + 4);
    }
}

function drawPolylineOnContext(ctx, points, w, h, strokeColor) {
    if (!points || points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 4;
    ctx.moveTo((points[0].x / 100) * w, (points[0].y / 100) * h);

    for (let i = 1; i < points.length; i++) {
        ctx.lineTo((points[i].x / 100) * w, (points[i].y / 100) * h);
    }
    ctx.stroke();
}

function drawPolygonOnContext(ctx, polygon, w, h, strokeColor, fillColor) {
    if (!polygon || polygon.length < 2) return;

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

function getNormalizedCoordinates(e, imgId) {
    const img = document.getElementById(imgId);
    const rect = img.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches ? e.touches[0].clientY : 0);

    return {
        x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100))
    };
}

function generateUnique10Code() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ==========================================
// 8. РОБОТА З FIREBASE REALTIME DATABASE
// ==========================================

async function loadTestFromFirebase(code) {
    try {
        const snapshot = await get(child(ref(db), `tests/${code}`));
        if (snapshot.exists()) {
            return snapshot.val();
        }
    } catch (e) {
        console.error("Firebase Load Error:", e);
    }
    return null;
}

async function sendStudentResultToFirebase(code, name, studentClass, score, maxScore, report) {
    try {
        const resultsRef = ref(db, `results/${code}`);
        const newRef = push(resultsRef);

        await set(newRef, {
            name: name,
            studentClass: studentClass || '—',
            score: score,
            maxScore: maxScore,
            report: report,
            timestamp: new Date().toLocaleString('uk-UA')
        });
    } catch (e) {
        console.error("Firebase Result Error:", e);
    }
}

// ==========================================
// 9. АДМІН-ПАНЕЛЬ ТА ЖУРНАЛ ОЦІНОК
// ==========================================

function initAdminPanel() {
    const adminJournalContainer = document.getElementById('adminJournalContainer');
    if (!adminJournalContainer) return;

    loadAdminJournalData();
}

async function loadAdminJournalData() {
    const journalContainer = document.getElementById('adminJournalContainer');
    if (!journalContainer) return;

    try {
        const snapshot = await get(ref(db, 'results'));
        if (snapshot.exists()) {
            const data = snapshot.val();
            let html = '';

            Object.keys(data).forEach(testCode => {
                html += `<h3 style="margin-top:20px; color:#3182ce;">Тест Код: ${testCode}</h3>`;
                const resultsObj = data[testCode];

                html += `
                    <table style="width:100%; border-collapse:collapse; margin-top:8px;">
                        <thead>
                            <tr style="background:#edf2f7; text-align:left;">
                                <th style="padding:8px; border:1px solid #cbd5e0;">Учень</th>
                                <th style="padding:8px; border:1px solid #cbd5e0;">Клас</th>
                                <th style="padding:8px; border:1px solid #cbd5e0;">Бал</th>
                                <th style="padding:8px; border:1px solid #cbd5e0;">Дата</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                Object.keys(resultsObj).forEach(resId => {
                    const r = resultsObj[resId];
                    html += `
                        <tr>
                            <td style="padding:8px; border:1px solid #cbd5e0;">${r.name || r.studentName}</td>
                            <td style="padding:8px; border:1px solid #cbd5e0;">${r.studentClass || '—'}</td>
                            <td style="padding:8px; border:1px solid #cbd5e0; font-weight:bold; color:#2f855a;">${r.score} / ${r.maxScore}</td>
                            <td style="padding:8px; border:1px solid #cbd5e0; font-size:0.85rem; color:#718096;">${r.timestamp}</td>
                        </tr>
                    `;
                });

                html += `</tbody></table>`;
            });

            journalContainer.innerHTML = html;
        } else {
            journalContainer.innerHTML = '<p style="color:#718096;">Журнал оцінок порожній.</p>';
        }
    } catch (e) {
        console.error("Journal Error:", e);
        journalContainer.innerHTML = '<p style="color:#e53e3e;">Помилка завантаження журналу.</p>';
    }
}
