import React, { useState, useEffect, useRef } from 'react';
import { toast } from '../utils/toast';

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
          toast('画像の書き出しに失敗しました。', 'error');
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
          toast('トリミングに失敗しました。', 'error');
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
        toast('画像のトリミングプロセスでエラーが発生しました。読み込み制限などに違反していないか確認してください。', 'error');
      } finally {
        setIsDownloading(false);
      }
    }, 100);
  };

  return (
    // 元画面を隠す必要があるので地は敷くが、影・ぼかし・角丸は使わない
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" style={{ background: '#E7EAE5' }}>
      <div
        id="image-cropper-box"
        className="w-full max-w-lg overflow-hidden bg-paper"
        style={{ border: '0.5px solid #262A26', borderRadius: '2px' }}
      >
        {/* 見出し */}
        <div className="rule-b rule-b-sumi flex items-baseline justify-between px-5 py-4">
          <h3 className="mincho text-title leading-none">画像の切り抜き</h3>
          <button type="button" onClick={onCancel} className="num tap-icon text-body text-hojo" title="閉じる">
            ×
          </button>
        </div>

        <div className="flex flex-col items-center px-5 py-4">
          <div
            id="crop-viewport"
            className="relative w-full overflow-hidden bg-black"
            style={{
              width: `${viewportWidth}px`,
              height: `${viewportHeight}px`,
              maxWidth: '100%',
              aspectRatio: `${viewportWidth}/${viewportHeight}`,
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUpOrLeave}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt=""
              onLoad={handleImageLoad}
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute max-w-none origin-center select-none"
              style={{
                width: imageSize.width ? `${imageSize.width}px` : 'auto',
                height: imageSize.height ? `${imageSize.height}px` : 'auto',
                left: `${viewportWidth / 2}px`,
                top: `${viewportHeight / 2}px`,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: '50% 50%',
              }}
            />

            {/* 切り抜き範囲。破線や光彩は使わず、細い実線で囲うだけ */}
            <svg
              className="pointer-events-none absolute inset-0 z-10 h-full w-full select-none"
              viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <mask id="crop-window-mask">
                  <rect width={viewportWidth} height={viewportHeight} fill="white" />
                  <rect x={cropX} y={cropY} width={cropW} height={cropH} fill="black" />
                </mask>
              </defs>
              <rect
                width={viewportWidth}
                height={viewportHeight}
                fill="#000000"
                fillOpacity="0.72"
                mask="url(#crop-window-mask)"
              />
              <rect
                x={cropX}
                y={cropY}
                width={cropW}
                height={cropH}
                fill="transparent"
                stroke="#F4F5F3"
                strokeWidth="1"
              />
            </svg>

            <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-20 text-center">
              <span className="text-note" style={{ color: '#F4F5F3' }}>
                ドラッグで位置を調整
              </span>
            </div>
          </div>

          <div className="mt-4 w-full">
            {/* 縦横比 */}
            <div className="rule-b pb-3">
              <span className="mb-2 block text-note text-hojo">縦横比</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setAspectRatio(p.ratio)}
                    className={`btn ${Math.abs(aspectRatio - p.ratio) < 0.01 ? 'btn-primary' : ''}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 拡大・回転 */}
            <div className="flex flex-col items-center gap-3 pt-3 sm:flex-row sm:justify-between">
              <div className="flex w-full flex-1 items-center gap-3 sm:w-auto">
                <span className="shrink-0 text-note text-hojo">拡大</span>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="h-[2px] w-full cursor-pointer appearance-none"
                  style={{ background: '#D7DAD3', accentColor: '#262A26' }}
                />
                <span className="num w-12 shrink-0 text-right text-note text-hojo">×{zoom.toFixed(2)}</span>
              </div>

              <button type="button" onClick={handleRotate} className="btn shrink-0">
                90°回転
              </button>
            </div>
          </div>
        </div>

        {/* 下部 */}
        <div className="rule-t rule-t-sumi flex items-center gap-3 px-5 py-4">
          <button type="button" onClick={handleApplyCrop} disabled={isDownloading} className="btn btn-primary">
            {isDownloading ? '処理中…' : '切り抜く'}
          </button>
          <button type="button" onClick={onCancel} disabled={isDownloading} className="btn">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
