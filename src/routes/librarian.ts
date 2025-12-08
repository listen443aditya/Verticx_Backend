import { Router } from "express";
import * as librarianController from "../controllers/librarianController";
import { protect } from "../middlewares/auth";
import { restrictTo } from "../middlewares/roles";
import upload from "../middlewares/upload";

const router = Router();

router.use(protect);
router.use(restrictTo("Librarian"));

// Dashboard
router.get("/dashboard", librarianController.getLibrarianDashboardData);

// Book Management
router.get("/books", librarianController.getLibraryBooks);
router.get("/books/search", librarianController.searchLibraryBooks); // Keep search BEFORE :id routes
router.post("/books", upload.single("pdfFile"), librarianController.createBook);

router.patch(
  "/books/:id",
  upload.single("pdfFile"),
  librarianController.updateBook
);
router.put(
  "/books/:id",
  upload.single("pdfFile"),
  librarianController.updateBook
);

router.delete("/books/:id", librarianController.deleteBook);

// Issuance Management
router.get("/issuances", librarianController.getBookIssuancesWithMemberDetails);
router.post(
  "/issuances/by-identifier",
  librarianController.issueBookByIsbnOrId
);
router.patch("/issuances/:id/return", librarianController.returnBook);

// General
router.get("/attendance", librarianController.getLibrarianAttendance);
router.get(
  "/leaves/my-applications",
  librarianController.getMyLeaveApplications
);

export default router;
