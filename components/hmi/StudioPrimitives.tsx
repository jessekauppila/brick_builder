"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type StudioPanelProps = {
  children: ReactNode;
  className?: string;
};

export function StudioPanel({ children, className }: StudioPanelProps) {
  return <section className={cx("loupe-panel", className)}>{children}</section>;
}

type PanelHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export function PanelHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-300/80">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          {description ? <p className="max-w-3xl text-sm leading-6 text-slate-300">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  description,
  summary,
  defaultOpen = false,
  className,
  contentClassName,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={cx("loupe-section", className)} data-open={isOpen}>
      <button
        className="loupe-section-summary"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-3">
            <span className="loupe-summary-indicator" aria-hidden="true">
              &rsaquo;
            </span>
            <span className="text-sm font-semibold tracking-wide text-white">{title}</span>
          </div>
          {description ? <p className="pl-6 text-xs leading-5 text-slate-400">{description}</p> : null}
        </div>
        {summary ? <div className="hidden min-w-0 items-center gap-1.5 text-[0.65rem] leading-tight text-slate-400 sm:flex">{summary}</div> : null}
      </button>
      {isOpen ? (
        <div className={cx("border-t border-white/10 px-4 py-4", contentClassName)}>{children}</div>
      ) : null}
    </section>
  );
}

type StatusLightProps = {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  value?: ReactNode;
};

export function StatusLight({ label, tone = "neutral", value }: StatusLightProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-slate-200">
      <span className={cx("loupe-led", `loupe-led--${tone}`)} aria-hidden="true" />
      <span className="font-medium text-slate-100">{label}</span>
      {value ? <span className="text-slate-400">{value}</span> : null}
    </div>
  );
}

type MetricProps = {
  label: string;
  value: ReactNode;
};

export function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

type JsonBlockProps = {
  value: unknown;
  emptyLabel: string;
};

export function JsonBlock({ value, emptyLabel }: JsonBlockProps) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

type TooltipProps = {
  text: string;
  children: ReactNode;
};

export function Tooltip({ text, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  return (
    <span
      ref={triggerRef}
      className="group/tip relative inline-flex cursor-help items-center gap-1"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      <svg
        className={cx(
          "h-3.5 w-3.5 shrink-0 transition-colors",
          pos ? "text-sky-400" : "text-slate-500",
        )}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5v1" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
      {pos && (
        <span
          className="pointer-events-none fixed z-[9999] w-60 rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 text-[0.7rem] font-normal leading-relaxed text-slate-300 shadow-xl backdrop-blur"
          style={{ top: pos.y - 8, left: pos.x, transform: "translate(-50%, -100%)" }}
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
        </span>
      )}
    </span>
  );
}
