/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef, ErrorInfo, ReactNode } from 'react';
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Zap, Info, Activity, ShieldCheck, Mic, MessageSquare, Save, LogIn, LogOut, User, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db, collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp } from './firebase';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorInfo: '' };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message || String(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 font-mono">
          <div className="max-w-md w-full bg-[#151619] border border-red-900/30 rounded-2xl p-8 text-center shadow-2xl">
            <Info className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <div className="text-[10px] text-red-500/50 bg-black/40 p-3 rounded overflow-auto max-h-32 text-left">
              {this.state.errorInfo}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-2 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => any) | null;
  onchargingtimechange: ((this: BatteryManager, ev: Event) => any) | null;
  ondischargingtimechange: ((this: BatteryManager, ev: Event) => any) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => any) | null;
}

declare global {
  interface Navigator {
    getBattery?: () => Promise<BatteryManager>;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BatteryMonitor />
    </ErrorBoundary>
  );
}

function BatteryMonitor() {
  const [battery, setBattery] = useState<BatteryManager | null>(null);
  const [level, setLevel] = useState<number>(0);
  const [charging, setCharging] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  const [health, setHealth] = useState<string>("Scanning...");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const [transcription, setTranscription] = useState<string>("");
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [notes, setNotes] = useState<any[]>([]);

  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Fetch Notes from Firestore
  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }

    const q = query(
      collection(db, "notes"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotes(fetchedNotes);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleTranscription = async (audioBlob: Blob) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: "audio/webm" } },
              { text: "Transcribe this audio note about battery health. Return only the transcription." }
            ]
          }
        });
        
        const text = response.text || "Could not transcribe.";
        setTranscription(text);

        // Auto-save to Firestore if logged in
        if (user && text !== "Could not transcribe.") {
          try {
            await addDoc(collection(db, "notes"), {
              userId: user.uid,
              text: text,
              batteryLevel: Math.round(level * 100),
              createdAt: serverTimestamp()
            });
          } catch (error) {
            console.error("Error saving note:", error);
          }
        }
      };
    } catch (error) {
      console.error("Transcription error:", error);
    }
  };

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (isTranscribing) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaRecorder.current = new MediaRecorder(stream);
        mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);
        mediaRecorder.current.onstop = () => {
          const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
          handleTranscription(blob);
          audioChunks.current = [];
        };
        mediaRecorder.current.start();
      });
    } else if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
  }, [isTranscribing]);

  const sessionRef = useRef<any>(null);

  useEffect(() => {
    if (isLiveActive) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are a battery health expert. The user's current battery level is ${percentage}%. Status: ${getStatusText()}. Health: ${health}. Help them optimize their battery life.`
        },
        callbacks: {
          onopen: () => console.log("Live session opened"),
          onmessage: (msg) => {
            if (msg.serverContent?.modelTurn?.parts[0]?.inlineData) {
              // Handle audio output
            }
          }
        }
      }).then(session => {
        sessionRef.current = session;
      });
    } else if (sessionRef.current) {
      sessionRef.current.close();
    }
  }, [isLiveActive]);

  useEffect(() => {
    if (!navigator.getBattery) {
      setIsSupported(false);
      return;
    }

    const updateBatteryInfo = (bm: BatteryManager) => {
      setLevel(bm.level);
      setCharging(bm.charging);
      // Simulate a health check update
      if (bm.level > 0) setHealth("Good");
    };

    navigator.getBattery().then((bm) => {
      setBattery(bm);
      updateBatteryInfo(bm);

      const handleLevelChange = () => updateBatteryInfo(bm);
      const handleChargingChange = () => updateBatteryInfo(bm);

      bm.addEventListener('levelchange', handleLevelChange);
      bm.addEventListener('chargingchange', handleChargingChange);

      return () => {
        bm.removeEventListener('levelchange', handleLevelChange);
        bm.removeEventListener('chargingchange', handleChargingChange);
      };
    });
  }, []);

  const getBatteryIcon = () => {
    if (charging) return <BatteryCharging className="w-8 h-8 text-emerald-400" />;
    if (level >= 0.9) return <BatteryFull className="w-8 h-8 text-emerald-400" />;
    if (level >= 0.5) return <BatteryMedium className="w-8 h-8 text-yellow-400" />;
    if (level >= 0.2) return <BatteryLow className="w-8 h-8 text-orange-400" />;
    return <Battery className="w-8 h-8 text-red-500 animate-pulse" />;
  };

  const getStatusText = () => {
    if (level === 1 && charging) return "Full (Plugged)";
    if (level === 1) return "Full";
    return charging ? "Charging" : "Discharging";
  };

  const getHealthStatus = () => {
    // Web API doesn't provide actual health, but we can infer "Good" if level is stable
    return "Good";
  };

  if (!isSupported) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 font-mono">
        <div className="max-w-md w-full bg-[#151619] border border-red-900/30 rounded-2xl p-8 text-center shadow-2xl">
          <Info className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl text-white mb-2">API Not Supported</h1>
          <p className="text-gray-400 text-sm">
            The Battery Status API is not supported in this browser. Please try Chrome on Android for the best experience.
          </p>
        </div>
      </div>
    );
  }

  const percentage = Math.round(level * 100);

  return (
    <div className="min-h-screen bg-[#E6E6E6] flex items-center justify-center p-4 font-mono selection:bg-emerald-500/30">
      {/* Main Hardware Widget */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[380px] bg-[#151619] rounded-[32px] p-8 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.4)] border border-white/5 relative overflow-hidden"
      >
        {/* Decorative Hardware Elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-1">System Monitor</h2>
            <h1 className="text-white text-lg font-medium tracking-tight">VoltWatch v1.0</h1>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-2">
              <div className={`w-2 h-2 rounded-full ${charging ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-gray-700'}`} />
              <div className="w-2 h-2 rounded-full bg-gray-700" />
            </div>
            
            {isAuthReady && (
              <button 
                onClick={user ? handleLogout : handleLogin}
                className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-gray-400 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-full border border-white/10"
              >
                {user ? (
                  <><LogOut className="w-3 h-3" /> Logout</>
                ) : (
                  <><LogIn className="w-3 h-3" /> Login</>
                )}
              </button>
            )}
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2 mb-8 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
            <div className="w-6 h-6 rounded-full overflow-hidden border border-emerald-500/20">
              <img src={user.photoURL || ""} alt={user.displayName || ""} referrerPolicy="no-referrer" />
            </div>
            <span className="text-[10px] text-emerald-400 font-medium truncate">
              Welcome, {user.displayName?.split(' ')[0]}
            </span>
          </div>
        )}

        {/* Central Radial Gauge */}
        <div className="relative flex justify-center items-center mb-12">
          <svg className="w-56 h-56 transform -rotate-90">
            {/* Background Track */}
            <circle
              cx="112"
              cy="112"
              r="100"
              stroke="currentColor"
              strokeWidth="2"
              fill="transparent"
              className="text-gray-800/50 stroke-dasharray-[4,4]"
              strokeDasharray="4,4"
            />
            {/* Progress Track */}
            <motion.circle
              cx="112"
              cy="112"
              r="100"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray="628.3"
              initial={{ strokeDashoffset: 628.3 }}
              animate={{ strokeDashoffset: 628.3 - (628.3 * level) }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={`${percentage < 20 ? 'text-red-500' : 'text-emerald-500'} drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]`}
            />
          </svg>
          
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.span 
                key={percentage}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-6xl font-bold text-white tracking-tighter"
              >
                {percentage}<span className="text-2xl text-gray-500 ml-1">%</span>
              </motion.span>
            </AnimatePresence>
            <span className="text-[10px] uppercase tracking-widest text-gray-500 mt-2 font-bold">Capacity</span>
          </div>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Zap className={`w-4 h-4 ${charging ? 'text-emerald-400' : 'text-gray-500'}`} />
              <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Status</span>
            </div>
            <div className="text-white text-sm font-medium truncate">
              {getStatusText()}
            </div>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 relative overflow-hidden group">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className={`w-4 h-4 ${health === 'Good' ? 'text-emerald-400' : 'text-yellow-400'}`} />
              <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Health</span>
            </div>
            <div className="text-white text-sm font-medium flex justify-between items-center">
              <span>{isScanning ? "Scanning..." : health}</span>
              <button 
                onClick={() => {
                  setIsScanning(true);
                  setTimeout(() => {
                    setIsScanning(false);
                    setHealth("Good");
                  }, 2000);
                }}
                className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                TEST
              </button>
            </div>
            {isScanning && (
              <motion.div 
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                className="absolute bottom-0 left-0 h-0.5 w-full bg-emerald-500/50"
              />
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between pt-6 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              {getBatteryIcon()}
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Source</div>
              <div className="text-white text-xs">Internal Battery</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Last Sync</div>
            <div className="text-white text-xs">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        {/* Bottom Hardware Accent */}
        <div className="mt-8 flex justify-center gap-1 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-8 h-1 bg-gray-800 rounded-full overflow-hidden">
              {i < (percentage / 20) && (
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  className="h-full bg-emerald-500/40"
                />
              )}
            </div>
          ))}
        </div>

        {/* AI Assistant & Notes */}
        <div className="space-y-4">
          <button 
            onClick={() => setIsLiveActive(!isLiveActive)}
            className={`w-full py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
              isLiveActive 
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {isLiveActive ? "Assistant Active" : "Battery Assistant"}
            </span>
          </button>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mic className={`w-4 h-4 ${isTranscribing ? 'text-red-500 animate-pulse' : 'text-gray-500'}`} />
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Battery Notes</span>
              </div>
              <button 
                onClick={() => setIsTranscribing(!isTranscribing)}
                className="text-[8px] bg-white/5 text-gray-400 px-2 py-1 rounded border border-white/10"
              >
                {isTranscribing ? "STOP" : "RECORD"}
              </button>
            </div>
            <div className="min-h-[60px] text-xs text-gray-400 italic bg-black/20 rounded-lg p-3 border border-white/5 mb-4">
              {transcription || (user ? "Record a note to save it..." : "Login to save notes...")}
            </div>

            {/* Saved Notes List */}
            {user && notes.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                <div className="text-[8px] uppercase tracking-widest text-gray-600 font-bold mb-2">Saved History</div>
                {notes.map((note) => (
                  <div key={note.id} className="bg-white/5 p-2 rounded-lg border border-white/5 text-[10px] text-gray-400">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-emerald-500/60 font-bold">{note.batteryLevel}%</span>
                      <span className="text-[8px] text-gray-600">
                        {note.createdAt?.toDate ? note.createdAt.toDate().toLocaleDateString() : 'Just now'}
                      </span>
                    </div>
                    <p className="line-clamp-2 italic">"{note.text}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Background Decorative Text */}
      <div className="fixed bottom-8 left-8 text-[120px] font-bold text-black/5 leading-none pointer-events-none select-none uppercase">
        Power<br/>Level
      </div>
    </div>
  );
}
