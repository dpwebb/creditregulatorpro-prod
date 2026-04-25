import { useEffect, useState } from "react";

/**
 * Hook that animates counting from 0 to a target number
 * @param target - The target number to count to
 * @param duration - Duration of the animation in milliseconds (default: 1000)
 */
export function useCountAnimation(target: number | undefined, duration: number = 1000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === undefined) {
      setCount(0);
      return;
    }

    let startTime: number | null = null;
    const startValue = 0;
    
    const animate = (currentTime: number) => {
      if (startTime === null) {
        startTime = currentTime;
      }

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation (easeOutExpo)
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      const currentCount = Math.floor(startValue + (target - startValue) * easeProgress);
      setCount(currentCount);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return count;
}