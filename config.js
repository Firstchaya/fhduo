// ===== แก้ไฟล์นี้ไฟล์เดียวก่อนอัปโหลด =====

// 1) วาง config ที่ได้จาก Firebase console → Project settings → Your apps → Web app
export const firebaseConfig = {
  apiKey: "AIzaSyB06xQFSVjUyO5yEWrheajklcYpJzwRGKA",
  authDomain: "fhduo-6288c.firebaseapp.com",
  projectId: "fhduo-6288c",
  storageBucket: "fhduo-6288c.firebasestorage.app",
  messagingSenderId: "452988828685",
  appId: "1:452988828685:web:ae89c242ec2d70612a6944",
};

// 2) อีเมล Google ของทั้งสองคน (ต้องตรงกับใน firestore.rules)
export const MEMBERS = [
  { email: "firstchayanit@gmail.com", name: "First" },
  { email: "ihamjang@gmail.com", name: "Ham" },
];

// 3) ไม่บังคับ: site key ของ reCAPTCHA v3 สำหรับ App Check (เว้นว่างไว้ก่อนได้)
export const APP_CHECK_SITE_KEY = "";

// ชื่อพื้นที่ที่แชร์กัน (ไม่ต้องแก้)
export const SPACE = "home";
