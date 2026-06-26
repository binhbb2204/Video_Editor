import React from 'react';
import { useStore } from '../../store';
import { FONT_FAMILIES } from '../../constants';
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';

export const StylingPanel = () => {
    const { globalStyle, updateGlobalStyle, selectedSubtitleId, subtitles, updateSubtitle, applyStyleToAllSubtitles } = useStore();

    const selectedSubtitle = subtitles.find((s) => s.id === selectedSubtitleId);
    const currentStyle = selectedSubtitle?.style ? { ...globalStyle, ...selectedSubtitle.style } : globalStyle;

    const handleChange = (key, value) => {
        if (selectedSubtitleId) {
            updateSubtitle(selectedSubtitleId, {
                style: { ...selectedSubtitle?.style, [key]: value }
            });
        } else {
            updateGlobalStyle({ [key]: value });
        }
    };

    const handleApplyToAll = () => {
        if (selectedSubtitle?.style) {
            applyStyleToAllSubtitles(selectedSubtitle.style);
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800 p-4 space-y-6 overflow-auto">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Style Editor</h2>
                <div className="flex items-center space-x-2">
                    {selectedSubtitleId && (
                        <button
                            onClick={handleApplyToAll}
                            className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
                            title="Apply this subtitle's style to all subtitles"
                        >
                            Apply to All
                        </button>
                    )}
                    <button
                        onClick={() => updateGlobalStyle({})}
                        className="text-[10px] text-zinc-400 hover:text-white underline"
                    >
                        Reset
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {/* Typography */}
                <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase">Typography</label>
                    <div>
                        <span className="text-[10px] text-zinc-500 block mb-1">Font Family</span>
                        <select
                            className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300"
                            value={currentStyle.fontFamily}
                            onChange={(e) => handleChange('fontFamily', e.target.value)}
                        >
                            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    <div className="flex space-x-2">
                        <div className="flex-1">
                            <span className="text-[10px] text-zinc-500 block mb-1">Size (px)</span>
                            <input
                                type="number"
                                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300"
                                value={Math.round(currentStyle.fontSize)}
                                onChange={(e) => handleChange('fontSize', parseInt(e.target.value) || 12)}
                            />
                        </div>
                        <div className="flex-1">
                            <span className="text-[10px] text-zinc-500 block mb-1">Weight</span>
                            <select
                                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300"
                                value={currentStyle.fontWeight}
                                onChange={(e) => handleChange('fontWeight', e.target.value)}
                            >
                                <option value="400">Regular</option>
                                <option value="600">Semi-Bold</option>
                                <option value="700">Bold</option>
                                <option value="900">Black</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Text Alignment (inside subtitle) */}
                <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase">Text Align</label>
                    <div className="flex bg-zinc-800 p-1 rounded border border-zinc-700 gap-1">
                        {[
                            { value: 'left', icon: AlignLeft },
                            { value: 'center', icon: AlignCenter },
                            { value: 'right', icon: AlignRight },
                            { value: 'justify', icon: AlignJustify }
                        ].map(({ value, icon: Icon }) => (
                            <button
                                key={value}
                                onClick={() => handleChange('textAlign', value)}
                                className={`flex-1 py-2 flex items-center justify-center rounded transition ${(currentStyle.textAlign || 'center') === value ? 'bg-zinc-700 text-blue-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50'}`}
                                title={value.charAt(0).toUpperCase() + value.slice(1)}
                            >
                                <Icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Box Position */}
                <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase">Box Position</label>
                    <div className="flex bg-zinc-800 p-1 rounded border border-zinc-700 gap-1">
                        {[
                            { value: 'left', icon: AlignLeft },
                            { value: 'center', icon: AlignCenter },
                            { value: 'right', icon: AlignRight }
                        ].map(({ value, icon: Icon }) => (
                            <button
                                key={value}
                                onClick={() => handleChange('alignment', value)}
                                className={`flex-1 py-2 flex items-center justify-center rounded transition ${currentStyle.alignment === value ? 'bg-zinc-700 text-blue-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50'}`}
                                title={value.charAt(0).toUpperCase() + value.slice(1)}
                            >
                                <Icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Colors */}
                <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase">Colors & Effects</label>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-500">Text Color</span>
                        <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">{currentStyle.color}</span>
                            <input
                                type="color"
                                className="w-6 h-6 rounded-full border-2 border-zinc-800 overflow-hidden cursor-pointer"
                                value={currentStyle.color}
                                onChange={(e) => handleChange('color', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500 uppercase font-medium">Outline</span>
                            <input
                                type="color"
                                className="w-6 h-6 rounded-full border-2 border-zinc-800 overflow-hidden cursor-pointer"
                                value={currentStyle.outlineColor}
                                onChange={(e) => handleChange('outlineColor', e.target.value)}
                            />
                        </div>
                        <div className="flex space-x-2 items-center">
                            <span className="text-[9px] text-zinc-600 w-12">Width</span>
                            <input
                                type="range"
                                className="flex-1 accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                min="0" max="10" step="1"
                                value={currentStyle.outlineWidth}
                                onChange={(e) => handleChange('outlineWidth', parseInt(e.target.value) || 0)}
                            />
                            <span className="text-[10px] font-mono text-zinc-500 w-4">{currentStyle.outlineWidth}</span>
                        </div>
                        <div className="flex space-x-2 items-center">
                            <span className="text-[9px] text-zinc-600 w-12">Opacity</span>
                            <input
                                type="range"
                                className="flex-1 accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                min="0" max="1" step="0.05"
                                value={currentStyle.outlineOpacity ?? 1}
                                onChange={(e) => handleChange('outlineOpacity', parseFloat(e.target.value))}
                            />
                            <span className="text-[10px] font-mono text-zinc-500 w-8">{Math.round((currentStyle.outlineOpacity ?? 1) * 100)}%</span>
                        </div>
                    </div>

                    <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500 uppercase font-medium">Background Box</span>
                            <input
                                type="color"
                                className="w-6 h-6 rounded-full border-2 border-zinc-800 overflow-hidden cursor-pointer"
                                value={currentStyle.backgroundColor}
                                onChange={(e) => handleChange('backgroundColor', e.target.value)}
                            />
                        </div>
                        <div className="flex space-x-2 items-center">
                            <span className="text-[9px] text-zinc-600 w-12">Opacity</span>
                            <input
                                type="range"
                                className="flex-1 accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                min="0" max="1" step="0.1"
                                value={currentStyle.backgroundOpacity}
                                onChange={(e) => handleChange('backgroundOpacity', parseFloat(e.target.value))}
                            />
                            <span className="text-[10px] font-mono text-zinc-500 w-8">{Math.round(currentStyle.backgroundOpacity * 100)}%</span>
                        </div>
                    </div>
                </div>

                {/* Position */}
                <div className="space-y-3 pt-2">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase">Position & Layout</label>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500">Vertical Offset</span>
                            <span className="text-[10px] text-blue-500 font-bold">{Math.round(currentStyle.y * 10) / 10}%</span>
                        </div>
                        <input
                            type="range"
                            className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                            min="0" max="100" step="0.1"
                            value={currentStyle.y}
                            onChange={(e) => handleChange('y', parseFloat(e.target.value))}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500">Horizontal Offset</span>
                            <span className="text-[10px] text-blue-500 font-bold">{Math.round(currentStyle.x * 10) / 10}%</span>
                        </div>
                        <input
                            type="range"
                            className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                            min="0" max="100" step="0.1"
                            value={currentStyle.x}
                            onChange={(e) => handleChange('x', parseFloat(e.target.value))}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500">Max Width</span>
                            <span className="text-[10px] text-blue-500 font-bold">{Math.round(currentStyle.width * 10) / 10}%</span>
                        </div>
                        <input
                            type="range"
                            className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                            min="5" max="100" step="0.1"
                            value={currentStyle.width}
                            onChange={(e) => handleChange('width', parseFloat(e.target.value))}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
