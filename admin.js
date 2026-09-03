/**
 * Intermap Admin Core Engine
 * Повнофункціональна панель управління інтерактивними картами, тестами та користувачами.
 */

// ==========================================
// 1. ГЛОБАЛЬНИЙ СТАН ТА НАЛАШТУВАННЯ
// ==========================================
const AdminState = {
    currentUser: null,
    activeTab: 'dashboard',
    tests: [],
    users: [],
    submissions: [],
    
    // Стан редактора карт (Canvas Editor)
    mapEditor: {
        canvas: null,
        ctx: null,
        image: null,
        activeTool: 'select', // 'select', 'point', 'polygon', 'pan'
        zoom: 1,
        panX: 0,
        panY: 0,
        isPanning: false,
        startPanX: 0,
        startPanY: 0,
        currentPoints: [], // Поточні точки полігона
        shapes: [], // Готові фігури (області відповідей): { id, label, type, points: [{x,y}], color }
        selectedShapeId: null
    },

    // Стан перегляду результатів учень/карта
    submissionViewer: {
        canvas: null,
        ctx: null,
        image: null
    }
};

const CONFIG = {
    STORAGE_KEYS: {
        TESTS: 'intermap_tests',
        USERS: 'intermap_users',
        SUBMISSIONS: 'intermap_submissions',
        SETTINGS: 'intermap_settings'
    },
    OWNER_EMAILS: [
        "vanyary16@gmail.com",
        "vanyarybalka13@gmail.com"
    ],
    SHAPE_COLORS: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
};

// ==========================================
// 2. ІНІЦІАЛІЗАЦІЯ ТА ПОТРІЙНА АВТОРИЗАЦІЯ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initAuthGuard();
    initDatabase();
    initTabNavigation();
    initDashboard();
    initMapEditorCanvas();
    initTestConstructor();
    initUserManagement();
    initSubmissionInspector();
    initSettingsPanel();
    initGlobalEvents();
});

function initAuthGuard() {
    const isOwnerAuthorized = localStorage.getItem('isOwnerAuthorized');
    const userRole = localStorage.getItem('userRole');
    const userEmail = localStorage.getItem('userEmail');

    if (isOwnerAuthorized !== 'true' && userRole !== 'admin') {
        showToast('Доступ заборонено! Необхідна авторизація адміністратора.', 'error');
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        return;
    }

    AdminState.currentUser = {
        email: userEmail || 'vanyary16@gmail.com',
        role: userRole || 'admin'
    };

    const adminEmailDisplay = document.getElementById('adminEmail');
    if (adminEmailDisplay) {
        adminEmailDisplay.textContent = AdminState.currentUser.email;
    }
}

function initDatabase() {
    AdminState.tests = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TESTS) || '[]');
    AdminState.users = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USERS) || '[]');
    AdminState.submissions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.SUBMISSIONS) || '[]');

    if (AdminState.users.length === 0) {
        AdminState.users = [
            { id: 1, email: "vanyary16@gmail.com", role: "Owner", registeredAt: "2026-01-10", status: "Active" },
            { id: 2, email: "vanyarybalka13@gmail.com", role: "Owner", registeredAt: "2026-01-11", status: "Active" },
            { id: 3, email: "student_test@intermap.edu", role: "Student", registeredAt: "2026-02-01", status: "Active" }
        ];
        saveDatabase(CONFIG.STORAGE_KEYS.USERS, AdminState.users);
    }
}

function saveDatabase(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// ==========================================
// 3. НАВІГАЦІЯ ТА ВКЛАДКИ
// ==========================================
function initTabNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('pageTitle');

    const titles = {
        'dashboard': 'Огляд та Аналітика',
        'tests': 'Конструктор Тестів та Карт',
        'editor': 'Інтерактивний Редактор Областей Карти',
        'users': 'Користувачі та Доступи',
        'submissions': 'Результати Учнів та Перевірка',
        'settings': 'Налаштування Системи'
    };

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            if (!tab) return;

            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const activeContent = document.getElementById(tab);
            if (activeContent) activeContent.classList.add('active');

            if (pageTitle && titles[tab]) pageTitle.textContent = titles[tab];
            AdminState.activeTab = tab;

            if (tab === 'dashboard') renderDashboard();
            if (tab === 'tests') renderTestsList();
            if (tab === 'users') renderUsersList();
            if (tab === 'submissions') renderSubmissionsList();
        });
    });
}

// ==========================================
// 4. ДАШБОРД ТА ГРАФІКИ
// ==========================================
function initDashboard() {
    renderDashboard();
}

function renderDashboard() {
    const totalUsersEl = document.getElementById('totalUsersCount');
    const totalTestsEl = document.getElementById('totalTestsCount');
    const completedTestsEl = document.getElementById('completedTestsCount');

    if (totalUsersEl) totalUsersEl.textContent = AdminState.users.length;
    if (totalTestsEl) totalTestsEl.textContent = AdminState.tests.length;
    if (completedTestsEl) completedTestsEl.textContent = AdminState.submissions.length;

    renderRecentActivityTable();
    renderAnalyticsChart();
}

function renderRecentActivityTable() {
    const tbody = document.getElementById('recentActivityTable');
    if (!tbody) return;

    if (AdminState.submissions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-sub);">Активностей ще немає</td></tr>`;
        return;
    }

    const recent = AdminState.submissions.slice(-5).reverse();
    tbody.innerHTML = recent.map(sub => `
        <tr>
            <td>${escapeHtml(sub.userEmail)}</td>
            <td>${escapeHtml(sub.testTitle)}</td>
            <td><span style="color: ${sub.score >= 80 ? 'var(--success-color)' : 'var(--danger-color)'}">${sub.score}%</span></td>
            <td>${sub.date || new Date().toLocaleDateString()}</td>
        </tr>
    `).join('');
}

function renderAnalyticsChart() {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Малювання швидкого чарту успішності (Native HTML5 Canvas)
    const data = [65, 78, 90, 85, 92, 88, 95];
    const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    const padding = 40;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    ctx.strokeStyle = '#3b82f6';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.lineWidth = 3;
    ctx.beginPath();

    const stepX = width / (data.length - 1);
    data.forEach((val, idx) => {
        const x = padding + idx * stepX;
        const y = canvas.height - padding - (val / 100) * height;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        ctx.fillStyle = '#f8fafc';
        ctx.fillText(labels[idx], x - 8, canvas.height - 15);
    });

    ctx.stroke();
}

// ==========================================
// 5. ІНТЕРАКТИВНИЙ РЕДАКТОР КАРТ (CANVAS ENGINE)
// ==========================================
function initMapEditorCanvas() {
    const canvas = document.getElementById('mapEditorCanvas');
    if (!canvas) return;

    AdminState.mapEditor.canvas = canvas;
    AdminState.mapEditor.ctx = canvas.getContext('2d');

    // Кнопки інструментів редактора
    const toolBtns = document.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AdminState.mapEditor.activeTool = btn.getAttribute('data-tool');
        });
    });

    // Завантаження зображення карти
    const mapUrlInput = document.getElementById('editorMapUrlInput');
    const loadMapBtn = document.getElementById('loadMapToEditorBtn');
    if (loadMapBtn && mapUrlInput) {
        loadMapBtn.addEventListener('click', () => {
            const url = mapUrlInput.value.trim();
            if (!url) return showToast('Введіть коректну URL-адресу зображення', 'error');
            loadMapImageIntoEditor(url);
        });
    }

    // Обробники подій миші на Canvas
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('wheel', handleCanvasWheel);

    // Завершення створення полігона за подвійним кліком
    canvas.addEventListener('dblclick', finalizePolygonShape);
}

function loadMapImageIntoEditor(url) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => {
        AdminState.mapEditor.image = img;
        AdminState.mapEditor.zoom = 1;
        AdminState.mapEditor.panX = 0;
        AdminState.mapEditor.panY = 0;
        redrawMapCanvas();
        showToast('Карту успішно завантажено в редактор', 'success');
    };
    img.onerror = () => {
        showToast('Помилка завантаження зображення. Перевірте URL або CORS.', 'error');
    };
}

function redrawMapCanvas() {
    const { canvas, ctx, image, zoom, panX, panY, shapes, currentPoints } = AdminState.mapEditor;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Трансформація Zoom/Pan
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Малювання карти
    if (image) {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '16px Segoe UI';
        ctx.fillText('Завантажте карту для початку розмітки об\'єктів', canvas.width / 2 - 180, canvas.height / 2);
    }

    // Малювання вже збережених фігур
    shapes.forEach((shape) => {
        ctx.beginPath();
        ctx.strokeStyle = shape.color || '#3b82f6';
        ctx.fillStyle = hexToRgba(shape.color || '#3b82f6', 0.3);
        ctx.lineWidth = 2 / zoom;

        if (shape.type === 'point') {
            const p = shape.points[0];
            ctx.arc(p.x, p.y, 8 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'polygon') {
            shape.points.forEach((pt, idx) => {
                if (idx === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Мітка фігури
        if (shape.label && shape.points.length > 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `${12 / zoom}px Segoe UI`;
            ctx.fillText(shape.label, shape.points[0].x + 10, shape.points[0].y - 5);
        }
    });

    // Малювання поточного створюваного полігона
    if (currentPoints.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2 / zoom;
        currentPoints.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);

            // Точка вузла
            ctx.arc(pt.x, pt.y, 3 / zoom, 0, Math.PI * 2);
        });
        ctx.stroke();
    }

    ctx.restore();
}

function getCanvasCoordinates(e) {
    const { canvas, zoom, panX, panY } = AdminState.mapEditor;
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    return {
        x: (rawX - panX) / zoom,
        y: (rawY - panY) / zoom
    };
}

function handleCanvasMouseDown(e) {
    const editor = AdminState.mapEditor;
    const coords = getCanvasCoordinates(e);

    if (editor.activeTool === 'pan') {
        editor.isPanning = true;
        editor.startPanX = e.clientX - editor.panX;
        editor.startPanY = e.clientY - editor.panY;
        return;
    }

    if (editor.activeTool === 'point') {
        const label = prompt('Введіть назву цієї точки / об\'єкта (наприклад: "Київ"):');
        if (label) {
            editor.shapes.push({
                id: Date.now(),
                label: label,
                type: 'point',
                points: [coords],
                color: CONFIG.SHAPE_COLORS[editor.shapes.length % CONFIG.SHAPE_COLORS.length]
            });
            redrawMapCanvas();
            renderShapesList();
        }
    } else if (editor.activeTool === 'polygon') {
        editor.currentPoints.push(coords);
        redrawMapCanvas();
    }
}

function handleCanvasMouseMove(e) {
    const editor = AdminState.mapEditor;
    if (editor.isPanning) {
        editor.panX = e.clientX - editor.startPanX;
        editor.panY = e.clientY - editor.startPanY;
        redrawMapCanvas();
    }
}

function handleCanvasMouseUp() {
    AdminState.mapEditor.isPanning = false;
}

function handleCanvasWheel(e) {
    e.preventDefault();
    const editor = AdminState.mapEditor;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    
    const newZoom = editor.zoom * zoomFactor;
    if (newZoom >= 0.5 && newZoom <= 5) {
        editor.zoom = newZoom;
        redrawMapCanvas();
    }
}

function finalizePolygonShape() {
    const editor = AdminState.mapEditor;
    if (editor.activeTool === 'polygon' && editor.currentPoints.length >= 3) {
        const label = prompt('Введіть назву створеної області (наприклад: "Область 1"):');
        if (label) {
            editor.shapes.push({
                id: Date.now(),
                label: label,
                type: 'polygon',
                points: [...editor.currentPoints],
                color: CONFIG.SHAPE_COLORS[editor.shapes.length % CONFIG.SHAPE_COLORS.length]
            });
            renderShapesList();
        }
        editor.currentPoints = [];
        redrawMapCanvas();
    }
}

function renderShapesList() {
    const listContainer = document.getElementById('mapShapesList');
    if (!listContainer) return;

    if (AdminState.mapEditor.shapes.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-sub); text-align: center;">Немає розмічених областей</div>';
        return;
    }

    listContainer.innerHTML = AdminState.mapEditor.shapes.map(s => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px; margin-bottom:6px; background: var(--bg-primary); border-radius:6px; border-left: 4px solid ${s.color};">
            <div>
                <strong>${escapeHtml(s.label)}</strong> 
                <span style="font-size:0.8rem; color:var(--text-sub);">(${s.type})</span>
            </div>
            <button onclick="removeShape(${s.id})" style="background:none; border:none; color:var(--danger-color); cursor:pointer;">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
}

window.removeShape = function(shapeId) {
    AdminState.mapEditor.shapes = AdminState.mapEditor.shapes.filter(s => s.id !== shapeId);
    redrawMapCanvas();
    renderShapesList();
};

// ==========================================
// 6. КОНСТРУКТОР ТЕСТІВ ТА ПИТАНЬ
// ==========================================
function initTestConstructor() {
    const createTestForm = document.getElementById('createTestForm');
    if (createTestForm) {
        createTestForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleTestCreation();
        });
    }
}

function handleTestCreation() {
    const titleInput = document.getElementById('testTitle');
    const categorySelect = document.getElementById('testCategory');
    const mapUrlInput = document.getElementById('testMapUrl');

    if (!titleInput || !categorySelect) return;

    const newTest = {
        id: Date.now(),
        title: titleInput.value.trim(),
        category: categorySelect.value,
        mapUrl: mapUrlInput ? mapUrlInput.value.trim() : '',
        shapes: [...AdminState.mapEditor.shapes], // Збережені інтерактивні області
        questions: [],
        createdAt: new Date().toISOString().split('T')[0]
    };

    AdminState.tests.push(newTest);
    saveDatabase(CONFIG.STORAGE_KEYS.TESTS, AdminState.tests);

    titleInput.value = '';
    if (mapUrlInput) mapUrlInput.value = '';
    AdminState.mapEditor.shapes = [];
    redrawMapCanvas();
    renderShapesList();

    showToast('Новий тест успішно створено!', 'success');
    renderTestsList();
    renderDashboard();
}

function renderTestsList() {
    const tbody = document.getElementById('testsListTable');
    if (!tbody) return;

    if (AdminState.tests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-sub);">Тестів немає. Створіть перший тест!</td></tr>`;
        return;
    }

    tbody.innerHTML = AdminState.tests.map(test => `
        <tr>
            <td>${test.id}</td>
            <td><strong>${escapeHtml(test.title)}</strong></td>
            <td>${escapeHtml(test.category)}</td>
            <td>${test.shapes ? test.shapes.length : 0} областей</td>
            <td>
                <button onclick="editTestQuestions(${test.id})" class="btn-primary" style="padding:4px 8px; font-size:0.85rem;">Питання</button>
                <button onclick="deleteTest(${test.id})" style="background:var(--danger-color); color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

window.editTestQuestions = function(testId) {
    const test = AdminState.tests.find(t => t.id === testId);
    if (!test) return;

    const questionText = prompt(`Додати нове питання до тесту "${test.title}":\nВведіть текст питання:`);
    if (questionText) {
        test.questions.push({
            id: Date.now(),
            text: questionText,
            type: 'map_target'
        });
        saveDatabase(CONFIG.STORAGE_KEYS.TESTS, AdminState.tests);
        showToast('Питання додано!', 'success');
    }
};

window.deleteTest = function(testId) {
    if (!confirm('Ви дійсно бажаєте видалити цей тест?')) return;
    AdminState.tests = AdminState.tests.filter(t => t.id !== testId);
    saveDatabase(CONFIG.STORAGE_KEYS.TESTS, AdminState.tests);
    renderTestsList();
    renderDashboard();
    showToast('Тест видалено.', 'info');
};

// ==========================================
// 7. УПРАВЛІННЯ КОРИСТУВАЧАМИ ТА РОЛЯМИ
// ==========================================
function initUserManagement() {
    const searchInput = document.getElementById('userSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderUsersList(e.target.value.toLowerCase());
        });
    }
}

// ==========================================
// 7. УПРАВЛІННЯ КОРИСТУВАЧАМИ ТА РОЛЯМИ
// ==========================================
function initUserManagement() {
    const searchInput = document.getElementById('userSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderUsersList(e.target.value.toLowerCase());
        });
    }
}

function renderUsersList(filterText = '') {
    const tbody = document.getElementById('usersListTable');
    if (!tbody) return;

    const filteredUsers = AdminState.users.filter(u => 
        u.email.toLowerCase().includes(filterText) || 
        (u.role && u.role.toLowerCase().includes(filterText))
    );

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-sub);">Користувачів не знайдено</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredUsers.map(user => `
        <tr>
            <td><strong>${escapeHtml(user.email)}</strong></td>
            <td>
                ${user.role === 'Owner' ? `
                    <span style="padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; background: rgba(59,130,246,0.2); color: #3b82f6; font-weight: bold;">
                        Власник (Owner)
                    </span>
                ` : `
                    <select onchange="changeUserRole(${user.id}, this.value)" style="background: var(--bg-primary); color: var(--text-main); border: 1px solid var(--border-color); padding: 5px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer;">
                        <option value="admin" ${user.role === 'admin' || user.role === 'Admin' ? 'selected' : ''}>👑 Адмін</option>
                        <option value="teacher" ${user.role === 'teacher' || user.role === 'Teacher' ? 'selected' : ''}>👨‍🏫 Учитель</option>
                        <option value="student" ${user.role === 'student' || user.role === 'Student' ? 'selected' : ''}>🎓 Студент</option>
                    </select>
                `}
            </td>
            <td>${user.registeredAt || '2026-01-01'}</td>
            <td><span style="color: ${user.status === 'Blocked' ? 'var(--danger-color)' : 'var(--success-color)'}">${user.status || 'Active'}</span></td>
            <td>
                ${user.role !== 'Owner' ? `
                    <button onclick="toggleUserStatus(${user.id})" style="background:var(--border-color); color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
                        ${user.status === 'Blocked' ? 'Розблокувати' : 'Заблокувати'}
                    </button>
                    <button onclick="deleteUser(${user.id})" style="background:var(--danger-color); color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-left:4px;">
                        <i class="fa-solid fa-user-xmark"></i>
                    </button>
                ` : '<span style="color:var(--text-sub)">Доступ захищено</span>'}
            </td>
        </tr>
    `).join('');
}

// Глобальна функція зміни ролі користувача
window.changeUserRole = function(userId, newRole) {
    const user = AdminState.users.find(u => u.id === userId);
    if (!user) return;

    user.role = newRole;
    saveDatabase(CONFIG.STORAGE_KEYS.USERS, AdminState.users);

    const roleNames = {
        'admin': 'Адміністратор',
        'teacher': 'Учитель',
        'student': 'Студент'
    };

    showToast(`Роль користувача ${user.email} змінено на "${roleNames[newRole] || newRole}".`, 'success');
};

window.toggleUserStatus = function(userId) {
    const user = AdminState.users.find(u => u.id === userId);
    if (!user) return;
    user.status = user.status === 'Blocked' ? 'Active' : 'Blocked';
    saveDatabase(CONFIG.STORAGE_KEYS.USERS, AdminState.users);
    renderUsersList();
    showToast(`Статус користувача ${user.email} змінено.`, 'info');
};

window.deleteUser = function(userId) {
    if (!confirm('Видалити користувача з системи?')) return;
    AdminState.users = AdminState.users.filter(u => u.id !== userId);
    saveDatabase(CONFIG.STORAGE_KEYS.USERS, AdminState.users);
    renderUsersList();
    renderDashboard();
    showToast('Користувача видалено.', 'info');
};

// ==========================================
// 8. ПЕРЕГЛЯД ТА ПЕРЕВІРКА ВІДПОВІДЕЙ УЧНІВ
// ==========================================
function initSubmissionInspector() {
    renderSubmissionsList();
}

function renderSubmissionsList() {
    const container = document.getElementById('submissionsListTable');
    if (!container) return;

    if (AdminState.submissions.length === 0) {
        container.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-sub);">Немає завантажених відповідей учнів</td></tr>`;
        return;
    }

    container.innerHTML = AdminState.submissions.map((sub, idx) => `
        <tr>
            <td>${escapeHtml(sub.userEmail)}</td>
            <td>${escapeHtml(sub.testTitle)}</td>
            <td><strong>${sub.score}%</strong></td>
            <td>${sub.date || 'Невідомо'}</td>
            <td>
                <button onclick="inspectSubmission(${idx})" class="btn-primary" style="padding: 4px 8px; font-size: 0.8rem;">
                    <i class="fa-solid fa-eye"></i> Перевірити карту
                </button>
            </td>
        </tr>
    `).join('');
}

window.inspectSubmission = function(index) {
    const sub = AdminState.submissions[index];
    if (!sub) return;

    alert(`Перегляд проходження користувача ${sub.userEmail}\nРезультат: ${sub.score}%\nЧас виконання: ${sub.duration || '2 хв'}`);
};

// ==========================================
// 9. ГЛОБАЛЬНІ НАЛАШТУВАННЯ ТА БЕКАП
// ==========================================
function initSettingsPanel() {
    const exportBtn = document.getElementById('exportBackupBtn');
    const importBtn = document.getElementById('importBackupBtn');
    const importInput = document.getElementById('importBackupInput');

    if (exportBtn) {
        exportBtn.addEventListener('click', exportFullBackup);
    }

    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', importFullBackup);
    }
}

function exportFullBackup() {
    const backupData = {
        tests: AdminState.tests,
        users: AdminState.users,
        submissions: AdminState.submissions,
        exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intermap_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Резервну копію даних успішно скачано!', 'success');
}

function importFullBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.tests && data.users) {
                AdminState.tests = data.tests;
                AdminState.users = data.users;
                AdminState.submissions = data.submissions || [];

                saveDatabase(CONFIG.STORAGE_KEYS.TESTS, AdminState.tests);
                saveDatabase(CONFIG.STORAGE_KEYS.USERS, AdminState.users);
                saveDatabase(CONFIG.STORAGE_KEYS.SUBMISSIONS, AdminState.submissions);

                renderDashboard();
                showToast('Дані успішно відновлено з файлу!', 'success');
            } else {
                showToast('Некоректний формат файлу резервної копії.', 'error');
            }
        } catch (err) {
            showToast('Помилка зчитування JSON файлу.', 'error');
        }
    };
    reader.readAsText(file);
}

// ==========================================
// 10. ДОПОМІЖНІ ІНСТРУМЕНТИ ТА UI
// ==========================================
function initGlobalEvents() {
    window.addEventListener('resize', () => {
        if (AdminState.activeTab === 'editor') redrawMapCanvas();
    });
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.color = '#fff';
    toast.style.fontWeight = '600';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    toast.style.transition = 'all 0.3s ease';

    if (type === 'success') toast.style.background = 'var(--success-color)';
    else if (type === 'error') toast.style.background = 'var(--danger-color)';
    else toast.style.background = 'var(--accent-color)';

    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function hexToRgba(hex, alpha = 1) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

// Логіка кнопки "Вийти"
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (confirm('Ви дійсно бажаєте вийти з акаунта?')) {
        try {
            // Якщо підключений модуль Firebase Auth
            if (window.FirebaseAuthModule) {
                await window.FirebaseAuthModule.logout();
            } else {
                // Очищення локального сховища
                localStorage.removeItem('isOwnerAuthorized');
                localStorage.removeItem('userRole');
                localStorage.removeItem('userEmail');
            }
        } catch (error) {
            console.error('Помилка при виході:', error);
        } finally {
            // Перенаправлення на головну сторінку
            window.location.href = 'index.html';
        }
    }
});
