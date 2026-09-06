/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {PlacedSticker, CustomStyleConfig } from '../types';
import { Trash2, Move, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from '../utils/toast';

interface StickerOverlayProps {
  stickers: PlacedSticker[];
  onStickersChange: (stickers: PlacedSticker[]) => void;
  customStyle?: CustomStyleConfig;
}

export default function StickerOverlay({
  stickers,
  onStickersChange,
  customStyle
}: StickerOverlayProps) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
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

  const handleAddCustomImageSticker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 1.5) { // 1.5MB limit to prevent storage quota overflow
        toast('ステッカー用の画像ファイルサイズは1.5MB以下にしてください💧', 'error');
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

  return (
    <>
      {/* 1. Layer of Draggable Stickers on the screen */}
      <div 
        id="stickers-canvas-container"
        className="sticker-layer fixed inset-0 pointer-events-none z-40 select-none overflow-hidden"
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
                className="relative flex min-h-14 min-w-14 cursor-grab select-none items-center justify-center p-3 active:cursor-grabbing"
                style={{
                  border: isSelectedDrag || isSelected || isHovered ? '0.5px solid #262A26' : '0.5px solid transparent',
                  borderRadius: '2px',
                  background: isSelectedDrag || isSelected ? 'rgba(237, 239, 234, 0.6)' : 'transparent',
                }}
              >
                {/* Sticker content */}
                {sticker.type === 'emoji' ? (
                  <span className="block select-none text-4xl leading-none">
                    {sticker.emoji}
                  </span>
                ) : (
                  <img 
                    src={sticker.imgUrl} 
                    alt="カスタムステッカー" 
                    referrerPolicy="no-referrer"
                    className="pointer-events-none h-16 w-16 object-contain"
                  />
                )}

                {/* Bubble action tool menu */}
                <div 
                  className={`pointer-events-auto absolute -bottom-10 left-1/2 z-50 -translate-x-1/2 items-center gap-1 px-1.5 py-1 ${
                    isHovered || isSelectedDrag ? 'flex' : 'hidden'
                  }`}
                  style={{ background: '#F4F5F3', border: '0.5px solid #262A26', borderRadius: '2px' }}
                >
                  <button
                    onClick={() => adjustSticker(sticker.id, 'scale-up')}
                    className="sticker-tool cursor-pointer p-1 text-sumi"
                    title="拡大"
                  >
                    <ZoomIn className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <button
                    onClick={() => adjustSticker(sticker.id, 'scale-down')}
                    className="sticker-tool cursor-pointer p-1 text-sumi"
                    title="縮小"
                  >
                    <ZoomOut className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <button
                    onClick={() => adjustSticker(sticker.id, 'rotate')}
                    className="sticker-tool cursor-pointer p-1 text-sumi"
                    title="時計回りに回転"
                  >
                    <RotateCw className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <span className="mx-0.5 block h-3 w-[1px]" style={{ background: '#D7DAD3' }} />
                  <button
                    onClick={() => adjustSticker(sticker.id, 'delete')}
                    className="sticker-tool cursor-pointer p-1 text-accent"
                    title="はがす（削除）"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                </div>

                {/* Move cursor indicator */}
                {isHovered && !isSelectedDrag && (
                  <div
                    className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1 px-1.5 py-0.5 text-note leading-none text-hojo"
                    style={{ background: '#F4F5F3', border: '0.5px solid #D7DAD3', borderRadius: '2px' }}
                  >
                    <Move className="h-3 w-3" strokeWidth={1.25} />
                    <span>ドラッグ</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. パレットの開閉（画面右下・枠線のみ） */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          id="stickers-palette-toggle-btn"
          onClick={() => setIsPaletteOpen(!isPaletteOpen)}
          className="btn"
          style={{ background: '#F4F5F3' }}
          title="ステッカー"
        >
          {isPaletteOpen ? '閉じる' : 'ステッカー'}
        </button>
      </div>

      {/* 3. ステッカーのパレット */}
      {isPaletteOpen && (
        <div
          id="stickers-palette-panel"
          className="fixed bottom-[68px] right-6 z-50 max-h-[420px] w-[320px] overflow-y-auto px-5 py-4"
          style={{ background: '#F4F5F3', border: '0.5px solid #262A26', borderRadius: '2px' }}
        >
          <div className="rule-b mb-3 flex items-baseline justify-between pb-2">
            <h3 className="mincho text-body">ステッカー</h3>
            <button
              onClick={() => {
                if (window.confirm('画面上のステッカーをすべてはがしますか？')) {
                  onStickersChange([]);
                }
              }}
              className="text-note text-accent"
              style={{ textDecoration: 'underline', textDecorationThickness: '0.5px' }}
              title="すべてはがす"
            >
              すべてはがす
            </button>
          </div>

          <p className="mb-4 text-note text-hojo leading-[1.8]">
            手持ちの絵を画面に置けます。置いたあとはドラッグで移動、拡大・縮小・回転もできます。
          </p>

          <button
            id="upload-custom-sticker-action-btn"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary w-full"
          >
            画像を選ぶ
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAddCustomImageSticker}
          />

          <p className="mt-3 text-note text-hojo">画像は 1.5MB まで。</p>
        </div>
      )}
    </>
  );
}
