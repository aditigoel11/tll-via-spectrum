import { Component } from '@theme/component';

/**
 * Announcement banner custom element that slides between content horizontally.
 * Matches Embla-style translate3d sliding animation.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} slidesContainer
 * @property {HTMLElement[]} [slides]
 *
 * @extends {Component<Refs>}
 */
export class AnnouncementBar extends Component {
  #current = 0;

  /**
   * The interval ID for automatic playback.
   * @type {number|undefined}
   */
  #interval = undefined;

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('mouseenter', this.suspend);
    this.addEventListener('mouseleave', this.resume);
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);

    this.play();
  }

  next() {
    this.current += 1;
  }

  previous() {
    this.current -= 1;
  }

  /**
   * Starts automatic slide playback.
   * Always clears any existing interval first to prevent stacking.
   * @param {number} [interval] - The time interval in seconds between slides.
   */
  play(interval = this.autoplayInterval) {
    if (!this.autoplay) return;

    this.suspend();
    this.paused = false;

    this.#interval = setInterval(() => {
      if (this.matches(':hover') || document.hidden) return;

      this.next();
    }, interval);
  }

  /**
   * Pauses automatic slide playback (user-initiated, won't auto-resume).
   */
  pause() {
    this.paused = true;
    this.suspend();
  }

  get paused() {
    return this.hasAttribute('paused');
  }

  set paused(paused) {
    this.toggleAttribute('paused', paused);
  }

  /**
   * Suspends automatic slide playback (clears interval).
   */
  suspend() {
    clearInterval(this.#interval);
    this.#interval = undefined;
  }

  /**
   * Resumes automatic slide playback if not manually paused.
   */
  resume() {
    if (!this.autoplay || this.paused) return;

    this.play();
  }

  get autoplay() {
    return Boolean(this.autoplayInterval);
  }

  get autoplayInterval() {
    const interval = this.getAttribute('autoplay');
    const value = parseInt(`${interval}`, 10);

    if (Number.isNaN(value)) return undefined;

    return value * 1000;
  }

  get current() {
    return this.#current;
  }

  set current(current) {
    this.#current = current;

    const slidesCount = (this.refs.slides ?? []).length;
    if (slidesCount === 0) return;

    let relativeIndex = current % slidesCount;
    if (relativeIndex < 0) {
      relativeIndex += slidesCount;
    }

    // Slide animation using translate3d
    if (this.refs.slidesContainer) {
      const offset = -relativeIndex * 100;
      this.refs.slidesContainer.style.transform = `translate3d(${offset}%, 0px, 0px)`;
    }

    // Update aria-hidden for accessibility
    this.refs.slides?.forEach((slide, index) => {
      slide.setAttribute('aria-hidden', `${index !== relativeIndex}`);
    });
  }

  /**
   * Suspend the slideshow when the page is hidden, restart when visible.
   * Uses suspend/play instead of pause/resume to avoid setting the paused flag.
   */
  #handleVisibilityChange = () => {
    if (document.hidden) {
      this.suspend();
    } else if (!this.paused) {
      this.suspend();
      this.play();
    }
  };
}

if (!customElements.get('announcement-bar-component')) {
  customElements.define('announcement-bar-component', AnnouncementBar);
}
