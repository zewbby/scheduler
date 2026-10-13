import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import './focus.css';

type FocusTimerProps = {
  onClose: () => void;
  title?: string;
};

const MINUTE = 60_000;

export function FocusTimer({ onClose, title }: FocusTimerProps) {
  const [duration, setDuration] = useState(25);
  const [remaining, setRemaining] = useState(25 * MINUTE);
  const [running, setRunning] = useState(false);
  const deadline = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const closeCallback = useRef(onClose);
  const completed = remaining === 0;
  const seconds = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(1, 1 - remaining / (duration * MINUTE)));
  closeCallback.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeCallback.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]',
      ) ?? []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const next = Math.max(0, deadline.current - Date.now());
      setRemaining(next);
      if (next === 0) setRunning(false);
    };
    tick();
    const interval = window.setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);

  const chooseDuration = (minutes: number) => {
    const next = Math.max(5, Math.min(120, minutes));
    setDuration(next);
    setRemaining(next * MINUTE);
    setRunning(false);
  };

  const toggle = () => {
    if (running) {
      setRemaining(Math.max(0, deadline.current - Date.now()));
      setRunning(false);
    } else {
      const next = completed ? duration * MINUTE : remaining;
      setRemaining(next);
      deadline.current = Date.now() + next;
      setRunning(true);
    }
  };

  return (
    <div
      ref={dialog}
      className={`focus-overlay${running ? ' is-running' : ''}${completed ? ' is-complete' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-heading"
      aria-describedby="focus-description"
      tabIndex={-1}
    >
      <header className="focus-topbar">
        <button className="focus-back" onClick={onClose} aria-label="退出专注，返回日程">
          <ArrowLeft size={17} strokeWidth={1.6} />
          <span>返回日程</span>
        </button>
        <span className="focus-wordmark">留白</span>
        <span className="focus-escape">Esc 退出</span>
      </header>

      <main className="focus-main">
        <div className="focus-intro">
          <p className="focus-status" role="status" aria-live="polite">
            {completed ? '这一段时间，属于你。' : running ? '此刻，只做一件事。' : '给眼前的事，留一点时间。'}
          </p>
          <h1 id="focus-heading">{title?.trim() || '专注当下'}</h1>
          <p id="focus-description" className="focus-description">
            {completed ? '专注已完成。起身走走，再开始下一段。' : '让其他事情，稍后再说。'}
          </p>
        </div>

        <div className="focus-clock-wrap">
          <div className="focus-orbit focus-orbit-outer" aria-hidden="true" />
          <div className="focus-orbit focus-orbit-middle" aria-hidden="true" />
          <svg className="focus-progress" viewBox="0 0 320 320" aria-hidden="true">
            <circle className="focus-progress-track" cx="160" cy="160" r="148" />
            <circle
              className="focus-progress-value"
              cx="160"
              cy="160"
              r="148"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - progress}
            />
          </svg>
          <div className="focus-clock">
            <div className="focus-complete-mark" aria-hidden="true">{completed && <Check size={23} strokeWidth={1.5} />}</div>
            <span className="focus-time" role="timer" aria-label={`剩余 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`}>
              {String(Math.floor(seconds / 60)).padStart(2, '0')}<span className="focus-colon">:</span>{String(seconds % 60).padStart(2, '0')}
            </span>
            <span className="focus-clock-caption">{completed ? '专注完成' : running ? '专注中' : remaining < duration * MINUTE ? '已暂停' : '准备开始'}</span>
          </div>
        </div>

        <div className="focus-controls">
          <div className="focus-durations" aria-label="专注时长">
            <button className="focus-adjust" disabled={running || duration <= 5} onClick={() => chooseDuration(duration - 5)} aria-label="减少 5 分钟"><Minus size={14} /></button>
            {[25, 45, 60].map((minutes) => (
              <button
                key={minutes}
                className={duration === minutes ? 'is-selected' : ''}
                disabled={running}
                aria-pressed={duration === minutes}
                onClick={() => chooseDuration(minutes)}
              >{minutes} 分钟</button>
            ))}
            <button className="focus-adjust" disabled={running || duration >= 120} onClick={() => chooseDuration(duration + 5)} aria-label="增加 5 分钟"><Plus size={14} /></button>
          </div>
          <div className="focus-actions">
            <button className="focus-reset" onClick={() => chooseDuration(duration)} aria-label="重置专注计时"><RotateCcw size={17} strokeWidth={1.6} /></button>
            <button className="focus-primary" onClick={toggle}>
              {running ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} />}
              {running ? '暂停' : completed ? '再专注一段' : remaining < duration * MINUTE ? '继续专注' : '开始专注'}
            </button>
            <span className="focus-action-balance" aria-hidden="true" />
          </div>
        </div>
      </main>
      <footer className="focus-footer"><span className="focus-footer-line" /><span>慢一点，也没关系</span><span className="focus-footer-line" /></footer>
    </div>
  );
}

export default FocusTimer;
