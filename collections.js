/* Pawluxe Club — Luxury Collections.
   Renders the curated collections from /collections.json. Clicking a card
   opens the product in the on-page Ecwid shop, exactly like bestsellers.js. */
(function () {
  var section = document.getElementById('luxuryCollections');
  if (!section) return;

  function money(n) { return '$' + Number(n).toFixed(2); }

  function openProduct(id, url, ev) {
    if (window.Ecwid && typeof window.Ecwid.openPage === 'function') {
      ev.preventDefault();
      window.Ecwid.openPage('product', { id: id });
      var shop = document.getElementById('shop');
      if (shop) shop.scrollIntoView({ behavior: 'smooth' });
    }
    /* otherwise the href (storefront product page) takes over */
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
          a.href = p.url;
          a.setAttribute('aria-label', p.name + ' — ' + money(p.price));
          a.addEventListener('click', function (ev) { openProduct(p.id, p.url, ev); });

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
