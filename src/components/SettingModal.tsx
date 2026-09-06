/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {CalendarSettings, CustomStyleConfig } from '../types';
import { toast } from '../utils/toast';

// 画像トリミングUIは実際に画像を選ぶまで不要なので遅延読み込み
const ImageCropper = lazy(() => import('./ImageCropper').then((m) => ({ default: m.ImageCropper })));

const DEFAULT_ACCENT = '#2F6B4F'; // 青竹

interface SettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  calendarSettings: CalendarSettings;
  onCalendarSettingsChange: (settings: CalendarSettings) => void;
  onLogout: () => void;
  onConnect?: () => void;
  customStyle: CustomStyleConfig;
  onCustomStyleChange: (style: CustomStyleConfig) => void;
}

/** 罫線で区切った 1 行。ラベル 96px（スマホ 76px）・12px 補助 */
function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rule-b flex items-center gap-3 py-[11px] md:py-3">
      <div className="w-[76px] shrink-0 md:w-[120px]">
        <span className="block text-note text-hojo">{label}</span>
        {note && <span className="mt-0.5 block text-note text-hojo">{note}</span>}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 mb-1 text-note text-hojo">{children}</h3>;
}

/** 入／切 の枠線ボタン。選択＝枠墨、非選択＝枠罫色・文字補助 */
function OnOff({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(true)} className={`btn ${value ? 'btn-primary' : ''}`}>
        入
      </button>
      <button type="button" onClick={() => onChange(false)} className={`btn ${!value ? 'btn-primary' : ''}`}>
        切
      </button>
    </div>
  );
}

export default function SettingModal({
  isOpen,
  onClose,
  calendarSettings,
  onCalendarSettingsChange,
  onConnect,
  customStyle,
  onCustomStyleChange,
}: SettingModalProps) {
  const [clientId, setClientId] = useState(calendarSettings.clientId || '');
  const [apiKey, setApiKey] = useState(calendarSettings.apiKey || '');
  const [calendarId, setCalendarId] = useState(calendarSettings.calendarId || 'primary');
  const [manualToken, setManualToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const headerFileRef = useRef<HTMLInputElement>(null);

  // 選べるのはアクセント1色だけ。地・文字・罫は薄墨紙の固定値
  const [accentColor, setAccentColor] = useState(customStyle.accentColor || DEFAULT_ACCENT);
  const [isCustomAccent, setIsCustomAccent] = useState(customStyle.themePreset === 'custom');
  const [headerBgUrl, setHeaderBgUrl] = useState(customStyle.headerBgUrl || '');
  const [showStickers, setShowStickers] = useState(customStyle.showStickers !== false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  useEffect(() => {
    setClientId(calendarSettings.clientId || '');
    setApiKey(calendarSettings.apiKey || '');
    setCalendarId(calendarSettings.calendarId || 'primary');
  }, [calendarSettings, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setAccentColor(customStyle.accentColor || DEFAULT_ACCENT);
      setIsCustomAccent(customStyle.themePreset === 'custom');
      setHeaderBgUrl(customStyle.headerBgUrl || '');
      setShowStickers(customStyle.showStickers !== false);
    }
  }, [customStyle, isOpen]);

  if (!isOpen) return null;

  const handleHeaderFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024 * 10) {
      toast('画像ファイルは10MB以下のものを選んでください', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) setCropImageSrc(event.target.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /** データ構造は変えないため、使わなくなった項目も既存の値をそのまま持ち回す */
  const writeStyle = (patch: Partial<CustomStyleConfig>) =>
    onCustomStyleChange({ ...customStyle, ...patch });

  const handleSaveSettings = () => {
    onCalendarSettingsChange({
      ...calendarSettings,
      clientId: clientId.trim(),
      apiKey: apiKey.trim(),
      calendarId: calendarId.trim() || 'primary',
    });

    writeStyle({
      useCustomColor: true,
      primaryColor: accentColor,
      accentColor,
      themePreset: isCustomAccent ? 'custom' : 'pastel',
      headerBgUrl: headerBgUrl.trim(),
      showStickers,
    });

    toast('設定を保存しました', 'success');
    onClose();
  };

  const handleGoogleLogin = () => {
    onCalendarSettingsChange({
      ...calendarSettings,
      clientId: clientId.trim(),
      apiKey: apiKey.trim(),
      calendarId: calendarId.trim() || 'primary',
    });
    if (onConnect) onConnect();
  };

  const handleApplyManualToken = () => {
    if (!manualToken.trim()) return;
    onCalendarSettingsChange({
      ...calendarSettings,
      accessToken: manualToken.trim(),
      tokenExpiry: Date.now() + 3600 * 1000,
    });
    setManualToken('');
    toast('アクセストークンを適用しました', 'success');
  };

  const connected = !!calendarSettings.accessToken;

  return (
    <aside
      id="setting-drawer"
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-paper md:w-[520px]"
      style={{ borderLeft: '0.5px solid #262A26' }}
      role="dialog"
      aria-label="設定"
    >
      {/* 見出し */}
      <div className="rule-b rule-b-sumi flex items-baseline justify-between gap-4 px-5 pb-3 pt-5 md:px-8">
        <h2 className="mincho text-title leading-none">設定</h2>
        <button onClick={onClose} className="num tap-icon shrink-0 text-body text-hojo" title="閉じる">
          ×
        </button>
      </div>

      {/* 本体 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 md:px-8">
        <SectionHead>連携</SectionHead>

        <Row
          label="Googleカレンダー"
          note={connected ? '接続済み' : '未接続'}
        >
          {connected ? (
            <button type="button" onClick={handleGoogleLogin} className="btn">
              つなぎ直す
            </button>
          ) : (
            <button type="button" onClick={handleGoogleLogin} className="btn btn-primary">
              接続する
            </button>
          )}
        </Row>

        <Row label="カレンダーID">
          <input
            type="text"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className="field w-full text-right text-note"
            placeholder="primary"
          />
        </Row>

        <SectionHead>表示</SectionHead>

        <Row label="注意の色" note="締切間近・未入金など">
          <span className="num text-note text-hojo">{accentColor.toUpperCase()}</span>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => {
              setAccentColor(e.target.value);
              setIsCustomAccent(true);
            }}
            className="h-7 w-10 cursor-pointer"
            style={{ border: '0.5px solid #D7DAD3', borderRadius: '2px', background: 'transparent', padding: '2px' }}
            title="注意表示に使う色"
          />
          <button
            type="button"
            onClick={() => {
              setAccentColor(DEFAULT_ACCENT);
              setIsCustomAccent(false);
            }}
            className="btn"
          >
            青竹に戻す
          </button>
        </Row>

        <Row label="ヘッダー画像" note={headerBgUrl ? '設定あり' : 'なし'}>
          <button type="button" onClick={() => headerFileRef.current?.click()} className="btn">
            {headerBgUrl ? '変える' : '選ぶ'}
          </button>
          {headerBgUrl && (
            <button type="button" onClick={() => setHeaderBgUrl('')} className="btn">
              外す
            </button>
          )}
          <input
            ref={headerFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleHeaderFileChange}
          />
        </Row>

        <Row label="ステッカー" note="画面に置く飾り">
          <OnOff value={showStickers} onChange={setShowStickers} />
        </Row>

        <SectionHead>工程テンプレート</SectionHead>
        <Row label="漫画">
          <span className="text-note text-hojo">ネーム／下書き／線画／仕上げ</span>
        </Row>
        <Row label="イラスト">
          <span className="text-note text-hojo">ラフ／下書き／線画／着色／仕上げ</span>
        </Row>
        <Row label="打合せ">
          <span className="text-note text-hojo">事前準備／ラフ・資料提示／日程・見積調整／決定事項メモ／お礼・共有</span>
        </Row>

        <SectionHead>詳細</SectionHead>
        <Row label="詳細設定" note="通常は触らなくて構いません">
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="btn">
            {showAdvanced ? '隠す' : '開く'}
          </button>
        </Row>

        {showAdvanced && (
          <>
            <Row label="クライアントID">
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="field w-full text-right text-note"
                placeholder="—"
              />
            </Row>
            <Row label="APIキー">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="field w-full text-right text-note"
                placeholder="—"
              />
            </Row>
            <Row label="アクセストークン" note="手動で入れる場合">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="field w-full text-right text-note"
                placeholder="—"
              />
              <button type="button" onClick={handleApplyManualToken} className="btn shrink-0">
                適用
              </button>
            </Row>
          </>
        )}
      </div>

      {/* 下部 */}
      <div className="rule-t rule-t-sumi flex items-center gap-3 px-5 py-4 md:px-8">
        <button type="button" onClick={handleSaveSettings} className="btn btn-primary">
          保存
        </button>
        <button type="button" onClick={onClose} className="btn">
          取消
        </button>
      </div>

      {/* ヘッダー画像のトリミング */}
      {cropImageSrc && (
        <Suspense fallback={null}>
          <ImageCropper
            imageSrc={cropImageSrc}
            isDark={false}
            onCropComplete={(croppedBase64) => {
              setHeaderBgUrl(croppedBase64);
              setCropImageSrc(null);
            }}
            onCancel={() => setCropImageSrc(null)}
          />
        </Suspense>
      )}
    </aside>
  );
}
