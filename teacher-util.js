// Tiện ích tối thiểu cho trang giáo viên (teacher.js dùng Util.esc, Util.norm, Util.slug).
const Util = {
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
  // Bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng -> tìm kiếm tên học sinh.
  norm(s) {
    return String(s ?? "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "d")
      .toLowerCase().replace(/\s+/g, " ").trim();
  },
  slug(s, max) {
    const t = String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    return t.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("").slice(0, max);
  }
};
