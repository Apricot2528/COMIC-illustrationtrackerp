import { useState, useEffect } from 'react';

interface HeaderClockProps {
  isDark: boolean;
  alwaysWhite?: boolean;
}

export function HeaderClock({ isDark, alwaysWhite = false }: HeaderClockProps) {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = dateTime.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });
  
  const formattedTime = dateTime.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const dateColorClass = alwaysWhite 
    ? 'text-slate-300' 
    : 'text-slate-400 dark:text-indigo-300';
    
  const timeColorClass = alwaysWhite
    ? 'text-white'
    : isDark ? 'text-indigo-100' : 'text-slate-800 dark:text-indigo-105';

  return (
    <div className="text-right select-none shrink-0">
      <div className={`text-xs md:text-sm font-bold tracking-wider ${dateColorClass}`}>
        {formattedDate}
      </div>
      <div className={`text-3xl md:text-4xl lg:text-5xl font-mono font-black mt-1 leading-none tracking-tight ${timeColorClass}`}>
        {formattedTime}
      </div>
    </div>
  );
}
