/**
 * Mini Jigsaw Puzzle - Vanilla JS game
 * Royal Match-inspired UI, level-based puzzles, Card Album Collection.
 */

(function () {
  "use strict";

  const SNAP_THRESHOLD = 35;
  const SAVE_KEY = "puzzleGame_save_v2";
  const STORAGE_KEYS = {
    currentLevel: "puzzle_currentLevel",
    coins: "puzzle_coins",
    musicOn: "puzzle_musicOn",
    sfxOn: "puzzle_sfxOn",
    devCheatsEnabled: "puzzle_devCheatsEnabled",
  };
  const DEFAULT_COINS = 50;
  const COINS_TAP_WINDOW_MS = 2000;
  const COINS_TAP_COUNT = 5;
  const LONG_PRESS_MS = 1500;
  const LEVEL_5_INDEX = 4;
  const LEVEL_6_INDEX = 5;
  const LEVEL_8_INDEX = 7;
  const BP_STARS_PER_CARD = 10;
  const WHEEL_FREE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const WHEEL_SEGMENTS = 6;
  const WHEEL_SPIN_DURATION_MS = 3000;
  const ALBUM_FRESH_CARD_COUNT = 8;
  const BATTLE_PASS_TOKEN_INTERVAL_MS = 3000;
  const BATTLE_PASS_TOKEN_LIFETIME_MS = 5000;
  const EVENT_DURATION_MS = 10 * 24 * 60 * 60 * 1000;
  const CARD_IMAGE_BASE = "assets/cards/";

  function ensureEvent(save, key, startNowIfMissing) {
    const ev = save[key];
    if (ev && typeof ev.startAt === "number" && typeof ev.endAt === "number") return ev;
    if (!startNowIfMissing) return null;
    const now = Date.now();
    const event = { startAt: now, endAt: now + EVENT_DURATION_MS };
    save[key] = event;
    return event;
  }

  function isEventActive(save, key) {
    const ev = save[key];
    return !!(ev && typeof ev.endAt === "number" && Date.now() < ev.endAt);
  }

  function getRemainingMs(save, key) {
    const ev = save[key];
    if (!ev || typeof ev.endAt !== "number") return 0;
    return Math.max(0, ev.endAt - Date.now());
  }

  function formatRemaining(ms) {
    if (ms <= 0) return "Event ended";
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return d + "d " + h + "h " + m + "m";
  }

  function getDefaultSave() {
    return {
      currentLevel: 0,
      coins: DEFAULT_COINS,
      collectionUnlocked: false,
      collectionTutorialCompleted: false,
      lastAnimatedInboxSignature: "",
      albums: { fresh: { collectedCount: 0 } },
      cards: { collected: {}, newInbox: [], duplicates: {} },
      rewards: { trophies: 0, unlockedRewards: [], trophiesGoldCup: false },
      allCardsRewardClaimed: false,
      battlePassUnlocked: false,
      bpStarsTotal: 0,
      albumEvent: null,
      battlePassEvent: null,
      wheelUnlocked: false,
      wheelNextFreeAt: 0,
      wheelTutorialSeen: false,
      musicOn: "true",
      sfxOn: "true",
    };
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const merged = { ...getDefaultSave(), ...data };
        if (merged.collectionTutorialCompleted === undefined && (data.collectionTutorialSeen === true || data.collectionUnlockFlowSeen === true)) {
          merged.collectionTutorialCompleted = true;
        }
        if (merged.rewards && typeof merged.rewards.trophiesGoldCup === "undefined") {
          merged.rewards.trophiesGoldCup = false;
        }
        if (typeof merged.allCardsRewardClaimed === "undefined") {
          merged.allCardsRewardClaimed = false;
        }
        if (typeof merged.battlePassUnlocked === "undefined" && merged.currentLevel >= 6) {
          merged.battlePassUnlocked = true;
        }
        if (typeof merged.battlePassUnlocked === "undefined") {
          merged.battlePassUnlocked = false;
        }
        if (typeof merged.bpStarsTotal !== "number") {
          merged.bpStarsTotal = typeof merged.starTokens === "number" ? merged.starTokens : 0;
        }
        if (merged.currentLevel < 6) {
          merged.battlePassUnlocked = false;
        }
        if (typeof merged.wheelUnlocked === "undefined") {
          merged.wheelUnlocked = merged.currentLevel >= 8;
        }
        if (typeof merged.wheelNextFreeAt !== "number") merged.wheelNextFreeAt = 0;
        if (typeof merged.wheelTutorialSeen !== "boolean") merged.wheelTutorialSeen = false;
        if (merged.collectionUnlocked && !merged.albumEvent) {
          merged.albumEvent = { startAt: Date.now(), endAt: Date.now() + EVENT_DURATION_MS };
        }
        if (merged.battlePassUnlocked && !merged.battlePassEvent) {
          merged.battlePassEvent = { startAt: Date.now(), endAt: Date.now() + EVENT_DURATION_MS };
        }
        return merged;
      }
      const legacy = getDefaultSave();
      const level = localStorage.getItem(STORAGE_KEYS.currentLevel);
      if (level !== null) legacy.currentLevel = Math.max(0, parseInt(level, 10));
      const coins = localStorage.getItem(STORAGE_KEYS.coins);
      if (coins !== null) legacy.coins = parseInt(coins, 10);
      const music = localStorage.getItem(STORAGE_KEYS.musicOn);
      if (music !== null) legacy.musicOn = music;
      const sfx = localStorage.getItem(STORAGE_KEYS.sfxOn);
      if (sfx !== null) legacy.sfxOn = sfx;
      return legacy;
    } catch (_) {
      return getDefaultSave();
    }
  }

  function saveSave(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  class ImageGenerator {
    static generatePieces(cols, rows, seed = 1) {
      const pieceWidth = 80;
      const pieceHeight = 80;
      const fullWidth = cols * pieceWidth;
      const fullHeight = rows * pieceHeight;

      const canvas = document.createElement("canvas");
      canvas.width = fullWidth;
      canvas.height = fullHeight;
      const ctx = canvas.getContext("2d");

      const grad = ctx.createLinearGradient(0, 0, fullWidth, fullHeight);
      const hue = (seed * 137) % 360;
      grad.addColorStop(0, `hsl(${hue}, 70%, 85%)`);
      grad.addColorStop(0.5, `hsl(${(hue + 40) % 360}, 75%, 90%)`);
      grad.addColorStop(1, `hsl(${(hue + 80) % 360}, 70%, 85%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, fullWidth, fullHeight);

      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 8; i++) {
        const x = ((seed * (i + 1) * 31) % fullWidth);
        const y = ((seed * (i + 3) * 17) % fullHeight);
        const r = 15 + (i % 3) * 10;
        ctx.fillStyle = `hsl(${(hue + i * 45) % 360}, 80%, 75%)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(fullWidth / 2, fullHeight / 2);
      ctx.fillStyle = "#ffd93d";
      ctx.strokeStyle = "#d4a02a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const x = Math.cos(a) * 28;
        const y = Math.sin(a) * 28;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const urls = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = pieceWidth;
          sliceCanvas.height = pieceHeight;
          const sctx = sliceCanvas.getContext("2d");
          sctx.drawImage(
            canvas,
            col * pieceWidth,
            row * pieceHeight,
            pieceWidth,
            pieceHeight,
            0,
            0,
            pieceWidth,
            pieceHeight
          );
          urls.push(sliceCanvas.toDataURL("image/png"));
        }
      }
      return urls;
    }
  }

  function generateCardArt(artSeed, size) {
    size = size || 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const hue = (artSeed * 67) % 360;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `hsl(${hue}, 75%, 85%)`);
    grad.addColorStop(1, `hsl(${hue}, 70%, 55%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = `hsl(${(hue + 80) % 360}, 60%, 40%)`;
    ctx.beginPath();
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.32 * (0.8 + (artSeed % 3) * 0.1);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    return canvas.toDataURL("image/png");
  }

  function generateRewardCharacterArt(artSeed, size) {
    size = size || 200;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;
    const hue = (artSeed * 67) % 360;
    for (let i = 8; i >= 0; i--) {
      const r = 60 + i * 8;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 20);
      g.addColorStop(0, `hsla(${hue}, 70%, 75%, ${0.15 - i * 0.012})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 20, 0, Math.PI * 2);
      ctx.fill();
    }
    const bodyGrad = ctx.createRadialGradient(cx, cy - 10, 0, cx, cy, 55);
    bodyGrad.addColorStop(0, `hsl(${hue}, 75%, 78%)`);
    bodyGrad.addColorStop(1, `hsl(${hue}, 70%, 50%)`);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 42, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#2d3436";
    ctx.beginPath();
    ctx.ellipse(cx - 12, cy - 8, 6, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 12, cy - 8, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL("image/png");
  }

  const ALBUM_DEFS = [
    {
      id: "fresh",
      name: "Safari",
      cardIds: ["fresh_0", "fresh_1", "fresh_2", "fresh_3", "fresh_4", "fresh_5", "fresh_6", "fresh_7"],
    },
    {
      id: "safari",
      name: "Fantasy",
      cardIds: ["safari_0", "safari_1", "safari_2", "safari_3", "safari_4", "safari_5", "safari_6", "safari_7"],
    },
  ];

  const CARD_NAMES_FRESH = ["Elephant", "Drums", "Chameleon", "Safari", "Mask", "Giraffes", "Waterfall", "Village"];
  const CARD_RARITY_FRESH = [1, 2, 2, 2, 2, 2, 2, 2];
  const CARD_DEFS = {};
  for (let i = 0; i < 8; i++) {
    const id = "fresh_" + i;
    const num = String(i + 1).padStart(2, "0");
    CARD_DEFS[id] = {
      id,
      name: CARD_NAMES_FRESH[i] || "Card " + (i + 1),
      rarityStars: CARD_RARITY_FRESH[i] || 1,
      albumId: "fresh",
      artSeed: i,
      imageSrc: CARD_IMAGE_BASE + "card_" + num + ".png",
    };
  }
  const CARD_NAMES_SAFARI = ["Lion", "Zebra", "Sunset", "Acacia", "Savanna", "Elephant Herd", "Oasis", "Campfire"];
  const CARD_RARITY_SAFARI = [2, 2, 1, 2, 2, 2, 2, 2];
  for (let i = 0; i < 8; i++) {
    const id = "safari_" + i;
    CARD_DEFS[id] = {
      id,
      name: CARD_NAMES_SAFARI[i] || "Card " + (i + 1),
      rarityStars: CARD_RARITY_SAFARI[i] || 1,
      albumId: "safari",
      artSeed: 20 + i,
      imageSrc: CARD_IMAGE_BASE + "safari_" + i + ".png",
    };
  }

  const REWARD_DEFS = { fresh: { name: "Truffle", rarity: "Common", artSeed: 10 }, safari: { name: "Safari", rarity: "Common", artSeed: 11 } };

  function getTotalCardsAvailable() {
    return ALBUM_DEFS.reduce((sum, a) => sum + (a.cardIds ? a.cardIds.length : 0), 0);
  }

  class CollectionManager {
    constructor(saveRef, persistFn) {
      this._save = saveRef;
      this._persist = persistFn || (() => saveSave(this._save));
    }

    getState() {
      return this._save;
    }

    _persist() {
      saveSave(this._save);
    }

    isUnlockTriggered() {
      return this._save.collectionUnlocked === true;
    }

    isAvailable() {
      return this._save.collectionTutorialCompleted === true;
    }

    getLastAnimatedInboxSignature() {
      return this._save.lastAnimatedInboxSignature || "";
    }

    setLastAnimatedInboxSignature(sig) {
      this._save.lastAnimatedInboxSignature = sig;
      this._persist();
    }

    hasUncollectedNew() {
      return (this._save.cards.newInbox || []).length > 0;
    }

    _ensureCardsStructure() {
      const cards = this._save.cards;
      if (!cards.collected) cards.collected = {};
      if (!cards.newInbox) cards.newInbox = [];
      if (!cards.duplicates) cards.duplicates = {};
      this._save.albums = this._save.albums || {};
      ALBUM_DEFS.forEach((def) => {
        if (!this._save.albums[def.id]) this._save.albums[def.id] = { collectedCount: 0 };
      });
    }

    grantGiftCards() {
      this._ensureCardsStructure();
      const giftIds = ["fresh_0", "fresh_1"];
      const cards = this._save.cards;
      const added = [];
      for (const cardId of giftIds) {
        if (cards.collected[cardId]) continue;
        if ((cards.newInbox || []).indexOf(cardId) >= 0) continue;
        cards.newInbox.push(cardId);
        added.push(cardId);
      }
      this._persist();
      return added;
    }

    grantLevelDrop(levelIndex) {
      if (!this.isAvailable()) return null;
      this._ensureCardsStructure();
      const allCardIds = ALBUM_DEFS.reduce((acc, a) => acc.concat(a.cardIds || []), []);
      const cards = this._save.cards;
      const inbox = cards.newInbox || [];
      const uncollected = allCardIds.filter((id) => !cards.collected[id] && inbox.indexOf(id) < 0);
      let cardId;
      if (uncollected.length > 0) {
        cardId = uncollected[0];
        cards.newInbox.push(cardId);
      } else {
        cardId = allCardIds[levelIndex % allCardIds.length];
        cards.duplicates[cardId] = (cards.duplicates[cardId] || 0) + 1;
      }
      this._persist();
      return cardId;
    }

    onLevelCompleted(levelIndex, opts) {
      opts = opts || {};
      if (levelIndex < LEVEL_5_INDEX) {
        return { unlockedNow: false, droppedCardIds: [] };
      }
      if (levelIndex === LEVEL_5_INDEX && !this._save.collectionUnlocked) {
        this._save.collectionUnlocked = true;
        const now = Date.now();
        this._save.albumEvent = { startAt: now, endAt: now + EVENT_DURATION_MS };
        this._persist();
        return { unlockedNow: true, droppedCardIds: [] };
      }
      this._persist();
      return { unlockedNow: false, droppedCardIds: [] };
    }

    awardCardFromBattlePass() {
      this._ensureCardsStructure();
      const allCardIds = ALBUM_DEFS.reduce((acc, a) => acc.concat(a.cardIds || []), []);
      const cards = this._save.cards;
      const inbox = cards.newInbox || [];
      const uncollected = allCardIds.filter((id) => !cards.collected[id] && inbox.indexOf(id) < 0);
      if (uncollected.length > 0) {
        const cardId = uncollected[0];
        cards.newInbox.push(cardId);
        this._persist();
        return { cardId };
      }
      const coinReward = 10;
      this._save.coins = (this._save.coins || 0) + coinReward;
      this._persist();
      return { cardId: null, coins: coinReward };
    }

    getWheelSegmentPool() {
      this._ensureCardsStructure();
      const allCardIds = ALBUM_DEFS.reduce((acc, a) => acc.concat(a.cardIds || []), []);
      const cards = this._save.cards;
      const inbox = cards.newInbox || [];
      const uncollected = allCardIds.filter((id) => !cards.collected[id] && inbox.indexOf(id) < 0);
      const collected = allCardIds.filter((id) => cards.collected[id]);
      const pool = [];
      for (let i = 0; i < WHEEL_SEGMENTS; i++) {
        if (i < uncollected.length) {
          pool.push(uncollected[i]);
        } else if (collected.length > 0) {
          pool.push(collected[(i - uncollected.length) % collected.length]);
        } else {
          pool.push(allCardIds[i % allCardIds.length]);
        }
      }
      return pool;
    }

    awardCardFromWheel(cardId) {
      this._ensureCardsStructure();
      const cards = this._save.cards;
      const alreadyCollected = !!cards.collected[cardId];
      cards.newInbox.push(cardId);
      if (alreadyCollected) {
        cards.duplicates[cardId] = (cards.duplicates[cardId] || 0) + 1;
      }
      this._persist();
      return { cardId };
    }

    markTutorialCompleted() {
      this._save.collectionTutorialCompleted = true;
      this._persist();
    }

    resetCollectionState() {
      this._ensureCardsStructure();
      this._save.cards.collected = {};
      this._save.cards.newInbox = [];
      this._save.cards.duplicates = {};
      ALBUM_DEFS.forEach((def) => {
        const album = this._save.albums[def.id];
        if (album) album.collectedCount = 0;
      });
      this._persist();
    }

    collectCard(cardId) {
      this._ensureCardsStructure();
      const cards = this._save.cards;
      const idx = (cards.newInbox || []).indexOf(cardId);
      if (idx < 0) return null;
      cards.newInbox.splice(idx, 1);
      cards.collected[cardId] = true;
      const albumId = CARD_DEFS[cardId] && CARD_DEFS[cardId].albumId;
      if (albumId) {
        const album = this._save.albums[albumId];
        if (album) album.collectedCount = (album.collectedCount || 0) + 1;
      }
      this._persist();
      let result = null;
      const albumId2 = CARD_DEFS[cardId] && CARD_DEFS[cardId].albumId;
      if (albumId2) {
        const albumDef = ALBUM_DEFS.find((a) => a.id === albumId2);
        const total = albumDef ? albumDef.cardIds.length : 8;
        const collected = (this._save.albums[albumId2] && this._save.albums[albumId2].collectedCount) || 0;
        if (collected >= total) {
          this._save.rewards = this._save.rewards || { trophies: 0, unlockedRewards: [], trophiesGoldCup: false };
          this._save.rewards.trophies = (this._save.rewards.trophies || 0) + 1;
          this._save.rewards.unlockedRewards = this._save.rewards.unlockedRewards || [];
          if (this._save.rewards.unlockedRewards.indexOf(albumId2) < 0) {
            this._save.rewards.unlockedRewards.push(albumId2);
          }
          this._save.coins = (this._save.coins || 0) + 20;
          this._persist();
          const reward = REWARD_DEFS[albumId2] || { name: "Truffle", rarity: "Common", artSeed: 10 };
          result = { albumComplete: true, reward };
        }
      }
      const collectedTotal = this.getCollectedTotal();
      const totalAvailable = getTotalCardsAvailable();
      if (collectedTotal === totalAvailable && totalAvailable > 0 && !this._save.allCardsRewardClaimed) {
        this._save.allCardsRewardClaimed = true;
        this._save.rewards = this._save.rewards || { trophies: 0, unlockedRewards: [], trophiesGoldCup: false };
        this._save.rewards.trophiesGoldCup = true;
        this._save.rewards.unlockedRewards = this._save.rewards.unlockedRewards || [];
        if (this._save.rewards.unlockedRewards.indexOf("goldCup") < 0) {
          this._save.rewards.unlockedRewards.push("goldCup");
        }
        this._save.coins = (this._save.coins || 0) + 50;
        this._persist();
        if (!result) result = {};
        result.allCardsComplete = true;
      }
      return result;
    }

    getCollectedTotal(includeInbox) {
      const cards = this._save.cards;
      const c = cards && cards.collected ? cards.collected : {};
      let n = Object.keys(c).filter((id) => c[id]).length;
      if (includeInbox && cards && cards.newInbox && cards.newInbox.length) {
        const inInbox = cards.newInbox.filter((id) => !c[id]);
        n += inInbox.length;
      }
      return n;
    }

    getAlbumProgress(albumId, includeInbox) {
      const def = ALBUM_DEFS.find((a) => a.id === albumId);
      const total = def ? def.cardIds.length : 8;
      let collected = (this._save.albums[albumId] && this._save.albums[albumId].collectedCount) || 0;
      if (includeInbox && def && this._save.cards && this._save.cards.newInbox) {
        const coll = this._save.cards.collected || {};
        const inInbox = this._save.cards.newInbox.filter((id) => def.cardIds.indexOf(id) >= 0 && !coll[id]);
        collected += inInbox.length;
      }
      return { collected, total };
    }

    getCardsForAlbum(albumId) {
      const def = ALBUM_DEFS.find((a) => a.id === albumId);
      if (!def) return [];
      return def.cardIds.map((id) => {
        const c = CARD_DEFS[id];
        const collected = this._save.cards.collected[id];
        const inNew = (this._save.cards.newInbox || []).indexOf(id) >= 0;
        const dup = (this._save.cards.duplicates[id] || 0);
        return {
          id,
          name: c ? c.name : "?",
          rarityStars: c ? c.rarityStars : 1,
          artSeed: c ? c.artSeed : 0,
          imageSrc: c ? c.imageSrc : "",
          collected,
          isNew: inNew,
          duplicates: dup,
        };
      });
    }
  }

  class CollectionUI {
    constructor(collectionManager, gameApp) {
      this.cm = collectionManager;
      this.app = gameApp;
      this.packAnimator = new CollectionPackAnimator();
      this.unlockModal = document.getElementById("collection-unlock-modal");
      this.tutorialOverlay = document.getElementById("collection-tutorial-overlay");
      this.albumScreen = document.getElementById("album-screen");
      this.rewardModal = document.getElementById("reward-modal");
      this.toast = document.getElementById("toast-card-found");
      this._selectedAlbumId = ALBUM_DEFS[0] ? ALBUM_DEFS[0].id : "fresh";
    }

    _shouldAnimateNewPack() {
      if (!this.cm.isAvailable()) return false;
      const inbox = (this.cm.getState().cards.newInbox || []).slice();
      if (inbox.length === 0) return false;
      const sig = inbox.sort().join(",");
      return sig !== this.cm.getLastAnimatedInboxSignature();
    }

    _getInboxSignature() {
      const inbox = (this.cm.getState().cards.newInbox || []).slice();
      return inbox.sort().join(",");
    }

    showUnlockFlow(onDone) {
      this.cm.grantGiftCards();
      this._onUnlockDone = onDone;
      this.unlockModal.classList.remove("hidden");
      const preview = document.getElementById("collection-unlock-preview");
      preview.innerHTML = "";
      for (let i = 0; i < 2; i++) {
        const cardId = "fresh_" + i;
        const def = CARD_DEFS[cardId];
        const div = document.createElement("div");
        div.className = "card-preview-mini";
        if (def && def.imageSrc) {
          const img = document.createElement("img");
          img.src = def.imageSrc;
          img.alt = "";
          img.loading = "eager";
          img.className = "card-preview-mini-img";
          img.onerror = () => { div.classList.add("card-preview-placeholder"); };
          div.appendChild(img);
        } else {
          div.classList.add("card-preview-placeholder");
        }
        preview.appendChild(div);
      }
      const placeholders = document.getElementById("collection-unlock-placeholders");
      placeholders.innerHTML = "";
      for (let i = 0; i < 2; i++) {
        const d = document.createElement("div");
        d.className = "placeholder-dot";
        d.textContent = "?";
        placeholders.appendChild(d);
      }
      const skip = () => {
        this.unlockModal.classList.add("hidden");
        this._runTutorialThenAlbum(() => {
          if (onDone) onDone();
        });
      };
      document.getElementById("btn-collection-lets-go").onclick = skip;
      document.getElementById("collection-unlock-skip").onclick = skip;
      this.unlockModal.onclick = (e) => { if (e.target === this.unlockModal) skip(); };
    }

    _runTutorialThenAlbum(onDone) {
      const steps = [
        "These are your cards! Complete levels to find new Blockies.",
        "Tap NEW cards in your album to collect them.",
      ];
      let stepIndex = 0;
      const bubble = document.getElementById("collection-tutorial-text");
      const overlay = this.tutorialOverlay;
      const advance = () => {
        stepIndex++;
        if (stepIndex >= steps.length) {
          overlay.classList.add("hidden");
          this.cm.markTutorialCompleted();
          this.app.collectionUI.updateCollectionButtons();
          this.showAlbum(onDone);
        } else {
          bubble.textContent = steps[stepIndex];
        }
      };
      bubble.textContent = steps[0];
      overlay.classList.remove("hidden");
      document.getElementById("collection-tutorial-skip").onclick = advance;
      overlay.onclick = (e) => { if (e.target === overlay) advance(); };
    }

    showAlbum(onBackCallback) {
      this.app.ui.showScreen("album-screen");
      this.updateGlobalCardsProgress();
      if (this._shouldAnimateNewPack()) {
        const inbox = (this.cm.getState().cards.newInbox || []).slice();
        const firstId = inbox[0];
        const firstAlbumId = firstId && CARD_DEFS[firstId] ? CARD_DEFS[firstId].albumId : null;
        if (firstAlbumId && ALBUM_DEFS.some((a) => a.id === firstAlbumId)) this._selectedAlbumId = firstAlbumId;
      }
      this._renderAlbumTabs();
      this._renderAlbumGrid(this._selectedAlbumId);
      this._updateAlbumProgress(this._selectedAlbumId);
      this._updateTapCollectHint();

      const albumTimerEl = document.getElementById("album-event-timer");
      if (albumTimerEl) {
        const tick = () => {
          const ms = getRemainingMs(this.cm.getState(), "albumEvent");
          albumTimerEl.textContent = ms > 0 ? "Event ends in: " + formatRemaining(ms) : "Event ended";
          if (ms <= 0 && this._albumEventTimerId) {
            clearInterval(this._albumEventTimerId);
            this._albumEventTimerId = null;
          }
        };
        tick();
        if (this._albumEventTimerId) clearInterval(this._albumEventTimerId);
        this._albumEventTimerId = setInterval(tick, 1000);
      }

      const bindBack = () => {
        document.getElementById("btn-album-back").onclick = () => {
          if (this._albumEventTimerId) {
            clearInterval(this._albumEventTimerId);
            this._albumEventTimerId = null;
          }
          if (onBackCallback) onBackCallback();
          else this.app.ui.showScreen("game-screen");
        };
      };

      if (this._shouldAnimateNewPack()) {
        const inbox = (this.cm.getState().cards.newInbox || []).slice();
        const getTile = (cardId) => document.querySelector("#album-grid [data-card-id=\"" + cardId + "\"]");
        const getImageSrc = (cardId) => (CARD_DEFS[cardId] && CARD_DEFS[cardId].imageSrc) || "";
        this.packAnimator.play(inbox, getTile, getImageSrc, () => {
          this.cm.setLastAnimatedInboxSignature(this._getInboxSignature());
          bindBack();
        });
      } else {
        bindBack();
      }
    }

    _renderAlbumTabs() {
      const container = document.getElementById("album-tabs");
      if (!container) return;
      container.innerHTML = "";
      ALBUM_DEFS.forEach((def) => {
        const p = this.cm.getAlbumProgress(def.id, true);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.role = "tab";
        btn.ariaSelected = this._selectedAlbumId === def.id;
        btn.className = "album-tab" + (this._selectedAlbumId === def.id ? " active" : "");
        btn.textContent = def.name + " (" + p.collected + "/" + p.total + ")";
        btn.onclick = () => {
          this._selectedAlbumId = def.id;
          this._renderAlbumTabs();
          this._renderAlbumGrid(this._selectedAlbumId);
          this._updateAlbumProgress(this._selectedAlbumId);
        };
        container.appendChild(btn);
      });
    }

    _updateAlbumProgress(albumId) {
      const id = albumId || this._selectedAlbumId;
      const p = this.cm.getAlbumProgress(id, true);
      const def = ALBUM_DEFS.find((a) => a.id === id);
      const el = document.getElementById("album-progress-text");
      if (el) el.textContent = p.collected + "/" + p.total;
      const nameEl = document.getElementById("album-name");
      if (nameEl) nameEl.textContent = def ? def.name : "";
    }

    updateGlobalCardsProgress() {
      const total = getTotalCardsAvailable();
      const collected = this.cm.getCollectedTotal(true);
      const pct = total > 0 ? Math.min(100, (collected / total) * 100) : 0;
      const isComplete = total > 0 && collected >= total;
      const nearComplete = total > 0 && pct >= 90 && !isComplete;

      const textEl = document.getElementById("cards-progress-text");
      if (textEl) textEl.textContent = collected + " / " + total;
      const fillEl = document.getElementById("cards-progress-fill");
      if (fillEl) fillEl.style.width = pct + "%";
      const textHomeEl = document.getElementById("cards-progress-text-home");
      if (textHomeEl) textHomeEl.textContent = collected + "/" + total;
      const fillHomeEl = document.getElementById("cards-progress-fill-home");
      if (fillHomeEl) fillHomeEl.style.width = pct + "%";

      const widgetAlbum = document.getElementById("cards-progress-widget-album");
      if (widgetAlbum) {
        widgetAlbum.classList.toggle("cards-progress-gift-ready", isComplete);
        widgetAlbum.classList.toggle("cards-progress-near-complete", nearComplete);
      }
      const giftLock = document.getElementById("cards-progress-gift-lock");
      if (giftLock) giftLock.classList.toggle("hidden", isComplete);

      const homeWidget = document.getElementById("cards-progress-widget-home");
      if (homeWidget) {
        if (this.cm.isAvailable()) homeWidget.classList.remove("hidden");
        else homeWidget.classList.add("hidden");
      }
    }

    showFinalRewardModal(onClose) {
      const modal = document.getElementById("final-reward-modal");
      if (!modal) return;
      if (typeof AudioPlayer !== "undefined" && AudioPlayer.win) AudioPlayer.win();
      modal.classList.remove("hidden");
      const close = () => {
        modal.classList.add("hidden");
        modal.onclick = null;
        const btn = document.getElementById("btn-final-reward-close");
        if (btn) btn.onclick = null;
        this.updateGlobalCardsProgress();
        if (onClose) onClose();
      };
      modal.onclick = (e) => { if (e.target === modal) close(); };
      const btn = document.getElementById("btn-final-reward-close");
      if (btn) btn.onclick = close;
    }

    _updateTapCollectHint() {
      const hasNew = this.cm.hasUncollectedNew();
      const el = document.getElementById("album-tap-collect-hint");
      if (hasNew) el.classList.remove("hidden");
      else el.classList.add("hidden");
    }

    _renderAlbumGrid(albumId) {
      const grid = document.getElementById("album-grid");
      if (!grid) return;
      grid.innerHTML = "";
      const id = albumId || this._selectedAlbumId;
      const cards = this.cm.getCardsForAlbum(id);
      cards.forEach((card) => {
        const tile = document.createElement("div");
        tile.className = "album-card-tile" + (!card.collected && !card.isNew ? " locked" : "");
        tile.dataset.cardId = card.id;
        const stars = "★".repeat(card.rarityStars);
        tile.innerHTML = '<span class="card-stars">' + stars + "</span>";
        if (card.isNew) {
          const tag = document.createElement("span");
          tag.className = "card-new-tag";
          tag.textContent = "NEW";
          tile.appendChild(tag);
        }
        if (card.collected || card.isNew) {
          const art = document.createElement("div");
          art.className = "card-art";
          if (card.imageSrc) {
            const img = document.createElement("img");
            img.src = card.imageSrc;
            img.alt = card.name;
            img.loading = "lazy";
            img.className = "card-art-img";
            img.onerror = function () {
              art.classList.add("card-art-placeholder");
              this.style.display = "none";
            };
            art.appendChild(img);
          } else {
            art.classList.add("card-art-placeholder");
          }
          tile.appendChild(art);
          const nameSpan = document.createElement("span");
          nameSpan.className = "card-name";
          nameSpan.textContent = card.name;
          tile.appendChild(nameSpan);
          if (card.collected && card.duplicates > 0) {
            const dup = document.createElement("span");
            dup.className = "card-duplicate-count";
            dup.textContent = "x" + (card.duplicates + 1);
            tile.appendChild(dup);
          }
        } else {
          const sil = document.createElement("div");
          sil.className = "card-silhouette";
          sil.textContent = "?";
          tile.appendChild(sil);
        }
        tile.onclick = () => this._onCardTap(tile, card);
        grid.appendChild(tile);
      });
    }

    _onCardTap(tile, card) {
      if (!card.isNew) return;
      tile.classList.add("collecting");
      const result = this.cm.collectCard(card.id);
      setTimeout(() => {
        tile.classList.remove("collecting");
        this._renderAlbumTabs();
        this._renderAlbumGrid(this._selectedAlbumId);
        this._updateAlbumProgress(this._selectedAlbumId);
        this._updateTapCollectHint();
        this.updateGlobalCardsProgress();
        this.app.ui.setCoins(this.cm.getState().coins);
        const albumIdForReward = CARD_DEFS[card.id] ? CARD_DEFS[card.id].albumId : "fresh";
        if (result && result.albumComplete) {
          this.showReward(result.reward, albumIdForReward, () => {
            this._updateCollectionButtons();
            if (result.allCardsComplete) this.showFinalRewardModal(() => this._updateCollectionButtons());
          });
        } else if (result && result.allCardsComplete) {
          this.showFinalRewardModal(() => this._updateCollectionButtons());
        }
        this._updateCollectionButtons();
      }, 400);
    }

    showReward(reward, albumId, onContinue) {
      if (typeof albumId === "function") {
        onContinue = albumId;
        albumId = "fresh";
      }
      document.getElementById("reward-name").textContent = reward.name;
      document.getElementById("reward-rarity").textContent = reward.rarity || "Common";
      const wrap = document.getElementById("reward-character-wrap");
      wrap.innerHTML = "";
      const img = new Image();
      img.src = generateRewardCharacterArt(reward.artSeed || 10, 140);
      wrap.appendChild(img);
      const p = this.cm.getAlbumProgress(albumId || "fresh");
      document.getElementById("reward-progress-text").textContent = p.collected + "/" + p.total;
      this.rewardModal.classList.remove("hidden");
      const skip = () => {
        this.rewardModal.classList.add("hidden");
        if (onContinue) onContinue();
      };
      document.getElementById("reward-modal-skip").onclick = skip;
      this.rewardModal.onclick = (e) => { if (e.target === this.rewardModal) skip(); };
    }

    showToastCardFound() {
      this.toast.classList.remove("hidden");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => this.toast.classList.add("hidden"), 2000);
    }

    showToastCardEarned() {
      const el = document.getElementById("toast-card-earned");
      if (!el) return;
      el.classList.remove("hidden");
      clearTimeout(this._toastCardEarnedTimer);
      this._toastCardEarnedTimer = setTimeout(() => el.classList.add("hidden"), 2000);
    }

    showToastUnlocksAfterLevel5() {
      const el = document.getElementById("toast-collection-locked");
      if (!el) return;
      el.classList.remove("hidden");
      clearTimeout(this._toastLockedTimer);
      this._toastLockedTimer = setTimeout(() => el.classList.add("hidden"), 2500);
    }

    updateCollectionButtons() {
      const save = this.cm.getState();
      const unlocked = this.cm.isAvailable();
      const albumActive = isEventActive(save, "albumEvent");
      const available = unlocked && albumActive;
      const hasNew = (save.cards.newInbox || []).length > 0;
      const btn = document.getElementById("nav-collection");
      if (btn) {
        btn.classList.toggle("locked", !available);
        btn.classList.toggle("event-ended", unlocked && !albumActive);
        btn.setAttribute("aria-disabled", available ? "false" : "true");
        btn.title = available ? "Collection" : (unlocked && !albumActive ? "Event ended" : "Unlocks after Level 5");
        btn.setAttribute("aria-label", available ? "Collection" : (unlocked && !albumActive ? "Event ended" : "Unlocks after Level 5"));
        const badge = btn.querySelector(".nav-badge") || btn.querySelector(".collection-badge");
        if (badge) {
          if (available && hasNew) badge.classList.remove("hidden");
          else badge.classList.add("hidden");
        }
      }
    }
  }

  class CollectionPackAnimator {
    constructor() {
      this._overlay = null;
      this._onComplete = null;
      this._timeouts = [];
      this._playing = false;
    }

    _clearTimeouts() {
      this._timeouts.forEach((t) => clearTimeout(t));
      this._timeouts = [];
    }

    _removeAllFlyingCards() {
      document.querySelectorAll(".flying-card").forEach((el) => el.remove());
    }

    _skip() {
      if (!this._playing) return;
      this._playing = false;
      this._clearTimeouts();
      this._removeAllFlyingCards();
      if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
      this._overlay = null;
      if (this._onComplete) {
        const fn = this._onComplete;
        this._onComplete = null;
        fn();
      }
    }

    play(cardIds, getTileByCardId, getCardImageSrc, onComplete) {
      if (this._playing) return;
      this._playing = true;
      this._onComplete = onComplete;
      const ids = cardIds.slice(0, 3);
      const overlay = document.createElement("div");
      overlay.className = "pack-overlay";
      overlay.setAttribute("aria-hidden", "false");

      const skipBar = document.createElement("div");
      skipBar.className = "pack-overlay-skip tap-to-skip-bar";
      skipBar.innerHTML = '<span class="tap-to-skip-text">Tap to skip</span>';
      skipBar.onclick = () => this._skip();
      overlay.onclick = (e) => { if (e.target === overlay) this._skip(); };

      const packEl = document.createElement("div");
      packEl.className = "card-pack";
      packEl.innerHTML = '<div class="card-pack-inner"><div class="card-pack-flap"></div><div class="card-pack-shine"></div></div>';

      const sparkleContainer = document.createElement("div");
      sparkleContainer.className = "pack-sparkles";

      overlay.appendChild(packEl);
      overlay.appendChild(sparkleContainer);
      overlay.appendChild(skipBar);
      document.body.appendChild(overlay);
      this._overlay = overlay;

      const packRect = () => packEl.getBoundingClientRect();
      const packCenter = () => {
        const r = packRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };

      this._timeouts.push(setTimeout(() => {
        packEl.classList.add("pack-opening");
        for (let i = 0; i < 8; i++) {
          const sp = document.createElement("div");
          sp.className = "pack-sparkle";
          sp.style.left = (50 + (Math.random() - 0.5) * 40) + "%";
          sp.style.top = (50 + (Math.random() - 0.5) * 40) + "%";
          sp.style.animationDelay = (i * 0.05) + "s";
          sparkleContainer.appendChild(sp);
        }
      }, 800));

      const self = this;
      const finish = () => {
        if (!self._playing) return;
        self._timeouts.push(setTimeout(() => {
          self._playing = false;
          self._clearTimeouts();
          self._removeAllFlyingCards();
          if (self._overlay && self._overlay.parentNode) self._overlay.parentNode.removeChild(self._overlay);
          self._overlay = null;
          if (self._onComplete) {
            const fn = self._onComplete;
            self._onComplete = null;
            fn();
          }
        }, 400));
      };

      const flyCards = () => {
        const center = packCenter();
        let landed = 0;
        ids.forEach((cardId, i) => {
          const tile = getTileByCardId(cardId);
          if (!tile) {
            landed++;
            if (landed === ids.length) finish();
            return;
          }
          const fly = document.createElement("div");
          fly.className = "flying-card";
          const img = document.createElement("img");
          img.src = getCardImageSrc(cardId) || "";
          img.alt = "";
          img.onerror = () => fly.classList.add("flying-card-placeholder");
          fly.appendChild(img);
          fly.style.left = center.x + "px";
          fly.style.top = center.y + "px";
          document.body.appendChild(fly);
          const flyRect = fly.getBoundingClientRect();
          const targetRect = tile.getBoundingClientRect();
          const startX = center.x - flyRect.width / 2;
          const startY = center.y - flyRect.height / 2;
          const endX = targetRect.left + (targetRect.width - flyRect.width) / 2;
          const endY = targetRect.top + (targetRect.height - flyRect.height) / 2;
          fly.style.left = startX + "px";
          fly.style.top = startY + "px";
          fly.style.transform = "scale(0.5)";
          requestAnimationFrame(() => {
            fly.classList.add("flying-card-fly");
            fly.style.setProperty("--fly-end-x", (endX - startX) + "px");
            fly.style.setProperty("--fly-end-y", (endY - startY) + "px");
          });
          const t = 600 + i * 120;
          self._timeouts.push(setTimeout(() => {
            fly.remove();
            tile.classList.add("pack-land-pulse");
            const glow = document.createElement("div");
            glow.className = "pack-land-glow";
            tile.appendChild(glow);
            setTimeout(() => glow.remove(), 600);
            setTimeout(() => tile.classList.remove("pack-land-pulse"), 400);
            landed++;
            if (landed === ids.length) finish();
          }, t));
        });
        if (ids.length === 0) finish();
      };

      this._timeouts.push(setTimeout(() => flyCards(), 1400));
    }
  }

  class LevelManager {
    constructor() {
      this.levels = [
        { id: 0, pieceCount: 10, cols: 2, rows: 5, imageSeed: 1 },
        { id: 1, pieceCount: 12, cols: 3, rows: 4, imageSeed: 2 },
        { id: 2, pieceCount: 10, cols: 2, rows: 5, imageSeed: 3 },
        { id: 3, pieceCount: 12, cols: 3, rows: 4, imageSeed: 4 },
        { id: 4, pieceCount: 10, cols: 2, rows: 5, imageSeed: 5 },
        { id: 5, pieceCount: 12, cols: 3, rows: 4, imageSeed: 6 },
        { id: 6, pieceCount: 10, cols: 2, rows: 5, imageSeed: 7 },
        { id: 7, pieceCount: 12, cols: 3, rows: 4, imageSeed: 8 },
        { id: 8, pieceCount: 10, cols: 2, rows: 5, imageSeed: 9 },
        { id: 9, pieceCount: 12, cols: 3, rows: 4, imageSeed: 10 },
        { id: 10, pieceCount: 10, cols: 2, rows: 5, imageSeed: 11 },
        { id: 11, pieceCount: 12, cols: 3, rows: 4, imageSeed: 12 },
        { id: 12, pieceCount: 10, cols: 2, rows: 5, imageSeed: 13 },
        { id: 13, pieceCount: 12, cols: 3, rows: 4, imageSeed: 14 },
        { id: 14, pieceCount: 10, cols: 2, rows: 5, imageSeed: 15 },
        { id: 15, pieceCount: 12, cols: 3, rows: 4, imageSeed: 16 },
        { id: 16, pieceCount: 10, cols: 2, rows: 5, imageSeed: 17 },
        { id: 17, pieceCount: 12, cols: 3, rows: 4, imageSeed: 18 },
        { id: 18, pieceCount: 10, cols: 2, rows: 5, imageSeed: 19 },
        { id: 19, pieceCount: 12, cols: 3, rows: 4, imageSeed: 20 },
        { id: 20, pieceCount: 10, cols: 2, rows: 5, imageSeed: 21 },
        { id: 21, pieceCount: 12, cols: 3, rows: 4, imageSeed: 22 },
        { id: 22, pieceCount: 10, cols: 2, rows: 5, imageSeed: 23 },
        { id: 23, pieceCount: 12, cols: 3, rows: 4, imageSeed: 24 },
        { id: 24, pieceCount: 10, cols: 2, rows: 5, imageSeed: 25 },
        { id: 25, pieceCount: 12, cols: 3, rows: 4, imageSeed: 26 },
        { id: 26, pieceCount: 10, cols: 2, rows: 5, imageSeed: 27 },
        { id: 27, pieceCount: 12, cols: 3, rows: 4, imageSeed: 28 },
        { id: 28, pieceCount: 10, cols: 2, rows: 5, imageSeed: 29 },
        { id: 29, pieceCount: 12, cols: 3, rows: 4, imageSeed: 30 },
      ];
    }

    getLevel(index) {
      return this.levels[index] || null;
    }

    getTotalLevels() {
      return this.levels.length;
    }
  }

  class PuzzleBoard {
    constructor(containerEl, onComplete) {
      this.container = containerEl;
      this.onComplete = onComplete;
      this.slots = [];
      this.placedCount = 0;
      this.totalPieces = 0;
      this.gridEl = null;
    }

    build(level) {
      this.container.innerHTML = "";
      this.placedCount = 0;
      this.totalPieces = level.pieceCount;
      const { cols, rows } = level;
      const pieceUrls = ImageGenerator.generatePieces(cols, rows, level.imageSeed);

      this.gridEl = document.createElement("div");
      this.gridEl.className = "board-grid";
      this.gridEl.style.display = "grid";
      this.gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      this.gridEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      const slotSize = Math.min(90, Math.floor(280 / Math.max(cols, rows)));
      this.gridEl.style.width = cols * slotSize + "px";
      this.gridEl.style.height = rows * slotSize + "px";

      this.slots = [];
      for (let i = 0; i < level.pieceCount; i++) {
        const slot = document.createElement("div");
        slot.className = "slot";
        slot.dataset.pieceId = String(i);
        slot.dataset.slotIndex = String(i);
        this.slots.push({
          el: slot,
          pieceId: i,
          filled: false,
          pieceUrl: pieceUrls[i],
        });
        this.gridEl.appendChild(slot);
      }
      this.container.appendChild(this.gridEl);
      return pieceUrls;
    }

    getSlotAtPoint(clientX, clientY) {
      for (const s of this.slots) {
        if (s.filled) continue;
        const rect = s.el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - cx, clientY - cy);
        if (dist <= SNAP_THRESHOLD) return s;
      }
      return null;
    }

    getSlotByPieceId(pieceId) {
      return this.slots.find((s) => s.pieceId === Number(pieceId));
    }

    placePiece(pieceId, pieceUrl, isCorrectSlot) {
      const slot = this.getSlotByPieceId(pieceId);
      if (!slot || slot.filled) return false;
      if (!isCorrectSlot) return false;

      slot.filled = true;
      const div = document.createElement("div");
      div.className = "piece-in-slot just-placed";
      div.style.backgroundImage = `url(${pieceUrl})`;
      div.dataset.pieceId = String(pieceId);
      slot.el.classList.add("filled");
      slot.el.appendChild(div);

      slot.el.style.position = "relative";
      for (let i = 0; i < 6; i++) {
        const sp = document.createElement("div");
        sp.className = "sparkle";
        const w = slot.el.offsetWidth || 60;
        const h = slot.el.offsetHeight || 60;
        sp.style.left = w / 2 + (Math.random() - 0.5) * w * 0.8 + "px";
        sp.style.top = h / 2 + (Math.random() - 0.5) * h * 0.8 + "px";
        slot.el.appendChild(sp);
        setTimeout(() => sp.remove(), 600);
      }

      setTimeout(() => div.classList.remove("just-placed"), 500);
      this.placedCount++;
      if (this.placedCount === this.totalPieces) this.onComplete();
      return true;
    }

    getPlacedCount() {
      return this.placedCount;
    }

    getTotalPieces() {
      return this.totalPieces;
    }
  }

  class PieceTray {
    constructor(containerEl, board, opts = {}) {
      this.container = containerEl;
      this.board = board;
      this.onPlace = opts.onPlace || (() => {});
      this.onWrongDrop = opts.onWrongDrop || (() => {});
      this.pieces = [];
      this.dragging = null;
      this.pointerId = null;
      this.offsetX = 0;
      this.offsetY = 0;
    }

    build(pieceUrls, pieceSize = 64) {
      this.container.innerHTML = "";
      this.pieces = pieceUrls.map((url, i) => {
        const el = document.createElement("div");
        el.className = "tray-piece";
        el.dataset.pieceId = String(i);
        el.style.width = pieceSize + "px";
        el.style.height = pieceSize + "px";
        el.style.backgroundImage = `url(${url})`;
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        this.container.appendChild(el);
        return { el, pieceId: i, url, placed: false };
      });
      this._bindPointerEvents();
    }

    _bindPointerEvents() {
      this.container.addEventListener("pointerdown", (e) => {
        const pieceEl = e.target.closest(".tray-piece");
        if (!pieceEl || e.button !== 0) return;
        const piece = this.pieces[Number(pieceEl.dataset.pieceId)];
        if (!piece || piece.placed) return;
        e.preventDefault();
        this._startDrag(piece, e);
      });

      document.addEventListener("pointermove", (e) => {
        if (this.dragging && e.pointerId === this.pointerId) this._moveDrag(e);
      });

      document.addEventListener("pointerup", (e) => {
        if (this.dragging && e.pointerId === this.pointerId) this._endDrag(e);
      });
      document.addEventListener("pointercancel", (e) => {
        if (this.dragging && e.pointerId === this.pointerId) this._cancelDrag();
      });
    }

    _startDrag(piece, e) {
      this.dragging = piece;
      this.pointerId = e.pointerId;
      const rect = piece.el.getBoundingClientRect();
      this.offsetX = e.clientX - rect.left;
      this.offsetY = e.clientY - rect.top;
      piece.el.classList.add("dragging");
      piece.el.setPointerCapture?.(e.pointerId);
    }

    _moveDrag(e) {
      if (!this.dragging) return;
      const el = this.dragging.el;
      el.style.position = "fixed";
      el.style.left = e.clientX - this.offsetX + "px";
      el.style.top = e.clientY - this.offsetY + "px";
      el.style.zIndex = "1000";
    }

    _endDrag(e) {
      if (!this.dragging) return;
      const piece = this.dragging;
      const slot = this.board.getSlotAtPoint(e.clientX, e.clientY);

      piece.el.classList.remove("dragging");
      piece.el.style.position = "";
      piece.el.style.left = "";
      piece.el.style.top = "";
      piece.el.style.zIndex = "";
      piece.el.releasePointerCapture?.(e.pointerId);

      if (slot && slot.pieceId === piece.pieceId) {
        const placed = this.board.placePiece(piece.pieceId, piece.url, true);
        if (placed) {
          piece.placed = true;
          piece.el.style.visibility = "hidden";
          piece.el.style.pointerEvents = "none";
          this.onPlace(piece.pieceId);
        }
      } else {
        this.onWrongDrop(piece.pieceId);
        piece.el.classList.add("wrong-drop");
        setTimeout(() => piece.el.classList.remove("wrong-drop"), 500);
      }
      this.dragging = null;
      this.pointerId = null;
    }

    _cancelDrag() {
      if (this.dragging) {
        this.dragging.el.classList.remove("dragging");
        this.dragging.el.style.position = "";
        this.dragging.el.style.left = "";
        this.dragging.el.style.top = "";
        this.dragging.el.style.zIndex = "";
        this.dragging = null;
        this.pointerId = null;
      }
    }

    cancelDrag() {
      this._cancelDrag();
    }
  }

  class UI {
    constructor() {
      this.levelNumberEl = document.getElementById("level-number");
      this.coinsCountEl = document.getElementById("coins-count");
      this.progressTextEl = document.getElementById("progress-text");
      this.winModal = document.getElementById("win-modal");
      this.winStars = document.getElementById("win-stars");
      this.winStats = document.getElementById("win-stats");
      this.settingsModal = document.getElementById("settings-modal");
    }

    showScreen(id) {
      document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
      const el = document.getElementById(id);
      if (el) el.classList.add("active");
      const stripStart = document.getElementById("status-strip-start");
      const stripGame = document.getElementById("status-strip-game");
      if (stripStart) stripStart.classList.add("hidden");
      if (stripGame) stripGame.classList.add("hidden");
      if (id === "start-screen" && stripStart) stripStart.classList.remove("hidden");
      if (id === "game-screen" && stripGame) stripGame.classList.remove("hidden");
      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
      const navMap = { "start-screen": "nav-home", "game-screen": "nav-game", "album-screen": "nav-collection" };
      const navId = navMap[id];
      if (navId) {
        const navEl = document.getElementById(navId);
        if (navEl) navEl.classList.add("active");
      }
      if (window.gameApp && typeof window.gameApp._updateCheatAutoButton === "function") {
        window.gameApp._updateCheatAutoButton();
      }
      if (id !== "game-screen" && window.gameApp && typeof window.gameApp._clearBattlePassTokenTimer === "function") {
        window.gameApp._clearBattlePassTokenTimer();
      }
      if (window.gameApp && typeof window.gameApp.updateBattlePassWidget === "function") {
        window.gameApp.updateBattlePassWidget();
      }
      if (id === "start-screen" && window.gameApp && window.gameApp.collectionUI && typeof window.gameApp.collectionUI.updateGlobalCardsProgress === "function") {
        window.gameApp.collectionUI.updateGlobalCardsProgress();
      }
    }

    setLevelNumber(n) {
      if (this.levelNumberEl) this.levelNumberEl.textContent = n + 1;
    }

    setCoins(n) {
      if (this.coinsCountEl) this.coinsCountEl.textContent = n;
    }

    setProgress(placed, total) {
      if (this.progressTextEl) this.progressTextEl.textContent = `Pieces placed ${placed} / ${total}`;
    }

    showWinModal(stars, timeSec, mistakes, onNext, onReplay) {
      this.winModal.classList.remove("hidden");
      this.winStars.querySelectorAll(".star").forEach((s, i) => {
        s.classList.toggle("earned", i < stars);
      });
      this.winStats.textContent = `Time: ${timeSec}s • Mistakes: ${mistakes}`;
      document.getElementById("btn-next-level").onclick = onNext;
      document.getElementById("btn-replay").onclick = onReplay;
    }

    hideWinModal() {
      this.winModal.classList.add("hidden");
    }

    showSettingsModal() {
      this.settingsModal.classList.remove("hidden");
    }

    hideSettingsModal() {
      this.settingsModal.classList.add("hidden");
    }
  }

  const AudioPlayer = {
    ctx: null,
    init() {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },
    beep(freq, duration, type) {
      if (!this.ctx) this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.frequency.value = freq;
      osc.type = type || "sine";
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + duration);
    },
    place() {
      this.beep(523, 0.1, "sine");
      setTimeout(() => this.beep(659, 0.1, "sine"), 80);
    },
    wrong() {
      this.beep(200, 0.15, "sawtooth");
      setTimeout(() => this.beep(180, 0.15, "sawtooth"), 100);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => this.beep(f, 0.12, "sine"), i * 80);
      });
    },
  };

  class GameApp {
    constructor() {
      window.gameApp = this;
      this._save = loadSave();
      this.levelManager = new LevelManager();
      this.collectionManager = new CollectionManager(this._save, () => saveSave(this._save));
      this._migrateCollectionState();
      this.ui = new UI();
      this.board = new PuzzleBoard(
        document.getElementById("puzzle-board"),
        () => this.handlePuzzleComplete()
      );
      this.pieceTray = new PieceTray(
        document.getElementById("piece-tray"),
        this.board,
        {
          onPlace: (pieceId) => this.onPiecePlaced(pieceId),
          onWrongDrop: () => this.onWrongDrop(),
        }
      );
      this.collectionUI = new CollectionUI(this.collectionManager, this);
      this.currentLevelIndex = this._save.currentLevel;
      this.startTime = 0;
      this.mistakes = 0;
      this._cheatPlaceAnimating = false;
      this._pendingBattlePassUnlockAfterWin = false;
      this._pendingWheelUnlockAfterWin = false;
      this._battlePassTokenTimer = null;
      this._applySaveToUI();
      this._bindGlobalButtons();
      this.collectionUI.updateCollectionButtons();
      this.ui.showScreen("start-screen");
    }

    _migrateCollectionState() {
      const level = this._save.currentLevel;
      const tutorialDone = this._save.collectionTutorialCompleted === true;
      if (level < LEVEL_5_INDEX) {
        if (this._save.collectionUnlocked || tutorialDone || (this._save.cards.newInbox && this._save.cards.newInbox.length > 0) || (this._save.cards.collected && Object.keys(this._save.cards.collected).length > 0)) {
          this._save.collectionUnlocked = false;
          this._save.collectionTutorialCompleted = false;
          this.collectionManager.resetCollectionState();
          saveSave(this._save);
        }
        return;
      }
      if (level > LEVEL_5_INDEX && !tutorialDone) {
        this._save.collectionUnlocked = true;
        this.collectionManager.resetCollectionState();
        this.collectionManager.grantGiftCards();
        this._save.collectionTutorialCompleted = true;
        saveSave(this._save);
      }
    }

    _applySaveToUI() {
      this.ui.setLevelNumber(this.currentLevelIndex);
      this.ui.setCoins(this._save.coins);
      const music = this._save.musicOn !== "false";
      const sfx = this._save.sfxOn !== "false";
      document.getElementById("toggle-music").setAttribute("aria-checked", music);
      document.getElementById("toggle-sfx").setAttribute("aria-checked", sfx);
      const trophies = (this._save.rewards && this._save.rewards.trophies) || 0;
      const trophiesEl = document.getElementById("settings-trophies-count");
      if (trophiesEl) trophiesEl.textContent = trophies;
      const navTrophies = document.getElementById("nav-trophies-count");
      if (navTrophies) navTrophies.textContent = trophies;
      const goldCupRow = document.getElementById("settings-gold-cup-row");
      if (goldCupRow) goldCupRow.classList.toggle("hidden", !(this._save.rewards && this._save.rewards.trophiesGoldCup));
      if (window.gameApp && window.gameApp.collectionUI && typeof window.gameApp.collectionUI.updateGlobalCardsProgress === "function") {
        window.gameApp.collectionUI.updateGlobalCardsProgress();
      }
      if (localStorage.getItem(STORAGE_KEYS.devCheatsEnabled) === "true") {
        const debugPanel = document.getElementById("debug-cheat-panel");
        if (debugPanel) debugPanel.classList.remove("hidden");
        const autoBtn = document.getElementById("btn-cheat-auto");
        if (autoBtn) autoBtn.classList.remove("hidden");
      } else {
        const autoBtn = document.getElementById("btn-cheat-auto");
        if (autoBtn) autoBtn.classList.add("hidden");
      }
      if (window.gameApp && typeof window.gameApp._updateCheatAutoButton === "function") {
        window.gameApp._updateCheatAutoButton();
      }
      this.updateWheelWidget();
    }

    _saveState() {
      this._save.currentLevel = this.currentLevelIndex;
      this._save.coins = this.getCoins();
      this._save.musicOn = document.getElementById("toggle-music").getAttribute("aria-checked");
      this._save.sfxOn = document.getElementById("toggle-sfx").getAttribute("aria-checked");
      if (this._save.rewards) {
        const trophiesEl = document.getElementById("settings-trophies-count");
        if (trophiesEl) this._save.rewards.trophies = parseInt(trophiesEl.textContent, 10) || 0;
      }
      saveSave(this._save);
    }

    getCoins() {
      const el = document.getElementById("coins-count");
      return el ? parseInt(el.textContent, 10) || 0 : DEFAULT_COINS;
    }

    _updateCheatAutoButton() {
      const btn = document.getElementById("btn-cheat-auto");
      if (!btn || btn.classList.contains("hidden")) return;
      const gameActive = document.getElementById("game-screen").classList.contains("active");
      const winOpen = !document.getElementById("win-modal").classList.contains("hidden");
      const disabled = !gameActive || winOpen;
      btn.disabled = disabled;
      btn.classList.toggle("cheat-auto-disabled", disabled);
    }

    cheatPlaceOnePiece() {
      const gameScreen = document.getElementById("game-screen");
      const winModal = document.getElementById("win-modal");
      if (!gameScreen || !gameScreen.classList.contains("active")) return;
      if (!winModal || !winModal.classList.contains("hidden")) return;
      if (this._cheatPlaceAnimating) return;
      this.pieceTray.cancelDrag();
      const piece = this.pieceTray.pieces.find((p) => !p.placed);
      if (!piece) return;
      const slot = this.board.getSlotByPieceId(piece.pieceId);
      if (!slot || slot.filled) return;

      this._cheatPlaceAnimating = true;
      const doPlace = () => {
        this._cheatPlaceAnimating = false;
        const placed = this.board.placePiece(piece.pieceId, piece.url, true);
        if (!placed) return;
        piece.placed = true;
        piece.el.style.visibility = "hidden";
        piece.el.style.pointerEvents = "none";
        this.onPiecePlaced(piece.pieceId);
      };

      const trayRect = piece.el.getBoundingClientRect();
      const slotRect = slot.el.getBoundingClientRect();
      const w = trayRect.width;
      const h = trayRect.height;
      const endX = slotRect.left + (slotRect.width - w) / 2;
      const endY = slotRect.top + (slotRect.height - h) / 2;

      const clone = document.createElement("div");
      clone.className = "cheat-fly-piece";
      clone.style.width = w + "px";
      clone.style.height = h + "px";
      clone.style.left = trayRect.left + "px";
      clone.style.top = trayRect.top + "px";
      clone.style.backgroundImage = "url(" + piece.url + ")";
      document.body.appendChild(clone);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          clone.style.left = endX + "px";
          clone.style.top = endY + "px";
        });
      });
      clone.addEventListener("transitionend", () => {
        clone.remove();
        doPlace();
      }, { once: true });
      setTimeout(() => {
        if (clone.parentNode) {
          clone.remove();
          doPlace();
        }
      }, 400);
    }

    startGame() {
      this.ui.showScreen("game-screen");
      this.loadLevel(this.currentLevelIndex);
    }

    loadLevel(index) {
      const level = this.levelManager.getLevel(index);
      if (!level) return;
      this.currentLevelIndex = index;
      this.startTime = Date.now();
      this.mistakes = 0;
      this._saveState();

      this._clearBattlePassTokenTimer();

      const pieceUrls = this.board.build(level);
      this.pieceTray.build(pieceUrls, 64);

      this.ui.setLevelNumber(index);
      this.ui.setProgress(0, level.pieceCount);
      this.ui.setCoins(this.getCoins());
      this.collectionUI.updateCollectionButtons();

      if (this._save.battlePassUnlocked) {
        this._startBattlePassTokenSpawning();
      }
    }

    onPiecePlaced(pieceId) {
      this.ui.setProgress(this.board.getPlacedCount(), this.board.getTotalPieces());
      if (document.getElementById("toggle-sfx").getAttribute("aria-checked") === "true") {
        AudioPlayer.place();
      }
    }

    onWrongDrop() {
      this.mistakes++;
      if (document.getElementById("toggle-sfx").getAttribute("aria-checked") === "true") {
        AudioPlayer.wrong();
      }
    }

    completeLevel(opts) {
      opts = opts || {};
      const winModal = document.getElementById("win-modal");
      if (!winModal.classList.contains("hidden")) return;
      this.pieceTray.cancelDrag();
      const cheated = opts.cheated === true;
      const timeSec = cheated ? 0 : Math.round((Date.now() - this.startTime) / 1000);
      const mistakes = cheated ? 0 : this.mistakes;
      const stars = cheated ? 3 : this._computeStars(timeSec, this.mistakes);

      const result = this.collectionManager.onLevelCompleted(this.currentLevelIndex, { cheated });
      if (result.unlockedNow) {
        this._pendingUnlockAfterWin = true;
      }
      if (this.currentLevelIndex === LEVEL_6_INDEX) {
        this._save.battlePassUnlocked = true;
        const now = Date.now();
        this._save.battlePassEvent = { startAt: now, endAt: now + EVENT_DURATION_MS };
        this._pendingBattlePassUnlockAfterWin = true;
        saveSave(this._save);
      }
      if (this.currentLevelIndex === LEVEL_8_INDEX) {
        this._save.wheelUnlocked = true;
        this._pendingWheelUnlockAfterWin = true;
        saveSave(this._save);
      }
      this.collectionUI.updateCollectionButtons();

      if (document.getElementById("toggle-sfx").getAttribute("aria-checked") === "true") {
        AudioPlayer.win();
      }
      this.ui.showWinModal(
        stars,
        timeSec,
        mistakes,
        () => this._onNextLevelClick(),
        () => this.replayLevel()
      );
      this._updateCheatAutoButton();
    }

    _onNextLevelClick() {
      if (this._pendingBattlePassUnlockAfterWin) {
        this._pendingBattlePassUnlockAfterWin = false;
        this.ui.hideWinModal();
        this._showBattlePassUnlockPopup(() => this.nextLevel());
        return;
      }
      if (this._pendingWheelUnlockAfterWin) {
        this._pendingWheelUnlockAfterWin = false;
        this.ui.hideWinModal();
        this._showWheelUnlockTutorial(() => this.nextLevel());
        return;
      }
      if (this.currentLevelIndex === LEVEL_5_INDEX && this._pendingUnlockAfterWin) {
        this._pendingUnlockAfterWin = false;
        this.ui.hideWinModal();
        this.collectionUI.showUnlockFlow(() => {
          const nextIndex = LEVEL_5_INDEX + 1;
          this.currentLevelIndex = nextIndex >= this.levelManager.getTotalLevels() ? 0 : nextIndex;
          this.ui.showScreen("game-screen");
          this.loadLevel(this.currentLevelIndex);
        });
        return;
      }
      this.nextLevel();
    }

    handlePuzzleComplete() {
      this.completeLevel({ cheated: false });
    }

    skipLevelCheat() {
      const gameScreen = document.getElementById("game-screen");
      const winModal = document.getElementById("win-modal");
      const settingsModal = document.getElementById("settings-modal");
      const activeTag = document.activeElement ? document.activeElement.tagName : "";
      if (!gameScreen.classList.contains("active")) return;
      if (!winModal.classList.contains("hidden")) return;
      if (!settingsModal.classList.contains("hidden")) return;
      if (["INPUT", "TEXTAREA", "SELECT"].indexOf(activeTag) >= 0) return;
      this.pieceTray.cancelDrag();
      this.completeLevel({ cheated: true });
    }

    _computeStars(timeSec, mistakes) {
      const level = this.levelManager.getLevel(this.currentLevelIndex);
      const total = level ? level.pieceCount : 10;
      const fastTime = timeSec <= total * 5;
      const okTime = timeSec <= total * 10;
      const fewMistakes = mistakes <= 2;
      const noMistakes = mistakes === 0;
      if (noMistakes && fastTime) return 3;
      if (fewMistakes && (fastTime || okTime)) return 2;
      return 1;
    }

    nextLevel() {
      this.ui.hideWinModal();
      this._updateCheatAutoButton();
      const next = this.currentLevelIndex + 1;
      if (next >= this.levelManager.getTotalLevels()) {
        this.currentLevelIndex = 0;
        this.loadLevel(0);
      } else {
        this.currentLevelIndex = next;
        this.loadLevel(next);
      }
    }

    replayLevel() {
      this.ui.hideWinModal();
      this._updateCheatAutoButton();
      this.loadLevel(this.currentLevelIndex);
    }

    _bindGlobalButtons() {
      document.getElementById("btn-play").onclick = () => this.startGame();
      document.getElementById("btn-back").onclick = () => this.ui.showScreen("start-screen");
      document.getElementById("btn-close-settings").onclick = () => {
        this.ui.hideSettingsModal();
        this._saveState();
      };
      document.getElementById("toggle-music").onclick = () => this._toggle("toggle-music");
      document.getElementById("toggle-sfx").onclick = () => this._toggle("toggle-sfx");
      document.getElementById("btn-reset-progress").onclick = () => this.resetProgress();
      document.getElementById("btn-cheat-open-all-albums").onclick = () => this.cheatOpenAllAlbums();

      document.getElementById("nav-home").onclick = () => this.ui.showScreen("start-screen");
      document.getElementById("nav-game").onclick = () => this.startGame();
      document.getElementById("nav-settings").onclick = () => this.openSettings();
      document.getElementById("nav-trophies").onclick = () => this.openSettings();
      const openCollection = () => {
        if (!this.collectionManager.isAvailable()) {
          this.collectionUI.showToastUnlocksAfterLevel5();
          return;
        }
        if (!isEventActive(this._save, "albumEvent")) {
          this._showToastEventEnded();
          return;
        }
        this.collectionUI.showAlbum();
      };
      document.getElementById("nav-collection").onclick = openCollection;

      const openBattlePass = () => {
        if (!this._save.battlePassUnlocked) {
          this._showToastBattlePassLocked();
          return;
        }
        this.openBattlePassScreen();
      };
      document.getElementById("nav-battle-pass").onclick = openBattlePass;
      const bpWidget = document.getElementById("btn-battle-pass-widget");
      if (bpWidget) bpWidget.onclick = openBattlePass;
      const bpWidgetGame = document.getElementById("btn-battle-pass-widget-game");
      if (bpWidgetGame) bpWidgetGame.onclick = openBattlePass;

      const openWheel = () => {
        if (!this._save.wheelUnlocked) return;
        this.openWheelScreen();
      };
      const btnWheel = document.getElementById("btn-wheel-widget");
      if (btnWheel) btnWheel.onclick = openWheel;
      const btnWheelGame = document.getElementById("btn-wheel-widget-game");
      if (btnWheelGame) btnWheelGame.onclick = openWheel;

      const autoBtn = document.getElementById("btn-cheat-auto");
      if (autoBtn) autoBtn.onclick = () => this.cheatPlaceOnePiece();

      document.addEventListener("keydown", (e) => {
        if (e.key !== "N" || !e.shiftKey) return;
        const gameScreen = document.getElementById("game-screen");
        const winModal = document.getElementById("win-modal");
        const activeTag = document.activeElement ? document.activeElement.tagName : "";
        if (!gameScreen.classList.contains("active")) return;
        if (!winModal.classList.contains("hidden")) return;
        if (["INPUT", "TEXTAREA", "SELECT"].indexOf(activeTag) >= 0) return;
        e.preventDefault();
        this.skipLevelCheat();
      });

      let coinsTapCount = 0;
      let coinsTapTimer = null;
      document.getElementById("coins-display").addEventListener("pointerdown", () => {
        if (document.getElementById("game-screen").classList.contains("active")) {
          coinsTapCount++;
          if (coinsTapTimer) clearTimeout(coinsTapTimer);
          if (coinsTapCount >= COINS_TAP_COUNT) {
            coinsTapCount = 0;
            try {
              localStorage.setItem(STORAGE_KEYS.devCheatsEnabled, "true");
            } catch (_) {}
            document.getElementById("debug-cheat-panel").classList.remove("hidden");
            const autoBtn = document.getElementById("btn-cheat-auto");
            if (autoBtn) autoBtn.classList.remove("hidden");
          } else {
            coinsTapTimer = setTimeout(() => { coinsTapCount = 0; coinsTapTimer = null; }, COINS_TAP_WINDOW_MS);
          }
        }
      });

      const skipBtn = document.getElementById("btn-skip-level");
      let longPressTimer = null;
      let longPressHandled = false;
      skipBtn.addEventListener("pointerdown", (e) => {
        longPressHandled = false;
        longPressTimer = setTimeout(() => {
          longPressHandled = true;
          try { localStorage.removeItem(STORAGE_KEYS.devCheatsEnabled); } catch (_) {}
          document.getElementById("debug-cheat-panel").classList.add("hidden");
          const autoBtn = document.getElementById("btn-cheat-auto");
          if (autoBtn) autoBtn.classList.add("hidden");
        }, LONG_PRESS_MS);
      });
      skipBtn.addEventListener("pointerup", () => {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        if (!longPressHandled) this.skipLevelCheat();
      });
      skipBtn.addEventListener("pointercancel", () => {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
      });
      skipBtn.addEventListener("click", (e) => e.preventDefault());
    }

    _toggle(id) {
      const btn = document.getElementById(id);
      const current = btn.getAttribute("aria-checked") === "true";
      btn.setAttribute("aria-checked", !current);
      this._saveState();
    }

    openSettings() {
      this.ui.showSettingsModal();
      const trophies = (this.collectionManager.getState().rewards && this.collectionManager.getState().rewards.trophies) || 0;
      const el = document.getElementById("settings-trophies-count");
      if (el) el.textContent = trophies;
    }

    updateBattlePassWidget() {
      const unlocked = this._save.battlePassUnlocked === true && isEventActive(this._save, "battlePassEvent");
      const bpStarsTotal = Math.max(0, parseInt(this._save.bpStarsTotal, 10) || 0);
      const towardNext = bpStarsTotal % BP_STARS_PER_CARD;
      const progressText = towardNext + "/" + BP_STARS_PER_CARD;
      const fillPct = (towardNext / BP_STARS_PER_CARD) * 100;
      const widgetHome = document.getElementById("battle-pass-widget");
      const widgetGame = document.getElementById("battle-pass-widget-game");
      if (widgetHome) {
        if (unlocked) widgetHome.classList.remove("hidden");
        else widgetHome.classList.add("hidden");
      }
      const countHome = document.getElementById("battle-pass-widget-count");
      if (countHome) countHome.textContent = progressText;
      const fillHome = document.getElementById("battle-pass-widget-fill");
      if (fillHome) fillHome.style.width = fillPct + "%";
      const progressHome = widgetHome ? widgetHome.querySelector(".battle-pass-widget-progress") : null;
      if (progressHome) progressHome.setAttribute("aria-valuenow", towardNext);
      if (widgetGame) {
        if (unlocked) widgetGame.classList.remove("hidden");
        else widgetGame.classList.add("hidden");
      }
      const countGame = document.getElementById("battle-pass-widget-count-game");
      if (countGame) countGame.textContent = progressText;
      const fillGame = document.getElementById("battle-pass-widget-fill-game");
      if (fillGame) fillGame.style.width = fillPct + "%";
      const progressGame = widgetGame ? widgetGame.querySelector(".battle-pass-widget-progress") : null;
      if (progressGame) progressGame.setAttribute("aria-valuenow", towardNext);
      const navBp = document.getElementById("nav-battle-pass");
      if (navBp) {
        navBp.classList.toggle("locked", !unlocked);
        navBp.setAttribute("aria-label", unlocked ? "Battle Pass" : "Battle Pass (Unlocks at Level 6)");
        const navCount = document.getElementById("nav-battle-pass-count");
        if (navCount) navCount.textContent = unlocked ? progressText : "—";
      }
    }

    _showBattlePassUnlockPopup(onAfter) {
      const modal = document.getElementById("battle-pass-unlock-modal");
      if (!modal) {
        if (onAfter) onAfter();
        return;
      }
      modal.classList.remove("hidden");
      const go = () => {
        modal.classList.add("hidden");
        document.getElementById("btn-battle-pass-lets-go").onclick = null;
        modal.onclick = null;
        this.updateBattlePassWidget();
        this.openBattlePassScreen();
        if (onAfter) onAfter();
      };
      document.getElementById("btn-battle-pass-lets-go").onclick = go;
      modal.onclick = (e) => { if (e.target === modal) go(); };
    }

    openBattlePassScreen() {
      if (!this._save.battlePassUnlocked) {
        this._showToastBattlePassLocked();
        return;
      }
      if (!isEventActive(this._save, "battlePassEvent")) {
        this._showToastEventEnded();
        return;
      }
      const modal = document.getElementById("battle-pass-modal");
      if (!modal) return;
      const bpStarsTotal = Math.max(0, parseInt(this._save.bpStarsTotal, 10) || 0);
      const towardNext = bpStarsTotal % BP_STARS_PER_CARD;
      const countEl = document.getElementById("battle-pass-modal-count");
      if (countEl) countEl.textContent = bpStarsTotal;
      const towardEl = document.getElementById("battle-pass-modal-toward");
      if (towardEl) towardEl.textContent = towardNext + "/" + BP_STARS_PER_CARD + " toward next card";
      const fillEl = document.getElementById("battle-pass-modal-fill");
      if (fillEl) fillEl.style.width = (towardNext / BP_STARS_PER_CARD) * 100 + "%";
      const listEl = document.getElementById("battle-pass-reward-list");
      if (listEl) {
        const tiers = 5;
        listEl.innerHTML = "";
        for (let t = 1; t <= tiers; t++) {
          const threshold = t * BP_STARS_PER_CARD;
          const claimed = bpStarsTotal >= threshold;
          const row = document.createElement("div");
          row.className = "battle-pass-reward-row" + (claimed ? " claimed" : "");
          row.innerHTML = "<span class=\"battle-pass-reward-tier\">" + threshold + " stars</span><span class=\"battle-pass-reward-item\">" + (claimed ? "✓ x1 Album Card" : "x1 Album Card") + "</span>";
          listEl.appendChild(row);
        }
      }
      const bpTimerEl = document.getElementById("battle-pass-event-timer");
      if (bpTimerEl) {
        const tick = () => {
          const ms = getRemainingMs(this._save, "battlePassEvent");
          bpTimerEl.textContent = ms > 0 ? "Event ends in: " + formatRemaining(ms) : "Event ended";
        };
        tick();
        if (this._bpEventTimerId) clearInterval(this._bpEventTimerId);
        this._bpEventTimerId = setInterval(tick, 1000);
      }
      modal.classList.remove("hidden");
      const close = () => {
        modal.classList.add("hidden");
        if (this._bpEventTimerId) {
          clearInterval(this._bpEventTimerId);
          this._bpEventTimerId = null;
        }
        document.getElementById("btn-battle-pass-close").onclick = null;
        modal.onclick = null;
      };
      document.getElementById("btn-battle-pass-close").onclick = close;
      modal.onclick = (e) => { if (e.target === modal) close(); };
    }

    updateWheelWidget() {
      const unlocked = this._save.wheelUnlocked === true;
      const now = Date.now();
      const nextFree = Math.max(0, parseInt(this._save.wheelNextFreeAt, 10) || 0);
      const freeAvailable = now >= nextFree;
      const widgetHome = document.getElementById("wheel-widget");
      const widgetGame = document.getElementById("wheel-widget-game");
      if (widgetHome) {
        if (unlocked) widgetHome.classList.remove("hidden");
        else widgetHome.classList.add("hidden");
      }
      if (widgetGame) {
        if (unlocked) widgetGame.classList.remove("hidden");
        else widgetGame.classList.add("hidden");
      }
      const badgeHome = document.getElementById("wheel-badge");
      const badgeGame = document.getElementById("wheel-badge-game");
      if (badgeHome) badgeHome.classList.toggle("hidden", !freeAvailable);
      if (badgeGame) badgeGame.classList.toggle("hidden", !freeAvailable);
    }

    _showWheelUnlockTutorial(onAfter) {
      const overlay = document.getElementById("wheel-tutorial-overlay");
      if (!overlay) {
        if (onAfter) onAfter();
        return;
      }
      this._save.wheelTutorialSeen = true;
      saveSave(this._save);
      this.updateWheelWidget();
      overlay.classList.remove("hidden");
      const dismiss = () => {
        overlay.classList.add("hidden");
        document.getElementById("btn-wheel-tutorial-ok").onclick = null;
        overlay.onclick = null;
        this.openWheelScreen();
        if (onAfter) onAfter();
      };
      document.getElementById("btn-wheel-tutorial-ok").onclick = dismiss;
      overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
    }

    openWheelScreen() {
      if (!this._save.wheelUnlocked) return;
      const modal = document.getElementById("wheel-modal");
      if (!modal) return;
      const now = Date.now();
      const nextFree = Math.max(0, parseInt(this._save.wheelNextFreeAt, 10) || 0);
      const freeAvailable = now >= nextFree;
      const pool = this.collectionManager.getWheelSegmentPool();
      const rotatable = document.getElementById("wheel-rotatable");
      const segmentsEl = document.getElementById("wheel-segments");
      if (segmentsEl && pool.length === WHEEL_SEGMENTS) {
        segmentsEl.innerHTML = "";
        const segmentAngle = 360 / WHEEL_SEGMENTS;
        for (let i = 0; i < WHEEL_SEGMENTS; i++) {
          const seg = document.createElement("div");
          seg.className = "wheel-segment";
          seg.style.transform = "rotate(" + (i * segmentAngle) + "deg)";
          const inner = document.createElement("div");
          inner.className = "wheel-segment-inner";
          inner.textContent = "🃏";
          seg.appendChild(inner);
          segmentsEl.appendChild(seg);
        }
      }
      if (rotatable) rotatable.style.transition = "none";
      if (rotatable) rotatable.style.transform = "rotate(0deg)";
      const spinBtn = document.getElementById("btn-wheel-spin");
      const timerEl = document.getElementById("wheel-timer");
      const timerValue = document.getElementById("wheel-timer-value");
      if (freeAvailable) {
        if (spinBtn) {
          spinBtn.textContent = "FREE";
          spinBtn.disabled = false;
          spinBtn.classList.remove("hidden");
        }
        if (timerEl) timerEl.classList.add("hidden");
      } else {
        if (spinBtn) {
          spinBtn.disabled = true;
          spinBtn.textContent = "SPIN";
        }
        if (timerEl) timerEl.classList.remove("hidden");
        const updateTimer = () => {
          const remain = Math.max(0, nextFree - Date.now());
          if (remain <= 0) {
            if (timerValue) timerValue.textContent = "00:00:00";
            spinBtn.disabled = false;
            spinBtn.textContent = "FREE";
            timerEl.classList.add("hidden");
            if (this._wheelTimerId) clearInterval(this._wheelTimerId);
            this._wheelTimerId = null;
            return;
          }
          const h = Math.floor(remain / 3600000);
          const m = Math.floor((remain % 3600000) / 60000);
          const s = Math.floor((remain % 60000) / 1000);
          if (timerValue) timerValue.textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        };
        updateTimer();
        if (this._wheelTimerId) clearInterval(this._wheelTimerId);
        this._wheelTimerId = setInterval(updateTimer, 1000);
      }
      const spinCheatBtn = document.getElementById("btn-wheel-spin-cheat");
      const doSpin = (useCooldown) => {
        if (spinBtn) spinBtn.disabled = true;
        if (spinCheatBtn) spinCheatBtn.disabled = true;
        if (spinBtn) spinBtn.onclick = null;
        if (spinCheatBtn) spinCheatBtn.onclick = null;
        const wonIndex = Math.floor(Math.random() * WHEEL_SEGMENTS);
        const cardId = pool[wonIndex];
        const segmentAngle = 360 / WHEEL_SEGMENTS;
        const fullTurns = 360 * 4;
        const finalDeg = fullTurns - wonIndex * segmentAngle;
        if (rotatable) {
          rotatable.style.transition = "transform " + (WHEEL_SPIN_DURATION_MS / 1000) + "s cubic-bezier(0.2, 0.8, 0.2, 1)";
          rotatable.style.transform = "rotate(" + finalDeg + "deg)";
        }
        setTimeout(() => {
          const pointerEl = document.querySelector(".wheel-pointer");
          if (pointerEl) {
            pointerEl.classList.add("wheel-pointer-glow");
            setTimeout(() => pointerEl.classList.remove("wheel-pointer-glow"), 600);
          }
          this.collectionManager.awardCardFromWheel(cardId);
          if (useCooldown) {
            this._save.wheelNextFreeAt = Date.now() + WHEEL_FREE_COOLDOWN_MS;
          }
          saveSave(this._save);
          this.updateWheelWidget();
          this.collectionUI.updateCollectionButtons();
          this.collectionUI.updateGlobalCardsProgress();
          close();
          const rewardModal = document.getElementById("wheel-reward-modal");
          const cardBack = document.getElementById("wheel-reward-card-back");
          if (cardBack) cardBack.textContent = "🃏";
          if (rewardModal) rewardModal.classList.remove("hidden");
          const onAwesome = () => {
            if (rewardModal) rewardModal.classList.add("hidden");
            document.getElementById("btn-wheel-reward-ok").onclick = null;
            rewardModal.onclick = null;
          };
          document.getElementById("btn-wheel-reward-ok").onclick = onAwesome;
          rewardModal.onclick = (e) => { if (e.target === rewardModal) onAwesome(); };
        }, WHEEL_SPIN_DURATION_MS + 200);
      };

      const close = () => {
        modal.classList.add("hidden");
        if (this._wheelTimerId) clearInterval(this._wheelTimerId);
        this._wheelTimerId = null;
        document.getElementById("btn-wheel-close").onclick = null;
        if (spinBtn) spinBtn.onclick = null;
        if (spinCheatBtn) spinCheatBtn.onclick = null;
        modal.onclick = null;
      };
      document.getElementById("btn-wheel-close").onclick = close;
      modal.onclick = (e) => { if (e.target === modal) close(); };

      modal.classList.remove("hidden");

      if (spinBtn && freeAvailable) {
        spinBtn.onclick = () => doSpin(true);
      }
      if (spinCheatBtn) {
        spinCheatBtn.onclick = () => doSpin(false);
      }
    }

    _showToastBattlePassLocked() {
      const el = document.getElementById("toast-battle-pass-locked");
      if (!el) return;
      el.classList.remove("hidden");
      clearTimeout(this._toastBattlePassLockedTimer);
      this._toastBattlePassLockedTimer = setTimeout(() => el.classList.add("hidden"), 2500);
    }

    _showToastEventEnded() {
      const el = document.getElementById("toast-event-ended");
      if (!el) return;
      el.classList.remove("hidden");
      clearTimeout(this._toastEventEndedTimer);
      this._toastEventEndedTimer = setTimeout(() => el.classList.add("hidden"), 2500);
    }

    _clearBattlePassTokenTimer() {
      if (this._battlePassTokenTimer) {
        clearInterval(this._battlePassTokenTimer);
        this._battlePassTokenTimer = null;
      }
      document.querySelectorAll(".star-token").forEach((el) => el.remove());
    }

    _startBattlePassTokenSpawning() {
      if (!this._save.battlePassUnlocked) return;
      if (!isEventActive(this._save, "battlePassEvent")) return;
      const boardContainer = document.getElementById("puzzle-board");
      if (!boardContainer || !boardContainer.parentElement) return;
      const container = boardContainer.parentElement;
      const spawn = () => {
        if (!isEventActive(this._save, "battlePassEvent")) return;
        const gameScreen = document.getElementById("game-screen");
        const winModal = document.getElementById("win-modal");
        if (!gameScreen || !gameScreen.classList.contains("active")) return;
        if (!winModal || !winModal.classList.contains("hidden")) return;
        const rect = container.getBoundingClientRect();
        const padding = 24;
        const x = rect.left + padding + Math.random() * (rect.width - padding * 2 - 36);
        const y = rect.top + padding + Math.random() * (rect.height - padding * 2 - 36);
        const token = document.createElement("div");
        token.className = "star-token";
        token.innerHTML = "⭐";
        token.style.left = (x - rect.left) + "px";
        token.style.top = (y - rect.top) + "px";
        token.style.position = "absolute";
        container.style.position = "relative";
        container.appendChild(token);
        const autoRemoveTimer = setTimeout(() => {
          if (token.parentNode) token.remove();
        }, BATTLE_PASS_TOKEN_LIFETIME_MS);
        token.onclick = (e) => {
          e.stopPropagation();
          clearTimeout(autoRemoveTimer);
          token.remove();
          this._save.bpStarsTotal = (this._save.bpStarsTotal || 0) + 1;
          saveSave(this._save);
          this.updateBattlePassWidget();
          if (this._save.bpStarsTotal % BP_STARS_PER_CARD === 0) {
            if (isEventActive(this._save, "albumEvent")) {
              const award = this.collectionManager.awardCardFromBattlePass();
              if (award && award.cardId) {
                this.collectionUI.showToastCardEarned();
                this.collectionUI.updateCollectionButtons();
                this.collectionUI.updateGlobalCardsProgress();
              } else if (award && award.coins) {
                this.ui.setCoins(this._save.coins);
              }
            } else {
              this._save.coins = (this._save.coins || 0) + 10;
              saveSave(this._save);
              this.ui.setCoins(this._save.coins);
            }
          }
          if (document.getElementById("toggle-sfx").getAttribute("aria-checked") === "true" && typeof AudioPlayer !== "undefined" && AudioPlayer.place) {
            AudioPlayer.place();
          }
        };
      };
      this._battlePassTokenTimer = setInterval(spawn, BATTLE_PASS_TOKEN_INTERVAL_MS);
    }

    resetProgress() {
      try {
        this._clearBattlePassTokenTimer();
        const music = this._save.musicOn;
        const sfx = this._save.sfxOn;
        Object.assign(this._save, getDefaultSave());
        this._save.musicOn = music;
        this._save.sfxOn = sfx;
        this.currentLevelIndex = 0;
        saveSave(this._save);
        this._applySaveToUI();
        this.updateWheelWidget();
        this.collectionUI.updateCollectionButtons();
        this.ui.hideSettingsModal();
        this.ui.showScreen("start-screen");
      } catch (_) {}
    }

    cheatOpenAllAlbums() {
      const now = Date.now();
      this._save.collectionUnlocked = true;
      this._save.collectionTutorialCompleted = true;
      this._save.albumEvent = { startAt: now, endAt: now + EVENT_DURATION_MS };
      this._save.battlePassUnlocked = true;
      this._save.battlePassEvent = { startAt: now, endAt: now + EVENT_DURATION_MS };
      this.collectionManager._ensureCardsStructure();
      const cards = this._save.cards;
      ALBUM_DEFS.forEach((def) => {
        (def.cardIds || []).forEach((id) => {
          cards.collected[id] = true;
        });
        if (this._save.albums[def.id]) {
          this._save.albums[def.id].collectedCount = (def.cardIds || []).length;
        }
      });
      cards.newInbox = [];
      saveSave(this._save);
      this._applySaveToUI();
      this.updateBattlePassWidget();
      this.collectionUI.updateCollectionButtons();
      this.collectionUI.updateGlobalCardsProgress();
      this.ui.hideSettingsModal();
      this.collectionUI.showAlbum();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.gameApp = new GameApp();
  });
})();
