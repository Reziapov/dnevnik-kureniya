(() => {
    const KEY = 'smokingDiaryApp_v1';
    const defaultTimes = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '21:00', '22:30'];

    function getLocalDate() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    let state = {
        times: defaultTimes, checked: [], limit: 10, note: '', history: [], dayStarted: (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })(), editing: false
    };

    const $ = id => document.getElementById(id);

    const SUPABASE_URL = 'https://bpdkeogfijpcipauqktv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_TCnm7714eDOGW3NrYGD09w_JFu-S4OR';
    const cloud = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    let currentUser = null, saveTimer = null, applyingCloud = false;

    function status(msg) {
        $('syncStatus').textContent = 'Статус: ' + msg;
    }

    async function saveCloud() {
        if (!currentUser || applyingCloud) return;

        const snapshot = {...state, editing: false};

        status('сохраняю изменения…');

        const {error} = await cloud.from('smoking_diary').upsert({
            user_id: currentUser.id,
            entry_date: getLocalDate(),
            data: snapshot,
            updated_at: new Date().toISOString()
        }, {onConflict: 'user_id'});

        if (error) {
            status('ошибка сохранения: ' + error.message);
            return;
        }

        status('синхронизировано ✓');
    }

    // Автоматически сохраняем прошедший день,
    // но не создаём пустую запись.
    function archiveCurrentDayIfHasData() {
        if (state.checked.length === 0 && !(state.note || '').trim()) {
            return;
        }

        state.history.push({
            day: state.history.length + 1,
            date: state.dayStarted,
            smoked: state.checked.length,
            limit: state.limit,
            note: state.note || ''
        });
    }

    async function loadCloud() {
        if (!currentUser) return;

        status('загружаю данные…');

        const {data, error} = await cloud
            .from('smoking_diary')
            .select('data')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (error) {
            status('ошибка загрузки: ' + error.message);
            return;
        }

        if (
            data &&
            data.data &&
            Array.isArray(data.data.times) &&
            Array.isArray(data.data.checked) &&
            Array.isArray(data.data.history)
        ) {
            applyingCloud = true;

            state = {...state, ...data.data, editing: false};

            const today = getLocalDate();

            if (state.dayStarted && state.dayStarted !== today) {
                archiveCurrentDayIfHasData();

                state.checked = [];
                state.note = '';
                state.dayStarted = today;
                state.editing = false;
            } else if (!state.dayStarted) {
                state.dayStarted = today;
            }

            persistLocalOnly();
            render();

            applyingCloud = false;

            await saveCloud();
            status('загружено из облака ✓');
        } else {
            await saveCloud();
        }
    }

    function persistLocalOnly() {
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        } catch (e) {
        }
    }

    async function connectAccount() {
        const email = $('authEmail').value.trim();
        const password = $('authPassword').value;

        if (!email || !password) {
            toast('Введи email и пароль дневника');
            return;
        }

        $('loginBtn').disabled = true;
        status('выполняю вход…');

        const {data, error} = await cloud.auth.signInWithPassword({
            email,
            password
        });

        $('loginBtn').disabled = false;

        if (error) {
            status('не удалось войти: ' + error.message);
            return;
        }

        currentUser = data.user;
        $('authEmail').disabled = true;
        $('authPassword').style.display = 'none';
        $('loginBtn').style.display = 'none';
        $('logoutBtn').style.display = 'block';

        await loadCloud();
    }

    async function disconnectAccount() {
        await cloud.auth.signOut();

        currentUser = null;

        $('authEmail').disabled = false;
        $('authPassword').style.display = 'block';
        $('loginBtn').style.display = 'block';
        $('logoutBtn').style.display = 'none';

        status('вышли из аккаунта. Локальная копия осталась на этом устройстве.');
    }

    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(KEY));

            if (
                s &&
                Array.isArray(s.times) &&
                Array.isArray(s.checked) &&
                Array.isArray(s.history)
            ) {
                state = {...state, ...s};
            }
        } catch (e) {
        }

        const today = getLocalDate();

        if (state.dayStarted && state.dayStarted !== today) {
            archiveCurrentDayIfHasData();

            state.checked = [];
            state.note = '';
            state.dayStarted = today;
            state.editing = false;

            persist();
        } else if (!state.dayStarted) {
            state.dayStarted = today;
        }
    }

    function persist() {
        persistLocalOnly();

        if (currentUser && !applyingCloud) {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => saveCloud(), 500);
        }
    }

    function toast(msg) {
        const t = $('toast');

        t.textContent = msg;
        t.style.display = 'block';

        clearTimeout(toast.timer);

        toast.timer = setTimeout(() => {
            t.style.display = 'none';
        }, 2600);
    }

    function safeDate(d) {
        try {
            return new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch (e) {
            return d || 'Без даты';
        }
    }

    function getScheduleTimes() {
        return [...state.times];
    }

    function renderSchedule() {
        const root = $('schedule');

        root.innerHTML = '';

        const scheduleTimes = getScheduleTimes();

        scheduleTimes.forEach((time, i) => {
            const row = document.createElement('div');

            row.className = 'item' + (state.checked.includes(i) ? ' done' : '');

            const cb = document.createElement('input');

            cb.type = 'checkbox';
            cb.checked = state.checked.includes(i);
            cb.setAttribute('aria-label', 'Отметить сигарету ' + (i + 1));

            cb.addEventListener('change', () => {
                state.checked = cb.checked
                    ? [...new Set([...state.checked, i])]
                    : state.checked.filter(n => n !== i);

                if (cb.checked) {
                    const actualTime = new Date();

                    state.times[i] =
                        String(actualTime.getHours()).padStart(2, '0') + ':' +
                        String(actualTime.getMinutes()).padStart(2, '0');

                    let previous = state.times[i];

                    for (let j = i + 1; j < state.times.length; j++) {
                        if (state.checked.includes(j)) {
                            previous = state.times[j];
                            continue;
                        }

                        const minutes =
                            (Number(previous.slice(0, 2)) * 60 +
                                Number(previous.slice(3)) + 90) % 1440;

                        state.times[j] =
                            String(Math.floor(minutes / 60)).padStart(2, '0') + ':' +
                            String(minutes % 60).padStart(2, '0');

                        previous = state.times[j];
                    }
                }

                persist();
                render();
            });

            row.appendChild(cb);

            const details = document.createElement('div');

            details.className = 'details';

            if (state.editing) {
                const inp = document.createElement('input');

                inp.type = 'time';
                inp.className = 'time-edit';
                inp.value = time || '09:00';
                inp.setAttribute('aria-label', 'Время сигареты ' + (i + 1));
                inp.style.display = 'block';
                inp.style.minHeight = '42px';
                inp.style.color = '#17221c';
                inp.style.background = '#fff';

                inp.addEventListener('change', () => {
                    const newTime = inp.value;

                    if (!newTime) return;

                    state.times[i] = newTime;

                    let previous = newTime;

                    for (let j = i + 1; j < state.times.length; j++) {
                        if (state.checked.includes(j)) {
                            previous = state.times[j];
                            continue;
                        }

                        if (!previous || !/^\d{2}:\d{2}$/.test(previous)) {
                            continue;
                        }

                        let minutes =
                            Number(previous.slice(0, 2)) * 60 +
                            Number(previous.slice(3)) + 90;

                        minutes %= 1440;

                        state.times[j] =
                            String(Math.floor(minutes / 60)).padStart(2, '0') +
                            ':' +
                            String(minutes % 60).padStart(2, '0');

                        previous = state.times[j];
                    }

                    persist();
                    renderSchedule();
                });

                details.appendChild(inp);
            } else {
                const t = document.createElement('span');

                t.className = 'time-label';
                t.textContent = time || 'Время не задано';
                t.style.display = 'block';
                t.style.fontSize = '17px';
                t.style.color = '#17221c';

                details.appendChild(t);
            }

            const n = document.createElement('span');

            n.className = 'num';
            n.textContent = 'Сигарета № ' + (i + 1);

            details.appendChild(n);
            row.appendChild(details);

            if (state.editing) {
                const del = document.createElement('button');

                del.type = 'button';
                del.textContent = 'Удалить';
                del.className = 'outline';
                del.setAttribute('aria-label', 'Удалить дополнительное время ' + (i + 1));
                del.style.marginLeft = 'auto';
                del.style.padding = '8px 10px';
                del.style.fontSize = '14px';
                del.style.flexShrink = '0';

                del.addEventListener('click', () => {
                    if (state.times.length <= 1) {
                        toast('Нужно оставить хотя бы одно время');
                        return;
                    }

                    state.times.splice(i, 1);

                    state.checked = state.checked
                        .filter(n => n !== i)
                        .map(n => n > i ? n - 1 : n);

                    persist();
                    renderSchedule();
                    render();

                    toast('Время удалено');
                });

                row.appendChild(del);
            }

            if (state.checked.includes(i)) {
                const mark = document.createElement('span');

                mark.textContent = '✓';
                mark.style.color = '#27824e';
                mark.style.fontWeight = '800';

                row.appendChild(mark);
            }

            root.appendChild(row);
        });

        $('editBtn').textContent = state.editing ? 'Готово' : 'Изменить время';

        $('addTimeBtn').textContent = state.editing
            ? '＋ Добавить ещё одно время'
            : '＋ Добавить дополнительное время';
    }

    // Диаграмма статистики.
    function renderSmokingChart() {
        const root = $('smokingChart');
        const periodSelect = $('chartPeriod');

        if (!root || !periodSelect) return;

        const today = getLocalDate();
        const byDate = new Map();

        // Собираем все записи истории.
        // Если за одну дату есть несколько записей,
        // складываем количество сигарет.
        (state.history || []).forEach(d => {
            if (d.date && Number.isFinite(Number(d.smoked))) {
                const smoked = Math.max(0, Number(d.smoked) || 0);
                const limit = Math.max(1, Number(d.limit) || 10);

                const existing = byDate.get(d.date);

                if (existing) {
                    existing.smoked += smoked;
                    existing.limit = Math.max(existing.limit, limit);
                } else {
                    byDate.set(d.date, {
                        date: d.date,
                        smoked,
                        limit
                    });
                }
            }
        });

        // Добавляем текущий день.
        // Если за эту дату уже есть записи в истории,
        // добавляем к ним текущие отметки.
        const currentDate = state.dayStarted || today;
        const currentSmoked = Math.max(0, state.checked.length);
        const currentLimit = Math.max(1, Number(state.limit) || 10);

        const existingCurrent = byDate.get(currentDate);

        if (existingCurrent) {
            existingCurrent.smoked += currentSmoked;
            existingCurrent.limit = Math.max(existingCurrent.limit, currentLimit);
        } else {
            byDate.set(currentDate, {
                date: currentDate,
                smoked: currentSmoked,
                limit: currentLimit
            });
        }

        const allDays = [...byDate.values()].sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        const period = periodSelect.value || '7';

        let items = [];
        let caption = '';

        if (period === '7' || period === '14' || period === '30') {
            const count = Number(period);

            const end = new Date(today + 'T12:00:00');
            const start = new Date(end);

            start.setDate(start.getDate() - count + 1);

            for (let i = 0; i < count; i++) {
                const d = new Date(start);

                d.setDate(start.getDate() + i);

                const key =
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                const saved = byDate.get(key);

                items.push({
                    label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
                    smoked: saved ? saved.smoked : 0,
                    limit: saved ? saved.limit : (Number(state.limit) || 10),
                    date: key
                });
            }

            caption = `Каждый столбик — отдельный календарный день за последние ${count} дней.`;
        } else {
            const groups = new Map();

            allDays.forEach(d => {
                const key = period === 'months'
                    ? d.date.slice(0, 7)
                    : d.date.slice(0, 4);

                if (!groups.has(key)) {
                    groups.set(key, {
                        sum: 0,
                        limitSum: 0,
                        days: 0
                    });
                }

                const g = groups.get(key);

                g.sum += d.smoked;
                g.limitSum += d.limit;
                g.days += 1;
            });

            let keys = [...groups.keys()].sort();

            if (period === 'months') {
                keys = keys.slice(-12);
            }

            items = keys.map(key => {
                const g = groups.get(key);

                const average = g.days ? g.sum / g.days : 0;

                const averageLimit = g.days
                    ? g.limitSum / g.days
                    : (Number(state.limit) || 10);

                return {
                    label: period === 'months'
                        ? key.slice(5) + '.' + key.slice(2, 4)
                        : key,
                    smoked: average,
                    limit: averageLimit,
                    total: g.sum,
                    days: g.days
                };
            });

            caption = period === 'months'
                ? 'По месяцам показано среднее за день (до 12 последних месяцев); число над столбиком — среднее, с одним знаком после запятой.'
                : 'По годам показано среднее за день; число над столбиком — среднее, с одним знаком после запятой.';
        }

        if (!items.length) {
            root.innerHTML = '<p class="muted">Пока недостаточно данных для графика.</p>';
            $('chartCaption').textContent = caption;
            return;
        }

        const width = Math.max(
            320,
            items.length * (
                period === '7' ? 42 :
                period === '14' ? 30 :
                period === '30' ? 22 : 48
            )
        );

        const height = 220;
        const left = 30;
        const right = 8;
        const top = 24;
        const bottom = 35;

        const plotH = height - top - bottom;

        const maxValue = Math.max(
            1,
            ...items.map(d => Math.max(d.smoked, d.limit))
        );

        const scaleMax = Math.ceil(maxValue * 1.15);

        const y = value =>
            top + plotH - (value / scaleMax) * plotH;

        const slot = (width - left - right) / items.length;

        const barW = Math.max(5, Math.min(24, slot * 0.58));

        const averageLimit =
            items.reduce((sum, d) => sum + d.limit, 0) / items.length;

        const limitLines = `
            <line
                x1="${left}"
                y1="${y(averageLimit)}"
                x2="${width - right}"
                y2="${y(averageLimit)}"
                stroke="#6c7370"
                stroke-width="1.5"
                stroke-dasharray="5 4"
            />
        `;

        const bars = items.map((d, i) => {
            const cx = left + i * slot + slot / 2;
            const baseY = top + plotH;

            const blueValue = Math.min(d.smoked, d.limit);
            const orangeValue = Math.max(0, d.smoked - d.limit);

            const blueH = blueValue / scaleMax * plotH;
            const orangeH = orangeValue / scaleMax * plotH;

            const blueY = baseY - blueH;
            const orangeY = blueY - orangeH;

            const totalLabel =
                period === 'months' || period === 'years'
                    ? d.smoked.toFixed(1).replace('.', ',')
                    : String(d.smoked);

            const labelY = Math.max(12, y(d.smoked) - 5);

            const title =
                `${d.label}: ${totalLabel} сигарет в среднем за день, лимит ${d.limit.toFixed(1).replace('.', ',')}`;

            return `
                <g>
                    <title>${title}</title>

                    ${blueH > 0
                        ? `<rect x="${cx - barW / 2}" y="${blueY}" width="${barW}" height="${blueH}" rx="2" fill="#367bd6"/>`
                        : ''
                    }

                    ${orangeH > 0
                        ? `<rect x="${cx - barW / 2}" y="${orangeY}" width="${barW}" height="${orangeH}" rx="2" fill="#f39a38"/>`
                        : ''
                    }

                    <text
                        x="${cx}"
                        y="${labelY}"
                        text-anchor="middle"
                        font-size="${items.length > 20 ? 9 : 10}"
                        fill="#17221c"
                    >${totalLabel}</text>

                    <text
                        x="${cx}"
                        y="${height - 13}"
                        text-anchor="middle"
                        font-size="${items.length > 20 ? 8 : 10}"
                        fill="#66736b"
                    >${d.label}</text>
                </g>
            `;
        }).join('');

        const grid = [0, .25, .5, .75, 1].map(f => {
            const value = scaleMax * f;
            const yy = y(value);

            return `
                <g>
                    <line
                        x1="${left}"
                        y1="${yy}"
                        x2="${width - right}"
                        y2="${yy}"
                        stroke="#e1e8e3"
                        stroke-width="1"
                    />

                    <text
                        x="${left - 5}"
                        y="${yy + 3}"
                        text-anchor="end"
                        font-size="9"
                        fill="#66736b"
                    >${Math.round(value)}</text>
                </g>
            `;
        }).join('');

        root.innerHTML = `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 ${width} ${height}"
                role="img"
                aria-label="Столбчатая диаграмма количества сигарет"
            >
                ${grid}
                ${limitLines}
                ${bars}
            </svg>
        `;

        $('chartCaption').textContent = caption;
    }

    function render() {
        state.limit = Math.max(1, Math.min(20, Number(state.limit) || 10));

        const count = state.checked.length;
        const limit = state.limit;

        $('dateLabel').textContent = safeDate(state.dayStarted);
        $('smokedCount').textContent = count;
        $('plannedText').textContent = 'из ' + limit + ' запланированных';
        $('remaining').textContent = Math.max(0, limit - count);
        $('limitState').textContent = count > limit
            ? 'лимит превышен'
            : 'сигарет осталось';

        $('lessCount').textContent = 20 - count;

        $('reduction').textContent =
            Math.round((20 - count) / 20 * 100) + '%';

        $('progressBar').style.width =
            Math.min(100, count / limit * 100) + '%';

        $('progressText').textContent = count + ' из ' + limit + ' отмечено';

        $('limitInput').value = limit;
        $('note').value = state.note || '';

        renderSchedule();

        const hist = state.history;

        const total = hist.reduce((s, d) => s + d.smoked, 0);

        $('daysCount').textContent =
            hist.length + ' ' +
            (hist.length === 1
                ? 'день'
                : hist.length >= 2 && hist.length <= 4
                    ? 'дня'
                    : 'дней');

        $('average').textContent = hist.length
            ? (total / hist.length).toFixed(1).replace('.', ',')
            : '—';

        $('totalDaysSmoked').textContent = total;

        $('emptyHistory').style.display =
            hist.length ? 'none' : 'block';

        const list = $('historyList');

        list.innerHTML = '';

        [...hist].reverse().forEach(d => {
            const entry = document.createElement('div');

            entry.className = 'history-entry';

            const head = document.createElement('div');

            head.className = 'row';

            const title = document.createElement('strong');

            title.textContent = safeDate(d.date) + ' · День ' + d.day;

            const pill = document.createElement('span');

            pill.className =
                'pill' + (d.smoked > d.limit ? ' over' : '');

            pill.textContent = d.smoked <= d.limit
                ? 'Лимит соблюдён'
                : 'Лимит превышен';

            head.append(title, pill);

            entry.appendChild(head);

            const p = document.createElement('p');

            p.textContent =
                'Выкурено: ' + d.smoked + ' из ' + d.limit +
                ' · ' +
                (d.smoked <= 20
                    ? 'на ' + (20 - d.smoked) + ' меньше обычного'
                    : 'на ' + (d.smoked - 20) + ' больше обычного');

            entry.appendChild(p);

            if (d.note) {
                const note = document.createElement('p');

                note.className = 'muted';
                note.textContent = 'Заметка: ' + d.note;

                entry.appendChild(note);
            }

            list.appendChild(entry);
        });

        renderSmokingChart();
    }

    $('chartPeriod').addEventListener('change', renderSmokingChart);

    $('editBtn').addEventListener('click', () => {
        state.editing = !state.editing;

        persist();
        renderSchedule();

        $('editBtn').setAttribute('aria-pressed', String(state.editing));

        toast(state.editing
            ? 'Режим редактирования времени включён'
            : 'Время сохранено');
    });

    $('addTimeBtn').addEventListener('click', () => {
        const last = state.times.length
            ? state.times[state.times.length - 1]
            : '09:00';

        let next = '23:00';

        if (last && /^\d{2}:\d{2}$/.test(last)) {
            const mins =
                Number(last.slice(0, 2)) * 60 +
                Number(last.slice(3)) + 30;

            next = mins >= 1440
                ? '23:00'
                : String(Math.floor(mins / 60)).padStart(2, '0') +
                  ':' +
                  String(mins % 60).padStart(2, '0');
        }

        state.times.push(next);
        state.editing = true;

        persist();
        renderSchedule();
        render();

        toast('Добавлено дополнительное время — при необходимости измени его');
    });

    $('limitInput').addEventListener('change', () => {
        state.limit = Math.max(
            1,
            Math.min(20, Number($('limitInput').value) || 10)
        );

        persist();
        render();
    });

    $('note').addEventListener('input', () => {
        state.note = $('note').value;
        persist();
    });

    $('resetChecks').addEventListener('click', () => {
        if (confirm('Сбросить все отметки за текущий день? История не изменится.')) {
            state.checked = [];

            persist();
            render();

            toast('Отметки сброшены');
        }
    });

    // Сохранение итогов дня.
    $('saveDay').addEventListener('click', () => {
        if (!confirm(
            'Сохранить ' + state.checked.length +
            ' сигарет за ' + safeDate(state.dayStarted) +
            ' и начать новый день?'
        )) {
            return;
        }

        state.history.push({
            day: state.history.length + 1,
            date: state.dayStarted,
            smoked: state.checked.length,
            limit: state.limit,
            note: state.note || ''
        });

        state.checked = [];
        state.note = '';

        const d = new Date();

        state.dayStarted =
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        state.editing = false;

        persist();
        render();

        toast('Итог сохранён. Новый день начат.');
    });

    $('exportBtn').addEventListener('click', () => {
        const rows = [
            ['Дата', 'День', 'Выкурено', 'Лимит', 'Заметка'],
            [
                state.dayStarted,
                'Текущий день',
                state.checked.length,
                state.limit,
                state.note || ''
            ],
            ...state.history.map(day => [
                day.date,
                day.day,
                day.smoked,
                day.limit,
                day.note || ''
            ])
        ];

        const csv = '\uFEFF' + rows
            .map(row => row.map(value =>
                '"' + String(value).replace(/"/g, '""') + '"'
            ).join(';'))
            .join('\r\n');

        const blob = new Blob([csv], {
            type: 'text/csv;charset=utf-8;'
        });

        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;
        a.download = 'dnevnik-kureniya-statistika.csv';
        a.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        toast('Статистика экспортирована в CSV');
    });

    $('importBtn').addEventListener('click', () => {
        $('importFile').click();
    });

    $('importFile').addEventListener('change', async e => {
        const f = e.target.files[0];

        if (!f) return;

        try {
            const s = JSON.parse(await f.text());

            if (
                !Array.isArray(s.times) ||
                !Array.isArray(s.checked) ||
                !Array.isArray(s.history)
            ) {
                throw new Error();
            }

            if (confirm('Заменить текущие данные данными из файла?')) {
                state = {...state, ...s};

                persist();
                render();

                toast('Данные импортированы');
            }
        } catch (err) {
            alert('Не удалось прочитать файл. Выбери резервную копию этого приложения.');
        }

        e.target.value = '';
    });

    $('clearHistory').addEventListener('click', () => {
        if (confirm(
            'Удалить всю сохранённую историю? Это действие нельзя отменить. Рекомендуется сначала сделать экспорт.'
        )) {
            state.history = [];

            persist();
            render();

            toast('История удалена');
        }
    });

    $('loginBtn').addEventListener('click', connectAccount);
    $('logoutBtn').addEventListener('click', disconnectAccount);

    cloud.auth.getSession().then(async ({data}) => {
        if (data.session) {
            currentUser = data.session.user;

            $('authEmail').value = currentUser.email || '';
            $('authEmail').disabled = true;
            $('authPassword').style.display = 'none';
            $('loginBtn').style.display = 'none';
            $('logoutBtn').style.display = 'block';

            await loadCloud();
        }
    });

    load();
    render();
})();