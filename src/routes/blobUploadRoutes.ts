import { Router } from "express";
import type { Request, Response } from "express";

// 'handleUpload' comes from '/client'
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
// The 'PutBlobResult' type comes from the root
import type { PutBlobResult } from "@vercel/blob";

const router = Router();

router.post(
  "/registrar/documents/upload",
  async (req: Request, res: Response) => {
    const body = req.body as HandleUploadBody;

    try {
      const jsonResponse = await handleUpload({
        body,
        request: req as any,

        // --- THIS IS THE FIX ---
        // Rename 'onBeforeUpload' to 'onBeforeGenerateToken'
        onBeforeGenerateToken: async (pathname: string) => {
          // --- END FIX ---

          // Your logic for setting permissions and tokens goes here
          return {
            allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
            tokenPayload: JSON.stringify({
              // userId: (req as any).user?.id,
            }),
          };
        },

        onUploadCompleted: async ({
          blob,
          tokenPayload,
        }: {
          blob: PutBlobResult;
          tokenPayload?: string | null | undefined;
        }) => {
          console.log("File uploaded successfully to:", blob.url);

          if (tokenPayload) {
            // const { userId } = JSON.parse(tokenPayload);
            // console.log("Upload completed for user:", userId);
            // --- SAVE 'blob.url' TO YOUR DATABASE HERE ---
          }
        },
      });

      // Send the JSON response from Vercel back to the client
      return res.status(200).json(jsonResponse);
    } catch (error) {
      console.error("Error in upload handler:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(400).json({ error: message });
    }
  }
);

export default router;
