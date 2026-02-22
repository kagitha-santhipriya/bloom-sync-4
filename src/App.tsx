/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sprout, 
  Map as MapIcon, 
  BarChart3, 
  Globe, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Calendar,
  MapPin,
  Search,
  Languages,
  Loader2,
  Wind,
  Droplets,
  ThermometerSun,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Download,
  Activity,
  Filter,
  ArrowRight,
  Zap,
  Square
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { analyzeCropMismatch, AnalysisResult, generateSpeech, extractDetailsFromVoice } from './services/geminiService';
import { TRANSLATIONS, LANGUAGES, Language, Submission } from './constants';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Map Updater Component
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 8);
  }, [center, map]);
  return null;
}

// Fix Leaflet icon issue safely
if (typeof window !== 'undefined' && L.Icon.Default) {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [lang, setLang] = useState<Language>('en');
  const [activeTab, setActiveTab] = useState<'farmer' | 'map' | 'scientist' | 'history' | 'admin'>('farmer');
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const audioSourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const [listening, setListening] = useState(false);
  const [isHearing, setIsHearing] = useState(false);
  const [recognitionInstance, setRecognitionInstance] = useState<any>(null);
  const lastProcessedTranscript = React.useRef("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([17.3850, 78.4867]);
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null);
  const [userChoice, setUserChoice] = useState<'A' | 'B' | null>(null);

  // Filters
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterCrop, setFilterCrop] = useState<string>('all');
  
  const t = TRANSLATIONS[lang];

  // Form state
  const [crop, setCrop] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  
  const cropRef = React.useRef(crop);
  const locationRef = React.useRef(location);
  const dateRef = React.useRef(date);

  useEffect(() => { cropRef.current = crop; }, [crop]);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { dateRef.current = date; }, [date]);

  // Fetch submissions on mount
  useEffect(() => {
    fetchSubmissions();
    if (activeTab === 'admin') {
      fetchAdminStats();
    }
  }, [activeTab]);

  // Re-run analysis when language changes if an analysis is active
  useEffect(() => {
    if (analysis && crop && location && date) {
      handleAnalyze(new Event('submit') as any);
    }
  }, [lang]);

  const fetchAdminStats = async () => {
    try {
      const response = await fetch('/api/admin/stats');
      const data = await response.json();
      setAdminStats(data);
    } catch (error) {
      console.error("Failed to fetch admin stats", error);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const response = await fetch('/api/submissions');
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data);
      }
    } catch (error) {
      console.error("Failed to fetch submissions", error);
    }
  };

  // Voice Recognition
  const startListening = () => {
    if (listening && recognitionInstance) {
      recognitionInstance.stop();
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    const langMap: Record<string, string> = {
      'en': 'en-US',
      'te': 'te-IN',
      'hi': 'hi-IN',
      'ta': 'ta-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN'
    };
    
    recognition.lang = langMap[lang] || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("Voice recognition started");
      setListening(true);
      setInterimTranscript("");
      lastProcessedTranscript.current = "";
      setVoiceError(null);
    };
    recognition.onaudiostart = () => {
      console.log("Audio capturing started");
    };
    recognition.onsoundstart = () => {
      console.log("Sound detected");
      setIsHearing(true);
    };
    recognition.onsoundend = () => {
      console.log("Sound ended");
      setIsHearing(false);
    };
    recognition.onspeechstart = () => {
      console.log("Speech detected");
      setIsHearing(true);
    };
    recognition.onspeechend = () => {
      console.log("Speech ended");
      setIsHearing(false);
    };
    recognition.onend = () => {
      console.log("Voice recognition ended");
      setListening(false);
      setRecognitionInstance(null);
      // Clear interim after a delay
      setTimeout(() => setInterimTranscript(""), 2000);
    };
    recognition.onnomatch = () => {
      console.log("No match found");
      setVoiceError("Could not understand");
      setTimeout(() => setVoiceError(null), 2000);
    };
    recognition.onerror = (event: any) => {
      console.error("Voice recognition error", event.error);
      if (event.error === 'not-allowed') {
        setVoiceError("Mic access blocked");
        alert("Microphone access is blocked. Please enable permissions in browser settings.");
      } else if (event.error === 'no-speech') {
        setVoiceError("No speech detected");
        setTimeout(() => setVoiceError(null), 3000);
      } else if (event.error === 'network') {
        setVoiceError("Network error");
        setTimeout(() => setVoiceError(null), 3000);
      } else {
        setVoiceError(`Error: ${event.error}`);
        setTimeout(() => setVoiceError(null), 3000);
      }
      setListening(false);
      setRecognitionInstance(null);
    };

    recognition.onresult = async (event: any) => {
      let fullTranscript = "";
      let currentInterim = "";

      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          fullTranscript += event.results[i][0].transcript + " ";
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      if (currentInterim) {
        setInterimTranscript(currentInterim);
      }

      if (fullTranscript.trim()) {
        const transcriptToProcess = fullTranscript.trim();
        if (transcriptToProcess === lastProcessedTranscript.current) return;
        
        lastProcessedTranscript.current = transcriptToProcess;
        console.log("Full transcript to process:", transcriptToProcess);
        setInterimTranscript(transcriptToProcess);
        
        setLoading(true);
        try {
          const details = await extractDetailsFromVoice(transcriptToProcess, lang);
          console.log("Extracted details:", details);
          
          let updated = false;
          let feedbackParts = [];
          
          if (details.crop && details.crop.toLowerCase() !== cropRef.current.toLowerCase()) { 
            setCrop(details.crop); 
            updated = true; 
            feedbackParts.push(details.crop);
          }
          if (details.location && details.location.toLowerCase() !== locationRef.current.toLowerCase()) { 
            setLocation(details.location); 
            updated = true; 
            feedbackParts.push(`in ${details.location}`);
          }
          if (details.date && details.date !== dateRef.current) { 
            setDate(details.date); 
            updated = true; 
          }
          
          if (updated && feedbackParts.length > 0) {
             const feedbackText = `${t.gotIt} ${feedbackParts.join(" ")}.`; 
             handleSpeak(feedbackText);
          }
        } catch (error) {
          console.error("Voice processing failed", error);
        } finally {
          setLoading(false);
        }
      }
    };

    setRecognitionInstance(recognition);
    recognition.start();
  };

  const handleChoice = async (choice: 'A' | 'B') => {
    if (!currentSubmissionId) return;
    try {
      await fetch(`/api/submissions/${currentSubmissionId}/choice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      setUserChoice(choice);
      fetchSubmissions();
    } catch (error) {
      console.error("Failed to save choice", error);
    }
  };

  const stopSpeaking = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        console.error("Error stopping audio", e);
      }
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setSpeaking(false);
  };

  const handleSpeak = async (customText?: string) => {
    if (speaking) {
      stopSpeaking();
      return;
    }
    
    if (!analysis && !customText) return;
    
    let textToSpeak = "";
    if (customText) {
      textToSpeak = customText;
    } else if (analysis) {
      textToSpeak = `
        ${t.cropType}: ${crop}.
        ${t.riskLevel}: ${t[analysis.riskLevel]}.
        ${t.whatMayHappen}: ${analysis.advisory.whatMayHappen}.
        ${t.expectedYield}: ${analysis.advisory.expectedYieldChange}.
        ${t.optionA}: ${analysis.advisory.optionA.suggestion}.
        ${t.optionB}: ${analysis.advisory.optionB.precautionSteps.join(". ")}.
      `;
    }

    if (!textToSpeak) return;
    
    setSpeaking(true);
    try {
      const base64Audio = await generateSpeech(textToSpeak, lang);
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = audioContext;
        
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        const arrayBuffer = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;
        
        // Gemini TTS returns linear PCM 16-bit
        const int16Array = new Int16Array(arrayBuffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768;
        }
        
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        
        const source = audioContext.createBufferSource();
        audioSourceRef.current = source;
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          if (audioSourceRef.current === source) {
            setSpeaking(false);
            audioSourceRef.current = null;
            audioContext.close();
            audioContextRef.current = null;
          }
        };
        source.start();
      } else {
        setSpeaking(false);
      }
    } catch (error) {
      console.error("Speech playback failed", error);
      setSpeaking(false);
    }
  };

  const loadSubmission = (sub: any) => {
    setCrop(sub.crop);
    setLocation(sub.location);
    setDate(sub.date);
    setAnalysis(sub.fullAnalysis || null);
    setMapCenter([sub.lat, sub.lng]);
    setActiveTab('farmer');
    
    if (sub.riskLevel === 'high' && sub.fullAnalysis && autoSpeak) {
      const result = sub.fullAnalysis;
      const voiceText = `
        ${t.autoVoiceAlert}.
        ${t.riskLevel}: ${t[result.riskLevel]}.
        ${t.whatMayHappen}: ${result.advisory.whatMayHappen}.
      `;
      handleSpeak(voiceText);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crop || !location || !date) return;

    setLoading(true);
    setAnalysisError(null);
    try {
      const result = await analyzeCropMismatch(crop, location, date, lang);
      setAnalysis(result);
      setMapCenter([result.lat, result.lng]);
      
      const newSubmission = {
        crop,
        location,
        lat: result.lat,
        lng: result.lng,
        date,
        riskLevel: result.riskLevel,
        climaticConditions: result.climaticConditions,
        fullAnalysis: result // Store full analysis for re-checking
      };

      // Save to backend
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubmission),
      });

      if (response.ok) {
        const savedSub = await response.json();
        setCurrentSubmissionId(savedSub.id);
        setUserChoice(null);
        fetchSubmissions();
      }

      // Auto-trigger voice assistant for high risk
      if (result.riskLevel === 'high' && autoSpeak) {
        const voiceText = `
          ${t.autoVoiceAlert}.
          ${t.riskLevel}: ${t[result.riskLevel]}.
          ${t.whatMayHappen}: ${result.advisory.whatMayHappen}.
        `;
        handleSpeak(voiceText);
      }
    } catch (error) {
      console.error("Analysis failed", error);
      setAnalysisError("Analysis failed. Please check your inputs and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (showLanding) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        {/* Landing Header */}
        <header className="absolute top-0 left-0 right-0 z-50 p-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sprout className="text-emerald-500" size={32} />
              <h1 className="text-2xl font-bold text-white tracking-tight">BloomSync</h1>
            </div>
            <div className="flex items-center gap-4">
              <select 
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                className="bg-stone-900/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg border border-stone-700 text-sm outline-none cursor-pointer"
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code} className="bg-stone-900">{l.name}</option>
                ))}
              </select>
              <button 
                onClick={() => setShowLanding(false)}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold px-6 py-2 rounded-full transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
              >
                Get Started
              </button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-5xl"
          >
            <h2 className="text-7xl md:text-[10rem] font-bold text-white mb-6 tracking-tighter leading-none">
              Welcome to<br />BloomSync
            </h2>
            <p className="text-xl md:text-3xl text-stone-300 mb-12 font-medium tracking-tight">
              Real-Time Climate & Crop Advisory
            </p>
            <button 
              onClick={() => setShowLanding(false)}
              className="group bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold px-10 py-4 rounded-full text-xl transition-all flex items-center gap-3 mx-auto shadow-[0_0_30px_rgba(16,185,129,0.4)]"
            >
              Get Started
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </main>

        {/* Bottom Left Icon */}
        <div className="absolute bottom-8 left-8">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-stone-900 shadow-lg">
            <Zap size={20} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-stone-900/40 backdrop-blur-md border-b border-stone-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowLanding(true)}>
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-900/20">
              <Sprout size={24} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-stone-100">{t.title}</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-emerald-400 leading-none">{t.subtitle}</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-stone-950/40 p-1 rounded-lg border border-stone-800">
            <button 
              onClick={() => setActiveTab('farmer')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'farmer' ? "bg-emerald-600 text-white shadow-sm" : "text-stone-400 hover:text-stone-100"
              )}
            >
              {t.farmerPortal}
            </button>
            <button 
              onClick={() => setActiveTab('map')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'map' ? "bg-emerald-600 text-white shadow-sm" : "text-stone-400 hover:text-stone-100"
              )}
            >
              {t.mapPortal}
            </button>
            <button 
              onClick={() => setActiveTab('scientist')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'scientist' ? "bg-emerald-600 text-white shadow-sm" : "text-stone-400 hover:text-stone-100"
              )}
            >
              {t.nasaScientistView}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'history' ? "bg-emerald-600 text-white shadow-sm" : "text-stone-400 hover:text-stone-100"
              )}
            >
              <div className="flex items-center gap-1.5">
                <Calendar size={14} />
                {t.historyPortal}
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'admin' ? "bg-emerald-600 text-white shadow-sm" : "text-stone-400 hover:text-stone-100"
              )}
            >
              <div className="flex items-center gap-1.5">
                <BarChart3 size={14} />
                {t.adminPortal}
              </div>
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={cn(
                "p-2 rounded-full transition-all border",
                autoSpeak ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-stone-800/40 border-stone-700 text-stone-500"
              )}
              title={autoSpeak ? "Auto-Voice: ON" : "Auto-Voice: OFF"}
            >
              {autoSpeak ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <select 
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
              className="bg-stone-900/60 border border-stone-700 text-stone-200 rounded-full px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code} className="bg-stone-900">{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'farmer' && (
            <motion.div 
              key="farmer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Input Form */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-stone-100">
                      <Search size={20} className="text-emerald-400" />
                      {t.farmerPortal}
                    </h2>
                    <div className="flex items-center gap-2">
                      {listening && (
                        <div className="flex gap-0.5 items-center px-1 mr-1">
                          <span className={cn(
                            "w-0.5 bg-emerald-500 rounded-full transition-all duration-300",
                            isHearing ? "h-4 animate-bounce" : "h-1 opacity-50"
                          )} style={{ animationDelay: '-0.3s' }}></span>
                          <span className={cn(
                            "w-0.5 bg-emerald-500 rounded-full transition-all duration-300",
                            isHearing ? "h-6 animate-bounce" : "h-1 opacity-50"
                          )} style={{ animationDelay: '-0.15s' }}></span>
                          <span className={cn(
                            "w-0.5 bg-emerald-500 rounded-full transition-all duration-300",
                            isHearing ? "h-4 animate-bounce" : "h-1 opacity-50"
                          )}></span>
                        </div>
                      )}
                      {listening && isHearing && (
                        <span className="text-[10px] font-bold text-emerald-400 animate-pulse mr-2">
                          Hearing...
                        </span>
                      )}
                      {voiceError && (
                        <span className="text-[10px] font-bold text-red-400 animate-pulse bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20">
                          {voiceError}
                        </span>
                      )}
                      {interimTranscript && (
                        <span className="text-[10px] font-medium text-emerald-400 italic max-w-[100px] truncate">
                          "{interimTranscript}"
                        </span>
                      )}
                      <button
                        onClick={startListening}
                        disabled={loading}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                          listening ? "bg-red-500 text-white shadow-lg shadow-red-900/40" : "bg-stone-800/40 text-stone-400 hover:bg-emerald-500/20 hover:text-emerald-400"
                        )}
                      >
                        {listening ? <Square size={12} fill="currentColor" /> : <Mic size={14} />}
                        {listening ? "Stop" : t.voiceInput}
                      </button>
                    </div>
                  </div>
                  <form onSubmit={handleAnalyze} className="space-y-4">
                    {analysisError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium flex items-center gap-2">
                        <AlertTriangle size={14} />
                        {analysisError}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">{t.cropType}</label>
                      <input 
                        type="text" 
                        value={crop}
                        onChange={(e) => setCrop(e.target.value)}
                        placeholder="e.g. Mango, Cotton, Rice"
                        className="w-full px-4 py-2.5 rounded-xl bg-stone-950/40 border border-stone-800 text-stone-100 placeholder:text-stone-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">{t.location}</label>
                      <div className="relative">
                        <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                        <input 
                          type="text" 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Hyderabad, Telangana"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stone-950/40 border border-stone-800 text-stone-100 placeholder:text-stone-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">{t.date}</label>
                      <div className="relative">
                        <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                        <input 
                          type="date" 
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stone-950/40 border border-stone-800 text-stone-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                          required
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          {t.analyzing}
                        </>
                      ) : (
                        t.analyze
                      )}
                    </button>
                  </form>
                </div>

                {/* Quick Info */}
                <div className="bg-emerald-900/40 backdrop-blur-md text-emerald-50 p-6 rounded-2xl border border-emerald-800/30 shadow-xl">
                  <h3 className="font-bold mb-2 flex items-center gap-2 text-emerald-300">
                    <Info size={18} />
                    NASA Satellite Insights
                  </h3>
                  <p className="text-sm opacity-80 leading-relaxed">
                    Our system uses MODIS and VIIRS satellite data to track vegetation indices (NDVI) and pollinator migration patterns in real-time.
                  </p>
                </div>
              </div>

              {/* Analysis Results */}
              <div className="lg:col-span-8 space-y-6">
                {!analysis && !loading && (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-stone-900/40 backdrop-blur-md rounded-2xl border-2 border-dashed border-stone-800">
                    <div className="w-20 h-20 bg-stone-950/40 rounded-full flex items-center justify-center mb-4">
                      <Globe size={40} className="text-stone-700" />
                    </div>
                    <h3 className="text-xl font-bold text-stone-500">Ready for Analysis</h3>
                    <p className="text-stone-600 max-w-xs mt-2">Enter your crop and location details to see the pollination mismatch analysis.</p>
                  </div>
                )}

                {loading && (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-stone-900/40 backdrop-blur-md rounded-2xl border border-stone-800">
                    <Loader2 size={48} className="text-emerald-500 animate-spin mb-4" />
                    <h3 className="text-xl font-bold text-stone-100">{t.analyzing}</h3>
                    <p className="text-stone-500 mt-2">Connecting to NASA Earth Data nodes...</p>
                  </div>
                )}

                {analysis && !loading && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-6"
                  >
                    {/* Farmer Advisory Layer - Simplified */}
                    <div className="bg-emerald-900/40 backdrop-blur-md p-6 rounded-2xl border border-emerald-800/30 shadow-xl">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-4 h-4 rounded-full animate-pulse",
                            analysis.riskLevel === 'high' ? "bg-red-500" : analysis.riskLevel === 'medium' ? "bg-yellow-500" : "bg-emerald-500"
                          )} />
                          <h2 className="text-xl font-bold text-stone-100">
                            {t.riskLevel}: <span className={cn(
                              analysis.riskLevel === 'high' ? "text-red-400" : analysis.riskLevel === 'medium' ? "text-yellow-400" : "text-emerald-400"
                            )}>{t[analysis.riskLevel]}</span>
                          </h2>
                        </div>
                        <button 
                          onClick={() => handleSpeak()}
                          className={cn(
                            "p-3 rounded-full transition-all",
                            speaking ? "bg-red-500/20 text-red-400" : "bg-stone-800/40 text-stone-400 hover:bg-emerald-500/20 hover:text-emerald-400"
                          )}
                          title={speaking ? "Stop Listening" : "Listen to Advisory"}
                        >
                          {speaking ? <VolumeX size={20} className="animate-pulse" /> : <Volume2 size={20} />}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="bg-stone-950/40 p-4 rounded-xl border border-stone-800">
                            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">{t.whatMayHappen}</h3>
                            <p className="text-stone-200 leading-relaxed">{analysis.advisory.whatMayHappen}</p>
                          </div>
                          <div className="bg-stone-950/40 p-4 rounded-xl border border-stone-800">
                            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">{t.expectedYield}</h3>
                            <p className="text-2xl font-bold text-stone-100">{analysis.advisory.expectedYieldChange}</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="bg-stone-950/40 p-4 rounded-xl border border-stone-800">
                            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">{t.climaticConditions}</h3>
                            <p className="text-stone-300 text-sm italic">"{analysis.climaticConditions}"</p>
                          </div>
                        </div>
                      </div>

                      {/* Decision Options */}
                      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Option A */}
                        <div className={cn(
                          "p-6 rounded-2xl border transition-all cursor-pointer group",
                          userChoice === 'A' ? "bg-blue-900/40 border-blue-500 shadow-lg shadow-blue-900/20" : "bg-stone-950/40 border-stone-800 hover:border-blue-500/50"
                        )} onClick={() => handleChoice('A')}>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-blue-400 flex items-center gap-2">
                              <RefreshCw size={18} />
                              {t.optionA}
                            </h3>
                            {userChoice === 'A' && <CheckCircle2 size={20} className="text-blue-400" />}
                          </div>
                          <p className="text-sm text-stone-300 mb-4">{analysis.advisory.optionA.suggestion}</p>
                          <div className="flex flex-wrap gap-2">
                            {analysis.advisory.optionA.crops.map((c: string, i: number) => (
                              <span key={i} className="px-2 py-1 bg-blue-900/20 text-blue-300 rounded-md text-[10px] font-bold border border-blue-800/30">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Option B */}
                        <div className={cn(
                          "p-6 rounded-2xl border transition-all cursor-pointer group",
                          userChoice === 'B' ? "bg-emerald-900/40 border-emerald-500 shadow-lg shadow-emerald-900/20" : "bg-stone-950/40 border-stone-800 hover:border-emerald-500/50"
                        )} onClick={() => handleChoice('B')}>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-emerald-400 flex items-center gap-2">
                              <CheckCircle2 size={18} />
                              {t.optionB}
                            </h3>
                            {userChoice === 'B' && <CheckCircle2 size={20} className="text-emerald-400" />}
                          </div>
                          <ul className="space-y-2">
                            {analysis.advisory.optionB.precautionSteps.map((step: string, i: number) => (
                              <li key={i} className="text-xs text-stone-300 flex items-start gap-2">
                                <div className="w-1 h-1 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      
                      {userChoice && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-emerald-400 text-sm font-medium"
                        >
                          {t.choiceSelected}
                        </motion.div>
                      )}
                    </div>

                    {/* Technical Layer - Internal Engine Visualization */}
                    <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                      <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Activity size={16} />
                        Climate Intelligence Engine Output
                      </h3>
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={analysis.bloomingData}>
                            <defs>
                              <linearGradient id="colorBloom" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorPollin" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#292524" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#1c1917', borderRadius: '12px', border: '1px solid #44403c', color: '#e7e5e4' }}
                            />
                            <Area type="monotone" dataKey="activity" stroke="#10b981" strokeWidth={2} fill="url(#colorBloom)" name="Bloom Window" />
                            <Area data={analysis.pollinationData} type="monotone" dataKey="activity" stroke="#f59e0b" strokeWidth={2} fill="url(#colorPollin)" name="Pollinator Activity" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-stone-100">{t.adminPortal}</h2>
                  <p className="text-stone-400 text-sm">{t.adminStats}</p>
                </div>
                <button className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2">
                  <Download size={16} />
                  {t.exportData}
                </button>
              </div>

              {adminStats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                    <p className="text-xs font-bold text-stone-500 uppercase mb-2">{t.totalSubmissions}</p>
                    <p className="text-4xl font-bold text-emerald-400">{adminStats.total}</p>
                  </div>
                  <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                    <p className="text-xs font-bold text-stone-500 uppercase mb-2">High Risk Areas</p>
                    <p className="text-4xl font-bold text-red-400">{adminStats.byRisk.high}</p>
                  </div>
                  <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                    <p className="text-xs font-bold text-stone-500 uppercase mb-2">Decided to Change</p>
                    <p className="text-4xl font-bold text-blue-400">{adminStats.byChoice.change}</p>
                  </div>
                  <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                    <p className="text-xs font-bold text-stone-500 uppercase mb-2">Decided to Continue</p>
                    <p className="text-4xl font-bold text-emerald-400">{adminStats.byChoice.continue}</p>
                  </div>

                  <div className="lg:col-span-2 bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                    <h3 className="font-bold mb-6 text-stone-100">{t.riskDistribution}</h3>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: 'High', value: adminStats.byRisk.high, color: '#ef4444' },
                          { name: 'Medium', value: adminStats.byRisk.medium, color: '#f59e0b' },
                          { name: 'Low', value: adminStats.byRisk.low, color: '#10b981' },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#292524" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#78716c' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#78716c' }} />
                          <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            { [0,1,2].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : index === 1 ? '#f59e0b' : '#10b981'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="lg:col-span-2 bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                    <h3 className="font-bold mb-6 text-stone-100">{t.cropPopularity}</h3>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={Object.entries(adminStats.byCrop).map(([name, value]) => ({ name, value }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {Object.entries(adminStats.byCrop).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <Loader2 size={32} className="animate-spin text-emerald-500" />
                </div>
              )}
            </motion.div>
          )}
          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-stone-100">{t.historyPortal}</h2>
                  <p className="text-stone-400 text-sm">Access and re-examine all your previous agricultural assessments.</p>
                </div>
              </div>

              {submissions.length === 0 ? (
                <div className="bg-stone-900/40 backdrop-blur-md p-12 rounded-2xl border border-stone-800 text-center">
                  <Calendar size={48} className="mx-auto text-stone-700 mb-4" />
                  <p className="text-stone-500">{t.noRecords}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {submissions.map((sub) => (
                    <div key={sub.id} className="bg-stone-900/40 backdrop-blur-md p-5 rounded-2xl border border-stone-800 shadow-xl hover:bg-stone-800/40 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-stone-100 group-hover:text-emerald-400 transition-colors">{sub.crop}</h3>
                          <p className="text-xs text-stone-500 flex items-center gap-1">
                            <MapPin size={12} />
                            {sub.location}
                          </p>
                        </div>
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-bold uppercase",
                          sub.riskLevel === 'high' ? "bg-red-900/40 text-red-400 border border-red-800/30" : sub.riskLevel === 'medium' ? "bg-amber-900/40 text-amber-400 border border-amber-800/30" : "bg-emerald-900/40 text-emerald-400 border border-emerald-800/30"
                        )}>
                          {t[sub.riskLevel]}
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-500 mb-4">
                        {new Date(sub.timestamp).toLocaleString()}
                      </div>
                      <button 
                        onClick={() => loadSubmission(sub)}
                        className="w-full py-2 bg-stone-950/40 hover:bg-emerald-600 text-stone-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-stone-800"
                      >
                        <Search size={14} />
                        {t.viewAnalysis}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'map' && (
            <motion.div 
              key="map"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="h-[calc(100vh-12rem)] flex flex-col gap-6"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-stone-100">{t.mapPortal}</h2>
                  <p className="text-stone-400 text-sm">Real-time global monitoring of pollination risk zones.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-stone-900/40 backdrop-blur-md p-1.5 rounded-xl border border-stone-800">
                    <Filter size={14} className="text-stone-500 ml-2" />
                    <select 
                      value={filterRisk}
                      onChange={(e) => setFilterRisk(e.target.value)}
                      className="bg-transparent text-xs text-stone-300 outline-none border-none cursor-pointer"
                    >
                      <option value="all" className="bg-stone-900">All Risks</option>
                      <option value="high" className="bg-stone-900">High Risk</option>
                      <option value="medium" className="bg-stone-900">Medium Risk</option>
                      <option value="low" className="bg-stone-900">Low Risk</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-stone-900/40 backdrop-blur-md p-1.5 rounded-xl border border-stone-800">
                    <Sprout size={14} className="text-stone-500 ml-2" />
                    <select 
                      value={filterCrop}
                      onChange={(e) => setFilterCrop(e.target.value)}
                      className="bg-transparent text-xs text-stone-300 outline-none border-none cursor-pointer"
                    >
                      <option value="all" className="bg-stone-900">All Crops</option>
                      {Array.from(new Set(submissions.map(s => s.crop))).map(crop => (
                        <option key={crop} value={crop} className="bg-stone-900">{crop}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-4 bg-stone-900/40 backdrop-blur-md p-2 rounded-xl border border-stone-800 shadow-xl">
                    <div className="flex items-center gap-2 px-3 py-1">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-xs font-medium text-stone-300">{t.redZone}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span className="text-xs font-medium text-stone-300">{t.yellowZone}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-xs font-medium text-stone-300">{t.greenZone}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 bg-stone-900/40 backdrop-blur-md rounded-2xl border border-stone-800 shadow-xl overflow-hidden relative">
                <MapContainer 
                  center={mapCenter} 
                  zoom={6} 
                  className="z-0"
                >
                  <MapUpdater center={mapCenter} />
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  {submissions
                    .filter(s => filterRisk === 'all' || s.riskLevel === filterRisk)
                    .filter(s => filterCrop === 'all' || s.crop === filterCrop)
                    .map((sub) => (
                    <React.Fragment key={sub.id}>
                      <Marker position={[sub.lat, sub.lng]}>
                        <Popup>
                          <div className="p-1 min-w-[150px]">
                            <h4 className="font-bold text-emerald-700 text-sm">{sub.crop}</h4>
                            <p className="text-[10px] text-stone-500 mb-2">{sub.location}</p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-stone-400">Risk:</span>
                                <span className={cn(
                                  "font-bold",
                                  sub.riskLevel === 'high' ? "text-red-600" : sub.riskLevel === 'medium' ? "text-amber-600" : "text-emerald-600"
                                )}>{t[sub.riskLevel]}</span>
                              </div>
                              <div className="flex justify-between text-[10px]">
                                <span className="text-stone-400">Date:</span>
                                <span className="font-medium">{sub.date}</span>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-stone-100">
                              <span className="text-[9px] text-stone-300">{new Date(sub.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                      <Circle 
                        center={[sub.lat, sub.lng]}
                        radius={20000}
                        pathOptions={{
                          fillColor: sub.riskLevel === 'high' ? '#ef4444' : sub.riskLevel === 'medium' ? '#f59e0b' : '#10b981',
                          color: sub.riskLevel === 'high' ? '#ef4444' : sub.riskLevel === 'medium' ? '#f59e0b' : '#10b981',
                          weight: 1,
                          fillOpacity: 0.3
                        }}
                      />
                    </React.Fragment>
                  ))}
                </MapContainer>
              </div>
            </motion.div>
          )}

          {activeTab === 'scientist' && (
            <motion.div 
              key="scientist"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-stone-100">{t.nasaScientistView}</h2>
                  <p className="text-stone-400 text-sm">Advanced satellite data correlation and global trend analysis.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 text-emerald-400 border border-emerald-800/30 rounded-lg text-xs font-bold">
                    <Globe size={14} />
                    LIVE SATELLITE FEED
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                  <h3 className="font-bold mb-6 flex items-center gap-2 text-stone-100">
                    <BarChart3 size={20} className="text-emerald-400" />
                    Global Mismatch Trends (2020-2026)
                  </h3>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={[
                        { year: '2020', mismatch: 4.2, temp: 1.1 },
                        { year: '2021', mismatch: 5.1, temp: 1.2 },
                        { year: '2022', mismatch: 7.4, temp: 1.3 },
                        { year: '2023', mismatch: 8.9, temp: 1.5 },
                        { year: '2024', mismatch: 11.2, temp: 1.6 },
                        { year: '2025', mismatch: 13.5, temp: 1.8 },
                        { year: '2026', mismatch: 15.8, temp: 2.0 },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#292524" />
                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#78716c' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#78716c' }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c', color: '#e7e5e4' }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="mismatch" stroke="#10b981" strokeWidth={3} name="Avg Mismatch (Days)" />
                        <Line type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={3} name="Global Temp Anomaly (°C)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                    <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-stone-500">Critical Regions</h3>
                    <div className="space-y-4">
                      {[
                        { region: 'South Asia', risk: 'High', trend: 'Increasing' },
                        { region: 'Sub-Saharan Africa', risk: 'High', trend: 'Stable' },
                        { region: 'Mediterranean', risk: 'Medium', trend: 'Increasing' },
                        { region: 'Central America', risk: 'High', trend: 'Increasing' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-stone-950/40 rounded-xl border border-stone-800/50">
                          <div>
                            <p className="font-bold text-sm text-stone-200">{item.region}</p>
                            <p className="text-[10px] text-stone-500 uppercase tracking-tighter">{item.trend}</p>
                          </div>
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold",
                            item.risk === 'High' ? "bg-red-900/40 text-red-400 border border-red-800/30" : "bg-yellow-900/40 text-yellow-400 border border-yellow-800/30"
                          )}>
                            {item.risk}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-emerald-900/40 backdrop-blur-md text-white p-6 rounded-2xl border border-emerald-800/30 shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                      <h3 className="font-bold mb-2 text-emerald-300">Satellite Status</h3>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="text-xs font-medium opacity-80">Terra & Aqua (MODIS) Online</span>
                      </div>
                      <p className="text-xs opacity-70 leading-relaxed">
                        Processing 4.2TB of spectral data per hour. Resolution: 250m.
                      </p>
                    </div>
                    <Globe size={120} className="absolute -bottom-10 -right-10 opacity-10" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-stone-900/40 backdrop-blur-md border-t border-stone-800 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <Sprout size={20} className="text-emerald-400" />
            <span className="font-bold text-sm text-stone-300">Bloom Sync &copy; 2026</span>
          </div>
          <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest text-stone-500">
            <a href="#" className="hover:text-emerald-400 transition-colors">NASA EarthData</a>
            <a href="#" className="hover:text-emerald-400 transition-colors">FAO Statistics</a>
            <a href="#" className="hover:text-emerald-400 transition-colors">Climate Watch</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
