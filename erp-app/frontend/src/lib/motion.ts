import type { Variants } from "framer-motion";

/** Container + item variants for a staggered fade/slide-up entrance —
 * used for stat-tile grids and card lists across the app. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 },
  },
};

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};
