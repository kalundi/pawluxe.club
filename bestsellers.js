/* Pawluxe Club — Best Sellers strip.
   Renders the top products from /bestsellers.json, which is re-ranked from
   real Ecwid orders by a weekly order check. Clicking a card opens the
   product in the on-page Ecwid shop when available. */
(function () {
  var grid = document.getElementById('bestSellersGrid');
  if (!grid) return;

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

  fetch('/bestsellers.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
    .then(function (data) {
      var items = (data.products || []).slice(0, 6);
      if (!items.length) throw new Error('empty');
      var note = document.getElementById('bestSellersNote');
      if (note && data.basis === 'sales') {
        note.textContent = 'Ranked by real Pawluxe orders — refreshed weekly.';
      }
      items.forEach(function (p, i) {
        var a = document.createElement('a');
        a.className = 'bsCard';
        a.href = p.url;
        a.setAttribute('aria-label', p.name + ' — ' + money(p.price));
        a.addEventListener('click', function (ev) { openProduct(p.id, p.url, ev); });

        var rank = document.createElement('span');
        rank.className = 'bsRank';
        rank.textContent = '#' + (i + 1);
        a.appendChild(rank);

        if (p.unitsSold > 0) {
          var sold = document.createElement('span');
          sold.className = 'bsSold';
          sold.textContent = p.unitsSold + ' sold';
          a.appendChild(sold);
        }

        var img = document.createElement('img');
        img.src = p.image;
        img.alt = p.name;
        img.loading = 'lazy';
        a.appendChild(img);

        var body = document.createElement('div');
        body.className = 'bsBody';
        var name = document.createElement('span');
        name.className = 'bsName';
        name.textContent = p.name;
        var price = document.createElement('span');
        price.className = 'bsPrice';
        price.textContent = money(p.price);
        body.appendChild(name);
        body.appendChild(price);
        a.appendChild(body);

        grid.appendChild(a);
      });
    })
    .catch(function () {
      var section = document.getElementById('bestSellers');
      if (section) section.style.display = 'none';
    });
})();
