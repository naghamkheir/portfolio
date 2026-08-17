/* ============================================================================
   Nagham Kheir portfolio — interactions
   ============================================================================ */

(function () {
  "use strict";

  /* ---------- footer year ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- nav / scrollbar / back-to-top on scroll ---------- */
  const nav = document.getElementById("nav");
  const burger = document.getElementById("navBurger");
  const links = document.getElementById("navLinks");
  const scrollbar = document.getElementById("scrollbar");
  const toTop = document.getElementById("toTop");

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      nav.classList.toggle("scrolled", y > 30);
      toTop.classList.toggle("show", y > 600);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      scrollbar.style.transform = "scaleX(" + (h > 0 ? Math.min(y / h, 1) : 0) + ")";
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  burger.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", open);
  });

  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      links.classList.remove("open");
      burger.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
    })
  );

  /* ---------- scroll reveal ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          revealObs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  revealEls.forEach((el) => revealObs.observe(el));

  /* ---------- videos: play when visible, pause when not ---------- */
  const videos = document.querySelectorAll("video[playsinline]");

  const videoObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          v.preload = "auto";
          v.play().catch(() => {});
          v.closest(".video-card")?.classList.add("playing");
        } else {
          v.pause();
          v.closest(".video-card")?.classList.remove("playing");
        }
      });
    },
    { threshold: 0.3 }
  );
  videos.forEach((v) => videoObs.observe(v));

  /* ---------- work tabs ---------- */
  const grid = document.getElementById("workGrid");
  const tabButtons = document.querySelectorAll(".work-tab");
  const cards = grid.querySelectorAll(".video-card");

  function showCategory(cat) {
    cards.forEach((c) => {
      const show = c.dataset.cat === cat;
      c.style.display = show ? "block" : "none";
      if (!show) {
        const v = c.querySelector("video");
        if (v) v.pause();
      }
    });
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.cat === cat));
  }

  tabButtons.forEach((b) =>
    b.addEventListener("click", () => showCategory(b.dataset.cat))
  );
  showCategory("content");

  /* ---------- lightbox: photos + videos ---------- */
  const lightbox = document.getElementById("lightbox");
  const lbImg = document.getElementById("lightboxImg");
  const lbPrev = document.getElementById("lightboxPrev");
  const lbNext = document.getElementById("lightboxNext");
  const lbClose = document.getElementById("lightboxClose");

  let lbItems = []; // { type: 'img'|'video', src }
  let lbIndex = 0;
  let lbVideo = null;

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    if (lbVideo) {
      lbVideo.pause();
      lbVideo.remove();
      lbVideo = null;
    }
    lbImg.style.display = "none";
    document.body.style.overflow = "";
  }

  function renderLightbox() {
    const item = lbItems[lbIndex];
    if (item.type === "video") {
      lbImg.style.display = "none";
      if (lbVideo) lbVideo.remove();
      lbVideo = document.createElement("video");
      lbVideo.src = item.src;
      lbVideo.controls = true;
      lbVideo.autoplay = true;
      lbVideo.playsInline = true;
      lbVideo.loop = false;
      lbVideo.classList.add("lb-video");
      lightbox.insertBefore(lbVideo, lbPrev);
      lbVideo.play().catch(() => {});
    } else {
      if (lbVideo) {
        lbVideo.pause();
        lbVideo.remove();
        lbVideo = null;
      }
      lbImg.style.display = "block";
      lbImg.src = item.src;
    }
  }

  function openLightbox(items, index) {
    lbItems = items;
    lbIndex = index;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // Arrows only make sense when there is more than one item
    const multi = lbItems.length > 1;
    lbPrev.style.display = multi ? "" : "none";
    lbNext.style.display = multi ? "" : "none";
    renderLightbox();
  }

  lbClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  lbPrev.addEventListener("click", () => {
    lbIndex = (lbIndex - 1 + lbItems.length) % lbItems.length;
    renderLightbox();
  });
  lbNext.addEventListener("click", () => {
    lbIndex = (lbIndex + 1) % lbItems.length;
    renderLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") lbPrev.click();
    if (e.key === "ArrowRight") lbNext.click();
  });

  /* photo grid -> lightbox */
  const photoItems = Array.from(document.querySelectorAll("#photoGrid figure img")).map(
    (img) => ({ type: "img", src: img.src })
  );
  document.querySelectorAll("#photoGrid figure").forEach((fig, i) =>
    fig.addEventListener("click", () => openLightbox(photoItems, i))
  );

  /* work videos -> lightbox with sound; arrows navigate within the active tab */
  function videoItemsFor(cat) {
    return Array.from(grid.querySelectorAll(".video-card"))
      .filter((c) => c.dataset.cat === cat && c.style.display !== "none")
      .map((c) => {
        const vv = c.querySelector("video");
        return { type: "video", src: vv.currentSrc || vv.src };
      });
  }

  document.querySelectorAll(".video-card").forEach((card) =>
    card.addEventListener("click", () => {
      const v = card.querySelector("video");
      if (!v) return;
      const cat = card.dataset.cat;
      const items = videoItemsFor(cat);
      // find the clicked card's position in the visible list
      const visible = Array.from(grid.querySelectorAll(".video-card")).filter(
        (c) => c.dataset.cat === cat && c.style.display !== "none"
      );
      openLightbox(items, Math.max(0, visible.indexOf(card)));
    })
  );

  /* testimonial video -> lightbox with sound */
  const testiFigure = document.querySelector(".testi-video");
  if (testiFigure) {
    testiFigure.addEventListener("click", () => {
      const v = testiFigure.querySelector("video");
      if (!v) return;
      openLightbox([{ type: "video", src: v.currentSrc || v.src }], 0);
    });
  }
})();
