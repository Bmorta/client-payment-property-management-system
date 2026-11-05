import { useEffect, useState } from "react";
import { manilaTimestamp } from "../utils/manilaTime.js";
export default function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  return <time className="d-block small text-secondary" aria-label="Current Philippine date and time" dateTime={now.toISOString()}>{manilaTimestamp(now)} PHT</time>;
}
