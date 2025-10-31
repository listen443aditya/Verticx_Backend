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


// import { Router } from "express";
// import type { Request, Response } from "express";
// // FIX: Import the *correct* server-side handler
// import { handleUpload, type BlobResult } from "@vercel/blob/server";

// const router = Router();

// // This endpoint listens for the frontend's token request
// router.post(
//   "/registrar/documents/upload",
//   async (req: Request, res: Response) => {
//     try {
//       const jsonResponse = await handleUpload({
//         body: req.body, // handleUpload needs the raw body
//         request: req as any,
//         onBeforeUpload: async (pathname: string) => {
//           // You can add auth/validation here
//           return {
//             allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
//           };
//         },
//         onUploadCompleted: async ({
//           blob,
//           tokenPayload,
//         }: {
//           blob: BlobResult;
//           tokenPayload: any;
//         }) => {
//           console.log("File uploaded successfully to:", blob.pathname);
//         },
//       });

//       // This returns the token to the frontend client
//       return res.status(200).json(jsonResponse);
//     } catch (error) {
//       console.error("Error in upload handler:", error);
//       return res.status(400).json({ error: (error as Error).message });
//     }
//   }
// );

// export default router;