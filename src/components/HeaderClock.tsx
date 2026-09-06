import { useState, useEffect } from 'react';

interface HeaderClockProps {
  /** 旧デザインの名残。現在は配色が固定のため参照しない */
  isDark?: boolean;
  alwaysWhite?: boolean;
}

/** 題字欄の日付＋時刻。等幅 12px・補助色、時刻は1秒更新 */
export function HeaderClock(_props: HeaderClockProps) {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const y = dateTime.getFullYear();
  const m = String(dateTime.getMonth() + 1).padStart(2, '0');
  const d = String(dateTime.getDate()).padStart(2, '0');
  const w = ['日', '月', '火', '水', '木', '金', '土'][dateTime.getDay()];

  const formattedTime = dateTime.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <span className="num select-none whitespace-nowrap text-note text-hojo">
      {y}.{m}.{d}（{w}）　{formattedTime}
    </span>
  );
}
