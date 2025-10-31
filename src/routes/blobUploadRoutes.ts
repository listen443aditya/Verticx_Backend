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







// import { Router } from "express";
// import type { Request, Response } from "express";
// import jwt from "jsonwebtoken"; // <-- 1. Import jsonwebtoken

// // @ts-ignore - This silences the fake "Cannot find module" error
// import { handleUpload, type BlobResult } from "@vercel/blob/server";

// const router = Router();

// router.post(
//   "/registrar/documents/upload",
//   async (req: Request, res: Response) => {
//     try {
//       const jsonResponse = await(handleUpload as any)({
//         body: req.body,
//         request: req as any,

//         // 2. This function now runs BEFORE the token is generated
//         onBeforeUpload: async (pathname: string) => {
//           // 1. Get the secret from environment
//           const secret = process.env.JWT_SECRET;
//           if (!secret) {
//             // This check prevents the crash and gives a clear error
//             console.error("FATAL: JWT_SECRET environment variable is not set.");
//             throw new Error("Server is not configured for authentication.");
//           }

//           // 2. Get the token from the request header
//           const authHeader = req.headers.authorization;
//           if (!authHeader || !authHeader.startsWith("Bearer ")) {
//             throw new Error("Authorization header is missing or invalid.");
//           }
//           const token = authHeader.split(" ")[1];

//           // 3. Verify the token
//           let decoded: any;
//           try {
//             decoded = jwt.verify(token, secret); // Use the 'secret' variable
//           } catch (err) {
//             throw new Error("Invalid token.");
//           }

//           // 4. Check the user's role
//           if (decoded.role !== "Registrar") {
//             throw new Error("You are not authorized to upload files.");
//           }

//           // 5. Pass user info to the completion step
//           const tokenPayload = JSON.stringify({
//             userId: decoded.id,
//             branchId: decoded.branchId,
//           });

//           // 6. Return the upload permissions
//           return {
//             allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
//             tokenPayload, // Pass the user's info
//           };
//         },

//         // 8. This function now runs AFTER the file is in Vercel Blob
//         onUploadCompleted: async ({
//           blob,
//           tokenPayload,
//         }: {
//           blob: BlobResult;
//           tokenPayload: any;
//         }) => {
//           // You can log this for your records or save it to your AuditLog
//           const { userId } = JSON.parse(tokenPayload);
//           console.log(`File ${blob.pathname} uploaded by user ${userId}.`);

//           // We don't save to the 'SchoolDocument' table here
//           // because your frontend is already doing it (which is fine).
//         },
//       });

//       return res.status(200).json(jsonResponse);
//     } catch (error) {
//       console.error("Error in upload handler:", error);
//       // Vercel's handler throws its own errors, which we catch here
//       return res.status(400).json({ error: (error as Error).message });
//     }
//   }
// );

// export default router;