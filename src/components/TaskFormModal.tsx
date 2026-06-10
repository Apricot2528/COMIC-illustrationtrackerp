/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Task, TaskType, DepositStatus, ThemeConfig, CustomStyleConfig } from '../types';
import { X, Plus, Edit2, Calendar, FileText, User, DollarSign, BookOpen, AlertCircle, Sparkles } from 'lucide-react';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'steps'> & { id?: string }) => void;
  editingTask?: Task | null;
  activeTheme: ThemeConfig;
  customStyle?: CustomStyleConfig;
}

export default function TaskFormModal({
  isOpen,
  onClose,
  onSave,
  editingTask,
  activeTheme,
  customStyle
}: TaskFormModalProps) {
  const [type, setType] = useState<TaskType>('manga');
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [depositStatus, setDepositStatus] = useState<DepositStatus>('none');
  const [deadline, setDeadline] = useState('');
  const [plotDeadline, setPlotDeadline] = useState('');
  const [nameDeadline, setNameDeadline] = useState('');
  const [lineartDeadline, setLineartDeadline] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [totalPages, setTotalPages] = useState<number>(4);
  const [notes, setNotes] = useState('');
  const [syncCalendar, setSyncCalendar] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      if (editingTask) {
        setType(editingTask.type);
        setTitle(editingTask.title);
        setClientName(editingTask.clientName || '');
        setDepositStatus(editingTask.depositStatus || 'none');
        setDeadline(editingTask.deadline || '');
        setPlotDeadline(editingTask.plotDeadline || '');
        setNameDeadline(editingTask.nameDeadline || '');
        setLineartDeadline(editingTask.lineartDeadline || '');
        setMeetingDate(editingTask.meetingDate || '');
        setTotalPages(editingTask.totalPages || (editingTask.type === 'manga' ? 4 : 1));
        setNotes(editingTask.notes || '');
      } else {
        // Reset to default
        setType('manga');
        setTitle('');
        setClientName('');
        setDepositStatus('none');
        
        // Default deadline: +1 week
        const oneWeekLater = new Date();
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);
        setDeadline(oneWeekLater.toISOString().substring(0, 10));
        setPlotDeadline('');
        setNameDeadline('');
        setLineartDeadline('');
        
        setMeetingDate('');
        setTotalPages(4);
        setNotes('');
        setSyncCalendar(true);
      }
    }
  }, [editingTask, isOpen]);

  // If user switches to illust, totalPages is locked to 1
  useEffect(() => {
    if (type === 'illust') {
      setTotalPages(1);
    } else if (type === 'manga' && totalPages === 1) {
      setTotalPages(4); // Default to standard manga draft size
    }
  }, [type]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('タスクのタイトルを入力してください！🌟');
      return;
    }

    let finalDeadline = deadline;
    if (type === 'meeting') {
      if (!meetingDate) {
        alert('打合せ日時を設定してください！📅');
        return;
      }
      // Automap date part of meetingDate to deadline
      finalDeadline = meetingDate.substring(0, 10);
    } else {
      if (!deadline) {
        alert('締切日を設定してください！📅');
        return;
      }
    }

    onSave({
      id: editingTask?.id,
      type,
      title: title.trim(),
      clientName: clientName.trim(),
      depositStatus: type === 'meeting' ? 'none' : depositStatus,
      deadline: finalDeadline,
      plotDeadline: type === 'manga' && plotDeadline ? plotDeadline : undefined,
      nameDeadline: type === 'manga' && nameDeadline ? nameDeadline : undefined,
      lineartDeadline: type === 'manga' && lineartDeadline ? lineartDeadline : undefined,
      meetingDate: meetingDate || undefined,
      totalPages: type === 'manga' ? totalPages : 1,
      notes: notes.trim(),
      calendarEventId: editingTask?.calendarEventId,
      meetingEventId: editingTask?.meetingEventId
    });

    onClose();
  };

  const isDark = activeTheme.id === 'cosmic' || !!customStyle?.darkMode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div 
        id="task-form-container"
        className={`w-full max-w-md rounded-3xl border-2 p-6 overflow-hidden ${activeTheme.cardClass} duration-300 transform scale-100 shadow-xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-rose-100/40">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
            <span className={`text-lg font-bold font-sans ${isDark ? 'text-indigo-100' : 'text-slate-800'}`}>
              {type === 'meeting' 
                ? (editingTask ? '🤝 打ち合わせ予定を編集' : '🤝 新しい打ち合わせを追加')
                : (editingTask ? '🎨 制作タスクを編集' : '✨ 新しい制作タスクを追加')
              }
            </span>
          </div>
          <button 
            id="close-task-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-indigo-850/60 duration-200 cursor-pointer"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          
          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">制作・活動モード選択</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                id="task-type-manga-btn"
                type="button"
                onClick={() => setType('manga')}
                className={`py-2 px-1 rounded-xl border-2 text-[10.5px] font-bold font-sans transition-all duration-200 cursor-pointer ${
                  type === 'manga'
                    ? 'border-indigo-400 bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 shadow-xs'
                    : 'border-slate-150 bg-white hover:bg-slate-50 dark:bg-indigo-950/20 text-slate-400 dark:border-indigo-800'
                }`}
              >
                📖 マンガ
              </button>
              <button
                id="task-type-illust-btn"
                type="button"
                onClick={() => setType('illust')}
                className={`py-2 px-1 rounded-xl border-2 text-[10.5px] font-bold font-sans transition-all duration-200 cursor-pointer ${
                  type === 'illust'
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300 shadow-xs'
                    : 'border-slate-150 bg-white hover:bg-slate-50 dark:bg-indigo-950/20 text-slate-400 dark:border-indigo-800'
                }`}
              >
                🎨 イラスト
              </button>
              <button
                id="task-type-meeting-btn"
                type="button"
                onClick={() => setType('meeting')}
                className={`py-2 px-1 rounded-xl border-2 text-[10.5px] font-bold font-sans transition-all duration-200 cursor-pointer ${
                  type === 'meeting'
                    ? 'border-rose-400 bg-rose-500/10 text-rose-500 dark:text-rose-300 shadow-xs'
                    : 'border-slate-150 bg-white hover:bg-slate-50 dark:bg-indigo-950/20 text-slate-400 dark:border-indigo-800'
                }`}
              >
                🤝 打ち合わせ
              </button>
            </div>
          </div>

          {/* Title input */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> 
              <span>{type === 'meeting' ? '打ち合わせ件名 / 用件' : '作品タイトル'}</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="task-title-input"
              type="text"
              required
              placeholder={type === 'meeting' ? '例: キャラデザインの方向性打合せ' : '例: コミケ用合同誌 / 1枚絵 commission'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full text-xs px-3.5 py-2.5 rounded-2xl border focus:outline-hidden focus:ring-1 ${
                isDark 
                  ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
              }`}
            />
          </div>

          {/* Client Name Input */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> 
              <span>{type === 'meeting' ? '打ち合わせの相手 / クライアント名' : 'クライアント / お取引先様'}</span>
            </label>
            <input
              id="task-client-input"
              type="text"
              placeholder={type === 'meeting' ? '例: ○○出版 担当A様' : '例: ○○出版、趣味、Skeb 宛先など'}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className={`w-full text-xs px-3.5 py-2.5 rounded-2xl border focus:outline-hidden focus:ring-1 ${
                isDark 
                  ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
              }`}
            />
          </div>

          {/* Deposit Status and Page Count side-by-side - ONLY show if not meeting type */}
          {type !== 'meeting' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" /> ご入金状況
                </label>
                <select
                  id="task-deposit-select"
                  value={depositStatus}
                  onChange={(e) => setDepositStatus(e.target.value as DepositStatus)}
                  className={`w-full text-xs px-3.5 py-2.5 rounded-2xl border focus:outline-hidden focus:ring-1 cursor-pointer ${
                    isDark 
                      ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
                  }`}
                >
                  <option value="none">支払いなし（趣味等）</option>
                  <option value="unpaid">📭 未入金</option>
                  <option value="paid">🌸 ご入金済み</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" /> 進行ページ数/枚数
                </label>
                {type === 'manga' ? (
                  <input
                    id="task-pages-input"
                    type="number"
                    min={1}
                    max={400}
                    value={totalPages}
                    onChange={(e) => setTotalPages(parseInt(e.target.value) || 1)}
                    className={`w-full text-xs px-3.5 py-2.5 rounded-2xl border focus:outline-hidden focus:ring-1 ${
                      isDark 
                        ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
                    }`}
                  />
                ) : (
                  <div className={`w-full text-xs px-3.5 py-2.5 rounded-2xl border ${
                    isDark ? 'bg-indigo-950/20 border-indigo-805 text-indigo-300' : 'bg-slate-100 border-slate-200 text-slate-500'
                  } flex items-center font-semibold`}>
                    ✏️ 1枚イラストに固定
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dates & meetings */}
          <div className="grid grid-cols-1 gap-4">
            {type === 'meeting' ? (
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-rose-400" /> 🤝 打ち合わせ日時・時間 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="task-meeting-input"
                  type="datetime-local"
                  required
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className={`w-full text-xs px-3.5 py-2.5 rounded-2xl border focus:outline-hidden focus:ring-1 cursor-pointer ${
                    isDark 
                      ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
                  }`}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-rose-400" /> 原稿締切日 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="task-deadline-input"
                      type="date"
                      required
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className={`w-full text-xs px-3 py-2 rounded-2xl border focus:outline-hidden focus:ring-1 cursor-pointer ${
                        isDark 
                          ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                      🤝 進捗打合せ予定
                    </label>
                    <input
                      id="task-meeting-input-other"
                      type="datetime-local"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className={`w-full text-xs px-3 py-2 rounded-2xl border focus:outline-hidden focus:ring-1 cursor-pointer ${
                        isDark 
                          ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
                      }`}
                    />
                  </div>
                </div>

                {type === 'manga' && (
                  <div className="p-3.5 rounded-2xl border border-dashed border-slate-200 dark:border-indigo-805 bg-slate-50/50 dark:bg-indigo-950/20 space-y-2.5">
                    <span className="block text-[10.5px] font-black text-slate-450 uppercase tracking-wide">📐 各種オプション締め切り（任意項目）</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">プロット締切</label>
                        <input
                          id="task-plot-deadline-input"
                          type="date"
                          value={plotDeadline}
                          onChange={(e) => setPlotDeadline(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-xl border focus:outline-hidden ${
                            isDark 
                              ? 'bg-indigo-950/60 border-indigo-750 text-white focus:ring-indigo-400' 
                              : 'bg-white border-slate-200 text-slate-900 focus:ring-rose-400'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">ネーム締切</label>
                        <input
                          id="task-name-deadline-input"
                          type="date"
                          value={nameDeadline}
                          onChange={(e) => setNameDeadline(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-xl border focus:outline-hidden ${
                            isDark 
                              ? 'bg-indigo-950/60 border-indigo-750 text-white focus:ring-indigo-400' 
                              : 'bg-white border-slate-200 text-slate-900 focus:ring-rose-400'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">線画締切</label>
                        <input
                          id="task-lineart-deadline-input"
                          type="date"
                          value={lineartDeadline}
                          onChange={(e) => setLineartDeadline(e.target.value)}
                          className={`w-full text-[11px] px-2 py-1.5 rounded-xl border focus:outline-hidden ${
                            isDark 
                              ? 'bg-indigo-950/60 border-indigo-750 text-white focus:ring-indigo-400' 
                              : 'bg-white border-slate-200 text-slate-900 focus:ring-rose-400'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes description */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {type === 'meeting' ? '打ち合わせのメモ / 要点アジェンダ' : '作品のメモ、制作詳細'}
            </label>
            <textarea
              id="task-notes-textarea"
              placeholder={type === 'meeting' 
                ? "アジェンダ、見積もり、決定事項、アラームお知らせで確認する要点をメモ..." 
                : "ネームラフの方向性や、キャラクター設定、色の指定など、イベント登録される詳細メモを記入..."}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`w-full text-xs px-3.5 py-2 rounded-2xl border focus:outline-hidden focus:ring-1 resize-none ${
                isDark 
                  ? 'bg-indigo-950/40 border-indigo-700 text-white focus:ring-indigo-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-rose-400'
              }`}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="sync-calendar-checkbox"
              type="checkbox"
              checked={syncCalendar}
              onChange={(e) => setSyncCalendar(e.target.checked)}
              className="accent-pink-500 rounded border-slate-300 cursor-pointer w-4 h-4"
            />
            <label htmlFor="sync-calendar-checkbox" className="text-xs text-slate-500 dark:text-indigo-200 cursor-pointer font-medium">
              Google カレンダーと自動連携・同期する
            </label>
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-rose-100/30 flex gap-3">
            <button
              id="cancel-form-btn"
              type="button"
              onClick={onClose}
              className="flex-1 text-xs py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 dark:border-indigo-850 dark:hover:bg-indigo-900/40 font-semibold cursor-pointer text-center"
            >
              キャンセル
            </button>
            <button
              id="save-form-btn"
              type="submit"
              className={`flex-2 text-xs py-2.5 rounded-2xl font-bold text-center cursor-pointer ${activeTheme.primaryClass}`}
            >
              🎉 {editingTask ? '変更を保存する' : '登録する！'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
