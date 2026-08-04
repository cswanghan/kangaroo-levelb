// Shared login gate + prompt modal (styled to match site modals)
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .lp-overlay {
      display: none; position: fixed; inset: 0; z-index: 950;
      background: rgba(0,0,0,0.4); backdrop-filter: blur(3px);
      justify-content: center; align-items: center; padding: 20px;
    }
    .lp-overlay.open { display: flex; }
    .lp-box {
      background: #FDFBF9; border: 1px solid #E8E4DF; border-radius: 16px;
      padding: 32px 28px; max-width: 400px; width: 92%; text-align: center;
      box-shadow: 0 16px 40px rgba(0,0,0,0.12);
      animation: lpIn 0.2s ease;
    }
    @keyframes lpIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    .lp-box .lp-icon { font-size: 2.2rem; margin-bottom: 10px; }
    .lp-box h3 {
      font-family: "Songti SC", "STSong", "Noto Serif SC", Georgia, serif;
      font-size: 1.25rem; font-weight: 500; margin-bottom: 8px; color: #171717;
    }
    .lp-box p {
      color: #5a5652; font-size: 0.86rem; line-height: 1.65; margin-bottom: 12px;
    }
    .lp-tips {
      text-align: left; background: rgba(241,186,186,0.22); border-radius: 10px;
      padding: 10px 12px; margin-bottom: 18px; font-size: 0.78rem; color: #5a5652; line-height: 1.55;
    }
    .lp-tips li { margin-left: 16px; margin-bottom: 2px; }
    .lp-actions { display: flex; flex-direction: column; gap: 10px; }
    .lp-actions-row { display: flex; gap: 10px; }
    .lp-btn {
      flex: 1; padding: 12px 14px; border: none; border-radius: 18px;
      font-size: 0.9rem; cursor: pointer; font-weight: 500;
      font-family: inherit; transition: all 0.15s; min-height: 44px;
    }
    .lp-btn-outline { background: transparent; border: 1px solid #F1BABA; color: #BA6D73; }
    .lp-btn-outline:hover { background: rgba(241,186,186,0.3); }
    .lp-btn-primary { background: #BA6D73; color: white; }
    .lp-btn-primary:hover { background: #a55e64; }
    .lp-btn-google {
      background: #fff; border: 1px solid #E8E4DF; color: #171717;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .lp-btn-google:hover { border-color: #BA6D73; background: #FDFBF9; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'lp-overlay';
  overlay.id = 'loginPromptOverlay';
  overlay.innerHTML = `
    <div class="lp-box">
      <div class="lp-icon">🔑</div>
      <h3 id="loginPromptTitle">需要登录</h3>
      <p id="loginPromptMsg">练习、成绩与错题本需登录后使用。</p>
      <ul class="lp-tips">
        <li>支持用户名或注册邮箱登录</li>
        <li>也可一键 Google 登录（推荐）</li>
        <li>新用户可直接注册，免费使用</li>
      </ul>
      <div class="lp-actions">
        <button class="lp-btn lp-btn-primary" onclick="window._goToLogin()">去登录 / 注册</button>
        <button class="lp-btn lp-btn-google" type="button" onclick="window._goToLogin('google')">用 Google 登录</button>
        <div class="lp-actions-row">
          <button class="lp-btn lp-btn-outline" onclick="window._closeLoginPrompt()">稍后再说</button>
        </div>
      </div>
    </div>
  `;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));
})();

window._closeLoginPrompt = function () {
  const overlay = document.getElementById('loginPromptOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  if (overlay._onCancel) {
    overlay._onCancel();
    overlay._onCancel = null;
  }
};

window._pendingLoginRedirect = null;

window._goToLogin = function (prefer) {
  let target = window._pendingLoginRedirect || (location.pathname + location.search + location.hash);
  if (target && !target.startsWith('/')) target = '/' + target;
  const redirect = encodeURIComponent(target || '/index.html');
  let url = '/login.html?redirect=' + redirect;
  if (prefer === 'google') url += '&prefer=google';
  window.location.href = url;
};

/**
 * Returns true if logged in; otherwise opens prompt and returns false.
 * @param {string} [message]
 * @param {Function} [onCancel]
 * @param {string} [redirectTo] optional post-login path (e.g. quiz.html?mode=exam)
 */
window.requireLogin = function (message, onCancel, redirectTo) {
  if (localStorage.getItem('token')) return true;

  window._pendingLoginRedirect = redirectTo || null;
  const overlay = document.getElementById('loginPromptOverlay');
  if (overlay) {
    const msg = document.getElementById('loginPromptMsg');
    if (msg) msg.textContent = message || '练习、成绩与错题本需登录后使用。';
    overlay._onCancel = onCancel || null;
    overlay.classList.add('open');
  }
  return false;
};

window.isLoggedIn = function () {
  return !!localStorage.getItem('token');
};
