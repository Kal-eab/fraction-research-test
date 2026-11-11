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
  runTransaction,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Clock, CheckCircle, AlertCircle, Shield, Download, RefreshCw, 
  Play, ChevronRight, User, Lock, Award, BarChart2, FileSpreadsheet, 
  Check, X, HelpCircle, Layers, ArrowRight, Eye, Trash2
} from 'lucide-react';

// ==========================================
// 1. FIREBASE INITIALIZATION & CONFIG
// ==========================================
let app, auth, db;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fraction-research-2026';

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
// 2. RESEARCH QUESTION DATA & ANSWER KEY
// ==========================================
const QUESTIONS = [
  { id: 1, num1: 5, den1: 7, num2: 11, den2: 15, correct: '<', dec1: 0.7143, dec2: 0.7333 },
  { id: 2, num1: 7, den1: 9, num2: 13, den2: 17, correct: '>', dec1: 0.7778, dec2: 0.7647 },
  { id: 3, num1: 8, den1: 11, num2: 11, den2: 15, correct: '<', dec1: 0.7273, dec2: 0.7333 },
  { id: 4, num1: 9, den1: 13, num2: 7, den2: 10, correct: '<', dec1: 0.6923, dec2: 0.7000 },
  { id: 5, num1: 11, den1: 16, num2: 13, den2: 19, correct: '>', dec1: 0.6875, dec2: 0.6842 },
  { id: 6, num1: 7, den1: 12, num2: 9, den2: 16, correct: '>', dec1: 0.5833, dec2: 0.5625 },
  { id: 7, num1: 13, den1: 18, num2: 8, den2: 11, correct: '<', dec1: 0.7222, dec2: 0.7273 },
  { id: 8, num1: 10, den1: 13, num2: 16, den2: 21, correct: '>', dec1: 0.7692, dec2: 0.7619 },
  { id: 9, num1: 11, den1: 14, num2: 14, den2: 18, correct: '>', dec1: 0.7857, dec2: 0.7778 },
  { id: 10, num1: 13, den1: 17, num2: 9, den2: 12, correct: '>', dec1: 0.7647, dec2: 0.7500 }
];

const QUESTION_TIMEOUT_MS = 20000; // Strict 20 Seconds per question
const ADMIN_PASSCODE = "research2026";

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
  const [assignedGroup, setAssignedGroup] = useState(null); // 'A', 'B', 'C'
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
  const [adminFilterGroup, setAdminFilterGroup] = useState('ALL');
  const [adminSortField, setAdminSortField] = useState('completedAt');
  const [toastMessage, setToastMessage] = useState(null);

  // Ref to hold exact timer interval
  const timerRef = useRef(null);

  // Show temporary toast notification
  const showToast = (msg, isError = false) => {
    setToastMessage({ text: msg, error: isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ------------------------------------------
  // AUTHENTICATION EFFECT
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
        console.error("Auth initialization failed:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
    });
    return () => unsubscribe();
  }, []);

  // ------------------------------------------
  // FIRESTORE LIVE DATA SUBSCRIBER (FOR ADMIN)
  // ------------------------------------------
  useEffect(() => {
    if (!user || !db || view !== 'admin') return;

    // Fetch Public Participants
    const participantsRef = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
    const unsubParticipants = onSnapshot(participantsRef, (snapshot) => {
      const pList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllParticipants(pList);
    }, (err) => console.error("Error fetching participants:", err));

    // Fetch Public Responses
    const responsesRef = collection(db, 'artifacts', appId, 'public', 'data', 'responses');
    const unsubResponses = onSnapshot(responsesRef, (snapshot) => {
      const rList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllItemsData(rList);
    }, (err) => console.error("Error fetching responses:", err));

    return () => {
      unsubParticipants();
      unsubResponses();
    };
  }, [user, view]);

  // ------------------------------------------
  // GROUP ASSIGNMENT LOGIC (BALANCED CAPPING)
  // ------------------------------------------
  const startStudentTest = async () => {
    if (!studentName.trim()) {
      showToast("Please enter your name before starting.", true);
      return;
    }

    const cleanName = studentName.trim();
    const pId = 'P-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    let assigned = 'A'; // Default fallback

    if (db && user) {
      try {
        // Balanced Assignment Transaction
        const counterRef = doc(db, 'artifacts', appId, 'public', 'data', 'meta', 'groupCounters');
        
        assigned = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let countA = 0, countB = 0, countC = 0;
          if (counterDoc.exists()) {
            const data = counterDoc.data();
            countA = data.countA || 0;
            countB = data.countB || 0;
            countC = data.countC || 0;
          }

          // Balance across A, B, C with cap of 10 each
          let choice = 'A';
          if (countA <= countB && countA <= countC && countA < 10) {
            choice = 'A';
            countA++;
          } else if (countB <= countC && countB < 10) {
            choice = 'B';
            countB++;
          } else if (countC < 10) {
            choice = 'C';
            countC++;
          } else {
            // If all full, find group with smallest count
            if (countA <= countB && countA <= countC) { choice = 'A'; countA++; }
            else if (countB <= countC) { choice = 'B'; countB++; }
            else { choice = 'C'; countC++; }
          }

          transaction.set(counterRef, { countA, countB, countC }, { merge: true });
          return choice;
        });
      } catch (err) {
        console.warn("Transaction failed, using local random group fallback:", err);
        const groups = ['A', 'B', 'C'];
        assigned = groups[Math.floor(Math.random() * 3)];
      }
    } else {
      const groups = ['A', 'B', 'C'];
      assigned = groups[Math.floor(Math.random() * 3)];
    }

    setAssignedGroup(assigned);
    setParticipantId(pId);
    setTestStartTimestamp(Date.now());
    setTestResponses([]);
    setCurrentQIndex(0);

    // Record initial participant state in Firestore
    if (db && user) {
      try {
        const pDoc = doc(db, 'artifacts', appId, 'public', 'data', 'participants', pId);
        await setDoc(pDoc, {
          participantId: pId,
          studentName: cleanName,
          assignedGroup: assigned,
          startedAt: new Date().toISOString(),
          status: 'IN_PROGRESS',
          totalScore: 0,
          correctCount: 0,
          incorrectCount: 0,
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
  // TIMER LOGIC (20 SECONDS STAMP-BASED)
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
        handleAnswerSubmit(null, true); // Automatic timeout
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
  // ANSWER SUBMISSION & FIRESTORE SAVE
  // ------------------------------------------
  const handleAnswerSubmit = async (selectedChoice, timedOut = false) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const q = QUESTIONS[currentQIndex];
    const now = Date.now();
    const responseTimeMs = questionStartTime ? Math.min(QUESTION_TIMEOUT_MS, now - questionStartTime) : QUESTION_TIMEOUT_MS;
    const isCorrect = !timedOut && selectedChoice === q.correct;

    const responseObj = {
      participantId,
      studentName,
      assignedGroup,
      questionNumber: q.id,
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

    // Save individual response to Firestore immediately
    if (db && user) {
      try {
        const respDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'responses', `${participantId}_Q${q.id}`);
        await setDoc(respDocRef, responseObj);
      } catch (e) {
        console.error("Failed to persist response immediately:", e);
      }
    }

    // Check if test is complete
    if (currentQIndex + 1 >= QUESTIONS.length) {
      completeTest(updatedResponses);
    } else {
      setCurrentQIndex(prev => prev + 1);
    }
  };

  const completeTest = async (finalResponses) => {
    const totalDurationMs = Date.now() - testStartTimestamp;
    const correctCount = finalResponses.filter(r => r.isCorrect).length;
    const unansweredCount = finalResponses.filter(r => r.timedOut).length;
    const incorrectCount = QUESTIONS.length - correctCount - unansweredCount;

    // Finalize participant doc in Firestore
    if (db && user && participantId) {
      try {
        const pDoc = doc(db, 'artifacts', appId, 'public', 'data', 'participants', participantId);
        await setDoc(pDoc, {
          participantId,
          studentName,
          assignedGroup,
          startedAt: new Date(testStartTimestamp).toISOString(),
          completedAt: new Date().toISOString(),
          status: 'COMPLETED',
          totalScore: correctCount,
          correctCount,
          incorrectCount,
          unansweredCount,
          totalDurationMs,
          avgResponseTimeMs: Math.round(finalResponses.reduce((acc, r) => acc + r.responseTimeMs, 0) / QUESTIONS.length)
        }, { merge: true });
      } catch (e) {
        console.error("Failed to finalize participant record:", e);
      }
    }

    setView('completion');
  };

  // ------------------------------------------
  // ADMIN AUTHENTICATION & EXPORTS
  // ------------------------------------------
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPasscode === ADMIN_PASSCODE) {
      setAdminAuthenticated(true);
      showToast("Access Granted. Welcome Researcher!");
    } else {
      showToast("Invalid passcode. Access Denied.", true);
    }
  };

  const handleResetDatabase = async () => {
    if (!window.confirm("WARNING: Are you sure you want to delete ALL test results and reset group counters? This action cannot be undone.")) {
      return;
    }

    if (!db || !user) {
      showToast("Database connection unavailable.", true);
      return;
    }

    try {
      // Clear Participants
      const pDocs = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'participants'));
      const batch1 = writeBatch(db);
      pDocs.forEach(d => batch1.delete(d.ref));
      await batch1.commit();

      // Clear Responses
      const rDocs = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'responses'));
      const batch2 = writeBatch(db);
      rDocs.forEach(d => batch2.delete(d.ref));
      await batch2.commit();

      // Reset Group Counters
      const counterRef = doc(db, 'artifacts', appId, 'public', 'data', 'meta', 'groupCounters');
      await setDoc(counterRef, { countA: 0, countB: 0, countC: 0 });

      showToast("Database successfully cleared and reset.");
    } catch (err) {
      console.error("Error resetting database:", err);
      showToast("Failed to reset database.", true);
    }
  };

  // Export Participant CSV
  const exportParticipantCSV = () => {
    if (allParticipants.length === 0) {
      showToast("No participant data available to export.", true);
      return;
    }

    const headers = ["Participant_ID", "Student_Name", "Assigned_Group", "Status", "Total_Score", "Correct", "Incorrect", "Unanswered", "Duration_Sec", "Avg_Response_Time_MS", "Started_At", "Completed_At"];
    const rows = allParticipants.map(p => [
      p.participantId,
      `"${(p.studentName || '').replace(/"/g, '""')}"`,
      p.assignedGroup,
      p.status,
      p.totalScore ?? 0,
      p.correctCount ?? 0,
      p.incorrectCount ?? 0,
      p.unansweredCount ?? 0,
      p.totalDurationMs ? (p.totalDurationMs / 1000).toFixed(2) : 0,
      p.avgResponseTimeMs ?? 0,
      p.startedAt || '',
      p.completedAt || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Fraction_Research_Participants_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Detailed Question CSV
  const exportDetailedResponsesCSV = () => {
    if (allItemsData.length === 0) {
      showToast("No detailed item response data available to export.", true);
      return;
    }

    const headers = ["Participant_ID", "Student_Name", "Assigned_Group", "Question_Num", "Fraction_1", "Fraction_2", "Selected_Answer", "Correct_Answer", "Is_Correct", "Response_Time_MS", "Timed_Out", "Timestamp"];
    const rows = allItemsData.map(r => [
      r.participantId,
      `"${(r.studentName || '').replace(/"/g, '""')}"`,
      r.assignedGroup,
      r.questionNumber,
      r.fraction1,
      r.fraction2,
      r.selectedAnswer,
      r.correctAnswer,
      r.isCorrect ? 1 : 0,
      r.responseTimeMs,
      r.timedOut ? 1 : 0,
      r.timestamp || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Fraction_Research_Item_Responses_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ------------------------------------------
  // STATISTICAL CALCULATIONS FOR ADMIN
  // ------------------------------------------
  const getGroupStats = (grp) => {
    const list = allParticipants.filter(p => p.status === 'COMPLETED' && (grp === 'ALL' || p.assignedGroup === grp));
    if (list.length === 0) {
      return { count: 0, meanScore: 0, sdScore: 0, minScore: 0, maxScore: 0, avgTimeMs: 0, totalUnanswered: 0 };
    }

    const scores = list.map(p => p.totalScore || 0);
    const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((acc, s) => acc + Math.pow(s - meanScore, 2), 0) / (scores.length || 1);
    const sdScore = Math.sqrt(variance);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const avgTimeMs = list.reduce((a, b) => a + (b.avgResponseTimeMs || 0), 0) / list.length;
    const totalUnanswered = list.reduce((a, b) => a + (b.unansweredCount || 0), 0);

    return {
      count: list.length,
      meanScore: meanScore.toFixed(2),
      sdScore: sdScore.toFixed(2),
      minScore,
      maxScore,
      avgTimeMs: Math.round(avgTimeMs),
      totalUnanswered
    };
  };

  const chartData = [
    { name: 'Group A (Numbers)', mean: parseFloat(getGroupStats('A').meanScore), color: '#3b82f6' },
    { name: 'Group B (Circles)', mean: parseFloat(getGroupStats('B').meanScore), color: '#8b5cf6' },
    { name: 'Group C (Bars)', mean: parseFloat(getGroupStats('C').meanScore), color: '#10b981' }
  ];

  // ==========================================
  // RENDER: WELCOME SCREEN
  // ==========================================
  if (view === 'welcome') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between font-sans antialiased">
        {/* Toast Overlay */}
        {toastMessage && (
          <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-3 transition-all transform translate-y-0 ${toastMessage.error ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {toastMessage.error ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            {toastMessage.text}
          </div>
        )}

        {/* Header Navigation */}
        <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur-md px-6 py-4 flex justify-between items-center max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 border border-indigo-500/30 rounded-lg text-indigo-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-indigo-400 tracking-wider uppercase">University Statistics Research</h2>
              <p className="text-xs text-slate-400">Cognitive Representation Study</p>
            </div>
          </div>
          <button 
            onClick={() => setView('admin')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            <Shield className="w-4 h-4 text-amber-400" />
            Researcher Dashboard
          </button>
        </header>

        {/* Hero & Form */}
        <main className="max-w-3xl mx-auto w-full px-6 py-12 flex-grow flex flex-col justify-center">
          <div className="bg-slate-800/60 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl space-y-8">
            <div className="space-y-3 text-center sm:text-left">
              <span className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-full">
                Research Test Instrument
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                The Effect of Different Visual Representations on Students' Test Scores for Fraction Comparison
              </h1>
              <p className="text-slate-300 text-sm leading-relaxed">
                This academic test measures your speed and accuracy in comparing mathematical fraction values.
              </p>
            </div>

            {/* Test Rules Box */}
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Assessment Instructions & Rules
              </h3>
              <ul className="text-xs text-slate-300 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span>You will complete exactly <strong>10 fraction comparison questions</strong>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span><strong>20-Second Strict Timer:</strong> You have 20 seconds to answer each question before it automatically advances.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span>Select between <strong>&gt;</strong> (Greater Than), <strong>&lt;</strong> (Less Than), or <strong>=</strong> (Equal To).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">•</span>
                  <span>Answer choices cannot be altered once clicked, and you cannot return to previous questions.</span>
                </li>
              </ul>
            </div>

            {/* Student Entry Input */}
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Student Full Name / Identification
              </label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition"
                  onKeyDown={(e) => e.key === 'Enter' && startStudentTest()}
                />
              </div>

              <button
                onClick={startStudentTest}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 text-base transition group"
              >
                <span>Begin Research Assessment</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
          Academic Research Protocol • Strictly Confidential Data Collection
        </footer>
      </div>
    );
  }

  // ==========================================
  // RENDER: TEST ASSESSMENT SCREEN
  // ==========================================
  if (view === 'test') {
    const q = QUESTIONS[currentQIndex];
    const progressPercent = ((currentQIndex + 1) / QUESTIONS.length) * 100;
    const timerSeconds = (timeRemainingMs / 1000).toFixed(1);
    const timerProgress = (timeRemainingMs / QUESTION_TIMEOUT_MS) * 100;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans antialiased selection:bg-indigo-500 selection:text-white">
        {/* Top Header Bar */}
        <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-slate-800 border border-slate-700 rounded-lg">
                <User className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{studentName}</h3>
                <p className="text-xs text-slate-400">
                  Assigned Group: <span className="text-indigo-400 font-bold">Group {assignedGroup}</span>
                </p>
              </div>
            </div>

            {/* Timer & Progress */}
            <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
              <div className="text-center sm:text-right">
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Question Progress</div>
                <div className="text-sm font-bold text-white">{currentQIndex + 1} of {QUESTIONS.length}</div>
              </div>

              {/* Circular Clock Timer */}
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl">
                <Clock className={`w-5 h-5 ${timeRemainingMs < 5000 ? 'text-red-400 animate-pulse' : 'text-indigo-400'}`} />
                <span className={`text-lg font-mono font-bold ${timeRemainingMs < 5000 ? 'text-red-400' : 'text-white'}`}>
                  {timerSeconds}s
                </span>
              </div>
            </div>
          </div>

          {/* Overall Test Progress Bar */}
          <div className="max-w-5xl mx-auto mt-4 bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </header>

        {/* Main Question Display Box */}
        <main className="max-w-4xl mx-auto w-full px-6 py-8 flex-grow flex flex-col justify-center items-center">
          <div className="w-full bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-8">
            
            {/* Visual Model Render Area */}
            <div className="w-full py-8 px-4 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-center min-h-[220px]">
              
              {/* GROUP A: NUMBERS ONLY */}
              {assignedGroup === 'A' && (
                <div className="flex items-center justify-center gap-12 sm:gap-20">
                  {/* Fraction 1 */}
                  <div className="flex flex-col items-center text-white font-serif">
                    <span className="text-4xl sm:text-5xl font-bold pb-2 border-b-4 border-slate-200 px-3">{q.num1}</span>
                    <span className="text-4xl sm:text-5xl font-bold pt-2 px-3">{q.den1}</span>
                  </div>

                  <div className="w-12 h-12 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 font-bold text-xl">
                    ?
                  </div>

                  {/* Fraction 2 */}
                  <div className="flex flex-col items-center text-white font-serif">
                    <span className="text-4xl sm:text-5xl font-bold pb-2 border-b-4 border-slate-200 px-3">{q.num2}</span>
                    <span className="text-4xl sm:text-5xl font-bold pt-2 px-3">{q.den2}</span>
                  </div>
                </div>
              )}

              {/* GROUP B: CIRCLE PIE CHARTS */}
              {assignedGroup === 'B' && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16 w-full">
                  {/* Circle 1 */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-sm font-semibold text-slate-400 font-mono">{q.num1}/{q.den1}</div>
                    <svg width="120" height="120" viewBox="-60 -60 120 120" className="drop-shadow-md">
                      {Array.from({ length: q.den1 }).map((_, i) => {
                        const startAngle = (360 / q.den1) * i;
                        const endAngle = (360 / q.den1) * (i + 1);
                        const isShaded = i < q.num1;
                        return (
                          <path
                            key={i}
                            d={getPieSectorPath(0, 0, 52, startAngle, endAngle)}
                            fill={isShaded ? "#9ca3af" : "#ffffff"}
                            stroke="#374151"
                            strokeWidth="1.5"
                          />
                        );
                      })}
                    </svg>
                  </div>

                  <div className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 font-bold text-lg">
                    ?
                  </div>

                  {/* Circle 2 */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-sm font-semibold text-slate-400 font-mono">{q.num2}/{q.den2}</div>
                    <svg width="120" height="120" viewBox="-60 -60 120 120" className="drop-shadow-md">
                      {Array.from({ length: q.den2 }).map((_, i) => {
                        const startAngle = (360 / q.den2) * i;
                        const endAngle = (360 / q.den2) * (i + 1);
                        const isShaded = i < q.num2;
                        return (
                          <path
                            key={i}
                            d={getPieSectorPath(0, 0, 52, startAngle, endAngle)}
                            fill={isShaded ? "#9ca3af" : "#ffffff"}
                            stroke="#374151"
                            strokeWidth="1.5"
                          />
                        );
                      })}
                    </svg>
                  </div>
                </div>
              )}

              {/* GROUP C: RECTANGULAR BAR MODELS */}
              {assignedGroup === 'C' && (
                <div className="flex flex-col items-center justify-center gap-6 w-full max-w-xl">
                  {/* Bar 1 */}
                  <div className="w-full flex items-center gap-4">
                    <div className="w-16 text-right font-mono text-sm font-semibold text-slate-300">{q.num1}/{q.den1}</div>
                    <div className="flex-grow">
                      <svg width="100%" height="36" viewBox="0 0 300 36" preserveAspectRatio="none" className="rounded border border-slate-700 overflow-hidden shadow-sm">
                        {Array.from({ length: q.den1 }).map((_, i) => {
                          const segWidth = 300 / q.den1;
                          const isShaded = i < q.num1;
                          return (
                            <rect
                              key={i}
                              x={i * segWidth}
                              y="0"
                              width={segWidth}
                              height="36"
                              fill={isShaded ? "#9ca3af" : "#ffffff"}
                              stroke="#374151"
                              strokeWidth="1.5"
                            />
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  {/* Bar 2 */}
                  <div className="w-full flex items-center gap-4">
                    <div className="w-16 text-right font-mono text-sm font-semibold text-slate-300">{q.num2}/{q.den2}</div>
                    <div className="flex-grow">
                      <svg width="100%" height="36" viewBox="0 0 300 36" preserveAspectRatio="none" className="rounded border border-slate-700 overflow-hidden shadow-sm">
                        {Array.from({ length: q.den2 }).map((_, i) => {
                          const segWidth = 300 / q.den2;
                          const isShaded = i < q.num2;
                          return (
                            <rect
                              key={i}
                              x={i * segWidth}
                              y="0"
                              width={segWidth}
                              height="36"
                              fill={isShaded ? "#9ca3af" : "#ffffff"}
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

            {/* Answer Action Buttons */}
            <div className="w-full grid grid-cols-3 gap-4 max-w-md">
              <button
                onClick={() => handleAnswerSubmit('>')}
                className="py-5 bg-slate-800 hover:bg-indigo-600 active:bg-indigo-700 border border-slate-700 hover:border-indigo-500 rounded-xl text-3xl font-bold text-white shadow-lg transition flex items-center justify-center"
              >
                &gt;
              </button>
              <button
                onClick={() => handleAnswerSubmit('=')}
                className="py-5 bg-slate-800 hover:bg-indigo-600 active:bg-indigo-700 border border-slate-700 hover:border-indigo-500 rounded-xl text-3xl font-bold text-white shadow-lg transition flex items-center justify-center"
              >
                =
              </button>
              <button
                onClick={() => handleAnswerSubmit('<')}
                className="py-5 bg-slate-800 hover:bg-indigo-600 active:bg-indigo-700 border border-slate-700 hover:border-indigo-500 rounded-xl text-3xl font-bold text-white shadow-lg transition flex items-center justify-center"
              >
                &lt;
              </button>
            </div>
          </div>
        </main>

        <footer className="py-4 text-center text-xs text-slate-500">
          Individual 20-Second Countdown Active • Answer Records Automatically
        </footer>
      </div>
    );
  }

  // ==========================================
  // RENDER: COMPLETION PAGE
  // ==========================================
  if (view === 'completion') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center px-6 py-12">
        <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 backdrop-blur-xl rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Test Completed</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your test has been completed successfully. Thank you for participating in this research.
            </p>
          </div>

          <div className="p-4 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs text-slate-400 space-y-1">
            <div>Participant ID: <span className="text-slate-200 font-mono">{participantId}</span></div>
            <div>Assigned Group: <span className="text-indigo-400 font-semibold">Group {assignedGroup}</span></div>
            <div>Status: <span className="text-emerald-400 font-semibold">Data Safely Recorded</span></div>
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
                <p className="text-xs text-slate-400">Enter passcode to view data</p>
              </div>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="password"
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  placeholder="Passcode"
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

    const overallStats = getGroupStats('ALL');
    const statsA = getGroupStats('A');
    const statsB = getGroupStats('B');
    const statsC = getGroupStats('C');

    const filteredParticipants = allParticipants.filter(p => 
      adminFilterGroup === 'ALL' || p.assignedGroup === adminFilterGroup
    );

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 sm:p-10 space-y-8">
        {/* Toast Overlay */}
        {toastMessage && (
          <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-xl text-white font-medium flex items-center gap-3 transition-all ${toastMessage.error ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {toastMessage.error ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            {toastMessage.text}
          </div>
        )}

        {/* Dashboard Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Shield className="w-4 h-4" /> Confidential Administrative Console
            </div>
            <h1 className="text-2xl font-bold text-white">Research Data & Statistical Analytics</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={exportParticipantCSV}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-md"
            >
              <Download className="w-4 h-4" /> Export Participant CSV
            </button>
            <button
              onClick={exportDetailedResponsesCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-md"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Item Responses CSV
            </button>
            <button
              onClick={handleResetDatabase}
              className="flex items-center gap-2 px-3 py-2 bg-red-900/40 hover:bg-red-800/60 border border-red-700/60 text-red-300 rounded-xl text-xs font-semibold transition"
            >
              <Trash2 className="w-4 h-4" /> Reset DB
            </button>
            <button
              onClick={() => setView('welcome')}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
            >
              Exit Dashboard
            </button>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-slate-400 uppercase font-semibold">Total Participants</div>
            <div className="text-3xl font-bold text-white">{allParticipants.length} <span className="text-xs font-normal text-slate-500">/ 30 Cap</span></div>
            <div className="text-xs text-slate-400">Completed: {allParticipants.filter(p => p.status === 'COMPLETED').length}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-blue-400 uppercase font-semibold">Group A (Numbers)</div>
            <div className="text-3xl font-bold text-white">{statsA.count} <span className="text-xs font-normal text-slate-500">Participants</span></div>
            <div className="text-xs text-slate-400">Mean Score: <span className="text-white font-bold">{statsA.meanScore}</span> / 10</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-purple-400 uppercase font-semibold">Group B (Pie Charts)</div>
            <div className="text-3xl font-bold text-white">{statsB.count} <span className="text-xs font-normal text-slate-500">Participants</span></div>
            <div className="text-xs text-slate-400">Mean Score: <span className="text-white font-bold">{statsB.meanScore}</span> / 10</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
            <div className="text-xs text-emerald-400 uppercase font-semibold">Group C (Bar Models)</div>
            <div className="text-3xl font-bold text-white">{statsC.count} <span className="text-xs font-normal text-slate-500">Participants</span></div>
            <div className="text-xs text-slate-400">Mean Score: <span className="text-white font-bold">{statsC.meanScore}</span> / 10</div>
          </div>
        </div>

        {/* Comparative Chart & Group Statistics Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recharts Comparison Chart */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-amber-400" /> Group Mean Performance Comparison
            </h3>
            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis domain={[0, 10]} stroke="#64748b" fontSize={11} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="mean" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Statistical Summary */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-400" /> Statistical Summary Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Group</th>
                    <th className="py-2.5 px-3">N</th>
                    <th className="py-2.5 px-3">Mean Score</th>
                    <th className="py-2.5 px-3">SD</th>
                    <th className="py-2.5 px-3">Min / Max</th>
                    <th className="py-2.5 px-3">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-blue-400">Group A (Numbers)</td>
                    <td className="py-2.5 px-3">{statsA.count}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{statsA.meanScore}</td>
                    <td className="py-2.5 px-3">{statsA.sdScore}</td>
                    <td className="py-2.5 px-3">{statsA.minScore} / {statsA.maxScore}</td>
                    <td className="py-2.5 px-3">{(statsA.avgTimeMs / 1000).toFixed(2)}s</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-purple-400">Group B (Pie Charts)</td>
                    <td className="py-2.5 px-3">{statsB.count}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{statsB.meanScore}</td>
                    <td className="py-2.5 px-3">{statsB.sdScore}</td>
                    <td className="py-2.5 px-3">{statsB.minScore} / {statsB.maxScore}</td>
                    <td className="py-2.5 px-3">{(statsB.avgTimeMs / 1000).toFixed(2)}s</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-emerald-400">Group C (Bar Models)</td>
                    <td className="py-2.5 px-3">{statsC.count}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{statsC.meanScore}</td>
                    <td className="py-2.5 px-3">{statsC.sdScore}</td>
                    <td className="py-2.5 px-3">{statsC.minScore} / {statsC.maxScore}</td>
                    <td className="py-2.5 px-3">{(statsC.avgTimeMs / 1000).toFixed(2)}s</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Participant Data Table */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Participant Results Records ({filteredParticipants.length})
            </h3>

            {/* Filter Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filter Group:</span>
              <select
                value={adminFilterGroup}
                onChange={(e) => setAdminFilterGroup(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none"
              >
                <option value="ALL">All Groups</option>
                <option value="A">Group A (Numbers)</option>
                <option value="B">Group B (Circles)</option>
                <option value="C">Group C (Bars)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Participant ID</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Correct</th>
                  <th className="py-3 px-4">Incorrect</th>
                  <th className="py-3 px-4">Unanswered</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredParticipants.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-slate-500">
                      No participant records found in current view.
                    </td>
                  </tr>
                ) : (
                  filteredParticipants.map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-400">{p.participantId}</td>
                      <td className="py-3 px-4 font-semibold text-white">{p.studentName}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.assignedGroup === 'A' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                          p.assignedGroup === 'B' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                          'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          Group {p.assignedGroup}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-white">{p.totalScore ?? 0} / 10</td>
                      <td className="py-3 px-4 text-emerald-400 font-semibold">{p.correctCount ?? 0}</td>
                      <td className="py-3 px-4 text-rose-400">{p.incorrectCount ?? 0}</td>
                      <td className="py-3 px-4 text-amber-400">{p.unansweredCount ?? 0}</td>
                      <td className="py-3 px-4">{p.totalDurationMs ? (p.totalDurationMs / 1000).toFixed(1) + 's' : '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          p.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return null;
}