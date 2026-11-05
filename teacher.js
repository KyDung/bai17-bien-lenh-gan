// Trang giáo viên (teacher.html): đăng nhập Email/Mật khẩu (Firebase Auth) + xem kết quả học sinh theo thời gian thực.
// Dùng chung cho mọi bài: liệt kê các bài trong collection `lessons`, mỗi bài là một collection con `students`.
// Mã của học sinh chỉ hiển thị dạng văn bản (escape), KHÔNG bao giờ được chạy trên trang này.
const Teacher = (() => {
  const SDK_VERSION = "10.12.2";
  const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;
  const $ = (s) => document.querySelector(s);
  const esc = Util.esc;
  const TEACHER_DOMAIN = "@linklab.edu.vn";
  let fb = null;                // { authM, fsM, auth, db }
  let unsubStudents = null;
  let rows = [];                // [{ id, data }]
  let sort = { key: "updated", dir: -1 };

  // ---------------------------------------------------------------- khởi động
  async function boot() {
    try {
      const [appM, authM, fsM] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
      const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(FIREBASE_CONFIG);
      fb = { authM, fsM, auth: authM.getAuth(app), db: fsM.getFirestore(app) };
    } catch (e) {
      showLogin("Không tải được Firebase. Em kiểm tra kết nối mạng rồi tải lại trang.");
      return;
    }
    fb.authM.onAuthStateChanged(fb.auth, (user) => (user ? onSignedIn(user) : showLogin()));
  }

  function showLogin(err) {
    if (unsubStudents) { unsubStudents(); unsubStudents = null; }
    $("#t-app").hidden = true; $("#t-login").hidden = false;
    $("#t-logout").hidden = true; $("#t-user").textContent = "";
    setErr(err || "");
  }
  function setErr(msg) { const e = $("#t-err"); e.hidden = !msg; e.textContent = msg || ""; }

  const AUTH_MSG = {
    "auth/invalid-credential": "Email hoặc mật khẩu chưa đúng.",
    "auth/invalid-login-credentials": "Email hoặc mật khẩu chưa đúng.",
    "auth/wrong-password": "Email hoặc mật khẩu chưa đúng.",
    "auth/user-not-found": "Email hoặc mật khẩu chưa đúng.",
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/too-many-requests": "Đăng nhập sai quá nhiều lần. Hãy thử lại sau ít phút.",
    "auth/network-request-failed": "Không kết nối được mạng. Hãy kiểm tra Internet.",
    "auth/operation-not-allowed": "Chưa bật đăng nhập Email/Mật khẩu trong Firebase Authentication.",
    "auth/user-disabled": "Tài khoản này đã bị vô hiệu hóa."
  };

  $("#t-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!fb) return;
    // Chỉ cần gõ tên ngắn (dung, khuong); tự thêm phần đuôi email của trường.
    let email = $("#t-email").value.trim().toLowerCase();
    const pass = $("#t-pass").value;
    if (!email || !pass) { setErr("Nhập tên đăng nhập và mật khẩu."); return; }
    if (!email.includes("@")) email += TEACHER_DOMAIN;
    const btn = $("#t-submit");
    btn.setAttribute("aria-disabled", "true"); btn.textContent = "Đang đăng nhập…"; setErr("");
    try {
      await fb.authM.signInWithEmailAndPassword(fb.auth, email, pass);
      $("#t-pass").value = "";
    } catch (err) {
      setErr((AUTH_MSG[err.code] || "Không đăng nhập được.") + " [" + (err.code || err.message) + "]");
    } finally {
      btn.removeAttribute("aria-disabled"); btn.textContent = "Đăng nhập";
    }
  });
  $("#t-logout").addEventListener("click", () => fb.authM.signOut(fb.auth));

  // ---------------------------------------------------------------- sau đăng nhập
  async function onSignedIn(user) {
    $("#t-login").hidden = true; $("#t-app").hidden = false;
    $("#t-logout").hidden = false; $("#t-user").textContent = user.email || "";
    await loadLessons();
  }

  function permissionHint(e) {
    return e && e.code === "permission-denied"
      ? "Tài khoản này chưa được cấp quyền giáo viên. Hãy thêm email vào hàm isTeacher() trong firestore.rules rồi Publish."
      : "Không đọc được dữ liệu: " + (e && (e.code || e.message));
  }

  async function loadLessons() {
    const sel = $("#t-lesson");
    $("#t-status").textContent = "Đang tải danh sách bài…";
    try {
      const { fsM, db } = fb;
      const snap = await fsM.getDocs(fsM.collection(db, "lessons"));
      const lessons = snap.docs.map((d) => ({ id: d.id, title: (d.data() || {}).title || d.id }));
      if (!lessons.some((l) => l.id === LESSON.id)) lessons.unshift({ id: LESSON.id, title: LESSON.title });
      sel.innerHTML = lessons.map((l) => `<option value="${esc(l.id)}">${esc(l.title)} (${esc(l.id)})</option>`).join("");
      sel.value = LESSON.id;
      $("#t-status").textContent = "";
      watch(sel.value);
    } catch (e) {
      $("#t-status").textContent = permissionHint(e);
    }
  }
  $("#t-lesson").addEventListener("change", (e) => watch(e.target.value));

  function watch(lessonId) {
    if (unsubStudents) unsubStudents();
    rows = [];
    render();
    const { fsM, db } = fb;
    $("#t-status").textContent = "Đang tải bài làm của học sinh…";
    unsubStudents = fsM.onSnapshot(fsM.collection(db, "lessons", lessonId, "students"), (snap) => {
      rows = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      $("#t-status").textContent = `Cập nhật trực tiếp · ${rows.length} học sinh`;
      refreshClassFilter();
      render();
      const open = $("#t-detail").dataset.id;
      if (open && !$("#t-detail").hidden) { const r = rows.find((x) => x.id === open); if (r) fillDetail(r); }
    }, (e) => { $("#t-status").textContent = permissionHint(e); });
  }

  // ---------------------------------------------------------------- bảng
  const ts = (v) => (v && v.toMillis ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : 0);
  const fmt = (ms) => (ms ? new Date(ms).toLocaleString("vi-VN", { hour12: false }) : "—");
  const passed = (arr) => (Array.isArray(arr) ? arr.filter((r) => r && r.passed).length : 0);
  const total = (arr) => (Array.isArray(arr) ? arr.length : 0);

  function refreshClassFilter() {
    const sel = $("#t-class"), cur = sel.value;
    const classes = [...new Set(rows.map((r) => (r.data.student || {}).className).filter(Boolean))].sort();
    sel.innerHTML = `<option value="">Tất cả</option>` + classes.map((c) => `<option>${esc(c)}</option>`).join("");
    sel.value = classes.includes(cur) ? cur : "";
  }

  function view() {
    const q = Util.norm($("#t-search").value), cls = $("#t-class").value;
    const list = rows.filter((r) => {
      const s = r.data.student || {};
      return (!cls || s.className === cls) && (!q || Util.norm(s.name).includes(q));
    });
    const val = (r) => sort.key === "name" ? Util.norm((r.data.student || {}).name)
      : sort.key === "className" ? Util.norm((r.data.student || {}).className) : ts(r.data.updatedAt);
    list.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
    return list;
  }

  const cell = (done, all) => {
    if (!all) return `<span class="pill">—</span>`;
    const cls = done === all ? "pill ok" : done ? "pill mid" : "pill";
    return `<span class="${cls}">${done}/${all}</span>`;
  };

  function render() {
    const list = view();
    $("#t-empty").hidden = list.length > 0;
    $("#t-table tbody").innerHTML = list.map((r) => {
      const d = r.data, s = d.student || {}, p = d.progress || {};
      const pasted = [...(d.learning || []), ...(d.practice || [])].reduce((n, x) => n + ((x.typingStats || {}).pasteBlocked || 0), 0) + (((d.final || {}).typingStats || {}).pasteBlocked || 0);
      return `<tr data-id="${esc(r.id)}"><td><b>${esc(s.name || r.id)}</b>${pasted ? ` <span class="flag" title="Học sinh đã thử dán ${pasted} lần">⚠ dán ${pasted}</span>` : ""}</td><td>${esc(s.className || "")}</td>
        <td>${cell(passed(d.learning), total(d.learning))}</td><td>${cell(passed(d.practice), total(d.practice))}</td>
        <td>${p.part1Submitted ? `<span class="pill ok">Đã nộp</span>` : p.earlySubmitted ? `<span class="pill warn" title="Học sinh bấm nộp khi chưa xong">Nộp sớm</span>` : `<span class="pill">Chưa</span>`}</td>
        <td>${p.finalSubmitted ? `<span class="pill ok">Đã nộp</span>` : p.earlySubmitted && (d.final || {}).code ? `<span class="pill warn" title="Có bản nháp Vận dụng">Nộp sớm</span>` : `<span class="pill">Chưa</span>`}</td>
        <td>${fmt(ts(d.updatedAt))}</td><td><button type="button" class="btn btn-ghost btn-sm" data-open="${esc(r.id)}">Xem</button></td></tr>`;
    }).join("");
  }
  $("#t-table thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    sort = { key: th.dataset.sort, dir: sort.key === th.dataset.sort ? -sort.dir : 1 };
    render();
  });
  $("#t-table tbody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    const tr = e.target.closest("tr");
    const id = b ? b.dataset.open : tr && tr.dataset.id;
    const r = rows.find((x) => x.id === id);
    if (r) openDetail(r);
  });
  $("#t-search").addEventListener("input", render);
  $("#t-class").addEventListener("change", render);

  // ---------------------------------------------------------------- chi tiết
  const dur = (a, b) => {
    const ms = new Date(b) - new Date(a);
    if (!a || !b || !(ms >= 0)) return "—";
    const m = Math.round(ms / 60000);
    return m < 1 ? "dưới 1 phút" : m + " phút";
  };
  const stats = (t) => !t ? "" : `<span class="stat">⌨ ${t.keyCount || 0} phím</span><span class="stat">✍ ${t.charsTyped || 0} kí tự gõ</span>${t.pasteBlocked ? `<span class="stat warn">⚠ thử dán ${t.pasteBlocked} lần</span>` : ""}`;

  function recHTML(r) {
    return `<details class="rec ${r.passed ? "ok" : ""}"><summary><span class="rec-mark">${r.passed ? "✓" : "○"}</span><b>${esc(r.activityId)}</b>
      <span class="stat">${r.attempts || 0} lần thử</span><span class="stat">${dur(r.startedAt, r.completedAt)}</span>${stats(r.typingStats)}</summary>
      <pre class="code-view">${esc(r.studentCode || "(trống)")}</pre></details>`;
  }

  function fillDetail(r) {
    const d = r.data, s = d.student || {}, p = d.progress || {}, f = d.final;
    $("#t-dname").textContent = s.name || r.id;
    $("#t-dsub").textContent = `Lớp ${s.className || "?"} · cập nhật ${fmt(ts(d.updatedAt))} · lessons/${d.lessonId || ""}/students/${r.id}`;
    let html = `<div class="t-badges"><span class="pill ${p.part1Submitted ? "ok" : ""}">Phần 1: ${p.part1Submitted ? "đã nộp " + fmt(new Date(p.part1SubmittedAt || 0).getTime()) : "chưa nộp"}</span>
      <span class="pill ${p.finalSubmitted ? "ok" : ""}">Vận dụng: ${p.finalSubmitted ? "đã nộp " + fmt(new Date(p.finalSubmittedAt || 0).getTime()) : "chưa nộp"}</span>
      ${p.earlySubmitted ? `<span class="pill warn">Nộp sớm ${fmt(new Date(p.earlySubmittedAt || 0).getTime())} (${p.activitiesDone ?? "?"}/${p.activitiesTotal ?? "?"} hoạt động xong)</span>` : ""}</div>`;
    html += `<h3>Khởi động và Hình thành kiến thức</h3>${(d.learning || []).map(recHTML).join("") || "<p class=\"t-note\">Chưa có.</p>"}`;
    html += `<h3>Luyện tập</h3>${(d.practice || []).map(recHTML).join("") || "<p class=\"t-note\">Chưa có.</p>"}`;
    html += `<h3>Vận dụng</h3>`;
    if (f) {
      const reqs = Object.entries(f.requirements || {}).map(([k, v]) => `<li class="${v ? "ok" : "no"}"><span>${v ? "✓" : "○"}</span> ${esc(k)}</li>`).join("");
      html += `<div class="rec ok open"><div class="rec-line"><b>Bài nộp</b><span class="stat">${f.characters || 0} kí tự</span>${stats(f.typingStats)}</div>
        <ul class="checks">${reqs}</ul><pre class="code-view">${esc(f.code || "")}</pre></div>`;
    } else html += `<p class="t-note">Chưa nộp.</p>`;
    $("#t-dbody").innerHTML = html;
  }
  function openDetail(r) {
    const el = $("#t-detail");
    el.dataset.id = r.id; el.hidden = false;
    fillDetail(r);
    $("#t-dclose").focus();
  }
  $("#t-dclose").addEventListener("click", () => { $("#t-detail").hidden = true; $("#t-detail").dataset.id = ""; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#t-dclose").click(); });
  $("#t-detail").addEventListener("click", (e) => { if (e.target.id === "t-detail") $("#t-dclose").click(); });
  $("#t-ddelete").addEventListener("click", async () => {
    const id = $("#t-detail").dataset.id;
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const name = (r.data.student || {}).name || id;
    if (!confirm(`Xóa bài làm của "${name}"? Việc này không hoàn tác được.`)) return;
    try {
      const { fsM, db } = fb;
      await fsM.deleteDoc(fsM.doc(db, "lessons", $("#t-lesson").value, "students", id));
      $("#t-dclose").click();
    } catch (e) { alert("Không xóa được: " + (e.code || e.message)); }
  });

  // ---------------------------------------------------------------- xuất CSV
  $("#t-csv").addEventListener("click", () => {
    const head = ["Họ tên", "Lớp", "Hoạt động đạt (học)", "Tổng (học)", "Hoạt động đạt (luyện tập)", "Tổng (luyện tập)", "Nộp phần 1", "Nộp vận dụng", "Cập nhật"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = view().map((r) => {
      const d = r.data, s = d.student || {}, p = d.progress || {};
      return [s.name, s.className, passed(d.learning), total(d.learning), passed(d.practice), total(d.practice), p.part1Submitted ? "x" : p.earlySubmitted ? "sớm" : "", p.finalSubmitted ? "x" : "", fmt(ts(d.updatedAt))].map(q).join(",");
    });
    const blob = new Blob(["﻿" + [head.map(q).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ket-qua-${$("#t-lesson").value}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  boot();
  return {};
})();
