// File: backend/src/routes/blobUploadRoutes.ts
import { Router } from "express";
import { put, type PutBlobResult } from "@vercel/blob";

const router = Router();

// Direct server upload endpoint
router.post("/registrar/documents/upload", async (req, res) => {
  try {
    const file = (req as any).files?.file; // assuming you're using express-fileupload or multer
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const blob = await put(file.name, file.data, {
      access: "public", // or 'private'
      contentType: file.mimetype,
    });

    const response: PutBlobResult = blob;

    console.log("File uploaded successfully:", response.url);
    return res.status(200).json({ success: true, blob: response });
  } catch (error) {
    console.error("Error during blob upload:", error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
