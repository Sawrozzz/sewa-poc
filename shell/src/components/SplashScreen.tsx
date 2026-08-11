"use client";

import Lottie from "lottie-react";
import { useEffect, useState } from "react";
import splashAnim from "../../public/assets/animations/splash-animation.json";
import styles from "./SplashScreen.module.css";

export default function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const animationTimer = setTimeout(() => {
      setIsFadingOut(true); // Trigger CSS fade-out animation

      const unmountTimer = setTimeout(() => {
        setIsVisible(false); // Remove completely from the DOM tree
      }, 600); // Must match CSS transition duration

      return () => clearTimeout(unmountTimer);
    }, 2000);

    return () => clearTimeout(animationTimer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className={`${styles.overlay} ${isFadingOut ? styles.fadeOut : ""}`}>
      <div className={styles.animationWrapper}>
        <Lottie
          animationData={splashAnim}
          autoplay={true}
          loop={true}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
