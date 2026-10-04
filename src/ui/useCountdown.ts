import { useEffect, useState } from "react";

/** Live milliseconds remaining until `endsAt`, ticking once a second - null while there's nothing to count down to. */
export function useCountdown(endsAt: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  return Math.max(0, endsAt - now);
}
