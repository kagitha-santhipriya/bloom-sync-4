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
  const [activeTab, setActiveTab] = useState<'farmer' | 'map' | 'scientist'>('farmer');
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([17.3850, 78.4867]);
  
  const t = TRANSLATIONS[lang];

  // Form state
  const [crop, setCrop] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');

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

  const handleSpeak = async () => {
    if (!analysis || speaking) return;
    
    const textToSpeak = analysis.suggestions;
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

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crop || !location || !date) return;

    setLoading(true);
    try {
      const result = await analyzeCropMismatch(crop, location, date, lang);
      setAnalysis(result);
      setMapCenter([result.lat, result.lng]);
      
      // Add to submissions for the map
      const newSubmission: Submission = {
        id: Math.random().toString(36).substr(2, 9),
        crop,
        location,
        lat: result.lat,
        lng: result.lng,
        date,
        riskLevel: result.riskLevel,
        climaticConditions: result.climaticConditions,
        timestamp: Date.now()
      };
      setSubmissions(prev => [newSubmission, ...prev]);
    } catch (error) {
      console.error("Analysis failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Sprout size={24} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-stone-900">{t.title}</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-emerald-600 leading-none">{t.subtitle}</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('farmer')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'farmer' ? "bg-white text-emerald-700 shadow-sm" : "text-stone-500 hover:text-stone-900"
              )}
            >
              {t.farmerPortal}
            </button>
            <button 
              onClick={() => setActiveTab('map')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'map' ? "bg-white text-emerald-700 shadow-sm" : "text-stone-500 hover:text-stone-900"
              )}
            >
              {t.mapPortal}
            </button>
            <button 
              onClick={() => setActiveTab('scientist')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                activeTab === 'scientist' ? "bg-white text-emerald-700 shadow-sm" : "text-stone-500 hover:text-stone-900"
              )}
            >
              {t.nasaScientistView}
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <select 
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
              className="bg-stone-50 border border-stone-200 rounded-full px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.name}</option>
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
                <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Search size={20} className="text-emerald-600" />
                      {t.farmerPortal}
                    </h2>
                    <button
                      onClick={startListening}
                      disabled={listening || loading}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                        listening ? "bg-red-100 text-red-600 animate-pulse" : "bg-stone-100 text-stone-600 hover:bg-emerald-100 hover:text-emerald-600"
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
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">{t.location}</label>
                      <div className="relative">
                        <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input 
                          type="text" 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Hyderabad, Telangana"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">{t.date}</label>
                      <div className="relative">
                        <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input 
                          type="date" 
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                          required
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center justify-center gap-2"
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
                <div className="bg-emerald-900 text-emerald-50 p-6 rounded-2xl shadow-xl">
                  <h3 className="font-bold mb-2 flex items-center gap-2">
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
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border-2 border-dashed border-stone-200">
                    <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mb-4">
                      <Globe size={40} className="text-stone-300" />
                    </div>
                    <h3 className="text-xl font-bold text-stone-400">Ready for Analysis</h3>
                    <p className="text-stone-400 max-w-xs mt-2">Enter your crop and location details to see the pollination mismatch analysis.</p>
                  </div>
                )}

                {loading && (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-stone-200">
                    <Loader2 size={48} className="text-emerald-600 animate-spin mb-4" />
                    <h3 className="text-xl font-bold text-stone-900">{t.analyzing}</h3>
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
                      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">{t.riskLevel}</p>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-3 h-3 rounded-full",
                            analysis.riskLevel === 'high' ? "bg-red-500" : analysis.riskLevel === 'medium' ? "bg-yellow-500" : "bg-emerald-500"
                          )} />
                          <span className="text-lg font-bold">{t[analysis.riskLevel]}</span>
                        </div>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">{t.mismatch}</p>
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={18} className="text-amber-500" />
                          <span className="text-lg font-bold">{analysis.mismatchDays} {t.days}</span>
                        </div>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">{t.yieldRisk}</p>
                        <div className="flex items-center gap-2">
                          <BarChart3 size={18} className="text-emerald-600" />
                          <span className="text-lg font-bold">{analysis.yieldRiskPercentage}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                      <h3 className="text-sm font-bold mb-6 flex items-center justify-between">
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
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorPollin" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a8a29e' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a8a29e' }} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
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

                    {/* Suggestions & Climate */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold flex items-center gap-2 text-emerald-700">
                            <CheckCircle2 size={20} />
                            {t.suggestions}
                          </h3>
                          <button 
                            onClick={handleSpeak}
                            disabled={speaking}
                            className={cn(
                              "p-2 rounded-full transition-all",
                              speaking ? "bg-emerald-100 text-emerald-600 animate-pulse" : "bg-stone-100 text-stone-600 hover:bg-emerald-100 hover:text-emerald-600"
                            )}
                            title="Listen to suggestions"
                          >
                            {speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
                          </button>
                        </div>
                        <div className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
                          {analysis.suggestions}
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-blue-700">
                          <Wind size={20} />
                          {t.climaticConditions}
                        </h3>
                        <div className="text-sm text-stone-600 leading-relaxed">
                          {analysis.climaticConditions}
                        </div>
                        <div className="mt-6 grid grid-cols-3 gap-2">
                          <div className="p-3 bg-blue-50 rounded-xl text-center">
                            <ThermometerSun size={16} className="mx-auto mb-1 text-blue-600" />
                            <p className="text-[10px] font-bold text-blue-800">TEMP</p>
                            <p className="text-xs font-bold">28°C</p>
                          </div>
                          <div className="p-3 bg-cyan-50 rounded-xl text-center">
                            <Droplets size={16} className="mx-auto mb-1 text-cyan-600" />
                            <p className="text-[10px] font-bold text-cyan-800">HUMID</p>
                            <p className="text-xs font-bold">65%</p>
                          </div>
                          <div className="p-3 bg-stone-50 rounded-xl text-center">
                            <Wind size={16} className="mx-auto mb-1 text-stone-600" />
                            <p className="text-[10px] font-bold text-stone-800">WIND</p>
                            <p className="text-xs font-bold">12km/h</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
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
                  <h2 className="text-2xl font-bold text-stone-900">{t.mapPortal}</h2>
                  <p className="text-stone-500 text-sm">Real-time global monitoring of pollination risk zones.</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-stone-200 shadow-sm">
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-xs font-medium">{t.redZone}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span className="text-xs font-medium">{t.yellowZone}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium">{t.greenZone}</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden relative">
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
                          <div className="p-1">
                            <h4 className="font-bold text-emerald-700">{sub.crop}</h4>
                            <p className="text-xs text-stone-500">{sub.location}</p>
                            <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between gap-4">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                sub.riskLevel === 'high' ? "bg-red-100 text-red-700" : sub.riskLevel === 'medium' ? "bg-yellow-100 text-yellow-700" : "bg-emerald-100 text-emerald-700"
                              )}>
                                {t[sub.riskLevel]} Risk
                              </span>
                              <span className="text-[10px] text-stone-400">{new Date(sub.timestamp).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                      <Circle 
                        center={[sub.lat, sub.lng]}
                        radius={50000}
                        pathOptions={{
                          fillColor: sub.riskLevel === 'high' ? '#ef4444' : sub.riskLevel === 'medium' ? '#f59e0b' : '#10b981',
                          color: 'transparent',
                          fillOpacity: 0.2
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
                  <h2 className="text-2xl font-bold text-stone-900">{t.nasaScientistView}</h2>
                  <p className="text-stone-500 text-sm">Advanced satellite data correlation and global trend analysis.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">
                    <Globe size={14} />
                    LIVE SATELLITE FEED
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                  <h3 className="font-bold mb-6 flex items-center gap-2">
                    <BarChart3 size={20} className="text-emerald-600" />
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                        <XAxis dataKey="year" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="mismatch" stroke="#10b981" strokeWidth={3} name="Avg Mismatch (Days)" />
                        <Line type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={3} name="Global Temp Anomaly (°C)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                    <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-stone-400">Critical Regions</h3>
                    <div className="space-y-4">
                      {[
                        { region: 'South Asia', risk: 'High', trend: 'Increasing' },
                        { region: 'Sub-Saharan Africa', risk: 'High', trend: 'Stable' },
                        { region: 'Mediterranean', risk: 'Medium', trend: 'Increasing' },
                        { region: 'Central America', risk: 'High', trend: 'Increasing' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                          <div>
                            <p className="font-bold text-sm">{item.region}</p>
                            <p className="text-[10px] text-stone-500 uppercase tracking-tighter">{item.trend}</p>
                          </div>
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold",
                            item.risk === 'High' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                          )}>
                            {item.risk}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-emerald-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                      <h3 className="font-bold mb-2">Satellite Status</h3>
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
      <footer className="bg-white border-t border-stone-200 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <Sprout size={20} />
            <span className="font-bold text-sm">Bloom Sync &copy; 2026</span>
          </div>
          <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest text-stone-400">
            <a href="#" className="hover:text-emerald-600 transition-colors">NASA EarthData</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">FAO Statistics</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Climate Watch</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
