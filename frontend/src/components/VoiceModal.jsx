
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Square, Loader2, RefreshCw, Search } from 'lucide-react';
import axios from 'axios';

const API_BASE = "http://localhost:8000";

export const VoiceModal = ({ isOpen, onClose, onSearch }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribedText, setTranscribedText] = useState("");
    const [error, setError] = useState(null);

    const mediaRecorderRef = useRef(null);
    const recognitionRef = useRef(null);
    const [interimText, setInterimText] = useState("");
    const [finalTranscript, setFinalTranscript] = useState("");
    const transcriptRef = useRef({ final: "", interim: "" });
    const chunksRef = useRef([]);

    // Auto-start recording when modal opens
    useEffect(() => {
        if (isOpen) {
            startRecording();
        } else {
            stopRecordingContext();
        }
        return () => stopRecordingContext();
    }, [isOpen]);

    const startRecording = async () => {
        try {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }

            setTranscribedText("");
            setFinalTranscript("");
            setInterimText("");
            transcriptRef.current = { final: "", interim: "" };
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                if (recognitionRef.current) recognitionRef.current.stop();
                await handleTranscribe(blob);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            // Start Speech Recognition for visual feedback
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognitionRef.current = new SpeechRecognition();
                recognitionRef.current.continuous = true;
                recognitionRef.current.interimResults = true;

                recognitionRef.current.onresult = (event) => {
                    let interim = '';
                    let final = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            final += event.results[i][0].transcript;
                        } else {
                            interim += event.results[i][0].transcript;
                        }
                    }
                    if (final) {
                        setFinalTranscript(prev => {
                            const newVal = prev + " " + final;
                            transcriptRef.current.final = newVal;
                            return newVal;
                        });
                    }
                    setInterimText(interim);
                    transcriptRef.current.interim = interim;
                };

                recognitionRef.current.start();
            }

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Microphone Access Error:", err);
            setError("Microphone access denied or not available.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            if (recognitionRef.current) recognitionRef.current.stop();
            setIsRecording(false);
        }
    };

    const stopRecordingContext = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsRecording(false);
    };

    const handleTranscribe = async (audioBlob) => {
        setIsTranscribing(true);
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.webm');

            const res = await axios.post(`${API_BASE}/voice/transcribe`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data && res.data.text) {
                setTranscribedText(res.data.text);
            } else {
                throw new Error("No text returned");
            }
        } catch (err) {
            console.error("Transcription Error:", err);
            // Fallback to browser transcript if available
            const fallbackText = (transcriptRef.current.final + " " + transcriptRef.current.interim).trim();
            if (fallbackText) {
                setTranscribedText(fallbackText);
                setError(null);
            } else {
                setError("Failed to transcribe audio. Please try again.");
            }
        } finally {
            setIsTranscribing(false);
        }
    };

    const handleExplore = () => {
        if (transcribedText.trim()) {
            onSearch(transcribedText);
            onClose();
        }
    };

    // Visualizer Bars Animation
    const visualizerBars = Array.from({ length: 5 }).map((_, i) => (
        <motion.div
            key={i}
            className="w-2 bg-amber-500 rounded-full mx-1"
            animate={{
                height: isRecording ? [20, 40 + Math.random() * 40, 20] : 10,
                opacity: isRecording ? 1 : 0.5
            }}
            transition={{
                repeat: Infinity,
                duration: 0.5 + Math.random() * 0.5,
                ease: "easeInOut"
            }}
        />
    ));

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-md p-8 relative shadow-2xl flex flex-col items-center text-center overflow-hidden border dark:border-neutral-800"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <h3 className="font-serif text-2xl text-neutral-900 dark:text-white mb-2">Voice Assistant</h3>
                        <p className="font-body-serif italic text-neutral-500 dark:text-neutral-400 mb-10">Speak your desires...</p>

                        {/* Visualizer / Status Area */}
                        <div className="h-40 flex flex-col items-center justify-center mb-6 w-full relative">
                            {isTranscribing ? (
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="animate-spin text-amber-600" size={48} />
                                    <span className="text-xs font-bold tracking-widest text-neutral-400 uppercase animate-pulse">Transcribing...</span>
                                </div>
                            ) : transcribedText ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="w-full"
                                >
                                    <p className="text-xl font-serif text-neutral-800 dark:text-neutral-200 leading-relaxed">
                                        "{transcribedText}"
                                    </p>
                                </motion.div>
                            ) : error ? (
                                <p className="text-red-500 font-medium">{error}</p>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full w-full gap-6">
                                    <div className="flex items-center justify-center h-12">
                                        {visualizerBars}
                                    </div>
                                    {/* Real-time Preview */}
                                    <div className="h-16 flex items-center justify-center w-full px-4">
                                        {interimText && (
                                            <motion.p
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                className="text-neutral-400 font-serif italic text-lg text-center leading-tight line-clamp-2"
                                            >
                                                "{interimText}..."
                                            </motion.p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="w-full flex flex-col gap-3">
                            {isRecording ? (
                                <button
                                    onClick={stopRecording}
                                    className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold tracking-widest text-xs uppercase flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-200"
                                >
                                    <Square size={12} fill="currentColor" /> Stop Recording
                                </button>
                            ) : transcribedText ? (
                                <div className="flex gap-3 w-full">
                                    <button
                                        onClick={startRecording}
                                        className="flex-1 py-4 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-full font-bold tracking-widest text-[10px] uppercase flex items-center justify-center gap-2 transition-all"
                                    >
                                        <RefreshCw size={14} /> Re-record
                                    </button>
                                    <button
                                        onClick={handleExplore}
                                        className="flex-1 py-4 bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-full font-bold tracking-widest text-[10px] uppercase flex items-center justify-center gap-2 transition-all shadow-lg"
                                    >
                                        <Search size={14} /> Explore Collection
                                    </button>
                                </div>
                            ) : (
                                // Fallback or initial state if not auto-started (should generally be recording though)
                                <p className="h-12"></p>
                            )}
                        </div>

                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
