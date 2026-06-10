/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Task, ThemeConfig, CustomStyleConfig } from '../types';
import { Check, Calendar, User, DollarSign, Clock, HelpCircle, AlertTriangle, Sparkles, RefreshCw, Trash2, Edit } from 'lucide-react';

interface ProgressTableProps {
  task: Task | null;
  tasks?: Task[];
  onSelectTaskId?: (taskId: string) => void;
  activeTheme: ThemeConfig;
  onToggleCell: (taskId: string, stepName: string, pageIndex: number) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onSyncCalendar: (task: Task) => void;
  calendarConnected: boolean;
  onBackToList?: () => void;
  customStyle?: CustomStyleConfig;
}

const PRESET_THEME_COLORS = {
  pastel: {
    accentColor: '#ffd803',
    subColor: '#2d334a',
    dark: { accentColor: '#ffd803', subColor: '#828ba3' }
  },
  sage: {
    accentColor: '#0e172c',
    subColor: '#ff70a6',
    dark: { accentColor: '#fec7d7', subColor: '#ff758f' }
  },
  autumn: {
    accentColor: '#6246ea',
    subColor: '#907eff',
    dark: { accentColor: '#a78bfa', subColor: '#818cf8' }
  },
  pop: {
    accentColor: '#3da9fc',
    subColor: '#5f6c7b',
    dark: { accentColor: '#3da9fc', subColor: '#38bdf8' }
  },
  indigo: {
    accentColor: '#9a7b56',
    subColor: '#c19b6c',
    dark: { accentColor: '#d7b58e', subColor: '#be9b7b' }
  }
};

export default function ProgressTable({
  task,
  tasks = [],
  onSelectTaskId,
  activeTheme,
  onToggleCell,
  onEditTask,
  onDeleteTask,
  onSyncCalendar,
  calendarConnected,
  onBackToList,
  customStyle = { useCustomColor: false, primaryColor: '', headerBgUrl: '', deadlineCatUrl: '', showEmojis: true, showStickers: true, darkMode: false }
}: ProgressTableProps) {


  const [gridFilter, setGridFilter] = React.useState<'all' | 'todo' | 'done'>('all');

  const isDark = activeTheme.id === 'cosmic' || customStyle?.darkMode;
  const showEmojis = customStyle?.showEmojis !== false;

  const currentPreset = customStyle?.themePreset || 'pastel';
  const isPresetCustom = currentPreset === 'custom';
  const presetDefaults = PRESET_THEME_COLORS[currentPreset as 'pastel' | 'sage' | 'autumn' | 'pop' | 'indigo'] || PRESET_THEME_COLORS.pastel;

  const defaultAccent = isDark ? presetDefaults.dark.accentColor : presetDefaults.accentColor;
  const defaultSub = isDark ? presetDefaults.dark.subColor : presetDefaults.subColor;

  // Let's resolve the actual names so they match types and prevent properties errors
  const customAccent = isPresetCustom ? (customStyle?.accentColor || '#9b7fe8') : (isDark ? presetDefaults.dark.accentColor : presetDefaults.accentColor);
  const customSub = isPresetCustom ? (customStyle?.subColor || '#e197b9') : (isDark ? presetDefaults.dark.subColor : presetDefaults.subColor);

  // Get steps depending on task type
  const stepsList = useMemo(() => {
    if (!task) return [];
    if (task.type === 'manga') {
      return ['ネーム', '下書き', '線画', '仕上げ'];
    } else if (task.type === 'illust') {
      return ['ラフ', '下書き', '線画', '着色', '仕上げ'];
    } else {
      return ['事前準備', 'ラフ・資料提示', '日程・見積調整', '決定事項メモ', 'お礼・共有'];
    }
  }, [task?.type]);

  // Array of page indices
  const pageArray = useMemo(() => {
    if (!task) return [];
    if (task.type === 'meeting') return [1];
    return Array.from({ length: task.totalPages }, (_, i) => i + 1);
  }, [task]);

  // Calculations for progress percentage
  const stats = useMemo(() => {
    if (!task || stepsList.length === 0) return { checked: 0, total: 0, percent: 0 };
    let checked = 0;
    const itemsPerStep = task.type === 'manga' ? task.totalPages : 1;
    let total = stepsList.length * itemsPerStep;

    stepsList.forEach((step) => {
      const pageStates = task.steps[step];
      if (pageStates) {
        // Only count up to itemsPerStep limit to prevent index out of bounds on mode changes
        for (let i = 0; i < itemsPerStep; i++) {
          if (pageStates[i]) checked++;
        }
      }
    });

    const percent = Math.round((checked / total) * 100);
    return { checked, total, percent };
  }, [task, stepsList]);

  // Find unchecked checkpoints
  const uncheckedItems = useMemo(() => {
    if (!task) return [];
    const items: { step: string; pageIdx: number; label: string }[] = [];
    const itemsPerStep = task.type === 'manga' ? task.totalPages : 1;
    stepsList.forEach((step) => {
      const pageStates = task.steps[step] || [];
      for (let i = 0; i < itemsPerStep; i++) {
        if (!pageStates[i]) {
          let label = '';
          if (task.type === 'manga') {
            label = `${i + 1}p目の【${step}】`;
          } else {
            label = `【${step}】`;
          }
          items.push({ step, pageIdx: i, label });
        }
      }
    });
    return items;
  }, [task, stepsList]);

  // Find checked checkpoints
  const checkedItems = useMemo(() => {
    if (!task) return [];
    const items: { step: string; pageIdx: number; label: string }[] = [];
    const itemsPerStep = task.type === 'manga' ? task.totalPages : 1;
    stepsList.forEach((step) => {
      const pageStates = task.steps[step] || [];
      for (let i = 0; i < itemsPerStep; i++) {
        if (pageStates[i]) {
          let label = '';
          if (task.type === 'manga') {
            label = `${i + 1}p目の【${step}】`;
          } else {
            label = `【${step}】`;
          }
          items.push({ step, pageIdx: i, label });
        }
      }
    });
    return items;
  }, [task, stepsList]);

  // Calculation for safe days remaining
  const { daysDiff, deadlineColor, deadlineMsg, urgencyLevel } = useMemo(() => {
    if (!task) return { daysDiff: 0, deadlineColor: '', deadlineMsg: '', urgencyLevel: 'safe' };
    
    // Parse deadline
    const deadlineDate = new Date(task.deadline + 'T23:59:59');
    const today = new Date();
    
    // Calculate simple days diff
    const oneDay = 24 * 60 * 60 * 1000;
    const diffMs = deadlineDate.getTime() - today.getTime();
    const days = Math.ceil(diffMs / oneDay);
    
    let color = 'text-emerald-500 font-semibold';
    let msg = `締切まで あと ${days} 日`;
    let urgency = 'safe';

    if (days < 0) {
      color = 'text-rose-600 font-extrabold animate-pulse';
      msg = `⚠️ 【締切超過】 ${Math.abs(days)} 日経過しています！`;
      urgency = 'critical';
    } else if (days <= 1) {
      color = 'text-rose-600 font-bold animate-bounce-slow';
      msg = `🚨 【締切直前！】 あと ${days} 日しかありません！`;
      urgency = 'critical';
    } else if (days <= 3) {
      color = 'text-amber-500 font-bold';
      msg = `⚠️ 【締切前です】 あと ${days} 日 (いそがしい！)`;
      urgency = 'warning';
    } else if (days <= 7) {
      color = 'text-indigo-500 font-medium';
      msg = `🔔 あと ${days} 日 (計画的に進めましょう)`;
      urgency = 'alert';
    }

    return { daysDiff: days, deadlineColor: color, deadlineMsg: msg, urgencyLevel: urgency };
  }, [task?.deadline]);

  if (!task) {
    return (
      <div className={`p-12 text-center rounded-3xl border-2 border-dashed ${activeTheme.borderClass} flex flex-col items-center justify-center`}>
        <div className="text-4xl mb-3">🎨🖌️アジェンダ📐📖</div>
        <p className={`text-sm font-sans font-medium opacity-80 ${activeTheme.textClass}`}>
          左側の一覧からお仕事を選択すると、作品別の進捗管理・打合せ内容がここに表示されます✨
        </p>
      </div>
    );
  }

  if (task.type === 'meeting') {
    return (
      <div className="relative p-1 border-0" style={{ border: 'none' }}>
        {onBackToList && (
          <button
            onClick={onBackToList}
            className="sm:hidden mb-4 text-xs font-black py-2 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 hover:scale-[1.01] border border-rose-200/20 duration-150 flex items-center gap-1.5 cursor-pointer max-w-fit"
          >
            <span>🔙</span>
            <span>ワークスペース一覧に戻る</span>
          </button>
        )}

        {/* Header toolbar */}
        <div className="flex items-center justify-between pb-4 mb-5 border-none" style={{ border: 'none' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{showEmojis ? '🤝' : ''}</span>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Meeting Event Detail</span>
              <h1 className={`text-base font-black ${isDark ? 'text-indigo-100' : 'text-slate-800'}`}>{task.title}</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="sync-cal-action-btn"
              onClick={() => onSyncCalendar(task)}
              className="flex items-center gap-1.5 text-xs py-1.5 px-3 border rounded-xl font-medium transition duration-200 cursor-pointer hover:opacity-90 animate-pulse-slow"
              style={{
                borderColor: `${customAccent}3b`,
                backgroundColor: isDark ? `${customAccent}22` : `${customAccent}0e`,
                color: customAccent
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" style={{ color: customAccent }} />
              <span>Cal同期</span>
            </button>
            <button
              id="edit-task-action-btn"
              onClick={() => onEditTask(task)}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-indigo-805 hover:bg-slate-100 dark:hover:bg-indigo-900/50 cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5 text-indigo-400" />
            </button>
            <button
              id="delete-task-action-btn"
              onClick={() => onDeleteTask(task.id)}
              className="p-1.5 rounded-xl border border-rose-200/50 dark:border-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-450" />
            </button>
          </div>
        </div>

        {/* Meeting Main Details layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Client target */}
          <div className={`p-4 rounded-2xl border ${isDark ? 'bg-indigo-950/20 border-indigo-800 text-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-800'}`}>
            <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">🤝 打ち合わせ先 / お取引先様</span>
            <span className={`text-xs font-bold`}>
              {task.clientName || '個人打ち合わせ / 宛先なし'}
            </span>
          </div>

          {/* Date Time target */}
          <div className={`p-4 rounded-2xl border ${isDark ? 'bg-indigo-950/20 border-indigo-800 text-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-800'}`}>
            <span className="block text-[10px] text-slate-450 uppercase font-bold tracking-wider mb-1">📅 打ち合わせ実施日時</span>
            <span className={`text-xs font-bold text-rose-600 dark:text-rose-400`}>
              {task.meetingDate ? task.meetingDate.replace('T', ' ') : '打合せ予定時間 未設定'}
            </span>
          </div>
        </div>

        {/* Alert configuration segment */}
        <div className="mt-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/30 flex items-center gap-3">
          <Clock className="w-5 h-5 text-indigo-500 animate-pulse" />
          <div className="text-xs">
            <span className="font-extrabold text-indigo-700 dark:text-indigo-300 block">🔔 10分前・5分前 自動アラーム検知中</span>
            <span className="text-slate-500 dark:text-indigo-200 leading-relaxed block mt-0.5">
              開始時間の10分前・5分前になると、画面にアラームがポップアップし、チャイム音でお知らせします。心の準備に役立ててください！
            </span>
          </div>
        </div>

        {/* Notes representation */}
        {task.notes && (
          <div className="mt-5">
            <span className="block text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1.5">💡 アジェンダ・事前メモ・決定事項</span>
            <div className={`p-5 rounded-2xl border leading-relaxed whitespace-pre-wrap text-xs ${isDark ? 'bg-indigo-950/10 border-indigo-800 text-indigo-200' : 'bg-neutral-50/60 border-rose-100/20 text-slate-600'}`}>
              {task.notes}
            </div>
          </div>
        )}

        <div className="mt-5 border-t pt-4 flex justify-between items-center text-[10px] text-slate-400 font-medium">
          <span>※ 進捗チェック用のマス目は非表示（打合せモード専用シンプル画面）</span>
          <span>作成日: {new Date(task.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    );
  }


  return (
    <div className="relative p-1 border-0" style={{ border: 'none' }}>
      {onBackToList && (
        <button
          onClick={onBackToList}
          className="sm:hidden mb-4 text-xs font-black py-2 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 hover:scale-[1.01] border border-rose-200/20 duration-150 flex items-center gap-1.5 cursor-pointer max-w-fit"
        >
          <span>🔙</span>
          <span>ワークスペース一覧に戻る</span>
        </button>
      )}
      


      {/* Task Header Details */}
      <div className="pb-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                task.type === 'manga'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : task.type === 'illust'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
              }`}>
                {task.type === 'manga' ? '📖 マンガ' : task.type === 'illust' ? '🎨 イラスト' : '🤝 打ち合わせ'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                task.depositStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : task.depositStatus === 'unpaid' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {task.depositStatus === 'paid' ? '🌸 入金済' : task.depositStatus === 'unpaid' ? '💸 未入金' : '🤍 入金不要'}
              </span>
            </div>
            
            <h1 className={`text-xl font-extrabold font-sans tracking-tight mb-2 ${isDark ? 'text-indigo-50' : 'text-slate-800'}`}>
              {task.title}
            </h1>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 self-center">
            <button
              id="sync-cal-action-btn"
              onClick={() => onSyncCalendar(task)}
              className="flex items-center gap-1.5 text-xs py-1.5 px-3 border rounded-xl font-medium transition duration-200 cursor-pointer hover:opacity-90 animate-pulse-slow"
              style={{
                borderColor: `${customAccent}3b`,
                backgroundColor: isDark ? `${customAccent}22` : `${customAccent}0e`,
                color: customAccent
              }}
              title="Googleカレンダーにこの締切を登録・同期"
            >
              <RefreshCw className="w-3.5 h-3.5" style={{ color: customAccent }} />
              <span>Cal同期</span>
            </button>
            <button
              id="edit-task-action-btn"
              onClick={() => onEditTask(task)}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-indigo-800 hover:bg-slate-100 dark:hover:bg-indigo-900/50 cursor-pointer"
              title="タスク設定変更"
            >
              <Edit className="w-3.5 h-3.5 text-indigo-400" />
            </button>
            <button
              id="delete-task-action-btn"
              onClick={() => onDeleteTask(task.id)}
              className="p-1.5 rounded-xl border border-rose-200/50 dark:border-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              title="タスク削除"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            </button>
          </div>
        </div>

        {/* Task Metadata Cards - Borderless modern block frames */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          
          {/* Client box */}
          <div className={`p-3 rounded-2xl flex items-center gap-2.5 border ${isDark ? 'bg-indigo-950/20 border-indigo-900/30' : 'bg-slate-50 border-slate-150'}`}>
            <User className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="block text-[10px] text-slate-400 uppercase">クライアント</span>
              <span className={`text-xs font-bold truncate block ${isDark ? 'text-indigo-200' : 'text-slate-700'}`}>
                {task.clientName || '（なし/個人用）'}
              </span>
            </div>
          </div>

          {/* Deadline warning with changing alarm background */}
          <div 
            className="p-3 rounded-2xl flex items-center gap-2.5 border transition-all duration-300"
            style={{
              backgroundColor: urgencyLevel === 'critical'
                ? (isDark ? '#4c0519' : '#fff1f2')
                : urgencyLevel === 'warning'
                  ? (isDark ? '#451a03' : '#fef3c7')
                  : (isDark ? `${customAccent}1c` : `${customAccent}08`),
              borderColor: urgencyLevel === 'critical'
                ? '#f43f5e30'
                : urgencyLevel === 'warning'
                  ? '#f59e0b30'
                  : `${customAccent}20`
            }}
          >
            <Clock className={`w-4 h-4 flex-shrink-0 ${urgencyLevel === 'critical' ? 'text-rose-500 animate-pulse' : ''}`} style={{ color: urgencyLevel === 'critical' ? undefined : customAccent }} />
            <div className="min-w-0">
              <span className="block text-[10px] text-slate-400 dark:text-indigo-300 uppercase">原稿締切日</span>
              <span 
                className="text-xs block font-bold font-sans"
                style={{
                  color: urgencyLevel === 'critical'
                    ? '#f43f5e'
                    : urgencyLevel === 'warning'
                      ? '#d97706'
                      : isDark ? '#ffffff' : customAccent
                }}
              >
                {task.deadline}
              </span>
            </div>
          </div>

          {/* Meeting notification */}
          <div className={`p-3 rounded-2xl flex items-center gap-2.5 border ${isDark ? 'bg-indigo-950/20 border-indigo-900/30' : 'bg-slate-50 border-slate-150'}`}>
            <Calendar className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="block text-[10px] text-slate-400 uppercase">次回の打合せ予定</span>
              <span className={`text-xs font-bold truncate block ${isDark ? 'text-indigo-200' : 'text-slate-700'}`}>
                {task.meetingDate ? task.meetingDate.replace('T', ' ') : 'なし（予定なし）'}
              </span>
            </div>
          </div>

        </div>

        {/* Optional specialized timeline deadlines for Manga type (Request 2) */}
        {task.type === 'manga' && (task.plotDeadline || task.nameDeadline || task.lineartDeadline) && (
          <div 
            className="mt-3 p-3.5 rounded-2xl border grid grid-cols-3 gap-3 transition-colors duration-350"
            style={{
              backgroundColor: isDark ? `${customAccent}10` : `${customAccent}04`,
              borderColor: `${customAccent}15`
            }}
          >
            {task.plotDeadline ? (
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-450 dark:text-indigo-350 block mb-0.5">📝 プロット締切日</span>
                <span className="text-xs font-bold block" style={{ color: isDark ? '#f3effc' : customSub }}>
                  {task.plotDeadline}
                </span>
              </div>
            ) : (
              <div className="opacity-40">
                <span className="block text-[10px] text-slate-400 block mb-0.5">📝 プロット締切</span>
                <span className="text-xs font-medium block">（未設定）</span>
              </div>
            )}
            {task.nameDeadline ? (
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-450 dark:text-indigo-350 block mb-0.5">🎨 ネーム締切日</span>
                <span className="text-xs font-bold block" style={{ color: isDark ? '#f3effc' : customSub }}>
                  {task.nameDeadline}
                </span>
              </div>
            ) : (
              <div className="opacity-40">
                <span className="block text-[10px] text-slate-400 block mb-0.5">🎨 ネーム締切</span>
                <span className="text-xs font-medium block">（未設定）</span>
              </div>
            )}
            {task.lineartDeadline ? (
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-450 dark:text-indigo-350 block mb-0.5">✒️ 線画締切日</span>
                <span className="text-xs font-bold block" style={{ color: isDark ? '#f3effc' : customSub }}>
                  {task.lineartDeadline}
                </span>
              </div>
            ) : (
              <div className="opacity-40">
                <span className="block text-[10px] text-slate-400 block mb-0.5">✒️ 線画締切</span>
                <span className="text-xs font-medium block">（未設定）</span>
              </div>
            )}
          </div>
        )}

        {/* Alarm Banner if very close */}
        {urgencyLevel === 'critical' && (
          <div className="mt-3 flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-500">
            <AlertTriangle className="w-3.5 h-3.5 animate-bounce-slow" />
            <span className="font-semibold">{deadlineMsg}。早めの進捗チェックがおすすめです！🔥🔥</span>
          </div>
        )}
      </div>

      {/* Progress Stats Summary & Celebration screen */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> 作品の全体進捗率
          </span>
          <span className={`text-sm font-extrabold ${isDark ? 'text-indigo-200' : 'text-slate-800'}`}>
            {stats.percent}% ({stats.checked} / {stats.total} セル)
          </span>
        </div>
        
        {/* Progress bar container */}
        <div 
          className="w-full h-3 rounded-full overflow-hidden border"
          style={{
            backgroundColor: isDark ? `${customAccent}10` : '#f1f5f9',
            borderColor: isDark ? `${customAccent}22` : '#e2e8f0'
          }}
        >
          <div 
            className="h-full transition-all duration-500 ease-out rounded-full"
            style={{ 
              width: `${stats.percent}%`,
              background: stats.percent === 100
                ? `linear-gradient(to right, ${customSub}, ${customAccent})`
                : customAccent
            }}
          />
        </div>

        {/* 100% Celebration Screen */}
        {stats.percent === 100 && (
          <div className="mt-4 p-4 rounded-2xl bg-linear-to-r from-rose-500/10 via-pink-500/10 to-amber-500/10 border border-rose-300 dark:border-indigo-600 shadow-sm flex flex-col items-center text-center animate-fade-in">
            <div className="text-3xl mb-1 animate-bounce-slow">🎉💖🍓⭐🌈</div>
            <h3 className="text-sm font-black text-rose-600 dark:text-rose-400 uppercase tracking-wide">
              100% COMPLETE おめでとうございます！
            </h3>
            <p className="text-xs text-slate-500 dark:text-indigo-200 mt-1">
              作品が可愛く仕上がりましたね！お疲れ様でした！美味しいおやつを用意してゆっくり休んでください✨🧁☕
            </p>
          </div>
        )}
      </div>

      {/* Otaku Sticker Decorations & Threat Levels */}
      {uncheckedItems.length > 0 && daysDiff <= 3 && (
        <div className="mb-4 p-4 rounded-2xl bg-rose-500/10 border-2 border-dashed border-rose-400 relative overflow-hidden flex flex-col sm:flex-row items-center gap-4 animate-bounce-slow">
          <img 
            src={customStyle.deadlineCatUrl || "/src/assets/images/sticker_deadline_cat_1780950114571.png"} 
            alt="締切ピンチ猫ちゃん" 
            referrerPolicy="no-referrer"
            className="w-16 h-16 object-contain rotate-[-10deg] drop-shadow-md select-none"
          />
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-xs font-black text-rose-600 dark:text-rose-400 tracking-wider">
              🚨 進行ピンチ通知：あと{daysDiff}日なのに未完了の作業が {uncheckedItems.length}件 あります！
            </h3>
            <p className="text-[11px] text-rose-500/90 font-bold mt-1">
              急いでスタンプを押しちゃいましょう！未完了作業：
              {uncheckedItems.slice(0, 3).map(it => ` [${it.label}]`).join('、')}
              {uncheckedItems.length > 3 ? ' など' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Progress Table (Manga / Illust Grid) */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5`}>
            <span>📋 製作工程進捗一覧表</span>
            <span className="text-[10px] text-slate-400 normal-case font-normal">(クリックしてスタンプをON/OFFしてね！)</span>
          </h3>

          {/* Grid Visibility Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-indigo-950/40 p-1 rounded-xl border border-slate-200/50 dark:border-indigo-800/50">
            <button
              id="grid-filter-all-btn"
              type="button"
              onClick={() => setGridFilter('all')}
              className={`px-2.5 py-1 text-[10px] font-black rounded-lg cursor-pointer transition ${
                gridFilter === 'all' 
                  ? 'bg-white dark:bg-indigo-850 shadow-xs text-indigo-500 font-extrabold' 
                  : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              全部表示
            </button>
            <button
              id="grid-filter-todo-btn"
              type="button"
              onClick={() => setGridFilter('todo')}
              className={`px-2.5 py-1 text-[10px] font-black rounded-lg cursor-pointer transition ${
                gridFilter === 'todo' 
                  ? 'bg-rose-500 text-white shadow-xs font-extrabold animate-pulse' 
                  : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              未完了 ({uncheckedItems.length})
            </button>
            <button
              id="grid-filter-done-btn"
              type="button"
              onClick={() => setGridFilter('done')}
              className={`px-2.5 py-1 text-[10px] font-black rounded-lg cursor-pointer transition ${
                gridFilter === 'done' 
                  ? 'bg-emerald-500 text-white shadow-xs font-extrabold' 
                  : 'text-slate-400 hover:text-slate-500'
              }`}
            >
              完了済み ({checkedItems.length})
            </button>
          </div>
        </div>

         {/* Quick To-do Stamp Checklist for easy accessibility */}
        {uncheckedItems.length > 0 && (task.type !== 'manga' || stats.percent >= 80) && (
          <div 
            className="mb-3 p-3 rounded-2xl border transition-all duration-305"
            style={{
              backgroundColor: isDark ? `${customAccent}13` : '#ffffff',
              borderColor: isDark ? `${customAccent}22` : `${customAccent}14`
            }}
          >
            <h4 
              className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 mb-1.5"
              style={{ color: customAccent }}
            >
              <span>📌 やり残している作業クイックチェック</span>
              <span className="text-[9px] font-normal text-slate-400 normal-case">(バッジをクリックでスタンプが押せるよ！)</span>
            </h4>
            <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto p-0.5 animate-fade-in">
              {uncheckedItems.map((item, idx) => (
                <button
                  id={`quick-check-${idx}`}
                  key={idx}
                  type="button"
                  onClick={() => onToggleCell(task.id, item.step, item.pageIdx)}
                  className="px-2 py-0.5 rounded-lg border text-[10.5px] font-bold transition-all duration-150 cursor-pointer flex items-center gap-1 select-none transform hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    backgroundColor: isDark ? `${customAccent}26` : `${customAccent}08`,
                    borderColor: isDark ? `${customAccent}38` : `${customAccent}1a`,
                    color: isDark ? '#ffffff' : customAccent
                  }}
                >
                  <span 
                    className="w-1.5 h-1.5 rounded-full" 
                    style={{ backgroundColor: customAccent }}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto border rounded-2xl border-slate-200/50 dark:border-indigo-800/50 relative">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className={`border-b text-xs font-bold leading-normal ${isDark ? 'bg-indigo-950/40 text-indigo-400' : 'bg-slate-50/50 text-slate-500'}`}>
                {/* Top Left Label: Page or Sheet */}
                <th id="table-header-scope" className="px-3.5 py-2.5 font-sans whitespace-nowrap text-left pl-5">
                  {task.type === 'manga' ? 'ページ番号' : task.type === 'illust' ? '原稿' : '打合せ'}
                </th>
                
                {/* Dynamic steps headers */}
                {stepsList.map((step) => (
                  <th id={`table-header-step-${step}`} key={step} className="px-3.5 py-2.5 font-sans whitespace-nowrap">
                    {step}
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody>
              {pageArray.map((pageNum, pageIdx) => (
                <tr 
                  key={pageNum} 
                  className={`border-b last:border-0 hover:bg-slate-50/40 dark:hover:bg-indigo-900/20 transition-colors duration-150 ${isDark ? 'border-indigo-900/50' : 'border-slate-100'}`}
                >
                  {/* Page index identifier */}
                  <td id={`page-id-label-${pageNum}`} className={`px-3.5 py-3 text-xs font-bold font-mono text-left pl-5 whitespace-nowrap ${isDark ? 'text-indigo-300' : 'text-slate-600'}`}>
                    {task.type === 'manga' 
                      ? `${pageNum} ページ` 
                      : task.type === 'illust' 
                        ? 'イラストキャンバス' 
                        : '準備・打合せアジェンダ'}
                  </td>

                  {/* Individual step checkpoints as columns with real-time grid filter check */}
                  {stepsList.map((step) => {
                    const isChecked = task.steps[step]?.[pageIdx] || false;
                    
                    // Filter match check
                    let isFilteredOut = false;
                    if (gridFilter === 'todo' && isChecked) isFilteredOut = true;
                    if (gridFilter === 'done' && !isChecked) isFilteredOut = true;

                    return (
                      <td 
                        key={step} 
                        className={`px-2 py-1.5 transition-all duration-300 ${
                          isFilteredOut ? 'opacity-10 scale-90 pointer-events-none' : 'opacity-100'
                        }`}
                      >
                        <button
                          id={`progress-cell-${pageIdx}-${step}`}
                          type="button"
                          onClick={() => onToggleCell(task.id, step, pageIdx)}
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg transition-all duration-300 cursor-pointer ${
                            isChecked
                              ? `${activeTheme.iconBg} border-indigo-400/50 scale-95 shadow-inner`
                              : isDark
                                ? 'bg-indigo-950/20 border-indigo-800/80 hover:bg-indigo-800/40'
                                : 'bg-slate-50/40 border-slate-200 hover:bg-rose-50/50 hover:border-rose-200'
                          }`}
                        >
                          {isChecked ? (
                            <span className="animate-scale-up select-none">
                              {activeTheme.checkboxIcon}
                            </span>
                          ) : (
                            <span className="text-[10px] opacity-0 hover:opacity-40 text-rose-400 select-none">
                              {activeTheme.checkboxIcon}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>



      {/* Task notes/details view at bottom */}
      {task.notes && (
        <div className={`mt-5 p-4 rounded-2xl border mr-24 ${isDark ? 'bg-indigo-950/10 border-indigo-800/60' : 'bg-neutral-50/60 border-rose-100/30'}`}>
          <h4 className="text-[11px] font-bold text-slate-400 uppercase mb-1">💡 打ち合わせ・アイデアメモ</h4>
          <p className={`text-xs leading-relaxed whitespace-pre-wrap ${isDark ? 'text-indigo-200' : 'text-slate-600'}`}>
            {task.notes}
          </p>
        </div>
      )}

      {/* Quick Tips */}
      <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 font-medium">
        <span>⭐ 各マス目をクリックしてお仕事を進めてね！</span>
        <span className="flex items-center gap-0.5">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
          現在: {task.type === 'manga' ? 'マンガ用工程' : task.type === 'illust' ? 'イラスト用工程' : '打ち合わせ工程マップ'}
        </span>
      </div>

    </div>
  );
}
