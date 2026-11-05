"use strict";

/* ========== Tiện ích & lưu trạng thái ========== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const KEY = "bai17_bien_lenhgan";
let state = { seen: {}, quiz: {}, code: {}, passed: {}, meta: {}, submitted: false };
try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } };

const SECTIONS = ["chuyen", "muctieu", "print", "bien", "dattten", "gan", "kieu", "nhapxuat", "luyentap", "nopbai"];

function sectionDone(id) {
  if (id === "nopbai") return !!state.submitted;
  const mine = EXERCISES.filter(e => e.sec === id);
  if (mine.length) return mine.every(e => state.passed[e.id]);
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
/* ===== Minh họa từng bước: bấm "Bước tiếp" để xem biến thay đổi trong bộ nhớ ===== */
const VIZ = {
  bien: {
    code: ['ten = "An"', 'tuoi = 15', 'diem = 8.5'],
    steps: [
      { vars: {}, msg: "Chưa chạy lệnh nào. Bộ nhớ còn trống. Bấm “Bước tiếp” nhé!" },
      { vars: { ten: '"An"' }, changed: "ten", msg: "Máy tạo một hộp có nhãn <b>ten</b> và cất chữ <b>\"An\"</b> vào trong." },
      { vars: { ten: '"An"', tuoi: "15" }, changed: "tuoi", msg: "Máy tạo thêm hộp <b>tuoi</b> và cất số <b>15</b> vào." },
      { vars: { ten: '"An"', tuoi: "15", diem: "8.5" }, changed: "diem", msg: "Hộp thứ ba: <b>diem</b> chứa số <b>8.5</b>. Vậy là có 3 biến!" }
    ]
  },
  gan: {
    code: ["x = 5", "x = 9", "y = x + 1", "x = x + 1"],
    steps: [
      { vars: {}, msg: "Bộ nhớ còn trống. Bấm “Bước tiếp” để chạy dòng 1." },
      { vars: { x: "5" }, changed: "x", msg: "<b>x = 5</b>: tạo hộp x, cất số 5 vào." },
      { vars: { x: "9" }, changed: "x", msg: "<b>x = 9</b>: hộp x đã có rồi, máy <b>bỏ số 5 đi</b> và cất số 9 vào. Đây là <b>gán lại</b>." },
      { vars: { x: "9", y: "10" }, changed: "y", msg: "<b>y = x + 1</b>: máy tính vế phải trước: x là 9, 9 + 1 = 10. Rồi cất 10 vào hộp y. Hộp x không đổi." },
      { vars: { x: "10", y: "10" }, changed: "x", msg: "<b>x = x + 1</b>: lấy x hiện tại (9), cộng 1 được 10, rồi cất lại vào chính hộp x." }
    ]
  }
};
document.querySelectorAll(".viz").forEach(v => {
  const data = VIZ[v.dataset.viz];
  let i = 0;
  v.innerHTML = `<div class="trace-body"><pre class="trace-code">${data.code.map((l, n) => `<span class="ln" data-n="${n + 1}">${hl(l)}</span>`).join("")}</pre>
    <div class="mem"><div class="mem-title">🧠 Bộ nhớ máy tính</div><div class="mem-box"></div></div></div>
    <div class="trace-msg"></div>
    <div class="trace-btns"><button class="btn run">▶ Bước tiếp</button><button class="btn ghost">↺ Làm lại</button></div>`;
  const [next, again] = $$("button", v);
  const draw = () => {
    const s = data.steps[i];
    $(".mem-box", v).innerHTML = Object.entries(s.vars).map(([k, val]) =>
      `<div class="var${s.changed === k ? " changed" : ""}"><div class="tag">${k}</div><div class="val">${esc(val)}</div></div>`).join("") || '<span class="cap">(trống)</span>';
    $$(".ln", v).forEach((l, n) => { l.classList.toggle("cur", n + 1 === i); l.classList.toggle("past", n + 1 < i); });
    $(".trace-msg", v).innerHTML = s.msg;
    next.disabled = i >= data.steps.length - 1;
    next.textContent = next.disabled ? "✓ Hết rồi" : "▶ Bước tiếp";
  };
  next.onclick = () => { i++; draw(); };
  again.onclick = () => { i = 0; draw(); };
  draw();
});

/* ========== Bài thực hành cuối mỗi phần ========== */
/* sec: phần chứa bài; goal: việc cần làm; steps: các bước; sample: ví dụ mẫu; must: code phải có */
const EXERCISES = [
  { id: "th1", sec: "print", title: "Thực hành 1. Lệnh print đầu tiên",
    goal: "Viết lệnh <code>print</code> để máy in ra dòng chữ <b>Xin chào Python</b>.",
    steps: ["Gõ <code>print(</code>", "Gõ chữ cần in, đặt trong dấu nháy: <code>\"Xin chào Python\"</code>", "Gõ dấu <code>)</code> để đóng lại, rồi bấm <b>Chấm bài</b>."],
    sample: { out: "Xin chào Python" },
    hint: "Cả dòng là: print(\"Xin chào Python\")",
    start: "# Gõ lệnh print ở dưới\n\n",
    must: [[/print\s*\(/, "Em cần dùng lệnh print."]],
    tests: [{ i: [], o: "Xin chào Python" }] },

  { id: "th2", sec: "print", title: "Thực hành 2. In kết quả phép tính",
    goal: "Dùng <code>print</code> để máy tự tính rồi in ra: dòng 1 là <b>12 + 8</b>, dòng 2 là <b>6 × 7</b>.",
    steps: ["Dòng 1: <code>print(12 + 8)</code>", "Dòng 2: viết lệnh print với phép nhân (dùng dấu <code>*</code>).", "Không gõ sẵn kết quả 20 và 42, hãy để máy tính!"],
    sample: { out: "20\n42" },
    hint: "print(6 * 7)",
    start: "# Viết 2 lệnh print ở dưới\n\n",
    must: [[/12\s*\+\s*8/, "Hãy viết phép tính 12 + 8 trong print."], [/6\s*\*\s*7/, "Hãy viết phép tính 6 * 7 trong print."]],
    tests: [{ i: [], o: "20\n42" }] },

  { id: "th3", sec: "bien", title: "Thực hành 3. Tạo biến",
    goal: "Tạo hai biến rồi in giá trị của chúng ra màn hình.",
    steps: ["Gán cho biến <code>ten</code> giá trị <code>\"Lan\"</code>.", "Gán cho biến <code>tuoi</code> giá trị <code>16</code>.", "Dùng <code>print</code> để in ra <code>ten</code> và <code>tuoi</code> (không có dấu nháy)."],
    sample: { out: "Lan 16" },
    hint: "print(ten, tuoi) sẽ in hai giá trị cách nhau một dấu cách.",
    start: "# Viết 3 lệnh theo các bước ở trên\n\n",
    must: [[/\bten\s*=/, "Em chưa tạo biến ten."], [/\btuoi\s*=/, "Em chưa tạo biến tuoi."]],
    tests: [{ i: [], o: "Lan 16" }] },

  { id: "th4", sec: "gan", title: "Thực hành 5. Cộng điểm",
    goal: "Bạn Lan có 7 điểm. Cô thưởng thêm 2 điểm. Dùng lệnh gán để cập nhật biến <code>diem</code> rồi in ra.",
    steps: ["Giữ dòng <code>diem = 7</code>.", "Cộng thêm 2 bằng <code>diem = diem + 2</code>.", "In <code>diem</code> ra màn hình."],
    sample: { out: "9" },
    hint: "Biến diem xuất hiện ở cả hai vế: diem = diem + 2",
    start: "diem = 7\n# Viết tiếp ở dưới\n\n",
    must: [[/\bdiem\s*(\+=|=\s*diem\s*\+)/, "Hãy dùng diem = diem + 2 để cộng thêm điểm."]],
    tests: [{ i: [], o: "9" }] },

  { id: "th5", sec: "gan", title: "Thực hành 6. Hình chữ nhật",
    goal: "Cho chiều dài và chiều rộng. Dùng lệnh gán để tính chu vi và diện tích.",
    steps: ["Gán <code>chu_vi = (dai + rong) * 2</code>.", "Gán <code>dien_tich</code> = dài × rộng.", "In <code>chu_vi</code> ở dòng 1, <code>dien_tich</code> ở dòng 2."],
    sample: { out: "16\n15" },
    hint: "dien_tich = dai * rong",
    start: "dai = 5\nrong = 3\n# Viết tiếp ở dưới\n\n",
    must: [[/\bchu_vi\s*=/, "Em chưa gán biến chu_vi."], [/\bdien_tich\s*=/, "Em chưa gán biến dien_tich."]],
    tests: [{ i: [], o: "16\n15" }] },

  { id: "th6", sec: "dattten", title: "Thực hành 4. Sửa tên biến sai",
    goal: "Đoạn code dưới đây có 3 tên biến sai quy tắc nên bị lỗi. Hãy sửa tên cho đúng để chương trình chạy được.",
    steps: ["Tìm 3 tên sai (bắt đầu bằng số, có dấu cách, có dấu <code>-</code>).", "Sửa lại, nhớ sửa <b>cả ở dòng print</b> cho khớp tên mới.", "Kết quả in ra phải giống ví dụ."],
    sample: { out: "Lan 10A1 9" },
    hint: "Tên đúng gợi ý: <code>lop</code>, <code>ten_hs</code>, <code>diem_toan</code>.",
    start: "2lop = \"10A1\"\nten hs = \"Lan\"\ndiem-toan = 9\nprint(ten_hs, 2lop, diem-toan)\n",
    tests: [{ i: [], o: "Lan 10A1 9" }] },

  { id: "th7", sec: "kieu", title: "Thực hành 7. Số và chữ",
    goal: "Dòng 1 in ra <b>8</b> (cộng hai số). Dòng 2 in ra <b>53</b> (ghép hai chữ \"5\" và \"3\").",
    steps: ["Dòng 1 đã viết sẵn: <code>print(5 + 3)</code>.", "Dòng 2: đặt 5 và 3 trong dấu nháy để chúng thành chữ, rồi dùng <code>+</code> để ghép."],
    sample: { out: "8\n53" },
    hint: "print(\"5\" + \"3\")",
    start: "print(5 + 3)\n# Viết dòng thứ hai ở dưới\n\n",
    must: [[/["']5["']\s*\+\s*["']3["']/, "Hãy viết \"5\" + \"3\" (có dấu nháy) để ghép chữ."]],
    tests: [{ i: [], o: "8\n53" }] },

  { id: "th8", sec: "nhapxuat", title: "Thực hành 8. Chào bạn",
    goal: "Nhập tên của em, rồi máy chào lại em.",
    steps: ["Dòng 1 đã có sẵn: nhập tên vào biến <code>ten</code>.", "In ra: <code>Xin chao</code> rồi đến tên vừa nhập."],
    sample: { i: ["An"], out: "Xin chao An" },
    hint: "print(\"Xin chao\", ten)",
    start: "ten = input()\n# Viết lệnh print ở dưới\n\n",
    tests: [{ i: ["An"], o: "Xin chao An" }, { i: ["Binh"], o: "Xin chao Binh" }] },

  { id: "th9", sec: "nhapxuat", title: "Thực hành 9. Tổng hai số",
    goal: "Nhập hai số nguyên a và b (mỗi số một dòng). In tổng của chúng.",
    steps: ["Hai dòng đầu đã đọc <code>a</code> và <code>b</code> (có <code>int</code> để đổi thành số).", "Gán <code>tong = a + b</code>.", "In <code>tong</code>."],
    sample: { i: ["3", "5"], out: "8" },
    hint: "Nếu quên int(), 3 + 5 sẽ ra \"35\" chứ không phải 8.",
    start: "a = int(input())\nb = int(input())\n# Viết tiếp ở dưới\n\n",
    tests: [{ i: ["3", "5"], o: "8" }, { i: ["10", "-4"], o: "6" }, { i: ["0", "0"], o: "0" }] },

  { id: "lt1", sec: "luyentap", title: "Luyện tập 1. Giới thiệu bản thân",
    goal: "Nhập tên và tuổi. In ra một câu giới thiệu.",
    steps: ["Nhập <code>ten</code> (chữ) và <code>tuoi</code> (số nguyên).", "In đúng dạng: <code>Toi la An, 15 tuoi</code>."],
    sample: { i: ["An", "15"], out: "Toi la An, 15 tuoi" },
    hint: "print(\"Toi la \" + ten + \",\", tuoi, \"tuoi\")",
    start: "ten = input()\ntuoi = int(input())\n# Viết lệnh print ở dưới\n\n",
    tests: [{ i: ["An", "15"], o: "Toi la An, 15 tuoi" }, { i: ["Binh", "17"], o: "Toi la Binh, 17 tuoi" }] },

  { id: "lt2", sec: "luyentap", title: "Luyện tập 2. Diện tích hình vuông",
    goal: "Nhập độ dài cạnh hình vuông (số nguyên). In diện tích.",
    steps: ["Nhập <code>canh</code> bằng <code>int(input())</code>.", "Gán <code>dien_tich = canh * canh</code>.", "In <code>dien_tich</code>."],
    sample: { i: ["4"], out: "16" },
    hint: "dien_tich = canh * canh",
    start: "canh = int(input())\n# Viết tiếp ở dưới\n\n",
    must: [[/\bdien_tich\s*=/, "Em chưa gán biến dien_tich."]],
    tests: [{ i: ["4"], o: "16" }, { i: ["10"], o: "100" }, { i: ["1"], o: "1" }] },

  { id: "lt3", sec: "luyentap", title: "Luyện tập 3. Mua bút",
    goal: "Mỗi cây bút giá 3000 đồng. Nhập số bút muốn mua, in số tiền phải trả.",
    steps: ["Gán <code>gia = 3000</code>.", "Nhập <code>so_but</code> bằng <code>int(input())</code>.", "Gán <code>thanh_tien = gia * so_but</code> rồi in ra."],
    sample: { i: ["5"], out: "15000" },
    hint: "thanh_tien = gia * so_but",
    start: "# Viết 4 lệnh theo các bước ở trên\n\n",
    must: [[/\bgia\s*=/, "Em chưa gán biến gia."], [/\bthanh_tien\s*=/, "Em chưa gán biến thanh_tien."]],
    tests: [{ i: ["5"], o: "15000" }, { i: ["1"], o: "3000" }, { i: ["0"], o: "0" }] },

  { id: "lt4", sec: "luyentap", title: "Luyện tập 4. Điểm trung bình hai môn",
    goal: "Nhập điểm Toán và điểm Văn (số thực, mỗi số một dòng). In điểm trung bình của hai môn.",
    steps: ["Nhập <code>toan</code> và <code>van</code> bằng <code>float(input())</code>.", "Gán <code>tb = (toan + van) / 2</code>.", "In <code>tb</code>."],
    sample: { i: ["8", "6"], out: "7.0" },
    hint: "Nhớ dùng float(input()) vì điểm có thể có phần lẻ. Dấu / là phép chia.",
    start: "# Viết các lệnh theo các bước ở trên\n\n",
    must: [[/\btb\s*=/, "Em chưa gán biến tb."]],
    tests: [{ i: ["8", "6"], o: "7.0" }, { i: ["9", "10"], o: "9.5" }, { i: ["5.5", "7"], o: "6.25" }] },

  { id: "lt5", sec: "luyentap", title: "Luyện tập 5. Chia kẹo",
    goal: "Cô giáo có <b>n</b> cái kẹo, chia đều cho <b>k</b> bạn (mỗi bạn nhận số kẹo bằng nhau, kẹo thừa cô giữ lại). Nhập n rồi nhập k (mỗi số một dòng). In ra số kẹo <b>mỗi bạn nhận được</b>, rồi in số kẹo <b>cô còn dư</b> (mỗi số một dòng).",
    steps: ["Nhập <code>n</code> và <code>k</code> bằng <code>int(input())</code>.", "Số kẹo mỗi bạn: <code>moi_ban = n // k</code>.", "Số kẹo dư: <code>du = n % k</code>.", "In <code>moi_ban</code> rồi in <code>du</code>."],
    sample: { i: ["17", "5"], out: "3\n2" },
    hint: "17 // 5 = 3 và 17 % 5 = 2. Dùng // để chia lấy phần nguyên, dùng % để lấy số dư.",
    start: "# Viết các lệnh theo các bước ở trên\n\n",
    must: [[/\/\//, "Em chưa dùng phép // (chia lấy phần nguyên)."], [/%/, "Em chưa dùng phép % (chia lấy phần dư)."]],
    tests: [{ i: ["17", "5"], o: "3\n2" }, { i: ["20", "4"], o: "5\n0" }, { i: ["3", "5"], o: "0\n3" }] }
];
const norm = s => s.normalize("NFC").split("\n").map(l => l.trimEnd()).join("\n").trim();

EXERCISES.forEach(ex => {
  const d = document.createElement("div");
  d.className = "ex";
  const sample = ex.sample.i
    ? `<div><b>Nhập:</b><pre>${esc(ex.sample.i.join("\n"))}</pre></div><div><b>In ra:</b><pre>${esc(ex.sample.out)}</pre></div>`
    : `<div><b>In ra:</b><pre>${esc(ex.sample.out)}</pre></div>`;
  d.innerHTML = `<div class="ex-head"><h3>🧪 ${ex.title}<span class="badge">chưa đạt</span></h3>
      <p class="ex-goal"><b>Yêu cầu:</b> ${ex.goal}</p>
      <ol class="ex-steps">${ex.steps.map(s => `<li>${s}</li>`).join("")}</ol>
      <div class="ex-sample">${sample}</div>
      <details class="ex-hint"><summary>Gợi ý</summary><p>${ex.hint}</p></details></div>
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
      const code = ed.value;
      const miss = (ex.must || []).find(([re]) => !re.test(code));
      let pass = 0, html = "";
      for (const t of ex.tests) {
        const r = await runPy(code, t.i, false);
        const ok = !r.err && norm(r.out) === norm(t.o);
        if (ok) pass++;
        html += `<div class="test"><span>${ok ? "✅" : "❌"}</span><div>` + (t.i.length ? `Nhập: <code>${esc(t.i.join(" ⏎ "))}</code>` : "Kết quả") +
          (ok ? "" : `<br>Mong đợi: <pre>${esc(t.o)}</pre>Chương trình in: <pre>${esc(r.out.trim() || "(trống)")}</pre>` + (r.err ? `<b style="color:var(--bad)">${esc(r.err)}</b>` : "")) +
          `</div></div>`;
      }
      const all = pass === ex.tests.length && !miss;
      state.passed[ex.id] = all; state.code[ex.id] = code;
      // ghi lại số lần chấm và thời gian để giáo viên xem
      const m = state.meta[ex.id] = state.meta[ex.id] || { attempts: 0, startedAt: new Date().toISOString() };
      m.attempts++;
      if (all && !m.completedAt) m.completedAt = new Date().toISOString();
      save(); mark();
      res.innerHTML = `<div class="result ${all ? "ok" : "bad"}">${all ? "🎉 Đạt rồi!" : "Chưa đạt"} (${pass}/${ex.tests.length} kết quả đúng)</div>` +
        (miss ? `<div class="result bad">${miss[1]}</div>` : "") + html + "<br>";
      refreshProgress();
    } catch (e) { res.innerHTML = `<div class="result bad">${esc(e.message)}</div>`; }
    btn.disabled = false; btn.textContent = "✔ Chấm bài";
  };
  const sec = document.getElementById(ex.sec);
  let box = $(".practice", sec);
  if (!box) {
    box = document.createElement("div");
    box.className = "practice";
    box.innerHTML = `<div class="practice-title">🧪 Đến lượt em thực hành</div>`;
    sec.appendChild(box);
  }
  box.appendChild(d);
});

/* ========== Tổng kết & nộp bài ========== */
function collect() {
  return {
    exercises: EXERCISES.map(e => ({ id: e.id, passed: !!state.passed[e.id], code: state.code[e.id] ?? "" }))
  };
}
/* Khóa học sinh {lớp}_{họtên}: bỏ dấu, chỉ chữ + số, khớp regex trong firestore.rules */
function slugKey(s, max) {
  const t = String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  return t.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("").slice(0, max);
}
/* Dữ liệu gửi giáo viên, theo lược đồ chung: lessons/{id}/students/{lớp_họtên} (các bài luyện tập nằm trong practice[]) */
function buildSubmission(name, className) {
  const now = new Date().toISOString();
  const practice = EXERCISES.map(e => {
    const m = state.meta[e.id] || {};
    const r = { activityId: e.id, studentCode: (state.code[e.id] ?? "").slice(0, 20000), attempts: m.attempts || 0, passed: !!state.passed[e.id] };
    if (m.startedAt) r.startedAt = m.startedAt;
    if (m.completedAt) r.completedAt = m.completedAt;
    return r;
  });
  return {
    lessonId: LESSON.id,
    student: { name, className },
    learning: [],
    practice,
    progress: { learningCompleted: 0, practiceCompleted: practice.filter(p => p.passed).length, part1Submitted: true, part1SubmittedAt: now }
  };
}
function renderSummary() {
  const c = collect();
  const passed = c.exercises.filter(e => e.passed).length;
  $("#summary").innerHTML =
    `<div class="stat">Bài thực hành đạt<b>${passed}/${EXERCISES.length}</b></div>`;
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
/* Họ tên + lớp nhập ở đầu trang, được nhớ lại trong trình duyệt */
state.student = state.student || { name: "", className: "" };
const fName = $("#fName"), fClass = $("#fClass");
fName.value = state.student.name || ""; fClass.value = state.student.className || "";
function updateWho() {
  const n = fName.value.trim(), c = fClass.value.trim();
  $("#whoLabel").textContent = n || c ? `${n || "(chưa nhập tên)"} · lớp ${c || "?"}` : "(chưa nhập)";
}
[fName, fClass].forEach(i => i.addEventListener("input", () => {
  i.classList.remove("need");
  state.student = { name: fName.value, className: fClass.value }; save(); updateWho();
}));
updateWho();
$("#submitForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#submitMsg"), btn = $("button", e.target);
  if (!fName.value.trim() || !fClass.value.trim()) {
    [fName, fClass].forEach(i => i.classList.toggle("need", !i.value.trim()));
    msg.hidden = false; msg.className = "result bad";
    msg.textContent = "Em chưa nhập họ tên hoặc lớp. Hãy điền ở ô “Em là ai?” ở đầu trang rồi nộp lại.";
    $("#thongtin").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const data = Object.assign({ name: $("#fName").value.trim(), className: $("#fClass").value.trim(), lesson: "bai17-bien-va-lenh-gan" }, collect());
  msg.hidden = false; msg.className = "result neutral"; msg.textContent = "Đang nộp bài…"; btn.disabled = true;
  try {
    const db = await loadFirebase();
    if (!db) {
      msg.className = "result bad";
      msg.innerHTML = "Trang chưa được kết nối Firebase nên bài chưa gửi được cho giáo viên. File bài làm đã được tải về máy, em hãy gửi file này cho thầy/cô.";
      downloadJson(data, `bai17_${data.className}_${data.name}.json`.replace(/\s+/g, "_"));
    } else {
      const key = slugKey(data.className, 15) + "_" + slugKey(data.name, 40);
      if (!slugKey(data.className, 15) || !slugKey(data.name, 40)) throw new Error("Em hãy nhập đủ họ tên và lớp (dùng chữ và số).");
      const ts = firebase.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.set(db.collection("lessons").doc(LESSON.id), { title: LESSON.title, updatedAt: ts }, { merge: true });
      batch.set(db.collection("lessons").doc(LESSON.id).collection("students").doc(key),
        Object.assign(buildSubmission(data.name, data.className), { updatedAt: ts }), { merge: true });
      await Promise.race([batch.commit(), new Promise((_, rej) => setTimeout(() => rej(new Error("Hết thời gian chờ mạng.")), 20000))]);
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
