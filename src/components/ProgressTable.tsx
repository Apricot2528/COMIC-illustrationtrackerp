/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {Task, CustomStyleConfig } from '../types';

interface ProgressTableProps {
  task: Task | null;
  tasks?: Task[];
  onSelectTaskId?: (taskId: string) => void;
  onToggleCell: (taskId: string, stepName: string, pageIndex: number) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onSyncCalendar: (task: Task) => void;
  calendarConnected: boolean;
  onBackToList?: () => void;
  customStyle?: CustomStyleConfig;
}

/** 締切までの日数。時刻は切り捨てて日単位で数える */
function daysUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** 摘要の1行。ラベル 12px 補助 ＋ 値 等幅 12px の2列 */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rule-b flex items-baseline gap-4 py-[9px]">
      <span className="w-[76px] shrink-0 text-note text-hojo">{label}</span>
      <span className="num min-w-0 flex-1 text-note">{children}</span>
    </div>
  );
}

export default function ProgressTable({
  task,
  onToggleCell,
  onEditTask,
  onDeleteTask,
  onSyncCalendar,
  calendarConnected,
}: ProgressTableProps) {
  // 工程名は Firestore の steps のキーそのもの。データ構造を変えないため既存の名前を保つ
  const stepsList = useMemo(() => {
    if (!task) return [];
    if (task.type === 'manga') return ['ネーム', '下書き', '線画', '仕上げ'];
    if (task.type === 'illust') return ['ラフ', '下書き', '線画', '着色', '仕上げ'];
    return ['事前準備', 'ラフ・資料提示', '日程・見積調整', '決定事項メモ', 'お礼・共有'];
  }, [task?.type]);

  // 漫画はページ数ぶんの行。イラスト・打合せは1行だけ
  const pageArray = useMemo(() => {
    if (!task) return [];
    if (task.type !== 'manga') return [1];
    return Array.from({ length: task.totalPages }, (_, i) => i + 1);
  }, [task]);

  const stats = useMemo(() => {
    if (!task || stepsList.length === 0) return { checked: 0, total: 0, percent: 0 };
    const itemsPerStep = task.type === 'manga' ? task.totalPages : 1;
    const total = stepsList.length * itemsPerStep;
    let checked = 0;
    stepsList.forEach((step) => {
      const pageStates = task.steps[step];
      if (!pageStates) return;
      for (let i = 0; i < itemsPerStep; i++) if (pageStates[i]) checked++;
    });
    return { checked, total, percent: total ? Math.round((checked / total) * 100) : 0 };
  }, [task, stepsList]);

  if (!task) return null;

  const days = daysUntil(task.deadline);
  const isSingleRow = task.type !== 'manga';
  const rowLabel = task.type === 'illust' ? '本紙' : task.type === 'meeting' ? '本件' : '';

  return (
    <div className="flex flex-col gap-0 lg:flex-row">
      {/* ================= 左：工程表 ================= */}
      <div className="min-w-0 flex-1 px-6 py-6 md:px-12">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 w-[72px] pb-2 pr-4 text-left text-note font-normal text-hojo"
                  style={{ background: '#EDEFEA', borderBottom: '0.5px solid #262A26' }}
                >
                  {isSingleRow ? '' : 'ページ'}
                </th>
                {stepsList.map((step) => (
                  <th
                    key={step}
                    className="px-2 pb-2 text-center text-note font-normal text-hojo"
                    style={{ borderBottom: '0.5px solid #262A26' }}
                  >
                    {step}
                  </th>
                ))}
                <th
                  className="w-[64px] pb-2 pl-4 text-right text-note font-normal text-hojo"
                  style={{ borderBottom: '0.5px solid #262A26' }}
                >
                  完了
                </th>
              </tr>
            </thead>

            <tbody>
              {pageArray.map((pageNo) => {
                const pageIdx = pageNo - 1;
                const doneOnRow = stepsList.filter((s) => task.steps[s]?.[pageIdx]).length;

                return (
                  <tr key={pageNo}>
                    <td
                      className="num sticky left-0 z-10 py-[7px] pr-4 text-note text-hojo"
                      style={{ background: '#EDEFEA', borderBottom: '0.5px solid #D7DAD3' }}
                    >
                      {isSingleRow ? rowLabel : String(pageNo).padStart(2, '0')}
                    </td>

                    {stepsList.map((step) => {
                      const isChecked = !!task.steps[step]?.[pageIdx];
                      return (
                        <td
                          key={step}
                          className="p-0 text-center"
                          style={{ borderBottom: '0.5px solid #D7DAD3' }}
                        >
                          {/* セルは塗らず記号のみ。クリックで完了／未着手を切り替える */}
                          <button
                            type="button"
                            onClick={() => onToggleCell(task.id, step, pageIdx)}
                            className="mx-auto block w-full cursor-pointer px-2 py-[7px] text-body text-sumi"
                            style={{ lineHeight: 1 }}
                            title={`${isSingleRow ? rowLabel : `${pageNo}ページ`}　${step}：${isChecked ? '完了' : '未着手'}`}
                            aria-label={`${step} ${isChecked ? '完了' : '未着手'}`}
                          >
                            {isChecked ? '●' : '・'}
                          </button>
                        </td>
                      );
                    })}

                    <td
                      className="num py-[7px] pl-4 text-right text-note text-hojo"
                      style={{ borderBottom: '0.5px solid #D7DAD3' }}
                    >
                      {doneOnRow}/{stepsList.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 凡例 */}
        <p className="mt-3 text-note text-hojo">・未着手　●完了　（マスをクリックで切り替え）</p>
      </div>

      {/* ================= 右：摘要 ================= */}
      <div
        className="w-full shrink-0 px-6 py-6 md:px-8 lg:w-[320px]"
        style={{ borderLeft: '0.5px solid #D7DAD3' }}
      >
        <h4 className="mb-3 text-note text-hojo">摘要</h4>

        <Item label="種別">
          {task.type === 'manga' ? '漫画' : task.type === 'illust' ? 'イラスト' : '打合せ'}
        </Item>
        <Item label="体裁">{task.type === 'manga' ? `${task.totalPages}P` : '1点'}</Item>
        <Item label="クライアント">
          <span className="font-gothic">{task.clientName || '—'}</span>
        </Item>
        <Item label="締切">
          {task.deadline ? task.deadline.replace(/-/g, '.') : '—'}
          <span className={days <= 7 ? 'text-accent' : ''}>
            {'　'}
            {days < 0 ? `超過 ${Math.abs(days)}日` : days === 0 ? '本日締切' : `残 ${days}日`}
          </span>
        </Item>
        {task.meetingDate && (
          <Item label="打合せ">{task.meetingDate.replace('T', '　').replace(/-/g, '.')}</Item>
        )}
        {task.type === 'manga' && (task.plotDeadline || task.nameDeadline || task.lineartDeadline) && (
          <Item label="中間締切">
            {[
              task.plotDeadline && `プロット ${task.plotDeadline.slice(5).replace('-', '.')}`,
              task.nameDeadline && `ネーム ${task.nameDeadline.slice(5).replace('-', '.')}`,
              task.lineartDeadline && `線画 ${task.lineartDeadline.slice(5).replace('-', '.')}`,
            ]
              .filter(Boolean)
              .join('　')}
          </Item>
        )}
        <Item label="入金">
          {task.depositStatus === 'paid' ? '済' : task.depositStatus === 'unpaid' ? '未' : '—'}
        </Item>
        <Item label="進捗">
          {stats.percent}%　{stats.checked}/{stats.total}
        </Item>
        {task.notes && (
          <div className="rule-b py-[9px]">
            <span className="mb-1 block text-note text-hojo">備考</span>
            <p className="whitespace-pre-wrap text-note leading-[1.8]">{task.notes}</p>
          </div>
        )}

        {/* 操作 */}
        <div className="mt-5 flex items-center gap-3">
          <button onClick={() => onEditTask(task)} className="btn btn-primary">
            編集
          </button>
          {calendarConnected && (
            <button onClick={() => onSyncCalendar(task)} className="btn">
              カレンダー登録
            </button>
          )}
        </div>
        <div className="mt-4">
          <button
            onClick={() => onDeleteTask(task.id)}
            className="tap flex items-center text-note text-accent"
            style={{ textDecoration: 'underline', textDecorationThickness: '0.5px' }}
          >
            この案件を削除
          </button>
        </div>
      </div>
    </div>
  );
}
