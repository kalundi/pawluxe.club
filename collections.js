/* Pawluxe Club — Luxury Collections.
   Renders the curated collections from /collections.json. Clicking a card
   opens the product in the on-page Ecwid shop on pawluxe.club, exactly
   like bestsellers.js. Cards NEVER navigate to the Ecwid storefront
   (store140961751.company.site): the click is always intercepted, and if
   the Ecwid embed is still loading we wait for it; if it never loads, the
   shopper simply stays on pawluxe.club. */
(function () {
  var section = document.getElementById('luxuryCollections');
  if (!section) return;

  function money(n) { return '$' + Number(n).toFixed(2); }

  function scrollToShop() {
    var shop = document.getElementById('shop');
    if (shop) shop.scrollIntoView({ behavior: 'smooth' });
  }

  function openProduct(id, ev) {
    ev.preventDefault();
    scrollToShop();
    var tries = 0;
    (function attempt() {
      if (window.Ecwid && typeof window.Ecwid.openPage === 'function') {
        try { window.Ecwid.openPage('product', { id: id }); } catch (e) { /* stay on pawluxe.club */ }
        return;
      }
      tries++;
      if (tries <= 40) setTimeout(attempt, 250); /* wait up to ~10s for the embed */
      /* Ecwid never loaded: leave the shopper on pawluxe.club at #shop. */
    })();
  }

  fetch('/collections.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
    .then(function (data) {
      var cols = data.collections || [];
      if (!cols.length) throw new Error('empty');
      cols.forEach(function (col) {
        var grid = document.getElementById(col.grid);
        if (!grid) return;
        (col.products || []).forEach(function (p) {
          var a = document.createElement('a');
          a.className = 'colCard';
          a.href = '#shop'; /* on-site only — never the company.site storefront */
          a.setAttribute('data-product-id', p.id);
          a.setAttribute('aria-label', p.name + ' — ' + money(p.price));
          a.addEventListener('click', function (ev) { openProduct(p.id, ev); });

          var img = document.createElement('img');
          img.src = p.image;
          img.alt = p.name;
          img.loading = 'lazy';
          a.appendChild(img);

          var body = document.createElement('div');
          body.className = 'colBody';
          var name = document.createElement('span');
          name.className = 'colName';
          name.textContent = p.name;
          var price = document.createElement('span');
          price.className = 'colPrice';
          price.textContent = money(p.price);
          var reason = document.createElement('span');
          reason.className = 'colReason';
          reason.textContent = p.reason || '';
          body.appendChild(name);
          body.appendChild(price);
          if (p.reason) body.appendChild(reason);
          a.appendChild(body);

          grid.appendChild(a);
        });
      });
    })
    .catch(function () {
      section.style.display = 'none';
    });
})();
