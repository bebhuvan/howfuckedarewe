/**
 * Scroll-triggered animations utility
 *
 * Lightweight IntersectionObserver-based animation trigger.
 * No heavy libraries needed. Just add [data-animate] to elements.
 */

export function initScrollAnimations(): void {
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) {
    // If reduced motion is preferred, show all elements immediately
    document.querySelectorAll("[data-animate]").forEach((el) => {
      el.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          // Optional: Stop observing once animated
          observer.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      rootMargin: "0px 0px -50px 0px", // Trigger 50px before element enters viewport
      threshold: 0.1,
    }
  );

  // Observe all elements with data-animate attribute
  document.querySelectorAll("[data-animate]").forEach((el) => {
    observer.observe(el);
  });
}

// Auto-initialize when DOM is ready
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScrollAnimations);
  } else {
    initScrollAnimations();
  }
}
