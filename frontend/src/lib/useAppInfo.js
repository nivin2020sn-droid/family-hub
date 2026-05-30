// Shared app-info hook (name + version + stage) used by the Beta gate, the
// Settings dialog, and the Terms page. Result is cached in module scope so
// subsequent mounts don't refetch within the same browser session.
import { useEffect, useState } from "react";

let cache = null;
let inflight = null;

export function useAppInfo() {
  const [info, setInfo] = useState(cache);

  useEffect(() => {
    if (cache) return;
    if (!inflight) {
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/auth/app/info`;
      inflight = fetch(url)
        .then((r) => r.json())
        .then((d) => { cache = d || {}; return cache; })
        .catch(() => { cache = {}; return cache; });
    }
    let alive = true;
    inflight.then((d) => { if (alive) setInfo(d); });
    return () => { alive = false; };
  }, []);

  return info || {};
}
