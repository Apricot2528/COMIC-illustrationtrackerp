/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { PlacedSticker, ThemeConfig, CustomStyleConfig } from '../types';
import { Trash2, Move, RotateCw, ZoomIn, ZoomOut, Plus, Image as ImageIcon, Sparkles, X, ChevronRight, Minimize2 } from 'lucide-react';

interface StickerOverlayProps {
  stickers: PlacedSticker[];
  onStickersChange: (stickers: PlacedSticker[]) => void;
  activeTheme: ThemeConfig;
  customStyle?: CustomStyleConfig;
}

export default function StickerOverlay({
  stickers,
  onStickersChange,
  activeTheme,
  customStyle
}: StickerOverlayProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Dynamic color matching
  const currentPreset = customStyle?.themePreset || 'pastel';
  const isPresetCustom = currentPreset === 'custom';
  
  const presetDefaults = {
    pastel: { accentColor: '#ffd803', subColor: '#2d334a' },
    sage: { accentColor: '#0e172c', subColor: '#ff70a6' },
    autumn: { accentColor: '#6246ea', subColor: '#907eff' },
    pop: { accentColor: '#3da9fc', subColor: '#5f6c7b' },
    indigo: { accentColor: '#9a7b56', subColor: '#c19b6c' },
    custom: { accentColor: '#ffd803', subColor: '#2d334a' }
  };
  
  const selectedPreset = presetDefaults[currentPreset as keyof typeof presetDefaults] || presetDefaults.pastel;
  const customAccent = isPresetCustom ? (customStyle?.accentColor || '#ff85a1') : selectedPreset.accentColor;
  const customSub = isPresetCustom ? (customStyle?.subColor || '#e197b9') : selectedPreset.subColor;
  
  // Floating status text or hint
  const [stickerHoverId, setStickerHoverId] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  // Click outside to clear selected sticker
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-sticker-id]') ||
        target.closest('#stickers-palette-panel') ||
        target.closest('#stickers-palette-toggle-btn')
      ) {
        return;
      }
      setSelectedStickerId(null);
    };

    window.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('touchstart', handleDocumentClick);
    return () => {
      window.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('touchstart', handleDocumentClick);
    };
  }, []);

  // Read local file from PC as custom sticker
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddEmojiSticker = (emoji: string) => {
    const newSticker: PlacedSticker = {
      id: `sticker-emoji-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'emoji',
      emoji,
      x: 150 + Math.random() * 80, // Offset spawn
      y: 200 + Math.random() * 120,
      rotate: Math.round(Math.random() * 30 - 15), // micro-rotation
      scale: 1.0,
      containerId: 'global'
    };
    const updated = [...stickers, newSticker];
    onStickersChange(updated);
  };

  const handleAddCustomImageSticker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 1.5) { // 1.5MB limit to prevent storage quota overflow
        alert('ステッカー用の画像ファイルサイズは1.5MB以下にしてください💧');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const newSticker: PlacedSticker = {
            id: `sticker-img-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            type: 'image',
            imgUrl: event.target.result as string,
            x: 180 + Math.random() * 60,
            y: 220 + Math.random() * 100,
            rotate: 0,
            scale: 0.8,
            containerId: 'global'
          };
          onStickersChange([...stickers, newSticker]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag listeners
  const startDrag = (stickerId: string, clientX: number, clientY: number, stickerX: number, stickerY: number) => {
    setActiveDragId(stickerId);
    setDragOffset({
      x: clientX - stickerX,
      y: clientY - stickerY
    });
  };

  const handleMouseDown = (stickerId: string, stickerX: number, stickerY: number, e: React.MouseEvent) => {
    // Prevent dragging trigger when clicking mini toolbox actions
    if ((e.target as HTMLElement).closest('.sticker-tool')) return;
    e.preventDefault();
    setSelectedStickerId(stickerId);
    startDrag(stickerId, e.clientX, e.clientY, stickerX, stickerY);
  };

  const handleTouchStart = (stickerId: string, stickerX: number, stickerY: number, e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.sticker-tool')) return;
    setSelectedStickerId(stickerId);
    const touch = e.touches[0];
    startDrag(stickerId, touch.clientX, touch.clientY, stickerX, stickerY);
  };

  // Global move update
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!activeDragId) return;
      onStickersChange(
        stickers.map((st) => {
          if (st.id === activeDragId) {
            // Boundary enforcement to prevent stickers going off-screen completely
            const newX = Math.max(10, Math.min(window.innerWidth - 80, e.clientX - dragOffset.x));
            const newY = Math.max(10, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y));
            return { ...st, x: newX, y: newY };
          }
          return st;
        })
      );
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!activeDragId) return;
      const touch = e.touches[0];
      onStickersChange(
        stickers.map((st) => {
          if (st.id === activeDragId) {
            const newX = Math.max(10, Math.min(window.innerWidth - 80, touch.clientX - dragOffset.x));
            const newY = Math.max(10, Math.min(window.innerHeight - 80, touch.clientY - dragOffset.y));
            return { ...st, x: newX, y: newY };
          }
          return st;
        })
      );
    };

    const endDrag = () => {
      setActiveDragId(null);
    };

    if (activeDragId) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', endDrag);
      window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      window.addEventListener('touchend', endDrag);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', endDrag);
    };
  }, [activeDragId, dragOffset, stickers, onStickersChange]);

  // Adjust sticker size or rot
  const adjustSticker = (id: string, action: 'scale-up' | 'scale-down' | 'rotate' | 'delete') => {
    if (action === 'delete') {
      onStickersChange(stickers.filter(s => s.id !== id));
      if (selectedStickerId === id) {
        setSelectedStickerId(null);
      }
      return;
    }
    onStickersChange(stickers.map((st) => {
      if (st.id === id) {
        if (action === 'scale-up') return { ...st, scale: Math.min(2.5, st.scale + 0.15) };
        if (action === 'scale-down') return { ...st, scale: Math.max(0.4, st.scale - 0.15) };
        if (action === 'rotate') return { ...st, rotate: (st.rotate + 15) % 360 };
      }
      return st;
    }));
  };

  const isDark = activeTheme.id === 'cosmic' || !!customStyle?.darkMode;

  return (
    <>
      {/* 1. Layer of Draggable Stickers on the screen */}
      <div 
        id="stickers-canvas-container"
        className="fixed inset-0 pointer-events-none z-40 select-none overflow-hidden"
      >
        {stickers.map((sticker) => {
          const isSelectedDrag = sticker.id === activeDragId;
          const isSelected = sticker.id === selectedStickerId;
          const isHovered = sticker.id === stickerHoverId || isSelected;
          
          return (
            <div
              key={sticker.id}
              data-sticker-id={sticker.id}
              onMouseEnter={() => setStickerHoverId(sticker.id)}
              onMouseLeave={() => setStickerHoverId(null)}
              onMouseDown={() => setSelectedStickerId(sticker.id)}
              className="absolute pointer-events-auto group touch-none"
              style={{
                left: sticker.x,
                top: sticker.y,
                transform: `rotate(${sticker.rotate}deg) scale(${sticker.scale})`,
                transformOrigin: 'center center',
                transition: isSelectedDrag ? 'none' : 'transform 0.15s ease-out'
              }}
            >
              {/* Outer boundary indicator on hover or dragging */}
              <div 
                onMouseDown={(e) => handleMouseDown(sticker.id, sticker.x, sticker.y, e)}
                onTouchStart={(e) => handleTouchStart(sticker.id, sticker.x, sticker.y, e)}
                className={`p-3.5 rounded-2xl cursor-grab active:cursor-grabbing relative flex items-center justify-center min-w-14 min-h-14 transition-all duration-150 select-none ${
                  isSelectedDrag 
                    ? 'border-2 border-indigo-400 bg-indigo-50/10 shadow-lg scale-105' 
                    : isSelected
                      ? 'border-2 border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/30'
                      : isHovered 
                        ? 'border-2 border-rose-450 bg-white/60 dark:bg-indigo-950/30' 
                        : 'border-0 border-transparent bg-transparent'
                }`}
              >
                {/* Sticker content */}
                {sticker.type === 'emoji' ? (
                  <span className="text-4xl filter drop-shadow-md select-none font-sans block leading-none">
                    {sticker.emoji}
                  </span>
                ) : (
                  <img 
                    src={sticker.imgUrl} 
                    alt="カスタムステッカー" 
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 object-contain pointer-events-none drop-shadow-md rounded-lg"
                  />
                )}

                {/* Bubble action tool menu */}
                <div 
                  className={`absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-900/90 dark:bg-indigo-950/95 py-1 px-1.5 rounded-full shadow-lg border border-slate-700/80 z-50 transition-opacity duration-200 pointer-events-auto ${
                    isHovered || isSelectedDrag ? 'opacity-100 flex' : 'opacity-0 hidden'
                  }`}
                >
                  <button
                    onClick={() => adjustSticker(sticker.id, 'scale-up')}
                    className="sticker-tool p-1 rounded-full text-white hover:bg-slate-850 cursor-pointer duration-100"
                    title="拡大"
                  >
                    <ZoomIn className="w-3 h-3 text-white" />
                  </button>
                  <button
                    onClick={() => adjustSticker(sticker.id, 'scale-down')}
                    className="sticker-tool p-1 rounded-full text-white hover:bg-slate-850 cursor-pointer duration-100"
                    title="縮小"
                  >
                    <ZoomOut className="w-3 h-3 text-white" />
                  </button>
                  <button
                    onClick={() => adjustSticker(sticker.id, 'rotate')}
                    className="sticker-tool p-1 rounded-full text-white hover:bg-slate-850 cursor-pointer duration-100"
                    title="時計回りに回転"
                  >
                    <RotateCw className="w-3 h-3 text-white" />
                  </button>
                  <span className="block h-3 w-[1px] bg-slate-700 mx-0.5" />
                  <button
                    onClick={() => adjustSticker(sticker.id, 'delete')}
                    className="sticker-tool p-1 rounded-full text-rose-400 hover:bg-rose-900/50 cursor-pointer duration-100"
                    title="はがす（削除）"
                  >
                    <Trash2 className="w-3 h-3 text-rose-400" />
                  </button>
                </div>

                {/* Move cursor indicator */}
                {isHovered && !isSelectedDrag && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-[9px] font-black text-rose-600 px-1 py-0.5 rounded-md border border-rose-200 shadow-sm leading-none flex items-center gap-0.5">
                    <Move className="w-2.5 h-2.5" />
                    <span>ドラッグ</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Floating Toggle Button bottom-right */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          id="stickers-palette-toggle-btn"
          onClick={() => setIsPaletteOpen(!isPaletteOpen)}
          className={`flex items-center gap-2 p-3.5 rounded-full shadow-2xl border-2 transition duration-300 transform scale-100 hover:scale-[1.05] active:scale-95 cursor-pointer text-white font-extrabold text-sm ${
            isPaletteOpen 
              ? 'bg-slate-900 border-slate-755 shadow-none' 
              : 'shadow-lg hover:shadow-xl'
          }`}
          style={{
            background: isPaletteOpen 
              ? undefined 
              : `linear-gradient(135deg, ${customSub}, ${customAccent})`,
            borderColor: isPaletteOpen ? 'transparent' : `${customAccent}80`
          }}
          title="ステッカーパレットを表示"
        >
          {isPaletteOpen ? (
            <>
              <X className="w-5 h-5 text-white" />
              <span>閉じる</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-white animate-spin-slow" />
              <span>✨ 進捗ステッカー!</span>
            </>
          )}
        </button>
      </div>

      {/* 3. Sticker Selection Palette Panel */}
      {isPaletteOpen && (
        <div 
          id="stickers-palette-panel"
          className={`fixed bottom-24 right-6 z-50 w-80 rounded-3xl border-2 p-5 shadow-2.5xl transition max-h-[460px] overflow-y-auto ${
            isDark ? 'bg-indigo-950/95 border-indigo-800 text-indigo-150 backdrop-blur-md' : 'bg-white/95 border-slate-200 text-slate-800 backdrop-blur-md'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-rose-100/20 mb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>✨ ミニキャラ＆進捗ステッカー</span>
            </h3>
            <button
              onClick={() => {
                if (window.confirm('画面上のステッカーをすべてはがしますか？')) {
                  onStickersChange([]);
                }
              }}
              className="text-[10px] text-rose-500 dark:text-rose-400 font-extrabold hover:underline"
              title="すべてリセット"
            >
              全撤去
            </button>
          </div>

          <p className="text-[10px] text-slate-400 dark:text-indigo-300 mb-3.5 leading-relaxed font-semibold">
            お好きなミニキャラや表情スタンプを画面に配置して、モチベーション高めてね！ステッカーは画面上のどこにでも自由自在にドラッグ調整・配置できます💖
          </p>

          {/* Custom user storage upload sticker */}
          <div className="py-3 px-3.5 rounded-2xl border border-dashed border-rose-300/40 bg-rose-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-rose-500 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>自分のPCから選択する</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-450 leading-tight">
              あなたのPCに保存されている推しキャラやミニ自作絵、猫の画像をアップロードして画面に置けます！
            </p>

            <button
              id="upload-custom-sticker-action-btn"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md duration-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>PCのイラスト画像を使用する</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAddCustomImageSticker}
            />
          </div>

          <div className="mt-4 pt-2 border-t border-rose-100/10 text-center">
            <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">
              ※ステッカーはドラッグ、拡大、縮小、回転、削除できます。<br />
              レイアウト状態はPCブラウザに永続保存されます✨
            </p>
          </div>
        </div>
      )}
    </>
  );
}
