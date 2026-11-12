<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fraction Comparison Research Study</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 min-p-6 flex flex-col items-center justify-center min-h-screen">

    <div id="app" class="w-full max-w-4xl mx-auto p-4 sm:p-6">
        <!-- Dynamic Content Injected Here -->
    </div>

    <script>
        // Research Data & Configuration
        const fractionPairs = [
            { id: 1, n1: 5, d1: 7, n2: 11, d2: 15, correct: '<' },
            { id: 2, n1: 7, d1: 9, n2: 13, d2: 17, correct: '>' },
            { id: 3, n1: 8, d1: 11, n2: 11, d2: 15, correct: '<' },
            { id: 4, n1: 9, d1: 13, n2: 7, d2: 10, correct: '>' },
            { id: 5, n1: 11, d1: 16, n2: 13, d2: 19, correct: '<' },
            { id: 6, n1: 7, d1: 12, n2: 9, d2: 16, correct: '>' },
            { id: 7, n1: 13, d1: 18, n2: 8, d2: 11, correct: '<' },
            { id: 8, n1: 10, d1: 13, n2: 16, d2: 21, correct: '>' },
            { id: 9, n1: 11, d1: 14, n2: 14, d2: 18, correct: '<' },
            { id: 10, n1: 13, d1: 17, n2: 9, d2: 12, correct: '>' }
        ];

        // State Management
        let state = {
            view: 'welcome', // welcome, test, complete, admin_login, admin_dashboard
            participantName: '',
            cohort: '',
            currentIndex: 0,
            questions: [],
            responses: [],
            timer: 20,
            timerInterval: null,
            adminPasswordInput: '',
            adminError: false
        };

        const submissions = JSON.parse(localStorage.getItem('fraction_study_submissions') || '[]');

        function initApp() {
            render();
        }

        function render() {
            const app = document.getElementById('app');
            if (state.view === 'welcome') {
                app.innerHTML = `
                    <div class="bg-white shadow-xl rounded-2xl p-8 border border-slate-100 text-center">
                        <div class="inline-block p-3 bg-indigo-50 text-indigo-600 rounded-xl mb-4 font-semibold text-sm">Academic Research Study</div>
                        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">Fraction Comparison Research Test</h1>
                        <p class="text-slate-600 mb-6 max-w-xl mx-auto">Evaluating the effect of different visual representations on fraction comparison performance.</p>
                        
                        <div class="max-w-md mx-auto text-left space-y-4 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <label class="block text-sm font-medium text-slate-700">Participant Full Name</label>
                            <input type="text" id="participantNameInput" value="${state.participantName}" placeholder="Enter your full name..." class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" />
                        </div>

                        <div class="flex flex-col sm:flex-row justify-center gap-4">
                            <button onclick="startTest()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl shadow-md transition">Start Assessment</button>
                            <button onclick="showAdminLogin()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-6 py-3 rounded-xl transition">Researcher Portal</button>
                        </div>
                    </div>
                `;
            } else if (state.view === 'test') {
                const q = state.questions[state.currentIndex];
                app.innerHTML = `
                    <div class="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-slate-100">
                        <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                            <div>
                                <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">Question ${state.currentIndex + 1} of 30</span>
                                <span class="ml-2 text-xs text-slate-500 font-medium">Cohort ${state.cohort}</span>
                            </div>
                            <div class="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1 rounded-lg font-mono font-bold text-sm">
                                ⏱️ <span id="timerDisplay">${state.timer}</span>s
                            </div>
                        </div>

                        <div class="mb-8 min-h-[160px] flex flex-col items-center justify-center">
                            ${renderVisual(q)}
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                            <button onclick="submitAnswer('>')" class="p-4 border-2 border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-lg transition flex items-center justify-center gap-2">Greater Than (&gt;)</button>
                            <button onclick="submitAnswer('<')" class="p-4 border-2 border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-lg transition flex items-center justify-center gap-2">Less Than (&lt;)</button>
                            <button onclick="submitAnswer('=')" class="p-4 border-2 border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-lg transition flex items-center justify-center gap-2">Equal To (=)</button>
                        </div>

                        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div class="bg-indigo-600 h-full transition-all duration-300" style="width: ${((state.currentIndex + 1) / 30) * 100}%"></div>
                        </div>
                    </div>
                `;
                startTimer();
            } else if (state.view === 'complete') {
                app.innerHTML = `
                    <div class="bg-white shadow-xl rounded-2xl p-8 border border-slate-100 text-center">
                        <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">✓</div>
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">Assessment Completed!</h2>
                        <p class="text-slate-600 mb-6">Thank you, <strong>${state.participantName}</strong>. Your responses have been successfully recorded for research analysis.</p>
                        <button onclick="resetApp()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl shadow-md transition">Return Home</button>
                    </div>
                `;
            } else if (state.view === 'admin_login') {
                app.innerHTML = `
                    <div class="bg-white shadow-xl rounded-2xl p-8 border border-slate-100 max-w-md mx-auto">
                        <h2 class="text-xl font-bold text-slate-900 mb-4 text-center">Researcher Portal Login</h2>
                        <div class="space-y-4 mb-6">
                            <label class="block text-sm font-medium text-slate-700">Enter Admin Password</label>
                            <input type="password" id="adminPassInput" placeholder="••••" class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                            ${state.adminError ? '<p class="text-red-500 text-sm">Incorrect password. Please try again.</p>' : ''}
                        </div>
                        <div class="flex gap-4">
                            <button onclick="verifyAdmin()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition">Login</button>
                            <button onclick="resetApp()" class="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition">Cancel</button>
                        </div>
                    </div>
                `;
            } else if (state.view === 'admin_dashboard') {
                const stats = calculateANOVAStats();
                app.innerHTML = `
                    <div class="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-slate-100">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-4 border-b border-slate-100 gap-4">
                            <div>
                                <h2 class="text-2xl font-bold text-slate-900">Researcher Dashboard & ANOVA Analysis</h2>
                                <p class="text-sm text-slate-500">Total Participants: ${submissions.length}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="exportCSV()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition">Export CSV</button>
                                <button onclick="resetApp()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-lg transition">Logout</button>
                            </div>
                        </div>

                        <!-- ANOVA Metrics Grid -->
                        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <p class="text-xs text-slate-500 font-medium uppercase">Between-Group SS (SSB)</p>
                                <p class="text-xl font-bold text-slate-900 mt-1">${stats.SSB.toFixed(2)}</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <p class="text-xs text-slate-500 font-medium uppercase">Within-Group SS (SSW)</p>
                                <p class="text-xl font-bold text-slate-900 mt-1">${stats.SSW.toFixed(2)}</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <p class="text-xs text-slate-500 font-medium uppercase">F-Statistic</p>
                                <p class="text-xl font-bold text-indigo-600 mt-1">${stats.F.toFixed(4)}</p>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <p class="text-xs text-slate-500 font-medium uppercase">Est. p-value</p>
                                <p class="text-xl font-bold text-slate-900 mt-1">${stats.pValue}</p>
                            </div>
                        </div>

                        <!-- Group Performance Table -->
                        <h3 class="text-lg font-bold text-slate-800 mb-3">Performance by Format Group</h3>
                        <div class="overflow-x-auto mb-8">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="bg-slate-100 text-slate-700 text-xs uppercase font-semibold">
                                        <th class="p-3">Cohort / Format</th>
                                        <th class="p-3">Sample Size (n)</th>
                                        <th class="p-3">Mean Score (/10)</th>
                                        <th class="p-3">Standard Deviation</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200 text-sm">
                                    <tr>
                                        <td class="p-3 font-medium">Group A (Numbers → Pie → Bar)</td>
                                        <td class="p-3">${stats.groups.A.n}</td>
                                        <td class="p-3">${stats.groups.A.mean.toFixed(2)}</td>
                                        <td class="p-3">${stats.groups.A.sd.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td class="p-3 font-medium">Group B (Pie → Bar → Numbers)</td>
                                        <td class="p-3">${stats.groups.B.n}</td>
                                        <td class="p-3">${stats.groups.B.mean.toFixed(2)}</td>
                                        <td class="p-3">${stats.groups.B.sd.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td class="p-3 font-medium">Group C (Bar → Numbers → Pie)</td>
                                        <td class="p-3">${stats.groups.C.n}</td>
                                        <td class="p-3">${stats.groups.C.mean.toFixed(2)}</td>
                                        <td class="p-3">${stats.groups.C.sd.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Participants Submissions List -->
                        <h3 class="text-lg font-bold text-slate-800 mb-3">Participant Records</h3>
                        <div class="overflow-x-auto max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-slate-100 text-slate-700 text-xs uppercase font-semibold sticky top-0">
                                    <tr>
                                        <th class="p-3">Name</th>
                                        <th class="p-3">Cohort</th>
                                        <th class="p-3">Total Score</th>
                                        <th class="p-3">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200 text-sm">
                                    ${submissions.length === 0 ? '<tr><td colspan="4" class="p-4 text-center text-slate-400">No submissions recorded yet.</td></tr>' : submissions.map(s => `
                                        <tr>
                                            <td class="p-3 font-medium">${s.name}</td>
                                            <td class="p-3">Group ${s.cohort}</td>
                                            <td class="p-3">${s.score} / 30</td>
                                            <td class="p-3 text-slate-500 text-xs">${new Date(s.timestamp).toLocaleString()}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        }

        function startTest() {
            const nameInput = document.getElementById('participantNameInput');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) {
                alert('Please enter your participant full name.');
                return;
            }
            state.participantName = name;

            // Assign cohort round-robin
            const cohorts = ['A', 'B', 'C'];
            state.cohort = cohorts[submissions.length % 3];

            // Build 30 questions based on cohort sequence
            // Group A: Num (1-10) -> Pie (11-20) -> Bar (21-30)
            // Group B: Pie (1-10) -> Bar (11-20) -> Num (21-30)
            // Group C: Bar (1-10) -> Num (11-20) -> Pie (21-30)
            let seq = [];
            if (state.cohort === 'A') {
                fractionPairs.forEach(q => seq.push({ ...q, type: 'number' }));
                fractionPairs.forEach(q => seq.push({ ...q, type: 'pie' }));
                fractionPairs.forEach(q => seq.push({ ...q, type: 'bar' }));
            } else if (state.cohort === 'B') {
                fractionPairs.forEach(q => seq.push({ ...q, type: 'pie' }));
                fractionPairs.forEach(q => seq.push({ ...q, type: 'bar' }));
                fractionPairs.forEach(q => seq.push({ ...q, type: 'number' }));
            } else {
                fractionPairs.forEach(q => seq.push({ ...q, type: 'bar' }));
                fractionPairs.forEach(q => seq.push({ ...q, type: 'number' }));
                fractionPairs.forEach(q => seq.push({ ...q, type: 'pie' }));
            }

            state.questions = seq;
            state.currentIndex = 0;
            state.responses = [];
            state.view = 'test';
            render();
        }

        function startTimer() {
            clearInterval(state.timerInterval);
            state.timer = 20;
            state.timerInterval = setInterval(() => {
                state.timer--;
                const display = document.getElementById('timerDisplay');
                if (display) display.innerText = state.timer;
                if (state.timer <= 0) {
                    clearInterval(state.timerInterval);
                    submitAnswer('-'); // Timeout / unanswered
                }
            }, 1000);
        }

        function submitAnswer(ans) {
            clearInterval(state.timerInterval);
            const q = state.questions[state.currentIndex];
            state.responses.push({
                questionId: q.id,
                type: q.type,
                correctAnswer: q.correct,
                userAnswer: ans,
                isCorrect: ans === q.correct
            });

            if (state.currentIndex < state.questions.length - 1) {
                state.currentIndex++;
                render();
            } else {
                finishTest();
            }
        }

        function finishTest() {
            const totalScore = state.responses.filter(r => r.isCorrect).length;
            const sub = {
                name: state.participantName,
                cohort: state.cohort,
                score: totalScore,
                responses: state.responses,
                timestamp: new Date().toISOString()
            };
            submissions.push(sub);
            localStorage.setItem('fraction_study_submissions', JSON.stringify(submissions));
            state.view = 'complete';
            render();
        }

        function showAdminLogin() {
            state.view = 'admin_login';
            state.adminError = false;
            render();
        }

        function verifyAdmin() {
            const pass = document.getElementById('adminPassInput').value;
            if (pass === '0000') {
                state.view = 'admin_dashboard';
                render();
            } else {
                state.adminError = true;
                render();
            }
        }

        function resetApp() {
            clearInterval(state.timerInterval);
            state.view = 'welcome';
            state.participantName = '';
            render();
        }

        function renderVisual(q) {
            if (q.type === 'number') {
                return `
                    <div class="flex items-center justify-center gap-6 text-3xl sm:text-4xl font-bold font-mono text-slate-800">
                        <div class="bg-slate-50 px-6 py-4 rounded-xl border border-slate-200 shadow-sm">${q.n1}/${q.d1}</div>
                        <div class="w-16 h-16 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-2xl">?</div>
                        <div class="bg-slate-50 px-6 py-4 rounded-xl border border-slate-200 shadow-sm">${q.n2}/${q.d2}</div>
                    </div>
                `;
            } else if (q.type === 'pie') {
                return `
                    <div class="flex items-center justify-center gap-8">
                        <div class="flex flex-col items-center">
                            ${createPieSvg(q.n1, q.d1)}
                            <span class="mt-2 text-sm font-semibold text-slate-600">${q.n1}/${q.d1}</span>
                        </div>
                        <div class="w-12 h-12 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-xl font-bold">?</div>
                        <div class="flex flex-col items-center">
                            ${createPieSvg(q.n2, q.d2)}
                            <span class="mt-2 text-sm font-semibold text-slate-600">${q.n2}/${q.d2}</span>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
                        <div class="w-full flex items-center justify-between">
                            <span class="text-sm font-semibold text-slate-600">${q.n1}/${q.d1}</span>
                            ${createBarSvg(q.n1, q.d1)}
                        </div>
                        <div class="text-slate-400 font-bold">vs</div>
                        <div class="w-full flex items-center justify-between">
                            <span class="text-sm font-semibold text-slate-600">${q.n2}/${q.d2}</span>
                            ${createBarSvg(q.n2, q.d2)}
                        </div>
                    </div>
                `;
            }
        }

        function createPieSvg(num, den) {
            const size = 100;
            const center = size / 2;
            const r = 40;
            let paths = '';
            const angleStep = 360 / den;

            for (let i = 0; i < den; i++) {
                const startAngle = i * angleStep - 90;
                const endAngle = (i + 1) * angleStep - 90;
                const x1 = center + r * Math.cos(Math.PI * startAngle / 180);
                const y1 = center + r * Math.sin(Math.PI * startAngle / 180);
                const x2 = center + r * Math.cos(Math.PI * endAngle / 180);
                const y2 = center + r * Math.sin(Math.PI * endAngle / 180);
                const largeArc = angleStep > 180 ? 1 : 0;
                const pathData = `M ${center} ${center} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                const isShaded = i < num;
                const fill = isShaded ? '#cbd5e1' : '#ffffff';
                paths += `<path d="${pathData}" fill="${fill}" stroke="#334155" stroke-width="1.5" />`;
            }
            return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
        }

        function createBarSvg(num, den) {
            const width = 200;
            const height = 24;
            const segWidth = width / den;
            let rects = '';

            for (let i = 0; i < den; i++) {
                const isShaded = i < num;
                const fill = isShaded ? '#cbd5e1' : '#ffffff';
                rects += `<rect x="${i * segWidth}" y="0" width="${segWidth}" height="${height}" fill="${fill}" stroke="#334155" stroke-width="1.5" />`;
            }
            return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
        }

        function calculateANOVAStats() {
            // Group participants by cohort
            const groups = { A: [], B: [], C: [] };
            submissions.forEach(s => {
                if (groups[s.cohort]) groups.push(s.score);
            });

            // Calculate mean and SD per group
            const groupStats = {};
            let allScores = [];
            let k = 3;
            let N = submissions.length;

            ['A', 'B', 'C'].forEach(c => {
                const scores = submissions.filter(s => s.cohort === c).map(s => s.score);
                allScores = allScores.concat(scores);
                const n = scores.length;
                const mean = n > 0 ? scores.reduce((a, b) => a + b, 0) / n : 0;
                const variance = n > 1 ? scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1) : 0;
                groupStats[c] = { n, mean, sd: Math.sqrt(variance), scores };
            });

            const grandMean = N > 0 ? allScores.reduce((a, b) => a + b, 0) / N : 0;

            let SSB = 0;
            let SSW = 0;

            ['A', 'B', 'C'].forEach(c => {
                const g = groupStats[c];
                SSB += g.n * Math.pow(g.mean - grandMean, 2);
                g.scores.forEach(score => {
                    SSW += Math.pow(score - g.mean, 2);
                });
            });

            const dfB = k - 1;
            const dfW = N - k;
            const MSB = dfB > 0 ? SSB / dfB : 0;
            const MSW = dfW > 0 ? SSW / dfW : 0;
            const F = MSW > 0 ? MSB / MSW : 0;

            return {
                SSB,
                SSW,
                F,
                pValue: N > 3 ? (F > 3.88 ? 'p < 0.05 (*)' : 'p > 0.05 (NS)') : 'Insufficient Data',
                groups: groupStats
            };
        }

        function exportCSV() {
            if (submissions.length === 0) {
                alert('No submissions available to export.');
                return;
            }
            let csv = 'ParticipantName,Cohort,TotalScore,Timestamp\n';
            submissions.forEach(s => {
                csv += `"${s.name}","${s.cohort}",${s.score},"${s.timestamp}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', 'fraction_research_data.csv');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        window.onload = initApp;
    </script>
</body>
</html>
