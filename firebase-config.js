// Cấu hình Firebase DÙNG CHUNG cho mọi bài (công khai là bình thường, bảo vệ bằng firestore.rules đã publish).
// Project: db-web-dayhoc. Giáo viên xem bài ở teacher.html (đăng nhập bằng 2 tài khoản giáo viên đã tạo sẵn).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAa7XowOKC8LpJ8Ll45nhc6CtlxcoT-Ydg",
  authDomain: "db-web-dayhoc.firebaseapp.com",
  projectId: "db-web-dayhoc",
  storageBucket: "db-web-dayhoc.firebasestorage.app",
  messagingSenderId: "808662808913",
  appId: "1:808662808913:web:3ad14f57061b453ebe3b70",
  measurementId: "G-33E0YH59KZ"
};

// Thông tin bài học: id chỉ gồm a-z 0-9 và dấu gạch ngang, khác nhau mỗi bài.
// Dữ liệu nằm ở Firestore: lessons/<id>/students/<lớp_họtên>
window.LESSON = {
  id: "python-bai17-v2",
  title: "Bài 17. Biến và lệnh gán (bản kể chuyện)"
};
