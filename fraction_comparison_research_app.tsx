import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  onSnapshot, 
  writeBatch
} from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Clock, CheckCircle, AlertCircle, Shield, Download, 
  User, Lock, Award, BarChart2, FileSpreadsheet, 
  ArrowRight, Trash2, Layers, Check, X
} from 'lucide-react';

// ==========================================
// 1. FIREBASE INITIALIZATION & CONFIG
// ==========================================
let app, auth, db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fraction-research-30q';

try {
  const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {
        apiKey: "demo-api-key",
        authDomain: "demo-app.firebaseapp.com",
        projectId: "demo-app",
        storageBucket: "demo-app.appspot.com",
        messagingSenderId: "123456789",
        appId: "1:123456789:web:demo"
      };
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase initialization skipped or fallback active:", e);
}

// ==========================================
// 2. RESEARCH QUESTIONS & MATHEMATICAL KEY
// ==========================================
const BASE_QUESTIONS = [
  { id: 1, num1: 5, den1: 7, num2: 11, den2: 15 },
  { id: 2, num1: 7, den1: 9, num2: 13, den2: 17 },
  { id: 3, num1: 8, den1: 11, num2: 11, den2: 15 },
  { id: 4, num1: 9, den1: 13, num2: 7, den2: 10 },
  { id: 5, num1: 11, den1: 16, num2: 13, den2: 19 },
  { id: 6, num1: 7, den1: 12, num2: 9, den2: 16 },
  { id: 7, num1: 13, den1: 18, num2: 8, den2: 11 },
  { id: 8, num1: 10, den1: 13, num2: 16, den2: 21 },
  { id: 9, num1: 11, den1: 14, num2: 14, den2: 18 },
  { id: 10, num1: 13, den1: 17, num2: 9, den2: 12 }
];

// Helper to determine exact fraction comparison symbol
function getCorrectSymbol(num1, den1, num2, den2) {
  const v1 = num1 * den2;
  const v2 = num2 * den1;
  if (v1 < v2) return '<';
  if (v1 > v2) return '>';
  return '=';
}

// Build 30 total questions: 10 Numbers, 10 Circles, 10 Bars
const ALL_TEST_QUESTIONS = [
  // Section 1: Numbers Only (1-10)
  ...BASE_QUESTIONS.map((q, idx) => ({
    globalIndex: idx,
    section: 'Numbers Only',
    sectionKey: 'NUMBERS',
    questionNum: idx + 1,
    ...q,
    correct: getCorrectSymbol(q.num1, q.den1, q.num2, q.den2)
  })),
  // Section 2: Circle Pie Charts (11-20)
  ...BASE_QUESTIONS.map((q, idx) => ({
    globalIndex: idx + 10,
    section: 'Circle Pie Charts',
    sectionKey: 'CIRCLES',
    questionNum: idx + 1,
    ...q,
    correct: getCorrectSymbol(q.num1, q.den1, q.num2, q.den2)
  })),
  // Section 3: Rectangular Bar Models (21-30)
  ...BASE_QUESTIONS.map((q, idx) => ({
    globalIndex: idx + 20,
    section: 'Rectangular Bar Models',
    sectionKey: 'BARS',
    questionNum: idx + 1,
    ...q,
    correct: getCorrectSymbol(q.num1, q.den1, q.num2, q.den2)
  }))
];

const QUESTION_TIMEOUT_MS = 20000; // Strict 20 seconds per question
const ADMIN_PASSCODE = "1234000";

// Helper: Calculate sector path for circle pie chart
function getPieSectorPath(cx, cy, r, startAngle, endAngle) {
  const rad1 = (startAngle - 90) * (Math.PI / 180);
  const rad2 = (endAngle - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(rad1);
  const y1 = cy + r * Math.sin(rad1);
  const x2 = cx + r * Math.cos(rad2);
  const y2 = cy + r * Math.sin(rad2);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

// ==========================================
// 3. MAIN APP COMPONENT
// ==========================================
export default function App() {
  // User & Auth State
  const [user, setUser] = useState(null);
  const [view, setView] = useState('welcome'); // 'welcome', 'test', 'completion', 'admin'
  const [studentName, setStudentName] = useState('');
  const [participantId, setParticipantId] = useState(null);

  // Test Execution State
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [timeRemainingMs, setTimeRemainingMs] = useState(QUESTION_TIMEOUT_MS);
  const [testResponses, setTestResponses] = useState([]);
  const [testStartTimestamp, setTestStartTimestamp] = useState(null);

  // Admin & Analytics State
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [allParticipants, setAllParticipants] = useState([]);
  const [allItemsData, setAllItemsData] = useState([]);
  const [adminFilterSection, setAdminFilterSection] = useState('ALL');
  const [toastMessage, setToastMessage] = useState(null);

  const timerRef = useRef(null);

  const showToast = (msg, isError = false) => {
    setToastMessage({ text: msg, error: isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ------------------------------------------
  // AUTHENTICATION
  // ------------------------------------------
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init failed:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (usr) => setUser(usr));
    return () => unsubscribe();
  }, []);

  // ------------------------------------------
  // FIRESTORE LIVE DATA SYNC (ADMIN)
  // ------------------------------------------
  useEffect(() => {
    if (!user || !db || view !== 'admin') return;

    const participantsRef = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
    const unsubP = onSnapshot(participantsRef, (snapshot) => {
      setAllParticipants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    const responsesRef = collection(db, 'artifacts', appId, 'public', 'data', 'responses');
    const unsubR = onSnapshot(responsesRef, (snapshot) => {
      setAllItemsData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    return () => {
      unsubP();
      unsubR();
    };
  }, [user, view]);

  // ------------------------------------------
  // START TEST
  // ------------------------------------------
  const startStudentTest = async () => {
    if (!studentName.trim()) {
      showToast("Please enter your name before starting.", true);
      return;
    }

    const cleanName = studentName.trim();
    const pId = 'P-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    setParticipantId(pId);
    setTestStartTimestamp(Date.now());
    setTestResponses([]);
    setCurrentQIndex(0);

    if (db && user) {
      try {
        const pDoc = doc(db, 'artifacts', appId, 'public', 'data', 'participants', pId);
        await setDoc(pDoc, {
          participantId: pId,
          studentName: cleanName,
          startedAt: new Date().toISOString(),
          status: 'IN_PROGRESS',
          totalScore: 0,
          numbersScore: 0,
          circlesScore: 0,
          barsScore: 0,
          unansweredCount: 0
        });
      } catch (e) {
        console.error("Failed to save participant start:", e);
      }
    }

    setView('test');
    startQuestionTimer();
  };

  // ------------------------------------------
  // 20-SECOND TIMER
  // ------------------------------------------
  const startQuestionTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    const now = Date.now();
    setQuestionStartTime(now);
    setTimeRemainingMs(QUESTION_TIMEOUT_MS);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - now;
      const remaining = Math.max(0, QUESTION_TIMEOUT_MS - elapsed);
      setTimeRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        handleAnswerSubmit(null, true);
      }
    }, 50);
  };

  useEffect(() => {
    if (view === 'test') {
      startQuestionTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQIndex, view]);

  // ------------------------------------------
  // ANSWER SUBMISSION
  // ------------------------------------------
  const handleAnswerSubmit = async (selectedChoice, timedOut = false) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const q = ALL_TEST_QUESTIONS[currentQIndex];
    const now = Date.now();
    const responseTimeMs = questionStartTime ? Math.min(QUESTION_TIMEOUT_MS, now - questionStartTime) : QUESTION_TIMEOUT_MS;
    const isCorrect = !timedOut && selectedChoice === q.correct;

    const responseObj = {
      participantId,
      studentName,
      sectionKey: q.sectionKey,
      sectionName: q.section,
      questionNumber: q.questionNum,
      globalIndex: q.globalIndex + 1,
      fraction1: `${q.num1}/${q.den1}`,
      fraction2: `${q.num2}/${q.den2}`,
      selectedAnswer: timedOut ? 'UNANSWERED' : selectedChoice,
      correctAnswer: q.correct,
      isCorrect,
      responseTimeMs,
      timedOut,
      timestamp: new Date().toISOString()
    };

    const updatedResponses = [...testResponses, responseObj];
    setTestResponses(updatedResponses);

    if (db && user) {
      try {
        const respDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'responses', `${participantId}_Q${q.globalIndex + 1}`);
        await setDoc(respDocRef, responseObj);
      } catch (e) {
        console.error("Failed to persist response:", e);
      }
    }

    if (currentQIndex + 1 >= ALL_TEST_QUESTIONS.length) {
      completeTest(updatedResponses);
    } else {
      setCurrentQIndex(prev => prev + 1);
    }
  };

  const completeTest = async (finalResponses) => {
    const totalDurationMs = Date.now() - testStartTimestamp;
    const correctCount = finalResponses.filter(r => r.isCorrect).length;
    const unansweredCount = finalResponses.filter(r => r.timedOut).length;

    const numbersResponses = finalResponses.filter(r => r.sectionKey === 'NUMBERS');
    const circlesResponses = finalResponses.filter(r => r.sectionKey === 'CIRCLES');
    const barsResponses = finalResponses.filter(r => r.sectionKey === 'BARS');

    const numbersScore = numbersResponses.filter(r => r.isCorrect).length;
    const circlesScore = circlesResponses.filter(r => r.isCorrect).length;
    const barsScore = barsResponses.filter(r => r.isCorrect).length;

    if (db && user && participantId) {
      try {
        const pDoc = doc(db, 'artifacts', appId, 'public', 'data', 'participants', participantId);
        await setDoc(pDoc, {
          participantId,
          studentName,
          startedAt: new Date(testStartTimestamp).toISOString(),
          completedAt: new Date().toISOString(),
          status: 'COMPLETED',
          totalScore: correctCount,
          numbersScore,
          circlesScore,
          barsScore,
          incorrectCount: 30 - correctCount - unansweredCount,
          unansweredCount,
          totalDurationMs,
          avgResponseTimeMs: Math.round(finalResponses.reduce((acc, r) => acc + r.responseTimeMs, 0) / ALL_TEST_QUESTIONS.length)
        }, { merge: true });
      } catch (e) {
        console.error("Failed to finalize participant record:", e);
      }
    }

    setView('completion');
  };

  // ------------------------------------------
  // ADMIN LOGIN & EXPORTS
  // ------------------------------------------
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPasscode === ADMIN_PASSCODE) {
      setAdminAuthenticated(true);
      showToast("Access Granted. Welcome Researcher!");
    } else {
      showToast("Invalid passcode (1234000). Access Denied.", true);
    }
  };

  const handleResetDatabase = async () => {
    if (!window.confirm("WARNING: Are you sure you want to delete ALL test results and participant records?")) return;
    if (!db || !user) return;

    try {
      const pDocs = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'participants'));
      const batch1 = writeBatch(db);
      pDocs.forEach(d => batch1.delete(d.ref));
      await batch1.commit();

      const rDocs = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'responses'));
      const batch2 = writeBatch(db);
      rDocs.forEach(d => batch2.delete(d.ref));
      await batch2.commit();

      showToast("Database successfully reset.");
    } catch (err) {
      console.error(err);
      showToast("Failed to reset database.", true);
    }
  };

  const exportParticipantCSV = () => {
    if (allParticipants.length === 0) {
      showToast("No participant data available.", true);
      return;
    }

    const headers = ["Participant_ID", "Student_Name", "Total_Score_30", "Numbers_Score_10", "Circles_Score_10", "Bars_Score_10", "Unanswered", "Duration_Sec", "Completed_At"];
    const rows = allParticipants.map(p => [
      p.participantId,
      `"${(p.studentName || '').replace(/"/g, '""')}"`,
      p.totalScore ?? 0,
      p.numbersScore ?? 0,
      p.circlesScore ?? 0,
      p.barsScore ?? 0,
      p.unansweredCount ?? 0,
      p.totalDurationMs ? (p.totalDurationMs / 1000).toFixed(2) : 0,
      p.completedAt || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Fraction_Research_Participants_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportResponsesCSV = () => {
    if (allItemsData.length === 0) {
      showToast("No item response data available.", true);
      return;
    }

    const headers = ["Participant_ID", "Student_Name", "Section", "Question_Num", "Fraction_1", "Fraction_2", "Selected_Answer", "Correct_Answer", "Is_Correct", "Response_Time_MS", "Timed_Out"];
    const rows = allItemsData.map(r => [
      r.participantId,
      `"${(r.studentName || '').replace(/"/g, '""')}"`,
      r.sectionName,
      r.questionNumber,
      r.fraction1,
      r.fraction2,
      r.selectedAnswer,
      r.correctAnswer,
      r.isCorrect ? 1 : 0,
      r.responseTimeMs,
      r.timedOut ? 1 : 0
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Fraction_Research_Item_Responses_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Statistical aggregates across sections
  const completedList = allParticipants.filter(p => p.status === 'COMPLETED');
  const calcSectionStats = (key) => {
    if (completedList.length === 0) return { mean: 0, sd: 0, avgTime: 0 };
    const scores = completedList.map(p => key === 'NUMBERS' ? (p.numbersScore || 0) : key === 'CIRCLES' ? (p.circlesScore || 0) : (p.barsScore || 0));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / scores.length;
    const sd = Math.sqrt(variance);
    return { mean: mean.toFixed(2), sd: sd.toFixed(2) };
  };

  const statsNumbers = calcSectionStats('NUMBERS');
  const statsCircles = calcSectionStats('CIRCLES');
  const statsBars = calcSectionStats('BARS');

  const chartData = [
    { name: '1. Numbers Only', mean: parseFloat(statsNumbers.mean), color: '#3b82f6' },
    { name: '2. Circle Pie Charts', mean: parseFloat(statsCircles.mean), color: '#8b5cf6' },
    { name: '3. Bar Models', mean: parseFloat(statsBars.mean), color: '#10b981' }
  ];

  // ==========================================
  // RENDER: WELCOME PAGE
  // ==========================================
  if (view === 'welcome') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between font-sans antialiased">
        {toastMessage && (
          <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-3 ${toastMessage.error ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {toastMessage.error ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            {toastMessage.text}
          </div>
        )}

        <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex justify-between items-center max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 border border-indigo-500/30 rounded-lg text-indigo-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">University Statistics Research</h2>
              <p className="text-xs text-slate-400">Comprehensive Visual Representation Study (30 Questions)</p>
            </div>
          </div>
          <button 
            onClick={() => setView('admin')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            <Shield className="w-4 h-4 text-amber-400" />
            Researcher Dashboard
          </button>
        </header>

        <main className="max-w-3xl mx-auto w-full px-6 py-12 flex-grow flex flex-col justify-center">
          <div className="bg-slate-800/60 border border-slate-700 backdrop-blur-xl rounded-2xl p-8 shadow-2xl space-y-8">
            <div className="space-y-3">
              <span className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-full">
                Full 3-Section Study Protocol
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                The Effect of Different Visual Representations on Students' Test Scores for Fraction Comparison
              </h1>
              <p className="text-slate-300 text-sm leading-relaxed">
                In this study, you will complete <strong>all 3 test sections sequentially (30 questions total)</strong> comparing fraction values using Numbers Only, Circle Pie Charts, and Rectangular Bar Models.
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" /> Assessment Structure & Rules
              </h3>
              <ul className="text-xs text-slate-300 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span><strong>Section 1 (Questions 1–10):</strong> Numbers Only</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span><strong>Section 2 (Questions 11–20):</strong> Circle Pie Chart Representations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span><strong>Section 3 (Questions 21–30):</strong> Rectangular Bar Model Representations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span><strong>20 Seconds per Question:</strong> Strict timestamp timer. Automatically advances on selection or timeout.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Student Full Name / ID
              </label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && startStudentTest()}
                />
              </div>

              <button
                onClick={startStudentTest}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 text-base transition group"
              >
                <span>Start Complete Assessment (30 Questions)</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
          Academic Research Protocol • Multi-Representation Comparative Study
        </footer>
      </div>
    );
  }

  // ==========================================
  // RENDER: TEST ASSESSMENT SCREEN
  // ==========================================
  if (view === 'test') {
    const q = ALL_TEST_QUESTIONS[currentQIndex];
    const progressPercent = ((currentQIndex + 1) / ALL_TEST_QUESTIONS.length) * 100;
    const timerSeconds = (timeRemainingMs / 1000).toFixed(1);

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans antialiased">
        <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-slate-800 border border-slate-700 rounded-lg">
                <User className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{studentName}</h3>
                <p className="text-xs text-indigo-400 font-medium">
                  {q.section} • Question {q.questionNum} of 10 (Overall: {currentQIndex + 1}/30)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl">
                <Clock className={`w-5 h-5 ${timeRemainingMs < 5000 ? 'text-red-400 animate-pulse' : 'text-indigo-400'}`} />
                <span className={`text-lg font-mono font-bold ${timeRemainingMs < 5000 ? 'text-red-400' : 'text-white'}`}>
                  {timerSeconds}s
                </span>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto mt-4 bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </header>

        <main className="max-w-4xl mx-auto w-full px-6 py-8 flex-grow flex flex-col justify-center items-center">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-8">
            <div className="w-full py-8 px-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center min-h-[220px]">
              
              {/* SECTION 1: NUMBERS ONLY */}
              {q.sectionKey === 'NUMBERS' && (
                <div className="flex items-center justify-center gap-12 sm:gap-20">
                  <div className="flex flex-col items-center text-white font-serif">
                    <span className="text-4xl sm:text-5xl font-bold pb-2 border-b-4 border-slate-200 px-3">{q.num1}</span>
                    <span className="text-4xl sm:text-5xl font-bold pt-2 px-3">{q.den1}</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 font-bold text-xl">?</div>
                  <div className="flex flex-col items-center text-white font-serif">
                    <span className="text-4xl sm:text-5xl font-bold pb-2 border-b-4 border-slate-200 px-3">{q.num2}</span>
                    <span className="text-4xl sm:text-5xl font-bold pt-2 px-3">{q.den2}</span>
                  </div>
                </div>
              )}

              {/* SECTION 2: CIRCLE PIE CHARTS */}
              {q.sectionKey === 'CIRCLES' && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16 w-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-sm font-semibold text-slate-400 font-mono">{q.num1}/{q.den1}</div>
                    <svg width="120" height="120" viewBox="-60 -60 120 120" className="drop-shadow-md">
                      {Array.from({ length: q.den1 }).map((_, i) => {
                        const startAngle = (360 / q.den1) * i;
                        const endAngle = (360 / q.den1) * (i + 1);
                        return (
                          <path
                            key={i}
                            d={getPieSectorPath(0, 0, 52, startAngle, endAngle)}
                            fill={i < q.num1 ? "#9ca3af" : "#ffffff"}
                            stroke="#374151"
                            strokeWidth="1.5"
                          />
                        );
                      })}
                    </svg>
                  </div>

                  <div className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 font-bold text-lg">?</div>

                  <div className="flex flex-col items-center gap-3">
                    <div className="text-sm font-semibold text-slate-400 font-mono">{q.num2}/{q.den2}</div>
                    <svg width="120" height="120" viewBox="-60 -60 120 120" className="drop-shadow-md">
                      {Array.from({ length: q.den2 }).map((_, i) => {
                        const startAngle = (360 / q.den2) * i;
                        const endAngle = (360 / q.den2) * (i + 1);
                        return (
                          <path
                            key={i}
                            d={getPieSectorPath(0, 0, 52, startAngle, endAngle)}
                            fill={i < q.num2 ? "#9ca3af" : "#ffffff"}
                            stroke="#374151"
                            strokeWidth="1.5"
                          />
                        );
                      })}
                    </svg>
                  </div>
                </div>
              )}

              {/* SECTION 3: RECTANGULAR BAR MODELS */}
              {q.sectionKey === 'BARS' && (
                <div className="flex flex-col items-center justify-center gap-6 w-full max-w-xl">
                  <div className="w-full flex items-center gap-4">
                    <div className="w-16 text-right font-mono text-sm font-semibold text-slate-300">{q.num1}/{q.den1}</div>
                    <div className="flex-grow">
                      <svg width="100%" height="36" viewBox="0 0 300 36" preserveAspectRatio="none" className="rounded border border-slate-700 overflow-hidden shadow-sm">
                        {Array.from({ length: q.den1 }).map((_, i) => {
                          const segWidth = 300 / q.den1;
                          return (
                            <rect
                              key={i}
                              x={i * segWidth}
                              y="0"
                              width={segWidth}
                              height="36"
                              fill={i < q.num1 ? "#9ca3af" : "#ffffff"}
                              stroke="#374151"
                              strokeWidth="1.5"
                            />
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  <div className="w-full flex items-center gap-4">
                    <div className="w-16 text-right font-mono text-sm font-semibold text-slate-300">{q.num2}/{q.den2}</div>
                    <div className="flex-grow">
                      <svg width="100%" height="36" viewBox="0 0 300 36" preserveAspectRatio="none" className="rounded border border-slate-700 overflow-hidden shadow-sm">
                        {Array.from({ length: q.den2 }).map((_, i) => {
                          const segWidth = 300 / q.den2;
                          return (
                            <rect
                              key={i}
                              x={i * segWidth}
                              y="0"
                              width={segWidth}
                              height="36"
                              fill={i < q.num2 ? "#9ca3af" : "#ffffff"}
                              stroke="#374151"
                              strokeWidth="1.5"
                            />
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full grid grid-cols-3 gap-4 max-w-md">
              <button
                onClick={() => handleAnswerSubmit('>')}
                className="py-5 bg-slate-800 hover:bg-indigo-600 border border-slate-700 rounded-xl text-3xl font-bold text-white shadow-lg transition flex items-center justify-center"
              >
                &gt;
              </button>
              <button
                onClick={() => handleAnswerSubmit('=')}
                className="py-5 bg-slate-800 hover:bg-indigo-600 border border-slate-700 rounded-xl text-3xl font-bold text-white shadow-lg transition flex items-center justify-center"
              >
                =
              </button>
              <button
                onClick={() => handleAnswerSubmit('<')}
                className="py-5 bg-slate-800 hover:bg-indigo-600 border border-slate-700 rounded-xl text-3xl font-bold text-white shadow-lg transition flex items-center justify-center"
              >
                &lt;
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // RENDER: COMPLETION PAGE
  // ==========================================
  if (view === 'completion') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center px-6 py-12">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Assessment Completed</h2>
            <p className="text-sm text-slate-300">
              You have successfully completed all 3 sections (30 questions). Thank you for participating!
            </p>
          </div>

          <button
            onClick={() => {
              setStudentName('');
              setView('welcome');
            }}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition text-sm"
          >
            Return to Welcome Screen
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: RESEARCHER ADMIN DASHBOARD
  // ==========================================
  if (view === 'admin') {
    if (!adminAuthenticated) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-6">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <Shield className="w-6 h-6 text-amber-400" />
              <div>
                <h3 className="text-base font-bold text-white">Researcher Access</h3>
                <p className="text-xs text-slate-400">Enter passcode (1234000)</p>
              </div>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="password"
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  placeholder="Passcode: 1234000"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView('welcome')}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold"
                >
                  Authenticate
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    const filteredResponses = allItemsData.filter(r => 
      adminFilterSection === 'ALL' || r.sectionKey === adminFilterSection
    );

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 sm:p-10 space-y-8">
        {toastMessage && (
          <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-3 ${toastMessage.error ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {toastMessage.error ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            {toastMessage.text}
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Shield className="w-4 h-4" /> Passcode Authenticated (1234000)
            </div>
            <h1 className="text-2xl font-bold text-white">Researcher Comparative Analytics</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={exportParticipantCSV}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-md"
            >
              <Download className="w-4 h-4" /> Export Participant CSV
            </button>
            <button
              onClick={exportResponsesCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-md"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Item Responses CSV
            </button>
            <button
              onClick={handleResetDatabase}
              className="flex items-center gap-2 px-3 py-2 bg-red-900/40 hover:bg-red-800 text-red-300 rounded-xl text-xs font-semibold"
            >
              <Trash2 className="w-4 h-4" /> Reset DB
            </button>
            <button
              onClick={() => setView('welcome')}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-slate-400 uppercase font-semibold">Total Participants</div>
            <div className="text-3xl font-bold text-white">{allParticipants.length}</div>
            <div className="text-xs text-slate-400">Completed: {completedList.length}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-blue-400 uppercase font-semibold">1. Numbers Only Mean</div>
            <div className="text-3xl font-bold text-white">{statsNumbers.mean} <span className="text-xs text-slate-500">/ 10</span></div>
            <div className="text-xs text-slate-400">SD: {statsNumbers.sd}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-purple-400 uppercase font-semibold">2. Circle Charts Mean</div>
            <div className="text-3xl font-bold text-white">{statsCircles.mean} <span className="text-xs text-slate-500">/ 10</span></div>
            <div className="text-xs text-slate-400">SD: {statsCircles.sd}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-emerald-400 uppercase font-semibold">3. Bar Models Mean</div>
            <div className="text-3xl font-bold text-white">{statsBars.mean} <span className="text-xs text-slate-500">/ 10</span></div>
            <div className="text-xs text-slate-400">SD: {statsBars.sd}</div>
          </div>
        </div>

        {/* Comparative Chart */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-amber-400" /> Section Performance Comparison (Mean Scores out of 10)
          </h3>
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis domain={[0, 10]} stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} />
                <Bar dataKey="mean" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Participant Results Table */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Completed Student Results</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Participant ID</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Total Score (30)</th>
                  <th className="py-3 px-4">Numbers (10)</th>
                  <th className="py-3 px-4">Circles (10)</th>
                  <th className="py-3 px-4">Bars (10)</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {completedList.length === 0 ? (
                  <tr><td colSpan="8" className="py-8 text-center text-slate-500">No completed participants yet.</td></tr>
                ) : (
                  completedList.map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-400">{p.participantId}</td>
                      <td className="py-3 px-4 font-semibold text-white">{p.studentName}</td>
                      <td className="py-3 px-4 font-bold text-indigo-400">{p.totalScore} / 30</td>
                      <td className="py-3 px-4 font-semibold text-blue-400">{p.numbersScore}</td>
                      <td className="py-3 px-4 font-semibold text-purple-400">{p.circlesScore}</td>
                      <td className="py-3 px-4 font-semibold text-emerald-400">{p.barsScore}</td>
                      <td className="py-3 px-4">{(p.totalDurationMs / 1000).toFixed(1)}s</td>
                      <td className="py-3 px-4"><span className="text-emerald-400 font-medium">Completed</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Item Responses Table */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Detailed Item Responses ({filteredResponses.length})</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter Section:</span>
              <select
                value={adminFilterSection}
                onChange={(e) => setAdminFilterSection(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none"
              >
                <option value="ALL">All Sections</option>
                <option value="NUMBERS">Numbers Only</option>
                <option value="CIRCLES">Circle Pie Charts</option>
                <option value="BARS">Rectangular Bar Models</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Q#</th>
                  <th className="py-3 px-4">Fractions</th>
                  <th className="py-3 px-4">Selected</th>
                  <th className="py-3 px-4">Correct</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Response Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredResponses.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-semibold text-white">{r.studentName}</td>
                    <td className="py-2.5 px-4 text-slate-400">{r.sectionName}</td>
                    <td className="py-2.5 px-4">Q{r.questionNumber}</td>
                    <td className="py-2.5 px-4 font-mono">{r.fraction1} vs {r.fraction2}</td>
                    <td className="py-2.5 px-4 font-bold">{r.selectedAnswer}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-400">{r.correctAnswer}</td>
                    <td className="py-2.5 px-4">
                      {r.isCorrect ? <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Correct</span> : <span className="text-rose-400 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Incorrect</span>}
                    </td>
                    <td className="py-2.5 px-4">{(r.responseTimeMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
