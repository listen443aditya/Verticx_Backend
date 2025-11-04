import multer from "multer";

const storage = multer.memoryStorage();

// 'pdfFile' must match the name in your frontend FormData
const upload = multer({ storage: storage });

export default upload;
