"use strict";

/* ========== Tiện ích & lưu trạng thái ========== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const KEY = "bai17_bien_lenhgan";
let state = { seen: {}, quiz: {}, code: {}, passed: {}, submitted: false };
try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } };

const SECTIONS = ["muctieu", "bien", "dattten", "kieu", "gan", "nhapxuat", "baitap", "nopbai"];

function sectionDone(id) {
  if (MINI_IDS.includes(id)) return miniOk(id);
  if (id === "baitap") return EXERCISES.every(e => state.passed[e.id]);
  if (id === "nopbai") return !!state.submitted;
  return !!state.seen[id];
}
function refreshProgress() {
  let n = 0;
  SECTIONS.forEach(id => {
    const d = sectionDone(id);
    if (d) n++;
    $(`#sidebar a[data-sec="${id}"]`).classList.toggle("done", d);
  });
  const pct = Math.round(n * 100 / SECTIONS.length);
  $("#progressBar").style.width = pct + "%";
  $("#progressText").textContent = pct + "%";
  renderSummary();
}

/* ========== Chạy Python bằng Pyodide ========== */
const PY_HARNESS = `
import sys, io, json, builtins
def _run(code, inputs_json, echo):
    inputs = iter(json.loads(inputs_json))
    buf = io.StringIO()
    err = ""
    def fake_input(prompt=""):
        if echo: buf.write(str(prompt))
        try: v = next(inputs)
        except StopIteration: raise EOFError("Chương trình cần nhập thêm dữ liệu nhưng đã hết dữ liệu.")
        if echo: buf.write(v + "\\n")
        return v
    steps = [0]
    def tracer(frame, event, arg):
        if event == "line":
            steps[0] += 1
            if steps[0] > 300000: raise TimeoutError("Chương trình chạy quá lâu (có thể bị lặp vô hạn).")
        return tracer
    old_out, old_in = sys.stdout, builtins.input
    sys.stdout, builtins.input = buf, fake_input
    try:
        obj = compile(code, "<bai>", "exec")
        sys.settrace(tracer)
        exec(obj, {"__name__": "__main__"})
    except SyntaxError as e:
        err = "Lỗi cú pháp (dòng %s): %s" % (e.lineno, e.msg)
    except BaseException as e:
        tb, line = e.__traceback__, None
        while tb:
            if tb.tb_frame.f_code.co_filename == "<bai>": line = tb.tb_lineno
            tb = tb.tb_next
        err = "%s: %s" % (type(e).__name__, e) + (" (dòng %s)" % line if line else "")
    finally:
        sys.settrace(None)
        sys.stdout, builtins.input = old_out, old_in
    return json.dumps({"out": buf.getvalue(), "err": err})

import ast, inspect
class _AsyncInput(ast.NodeTransformer):
    def __init__(self, names): self.names = names
    def visit_Call(self, node):
        self.generic_visit(node)
        f = node.func
        if isinstance(f, ast.Name) and (f.id == "input" or f.id in self.names):
            if f.id == "input": f.id = "_ainput"
            return ast.copy_location(ast.Await(value=node), node)
        return node
    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        if node.name in self.names:
            return ast.copy_location(ast.AsyncFunctionDef(**{k: getattr(node, k) for k in node._fields}), node)
        return node
def _uses_input(fd, names):
    for n in ast.walk(fd):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and (n.func.id == "input" or n.func.id in names): return True
    return False
async def _run_i(code, write, ask):
    err = ""
    steps = [0]
    class Out:
        def write(self, t):
            if t: write(t)
            return len(t)
        def flush(self): pass
    def tracer(frame, event, arg):
        if event == "line":
            steps[0] += 1
            if steps[0] > 300000: raise TimeoutError("Chương trình chạy quá lâu (có thể bị lặp vô hạn).")
        return tracer
    async def _ainput(prompt=""):
        steps[0] = 0
        if prompt != "": write(str(prompt))
        return str(await ask())
    old_out = sys.stdout
    sys.stdout = Out()
    try:
        tree = ast.parse(code, "<bai>")
        names = set()
        changed = True
        while changed:
            changed = False
            for fd in [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]:
                if fd.name not in names and _uses_input(fd, names):
                    names.add(fd.name); changed = True
        tree = ast.fix_missing_locations(_AsyncInput(names).visit(tree))
        obj = compile(tree, "<bai>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
        g = {"__name__": "__main__", "_ainput": _ainput}
        sys.settrace(tracer)
        r = eval(obj, g)
        if inspect.isawaitable(r): await r
    except SyntaxError as e:
        err = "Lỗi cú pháp (dòng %s): %s" % (e.lineno, e.msg)
    except BaseException as e:
        tb, line = e.__traceback__, None
        while tb:
            if tb.tb_frame.f_code.co_filename == "<bai>": line = tb.tb_lineno
            tb = tb.tb_next
        err = "%s: %s" % (type(e).__name__, e) + (" (dòng %s)" % line if line else "")
    finally:
        sys.settrace(None)
        sys.stdout = old_out
    return err
`;
let pyPromise = null;
function getPy() {
  if (!pyPromise) {
    pyPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      s.onload = async () => {
        try { const py = await loadPyodide(); py.runPython(PY_HARNESS); res(py); } catch (e) { rej(e); }
      };
      s.onerror = () => rej(new Error("Không tải được Python. Hãy kiểm tra kết nối mạng."));
      document.head.appendChild(s);
    }).catch(e => { pyPromise = null; throw e; });
  }
  return pyPromise;
}
async function runPy(code, inputs, echo) {
  const py = await getPy();
  const r = py.globals.get("_run")(code, JSON.stringify(inputs), !!echo);
  return JSON.parse(r);
}

/* Màn hình chạy chương trình: khi gặp input() sẽ hiện ô nhập ngay tại dòng đó, giống Python thật */
function createConsole(box) {
  box.className = "console show";
  box.textContent = "";
  let dead = false, pending = null;
  const add = (t, cls) => {
    if (dead) return;
    const n = cls ? Object.assign(document.createElement("span"), { className: cls, textContent: t }) : document.createTextNode(t);
    box.appendChild(n);
    box.scrollTop = box.scrollHeight;
  };
  const ask = () => new Promise((res, rej) => {
    if (dead) return rej(new Error("stopped"));
    const inp = document.createElement("input");
    inp.className = "con-in"; inp.spellcheck = false; inp.autocomplete = "off";
    box.appendChild(inp);
    inp.focus({ preventScroll: true });
    box.scrollTop = box.scrollHeight;
    pending = { rej, inp };
    inp.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      pending = null;
      inp.remove();
      add(inp.value + "\n", "con-typed");
      res(inp.value);
    });
  });
  return {
    write: t => add(t), ask, error: m => add((box.textContent && !box.textContent.endsWith("\n") ? "\n" : "") + m + "\n", "con-err"),
    end: () => add("\n— Chương trình đã kết thúc —", "con-end"),
    cancel() { dead = true; if (pending) { pending.inp.remove(); pending.rej(new Error("stopped")); } },
    clear() { box.textContent = ""; },
    get dead() { return dead; }
  };
}
async function runInteractive(code, con) {
  con.write("⏳ Đang chuẩn bị Python…\n");
  let py;
  try { py = await getPy(); } catch (e) { con.error(e.message); return; }
  if (con.dead) return;
  con.clear();
  const err = await py.globals.get("_run_i")(code, con.write, con.ask);
  if (con.dead) return;
  if (err) con.error(err);
  con.end();
}

/* ========== Khung code chạy được (ví dụ trong bài) ========== */
function autoRows(ta) { ta.rows = Math.max(4, ta.value.split("\n").length + 1); ta.style.minHeight = "0"; }
/* Trình soạn code: CodeMirror (tô màu, tự thụt lề); nếu không tải được thì dùng textarea thường */
function makeEditor(ta) {
  if (!window.CodeMirror) {
    autoRows(ta);
    ta.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 4;
    });
    return { get value() { return ta.value; }, set value(v) { ta.value = v; autoRows(ta); },
      onChange(fn) { ta.addEventListener("input", () => { fn(); autoRows(ta); }); } };
  }
  const cm = CodeMirror.fromTextArea(ta, {
    mode: "python", theme: "bai17", lineNumbers: true, indentUnit: 4, tabSize: 4, smartIndent: true,
    indentWithTabs: false, matchBrackets: true, autoCloseBrackets: true, viewportMargin: Infinity,
    extraKeys: {
      Tab: c => c.somethingSelected() ? c.indentMore() : c.replaceSelection(" ".repeat(4 - c.getCursor().ch % 4), "end"),
      "Shift-Tab": c => c.indentLess(),
      Backspace: c => {
        if (c.somethingSelected()) return CodeMirror.Pass;
        const { line, ch } = c.getCursor();
        if (ch === 0 || c.getLine(line).slice(0, ch).trim() !== "") return CodeMirror.Pass;
        const n = ch % 4 || 4;
        c.replaceRange("", { line, ch: ch - n }, { line, ch });
      }
    }
  });
  const fix = () => cm.refresh();
  [0, 300, 1200].forEach(t => setTimeout(fix, t));
  window.addEventListener("load", fix);
  if (document.fonts) document.fonts.ready.then(fix);
  return { get value() { return cm.getValue(); }, set value(v) { cm.setValue(v); }, onChange(fn) { cm.on("change", fn); } };
}
/* Tô màu một đoạn code Python thành HTML (dùng cho ví dụ, trắc nghiệm) */
function hl(code) {
  if (!window.CodeMirror || !CodeMirror.runMode) return esc(code);
  let h = "";
  CodeMirror.runMode(code, "python", (t, st) => { h += st ? `<span class="cm-${st.split(" ").join(" cm-")}">${esc(t)}</span>` : esc(t); });
  return h;
}
$$(".demo").forEach(d => {
  const ta = $("textarea", d);
  const initial = ta.value;
  const ed = makeEditor(ta);
  const bar = document.createElement("div");
  bar.className = "demo-bar";
  bar.innerHTML = `<button class="btn run">▶ Chạy</button><button class="btn ghost">Khôi phục</button>`;
  const out = document.createElement("div");
  out.className = "console";
  d.append(bar, out);
  const [run, reset] = $$("button", bar);
  let con = null;
  run.onclick = () => {
    if (con) con.cancel();
    con = createConsole(out);
    runInteractive(ed.value, con);
  };
  reset.onclick = () => { if (con) con.cancel(); ed.value = initial; out.className = "console"; };
});

/* ========== Máy kiểm tra tên biến ========== */
const KEYWORDS = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
function checkName(n) {
  if (n === "") return [null, "Hãy gõ một tên để kiểm tra."];
  if (KEYWORDS.has(n)) return [false, `❌ “${n}” là từ khóa của Python, không được dùng làm tên biến.`];
  if (/\s/.test(n)) return [false, "❌ Tên biến không được chứa dấu cách. Dùng dấu gạch dưới, ví dụ ten_hs."];
  if (/^[0-9]/.test(n)) return [false, "❌ Tên biến không được bắt đầu bằng chữ số."];
  if (/[^\x00-\x7F]/.test(n)) return [false, "⚠️ Python cho phép chữ có dấu, nhưng ta quy ước chỉ dùng chữ không dấu (a–z) để tránh lỗi."];
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return [false, "❌ Tên chỉ được gồm chữ cái, chữ số và dấu gạch dưới _ (không có - + * # …)."];
  if (/^(print|input|int|float|str|type|len|max|min|sum)$/.test(n)) return [true, `✅ Hợp lệ, nhưng “${n}” trùng tên hàm có sẵn. Nên đặt tên khác để không ghi đè hàm.`];
  return [true, `✅ “${n}” là tên biến hợp lệ.` + (/[A-Z]/.test(n) ? " (Nhớ: chữ hoa, chữ thường là khác nhau)" : "")];
}
const nameInput = $("#nameInput"), nameResult = $("#nameResult");
nameInput.addEventListener("input", () => {
  const [ok, msg] = checkName(nameInput.value.trim());
  nameResult.className = "result " + (ok === null ? "neutral" : ok ? "ok" : "bad");
  nameResult.textContent = msg;
});
["diem_toan", "2ban", "ten hs", "Tuoi", "for", "chieu-dai", "_x1", "điểm"].forEach(t => {
  const b = document.createElement("button");
  b.className = "chip"; b.textContent = t; b.type = "button";
  b.onclick = () => { nameInput.value = t; nameInput.dispatchEvent(new Event("input")); };
  $("#nameChips").appendChild(b);
});

/* ========== Câu kiểm tra nhỏ cuối mỗi nội dung ========== */
const MINI = {
  bien: { q: "Biến trong Python là gì?", o: ["Một giá trị không bao giờ thay đổi", "Một tên gắn với một vùng nhớ chứa giá trị", "Một câu lệnh in ra màn hình", "Một loại dấu toán học"], a: 1,
    e: "Biến là tên của vùng nhớ lưu giá trị, và giá trị đó có thể thay đổi trong quá trình chạy." },
  dattten: { q: "Tên nào dưới đây đặt tên biến HỢP LỆ?", o: ["2lop", "ten hoc sinh", "so_luong", "for"], a: 2,
    e: "2lop bắt đầu bằng chữ số, “ten hoc sinh” có dấu cách, “for” là từ khóa. Chỉ so_luong hợp lệ." },
  kieu: { q: "Giá trị nào dưới đây thuộc kiểu xâu (str)?", o: ["15", "8.5", "\"15\"", "True"], a: 2,
    e: "Giá trị đặt trong dấu nháy là xâu. 15 là int, 8.5 là float, True là bool." },
  gan: { q: "Đoạn code sau in ra gì?", code: "a = 3\nb = 7\na = b\nb = a\nprint(a, b)", o: ["7 3", "3 7", "7 7", "3 3"], a: 2,
    e: "Sau a = b thì a = 7 (giá trị 3 đã mất), nên b = a cũng cho 7. Cần biến trung gian để hoán đổi đúng." },
  nhapxuat: { q: "Em gõ n = input() rồi nhập 12. Biến n thuộc kiểu nào?", o: ["int", "float", "str", "bool"], a: 2,
    e: "input() luôn trả về xâu (str). Muốn tính toán phải dùng int(input()) hoặc float(input())." }
};
const MINI_IDS = Object.keys(MINI);
const miniOk = id => state.quiz[id] === MINI[id].a;
MINI_IDS.forEach(id => {
  const q = MINI[id], sec = document.getElementById(id);
  const d = document.createElement("div");
  d.className = "q mini";
  d.innerHTML = `<div class="q-title">✍️ Kiểm tra nhanh: ${esc(q.q)}</div>` + (q.code ? `<pre class="cm-s-bai17">${hl(q.code)}</pre>` : "") +
    q.o.map((t, j) => `<button class="opt" data-j="${j}">${"ABCD"[j]}. ${esc(t)}</button>`).join("") + `<div class="explain" hidden></div>`;
  const paint = () => {
    const c = state.quiz[id];
    $$(".opt", d).forEach((b, j) => {
      b.classList.toggle("right", c === q.a && j === q.a);
      b.classList.toggle("wrong", c === j && j !== q.a);
    });
    const ex = $(".explain", d);
    ex.hidden = c === undefined;
    ex.textContent = c === undefined ? "" : c === q.a ? "✅ Chính xác! " + q.e : "❌ Chưa đúng, em đọc lại phần trên rồi chọn lại nhé.";
  };
  $$(".opt", d).forEach(b => b.onclick = () => { state.quiz[id] = +b.dataset.j; save(); paint(); refreshProgress(); });
  paint();
  sec.appendChild(d);
});

/* ========== Bài tập lập trình ========== */
const EXERCISES = [
  { id: "ex1", title: "Bài 1. Hoán đổi hai số",
    desc: "Nhập hai số nguyên a và b (mỗi số một dòng). Hoán đổi giá trị của a và b rồi in ra màn hình dạng: <code>a b</code> (cách nhau một dấu cách).",
    start: "a = int(input())\nb = int(input())\n# Hoán đổi a và b ở đây\n\nprint(a, b)\n",
    tests: [{ i: ["3", "7"], o: "7 3" }, { i: ["10", "-2"], o: "-2 10" }, { i: ["0", "0"], o: "0 0" }] },
  { id: "ex2", title: "Bài 2. Hình chữ nhật",
    desc: "Nhập chiều dài và chiều rộng (số nguyên, mỗi số một dòng). In chu vi ở dòng thứ nhất, diện tích ở dòng thứ hai.",
    start: "dai = int(input())\nrong = int(input())\n# Tạo biến chu_vi và dien_tich bằng lệnh gán\n\n",
    tests: [{ i: ["5", "3"], o: "16\n15" }, { i: ["10", "10"], o: "40\n100" }, { i: ["1", "2"], o: "6\n2" }] },
  { id: "ex3", title: "Bài 3. Lời chào",
    desc: "Nhập tên (xâu) và tuổi (số nguyên). In đúng dòng: <code>Xin chao An, nam sau ban 16 tuoi</code> (với An là tên, 16 là tuổi cộng 1, nhập tuổi 15). Gợi ý: <code>print(\"Xin chao \" + ten + \", nam sau ban\", tuoi + 1, \"tuoi\")</code>.",
    start: "ten = input()\ntuoi = int(input())\n\n",
    tests: [{ i: ["An", "15"], o: "Xin chao An, nam sau ban 16 tuoi" }, { i: ["Binh", "17"], o: "Xin chao Binh, nam sau ban 18 tuoi" }] },
  { id: "ex4", title: "Bài 4. Điểm trung bình",
    desc: "Nhập 3 điểm (số thực, mỗi số một dòng). Gán điểm trung bình vào biến <code>tb</code> rồi in <code>round(tb, 2)</code>.",
    start: "d1 = float(input())\nd2 = float(input())\nd3 = float(input())\n\n",
    tests: [{ i: ["7", "8", "10"], o: "8.33" }, { i: ["6", "6", "6"], o: "6.0" }, { i: ["9.5", "8", "7.25"], o: "8.25" }] },
  { id: "ex5", title: "Bài 5 (thử thách). Đổi giây ra giờ, phút, giây",
    desc: "Nhập số giây <code>t</code> (số nguyên). In ra ba số: giờ, phút, giây còn lại, cách nhau dấu cách. Gợi ý: <code>//</code> là chia lấy phần nguyên, <code>%</code> là chia lấy dư. Ví dụ 3725 giây cho kết quả <code>1 2 5</code>.",
    start: "t = int(input())\n\n",
    tests: [{ i: ["3725"], o: "1 2 5" }, { i: ["59"], o: "0 0 59" }, { i: ["7200"], o: "2 0 0" }] }
];
const norm = s => s.split("\n").map(l => l.trimEnd()).join("\n").trim();

EXERCISES.forEach(ex => {
  const d = document.createElement("div");
  d.className = "ex";
  d.innerHTML = `<div class="ex-head"><h3>${ex.title}<span class="badge">chưa đạt</span></h3><p>${ex.desc}</p></div>
    <div class="ex-body"><textarea spellcheck="false"></textarea>
    <div class="demo-bar"><button class="btn run">▶ Chạy thử</button><button class="btn">✔ Chấm bài</button><button class="btn ghost">Làm lại từ đầu</button></div>
    <div class="console"></div></div>
    <div class="ex-res"></div>`;
  const ta = $("textarea", d), out = $(".console", d), res = $(".ex-res", d), badge = $(".badge", d);
  ta.value = state.code[ex.id] ?? ex.start;
  const ed = makeEditor(ta);
  const mark = () => { badge.textContent = state.passed[ex.id] ? "✓ đã đạt" : "chưa đạt"; badge.classList.toggle("ok", !!state.passed[ex.id]); };
  mark();
  ed.onChange(() => { state.code[ex.id] = ed.value; save(); });
  const [runBtn, btn, rst] = $$("button", d);
  rst.onclick = () => { ed.value = ex.start; state.code[ex.id] = ed.value; save(); res.innerHTML = ""; if (con) con.cancel(); out.className = "console"; };
  let con = null;
  runBtn.onclick = () => {
    if (con) con.cancel();
    con = createConsole(out);
    runInteractive(ed.value, con);
  };
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = "Đang chấm…"; res.innerHTML = "";
    try {
      let pass = 0, html = "";
      for (const t of ex.tests) {
        const r = await runPy(ed.value, t.i, false);
        const ok = !r.err && norm(r.out) === norm(t.o);
        if (ok) pass++;
        html += `<div class="test"><span>${ok ? "✅" : "❌"}</span><div>Nhập: <code>${esc(t.i.join(" ⏎ "))}</code>` +
          (ok ? "" : `<br>Mong đợi: <pre>${esc(t.o)}</pre>Chương trình in: <pre>${esc(r.out.trim() || "(trống)")}</pre>` + (r.err ? `<b style="color:var(--bad)">${esc(r.err)}</b>` : "")) +
          `</div></div>`;
      }
      const all = pass === ex.tests.length;
      state.passed[ex.id] = all; state.code[ex.id] = ed.value; save(); mark();
      res.innerHTML = `<div class="result ${all ? "ok" : "bad"}">${all ? "🎉 Đạt tất cả" : "Chưa đạt"} (${pass}/${ex.tests.length} bộ dữ liệu)</div>` + html + "<br>";
      refreshProgress();
    } catch (e) { res.innerHTML = `<div class="result bad">${esc(e.message)}</div>`; }
    btn.disabled = false; btn.textContent = "✔ Chấm bài";
  };
  $("#exercises").appendChild(d);
});

/* ========== Tổng kết & nộp bài ========== */
function collect() {
  return {
    quizScore: MINI_IDS.filter(miniOk).length,
    quizTotal: MINI_IDS.length,
    quizAnswers: Object.fromEntries(MINI_IDS.map(id => [id, state.quiz[id] ?? null])),
    exercises: EXERCISES.map(e => ({ id: e.id, passed: !!state.passed[e.id], code: state.code[e.id] ?? "" }))
  };
}
function renderSummary() {
  const c = collect();
  const passed = c.exercises.filter(e => e.passed).length;
  $("#summary").innerHTML =
    `<div class="stat">Câu kiểm tra nhỏ<b>${c.quizScore}/${c.quizTotal}</b></div>` +
    `<div class="stat">Bài tập đạt<b>${passed}/${EXERCISES.length}</b></div>`;
}
let fbReady = null;
function loadFirebase() {
  if (!window.FIREBASE_CONFIG) return Promise.resolve(null);
  if (fbReady) return fbReady;
  const load = src => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Không tải được Firebase"));
    document.head.appendChild(s);
  });
  const v = "https://www.gstatic.com/firebasejs/10.12.2/";
  fbReady = load(v + "firebase-app-compat.js").then(() => load(v + "firebase-firestore-compat.js")).then(() => {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    return firebase.firestore();
  });
  return fbReady;
}
function downloadJson(data, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = name; a.click();
}
$("#submitForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#submitMsg"), btn = $("button", e.target);
  const data = Object.assign({ name: $("#fName").value.trim(), className: $("#fClass").value.trim(), lesson: "bai17-bien-va-lenh-gan" }, collect());
  msg.hidden = false; msg.className = "result neutral"; msg.textContent = "Đang nộp bài…"; btn.disabled = true;
  try {
    const db = await loadFirebase();
    if (!db) {
      msg.className = "result bad";
      msg.innerHTML = "Trang chưa được kết nối Firebase nên bài chưa gửi được cho giáo viên. File bài làm đã được tải về máy, em hãy gửi file này cho thầy/cô.";
      downloadJson(data, `bai17_${data.className}_${data.name}.json`.replace(/\s+/g, "_"));
    } else {
      await db.collection(window.FIREBASE_COLLECTION || "submissions_bai17")
        .add(Object.assign({}, data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
      state.submitted = true; save(); refreshProgress();
      msg.className = "result ok"; msg.textContent = "✅ Nộp bài thành công! Cảm ơn " + data.name + ".";
    }
  } catch (err) {
    msg.className = "result bad"; msg.textContent = "Nộp bài thất bại: " + err.message + ". Bài làm của em vẫn được lưu trong trình duyệt, hãy thử lại.";
  }
  btn.disabled = false;
});

/* ========== Thanh bên & cuộn trang ========== */
$("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");
$$("#sidebar a").forEach(a => a.addEventListener("click", () => $("#sidebar").classList.remove("open")));
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    const id = en.target.id;
    $$("#sidebar a").forEach(a => a.classList.toggle("active", a.dataset.sec === id));
    if (!state.seen[id]) { state.seen[id] = true; save(); refreshProgress(); }
  });
}, { rootMargin: "-40% 0px -55% 0px" });
SECTIONS.forEach(id => io.observe(document.getElementById(id)));

refreshProgress();
