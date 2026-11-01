const API_BASE = (window.API_BASE || 'http://localhost:8000/api/v1');

let currentToken = localStorage.getItem('token');
let currentSessionId = null;
let currentParticipant = null;
let currentDecisionNumber = 1;

function showScreen(screen) {
    document.getElementById('joinScreen').classList.add('hidden');
    document.getElementById('statusScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('debriefScreen').classList.add('hidden');
    
    if (screen === 'join') document.getElementById('joinScreen').classList.remove('hidden');
    else if (screen === 'status') document.getElementById('statusScreen').classList.remove('hidden');
    else if (screen === 'game') document.getElementById('gameScreen').classList.remove('hidden');
    else if (screen === 'debrief') document.getElementById('debriefScreen').classList.remove('hidden');
}

async function joinGroup() {
    const code = document.getElementById('groupCode').value;
    const errorEl = document.getElementById('joinError');
    errorEl.textContent = '';
    
    try {
        const res = await fetch(`${API_BASE}/groups/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        
        if (!res.ok) {
            const err = await res.json();
            errorEl.textContent = err.message || 'Ошибка входа';
            return;
        }
        
        const data = await res.json();
        currentToken = data.token;
        localStorage.setItem('token', currentToken);
        currentParticipant = data.participant;
        
        document.getElementById('groupTitle').textContent = data.group.title;
        document.getElementById('participantId').textContent = data.participant.id;
        
        renderAssignments(data.assignments);
        showScreen('status');
    } catch (e) {
        errorEl.textContent = 'Ошибка подключения к серверу';
    }
}

async function loadStatus() {
    try {
        const res = await fetch(`${API_BASE}/me/status`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!res.ok) {
            logout();
            return;
        }
        
        const data = await res.json();
        document.getElementById('groupTitle').textContent = data.group.title;
        document.getElementById('participantId').textContent = data.participant.id;
        renderAssignments(data.assignments);
        showScreen('status');
    } catch (e) {
        logout();
    }
}

function renderAssignments(assignments) {
    const list = document.getElementById('assignmentsList');
    list.innerHTML = '';
    
    const names = { pre: 'Входное задание', main: 'Основной месяц', post: 'Итоговое задание' };
    const states = { closed: 'Закрыто', available: 'Доступно', in_progress: 'В процессе', completed: 'Завершено' };
    
    for (const a of assignments) {
        const div = document.createElement('div');
        div.className = 'assignment';
        div.innerHTML = `
            <div>
                <strong>${names[a.kind]}</strong><br>
                <span class="info">${states[a.state]}</span>
            </div>
        `;
        
        if (a.state === 'available') {
            const btn = document.createElement('button');
            btn.style.width = 'auto';
            btn.style.padding = '8px 16px';
            btn.textContent = 'Начать';
            btn.onclick = () => startSession(a.kind);
            div.appendChild(btn);
        } else if (a.state === 'in_progress' && a.sessionId) {
            const btn = document.createElement('button');
            btn.style.width = 'auto';
            btn.style.padding = '8px 16px';
            btn.className = 'secondary';
            btn.textContent = 'Продолжить';
            btn.onclick = () => loadSession(a.sessionId);
            div.appendChild(btn);
        } else if (a.state === 'completed' && a.sessionId) {
            const btn = document.createElement('button');
            btn.style.width = 'auto';
            btn.style.padding = '8px 16px';
            btn.className = 'secondary';
            btn.textContent = 'Разбор';
            btn.onclick = () => viewDebriefForSession(a.sessionId);
            div.appendChild(btn);
        }
        
        list.appendChild(div);
    }
}

async function startSession(kind) {
    try {
        const res = await fetch(`${API_BASE}/sessions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ assignmentKind: kind })
        });
        
        if (!res.ok) {
            alert('Ошибка создания сессии');
            return;
        }
        
        const data = await res.json();
        currentSessionId = data.id;
        currentDecisionNumber = 1;
        renderGame(data);
        showScreen('game');
    } catch (e) {
        alert('Ошибка подключения');
    }
}

async function loadSession(sessionId) {
    try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!res.ok) {
            alert('Ошибка загрузки сессии');
            return;
        }
        
        const data = await res.json();
        currentSessionId = data.id;
        renderGame(data);
        showScreen('game');
    } catch (e) {
        alert('Ошибка подключения');
    }
}

function renderGame(data) {
    document.getElementById('gameDay').textContent = data.currentDay || 0;
    document.getElementById('gameStatus').textContent = data.status === 'active' ? 'Активна' : data.status;
    document.getElementById('gameBalance').textContent = ((data.balanceKopeck || 0) / 100).toFixed(2);
    
    const questionCard = document.getElementById('questionCard');
    const completedCard = document.getElementById('completedCard');
    
    if (data.status === 'completed') {
        questionCard.classList.add('hidden');
        completedCard.classList.remove('hidden');
        return;
    }
    
    questionCard.classList.remove('hidden');
    completedCard.classList.add('hidden');
    
    if (data.currentQuestion) {
        currentDecisionNumber = data.currentQuestion.decisionNumber || 1;
        document.getElementById('questionTitle').textContent = data.currentQuestion.title || 'Решение';
        document.getElementById('questionSituation').textContent = data.currentQuestion.situation || '';
        
        const choicesList = document.getElementById('choicesList');
        choicesList.innerHTML = '';
        
        for (const choice of data.currentQuestion.choices || []) {
            const btn = document.createElement('button');
            btn.className = 'choice';
            btn.textContent = choice.label;
            btn.onclick = () => makeDecision(choice.id, currentDecisionNumber);
            choicesList.appendChild(btn);
        }
    }
}

async function makeDecision(choiceId, decisionNumber) {
    try {
        const res = await fetch(`${API_BASE}/sessions/${currentSessionId}/decisions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ 
                choiceId, 
                decisionNumber: currentDecisionNumber,
                reason: 'Выбор сделан'
            })
        });
        
        if (res.status === 409) {
            alert('Состояние устарело, обновляем...');
            loadSession(currentSessionId);
            return;
        }
        
        if (!res.ok) {
            alert('Ошибка принятия решения');
            return;
        }
        
        const data = await res.json();
        if (data.sessionStatus === 'completed') {
            document.getElementById('questionCard').classList.add('hidden');
            document.getElementById('completedCard').classList.remove('hidden');
            document.getElementById('gameDay').textContent = data.currentDay;
            document.getElementById('gameBalance').textContent = ((data.balanceKopeck || 0) / 100).toFixed(2);
        } else if (data.nextQuestion) {
            const gameData = {
                status: 'active',
                currentDay: data.currentDay,
                balanceKopeck: data.balanceKopeck,
                currentQuestion: data.nextQuestion
            };
            renderGame(gameData);
        } else {
            loadSession(currentSessionId);
        }
    } catch (e) {
        alert('Ошибка подключения');
    }
}

async function viewDebrief() {
    viewDebriefForSession(currentSessionId);
}

async function viewDebriefForSession(sessionId) {
    try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/debrief`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!res.ok) {
            alert('Разбор недоступен');
            return;
        }
        
        const data = await res.json();
        const content = document.getElementById('debriefContent');
        content.innerHTML = `
            <p class="info">Сессия: ${data.sessionId}</p>
            <h3 style="margin: 16px 0 8px;">Метрики</h3>
            <pre style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(data.metrics, null, 2)}</pre>
            <h3 style="margin: 16px 0 8px;">Выводы</h3>
            <pre style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(data.summary || data.conclusions, null, 2)}</pre>
        `;
        showScreen('debrief');
    } catch (e) {
        alert('Ошибка подключения');
    }
}

function backToStatus() {
    loadStatus();
}

function logout() {
    localStorage.removeItem('token');
    currentToken = null;
    showScreen('join');
}

// Auto-load if token exists
if (currentToken) {
    loadStatus();
} else {
    showScreen('join');
}
