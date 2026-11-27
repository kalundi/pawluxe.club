/* Pawluxe Club — Luxury Polish: gentle fade-in-on-scroll for sections.
   Content is only hidden once this script runs and marks it, so no-JS
   visitors and crawlers always see everything. Respects
   prefers-reduced-motion. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;
  var targets = document.querySelectorAll("main section");
  if (!targets.length) return;
  targets.forEach(function (el) { el.classList.add("luxReveal"); });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add("luxIn");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
  targets.forEach(function (el) { io.observe(el); });
  /* Safety net: never leave an on-screen section hidden. */
  setTimeout(function () {
    document.querySelectorAll(".luxReveal:not(.luxIn)").forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("luxIn");
    });
  }, 2500);
})();
