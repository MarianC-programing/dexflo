/**
 * Sandbox DEX: mini-DApp local, estática y determinista que implementa el
 * contrato de `SANDBOX_SELECTORS`. Es el target por defecto de la suite
 * (docs/plan.md: "se recomienda un target staging o local controlado para CI").
 *
 * - Se sirve por `page.route` bajo un origen https ficticio: sin servidor ni red.
 * - Habla con `window.ethereum` (provider mockeado) y con `/api/prices`
 *   (feed CoinGecko mockeado, ver `src/utils/mockData.ts`).
 * - NO usa `waitForTimeout`: el único temporizador es el timeout de petición
 *   a la wallet, configurable por query string (`timeoutMs`).
 */

import type { DexSelectors } from '../adapters/dex-adapter';

export const SANDBOX_ORIGIN = 'https://sandbox.dexflo.test';
export const SANDBOX_PRICES_PATH = '/api/prices';

/** Valor por defecto del timeout de peticiones a la wallet dentro de la sandbox. */
export const SANDBOX_DEFAULT_TIMEOUT_MS = 1500;

/** Símbolos soportados por los selectores de token de la sandbox. */
export const SANDBOX_TOKENS = ['ETH', 'WETH', 'USDC', 'DAI'] as const;

const byTestId = (id: string): string => `[data-testid="${id}"]`;

export const SANDBOX_SELECTORS: DexSelectors = {
  connectButton: byTestId('connect-button'),
  accountAddress: byTestId('account-address'),
  networkLabel: byTestId('network-label'),
  walletModal: byTestId('wallet-modal'),
  walletOptionInjected: byTestId('wallet-option-injected'),
  walletModalClose: byTestId('wallet-modal-close'),
  walletModalError: byTestId('wallet-modal-error'),
  amountIn: byTestId('amount-in'),
  amountOut: byTestId('amount-out'),
  quoteRate: byTestId('quote-rate'),
  swapButton: byTestId('swap-button'),
  swapError: byTestId('swap-error'),
  txHash: byTestId('tx-hash'),
};

export const SANDBOX_TOKEN_IN_SELECTOR = byTestId('token-in');
export const SANDBOX_TOKEN_OUT_SELECTOR = byTestId('token-out');
export const SANDBOX_TX_STATUS_SELECTOR = byTestId('tx-status');

/**
 * Lógica del navegador. Se mantiene como cadena ES5 (sin backticks ni `${}`)
 * para insertarse tal cual en el HTML sin interpolación accidental.
 */
const SANDBOX_SCRIPT = `
(function () {
  var params = new URLSearchParams(location.search);
  var expectedChain = params.get('chain') || '0x1';
  var timeoutMs = Number(params.get('timeoutMs') || '${String(SANDBOX_DEFAULT_TIMEOUT_MS)}');
  var PRICE_IDS = { ETH: 'ethereum', WETH: 'weth', USDC: 'usd-coin', DAI: 'dai' };

  function el(id) { return document.querySelector('[data-testid="' + id + '"]'); }

  var state = { account: null, chainId: null, balanceEth: null, prices: null, pending: false };

  function withTimeout(promise) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject({ code: 'TIMEOUT', message: 'Request timed out' });
      }, timeoutMs);
      promise.then(
        function (value) { clearTimeout(timer); resolve(value); },
        function (error) { clearTimeout(timer); reject(error); }
      );
    });
  }

  function request(method, args) {
    if (!window.ethereum) {
      return Promise.reject({ code: 'NO_PROVIDER', message: 'No wallet detected' });
    }
    return withTimeout(window.ethereum.request({ method: method, params: args || [] }));
  }

  function shorten(address) { return address.slice(0, 6) + '...' + address.slice(-4); }

  function amountIn() {
    var value = parseFloat(el('amount-in').value);
    return isFinite(value) && value > 0 ? value : 0;
  }

  function quote() {
    if (!state.prices) { return null; }
    var priceIn = state.prices[PRICE_IDS[el('token-in').value]];
    var priceOut = state.prices[PRICE_IDS[el('token-out').value]];
    if (!priceIn || !priceOut) { return null; }
    return { amountOut: (amountIn() * priceIn.usd) / priceOut.usd, rate: priceIn.usd / priceOut.usd };
  }

  function buttonState() {
    if (!state.account) { return ['connect', 'Connect wallet']; }
    if (state.chainId !== expectedChain) { return ['wrong-network', 'Wrong network']; }
    if (state.pending) { return ['pending', 'Confirm in wallet']; }
    if (amountIn() === 0) { return ['enter-amount', 'Enter an amount']; }
    if (!state.prices) { return ['fetching-quote', 'Fetching quote']; }
    if (el('token-in').value === 'ETH' && state.balanceEth !== null && amountIn() > state.balanceEth) {
      return ['insufficient-balance', 'Insufficient ETH balance'];
    }
    return ['ready', 'Swap'];
  }

  function render() {
    el('network-label').textContent = state.chainId || 'Not connected';
    var account = el('account-address');
    account.hidden = !state.account;
    account.textContent = state.account ? shorten(state.account) : '';
    el('connect-button').hidden = !!state.account;

    var q = quote();
    el('amount-out').textContent = q && amountIn() > 0 ? q.amountOut.toFixed(4) : '';
    el('quote-rate').textContent = q ? ('1 ' + el('token-in').value + ' = ' + q.rate.toFixed(4) + ' ' + el('token-out').value) : '';

    var button = el('swap-button');
    var current = buttonState();
    button.setAttribute('data-state', current[0]);
    button.textContent = current[1];
    button.disabled = current[0] !== 'connect' && current[0] !== 'ready';
  }

  function refreshWallet() {
    return request('eth_chainId').then(function (chainId) {
      state.chainId = chainId;
      return request('eth_accounts');
    }).then(function (accounts) {
      state.account = accounts.length > 0 ? accounts[0] : null;
      if (!state.account) { state.balanceEth = null; return null; }
      return request('eth_getBalance', [state.account, 'latest']).then(function (hex) {
        state.balanceEth = Number(BigInt(hex)) / 1e18;
      });
    }).catch(function () {
      state.account = null;
    }).then(render);
  }

  function setModalError(message) {
    var node = el('wallet-modal-error');
    node.hidden = !message;
    node.textContent = message || '';
  }

  function openModal() { setModalError(''); el('wallet-modal').hidden = false; }
  function closeModal() { el('wallet-modal').hidden = true; }

  function setSwapError(message) {
    var node = el('swap-error');
    node.hidden = !message;
    node.textContent = message || '';
  }

  function setTxStatus(status) {
    var node = el('tx-status');
    node.hidden = !status;
    node.setAttribute('data-state', status || 'none');
    node.textContent = status || '';
  }

  function describeError(error) {
    var code = error && error.code;
    if (code === 'TIMEOUT') { return ['timeout', 'Request timed out']; }
    if (code === 4010) { return ['failed', 'Transaction rejected (4010)']; }
    if (code === -32000) { return ['failed', 'Insufficient funds for gas (-32000)']; }
    return ['failed', 'Transaction failed (' + String(code) + ')'];
  }

  function swap() {
    state.pending = true;
    setSwapError('');
    setTxStatus('pending');
    render();
    request('eth_sendTransaction', [{ from: state.account, to: '0x0000000000000000000000000000000000000000', value: '0x0' }])
      .then(function (hash) {
        el('tx-hash').textContent = hash;
        return request('eth_getTransactionReceipt', [hash]);
      })
      .then(function (receipt) {
        setTxStatus(receipt && receipt.status === '0x1' ? 'confirmed' : 'failed');
      })
      .catch(function (error) {
        var described = describeError(error);
        setTxStatus(described[0]);
        setSwapError(described[1]);
      })
      .then(function () { state.pending = false; render(); });
  }

  el('connect-button').addEventListener('click', openModal);
  el('wallet-modal-close').addEventListener('click', closeModal);
  el('wallet-option-injected').addEventListener('click', function () {
    setModalError('');
    request('eth_requestAccounts').then(function (accounts) {
      if (!accounts || accounts.length === 0) {
        setModalError('No accounts authorized');
        return null;
      }
      closeModal();
      return refreshWallet();
    }).catch(function (error) {
      setModalError('Connection failed (' + String(error && error.code) + ')');
    });
  });
  el('swap-button').addEventListener('click', function () {
    var current = buttonState()[0];
    if (current === 'connect') { openModal(); } else if (current === 'ready') { swap(); }
  });
  el('amount-in').addEventListener('input', render);
  el('token-in').addEventListener('change', render);
  el('token-out').addEventListener('change', render);

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', refreshWallet);
    window.ethereum.on('chainChanged', refreshWallet);
  }

  fetch('${SANDBOX_PRICES_PATH}')
    .then(function (response) { return response.json(); })
    .then(function (prices) { state.prices = prices; render(); })
    .catch(function () { render(); });

  render();
  refreshWallet();
})();
`;

const tokenOptions = (selected: string): string =>
  SANDBOX_TOKENS.map(
    (symbol) =>
      `<option value="${symbol}"${symbol === selected ? ' selected' : ''}>${symbol}</option>`,
  ).join('');

export const SANDBOX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Dexflo Sandbox DEX</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
  header, label { display: flex; gap: .5rem; align-items: center; margin-bottom: 1rem; }
  [hidden] { display: none !important; }
  [role="dialog"] { border: 1px solid #888; padding: 1rem; margin-bottom: 1rem; }
  button { padding: .5rem 1rem; }
</style>
</head>
<body>
<header>
  <strong>Dexflo Sandbox</strong>
  <span data-testid="network-label"></span>
  <button type="button" data-testid="connect-button">Connect</button>
  <span data-testid="account-address" hidden></span>
</header>
<div data-testid="wallet-modal" role="dialog" aria-label="Connect a wallet" hidden>
  <button type="button" data-testid="wallet-option-injected">Browser wallet</button>
  <button type="button" data-testid="wallet-modal-close">Close</button>
  <p data-testid="wallet-modal-error" role="alert" hidden></p>
</div>
<main>
  <label>From
    <select data-testid="token-in" aria-label="From token">${tokenOptions('ETH')}</select>
    <input data-testid="amount-in" inputmode="decimal" placeholder="0" aria-label="Amount to sell">
  </label>
  <label>To
    <select data-testid="token-out" aria-label="To token">${tokenOptions('USDC')}</select>
    <output data-testid="amount-out" aria-label="Amount to receive"></output>
  </label>
  <p data-testid="quote-rate"></p>
  <button type="button" data-testid="swap-button" data-state="connect">Connect wallet</button>
  <p data-testid="swap-error" role="alert" hidden></p>
  <p>Status: <span data-testid="tx-status" hidden></span> <code data-testid="tx-hash"></code></p>
</main>
<script>${SANDBOX_SCRIPT}</script>
</body>
</html>`;
