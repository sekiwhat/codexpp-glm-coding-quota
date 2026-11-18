(() => {
  const STYLE_ID = "glm-coding-quota-style";
  const nf = new Intl.NumberFormat("zh-CN");

  function formatNumber(value) {
    return Number.isFinite(value) ? nf.format(Math.round(value)) : "--";
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${Math.round(value)}%` : "--%";
  }

  function formatReset(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "未知";
    const date = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function stateClass(usedPercent) {
    if (!Number.isFinite(usedPercent)) return "unknown";
    if (usedPercent >= 90) return "danger";
    if (usedPercent >= 70) return "warn";
    return "ok";
  }

  function windowInfo(windows, unit) {
    return windows.find((item) => item.type === "CREDIT_LIMIT" && item.unit === unit) || null;
  }

  function itemNode(label, info) {
    const wrap = document.createElement("span");
    wrap.className = "glmq-item";
    if (!info) {
      wrap.textContent = `${label} --`;
      return wrap;
    }
    const total = Number.isFinite(info.total) && info.total > 0 ? info.total : null;
    const remainingPercent = total ? (info.remaining / total) * 100 : null;
    const usedPercent = Number.isFinite(info.usedPercent)
      ? info.usedPercent
      : (total ? 100 - remainingPercent : null);
    wrap.classList.add(stateClass(usedPercent));
    wrap.title = [
      `${label}额度：已用 ${formatNumber(info.used)} / ${formatNumber(info.total)} 积分`,
      `剩余 ${formatNumber(info.remaining)}（${formatPercent(remainingPercent)}）`,
      `${formatReset(info.resetsAtMs)} 重置`,
    ].join("\n");

    const text = document.createElement("span");
    text.className = "glmq-text";
    text.textContent = `${label} ${formatPercent(usedPercent)}`;
    const bar = document.createElement("span");
    bar.className = "glmq-bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = "glmq-fill";
    fill.style.width = `${Math.max(0, Math.min(100, usedPercent))}%`;
    bar.appendChild(fill);
    wrap.appendChild(text);
    wrap.appendChild(bar);
    return wrap;
  }

  function setLoading(root, text) {
    root.classList.remove("glmq-error");
    root.textContent = text || "GLM 额度读取中…";
  }

  function setError(root, message) {
    root.classList.add("glmq-error");
    root.textContent = `GLM 额度：${message}`;
    root.title = message;
  }

  function renderQuota(root, result) {
    root.classList.remove("glmq-error");
    root.title = `数据来源：${result.keySource || "未知"} · 更新于 ${formatReset(result.fetchedAtMs)}`;
    root.textContent = "";

    const brand = document.createElement("span");
    brand.className = "glmq-brand";
    brand.textContent = result.level ? `GLM ${String(result.level).toUpperCase()}` : "GLM";
    root.appendChild(brand);

    const fiveHours = windowInfo(result.windows, 3);
    const weekly = windowInfo(result.windows, 6);
    root.appendChild(itemNode("5h", fiveHours));
    root.appendChild(itemNode("周", weekly));
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .glmq-chip {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        max-width: 100%;
        padding: 3px 10px;
        border-radius: 999px;
        border: 1px solid var(--codex-plus-border, rgba(125, 125, 125, 0.35));
        background: var(--codex-plus-bg-elevated, rgba(127, 127, 127, 0.08));
        color: var(--codex-plus-text, inherit);
        font-size: 12px;
        line-height: 18px;
        user-select: none;
        cursor: pointer;
        white-space: nowrap;
      }
      .glmq-chip:hover { border-color: var(--codex-plus-text, rgba(125, 125, 125, 0.6)); }
      .glmq-brand { font-weight: 600; letter-spacing: 0; opacity: 0.75; }
      .glmq-item { display: inline-flex; align-items: center; gap: 6px; }
      .glmq-text { font-variant-numeric: tabular-nums; }
      .glmq-total { opacity: 0.55; }
      .glmq-bar {
        position: relative;
        width: 34px;
        height: 3px;
        border-radius: 2px;
        background: rgba(127, 127, 127, 0.28);
        overflow: hidden;
      }
      .glmq-fill { position: absolute; inset: 0 auto 0 0; border-radius: 2px; }
      .glmq-item.ok .glmq-fill { background: #3fb950; }
      .glmq-item.warn .glmq-fill { background: #d29922; }
      .glmq-item.danger .glmq-fill { background: #f85149; }
      .glmq-item.warn .glmq-text { color: #d29922; }
      .glmq-item.danger .glmq-text { color: #f85149; }
      .glmq-chip.glmq-error { opacity: 0.75; font-size: 12px; }
    `;
    document.head.appendChild(style);
  }

  // wrap_script 只在脚本同步初始化期间保留 currentKey；延迟启动时必须显式带上
  // scriptKey，否则实例归属为空，后台调用会报「没有找到拓展」。
  const SCRIPT_KEY = window.__codexPlusUserScripts?.currentKey || "user:glm-coding-quota";
  const LIVE_FLAG = "__glmCodingQuotaLive";
  let started = false;

  function start() {
    if (started || typeof window.codexPlus?.extension !== "function") return;
    started = true;
    const runtime = window.__codexPlusUserScripts;
    // 单例：先撤掉上一个实例（若还有句柄）和残留节点，保证页面上只有一个余额条。
    const previousCtx = window[LIVE_FLAG];
    if (previousCtx && typeof previousCtx.dispose === "function") {
      try { previousCtx.dispose(); } catch {}
    }
    window[LIVE_FLAG] = null;
    document.querySelectorAll(".glmq-chip").forEach((node) => node.remove());
    const previous = runtime?.currentKey ?? null;
    // 旧版适配层只认 currentKey，启动期间临时恢复成自己的 key。
    if (runtime) runtime.currentKey = SCRIPT_KEY;
    let ctx;
    try {
      ctx = window.codexPlus.extension((ctx) => {
    installStyle();

    const refreshMs = Math.max(1, Number(ctx.config?.refreshMinutes) || 5) * 60 * 1000;
    let inFlight = false;

    async function refresh(root, force) {
      if (inFlight) return;
      inFlight = true;
      if (force) setLoading(root, "GLM 额度刷新中…");
      try {
        const result = await ctx.backend.call("quota", { force: force === true });
        renderQuota(root, result);
      } catch (error) {
        setError(root, error?.message || "读取失败");
      } finally {
        inFlight = false;
      }
    }

    ctx.registerSlot({
      slot: "composer.below",
      order: 40,
      render: ({ container }) => {
        const chip = document.createElement("div");
        chip.className = "glmq-chip";
        chip.setAttribute("data-codex-plus-ext", "true");
        chip.setAttribute("role", "status");
        setLoading(chip);
        chip.addEventListener("click", () => refresh(chip, true));
        container.appendChild(chip);

        let stopped = false;
        const timer = window.setInterval(() => {
          if (stopped) return;
          if (!chip.isConnected) {
            stopped = true;
            window.clearInterval(timer);
            return;
          }
          refresh(chip, false);
        }, refreshMs);
        window.setTimeout(() => {
          if (!stopped) refresh(chip, false);
        }, 50);
        refresh(chip, false);
        return () => {
          stopped = true;
          window.clearInterval(timer);
        };
      },
    });

      }, { scriptKey: SCRIPT_KEY });
    } finally {
      if (runtime) runtime.currentKey = previous;
    }
    // 兜底登记清理：某些版本不会自动登记，没有清理会让热重载退回整页刷新。
    if (runtime && typeof runtime.registerCleanup === "function" && !(runtime.scripts?.[SCRIPT_KEY]?.cleanups || []).length) {
      runtime.currentKey = SCRIPT_KEY;
      try {
        runtime.registerCleanup(() => {
          try { ctx.dispose(); } catch {}
          window[LIVE_FLAG] = null;
          document.getElementById(STYLE_ID)?.remove();
        });
      } catch {}
      runtime.currentKey = previous;
    }
    window[LIVE_FLAG] = ctx;
  }

  function apiReady() {
    return typeof window.codexPlus?.extension === "function";
  }

  if (apiReady()) {
    start();
  } else {
    // Codex 重启后 codexPlus 可能比用户脚本晚很久才注入，最长等 60 秒。
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (apiReady() || ++attempts >= 600) {
        window.clearInterval(timer);
        if (apiReady()) start();
      }
    }, 100);
  }
})();
