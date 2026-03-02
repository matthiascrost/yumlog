// app.js — Yumlog shared application logic

// ── DB Module ──────────────────────────────────────────────────────────────

const DB = (() => {
  const KEY = 'yumlog_db';

  function init() {
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify({
        users: SEED_USERS,
        restaurants: SEED_RESTAURANTS,
        reviews: SEED_REVIEWS,
      }));
    }
  }

  function get() {
    init();
    return JSON.parse(localStorage.getItem(KEY));
  }

  function save(db) {
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  function getUser(id) {
    return get().users.find(u => u.id === id) || null;
  }

  function getUserByEmail(email) {
    return get().users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  function getRestaurant(id) {
    return get().restaurants.find(r => r.id === id) || null;
  }

  function getRestaurants() {
    return get().restaurants;
  }

  function getReviews(restaurantId) {
    return get().reviews.filter(r => r.restaurantId === restaurantId);
  }

  function getUserReviews(userId) {
    return get().reviews.filter(r => r.userId === userId);
  }

  function addReview(review) {
    const db = get();
    db.reviews.push(review);
    // Award points to author
    const user = db.users.find(u => u.id === review.userId);
    if (user) {
      user.points += review.type === 'blog' ? POINTS.blogPost : POINTS.quickReview;
    }
    save(db);
  }

  function updateUser(userId, fields) {
    const db = get();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...fields };
      save(db);
    }
  }

  function addUser(user) {
    const db = get();
    db.users.push(user);
    save(db);
  }

  // Vote on a review. Returns 'added' or 'removed'.
  function vote(actorUserId, reviewId, type) {
    const key = `yumlog_votes`;
    const votes = JSON.parse(localStorage.getItem(key) || '{}');
    const voteKey = `${actorUserId}:${reviewId}:${type}`;

    const db = get();
    const review = db.reviews.find(r => r.id === reviewId);
    if (!review) return;

    if (votes[voteKey]) {
      // Remove vote
      delete votes[voteKey];
      if (type === 'helpful') review.helpfulVotes = Math.max(0, review.helpfulVotes - 1);
      else review.honestVotes = Math.max(0, review.honestVotes - 1);
      // Remove points from review author
      const author = db.users.find(u => u.id === review.userId);
      if (author) author.points = Math.max(0, author.points - POINTS.helpfulVote);
      localStorage.setItem(key, JSON.stringify(votes));
      save(db);
      return 'removed';
    } else {
      // Add vote
      votes[voteKey] = true;
      if (type === 'helpful') review.helpfulVotes += 1;
      else review.honestVotes += 1;
      // Award points to review author
      const author = db.users.find(u => u.id === review.userId);
      if (author) author.points += POINTS.helpfulVote;
      localStorage.setItem(key, JSON.stringify(votes));
      save(db);
      return 'added';
    }
  }

  function hasVoted(actorUserId, reviewId, type) {
    const votes = JSON.parse(localStorage.getItem('yumlog_votes') || '{}');
    return !!votes[`${actorUserId}:${reviewId}:${type}`];
  }

  return { init, get, save, getUser, getUserByEmail, getRestaurant, getRestaurants, getReviews, getUserReviews, addReview, updateUser, addUser, vote, hasVoted };
})();

// ── Auth Module ────────────────────────────────────────────────────────────

const Auth = (() => {
  const KEY = 'yumlog_session';

  function getSession() {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  }

  function setSession(userId) {
    localStorage.setItem(KEY, JSON.stringify({ userId }));
  }

  function clearSession() {
    localStorage.removeItem(KEY);
  }

  function getCurrentUser() {
    const session = getSession();
    if (!session) return null;
    return DB.getUser(session.userId);
  }

  function login(email, password) {
    const user = DB.getUserByEmail(email);
    if (!user) return { ok: false, error: 'No account found with that email.' };
    if (user.password && user.password !== password) return { ok: false, error: 'Incorrect password.' };
    setSession(user.id);
    return { ok: true, user };
  }

  function register(name, email, password) {
    if (DB.getUserByEmail(email)) return { ok: false, error: 'An account with that email already exists.' };
    const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const gradients = [
      'linear-gradient(135deg,#E63946,#F4622A)',
      'linear-gradient(135deg,#F4622A,#F9A825)',
      'linear-gradient(135deg,#9C27B0,#E91E63)',
      'linear-gradient(135deg,#2196F3,#00BCD4)',
      'linear-gradient(135deg,#4CAF50,#8BC34A)',
    ];
    const newUser = {
      id: 'u' + Date.now(),
      name: name.trim(),
      initials,
      email: email.toLowerCase(),
      password,
      points: 0,
      location: 'Sydney, NSW',
      memberSince: new Date().toISOString().slice(0, 7),
      bio: 'New to Yumlog. Ready to discover great food!',
      followers: 0,
      following: 0,
      avatarGradient: gradients[Math.floor(Math.random() * gradients.length)],
    };
    DB.addUser(newUser);
    setSession(newUser.id);
    return { ok: true, user: newUser };
  }

  function logout() {
    clearSession();
    location.href = 'index.html';
  }

  return { getSession, getCurrentUser, login, register, logout };
})();

// ── Utilities ──────────────────────────────────────────────────────────────

function getRank(points) {
  return [...RANKS].reverse().find(r => points >= r.minPts) || RANKS[0];
}

function getNextRank(points) {
  return RANKS.find(r => r.minPts > points) || null;
}

function starsHTML(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function fullStarsHTML(rating) {
  // Returns filled/empty stars based on rounded rating
  const rounded = Math.round(rating);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? 's' : ''} ago`;
}

// ── Open Now (checks current time against restaurant.hours) ────────────────

function isOpenNow(restaurant) {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const hoursStr = restaurant.hours[days[new Date().getDay()]];
  if (!hoursStr) return false;
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();
  return hoursStr.split('&').some(slot => {
    const [open, close] = slot.trim().split('–');
    if (!open || !close) return false;
    const toMins = s => { const [h, m] = s.trim().split(':').map(Number); return h * 60 + (m || 0); };
    return curMins >= toMins(open) && curMins < toMins(close);
  });
}

// ── Weighted Rating ────────────────────────────────────────────────────────

function getWeightedRating(restaurantId) {
  const reviews = DB.getReviews(restaurantId);
  if (!reviews.length) return { weighted: 0, naive: 0, count: 0, helpfulPct: 0, honestPct: 0 };

  let weightedSum = 0, weightSum = 0, naiveSum = 0;
  let totalHelpful = 0, totalHonest = 0, totalVotes = 0;

  reviews.forEach(rv => {
    const user = DB.getUser(rv.userId);
    const rank = getRank(user ? user.points : 0);
    const w = rank.weight;
    weightedSum += rv.rating * w;
    weightSum += w;
    naiveSum += rv.rating;
    totalHelpful += rv.helpfulVotes;
    totalHonest += rv.honestVotes;
    totalVotes += rv.helpfulVotes + rv.honestVotes;
  });

  const totalCastVotes = reviews.reduce((s, r) => s + r.helpfulVotes + r.honestVotes, 0);
  const helpfulPct = totalCastVotes ? Math.round((totalHelpful / totalCastVotes) * 100) : 0;
  const honestPct  = totalCastVotes ? Math.round((totalHonest  / totalCastVotes) * 100) : 0;

  return {
    weighted: Math.round((weightedSum / weightSum) * 10) / 10,
    naive:    Math.round((naiveSum / reviews.length) * 10) / 10,
    count:    reviews.length,
    helpfulPct,
    honestPct,
    totalHelpfulVotes: totalHelpful,
    totalHonestVotes:  totalHonest,
  };
}

// ── Navbar ─────────────────────────────────────────────────────────────────

function updateNavbar() {
  const user = Auth.getCurrentUser();
  const navLinks = document.getElementById('navLinks');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!navLinks) return;

  if (user) {
    navLinks.innerHTML = `
      <a href="search.html">Explore</a>
      <a href="top-reviewers.html">Top Reviewers</a>
      <a href="#">Blog</a>
      <a href="profile.html" class="btn-login">${user.initials} ${user.name.split(' ')[0]}</a>
      <a href="#" class="btn-signup" onclick="Auth.logout();return false;">Log out</a>
    `;
    if (mobileMenu) mobileMenu.innerHTML = `
      <a href="search.html">Explore</a>
      <a href="top-reviewers.html">Top Reviewers</a>
      <a href="#">Blog</a>
      <a href="profile.html">My Profile</a>
      <a href="#" onclick="Auth.logout();return false;">Log out</a>
    `;
  } else {
    navLinks.innerHTML = `
      <a href="search.html">Explore</a>
      <a href="top-reviewers.html">Top Reviewers</a>
      <a href="#">Blog</a>
      <a href="login.html" class="btn-login">Log in</a>
      <a href="login.html" class="btn-signup">Sign up</a>
    `;
    if (mobileMenu) mobileMenu.innerHTML = `
      <a href="search.html">Explore</a>
      <a href="top-reviewers.html">Top Reviewers</a>
      <a href="#">Blog</a>
      <a href="login.html">Log in</a>
      <a href="login.html">Sign up</a>
    `;
  }
}

// ── Page: Home ─────────────────────────────────────────────────────────────

function initHome() {
  const input = document.querySelector('.search-box input');
  const btn   = document.querySelector('.search-box button');

  function doSearch() {
    const q = input ? input.value.trim() : '';
    location.href = 'search.html' + (q ? '?q=' + encodeURIComponent(q) : '');
  }

  if (btn) btn.addEventListener('click', doSearch);
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  document.querySelectorAll('.search-tags span').forEach(tag => {
    tag.addEventListener('click', () => {
      const text = tag.textContent.replace(/[^\w\s]/g, '').trim().toLowerCase();
      location.href = 'search.html?q=' + encodeURIComponent(text);
    });
  });
}

// ── Page: Search ───────────────────────────────────────────────────────────

function initSearch() {
  const params    = new URLSearchParams(location.search);
  const qInput    = document.querySelector('.search-box input');
  const grid      = document.getElementById('restaurantGrid');
  const countEl   = document.getElementById('resultsCount');
  const sortSel   = document.querySelector('.sort-select');

  // Pre-fill search from URL
  if (qInput && params.get('q')) qInput.value = params.get('q');

  // Pre-activate cuisine tile from URL
  if (params.get('q')) {
    const q = params.get('q').toLowerCase();
    document.querySelectorAll('.cuisine-tile').forEach(t => {
      if (t.dataset.cuisine === q) t.classList.add('active');
    });
  }

  // Search button
  const searchBtn = document.querySelector('.search-box button');
  if (searchBtn) searchBtn.addEventListener('click', applyFilters);
  if (qInput) qInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyFilters(); });
  if (sortSel) sortSel.addEventListener('change', applyFilters);

  // Filter interactions
  document.querySelectorAll('.price-btn').forEach(btn => {
    btn.addEventListener('click', function() { this.classList.toggle('active'); applyFilters(); });
  });
  document.querySelectorAll('.cuisine-tile').forEach(tile => {
    tile.addEventListener('click', function() { this.classList.toggle('active'); applyFilters(); });
  });
  document.querySelectorAll('.rating-option input').forEach(r => {
    r.addEventListener('change', applyFilters);
  });
  document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', function() {
      if (this.id === 'customhours') toggleCustomTime();
      else applyFilters();
    });
  });
  document.querySelector('.filter-clear').addEventListener('click', clearFilters);

  applyFilters();

  function applyFilters() {
    let restaurants = DB.getRestaurants();
    const q = qInput ? qInput.value.trim().toLowerCase() : '';

    // Text search
    if (q) {
      restaurants = restaurants.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.suburb.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    }

    // Cuisine tiles
    const activeCuisines = [...document.querySelectorAll('.cuisine-tile.active')].map(t => t.dataset.cuisine);
    if (activeCuisines.length) {
      restaurants = restaurants.filter(r => activeCuisines.includes(r.cuisine));
    }

    // Price
    const activePrices = [...document.querySelectorAll('.price-btn.active')].map(b => b.textContent.trim());
    if (activePrices.length) {
      restaurants = restaurants.filter(r => activePrices.includes(r.priceRange));
    }

    // Rating
    const ratingVal = document.querySelector('.rating-option input:checked');
    if (ratingVal) {
      const minRating = parseFloat(ratingVal.closest('.rating-option').querySelector('label').textContent.match(/[\d.]+/)[0]);
      restaurants = restaurants.filter(r => {
        const { weighted } = getWeightedRating(r.id);
        return weighted >= minRating || DB.getReviews(r.id).length === 0;
      });
    }

    // Open now
    if (document.getElementById('opennow') && document.getElementById('opennow').checked) {
      restaurants = restaurants.filter(r => isOpenNow(r));
    }

    // Accessibility
    if (document.getElementById('wheelchair') && document.getElementById('wheelchair').checked) {
      restaurants = restaurants.filter(r => r.wheelchairAccessible);
    }
    if (document.getElementById('parking') && document.getElementById('parking').checked) {
      restaurants = restaurants.filter(r => r.parking);
    }

    // Sort
    const sortVal = sortSel ? sortSel.value : 'Best match';
    if (sortVal === 'Highest rated') {
      restaurants.sort((a, b) => getWeightedRating(b.id).weighted - getWeightedRating(a.id).weighted);
    } else if (sortVal === 'Most reviewed') {
      restaurants.sort((a, b) => DB.getReviews(b.id).length - DB.getReviews(a.id).length);
    } else if (sortVal === 'Nearest first') {
      restaurants.sort((a, b) => a.distance - b.distance);
    }

    renderResults(restaurants);
  }

  function clearFilters() {
    if (qInput) qInput.value = '';
    document.querySelectorAll('.cuisine-tile.active').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.price-btn.active').forEach(b => b.classList.remove('active'));
    const defaultRating = document.getElementById('r40');
    if (defaultRating) defaultRating.checked = true;
    document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => cb.checked = false);
    applyFilters();
  }

  function renderResults(restaurants) {
    if (!grid) return;

    if (countEl) {
      countEl.innerHTML = `<strong>${restaurants.length} restaurant${restaurants.length !== 1 ? 's' : ''}</strong> match your search`;
    }

    if (!restaurants.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--mid);">
        <div style="font-size:3rem;margin-bottom:1rem;">🍽️</div>
        <strong style="font-size:1.1rem;color:var(--dark);">No restaurants found</strong>
        <p style="margin-top:0.5rem;">Try adjusting your filters</p>
      </div>`;
      return;
    }

    grid.innerHTML = restaurants.map(r => {
      const { weighted, count } = getWeightedRating(r.id);
      const stars = count ? fullStarsHTML(weighted) : '☆☆☆☆☆';
      const score = count ? weighted.toFixed(1) : '–';
      const badge = r.badges[0] ? `<div class="card-badge">${r.badges[0]}</div>` : '';
      const openBadge = isOpenNow(r) ? '<span class="mini-badge open">Open now</span>' : '<span class="mini-badge">Closed</span>';
      const accBadge  = r.wheelchairAccessible ? '<span class="mini-badge">♿ Accessible</span>' : '';
      const parkBadge = r.parking ? '<span class="mini-badge">🅿️ Parking</span>' : '';

      return `<div class="restaurant-card" onclick="location.href='restaurant.html?id=${r.id}'" style="cursor:pointer;">
        <div class="card-img" style="background:${r.imgGradient};">
          ${r.emoji}
          ${badge}
        </div>
        <div class="card-body">
          <h3>${r.name}</h3>
          <div class="card-meta">
            <span>${capitalize(r.cuisine)}</span>
            <span>•</span>
            <span>${r.priceRange}</span>
            <span>•</span>
            <span>📍 ${r.distance}km</span>
          </div>
          <div class="card-rating">
            <span class="stars">${stars}</span>
            <span class="rating-num">${score}</span>
            <span class="review-count">(${count} review${count !== 1 ? 's' : ''})</span>
          </div>
          <div class="card-badges">
            ${openBadge}${accBadge}${parkBadge}
          </div>
        </div>
      </div>`;
    }).join('');
  }
}

// ── Page: Restaurant ───────────────────────────────────────────────────────

function initRestaurant() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || 'r1';
  const restaurant = DB.getRestaurant(id);
  if (!restaurant) { document.title = 'Not Found — Yumlog'; return; }

  document.title = `${restaurant.name} — Yumlog`;

  // Populate hero & header
  const heroEl = document.querySelector('.hero-gallery');
  if (heroEl) heroEl.style.background = restaurant.imgGradient;
  const emojiEl = document.querySelector('.hero-gallery-emoji');
  if (emojiEl) emojiEl.textContent = restaurant.emoji;

  const nameEl = document.querySelector('.header-info h1');
  if (nameEl) nameEl.textContent = restaurant.name;

  const metaEl = document.querySelector('.header-meta');
  if (metaEl) metaEl.innerHTML = `
    <span>${capitalize(restaurant.cuisine)}</span>
    <span>•</span>
    <span>💰 ${restaurant.priceRange}</span>
    <span>•</span>
    <span>📍 ${restaurant.suburb} • ${restaurant.distance}km</span>
    <span>•</span>
    <span style="color:${isOpenNow(restaurant) ? '#155724' : '#721c24'};">${isOpenNow(restaurant) ? '✓ Open now' : '✗ Closed'}</span>
  `;

  // Wire up "Write Review" button
  const writeBtn = document.querySelector('.btn-primary[data-action="write"]');
  if (writeBtn) {
    writeBtn.addEventListener('click', () => {
      if (!Auth.getCurrentUser()) {
        location.href = 'login.html?redirect=write-review.html?restaurantId=' + id;
      } else {
        location.href = 'write-review.html?restaurantId=' + id;
      }
    });
  }

  renderRatingBar(id);
  renderAbout(restaurant);
  renderDetails(restaurant);
  renderReviews(id);
}

function renderRatingBar(restaurantId) {
  const { weighted, count, helpfulPct, honestPct, totalHelpfulVotes, totalHonestVotes } = getWeightedRating(restaurantId);

  const scoreEl = document.querySelector('.rating-score');
  if (scoreEl) scoreEl.textContent = count ? weighted.toFixed(1) : '–';

  const starsEl = document.querySelector('.rating-main .stars');
  if (starsEl) starsEl.textContent = count ? fullStarsHTML(weighted) : '☆☆☆☆☆';

  const countEl = document.querySelector('.review-count');
  if (countEl) countEl.textContent = `Based on ${count} Yumlog review${count !== 1 ? 's' : ''}`;

  const helpfulPctEl = document.querySelector('.helpful-pct');
  const honestPctEl  = document.querySelector('.honest-pct');
  const helpfulBarEl = document.querySelector('.progress-helpful');
  const honestBarEl  = document.querySelector('.progress-honest');
  const helpfulVotesEl = document.querySelector('.helpful-votes-count');
  const honestVotesEl  = document.querySelector('.honest-votes-count');

  if (helpfulPctEl) helpfulPctEl.textContent = helpfulPct + '%';
  if (honestPctEl)  honestPctEl.textContent  = honestPct  + '%';
  if (helpfulBarEl) helpfulBarEl.style.width = helpfulPct + '%';
  if (honestBarEl)  honestBarEl.style.width  = honestPct  + '%';
  if (helpfulVotesEl) helpfulVotesEl.textContent = `Based on ${totalHelpfulVotes} votes`;
  if (honestVotesEl)  honestVotesEl.textContent  = `Based on ${totalHonestVotes} votes`;
}

function renderAbout(restaurant) {
  const aboutEl = document.querySelector('.about-text');
  if (aboutEl) aboutEl.textContent = restaurant.description;
}

function renderDetails(restaurant) {
  const hoursEl = document.querySelector('.hours-list');
  if (hoursEl) {
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const today = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
    hoursEl.innerHTML = days.map(d => {
      const hrs = restaurant.hours[d];
      const label = capitalize(d) + (d === today ? ' (Today)' : '');
      return `<div class="hours-day ${d === today ? 'today' : ''}">
        <span>${label}</span><span>${hrs || 'Closed'}</span>
      </div>`;
    }).join('');
  }
}

function renderReviews(restaurantId) {
  const container = document.querySelector('.reviews-list');
  if (!container) return;

  const sortSel = document.querySelector('.reviews-sort');
  const activePill = document.querySelector('.filter-pill.active');
  const filterVal = activePill ? activePill.dataset.filter || 'all' : 'all';
  const sortVal = sortSel ? sortSel.value : 'Most helpful';

  let reviews = DB.getReviews(restaurantId);

  // Filter
  if (filterVal === '5star') reviews = reviews.filter(r => r.rating === 5);
  else if (filterVal === '4star') reviews = reviews.filter(r => r.rating === 4);
  else if (filterVal === 'photos') reviews = reviews.filter(r => r.photos && r.photos.length > 0);
  else if (filterVal === 'blog') reviews = reviews.filter(r => r.type === 'blog');

  // Sort
  if (sortVal === 'Most helpful') {
    reviews.sort((a, b) => b.helpfulVotes - a.helpfulVotes);
  } else if (sortVal === 'Most recent') {
    reviews.sort((a, b) => new Date(b.date) - new Date(a.date));
  } else if (sortVal === 'Highest rated') {
    reviews.sort((a, b) => b.rating - a.rating);
  } else if (sortVal === 'Lowest rated') {
    reviews.sort((a, b) => a.rating - b.rating);
  }

  // Update count
  const countEl = document.querySelector('.reviews-count-label');
  if (countEl) countEl.textContent = `Reviews (${DB.getReviews(restaurantId).length})`;

  const currentUser = Auth.getCurrentUser();

  container.innerHTML = reviews.map(rv => {
    const author = DB.getUser(rv.userId);
    if (!author) return '';
    const rank = getRank(author.points);
    const isTopReviewer = author.points >= 5000;
    const helpfulVoted = currentUser ? DB.hasVoted(currentUser.id, rv.id, 'helpful') : false;
    const honestVoted  = currentUser ? DB.hasVoted(currentUser.id, rv.id, 'honest')  : false;

    const photosHTML = rv.photos && rv.photos.length
      ? `<div class="review-photos">${rv.photos.map(p => `<div class="review-photo">${p}</div>`).join('')}</div>`
      : '';

    const blogHeader = rv.type === 'blog'
      ? `<div style="background:#fff8f0;padding:1rem;border-radius:8px;margin-bottom:1rem;border-left:4px solid var(--orange);">
           <strong style="color:var(--orange);font-size:0.95rem;">📝 ${rv.blogTitle}</strong>
         </div>`
      : '';

    const topBadge = isTopReviewer
      ? `<span style="background:#ffe5e5;color:var(--orange);font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:12px;font-weight:800;">TOP REVIEWER</span>`
      : '';

    return `<div class="review" data-review-id="${rv.id}">
      <div class="review-header">
        <div class="review-avatar" style="background:${author.avatarGradient};cursor:pointer;" onclick="location.href='profile.html?userId=${author.id}'">${author.initials}</div>
        <div class="review-author">
          <div class="author-name">
            <a href="profile.html?userId=${author.id}" style="color:inherit;text-decoration:none;">${author.name}</a> <span style="font-size:1rem;">${rank.emoji}</span> ${topBadge}
          </div>
          <div class="author-rank">${rank.name} • ${author.points.toLocaleString()} pts • ${author.followers.toLocaleString()} followers</div>
          <div class="review-date">${timeAgo(rv.date)}${rv.type === 'blog' ? ' • Blog post' : ''}</div>
        </div>
      </div>
      <div class="review-rating"><span class="stars">${fullStarsHTML(rv.rating)}</span></div>
      ${blogHeader}
      <div class="review-text">${rv.text}</div>
      ${photosHTML}
      <div class="review-actions">
        <button class="vote-btn ${helpfulVoted ? 'voted' : ''}" data-vote="helpful" data-rid="${rv.id}">
          👍 Helpful ${rv.helpfulVotes}
        </button>
        <button class="vote-btn ${honestVoted ? 'voted' : ''}" data-vote="honest" data-rid="${rv.id}">
          🌶️ Honest ${rv.honestVotes}
        </button>
        <button class="vote-btn">💬 Reply ${rv.replies > 0 ? rv.replies : ''}</button>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--mid);text-align:center;padding:2rem;">No reviews yet. Be the first!</p>';

  // Wire vote buttons
  container.querySelectorAll('.vote-btn[data-vote]').forEach(btn => {
    btn.addEventListener('click', function() {
      const user = Auth.getCurrentUser();
      if (!user) { location.href = 'login.html'; return; }
      const reviewId = this.dataset.rid;
      const type = this.dataset.vote;
      if (user.id === DB.getReviews(restaurantId).find(r => r.id === reviewId)?.userId) {
        alert("You can't vote on your own review.");
        return;
      }
      DB.vote(user.id, reviewId, type);
      renderReviews(restaurantId);
      renderRatingBar(restaurantId);
    });
  });
}

// ── Page: Write Review ─────────────────────────────────────────────────────

function initWriteReview() {
  const params = new URLSearchParams(location.search);
  const restaurantId = params.get('restaurantId') || 'r1';
  const restaurant = DB.getRestaurant(restaurantId);

  // Redirect if not logged in
  const user = Auth.getCurrentUser();
  if (!user) {
    location.href = 'login.html?redirect=' + encodeURIComponent(location.href);
    return;
  }

  // Set restaurant name in pill
  if (restaurant) {
    const pill = document.querySelector('.restaurant-pill');
    if (pill) pill.innerHTML = `<span style="font-size:1.5rem;">${restaurant.emoji}</span><span>${restaurant.name}</span>`;
    document.title = `Review ${restaurant.name} — Yumlog`;
  }

  // Override submitQuickReview
  window.submitQuickReview = function() {
    if (selectedRating === 0) { alert('⭐ Please select a star rating first!'); return; }
    const text = document.getElementById('reviewText').value.trim();
    if (text.length < 20) { alert('✍️ Please write at least 20 characters.'); return; }

    DB.addReview({
      id: 'rv' + Date.now(),
      restaurantId,
      userId: user.id,
      rating: selectedRating,
      text,
      type: 'quick',
      photos: [...uploadedPhotos],
      helpfulVotes: 0,
      honestVotes: 0,
      replies: 0,
      date: new Date().toISOString(),
    });

    const updatedUser = DB.getUser(user.id);
    const rank = getRank(updatedUser.points);
    alert(`🎉 Review posted!\n\nYou earned +${POINTS.quickReview} points!\nYou are now: ${rank.emoji} ${rank.name} (${updatedUser.points} pts)`);
    location.href = 'restaurant.html?id=' + restaurantId;
  };

  // Override submitBlogPost
  window.submitBlogPost = function() {
    if (selectedRating === 0) { alert('⭐ Please select a star rating first!'); return; }
    const title = document.querySelector('.blog-form input[type="text"]').value.trim();
    const body  = document.querySelector('.blog-form textarea').value.trim();
    if (!title) { alert('Give your post a title!'); return; }
    if (body.length < 50) { alert('Blog posts need at least 50 characters.'); return; }

    DB.addReview({
      id: 'rv' + Date.now(),
      restaurantId,
      userId: user.id,
      rating: selectedRating,
      blogTitle: title,
      text: body,
      type: 'blog',
      photos: [...uploadedPhotos],
      helpfulVotes: 0,
      honestVotes: 0,
      replies: 0,
      date: new Date().toISOString(),
    });

    const updatedUser = DB.getUser(user.id);
    const rank = getRank(updatedUser.points);
    alert(`🚀 Blog post published!\n\nYou earned +${POINTS.blogPost} points (3× bonus)!\nYou are now: ${rank.emoji} ${rank.name} (${updatedUser.points} pts)`);
    location.href = 'restaurant.html?id=' + restaurantId;
  };
}

// ── Page: Login ────────────────────────────────────────────────────────────

function initLogin() {
  const params = new URLSearchParams(location.search);
  const redirect = params.get('redirect') || 'index.html';

  // If already logged in, redirect
  if (Auth.getCurrentUser()) { location.href = redirect; return; }

  const form = document.getElementById('authForm');
  if (!form) return;

  let currentTab = 'signup';

  window.switchTab = function(tab) {
    currentTab = tab;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    // Find the clicked tab button
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => { if (t.textContent.toLowerCase().includes(tab === 'signup' ? 'sign' : 'log')) t.classList.add('active'); });

    const title    = document.querySelector('.form-title');
    const subtitle = document.querySelector('.form-subtitle');
    const button   = document.querySelector('.btn-primary');
    const footer   = document.querySelector('.form-footer');
    const checkbox = document.querySelector('.form-checkbox');
    const nameGroup = document.getElementById('nameGroup');

    if (tab === 'login') {
      if (title)    title.textContent    = 'Welcome Back!';
      if (subtitle) subtitle.textContent = 'Continue sharing your food experiences';
      if (button)   button.innerHTML     = '🍴 Log In';
      if (footer)   footer.innerHTML     = "Don't have an account? <a href='#' onclick=\"switchTab('signup');return false;\">Sign up</a>";
      if (checkbox) checkbox.style.display = 'none';
      if (nameGroup) nameGroup.style.display = 'none';
    } else {
      if (title)    title.textContent    = 'Join the Community';
      if (subtitle) subtitle.textContent = 'Free forever. No spam. Just honest food talk.';
      if (button)   button.innerHTML     = '✨ Join Yumlog';
      if (footer)   footer.innerHTML     = "Already have an account? <a href='#' onclick=\"switchTab('login');return false;\">Log in</a>";
      if (checkbox) checkbox.style.display = 'flex';
      if (nameGroup) nameGroup.style.display = 'block';
    }
  };

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const email    = form.querySelector('input[type="email"]').value.trim();
    const password = form.querySelector('input[type="password"]').value;

    if (currentTab === 'signup') {
      const nameInput = document.getElementById('nameInput');
      const name = nameInput ? nameInput.value.trim() : email.split('@')[0];
      const result = Auth.register(name, email, password);
      if (!result.ok) { alert('❌ ' + result.error); return; }
      const rank = getRank(0);
      alert(`🎊 Welcome to Yumlog, ${result.user.name}!\n\nYou are now: ${rank.emoji} ${rank.name}\n\nStart writing reviews to earn points and climb the ranks!`);
    } else {
      const result = Auth.login(email, password);
      if (!result.ok) { alert('❌ ' + result.error); return; }
      alert(`Welcome back, ${result.user.name}! 🍴`);
    }
    location.href = redirect;
  });
}

// ── Page: Profile ──────────────────────────────────────────────────────────

function initProfile() {
  const params = new URLSearchParams(location.search);
  const userId = params.get('userId') || Auth.getSession()?.userId || 'u3';
  const user   = DB.getUser(userId);
  if (!user) return;

  const currentUser = Auth.getCurrentUser();
  const isOwn = currentUser && currentUser.id === userId;

  document.title = `${user.name} — Yumlog`;

  // Avatar & name
  const avatarEl = document.querySelector('.profile-avatar');
  if (avatarEl) {
    avatarEl.style.background = user.avatarGradient;
    avatarEl.childNodes[0].textContent = user.initials;
  }
  const badgeEl = document.querySelector('.avatar-badge');
  if (badgeEl) badgeEl.textContent = getRank(user.points).emoji;

  const nameEl = document.querySelector('.profile-name');
  if (nameEl) nameEl.textContent = user.name;

  // Rank badge
  const rank = getRank(user.points);
  const rankBadgeEl = document.querySelector('.rank-badge');
  if (rankBadgeEl) rankBadgeEl.innerHTML = `<span>${rank.emoji}</span><span>${rank.name}</span>`;
  const rankPtsEl = document.querySelector('.profile-rank > span');
  if (rankPtsEl) rankPtsEl.textContent = `• ${user.points.toLocaleString()} points`;

  // Bio & location
  const bioEl = document.querySelector('.profile-bio');
  if (bioEl) bioEl.textContent = user.bio;
  const locEl = document.querySelector('.profile-location');
  if (locEl) locEl.innerHTML = `📍 ${user.location} • Member since ${new Date(user.memberSince + '-01').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}`;

  // Stats bar
  const userReviews = DB.getUserReviews(userId);
  const blogCount   = userReviews.filter(r => r.type === 'blog').length;
  const stats = document.querySelectorAll('.stat-number');
  if (stats[0]) stats[0].textContent = user.points.toLocaleString();
  if (stats[1]) stats[1].textContent = user.followers.toLocaleString();
  if (stats[2]) stats[2].textContent = user.following.toLocaleString();
  if (stats[3]) stats[3].textContent = userReviews.length;
  if (stats[4]) stats[4].textContent = blogCount;

  // Tab counts
  const tabCounts = document.querySelectorAll('.tab-count');
  if (tabCounts[0]) tabCounts[0].textContent = `(${userReviews.length})`;
  if (tabCounts[1]) tabCounts[1].textContent = `(${blogCount})`;

  // Progress bar
  const nextRank = getNextRank(user.points);
  const ptsEl = document.querySelector('.progress-points');
  const nextEl = document.querySelector('.progress-info > div:last-child');
  const barEl  = document.querySelector('.progress-bar-inner');
  const currentRankNameEl = document.querySelector('.current-rank .rank-name');
  const currentRankIconEl = document.querySelector('.current-rank .rank-icon');
  const nextRankNameEl = document.querySelector('.next-rank .rank-name');
  const nextRankIconEl = document.querySelector('.next-rank .rank-icon');

  if (currentRankNameEl) currentRankNameEl.innerHTML = rank.name.replace(' ', '<br>');
  if (currentRankIconEl) currentRankIconEl.textContent = rank.emoji;

  if (nextRank) {
    const pct = Math.round(((user.points - rank.minPts) / (nextRank.minPts - rank.minPts)) * 100);
    if (ptsEl)  ptsEl.textContent = `${user.points.toLocaleString()} / ${nextRank.minPts.toLocaleString()} points`;
    if (nextEl) nextEl.innerHTML  = `${nextRank.minPts - user.points} points to <strong>${nextRank.name}</strong> ${nextRank.emoji}`;
    if (barEl)  barEl.style.width = Math.min(pct, 100) + '%';
    if (nextRankNameEl) nextRankNameEl.innerHTML = nextRank.name.replace(' ', '<br>');
    if (nextRankIconEl) nextRankIconEl.textContent = nextRank.emoji;
  } else {
    if (ptsEl)  ptsEl.textContent = `${user.points.toLocaleString()} points`;
    if (nextEl) nextEl.innerHTML  = '🏆 Maximum rank achieved!';
    if (barEl)  barEl.style.width = '100%';
  }

  // Show/hide edit button based on ownership
  const editBtn   = document.querySelector('.btn-edit');
  const followBtn = document.querySelector('.btn-follow');
  if (isOwn) {
    if (editBtn)   editBtn.style.display   = 'inline-block';
    if (followBtn) followBtn.style.display = 'none';
  } else {
    if (editBtn)   editBtn.style.display   = 'none';
    if (followBtn) {
      followBtn.style.display = 'inline-block';
      followBtn.textContent = '+ Follow';
      followBtn.classList.remove('following');
    }
  }

  renderProfileTab('reviews', userId);
}

function renderProfileTab(tab, userId) {
  const grid = document.querySelector('.reviews-grid');
  if (!grid) return;
  const user = DB.getUser(userId);
  if (!user) return;

  let reviews = DB.getUserReviews(userId);

  if (tab === 'blog') reviews = reviews.filter(r => r.type === 'blog');

  if (!reviews.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🍽️</div>
      <div class="empty-title">No ${tab === 'blog' ? 'blog posts' : 'reviews'} yet</div>
      <div class="empty-text">Nothing here yet!</div>
    </div>`;
    return;
  }

  reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Blog tab: single-column so posts have full reading width
  grid.style.gridTemplateColumns = tab === 'blog' ? '1fr' : '';

  grid.innerHTML = reviews.map(rv => {
    const restaurant = DB.getRestaurant(rv.restaurantId);
    if (!restaurant) return '';
    const blogBlock = rv.type === 'blog' ? `
      <h3 style="font-size:1.25rem;font-weight:800;color:var(--dark);margin-bottom:1rem;line-height:1.3;">${rv.blogTitle}</h3>
      <div class="review-text" style="line-height:1.8;">${rv.text}</div>
    ` : `<div class="review-text">${rv.text}</div>`;

    const isBlog = rv.type === 'blog';
    return `<div class="review-card" style="${isBlog ? 'border-top:4px solid var(--orange);' : ''}">
      <div class="review-header">
        <div class="restaurant-info">
          <div class="restaurant-icon" style="background:${restaurant.imgGradient};cursor:pointer;" onclick="location.href='restaurant.html?id=${restaurant.id}'">${restaurant.emoji}</div>
          <div class="restaurant-details">
            <div class="restaurant-name" onclick="location.href='restaurant.html?id=${restaurant.id}'" style="cursor:pointer;">${restaurant.name}</div>
            <div class="restaurant-meta">${capitalize(restaurant.cuisine)} • ${restaurant.suburb}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;">
          ${isBlog ? `<span style="background:var(--orange);color:white;font-size:0.7rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:12px;white-space:nowrap;">📝 Blog Post</span>` : ''}
          <div class="review-date">${timeAgo(rv.date)}</div>
        </div>
      </div>
      <div class="review-rating"><span class="stars">${fullStarsHTML(rv.rating)}</span></div>
      ${blogBlock}
      <div class="review-stats">
        <div class="review-stat stat-helpful"><span>👍</span><span>${rv.helpfulVotes} helpful</span></div>
        <div class="review-stat stat-honest"><span>🌶️</span><span>${rv.honestVotes} honest</span></div>
        <div class="review-stat"><span>💬</span><span>${rv.replies} replies</span></div>
      </div>
    </div>`;
  }).join('');
}

// ── Page: Top Reviewers ────────────────────────────────────────────────────

function initTopReviewers() {
  const users = [...DB.get().users].sort((a, b) => b.points - a.points);
  const medals = ['🥇', '🥈', '🥉'];

  const leaderboard = document.getElementById('leaderboard');
  if (leaderboard) {
    leaderboard.innerHTML = users.map((user, i) => {
      const rank = getRank(user.points);
      const reviews = DB.getUserReviews(user.id);
      const blogCount = reviews.filter(r => r.type === 'blog').length;
      const totalHelpful = reviews.reduce((s, r) => s + r.helpfulVotes, 0);
      const pos = medals[i] || `#${i + 1}`;
      return `<div class="reviewer-card" onclick="location.href='profile.html?userId=${user.id}'" style="cursor:pointer;">
        <div class="reviewer-pos">${pos}</div>
        <div class="reviewer-avatar" style="background:${user.avatarGradient};">${user.initials}</div>
        <div class="reviewer-body">
          <div class="reviewer-name">${user.name}</div>
          <div class="reviewer-rank">${rank.emoji} ${rank.name}</div>
          <div class="reviewer-stats">
            <span>⭐ ${user.points.toLocaleString()} pts</span>
            <span>📝 ${reviews.length} review${reviews.length !== 1 ? 's' : ''}</span>
            <span>✍️ ${blogCount} blog post${blogCount !== 1 ? 's' : ''}</span>
            <span>👍 ${totalHelpful.toLocaleString()} helpful votes received</span>
            <span>👥 ${user.followers.toLocaleString()} followers</span>
          </div>
          ${user.bio ? `<div class="reviewer-bio">${user.bio.slice(0, 120)}${user.bio.length > 120 ? '…' : ''}</div>` : ''}
        </div>
        <a href="profile.html?userId=${user.id}" class="btn-profile" onclick="event.stopPropagation();">View Profile →</a>
      </div>`;
    }).join('');
  }

  const ranksGrid = document.getElementById('ranksGrid');
  if (ranksGrid) {
    ranksGrid.innerHTML = RANKS.map(r => `
      <div class="rank-card">
        <div class="rank-emoji">${r.emoji}</div>
        <div class="rank-name">${r.name}</div>
        <div class="rank-pts">${r.minPts === 0 ? 'Start here' : `${r.minPts.toLocaleString()}+ pts`}</div>
        <div class="rank-weight">Reviews count ${r.weight}×</div>
      </div>`).join('');
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Router ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  DB.init();
  updateNavbar();

  const page = document.body.dataset.page;
  if (page === 'home')         initHome();
  else if (page === 'search')  initSearch();
  else if (page === 'restaurant') initRestaurant();
  else if (page === 'write-review') initWriteReview();
  else if (page === 'login')   initLogin();
  else if (page === 'profile') initProfile();
  else if (page === 'top-reviewers') initTopReviewers();
});
