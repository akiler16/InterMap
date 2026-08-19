// script.js
document.addEventListener('DOMContentLoaded', () => {
    const isTeacherPage = document.getElementById('addTask') !== null;
    const isStudentPage = document.getElementById('studentForm') !== null;

    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    let imageUrl = localStorage.getItem('imageUrl');
    let teacherEmail = localStorage.getItem('teacherEmail') || '';

    // ================= ЛОГІКА ВЧИТЕЛЯ =================
    if (isTeacherPage) {
        const emailInput = document.getElementById('teacherEmail');
        const mapImageInput = document.getElementById('mapImage');
        const mapImagePreview = document.getElementById('mapImagePreview');
        const teacherMapWrapper = document.getElementById('teacherMapWrapper');
        const taskSection = document.getElementById('taskSection');
        const addTaskBtn = document.getElementById('addTask');
        const teacherTasksList = document.getElementById('teacherTasksList');
        const generateLinkBtn = document.getElementById('generateStudentLink');
        const shareLinkContainer = document.getElementById('shareLinkContainer');
        const studentLinkInput = document.getElementById('studentLinkInput');

        let currentStandardPoint = null;

        if (teacherEmail) emailInput.value = teacherEmail;
        if (imageUrl) {
            mapImagePreview.src = imageUrl;
            teacherMapWrapper.style.display = 'block';
            taskSection.style.display = 'block';
            renderTeacherTasks();
        }

        emailInput.addEventListener('input', (e) => {
            localStorage.setItem('teacherEmail', e.target.value);
        });

        mapImageInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imageUrl = e.target.result;
                    localStorage.setItem('imageUrl', imageUrl);
                    mapImagePreview.src = imageUrl;
                    teacherMapWrapper.style.display = 'block';
                    taskSection.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });

        mapImagePreview.addEventListener('click', (e) => {
            const rect = mapImagePreview.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            currentStandardPoint = { x, y };
            alert(`✅ Еталонну точку встановлено! (X: ${x.toFixed(1)}%, Y: ${y.toFixed(1)}%)`);
        });

        addTaskBtn.addEventListener('click', () => {
            const text = document.getElementById('taskText').value.trim();
            const plus = parseInt(document.getElementById('taskPointsPlus').value) || 5;
            const minus = parseInt(document.getElementById('taskPointsMinus').value) || 2;

            if (!text) {
                alert('Введіть текст завдання!');
                return;
            }
            if (!currentStandardPoint) {
                alert('Будь ласка, натисніть на карту, щоб вказати правильну відповідь!');
                return;
            }

            const newTask = {
                id: Date.now(),
                text,
                points: { plus, minus },
                standardPoint: currentStandardPoint
            };

            tasks.push(newTask);
            localStorage.setItem('tasks', JSON.stringify(tasks));

            document.getElementById('taskText').value = '';
            currentStandardPoint = null;
            renderTeacherTasks();
            alert('Завдання успішно додано!');
        });

        function renderTeacherTasks() {
            teacherTasksList.innerHTML = '';
            if (tasks.length === 0) {
                teacherTasksList.innerHTML = '<p class="empty-text">Ще немає доданих завдань.</p>';
                return;
            }

            tasks.forEach((task, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<b>Зв. ${index + 1}:</b> ${task.text} 
                    <span style="color: green;">(+${task.points.plus})</span> 
                    <span style="color: red;">(-${task.points.minus})</span>
                    <button onclick="deleteTask(${task.id})" style="float: right; background: #dc3545; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer;">Видалити</button>`;
                teacherTasksList.appendChild(li);
            });
        }

        window.deleteTask = function(id) {
            tasks = tasks.filter(t => t.id !== id);
            localStorage.setItem('tasks', JSON.stringify(tasks));
            renderTeacherTasks();
        };

        generateLinkBtn.addEventListener('click', () => {
            if (tasks.length === 0) {
                alert('Спочатку додайте хоча б одне завдання!');
                return;
            }
            const currentUrl = window.location.href;
            const studentLink = currentUrl.replace('teacher.html', 'student.html');
            studentLinkInput.value = studentLink;
            shareLinkContainer.style.display = 'block';
        });
    }

    // ================= ЛОГІКА УЧНЯ =================
    if (isStudentPage) {
        const studentForm = document.getElementById('studentForm');
        const loginScreen = document.getElementById('loginScreen');
        const studentContent = document.getElementById('studentContent');
        const mapImage = document.getElementById('mapImage');
        const taskList = document.getElementById('taskList');
        const markersToolsContainer = document.getElementById('markersToolsContainer');
        const submitTestBtn = document.getElementById('submitTestBtn');
        const studentMapContainer = document.getElementById('studentMapContainer');

        let studentName = '';
        let studentAnswers = {};

        if (imageUrl) {
            mapImage.src = imageUrl;
        } else {
            alert('Попередження: вчитель ще не завантажив карту!');
        }

        studentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            studentName = document.getElementById('name').value.trim();
            if (!studentName) return;

            loginScreen.style.display = 'none';
            studentContent.style.display = 'flex';
            initStudentWorkspace();
        });

        function initStudentWorkspace() {
            taskList.innerHTML = '';
            markersToolsContainer.innerHTML = '';

            tasks.forEach((task, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<b>Завдання ${index + 1}:</b> ${task.text}`;
                taskList.appendChild(li);

                const markerTool = document.createElement('div');
                markerTool.classList.add('task-icon');
                markerTool.textContent = index + 1;
                markerTool.style.position = 'relative';
                markerTool.style.display = 'inline-block';
                markerTool.style.cursor = 'grab';

                makeDraggableOnMap(markerTool, index);
                markersToolsContainer.appendChild(markerTool);
            });
        }

        function makeDraggableOnMap(element, taskIndex) {
            let isDragging = false;

            element.addEventListener('mousedown', (e) => {
                isDragging = true;
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const rect = studentMapContainer.getBoundingClientRect();
                element.style.position = 'absolute';
                element.style.zIndex = 1000;
                element.style.left = `${e.clientX - rect.left}px`;
                element.style.top = `${e.clientY - rect.top}px`;
                studentMapContainer.appendChild(element);
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    const mapRect = mapImage.getBoundingClientRect();
                    const elRect = element.getBoundingClientRect();
                    
                    const x = ((elRect.left + elRect.width/2 - mapRect.left) / mapRect.width) * 100;
                    const y = ((elRect.top + elRect.height/2 - mapRect.top) / mapRect.height) * 100;

                    studentAnswers[taskIndex] = { x, y };
                }
            });
        }

        submitTestBtn.addEventListener('click', () => {
            let totalScore = 0;
            let maxScore = 0;
            let report = `Результати учня: ${studentName}\n\n`;

            tasks.forEach((task, index) => {
                maxScore += task.points.plus;
                const ans = studentAnswers[index];

                if (ans) {
                    const dx = ans.x - task.standardPoint.x;
                    const dy = ans.y - task.standardPoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance <= 8) { // Допуск 8% від розміру карти
                        totalScore += task.points.plus;
                        report += `Завдання ${index + 1}: Вірно (+${task.points.plus})\n`;
                    } else {
                        totalScore -= task.points.minus;
                        report += `Завдання ${index + 1}: Помилка (-${task.points.minus})\n`;
                    }
                } else {
                    totalScore -= task.points.minus;
                    report += `Завдання ${index + 1}: Не виконано (-${task.points.minus})\n`;
                }
            });

            report += `\nЗагальний бал: ${totalScore} з ${maxScore}`;
            alert(report);
        });
    }
});