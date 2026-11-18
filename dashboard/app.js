// Token Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, three views (the pre-token board, the live-token set and the set-aside
// products), working filters, a methodology panel with the peer table, and a per-protocol detail
// drawer that recomputes the row's implied value and shows its farm plan. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(3); }
  function catOf(r) { return r.category || 'Uncategorised'; }

  // The peer evidence for a category, from the table main.ts derived from the snapshot: the shrunk
  // multiple, the peer count and the raw category median, or the market median when it has no peer.
  function peerStatFor(category) {
    var key = category || '';
    for (var i = 0; i < DATA.peers.length; i++) if (DATA.peers[i].category === key) return DATA.peers[i];
    return { category: key, peers: 0, median: null, multiple: DATA.global_multiple };
  }
  // The model in one function: the page recomputes a row from the snapshot figures and the peer table
  // and checks the number board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic.
  function impliedOf(row) {
    var m = DATA.model;
    var stat = peerStatFor(row.category);
    var growth = Math.min(m.momentum_cap, Math.max(m.momentum_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var momentum = 1 + (growth / 100) * m.momentum_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var ageMult = m.age_floor + (Math.min(Math.max(age, 0), m.age_days_cap) / m.age_days_cap) * m.age_range;
    var breadth = 1 + m.breadth_per_chain * Math.min(Math.max(row.chains.length - 1, 0), m.breadth_max_extra);
    return Math.max(1, Math.round(row.tvl_usd * stat.multiple * momentum * ageMult * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json (lib/model.ts farmSteps):
  // category family, chains, TVL and age decide the actions, the capital, the hold and every cost and
  // time. No name is special-cased; keep the two copies word for word the same.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $12 of gas';
    if (chain === 'Solana') return 'under $1 of fees';
    return 'about $3 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function familyOf(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'dex';
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return 'lending';
    if (c.indexOf('cdp') >= 0) return 'cdp';
    if (c.indexOf('deriv') >= 0 || c.indexOf('perpetual') >= 0) return 'perps';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'staking';
    if (c.indexOf('basis') >= 0) return 'basis';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('aggregator') >= 0 || c.indexOf('yield') >= 0) return 'vault';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c.indexOf('stable') >= 0) return 'stable';
    if (c.indexOf('prediction') >= 0) return 'prediction';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'payments';
    if (c.indexOf('index') >= 0) return 'index';
    if (c.indexOf('privacy') >= 0) return 'privacy';
    if (c.indexOf('chain') >= 0) return 'chain';
    if (c.indexOf('btc') >= 0) return 'btc';
    if (c.indexOf('otc') >= 0) return 'otc';
    if (c.indexOf('governance') >= 0) return 'governance';
    if (c.indexOf('farm') >= 0) return 'farm';
    return 'generic';
  }
  function coreAction(family, name, capital, chain) {
    switch (family) {
      case 'dex': return 'Swap about $' + capital + ' of USDC for the pool\'s other asset on ' + name + ' (' + chain + '), then add the pair as liquidity to its main pool and keep the position open.';
      case 'lending': return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the supply open so the wallet is a live lender.';
      case 'cdp': return 'Deposit $' + capital + ' of collateral into a ' + name + ' vault on ' + chain + ' and mint its stablecoin against it, keeping the vault safely above its liquidation line.';
      case 'perps': return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small position, so the wallet trades rather than only deposits.';
      case 'bridge': return 'Bridge $' + capital + ' of USDC from ' + chain + ' to a second chain through ' + name + ', then use the bridged funds in an app on the far side.';
      case 'staking': return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the staking receipt in the wallet.';
      case 'basis': return 'Deposit $' + capital + ' of USDC into a ' + name + ' basis vault on ' + chain + ' and keep the vault shares.';
      case 'vault': return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the wallet.';
      case 'rwa': return 'Mint $' + capital + ' of ' + name + '\'s yield asset on ' + chain + ' with USDC and hold the asset in the wallet.';
      case 'stable': return 'Mint $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ', then hold half and pool half against USDC.';
      case 'prediction': return 'Fund $' + capital + ' on ' + name + ' and take a position in one liquid market, sized small enough to hold to settlement.';
      case 'insurance': return 'Supply $' + capital + ' of USDC to a ' + name + ' underwriting pool on ' + chain + ', or buy a live cover if a pool is closed.';
      case 'payments': return 'Load $' + capital + ' onto ' + name + ' and make real payments with it, the way a card or payments user would.';
      case 'index': return 'Mint $' + capital + ' of a ' + name + ' index token on ' + chain + ' and hold it in the wallet.';
      case 'privacy': return 'Route $' + capital + ' through ' + name + '\'s private transfer flow on ' + chain + ' and keep the received funds in the same wallet.';
      case 'chain': return 'Bridge $' + capital + ' of USDC onto ' + name + ' and transact there weekly: swap, lend or pay inside its own apps so the wallet is a chain user.';
      case 'btc': return 'Deposit $' + capital + ' of a BTC-backed asset into ' + name + ' on ' + chain + ' and keep the position open.';
      case 'otc': return 'Register on ' + name + ' and complete one small OTC trade of about $' + capital + ' so the wallet has settled history.';
      case 'governance': return 'Deposit $' + capital + ' into ' + name + '\'s incentive market on ' + chain + ' and keep the position that earns the incentives.';
      case 'farm': return 'Open a $' + capital + ' leveraged yield position on ' + name + ' (' + chain + ') at its lowest leverage setting and keep it open.';
      default: return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use its core product once, keeping the position open.';
    }
  }
  function secondAction(family, name, capital) {
    var half = Math.max(25, Math.round(capital / 2));
    switch (family) {
      case 'dex': return 'Trade actively as well: make ten swaps of $25 to $100 across at least three pairs on ' + name + ' over the first month, not one swap on one day.';
      case 'lending': return 'Borrow about $' + half + ' against the supply, hold the borrow for a week, then repay in full; repeat the cycle once a month so both sides of the market know the wallet.';
      case 'cdp': return 'Use the minted stablecoin rather than selling it at once: pool it or lend it inside ' + name + '\'s own ecosystem for at least two weeks.';
      case 'perps': return 'Trade both directions over time: one small long and one small short in different weeks, each closed cleanly, so the record is trading and not a single bet.';
      case 'bridge': return 'Bridge back a smaller amount, about $' + half + ', a week later, and vary the route or the destination chain once, so the history is not a single hop.';
      case 'staking': return 'Put the staking receipt to work once: lend it or pool it in a venue ' + name + ' itself lists, then unwind it back to the plain receipt.';
      case 'basis': return 'Add a second, smaller deposit of about $' + half + ' after the first month, so the position grows the way a real allocator\'s would.';
      case 'vault': return 'Deposit into a second ' + name + ' vault with a different strategy or risk setting, about $' + half + ', so the wallet is not in a single vault only.';
      case 'rwa': return 'Hold through at least one full yield cycle of the asset, then top up by about $' + half + ' rather than exiting at the first distribution.';
      case 'stable': return 'Spend or transfer a small part of the stable asset to a second wallet you control, so it circulates instead of sitting minted and idle.';
      case 'prediction': return 'Take positions in at least three different markets over the season, including one you hold to settlement and claim properly.';
      case 'insurance': return 'Renew or extend the position once when its first term ends, so the cover or capital record spans more than one period.';
      case 'payments': return 'Keep using it weekly: at least one real payment or top-up a week, in varied amounts, rather than one load and silence.';
      case 'index': return 'Rebalance once with the index: add about $' + half + ' after a month so the holding shows an ongoing allocation, not a single mint.';
      case 'privacy': return 'Make a second private transfer of a different amount at least a week later, so the usage is a pattern and not a test.';
      case 'chain': return 'Claim any chain-level rewards or faucet-style distributions ' + name + ' offers its active wallets, and keep a small native balance for gas.';
      case 'btc': return 'Top the position up by about $' + half + ' after a month, so the deposit history is a pattern of use.';
      case 'otc': return 'Complete a second trade in the opposite direction at least two weeks later, so the account reads as a counterparty, not a probe.';
      case 'governance': return 'Vote in every live governance vote ' + name + ' opens to position holders while the position runs, and keep a note of each vote.';
      case 'farm': return 'Adjust the position once — add about $' + half + ' of collateral or roll it to a neighbouring market — so it is managed, not abandoned.';
      default: return 'Use ' + name + '\'s second surface as well — its other market, vault or tool — with about $' + half + ', so the wallet is a user of the whole product.';
    }
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasFor(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var family = familyOf(p);
    var steps = [
      { text: 'Open a fresh wallet for ' + p.name + ' and fund it with the gas token of ' + chain + '; keep its seed phrase offline and never farm from an exchange account.', cost: 'no fee to create, ' + gas + ' to fund and make the first transaction', time: '5 minutes' },
      { text: coreAction(family, p.name, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: secondAction(family, p.name, capital), cost: 'about $' + Math.max(25, Math.round(capital / 2)) + ' more capital and ' + gas, time: '20 minutes, then minutes a week' },
      { text: 'Repeat one qualifying action every week — a deposit, a swap, a borrow or a vote — so the wallet shows a history across many snapshots, not a single visit.', cost: 'about $2 of gas a week', time: '10 minutes a week' }
    ];
    if (p.chains && p.chains.length >= 2) {
      steps.push({ text: 'Use ' + p.name + ' on a second chain too (' + p.chains[1] + '): bridge a small amount over and repeat the core action there, since multi-chain users are the ones launches usually reward.', cost: 'about $5 for the bridge plus ' + gasFor(p.chains[1]), time: '20 minutes once' });
    } else {
      steps.push({ text: 'Join ' + p.name + '\'s governance forum and community calls, and vote or comment on live proposals so the wallet is known beyond its transactions.', cost: 'no fee', time: '15 minutes a week' });
    }
    steps.push({ text: 'Hold every position for at least ' + hold + ' days, then check ' + p.name + '\'s own points or rewards page and claim only from the link it publishes; write the wallet, dates and transactions in a farm log.', cost: 'the $' + capital + ' stays in the positions; never pay anyone to claim', time: hold + ' days, then 10 minutes' });
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: 'Model ' + DATA.model_version })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' protocols still to launch, ranked by implied value' }),
        el('p', { text: 'Every protocol in the snapshot that records no token and passes the launch test is on this board: the ' + DATA.watchlist_size + ' watchlist protocols at or above $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL, plus ' + DATA.early_size + ' early ones below that floor. Implied value is a category-peer model of what a launch would be worth if the record stayed as it is. It is an estimate, not a promise, and it never says a token is coming.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Products set aside, with reasons' }), el('b', { text: String(DATA.aside_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(catOf))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlOptions = [[0, 'Any TVL'], [1e7, '$10M and up'], [5e7, '$50M and up'], [1e8, '$100M and up'], [5e8, '$500M and up'], [1e9, '$1B and up']];
    var tvlSelect = el('select', { id: 'mintvl', 'aria-label': 'Filter by minimum TVL' },
      tvlOptions.map(function (o) { return el('option', { value: String(o[0]), text: o[1], selected: state.minTvl === o[0] ? 'selected' : null }); })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = Number(tvlSelect.value); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watchonly', checked: state.watchOnly ? 'checked' : null });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; render(); });
    var tabs = el('div', { class: 'tabs' },
      el('button', { type: 'button', 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Launch board', onclick: function () { state.tab = 'board'; render(); } }),
      el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; render(); } }),
      el('button', { type: 'button', 'aria-pressed': state.tab === 'aside' ? 'true' : 'false', text: 'Set aside', onclick: function () { state.tab = 'aside'; render(); } })
    );
    var count = state.tab === 'board' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.aside.length + ' of ' + DATA.aside_size + ' set aside';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL' }), tvlSelect),
      el('label', { class: 'check' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), tabs),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: catOf(r) + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', null,
          el('span', { class: 'num', text: fmtMult(r.peer_multiple) }),
          el('div', { class: 'sub', text: r.peer_count > 0 ? r.peer_count + ' peers' : 'market median' })
        )),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'chip' + (r.watchlist ? ' watch' : ''), text: r.watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols ranked by implied value. Select a row for its valuation breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Peer x'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Status' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'static' },
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: catOf(r) + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'chip', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live tokens: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the launch ranking, and their market caps per TVL are the peer evidence the model prices the board with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function asideTable() {
    var tbody = el('tbody');
    DATA.aside.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'static' },
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: catOf(r) + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', null, el('span', { class: 'chip aside', text: r.reason }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Set aside: pre-token by the record, but not launches of their own. A wrapped, staked or bridged product is worth what its underlying asset is worth, and that asset already trades; an exchange product and a versioned release belong to a protocol that already has its token. The largest ' + DATA.aside.length + ' of ' + DATA.aside_size + ' are shown.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Why set aside' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    var peerRows = DATA.peers.map(function (s) {
      return el('tr', { class: 'static' },
        el('td', { text: s.category || 'Uncategorised' }),
        el('td', { class: 'num', text: String(s.peers) }),
        el('td', { class: 'num', text: s.median === null ? 'n/a' : 'x' + s.median.toFixed(3) }),
        el('td', { class: 'num', text: fmtMult(s.multiple) })
      );
    });
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'A launch is priced the way the market already prices its category. Protocols in the snapshot that do record a token lend their market-cap-per-TVL ratio to their category; a pre-token protocol is valued at its own TVL times its category\'s multiple, then adjusted for its momentum, its tokenless age and its chain breadth. Every figure comes from the snapshot; no protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula', text: 'implied = round( TVL x peerMultiple x momentum x age x breadth )' }),
      el('ul', { class: 'terms' },
        el('li', null, el('b', { text: 'Peer multiple. ' }), 'The median mcap/TVL of the category\'s token-bearing protocols, each ratio first winsorised to [' + m.ratio_floor + ', ' + m.ratio_cap + '], then shrunk toward the market median (x' + DATA.global_multiple.toFixed(3) + ' across ' + DATA.global_peers + ' token-bearing protocols): multiple = (n x category median + ' + m.shrinkage_k + ' x market median) / (n + ' + m.shrinkage_k + '). A thin category is pulled toward the market in proportion to how few peers back it; a category with no peer is priced at the market median.'),
        el('li', null, el('b', { text: 'Momentum. ' }), '1 + clamp(change_7d, ' + m.momentum_floor + ', ' + m.momentum_cap + ') / 100 x ' + m.momentum_weight + '. A rising protocol is worth more than a shrinking one of the same size; an unreported change counts as no momentum.'),
        el('li', null, el('b', { text: 'Age. ' }), m.age_floor + ' + min(age_days, ' + m.age_days_cap + ') / ' + m.age_days_cap + ' x ' + m.age_range + ', where age is the time since DefiLlama first listed the protocol — how long it has run with no token. An unlisted age uses ' + m.unknown_age_days + ' days.'),
        el('li', null, el('b', { text: 'Breadth. ' }), '1 + ' + m.breadth_per_chain + ' per extra chain beyond the first, up to ' + m.breadth_max_extra + ': a protocol live on more chains has more users a launch would reach.')
      ),
      el('p', { text: 'The launch test decides what is ranked at all: a protocol must record no token and not be a wrapped, staked or bridged product of one that trades, an exchange\'s own product, or a versioned release of another protocol — the same test the snapshot\'s watchlist applies at its floor, applied here at every size. Products the test sets aside are shown in the Set aside view with their reason; protocols whose token already trades are in the Live tokens view at the market\'s own values.' }),
      el('h3', { text: 'Peer evidence by category' }),
      el('div', { class: 'peers-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Token peers' }), el('th', { scope: 'col', text: 'Median mcap/TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
          el('tbody', null, peerRows)
        )
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + '. Implied value is this entry\'s own claim about a hypothetical launch, not a prediction that a token is issued and not a price. The snapshot is DefiLlama\'s record as of ' + DATA.as_of + '; a protocol records no token is all it says.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var stat = peerStatFor(row.category);
    var recomputed = impliedOf(row);
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: catOf(row) + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · ' + (row.watchlist ? 'on the watchlist' : 'early, below the watchlist floor') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer multiple (' + catOf(row) + ')' }), el('b', { class: 'num', text: fmtMult(row.peer_multiple) })),
        el('div', null, el('span', { text: 'Base value' }), el('b', { class: 'num', text: fmtUsd(Math.round(row.tvl_usd * row.peer_multiple)) })),
        el('div', null, el('span', { text: 'Momentum x (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { class: 'num', text: 'x' + row.momentum_multiplier.toFixed(3) })),
        el('div', null, el('span', { text: 'Age x (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { class: 'num', text: 'x' + row.age_multiplier.toFixed(3) })),
        el('div', null, el('span', { text: 'Breadth x (' + (row.chains ? row.chains.length : 0) + ' chains)' }), el('b', { class: 'num', text: 'x' + row.breadth_multiplier.toFixed(3) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: stat.peers > 0
        ? 'Peer evidence: ' + stat.peers + ' protocol' + (stat.peers === 1 ? '' : 's') + ' in ' + catOf(row) + ' record a token in the snapshot, median mcap/TVL ' + (stat.median === null ? 'n/a' : 'x' + stat.median.toFixed(3)) + ', shrunk toward the market median x' + DATA.global_multiple.toFixed(3) + ' to the x' + stat.multiple.toFixed(3) + ' used here.'
        : 'Peer evidence: no protocol in ' + catOf(row) + ' records a token in the snapshot, so the market median multiple x' + DATA.global_multiple.toFixed(3) + ' (across ' + DATA.global_peers + ' token-bearing protocols) prices this row.' }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'board') { shell.appendChild(boardTable()); shell.appendChild(methodPanel()); }
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(asideTable());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
