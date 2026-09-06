/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {Task, TaskType, DepositStatus, CustomStyleConfig } from '../types';
import { toast } from '../utils/toast';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'steps'> & { id?: string }) => void;
  onDelete?: (taskId: string) => void;
  editingTask?: Task | null;
  customStyle?: CustomStyleConfig;
}

/** 締切までの日数。時刻は切り捨てて日単位で数える */
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** 罫線で区切った 1 行。ラベル 96px（スマホ 76px）・12px 補助 */
function Row({
  label,
  children,
  right,
}: {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rule-b flex items-center gap-3 py-[11px] md:py-3">
      <span className="w-[76px] shrink-0 text-note text-hojo md:w-[96px]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** 見出し（基本・日程・工程・経理・備考） */
function SectionHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 mb-1 text-note text-hojo">{children}</h3>;
}

/** 2択・3択の枠線ボタン。選択＝枠墨、非選択＝枠罫色・文字補助 */
function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`btn ${value === o.v ? 'btn-primary' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function TaskFormModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  editingTask,
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
        setType('manga');
        setTitle('');
        setClientName('');
        setDepositStatus('none');

        const oneWeekLater = new Date();
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);
        setDeadline(oneWeekLater.toISOString().substring(0, 10));
        setPlotDeadline('');
        setNameDeadline('');
        setLineartDeadline('');

        setMeetingDate('');
        setTotalPages(4);
        setNotes('');
      }
    }
  }, [editingTask, isOpen]);

  // イラストはページ数を 1 に固定する
  useEffect(() => {
    if (type === 'illust') {
      setTotalPages(1);
    } else if (type === 'manga' && totalPages === 1) {
      setTotalPages(4);
    }
  }, [type]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast('作品名を入力してください', 'error');
      return;
    }

    let finalDeadline = deadline;
    if (type === 'meeting') {
      if (!meetingDate) {
        toast('打合せ日時を設定してください', 'error');
        return;
      }
      finalDeadline = meetingDate.substring(0, 10);
    } else if (!deadline) {
      toast('締切日を設定してください', 'error');
      return;
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
      meetingEventId: editingTask?.meetingEventId,
    });

    onClose();
  };

  const days = daysUntil(type === 'meeting' ? meetingDate.substring(0, 10) : deadline);
  const stepsLabel =
    type === 'manga'
      ? 'ネーム／下書き／線画／仕上げ'
      : type === 'illust'
        ? 'ラフ／下書き／線画／着色／仕上げ（1行のみ表示）'
        : '事前準備／ラフ・資料提示／日程・見積調整／決定事項メモ／お礼・共有';

  return (
    // 背後は暗くしない・ぼかさない・スライドさせない。右から出る固定パネル
    <aside
      id="task-form-container"
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-paper md:w-[520px]"
      style={{ borderLeft: '0.5px solid #262A26' }}
      role="dialog"
      aria-label={editingTask ? '案件を編集' : '案件を新規'}
    >
      {/* 見出し */}
      <div className="rule-b rule-b-sumi flex items-baseline justify-between gap-4 px-5 pb-3 pt-5 md:px-8">
        <div className="min-w-0">
          <h2 className="mincho text-title leading-none">
            {editingTask ? '案件を編集' : '案件を新規'}
          </h2>
          {editingTask && (
            <p className="mt-1 truncate text-note text-hojo">{editingTask.title}</p>
          )}
        </div>
        <button
          id="close-task-modal-btn"
          onClick={onClose}
          className="num tap-icon shrink-0 text-body text-hojo"
          title="閉じる"
        >
          ×
        </button>
      </div>

      {/* 本体 */}
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 md:px-8">
          <SectionHead>基本</SectionHead>

          <Row label="種別">
            <Choice
              value={type}
              onChange={(v) => setType(v)}
              options={[
                { v: 'manga' as TaskType, label: '漫画' },
                { v: 'illust' as TaskType, label: 'イラスト' },
                { v: 'meeting' as TaskType, label: '打合せ' },
              ]}
            />
          </Row>

          <Row label="作品名">
            <input
              id="task-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field mincho w-full text-title"
              placeholder="作品名"
            />
          </Row>

          <Row label="クライアント">
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="field w-full"
              placeholder="—"
            />
          </Row>

          <SectionHead>日程</SectionHead>

          {type !== 'meeting' && (
            <Row
              label="締切"
              right={
                days === null ? null : days < 0 ? (
                  <span className="num tag tag-fill">超過 {Math.abs(days)}日</span>
                ) : days === 0 ? (
                  <span className="num text-note text-accent">本日締切</span>
                ) : days <= 7 ? (
                  <span className="num text-note text-accent">残 {days}日</span>
                ) : (
                  <span className="num text-note">残 {days}日</span>
                )
              }
            >
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="field field-num w-full"
              />
            </Row>
          )}

          <Row
            label="打合せ"
            right={
              type === 'meeting' && days !== null ? (
                days < 0 ? (
                  <span className="num tag tag-fill">超過 {Math.abs(days)}日</span>
                ) : days === 0 ? (
                  <span className="num text-note text-accent">本日</span>
                ) : (
                  <span className={`num text-note ${days <= 7 ? 'text-accent' : ''}`}>残 {days}日</span>
                )
              ) : null
            }
          >
            <input
              type="datetime-local"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="field field-num w-full"
            />
          </Row>

          {type === 'manga' && (
            <>
              <Row label="プロット締切">
                <input
                  type="date"
                  value={plotDeadline}
                  onChange={(e) => setPlotDeadline(e.target.value)}
                  className="field field-num w-full"
                />
              </Row>
              <Row label="ネーム締切">
                <input
                  type="date"
                  value={nameDeadline}
                  onChange={(e) => setNameDeadline(e.target.value)}
                  className="field field-num w-full"
                />
              </Row>
              <Row label="線画締切">
                <input
                  type="date"
                  value={lineartDeadline}
                  onChange={(e) => setLineartDeadline(e.target.value)}
                  className="field field-num w-full"
                />
              </Row>
            </>
          )}

          <SectionHead>工程</SectionHead>

          <Row label="構成">
            <span className="text-note text-hojo">{stepsLabel}</span>
          </Row>

          {type === 'manga' && (
            <Row label="ページ数" right={<span className="text-note text-hojo">行をこの数だけつくる</span>}>
              <input
                type="number"
                min={1}
                max={200}
                value={totalPages}
                onChange={(e) => setTotalPages(Math.max(1, Number(e.target.value) || 1))}
                className="field field-num w-[80px]"
              />
            </Row>
          )}

          {type !== 'meeting' && (
            <>
              <SectionHead>経理</SectionHead>
              <Row label="入金">
                <Choice
                  value={depositStatus}
                  onChange={(v) => setDepositStatus(v)}
                  options={[
                    { v: 'unpaid' as DepositStatus, label: '未' },
                    { v: 'paid' as DepositStatus, label: '済' },
                    { v: 'none' as DepositStatus, label: 'なし' },
                  ]}
                />
              </Row>
            </>
          )}

          <SectionHead>備考</SectionHead>
          <div className="py-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full text-note leading-[1.8]"
              style={{
                border: '0.5px solid #D7DAD3',
                borderRadius: '2px',
                padding: '8px',
                background: 'transparent',
                color: '#262A26',
                resize: 'none',
                outline: 'none',
              }}
              placeholder="—"
            />
          </div>
        </div>

        {/* 下部 */}
        <div className="rule-t rule-t-sumi flex items-center gap-3 px-5 py-4 md:px-8">
          <button type="submit" className="btn btn-primary">
            保存
          </button>
          <button type="button" onClick={onClose} className="btn">
            取消
          </button>
          {editingTask && onDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('この案件を削除しますか？')) {
                  onDelete(editingTask.id);
                  onClose();
                }
              }}
              className="tap ml-auto flex items-center text-note text-accent"
              style={{ textDecoration: 'underline', textDecorationThickness: '0.5px' }}
            >
              この案件を削除
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
