/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ThemeConfig, CalendarSettings, CustomStyleConfig } from '../types';
import { THEMES } from '../data/themes';
import { startGoogleAuth } from '../utils/calendar';
import { X, Settings, Sparkles, AlertCircle, RefreshCw, Key, HelpCircle, LogOut, Sliders, Upload, Image as ImageIcon } from 'lucide-react';
import { ImageCropper } from './ImageCropper';


interface SettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTheme: ThemeConfig;
  onThemeChange: (themeId: ThemeConfig) => void;
  calendarSettings: CalendarSettings;
  onCalendarSettingsChange: (settings: CalendarSettings) => void;
  onLogout: () => void;
  customStyle: CustomStyleConfig;
  onCustomStyleChange: (style: CustomStyleConfig) => void;
}

export default function SettingModal({
  isOpen,
  onClose,
  activeTheme,
  onThemeChange,
  calendarSettings,
  onCalendarSettingsChange,
  onLogout,
  customStyle,
  onCustomStyleChange
}: SettingModalProps) {
  const [clientId, setClientId] = useState(calendarSettings.clientId || '');
  const [apiKey, setApiKey] = useState(calendarSettings.apiKey || '');
  const [calendarId, setCalendarId] = useState(calendarSettings.calendarId || 'primary');
  const [manualToken, setManualToken] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // File picker refs
  const headerFileRef = useRef<HTMLInputElement>(null);
  const catFileRef = useRef<HTMLInputElement>(null);

  // Custom style local states
  const [useCustomColor, setUseCustomColor] = useState(customStyle.useCustomColor);
  const [primaryColor, setPrimaryColor] = useState(customStyle.primaryColor || '#9b7fe8');
  const [themePreset, setThemePreset] = useState<'pastel' | 'sage' | 'autumn' | 'pop' | 'indigo' | 'custom'>(customStyle.themePreset || 'pastel');
  const [accentColor, setAccentColor] = useState(customStyle.accentColor || '#9b7fe8');
  const [bgColor, setBgColor] = useState(customStyle.bgColor || '#ffffff');
  const [sidebarColor, setSidebarColor] = useState(customStyle.sidebarColor || '#f8fafc');
  const [subColor, setSubColor] = useState(customStyle.subColor || '#e197b9');
  const [textAccentColor, setTextAccentColor] = useState(customStyle.textAccentColor || '#22173d');
  const [dashboardTitle, setDashboardTitle] = useState(customStyle.dashboardTitle || 'クリエイティブスタジオ・ダッシュボード');
  const [dashboardContent, setDashboardContent] = useState(customStyle.dashboardContent || '');
  const [headerBgUrl, setHeaderBgUrl] = useState(customStyle.headerBgUrl || '');
  const [deadlineCatUrl, setDeadlineCatUrl] = useState(customStyle.deadlineCatUrl || '');
  const [showEmojis, setShowEmojis] = useState(customStyle.showEmojis);
  const [showStickers, setShowStickers] = useState(customStyle.showStickers !== false);
  const [darkMode, setDarkMode] = useState(!!customStyle.darkMode);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
 
  // Hidden color pickers refs
  const accentColorRef = useRef<HTMLInputElement>(null);
  const bgColorRef = useRef<HTMLInputElement>(null);
  const sidebarColorRef = useRef<HTMLInputElement>(null);
  const subColorRef = useRef<HTMLInputElement>(null);
  const textAccentColorRef = useRef<HTMLInputElement>(null);
 
  const PRESET_THEMES = {
    pastel: {
      accentColor: '#ffd803',
      bgColor: '#fffffe',
      sidebarColor: '#f7f8fa',
      subColor: '#2d334a',
      textAccentColor: '#272343',
      dark: { accentColor: '#ffd803', bgColor: '#1a1b2d', sidebarColor: '#24253a', subColor: '#828ba3', textAccentColor: '#ffffff' }
    },
    sage: {
      accentColor: '#0e172c',
      bgColor: '#fec7d7',
      sidebarColor: '#ffdbe3',
      subColor: '#ff70a6',
      textAccentColor: '#0e172c',
      dark: { accentColor: '#fec7d7', bgColor: '#0e172c', sidebarColor: '#17213d', subColor: '#ff758f', textAccentColor: '#ffffff' }
    },
    autumn: {
      accentColor: '#6246ea',
      bgColor: '#fffffe',
      sidebarColor: '#f4f3ff',
      subColor: '#907eff',
      textAccentColor: '#2b2c34',
      dark: { accentColor: '#a78bfa', bgColor: '#15141c', sidebarColor: '#1d1c26', subColor: '#818cf8', textAccentColor: '#ffffff' }
    },
    pop: {
      accentColor: '#3da9fc',
      bgColor: '#fffffe',
      sidebarColor: '#f0f7ff',
      subColor: '#5f6c7b',
      textAccentColor: '#094067',
      dark: { accentColor: '#3da9fc', bgColor: '#09111e', sidebarColor: '#0f1d30', subColor: '#38bdf8', textAccentColor: '#ffffff' }
    },
    indigo: {
      accentColor: '#9a7b56',
      bgColor: '#fcfaf7',
      sidebarColor: '#f5ede4',
      subColor: '#c19b6c',
      textAccentColor: '#3e2723',
      dark: { accentColor: '#d7b58e', bgColor: '#1c120c', sidebarColor: '#281b12', subColor: '#be9b7b', textAccentColor: '#f5ebd0' }
    }
  };

  const applyPreset = (presetKey: 'pastel' | 'sage' | 'autumn' | 'pop' | 'indigo' | 'custom') => {
    setThemePreset(presetKey);
    if (presetKey !== 'custom') {
      const selectedTheme = PRESET_THEMES[presetKey];
      if (darkMode) {
        setAccentColor(selectedTheme.dark.accentColor);
        setBgColor(selectedTheme.dark.bgColor);
        setSidebarColor(selectedTheme.dark.sidebarColor);
        setSubColor(selectedTheme.dark.subColor);
        setTextAccentColor(selectedTheme.dark.textAccentColor);
      } else {
        setAccentColor(selectedTheme.accentColor);
        setBgColor(selectedTheme.bgColor);
        setSidebarColor(selectedTheme.sidebarColor);
        setSubColor(selectedTheme.subColor);
        setTextAccentColor(selectedTheme.textAccentColor);
      }
      setUseCustomColor(true);
    }
  };

  const handleDarkModeToggle = (enabled: boolean) => {
    setDarkMode(enabled);
    if (themePreset !== 'custom') {
      const selectedTheme = PRESET_THEMES[themePreset];
      if (enabled) {
        setAccentColor(selectedTheme.dark.accentColor);
        setBgColor(selectedTheme.dark.bgColor);
        setSidebarColor(selectedTheme.dark.sidebarColor);
        setSubColor(selectedTheme.dark.subColor);
        setTextAccentColor(selectedTheme.dark.textAccentColor);
      } else {
        setAccentColor(selectedTheme.accentColor);
        setBgColor(selectedTheme.bgColor);
        setSidebarColor(selectedTheme.sidebarColor);
        setSubColor(selectedTheme.subColor);
        setTextAccentColor(selectedTheme.textAccentColor);
      }
    } else {
      if (enabled) {
        if (bgColor === '#f4f3f9' || bgColor === '#f5f3f9' || bgColor === '#fcfbfa' || bgColor === '#edf2f0' || bgColor === '#f8faf7' || bgColor === '#faf6f0' || bgColor === '#faf7f2' || bgColor === '#f0f5fa' || bgColor === '#f7f9fc' || bgColor === '#f2f4f8' || bgColor === '#f8fafd' || bgColor.toLowerCase() === '#ffffff') {
          setBgColor('#111625');
          setSidebarColor('#171d30');
          setSubColor('#c49964');
          setTextAccentColor('#f3effc');
        }
      } else {
        if (bgColor === '#0d0a1b' || bgColor === '#0c0a18' || bgColor === '#081411' || bgColor === '#1b0a0e' || bgColor === '#1b0a0a' || bgColor === '#05101a' || bgColor === '#050a1b' || bgColor === '#0c1020' || bgColor === '#111625') {
          setBgColor('#ffffff');
          setSidebarColor('#f8fafc');
          setSubColor('#e197b9');
          setTextAccentColor('#22173d');
        }
      }
    }
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'header' | 'cat') => {
    const file = e.target.files?.[0];
    if (file) {
      const isHeader = field === 'header';
      // Header image supports up to 10MB because our Canvas Cropper will process and compress it
      const maxSize = isHeader ? 1024 * 1024 * 10 : 1024 * 1024 * 1.5;
      if (file.size > maxSize) {
        alert(isHeader 
          ? '画像ファイルは10MB以下のものを選択してください💧' 
          : '恐れ入りますが、画像ストレージ制限のためファイルサイズは1.5MB以下にしてください💧'
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64Url = event.target.result as string;
          if (isHeader) {
            setCropImageSrc(base64Url);
          } else {
            setDeadlineCatUrl(base64Url);
          }
        }
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset input to detect any brand new selection
    }
  };

  useEffect(() => {
    setClientId(calendarSettings.clientId || '');
    setApiKey(calendarSettings.apiKey || '');
    setCalendarId(calendarSettings.calendarId || 'primary');
  }, [calendarSettings, isOpen]);

  // Sync style states when opened
  useEffect(() => {
    if (isOpen) {
      setUseCustomColor(customStyle.useCustomColor);
      setPrimaryColor(customStyle.primaryColor || '#9b7fe8');
      setHeaderBgUrl(customStyle.headerBgUrl || '');
      setDeadlineCatUrl(customStyle.deadlineCatUrl || '');
      setShowEmojis(customStyle.showEmojis);
      setShowStickers(customStyle.showStickers !== false);
      setDarkMode(!!customStyle.darkMode);
      setThemePreset(customStyle.themePreset || 'pastel');
      setAccentColor(customStyle.accentColor || '#9b7fe8');
      setBgColor(customStyle.bgColor || '#f5f3f9');
      setSidebarColor(customStyle.sidebarColor || '#eae5f5');
      setSubColor(customStyle.subColor || '#e197b9');
      setTextAccentColor(customStyle.textAccentColor || '#22173d');
      setDashboardTitle(customStyle.dashboardTitle || 'クリエイティブスタジオ・ダッシュボード');
      setDashboardContent(customStyle.dashboardContent || '');
    }
  }, [customStyle, isOpen]);

  if (!isOpen) return null;

  const handleSaveSettings = () => {
    onCalendarSettingsChange({
      ...calendarSettings,
      clientId: clientId.trim(),
      apiKey: apiKey.trim(),
      calendarId: calendarId.trim() || 'primary',
    });
    
    // Save style modifications
    onCustomStyleChange({
      useCustomColor,
      primaryColor: accentColor, // align primaryColor with accentColor
      headerBgUrl: headerBgUrl.trim(),
      deadlineCatUrl: deadlineCatUrl.trim(),
      showEmojis,
      showStickers,
      darkMode,
      themePreset,
      accentColor,
      bgColor,
      sidebarColor,
      subColor,
      textAccentColor,
      dashboardTitle: dashboardTitle.trim(),
      dashboardContent: dashboardContent.trim()
    });

    alert('設定を保存しました！💖');
  };

  const handleRestoreDefaults = () => {
    if (window.confirm('デザインと設定を初期状態に戻しますか？（カスタムカラーやダッシュボード編集などもリセットされます）')) {
      setUseCustomColor(false);
      setPrimaryColor('#9b7fe8');
      setThemePreset('pastel');
      setAccentColor('#9b7fe8');
      setBgColor('#ffffff');
      setSidebarColor('#f8fafc');
      setSubColor('#e197b9');
      setTextAccentColor('#22173d');
      setDashboardTitle('クリエイティブスタジオ・ダッシュボード');
      setDashboardContent('');
      setHeaderBgUrl('');
      setDeadlineCatUrl('');
      setShowEmojis(true);
      setShowStickers(true);
      setDarkMode(false);
      
      onCustomStyleChange({
        useCustomColor: false,
        primaryColor: '#9b7fe8',
        headerBgUrl: '',
        deadlineCatUrl: '',
        showEmojis: true,
        showStickers: true,
        darkMode: false,
        themePreset: 'pastel',
        accentColor: '#9b7fe8',
        bgColor: '#ffffff',
        sidebarColor: '#f8fafc',
        subColor: '#e197b9',
        textAccentColor: '#22173d',
        dashboardTitle: 'クリエイティブスタジオ・ダッシュボード',
        dashboardContent: ''
      });
      alert('初期デザインに戻しました！✨');
    }
  };


  const handleGoogleLogin = () => {
    if (!clientId) {
      alert('Googleカレンダーを連携するには、Google Cloud Console から取得した「OAuth Client ID (クライアントID)」の設定が必要です。詳細は設定内のヘルプをご覧ください。💧');
      return;
    }
    // Save settings before redirecting
    onCalendarSettingsChange({
      ...calendarSettings,
      clientId: clientId.trim(),
      apiKey: apiKey.trim(),
      calendarId: calendarId.trim() || 'primary',
    });
    
    // Explicit requested scopes
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ];
    startGoogleAuth(clientId.trim(), scopes);
  };

  const handleApplyManualToken = () => {
    if (!manualToken.trim()) return;
    onCalendarSettingsChange({
      ...calendarSettings,
      accessToken: manualToken.trim(),
      tokenExpiry: Date.now() + 3600 * 1000 // 1 hour expiry guess
    });
    setManualToken('');
    alert('アクセストークンを手動適用しました！🔑');
  };

  const isDark = activeTheme.id === 'cosmic' || darkMode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
      <div 
        id="setting-modal-container"
        className={`w-full max-w-lg rounded-3xl p-6 overflow-hidden max-h-[85vh] flex flex-col ${activeTheme.cardClass} duration-300 transform scale-100 border-none shadow-2xl`}
        style={{ border: 'none' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-rose-500 animate-spin-slow" />
            <span className={`text-lg font-bold font-sans tracking-tight ${isDark ? 'text-indigo-100' : 'text-slate-800'}`}>
              環境設定＆カスタマイズ
            </span>
          </div>
          <button 
            id="close-settings-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-indigo-800/60 duration-250 cursor-pointer"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto pr-1 my-4 space-y-6">
          
          {/* Theme preset customization (matches user image layout exactly) */}
          <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <h2 className={`text-sm font-semibold flex items-center gap-1.5 ${isDark ? 'text-indigo-200' : 'text-slate-700'}`}>
              <Sparkles className="w-4 h-4 text-emerald-500" /> テーマ
            </h2>
            <div className="flex flex-wrap gap-2">
              {(['pastel', 'sage', 'autumn', 'pop', 'indigo', 'custom'] as const).map((preset) => {
                const isSelected = themePreset === preset;
                const labels: Record<string, string> = {
                  pastel: 'ミモザネイビー 🍋',
                  sage: 'ストロベリーミルク 🍓',
                  autumn: 'ロイヤルアメジスト 💜',
                  pop: 'マリンソーダ 🌊',
                  indigo: 'クラシックモカ ☕',
                  custom: 'カスタム 🎨'
                };
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      applyPreset(preset);
                    }}
                    className={`px-4 py-2.5 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'text-white border-transparent shadow shadow-md scale-102 font-extrabold'
                        : isDark
                          ? 'border-indigo-850 hover:border-indigo-750 text-indigo-300 bg-indigo-950/20 hover:bg-indigo-900/10'
                          : 'border-slate-200 hover:border-slate-300 text-slate-705 bg-white hover:bg-slate-50'
                    }`}
                    style={isSelected ? { backgroundColor: accentColor, borderColor: accentColor } : {}}
                  >
                    {isSelected && <span className="text-[10px]">✓</span>}
                    {labels[preset]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color customizations box styled perfectly like the uploaded screenshot */}
          <div className={`p-4 rounded-3xl ${
            isDark
              ? 'bg-indigo-950/40'
              : 'bg-[#f7f6fc]'
          } space-y-3`}>
            
            {/* Row 1: アクセントカラー */}
            <div className={`flex items-center justify-between p-3 rounded-2xl transition duration-150 ${isDark ? 'bg-indigo-900/30 hover:bg-indigo-900/50' : 'bg-white hover:bg-white/80'} shadow-xs`}>
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => accentColorRef.current?.click()}
                  className="w-8 h-8 rounded-xl border border-black/10 shadow-sm cursor-pointer transition transform hover:scale-105"
                  style={{ backgroundColor: accentColor }}
                />
                <span className={`text-xs font-bold leading-none ${isDark ? 'text-indigo-200' : 'text-slate-705'}`}>アクセントカラー</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => {
                    setAccentColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className={`w-20 text-[11px] text-right font-mono px-1.5 py-1 rounded border border-transparent focus:border-indigo-500 bg-transparent ${isDark ? 'text-indigo-300' : 'text-slate-500'}`}
                />
                <input
                  ref={accentColorRef}
                  type="color"
                  value={accentColor}
                  onChange={(e) => {
                    setAccentColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => accentColorRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl hover:brightness-105 active:scale-95 duration-100 transition whitespace-nowrap cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  変更
                </button>
              </div>
            </div>

            {/* Row 2: 背景色 */}
            <div className={`flex items-center justify-between p-3 rounded-2xl transition duration-150 ${isDark ? 'bg-indigo-900/30 hover:bg-indigo-900/50' : 'bg-white hover:bg-white/80'} shadow-xs`}>
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => bgColorRef.current?.click()}
                  className="w-8 h-8 rounded-xl border border-black/10 shadow-sm cursor-pointer transition transform hover:scale-105"
                  style={{ backgroundColor: bgColor }}
                />
                <span className={`text-xs font-bold leading-none ${isDark ? 'text-indigo-200' : 'text-slate-705'}`}>背景色</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => {
                    setBgColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className={`w-20 text-[11px] text-right font-mono px-1.5 py-1 rounded border border-transparent focus:border-indigo-500 bg-transparent ${isDark ? 'text-indigo-300' : 'text-slate-500'}`}
                />
                <input
                  ref={bgColorRef}
                  type="color"
                  value={bgColor}
                  onChange={(e) => {
                    setBgColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => bgColorRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl hover:brightness-105 active:scale-95 duration-100 transition whitespace-nowrap cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  変更
                </button>
              </div>
            </div>

            {/* Row 3: サイドバー色 */}
            <div className={`flex items-center justify-between p-3 rounded-2xl transition duration-150 ${isDark ? 'bg-indigo-900/30 hover:bg-indigo-900/50' : 'bg-white hover:bg-white/80'} shadow-xs`}>
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => sidebarColorRef.current?.click()}
                  className="w-8 h-8 rounded-xl border border-black/10 shadow-sm cursor-pointer transition transform hover:scale-105"
                  style={{ backgroundColor: sidebarColor }}
                />
                <span className={`text-xs font-bold leading-none ${isDark ? 'text-indigo-200' : 'text-slate-705'}`}>サイドバー色</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={sidebarColor}
                  onChange={(e) => {
                    setSidebarColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className={`w-20 text-[11px] text-right font-mono px-1.5 py-1 rounded border border-transparent focus:border-indigo-500 bg-transparent ${isDark ? 'text-indigo-300' : 'text-slate-500'}`}
                />
                <input
                  ref={sidebarColorRef}
                  type="color"
                  value={sidebarColor}
                  onChange={(e) => {
                    setSidebarColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => sidebarColorRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl hover:brightness-105 active:scale-95 duration-100 transition whitespace-nowrap cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  変更
                </button>
              </div>
            </div>

            {/* Row 4: サブカラー */}
            <div className={`flex items-center justify-between p-3 rounded-2xl transition duration-150 ${isDark ? 'bg-indigo-900/30 hover:bg-indigo-900/50' : 'bg-white hover:bg-white/80'} shadow-xs`}>
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => subColorRef.current?.click()}
                  className="w-8 h-8 rounded-xl border border-black/10 shadow-sm cursor-pointer transition transform hover:scale-105"
                  style={{ backgroundColor: subColor }}
                />
                <span className={`text-xs font-bold leading-none ${isDark ? 'text-indigo-200' : 'text-slate-705'}`}>サブカラー</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={subColor}
                  onChange={(e) => {
                    setSubColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className={`w-20 text-[11px] text-right font-mono px-1.5 py-1 rounded border border-transparent focus:border-indigo-500 bg-transparent ${isDark ? 'text-indigo-300' : 'text-slate-500'}`}
                />
                <input
                  ref={subColorRef}
                  type="color"
                  value={subColor}
                  onChange={(e) => {
                    setSubColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => subColorRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl hover:brightness-105 active:scale-95 duration-100 transition whitespace-nowrap cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  変更
                </button>
              </div>
            </div>

            {/* Row 5: テキストアクセント */}
            <div className={`flex items-center justify-between p-3 rounded-2xl transition duration-150 ${isDark ? 'bg-indigo-900/30 hover:bg-indigo-900/50' : 'bg-white hover:bg-white/80'} shadow-xs`}>
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => textAccentColorRef.current?.click()}
                  className="w-8 h-8 rounded-xl border border-black/10 shadow-sm cursor-pointer transition transform hover:scale-105"
                  style={{ backgroundColor: textAccentColor }}
                />
                <span className={`text-xs font-bold leading-none ${isDark ? 'text-indigo-200' : 'text-slate-705'}`}>テキスト／額縁色</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={textAccentColor}
                  onChange={(e) => {
                    setTextAccentColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className={`w-20 text-[11px] text-right font-mono px-1.5 py-1 rounded border border-transparent focus:border-indigo-500 bg-transparent ${isDark ? 'text-indigo-300' : 'text-slate-500'}`}
                />
                <input
                  ref={textAccentColorRef}
                  type="color"
                  value={textAccentColor}
                  onChange={(e) => {
                    setTextAccentColor(e.target.value);
                    setThemePreset('custom');
                    setUseCustomColor(true);
                  }}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => textAccentColorRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl hover:brightness-105 active:scale-95 duration-100 transition whitespace-nowrap cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  変更
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Styling & Upload Elements */}
        <div className="space-y-4">
          <h2 className={`text-sm font-semibold flex items-center gap-1.5 ${isDark ? 'text-indigo-200' : 'text-slate-700'}`}>
            <Sliders className="w-4 h-4 text-rose-500" /> UIのデコ・パーツ設定
          </h2>

          {/* Custom Dashboard Title Input */}
          <div className="space-y-1.5 animate-fade-in animate-duration-200">
            <label className="block text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              📝 ダッシュボードのタイトル
            </label>
            <input
              id="input-custom-dashboard-title"
              type="text"
              placeholder="クリエイティブスタジオ・ダッシュボード"
              value={dashboardTitle}
              onChange={(e) => setDashboardTitle(e.target.value)}
              className={`w-full text-xs px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-1 ${
                isDark 
                  ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-450'
              }`}
            />
          </div>

          {/* Custom Dashboard Content Input */}
          <div className="space-y-1.5 animate-fade-in animate-duration-200">
            <label className="block text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              📝 ダッシュボードのウェルカムテキスト（改行はそのまま反映されます）
            </label>
            <textarea
              id="input-custom-dashboard-content"
              placeholder="（未入力の場合はデフォルトの説明が表示されます）"
              value={dashboardContent}
              onChange={(e) => setDashboardContent(e.target.value)}
              rows={3}
              className={`w-full text-xs px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-1 ${
                isDark 
                  ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-450'
              }`}
            />
          </div>

          {/* Restore Defaults Trigger */}
          <div className="p-2.5 rounded-xl bg-rose-50/10 dark:bg-indigo-950/5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">
              デザイン変更を戻したい場合はいつでも初期状態（標準に戻す）に戻せます。
            </span>
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="py-1.5 px-3 text-[11px] font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900 border border-rose-200 dark:border-indigo-800 rounded-xl transition cursor-pointer"
            >
              🔄 初期状態に戻す
            </button>
          </div>

          {/* Custom Header decoration background image */}
          <div className="space-y-1.5 animate-fade-in">
            <label className="block text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              🖼️ 自作ヘッダー飾りの画像 (URL または PCから選択)
            </label>
            <div className="flex gap-2">
              <input
                id="input-custom-header-bg"
                type="text"
                placeholder="https://example.com/art.png"
                value={headerBgUrl && headerBgUrl.startsWith('data:') ? '📂 ローカルPCから読み込まれた画像データ' : headerBgUrl}
                disabled={headerBgUrl && headerBgUrl.startsWith('data:') ? true : false}
                onChange={(e) => setHeaderBgUrl(e.target.value)}
                className={`flex-1 text-xs px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-1 ${
                  isDark 
                    ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-450'
                }`}
              />
              <button
                type="button"
                onClick={() => headerFileRef.current?.click()}
                className="py-2 px-3 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-indigo-950/40 dark:hover:bg-indigo-900 border rounded-xl font-bold flex items-center gap-1 cursor-pointer duration-155 shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>PCから選択</span>
              </button>
              {headerBgUrl && (
                <button
                  type="button"
                  onClick={() => setHeaderBgUrl('')}
                  className="py-2 px-2 text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl font-bold cursor-pointer duration-155 shrink-0"
                  title="リセット"
                >
                  消去
                </button>
              )}
            </div>
            <input
              ref={headerFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLocalFileChange(e, 'header')}
            />
            {headerBgUrl && (
              <div className="mt-1 flex items-center gap-2 p-1.5 rounded-xl bg-slate-50/30">
                <span className="text-[9px] text-slate-400 font-bold">プレビュー:</span>
                <img 
                  src={headerBgUrl} 
                  alt="header preview" 
                  referrerPolicy="no-referrer"
                  className="h-10 w-24 object-cover rounded-md border shadow-xs" 
                />
              </div>
            )}
            <p className="text-[10px] text-slate-455">
              ご自身でお持ちのバナー画像、ロゴ、お好きなキャラクター画像をアップロードまたはURL入力できます。ヘッダーの右上に美しく重ね合わされます。
            </p>
          </div>

          {/* Custom Scared Cat background image */}
          <div className="space-y-1.5 animate-fade-in">
            <label className="block text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              🐱 締切警告「焦る猫ちゃん」の画像 (URL または PCから選択)
            </label>
            <div className="flex gap-2">
              <input
                id="input-custom-cat-img"
                type="text"
                placeholder="https://example.com/scared_cat.png"
                value={deadlineCatUrl && deadlineCatUrl.startsWith('data:') ? '📂 ローカルPCから読み込まれた画像データ' : deadlineCatUrl}
                disabled={deadlineCatUrl && deadlineCatUrl.startsWith('data:') ? true : false}
                onChange={(e) => setDeadlineCatUrl(e.target.value)}
                className={`flex-1 text-xs px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-1 ${
                  isDark 
                    ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-450'
                }`}
              />
              <button
                type="button"
                onClick={() => catFileRef.current?.click()}
                className="py-2 px-3 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-indigo-950/40 dark:hover:bg-indigo-900 border rounded-xl font-bold flex items-center gap-1 cursor-pointer duration-155 shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>PCから選択</span>
              </button>
              {deadlineCatUrl && (
                <button
                  type="button"
                  onClick={() => setDeadlineCatUrl('')}
                  className="py-2 px-2 text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl font-bold cursor-pointer duration-155 shrink-0"
                  title="リセット"
                >
                  消去
                </button>
              )}
            </div>
            <input
              ref={catFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLocalFileChange(e, 'cat')}
            />
            {deadlineCatUrl && (
              <div className="mt-1 flex items-center gap-2 p-1.5 rounded-xl bg-slate-50/30">
                <span className="text-[9px] text-slate-400 font-bold">プレビュー:</span>
                <img 
                  src={deadlineCatUrl} 
                  alt="cat preview" 
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 object-contain rounded-md border shadow-xs" 
                />
              </div>
            )}
            <p className="text-[10px] text-slate-455">
              お仕事の進行盤で、締切3日前（あと3日〜あと1日など）に警告として現れる「猫ちゃんスタンプ」をご自身の推しイラスト画像や愛猫、自作の焦り顔画像へ切り替えることができます✨
            </p>
          </div>

          {/* Progress Stickers Toggle */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/40 dark:bg-indigo-950/10">
            <label htmlFor="checkbox-stickers-toggle" className="text-xs font-semibold cursor-pointer select-none">
              🎨 進捗ステッカー（PC画像スタンプ等）を表示する
            </label>
            <input
              id="checkbox-stickers-toggle"
              type="checkbox"
              checked={showStickers}
              onChange={(e) => setShowStickers(e.target.checked)}
              className="rounded accent-indigo-500 cursor-pointer w-4 h-4"
            />
          </div>

          {/* Dark Mode Toggle */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/40 dark:bg-indigo-950/10">
            <label htmlFor="checkbox-darkmode-toggle" className="text-xs font-semibold cursor-pointer select-none">
              🌙 目に優しいダークモードを有効にする
            </label>
            <input
              id="checkbox-darkmode-toggle"
              type="checkbox"
              checked={darkMode}
              onChange={(e) => handleDarkModeToggle(e.target.checked)}
              className="rounded accent-indigo-500 cursor-pointer w-4 h-4"
            />
          </div>
        </div>

        {/* Google Calendar sync settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-sm font-semibold flex items-center gap-1.5 ${isDark ? 'text-indigo-200' : 'text-slate-700'}`}>
              <Key className="w-4 h-4 text-emerald-500" /> Google カレンダー連携
            </h2>
            <button
              id="toggle-help-btn"
              onClick={() => setShowHelp(!showHelp)}
              className="text-xs text-indigo-400 hover:text-indigo-500 flex items-center gap-0.5"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              連携のやり方は？
            </button>
          </div>

          {/* Help description */}
          {showHelp && (
            <div className={`p-4 rounded-2xl text-xs leading-relaxed mb-4 ${isDark ? 'bg-indigo-950/20 text-indigo-200' : 'bg-indigo-50/50 text-indigo-850'}`}>
              <p className="font-semibold mb-1">💡 Googleカレンダー連携の手順:</p>
              <ol className="list-decimal pl-4 space-y-1 mt-1">
                <li>
                  <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="underline text-indigo-600 dark:text-indigo-400">
                    Google Cloud Console
                  </a> にアクセスしてプロジェクトを作成。
                </li>
                <li><strong>Google Calendar API</strong> を有効にする。</li>
                <li>「OAuth同意画面」を作成し（テスト・外部）、<strong>テストユーザー</strong>にあなたのアカウントを追加。</li>
                <li>「認証情報」から <strong>OAuth クライアントID</strong> (ウェブアプリケーション型) を作成：
                  <ul className="list-disc pl-4 mt-0.5 text-[11px] opacity-90">
                    <li>承認済みのJavaScript生成元: <code className="bg-slate-100 dark:bg-indigo-900 border px-1 rounded">{window.location.origin}</code></li>
                    <li>承認済みのリダイレクトURI: <code className="bg-slate-100 dark:bg-indigo-900 border px-1 rounded">{window.location.origin + window.location.pathname}</code></li>
                  </ul>
                </li>
                <li>作成された クライアントID を下の入力欄に入力します。</li>
                <li>「カレンダーに接続」を押してGoogleセキュリティ承認。</li>
              </ol>
            </div>
          )}

          <div className="space-y-3">
            {/* One-click quick connection prompt if Client ID is already entered */}
            {clientId && !calendarSettings.accessToken && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-center leading-relaxed space-y-2.5 my-1 hover:bg-amber-500/15 transition duration-150 rounded-2xl shadow-xs">
                <div className="flex flex-col items-center gap-1">
                  <Sparkles className="w-4.5 h-4.5 text-amber-500 animate-spin-slow" />
                  <p className="text-xs font-black text-amber-700 dark:text-amber-300">
                    ⚡ クライアントIDは設定済みです！
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-350 leading-tight">
                    ワンクリックで直ちにGoogleカレンダーと安全に認証連携できます。✨
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="py-1.5 px-3 text-[11px] font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl cursor-pointer duration-155 shadow-xs flex items-center justify-center gap-1.5 w-full transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  ⚡ ワンクリックでカレンダー接続 🔑
                </button>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Google OAuth クライアント ID
              </label>
              <input
                id="oauth-client-id-input"
                type="text"
                placeholder="123456789-abc.apps.googleusercontent.com"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-1 ${
                  isDark 
                    ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Google API キー (オプション)
                </label>
                <input
                  id="api-key-input"
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={`w-full text-xs px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-1 ${
                    isDark 
                      ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-455'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  連携カレンダーID (規定: primary)
                </label>
                <input
                  id="calendar-id-input"
                  type="text"
                  placeholder="primary"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  className={`w-full text-xs px-3 py-2 rounded-xl border focus:outline-hidden focus:ring-1 ${
                    isDark 
                      ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-450'
                  }`}
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                id="google-connect-oauth-btn"
                type="button"
                onClick={handleGoogleLogin}
                className={`w-full text-xs py-2 px-3 rounded-xl font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-98 duration-100 ${
                  calendarSettings.accessToken 
                    ? 'bg-emerald-500 hover:bg-emerald-600/90 text-white' 
                    : activeTheme.primaryClass
                }`}
              >
                {calendarSettings.accessToken ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                    認証済み (再接続)
                  </>
                ) : (
                  <>🔑 Google カレンダーに接続</>
                )}
              </button>
            </div>
          </div>

          {/* Token Status / Manual injection */}
          <div className="mt-4 p-3 bg-slate-50 dark:bg-indigo-950/40 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">認証接続ステータス</span>
              {calendarSettings.accessToken ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  ログイン中
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                  未接続
                </span>
              )}
            </div>

            {calendarSettings.accessToken ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-indigo-200 font-mono truncate max-w-[280px]">
                  トークン: {calendarSettings.accessToken.substring(0, 15)}...
                </span>
                <button
                  id="google-logout-btn"
                  onClick={onLogout}
                  className="text-rose-500 hover:text-rose-600 text-xs flex items-center gap-1 cursor-pointer font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5" /> ログアウト
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-400">
                  ⚠️ もしOAuthポップアップが制限される環境の場合、認証コード/トークンを手動で設定できます：
                </p>
                <div className="flex gap-2">
                  <input
                    id="manual-access-token-input"
                    type="password"
                    placeholder="手動アクセストークン(ya29...)"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className={`flex-1 text-[11px] px-3 py-1.5 rounded-xl border focus:outline-hidden ${
                      isDark 
                        ? 'bg-indigo-950/80 border-indigo-700 text-white' 
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  />
                  <button
                    id="apply-manual-token-btn"
                    onClick={handleApplyManualToken}
                    className="text-xs py-1.5 px-3 bg-indigo-500 hover:bg-slate-400 text-white rounded-xl cursor-pointer"
                  >
                    適用
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
        <div className="pt-4 flex-shrink-0 flex justify-end gap-3">
          <button
            id="close-setting-footer-btn"
            onClick={onClose}
            className="py-2.5 px-5 rounded-2xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-indigo-300 dark:hover:bg-indigo-950/40 transition cursor-pointer"
          >
            キャンセル
          </button>
          <button
            id="save-settings-btn-footer"
            onClick={handleSaveSettings}
            className={`py-2.5 px-6 rounded-2xl text-xs font-extrabold cursor-pointer transition transform hover:scale-[1.02] shadow-md text-white ${useCustomColor ? 'custom-primary-bg' : activeTheme.primaryClass}`}
            style={useCustomColor ? { backgroundColor: accentColor } : {}}
          >
            💾 設定内容を保存して閉じる
          </button>
        </div>
      </div>

      {/* Embedded interactive image crop module */}
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          isDark={isDark}
          onCropComplete={(croppedBase64) => {
            setHeaderBgUrl(croppedBase64);
            setCropImageSrc(null);
          }}
          onCancel={() => {
            setCropImageSrc(null);
          }}
        />
      )}
    </div>
  );
}
