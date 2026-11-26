"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeLogin } from "@/lib/spotify/auth";

export default function Callback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const authError = params.get("error");
    if (authError) {
      setError(`Spotify said: ${authError}`);
      return;
    }
    if (!code) {
      setError("No authorization code came back from Spotify.");
      return;
    }
    completeLogin(code)
      .then(() => router.replace("/host"))
      .catch((e) => setError(String(e)));
  }, [router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <p className="text-red-400">{error}</p>
          <a href="/host" className="text-accent underline">
            Back to host
          </a>
        </>
      ) : (
        <p className="text-white/60">Connecting to Spotify…</p>
      )}
    </main>
  );
}
