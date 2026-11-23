/* Pawluxe Club — site-wide language switcher (English / Español / Français)
 *
 * Loads the Google Translate element (pageLanguage 'en',
 * includedLanguages 'en,es,fr') and drives it from the custom EN / ES / FR
 * buttons in the header. The choice is stored in the standard `googtrans`
 * cookie, so it persists across pages and visits. Google Translate reads
 * that cookie on every page load and translates the whole page.
 */
(function () {
  'use strict';

  var COOKIE_DAYS = 365;

  function readLang() {
    var match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
    if (match) {
      var parts = decodeURIComponent(match[1]).split('/');
      var lang = parts[parts.length - 1];
      if (lang === 'es' || lang === 'fr') return lang;
    }
    return 'en';
  }

  function writeCookie(lang) {
    var value = '/en/' + lang;
    var expires = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
    var base = '; expires=' + expires + '; path=/';
    document.cookie = 'googtrans=' + value + base;
    var host = window.location.hostname;
    if (host && host.indexOf('.') !== -1) {
      document.cookie = 'googtrans=' + value + base + '; domain=' + host;
      var root = host.split('.').slice(-2).join('.');
      document.cookie = 'googtrans=' + value + base + '; domain=.' + root;
    }
  }

  function markActive() {
    var current = readLang();
    var buttons = document.querySelectorAll('.lang-switcher .lang-btn');
    for (var i = 0; i < buttons.length; i++) {
      var isActive = buttons[i].getAttribute('data-lang') === current;
      buttons[i].classList.toggle('is-active', isActive);
      buttons[i].setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  function choose(lang) {
    if (lang !== 'en' && lang !== 'es' && lang !== 'fr') return;
    if (lang === readLang()) return;
    writeCookie(lang);
    // Reload so Google Translate applies (or clears) the translation from
    // the cookie consistently across the whole page, including the shop.
    window.location.reload();
  }

  function wireButtons() {
    var buttons = document.querySelectorAll('.lang-switcher .lang-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        choose(this.getAttribute('data-lang'));
      });
    }
    markActive();
  }

  // Google Translate element bootstrap.
  window.googleTranslateElementInit = function () {
    if (!window.google || !google.translate || !google.translate.TranslateElement) return;
    new google.translate.TranslateElement(
      { pageLanguage: 'en', includedLanguages: 'en,es,fr', autoDisplay: false },
      'google_translate_element'
    );
  };

  function loadGoogleTranslate() {
    if (document.getElementById('google_translate_element')) return;
    var holder = document.createElement('div');
    holder.id = 'google_translate_element';
    holder.setAttribute('aria-hidden', 'true');
    document.body.appendChild(holder);
    var script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.body.appendChild(script);
  }

  function init() {
    wireButtons();
    loadGoogleTranslate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
