import React, { useRef, useState } from "react";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { Eraser, Pen, Undo, Trash2, Upload } from "lucide-react";

export const SketchPad = ({ onSearch }) => {
    const canvasRef = useRef(null);
    const [strokeColor, setStrokeColor] = useState("black");
    const [eraserMode, setEraserMode] = useState(false);

    const handleExport = async () => {
        if (canvasRef.current) {
            try {
                const imageBlob = await canvasRef.current.exportImage("jpeg");
                const res = await fetch(imageBlob);
                const blob = await res.blob();
                if (onSearch) await onSearch(blob);
            } catch (e) {
                console.error("Export failed", e);
            }
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                    <button
                        onClick={() => { setEraserMode(false); setStrokeColor("black"); }}
                        className={`p-2 rounded-md transition-colors ${!eraserMode ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"}`}
                        title="Pen"
                    >
                        <Pen size={18} />
                    </button>
                    <button
                        onClick={() => { setEraserMode(true); }}
                        className={`p-2 rounded-md transition-colors ${eraserMode ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"}`}
                        title="Eraser"
                    >
                        <Eraser size={18} />
                    </button>
                    <div className="w-px bg-neutral-200 my-1"></div>
                    <button
                        onClick={() => canvasRef.current?.undo()}
                        className="p-2 rounded-md text-neutral-500 dark:text-neutral-400 hover:bg-white dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white transition-colors"
                        title="Undo"
                    >
                        <Undo size={18} />
                    </button>
                    <button
                        onClick={() => canvasRef.current?.clearCanvas()}
                        className="p-2 rounded-md text-red-500 hover:bg-white dark:hover:bg-neutral-700 transition-colors"
                        title="Clear"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>

                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
                >
                    <Upload size={18} />
                    Find Matching Items
                </button>
            </div>

            <div className="h-[400px] bg-white dark:bg-neutral-900 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-inner">
                <ReactSketchCanvas
                    ref={canvasRef}
                    strokeWidth={4}
                    strokeColor={eraserMode ? "white" : strokeColor}
                    canvasColor="white"
                    style={{ border: "none" }}
                />
            </div>
            <p className="text-xs text-neutral-400 text-center font-serif italic">Sketch a shape above to discover similar designs</p>
        </div>
    );
};
