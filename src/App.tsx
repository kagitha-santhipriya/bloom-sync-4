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
  VolumeX
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
  Area
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
  const [lang, setLang] = useState<Language>('en');
  const [activeTab, setActiveTab] = useState<'farmer' | 'map' | 'scientist' | 'history'>('farmer');
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([17.3850, 78.4867]);
  
  const t = TRANSLATIONS[lang];

  // Form state
  const [crop, setCrop] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');

  // Fetch submissions on mount
  useEffect(() => {
    fetchSubmissions();
  }, []);

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
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setLoading(true);
      try {
        const details = await extractDetailsFromVoice(transcript);
        if (details.crop) setCrop(details.crop);
        if (details.location) setLocation(details.location);
        if (details.date) setDate(details.date);
      } catch (error) {
        console.error("Voice processing failed", error);
      } finally {
        setLoading(false);
      }
    };

    recognition.start();
  };

  const handleSpeak = async (text?: string) => {
    const textToSpeak = text || analysis?.suggestions;
    if (!textToSpeak || speaking) return;
    
    setSpeaking(true);
    try {
      const base64Audio = await generateSpeech(textToSpeak);
      if (base64Audio) {
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audio.onended = () => setSpeaking(false);
        await audio.play();
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
    
    if (sub.riskLevel === 'high' && sub.fullAnalysis) {
      handleSpeak(`${t.autoVoiceAlert} ${sub.fullAnalysis.suggestions}`);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crop || !location || !date) return;

    setLoading(true);
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
        fetchSubmissions();
      }

      // Auto-trigger voice assistant for high risk
      if (result.riskLevel === 'high') {
        handleSpeak(`${t.autoVoiceAlert} ${result.suggestions}`);
      }
    } catch (error) {
      console.error("Analysis failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-stone-900/40 backdrop-blur-md border-b border-stone-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          </nav>

          <div className="flex items-center gap-3">
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
                    <button
                      onClick={startListening}
                      disabled={listening || loading}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                        listening ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-stone-800/40 text-stone-400 hover:bg-emerald-500/20 hover:text-emerald-400"
                      )}
                    >
                      {listening ? <MicOff size={14} /> : <Mic size={14} />}
                      {listening ? t.listening : t.voiceInput}
                    </button>
                  </div>
                  <form onSubmit={handleAnalyze} className="space-y-4">
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
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-stone-900/40 backdrop-blur-md p-4 rounded-2xl border border-stone-800 shadow-xl">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">{t.riskLevel}</p>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-3 h-3 rounded-full",
                            analysis.riskLevel === 'high' ? "bg-red-500" : analysis.riskLevel === 'medium' ? "bg-yellow-500" : "bg-emerald-500"
                          )} />
                          <span className="text-lg font-bold text-stone-100">{t[analysis.riskLevel]}</span>
                        </div>
                      </div>
                      <div className="bg-stone-900/40 backdrop-blur-md p-4 rounded-2xl border border-stone-800 shadow-xl">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">{t.mismatch}</p>
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={18} className="text-amber-500" />
                          <span className="text-lg font-bold text-stone-100">{analysis.mismatchDays} {t.days}</span>
                        </div>
                      </div>
                      <div className="bg-stone-900/40 backdrop-blur-md p-4 rounded-2xl border border-stone-800 shadow-xl">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">{t.yieldRisk}</p>
                        <div className="flex items-center gap-2">
                          <BarChart3 size={18} className="text-emerald-500" />
                          <span className="text-lg font-bold text-stone-100">{analysis.yieldRiskPercentage}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                      <h3 className="text-sm font-bold mb-6 flex items-center justify-between text-stone-100">
                        <span>{t.mismatch} Analysis (12 Months)</span>
                        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 bg-emerald-500" />
                            <span>Blooming</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 bg-amber-500" />
                            <span>Pollination</span>
                          </div>
                        </div>
                      </h3>
                      <div className="h-[300px] w-full">
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
                              contentStyle={{ backgroundColor: '#1c1917', borderRadius: '12px', border: '1px solid #44403c', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                              itemStyle={{ color: '#e7e5e4' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="activity" 
                              stroke="#10b981" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorBloom)" 
                              name="Blooming"
                            />
                            <Area 
                              data={analysis.pollinationData}
                              type="monotone" 
                              dataKey="activity" 
                              stroke="#f59e0b" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorPollin)" 
                              name="Pollination"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Layered Advisory & Climate Intelligence */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Global Climate Intelligence Layer */}
                      <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-blue-400">
                          <Globe size={20} />
                          {t.climateIntelligence}
                        </h3>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center p-3 bg-blue-900/20 rounded-xl border border-blue-800/30">
                            <span className="text-xs font-semibold text-blue-300">{t.tempAnomaly}</span>
                            <span className="font-bold text-blue-100">+{analysis.climateIntelligence.temperatureAnomaly}°C</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-cyan-900/20 rounded-xl border border-cyan-800/30">
                            <span className="text-xs font-semibold text-cyan-300">{t.rainfallAnomaly}</span>
                            <span className="font-bold text-cyan-100">{analysis.climateIntelligence.rainfallAnomaly}%</span>
                          </div>
                          <div className="p-3 bg-stone-950/40 rounded-xl border border-stone-800/50">
                            <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">{t.ndviTrend}</p>
                            <p className="text-sm font-medium text-stone-200">{analysis.climateIntelligence.ndviTrend}</p>
                          </div>
                          <div className="p-3 bg-stone-950/40 rounded-xl border border-stone-800/50">
                            <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">{t.climateSignal}</p>
                            <p className="text-sm font-medium text-stone-200">{analysis.climateIntelligence.globalClimateSignal}</p>
                          </div>
                        </div>
                      </div>

                      {/* Local Farmer Advisory Layer */}
                      <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-emerald-400">
                          <Sprout size={20} />
                          {t.farmerAdvisory}
                        </h3>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center p-3 bg-emerald-900/20 rounded-xl border border-emerald-800/30">
                            <span className="text-xs font-semibold text-emerald-300">{t.riskScore}</span>
                            <span className="font-bold text-emerald-100">{analysis.farmerAdvisory.riskScore}/100</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-amber-900/20 rounded-xl border border-amber-800/30">
                            <span className="text-xs font-semibold text-amber-300">{t.yieldImpact}</span>
                            <span className="font-bold text-amber-100">-{analysis.farmerAdvisory.yieldImpactPercentage}%</span>
                          </div>
                          <div className="p-3 bg-stone-950/40 rounded-xl border border-stone-800/50">
                            <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">{t.stageRecommendations}</p>
                            <p className="text-sm font-medium text-stone-200">{analysis.farmerAdvisory.stageRecommendations}</p>
                          </div>
                          <div className="p-3 bg-stone-950/40 rounded-xl border border-stone-800/50">
                            <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">{t.actionableSteps}</p>
                            <ul className="list-disc list-inside text-sm space-y-1 mt-1 text-stone-300">
                              {analysis.farmerAdvisory.actionableSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Suggestions & Climate */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold flex items-center gap-2 text-emerald-400">
                            <CheckCircle2 size={20} />
                            {t.suggestions}
                          </h3>
                          <button 
                            onClick={() => handleSpeak()}
                            disabled={speaking}
                            className={cn(
                              "p-2 rounded-full transition-all",
                              speaking ? "bg-emerald-500/20 text-emerald-400 animate-pulse" : "bg-stone-800/40 text-stone-400 hover:bg-emerald-500/20 hover:text-emerald-400"
                            )}
                            title="Listen to suggestions"
                          >
                            {speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
                          </button>
                        </div>
                        <div className="text-sm text-stone-300 leading-relaxed whitespace-pre-line">
                          {analysis.suggestions}
                        </div>
                      </div>
                      <div className="bg-stone-900/40 backdrop-blur-md p-6 rounded-2xl border border-stone-800 shadow-xl">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-blue-400">
                          <Wind size={20} />
                          {t.climaticConditions}
                        </h3>
                        <div className="text-sm text-stone-300 leading-relaxed">
                          {analysis.climaticConditions}
                        </div>
                        <div className="mt-6 grid grid-cols-3 gap-2">
                          <div className="p-3 bg-blue-900/20 rounded-xl text-center border border-blue-800/30">
                            <ThermometerSun size={16} className="mx-auto mb-1 text-blue-400" />
                            <p className="text-[10px] font-bold text-blue-300">TEMP</p>
                            <p className="text-xs font-bold text-stone-100">28°C</p>
                          </div>
                          <div className="p-3 bg-cyan-900/20 rounded-xl text-center border border-cyan-800/30">
                            <Droplets size={16} className="mx-auto mb-1 text-cyan-400" />
                            <p className="text-[10px] font-bold text-cyan-300">HUMID</p>
                            <p className="text-xs font-bold text-stone-100">65%</p>
                          </div>
                          <div className="p-3 bg-stone-950/40 rounded-xl text-center border border-stone-800/50">
                            <Wind size={16} className="mx-auto mb-1 text-stone-400" />
                            <p className="text-[10px] font-bold text-stone-500">WIND</p>
                            <p className="text-xs font-bold text-stone-100">12km/h</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
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
                  {submissions.map((sub) => (
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
