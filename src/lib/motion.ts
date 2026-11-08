import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// The OS "Reduce Motion" setting, live. Every looping or entrance animation
// checks this: when it is on, loops hold still and entrances land instantly.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}
