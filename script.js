import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, set, remove, push, child } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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

// Telegram Bot Configuration
const BOT_TOKEN = "8847524737:AAEUqbQzjtstH7uzvHSx0Dpx4B9G_HbFM2g";

// Стан тесту вчителя
let currentTest = {
    id: null,
    title: '',
    telegramChatId: '',
    imageSrc: '',
    tasks: []
};

// Стан малювання для вчителя
let currentTaskType = 'marker'; // 'marker', 'multi-marker', 'donut'
let currentStandardPoint = null;
let multiMarkers = []; // Масив для кількох міток (2+)
let useRedZone = false; // Червона зона для пончика
let donutOuterPolygon = [];
let donutInnerPolygon = [];
let currentDrawingMode = 'outer'; // 'outer' або 'inner'
let isTeacherDrawing = false;

// Стан виконання тесту учнем
let loadedTest = null;
let loadedTestCode = null;
let activeTaskIndex = null;
let studentAnswers = {}; // { taskIndex: point | arrayPoints | polygonArray }
let isStudentDrawing = false;
let currentStudentPolygon = [];

// Робимо функції доступними у глобальній області (для inline onclick в HTML)
window.removeTeacherTask = removeTeacherTask;
window.copyCodeLink = copyCodeLink;
window.deleteTest = deleteTest;
window.selectTaskForStudent = selectTaskForStudent;
window.fetchMyChatId = fetchMyChatId;

// ==========================================
// 2. ІНІЦІАЛІЗАЦІЯ
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initTeacherPanel();
    initStudentPanel();
});

// ==========================================
// 3. ПАНЕЛЬ ВЧИТЕЛЯ ТА TELEGRAM API
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
            if (lastUpdate.message) {
                const chatId = lastUpdate.message.chat.id;
                input.value = chatId;
                alert(`✅ Ваш Chat ID успішно знайдено: ${chatId}`);
            } else if (lastUpdate.my_chat_member) {
                const chatId = lastUpdate.my_chat_member.chat.id;
                input.value = chatId;
                alert(`✅ Ваш Chat ID успішно знайдено: ${chatId}`);
            }
        } else {
            alert("Перейдіть у бот, натисніть START, після чого натисніть кнопку ще раз!");
        }
    } catch (error) {
        console.error("Помилка отримання Chat ID:", error);
        alert("Не вдалося отримати ID. Введіть його вручну.");
    } finally {
        btn.innerText = "📲 2. Отримати свій ID";
    }
}

function initTeacherPanel() {
    const mapImageInput = document.getElementById('mapImage');
    const mapImagePreview = document.getElementById('mapImagePreview');
    const mapWrapper = document.getElementById('teacherMapWrapper');
    const taskSection = document.getElementById('taskSection');
    const taskTypeSelect = document.getElementById('taskType');
    const donutOptions = document.getElementById('donutOptions');
    const useRedZoneCheckbox = document.getElementById('useRedZoneCheckbox');
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
                if (mapWrapper) mapWrapper.style.display = 'block';
                if (taskSection) taskSection.style.display = 'block';
                
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
            
            if (donutOptions) {
                donutOptions.style.display = (currentTaskType === 'donut') ? 'block' : 'none';
            }

            resetTaskDrawingState();
        });
    }

    if (useRedZoneCheckbox) {
        useRedZoneCheckbox.addEventListener('change', (e) => {
            useRedZone = e.target.checked;
            resetTaskDrawingState();
        });
    }

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            const text = document.getElementById('taskText').value.trim();
            const plus = parseInt(document.getElementById('taskPointsPlus').value) || 5;
            const minus = parseInt(document.getElementById('taskPointsMinus').value) || 2;

            if (!text) {
                alert('Введіть текст завдання!');
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
                    alert('Поставте точкову мітку на карті!');
                    return;
                }
                newTask.standardPoint = currentStandardPoint;

            } else if (currentTaskType === 'multi-marker') {
                if (multiMarkers.length < 2) {
                    alert('Поставте хоча б 2 мітки на карті!');
                    return;
                }
                newTask.multiPoints = [...multiMarkers];

            } else if (currentTaskType === 'donut') {
                if (donutOuterPolygon.length < 3) {
                    alert('Затисніть та обведіть зелену область!');
                    return;
                }
                if (useRedZone && donutInnerPolygon.length < 3) {
                    alert('Обведіть внутрішню червону зону ("дірку")!');
                    return;
                }
                newTask.donut = {
                    outer: [...donutOuterPolygon],
                    inner: useRedZone ? [...donutInnerPolygon] : []
                };
            }

            currentTest.tasks.push(newTask);
            document.getElementById('taskText').value = '';
            resetTaskDrawingState();
            renderTeacherTasks();
            alert('Завдання успішно додано!');
        });
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const title = document.getElementById('testTitle').value.trim();
            const chatIdInput = document.getElementById('teacherChatId');
            const telegramChatId = chatIdInput ? chatIdInput.value.trim() : '';

            if (!title) {
                alert('Введіть назву тесту!');
                return;
            }
            if (currentTest.tasks.length === 0) {
                alert('Додайте хоча б одне завдання!');
                return;
            }

            const code = generateUniqueCode();
            currentTest.id = code;
            currentTest.title = title;
            currentTest.telegramChatId = telegramChatId;
            currentTest.createdAt = new Date().toLocaleString('uk-UA');

            await saveTestToFirebase(code, currentTest);

            let testsHistory = JSON.parse(localStorage.getItem('testsHistory') || '{}');
            testsHistory[code] = currentTest;
            localStorage.setItem('testsHistory', JSON.stringify(testsHistory));

            const linkInput = document.getElementById('studentLinkInput');
            const shareContainer = document.getElementById('shareLinkContainer');
            const studentUrl = `${window.location.origin}${window.location.pathname.replace('teacher.html', 'student.html')}?code=${code}`;
            
            if (linkInput) linkInput.value = studentUrl;
            if (shareContainer) shareContainer.style.display = 'block';

            renderHistoryList();
        });
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const linkInput = document.getElementById('studentLinkInput');
            if (linkInput) {
                linkInput.select();
                document.execCommand('copy');
                alert('Посилання скопійовано!');
            }
        });
    }

    renderHistoryList();
}

function resetTaskDrawingState() {
    currentStandardPoint = null;
    multiMarkers = [];
    donutOuterPolygon = [];
    donutInnerPolygon = [];
    currentDrawingMode = 'outer';
    isTeacherDrawing = false;
    updateTeacherInstructions();
    redrawTeacherCanvas();
}

function updateTeacherInstructions() {
    const mapInstruction = document.getElementById('mapInstruction');
    const container = document.getElementById('teacherMapContainer');
    if (!mapInstruction || !container) return;

    if (currentTaskType === 'marker') {
        mapInstruction.innerHTML = '📌 <b>1 мітка:</b> Натисніть на карту, щоб поставити ТОЧКУ.';
        container.className = 'map-container';
    } else if (currentTaskType === 'multi-marker') {
        mapInstruction.innerHTML = `📌📌 <b>Кілька міток:</b> Натискайте на карту, щоб поставити необхідну кількість точок (поставлено: <b>${multiMarkers.length}</b>).`;
        container.className = 'map-container';
    } else if (currentTaskType === 'donut') {
        if (!useRedZone) {
            mapInstruction.innerHTML = '🟢 <b>Область:</b> Затисніть мишку та обведіть потрібну область на карті.';
            container.className = 'map-container drawing-outer';
        } else {
            if (currentDrawingMode === 'outer') {
                mapInstruction.innerHTML = '🟢 <b>Крок 1:</b> Затисніть та обведіть <b>ЗОВНІШНЮ (зелену)</b> область.';
                container.className = 'map-container drawing-outer';
            } else {
                mapInstruction.innerHTML = '🔴 <b>Крок 2:</b> Обведіть <b>ВНУТРІШНЮ (червону)</b> заборонену зону ("дірку").';
                container.className = 'map-container drawing-inner';
            }
        }
    }
}

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
    } else if (currentTaskType === 'multi-marker') {
        multiMarkers.push(point);
        updateTeacherInstructions();
        redrawTeacherCanvas();
    } else if (currentTaskType === 'donut') {
        isTeacherDrawing = true;
        if (currentDrawingMode === 'outer') {
            donutOuterPolygon = [point];
        } else {
            donutInnerPolygon = [point];
        }
    }
}

function handleTeacherPointerMove(e) {
    if (!isTeacherDrawing || currentTaskType !== 'donut') return;
    const point = getNormalizedCoordinates(e);

    if (currentDrawingMode === 'outer') {
        donutOuterPolygon.push(point);
    } else {
        donutInnerPolygon.push(point);
    }
    redrawTeacherCanvas();
}

function handleTeacherPointerUp() {
    if (!isTeacherDrawing || currentTaskType !== 'donut') return;
    isTeacherDrawing = false;

    if (currentDrawingMode === 'outer' && donutOuterPolygon.length > 2) {
        if (useRedZone) {
            currentDrawingMode = 'inner';
            updateTeacherInstructions();
        } else {
            alert('✅ Область успішно сформовано!');
        }
    } else if (currentDrawingMode === 'inner' && donutInnerPolygon.length > 2) {
        alert('✅ Зелену та Червону зони сформовано!');
    }
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
        drawPointOnContext(ctx, currentStandardPoint, w, h, '#e53e3e');
    }

    if (currentTaskType === 'multi-marker' && multiMarkers.length > 0) {
        multiMarkers.forEach((pt, i) => {
            drawPointOnContext(ctx, pt, w, h, '#3182ce', (i + 1).toString());
        });
    }

    if (donutOuterPolygon.length > 1) {
        drawPolygonOnContext(ctx, donutOuterPolygon, w, h, '#38a169', 'rgba(56, 161, 105, 0.25)');
    }
    if (useRedZone && donutInnerPolygon.length > 1) {
        drawPolygonOnContext(ctx, donutInnerPolygon, w, h, '#e53e3e', 'rgba(229, 62, 62, 0.35)');
    }
}

function renderTeacherTasks() {
    const list = document.getElementById('teacherTasksList');
    if (!list) return;

    if (currentTest.tasks.length === 0) {
        list.innerHTML = '<p class="empty-text">Ще немає доданих завдань.</p>';
        return;
    }

    list.innerHTML = currentTest.tasks.map((task, index) => {
        let typeBadge = '';
        if (task.type === 'marker') typeBadge = '📌 1 Мітка';
        else if (task.type === 'multi-marker') typeBadge = `📌📌 ${task.multiPoints.length} Міток`;
        else if (task.type === 'donut') typeBadge = (task.donut.inner && task.donut.inner.length > 0) ? '🍩 Пончик (з діркою)' : '🟢 Область';

        return `
            <li class="task-item">
                <div>
                    <b>${index + 1}. ${task.text}</b> 
                    <span style="font-size: 0.85rem; color: #718096; margin-left: 10px;">
                        (${typeBadge} | +${task.points.plus} / -${task.points.minus} б.)
                    </span>
                </div>
                <button onclick="removeTeacherTask(${index})" class="btn danger-btn" style="padding: 4px 10px; font-size: 0.8rem;">Видалити</button>
            </li>
        `;
    }).join('');
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
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="copyCodeLink('${code}')" class="btn primary-btn" style="padding: 4px 10px; font-size: 0.8rem;">Копіювати посилання</button>
                    <button onclick="deleteTest('${code}')" class="btn danger-btn" style="padding: 4px 10px; font-size: 0.8rem;">Видалити</button>
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

async function deleteTest(code) {
    if (!confirm(`Ви дійсно бажаєте видалити тест з кодом "${code}"?`)) {
        return;
    }

    let testsHistory = JSON.parse(localStorage.getItem('testsHistory') || '{}');
    if (testsHistory[code]) {
        delete testsHistory[code];
        localStorage.setItem('testsHistory', JSON.stringify(testsHistory));
    }

    try {
        const testRef = ref(db, 'tests/' + code);
        const resultsRef = ref(db, 'results/' + code);
        await remove(testRef);
        await remove(resultsRef);
    } catch (error) {
        console.error("Помилка видалення з Firebase:", error);
    }

    alert('Тест успішно видалено!');
    renderHistoryList();
}

// ==========================================
// 4. ПАНЕЛЬ УЧНЯ
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

async function loadTestByCode(code) {
    let test = await loadTestFromFirebase(code);
    
    if (!test) {
        const testsHistory = JSON.parse(localStorage.getItem('testsHistory') || '{}');
        test = testsHistory[code];
    }

    if (!test) {
        alert('Тест із таким кодом не знайдено!');
        return;
    }

    loadedTest = test;
    loadedTestCode = code;

    const loaderSec = document.getElementById('codeLoaderSection');
    const testAreaSec = document.getElementById('testArea');

    if (loaderSec) loaderSec.style.display = 'none';
    if (testAreaSec) testAreaSec.style.display = 'block';

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

    canvas.addEventListener('mousedown', handleStudentPointerDown);
    canvas.addEventListener('mousemove', handleStudentPointerMove);
    canvas.addEventListener('mouseup', handleStudentPointerUp);

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

    } else if (task.type === 'multi-marker') {
        if (!Array.isArray(studentAnswers[activeTaskIndex])) {
            studentAnswers[activeTaskIndex] = [];
        }
        
        if (studentAnswers[activeTaskIndex].length < task.multiPoints.length) {
            studentAnswers[activeTaskIndex].push(point);
            redrawStudentCanvas();
            renderStudentTasks();
        } else {
            alert(`Ви вже поставили всі ${task.multiPoints.length} міток! Щоб очистити, оберіть завдання знову.`);
        }

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
            drawPointOnContext(ctx, ans, w, h, '#3182ce', `№${parseInt(idx) + 1}`);

        } else if (task.type === 'multi-marker' && Array.isArray(ans)) {
            ans.forEach((pt, ptIdx) => {
                drawPointOnContext(ctx, pt, w, h, '#3182ce', `${parseInt(idx) + 1}.${ptIdx + 1}`);
            });

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
        const ans = studentAnswers[index];
        let isDone = false;

        if (task.type === 'marker') isDone = ans !== undefined;
        else if (task.type === 'multi-marker') isDone = Array.isArray(ans) && ans.length === task.multiPoints.length;
        else if (task.type === 'donut') isDone = Array.isArray(ans) && ans.length > 2;

        const isActive = activeTaskIndex === index;

        let className = 'student-task-card';
        if (isActive) className += ' active-task';
        if (isDone) className += ' completed-task';

        let countInfo = '';
        if (task.type === 'multi-marker') {
            const currentCount = Array.isArray(ans) ? ans.length : 0;
            countInfo = ` (${currentCount}/${task.multiPoints.length} точок)`;
        }

        return `
            <div class="${className}" onclick="selectTaskForStudent(${index})">
                <b>Завдання ${index + 1}: ${task.text}</b> ${countInfo}
                <span style="float: right;">${isDone ? '✅ Виконано' : '⏳ Не виконано'}</span>
            </div>
        `;
    }).join('');
}

function selectTaskForStudent(index) {
    activeTaskIndex = index;
    const task = loadedTest.tasks[index];
    const studentInstruction = document.getElementById('studentInstruction');

    if (studentInstruction) {
        if (task.type === 'marker') {
            studentInstruction.innerHTML = `📍 <b>Завдання №${index + 1}:</b> Натисніть на карту, щоб поставити 1 точкову мітку.`;
        } else if (task.type === 'multi-marker') {
            const currentCount = Array.isArray(studentAnswers[index]) ? studentAnswers[index].length : 0;
            studentInstruction.innerHTML = `📌📌 <b>Завдання №${index + 1}:</b> Поставте <b>${task.multiPoints.length}</b> точок на карті (поставлено: ${currentCount}).`;
        } else {
            studentInstruction.innerHTML = `🟢 <b>Завдання №${index + 1}:</b> Затисніть та обведіть правильну область на карті.`;
        }
    }
    renderStudentTasks();
}

// ==========================================
// 5. ПЕРЕВІРКА ВІДПОВІДЕЙ ТА СПОВІЩЕННЯ
// ==========================================

async function checkStudentWork() {
    const nameInput = document.getElementById('studentName');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        alert("Введіть своє Ім'я та Прізвище!");
        return;
    }

    let totalScore = 0;
    let maxScore = 0;
    let report = ``;

    loadedTest.tasks.forEach((task, index) => {
        maxScore += task.points.plus;
        const ans = studentAnswers[index];

        if (ans) {
            let isCorrect = false;

            if (task.type === 'marker') {
                const dx = ans.x - task.standardPoint.x;
                const dy = ans.y - task.standardPoint.y;
                isCorrect = Math.sqrt(dx * dx + dy * dy) <= 3.5;

            } else if (task.type === 'multi-marker') {
                if (Array.isArray(ans) && ans.length === task.multiPoints.length) {
                    let matched = 0;
                    task.multiPoints.forEach(targetPt => {
                        const hasMatch = ans.some(stPt => {
                            const dx = stPt.x - targetPt.x;
                            const dy = stPt.y - targetPt.y;
                            return Math.sqrt(dx * dx + dy * dy) <= 3.5;
                        });
                        if (hasMatch) matched++;
                    });
                    isCorrect = (matched === task.multiPoints.length);
                }

            } else if (task.type === 'donut') {
                isCorrect = checkAreaCoverage(ans, task.donut);
            }

            if (isCorrect) {
                totalScore += task.points.plus;
                report += `Завдання ${index + 1}: Вірно (+${task.points.plus} б.)\n`;
            } else {
                totalScore -= task.points.minus;
                report += `Завдання ${index + 1}: Помилка (-${task.points.minus} б.)\n`;
            }
        } else {
            totalScore -= task.points.minus;
            report += `Завдання ${index + 1}: Не виконано (-${task.points.minus} б.)\n`;
        }
    });

    const resultsSection = document.getElementById('resultsSection');
    const scoreSummary = document.getElementById('scoreSummary');
    const detailedReport = document.getElementById('detailedReport');

    if (resultsSection) resultsSection.style.display = 'block';
    if (scoreSummary) scoreSummary.innerHTML = `Набрано балів: ${totalScore} з ${maxScore} можливих`;
    if (detailedReport) detailedReport.innerText = report;

    await sendStudentResultsToFirebase(loadedTestCode, name, totalScore, maxScore, report);

    if (loadedTest.telegramChatId && loadedTest.telegramChatId.trim().length > 0) {
        const message = `📊 <b>Новий результат тесту!</b>\n\n` +
                        `📖 <b>Тест:</b> ${loadedTest.title}\n` +
                        `👤 <b>Учень:</b> ${name}\n` +
                        `🏆 <b>Результат:</b> ${totalScore} з ${maxScore} балів\n\n` +
                        `📝 <b>Деталізація:</b>\n${report}`;
                        
        sendTelegramNotification(loadedTest.telegramChatId.trim(), message);
    }

    if (resultsSection) resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function sendTelegramNotification(chatId, messageText) {
    if (!chatId) {
        console.warn("⚠️ Chat ID не вказано.");
        return;
    }

    const cleanChatId = chatId.toString().trim();

    const payload = {
        chat_id: cleanChatId,
        text: messageText,
        parse_mode: 'HTML'
    };

    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.ok) {
            console.log("✅ Результати успішно надіслано в Telegram!");
        } else {
            console.error("❌ Помилка Telegram API:", data);
            alert(`Помилка Telegram: ${data.description}\nПеревірте, чи ви натиснули /start у боті.`);
        }
    })
    .catch(err => {
        console.error("❌ Мережева помилка відправки в Telegram:", err);
    });
}

function checkAreaCoverage(studentPoly, teacherDonut) {
    if (!studentPoly || studentPoly.length < 3) return false;

    let totalPoints = studentPoly.length;
    let validPoints = 0;

    studentPoly.forEach(pt => {
        const inOuter = isPointInPolygon(pt, teacherDonut.outer);
        const inInner = (teacherDonut.inner && teacherDonut.inner.length > 0) ? isPointInPolygon(pt, teacherDonut.inner) : false;

        if (inOuter && !inInner) {
            validPoints++;
        }
    });

    return (validPoints / totalPoints) * 100 >= 80;
}

function isPointInPolygon(point, polygon) {
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
// 6. РОБОТА З FIREBASE REALTIME DATABASE
// ==========================================

async function saveTestToFirebase(testCode, testData) {
    try {
        const testRef = ref(db, 'tests/' + testCode);
        await set(testRef, testData);
        alert(`✅ Тест ${testCode} успішно опубліковано у хмарі Firebase!`);
    } catch (error) {
        console.error("Firebase Error:", error);
        alert("Помилка збереження в Firebase: " + error.message);
    }
}

async function loadTestFromFirebase(testCode) {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, `tests/${testCode}`));

        if (snapshot.exists()) {
            return snapshot.val();
        }
    } catch (error) {
        console.error("Firebase Load Error:", error);
    }
    return null;
}

async function sendStudentResultsToFirebase(testCode, studentName, score, maxScore, reportDetails) {
    try {
        const resultsListRef = ref(db, `results/${testCode}`);
        const newResultRef = push(resultsListRef);
        
        await set(newResultRef, {
            studentName: studentName,
            score: score,
            maxScore: maxScore,
            report: reportDetails,
            timestamp: new Date().toLocaleString('uk-UA')
        });
    } catch (error) {
        console.error("Firebase Send Results Error:", error);
    }
}

// Допоміжні функції для малювання
function drawPointOnContext(ctx, point, w, h, color, label = '') {
    const px = (point.x / 100) * w;
    const py = (point.y / 100) * h;

    ctx.beginPath();
    ctx.arc(px, py, 6, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (label) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(label, px + 8, py + 4);
    }
}

function drawPolygonOnContext(ctx, polygon, w, h, strokeColor, fillColor) {
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

function getNormalizedCoordinates(e) {
    const mapImg = document.getElementById('mapImagePreview') || document.getElementById('studentMapImage');
    const rect = mapImg.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    };
}

function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
