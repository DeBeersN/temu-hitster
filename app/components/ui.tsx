"use client";
import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import QRCode from "qrcode";
import type { Card } from "@/lib/game/types";

export function QrCode({ value, size = 190 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#0b0f1a", light: "#ffffff" },
    })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [value, size]);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Scan to join" width={size} height={size} className="rounded-lg" />
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const base =
    "rounded-xl px-5 py-3 font-semibold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100";
  const styles = {
    primary: "bg-accent text-black",
    ghost: "bg-white/10 text-white hover:bg-white/15",
    danger: "bg-red-500/90 text-white",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 ${className}`}>
      {children}
    </div>
  );
}

export function SongCard({
  card,
  hideYear = false,
  color,
}: {
  card: Card;
  hideYear?: boolean;
  color?: string;
}) {
  return (
    <div
      className="flex w-28 shrink-0 flex-col items-center rounded-xl bg-black/40 p-2 text-center ring-1 ring-white/10"
      style={color ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
    >
      <div className="text-3xl font-black tabular-nums">
        {hideYear ? "????" : card.year}
      </div>
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt="" className="my-1 h-16 w-16 rounded object-cover" />
      ) : (
        <div className="my-1 h-16 w-16 rounded bg-white/10" />
      )}
      <div className="line-clamp-2 text-xs font-medium leading-tight">{card.title}</div>
      <div className="line-clamp-1 text-[10px] text-white/50">{card.artists}</div>
    </div>
  );
}

// Shows a player's timeline with the still-mystery card ("????") inserted at the
// gap they chose — so everyone can see the placement and decide to contest it.
export function PlacementPreview({ cards, index }: { cards: Card[]; index: number }) {
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
      {cards.slice(0, index).map((c) => (
        <SongCard key={c.token} card={c} />
      ))}
      <div className="flex w-28 shrink-0 flex-col items-center justify-center rounded-xl bg-accent/20 p-2 text-center ring-2 ring-accent">
        <div className="text-3xl font-black">????</div>
        <div className="mt-1 text-[10px] uppercase tracking-wide text-accent">
          placed here
        </div>
      </div>
      {cards.slice(index).map((c) => (
        <SongCard key={c.token} card={c} />
      ))}
    </div>
  );
}

// A player's timeline. In `placing` mode it shows tappable gaps so the active
// player can choose where the mystery song slots in.
export function Timeline({
  cards,
  placing = false,
  selectedIndex = null,
  onSelectGap,
}: {
  cards: Card[];
  placing?: boolean;
  selectedIndex?: number | null;
  onSelectGap?: (index: number) => void;
}) {
  const gap = (index: number) => {
    if (!placing) return null;
    const active = selectedIndex === index;
    return (
      <button
        key={`gap-${index}`}
        onClick={() => onSelectGap?.(index)}
        className={`flex h-24 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition ${
          active
            ? "border-accent bg-accent/20"
            : "border-white/20 hover:border-white/40"
        }`}
        aria-label={`Place here, position ${index + 1}`}
      >
        {active ? <span className="text-2xl font-black text-accent">?</span> : "+"}
      </button>
    );
  };

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
      {gap(0)}
      {cards.map((c, i) => (
        <div key={c.token} className="flex items-stretch gap-2">
          <SongCard card={c} />
          {gap(i + 1)}
        </div>
      ))}
      {cards.length === 0 && !placing && (
        <div className="py-8 text-sm text-white/40">No cards yet.</div>
      )}
    </div>
  );
}
