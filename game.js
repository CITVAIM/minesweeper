(function () {
  "use strict";

  var DIFFICULTIES = {
    beginner: { rows: 9, cols: 9, mines: 10, label: "初级" },
    intermediate: { rows: 16, cols: 16, mines: 40, label: "中级" },
    expert: { rows: 16, cols: 30, mines: 99, label: "高级" },
  };

  var boardEl = document.getElementById("board");
  var faceEl = document.getElementById("face");
  var mineCounterEl = document.getElementById("mine-counter");
  var timerEl = document.getElementById("timer");
  var difficultyEl = document.getElementById("difficulty");
  var newGameEl = document.getElementById("new-game");

  var state = null;
  var timerId = null;
  var faceTimeout = null;

  function pad(n) {
    var neg = n < 0;
    var s = String(Math.abs(n));
    while (s.length < 3) s = "0" + s;
    if (neg) s = "-" + s.slice(-2);
    return s;
  }

  function idx(r, c) {
    return r * state.cols + c;
  }

  function inBounds(r, c) {
    return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
  }

  function forEachNeighbor(r, c, fn) {
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr;
        var nc = c + dc;
        if (inBounds(nr, nc)) fn(nr, nc);
      }
    }
  }

  function newBoard() {
    var cfg = DIFFICULTIES[difficultyEl.value];
    state = {
      rows: cfg.rows,
      cols: cfg.cols,
      mines: cfg.mines,
      cells: [],
      started: false,
      over: false,
      win: false,
      revealedCount: 0,
      flagCount: 0,
      time: 0,
    };
    for (var i = 0; i < cfg.rows * cfg.cols; i++) {
      state.cells.push({ mine: false, revealed: false, flag: 0, adjacent: 0 });
    }
    renderBoard();
    updateMineCounter();
    updateTimer();
  }

  function placeMines(safeR, safeC) {
    var total = state.rows * state.cols;
    var forbidden = {};
    forbidden[idx(safeR, safeC)] = true;
    forEachNeighbor(safeR, safeC, function (r, c) {
      forbidden[idx(r, c)] = true;
    });

    var candidates = [];
    for (var i = 0; i < total; i++) {
      if (!forbidden[i]) candidates.push(i);
    }

    for (var m = 0; m < state.mines && candidates.length; m++) {
      var pick = Math.floor(Math.random() * candidates.length);
      state.cells[candidates[pick]].mine = true;
      candidates.splice(pick, 1);
    }

    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var cell = state.cells[idx(r, c)];
        if (cell.mine) continue;
        var count = 0;
        forEachNeighbor(r, c, function (nr, nc) {
          if (state.cells[idx(nr, nc)].mine) count++;
        });
        cell.adjacent = count;
      }
    }
  }

  function startTimer() {
    if (timerId) return;
    state.time = 0;
    updateTimer();
    timerId = setInterval(function () {
      state.time = Math.min(state.time + 1, 999);
      updateTimer();
      if (state.time === 999) stopTimer();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateTimer() {
    timerEl.textContent = pad(state.time);
  }

  function updateMineCounter() {
    mineCounterEl.textContent = pad(state.mines - state.flagCount);
  }

  function setFace(symbol, transientMs) {
    faceEl.textContent = symbol;
    if (faceTimeout) {
      clearTimeout(faceTimeout);
      faceTimeout = null;
    }
    if (transientMs) {
      faceTimeout = setTimeout(function () {
        faceEl.textContent = "🙂";
      }, transientMs);
    }
  }

  function renderBoard() {
    boardEl.style.gridTemplateColumns = "repeat(" + state.cols + ", var(--cell))";
    var frag = document.createDocumentFragment();
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var el = document.createElement("div");
        el.className = "cell";
        el.dataset.r = r;
        el.dataset.c = c;
        frag.appendChild(el);
      }
    }
    boardEl.innerHTML = "";
    boardEl.appendChild(frag);
  }

  function cellEl(r, c) {
    return boardEl.children[idx(r, c)];
  }

  function paintCell(r, c) {
    var cell = state.cells[idx(r, c)];
    var el = cellEl(r, c);
    el.className = "cell";
    el.removeAttribute("data-n");
    el.textContent = "";

    if (cell.revealed) {
      el.classList.add("revealed");
      if (cell.mine) {
        el.classList.add("bomb");
        el.textContent = "💣";
      } else if (cell.adjacent > 0) {
        el.dataset.n = cell.adjacent;
        el.textContent = cell.adjacent;
      }
    } else if (cell.flag === 1) {
      el.classList.add("flagged");
      el.textContent = "🚩";
    } else if (cell.flag === 2) {
      el.classList.add("question");
      el.textContent = "?";
    }
  }

  function paintAll() {
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) paintCell(r, c);
    }
  }

  function revealFlood(r0, c0) {
    var stack = [[r0, c0]];
    while (stack.length) {
      var pair = stack.pop();
      var r = pair[0];
      var c = pair[1];
      if (!inBounds(r, c)) continue;
      var cell = state.cells[idx(r, c)];
      if (cell.revealed || cell.flag === 1) continue;
      if (cell.mine) continue;
      cell.revealed = true;
      state.revealedCount++;
      if (cell.adjacent === 0) {
        forEachNeighbor(r, c, function (nr, nc) {
          var n = state.cells[idx(nr, nc)];
          if (!n.revealed && !n.mine && n.flag !== 1) stack.push([nr, nc]);
        });
      }
    }
  }

  function revealCell(r, c) {
    var cell = state.cells[idx(r, c)];
    if (cell.revealed || cell.flag === 1) return;
    if (!state.started) {
      state.started = true;
      placeMines(r, c);
      startTimer();
    }
    if (cell.mine) {
      lose(r, c);
      return;
    }
    revealFlood(r, c);
    paintAll();
    checkWin();
  }

  function toggleFlag(r, c) {
    var cell = state.cells[idx(r, c)];
    if (cell.revealed || state.over) return;
    if (!state.started) {
      state.started = true;
      startTimer();
    }
    var before = cell.flag;
    cell.flag = (cell.flag + 1) % 3;
    if (before !== 1 && cell.flag === 1) state.flagCount++;
    if (before === 1 && cell.flag !== 1) state.flagCount--;
    paintCell(r, c);
    updateMineCounter();
  }

  function chord(r, c) {
    var cell = state.cells[idx(r, c)];
    if (!cell.revealed || cell.adjacent === 0 || state.over) return;
    var flags = 0;
    var targets = [];
    forEachNeighbor(r, c, function (nr, nc) {
      var n = state.cells[idx(nr, nc)];
      if (n.flag === 1) flags++;
      else if (!n.revealed) targets.push([nr, nc]);
    });
    if (flags !== cell.adjacent) return;

    var hitMine = null;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var n = state.cells[idx(t[0], t[1])];
      if (n.mine) {
        hitMine = t;
        break;
      }
    }
    if (hitMine) {
      lose(hitMine[0], hitMine[1]);
      return;
    }
    for (var j = 0; j < targets.length; j++) {
      revealFlood(targets[j][0], targets[j][1]);
    }
    paintAll();
    checkWin();
  }

  function checkWin() {
    var safeTotal = state.rows * state.cols - state.mines;
    if (state.revealedCount < safeTotal) return;
    state.over = true;
    state.win = true;
    stopTimer();
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var cell = state.cells[idx(r, c)];
        if (cell.mine && cell.flag !== 1) {
          cell.flag = 1;
          state.flagCount++;
        }
      }
    }
    paintAll();
    updateMineCounter();
    setFace("😎");
  }

  function lose(hitR, hitC) {
    state.over = true;
    state.win = false;
    stopTimer();
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var cell = state.cells[idx(r, c)];
        if (cell.mine) {
          cell.revealed = true;
        }
      }
    }
    paintAll();
    var hitEl = cellEl(hitR, hitC);
    hitEl.classList.add("bomb-hit");
    for (var rr = 0; rr < state.rows; rr++) {
      for (var cc = 0; cc < state.cols; cc++) {
        var cc2 = state.cells[idx(rr, cc)];
        if (cc2.flag === 1 && !cc2.mine) {
          var el = cellEl(rr, cc);
          el.classList.add("wrong-flag");
          el.textContent = "";
        }
      }
    }
    setFace("😵");
  }

  function pressedAt(r, c, pressed) {
    var el = cellEl(r, c);
    if (!el) return;
    var cell = state.cells[idx(r, c)];
    if (cell.revealed || state.over) return;
    el.classList.toggle("pressed", pressed);
  }

  function handleDown(e) {
    if (state.over) return;
    var el = e.target.closest(".cell");
    if (!el) return;
    if (e.button === 0) {
      var cell = state.cells[idx(+el.dataset.r, +el.dataset.c)];
      if (cell.revealed) {
        chord(+el.dataset.r, +el.dataset.c);
      } else {
        setFace("😮");
        pressedAt(+el.dataset.r, +el.dataset.c, true);
      }
    }
  }

  function handleUp(e) {
    if (e.target.classList && e.target.classList.contains("pressed")) {
      e.target.classList.remove("pressed");
    }
    if (e.target.closest) {
      var anyPressed = boardEl.querySelectorAll(".pressed");
      for (var i = 0; i < anyPressed.length; i++) anyPressed[i].classList.remove("pressed");
    }
    if (!state.over) setFace("🙂");
  }

  function handleClick(e) {
    if (state.over) return;
    var el = e.target.closest(".cell");
    if (!el) return;
    if (e.button !== 0) return;
    var r = +el.dataset.r;
    var c = +el.dataset.c;
    var cell = state.cells[idx(r, c)];
    if (cell.revealed) {
      chord(r, c);
    } else {
      revealCell(r, c);
    }
  }

  function handleContext(e) {
    e.preventDefault();
    if (state.over) return;
    var el = e.target.closest(".cell");
    if (!el) return;
    toggleFlag(+el.dataset.r, +el.dataset.c);
  }

  function handleMiddle(e) {
    if (e.button !== 1) return;
    e.preventDefault();
    var el = e.target.closest(".cell");
    if (!el) return;
    chord(+el.dataset.r, +el.dataset.c);
  }

  var touchState = null;

  function handleTouchStart(e) {
    if (state.over) return;
    var el = e.target.closest(".cell");
    if (!el) return;
    var t = e.changedTouches[0];
    var r = +el.dataset.r;
    var c = +el.dataset.c;
    touchState = { r: r, c: c, x: t.clientX, y: t.clientY, longFired: false, timer: null };
    var cell = state.cells[idx(r, c)];
    if (!cell.revealed) {
      setFace("😮");
      touchState.timer = setTimeout(function () {
        touchState.longFired = true;
        toggleFlag(r, c);
        if (navigator.vibrate) navigator.vibrate(30);
        setFace("🙂");
      }, 420);
    }
  }

  function handleTouchEnd(e) {
    if (!touchState) return;
    var ts = touchState;
    touchState = null;
    if (ts.timer) clearTimeout(ts.timer);
    if (ts.longFired) return;

    var t = e.changedTouches[0];
    var dx = Math.abs(t.clientX - ts.x);
    var dy = Math.abs(t.clientY - ts.y);
    if (dx > 12 || dy > 12) return;

    if (state.over) return;
    var cell = state.cells[idx(ts.r, ts.c)];
    if (cell.revealed) chord(ts.r, ts.c);
    else revealCell(ts.r, ts.c);
    setFace(state.over ? faceEl.textContent : "🙂");
  }

  boardEl.addEventListener("mousedown", handleDown);
  boardEl.addEventListener("mouseup", handleUp);
  boardEl.addEventListener("click", handleClick);
  boardEl.addEventListener("contextmenu", handleContext);
  boardEl.addEventListener("mousedown", handleMiddle);
  boardEl.addEventListener("touchstart", handleTouchStart, { passive: true });
  boardEl.addEventListener("touchend", handleTouchEnd, { passive: true });

  faceEl.addEventListener("click", function () {
    newBoard();
    setFace("🙂");
  });
  newGameEl.addEventListener("click", function () {
    newBoard();
    setFace("🙂");
  });
  difficultyEl.addEventListener("change", function () {
    newBoard();
    setFace("🙂");
  });

  newBoard();
})();
