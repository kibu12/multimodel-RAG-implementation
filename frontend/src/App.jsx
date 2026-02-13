import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Image as ImageIcon, PenTool, Type, Loader2, UploadCloud, X, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Mic, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SketchPad } from './components/SketchPad';
import { VoiceModal } from './components/VoiceModal';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// --- Utils ---
const resizeImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 1024;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        if (!width || !height || width <= 0 || height <= 0) {
          console.error("Invalid image dimensions:", width, height);
          resolve(file); // Return original if resize fails
          return;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) resolve(file);
          else resolve(blob);
        }, 'image/jpeg', 0.8); // 80% quality
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// --- Components ---

const LoadingScreen = () => (
  <motion.div
    initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}
    className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center"
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="flex flex-col items-center"
    >
      <div className="w-20 h-20 border-2 border-amber-600 rounded-full flex items-center justify-center mb-6 relative">
        <div className="absolute inset-2 border border-amber-200 rounded-full animate-spin-slow"></div>
        <span className="font-serif text-3xl text-amber-600 font-bold">J</span>
      </div>
      <h1 className="text-3xl font-serif tracking-widest text-neutral-900 mb-2">JEWELLERY<span className="text-amber-600">Finder</span></h1>
      <p className="text-neutral-500 font-body-serif italic tracking-wide">Search and Find...</p>
    </motion.div>
  </motion.div>
);

const SearchLoader = () => (
  <div className="flex flex-col items-center justify-center py-32 relative">
    {/* Visual Echo Radar Pulse */}
    <div className="relative w-48 h-48 flex items-center justify-center mb-8">
      <div className="absolute inset-0 border border-amber-500/20 rounded-full animate-[ping_3s_linear_infinite]"></div>
      <div className="absolute inset-12 border border-amber-500/40 rounded-full animate-[ping_3s_linear_infinite_1s]"></div>
      <div className="absolute inset-20 bg-amber-100/10 backdrop-blur-sm rounded-full animate-pulse border border-amber-200/50"></div>
      <span className="font-serif text-3xl text-amber-600 animate-pulse">J</span>
    </div>

    <h3 className="font-serif text-2xl text-neutral-800 tracking-[0.2em] mb-3 animate-pulse">Searching</h3>
    <p className="text-amber-800/60 font-sans text-xs tracking-[0.3em] uppercase">Analyzing your favorites...</p>
  </div>
);

// --- Error Boundary ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI Crash:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-50 text-neutral-900">
          <h2 className="text-3xl font-serif text-amber-700 mb-4">Something went wrong.</h2>
          <p className="mb-4">The application encountered a display error.</p>
          <div className="bg-white p-6 rounded-lg shadow-lg border border-red-100 max-w-2xl w-full text-left">
            <p className="font-bold text-red-600 font-mono text-sm mb-2">{this.state.error && this.state.error.toString()}</p>
            <pre className="text-xs text-neutral-500 overflow-auto max-h-40">{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
          </div>
          <button onClick={() => window.location.reload()} className="mt-8 px-6 py-3 bg-neutral-900 text-white rounded-full text-xs font-bold tracking-widest uppercase">
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('text');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [refinedQuery, setRefinedQuery] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [similarSourceItem, setSimilarSourceItem] = useState(null);
  const [error, setError] = useState(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [ocrMode, setOcrMode] = useState('standard'); // 'standard' or 'llm'
  const [theme, setTheme] = useState('light'); // 'light' | 'dark'

  // Initialize theme from system or local storage if needed (simplified here)
  // Initialize theme from system or local storage if needed (simplified here)
  useEffect(() => {
    // Default to light theme as requested
    // if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    //   setTheme('dark');
    // }
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    // Simulate initial "App Loading" phase for branding
    const timer = setTimeout(() => setInitialLoad(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const search = async (endpoint, formData) => {
    setLoading(true);
    setSearched(true);
    setResults([]);
    setRefinedQuery(null); // Reset refined query
    setError(null);
    try {
      console.log(`📡 Sending request to ${endpoint}...`);
      const res = await axios.post(`${API_BASE}${endpoint}`, formData, {
        headers: formData instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
        timeout: 300000 // 5 minutes timeout prevent premature disconnects
      });

      console.log("✅ RAW RESPONSE:", res);

      if (!res || !res.data) {
        throw new Error("Empty response from server");
      }

      if (endpoint === '/ocr/read') {
        const data = res.data;
        if (!data) throw new Error("No OCR data received");
        setOcrResult({
          raw: data.raw_text || "",
          cleaned: data.cleaned_query || "",
          category: data.detected_category || "Unknown"
        });
        setShowOcrModal(true);
        setLoading(false);
      } else if (endpoint === '/search/text') {
        const data = res.data;
        console.log("🔍 Text Search Data:", data);

        setTimeout(() => {
          // Safety check for results array
          const safeResults = Array.isArray(data.results) ? data.results : [];
          console.log(`📊 Processing ${safeResults.length} results`);

          setResults(safeResults);

          if (data.refined_query && typeof data.refined_query === 'string' && data.refined_query.trim() !== "") {
            if (data.refined_query.toLowerCase().trim() !== query.toLowerCase().trim()) {
              setRefinedQuery(data.refined_query);
              setQuery(data.refined_query);
            }
          }
        }, 500);
      } else {
        // Image/Sketch search
        setTimeout(() => {
          const data = res.data;
          // Ensure it is an array
          const safeResults = Array.isArray(data) ? data : (data.results ? data.results : []);
          console.log(`🎨 Visual Search: ${safeResults.length} results`);
          setResults(Array.isArray(safeResults) ? safeResults : []);
        }, 500);
      }
    } catch (err) {
      console.error("❌ SEARCH ERROR:", err);
      let msg = "Search failed. ";

      if (err.code === 'ECONNABORTED') msg += "Request timed out (Server is busy loading models).";
      else if (err.response) {
        msg += `Server Error: ${err.response.status}`;
        if (err.response.data && err.response.data.detail) {
          msg += ` - ${err.response.data.detail}`;
        }
      } else {
        msg += err.message || "Unknown error";
      }

      setError(msg);
      setSearched(false); // Revert to initial state on error
      setLoading(false);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const handleTextSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    search('/search/text', { query });
    setPreviewUrl(null);
    setSimilarSourceItem(null);
  };

  const handleFileUpload = async (e, endpoint, extraData = {}) => {
    const file = e.target.files[0];
    if (!file) return;

    // Create preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSimilarSourceItem(null); // Clear similar search state on new upload

    // Resize image client-side to prevent backend OOM/Timeouts
    const resizedBlob = await resizeImage(file);

    const fd = new FormData();
    fd.append('file', resizedBlob, file.name);

    // Append extra data (like ocr_mode)
    Object.entries(extraData).forEach(([key, value]) => {
      fd.append(key, value);
    });

    search(endpoint, fd);
  };

  const handleSketchSearch = async (blob) => {
    try {
      if (!blob) {
        alert("Please draw something first!");
        return;
      }
      // Resize sketch blob to prevent network errors
      const resizedBlob = await resizeImage(blob);

      const fd = new FormData();
      fd.append('file', resizedBlob, 'sketch.jpg');
      search('/search/sketch', fd);
    } catch (error) {
      console.error("Sketch processing failed:", error);
      alert("Failed to process sketch. Please try again.");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e, endpoint) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const fakeEvent = { target: { files: [file] } };
      handleFileUpload(fakeEvent, endpoint);
    }
  };

  const handleFindSimilar = async () => {
    if (!selectedItem) return;

    try {
      setLoading(true);
      setSelectedItem(null);

      // Force no-cache to avoid browser using cached no-cors response
      const response = await fetch(selectedItem.image_path, { mode: 'cors', cache: 'no-cache' });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      // Create a file from the blob
      const file = new File([blob], "similar_search.jpg", { type: blob.type });

      // Trigger existing file upload logic for visual search
      const fakeEvent = { target: { files: [file] } };
      await handleFileUpload(fakeEvent, '/search/image');

      // Set the similar search item for UI feedback
      setSimilarSourceItem(selectedItem);

    } catch (error) {
      console.error("Error fetching image for similar search:", error);
      alert(`Visual search failed: ${error.message}`);
      setLoading(false);
    }
  };

  const handleVoiceResult = (text) => {
    setQuery(text);
    search('/search/text', { query: text });
  };

  const handleNext = (e) => {
    e?.stopPropagation();
    if (!selectedItem || results.length <= 1) return;
    const currentIndex = results.findIndex(r => r.id === selectedItem.id);
    const nextIndex = (currentIndex + 1) % results.length;
    setSelectedItem(results[nextIndex]);
  };

  const handlePrev = (e) => {
    e?.stopPropagation();
    if (!selectedItem || results.length <= 1) return;
    const currentIndex = results.findIndex(r => r.id === selectedItem.id);
    const prevIndex = (currentIndex - 1 + results.length) % results.length;
    setSelectedItem(results[prevIndex]);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedItem) return;
      if (e.key === 'ArrowRight') handleNext(e);
      if (e.key === 'ArrowLeft') handlePrev(e);
      if (e.key === 'Escape') setSelectedItem(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, results]);

  return (
    <ErrorBoundary>
      <AnimatePresence>
        {initialLoad && <LoadingScreen />}
      </AnimatePresence>

      <VoiceModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSearch={handleVoiceResult}
      />

      <div className={`min-h-screen transition-colors duration-500 selection:bg-amber-100 ${theme === 'dark' ? 'bg-neutral-950 text-white' : 'bg-[#FAFAF9] text-neutral-900'} ${theme}`}>

        {/* Navbar */}
        <nav className={`fixed top-0 inset-x-0 z-50 h-24 transition-all duration-500 ${theme === 'dark' ? 'dark:bg-neutral-900/80 dark:border-b dark:border-neutral-800' : ''}`}>
          <div className={`absolute inset-0 ${theme === 'dark' ? 'bg-neutral-900/80 backdrop-blur-md' : 'glass-panel'}`}></div>
          <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4 cursor-pointer group" onClick={() => { setSearched(false); setResults([]); setPreviewUrl(null); setRefinedQuery(null); setSimilarSourceItem(null); setError(null); }}>
              <div className={`w-12 h-12 border ${theme === 'dark' ? 'border-amber-500/20 bg-neutral-800/50' : 'border-amber-600/30 bg-white/50'} backdrop-blur-md rounded-full flex items-center justify-center relative overflow-hidden group-hover:shadow-[0_0_20px_rgba(180,136,17,0.3)] transition-all duration-500`}>
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-100/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <span className="font-serif text-amber-600 font-bold text-xl relative z-10 group-hover:scale-110 transition-transform duration-500">J</span>
              </div>
              <div className="flex flex-col">
                <h1 className={`text-xl font-serif tracking-[0.2em] font-semibold ${theme === 'dark' ? 'text-white' : 'text-neutral-800'} group-hover:text-amber-500 transition-colors`}>JEWELLERY<span className="text-gold">Finder</span></h1>
                <span className="text-[9px] font-sans tracking-[0.3em] text-neutral-400 uppercase group-hover:text-amber-600/70 transition-colors">Search & Find</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'text-amber-500 hover:bg-neutral-800' : 'text-neutral-400 hover:text-amber-600 hover:bg-amber-50'}`}
                title="Toggle Theme"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              <div className="hidden md:flex gap-10 font-serif text-xs tracking-[0.2em] text-neutral-500">
                {['text', 'image', 'ocr', 'sketch'].map((tab) => (
                  <button
                    key={tab}
                    className={`relative py-2 group hover:text-amber-800 transition-colors uppercase ${activeTab === tab ? 'text-amber-700 font-bold' : ''} ${theme === 'dark' && activeTab !== tab ? 'text-neutral-400 hover:text-amber-500' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'ocr' ? 'Scan' : tab === 'sketch' ? 'Sketch' : tab === 'text' ? 'Collection' : 'Visual Match'}
                    <span className={`absolute bottom-0 left-0 w-full h-px bg-amber-400 transform origin-left transition-transform duration-300 ${activeTab === tab ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>

        <main className={`pt-28 pb-10 px-6 max-w-7xl mx-auto min-h-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-neutral-950' : ''}`}>

          {/* Search Hero */}
          {!searched && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
              className="text-center py-8 md:py-12 max-w-4xl mx-auto relative"
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber-100/20 blur-[100px] rounded-full hero-ambient pointer-events-none"></div>

              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                className="relative font-serif text-amber-600/80 tracking-[0.4em] text-[10px] uppercase mb-6 block"
              >
                The AI for finding your perfects
              </motion.span>

              <h2 className={`relative text-5xl md:text-7xl font-serif mb-8 leading-tight ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>
                Find Your Perfect Piece <br />
                <span className="font-body-serif italic text-gold relative inline-block">
                  Jewellery
                  <svg className="absolute -bottom-2 w-full h-2 text-amber-300/40" viewBox="0 0 100 10" preserveAspectRatio="none">
                    <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                </span>
              </h2>

              <p className={`relative font-body-serif text-xl mb-8 max-w-2xl mx-auto leading-relaxed ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>
                "We use smart technology to find beautiful jewelry that matches your style."
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-6 mx-auto max-w-lg bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center gap-3 shadow-sm"
                >
                  <div className="bg-red-100 p-2 rounded-full">
                    <X size={16} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-xs uppercase tracking-wider mb-1">Connection Error</p>
                    <p className="text-sm">{error}</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Input Zones: The Command Center */}
          <div className="max-w-5xl mx-auto mb-32 relative z-20">

            <div className={`${theme === 'dark' ? 'bg-neutral-900/50 border-white/10' : 'bg-white/80 border-white/50'} backdrop-blur-xl p-1 rounded-[2.5rem] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.1)] border relative overflow-hidden transition-all duration-500 hover:shadow-[0_40px_100px_-20px_rgba(180,136,17,0.05)]`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-400/20 to-transparent opacity-30"></div>

              {/* Mobile Tab Helper (Hidden on MD) */}
              <div className="md:hidden flex justify-center mb-6 pt-4 gap-2 overflow-x-auto">
                {['text', 'image', 'ocr', 'sketch'].map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${activeTab === t ? 'bg-neutral-900 text-white shadow-lg' : 'bg-neutral-100 text-neutral-500'}`}>
                    {t}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'text' && (
                  <motion.form
                    key="text"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}
                    onSubmit={handleTextSearch}
                    className="flex flex-col md:flex-row items-center p-3 gap-2"
                  >
                    <div className={`flex-1 flex items-center ${theme === 'dark' ? 'bg-neutral-800/80 border-neutral-700' : 'bg-neutral-50/50 border-neutral-200/60'} rounded-full border focus-within:border-amber-400/50 ${theme === 'dark' ? 'focus-within:bg-neutral-900' : 'focus-within:bg-white'} focus-within:shadow-[0_0_0_4px_rgba(251,191,36,0.1)] transition-all duration-300 h-16 px-6 relative group`}>
                      <Search className="text-neutral-400 group-focus-within:text-amber-500 transition-colors" size={22} />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Describe your style (e.g. 'Art Deco emerald ring')..."
                        className={`flex-1 h-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-lg font-body-serif italic ${theme === 'dark' ? 'text-white placeholder:text-neutral-600' : 'text-neutral-800 placeholder:text-neutral-400'} px-4 w-full`}
                      />
                      <button
                        type="button"
                        onClick={() => setIsVoiceModalOpen(true)}
                        className={`p-2 text-neutral-400 hover:text-amber-600 transition-colors rounded-full ${theme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-amber-50'}`}
                        title="Voice Search"
                      >
                        <Mic size={20} />
                      </button>
                    </div>
                    <button type="submit" className="h-16 px-10 rounded-full font-serif tracking-[0.2em] text-xs font-bold text-amber-900 border border-amber-200 bg-gradient-to-br from-amber-50 to-white hover:border-amber-400 hover:shadow-[0_10px_30px_-10px_rgba(180,136,17,0.2)] transition-all duration-300 w-full md:w-auto flex items-center justify-center gap-2 group">
                      <span>EXPLORE</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform text-amber-600" />
                    </button>
                  </motion.form>
                )}

                {activeTab === 'image' && (
                  <motion.div
                    key="image"
                    initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                    className={`p-12 border-2 border-dashed ${theme === 'dark' ? 'border-neutral-700 hover:bg-neutral-800/50' : 'border-neutral-200/60 hover:bg-amber-50/10'} rounded-[2rem] hover:border-amber-300/50 transition-all duration-500 text-center relative cursor-pointer group`}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, '/search/image')}
                  >
                    <input type="file" onChange={(e) => handleFileUpload(e, '/search/image')} className="absolute inset-0 opacity-0 cursor-pointer z-20" accept="image/*" />
                    {previewUrl ? (
                      <div className="relative h-64 w-full rounded-xl overflow-hidden shadow-inner bg-neutral-100 flex items-center justify-center group-hover:shadow-md transition-all">
                        <img src={previewUrl} className="h-full w-full object-contain" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                          <p className="text-white font-serif tracking-widest uppercase text-xs border border-white/30 px-6 py-3 rounded-full">Replace Image</p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8">
                        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                          <ImageIcon className="text-amber-500/50" size={32} />
                        </div>
                        <h4 className="font-serif text-xl text-neutral-800 mb-2">Visual Match</h4>
                        <p className="text-neutral-400 font-sans text-xs tracking-widest uppercase">Upload or Drag Reference Image</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'sketch' && (
                  <motion.div key="sketch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4">
                    <div className="flex justify-between items-center mb-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                          <PenTool size={14} className="text-amber-700" />
                        </div>
                        <h3 className="font-serif text-lg text-neutral-700 tracking-wide">Sketch Search</h3>
                      </div>
                      <div className="relative overflow-hidden group/btn">
                        <input type="file" onChange={(e) => handleFileUpload(e, '/search/sketch')} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept="image/*" />
                        <button className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-neutral-500 group-hover/btn:text-amber-700 uppercase transition-colors">
                          <UploadCloud size={14} /> Upload Sketch
                        </button>
                      </div>
                    </div>
                    {previewUrl ? (
                      <div className="h-[400px] w-full bg-neutral-50 rounded-2xl overflow-hidden relative border border-neutral-100 shadow-inner">
                        <img src={previewUrl} alt="Sketch Preview" className="w-full h-full object-contain" />
                        <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-lg hover:bg-neutral-100 text-neutral-400 z-20"><X size={18} /></button>
                      </div>
                    ) : (
                      <div className="border border-neutral-100 rounded-2xl overflow-hidden shadow-sm">
                        <SketchPad onSearch={handleSketchSearch} />
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'ocr' && (
                  <motion.div
                    key="ocr"
                    initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                    className="flex flex-col gap-6"
                  >
                    {/* OCR Mode Toggle */}
                    <div className="flex justify-center">
                      <div className={`${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100/80'} p-1 rounded-full flex relative`}>
                        <motion.div
                          className={`absolute top-1 bottom-1 ${theme === 'dark' ? 'bg-neutral-700 shadow-md' : 'bg-white shadow-sm'} rounded-full w-[140px]`}
                          animate={{ x: ocrMode === 'standard' ? 0 : 140 }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                        <button
                          onClick={() => setOcrMode('standard')}
                          className={`relative z-10 w-[140px] py-2 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors ${ocrMode === 'standard' ? 'text-amber-600' : 'text-neutral-400'}`}
                        >
                          Standard OCR
                        </button>
                        <button
                          onClick={() => setOcrMode('llm')}
                          className={`relative z-10 w-[140px] py-2 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors ${ocrMode === 'llm' ? 'text-amber-600' : 'text-neutral-400'}`}
                        >
                          AI Vision (LLM)
                        </button>
                      </div>
                    </div>

                    <div
                      className={`p-12 border-2 border-dashed ${theme === 'dark' ? 'border-neutral-700 hover:bg-neutral-800/50 bg-neutral-800/20' : 'border-neutral-200/60 hover:bg-amber-50/10 bg-white/40'} rounded-[2rem] hover:border-amber-300/50 transition-all duration-500 text-center relative cursor-pointer group`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, '/ocr/read')}
                    >
                      <input type="file" onChange={(e) => handleFileUpload(e, '/ocr/read', { mode: ocrMode })} className="absolute inset-0 opacity-0 cursor-pointer z-20" accept="image/*" />
                      {previewUrl ? (
                        <div className="relative h-64 w-full rounded-xl overflow-hidden shadow-inner bg-neutral-100 flex items-center justify-center group-hover:shadow-md transition-all">
                          <img src={previewUrl} className="h-full w-full object-contain" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                            <p className="text-white font-serif tracking-widest uppercase text-xs border border-white/30 px-6 py-3 rounded-full">Replace Image</p>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8">
                          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500 ${ocrMode === 'llm' ? 'bg-indigo-50 text-indigo-500/50' : 'bg-amber-50 text-amber-500/50'}`}>
                            {ocrMode === 'llm' ? (
                              <Search size={32} />
                            ) : (
                              <Type size={32} />
                            )}
                          </div>
                          <h4 className="font-serif text-xl text-neutral-800 mb-2">
                            {ocrMode === 'llm' ? 'Intelligent Analysis' : 'Scan & Interpret'}
                          </h4>
                          <p className="text-neutral-400 font-sans text-xs tracking-widest uppercase">
                            {ocrMode === 'llm' ? 'Upload Image for Deep Understanding' : 'Upload Handwritten Notes or Tags'}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Hint Text for Text Mode */}
            <AnimatePresence>
              {activeTab === 'text' && (
                <motion.div
                  key="hints"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-center mt-6 flex justify-center gap-6 text-[10px] font-sans font-bold tracking-[0.1em] text-neutral-400 uppercase"
                >
                  <button onClick={() => setQuery("Vintage gold ring with emerald")} className="hover:text-amber-600 transition-colors">Start with: "Vintage gold ring"</button>
                  <span className="text-neutral-300">•</span>
                  <button onClick={() => setQuery("Diamond necklace heart shape")} className="hover:text-amber-600 transition-colors">Try: "Heart Diamond Necklace"</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Results Section */}
          {loading ? (
            <SearchLoader />
          ) : searched && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 pb-20 relative">

              {/* Scroll Indicator / Divider */}
              {/* Scroll Indicator / Divider REMOVED */}

              <div className="flex flex-col items-center justify-center gap-6">
                {similarSourceItem ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="relative mb-10 cursor-pointer group"
                    onClick={() => setSelectedItem(similarSourceItem)}
                  >
                    <div className="absolute inset-0 bg-amber-200/20 blur-3xl rounded-full transition-opacity group-hover:bg-amber-300/30"></div>
                    <div className="relative bg-white/40 backdrop-blur-md border border-white/60 p-1 rounded-full shadow-2xl flex items-center pr-8 gap-6 transition-transform group-hover:scale-105">
                      <div className="relative">
                        <div className="absolute inset-0 border border-amber-400 rounded-full animate-ping opacity-20"></div>
                        <div className="w-16 h-16 rounded-full p-1 bg-white border border-amber-100 shadow-inner overflow-hidden">
                          <img src={similarSourceItem.image_path} alt="Source" className="w-full h-full rounded-full object-cover" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-neutral-900 text-white p-1.5 rounded-full border-2 border-white shadow-sm group-hover:bg-amber-600 transition-colors">
                          <Search size={10} />
                        </div>
                      </div>

                      <div className="flex flex-col text-left py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-800">Visual Match</span>
                        </div>
                        <span className="font-serif italic text-2xl text-neutral-800 group-hover:text-amber-900 transition-colors">"Similar to your findings"</span>
                      </div>
                    </div>
                  </motion.div>
                ) : refinedQuery && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-200 px-6 py-2 rounded-full flex items-center gap-2 mb-4"
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-600">AI Refined Search</span>
                    <span className="text-neutral-900 font-serif italic text-lg">"{refinedQuery}"</span>
                  </motion.div>
                )}
                <div className="flex items-center gap-6">
                  <div className="h-px bg-neutral-200 w-32"></div>
                  <span className="font-serif text-sm tracking-[0.2em] text-neutral-400 uppercase">Your Search Results</span>
                  <div className="h-px bg-neutral-200 w-32"></div>
                </div>
              </div>

              {/* Debug Log (Visible in Console) - Safe Rendering Check */}
              {(() => {
                console.log("🎨 Rendering Results Grid:", results);
                return null;
              })()}

              {results.length === 0 && (
                <div className="text-center py-20 font-serif text-neutral-400">
                  No pieces found matching your criteria.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 gap-y-16">
                {results.map((item, i) => {
                  if (!item) return null;
                  // Ensure valid ID for key
                  const itemKey = item.id || `item-${i}`;

                  return (
                    <motion.div
                      key={itemKey}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedItem(item)}
                      className="group cursor-pointer"
                    >
                      <div className="aspect-[3/4] overflow-hidden bg-white mb-4 relative shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] border border-neutral-100 group-hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] transition-all duration-500 rounded-lg">
                        <div className="w-full h-full p-8 flex items-center justify-center">
                          <img
                            src={item.image_path}
                            alt={item.caption || "Jewellery Item"}
                            className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-110"
                            onError={(e) => {
                              console.warn("Image load failed:", item.image_path);
                              e.target.style.display = 'none'; // Hide broken image but don't crash
                              e.target.parentElement.innerHTML = '<div class="text-xs text-neutral-300">Image N/A</div>';
                            }}
                          />
                        </div>

                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all duration-500 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 bg-white/95 backdrop-blur rounded-full flex items-center justify-center opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 delay-75 shadow-lg">
                            <ArrowRight size={20} className="text-neutral-900" />
                          </div>
                        </div>

                        {/* Floating Match Badge */}
                        {item.score && (
                          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-md shadow-sm border border-neutral-100">
                            <span className="font-sans text-[9px] font-bold text-neutral-900 tracking-widest block">
                              {(item.score * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="text-center px-2">
                        <p className="font-sans text-[9px] font-bold tracking-[0.2em] text-amber-600 uppercase mb-2">{item.category || "Item"}</p>
                        <h3 className="font-serif text-base text-neutral-900 leading-tight group-hover:text-amber-800 transition-colors line-clamp-2">{item.caption || "Untitled Piece"}</h3>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </main>

        {/* Modal Overlay */}
        <AnimatePresence>
          {selectedItem && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-neutral-900/40 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
              onClick={() => setSelectedItem(null)}
            >
              {/* Navigation Buttons (Floating Outside) */}
              {results.length > 1 && (
                <>
                  <button
                    onClick={handlePrev}
                    className="fixed left-4 md:left-10 top-1/2 -translate-y-1/2 z-50 group outline-none focus:outline-none"
                    title="Previous Item"
                  >
                    <div className="absolute inset-0 bg-amber-200/40 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative w-16 h-16 bg-white/40 backdrop-blur-md border border-white/60 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:border-amber-200 group-hover:bg-white/60">
                      <div className="absolute inset-0 border border-amber-400/30 rounded-full animate-ping opacity-0 group-hover:opacity-100"></div>
                      <ChevronLeft size={32} className="text-neutral-800 group-hover:text-amber-800 transition-colors" />
                    </div>
                  </button>
                  <button
                    onClick={handleNext}
                    className="fixed right-4 md:right-10 top-1/2 -translate-y-1/2 z-50 group outline-none focus:outline-none"
                    title="Next Item"
                  >
                    <div className="absolute inset-0 bg-amber-200/40 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative w-16 h-16 bg-white/40 backdrop-blur-md border border-white/60 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:border-amber-200 group-hover:bg-white/60">
                      <div className="absolute inset-0 border border-amber-400/30 rounded-full animate-ping opacity-0 group-hover:opacity-100"></div>
                      <ChevronRight size={32} className="text-neutral-800 group-hover:text-amber-800 transition-colors" />
                    </div>
                  </button>
                </>
              )}

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row relative rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={() => setSelectedItem(null)} className="absolute top-6 right-6 z-10 p-2 bg-white/80 rounded-full hover:bg-neutral-100 text-neutral-900 transition-colors">
                  <X size={24} />
                </button>



                {/* Left: Image (50% width, contained for clarity) */}
                <div className="md:w-1/2 bg-neutral-50 relative h-[40vh] md:h-auto flex items-center justify-center p-12 group">
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    <div className="w-[150%] h-[150%] bg-gradient-to-tr from-white/80 to-transparent rounded-full blur-3xl"></div>
                  </div>



                  <img
                    src={selectedItem.image_path}
                    className="relative w-full h-full object-contain drop-shadow-2xl transition-transform duration-500"
                    alt={selectedItem.caption}
                  />
                </div>

                {/* Right: Details */}
                <div className="md:w-1/2 p-10 md:p-14 overflow-y-auto flex flex-col justify-center bg-white relative">
                  {/* Background watermark */}
                  <div className="absolute top-10 right-10 opacity-[0.03] pointer-events-none select-none">
                    <span className="font-serif text-9xl">J</span>
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <span className="font-serif text-amber-600 text-xs tracking-[0.2em] uppercase border-b border-amber-200 pb-1">
                      {selectedItem.category} Collection
                    </span>
                    {selectedItem.score && (
                      <span className="px-3 py-1 bg-neutral-900 text-white text-[10px] font-bold tracking-widest rounded-full">
                        CERTIFIED MATCH: {(selectedItem.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>

                  <h2 className="font-serif text-3xl md:text-4xl text-neutral-900 leading-tight mb-8">
                    The {selectedItem.category}
                  </h2>

                  <p className="font-body-serif text-xl text-neutral-600 leading-relaxed mb-10 border-l-2 border-neutral-100 pl-6 italic">
                    "{selectedItem.caption}"
                  </p>

                  {selectedItem.interpretation && (
                    <div className="bg-amber-50/50 p-6 mb-10 rounded-xl border border-amber-100">
                      <p className="font-sans text-sm text-neutral-600 leading-relaxed">
                        <span className="font-bold text-amber-900 uppercase tracking-wide text-xs flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-600"></div> AI Analysis
                        </span>
                        {selectedItem.interpretation}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto flex flex-col gap-3">
                    <button
                      onClick={handleFindSimilar}
                      className="w-full py-4 bg-neutral-900 text-white font-sans text-xs font-bold tracking-[0.15em] uppercase hover:bg-amber-700 transition-all shadow-xl hover:shadow-2xl translate-y-0 hover:-translate-y-1 rounded-sm flex items-center justify-center gap-2">
                      <span className="text-xl">✨</span> Find Similar Pieces
                    </button>

                    <div className="flex gap-3">
                      <button className="flex-1 py-3 border border-neutral-200 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2 group/btn">
                        <span className="text-[10px] uppercase font-bold text-neutral-600 tracking-widest group-hover/btn:text-neutral-900">From $1,800</span>
                      </button>
                      <button className="flex-1 py-3 border border-neutral-200 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2 group/btn">
                        <span className="text-[10px] uppercase font-bold text-neutral-600 tracking-widest group-hover/btn:text-neutral-900">Available</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* OCR Review Modal */}
        <AnimatePresence>
          {showOcrModal && ocrResult && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[150] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl relative"
              >
                <button onClick={() => setShowOcrModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-900">
                  <X size={24} />
                </button>

                <h3 className="font-serif text-2xl mb-6 text-neutral-900">Review Text</h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1 block">Raw Text Read</label>
                    <div className="p-3 bg-neutral-50 rounded-lg text-sm text-neutral-600 font-mono border border-neutral-100 min-h-[60px]">
                      {ocrResult.raw || "No text detected"}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1 block">AI Refined Query (Edit this)</label>
                    <textarea
                      className="w-full p-4 bg-amber-50/50 border border-amber-200 rounded-xl text-lg font-serif italic focus:ring-2 focus:ring-amber-500 outline-none"
                      rows={3}
                      value={ocrResult.cleaned}
                      onChange={(e) => setOcrResult({ ...ocrResult, cleaned: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-8 flex gap-4">
                  <button
                    onClick={() => setShowOcrModal(false)}
                    className="flex-1 py-3 bg-white border border-neutral-200 rounded-full font-bold text-xs tracking-widest hover:bg-neutral-50"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={() => {
                      setShowOcrModal(false);
                      search('/search/text', { query: ocrResult.cleaned });
                    }}
                    className="flex-1 py-3 bg-neutral-900 text-white rounded-full font-bold text-xs tracking-widest hover:bg-amber-600 transition-colors shadow-lg"
                  >
                    SEARCH NOW
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

export default App;
