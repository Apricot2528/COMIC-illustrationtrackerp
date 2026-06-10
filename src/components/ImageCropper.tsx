import React, { useState, useEffect, useRef } from 'react';
import { RotateCw, ZoomIn, ZoomOut, Check, X, Move, Sparkles } from 'lucide-react';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBase64: string) => void;
  onCancel: () => void;
  isDark?: boolean;
}

export function ImageCropper({ imageSrc, onCropComplete, onCancel, isDark = false }: ImageCropperProps) {
  // Configizable viewport dimensions
  const viewportWidth = 480;
  const viewportHeight = 320;

  // Selected preset aspect ratios
  // 4:1 is perfect for custom header illustrations, 16:9 is standard, 1:1 is square
  const PRESETS = [
    { label: '推奨ヘッダー (4:1)', ratio: 4 },
    { label: 'ワイド (16:9)', ratio: 16 / 9 },
    { label: 'スクエア (1:1)', ratio: 1 }
  ];

  const [aspectRatio, setAspectRatio] = useState<number>(4);
  const [zoom, setZoom] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);

  // Dragging states
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const offsetStartRef = useRef({ x: 0, y: 0 });

  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });

  // Reset parameters when image or ratio changes
  useEffect(() => {
    setZoom(1.0);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, [imageSrc, aspectRatio]);

  // Handle image load to configure displays
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const imgRatio = naturalWidth / naturalHeight;

    // Calculate layout size to fit well inside the viewer as base size (at zoom = 1.0)
    let displayWidth = viewportWidth - 80;
    let displayHeight = displayWidth / imgRatio;

    if (displayHeight > viewportHeight - 80) {
      displayHeight = viewportHeight - 80;
      displayWidth = displayHeight * imgRatio;
    }

    setImageSize({
      width: displayWidth,
      height: displayHeight,
      naturalWidth,
      naturalHeight
    });
  };

  // Draggable calculations centered inside viewport
  const cropW = Math.min(viewportWidth - 48, (viewportHeight - 48) * aspectRatio);
  const cropH = cropW / aspectRatio;
  const cropX = (viewportWidth - cropW) / 2;
  const cropY = (viewportHeight - cropH) / 2;

  // -- Mouse event handlers for panning --
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    offsetStartRef.current = { ...offset };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: offsetStartRef.current.x + dx,
      y: offsetStartRef.current.y + dy
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // -- Mobile Touch event handlers for panning --
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    offsetStartRef.current = { ...offset };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    setOffset({
      x: offsetStartRef.current.x + dx,
      y: offsetStartRef.current.y + dy
    });
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleApplyCrop = () => {
    if (!imageRef.current || imageSize.width === 0) return;
    setIsDownloading(true);

    setTimeout(() => {
      try {
        // Calculate scale factor relative to original/natural image size
        const canvasScale = imageSize.naturalWidth / imageSize.width;
        
        // High resolution dimensions matching original image resolution
        const tempWidth = viewportWidth * canvasScale;
        const tempHeight = viewportHeight * canvasScale;

        // Step 1: Render full canvas mimicking viewport transformation layout at natural scale
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = tempWidth;
        tempCanvas.height = tempHeight;
        const ctx = tempCanvas.getContext('2d');

        if (!ctx) {
          alert('画像の書き出しに失敗しました。');
          setIsDownloading(false);
          return;
        }

        // Draw black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, tempWidth, tempHeight);

        // Apply same style matrix from layout, scaled to natural pixels
        ctx.translate((viewportWidth / 2 + offset.x) * canvasScale, (viewportHeight / 2 + offset.y) * canvasScale);
        ctx.scale(zoom, zoom);
        ctx.rotate((rotation * Math.PI) / 180);

        // Draw image centered at its original natural size
        ctx.drawImage(
          imageRef.current,
          -imageSize.naturalWidth / 2,
          -imageSize.naturalHeight / 2,
          imageSize.naturalWidth,
          imageSize.naturalHeight
        );

        // Step 2: Slice the exact crop box coordinates out using natural scale
        const cropCanvas = document.createElement('canvas');
        
        const finalCropW = cropW * canvasScale;
        const finalCropH = cropH * canvasScale;
        
        cropCanvas.width = finalCropW;
        cropCanvas.height = finalCropH;

        const cropCtx = cropCanvas.getContext('2d');
        if (!cropCtx) {
          alert('トリミングに失敗しました。');
          setIsDownloading(false);
          return;
        }

        cropCtx.imageSmoothingEnabled = true;
        cropCtx.imageSmoothingQuality = 'high';

        cropCtx.drawImage(
          tempCanvas,
          cropX * canvasScale,
          cropY * canvasScale,
          finalCropW,
          finalCropH,
          0,
          0,
          finalCropW,
          finalCropH
        );

        // Compress and output JPeg with high quality parameter to ensure beautiful crispy details
        const resultBase64 = cropCanvas.toDataURL('image/jpeg', 0.95);
        onCropComplete(resultBase64);
      } catch (err) {
        console.error('Cropping failure:', err);
        alert('画像のトリミングプロセスでエラーが発生しました。読み込み制限などに違反していないか確認してください。');
      } finally {
        setIsDownloading(false);
      }
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div 
        id="image-cropper-box"
        className={`w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border ${
          isDark 
            ? 'bg-slate-900 border-indigo-750 text-white' 
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header bar */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-indigo-950/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <h3 className="text-sm font-black dark:text-amber-300 flex items-center gap-1">
              🎨 プレビュー ＆ 自由トリミング
            </h3>
          </div>
          <button 
            type="button"
            onClick={onCancel}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-indigo-950/50 rounded-full text-slate-400 dark:text-slate-500 hover:text-rose-500 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport canvas staging */}
        <div className="p-4 flex flex-col items-center">
          <div 
            id="crop-viewport"
            className="relative w-full overflow-hidden rounded-2xl bg-black border border-slate-200 dark:border-indigo-950 shadow-inner group"
            style={{ width: `${viewportWidth}px`, height: `${viewportHeight}px`, maxWidth: '100%', aspectRatio: `${viewportWidth}/${viewportHeight}` }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUpOrLeave}
          >
            {/* Movable image instance */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Cropped visual node"
              onLoad={handleImageLoad}
              referrerPolicy="no-referrer"
              className="absolute pointer-events-none select-none max-w-none origin-center"
              style={{
                width: imageSize.width ? `${imageSize.width}px` : 'auto',
                height: imageSize.height ? `${imageSize.height}px` : 'auto',
                left: `${viewportWidth / 2}px`,
                top: `${viewportHeight / 2}px`,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: '50% 50%'
              }}
            />

            {/* Panning cursor hint on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-30 pointer-events-none transition duration-300">
              <Move className="w-12 h-12 text-white drop-shadow-md" />
            </div>

            {/* Glassmorphic SVG viewport layout */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
              viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <mask id="crop-window-mask">
                  <rect width={viewportWidth} height={viewportHeight} fill="white" />
                  <rect 
                    x={cropX} 
                    y={cropY} 
                    width={cropW} 
                    height={cropH} 
                    rx="12" 
                    fill="black" 
                  />
                </mask>
              </defs>
              {/* Outer dimmed regions */}
              <rect 
                width={viewportWidth} 
                height={viewportHeight} 
                fill="#000000" 
                fillOpacity="0.72" 
                mask="url(#crop-window-mask)" 
              />
              {/* Crop box border highlighted */}
              <rect 
                x={cropX} 
                y={cropY} 
                width={cropW} 
                height={cropH} 
                rx="12" 
                fill="transparent" 
                stroke="#6366f1" 
                strokeWidth="2.5" 
                strokeDasharray="5 5" 
                className="drop-shadow-[0_0_4px_rgba(99,102,241,0.5)]"
              />
            </svg>

            {/* Float hint overlay */}
            <div className="absolute bottom-2.5 left-0 right-0 text-center pointer-events-none z-20">
              <span className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-zinc-300 font-bold border border-white/5 shadow-md">
                🖱️ ドラッグして切り抜く位置を微調整できます
              </span>
            </div>
          </div>

          {/* Sizing & Slicing Toolsets */}
          <div className="w-full mt-4 space-y-4">
            
            {/* Aspect Ratio Selector */}
            <div className="space-y-1.5 bg-slate-50/70 dark:bg-indigo-950/20 p-2.5 rounded-2xl border border-slate-100 dark:border-indigo-950/40">
              <label className="block text-[10px] font-extrabold text-slate-450 dark:text-indigo-400">
                📐 アスペクト比 (枠線のサイズ) を選ぶ
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setAspectRatio(p.ratio)}
                    className={`py-1.5 px-2 text-[10.5px] font-bold rounded-xl border transition cursor-pointer text-center duration-150 ${
                      Math.abs(aspectRatio - p.ratio) < 0.01
                        ? 'bg-indigo-500 text-white border-transparent shadow-xs'
                        : isDark
                        ? 'bg-slate-900 border-indigo-950 hover:bg-indigo-950/50 text-slate-350'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom / Rotate Controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              
              {/* Zoom slider */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1">
                <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-indigo-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-hidden"
                />
                <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10px] font-mono text-slate-450 dark:text-slate-400 w-8 text-right shrink-0">
                  x{zoom.toFixed(2)}
                </span>
              </div>

              {/* Angle rotation */}
              <button
                type="button"
                onClick={handleRotate}
                className={`py-1.5 px-3 rounded-xl border font-bold text-[10.5px] cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition duration-150 ${
                  isDark
                    ? 'bg-slate-900 hover:bg-indigo-950/40 border-indigo-950 text-slate-200'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-650'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>90°回転</span>
              </button>
            </div>

          </div>
        </div>

        {/* Footer controls */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-indigo-950/50 bg-slate-50/50 dark:bg-slate-900/30 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDownloading}
            className={`py-2 px-4.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
              isDark
                ? 'bg-slate-900 hover:bg-indigo-950/40 border-indigo-950 text-slate-200'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            キャンセル
          </button>
          
          <button
            type="button"
            onClick={handleApplyCrop}
            disabled={isDownloading}
            className="py-2 px-5.5 rounded-xl text-xs font-black text-white bg-indigo-500 hover:bg-indigo-600 active:scale-[0.98] shadow-md transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>{isDownloading ? '処理中...' : 'トリミングを適用 📐'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
