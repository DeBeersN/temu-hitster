import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="space-y-4">
        <Image
          src="/logo.jpg"
          alt="A star dancing on a disco floor"
          width={1000}
          height={750}
          priority
          className="mx-auto w-64 max-w-[72vw] rotate-[-2deg] rounded-2xl shadow-xl ring-1 ring-white/10"
        />
        <div className="text-5xl font-black tracking-tight">
          Temu <span className="text-accent">Hitster</span>
        </div>
        <p className="mx-auto max-w-sm text-white/60">
          The music timeline game — but the deck is <em>your</em> Spotify listening
          history. Hear a song, guess where it lands in time, build your timeline.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/host"
          className="rounded-xl bg-accent px-5 py-4 text-lg font-bold text-black transition active:scale-95"
        >
          Host a game
        </Link>
        <Link
          href="/join"
          className="rounded-xl bg-white/10 px-5 py-4 text-lg font-semibold transition hover:bg-white/15 active:scale-95"
        >
          Join a game
        </Link>
      </div>

      <p className="max-w-xs text-xs text-white/40">
        One host (needs Spotify Premium) is the DJ. Everyone else joins on their own
        phone with the room code.
      </p>
    </main>
  );
}
