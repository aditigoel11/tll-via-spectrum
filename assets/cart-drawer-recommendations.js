(function () {
  'use strict';

  var MAX_PRODUCTS = 6;
  var FETCH_LIMIT = 10;
  var CONTAINER_ID = 'cart-drawer-recommendations';

  var cachedProducts = [];
  var lastProductIds = '';
  var isLoading = false;
  var drawerObserver = null;

  /**
   * Shopify-standard money formatter (prices in cents)
   */
  function formatMoney(cents, moneyFormat) {
    if (typeof cents === 'string') {
      cents = cents.replace('.', '');
    }
    cents = parseInt(cents, 10) || 0;

    function formatWithDelimiters(number, precision, thousands, decimal) {
      precision = typeof precision === 'undefined' ? 2 : precision;
      thousands = typeof thousands === 'undefined' ? ',' : thousands;
      decimal = typeof decimal === 'undefined' ? '.' : decimal;

      if (isNaN(number) || number == null) return '0';

      number = (number / 100.0).toFixed(precision);
      var parts = number.split('.');
      var dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
      var centsStr = parts[1] ? decimal + parts[1] : '';
      return dollars + centsStr;
    }

    var match = moneyFormat.match(/\{\{\s*(\w+)\s*\}\}/);
    if (!match) return moneyFormat;

    var value;
    switch (match[1]) {
      case 'amount':
        value = formatWithDelimiters(cents, 2);
        break;
      case 'amount_no_decimals':
        value = formatWithDelimiters(cents, 0);
        break;
      case 'amount_with_comma_separator':
        value = formatWithDelimiters(cents, 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        value = formatWithDelimiters(cents, 0, '.', ',');
        break;
      case 'amount_with_apostrophe_separator':
        value = formatWithDelimiters(cents, 2, "'", '.');
        break;
      case 'amount_no_decimals_with_space_separator':
        value = formatWithDelimiters(cents, 0, ' ');
        break;
      case 'amount_with_space_separator':
        value = formatWithDelimiters(cents, 2, ' ', ',');
        break;
      default:
        value = formatWithDelimiters(cents, 2);
    }

    return moneyFormat.replace(/\{\{\s*\w+\s*\}\}/, value);
  }

  /**
   * Get optimized Shopify CDN image URL
   */
  function optimizeImageUrl(url, width) {
    if (!url) return '';
    var separator = url.indexOf('?') !== -1 ? '&' : '?';
    return url + separator + 'width=' + width;
  }

  /**
   * Get unique product IDs from the container data attribute
   */
  function getProductIds() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return [];
    var ids = container.dataset.productIds || '';
    var arr = ids.split(',').filter(Boolean);
    return Array.from(new Set(arr));
  }

  /**
   * Get set of product IDs currently in cart (for filtering)
   */
  function getCartProductIdSet() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return new Set();
    var ids = container.dataset.productIds || '';
    return new Set(ids.split(',').filter(Boolean));
  }

  /**
   * Fetch recommendations for up to 3 product IDs, merge, dedupe, filter
   */
  function fetchRecommendations(productIds) {
    var cartIds = getCartProductIdSet();
    var idsToFetch = productIds.slice(0, 3);

    var fetches = idsToFetch.map(function (id) {
      return fetch('/recommendations/products.json?product_id=' + id + '&limit=' + FETCH_LIMIT + '&intent=related')
        .then(function (r) {
          return r.ok ? r.json() : { products: [] };
        })
        .catch(function () {
          return { products: [] };
        });
    });

    return Promise.all(fetches).then(function (results) {
      var allProducts = [];
      var seenIds = new Set();

      for (var i = 0; i < results.length; i++) {
        var products = results[i].products || [];
        for (var j = 0; j < products.length; j++) {
          var product = products[j];
          if (cartIds.has(String(product.id))) continue;
          if (seenIds.has(product.id)) continue;
          if (!product.available) continue;

          var hasAvailableVariant = false;
          if (product.variants) {
            for (var k = 0; k < product.variants.length; k++) {
              if (product.variants[k].available) {
                hasAvailableVariant = true;
                break;
              }
            }
          }
          if (!hasAvailableVariant) continue;

          seenIds.add(product.id);
          allProducts.push(product);

          if (allProducts.length >= MAX_PRODUCTS) break;
        }
        if (allProducts.length >= MAX_PRODUCTS) break;
      }

      return allProducts;
    });
  }

  /**
   * Render a product card matching PDP product-card UI
   */
  function renderCard(product, moneyFormat) {
    var variant = null;
    if (product.variants) {
      for (var i = 0; i < product.variants.length; i++) {
        if (product.variants[i].available) {
          variant = product.variants[i];
          break;
        }
      }
    }
    if (!variant) variant = product.variants ? product.variants[0] : null;

    var price = variant ? variant.price : product.price;
    var compareAt = variant ? variant.compare_at_price : product.compare_at_price;
    var variantId = variant ? variant.id : null;
    var image = product.featured_image || (product.images && product.images[0]) || '';
    var imageUrl = typeof image === 'string' ? image : (image && image.src ? image.src : '');
    var thumbUrl = optimizeImageUrl(imageUrl, 400);
    var title = product.title.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    var isOnSale = compareAt && parseFloat(compareAt) > parseFloat(price);
    var isSoldOut = !product.available;

    // --- Badges ---
    var badgesHtml = '';

    // Discount % badge
    if (isOnSale) {
      var discount = Math.round(((parseFloat(compareAt) - parseFloat(price)) / parseFloat(compareAt)) * 100);
      if (discount > 0) {
        badgesHtml += '<div class="cart-reco__badge-discount">-' + discount + '% OFF</div>';
      }
    }

    // Sold out badge
    if (isSoldOut) {
      badgesHtml += '<div class="cart-reco__badge-soldout">SOLD OUT</div>';
    }

    // --- Price ---
    var priceHtml = '';
    if (isOnSale) {
      priceHtml =
        '<div class="cart-reco__price-wrapper">' +
        '<s class="cart-reco__compare-price">MRP ' + formatMoney(compareAt, moneyFormat) + '</s>' +
        '<span class="cart-reco__sale-price">' + formatMoney(price, moneyFormat) + '</span>' +
        '</div>';
    } else {
      priceHtml =
        '<div class="cart-reco__price-wrapper">' +
        '<span class="cart-reco__regular-price">' + formatMoney(price, moneyFormat) + '</span>' +
        '</div>';
    }

    // --- Tax info ---
    var taxHtml =
      '<div class="cart-reco__tax-info">' +
      '<span class="cart-reco__tax-inclusive">INCLUSIVE OF ALL TAXES</span>' +
      '<span class="cart-reco__tax-gst">GST BENEFIT INCLUDED</span>' +
      '</div>';

    // --- Quick add button (mobile only) ---
    var quickAddHtml = '';
    if (variantId && !isSoldOut) {
      quickAddHtml =
        '<button class="cart-reco__quick-add" data-variant-id="' + variantId + '" type="button" aria-label="Quick add">' +
        '<span class="cart-reco__quick-add-icon">+</span>' +
        '</button>';
    }

    return (
      '<div class="cart-reco__card">' +
      '<a href="' + product.url + '" class="cart-reco__image-wrap">' +
      '<img src="' + thumbUrl + '" alt="' + title + '" class="cart-reco__image" loading="lazy">' +
      badgesHtml +
      quickAddHtml +
      '</a>' +
      '<div class="cart-reco__details">' +
      '<a href="' + product.url + '" class="cart-reco__title">' + product.title + '</a>' +
      priceHtml +
      taxHtml +
      '</div>' +
      '</div>'
    );
  }

  /**
   * Handle quick-add click
   */
  function onQuickAdd(e) {
    e.preventDefault();
    e.stopPropagation();
    var btn = e.currentTarget;
    var variantId = btn.dataset.variantId;
    if (!variantId || btn.disabled) return;

    btn.disabled = true;
    var icon = btn.querySelector('.cart-reco__quick-add-icon');
    if (icon) icon.textContent = '...';

    var sectionIds = [];
    document.querySelectorAll('cart-items-component').forEach(function (el) {
      if (el.dataset && el.dataset.sectionId) sectionIds.push(el.dataset.sectionId);
    });

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        items: [{ id: parseInt(variantId, 10), quantity: 1 }],
        sections: sectionIds.join(','),
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status) {
          btn.disabled = false;
          if (icon) icon.textContent = '+';
          return;
        }
        if (icon) icon.textContent = '\u2713';
        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: data,
              sourceId: 'cart-drawer-recommendations',
              data: { source: 'cart-drawer-recommendations', sections: data.sections || {} },
            },
          })
        );
        setTimeout(function () {
          btn.disabled = false;
          if (icon) icon.textContent = '+';
          lastProductIds = '';
          loadRecommendations();
        }, 800);
      })
      .catch(function () {
        btn.disabled = false;
        if (icon) icon.textContent = '+';
      });
  }

  /**
   * Render recommendations into the container
   */
  function render(products) {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    var moneyFormat = container.dataset.moneyFormat || '${{amount}}';

    if (!products || products.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    var cardsHtml = '';
    for (var i = 0; i < products.length; i++) {
      cardsHtml += renderCard(products[i], moneyFormat);
    }

    container.innerHTML =
      '<div class="cart-reco__heading">YOU MAY ALSO LIKE</div>' +
      '<div class="cart-reco__scroll">' +
      cardsHtml +
      '</div>';

    // Attach quick-add handlers
    var buttons = container.querySelectorAll('.cart-reco__quick-add');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', onQuickAdd);
    }
  }

  /**
   * Main load function
   */
  function loadRecommendations() {
    var productIds = getProductIds();
    var currentIds = productIds.join(',');

    if (productIds.length === 0) {
      render([]);
      return;
    }

    if (currentIds === lastProductIds && cachedProducts.length > 0) {
      render(cachedProducts);
      return;
    }

    if (isLoading) return;
    isLoading = true;
    lastProductIds = currentIds;

    fetchRecommendations(productIds)
      .then(function (products) {
        cachedProducts = products;
        render(products);
      })
      .catch(function (err) {
        console.error('Cart recommendations error:', err);
      })
      .then(function () {
        isLoading = false;
      });
  }

  /**
   * Watch for cart drawer dialog open via MutationObserver
   */
  function observeDrawer() {
    var dialog = document.querySelector('cart-drawer-component dialog');
    if (!dialog) {
      setTimeout(observeDrawer, 500);
      return;
    }

    if (drawerObserver) return;

    drawerObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'open' && dialog.hasAttribute('open')) {
          setTimeout(loadRecommendations, 100);
          break;
        }
      }
    });

    drawerObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });

    if (dialog.hasAttribute('open')) {
      loadRecommendations();
    }
  }

  /**
   * Initialize
   */
  function init() {
    observeDrawer();

    document.addEventListener('cart:update', function () {
      setTimeout(function () {
        lastProductIds = '';
        loadRecommendations();
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
